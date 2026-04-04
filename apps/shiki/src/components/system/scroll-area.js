import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
export function ScrollArea({ children, className, maxHeight = '400px' }) {
    return (_jsx("div", { className: cn('overflow-auto', className), style: { maxHeight }, children: children }));
}
