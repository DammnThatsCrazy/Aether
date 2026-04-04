import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
const statusColors = {
    healthy: 'bg-success',
    degraded: 'bg-warning',
    unhealthy: 'bg-danger',
    unknown: 'bg-text-muted',
};
const statusGlyphs = {
    healthy: '\u25CF',
    degraded: '\u25B2',
    unhealthy: '\u25A0',
    unknown: '\u25CB',
};
export function StatusIndicator({ status, label, size = 'sm', className }) {
    return (_jsxs("span", { className: cn('inline-flex items-center gap-1.5', className), children: [_jsx("span", { className: cn('rounded-full inline-block', statusColors[status], size === 'sm' ? 'h-2 w-2' : 'h-3 w-3'), "aria-label": status }), label && (_jsx("span", { className: cn('font-mono', size === 'sm' ? 'text-xs' : 'text-sm', 'text-text-secondary'), children: label ?? statusGlyphs[status] }))] }));
}
