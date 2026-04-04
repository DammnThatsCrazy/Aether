import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo } from 'react';
import { PageWrapper } from '@shiki/components/layout';
import { Card, CardContent, CardHeader, CardTitle, Badge, Tabs, TabsList, TabsTrigger, TabsContent, Select, ScrollArea, TerminalSeparator, EmptyState, } from '@shiki/components/system';
import { cn, formatRelativeTime } from '@shiki/lib/utils';
import { CHARStatusPanel, ControllerRoster, ObjectiveBoard, ScheduleTable, } from '@shiki/components/controllers';
import { getMockControllers, MOCK_OBJECTIVES, MOCK_SCHEDULES, MOCK_CHAR_STATUS, } from '@shiki/fixtures/controllers';
import { CONTROLLER_FUNCTIONAL_NAMES, CONTROLLER_EXPRESSIVE_NAMES, } from '@shiki/types';
// ---------------------------------------------------------------------------
// Display mode options
// ---------------------------------------------------------------------------
const DISPLAY_MODE_OPTIONS = [
    { value: 'functional', label: 'Functional' },
    { value: 'named', label: 'Named' },
    { value: 'expressive', label: 'Expressive' },
];
function buildTimelineFeed(controllers, charStatus, displayMode) {
    const controllerEntries = controllers.map((c) => {
        const name = displayMode === 'functional'
            ? CONTROLLER_FUNCTIONAL_NAMES[c.name]
            : displayMode === 'expressive'
                ? CONTROLLER_EXPRESSIVE_NAMES[c.name]
                : c.name.toUpperCase();
        return {
            id: `ctrl-${c.name}`,
            timestamp: c.lastActivity,
            label: `${name} — last activity`,
            type: 'controller',
        };
    });
    const charEntries = [
        {
            id: 'char-brief',
            timestamp: charStatus.lastBriefAt,
            label: `CHAR brief issued — ${charStatus.coordinationState} state`,
            type: 'char',
        },
        ...charStatus.escalations.map((esc, i) => ({
            id: `char-esc-${i}`,
            timestamp: charStatus.lastBriefAt,
            label: esc,
            type: 'char',
        })),
    ];
    return [...controllerEntries, ...charEntries].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
// ---------------------------------------------------------------------------
// Command Page
// ---------------------------------------------------------------------------
export function CommandPage() {
    const [displayMode, setDisplayMode] = useState('named');
    const controllers = useMemo(() => getMockControllers(), []);
    const charStatus = MOCK_CHAR_STATUS;
    const objectives = MOCK_OBJECTIVES;
    const schedules = MOCK_SCHEDULES;
    // Derived data
    const blockedObjectives = useMemo(() => objectives.filter((o) => o.status === 'blocked'), [objectives]);
    const totalStagedMutations = useMemo(() => controllers.reduce((sum, c) => sum + c.stagedMutations, 0), [controllers]);
    const controllersInRecovery = useMemo(() => controllers.filter((c) => c.recoveryState !== 'idle'), [controllers]);
    const timelineFeed = useMemo(() => buildTimelineFeed(controllers, charStatus, displayMode), [controllers, charStatus, displayMode]);
    return (_jsxs(PageWrapper, { title: "Command", subtitle: "Controller orchestration overview", actions: _jsx(Select, { options: DISPLAY_MODE_OPTIONS, value: displayMode, onChange: (v) => setDisplayMode(v), label: "Display" }), children: [_jsx(CHARStatusPanel, { status: charStatus }), _jsxs(Tabs, { defaultValue: "roster", children: [_jsxs(TabsList, { children: [_jsx(TabsTrigger, { value: "roster", children: "Roster" }), _jsxs(TabsTrigger, { value: "objectives", children: ["Objectives", _jsx(Badge, { variant: "default", className: "ml-1.5", children: objectives.length })] }), _jsxs(TabsTrigger, { value: "blocked", children: ["Blocked", blockedObjectives.length > 0 && (_jsx(Badge, { variant: "danger", className: "ml-1.5", children: blockedObjectives.length }))] }), _jsx(TabsTrigger, { value: "schedules", children: "Schedules" }), _jsx(TabsTrigger, { value: "timeline", children: "Timeline" })] }), _jsx(TabsContent, { value: "roster", children: _jsxs("div", { className: "space-y-4", children: [_jsx(ControllerRoster, { controllers: controllers, displayMode: displayMode }), _jsx(TerminalSeparator, { label: "queue depth" }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { className: "font-mono text-xs", children: "Queue Depth by Controller" }) }), _jsx(CardContent, { children: _jsx("div", { className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2", children: controllers.map((c) => {
                                                    const label = displayMode === 'functional'
                                                        ? CONTROLLER_FUNCTIONAL_NAMES[c.name]
                                                        : displayMode === 'expressive'
                                                            ? CONTROLLER_EXPRESSIVE_NAMES[c.name]
                                                            : c.name.toUpperCase();
                                                    const maxQueue = Math.max(...controllers.map((x) => x.queueDepth), 1);
                                                    const pct = (c.queueDepth / maxQueue) * 100;
                                                    return (_jsxs("div", { className: "space-y-1", children: [_jsxs("div", { className: "flex items-center justify-between text-[10px] font-mono", children: [_jsx("span", { className: "text-text-secondary truncate", children: label }), _jsx("span", { className: "text-text-primary font-bold", children: c.queueDepth })] }), _jsx("div", { className: "h-1.5 bg-surface-sunken rounded-full overflow-hidden", children: _jsx("div", { className: cn('h-full rounded-full transition-all', c.queueDepth > 30 ? 'bg-danger' : c.queueDepth > 10 ? 'bg-warning' : 'bg-accent'), style: { width: `${pct}%` } }) })] }, c.name));
                                                }) }) })] }), _jsx(TerminalSeparator, { label: "system state" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: [_jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsx(CardTitle, { className: "font-mono text-xs", children: "Staged Mutations" }), _jsxs(Badge, { variant: totalStagedMutations > 0 ? 'warning' : 'default', children: [totalStagedMutations, " total"] })] }), _jsx(CardContent, { children: totalStagedMutations === 0 ? (_jsx("p", { className: "text-xs text-text-muted font-mono", children: "No staged mutations pending." })) : (_jsx("ul", { className: "space-y-1", children: controllers
                                                            .filter((c) => c.stagedMutations > 0)
                                                            .map((c) => {
                                                            const label = displayMode === 'functional'
                                                                ? CONTROLLER_FUNCTIONAL_NAMES[c.name]
                                                                : displayMode === 'expressive'
                                                                    ? CONTROLLER_EXPRESSIVE_NAMES[c.name]
                                                                    : c.name.toUpperCase();
                                                            return (_jsxs("li", { className: "flex items-center justify-between text-xs font-mono", children: [_jsx("span", { className: "text-text-secondary", children: label }), _jsx("span", { className: "text-warning font-bold", children: c.stagedMutations })] }, c.name));
                                                        }) })) })] }), _jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsx(CardTitle, { className: "font-mono text-xs", children: "Recovery State" }), _jsx(Badge, { variant: controllersInRecovery.length > 0 ? 'danger' : 'success', children: controllersInRecovery.length > 0
                                                                ? `${controllersInRecovery.length} non-idle`
                                                                : 'all idle' })] }), _jsx(CardContent, { children: controllersInRecovery.length === 0 ? (_jsx("p", { className: "text-xs text-text-muted font-mono", children: "All controllers in idle recovery state." })) : (_jsx("ul", { className: "space-y-1", children: controllersInRecovery.map((c) => {
                                                            const label = displayMode === 'functional'
                                                                ? CONTROLLER_FUNCTIONAL_NAMES[c.name]
                                                                : displayMode === 'expressive'
                                                                    ? CONTROLLER_EXPRESSIVE_NAMES[c.name]
                                                                    : c.name.toUpperCase();
                                                            return (_jsxs("li", { className: "flex items-center justify-between text-xs font-mono", children: [_jsx("span", { className: "text-text-secondary", children: label }), _jsx(Badge, { variant: c.recoveryState === 'active' ? 'danger' : 'warning', children: c.recoveryState })] }, c.name));
                                                        }) })) })] })] })] }) }), _jsx(TabsContent, { value: "objectives", children: _jsx(ObjectiveBoard, { objectives: objectives, displayMode: displayMode }) }), _jsx(TabsContent, { value: "blocked", children: _jsxs("div", { className: "space-y-3", children: [_jsxs("h3", { className: "text-sm font-medium text-danger font-mono", children: ["Blocked Items (", blockedObjectives.length, ")"] }), blockedObjectives.length === 0 ? (_jsx(EmptyState, { title: "No blocked items", description: "All objectives are proceeding normally", icon: "\\u2713" })) : (_jsx("div", { className: "space-y-2", children: blockedObjectives.map((obj) => {
                                        const label = displayMode === 'functional'
                                            ? CONTROLLER_FUNCTIONAL_NAMES[obj.controller]
                                            : displayMode === 'expressive'
                                                ? CONTROLLER_EXPRESSIVE_NAMES[obj.controller]
                                                : obj.controller.toUpperCase();
                                        return (_jsx(Card, { className: "border-l-4 border-l-danger", children: _jsxs(CardContent, { className: "space-y-1", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-xs font-mono font-bold text-text-primary", children: obj.title }), _jsx(Badge, { variant: "danger", children: "BLOCKED" })] }), _jsxs("div", { className: "flex items-center gap-3 text-[10px] text-text-muted font-mono", children: [_jsx("span", { children: label }), _jsxs("span", { children: ["P", obj.priority] })] }), obj.blockedReason && (_jsx("p", { className: "text-xs text-danger font-mono bg-danger/10 rounded px-2 py-1 mt-1", children: obj.blockedReason }))] }) }, obj.id));
                                    }) }))] }) }), _jsx(TabsContent, { value: "schedules", children: _jsx(ScheduleTable, { schedules: schedules, displayMode: displayMode }) }), _jsx(TabsContent, { value: "timeline", children: _jsxs("div", { className: "space-y-3", children: [_jsx("h3", { className: "text-sm font-medium text-text-primary font-mono", children: "Brief & Activity Feed" }), _jsx(ScrollArea, { maxHeight: "500px", children: _jsx("div", { className: "space-y-1", children: timelineFeed.map((entry) => (_jsxs("div", { className: cn('flex items-start gap-3 px-3 py-1.5 rounded text-xs font-mono', entry.type === 'char' ? 'bg-accent/5' : 'bg-transparent'), children: [_jsx("span", { className: "text-text-muted shrink-0 w-24 text-right", children: formatRelativeTime(entry.timestamp) }), _jsx("span", { className: cn('shrink-0 w-1.5 h-1.5 rounded-full mt-1.5', entry.type === 'char' ? 'bg-accent' : 'bg-text-muted') }), _jsx("span", { className: cn('text-text-primary', entry.type === 'char' && 'text-accent'), children: entry.label })] }, entry.id))) }) })] }) })] })] }));
}
