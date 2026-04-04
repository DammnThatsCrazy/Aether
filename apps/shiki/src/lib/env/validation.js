import { env, getEnvironment, isProduction } from './config';
export function validateEnvironment() {
    const results = [];
    const environment = getEnvironment();
    // Always required
    results.push({
        variable: 'VITE_SHIKI_ENV',
        required: true,
        present: true,
        valid: true,
    });
    // OIDC required in non-local environments
    const oidcRequired = isProduction() || environment === 'staging';
    results.push({
        variable: 'VITE_OIDC_AUTHORITY',
        required: oidcRequired,
        present: !!env.VITE_OIDC_AUTHORITY,
        valid: oidcRequired ? !!env.VITE_OIDC_AUTHORITY : true,
        message: oidcRequired && !env.VITE_OIDC_AUTHORITY ? 'OIDC authority required for non-local environments' : undefined,
    });
    results.push({
        variable: 'VITE_OIDC_CLIENT_ID',
        required: oidcRequired,
        present: !!env.VITE_OIDC_CLIENT_ID,
        valid: oidcRequired ? !!env.VITE_OIDC_CLIENT_ID : true,
        message: oidcRequired && !env.VITE_OIDC_CLIENT_ID ? 'OIDC client ID required for non-local environments' : undefined,
    });
    results.push({
        variable: 'VITE_API_BASE_URL',
        required: environment !== 'local-mocked',
        present: !!env.VITE_API_BASE_URL,
        valid: true,
    });
    results.push({
        variable: 'VITE_WS_BASE_URL',
        required: environment !== 'local-mocked',
        present: !!env.VITE_WS_BASE_URL,
        valid: true,
    });
    return results;
}
export function getStartupValidationSummary() {
    const results = validateEnvironment();
    const ok = results.every(r => r.valid);
    return { ok, results };
}
