import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useAuth } from '@shiki/features/auth';
import { getEnvironment, getRuntimeMode } from '@shiki/lib/env';
import { EnvironmentBadge, Badge } from '@shiki/components/system';
import { useNotifications } from '@shiki/features/notifications';
export function TopBar() {
    const { user, logout } = useAuth();
    const { unreadCount } = useNotifications();
    const environment = getEnvironment();
    const mode = getRuntimeMode();
    return (_jsxs("header", { className: "flex items-center justify-between border-b border-border-default bg-surface-sunken px-4 py-2", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(EnvironmentBadge, { environment: environment }), _jsx(Badge, { variant: mode === 'mocked' ? 'warning' : 'info', children: mode.toUpperCase() })] }), _jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("button", { className: "relative text-text-secondary hover:text-text-primary transition-colors text-sm", "aria-label": `${unreadCount} unread notifications`, children: ['\u2709', unreadCount > 0 && (_jsx("span", { className: "absolute -top-1 -right-2 bg-danger text-text-inverse text-[9px] rounded-full w-4 h-4 flex items-center justify-center", children: unreadCount > 9 ? '9+' : unreadCount }))] }), user && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-xs text-text-secondary", children: user.displayName }), _jsx(Badge, { children: user.role.replace('shiki_', '').replace(/_/g, ' ') }), _jsx("button", { onClick: () => void logout(), className: "text-xs text-text-muted hover:text-text-primary transition-colors", "aria-label": "Sign out", children: "\\u2190" })] }))] })] }));
}
