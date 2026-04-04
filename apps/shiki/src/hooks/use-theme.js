import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
const ThemeContext = createContext(null);
function getSystemTheme() {
    if (typeof window === 'undefined')
        return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function resolveTheme(theme) {
    return theme === 'system' ? getSystemTheme() : theme;
}
export function ThemeProvider({ children }) {
    const [theme, setThemeState] = useState(() => {
        const stored = localStorage.getItem('shiki-theme');
        return stored ?? 'dark';
    });
    const resolved = resolveTheme(theme);
    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove('dark', 'light');
        root.classList.add(resolved);
        localStorage.setItem('shiki-theme', theme);
    }, [theme, resolved]);
    useEffect(() => {
        if (theme !== 'system')
            return;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => {
            const root = document.documentElement;
            root.classList.remove('dark', 'light');
            root.classList.add(getSystemTheme());
        };
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [theme]);
    const setTheme = useCallback((t) => setThemeState(t), []);
    return (_jsx(ThemeContext.Provider, { value: { theme, resolved, setTheme }, children: children }));
}
export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx)
        throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
}
