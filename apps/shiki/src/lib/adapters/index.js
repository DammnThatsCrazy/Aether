import { getRuntimeMode } from '@shiki/lib/env';
export function getAdapterMode() {
    return getRuntimeMode();
}
/**
 * Creates an adapter that switches between mock and live implementations
 * based on the current runtime mode.
 */
export function createAdapter(mock, live) {
    const mode = getAdapterMode();
    return mode === 'mocked' ? mock : live;
}
/**
 * Creates a lazy adapter that defers implementation selection to call time.
 * Useful when adapter mode may change during runtime.
 */
export function createLazyAdapter(mock, live) {
    return new Proxy(mock, {
        get(_target, prop) {
            const mode = getAdapterMode();
            const impl = mode === 'mocked' ? mock : live;
            return impl[prop];
        },
    });
}
