let idCounter = 0;
export function dispatchNotification(opts) {
    const id = `notif-${Date.now()}-${++idCounter}`;
    return {
        id,
        title: opts.title,
        body: opts.body,
        severity: opts.severity,
        class: opts.class,
        channels: ['in-app'],
        timestamp: new Date().toISOString(),
        read: false,
        dismissed: false,
        entityId: opts.entityId,
        entityType: opts.entityType,
        controller: opts.controller,
        deepLink: opts.deepLink ?? `/mission`,
        what: opts.what,
        why: opts.why,
        impact: opts.impact,
        recommendedAction: opts.recommendedAction,
        reversible: opts.reversible,
        traceRef: opts.traceRef,
        dedupeKey: `${opts.controller ?? 'system'}-${opts.what}-${opts.entityId ?? 'global'}`,
    };
}
