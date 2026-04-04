import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Button } from '@shiki/components/system';
import { ApprovalModal } from './approval-modal';
import { PermissionGate } from '@shiki/features/permissions';
export function RevertButton({ itemTitle, reversible, onRevert, className }) {
    const [showModal, setShowModal] = useState(false);
    if (!reversible)
        return null;
    return (_jsxs(PermissionGate, { requires: "canRevert", children: [_jsx(Button, { variant: "danger", size: "sm", onClick: () => setShowModal(true), className: className, children: "Revert" }), _jsx(ApprovalModal, { open: showModal, onClose: () => setShowModal(false), onConfirm: (_status, reason, attribution) => onRevert(reason, attribution), action: "reverted", itemTitle: itemTitle })] }));
}
