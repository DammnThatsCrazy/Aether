import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
const GLYPHS = {
    healthy: { glyph: '\u2588', color: 'text-success' },
    degraded: { glyph: '\u2593', color: 'text-warning' },
    unhealthy: { glyph: '\u2591', color: 'text-danger' },
    unknown: { glyph: '\u2592', color: 'text-text-muted' },
};
export function AsciiStatusGlyph({ status, className }) {
    const entry = GLYPHS[status];
    const glyph = entry?.glyph ?? '?';
    const color = entry?.color ?? 'text-text-muted';
    return _jsx("span", { className: cn('font-mono text-sm', color, className), children: glyph });
}
