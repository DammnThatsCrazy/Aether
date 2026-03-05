// =============================================================================
// AETHER SDK — FEEDBACK MODULE (React Native) — Thin Native Bridge
// Delegates all survey/feedback operations to NativeModules.AetherFeedback
// =============================================================================

import { NativeModules } from 'react-native';
import type { Survey, SurveyResponse, SurveyTrigger } from '../../../shared/feedback-types';

export type { Survey, SurveyResponse, SurveyTrigger };

const { AetherFeedback } = NativeModules;

// ---------------------------------------------------------------------------
// Thin bridge — all logic lives in the native layer
// ---------------------------------------------------------------------------

class RNFeedbackModule {
  initialize(apiKey: string, endpoint: string): void {
    AetherFeedback?.initialize(apiKey, endpoint);
  }

  registerSurvey(survey: Survey, trigger?: SurveyTrigger): void {
    AetherFeedback?.registerSurvey(survey, trigger ?? {});
  }

  async shouldShowSurvey(surveyId: string): Promise<boolean> {
    return AetherFeedback?.shouldShowSurvey(surveyId) ?? false;
  }

  async recordSurveyShown(surveyId: string): Promise<void> {
    await AetherFeedback?.recordSurveyShown(surveyId);
  }

  async submitResponse(surveyId: string, responses: Record<string, unknown>): Promise<void> {
    await AetherFeedback?.submitResponse(surveyId, responses);
  }

  async dismissSurvey(surveyId: string): Promise<void> {
    await AetherFeedback?.dismissSurvey(surveyId);
  }

  async getSurveyResponses(surveyId?: string): Promise<SurveyResponse[]> {
    return AetherFeedback?.getSurveyResponses(surveyId ?? null) ?? [];
  }

  static createNPS(id = 'nps_default'): Survey {
    return {
      id,
      type: 'nps',
      title: 'Net Promoter Score',
      questions: [
        { id: 'nps_score', type: 'scale', text: 'How likely are you to recommend us to a friend or colleague?', min: 0, max: 10, required: true },
        { id: 'nps_reason', type: 'text', text: 'What is the primary reason for your score?', required: false },
      ],
      thankYouMessage: 'Thank you for your feedback!',
    };
  }

  static createCSAT(id = 'csat_default'): Survey {
    return {
      id,
      type: 'csat',
      title: 'Customer Satisfaction',
      questions: [
        { id: 'csat_score', type: 'rating', text: 'How satisfied are you with your experience?', min: 1, max: 5, required: true },
      ],
      thankYouMessage: 'Thank you for your feedback!',
    };
  }

  static createCES(id = 'ces_default'): Survey {
    return {
      id,
      type: 'ces',
      title: 'Customer Effort Score',
      questions: [
        { id: 'ces_score', type: 'scale', text: 'How easy was it to accomplish what you wanted to do?', min: 1, max: 7, required: true },
      ],
      thankYouMessage: 'Thank you for your feedback!',
    };
  }

  destroy(): void {
    AetherFeedback?.destroy();
  }
}

export const RNFeedback = new RNFeedbackModule();
export default RNFeedback;
