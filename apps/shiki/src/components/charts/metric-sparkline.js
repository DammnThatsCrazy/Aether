import { jsx as _jsx } from "react/jsx-runtime";
import { ResponsiveContainer, LineChart, Line } from 'recharts';
export function MetricSparkline({ data, color = 'var(--color-accent)', height = 30, className }) {
    const chartData = data.map((value, i) => ({ i, value }));
    return (_jsx("div", { className: className, style: { height }, children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsx(LineChart, { data: chartData, children: _jsx(Line, { type: "monotone", dataKey: "value", stroke: color, strokeWidth: 1.5, dot: false }) }) }) }));
}
