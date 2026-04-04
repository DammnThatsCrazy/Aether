import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
import { Button } from './button';
export function ErrorState({ title = 'Error', message, onRetry, className }) {
    return (_jsxs("div", { className: cn('flex flex-col items-center justify-center py-12 text-center', className), children: [_jsx("div", { className: "text-3xl text-danger mb-3 font-mono", children: '\u26A0' }), _jsx("div", { className: "text-sm font-medium text-danger", children: title }), _jsx("div", { className: "text-xs text-text-secondary mt-1 max-w-md", children: message }), onRetry && (_jsx(Button, { variant: "secondary", size: "sm", onClick: onRetry, className: "mt-4", children: "Retry" }))] }));
}
