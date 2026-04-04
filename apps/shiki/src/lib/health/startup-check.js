import { getStartupValidationSummary } from '@shiki/lib/env';
export function runStartupChecks() {
    const issues = [];
    // Environment validation
    const envResult = getStartupValidationSummary();
    if (!envResult.ok) {
        for (const r of envResult.results) {
            if (!r.valid) {
                issues.push(`ENV: ${r.variable} - ${r.message ?? 'invalid'}`);
            }
        }
    }
    return { ok: issues.length === 0, issues };
}
