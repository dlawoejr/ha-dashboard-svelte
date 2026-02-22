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

            try {
                this.socket = new WebSocket(this.url);
            } catch (err) {
                return reject(err);
            }

            let settled = false; // Guard against resolving/rejecting twice
            let connectedOnce = false; // Track if we ever fully established connection

            this.socket.onopen = () => {
                console.log('WS Connection opened');
                connectedOnce = true;
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
                if (!settled) { settled = true; reject(err); }
            };

            this.socket.onclose = () => {
                console.log('WS Connection closed');
                // CRITICAL FIX: Only fire disconnected if this was a healthy, established socket that died.
                // If it closes immediately during connect() (e.g. ERR_INTERNET_DISCONNECTED),
                // we DO NOT want to broadcast 'disconnected' because the store's retry loop 
                // is currently active and managing the 'reconnecting' state.
                if (connectedOnce && this.onConnectionStatus) {
                    this.onConnectionStatus('disconnected');
                }
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

    /** Check if the WebSocket is truly alive (not a zombie socket) */
    isConnected() {
        return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
    }

    /**
     * Send a real ping to HA server and wait for pong.
     * Returns true if alive, false if dead (timeout or error).
     * This catches zombie sockets that lie about readyState on Android.
     */
    ping(timeoutMs = 3000) {
        return new Promise((resolve) => {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                resolve(false);
                return;
            }

            const id = this.idCounter++;
            let timer = null;

            // Set up a one-time listener for the pong response
            const onPong = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.id === id && data.type === 'pong') {
                        clearTimeout(timer);
                        this.socket.removeEventListener('message', onPong);
                        resolve(true);
                    }
                } catch (e) {
                    // ignore parse errors
                }
            };

            this.socket.addEventListener('message', onPong);

            // Timeout: if no pong received, socket is dead
            timer = setTimeout(() => {
                this.socket?.removeEventListener('message', onPong);
                resolve(false);
            }, timeoutMs);

            // Send ping
            try {
                this.socket.send(JSON.stringify({ id, type: 'ping' }));
            } catch (e) {
                clearTimeout(timer);
                this.socket?.removeEventListener('message', onPong);
                resolve(false);
            }
        });
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
