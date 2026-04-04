import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
export function TerminalSeparator({ label, className }) {
    if (label) {
        return (_jsxs("div", { className: cn('flex items-center gap-2 my-2', className), children: [_jsx("div", { className: "flex-1 border-t border-border-subtle opacity-40" }), _jsx("span", { className: "text-[10px] font-mono text-text-muted uppercase tracking-wider", children: label }), _jsx("div", { className: "flex-1 border-t border-border-subtle opacity-40" })] }));
    }
    return _jsx("div", { className: cn('shiki-terminal-separator', className) });
}
