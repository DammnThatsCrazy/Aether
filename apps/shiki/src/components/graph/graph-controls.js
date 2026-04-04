import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn, formatTimestamp } from '@shiki/lib/utils';
import { Button, Select } from '@shiki/components/system';
// ---------------------------------------------------------------------------
// Speed options
// ---------------------------------------------------------------------------
const SPEED_OPTIONS = [
    { value: '0.5', label: '0.5x' },
    { value: '1', label: '1x' },
    { value: '2', label: '2x' },
    { value: '5', label: '5x' },
];
// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function GraphControls({ isPlaying, onPlay, onPause, onStop, speed, onSpeedChange, currentTime, minTime, maxTime, onScrub, currentTimestamp, className, }) {
    return (_jsxs("div", { className: cn('flex items-center gap-3 p-3 bg-surface-raised border border-border-default rounded', className), children: [_jsxs("div", { className: "flex items-center gap-1", children: [isPlaying ? (_jsx(Button, { variant: "secondary", size: "sm", onClick: onPause, children: "Pause" })) : (_jsx(Button, { variant: "primary", size: "sm", onClick: onPlay, children: "Play" })), _jsx(Button, { variant: "ghost", size: "sm", onClick: onStop, children: "Stop" })] }), _jsx(Select, { options: SPEED_OPTIONS, value: speed, onChange: onSpeedChange }), _jsx("div", { className: "flex-1 flex items-center gap-2", children: _jsx("input", { type: "range", min: minTime, max: maxTime, value: currentTime, onChange: (e) => onScrub(Number(e.target.value)), className: "flex-1 h-1.5 appearance-none bg-surface-default rounded-full cursor-pointer accent-accent" }) }), currentTimestamp && (_jsx("div", { className: "text-xs font-mono text-text-secondary whitespace-nowrap", children: formatTimestamp(currentTimestamp) }))] }));
}
