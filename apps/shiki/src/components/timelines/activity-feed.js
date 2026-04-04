import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ScrollArea, Badge, GlyphIcon } from '@shiki/components/system';
import { formatRelativeTime } from '@shiki/lib/utils';
export function ActivityFeed({ items, maxHeight = '300px', className }) {
    if (items.length === 0) {
        return _jsx("div", { className: "text-text-muted text-xs text-center py-4 font-mono", children: "No activity" });
    }
    return (_jsx(ScrollArea, { maxHeight: maxHeight, className: className, children: _jsx("div", { className: "space-y-2", children: items.map(item => (_jsxs("div", { className: "flex items-start gap-2 text-xs p-2", children: [_jsx(GlyphIcon, { glyph: '\u2022', className: "text-accent mt-0.5" }), _jsxs("div", { className: "flex-1", children: [_jsx("span", { className: "text-text-primary font-medium", children: item.actor }), _jsxs("span", { className: "text-text-secondary", children: [" ", item.action] }), item.target && _jsxs("span", { className: "text-accent", children: [" ", item.target] }), item.controller && _jsx(Badge, { className: "ml-2", children: item.controller }), _jsx("div", { className: "text-[10px] text-text-muted mt-0.5", children: formatRelativeTime(item.timestamp) })] })] }, item.id))) }) }));
}
