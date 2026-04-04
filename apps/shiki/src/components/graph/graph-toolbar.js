import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
import { Button, Toggle, Select, Badge } from '@shiki/components/system';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const LAYERS = [
    { value: 'all', label: 'All' },
    { value: 'h2h', label: 'H2H' },
    { value: 'h2a', label: 'H2A' },
    { value: 'a2h', label: 'A2H' },
    { value: 'a2a', label: 'A2A' },
];
const ENTITY_TYPES = ['customer', 'wallet', 'agent', 'protocol', 'contract', 'cluster'];
const OVERLAY_OPTIONS = [
    { value: 'none', label: 'No Overlay' },
    { value: 'trust', label: 'Trust Score' },
    { value: 'risk', label: 'Risk Score' },
    { value: 'anomaly', label: 'Anomaly Score' },
];
const TIME_WINDOW_OPTIONS = [
    { value: '1h', label: '1 Hour' },
    { value: '6h', label: '6 Hours' },
    { value: '24h', label: '24 Hours' },
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
];
// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function GraphToolbar({ activeLayer, onLayerChange, visibleEntityTypes, onToggleEntityType, activeOverlay, onOverlayChange, timeWindow, onTimeWindowChange, pathMode, onPathModeChange, className, }) {
    return (_jsxs("div", { className: cn('flex flex-wrap items-center gap-4 p-3 bg-surface-raised border border-border-default rounded', className), children: [_jsxs("div", { className: "flex items-center gap-1", children: [_jsx("span", { className: "text-xs text-text-secondary mr-1", children: "Layer:" }), LAYERS.map((l) => (_jsx(Button, { variant: activeLayer === l.value ? 'primary' : 'ghost', size: "sm", onClick: () => onLayerChange(l.value), children: l.label }, l.value)))] }), _jsx("div", { className: "w-px h-6 bg-border-default" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-xs text-text-secondary mr-1", children: "Types:" }), ENTITY_TYPES.map((t) => (_jsx(Toggle, { checked: visibleEntityTypes.includes(t), onChange: () => onToggleEntityType(t), label: t }, t)))] }), _jsx("div", { className: "w-px h-6 bg-border-default" }), _jsx(Select, { label: "Overlay", options: OVERLAY_OPTIONS, value: activeOverlay, onChange: (v) => onOverlayChange(v) }), _jsx(Select, { label: "Window", options: TIME_WINDOW_OPTIONS, value: timeWindow, onChange: onTimeWindowChange }), _jsx("div", { className: "w-px h-6 bg-border-default" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Toggle, { checked: pathMode, onChange: onPathModeChange, label: "Path Mode" }), pathMode && _jsx(Badge, { variant: "accent", children: "Select 2 nodes" })] })] }));
}
