import { getAccessToken } from '@shiki/features/auth';
import { env, getEnvironment } from '@shiki/lib/env';
import { log } from '@shiki/lib/logging';
export class RestClientError extends Error {
    constructor(message, status, code, correlationId) {
        super(message);
        this.status = status;
        this.code = code;
        this.correlationId = correlationId;
        this.name = 'RestClientError';
    }
}
let requestCounter = 0;
function generateCorrelationId() {
    return `shiki-${Date.now()}-${++requestCounter}`;
}
async function request(method, path, schema, body, options) {
    const correlationId = generateCorrelationId();
    const baseUrl = env.VITE_API_BASE_URL;
    const url = `${baseUrl}${path}`;
    const headers = {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
        'X-Shiki-Environment': getEnvironment(),
        ...options?.headers,
    };
    const token = getAccessToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const controller = new AbortController();
    const timeout = options?.timeout ?? 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const startTime = performance.now();
    try {
        const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : null,
            signal: options?.signal ?? controller.signal,
        });
        const duration = Math.round(performance.now() - startTime);
        log.info(`[REST] ${method} ${path} -> ${response.status} (${duration}ms)`, { correlationId });
        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            throw new RestClientError(String(errorBody['message'] ?? response.statusText), response.status, String(errorBody['code'] ?? 'UNKNOWN'), correlationId);
        }
        const json = await response.json();
        const parsed = schema.safeParse(json);
        if (!parsed.success) {
            log.error(`[REST] Schema validation failed for ${path}`, {
                correlationId,
                errors: parsed.error.issues,
            });
            throw new RestClientError(`Response validation failed: ${parsed.error.issues.map(i => i.message).join(', ')}`, response.status, 'VALIDATION_ERROR', correlationId);
        }
        return parsed.data;
    }
    catch (err) {
        if (err instanceof RestClientError)
            throw err;
        if (err instanceof DOMException && err.name === 'AbortError') {
            throw new RestClientError('Request timed out', 0, 'TIMEOUT', correlationId);
        }
        throw new RestClientError(err instanceof Error ? err.message : 'Network error', 0, 'NETWORK_ERROR', correlationId);
    }
    finally {
        clearTimeout(timeoutId);
    }
}
export const restClient = {
    get: (path, schema, options) => request('GET', path, schema, undefined, options),
    post: (path, schema, body, options) => request('POST', path, schema, body, options),
    put: (path, schema, body, options) => request('PUT', path, schema, body, options),
    patch: (path, schema, body, options) => request('PATCH', path, schema, body, options),
    delete: (path, schema, options) => request('DELETE', path, schema, undefined, options),
};
