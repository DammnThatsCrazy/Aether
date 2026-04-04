import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card, CardContent } from '@shiki/components/system';
import { cn } from '@shiki/lib/utils';
function getScoreColor(value, inverted) {
    // For trust score: high is good (green). For risk/anomaly (inverted): high is bad (red).
    const effective = inverted ? 1 - value : value;
    if (effective > 0.7)
        return 'text-green-400 border-green-400/30 bg-green-400/5';
    if (effective >= 0.4)
        return 'text-yellow-400 border-yellow-400/30 bg-yellow-400/5';
    return 'text-red-400 border-red-400/30 bg-red-400/5';
}
export function EntityScoreCard({ label, value, inverted = false }) {
    const colorClass = getScoreColor(value, inverted);
    return (_jsx(Card, { className: cn('border', colorClass), children: _jsxs(CardContent, { className: "p-3 text-center", children: [_jsx("div", { className: "text-xs uppercase tracking-wider opacity-70 mb-1", children: label }), _jsx("div", { className: "text-2xl font-mono font-bold", children: value.toFixed(2) })] }) }));
}
