import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useAuth } from './auth-context';
import { isMockAuthAllowed } from '@shiki/lib/env';
const MOCK_ROLES = [
    { role: 'shiki_executive_operator', label: 'Executive Operator', description: 'Broad read, approvals, interventions' },
    { role: 'shiki_engineering_command', label: 'Engineering Command', description: 'Full diagnostics, agent command, rollback' },
    { role: 'shiki_specialist_operator', label: 'Specialist Operator', description: 'Notes, assignments, limited approvals' },
    { role: 'shiki_observer', label: 'Observer', description: 'Read-only access' },
];
export function LoginPage() {
    const { login, switchMockUser, error } = useAuth();
    return (_jsx("div", { className: "flex h-screen items-center justify-center bg-surface-base", children: _jsxs("div", { className: "w-full max-w-md space-y-6 p-8", children: [_jsxs("div", { className: "text-center", children: [_jsx("div", { className: "font-mono text-3xl font-bold text-text-primary mb-1", children: "SHIKI" }), _jsx("div", { className: "text-text-secondary text-sm", children: "Aether Command Surface" })] }), error && (_jsx("div", { className: "shiki-card border-danger/50 text-danger text-sm", children: error })), isMockAuthAllowed() ? (_jsxs("div", { className: "space-y-3", children: [_jsx("div", { className: "text-text-secondary text-xs uppercase tracking-wider", children: "Select Role (Local Mode)" }), MOCK_ROLES.map(({ role, label, description }) => (_jsxs("button", { onClick: () => switchMockUser(role), className: "w-full text-left shiki-card hover:border-accent/50 transition-colors cursor-pointer", children: [_jsx("div", { className: "font-medium text-text-primary", children: label }), _jsx("div", { className: "text-text-secondary text-xs mt-1", children: description })] }, role)))] })) : (_jsx("button", { onClick: () => void login(), className: "w-full rounded-md bg-accent px-4 py-3 text-text-inverse font-medium hover:bg-accent-hover transition-colors", children: "Sign in with SSO" }))] }) }));
}
