import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketClient } from '@shiki/lib/api';
import { getRuntimeMode } from '@shiki/lib/env';
export function useWebSocket({ path, onMessage, enabled = true }) {
    const [status, setStatus] = useState('disconnected');
    const clientRef = useRef(null);
    const onMessageRef = useRef(onMessage);
    onMessageRef.current = onMessage;
    useEffect(() => {
        if (!enabled || getRuntimeMode() === 'mocked')
            return;
        const client = new WebSocketClient({
            path,
            onMessage: (data) => onMessageRef.current(data),
            onStatusChange: setStatus,
        });
        clientRef.current = client;
        client.connect();
        return () => {
            client.disconnect();
            clientRef.current = null;
        };
    }, [path, enabled]);
    const send = useCallback((data) => {
        clientRef.current?.send(data);
    }, []);
    return { status, send };
}
