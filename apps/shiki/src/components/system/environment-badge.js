import { jsx as _jsx } from "react/jsx-runtime";
import { Badge } from './badge';
const envVariant = {
    'local-mocked': 'success',
    'local-live': 'info',
    staging: 'warning',
    production: 'danger',
};
const envLabel = {
    'local-mocked': 'LOCAL MOCK',
    'local-live': 'LOCAL LIVE',
    staging: 'STAGING',
    production: 'PRODUCTION',
};
export function EnvironmentBadge({ environment, className }) {
    return (_jsx(Badge, { variant: envVariant[environment], className: className, children: envLabel[environment] }));
}
