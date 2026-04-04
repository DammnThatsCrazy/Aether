import { useSyncExternalStore, useCallback } from 'react';
export function createStore(initialState) {
    let state = initialState;
    const listeners = new Set();
    return {
        getState: () => state,
        setState: (updater) => {
            state = updater(state);
            listeners.forEach(l => l());
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
export function useStore(store, selector) {
    return useSyncExternalStore(store.subscribe, useCallback(() => selector(store.getState()), [store, selector]));
}
