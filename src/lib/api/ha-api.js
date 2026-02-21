/**
 * Home Assistant WebSocket API Module
 */
export class HomeAssistantAPI {
    constructor(url, token) {
        this.url = url.replace('http', 'ws') + '/api/websocket';
        this.token = token;
        this.socket = null;
        this.idCounter = 1;
        this.callbacks = new Map();
        this.onStateChange = null;
        this.onConnectionStatus = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            // Clean up any previous socket before creating a new one
            this.disconnect();

            this.socket = new WebSocket(this.url);
            let settled = false; // Guard against resolving/rejecting twice

            this.socket.onopen = () => {
                console.log('WS Connection opened');
            };

            this.socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.handleMessage(data,
                    (val) => { if (!settled) { settled = true; resolve(val); } },
                    (err) => { if (!settled) { settled = true; reject(err); } }
                );
            };

            this.socket.onerror = (err) => {
                console.error('WS Error:', err);
                // Do NOT call onConnectionStatus here.
                // onerror is always followed by onclose, so we handle it there
                // to prevent double-triggering reconnect.
                if (!settled) { settled = true; reject(err); }
            };

            this.socket.onclose = () => {
                console.log('WS Connection closed');
                if (this.onConnectionStatus) this.onConnectionStatus('disconnected');
            };
        });
    }

    disconnect() {
        if (this.socket) {
            // Detach all event handlers to prevent ghost callbacks
            this.socket.onopen = null;
            this.socket.onmessage = null;
            this.socket.onerror = null;
            this.socket.onclose = null;

            if (this.socket.readyState === WebSocket.OPEN ||
                this.socket.readyState === WebSocket.CONNECTING) {
                this.socket.close();
            }
            this.socket = null;
        }
        // Clear any pending command callbacks
        this.callbacks.clear();
        this.idCounter = 1;
    }

    handleMessage(data, resolve, reject) {
        switch (data.type) {
            case 'auth_required':
                this.send({
                    type: 'auth',
                    access_token: this.token
                });
                break;

            case 'auth_ok':
                console.log('Authenticated successfully');
                if (this.onConnectionStatus) this.onConnectionStatus('connected');
                resolve();
                break;

            case 'auth_invalid':
                console.error('Authentication failed:', data.message);
                if (this.onConnectionStatus) this.onConnectionStatus('auth_failed');
                reject(new Error('Auth failed'));
                break;

            case 'result':
                const callback = this.callbacks.get(data.id);
                if (callback) {
                    if (data.success) {
                        callback.resolve(data.result);
                    } else {
                        callback.reject(data.error);
                    }
                    this.callbacks.delete(data.id);
                }
                break;

            case 'event':
                if (data.event && data.event.data && this.onStateChange) {
                    this.onStateChange(data.event.data);
                }
                break;
        }
    }

    send(message) {
        this.socket.send(JSON.stringify(message));
    }

    sendCommand(message) {
        const id = this.idCounter++;
        return new Promise((resolve, reject) => {
            this.callbacks.set(id, { resolve, reject });
            this.send({ ...message, id });
        });
    }

    getStates() {
        return this.sendCommand({ type: 'get_states' });
    }

    subscribeEvents() {
        return this.sendCommand({ type: 'subscribe_events', event_type: 'state_changed' });
    }

    callService(domain, service, serviceData, target) {
        return this.sendCommand({
            type: 'call_service',
            domain,
            service,
            service_data: serviceData,
            target
        });
    }

    getFloors() {
        return this.sendCommand({ type: 'config/floor_registry/list' });
    }

    getAreas() {
        return this.sendCommand({ type: 'config/area_registry/list' });
    }

    getEntityRegistry() {
        return this.sendCommand({ type: 'config/entity_registry/list' });
    }
}
