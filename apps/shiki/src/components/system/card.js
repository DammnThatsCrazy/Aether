import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
export function Card({ className, children, ...props }) {
    return (_jsx("div", { className: cn('shiki-card', className), ...props, children: children }));
}
export function CardHeader({ className, children, ...props }) {
    return (_jsx("div", { className: cn('flex items-center justify-between mb-3', className), ...props, children: children }));
}
export function CardTitle({ className, children, ...props }) {
    return (_jsx("h3", { className: cn('text-sm font-medium text-text-primary', className), ...props, children: children }));
}
export function CardContent({ className, children, ...props }) {
    return (_jsx("div", { className: cn('text-sm', className), ...props, children: children }));
}
export function CardFooter({ className, children, ...props }) {
    return (_jsx("div", { className: cn('mt-3 pt-3 border-t border-border-subtle flex items-center gap-2', className), ...props, children: children }));
}
