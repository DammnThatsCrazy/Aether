import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
export function Skeleton({ className, width, height }) {
    return (_jsx("div", { className: cn('animate-pulse rounded bg-border-default', className), style: { width, height }, "aria-hidden": "true" }));
}
