import { jsx as _jsx } from "react/jsx-runtime";
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@shiki/features/auth';
import { NotificationProvider } from '@shiki/features/notifications';
import { ThemeProvider } from '@shiki/hooks/use-theme';
import { ErrorBoundary } from './error-boundary';
export function Providers({ children }) {
    return (_jsx(ErrorBoundary, { children: _jsx(BrowserRouter, { children: _jsx(ThemeProvider, { children: _jsx(AuthProvider, { children: _jsx(NotificationProvider, { children: children }) }) }) }) }));
}
