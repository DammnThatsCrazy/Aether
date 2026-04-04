import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNotifications } from './notification-context';
import { Card, CardHeader, CardTitle, CardContent, Button, SeverityBadge, Badge, EmptyState, ScrollArea, Tabs, TabsList, TabsTrigger, TabsContent } from '@shiki/components/system';
import { formatRelativeTime } from '@shiki/lib/utils';
function NotificationItem({ notification, onRead }) {
    return (_jsxs("div", { className: `p-3 border-b border-border-subtle hover:bg-surface-raised transition-colors cursor-pointer ${notification.read ? 'opacity-60' : ''}`, onClick: () => onRead(notification.id), role: "button", tabIndex: 0, onKeyDown: (e) => { if (e.key === 'Enter')
            onRead(notification.id); }, children: [_jsx("div", { className: "flex items-start justify-between gap-2", children: _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx(SeverityBadge, { severity: notification.severity }), notification.controller && _jsx(Badge, { children: notification.controller }), !notification.read && _jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-accent" })] }), _jsx("div", { className: "text-xs font-medium text-text-primary truncate", children: notification.title }), _jsx("div", { className: "text-[11px] text-text-secondary mt-0.5 line-clamp-2", children: notification.body }), _jsxs("div", { className: "flex items-center gap-2 mt-1.5 text-[10px] text-text-muted", children: [_jsx("span", { children: formatRelativeTime(notification.timestamp) }), _jsx("span", { children: '\u00B7' }), _jsx("span", { children: notification.what })] })] }) }), notification.recommendedAction && (_jsxs("div", { className: "mt-2 text-[10px] text-accent font-mono", children: ['\u2192', " ", notification.recommendedAction] }))] }));
}
export function NotificationCenter() {
    const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
    const [filter, setFilter] = useState('all');
    const filtered = notifications.filter(n => {
        if (n.dismissed)
            return false;
        switch (filter) {
            case 'unread': return !n.read;
            case 'alerts': return n.class === 'alert';
            case 'actions': return n.class === 'action-request';
            default: return true;
        }
    });
    return (_jsxs(Card, { className: "w-96", children: [_jsxs(CardHeader, { children: [_jsxs(CardTitle, { children: ["Notifications ", unreadCount > 0 && _jsx(Badge, { variant: "accent", className: "ml-2", children: unreadCount })] }), unreadCount > 0 && (_jsx(Button, { variant: "ghost", size: "sm", onClick: markAllRead, children: "Mark all read" }))] }), _jsx(CardContent, { children: _jsxs(Tabs, { defaultValue: "all", onChange: (v) => setFilter(v), children: [_jsxs(TabsList, { children: [_jsx(TabsTrigger, { value: "all", children: "All" }), _jsx(TabsTrigger, { value: "unread", children: "Unread" }), _jsx(TabsTrigger, { value: "alerts", children: "Alerts" }), _jsx(TabsTrigger, { value: "actions", children: "Actions" })] }), _jsx(TabsContent, { value: filter, children: filtered.length === 0 ? (_jsx(EmptyState, { title: "No notifications", icon: '\u2709' })) : (_jsx(ScrollArea, { maxHeight: "400px", children: filtered.map(n => (_jsx(NotificationItem, { notification: n, onRead: markRead }, n.id))) })) })] }) })] }));
}
