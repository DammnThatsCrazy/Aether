import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter, Button } from '@shiki/components/system';
import { useAuth } from '@shiki/features/auth';
import { getEnvironment } from '@shiki/lib/env';
export function ApprovalModal({ open, onClose, onConfirm, action, itemTitle }) {
    const [reason, setReason] = useState('');
    const { user } = useAuth();
    const actionLabels = {
        approved: { label: 'Approve', variant: 'text-success' },
        rejected: { label: 'Reject', variant: 'text-danger' },
        deferred: { label: 'Defer', variant: 'text-warning' },
        reverted: { label: 'Revert', variant: 'text-warning' },
    };
    const { label, variant } = actionLabels[action] ?? { label: action, variant: 'text-text-primary' };
    function handleConfirm() {
        if (!reason.trim() || !user)
            return;
        const attribution = {
            userId: user.id,
            displayName: user.displayName,
            email: user.email,
            role: user.role,
            timestamp: new Date().toISOString(),
            environment: getEnvironment(),
            reason: reason.trim(),
            correlationId: `action-${Date.now()}`,
        };
        onConfirm(action, reason.trim(), attribution);
        setReason('');
        onClose();
    }
    return (_jsxs(Modal, { open: open, onClose: onClose, children: [_jsx(ModalHeader, { children: _jsxs("div", { className: "text-sm font-medium", children: [_jsx("span", { className: variant, children: label }), ": ", itemTitle] }) }), _jsx(ModalBody, { children: _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "text-xs text-text-secondary", children: ["Acting as: ", _jsx("span", { className: "text-text-primary", children: user?.displayName }), " (", user?.role.replace('shiki_', ''), ")"] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs text-text-secondary block mb-1", children: "Reason (required)" }), _jsx("textarea", { value: reason, onChange: e => setReason(e.target.value), className: "w-full bg-surface-raised text-text-primary border border-border-default rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-border-focus min-h-[80px]", placeholder: "Explain your decision..." })] })] }) }), _jsxs(ModalFooter, { children: [_jsx(Button, { variant: "ghost", size: "sm", onClick: onClose, children: "Cancel" }), _jsx(Button, { variant: action === 'approved' ? 'primary' : action === 'rejected' ? 'danger' : 'secondary', size: "sm", onClick: handleConfirm, disabled: !reason.trim(), children: label })] })] }));
}
