import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useAuth } from './auth-context';
import { LoginPage } from './login-page';
export function RequireAuth({ children, fallback }) {
    const { isAuthenticated, isLoading } = useAuth();
    if (isLoading) {
        return (_jsx("div", { className: "flex h-screen items-center justify-center bg-surface-base", children: _jsxs("div", { className: "text-center", children: [_jsx("div", { className: "shiki-glyph text-2xl text-accent mb-2", children: "[ SHIKI ]" }), _jsx("div", { className: "text-text-secondary text-sm", children: "Authenticating..." })] }) }));
    }
    if (!isAuthenticated) {
        return fallback ? _jsx(_Fragment, { children: fallback }) : _jsx(LoginPage, {});
    }
    return _jsx(_Fragment, { children: children });
}
