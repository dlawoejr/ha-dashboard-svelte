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
    let isReconnectingLock = false;

    /**
     * Connect to Home Assistant.
     * Pure connection logic only — throwing error if failed.
     */
    async function initConnection(url, token) {
        if (!url || !token) throw new Error('URL and Token are required');

        currentUrl = url;
        currentToken = token;

        if (ha) {
            ha.disconnect();
            ha = null;
        }

        ha = new HomeAssistantAPI(url, token);

        // Status updates and automatic reconnect on drop
        ha.onConnectionStatus = (status) => {
            if (status === 'disconnected' && connectionStatus !== 'reconnecting') {
                const hasCreds = currentUrl || localStorage.getItem('ha_url');
                if (hasCreds) {
                    console.log('[HA] Socket closed unexpectedly. Triggering auto-reconnect...');
                    // Fire and forget - reconnect() handles its own retries
                    reconnect().catch(e => console.error(e));
                } else {
                    connectionStatus = status;
                }
            } else if (status !== 'disconnected') {
                connectionStatus = status;
            }
        };

        await ha.connect();
        await ha.subscribeEvents();
        await loadInitialData();
    }

    /**
     * Verify if the current connection is actually alive.
     * Needs to be exported so `+page.svelte` can call it.
     */
    async function verifyConnection() {
        if (!ha || connectionStatus !== 'connected') return false;

        console.log('[HA] Active ping to verify connection...');
        const originalHa = ha;
        const isAlive = await originalHa.ping(3000);

        if (ha !== originalHa) {
            console.log('[HA] Socket instance changed during ping. Ignoring stale result.');
            return true;
        }

        if (!isAlive) {
            console.warn('[HA] Ping timeout! Connection is dead.');
            if (ha === originalHa) {
                ha.disconnect();
                ha = null;
            }
            if (!isReconnectingLock) {
                connectionStatus = 'disconnected';
            }
            return false;
        }

        console.log('[HA] Ping OK. Connection is alive.');
        return true;
    }

    /**
     * Reconnect using stored credentials with infinite retries (exponential backoff).
     * Protected by a lock to prevent concurrent reconnect loops.
     */
    async function reconnect() {
        if (isReconnectingLock) {
            console.log('[HA] Reconnect loop already running. Ignoring.');
            return;
        }

        const url = currentUrl || localStorage.getItem('ha_url');
        const token = currentToken || localStorage.getItem('ha_token');

        if (!url || !token) return;

        isReconnectingLock = true;
        connectionStatus = 'reconnecting';

        let attempt = 1;

        // Infinite retry loop for network drops (e.g. ERR_INTERNET_DISCONNECTED)
        while (isReconnectingLock) {
            console.log(`[HA] Reconnect attempt ${attempt}...`);
            connectionStatus = 'reconnecting'; // Protect state inside loop
            try {
                await initConnection(url, token);
                console.log('[HA] Reconnect successful!');
                isReconnectingLock = false; // Break loop on success
                return;
            } catch (err) {
                console.error(`[HA] Attempt ${attempt} failed:`, err);

                if (err.message === 'Auth failed') {
                    console.error('[HA] Authentication rejected. Wiping credentials.');
                    localStorage.removeItem('ha_token');
                    connectionStatus = 'auth_failed';
                    isReconnectingLock = false;
                    return;
                }

                // Wait before retrying if lock is still active
                if (!isReconnectingLock) return;

                // Exponential backoff, max 5 seconds
                const delayMs = Math.min(2000 * Math.pow(1.5, attempt - 1), 5000);
                await new Promise(r => setTimeout(r, delayMs));
                attempt++;
            }
        }
    }

    /**
     * Allow user to manually abort an infinite reconnect loop.
     */
    function cancelReconnect() {
        isReconnectingLock = false;
        connectionStatus = 'disconnected';
        if (ha) {
            ha.disconnect();
            ha = null;
        }
        localStorage.removeItem('ha_url');
        localStorage.removeItem('ha_token');
        currentUrl = '';
        currentToken = '';
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
        reconnect,
        verifyConnection,
        cancelReconnect,
        selectFloor,
        selectArea,
        toggleEntity,
        setNumber,
        updateEntityState
    };
}

export const haStore = createHAStore();
