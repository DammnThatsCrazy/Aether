import { getEnvironment } from '@shiki/lib/env';
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
function getMinLevel() {
    const env = getEnvironment();
    if (env === 'production')
        return LOG_LEVELS.warn;
    if (env === 'staging')
        return LOG_LEVELS.info;
    return LOG_LEVELS.debug;
}
function emit(level, message, data) {
    if (LOG_LEVELS[level] < getMinLevel())
        return;
    const entry = {
        level,
        message,
        timestamp: new Date().toISOString(),
        environment: getEnvironment(),
        data,
    };
    switch (level) {
        case 'debug':
            console.debug(`[SHIKI] ${entry.message}`, data ?? '');
            break;
        case 'info':
            console.info(`[SHIKI] ${entry.message}`, data ?? '');
            break;
        case 'warn':
            console.warn(`[SHIKI] ${entry.message}`, data ?? '');
            break;
        case 'error':
            console.error(`[SHIKI] ${entry.message}`, data ?? '');
            break;
    }
    // Hook for external error reporting (Sentry, DataDog, etc.)
    if (level === 'error' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('shiki:error', { detail: entry }));
    }
}
export const log = {
    debug: (message, data) => emit('debug', message, data),
    info: (message, data) => emit('info', message, data),
    warn: (message, data) => emit('warn', message, data),
    error: (message, data) => emit('error', message, data),
};
