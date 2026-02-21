import { HomeAssistantAPI } from '../api/ha-api.js';

export function createHAStore() {
    let connectionStatus = $state('disconnected');
    let floors = $state([]);
    let areas = $state([]);
    let entities = $state([]);
    let activeFloorId = $state(null);
    let activeAreaId = $state(null);
    let currentUrl = $state('');
    let currentToken = $state('');
    let ha = null;

    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    let isReconnecting = false;
    let reconnectTimeout = null;
    let reconnectScheduled = false;

    async function initConnection(url, token) {
        if (!url || !token) throw new Error('URL and Token are required');

        currentUrl = url;
        currentToken = token;

        // Reset reconnect state on explicit fresh connection (user-initiated)
        if (!isReconnecting) {
            reconnectAttempts = 0;
            if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
            reconnectScheduled = false;
        }

        // Disconnect previous instance to prevent ghost callbacks
        if (ha) {
            ha.disconnect();
            ha = null;
        }

        ha = new HomeAssistantAPI(url, token);

        ha.onConnectionStatus = (status) => {
            if (status === 'disconnected') {
                // Socket closed - try to reconnect if we have credentials
                if (currentUrl && currentToken && reconnectAttempts < MAX_RECONNECT_ATTEMPTS && !reconnectScheduled) {
                    attemptAutoReconnect();
                } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    connectionStatus = 'disconnected';
                    isReconnecting = false;
                    reconnectScheduled = false;
                }
            } else {
                connectionStatus = status;
                if (status === 'connected') {
                    reconnectAttempts = 0;
                    isReconnecting = false;
                    reconnectScheduled = false;
                }
            }
        };

        try {
            await ha.connect();
            await ha.subscribeEvents();
            await loadInitialData();
        } catch (err) {
            console.error('Connection failed:', err);

            // If this was a reconnect attempt, schedule the next one
            if (isReconnecting && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectScheduled = false;
                attemptAutoReconnect();
                return;
            } else if (!isReconnecting) {
                throw err;
            }
        }
    }

    function attemptAutoReconnect() {
        if (!currentUrl || !currentToken) return;
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            connectionStatus = 'disconnected';
            isReconnecting = false;
            reconnectScheduled = false;
            return;
        }
        if (reconnectScheduled) return;

        isReconnecting = true;
        reconnectScheduled = true;
        reconnectAttempts++;
        connectionStatus = 'reconnecting';

        console.log(`[HA] Auto-reconnecting... Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

        if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
        reconnectTimeout = setTimeout(() => {
            reconnectScheduled = false;
            initConnection(currentUrl, currentToken).catch(err => console.error("[HA] Reconnect retry failed:", err));
        }, 2000);
    }

    /**
     * Check socket health and trigger reconnect if needed.
     * Called by visibilitychange handler to detect "zombie" sockets
     * that Android doesn't properly fire onclose for.
     */
    function checkAndReconnect() {
        // Case 1: We think we're connected but the socket is actually dead (zombie socket)
        if (ha && !ha.isConnected() && connectionStatus === 'connected') {
            console.log('[HA] Zombie socket detected! Forcing reconnect...');
            connectionStatus = 'reconnecting';
            reconnectAttempts = 0;
            reconnectScheduled = false;
            isReconnecting = false; // Let initConnection treat this as a fresh attempt

            // Disconnect the zombie socket cleanly
            ha.disconnect();
            ha = null;

            // Immediately try to reconnect using stored credentials
            initConnection(currentUrl, currentToken).catch(err => {
                console.error('[HA] Zombie reconnect failed:', err);
                // If it fails, start the auto-reconnect loop
                attemptAutoReconnect();
            });
            return;
        }

        // Case 2: We know we're disconnected and have credentials - try reconnecting
        if (connectionStatus === 'disconnected' && currentUrl && currentToken && !reconnectScheduled) {
            console.log('[HA] Disconnected with stored credentials, attempting reconnect...');
            reconnectAttempts = 0;
            isReconnecting = false;
            initConnection(currentUrl, currentToken).catch(err => {
                console.error('[HA] Reconnect from disconnected failed:', err);
                attemptAutoReconnect();
            });
            return;
        }

        // Case 3: No HA instance but we have credentials in localStorage (cold start recovery)
        if (!ha && currentUrl && currentToken && connectionStatus !== 'reconnecting') {
            console.log('[HA] No active connection, attempting fresh connect...');
            initConnection(currentUrl, currentToken).catch(err => {
                console.error('[HA] Fresh connect failed:', err);
            });
        }
    }

    async function loadInitialData() {
        if (!ha) return;

        try {
            const [fetchedFloors, fetchedAreas, entityRegistry, states] = await Promise.all([
                ha.getFloors(),
                ha.getAreas(),
                ha.getEntityRegistry(),
                ha.getStates()
            ]);

            floors = fetchedFloors.sort((a, b) => (a.level || 0) - (b.level || 0));
            areas = fetchedAreas;

            entities = states.map(state => {
                const registryEntry = entityRegistry.find(e => e.entity_id === state.entity_id);
                return {
                    ...state,
                    area_id: registryEntry ? registryEntry.area_id : null,
                    name: (registryEntry && registryEntry.name) || state.attributes.friendly_name || state.entity_id
                };
            });

            if (floors.length > 0) {
                selectFloor(floors[0].floor_id);
            }

            ha.onStateChange = (event) => {
                updateEntityState(event.new_state);
            };

        } catch (err) {
            console.error('Failed to load initial data:', err);
        }
    }

    function selectFloor(floorId) {
        activeFloorId = floorId;
        const floorAreas = areas.filter(area => area.floor_id === floorId);

        if (floorAreas.length > 0) {
            selectArea(floorAreas.sort((a, b) => a.name.localeCompare(b.name))[0].area_id);
        } else {
            activeAreaId = null;
        }
    }

    function selectArea(areaId) {
        activeAreaId = areaId;
    }

    function updateEntityState(newState) {
        const index = entities.findIndex(e => e.entity_id === newState.entity_id);
        if (index !== -1) {
            entities[index] = {
                ...entities[index],
                ...newState,
                attributes: newState.attributes,
                state: newState.state
            };
        }
    }

    async function callService(domain, service, serviceData, target) {
        if (!ha) return;
        return ha.callService(domain, service, serviceData, target);
    }

    async function toggleEntity(entityId, isChecked, domain) {
        const service = isChecked ? 'turn_on' : 'turn_off';
        return callService(domain, service, {}, { entity_id: entityId });
    }

    async function setNumber(entityId, value) {
        return callService('input_number', 'set_value', { value: parseFloat(value) }, { entity_id: entityId });
    }

    return {
        get connectionStatus() { return connectionStatus; },
        get floors() { return floors; },
        get areas() { return areas; },
        get entities() { return entities; },
        get activeFloorId() { return activeFloorId; },
        get activeAreaId() { return activeAreaId; },
        get currentUrl() { return currentUrl; },
        get currentToken() { return currentToken; },
        initConnection,
        checkAndReconnect,
        selectFloor,
        selectArea,
        toggleEntity,
        setNumber,
        updateEntityState
    };
}

export const haStore = createHAStore();
