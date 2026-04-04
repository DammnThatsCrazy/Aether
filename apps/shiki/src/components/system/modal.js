import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { cn } from '@shiki/lib/utils';
export function Modal({ open, onClose, children, className }) {
    const dialogRef = useRef(null);
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog)
            return;
        if (open && !dialog.open)
            dialog.showModal();
        else if (!open && dialog.open)
            dialog.close();
    }, [open]);
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog)
            return;
        const handler = () => onClose();
        dialog.addEventListener('close', handler);
        return () => dialog.removeEventListener('close', handler);
    }, [onClose]);
    return (_jsx("dialog", { ref: dialogRef, className: cn('backdrop:bg-black/60 bg-surface-overlay border border-border-default rounded-lg p-0 max-w-2xl w-full text-text-primary', className), onClick: (e) => { if (e.target === dialogRef.current)
            onClose(); }, onKeyDown: (e) => { if (e.key === 'Escape')
            onClose(); }, children: open && children }));
}
export function ModalHeader({ children, className }) {
    return _jsx("div", { className: cn('px-6 py-4 border-b border-border-default', className), children: children });
}
export function ModalBody({ children, className }) {
    return _jsx("div", { className: cn('px-6 py-4', className), children: children });
}
export function ModalFooter({ children, className }) {
    return _jsx("div", { className: cn('px-6 py-4 border-t border-border-default flex justify-end gap-2', className), children: children });
}
