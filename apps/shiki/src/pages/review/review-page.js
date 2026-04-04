import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge, SeverityBadge, Button, Tabs, TabsList, TabsTrigger, TabsContent, ScrollArea, TerminalSeparator, Modal, ModalHeader, ModalBody, ModalFooter, EmptyState, } from '@shiki/components/system';
import { PageWrapper } from '@shiki/components/layout';
import { cn, formatRelativeTime, formatTimestamp } from '@shiki/lib/utils';
import { useAuth } from '@shiki/features/auth';
import { usePermissions, PermissionGate } from '@shiki/features/permissions';
import { getMockReviewBatches, getMockAuditTrail } from '@shiki/fixtures/review';
// ─── Status styling ────────────────────────────────────────────────────────
const statusVariant = {
    pending: 'info',
    approved: 'success',
    rejected: 'danger',
    deferred: 'warning',
    reverted: 'accent',
};
const mutationClassLabels = {
    0: { label: 'Class 0 - Observe', variant: 'default' },
    1: { label: 'Class 1 - Annotate', variant: 'info' },
    2: { label: 'Class 2 - Enrich', variant: 'accent' },
    3: { label: 'Class 3 - Modify', variant: 'warning' },
    4: { label: 'Class 4 - Restructure', variant: 'danger' },
    5: { label: 'Class 5 - Override', variant: 'danger' },
};
// ─── Sub-components ────────────────────────────────────────────────────────
function JsonDiffPanel({ label, before, after }) {
    const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    return (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: label }) }), _jsx(CardContent, { children: _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx("div", { className: "text-xs font-mono text-text-muted mb-1", children: "Before" }), _jsx("div", { className: "text-xs font-mono text-text-muted mb-1", children: "After" }), allKeys.map(key => {
                            const bVal = JSON.stringify(before[key] ?? null);
                            const aVal = JSON.stringify(after[key] ?? null);
                            const changed = bVal !== aVal;
                            return (_jsxs("div", { className: "contents", children: [_jsxs("div", { className: cn('px-2 py-1 rounded text-xs font-mono border', changed ? 'border-danger/30 bg-danger/5 text-danger' : 'border-border-subtle text-text-secondary'), children: [_jsxs("span", { className: "text-text-muted", children: [key, ": "] }), bVal] }), _jsxs("div", { className: cn('px-2 py-1 rounded text-xs font-mono border', changed ? 'border-success/30 bg-success/5 text-success' : 'border-border-subtle text-text-secondary'), children: [_jsxs("span", { className: "text-text-muted", children: [key, ": "] }), aVal] })] }, key));
                        })] }) })] }));
}
function GraphDiffPanel({ diff }) {
    const hasChanges = diff.addedNodes.length > 0 ||
        diff.removedNodes.length > 0 ||
        diff.addedEdges.length > 0 ||
        diff.removedEdges.length > 0 ||
        diff.modifiedNodes.length > 0;
    if (!hasChanges)
        return null;
    return (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Graph Diff" }) }), _jsx(CardContent, { children: _jsxs("div", { className: "space-y-3 text-xs font-mono", children: [diff.addedNodes.length > 0 && (_jsxs("div", { children: [_jsx("div", { className: "text-success font-bold mb-1", children: "+ Added Nodes" }), diff.addedNodes.map(n => (_jsx("div", { className: "text-success pl-2", children: n }, n)))] })), diff.removedNodes.length > 0 && (_jsxs("div", { children: [_jsx("div", { className: "text-danger font-bold mb-1", children: "- Removed Nodes" }), diff.removedNodes.map(n => (_jsx("div", { className: "text-danger pl-2", children: n }, n)))] })), diff.addedEdges.length > 0 && (_jsxs("div", { children: [_jsx("div", { className: "text-success font-bold mb-1", children: "+ Added Edges" }), diff.addedEdges.map(e => (_jsx("div", { className: "text-success pl-2", children: e }, e)))] })), diff.removedEdges.length > 0 && (_jsxs("div", { children: [_jsx("div", { className: "text-danger font-bold mb-1", children: "- Removed Edges" }), diff.removedEdges.map(e => (_jsx("div", { className: "text-danger pl-2", children: e }, e)))] })), diff.modifiedNodes.length > 0 && (_jsxs("div", { children: [_jsx("div", { className: "text-warning font-bold mb-1", children: "~ Modified Nodes" }), diff.modifiedNodes.map(mn => (_jsxs("div", { className: "pl-2 text-warning", children: [_jsx("div", { children: mn.id }), Object.entries(mn.changes).map(([k, v]) => (_jsxs("div", { className: "pl-4 text-text-secondary", children: [k, ": ", String(v)] }, k)))] }, mn.id)))] }))] }) })] }));
}
function EvidencePanel({ evidence }) {
    if (evidence.length === 0)
        return null;
    return (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Evidence" }) }), _jsx(CardContent, { children: _jsx("ul", { className: "space-y-2", children: evidence.map((e, i) => (_jsxs("li", { className: "flex gap-2 text-xs", children: [_jsxs("span", { className: "text-accent font-mono shrink-0", children: ["[", i + 1, "]"] }), _jsx("span", { className: "text-text-primary", children: e })] }, i))) }) })] }));
}
function ConfidenceBar({ confidence }) {
    const pct = Math.round(confidence * 100);
    const color = pct >= 90 ? 'bg-success' : pct >= 70 ? 'bg-warning' : 'bg-danger';
    return (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "flex-1 h-2 bg-surface-raised rounded-full overflow-hidden", children: _jsx("div", { className: cn('h-full rounded-full', color), style: { width: `${pct}%` } }) }), _jsxs("span", { className: "text-xs font-mono font-bold text-text-primary", children: [pct, "%"] })] }));
}
function AttributionBlock({ attribution, label }) {
    return (_jsxs("div", { className: "text-xs border border-border-subtle rounded px-3 py-2 bg-surface-default", children: [_jsx("div", { className: "text-text-muted mb-1", children: label }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "font-mono text-text-primary font-bold", children: attribution.displayName }), _jsx(Badge, { children: attribution.role })] }), _jsx("div", { className: "text-text-secondary mt-0.5", children: formatTimestamp(attribution.timestamp) }), attribution.reason && (_jsxs("div", { className: "text-text-secondary mt-1 italic", children: ["\"", attribution.reason, "\""] }))] }));
}
function AuditTrailPanel({ entries }) {
    if (entries.length === 0) {
        return _jsx("div", { className: "text-xs text-text-muted text-center py-4", children: "No audit entries" });
    }
    return (_jsx("div", { className: "space-y-3", children: entries.map(entry => (_jsx("div", { className: "flex gap-3 text-xs border-l-2 border-border-default pl-3 py-1", children: _jsxs("div", { className: "flex-1", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "font-mono font-bold text-text-primary", children: entry.actor.displayName }), _jsx(Badge, { variant: statusVariant[entry.newStatus], children: entry.action })] }), _jsx("div", { className: "text-text-secondary mt-0.5", children: formatTimestamp(entry.timestamp) }), _jsxs("div", { className: "text-text-secondary mt-0.5", children: [_jsx("span", { className: "text-text-muted", children: "Status:" }), ' ', _jsx(Badge, { variant: statusVariant[entry.previousStatus], children: entry.previousStatus }), ' \u2192 ', _jsx(Badge, { variant: statusVariant[entry.newStatus], children: entry.newStatus })] }), entry.reason && (_jsxs("div", { className: "text-text-secondary mt-1 italic", children: ["\"", entry.reason, "\""] }))] }) }, entry.id))) }));
}
const actionConfig = {
    approve: { label: 'Approve', newStatus: 'approved', buttonVariant: 'primary' },
    reject: { label: 'Reject', newStatus: 'rejected', buttonVariant: 'danger' },
    defer: { label: 'Defer', newStatus: 'deferred', buttonVariant: 'secondary' },
    revert: { label: 'Revert', newStatus: 'reverted', buttonVariant: 'danger' },
};
// ─── Main Page Component ───────────────────────────────────────────────────
export function ReviewPage() {
    const { user } = useAuth();
    const permissions = usePermissions();
    const [batches, setBatches] = useState(() => [...getMockReviewBatches()]);
    const [auditTrail, setAuditTrail] = useState(() => [...getMockAuditTrail()]);
    const [selectedBatchId, setSelectedBatchId] = useState(null);
    const [selectedItemId, setSelectedItemId] = useState(null);
    const [actionModal, setActionModal] = useState({
        open: false,
        actionType: 'approve',
        itemId: '',
        batchId: '',
    });
    const [actionReason, setActionReason] = useState('');
    const selectedBatch = batches.find(b => b.id === selectedBatchId) ?? null;
    const selectedItem = selectedBatch?.items.find(i => i.id === selectedItemId) ?? null;
    const batchAuditEntries = useMemo(() => auditTrail.filter(a => a.batchId === selectedBatchId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [auditTrail, selectedBatchId]);
    const openActionModal = useCallback((actionType, itemId, batchId) => {
        setActionModal({ open: true, actionType, itemId, batchId });
        setActionReason('');
    }, []);
    const closeActionModal = useCallback(() => {
        setActionModal(prev => ({ ...prev, open: false }));
        setActionReason('');
    }, []);
    const executeAction = useCallback(() => {
        if (!actionReason.trim())
            return;
        const { actionType, itemId, batchId } = actionModal;
        const config = actionConfig[actionType];
        const now = new Date().toISOString();
        const attribution = {
            userId: user?.id ?? 'unknown',
            displayName: user?.displayName ?? 'Unknown User',
            email: user?.email ?? 'unknown@aether.internal',
            role: user?.role ?? 'shiki_observer',
            timestamp: now,
            environment: 'local-mocked',
            reason: actionReason,
            correlationId: `corr-${actionType}-${Date.now()}`,
        };
        // Update batch and item statuses
        setBatches(prev => prev.map(batch => {
            if (batch.id !== batchId)
                return batch;
            const updatedItems = batch.items.map(item => {
                if (item.id !== itemId)
                    return item;
                return {
                    ...item,
                    status: config.newStatus,
                    resolution: {
                        status: config.newStatus,
                        resolvedBy: attribution,
                        reason: actionReason,
                    },
                };
            });
            // Update batch status if all items have same status
            const allSame = updatedItems.every(i => i.status === config.newStatus);
            return {
                ...batch,
                items: updatedItems,
                status: allSame ? config.newStatus : batch.status,
            };
        }));
        // Find the current item to get previous status
        const currentItem = batches
            .find(b => b.id === batchId)
            ?.items.find(i => i.id === itemId);
        // Add audit entry
        const newAudit = {
            id: `audit-${Date.now()}`,
            action: actionType,
            timestamp: now,
            actor: attribution,
            itemId,
            batchId,
            previousStatus: currentItem?.status ?? 'pending',
            newStatus: config.newStatus,
            reason: actionReason,
        };
        setAuditTrail(prev => [newAudit, ...prev]);
        closeActionModal();
    }, [actionModal, actionReason, user, batches, closeActionModal]);
    return (_jsxs(PageWrapper, { title: "Review & Approval", subtitle: "Review proposed mutations, approve or reject changes, and audit action history", children: [_jsxs("div", { className: "grid grid-cols-12 gap-4", children: [_jsx("div", { className: "col-span-12 lg:col-span-4", children: _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Review Batches" }) }), _jsx(CardContent, { children: _jsx(ScrollArea, { maxHeight: "calc(100vh - 250px)", children: _jsx("div", { className: "space-y-2", children: batches.map(batch => (_jsxs("button", { onClick: () => {
                                                    setSelectedBatchId(batch.id);
                                                    setSelectedItemId(batch.items[0]?.id ?? null);
                                                }, className: cn('w-full text-left px-3 py-3 rounded border transition-colors', selectedBatchId === batch.id
                                                    ? 'border-accent bg-accent/10'
                                                    : 'border-border-subtle bg-surface-default hover:border-accent/30'), children: [_jsxs("div", { className: "flex items-center justify-between mb-1", children: [_jsx("span", { className: "text-sm font-mono font-bold text-text-primary truncate mr-2", children: batch.title }), _jsx(Badge, { variant: statusVariant[batch.status], children: batch.status })] }), _jsxs("div", { className: "text-xs text-text-secondary space-y-0.5", children: [_jsxs("div", { children: [batch.items.length, " item", batch.items.length !== 1 ? 's' : ''] }), _jsxs("div", { children: ["By: ", batch.submittedBy] }), _jsxs("div", { children: ["Controller: ", batch.controller] }), _jsx("div", { children: formatRelativeTime(batch.createdAt) })] })] }, batch.id))) }) }) })] }) }), _jsx("div", { className: "col-span-12 lg:col-span-8", children: !selectedBatch ? (_jsx(Card, { children: _jsx(CardContent, { children: _jsx(EmptyState, { title: "No Batch Selected", description: "Select a review batch from the list to view its items and take action." }) }) })) : (_jsxs("div", { className: "space-y-4", children: [_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { children: selectedBatch.title }), _jsx(Badge, { variant: statusVariant[selectedBatch.status], children: selectedBatch.status })] }) }) }), _jsxs(CardContent, { children: [_jsx("p", { className: "text-xs text-text-secondary mb-2", children: selectedBatch.description }), _jsxs("div", { className: "flex gap-4 text-xs text-text-muted", children: [_jsxs("span", { children: ["Submitted by: ", _jsx("span", { className: "text-text-primary", children: selectedBatch.submittedBy })] }), _jsxs("span", { children: ["Controller: ", _jsx("span", { className: "text-text-primary", children: selectedBatch.controller })] }), _jsxs("span", { children: ["Created: ", _jsx("span", { className: "text-text-primary", children: formatRelativeTime(selectedBatch.createdAt) })] })] })] })] }), _jsxs(Tabs, { defaultValue: selectedBatch.items[0]?.id ?? '', onChange: (val) => setSelectedItemId(val), children: [_jsxs(TabsList, { children: [selectedBatch.items.map((item, idx) => (_jsxs(TabsTrigger, { value: item.id, children: ["Item ", idx + 1] }, item.id))), _jsx(TabsTrigger, { value: "__audit__", children: "Audit Trail" })] }), selectedBatch.items.map(item => (_jsx(TabsContent, { value: item.id, children: _jsx(ScrollArea, { maxHeight: "calc(100vh - 400px)", children: _jsxs("div", { className: "space-y-4", children: [_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { children: item.title }), _jsx("div", { className: "flex items-center gap-2", children: _jsx(Badge, { variant: statusVariant[item.status], children: item.status }) })] }) }) }), _jsxs(CardContent, { children: [_jsx("p", { className: "text-xs text-text-secondary mb-3", children: item.description }), _jsxs("div", { className: "flex flex-wrap gap-3 text-xs", children: [_jsxs("div", { className: "flex items-center gap-1", children: [_jsx("span", { className: "text-text-muted", children: "Mutation:" }), _jsx(Badge, { variant: mutationClassLabels[item.mutationClass].variant, children: mutationClassLabels[item.mutationClass].label })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("span", { className: "text-text-muted", children: "Severity:" }), _jsx(SeverityBadge, { severity: item.severity })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("span", { className: "text-text-muted", children: "Reversible:" }), _jsx(Badge, { variant: item.reversible ? 'success' : 'danger', children: item.reversible ? 'Yes' : 'No' })] })] })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Confidence" }) }), _jsx(CardContent, { children: _jsx(ConfidenceBar, { confidence: item.confidence }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Rationale & Explanation" }) }), _jsx(CardContent, { children: _jsx("div", { className: "text-sm text-text-primary leading-relaxed bg-surface-raised rounded p-3 border border-border-subtle font-mono", children: item.rationale }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Downstream Impact" }) }), _jsx(CardContent, { children: _jsx("div", { className: "text-xs text-text-primary bg-warning/5 border border-warning/20 rounded p-3", children: item.downstreamImpact }) })] }), _jsx(JsonDiffPanel, { label: "Before / After Diff", before: item.before, after: item.after }), item.graphDiff && _jsx(GraphDiffPanel, { diff: item.graphDiff }), _jsx(EvidencePanel, { evidence: item.evidence }), item.resolution && (_jsx(AttributionBlock, { attribution: item.resolution.resolvedBy, label: "Resolved By" })), _jsx(TerminalSeparator, {}), _jsx(Card, { children: _jsx(CardContent, { children: _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx(PermissionGate, { requires: "canApprove", children: _jsx(Button, { variant: "primary", size: "sm", disabled: item.status === 'approved', onClick: () => openActionModal('approve', item.id, selectedBatch.id), className: "bg-success text-text-inverse hover:bg-success/80", children: "Approve" }) }), _jsx(PermissionGate, { requires: "canApprove", children: _jsx(Button, { variant: "danger", size: "sm", disabled: item.status === 'rejected', onClick: () => openActionModal('reject', item.id, selectedBatch.id), children: "Reject" }) }), permissions.role !== 'shiki_observer' && (_jsx(Button, { variant: "secondary", size: "sm", disabled: item.status === 'deferred', onClick: () => openActionModal('defer', item.id, selectedBatch.id), className: "border-warning/30 text-warning hover:bg-warning/10", children: "Defer" })), _jsx(PermissionGate, { requires: "canRevert", children: item.reversible && item.status === 'approved' && (_jsx(Button, { variant: "secondary", size: "sm", onClick: () => openActionModal('revert', item.id, selectedBatch.id), className: "border-accent/30 text-accent hover:bg-accent/10", children: "Revert" })) })] }) }) })] }) }) }, item.id))), _jsx(TabsContent, { value: "__audit__", children: _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Audit Trail" }) }), _jsx(CardContent, { children: _jsx(ScrollArea, { maxHeight: "calc(100vh - 400px)", children: _jsx(AuditTrailPanel, { entries: batchAuditEntries }) }) })] }) })] })] })) })] }), _jsxs(Modal, { open: actionModal.open, onClose: closeActionModal, children: [_jsx(ModalHeader, { children: _jsxs("h2", { className: "text-lg font-mono font-bold text-text-primary", children: [actionConfig[actionModal.actionType].label, " Confirmation"] }) }), _jsx(ModalBody, { children: _jsxs("div", { className: "space-y-4", children: [_jsxs("p", { className: "text-sm text-text-secondary", children: ["You are about to ", _jsx("strong", { className: "text-text-primary", children: actionModal.actionType }), " this review item. Please provide a reason for this action."] }), _jsxs("div", { children: [_jsx("label", { htmlFor: "action-reason", className: "block text-xs text-text-secondary mb-1 font-mono", children: "Reason (required)" }), _jsx("textarea", { id: "action-reason", value: actionReason, onChange: e => setActionReason(e.target.value), placeholder: "Enter your reason for this action...", rows: 3, className: "w-full bg-surface-default border border-border-default rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-border-focus font-mono resize-none" })] }), _jsxs("div", { className: "text-xs text-text-muted", children: ["Action by: ", _jsx("span", { className: "text-text-primary", children: user?.displayName ?? 'Unknown' }), " (", user?.role ?? 'unknown', ")"] })] }) }), _jsxs(ModalFooter, { children: [_jsx(Button, { variant: "ghost", size: "sm", onClick: closeActionModal, children: "Cancel" }), _jsx(Button, { variant: actionConfig[actionModal.actionType].buttonVariant, size: "sm", disabled: !actionReason.trim(), onClick: executeAction, children: actionConfig[actionModal.actionType].label })] })] })] }));
}
