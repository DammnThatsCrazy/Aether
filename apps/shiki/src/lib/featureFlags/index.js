import { env } from '@shiki/lib/env/config';
const DEFAULT_FLAGS = {
    enableGoufReplay: true,
    enableLabExport: true,
    enableSlackNotifications: true,
    enableEmailNotifications: true,
    enableBrowserNotifications: true,
    enableAggressiveAutomation: false,
    enableMobilePush: false,
    enablePagerDuty: false,
    enableWebhookSinks: false,
};
function loadFlags() {
    try {
        const raw = env.VITE_FEATURE_FLAGS;
        if (raw && raw !== '{}') {
            const parsed = JSON.parse(raw);
            return { ...DEFAULT_FLAGS, ...parsed };
        }
    }
    catch {
        console.warn('[SHIKI] Failed to parse feature flags, using defaults');
    }
    return DEFAULT_FLAGS;
}
export const featureFlags = loadFlags();
export function isFeatureEnabled(flag) {
    return featureFlags[flag];
}
