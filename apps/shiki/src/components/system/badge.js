import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
const variants = {
    default: 'bg-surface-raised text-text-secondary border-border-default',
    accent: 'bg-accent/20 text-accent border-accent/30',
    success: 'bg-success/20 text-success border-success/30',
    warning: 'bg-warning/20 text-warning border-warning/30',
    danger: 'bg-danger/20 text-danger border-danger/30',
    info: 'bg-info/20 text-info border-info/30',
};
export function Badge({ children, variant = 'default', className }) {
    return (_jsx("span", { className: cn('shiki-badge border', variants[variant], className), children: children }));
}
