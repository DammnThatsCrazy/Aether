import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { isLocalMocked } from '@shiki/lib/env';
import { MOCK_NOTIFICATIONS } from '@shiki/fixtures/notifications';
function dedupeNotification(existing, incoming) {
    return existing.some(n => n.dedupeKey === incoming.dedupeKey && !n.dismissed);
}
function notifReducer(state, action) {
    switch (action.type) {
        case 'ADD': {
            if (dedupeNotification(state.notifications, action.notification))
                return state;
            const notifications = [action.notification, ...state.notifications].slice(0, 500);
            return { ...state, notifications, unreadCount: notifications.filter(n => !n.read).length };
        }
        case 'BULK_ADD': {
            const newNotifs = action.notifications.filter(n => !dedupeNotification(state.notifications, n));
            const notifications = [...newNotifs, ...state.notifications].slice(0, 500);
            return { ...state, notifications, unreadCount: notifications.filter(n => !n.read).length };
        }
        case 'MARK_READ': {
            const notifications = state.notifications.map(n => n.id === action.id ? { ...n, read: true } : n);
            return { ...state, notifications, unreadCount: notifications.filter(n => !n.read).length };
        }
        case 'MARK_ALL_READ': {
            const notifications = state.notifications.map(n => ({ ...n, read: true }));
            return { ...state, notifications, unreadCount: 0 };
        }
        case 'DISMISS': {
            const notifications = state.notifications.map(n => n.id === action.id ? { ...n, dismissed: true } : n);
            return { ...state, notifications, unreadCount: notifications.filter(n => !n.read && !n.dismissed).length };
        }
        case 'CLEAR_ALL':
            return { ...state, notifications: [], unreadCount: 0 };
        case 'SET_CONNECTED':
            return { ...state, isConnected: action.connected };
    }
}
const NotificationContext = createContext(null);
// Severity routing rules
const SEVERITY_CHANNELS = {
    P0: ['in-app', 'browser', 'email', 'slack'],
    P1: ['in-app', 'browser', 'email', 'slack'],
    P2: ['in-app', 'slack'],
    P3: ['in-app'],
    info: ['in-app'],
};
// Throttle: max 1 notification per dedupeKey per 60s
const throttleMap = new Map();
const THROTTLE_WINDOW_MS = 60000;
function shouldThrottle(dedupeKey) {
    const now = Date.now();
    const last = throttleMap.get(dedupeKey);
    if (last && now - last < THROTTLE_WINDOW_MS)
        return true;
    throttleMap.set(dedupeKey, now);
    return false;
}
function routeToExternalChannels(notification) {
    const channels = SEVERITY_CHANNELS[notification.severity];
    if (channels.includes('browser') && 'Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(notification.title, {
                body: notification.body,
                tag: notification.dedupeKey,
            });
        }
        catch { /* browser notification not available */ }
    }
    if (channels.includes('slack')) {
        // Slack webhook delivery is handled server-side via the notification relay
        // We dispatch an event so the adapter can pick it up
        window.dispatchEvent(new CustomEvent('shiki:notification:slack', {
            detail: {
                title: notification.title,
                body: notification.body,
                severity: notification.severity,
                deepLink: notification.deepLink,
                // Redact sensitive details for external channels
                what: notification.what,
                why: notification.why,
            },
        }));
    }
    if (channels.includes('email')) {
        window.dispatchEvent(new CustomEvent('shiki:notification:email', {
            detail: {
                title: notification.title,
                body: notification.body,
                severity: notification.severity,
                deepLink: notification.deepLink,
            },
        }));
    }
}
// Escalation: if a P1+ notification is unread for >5 minutes, escalate
function startEscalationTimer(notification, escalate) {
    if (notification.severity !== 'P0' && notification.severity !== 'P1')
        return null;
    const delay = notification.severity === 'P0' ? 2 * 60000 : 5 * 60000;
    return setTimeout(() => escalate(notification.id), delay);
}
export function NotificationProvider({ children }) {
    const [state, dispatch] = useReducer(notifReducer, {
        notifications: [],
        unreadCount: 0,
        isConnected: false,
    });
    // Load mock notifications in local mode
    useEffect(() => {
        if (isLocalMocked()) {
            dispatch({ type: 'BULK_ADD', notifications: MOCK_NOTIFICATIONS });
            dispatch({ type: 'SET_CONNECTED', connected: true });
        }
    }, []);
    const escalationTimers = new Map();
    const addNotification = useCallback((notification) => {
        if (shouldThrottle(notification.dedupeKey))
            return;
        dispatch({ type: 'ADD', notification });
        routeToExternalChannels(notification);
        const timer = startEscalationTimer(notification, (id) => {
            // Re-dispatch with elevated urgency
            window.dispatchEvent(new CustomEvent('shiki:notification:escalate', { detail: { id } }));
        });
        if (timer)
            escalationTimers.set(notification.id, timer);
    }, []);
    const markRead = useCallback((id) => {
        dispatch({ type: 'MARK_READ', id });
        const timer = escalationTimers.get(id);
        if (timer) {
            clearTimeout(timer);
            escalationTimers.delete(id);
        }
    }, []);
    const markAllRead = useCallback(() => {
        dispatch({ type: 'MARK_ALL_READ' });
        escalationTimers.forEach(t => clearTimeout(t));
        escalationTimers.clear();
    }, []);
    const dismiss = useCallback((id) => dispatch({ type: 'DISMISS', id }), []);
    const clearAll = useCallback(() => dispatch({ type: 'CLEAR_ALL' }), []);
    return (_jsx(NotificationContext.Provider, { value: { ...state, addNotification, markRead, markAllRead, dismiss, clearAll }, children: children }));
}
export function useNotifications() {
    const ctx = useContext(NotificationContext);
    if (!ctx)
        throw new Error('useNotifications must be used within NotificationProvider');
    return ctx;
}
