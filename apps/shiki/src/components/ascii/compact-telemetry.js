import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
import { MiniSparkline } from './mini-sparkline';
const TREND_GLYPHS = {
    up: { glyph: '\u25B2', color: 'text-success' },
    down: { glyph: '\u25BC', color: 'text-danger' },
    stable: { glyph: '\u25CF', color: 'text-text-muted' },
};
export function CompactTelemetry({ label, value, sparkData, trend, className }) {
    return (_jsxs("div", { className: cn('flex items-center gap-2 text-xs font-mono', className), children: [_jsx("span", { className: "text-text-muted w-20 truncate", children: label }), _jsx("span", { className: "text-text-primary font-medium", children: value }), sparkData && _jsx(MiniSparkline, { data: sparkData }), trend && TREND_GLYPHS[trend] && (_jsx("span", { className: cn('text-[10px]', TREND_GLYPHS[trend].color), children: TREND_GLYPHS[trend].glyph }))] }));
}
