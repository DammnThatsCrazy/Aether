// =============================================================================
// AETHER SDK — FUNNEL MODULE
// Multi-step funnel definition, tracking, and conversion analysis
// =============================================================================

import { storage, generateId, now } from '../utils';

// =============================================================================
// TYPES
// =============================================================================

export interface FunnelStep {
  id: string;
  name: string;
  event?: string;
  page?: string;
  properties?: Record<string, unknown>;
  timeout?: number;
}

export interface FunnelDefinition {
  id: string;
  name: string;
  steps: FunnelStep[];
  sequential?: boolean;
  windowMs?: number;
}

export interface FunnelProgress {
  funnelId: string;
  currentStep: number;
  completedSteps: string[];
  startedAt: number;
  lastStepAt: number;
  completed: boolean;
  droppedOff: boolean;
  dropOffStep?: string;
}

export interface FunnelCallbacks {
  onTrack: (event: string, properties: Record<string, unknown>) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const PROGRESS_KEY = 'funnel_progress';
const DEFAULT_WINDOW_MS = 86_400_000; // 24 hours

// =============================================================================
// MODULE
// =============================================================================

export class FunnelModule {
  private callbacks: FunnelCallbacks;
  private funnels: Map<string, FunnelDefinition> = new Map();
  private progress: Map<string, FunnelProgress> = new Map();
  private listeners: Array<[EventTarget, string, EventListener]> = [];

  constructor(callbacks: FunnelCallbacks) {
    this.callbacks = callbacks;
    this.loadProgress();
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /** Register a funnel definition */
  defineFunnel(definition: FunnelDefinition): void {
    // Default sequential to true
    const funnel: FunnelDefinition = {
      ...definition,
      sequential: definition.sequential ?? true,
      windowMs: definition.windowMs ?? DEFAULT_WINDOW_MS,
    };
    this.funnels.set(funnel.id, funnel);
  }

  /** Unregister a funnel */
  removeFunnel(funnelId: string): void {
    this.funnels.delete(funnelId);
    this.progress.delete(funnelId);
    this.persistProgress();
  }

  /** Evaluate an event against all registered funnels */
  recordEvent(eventName: string, properties?: Record<string, unknown>): void {
    this.funnels.forEach((funnel) => {
      this.evaluateStep(funnel, 'event', eventName, undefined, properties);
    });
  }

  /** Evaluate a page view against all registered funnels */
  recordPageView(path: string): void {
    this.funnels.forEach((funnel) => {
      this.evaluateStep(funnel, 'page', undefined, path);
    });
  }

  /** Get progress for a specific funnel */
  getProgress(funnelId: string): FunnelProgress | null {
    return this.progress.get(funnelId) ?? null;
  }

  /** Get progress for all active funnels */
  getAllProgress(): FunnelProgress[] {
    return Array.from(this.progress.values());
  }

  /** Reset progress for a funnel */
  resetFunnel(funnelId: string): void {
    this.progress.delete(funnelId);
    this.persistProgress();
  }

  /** Clean up and flush progress */
  destroy(): void {
    this.listeners.forEach(([target, event, handler]) => {
      target.removeEventListener(event, handler);
    });
    this.listeners = [];
    this.persistProgress();
  }

  // ===========================================================================
  // STEP EVALUATION
  // ===========================================================================

  private evaluateStep(
    funnel: FunnelDefinition,
    matchType: 'event' | 'page',
    eventName?: string,
    pagePath?: string,
    properties?: Record<string, unknown>
  ): void {
    const progress = this.progress.get(funnel.id);
    const currentTime = Date.now();

    // Check if existing progress has expired
    if (progress && !progress.completed && !progress.droppedOff) {
      const windowMs = funnel.windowMs ?? DEFAULT_WINDOW_MS;
      if (currentTime - progress.startedAt > windowMs) {
        this.markDroppedOff(funnel, progress);
        return;
      }
    }

    // If already completed or dropped off, skip
    if (progress?.completed || progress?.droppedOff) return;

    // Determine which steps to evaluate
    const stepsToCheck = funnel.sequential
      ? this.getNextSequentialSteps(funnel, progress)
      : this.getIncompleteSteps(funnel, progress);

    for (const step of stepsToCheck) {
      if (this.stepMatches(step, matchType, eventName, pagePath, properties)) {
        this.completeStep(funnel, step, progress, currentTime);
        break; // Only complete one step per evaluation for sequential funnels
      }
    }
  }

  /** Check if a step matches the incoming event/page */
  private stepMatches(
    step: FunnelStep,
    matchType: 'event' | 'page',
    eventName?: string,
    pagePath?: string,
    properties?: Record<string, unknown>
  ): boolean {
    if (matchType === 'event' && step.event) {
      if (step.event !== eventName) return false;

      // Check required property matches
      if (step.properties && properties) {
        for (const [key, value] of Object.entries(step.properties)) {
          if (properties[key] !== value) return false;
        }
      } else if (step.properties) {
        return false; // Step requires properties but none provided
      }

      return true;
    }

    if (matchType === 'page' && step.page) {
      return this.matchPagePattern(step.page, pagePath ?? '');
    }

    return false;
  }

  /** Complete a funnel step */
  private completeStep(
    funnel: FunnelDefinition,
    step: FunnelStep,
    existing: FunnelProgress | undefined,
    currentTime: number
  ): void {
    let progress: FunnelProgress;

    if (!existing) {
      // Starting a new funnel
      progress = {
        funnelId: funnel.id,
        currentStep: 0,
        completedSteps: [],
        startedAt: currentTime,
        lastStepAt: currentTime,
        completed: false,
        droppedOff: false,
      };

      this.progress.set(funnel.id, progress);

      this.callbacks.onTrack('funnel_started', {
        funnelId: funnel.id,
        funnelName: funnel.name,
        firstStep: step.name,
        startedAt: now(),
      });
    } else {
      progress = existing;
    }

    // Check step timeout
    if (step.timeout && progress.lastStepAt > 0) {
      if (currentTime - progress.lastStepAt > step.timeout) {
        this.markDroppedOff(funnel, progress);
        return;
      }
    }

    // Mark step as completed
    if (!progress.completedSteps.includes(step.id)) {
      progress.completedSteps.push(step.id);
    }

    const stepIndex = funnel.steps.findIndex((s) => s.id === step.id);
    progress.currentStep = Math.max(progress.currentStep, stepIndex + 1);
    progress.lastStepAt = currentTime;

    this.callbacks.onTrack('funnel_step_completed', {
      funnelId: funnel.id,
      funnelName: funnel.name,
      stepId: step.id,
      stepName: step.name,
      stepNumber: stepIndex + 1,
      totalSteps: funnel.steps.length,
      completedAt: now(),
    });

    // Check if funnel is complete
    if (this.isFunnelComplete(funnel, progress)) {
      progress.completed = true;

      this.callbacks.onTrack('funnel_completed', {
        funnelId: funnel.id,
        funnelName: funnel.name,
        totalDuration: currentTime - progress.startedAt,
        stepsCompleted: progress.completedSteps.length,
        completedAt: now(),
      });
    }

    this.persistProgress();
  }

  /** Mark a funnel as dropped off */
  private markDroppedOff(funnel: FunnelDefinition, progress: FunnelProgress): void {
    progress.droppedOff = true;

    // Determine drop-off step
    const nextStepIndex = progress.currentStep;
    if (nextStepIndex < funnel.steps.length) {
      progress.dropOffStep = funnel.steps[nextStepIndex].id;
    }

    this.callbacks.onTrack('funnel_dropped_off', {
      funnelId: funnel.id,
      funnelName: funnel.name,
      dropOffStep: progress.dropOffStep ?? null,
      stepsCompleted: progress.completedSteps.length,
      totalSteps: funnel.steps.length,
      totalDuration: Date.now() - progress.startedAt,
      droppedOffAt: now(),
    });

    this.persistProgress();
  }

  // ===========================================================================
  // STEP NAVIGATION
  // ===========================================================================

  /** For sequential funnels: get the next step to complete */
  private getNextSequentialSteps(
    funnel: FunnelDefinition,
    progress: FunnelProgress | undefined
  ): FunnelStep[] {
    const nextIndex = progress ? progress.currentStep : 0;
    if (nextIndex >= funnel.steps.length) return [];
    return [funnel.steps[nextIndex]];
  }

  /** For non-sequential funnels: get all incomplete steps */
  private getIncompleteSteps(
    funnel: FunnelDefinition,
    progress: FunnelProgress | undefined
  ): FunnelStep[] {
    if (!progress) return [...funnel.steps];
    return funnel.steps.filter((step) => !progress.completedSteps.includes(step.id));
  }

  /** Check if all steps in a funnel are complete */
  private isFunnelComplete(funnel: FunnelDefinition, progress: FunnelProgress): boolean {
    return funnel.steps.every((step) => progress.completedSteps.includes(step.id));
  }

  // ===========================================================================
  // PATTERN MATCHING
  // ===========================================================================

  /** Match a page URL against a glob pattern */
  private matchPagePattern(pattern: string, path: string): boolean {
    // Convert simple glob to regex
    const regex = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex special chars except * and ?
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regex}$`).test(path);
  }

  // ===========================================================================
  // PERSISTENCE
  // ===========================================================================

  private loadProgress(): void {
    const stored = storage.get<Record<string, FunnelProgress>>(PROGRESS_KEY);
    if (stored && typeof stored === 'object') {
      Object.entries(stored).forEach(([key, value]) => {
        this.progress.set(key, value);
      });
    }
  }

  private persistProgress(): void {
    const obj: Record<string, FunnelProgress> = {};
    this.progress.forEach((value, key) => {
      obj[key] = value;
    });
    storage.set(PROGRESS_KEY, obj);
  }
}
