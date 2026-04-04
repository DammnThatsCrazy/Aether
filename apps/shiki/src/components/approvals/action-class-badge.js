import { jsx as _jsx } from "react/jsx-runtime";
import { Badge } from '@shiki/components/system';
const CLASS_LABELS = {
    0: { label: 'C0 Read', variant: 'default' },
    1: { label: 'C1 Safe', variant: 'success' },
    2: { label: 'C2 Enrich', variant: 'info' },
    3: { label: 'C3 Ops', variant: 'warning' },
    4: { label: 'C4 Graph', variant: 'accent' },
    5: { label: 'C5 Critical', variant: 'danger' },
};
export function ActionClassBadge({ actionClass, className }) {
    const { label, variant } = CLASS_LABELS[actionClass];
    return _jsx(Badge, { variant: variant, className: className, children: label });
}
