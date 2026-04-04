import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge, SeverityBadge, Button, EmptyState, ScrollArea, Toggle, Input, } from '@shiki/components/system';
import { PageWrapper } from '@shiki/components/layout';
import { cn, formatTimestamp } from '@shiki/lib/utils';
import { getEnvironment, getRuntimeMode } from '@shiki/lib/env';
import { useDebounce } from '@shiki/hooks';
import { getMockEvents, getMockEventStream } from '@shiki/fixtures/events';
const ALL_EVENT_TYPES = [
    'analytics',
    'graph-mutation',
    'agent-lifecycle',
    'controller',
    'onboarding',
    'support',
    'stuck-loop',
    'anomaly',
    'alert',
    'system',
];
const ALL_SEVERITIES = ['P0', 'P1', 'P2', 'P3', 'info'];
const SEVERITY_BORDER = {
    P0: 'border-l-danger',
    P1: 'border-l-warning',
    P2: 'border-l-caution',
    P3: 'border-l-info',
    info: 'border-l-accent',
};
const HIGHLIGHTED_TYPES = new Set([
    'graph-mutation',
    'agent-lifecycle',
    'onboarding',
    'support',
    'stuck-loop',
]);
const TYPE_HIGHLIGHT_BG = {
    'graph-mutation': 'bg-accent/5',
    'agent-lifecycle': 'bg-info/5',
    'onboarding': 'bg-success/5',
    'support': 'bg-warning/5',
    'stuck-loop': 'bg-danger/5',
};
function EventRow({ event, isExpanded, onToggle, }) {
    const isHighlighted = HIGHLIGHTED_TYPES.has(event.type);
    return (_jsxs("div", { children: [_jsxs("div", { className: cn('flex items-center gap-2 p-2 border-l-2 cursor-pointer hover:bg-surface-raised transition-colors', SEVERITY_BORDER[event.severity], isHighlighted && TYPE_HIGHLIGHT_BG[event.type], isExpanded && 'bg-surface-raised'), onClick: onToggle, role: "button", tabIndex: 0, onKeyDown: (e) => { if (e.key === 'Enter')
                    onToggle(); }, children: [_jsx("span", { className: "text-[10px] text-text-muted font-mono w-20 shrink-0", children: formatTimestamp(event.timestamp) }), _jsx("div", { className: "w-12 shrink-0", children: _jsx(SeverityBadge, { severity: event.severity }) }), _jsx(Badge, { variant: event.type === 'graph-mutation' ? 'accent'
                            : event.type === 'agent-lifecycle' ? 'info'
                                : event.type === 'stuck-loop' ? 'danger'
                                    : event.type === 'alert' ? 'warning'
                                        : 'default', className: "shrink-0", children: event.type }), _jsx("span", { className: "text-xs text-text-primary truncate flex-1 min-w-0", children: event.title }), _jsx("span", { className: "text-[10px] text-text-muted shrink-0 hidden md:inline", children: event.source }), event.controller && (_jsx(Badge, { variant: "info", className: "shrink-0 hidden lg:inline-flex", children: event.controller })), event.entityId && (_jsxs("a", { href: `/entities/${event.entityType}/${event.entityId}`, className: "text-[10px] text-accent hover:underline shrink-0 hidden xl:inline", onClick: (e) => e.stopPropagation(), children: [event.entityType, ":", event.entityId.slice(0, 12)] })), event.traceId && (_jsx("a", { href: `/diagnostics/traces/${event.traceId}`, className: "text-[10px] text-text-muted hover:text-accent font-mono shrink-0 hidden xl:inline", onClick: (e) => e.stopPropagation(), children: event.traceId.slice(0, 14) })), event.pinned && (_jsx("span", { className: "text-[10px] text-warning shrink-0", title: "Pinned", children: '\u{1F4CC}' }))] }), isExpanded && (_jsx("div", { className: "p-3 bg-surface-sunken border-l-2 border-border-subtle ml-0", children: _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]", children: [_jsxs("div", { children: [_jsx("div", { className: "text-text-muted mb-1 font-mono", children: "Description" }), _jsx("div", { className: "text-text-secondary", children: event.description })] }), _jsxs("div", { className: "space-y-2", children: [_jsxs("div", { children: [_jsx("span", { className: "text-text-muted font-mono", children: "Event ID: " }), _jsx("span", { className: "text-text-secondary font-mono", children: event.id })] }), _jsxs("div", { children: [_jsx("span", { className: "text-text-muted font-mono", children: "Timestamp: " }), _jsx("span", { className: "text-text-secondary font-mono", children: event.timestamp })] }), _jsxs("div", { children: [_jsx("span", { className: "text-text-muted font-mono", children: "Source: " }), _jsx("span", { className: "text-text-secondary", children: event.source })] }), event.controller && (_jsxs("div", { children: [_jsx("span", { className: "text-text-muted font-mono", children: "Controller: " }), _jsx(Badge, { variant: "info", children: event.controller })] })), event.entityId && (_jsxs("div", { children: [_jsx("span", { className: "text-text-muted font-mono", children: "Entity: " }), _jsxs("a", { href: `/entities/${event.entityType}/${event.entityId}`, className: "text-accent hover:underline", children: [event.entityType, "/", event.entityId] })] })), event.traceId && (_jsxs("div", { children: [_jsx("span", { className: "text-text-muted font-mono", children: "Trace: " }), _jsx("a", { href: `/diagnostics/traces/${event.traceId}`, className: "text-accent hover:underline font-mono", children: event.traceId })] })), Object.keys(event.metadata).length > 0 && (_jsxs("div", { children: [_jsx("div", { className: "text-text-muted font-mono mb-0.5", children: "Metadata" }), _jsx("pre", { className: "text-[10px] text-text-secondary bg-surface-raised p-1.5 rounded font-mono overflow-auto", children: JSON.stringify(event.metadata, null, 2) })] }))] })] }) }))] }));
}
export function LivePage() {
    const environment = getEnvironment();
    const mode = getRuntimeMode();
    const [events, setEvents] = useState(() => getMockEvents());
    const [isPaused, setIsPaused] = useState(false);
    const [expandedEventId, setExpandedEventId] = useState(null);
    // Filters
    const [activeTypes, setActiveTypes] = useState(new Set(ALL_EVENT_TYPES));
    const [activeSeverities, setActiveSeverities] = useState(new Set(ALL_SEVERITIES));
    const [controllerFilter, setControllerFilter] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const debouncedSearch = useDebounce(searchInput, 300);
    const streamRef = useRef(getMockEventStream());
    // Simulate live event stream
    useEffect(() => {
        if (isPaused)
            return;
        const interval = setInterval(() => {
            const result = streamRef.current.next();
            if (!result.done && result.value) {
                setEvents(prev => [result.value, ...prev].slice(0, 500));
            }
        }, 2000 + Math.random() * 1000);
        return () => clearInterval(interval);
    }, [isPaused]);
    // Filter logic
    const filteredEvents = events.filter(event => {
        if (!activeTypes.has(event.type))
            return false;
        if (!activeSeverities.has(event.severity))
            return false;
        if (controllerFilter && event.controller !== controllerFilter)
            return false;
        if (debouncedSearch) {
            const search = debouncedSearch.toLowerCase();
            const matches = event.title.toLowerCase().includes(search) ||
                event.description.toLowerCase().includes(search) ||
                event.source.toLowerCase().includes(search) ||
                (event.controller?.toLowerCase().includes(search) ?? false) ||
                (event.entityId?.toLowerCase().includes(search) ?? false) ||
                (event.traceId?.toLowerCase().includes(search) ?? false);
            if (!matches)
                return false;
        }
        return true;
    });
    const pinnedEvents = filteredEvents.filter(e => e.pinned);
    const unpinnedEvents = filteredEvents.filter(e => !e.pinned);
    // Unique controllers from events for filter dropdown
    const uniqueControllers = Array.from(new Set(events.map(e => e.controller).filter(Boolean))).sort();
    const toggleType = useCallback((type) => {
        setActiveTypes(prev => {
            const next = new Set(prev);
            if (next.has(type)) {
                next.delete(type);
            }
            else {
                next.add(type);
            }
            return next;
        });
    }, []);
    const toggleSeverity = useCallback((sev) => {
        setActiveSeverities(prev => {
            const next = new Set(prev);
            if (next.has(sev)) {
                next.delete(sev);
            }
            else {
                next.add(sev);
            }
            return next;
        });
    }, []);
    const handleToggleExpand = useCallback((eventId) => {
        setExpandedEventId(prev => prev === eventId ? null : eventId);
    }, []);
    return (_jsxs(PageWrapper, { title: "Live", subtitle: "Real-time event stream", actions: _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("div", { className: "text-xs text-text-muted font-mono", children: [filteredEvents.length, " events", filteredEvents.length !== events.length && (_jsxs("span", { className: "text-text-muted", children: [" / ", events.length, " total"] }))] }), _jsx(Button, { variant: isPaused ? 'primary' : 'secondary', size: "sm", onClick: () => setIsPaused(p => !p), children: isPaused ? '\u25B6 Resume' : '\u23F8 Pause' }), !isPaused && (_jsxs("span", { className: "flex items-center gap-1.5 text-[10px] text-success font-mono", children: [_jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-success animate-pulse" }), "LIVE"] }))] }), children: [_jsx(Card, { children: _jsx(CardContent, { className: "py-3", children: _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx("span", { className: "text-[10px] text-text-muted font-mono w-12 shrink-0", children: "TYPE" }), ALL_EVENT_TYPES.map(type => (_jsx(Toggle, { pressed: activeTypes.has(type), onPressedChange: () => toggleType(type), size: "sm", children: type }, type)))] }), _jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx("span", { className: "text-[10px] text-text-muted font-mono w-12 shrink-0", children: "SEV" }), ALL_SEVERITIES.map(sev => (_jsx(Toggle, { pressed: activeSeverities.has(sev), onPressedChange: () => toggleSeverity(sev), size: "sm", children: sev }, sev)))] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "text-[10px] text-text-muted font-mono w-12 shrink-0", children: "FIND" }), _jsxs("select", { className: "text-xs bg-surface-sunken border border-border-subtle rounded px-2 py-1 text-text-primary", value: controllerFilter, onChange: e => setControllerFilter(e.target.value), children: [_jsx("option", { value: "", children: "All Controllers" }), uniqueControllers.map(c => (_jsx("option", { value: c, children: c }, c)))] }), _jsx(Input, { placeholder: "Search events...", value: searchInput, onChange: e => setSearchInput(e.target.value), className: "flex-1 max-w-sm" }), (controllerFilter || debouncedSearch || activeTypes.size !== ALL_EVENT_TYPES.length || activeSeverities.size !== ALL_SEVERITIES.length) && (_jsx(Button, { variant: "ghost", size: "sm", onClick: () => {
                                            setActiveTypes(new Set(ALL_EVENT_TYPES));
                                            setActiveSeverities(new Set(ALL_SEVERITIES));
                                            setControllerFilter('');
                                            setSearchInput('');
                                        }, children: "Clear Filters" }))] })] }) }) }), pinnedEvents.length > 0 && (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { children: ['\u{1F4CC}', " Pinned Incidents", _jsx(Badge, { variant: "warning", className: "ml-2", children: pinnedEvents.length })] }) }), _jsx(CardContent, { children: _jsx("div", { className: "space-y-0 divide-y divide-border-subtle", children: pinnedEvents.map(event => (_jsx(EventRow, { event: event, isExpanded: expandedEventId === event.id, onToggle: () => handleToggleExpand(event.id) }, event.id))) }) })] })), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { children: ["Event Stream", _jsx(Badge, { variant: "default", className: "ml-2", children: unpinnedEvents.length })] }) }), _jsx(CardContent, { children: unpinnedEvents.length === 0 ? (_jsx(EmptyState, { title: "No events match filters", icon: '\u26A0' })) : (_jsx(ScrollArea, { maxHeight: "600px", children: _jsx("div", { className: "space-y-0 divide-y divide-border-subtle", children: unpinnedEvents.map(event => (_jsx(EventRow, { event: event, isExpanded: expandedEventId === event.id, onToggle: () => handleToggleExpand(event.id) }, event.id))) }) })) })] })] }));
}
