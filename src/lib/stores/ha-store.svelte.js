import { HomeAssistantAPI } from '../api/ha-api.js';

export function createHAStore() {
    let connectionStatus = $state('disconnected');
    let floors = $state([]);
    let areas = $state([]);
    let entities = $state([]);
    let activeFloorId = $state(null);
    let activeAreaId = $state(null);
    let activeView = $state('dashboard'); // 'dashboard' | 'scheduler'
    let currentUrl = $state('');
    let currentToken = $state('');
    let ha = null;
    let isReconnectingLock = false;
    let isSubmitting = false; // Internal lock for submitting
    let schedules = $state([]);
    let loadingSchedules = $state(false);
    let currentEntityUnsubscribe = null;
    let currentSchedulerUnsubscribe = null;
    let sleepResolver = null;

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

        // Status updates only - NO auto-reconnect here!
        // The handleVisibilityChange in +page.svelte is the SOLE owner of reconnection.
        // Having two reconnect triggers causes a race condition where the socket connects,
        // then immediately dies, then reconnects again 17 seconds later (20s total delay on mobile).
        ha.onConnectionStatus = (status) => {
            console.log(`[V11] onConnectionStatus: ${status} (current: ${connectionStatus})`);
            if (status === 'disconnected' && connectionStatus === 'reconnecting') {
                // Don't overwrite 'reconnecting' with 'disconnected' while a reconnect loop is active
                return;
            }
            connectionStatus = status;
        };

        const tConnectStart = performance.now();
        await ha.connect();
        const tConnectEnd = performance.now();
        console.log(`[PERF_V15] WebSocket Connect + Auth took ${Math.round(tConnectEnd - tConnectStart)}ms`);

        // REVERT: Mobile browsers heavily throttle or suspend background Promises 
        // launched just as the app comes to foreground. We must await this synchronously
        // to ensure it executes with high priority before the UI fully unlocks.
        await loadInitialData();
    }

    /**
     * Verify if the current connection is actually alive.
     * Needs to be exported so `+page.svelte` can call it.
     */
    async function verifyConnection() {
        if (!ha || connectionStatus !== 'connected') return false;

        const originalHa = ha;
        const isAlive = await originalHa.ping(3000);

        if (ha !== originalHa) {
            return true;
        }

        if (!isAlive) {
            if (ha === originalHa) {
                ha.disconnect();
                ha = null;
            }
            if (!isReconnectingLock) {
                connectionStatus = 'disconnected';
            }
            return false;
        }

        return true;
    }

    /**
     * Reconnect using stored credentials with infinite retries (exponential backoff).
     * Protected by a lock to prevent concurrent reconnect loops.
     */
    async function reconnect() {
        if (isReconnectingLock) {
            return;
        }

        const url = currentUrl || localStorage.getItem('ha_url');
        const token = currentToken || localStorage.getItem('ha_token');

        if (!url || !token) {
            return;
        }

        isReconnectingLock = true;
        connectionStatus = 'reconnecting';

        let attempt = 1;
        const MAX_ATTEMPTS = 60; // Approx 5 minutes at 5s intervals

        // Retry loop for network drops (e.g. ERR_INTERNET_DISCONNECTED)
        while (isReconnectingLock && attempt <= MAX_ATTEMPTS) {
            connectionStatus = 'reconnecting'; // Protect state inside loop
            try {
                await initConnection(url, token);
                isReconnectingLock = false; // Break loop on success
                return;
            } catch (err) {
                if (err.message === 'Auth failed') {
                    localStorage.removeItem('ha_token');
                    connectionStatus = 'auth_failed';
                    isReconnectingLock = false;
                    return;
                }

                // Wait before retrying if lock is still active
                if (!isReconnectingLock) {
                    return;
                }

                // Exponential backoff, max 5 seconds, interruptible via sleepResolver
                const delayMs = Math.min(2000 * Math.pow(1.5, attempt - 1), 5000);
                await new Promise(resolve => {
                    let timeout = setTimeout(() => {
                        sleepResolver = null;
                        resolve();
                    }, delayMs);

                    sleepResolver = () => {
                        clearTimeout(timeout);
                        sleepResolver = null;
                        resolve(); // Instantly wake up the loop
                    };
                });
                attempt++;
            }
        }

        // Exceeded 60 attempts (~5 mins) while active
        if (isReconnectingLock) {
            isReconnectingLock = false;
            connectionStatus = 'reconnect_failed';
        }
    }

    /**
     * Allow user to manually abort an infinite reconnect loop.
     * Preserves localStorage so the login screen can pre-fill the inputs.
     */
    function cancelReconnect() {
        isReconnectingLock = false;

        // Instantly wake any sleeping reconnect loop so it cleanly exits
        if (sleepResolver) {
            sleepResolver();
        }

        connectionStatus = 'disconnected';
        if (ha) {
            ha.disconnect();
            ha = null;
        }
        currentUrl = '';
        currentToken = '';
    }

    async function loadInitialData() {
        if (!ha) return;

        try {
            // OPTIMIZATION: If we already have entities, this is a Reconnect. 
            // We only need to fetch States to sync missed events, no need to fetch Areas/Registry again!
            if (entities.length > 0) {
                // HOT RECONNECT: Run Delta Sync and Global Subscription concurrently!
                await Promise.all([
                    syncStates(),
                    loadSchedules(),
                    setupGlobalSubscription(),
                    setupSchedulerSubscription()
                ]);
            } else {
                // Cold Start: Fetch everything concurrently, then set up subscription
                const [fetchedFloors, fetchedAreas, entityRegistry, states, deviceRegistry, labelRegistry] = await Promise.all([
                    ha.getFloors(),
                    ha.getAreas(),
                    ha.getEntityRegistry(),
                    ha.getStates(),
                    ha.getDeviceRegistry(),
                    ha.getLabelRegistry()
                ]);

                floors = fetchedFloors.sort((a, b) => (a.level || 0) - (b.level || 0));
                areas = fetchedAreas;

                const deviceMap = new Map((deviceRegistry || []).map(d => [d.id, d]));
                const labelMap = new Map((labelRegistry || []).map(l => [l.label_id, l.name]));

                entities = states.map(state => {
                    const registryEntry = entityRegistry.find(e => e.entity_id === state.entity_id);
                    let labelSet = new Set();

                    if (registryEntry) {
                        if (registryEntry.labels) registryEntry.labels.forEach(l => labelSet.add(l));
                        if (registryEntry.device_id) {
                            const device = deviceMap.get(registryEntry.device_id);
                            if (device && device.labels) {
                                device.labels.forEach(l => labelSet.add(l));
                            }
                        }
                    }

                    const labelNames = Array.from(labelSet).map(id => labelMap.get(id) || id);

                    return {
                        ...state,
                        area_id: registryEntry ? registryEntry.area_id : null,
                        name: (registryEntry && registryEntry.name) || state.attributes.friendly_name || state.entity_id,
                        labels: labelNames
                    };
                });

                if (floors.length > 0) {
                    selectFloor(floors[0].floor_id);
                }

                // Now that entities are populated, set up the subscription
                await Promise.all([
                    setupGlobalSubscription(),
                    loadSchedules(),
                    setupSchedulerSubscription()
                ]);
            }

            ha.onStateChange = (event) => {
                updateEntityState(event.new_state);
            };

            ha.onSchedulerChange = (data) => {
                console.log('[Scheduler] Update event received:', data);
                loadSchedules(true); // background update
            };

        } catch (err) {
            console.error('Failed to load initial data:', err);
        }
    }

    async function syncStates() {
        if (!ha) return;
        const t0 = performance.now();
        const states = await ha.getStates();

        // OPTIMIZATION: Map lookup O(1) to prevent UI freeze
        const entityMap = new Map();
        const newEntities = [...entities];
        newEntities.forEach((e, i) => entityMap.set(e.entity_id, i));

        states.forEach(state => {
            const index = entityMap.get(state.entity_id);
            if (index !== undefined) {
                newEntities[index] = {
                    ...newEntities[index],
                    ...state,
                    attributes: state.attributes,
                    state: state.state
                };
            }
        });

        // Trigger Svelte reactivity exactly ONCE
        entities = newEntities;
        const t2 = performance.now();
        console.log(`[PERF_V13] Delta Sync completed in ${Math.round(t2 - t0)}ms`);
    }

    async function setupGlobalSubscription() {
        const dashboardDomains = ["input_boolean", "switch", "light", "input_number"];
        const dashboardEntityIds = entities
            .filter(e => e.area_id !== null && dashboardDomains.includes(e.entity_id.split(".")[0]))
            .map(e => e.entity_id);

        const tSubStart = performance.now();
        await updateSubscription(dashboardEntityIds);
        const tSubEnd = performance.now();
        console.log(`[PERF_V15] setupGlobalSubscription (HA Server Processing) took ${Math.round(tSubEnd - tSubStart)}ms`);
    }

    function selectFloor(floorId) {
        activeFloorId = floorId;
        activeView = 'dashboard'; // Always return to dashboard when selecting a floor
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

    function setActiveView(view) {
        activeView = view;
    }

    async function loadSchedules(isBackground = false) {
        if (!ha) return;

        if (!isBackground) {
            loadingSchedules = true;
        }

        try {
            const result = await ha.getSchedules();
            schedules = Array.isArray(result) ? result : [];
        } catch (err) {
            console.error('Failed to load schedules:', err);
        } finally {
            if (!isBackground) {
                loadingSchedules = false;
            }
        }
    }

    async function setupSchedulerSubscription() {
        if (!ha || connectionStatus !== 'connected') return;

        if (currentSchedulerUnsubscribe) {
            currentSchedulerUnsubscribe();
            currentSchedulerUnsubscribe = null;
        }

        try {
            currentSchedulerUnsubscribe = await ha.subscribeScheduler();
        } catch (err) {
            console.error('Failed to subscribe to scheduler:', err);
        }
    }

    function getSchedules() {
        return schedules;
    }

    async function addSchedule(data) {
        if (!ha) return Promise.reject('Not connected');
        const res = await ha.addSchedule(data);
        // Do NOT manually reload here, wait for WebSocket event
        return res;
    }

    async function deleteSchedule(scheduleId) {
        if (!ha) return Promise.reject('Not connected');
        const res = await ha.deleteSchedule(scheduleId);
        // Do NOT manually reload here
        return res;
    }

    async function editSchedule(data) {
        if (!ha) return Promise.reject('Not connected');
        const res = await ha.editSchedule(data);
        // Do NOT manually reload here
        return res;
    }

    function updateEntityState(newState) {
        if (!newState || !newState.entity_id) {
            console.warn('[HA Store] Invalid newState passed to updateEntityState:', newState);
            return;
        }

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

    /**
     * Instantly tear down the socket without prompting login.
     * Used by +page.svelte when bypassing the 3000ms ping check for extreme speed.
     */
    function forceDisconnectForFastRecovery() {
        if (ha) {
            ha.disconnect();
            ha = null;
        }
        connectionStatus = 'disconnected';
    }

    async function updateSubscription(entityIds) {
        if (!ha || connectionStatus !== 'connected') return;

        // Unsubscribe from previous trigger to avoid memory/event leaks on the server
        if (currentEntityUnsubscribe) {
            currentEntityUnsubscribe();
            currentEntityUnsubscribe = null;
        }

        if (entityIds && entityIds.length > 0) {
            try {
                currentEntityUnsubscribe = await ha.subscribeEntities(entityIds);
            } catch (err) {
                console.error('Failed to subscribe to entities:', err);
            }
        }
    }

    return {
        get connectionStatus() { return connectionStatus; },
        get floors() { return floors; },
        get areas() { return areas; },
        get entities() { return entities; },
        get activeFloorId() { return activeFloorId; },
        get activeAreaId() { return activeAreaId; },
        get activeView() { return activeView; },
        get currentUrl() { return currentUrl; },
        get currentToken() { return currentToken; },
        initConnection,
        reconnect,
        verifyConnection,
        cancelReconnect,
        forceDisconnectForFastRecovery,
        selectFloor,
        selectArea,
        setActiveView,
        toggleEntity,
        setNumber,
        updateEntityState,
        updateSubscription,
        getSchedules,
        loadSchedules,
        addSchedule,
        deleteSchedule,
        editSchedule,
        get schedules() { return schedules; },
        get loadingSchedules() { return loadingSchedules; }
    };
}

export const haStore = createHAStore();
