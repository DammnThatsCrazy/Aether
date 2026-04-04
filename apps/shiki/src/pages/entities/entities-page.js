import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent, Badge, Tabs, TabsList, TabsTrigger, TabsContent, TerminalSeparator, } from '@shiki/components/system';
import { PageWrapper } from '@shiki/components/layout';
import { EntityListTable } from '@shiki/components/entities';
import { getMockEntities } from '@shiki/fixtures/entities';
import { Entity360Page } from './entity-360';
const ENTITY_TYPES = [
    'customer',
    'wallet',
    'agent',
    'protocol',
    'contract',
    'cluster',
];
const ENTITY_TYPE_LABELS = {
    customer: 'Customers',
    wallet: 'Wallets',
    agent: 'Agents',
    protocol: 'Protocols',
    contract: 'Contracts',
    cluster: 'Clusters',
};
export function EntitiesPage() {
    const { type: routeType, id: routeId } = useParams();
    const navigate = useNavigate();
    const [activeType, setActiveType] = useState((ENTITY_TYPES.includes(routeType) ? routeType : 'customer'));
    const [selectedEntityId, setSelectedEntityId] = useState(routeId ?? null);
    const entities = useMemo(() => getMockEntities(activeType), [activeType]);
    const handleSelectEntity = useCallback((entity) => {
        setSelectedEntityId(entity.id);
        navigate(`/entities/${entity.type}/${entity.id}`, { replace: true });
    }, [navigate]);
    const handleBack = useCallback(() => {
        setSelectedEntityId(null);
        navigate(`/entities/${activeType}`, { replace: true });
    }, [navigate, activeType]);
    const handleTypeChange = useCallback((type) => {
        const entityType = type;
        setActiveType(entityType);
        setSelectedEntityId(null);
        navigate(`/entities/${entityType}`, { replace: true });
    }, [navigate]);
    // If we have a selected entity (via route param or click), show the 360 view
    if (selectedEntityId) {
        return (_jsx(PageWrapper, { title: "Entity 360", children: _jsx(Entity360Page, { entityId: selectedEntityId, onBack: handleBack }) }));
    }
    // Entity type counts for the tabs
    const typeCounts = useMemo(() => {
        const counts = {};
        for (const t of ENTITY_TYPES) {
            counts[t] = getMockEntities(t).length;
        }
        return counts;
    }, []);
    return (_jsx(PageWrapper, { title: "Entities", children: _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h1", { className: "text-lg font-bold text-neutral-100", children: "Entities" }), _jsxs("span", { className: "text-xs text-neutral-500 font-mono", children: [entities.length, " ", ENTITY_TYPE_LABELS[activeType].toLowerCase()] })] }), _jsx(TerminalSeparator, {}), _jsxs(Tabs, { defaultValue: activeType, onValueChange: handleTypeChange, children: [_jsx(TabsList, { children: ENTITY_TYPES.map((type) => (_jsxs(TabsTrigger, { value: type, children: [ENTITY_TYPE_LABELS[type], _jsx(Badge, { variant: "default", className: "ml-1.5 text-xs", children: typeCounts[type] ?? 0 })] }, type))) }), ENTITY_TYPES.map((type) => (_jsx(TabsContent, { value: type, children: _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: ENTITY_TYPE_LABELS[type] }) }), _jsx(CardContent, { children: _jsx(EntityListTable, { entities: type === activeType ? entities : getMockEntities(type), onSelect: handleSelectEntity }) })] }) }, type)))] })] }) }));
}
