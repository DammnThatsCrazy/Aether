// =============================================================================
// AETHER SDK — FEEDBACK MODULE
// In-app surveys: NPS, CSAT, CES, custom questions with targeting rules
// =============================================================================

import { storage, generateId, now } from '../utils';
import type { SurveyType, SurveyQuestion, Survey as SharedSurvey, SurveyResponse, SurveyTrigger } from '../../../shared/feedback-types';
export type { SurveyType, SurveyQuestion, SurveyResponse };

// =============================================================================
// TYPES (Web-specific extensions of shared types)
// =============================================================================

export interface SurveyAppearance {
  position?: 'bottom-right' | 'bottom-left' | 'center' | 'top-right';
  theme?: 'light' | 'dark';
  accentColor?: string;
  zIndex?: number;
}

export interface Survey extends SharedSurvey {
  trigger?: SurveyTrigger;
  appearance?: SurveyAppearance;
}

export type { SurveyTrigger };

export interface FeedbackCallbacks {
  onTrack: (event: string, properties: Record<string, unknown>) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const RESPONSES_KEY = 'survey_responses';
const DISPLAY_COUNTS_KEY = 'survey_display_counts';

// =============================================================================
// MODULE
// =============================================================================

export class FeedbackModule {
  private callbacks: FeedbackCallbacks;
  private surveys: Map<string, Survey> = new Map();
  private activeSurveyElements: Map<string, HTMLElement> = new Map();
  private responses: SurveyResponse[] = [];
  private displayCounts: Map<string, number> = new Map();
  private listeners: Array<[EventTarget, string, EventListener]> = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private anonymousId: string;

  constructor(callbacks: FeedbackCallbacks, anonymousId?: string) {
    this.callbacks = callbacks;
    this.anonymousId = anonymousId ?? generateId();
    this.loadResponses();
    this.loadDisplayCounts();
  }

  // ===========================================================================
  // STATIC FACTORY METHODS
  // ===========================================================================

  /** Create a standard NPS survey (0-10 scale) */
  static createNPS(overrides?: Partial<Survey>): Survey {
    return {
      id: overrides?.id ?? generateId(),
      type: 'nps',
      title: overrides?.title ?? 'How likely are you to recommend us?',
      questions: [
        {
          id: 'nps_score',
          type: 'scale',
          text: 'On a scale of 0-10, how likely are you to recommend us to a friend or colleague?',
          min: 0,
          max: 10,
          required: true,
        },
        {
          id: 'nps_reason',
          type: 'text',
          text: 'What is the primary reason for your score?',
          required: false,
        },
      ],
      thankYouMessage: 'Thank you for your feedback!',
      ...overrides,
    };
  }

  /** Create a standard CSAT survey (1-5 scale) */
  static createCSAT(overrides?: Partial<Survey>): Survey {
    return {
      id: overrides?.id ?? generateId(),
      type: 'csat',
      title: overrides?.title ?? 'How satisfied are you?',
      questions: [
        {
          id: 'csat_score',
          type: 'scale',
          text: 'How satisfied are you with your experience?',
          min: 1,
          max: 5,
          required: true,
        },
      ],
      thankYouMessage: 'Thank you for your feedback!',
      ...overrides,
    };
  }

  /** Create a standard CES survey (1-7 scale) */
  static createCES(overrides?: Partial<Survey>): Survey {
    return {
      id: overrides?.id ?? generateId(),
      type: 'ces',
      title: overrides?.title ?? 'How easy was that?',
      questions: [
        {
          id: 'ces_score',
          type: 'scale',
          text: 'How easy was it to accomplish what you wanted to do?',
          min: 1,
          max: 7,
          required: true,
        },
      ],
      thankYouMessage: 'Thank you for your feedback!',
      ...overrides,
    };
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /** Register a survey with optional trigger rules */
  registerSurvey(survey: Survey): void {
    this.surveys.set(survey.id, survey);

    // If the survey has a delay trigger, start timer
    if (survey.trigger?.delay) {
      const timer = setTimeout(() => {
        if (this.shouldShowSurvey(survey)) {
          this.showSurvey(survey.id);
        }
      }, survey.trigger.delay);
      this.timers.push(timer);
    }
  }

  /** Programmatically show a survey */
  showSurvey(surveyId: string): void {
    const survey = this.surveys.get(surveyId);
    if (!survey) return;
    if (this.activeSurveyElements.has(surveyId)) return;

    if (!this.shouldShowSurvey(survey)) return;

    const element = this.buildSurveyDOM(survey);
    document.body.appendChild(element);
    this.activeSurveyElements.set(surveyId, element);

    // Animate in
    requestAnimationFrame(() => {
      element.style.opacity = '1';
      element.style.transform = 'translateY(0)';
    });

    // Track display
    this.incrementDisplayCount(surveyId);

    this.callbacks.onTrack('survey_shown', {
      surveyId,
      surveyType: survey.type,
      shownAt: now(),
    });
  }

  /** Hide an active survey */
  hideSurvey(surveyId: string): void {
    const element = this.activeSurveyElements.get(surveyId);
    if (!element) return;

    element.style.opacity = '0';
    element.style.transform = 'translateY(20px)';

    setTimeout(() => {
      element.remove();
      this.activeSurveyElements.delete(surveyId);
    }, 300);
  }

  /** Submit responses for a survey */
  submitResponse(surveyId: string, responses: Record<string, unknown>): void {
    const survey = this.surveys.get(surveyId);

    const response: SurveyResponse = {
      surveyId,
      responses,
      completedAt: Date.now(),
      dismissed: false,
    };

    this.responses.push(response);
    this.persistResponses();

    this.callbacks.onTrack('survey_completed', {
      surveyId,
      surveyType: survey?.type ?? 'unknown',
      responses,
      completedAt: now(),
    });

    // Show thank-you, then hide
    this.showThankYou(surveyId, survey?.thankYouMessage ?? 'Thank you!');
  }

  /** Dismiss a survey without completing it */
  dismissSurvey(surveyId: string): void {
    const survey = this.surveys.get(surveyId);

    const response: SurveyResponse = {
      surveyId,
      responses: {},
      completedAt: Date.now(),
      dismissed: true,
    };

    this.responses.push(response);
    this.persistResponses();

    this.callbacks.onTrack('survey_dismissed', {
      surveyId,
      surveyType: survey?.type ?? 'unknown',
      dismissedAt: now(),
    });

    this.hideSurvey(surveyId);
  }

  /** Get stored responses, optionally filtered by survey ID */
  getSurveyResponses(surveyId?: string): SurveyResponse[] {
    if (surveyId) {
      return this.responses.filter((r) => r.surveyId === surveyId);
    }
    return [...this.responses];
  }

  /** Evaluate an event to see if it triggers any registered survey */
  evaluateEvent(eventName: string): void {
    this.surveys.forEach((survey) => {
      if (survey.trigger?.event === eventName && this.shouldShowSurvey(survey)) {
        const delay = survey.trigger.delay ?? 0;
        if (delay > 0) {
          const timer = setTimeout(() => this.showSurvey(survey.id), delay);
          this.timers.push(timer);
        } else {
          this.showSurvey(survey.id);
        }
      }
    });
  }

  /** Clean up all DOM elements, listeners, and timers */
  destroy(): void {
    this.activeSurveyElements.forEach((element) => {
      element.remove();
    });
    this.activeSurveyElements.clear();

    this.listeners.forEach(([target, event, handler]) => {
      target.removeEventListener(event, handler);
    });
    this.listeners = [];

    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers = [];
  }

  // ===========================================================================
  // TRIGGER EVALUATION
  // ===========================================================================

  private shouldShowSurvey(survey: Survey): boolean {
    const trigger = survey.trigger;
    if (!trigger) return true;

    // Check max displays
    if (trigger.maxDisplays !== undefined) {
      const count = this.displayCounts.get(survey.id) ?? 0;
      if (count >= trigger.maxDisplays) return false;
    }

    // Check page URL pattern (simple glob)
    if (trigger.pageUrl) {
      const pattern = trigger.pageUrl
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      const regex = new RegExp(`^${pattern}$`);
      if (!regex.test(window.location.pathname)) return false;
    }

    // Check sample rate (deterministic based on anonymous ID)
    if (trigger.sampleRate !== undefined && trigger.sampleRate < 1) {
      const hash = this.hashString(`${this.anonymousId}:${survey.id}`);
      const normalized = (hash >>> 0) / 0xFFFFFFFF;
      if (normalized > trigger.sampleRate) return false;
    }

    return true;
  }

  // ===========================================================================
  // DOM RENDERING
  // ===========================================================================

  private buildSurveyDOM(survey: Survey): HTMLElement {
    const appearance = survey.appearance ?? {};
    const position = appearance.position ?? 'bottom-right';
    const theme = appearance.theme ?? 'light';
    const accentColor = appearance.accentColor ?? '#6366f1';
    const zIndex = appearance.zIndex ?? 10000;

    // Container
    const container = document.createElement('div');
    container.setAttribute('data-aether-survey', survey.id);
    container.style.cssText = `
      position: fixed;
      ${this.getPositionCSS(position)}
      z-index: ${zIndex};
      width: 360px;
      max-width: calc(100vw - 32px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${theme === 'dark' ? '#1f2937' : '#ffffff'};
      color: ${theme === 'dark' ? '#f3f4f6' : '#111827'};
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.15);
      padding: 24px;
      opacity: 0;
      transform: translateY(20px);
      transition: opacity 0.3s ease, transform 0.3s ease;
    `;

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u00d7';
    closeBtn.style.cssText = `
      position: absolute; top: 8px; right: 12px;
      background: none; border: none; font-size: 20px; cursor: pointer;
      color: ${theme === 'dark' ? '#9ca3af' : '#6b7280'};
      line-height: 1; padding: 4px;
    `;
    closeBtn.addEventListener('click', () => this.dismissSurvey(survey.id));
    this.listeners.push([closeBtn, 'click', () => this.dismissSurvey(survey.id)]);
    container.appendChild(closeBtn);

    // Title
    const title = document.createElement('h3');
    title.textContent = survey.title;
    title.style.cssText = 'margin: 0 0 16px 0; font-size: 16px; font-weight: 600;';
    container.appendChild(title);

    // Responses collector
    const collectedResponses: Record<string, unknown> = {};

    // Questions
    for (const question of survey.questions) {
      const questionEl = this.buildQuestionDOM(question, theme, accentColor, collectedResponses);
      container.appendChild(questionEl);
    }

    // Submit button
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Submit';
    submitBtn.style.cssText = `
      display: block; width: 100%; margin-top: 16px; padding: 10px 16px;
      background: ${accentColor}; color: #fff; border: none; border-radius: 8px;
      font-size: 14px; font-weight: 500; cursor: pointer;
      transition: opacity 0.2s;
    `;
    submitBtn.addEventListener('mouseenter', () => { submitBtn.style.opacity = '0.9'; });
    submitBtn.addEventListener('mouseleave', () => { submitBtn.style.opacity = '1'; });

    const submitHandler = () => {
      this.submitResponse(survey.id, { ...collectedResponses });
    };
    submitBtn.addEventListener('click', submitHandler);
    this.listeners.push([submitBtn, 'click', submitHandler]);
    container.appendChild(submitBtn);

    return container;
  }

  private buildQuestionDOM(
    question: SurveyQuestion,
    theme: string,
    accentColor: string,
    responses: Record<string, unknown>
  ): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom: 16px;';

    const label = document.createElement('label');
    label.textContent = question.text;
    label.style.cssText = 'display: block; font-size: 14px; margin-bottom: 8px; font-weight: 500;';
    wrapper.appendChild(label);

    const borderColor = theme === 'dark' ? '#374151' : '#d1d5db';
    const inputBg = theme === 'dark' ? '#111827' : '#f9fafb';

    switch (question.type) {
      case 'scale':
      case 'rating': {
        const min = question.min ?? 0;
        const max = question.max ?? 10;
        const scaleRow = document.createElement('div');
        scaleRow.style.cssText = 'display: flex; gap: 4px; flex-wrap: wrap;';

        for (let i = min; i <= max; i++) {
          const btn = document.createElement('button');
          btn.textContent = String(i);
          btn.style.cssText = `
            flex: 1; min-width: 28px; padding: 8px 4px;
            border: 1px solid ${borderColor}; border-radius: 6px;
            background: ${inputBg}; cursor: pointer; font-size: 13px;
            color: inherit; transition: background 0.15s, border-color 0.15s;
          `;

          const clickHandler = () => {
            // Reset all siblings
            Array.from(scaleRow.children).forEach((child) => {
              (child as HTMLElement).style.background = inputBg;
              (child as HTMLElement).style.borderColor = borderColor;
            });
            btn.style.background = accentColor;
            btn.style.borderColor = accentColor;
            btn.style.color = '#fff';
            responses[question.id] = i;
          };
          btn.addEventListener('click', clickHandler);
          this.listeners.push([btn, 'click', clickHandler]);
          scaleRow.appendChild(btn);
        }
        wrapper.appendChild(scaleRow);
        break;
      }

      case 'text': {
        const textarea = document.createElement('textarea');
        textarea.rows = 3;
        textarea.placeholder = 'Your answer...';
        textarea.style.cssText = `
          width: 100%; padding: 8px 12px; border: 1px solid ${borderColor};
          border-radius: 8px; background: ${inputBg}; color: inherit;
          font-size: 14px; font-family: inherit; resize: vertical;
          box-sizing: border-box;
        `;
        const inputHandler = () => { responses[question.id] = textarea.value; };
        textarea.addEventListener('input', inputHandler);
        this.listeners.push([textarea, 'input', inputHandler]);
        wrapper.appendChild(textarea);
        break;
      }

      case 'multiple_choice': {
        const options = question.options ?? [];
        for (const option of options) {
          const optionLabel = document.createElement('label');
          optionLabel.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px; cursor: pointer; font-size: 14px;';

          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = `aether_q_${question.id}`;
          radio.value = option;
          const changeHandler = () => { responses[question.id] = option; };
          radio.addEventListener('change', changeHandler);
          this.listeners.push([radio, 'change', changeHandler]);

          optionLabel.appendChild(radio);
          optionLabel.appendChild(document.createTextNode(option));
          wrapper.appendChild(optionLabel);
        }
        break;
      }

      case 'boolean': {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; gap: 8px;';

        for (const val of ['Yes', 'No']) {
          const btn = document.createElement('button');
          btn.textContent = val;
          btn.style.cssText = `
            flex: 1; padding: 8px; border: 1px solid ${borderColor};
            border-radius: 8px; background: ${inputBg}; cursor: pointer;
            font-size: 14px; color: inherit; transition: background 0.15s;
          `;

          const clickHandler = () => {
            Array.from(row.children).forEach((child) => {
              (child as HTMLElement).style.background = inputBg;
              (child as HTMLElement).style.borderColor = borderColor;
            });
            btn.style.background = accentColor;
            btn.style.borderColor = accentColor;
            btn.style.color = '#fff';
            responses[question.id] = val === 'Yes';
          };
          btn.addEventListener('click', clickHandler);
          this.listeners.push([btn, 'click', clickHandler]);
          row.appendChild(btn);
        }
        wrapper.appendChild(row);
        break;
      }
    }

    return wrapper;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private showThankYou(surveyId: string, message: string): void {
    const element = this.activeSurveyElements.get(surveyId);
    if (!element) return;

    element.innerHTML = '';
    const thankYou = document.createElement('p');
    thankYou.textContent = message;
    thankYou.style.cssText = 'text-align: center; font-size: 16px; font-weight: 500; margin: 16px 0;';
    element.appendChild(thankYou);

    setTimeout(() => this.hideSurvey(surveyId), 2000);
  }

  private getPositionCSS(position: string): string {
    switch (position) {
      case 'bottom-left':  return 'bottom: 16px; left: 16px;';
      case 'center':       return 'top: 50%; left: 50%; transform: translate(-50%, -50%);';
      case 'top-right':    return 'top: 16px; right: 16px;';
      case 'bottom-right':
      default:             return 'bottom: 16px; right: 16px;';
    }
  }

  /** Simple FNV-1a hash for deterministic sampling */
  private hashString(str: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  private incrementDisplayCount(surveyId: string): void {
    const count = (this.displayCounts.get(surveyId) ?? 0) + 1;
    this.displayCounts.set(surveyId, count);
    this.persistDisplayCounts();
  }

  // ===========================================================================
  // PERSISTENCE
  // ===========================================================================

  private loadResponses(): void {
    const stored = storage.get<SurveyResponse[]>(RESPONSES_KEY);
    if (Array.isArray(stored)) {
      this.responses = stored;
    }
  }

  private persistResponses(): void {
    storage.set(RESPONSES_KEY, this.responses);
  }

  private loadDisplayCounts(): void {
    const stored = storage.get<Record<string, number>>(DISPLAY_COUNTS_KEY);
    if (stored && typeof stored === 'object') {
      Object.entries(stored).forEach(([key, value]) => {
        this.displayCounts.set(key, value as number);
      });
    }
  }

  private persistDisplayCounts(): void {
    const obj: Record<string, number> = {};
    this.displayCounts.forEach((value, key) => {
      obj[key] = value;
    });
    storage.set(DISPLAY_COUNTS_KEY, obj);
  }
}
