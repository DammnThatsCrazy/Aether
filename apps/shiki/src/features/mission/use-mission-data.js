import { useState, useEffect } from 'react';
import { isLocalMocked } from '@shiki/lib/env';
import { getMockMissionData } from '@shiki/fixtures/mission';
export function useMissionData() {
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (isLocalMocked()) {
            setData(getMockMissionData());
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        Promise.all([
            fetch('/api/v1/analytics/dashboard/summary').then(r => r.json()),
        ])
            .then(() => {
            // Map responses — for now use mock data shape
            setData(getMockMissionData());
            setIsLoading(false);
        })
            .catch((err) => {
            setError(err instanceof Error ? err.message : 'Failed to load mission data');
            setIsLoading(false);
        });
    }, []);
    return { data, isLoading, error };
}
