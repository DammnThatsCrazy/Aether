import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card, CardContent, StatusIndicator, Badge } from '@shiki/components/system';
import { formatDuration } from '@shiki/lib/utils';
export function DependencyCard({ dependency }) {
    return (_jsx(Card, { className: "p-3", children: _jsxs(CardContent, { children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("span", { className: "text-xs font-medium text-text-primary", children: dependency.name }), _jsx(StatusIndicator, { status: dependency.status.status, size: "sm" })] }), _jsxs("div", { className: "space-y-1 text-[10px]", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-text-muted", children: "Type" }), _jsx(Badge, { children: dependency.type })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-text-muted", children: "Latency" }), _jsx("span", { className: "text-text-secondary", children: formatDuration(dependency.latencyMs) })] }), dependency.lastError && (_jsx("div", { className: "text-danger text-[10px] mt-1 truncate", children: dependency.lastError }))] })] }) }));
}
