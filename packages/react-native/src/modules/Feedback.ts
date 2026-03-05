// =============================================================================
// AETHER SDK — FEEDBACK MODULE (React Native)
// In-app surveys: NPS, CSAT, CES, custom questions
// Note: Actual survey UI rendering is the app's responsibility.
// This module handles data, persistence, and tracking only.
// =============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

const RESPONSES_KEY = '@aether_survey_responses';
const DISPLAY_COUNTS_KEY = '@aether_survey_displays';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SurveyType = 'nps' | 'csat' | 'ces' | 'custom';

export interface SurveyQuestion {
  id: string;
  type: 'rating' | 'scale' | 'text' | 'multiple_choice' | 'boolean';
  text: string;
  options?: string[];
  min?: number;
  max?: number;
  required?: boolean;
}

export interface Survey {
  id: string;
  type: SurveyType;
  title: string;
  questions: SurveyQuestion[];
  thankYouMessage?: string;
}

export interface SurveyTrigger {
  event?: string;
  delay?: number;
  screenName?: string;
  sessionCount?: number;
  sampleRate?: number;   // 0..1, default 1.0 (100%)
  maxDisplays?: number;  // max times this survey can be shown
}

export interface SurveyResponse {
  surveyId: string;
  responses: Record<string, unknown>;
  completedAt: number;
  dismissed: boolean;
}

export type TrackCallback = (event: string, properties: Record<string, unknown>) => void;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface RegisteredSurvey {
  survey: Survey;
  trigger: SurveyTrigger;
}

interface DisplayCounts {
  [surveyId: string]: number;
}

// ---------------------------------------------------------------------------
// Feedback Module
// ---------------------------------------------------------------------------

export class RNFeedbackModule {
  private surveys: Map<string, RegisteredSurvey> = new Map();
  private displayCounts: DisplayCounts = {};
  private readonly onTrack: TrackCallback;

  constructor(onTrack: TrackCallback = () => {}) {
    this.onTrack = onTrack;
    this._loadDisplayCounts().catch(() => {});
  }

  // =========================================================================
  // Survey Registration
  // =========================================================================

  /**
   * Register a survey with an optional trigger configuration.
   * The trigger determines when the survey is eligible to be shown.
   */
  registerSurvey(survey: Survey, trigger?: SurveyTrigger): void {
    this.surveys.set(survey.id, {
      survey,
      trigger: trigger ?? {},
    });
  }

  // =========================================================================
  // Display Logic
  // =========================================================================

  /**
   * Determine whether a survey should be shown, based on display counts
   * and the configured sample rate.
   */
  async shouldShowSurvey(surveyId: string): Promise<boolean> {
    const registered = this.surveys.get(surveyId);
    if (!registered) return false;

    const { trigger } = registered;

    // Check max display count
    if (trigger.maxDisplays !== undefined) {
      await this._loadDisplayCounts();
      const shown = this.displayCounts[surveyId] ?? 0;
      if (shown >= trigger.maxDisplays) return false;
    }

    // Check sample rate
    if (trigger.sampleRate !== undefined && trigger.sampleRate < 1) {
      if (Math.random() > trigger.sampleRate) return false;
    }

    return true;
  }

  /**
   * Record that a survey was shown to the user. Increments the display count
   * and persists it to AsyncStorage.
   */
  async recordSurveyShown(surveyId: string): Promise<void> {
    this.displayCounts[surveyId] = (this.displayCounts[surveyId] ?? 0) + 1;
    await this._persistDisplayCounts();

    const registered = this.surveys.get(surveyId);
    this._track('Survey Shown', {
      survey_id: surveyId,
      survey_type: registered?.survey.type,
      survey_title: registered?.survey.title,
      display_count: this.displayCounts[surveyId],
    });
  }

  // =========================================================================
  // Response Handling
  // =========================================================================

  /**
   * Submit a user's response to a survey. Persists to AsyncStorage and
   * emits a tracking event.
   */
  async submitResponse(
    surveyId: string,
    responses: Record<string, unknown>,
  ): Promise<void> {
    const entry: SurveyResponse = {
      surveyId,
      responses,
      completedAt: Date.now(),
      dismissed: false,
    };

    await this._storeResponse(entry);

    const registered = this.surveys.get(surveyId);
    this._track('Survey Completed', {
      survey_id: surveyId,
      survey_type: registered?.survey.type,
      survey_title: registered?.survey.title,
      responses,
      completed_at: entry.completedAt,
    });
  }

  /**
   * Record that the user dismissed a survey without completing it.
   */
  async dismissSurvey(surveyId: string): Promise<void> {
    const entry: SurveyResponse = {
      surveyId,
      responses: {},
      completedAt: Date.now(),
      dismissed: true,
    };

    await this._storeResponse(entry);

    const registered = this.surveys.get(surveyId);
    this._track('Survey Dismissed', {
      survey_id: surveyId,
      survey_type: registered?.survey.type,
      survey_title: registered?.survey.title,
      dismissed_at: entry.completedAt,
    });
  }

  /**
   * Retrieve stored survey responses, optionally filtered by survey ID.
   */
  async getSurveyResponses(surveyId?: string): Promise<SurveyResponse[]> {
    try {
      const raw = await AsyncStorage.getItem(RESPONSES_KEY);
      if (!raw) return [];

      const allResponses: SurveyResponse[] = JSON.parse(raw);
      if (surveyId) {
        return allResponses.filter((r) => r.surveyId === surveyId);
      }
      return allResponses;
    } catch {
      return [];
    }
  }

  // =========================================================================
  // Survey Templates
  // =========================================================================

  /**
   * Create a standard Net Promoter Score (NPS) survey.
   * Scale: 0-10. "How likely are you to recommend us?"
   */
  static createNPS(id = 'nps_default'): Survey {
    return {
      id,
      type: 'nps',
      title: 'Net Promoter Score',
      questions: [
        {
          id: 'nps_score',
          type: 'scale',
          text: 'How likely are you to recommend us to a friend or colleague?',
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
    };
  }

  /**
   * Create a standard Customer Satisfaction (CSAT) survey.
   * Scale: 1-5. "How satisfied are you?"
   */
  static createCSAT(id = 'csat_default'): Survey {
    return {
      id,
      type: 'csat',
      title: 'Customer Satisfaction',
      questions: [
        {
          id: 'csat_score',
          type: 'rating',
          text: 'How satisfied are you with your experience?',
          min: 1,
          max: 5,
          required: true,
        },
        {
          id: 'csat_comment',
          type: 'text',
          text: 'Any additional comments?',
          required: false,
        },
      ],
      thankYouMessage: 'Thank you for your feedback!',
    };
  }

  /**
   * Create a standard Customer Effort Score (CES) survey.
   * Scale: 1-7. "How easy was it to accomplish your goal?"
   */
  static createCES(id = 'ces_default'): Survey {
    return {
      id,
      type: 'ces',
      title: 'Customer Effort Score',
      questions: [
        {
          id: 'ces_score',
          type: 'scale',
          text: 'How easy was it to accomplish what you wanted to do?',
          min: 1,
          max: 7,
          required: true,
        },
        {
          id: 'ces_comment',
          type: 'text',
          text: 'What could we do to make it easier?',
          required: false,
        },
      ],
      thankYouMessage: 'Thank you for your feedback!',
    };
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  destroy(): void {
    this.surveys.clear();
    this.displayCounts = {};
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private _track(event: string, properties: Record<string, unknown>): void {
    try {
      this.onTrack(event, properties);
    } catch {
      // Tracking failures must never break app functionality.
    }
  }

  private async _storeResponse(entry: SurveyResponse): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(RESPONSES_KEY);
      const existing: SurveyResponse[] = raw ? JSON.parse(raw) : [];
      existing.push(entry);

      // Cap stored responses at 500 to avoid unbounded storage growth.
      const capped = existing.length > 500 ? existing.slice(-500) : existing;
      await AsyncStorage.setItem(RESPONSES_KEY, JSON.stringify(capped));
    } catch {
      // Storage failures are non-critical.
    }
  }

  private async _loadDisplayCounts(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(DISPLAY_COUNTS_KEY);
      if (raw) {
        this.displayCounts = JSON.parse(raw);
      }
    } catch {
      // Graceful degradation: start with zero counts.
    }
  }

  private async _persistDisplayCounts(): Promise<void> {
    try {
      await AsyncStorage.setItem(DISPLAY_COUNTS_KEY, JSON.stringify(this.displayCounts));
    } catch {
      // Storage failures are non-critical.
    }
  }
}

// ---------------------------------------------------------------------------
// Default singleton (provide your own onTrack callback before first use)
// ---------------------------------------------------------------------------

const feedback = new RNFeedbackModule();
export default feedback;
