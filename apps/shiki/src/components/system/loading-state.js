import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
import { Skeleton } from './skeleton';
export function LoadingState({ lines = 3, className }) {
    return (_jsx("div", { className: cn('space-y-3 py-4', className), children: Array.from({ length: lines }, (_, i) => (_jsx(Skeleton, { className: "h-4", width: `${80 - i * 15}%` }, i))) }));
}
