// =============================================================================
// AETHER SDK — FORM ANALYTICS MODULE
// Field-level interaction tracking, abandonment detection, completion rates
// =============================================================================

import { generateId, now, isSensitiveField } from '../utils';

// =============================================================================
// TYPES
// =============================================================================

export interface FormFieldInteraction {
  fieldName: string;
  fieldType: string;
  focusTime: number;
  changeCount: number;
  errorCount: number;
  abandoned: boolean;
  correctionCount: number;
  hesitationTime: number;
}

export interface FormSession {
  formId: string;
  startedAt: number;
  completedAt?: number;
  totalDuration: number;
  fields: FormFieldInteraction[];
  submitted: boolean;
  abandoned: boolean;
  lastFieldBeforeAbandon?: string;
  errorFields: string[];
  dropOffField?: string;
}

export interface FormAnalyticsCallbacks {
  onTrack: (event: string, properties: Record<string, unknown>) => void;
}

export interface FormAnalyticsConfig {
  autoDiscover?: boolean;
  maskSensitive?: boolean;
}

// =============================================================================
// INTERNAL TYPES
// =============================================================================

interface TrackedField {
  name: string;
  type: string;
  focusStart: number | null;
  totalFocusTime: number;
  changeCount: number;
  errorCount: number;
  correctionCount: number;
  hesitationTime: number;
  firstKeystroke: boolean;
}

interface TrackedForm {
  id: string;
  element: HTMLFormElement;
  startedAt: number;
  fields: Map<string, TrackedField>;
  lastFocusedField: string | null;
  submitted: boolean;
  errorFields: Set<string>;
}

// =============================================================================
// MODULE
// =============================================================================

export class FormAnalyticsModule {
  private callbacks: FormAnalyticsCallbacks;
  private trackedForms: Map<string, TrackedForm> = new Map();
  private sessions: FormSession[] = [];
  private listeners: Array<[EventTarget, string, EventListener]> = [];
  private observers: MutationObserver[] = [];
  private maskSensitive: boolean;

  constructor(callbacks: FormAnalyticsCallbacks, config: FormAnalyticsConfig = {}) {
    this.callbacks = callbacks;
    this.maskSensitive = config.maskSensitive ?? true;

    if (config.autoDiscover) {
      this.startAutoDiscovery();
    }
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /** Attach analytics listeners to a form by element or CSS selector */
  trackForm(form: HTMLFormElement | string): void {
    const element =
      typeof form === 'string'
        ? document.querySelector<HTMLFormElement>(form)
        : form;

    if (!element || element.tagName !== 'FORM') return;

    const formId = element.id || element.getAttribute('name') || generateId();

    // Avoid double-tracking
    if (this.trackedForms.has(formId)) return;

    const tracked: TrackedForm = {
      id: formId,
      element,
      startedAt: 0,
      fields: new Map(),
      lastFocusedField: null,
      submitted: false,
      errorFields: new Set(),
    };

    this.trackedForms.set(formId, tracked);
    this.attachFormListeners(tracked);
  }

  /** Get all completed/abandoned form sessions */
  getSessions(): FormSession[] {
    return [...this.sessions];
  }

  /** Remove all listeners and clean up */
  destroy(): void {
    // Finalize any in-progress forms as abandoned
    this.trackedForms.forEach((tracked) => {
      if (tracked.startedAt > 0 && !tracked.submitted) {
        this.finalizeSession(tracked, false);
      }
    });

    this.listeners.forEach(([target, event, handler]) => {
      target.removeEventListener(event, handler);
    });
    this.observers.forEach((o) => o.disconnect());

    this.listeners = [];
    this.observers = [];
    this.trackedForms.clear();
  }

  // ===========================================================================
  // AUTO-DISCOVERY
  // ===========================================================================

  private startAutoDiscovery(): void {
    // Track existing forms
    document.querySelectorAll<HTMLFormElement>('form').forEach((form) => {
      this.trackForm(form);
    });

    // Watch for dynamically added forms
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof HTMLFormElement) {
            this.trackForm(node);
          }
          if (node instanceof HTMLElement) {
            node.querySelectorAll<HTMLFormElement>('form').forEach((form) => {
              this.trackForm(form);
            });
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    this.observers.push(observer);
  }

  // ===========================================================================
  // FORM EVENT LISTENERS
  // ===========================================================================

  private attachFormListeners(tracked: TrackedForm): void {
    const form = tracked.element;

    // Focus in — track field focus start and hesitation
    const focusInHandler = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!this.isFormField(target)) return;

      const input = target as HTMLInputElement;
      const fieldName = this.getFieldName(input);

      // Start session on first interaction
      if (tracked.startedAt === 0) {
        tracked.startedAt = Date.now();
        this.callbacks.onTrack('form_started', {
          formId: tracked.id,
          startedAt: now(),
        });
      }

      let field = tracked.fields.get(fieldName);
      if (!field) {
        field = {
          name: fieldName,
          type: input.type || input.tagName.toLowerCase(),
          focusStart: Date.now(),
          totalFocusTime: 0,
          changeCount: 0,
          errorCount: 0,
          correctionCount: 0,
          hesitationTime: 0,
          firstKeystroke: false,
        };
        tracked.fields.set(fieldName, field);
      } else {
        field.focusStart = Date.now();
      }

      tracked.lastFocusedField = fieldName;
    };

    // Focus out — accumulate focus time
    const focusOutHandler = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!this.isFormField(target)) return;

      const input = target as HTMLInputElement;
      const fieldName = this.getFieldName(input);
      const field = tracked.fields.get(fieldName);

      if (field && field.focusStart !== null) {
        field.totalFocusTime += Date.now() - field.focusStart;
        field.focusStart = null;
      }
    };

    // Input — track changes and hesitation
    const inputHandler = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!this.isFormField(target)) return;

      const input = target as HTMLInputElement;
      const fieldName = this.getFieldName(input);
      const field = tracked.fields.get(fieldName);

      if (field) {
        field.changeCount++;

        // Calculate hesitation time (focus → first keystroke)
        if (!field.firstKeystroke && field.focusStart !== null) {
          field.hesitationTime = Date.now() - field.focusStart;
          field.firstKeystroke = true;
        }
      }
    };

    // Keydown — track corrections (backspace, delete)
    const keydownHandler = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!this.isFormField(target)) return;

      const ke = e as KeyboardEvent;
      if (ke.key === 'Backspace' || ke.key === 'Delete') {
        const input = target as HTMLInputElement;
        const fieldName = this.getFieldName(input);
        const field = tracked.fields.get(fieldName);
        if (field) {
          field.correctionCount++;
        }
      }
    };

    // Invalid — track validation errors
    const invalidHandler = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!this.isFormField(target)) return;

      const input = target as HTMLInputElement;
      const fieldName = this.getFieldName(input);
      const field = tracked.fields.get(fieldName);

      if (field) {
        field.errorCount++;
      }
      tracked.errorFields.add(fieldName);
    };

    // Submit — finalize the session as completed
    const submitHandler = (e: Event) => {
      e; // consumed
      tracked.submitted = true;
      this.finalizeSession(tracked, true);
    };

    // Beforeunload — detect abandonment
    const beforeUnloadHandler = () => {
      if (tracked.startedAt > 0 && !tracked.submitted) {
        this.finalizeSession(tracked, false);
      }
    };

    // Attach all listeners
    form.addEventListener('focusin', focusInHandler, { passive: true });
    form.addEventListener('focusout', focusOutHandler, { passive: true });
    form.addEventListener('input', inputHandler, { passive: true });
    form.addEventListener('keydown', keydownHandler, { passive: true });
    form.addEventListener('invalid', invalidHandler, { passive: true, capture: true });
    form.addEventListener('submit', submitHandler, { passive: true });
    window.addEventListener('beforeunload', beforeUnloadHandler);

    this.listeners.push(
      [form, 'focusin', focusInHandler],
      [form, 'focusout', focusOutHandler],
      [form, 'input', inputHandler],
      [form, 'keydown', keydownHandler],
      [form, 'invalid', invalidHandler],
      [form, 'submit', submitHandler],
      [window, 'beforeunload', beforeUnloadHandler]
    );
  }

  // ===========================================================================
  // SESSION FINALIZATION
  // ===========================================================================

  private finalizeSession(tracked: TrackedForm, submitted: boolean): void {
    if (tracked.startedAt === 0) return;

    const completedAt = Date.now();
    const fields: FormFieldInteraction[] = [];

    tracked.fields.forEach((field) => {
      // Close any still-open focus timer
      if (field.focusStart !== null) {
        field.totalFocusTime += completedAt - field.focusStart;
        field.focusStart = null;
      }

      fields.push({
        fieldName: field.name,
        fieldType: field.type,
        focusTime: field.totalFocusTime,
        changeCount: field.changeCount,
        errorCount: field.errorCount,
        abandoned: !submitted && tracked.lastFocusedField === field.name,
        correctionCount: field.correctionCount,
        hesitationTime: field.hesitationTime,
      });
    });

    const session: FormSession = {
      formId: tracked.id,
      startedAt: tracked.startedAt,
      completedAt: submitted ? completedAt : undefined,
      totalDuration: completedAt - tracked.startedAt,
      fields,
      submitted,
      abandoned: !submitted,
      lastFieldBeforeAbandon: !submitted ? (tracked.lastFocusedField ?? undefined) : undefined,
      errorFields: Array.from(tracked.errorFields),
      dropOffField: !submitted ? (tracked.lastFocusedField ?? undefined) : undefined,
    };

    this.sessions.push(session);

    const eventName = submitted ? 'form_completed' : 'form_abandoned';
    this.callbacks.onTrack(eventName, {
      formId: session.formId,
      totalDuration: session.totalDuration,
      fieldCount: session.fields.length,
      submitted: session.submitted,
      abandoned: session.abandoned,
      lastFieldBeforeAbandon: session.lastFieldBeforeAbandon ?? null,
      dropOffField: session.dropOffField ?? null,
      errorFields: session.errorFields,
      fields: session.fields,
      timestamp: now(),
    });

    // Reset form tracking state for re-use
    tracked.startedAt = 0;
    tracked.fields.clear();
    tracked.lastFocusedField = null;
    tracked.submitted = false;
    tracked.errorFields.clear();
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private isFormField(el: HTMLElement): boolean {
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
  }

  /** Get a safe field name, masking sensitive fields */
  private getFieldName(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
    if (this.maskSensitive && isSensitiveField(el as HTMLInputElement)) {
      return '[sensitive]';
    }
    return el.name || el.id || el.type || 'unknown';
  }
}
