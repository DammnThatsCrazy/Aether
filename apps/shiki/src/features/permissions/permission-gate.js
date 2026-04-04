import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
import { usePermissions } from './permissions';
export function PermissionGate({ children, requires, actionClass, fallback }) {
    const perms = usePermissions();
    if (requires && !perms[requires]) {
        return fallback ? _jsx(_Fragment, { children: fallback }) : null;
    }
    if (actionClass !== undefined) {
        const check = perms.checkAction(actionClass);
        if (!check.allowed) {
            return fallback ? _jsx(_Fragment, { children: fallback }) : null;
        }
    }
    return _jsx(_Fragment, { children: children });
}
