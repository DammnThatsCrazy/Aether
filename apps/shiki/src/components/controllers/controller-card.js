import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn, formatRelativeTime } from '@shiki/lib/utils';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, Badge, StatusIndicator } from '@shiki/components/system';
import { CONTROLLER_FUNCTIONAL_NAMES, CONTROLLER_EXPRESSIVE_NAMES, } from '@shiki/types';
const THEME_COLORS = {
    governance: 'var(--color-ctrl-governance)',
    char: 'var(--color-ctrl-char)',
    intake: 'var(--color-ctrl-intake)',
    gouf: 'var(--color-ctrl-gouf)',
    zeong: 'var(--color-ctrl-zeong)',
    triage: 'var(--color-ctrl-triage)',
    verification: 'var(--color-ctrl-verification)',
    commit: 'var(--color-ctrl-commit)',
    recovery: 'var(--color-ctrl-recovery)',
    chronicle: 'var(--color-ctrl-chronicle)',
    trigger: 'var(--color-ctrl-trigger)',
    relay: 'var(--color-ctrl-relay)',
};
function getDisplayName(name, mode) {
    switch (mode) {
        case 'functional':
            return CONTROLLER_FUNCTIONAL_NAMES[name];
        case 'named':
            return name.toUpperCase();
        case 'expressive':
            return CONTROLLER_EXPRESSIVE_NAMES[name];
    }
}
const recoveryVariant = {
    idle: 'default',
    pending: 'warning',
    active: 'danger',
};
export function ControllerCard({ controller, displayMode, className }) {
    const { name, health, queueDepth, activeObjectives, blockedItems, lastActivity, uptime, stagedMutations, recoveryState } = controller;
    return (_jsxs(Card, { className: cn('relative overflow-hidden', className), style: { borderLeft: `3px solid ${THEME_COLORS[name]}` }, children: [_jsxs(CardHeader, { children: [_jsx(CardTitle, { className: "font-mono text-xs truncate", children: getDisplayName(name, displayMode) }), _jsx(StatusIndicator, { status: health.status, size: "sm" })] }), _jsxs(CardContent, { className: "space-y-2", children: [health.message && (_jsx("p", { className: "text-[10px] text-text-muted font-mono truncate", title: health.message, children: health.message })), _jsxs("div", { className: "grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono", children: [_jsx("span", { className: "text-text-secondary", children: "Queue" }), _jsx("span", { className: "text-text-primary text-right", children: queueDepth }), _jsx("span", { className: "text-text-secondary", children: "Active" }), _jsx("span", { className: "text-text-primary text-right", children: activeObjectives }), _jsx("span", { className: "text-text-secondary", children: "Blocked" }), _jsx("span", { className: cn('text-right', blockedItems > 0 ? 'text-danger font-bold' : 'text-text-primary'), children: blockedItems }), _jsx("span", { className: "text-text-secondary", children: "Staged" }), _jsx("span", { className: cn('text-right', stagedMutations > 0 ? 'text-warning' : 'text-text-primary'), children: stagedMutations })] })] }), _jsxs(CardFooter, { className: "flex-wrap gap-1.5", children: [recoveryState !== 'idle' && (_jsx(Badge, { variant: recoveryVariant[recoveryState] ?? 'default', children: recoveryState === 'active' ? 'RECOVERING' : 'RECOVERY PENDING' })), _jsx("span", { className: "text-[10px] text-text-muted font-mono ml-auto", title: `Uptime: ${uptime}`, children: formatRelativeTime(lastActivity) })] })] }));
}
