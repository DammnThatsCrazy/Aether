import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
import { CONTROLLER_FUNCTIONAL_NAMES, CONTROLLER_EXPRESSIVE_NAMES } from '@shiki/types';
const CONTROLLER_GLYPHS = {
    governance: '\u2696',
    char: '\u2605',
    intake: '\u21E8',
    gouf: '\u2B22',
    zeong: '\u26A0',
    triage: '\u2702',
    verification: '\u2714',
    commit: '\u21E9',
    recovery: '\u21BA',
    chronicle: '\u231A',
    trigger: '\u23F0',
    relay: '\u21D2',
};
export function ControllerSignature({ controller, mode, className }) {
    const glyph = CONTROLLER_GLYPHS[controller];
    const name = mode === 'functional'
        ? CONTROLLER_FUNCTIONAL_NAMES[controller]
        : mode === 'named'
            ? controller.toUpperCase()
            : CONTROLLER_EXPRESSIVE_NAMES[controller];
    return (_jsxs("span", { className: cn('inline-flex items-center gap-1 font-mono text-xs', className), children: [_jsx("span", { children: glyph }), _jsx("span", { className: "text-text-primary", children: name })] }));
}
