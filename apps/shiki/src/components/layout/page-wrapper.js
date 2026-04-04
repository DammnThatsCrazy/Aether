import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
export function PageWrapper({ title, subtitle, children, actions, className }) {
    return (_jsxs("div", { className: cn('space-y-4', className), children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-lg font-bold text-text-primary font-mono", children: title }), subtitle && _jsx("p", { className: "text-xs text-text-secondary mt-0.5", children: subtitle })] }), actions && _jsx("div", { className: "flex items-center gap-2", children: actions })] }), children] }));
}
