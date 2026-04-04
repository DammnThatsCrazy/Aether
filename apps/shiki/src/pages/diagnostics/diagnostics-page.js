import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge, SeverityBadge, StatusIndicator, Tabs, TabsList, TabsTrigger, TabsContent, DataTable, GlyphIcon, TerminalSeparator, Toggle, ScrollArea, } from '@shiki/components/system';
import { PageWrapper } from '@shiki/components/layout';
import { cn, formatRelativeTime, formatTimestamp } from '@shiki/lib/utils';
import { usePermissions, PermissionGate } from '@shiki/features/permissions';
import { getMockSystemHealth } from '@shiki/fixtures/health';
const SEVERITY_ORDER = ['P0', 'P1', 'P2', 'P3', 'info'];
const circuitBreakerColor = {
    closed: 'text-success',
    open: 'text-danger',
    'half-open': 'text-warning',
};
const circuitBreakerBg = {
    closed: 'border-success/30',
    open: 'border-danger/30',
    'half-open': 'border-warning/30',
};
const depTypeIcon = {
    database: 'db',
    cache: 'cache',
    queue: 'queue',
    api: 'api',
    graph: 'graph',
    storage: 'storage',
    analytics: 'analytics',
};
function LagCard({ title, lag }) {
    const trendColor = lag.trend === 'improving' ? 'text-success' : lag.trend === 'degrading' ? 'text-danger' : 'text-text-secondary';
    const trendArrow = lag.trend === 'improving' ? '\u2193' : lag.trend === 'degrading' ? '\u2191' : '\u2194';
    return (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: title }) }), _jsxs(CardContent, { children: [_jsxs("div", { className: "grid grid-cols-3 gap-4 text-center", children: [_jsxs("div", { children: [_jsx("div", { className: "text-2xl font-mono font-bold text-text-primary", children: lag.currentMs }), _jsx("div", { className: "text-xs text-text-secondary", children: "Current (ms)" })] }), _jsxs("div", { children: [_jsx("div", { className: "text-2xl font-mono font-bold text-text-secondary", children: lag.avgMs }), _jsx("div", { className: "text-xs text-text-secondary", children: "Avg (ms)" })] }), _jsxs("div", { children: [_jsx("div", { className: "text-2xl font-mono font-bold text-text-secondary", children: lag.maxMs }), _jsx("div", { className: "text-xs text-text-secondary", children: "Max (ms)" })] })] }), _jsxs("div", { className: cn('text-center mt-3 text-sm font-mono', trendColor), children: [trendArrow, " ", lag.trend] })] })] }));
}
export function DiagnosticsPage() {
    const health = useMemo(() => getMockSystemHealth(), []);
    const { canDiagnose } = usePermissions();
    const [fingerprints, setFingerprints] = useState(() => [...health.errorFingerprints]);
    const handleToggleSuppress = (fp) => {
        setFingerprints(prev => prev.map(e => e.fingerprint === fp ? { ...e, suppressed: !e.suppressed } : e));
    };
    const fingerprintColumns = useMemo(() => [
        {
            key: 'fingerprint',
            header: 'Fingerprint',
            render: (row) => (_jsx("span", { className: "font-mono text-accent", children: row.fingerprint })),
        },
        {
            key: 'message',
            header: 'Message',
            render: (row) => (_jsx("span", { className: "text-text-primary max-w-xs truncate block", children: row.message })),
            className: 'max-w-xs',
        },
        {
            key: 'count',
            header: 'Count',
            render: (row) => (_jsx("span", { className: "font-mono font-bold", children: row.count })),
        },
        {
            key: 'severity',
            header: 'Severity',
            render: (row) => _jsx(SeverityBadge, { severity: row.severity }),
        },
        {
            key: 'firstSeen',
            header: 'First Seen',
            render: (row) => (_jsx("span", { className: "text-text-secondary", children: formatRelativeTime(row.firstSeen) })),
        },
        {
            key: 'lastSeen',
            header: 'Last Seen',
            render: (row) => (_jsx("span", { className: "text-text-secondary", children: formatRelativeTime(row.lastSeen) })),
        },
        {
            key: 'suppressed',
            header: 'Suppress',
            render: (row) => (_jsx(PermissionGate, { requires: "canDiagnose", fallback: _jsx("span", { className: cn('text-xs font-mono', row.suppressed ? 'text-warning' : 'text-text-muted'), children: row.suppressed ? 'suppressed' : '--' }), children: _jsx(Toggle, { checked: row.suppressed, onChange: () => handleToggleSuppress(row.fingerprint), label: row.suppressed ? 'Suppressed' : 'Active' }) })),
        },
    ], [canDiagnose]);
    const overallStatus = health.overall.status;
    return (_jsxs(PageWrapper, { title: "System Diagnostics", subtitle: "Infrastructure health, circuit breakers, error fingerprints, and environment validation", actions: _jsx(Badge, { variant: overallStatus === 'healthy' ? 'success' : overallStatus === 'degraded' ? 'warning' : 'danger', children: overallStatus.toUpperCase() }), children: [_jsx(Card, { children: _jsx(CardContent, { children: _jsxs("div", { className: "flex items-center gap-4 py-2", children: [_jsx(StatusIndicator, { status: overallStatus, size: "md" }), _jsxs("div", { children: [_jsx("div", { className: "text-lg font-mono font-bold text-text-primary capitalize", children: overallStatus }), health.overall.message && (_jsx("div", { className: "text-sm text-text-secondary", children: health.overall.message })), _jsxs("div", { className: "text-xs text-text-muted mt-1", children: ["Last checked: ", formatTimestamp(health.overall.lastChecked)] })] })] }) }) }), _jsxs(Tabs, { defaultValue: "dependencies", children: [_jsxs(TabsList, { children: [_jsx(TabsTrigger, { value: "dependencies", children: "Dependencies" }), _jsx(TabsTrigger, { value: "breakers", children: "Circuit Breakers" }), _jsx(TabsTrigger, { value: "errors", children: "Error Fingerprints" }), _jsx(TabsTrigger, { value: "metrics", children: "Lag Metrics" }), _jsx(TabsTrigger, { value: "adapters", children: "Adapters & Connectivity" }), _jsx(TabsTrigger, { value: "env", children: "Environment" })] }), _jsx(TabsContent, { value: "dependencies", children: _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3", children: health.dependencies.map((dep) => (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(GlyphIcon, { glyph: depTypeIcon[dep.type] ?? 'default', className: "text-text-muted" }), _jsx("span", { className: "font-mono", children: dep.name })] }), _jsx(StatusIndicator, { status: dep.status.status, size: "sm" })] }) }) }), _jsx(CardContent, { children: _jsxs("div", { className: "space-y-2 text-xs", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-text-secondary", children: "Type" }), _jsx(Badge, { children: dep.type })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-text-secondary", children: "Latency" }), _jsx("span", { className: cn('font-mono', dep.latencyMs < 0 ? 'text-danger' : dep.latencyMs > 30 ? 'text-warning' : 'text-success'), children: dep.latencyMs < 0 ? 'N/A' : `${dep.latencyMs}ms` })] }), dep.status.message && (_jsx("div", { className: "text-warning text-xs mt-1", children: dep.status.message })), dep.lastError && (_jsx("div", { className: "text-danger text-xs mt-1 break-all", children: dep.lastError }))] }) })] }, dep.name))) }) }), _jsx(TabsContent, { value: "breakers", children: _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3", children: health.circuitBreakers.map((cb) => (_jsxs(Card, { className: cn('border', circuitBreakerBg[cb.state]), children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "font-mono", children: cb.name }), _jsx("span", { className: cn('text-xs font-mono font-bold uppercase', circuitBreakerColor[cb.state]), children: cb.state })] }) }) }), _jsx(CardContent, { children: _jsxs("div", { className: "space-y-2 text-xs", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-text-secondary", children: "Failure Count" }), _jsx("span", { className: cn('font-mono', cb.failureCount > 0 ? 'text-danger font-bold' : 'text-text-muted'), children: cb.failureCount })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-text-secondary", children: "Last Failure" }), _jsx("span", { className: "text-text-secondary font-mono", children: cb.lastFailure ? formatRelativeTime(cb.lastFailure) : 'Never' })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-text-secondary", children: "Next Retry" }), _jsx("span", { className: "text-text-secondary font-mono", children: cb.nextRetry ? formatRelativeTime(cb.nextRetry) : 'N/A' })] })] }) })] }, cb.name))) }) }), _jsxs(TabsContent, { value: "errors", children: [_jsxs(Card, { className: "mb-4", children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Severity Distribution" }) }), _jsx(CardContent, { children: _jsx("div", { className: "flex items-end gap-4", children: SEVERITY_ORDER.map((sev) => {
                                                const count = health.severityDistribution[sev];
                                                const maxCount = Math.max(...Object.values(health.severityDistribution));
                                                const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                                                return (_jsxs("div", { className: "flex flex-col items-center gap-1 flex-1", children: [_jsx("span", { className: "text-xs font-mono font-bold text-text-primary", children: count }), _jsx("div", { className: "w-full bg-surface-raised rounded-t relative", style: { height: '80px' }, children: _jsx("div", { className: cn('absolute bottom-0 w-full rounded-t', sev === 'P0' ? 'bg-danger' : sev === 'P1' ? 'bg-warning' : sev === 'P2' ? 'bg-info' : sev === 'P3' ? 'bg-accent' : 'bg-text-muted'), style: { height: `${heightPct}%` } }) }), _jsx(SeverityBadge, { severity: sev })] }, sev));
                                            }) }) })] }), _jsx(TerminalSeparator, {}), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Error Fingerprints" }) }), _jsx(CardContent, { children: _jsx(ScrollArea, { maxHeight: "400px", children: _jsx(DataTable, { columns: fingerprintColumns, data: fingerprints, keyExtractor: (row) => row.fingerprint }) }) })] })] }), _jsx(TabsContent, { value: "metrics", children: _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsx(LagCard, { title: "Event Processing Lag", lag: health.eventLag }), _jsx(LagCard, { title: "Graph Synchronization Lag", lag: health.graphLag })] }) }), _jsx(TabsContent, { value: "adapters", children: _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Connectivity" }) }), _jsx(CardContent, { children: _jsx("div", { className: "space-y-3", children: health.adapterReadiness
                                                    .filter((a) => a.type !== 'mock')
                                                    .map((adapter) => (_jsxs("div", { className: "flex items-center justify-between py-2 border-b border-border-subtle last:border-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(StatusIndicator, { status: adapter.ready ? 'healthy' : 'unhealthy', size: "sm" }), _jsx("span", { className: "font-mono text-sm text-text-primary", children: adapter.name })] }), _jsx(Badge, { variant: adapter.ready ? 'success' : 'danger', children: adapter.ready ? 'Ready' : 'Not Ready' })] }, adapter.name))) }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Adapter Readiness" }) }), _jsx(CardContent, { children: _jsx("div", { className: "space-y-3", children: health.adapterReadiness.map((adapter) => (_jsxs("div", { className: "flex items-center justify-between py-2 border-b border-border-subtle last:border-0", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(StatusIndicator, { status: adapter.ready ? 'healthy' : 'unhealthy', size: "sm" }), _jsx("span", { className: "font-mono text-sm text-text-primary", children: adapter.name })] }), _jsxs("div", { className: "text-xs text-text-muted ml-5", children: ["Type: ", adapter.type, " | Checked: ", formatRelativeTime(adapter.lastCheck)] })] }), _jsx(Badge, { variant: adapter.ready ? 'success' : 'danger', children: adapter.ready ? 'Ready' : 'Error' })] }, adapter.name))) }) })] })] }) }), _jsx(TabsContent, { value: "env", children: _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Environment Variables" }) }), _jsx(CardContent, { children: _jsx(ScrollArea, { maxHeight: "500px", children: _jsx("div", { className: "space-y-2", children: health.environmentValidation.map((env) => (_jsxs("div", { className: cn('flex items-center justify-between py-2 px-3 rounded border', env.valid
                                                    ? 'border-border-subtle bg-surface-default'
                                                    : env.required
                                                        ? 'border-danger/30 bg-danger/5'
                                                        : 'border-warning/30 bg-warning/5'), children: [_jsxs("div", { className: "flex-1", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "font-mono text-sm text-text-primary", children: env.variable }), env.required && _jsx(Badge, { variant: "warning", children: "required" })] }), env.message && (_jsx("div", { className: "text-xs text-text-muted mt-0.5", children: env.message }))] }), _jsxs("div", { className: "flex items-center gap-3 text-xs", children: [_jsx("span", { className: cn('font-mono', env.present ? 'text-success' : 'text-danger'), children: env.present ? 'present' : 'missing' }), _jsx("span", { className: cn('font-mono', env.valid ? 'text-success' : 'text-danger'), children: env.valid ? 'valid' : 'invalid' })] })] }, env.variable))) }) }) })] }) })] })] }));
}
