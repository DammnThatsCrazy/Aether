import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
export function EmptyState({ title, description, icon = '\u2205', action, className }) {
    return (_jsxs("div", { className: cn('flex flex-col items-center justify-center py-12 text-center', className), children: [_jsx("div", { className: "text-3xl text-text-muted mb-3 font-mono", children: icon }), _jsx("div", { className: "text-sm font-medium text-text-secondary", children: title }), description && _jsx("div", { className: "text-xs text-text-muted mt-1 max-w-xs", children: description }), action && _jsx("div", { className: "mt-4", children: action })] }));
}
