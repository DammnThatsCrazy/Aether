import { formatDistanceToNow, format, parseISO } from 'date-fns';
export function formatRelativeTime(iso) {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
}
export function formatTimestamp(iso) {
    return format(parseISO(iso), 'yyyy-MM-dd HH:mm:ss');
}
export function formatCompactNumber(n) {
    if (n >= 1000000)
        return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000)
        return `${(n / 1000).toFixed(1)}K`;
    return String(n);
}
export function formatPercentage(value, decimals = 1) {
    return `${(value * 100).toFixed(decimals)}%`;
}
export function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    if (ms < 60000)
        return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000)
        return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}
export function truncate(str, maxLength) {
    if (str.length <= maxLength)
        return str;
    return str.slice(0, maxLength - 1) + '\u2026';
}
