import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
export function Toggle({ checked, pressed, onChange, onPressedChange, label, children, disabled, size, className }) {
    const isActive = pressed ?? checked ?? false;
    // If used as a pressable toggle button (with children)
    if (children !== undefined) {
        return (_jsx("button", { type: "button", role: "switch", "aria-checked": isActive, disabled: disabled, onClick: () => {
                onPressedChange?.();
                onChange?.(!isActive);
            }, className: cn('px-2 py-1 rounded text-xs font-mono border transition-colors', size === 'sm' && 'px-1.5 py-0.5 text-[10px]', isActive
                ? 'bg-accent/20 text-accent border-accent/30'
                : 'bg-surface-raised text-text-secondary border-border-subtle hover:text-text-primary', disabled && 'opacity-50 cursor-not-allowed', className), children: children }));
    }
    // Switch-style toggle
    return (_jsxs("label", { className: cn('inline-flex items-center gap-2 cursor-pointer', disabled && 'opacity-50 cursor-not-allowed', className), children: [_jsx("button", { role: "switch", "aria-checked": isActive, disabled: disabled, onClick: () => {
                    onChange?.(!isActive);
                    onPressedChange?.();
                }, className: cn('relative w-8 h-4 rounded-full transition-colors', isActive ? 'bg-accent' : 'bg-border-default'), children: _jsx("span", { className: cn('absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-text-primary transition-transform', isActive && 'translate-x-4') }) }), label && _jsx("span", { className: "text-xs text-text-secondary", children: label })] }));
}
