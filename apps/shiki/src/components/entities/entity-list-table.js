import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Badge, StatusIndicator } from '@shiki/components/system';
import { cn, formatRelativeTime } from '@shiki/lib/utils';
function scoreColor(value, inverted = false) {
    const effective = inverted ? 1 - value : value;
    if (effective > 0.7)
        return 'text-green-400';
    if (effective >= 0.4)
        return 'text-yellow-400';
    return 'text-red-400';
}
export function EntityListTable({ entities, onSelect }) {
    if (entities.length === 0) {
        return (_jsx("div", { className: "text-center text-neutral-500 py-12 text-sm", children: "No entities found for this type." }));
    }
    return (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-neutral-700 text-left text-xs uppercase tracking-wider text-neutral-500", children: [_jsx("th", { className: "py-2 px-3", children: "Name" }), _jsx("th", { className: "py-2 px-3", children: "Health" }), _jsx("th", { className: "py-2 px-3 text-right", children: "Trust" }), _jsx("th", { className: "py-2 px-3 text-right", children: "Risk" }), _jsx("th", { className: "py-2 px-3 text-right", children: "Anomaly" }), _jsx("th", { className: "py-2 px-3 text-center", children: "Needs Help" }), _jsx("th", { className: "py-2 px-3", children: "Tags" }), _jsx("th", { className: "py-2 px-3 text-right", children: "Updated" })] }) }), _jsx("tbody", { children: entities.map((entity) => (_jsxs("tr", { onClick: () => onSelect(entity), className: cn('border-b border-neutral-800 cursor-pointer transition-colors hover:bg-neutral-800/50', entity.needsHelp && 'bg-red-400/5 hover:bg-red-400/10'), children: [_jsx("td", { className: "py-2.5 px-3 font-medium text-neutral-200", children: entity.displayLabel }), _jsx("td", { className: "py-2.5 px-3", children: _jsx(StatusIndicator, { status: entity.health.status }) }), _jsx("td", { className: cn('py-2.5 px-3 text-right font-mono', scoreColor(entity.trustScore)), children: entity.trustScore.toFixed(2) }), _jsx("td", { className: cn('py-2.5 px-3 text-right font-mono', scoreColor(entity.riskScore, true)), children: entity.riskScore.toFixed(2) }), _jsx("td", { className: cn('py-2.5 px-3 text-right font-mono', scoreColor(entity.anomalyScore, true)), children: entity.anomalyScore.toFixed(2) }), _jsx("td", { className: "py-2.5 px-3 text-center", children: entity.needsHelp ? (_jsx(Badge, { variant: "danger", children: "HELP" })) : (_jsx("span", { className: "text-neutral-600", children: "--" })) }), _jsx("td", { className: "py-2.5 px-3", children: _jsxs("div", { className: "flex gap-1 flex-wrap", children: [entity.tags.slice(0, 3).map((tag) => (_jsx(Badge, { variant: "default", className: "text-xs", children: tag }, tag))), entity.tags.length > 3 && (_jsxs("span", { className: "text-xs text-neutral-500", children: ["+", entity.tags.length - 3] }))] }) }), _jsx("td", { className: "py-2.5 px-3 text-right text-neutral-400 text-xs", children: formatRelativeTime(entity.updatedAt) })] }, entity.id))) })] }) }));
}
