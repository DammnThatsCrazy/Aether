import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback } from 'react';
import { PageWrapper } from '@shiki/components/layout';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState, ScrollArea, Select, TerminalSeparator } from '@shiki/components/system';
import { getRuntimeMode, getEnvironment } from '@shiki/lib/env';
import { getMockEvents } from '@shiki/fixtures/events';
import { getMockEntities } from '@shiki/fixtures/entities';
import { getMockGraphData } from '@shiki/fixtures/graph';
import { getMockControllers } from '@shiki/fixtures/controllers';
import { getMockReviewBatches } from '@shiki/fixtures/review';
import { getMockHealthData } from '@shiki/fixtures/health';
import { getMockMissionData } from '@shiki/fixtures/mission';
import { createReplayController } from '@shiki/lib/replay';
// Scenario definitions
const SCENARIOS = [
    { id: 'default', name: 'Default State', description: 'Standard operational baseline with mixed entity states' },
    { id: 'p0-incident', name: 'P0 Incident', description: 'Simulates active P0 customer event stream failure' },
    { id: 'agent-stuck', name: 'Agent Stuck Loops', description: 'Multiple agents in retry/stuck state' },
    { id: 'graph-anomaly', name: 'Graph Anomaly Burst', description: 'Cluster of suspicious graph mutations' },
    { id: 'review-backlog', name: 'Review Backlog', description: 'Large pending review queue with mixed classes' },
    { id: 'healthy-all', name: 'All Healthy', description: 'Clean system state, no anomalies or issues' },
];
function JsonViewer({ data, label }) {
    const [collapsed, setCollapsed] = useState(true);
    const json = JSON.stringify(data, null, 2);
    const lines = json.split('\n');
    const preview = lines.slice(0, 5).join('\n') + (lines.length > 5 ? '\n  ...' : '');
    return (_jsxs("div", { className: "border border-border-default rounded bg-surface-sunken", children: [_jsxs("button", { onClick: () => setCollapsed(!collapsed), className: "w-full text-left px-3 py-2 text-xs font-mono text-text-secondary hover:text-text-primary flex items-center justify-between", children: [_jsx("span", { children: label }), _jsxs("span", { className: "text-text-muted", children: [collapsed ? '\u25B6' : '\u25BC', " ", lines.length, " lines"] })] }), _jsx(ScrollArea, { maxHeight: "300px", children: _jsx("pre", { className: "px-3 pb-3 text-[11px] font-mono text-text-primary whitespace-pre overflow-x-auto", children: collapsed ? preview : json }) })] }));
}
function ScenarioFixtures() {
    const [activeScenario, setActiveScenario] = useState('default');
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Select, { label: "Active Scenario", options: SCENARIOS.map(s => ({ value: s.id, label: s.name })), value: activeScenario, onChange: setActiveScenario }), _jsx("div", { className: "text-xs text-text-muted mt-5", children: SCENARIOS.find(s => s.id === activeScenario)?.description })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { children: ["Entities (", getMockEntities().length, ")"] }) }), _jsx(CardContent, { children: _jsx(JsonViewer, { data: getMockEntities().slice(0, 3), label: "entities (first 3)" }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { children: ["Controllers (", getMockControllers().length, ")"] }) }), _jsx(CardContent, { children: _jsx(JsonViewer, { data: getMockControllers().slice(0, 3), label: "controllers (first 3)" }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { children: ["Events (", getMockEvents().length, ")"] }) }), _jsx(CardContent, { children: _jsx(JsonViewer, { data: getMockEvents().slice(0, 3), label: "events (first 3)" }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Graph" }) }), _jsx(CardContent, { children: (() => {
                                    const g = getMockGraphData();
                                    return _jsx(JsonViewer, { data: { nodeCount: g.nodes.length, edgeCount: g.edges.length, clusterCount: g.clusters.length, sample: g.nodes.slice(0, 2) }, label: "graph summary" });
                                })() })] })] })] }));
}
function ReplayPanel() {
    const [events] = useState(() => getMockEvents());
    const [replayLog, setReplayLog] = useState([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [controller] = useState(() => createReplayController(events, (event) => {
        setReplayLog(prev => [event, ...prev].slice(0, 100));
    }));
    const handlePlay = useCallback(() => {
        controller.play();
        setIsPlaying(true);
    }, [controller]);
    const handlePause = useCallback(() => {
        controller.pause();
        setIsPlaying(false);
    }, [controller]);
    const handleStop = useCallback(() => {
        controller.stop();
        setIsPlaying(false);
        setReplayLog([]);
    }, [controller]);
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Button, { variant: isPlaying ? 'danger' : 'primary', size: "sm", onClick: isPlaying ? handlePause : handlePlay, children: isPlaying ? '\u23F8 Pause' : '\u25B6 Play' }), _jsxs(Button, { variant: "secondary", size: "sm", onClick: handleStop, children: ['\u23F9', " Stop"] }), _jsx(Select, { label: "Speed", options: [
                            { value: '0.5', label: '0.5x' },
                            { value: '1', label: '1x' },
                            { value: '2', label: '2x' },
                            { value: '5', label: '5x' },
                        ], value: "1", onChange: (v) => controller.setSpeed(Number(v)) }), _jsx(Badge, { variant: isPlaying ? 'success' : 'default', children: isPlaying ? 'REPLAYING' : 'STOPPED' }), _jsxs("span", { className: "text-xs text-text-muted", children: [replayLog.length, " events replayed"] })] }), _jsx(ScrollArea, { maxHeight: "400px", children: replayLog.length === 0 ? (_jsx(EmptyState, { title: "No replay events", description: "Press Play to start replaying event history", icon: '\u23EF' })) : (_jsx("div", { className: "space-y-1", children: replayLog.map(e => (_jsxs("div", { className: "flex items-center gap-2 text-[11px] font-mono py-1 px-2 hover:bg-surface-raised rounded", children: [_jsx("span", { className: "text-text-muted w-20 shrink-0", children: new Date(e.timestamp).toLocaleTimeString() }), _jsx(Badge, { variant: e.severity === 'P0' ? 'danger' : e.severity === 'P1' ? 'warning' : 'default', className: "w-8 text-center", children: e.severity }), _jsx(Badge, { children: e.type }), _jsx("span", { className: "text-text-primary truncate", children: e.title })] }, e.id))) })) })] }));
}
function ApiInspector() {
    const [activeEndpoint, setActiveEndpoint] = useState('dashboard-summary');
    const endpoints = {
        'dashboard-summary': {
            method: 'GET',
            path: '/v1/analytics/dashboard/summary',
            description: 'Aggregated KPIs for the dashboard',
            sampleResponse: { sessionsLast24h: 14200, eventsLast24h: 2100000, uniqueUsersLast24h: 3847, topEvents: [{ name: 'page_view', count: 890000 }, { name: 'click', count: 412000 }] },
        },
        'events-query': {
            method: 'POST',
            path: '/v1/analytics/events/query',
            description: 'Query events with filters and pagination',
            sampleResponse: { data: getMockEvents().slice(0, 2), total: getMockEvents().length, offset: 0, limit: 50, hasMore: true },
        },
        'entity-detail': {
            method: 'GET',
            path: '/v1/identity/entities/:id',
            description: 'Full entity details with scores',
            sampleResponse: getMockEntities()[0],
        },
        'graph-neighborhood': {
            method: 'GET',
            path: '/v1/intelligence/graph/neighborhood/:id',
            description: 'Graph neighborhood for an entity',
            sampleResponse: getMockGraphData(),
        },
        'health-check': {
            method: 'GET',
            path: '/v1/diagnostics/health',
            description: 'System health and dependency status',
            sampleResponse: getMockHealthData(),
        },
        'review-batches': {
            method: 'GET',
            path: '/v1/analytics/review/batches',
            description: 'Pending review batches',
            sampleResponse: getMockReviewBatches().slice(0, 2),
        },
    };
    const ep = endpoints[activeEndpoint];
    return (_jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "flex items-center gap-3", children: _jsx(Select, { label: "Endpoint", options: Object.entries(endpoints).map(([k, v]) => ({ value: k, label: `${v.method} ${v.path}` })), value: activeEndpoint, onChange: setActiveEndpoint }) }), ep && (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Badge, { variant: ep.method === 'GET' ? 'success' : 'info', children: ep.method }), _jsx("code", { className: "text-xs font-mono text-text-primary", children: ep.path })] }), _jsx("div", { className: "text-xs text-text-secondary", children: ep.description }), _jsx(TerminalSeparator, { label: "Response Shape" }), _jsx(JsonViewer, { data: ep.sampleResponse, label: "response" })] }))] }));
}
function GraphQLInspector() {
    const queries = [
        { name: 'DashboardSummary', query: `query DashboardSummary($timeRange: TimeRange!) {\n  dashboard {\n    sessionsCount(timeRange: $timeRange)\n    eventsCount(timeRange: $timeRange)\n    uniqueUsers(timeRange: $timeRange)\n    topEvents(limit: 10) {\n      name\n      count\n    }\n  }\n}` },
        { name: 'EntityNeighborhood', query: `query EntityNeighborhood($id: ID!, $depth: Int = 2) {\n  entity(id: $id) {\n    id\n    type\n    trustScore\n    riskScore\n    neighborhood(depth: $depth) {\n      nodes { id type label trustScore riskScore }\n      edges { id source target type weight }\n    }\n  }\n}` },
        { name: 'LiveAlerts', query: `query LiveAlerts($severity: [Severity!], $limit: Int = 50) {\n  alerts(severity: $severity, limit: $limit) {\n    id\n    title\n    severity\n    timestamp\n    controller\n    entityId\n    traceId\n  }\n}` },
    ];
    return (_jsx("div", { className: "space-y-4", children: queries.map(q => (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: q.name }) }), _jsx(CardContent, { children: _jsx("pre", { className: "text-[11px] font-mono text-accent bg-surface-sunken p-3 rounded overflow-x-auto whitespace-pre", children: q.query }) })] }, q.name))) }));
}
function DataTransformInspector() {
    const rawEvent = getMockEvents()[0];
    if (!rawEvent)
        return _jsx(EmptyState, { title: "No events" });
    const normalized = {
        ...rawEvent,
        _normalized: true,
        _timestamp: new Date(rawEvent.timestamp).getTime(),
        _severityLevel: { P0: 0, P1: 1, P2: 2, P3: 3, info: 4 }[rawEvent.severity],
    };
    const graphApplied = {
        nodeId: rawEvent.entityId ?? 'N/A',
        edgeCreated: rawEvent.type === 'graph-mutation',
        overlayUpdate: rawEvent.type === 'anomaly' ? 'risk' : 'none',
        clusterAffected: rawEvent.metadata?.['clusterId'] ?? null,
    };
    return (_jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "text-xs text-text-secondary", children: "Inspect how a single event transforms through the pipeline" }), _jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsxs("div", { children: [_jsx(Badge, { variant: "warning", className: "mb-2", children: "RAW" }), _jsx(JsonViewer, { data: rawEvent, label: "raw event" })] }), _jsxs("div", { children: [_jsx(Badge, { variant: "info", className: "mb-2", children: "NORMALIZED" }), _jsx(JsonViewer, { data: normalized, label: "normalized event" })] }), _jsxs("div", { children: [_jsx(Badge, { variant: "success", className: "mb-2", children: "GRAPH-APPLIED" }), _jsx(JsonViewer, { data: graphApplied, label: "graph effects" })] })] })] }));
}
function ExportPanel() {
    const handleExport = useCallback((type) => {
        let data;
        switch (type) {
            case 'entities':
                data = getMockEntities();
                break;
            case 'events':
                data = getMockEvents();
                break;
            case 'graph':
                data = getMockGraphData();
                break;
            case 'controllers':
                data = getMockControllers();
                break;
            case 'health':
                data = getMockHealthData();
                break;
            case 'review':
                data = getMockReviewBatches();
                break;
            case 'mission':
                data = getMockMissionData();
                break;
            default: return;
        }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shiki-fixture-${type}-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, []);
    const types = ['entities', 'events', 'graph', 'controllers', 'health', 'review', 'mission'];
    return (_jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "text-xs text-text-secondary", children: "Export fixture data as JSON for local development and testing" }), _jsx("div", { className: "grid grid-cols-4 gap-2", children: types.map(t => (_jsxs(Button, { variant: "secondary", size: "sm", onClick: () => handleExport(t), children: ['\u2913', " ", t] }, t))) })] }));
}
export function LabPage() {
    const mode = getRuntimeMode();
    const environment = getEnvironment();
    return (_jsx(PageWrapper, { title: "Lab", subtitle: "Data inspection, replay, and simulation tools", actions: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Badge, { variant: mode === 'mocked' ? 'warning' : 'info', children: mode.toUpperCase() }), _jsx(Badge, { children: environment })] }), children: _jsxs(Tabs, { defaultValue: "scenarios", children: [_jsxs(TabsList, { children: [_jsx(TabsTrigger, { value: "scenarios", children: "Scenario Fixtures" }), _jsx(TabsTrigger, { value: "replay", children: "Replay" }), _jsx(TabsTrigger, { value: "rest", children: "REST Inspector" }), _jsx(TabsTrigger, { value: "graphql", children: "GraphQL Inspector" }), _jsx(TabsTrigger, { value: "transforms", children: "Data Transforms" }), _jsx(TabsTrigger, { value: "export", children: "Export" })] }), _jsx(TabsContent, { value: "scenarios", children: _jsx(ScenarioFixtures, {}) }), _jsx(TabsContent, { value: "replay", children: _jsx(ReplayPanel, {}) }), _jsx(TabsContent, { value: "rest", children: _jsx(ApiInspector, {}) }), _jsx(TabsContent, { value: "graphql", children: _jsx(GraphQLInspector, {}) }), _jsx(TabsContent, { value: "transforms", children: _jsx(DataTransformInspector, {}) }), _jsx(TabsContent, { value: "export", children: _jsx(ExportPanel, {}) })] }) }));
}
