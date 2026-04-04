import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo } from 'react';
import { EmptyState } from '@shiki/components/system';
import { PageWrapper } from '@shiki/components/layout';
import { Entity360View } from '@shiki/components/entities';
import { getMockEntity, getMockTimeline, getMockInterventions, getMockRecommendations, getMockNotes, MOCK_NEEDS_HELP_CARDS, } from '@shiki/fixtures/entities';
import { getMockEntityNeighborhood } from '@shiki/fixtures/graph';
export function Entity360Page({ entityId, onBack }) {
    const entity = useMemo(() => getMockEntity(entityId), [entityId]);
    const timeline = useMemo(() => {
        const tl = getMockTimeline(entityId);
        return tl?.events ?? [];
    }, [entityId]);
    const neighborhood = useMemo(() => getMockEntityNeighborhood(entityId), [entityId]);
    const interventions = useMemo(() => getMockInterventions(entityId), [entityId]);
    const recommendations = useMemo(() => getMockRecommendations(), []);
    const notes = useMemo(() => getMockNotes(entityId), [entityId]);
    const needsHelpCard = useMemo(() => MOCK_NEEDS_HELP_CARDS.find((c) => c.entityId === entityId) ?? null, [entityId]);
    if (!entity) {
        return (_jsx(PageWrapper, { title: "Entity Not Found", children: _jsx(EmptyState, { title: "Entity not found", description: `No entity found with ID: ${entityId}` }) }));
    }
    return (_jsx(Entity360View, { entity: entity, timeline: timeline, neighborhood: neighborhood, interventions: interventions, recommendations: recommendations, notes: notes, needsHelpCard: needsHelpCard, onBack: onBack }));
}
