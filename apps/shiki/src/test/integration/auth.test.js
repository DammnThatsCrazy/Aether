import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from '@shiki/features/auth';
import { ThemeProvider } from '@shiki/hooks/use-theme';
import { NotificationProvider } from '@shiki/features/notifications';
// In local-mocked mode (default VITE_SHIKI_ENV), mock auth auto-logs in
function TestConsumer() {
    const { isAuthenticated, user } = useAuth();
    return (_jsxs("div", { children: [_jsx("span", { "data-testid": "auth-status", children: isAuthenticated ? 'authenticated' : 'unauthenticated' }), user && _jsx("span", { "data-testid": "user-role", children: user.role }), user && _jsx("span", { "data-testid": "user-name", children: user.displayName })] }));
}
function renderWithProviders(ui) {
    return render(_jsx(ThemeProvider, { children: _jsx(AuthProvider, { children: _jsx(NotificationProvider, { children: ui }) }) }));
}
describe('Auth boot flow', () => {
    it('auto-authenticates in local-mocked mode', async () => {
        renderWithProviders(_jsx(TestConsumer, {}));
        // In local-mocked mode, auto-login happens in useEffect
        const status = await screen.findByTestId('auth-status');
        expect(status.textContent).toBe('authenticated');
    });
    it('assigns engineering command role by default in mock mode', async () => {
        renderWithProviders(_jsx(TestConsumer, {}));
        const role = await screen.findByTestId('user-role');
        expect(role.textContent).toBe('shiki_engineering_command');
    });
});
