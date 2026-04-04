import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useCallback, useReducer, useEffect } from 'react';
import { isMockAuthAllowed, isLocalMocked } from '@shiki/lib/env';
import { MOCK_USERS } from '@shiki/fixtures/auth';
function authReducer(state, action) {
    switch (action.type) {
        case 'AUTH_START':
            return { ...state, isLoading: true, error: null };
        case 'AUTH_SUCCESS':
            return { isAuthenticated: true, user: action.user, isLoading: false, error: null };
        case 'AUTH_FAILURE':
            return { isAuthenticated: false, user: null, isLoading: false, error: action.error };
        case 'AUTH_LOGOUT':
            return { isAuthenticated: false, user: null, isLoading: false, error: null };
        case 'MOCK_LOGIN':
            return { isAuthenticated: true, user: action.user, isLoading: false, error: null };
    }
}
const AuthContext = createContext(null);
// Token storage (in-memory only, never persisted to localStorage in production)
let currentTokens = null;
export function getAccessToken() {
    return currentTokens?.accessToken ?? null;
}
function generatePKCEVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}
async function generatePKCEChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}
function mapClaimsToRole(groups) {
    if (groups.includes('shiki_executive_operator') || groups.includes('executive')) {
        return 'shiki_executive_operator';
    }
    if (groups.includes('shiki_engineering_command') || groups.includes('engineering')) {
        return 'shiki_engineering_command';
    }
    if (groups.includes('shiki_specialist_operator') || groups.includes('specialist')) {
        return 'shiki_specialist_operator';
    }
    return 'shiki_observer';
}
export function AuthProvider({ children }) {
    const [state, dispatch] = useReducer(authReducer, {
        isAuthenticated: false,
        user: null,
        isLoading: true,
        error: null,
    });
    useEffect(() => {
        // Auto-login in local mocked mode
        if (isLocalMocked()) {
            const defaultUser = MOCK_USERS.shiki_engineering_command;
            dispatch({ type: 'MOCK_LOGIN', user: defaultUser });
            return;
        }
        // Check for OIDC callback
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (code) {
            handleOIDCCallback(code).catch(err => {
                dispatch({ type: 'AUTH_FAILURE', error: String(err) });
            });
        }
        else {
            // Check existing session
            checkSession();
        }
    }, []);
    async function handleOIDCCallback(code) {
        dispatch({ type: 'AUTH_START' });
        try {
            const verifier = sessionStorage.getItem('shiki_pkce_verifier');
            if (!verifier)
                throw new Error('Missing PKCE verifier');
            // Exchange code for tokens via backend
            const response = await fetch('/api/v1/auth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, code_verifier: verifier }),
            });
            if (!response.ok)
                throw new Error('Token exchange failed');
            const tokens = (await response.json());
            currentTokens = tokens;
            sessionStorage.removeItem('shiki_pkce_verifier');
            // Decode ID token claims
            const claims = JSON.parse(atob(tokens.idToken.split('.')[1] ?? '{}'));
            const groups = claims['groups'] ?? [];
            const user = {
                id: String(claims['sub'] ?? ''),
                email: String(claims['email'] ?? ''),
                displayName: String(claims['name'] ?? claims['email'] ?? ''),
                role: mapClaimsToRole(groups),
                groups,
                avatarUrl: typeof claims['picture'] === 'string' ? claims['picture'] : undefined,
            };
            dispatch({ type: 'AUTH_SUCCESS', user, tokens });
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
        }
        catch (err) {
            dispatch({ type: 'AUTH_FAILURE', error: err instanceof Error ? err.message : 'Auth failed' });
        }
    }
    function checkSession() {
        // If we have tokens in memory and they're not expired, restore session
        if (currentTokens && currentTokens.expiresAt > Date.now() / 1000) {
            // Session exists but we'd need to decode — for now mark as needing login
        }
        dispatch({ type: 'AUTH_FAILURE', error: null });
    }
    const login = useCallback(async () => {
        if (isMockAuthAllowed() && !currentTokens) {
            const defaultUser = MOCK_USERS.shiki_engineering_command;
            dispatch({ type: 'MOCK_LOGIN', user: defaultUser });
            return;
        }
        dispatch({ type: 'AUTH_START' });
        const { env } = await import('@shiki/lib/env');
        const authority = env.VITE_OIDC_AUTHORITY;
        const clientId = env.VITE_OIDC_CLIENT_ID;
        const redirectUri = env.VITE_OIDC_REDIRECT_URI;
        const scope = env.VITE_OIDC_SCOPE;
        if (!authority || !clientId || !redirectUri) {
            dispatch({ type: 'AUTH_FAILURE', error: 'OIDC not configured' });
            return;
        }
        const verifier = generatePKCEVerifier();
        const challenge = await generatePKCEChallenge(verifier);
        sessionStorage.setItem('shiki_pkce_verifier', verifier);
        const authUrl = new URL(`${authority}/authorize`);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('scope', scope);
        authUrl.searchParams.set('code_challenge', challenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        window.location.href = authUrl.toString();
    }, []);
    const logout = useCallback(async () => {
        currentTokens = null;
        dispatch({ type: 'AUTH_LOGOUT' });
        if (!isMockAuthAllowed()) {
            const { env } = await import('@shiki/lib/env');
            if (env.VITE_OIDC_AUTHORITY) {
                window.location.href = `${env.VITE_OIDC_AUTHORITY}/logout?post_logout_redirect_uri=${encodeURIComponent(window.location.origin)}`;
                return;
            }
        }
    }, []);
    const switchMockUser = useCallback((role) => {
        if (!isMockAuthAllowed())
            return;
        const user = MOCK_USERS[role];
        dispatch({ type: 'MOCK_LOGIN', user });
    }, []);
    return (_jsx(AuthContext.Provider, { value: { ...state, login, logout, switchMockUser }, children: children }));
}
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx)
        throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
