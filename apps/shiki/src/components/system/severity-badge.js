import { jsx as _jsx } from "react/jsx-runtime";
import { Badge } from './badge';
const severityVariantMap = {
    P0: 'danger',
    P1: 'warning',
    P2: 'info',
    P3: 'accent',
    info: 'default',
};
export function SeverityBadge({ severity, className }) {
    return (_jsx(Badge, { variant: severityVariantMap[severity], className: className, children: severity }));
}
