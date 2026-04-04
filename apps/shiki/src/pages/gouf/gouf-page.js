import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, ScrollArea, DataTable, EmptyState, } from '@shiki/components/system';
import { PageWrapper } from '@shiki/components/layout';
import { cn } from '@shiki/lib/utils';
import { GraphCanvas } from '@shiki/components/graph/graph-canvas';
import { GraphInspector } from '@shiki/components/graph/graph-inspector';
import { GraphToolbar } from '@shiki/components/graph/graph-toolbar';
import { GraphControls } from '@shiki/components/graph/graph-controls';
import { getMockGraphData } from '@shiki/fixtures/graph';
// ---------------------------------------------------------------------------
// Edge layer classification
// ---------------------------------------------------------------------------
const HUMAN_TYPES = new Set(['customer', 'wallet', 'protocol', 'contract', 'cluster', 'external']);
const AGENT_TYPES = new Set(['agent']);
function classifyEdgeLayer(edge, nodeMap) {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (!src || !tgt)
        return null;
    const srcHuman = HUMAN_TYPES.has(src.type);
    const srcAgent = AGENT_TYPES.has(src.type);
    const tgtHuman = HUMAN_TYPES.has(tgt.type);
    const tgtAgent = AGENT_TYPES.has(tgt.type);
    if (srcHuman && tgtHuman)
        return 'h2h';
    if (srcHuman && tgtAgent)
        return 'h2a';
    if (srcAgent && tgtHuman)
        return 'a2h';
    if (srcAgent && tgtAgent)
        return 'a2a';
    return 'h2h';
}
// ---------------------------------------------------------------------------
// BFS shortest path
// ---------------------------------------------------------------------------
function bfsShortestPath(startId, endId, edges) {
    if (startId === endId)
        return { nodeIds: [startId], edgeIds: [] };
    const adj = new Map();
    for (const e of edges) {
        if (!adj.has(e.source))
            adj.set(e.source, []);
        if (!adj.has(e.target))
            adj.set(e.target, []);
        adj.get(e.source).push({ neighborId: e.target, edgeId: e.id });
        adj.get(e.target).push({ neighborId: e.source, edgeId: e.id });
    }
    const visited = new Set([startId]);
    const queue = [
        { nodeId: startId, pathNodes: [startId], pathEdges: [] },
    ];
    while (queue.length > 0) {
        const current = queue.shift();
        const neighbors = adj.get(current.nodeId) ?? [];
        for (const { neighborId, edgeId } of neighbors) {
            if (visited.has(neighborId))
                continue;
            const newPathNodes = [...current.pathNodes, neighborId];
            const newPathEdges = [...current.pathEdges, edgeId];
            if (neighborId === endId) {
                return { nodeIds: newPathNodes, edgeIds: newPathEdges };
            }
            visited.add(neighborId);
            queue.push({ nodeId: neighborId, pathNodes: newPathNodes, pathEdges: newPathEdges });
        }
    }
    return null;
}
// ---------------------------------------------------------------------------
// Time window helpers
// ---------------------------------------------------------------------------
function timeWindowMs(window) {
    switch (window) {
        case '1h': return 60 * 60 * 1000;
        case '6h': return 6 * 60 * 60 * 1000;
        case '24h': return 24 * 60 * 60 * 1000;
        case '7d': return 7 * 24 * 60 * 60 * 1000;
        case '30d': return 30 * 24 * 60 * 60 * 1000;
        default: return 30 * 24 * 60 * 60 * 1000;
    }
}
// ---------------------------------------------------------------------------
// Node table columns
// ---------------------------------------------------------------------------
const NODE_TABLE_COLUMNS = [
    {
        key: 'label',
        header: 'Label',
        render: (row) => _jsx("span", { className: "font-mono text-text-primary", children: row.label }),
    },
    {
        key: 'type',
        header: 'Type',
        render: (row) => _jsx(Badge, { children: row.type }),
    },
    {
        key: 'trustScore',
        header: 'Trust',
        render: (row) => (_jsx("span", { className: cn('font-mono', (row.trustScore ?? 0) < 0.5 ? 'text-danger' : 'text-success'), children: row.trustScore?.toFixed(2) ?? '--' })),
    },
    {
        key: 'riskScore',
        header: 'Risk',
        render: (row) => (_jsx("span", { className: cn('font-mono', (row.riskScore ?? 0) > 0.5 ? 'text-danger' : 'text-success'), children: row.riskScore?.toFixed(2) ?? '--' })),
    },
    {
        key: 'anomalyScore',
        header: 'Anomaly',
        render: (row) => (_jsx("span", { className: cn('font-mono', (row.anomalyScore ?? 0) > 0.5 ? 'text-warning' : 'text-text-secondary'), children: row.anomalyScore?.toFixed(2) ?? '--' })),
    },
    {
        key: 'id',
        header: 'ID',
        render: (row) => _jsx("span", { className: "font-mono text-text-muted text-xs truncate max-w-[120px] block", children: row.id }),
    },
];
// ---------------------------------------------------------------------------
// GOUF Page
// ---------------------------------------------------------------------------
export function GoufPage() {
    // ---- Source data ----
    const rawData = useMemo(() => getMockGraphData(), []);
    // ---- Graph state ----
    const [activeLayer, setActiveLayer] = useState('all');
    const [visibleEntityTypes, setVisibleEntityTypes] = useState([
        'customer', 'wallet', 'agent', 'protocol', 'contract', 'cluster',
    ]);
    const [activeOverlay, setActiveOverlay] = useState('none');
    const [timeWindow, setTimeWindow] = useState('30d');
    const [viewMode, setViewMode] = useState('graph');
    // ---- Selection state ----
    const [inspectorData, setInspectorData] = useState(null);
    // ---- Path mode ----
    const [pathMode, setPathMode] = useState(false);
    const [pathSource, setPathSource] = useState(null);
    const [pathResult, setPathResult] = useState(null);
    // ---- Replay state ----
    const [isPlaying, setIsPlaying] = useState(false);
    const [replaySpeed, setReplaySpeed] = useState('1');
    const [replayProgress, setReplayProgress] = useState(0);
    const replayIntervalRef = useRef(null);
    // ---- Node map ----
    const nodeMap = useMemo(() => {
        const map = new Map();
        for (const n of rawData.nodes)
            map.set(n.id, n);
        return map;
    }, [rawData.nodes]);
    // ---- Filter nodes by visible entity types (external is always shown if any type shown) ----
    const filteredNodes = useMemo(() => {
        return rawData.nodes.filter((n) => {
            if (n.type === 'external')
                return true;
            return visibleEntityTypes.includes(n.type);
        });
    }, [rawData.nodes, visibleEntityTypes]);
    // ---- Filter edges by layer and visible nodes ----
    const filteredEdges = useMemo(() => {
        const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));
        return rawData.edges.filter((e) => {
            if (!visibleNodeIds.has(e.source) || !visibleNodeIds.has(e.target))
                return false;
            if (activeLayer === 'all')
                return true;
            const layer = classifyEdgeLayer(e, nodeMap);
            return layer === activeLayer;
        });
    }, [rawData.edges, filteredNodes, activeLayer, nodeMap]);
    // ---- Highlighted nodes (neighborhood of selected) ----
    const highlightedNodeIds = useMemo(() => {
        if (!inspectorData || inspectorData.type !== 'node')
            return undefined;
        const nodeId = inspectorData.data.id;
        const ids = new Set([nodeId]);
        for (const e of rawData.edges) {
            if (e.source === nodeId)
                ids.add(e.target);
            if (e.target === nodeId)
                ids.add(e.source);
        }
        return Array.from(ids);
    }, [inspectorData, rawData.edges]);
    // ---- Cluster highlighting ----
    const [highlightedClusterIds, setHighlightedClusterIds] = useState(null);
    const effectiveHighlightIds = useMemo(() => {
        if (highlightedClusterIds)
            return highlightedClusterIds;
        return highlightedNodeIds;
    }, [highlightedClusterIds, highlightedNodeIds]);
    // ---- Get neighbors for a node ----
    const getNeighbors = useCallback((nodeId) => {
        const neighborIds = new Set();
        for (const e of rawData.edges) {
            if (e.source === nodeId)
                neighborIds.add(e.target);
            if (e.target === nodeId)
                neighborIds.add(e.source);
        }
        return rawData.nodes.filter((n) => neighborIds.has(n.id));
    }, [rawData]);
    // ---- Handle node selection ----
    const handleSelectNode = useCallback((node) => {
        if (!node) {
            if (!pathMode) {
                setInspectorData(null);
                setHighlightedClusterIds(null);
            }
            return;
        }
        // Path mode: collect two nodes and compute shortest path
        if (pathMode) {
            if (!pathSource) {
                setPathSource(node.id);
                setPathResult(null);
                return;
            }
            // Second node selected
            const result = bfsShortestPath(pathSource, node.id, rawData.edges);
            setPathResult(result);
            setPathSource(null);
            if (result) {
                setInspectorData({
                    type: 'node',
                    data: node,
                    neighbors: getNeighbors(node.id),
                    paths: [result.nodeIds],
                });
            }
            return;
        }
        // Normal mode
        setHighlightedClusterIds(null);
        setInspectorData({
            type: 'node',
            data: node,
            neighbors: getNeighbors(node.id),
        });
    }, [pathMode, pathSource, rawData.edges, getNeighbors]);
    // ---- Handle edge selection ----
    const handleSelectEdge = useCallback((edge) => {
        if (!edge) {
            setInspectorData(null);
            return;
        }
        setHighlightedClusterIds(null);
        setInspectorData({ type: 'edge', data: edge });
    }, []);
    // ---- Handle cluster click from sidebar ----
    const handleClusterClick = useCallback((cluster) => {
        setHighlightedClusterIds([...cluster.nodeIds]);
        setInspectorData({ type: 'cluster', data: cluster });
    }, []);
    // ---- Toggle entity type ----
    const handleToggleEntityType = useCallback((type) => {
        setVisibleEntityTypes((prev) => {
            if (prev.includes(type)) {
                return prev.filter((t) => t !== type);
            }
            return [...prev, type];
        });
    }, []);
    // ---- Close inspector ----
    const handleCloseInspector = useCallback(() => {
        setInspectorData(null);
        setHighlightedClusterIds(null);
        setPathResult(null);
        setPathSource(null);
    }, []);
    // ---- Toggle path mode ----
    const handlePathModeChange = useCallback((enabled) => {
        setPathMode(enabled);
        if (!enabled) {
            setPathSource(null);
            setPathResult(null);
        }
    }, []);
    // ---- Replay controls ----
    const handlePlay = useCallback(() => {
        setIsPlaying(true);
        if (replayIntervalRef.current)
            clearInterval(replayIntervalRef.current);
        const speedMultiplier = parseFloat(replaySpeed);
        const interval = 100 / speedMultiplier;
        replayIntervalRef.current = setInterval(() => {
            setReplayProgress((prev) => {
                if (prev >= 100) {
                    if (replayIntervalRef.current)
                        clearInterval(replayIntervalRef.current);
                    setIsPlaying(false);
                    return 100;
                }
                return prev + 1;
            });
        }, interval);
    }, [replaySpeed]);
    const handlePause = useCallback(() => {
        setIsPlaying(false);
        if (replayIntervalRef.current) {
            clearInterval(replayIntervalRef.current);
            replayIntervalRef.current = null;
        }
    }, []);
    const handleStop = useCallback(() => {
        setIsPlaying(false);
        setReplayProgress(0);
        if (replayIntervalRef.current) {
            clearInterval(replayIntervalRef.current);
            replayIntervalRef.current = null;
        }
    }, []);
    // Cleanup replay interval on unmount
    useEffect(() => {
        return () => {
            if (replayIntervalRef.current)
                clearInterval(replayIntervalRef.current);
        };
    }, []);
    // Compute replay timestamp
    const replayTimestamp = useMemo(() => {
        const windowMs = timeWindowMs(timeWindow);
        const now = Date.now();
        const start = now - windowMs;
        const ts = new Date(start + (replayProgress / 100) * windowMs);
        return ts.toISOString();
    }, [replayProgress, timeWindow]);
    return (_jsxs(PageWrapper, { title: "GOUF", subtitle: "Graph intelligence workspace -- topology, overlays, path exploration, and replay", actions: _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs(Badge, { variant: viewMode === 'graph' ? 'accent' : 'default', children: [filteredNodes.length, " nodes"] }), _jsxs(Badge, { variant: "default", children: [filteredEdges.length, " edges"] }), _jsx(Button, { variant: viewMode === 'graph' ? 'primary' : 'secondary', size: "sm", onClick: () => setViewMode('graph'), children: "Graph" }), _jsx(Button, { variant: viewMode === 'table' ? 'primary' : 'secondary', size: "sm", onClick: () => setViewMode('table'), children: "Table" })] }), children: [_jsx(GraphToolbar, { activeLayer: activeLayer, onLayerChange: setActiveLayer, visibleEntityTypes: visibleEntityTypes, onToggleEntityType: handleToggleEntityType, activeOverlay: activeOverlay, onOverlayChange: setActiveOverlay, timeWindow: timeWindow, onTimeWindowChange: setTimeWindow, pathMode: pathMode, onPathModeChange: handlePathModeChange }), _jsxs("div", { className: "flex gap-3", style: { minHeight: '600px' }, children: [_jsxs("div", { className: "flex-1 flex flex-col gap-3 min-w-0", children: [viewMode === 'graph' ? (_jsxs(_Fragment, { children: [pathMode && (_jsxs("div", { className: "flex items-center gap-2 px-3 py-2 rounded bg-accent/10 border border-accent/30 text-xs text-accent", children: [pathSource
                                                ? _jsxs("span", { children: ["Source selected: ", _jsx("span", { className: "font-mono font-bold", children: pathSource }), ". Click a second node to find the shortest path."] })
                                                : _jsx("span", { children: "Click a node to set the path source." }), pathResult === null && pathSource === null && !pathMode ? null : null] })), _jsx(GraphCanvas, { nodes: filteredNodes, edges: filteredEdges, overlay: activeOverlay, highlightedNodeIds: effectiveHighlightIds, pathNodeIds: pathResult?.nodeIds, pathEdgeIds: pathResult?.edgeIds, onSelectNode: handleSelectNode, onSelectEdge: handleSelectEdge, className: "flex-1" })] })) : (_jsxs(Card, { className: "flex-1", children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Node List" }) }), _jsx(CardContent, { children: _jsx(ScrollArea, { maxHeight: "520px", children: _jsx(DataTable, { columns: NODE_TABLE_COLUMNS, data: filteredNodes, keyExtractor: (row) => row.id }) }) })] })), _jsx(GraphControls, { isPlaying: isPlaying, onPlay: handlePlay, onPause: handlePause, onStop: handleStop, speed: replaySpeed, onSpeedChange: setReplaySpeed, currentTime: replayProgress, minTime: 0, maxTime: 100, onScrub: setReplayProgress, currentTimestamp: replayTimestamp }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Clusters" }) }), _jsx(CardContent, { children: rawData.clusters.length === 0 ? (_jsx(EmptyState, { title: "No clusters detected" })) : (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-2", children: rawData.clusters.map((cluster) => (_jsxs("button", { onClick: () => handleClusterClick(cluster), className: cn('text-left p-3 rounded border transition-colors', highlightedClusterIds && inspectorData?.type === 'cluster' && inspectorData.data.id === cluster.id
                                                    ? 'border-accent bg-accent/10'
                                                    : 'border-border-subtle bg-surface-default hover:border-accent/40'), children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("span", { className: "text-sm font-mono text-text-primary", children: cluster.label }), _jsxs(Badge, { variant: cluster.anomalyCount > 0 ? 'danger' : 'success', children: [cluster.size, " nodes"] })] }), _jsxs("div", { className: "grid grid-cols-3 gap-2 text-xs", children: [_jsxs("div", { children: [_jsx("span", { className: "text-text-muted", children: "Trust" }), _jsx("div", { className: cn('font-mono font-bold', cluster.avgTrustScore < 0.5 ? 'text-danger' : 'text-success'), children: cluster.avgTrustScore.toFixed(2) })] }), _jsxs("div", { children: [_jsx("span", { className: "text-text-muted", children: "Risk" }), _jsx("div", { className: cn('font-mono font-bold', cluster.avgRiskScore > 0.5 ? 'text-danger' : 'text-success'), children: cluster.avgRiskScore.toFixed(2) })] }), _jsxs("div", { children: [_jsx("span", { className: "text-text-muted", children: "Anomalies" }), _jsx("div", { className: cn('font-mono font-bold', cluster.anomalyCount > 0 ? 'text-danger' : 'text-text-primary'), children: cluster.anomalyCount })] })] })] }, cluster.id))) })) })] })] }), inspectorData && (_jsx(GraphInspector, { data: inspectorData, onClose: handleCloseInspector }))] })] }));
}
