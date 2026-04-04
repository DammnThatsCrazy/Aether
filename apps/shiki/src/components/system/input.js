import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
export function Input({ label, className, ...props }) {
    return (_jsxs("div", { className: "flex flex-col gap-1", children: [label && _jsx("label", { className: "text-xs text-text-secondary", children: label }), _jsx("input", { className: cn('bg-surface-raised text-text-primary border border-border-default rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-border-focus placeholder:text-text-muted', className), ...props })] }));
}
