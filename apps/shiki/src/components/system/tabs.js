import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState } from 'react';
import { cn } from '@shiki/lib/utils';
const TabsContext = createContext(null);
export function Tabs({ defaultValue, value, children, className, onChange, onValueChange }) {
    const [activeTab, setActiveTabState] = useState(value ?? defaultValue ?? '');
    const setActiveTab = (tab) => {
        setActiveTabState(tab);
        onChange?.(tab);
        onValueChange?.(tab);
    };
    return (_jsx(TabsContext.Provider, { value: { activeTab, setActiveTab }, children: _jsx("div", { className: cn('w-full', className), children: children }) }));
}
export function TabsList({ children, className }) {
    return (_jsx("div", { className: cn('flex border-b border-border-default gap-1 mb-4', className), role: "tablist", children: children }));
}
export function TabsTrigger({ value, children, className }) {
    const ctx = useContext(TabsContext);
    if (!ctx)
        throw new Error('TabsTrigger must be inside Tabs');
    const isActive = ctx.activeTab === value;
    return (_jsx("button", { role: "tab", "aria-selected": isActive, onClick: () => ctx.setActiveTab(value), className: cn('px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px', isActive ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary', className), children: children }));
}
export function TabsContent({ value, children, className }) {
    const ctx = useContext(TabsContext);
    if (!ctx)
        throw new Error('TabsContent must be inside Tabs');
    if (ctx.activeTab !== value)
        return null;
    return _jsx("div", { className: cn('', className), role: "tabpanel", children: children });
}
