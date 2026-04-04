import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
export function AppShell({ children }) {
    return (_jsxs("div", { className: "flex h-screen overflow-hidden bg-surface-base", children: [_jsx(Sidebar, {}), _jsxs("div", { className: "flex flex-1 flex-col overflow-hidden", children: [_jsx(TopBar, {}), _jsx("main", { className: "flex-1 overflow-auto p-4", children: children })] })] }));
}
