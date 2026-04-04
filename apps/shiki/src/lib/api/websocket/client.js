import { log } from '@shiki/lib/logging';
import { getAccessToken } from '@shiki/features/auth';
import { env } from '@shiki/lib/env';
export class WebSocketClient {
    constructor(options) {
        this.options = options;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.intentionallyClosed = false;
        this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
        this.reconnectIntervalMs = options.reconnectIntervalMs ?? 3000;
    }
    connect() {
        this.intentionallyClosed = false;
        const baseUrl = env.VITE_WS_BASE_URL;
        const token = getAccessToken();
        const url = `${baseUrl}${this.options.path}${token ? `?token=${token}` : ''}`;
        this.options.onStatusChange('connecting');
        log.info(`[WS] Connecting to ${this.options.path}`);
        try {
            this.ws = new WebSocket(url);
            this.ws.onopen = () => {
                this.reconnectAttempts = 0;
                this.options.onStatusChange('connected');
                log.info(`[WS] Connected to ${this.options.path}`);
            };
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(String(event.data));
                    this.options.onMessage(data);
                }
                catch {
                    log.warn(`[WS] Failed to parse message from ${this.options.path}`);
                }
            };
            this.ws.onerror = () => {
                this.options.onStatusChange('error');
                log.error(`[WS] Error on ${this.options.path}`);
            };
            this.ws.onclose = () => {
                this.options.onStatusChange('disconnected');
                if (!this.intentionallyClosed) {
                    this.scheduleReconnect();
                }
            };
        }
        catch (err) {
            this.options.onStatusChange('error');
            log.error(`[WS] Failed to create connection`, { error: err });
        }
    }
    disconnect() {
        this.intentionallyClosed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.options.onStatusChange('disconnected');
    }
    send(data) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            log.error(`[WS] Max reconnect attempts reached for ${this.options.path}`);
            return;
        }
        const delay = this.reconnectIntervalMs * Math.pow(1.5, this.reconnectAttempts);
        this.reconnectAttempts++;
        log.info(`[WS] Reconnecting to ${this.options.path} in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }
}
