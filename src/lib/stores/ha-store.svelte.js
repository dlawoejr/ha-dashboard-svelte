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
    let ha = null; // Store HA api instance internally

    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    let isReconnecting = false;
    let reconnectTimeout = null;
    let reconnectScheduled = false; // Guard against double-trigger

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
            // After ha-api.js fix, only 'disconnected' or 'connected'/'auth_failed' arrive here.
            if (status === 'disconnected') {
                // Only trigger reconnect if we were previously connected or already reconnecting
                if (connectionStatus === 'connected' || connectionStatus === 'reconnecting') {
                    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && !reconnectScheduled) {
                        attemptAutoReconnect();
                    } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                        connectionStatus = 'disconnected';
                        isReconnecting = false;
                        reconnectScheduled = false;
                    }
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
                reconnectScheduled = false; // Allow scheduling again
                attemptAutoReconnect();
                return; // Don't throw during reconnect
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
        if (reconnectScheduled) return; // Prevent double scheduling

        isReconnecting = true;
        reconnectScheduled = true;
        reconnectAttempts++;
        connectionStatus = 'reconnecting';

        console.log(`Auto-reconnecting... Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

        if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
        reconnectTimeout = setTimeout(() => {
            reconnectScheduled = false; // Allow next schedule after timer fires
            initConnection(currentUrl, currentToken).catch(err => console.error("Reconnect retry failed:", err));
        }, 2000);
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

            // Merge states with registry for area mapping
            entities = states.map(state => {
                const registryEntry = entityRegistry.find(e => e.entity_id === state.entity_id);
                return {
                    ...state,
                    area_id: registryEntry ? registryEntry.area_id : null,
                    name: (registryEntry && registryEntry.name) || state.attributes.friendly_name || state.entity_id
                };
            });

            // Auto-select first floor if available
            if (floors.length > 0) {
                selectFloor(floors[0].floor_id);
            }

            // Listen for state changes
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
            // Auto-select first area in floor
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
        selectFloor,
        selectArea,
        toggleEntity,
        setNumber,
        updateEntityState // exposed for optimistic updates if needed
    };
}

export const haStore = createHAStore();
