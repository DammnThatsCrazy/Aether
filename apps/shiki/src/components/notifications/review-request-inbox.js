import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNotifications } from '@shiki/features/notifications';
import { Card, CardHeader, CardTitle, CardContent, Badge, ScrollArea, EmptyState, Button } from '@shiki/components/system';
import { formatRelativeTime } from '@shiki/lib/utils';
import { useNavigate } from 'react-router-dom';
export function ReviewRequestInbox() {
    const { notifications, markRead } = useNotifications();
    const navigate = useNavigate();
    const requests = notifications.filter(n => n.class === 'action-request' && !n.dismissed);
    return (_jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsx(CardTitle, { children: "Review Requests" }), _jsx(Badge, { variant: requests.length > 0 ? 'warning' : 'default', children: requests.length })] }), _jsx(CardContent, { children: requests.length === 0 ? (_jsx(EmptyState, { title: "No pending reviews", icon: '\u2713' })) : (_jsx(ScrollArea, { maxHeight: "250px", children: requests.map(req => (_jsxs("div", { className: "p-2 border-b border-border-subtle last:border-0", children: [_jsx("div", { className: "text-xs text-text-primary", children: req.title }), _jsx("div", { className: "text-[10px] text-text-muted mt-0.5", children: formatRelativeTime(req.timestamp) }), _jsx(Button, { variant: "ghost", size: "sm", className: "mt-1", onClick: () => {
                                    markRead(req.id);
                                    navigate(req.deepLink);
                                }, children: "Review \\u2192" })] }, req.id))) })) })] }));
}
