import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNotifications } from '@shiki/features/notifications';
import { ScrollArea } from '@shiki/components/system';
import { formatRelativeTime } from '@shiki/lib/utils';
export function ActivityRail() {
    const { notifications } = useNotifications();
    const operational = notifications.filter(n => n.class === 'operational' && !n.dismissed).slice(0, 20);
    return (_jsx(ScrollArea, { maxHeight: "250px", children: operational.length === 0 ? (_jsx("div", { className: "text-text-muted text-xs text-center py-4", children: "No recent activity" })) : (_jsx("div", { className: "space-y-1", children: operational.map(n => (_jsxs("div", { className: "flex items-start gap-2 p-1.5 text-[10px]", children: [_jsx("span", { className: "text-text-muted shrink-0", children: formatRelativeTime(n.timestamp) }), _jsx("span", { className: "text-text-secondary", children: n.body })] }, n.id))) })) }));
}
