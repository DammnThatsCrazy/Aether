// Route definitions for SHIKI
export const ROUTES = {
    MISSION: '/mission',
    LIVE: '/live',
    GOUF: '/gouf',
    ENTITIES: '/entities',
    ENTITY_DETAIL: '/entities/:type/:id',
    COMMAND: '/command',
    DIAGNOSTICS: '/diagnostics',
    REVIEW: '/review',
    REVIEW_BATCH: '/review/:batchId',
    LAB: '/lab',
};
export function entityDetailPath(type, id) {
    return `/entities/${type}/${id}`;
}
export function reviewBatchPath(batchId) {
    return `/review/${batchId}`;
}
