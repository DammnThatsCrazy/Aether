import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNotifications } from '@shiki/features/notifications';
import { Card, CardHeader, CardTitle, CardContent, SeverityBadge, Badge, ScrollArea, EmptyState } from '@shiki/components/system';
import { formatRelativeTime } from '@shiki/lib/utils';
export function AlertCenter() {
    const { notifications } = useNotifications();
    const alerts = notifications.filter(n => n.class === 'alert' && !n.dismissed);
    return (_jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsx(CardTitle, { children: "Active Alerts" }), _jsx(Badge, { variant: alerts.length > 0 ? 'danger' : 'default', children: alerts.length })] }), _jsx(CardContent, { children: alerts.length === 0 ? (_jsx(EmptyState, { title: "No active alerts", icon: '\u2714' })) : (_jsx(ScrollArea, { maxHeight: "300px", children: alerts.map(alert => (_jsxs("div", { className: "p-2 border-b border-border-subtle last:border-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx(SeverityBadge, { severity: alert.severity }), alert.controller && _jsx(Badge, { children: alert.controller })] }), _jsx("div", { className: "text-xs text-text-primary", children: alert.title }), _jsx("div", { className: "text-[10px] text-text-muted mt-0.5", children: formatRelativeTime(alert.timestamp) })] }, alert.id))) })) })] }));
}
