import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card, CardHeader, CardTitle, CardContent, TerminalSeparator } from '@shiki/components/system';
export function CommandBriefPanel({ brief, timestamp, className }) {
    return (_jsxs(Card, { className: className, children: [_jsxs(CardHeader, { children: [_jsxs(CardTitle, { children: [_jsx("span", { className: "font-mono", children: "\\u2605" }), " Command Brief"] }), timestamp && _jsx("span", { className: "text-[10px] text-text-muted", children: timestamp })] }), _jsxs(CardContent, { children: [_jsx(TerminalSeparator, {}), _jsx("div", { className: "font-mono text-xs text-text-primary leading-relaxed whitespace-pre-wrap bg-surface-sunken p-3 rounded border border-border-subtle", children: brief }), _jsx(TerminalSeparator, {})] })] }));
}
