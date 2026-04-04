import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { cn } from '@shiki/lib/utils';
export function Tooltip({ content, children, className }) {
    const [show, setShow] = useState(false);
    return (_jsxs("span", { className: "relative inline-flex", onMouseEnter: () => setShow(true), onMouseLeave: () => setShow(false), onFocus: () => setShow(true), onBlur: () => setShow(false), children: [children, show && (_jsx("span", { role: "tooltip", className: cn('absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs bg-surface-sunken text-text-primary border border-border-default rounded whitespace-nowrap z-50', className), children: content }))] }));
}
