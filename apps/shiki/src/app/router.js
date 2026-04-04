import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { RequireAuth } from '@shiki/features/auth';
import { AppShell } from '@shiki/components/layout';
import { LoadingState } from '@shiki/components/system';
import { ErrorBoundary } from './error-boundary';
const MissionPage = lazy(() => import('@shiki/pages/mission').then(m => ({ default: m.MissionPage })));
const LivePage = lazy(() => import('@shiki/pages/live').then(m => ({ default: m.LivePage })));
const GoufPage = lazy(() => import('@shiki/pages/gouf').then(m => ({ default: m.GoufPage })));
const EntitiesPage = lazy(() => import('@shiki/pages/entities').then(m => ({ default: m.EntitiesPage })));
const CommandPage = lazy(() => import('@shiki/pages/command').then(m => ({ default: m.CommandPage })));
const DiagnosticsPage = lazy(() => import('@shiki/pages/diagnostics').then(m => ({ default: m.DiagnosticsPage })));
const ReviewPage = lazy(() => import('@shiki/pages/review').then(m => ({ default: m.ReviewPage })));
const LabPage = lazy(() => import('@shiki/pages/lab').then(m => ({ default: m.LabPage })));
function PageSuspense({ children }) {
    return (_jsx(ErrorBoundary, { children: _jsx(Suspense, { fallback: _jsx(LoadingState, { lines: 5, className: "p-8" }), children: children }) }));
}
export function AppRouter() {
    return (_jsx(RequireAuth, { children: _jsx(AppShell, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(Navigate, { to: "/mission", replace: true }) }), _jsx(Route, { path: "/mission", element: _jsx(PageSuspense, { children: _jsx(MissionPage, {}) }) }), _jsx(Route, { path: "/live", element: _jsx(PageSuspense, { children: _jsx(LivePage, {}) }) }), _jsx(Route, { path: "/gouf", element: _jsx(PageSuspense, { children: _jsx(GoufPage, {}) }) }), _jsx(Route, { path: "/entities", element: _jsx(PageSuspense, { children: _jsx(EntitiesPage, {}) }) }), _jsx(Route, { path: "/entities/:type/:id", element: _jsx(PageSuspense, { children: _jsx(EntitiesPage, {}) }) }), _jsx(Route, { path: "/command", element: _jsx(PageSuspense, { children: _jsx(CommandPage, {}) }) }), _jsx(Route, { path: "/diagnostics", element: _jsx(PageSuspense, { children: _jsx(DiagnosticsPage, {}) }) }), _jsx(Route, { path: "/review", element: _jsx(PageSuspense, { children: _jsx(ReviewPage, {}) }) }), _jsx(Route, { path: "/review/:batchId", element: _jsx(PageSuspense, { children: _jsx(ReviewPage, {}) }) }), _jsx(Route, { path: "/lab", element: _jsx(PageSuspense, { children: _jsx(LabPage, {}) }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/mission", replace: true }) })] }) }) }));
}
