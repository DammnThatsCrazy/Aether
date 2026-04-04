import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@shiki/lib/utils';
export function DataTable({ columns, data, keyExtractor, onRowClick, className, emptyMessage = 'No data' }) {
    if (data.length === 0) {
        return _jsx("div", { className: "text-text-muted text-xs text-center py-8 font-mono", children: emptyMessage });
    }
    return (_jsx("div", { className: cn('overflow-auto', className), children: _jsxs("table", { className: "w-full text-xs", children: [_jsx("thead", { children: _jsx("tr", { className: "border-b border-border-default", children: columns.map(col => (_jsx("th", { className: cn('text-left py-2 px-3 text-text-secondary font-medium', col.className), children: col.header }, col.key))) }) }), _jsx("tbody", { children: data.map(row => (_jsx("tr", { onClick: () => onRowClick?.(row), className: cn('border-b border-border-subtle', onRowClick && 'cursor-pointer hover:bg-surface-raised'), children: columns.map(col => (_jsx("td", { className: cn('py-2 px-3 text-text-primary', col.className), children: col.render(row) }, col.key))) }, keyExtractor(row)))) })] }) }));
}
