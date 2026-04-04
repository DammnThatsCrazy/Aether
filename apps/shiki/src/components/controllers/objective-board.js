import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { CONTROLLER_FUNCTIONAL_NAMES, CONTROLLER_EXPRESSIVE_NAMES } from '@shiki/types';
import { Badge, Select, DataTable, EmptyState } from '@shiki/components/system';
import { cn } from '@shiki/lib/utils';
const STATUS_OPTIONS = [
    { value: 'all', label: 'All Statuses' },
    { value: 'active', label: 'Active' },
    { value: 'blocked', label: 'Blocked' },
    { value: 'completed', label: 'Completed' },
    { value: 'deferred', label: 'Deferred' },
];
const statusVariant = {
    active: 'success',
    blocked: 'danger',
    completed: 'default',
    deferred: 'warning',
};
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
export function ObjectiveBoard({ objectives, displayMode, className }) {
    const [statusFilter, setStatusFilter] = useState('all');
    const filtered = statusFilter === 'all'
        ? objectives
        : objectives.filter((o) => o.status === statusFilter);
    const sorted = [...filtered].sort((a, b) => a.priority - b.priority);
    const columns = [
        {
            key: 'controller',
            header: 'Controller',
            render: (row) => (_jsx("span", { className: "font-mono", children: controllerLabel(row.controller, displayMode) })),
            className: 'whitespace-nowrap',
        },
        {
            key: 'title',
            header: 'Title',
            render: (row) => _jsx("span", { children: row.title }),
        },
        {
            key: 'status',
            header: 'Status',
            render: (row) => (_jsx(Badge, { variant: statusVariant[row.status] ?? 'default', children: row.status })),
            className: 'whitespace-nowrap',
        },
        {
            key: 'priority',
            header: 'Priority',
            render: (row) => (_jsxs("span", { className: cn('font-mono', row.priority <= 1 && 'text-warning font-bold'), children: ["P", row.priority] })),
            className: 'text-center',
        },
        {
            key: 'blockedReason',
            header: 'Blocked Reason',
            render: (row) => row.blockedReason ? (_jsx("span", { className: "text-danger text-[10px]", children: row.blockedReason })) : (_jsx("span", { className: "text-text-muted", children: "\u2014" })),
        },
    ];
    return (_jsxs("div", { className: cn('space-y-3', className), children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h3", { className: "text-sm font-medium text-text-primary font-mono", children: "Objectives" }), _jsx(Select, { options: STATUS_OPTIONS, value: statusFilter, onChange: (v) => setStatusFilter(v) })] }), sorted.length === 0 ? (_jsx(EmptyState, { title: "No objectives", description: `No objectives matching "${statusFilter}" filter` })) : (_jsx(DataTable, { columns: columns, data: sorted, keyExtractor: (row) => row.id }))] }));
}
