import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card, CardContent, Badge } from '@shiki/components/system';
import { formatRelativeTime } from '@shiki/lib/utils';
const STATE_VARIANT = {
    closed: 'success',
    open: 'danger',
    'half-open': 'warning',
};
export function CircuitBreakerCard({ breaker }) {
    return (_jsx(Card, { className: "p-3", children: _jsxs(CardContent, { children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("span", { className: "text-xs font-medium text-text-primary", children: breaker.name }), _jsx(Badge, { variant: STATE_VARIANT[breaker.state] ?? 'default', children: breaker.state })] }), _jsxs("div", { className: "space-y-1 text-[10px]", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-text-muted", children: "Failures" }), _jsx("span", { className: "text-text-secondary", children: breaker.failureCount })] }), breaker.lastFailure && (_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-text-muted", children: "Last failure" }), _jsx("span", { className: "text-text-secondary", children: formatRelativeTime(breaker.lastFailure) })] })), breaker.nextRetry && (_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-text-muted", children: "Next retry" }), _jsx("span", { className: "text-text-secondary", children: formatRelativeTime(breaker.nextRetry) })] }))] })] }) }));
}
