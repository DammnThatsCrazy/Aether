import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { SeverityBadge, Badge, ScrollArea } from '@shiki/components/system';
import { formatRelativeTime } from '@shiki/lib/utils';
import { cn } from '@shiki/lib/utils';
export function EventTimeline({ events, maxHeight = '400px', className, onEventClick }) {
    if (events.length === 0) {
        return _jsx("div", { className: "text-text-muted text-xs text-center py-4 font-mono", children: "No events" });
    }
    return (_jsx(ScrollArea, { maxHeight: maxHeight, className: className, children: _jsx("div", { className: "space-y-1", children: events.map(event => (_jsxs("div", { className: cn('flex items-start gap-3 p-2 rounded hover:bg-surface-raised transition-colors text-xs', onEventClick && 'cursor-pointer'), onClick: () => onEventClick?.(event), role: onEventClick ? 'button' : undefined, tabIndex: onEventClick ? 0 : undefined, onKeyDown: (e) => { if (e.key === 'Enter' && onEventClick)
                    onEventClick(event); }, children: [_jsx("div", { className: "w-1 h-full min-h-[2rem] rounded-full bg-border-default flex-shrink-0" }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-0.5", children: [_jsx(SeverityBadge, { severity: event.severity }), event.controller && _jsx(Badge, { children: event.controller }), _jsx("span", { className: "text-text-muted text-[10px]", children: formatRelativeTime(event.timestamp) })] }), _jsx("div", { className: "text-text-primary font-medium", children: event.title }), _jsx("div", { className: "text-text-secondary mt-0.5", children: event.description }), event.traceId && (_jsxs("div", { className: "text-[10px] text-text-muted mt-1 font-mono", children: ["trace: ", event.traceId] }))] })] }, event.id))) }) }));
}
