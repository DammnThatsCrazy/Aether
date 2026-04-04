import { jsx as _jsx } from "react/jsx-runtime";
import { ControllerCard } from './controller-card';
import { cn } from '@shiki/lib/utils';
export function ControllerRoster({ controllers, displayMode, className }) {
    return (_jsx("div", { className: cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3', className), children: controllers.map((ctrl) => (_jsx(ControllerCard, { controller: ctrl, displayMode: displayMode }, ctrl.name))) }));
}
