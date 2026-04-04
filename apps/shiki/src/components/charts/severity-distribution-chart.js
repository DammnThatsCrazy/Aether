import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Cell } from 'recharts';
const SEVERITY_COLORS = {
    P0: 'var(--color-danger)',
    P1: 'var(--color-warning)',
    P2: 'var(--color-info)',
    P3: 'var(--color-accent)',
    info: 'var(--color-text-muted)',
};
export function SeverityDistributionChart({ data, height = 150, className }) {
    return (_jsx("div", { className: className, children: _jsx(ResponsiveContainer, { width: "100%", height: height, children: _jsxs(BarChart, { data: [...data], children: [_jsx(XAxis, { dataKey: "severity", tick: { fill: 'var(--color-text-muted)', fontSize: 10 } }), _jsx(YAxis, { tick: { fill: 'var(--color-text-muted)', fontSize: 10 } }), _jsx(RechartsTooltip, { contentStyle: { backgroundColor: 'var(--color-surface-overlay)', border: '1px solid var(--color-border-default)', borderRadius: 4, fontSize: 11 } }), _jsx(Bar, { dataKey: "count", radius: [2, 2, 0, 0], children: [...data].map((entry) => (_jsx(Cell, { fill: SEVERITY_COLORS[entry.severity] }, entry.severity))) })] }) }) }));
}
