import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
export function Select({ options, onChange, label, className, value, ...props }) {
    return (_jsxs("div", { className: "inline-flex flex-col gap-1", children: [label && _jsx("label", { className: "text-xs text-text-secondary", children: label }), _jsx("select", { value: value, onChange: (e) => onChange(e.target.value), className: cn('bg-surface-raised text-text-primary border border-border-default rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-border-focus', className), ...props, children: options.map(opt => (_jsx("option", { value: opt.value, children: opt.label }, opt.value))) })] }));
}
