import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
export function GlyphIcon({ glyph, className, title }) {
    return (_jsx("span", { className: cn('shiki-glyph', className), title: title, "aria-label": title, children: glyph }));
}
