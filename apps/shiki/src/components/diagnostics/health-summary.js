import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { StatusIndicator, Card, CardContent } from '@shiki/components/system';
import { AsciiStatusGlyph } from '@shiki/components/ascii';
export function HealthSummary({ health, label, className }) {
    return (_jsx(Card, { className: className, children: _jsx(CardContent, { children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx(AsciiStatusGlyph, { status: health.status, className: "text-lg" }), _jsxs("div", { children: [_jsx("div", { className: "text-xs font-medium text-text-primary", children: label }), _jsx(StatusIndicator, { status: health.status, label: health.status.toUpperCase(), size: "sm" }), health.message && _jsx("div", { className: "text-[10px] text-text-muted mt-0.5", children: health.message })] })] }) }) }));
}
