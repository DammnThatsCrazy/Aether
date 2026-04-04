import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
const BLOCKS = ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];
export function MiniSparkline({ data, className }) {
    if (data.length === 0)
        return null;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const bars = data.map(v => {
        const idx = Math.round(((v - min) / range) * (BLOCKS.length - 1));
        return BLOCKS[idx] ?? BLOCKS[0];
    });
    return (_jsx("span", { className: cn('font-mono text-xs text-accent tracking-tighter', className), children: bars.join('') }));
}
