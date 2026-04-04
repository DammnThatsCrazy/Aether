import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CONTROLLER_FUNCTIONAL_NAMES, CONTROLLER_EXPRESSIVE_NAMES } from '@shiki/types';
import { Badge, DataTable, Toggle } from '@shiki/components/system';
import { cn, formatRelativeTime, formatTimestamp } from '@shiki/lib/utils';
function controllerLabel(name, mode) {
    switch (mode) {
        case 'functional':
            return CONTROLLER_FUNCTIONAL_NAMES[name];
        case 'named':
            return name.toUpperCase();
        case 'expressive':
            return CONTROLLER_EXPRESSIVE_NAMES[name];
    }
}
const typeVariant = {
    cron: 'accent',
    interval: 'info',
    'one-shot': 'warning',
};
export function ScheduleTable({ schedules, displayMode, className }) {
    const columns = [
        {
            key: 'controller',
            header: 'Controller',
            render: (row) => (_jsx("span", { className: "font-mono", children: controllerLabel(row.controller, displayMode) })),
            className: 'whitespace-nowrap',
        },
        {
            key: 'type',
            header: 'Type',
            render: (row) => (_jsx(Badge, { variant: typeVariant[row.type], children: row.type })),
        },
        {
            key: 'expression',
            header: 'Expression',
            render: (row) => (_jsx("code", { className: "text-[10px] bg-surface-sunken px-1.5 py-0.5 rounded font-mono", children: row.expression })),
        },
        {
            key: 'nextRun',
            header: 'Next Run',
            render: (row) => (_jsx("span", { className: "font-mono", title: formatTimestamp(row.nextRun), children: formatRelativeTime(row.nextRun) })),
        },
        {
            key: 'lastRun',
            header: 'Last Run',
            render: (row) => row.lastRun ? (_jsx("span", { className: "font-mono", title: formatTimestamp(row.lastRun), children: formatRelativeTime(row.lastRun) })) : (_jsx("span", { className: "text-text-muted", children: "\u2014" })),
        },
        {
            key: 'enabled',
            header: 'Enabled',
            render: (row) => (_jsx(Toggle, { checked: row.enabled, onChange: () => { }, disabled: true })),
        },
        {
            key: 'missedFires',
            header: 'Missed',
            render: (row) => (_jsx("span", { className: cn('font-mono', row.missedFires > 0 ? 'text-danger font-bold' : 'text-text-muted'), children: row.missedFires })),
            className: 'text-center',
        },
    ];
    return (_jsxs("div", { className: cn('space-y-3', className), children: [_jsx("h3", { className: "text-sm font-medium text-text-primary font-mono", children: "Schedules & Wakeups" }), _jsx(DataTable, { columns: columns, data: schedules, keyExtractor: (row) => row.id, emptyMessage: "No schedules configured" })] }));
}
