<script>
    import { onMount } from "svelte";
    import { haStore } from "$lib/stores/ha-store.svelte";
    import Login from "$lib/components/Login.svelte";
    import Sidebar from "$lib/components/Sidebar.svelte";
    import Tabs from "$lib/components/Tabs.svelte";
    import EntityCard from "$lib/components/EntityCard.svelte";
    import QRConnect from "$lib/components/QRConnect.svelte";
    import SchedulerLikeCard from "$lib/components/SchedulerLikeCard.svelte";

    /** @param {string} domain */
    function schedulerIconFor(domain) {
        if (domain === "light") return "L";
        if (domain === "switch") return "S";
        if (domain === "input_boolean") return "B";
        if (domain === "input_number") return "N";
        return "T";
    }

    /** @param {string} domain */
    function schedulerActionFor(domain) {
        if (domain === "input_number") return "set value";
        return "turn on";
    }

    const schedulerTimeCycle = [
        "at 06:40",
        "at sunset (21:20)",
        "at 14:00",
        "at 20:20",
        "at 09:00",
        "at 23:10",
    ];

    const schedulerDayCycle = [
        "every day",
        "every tuesday and thursday",
        "every saturday and sunday",
        "every monday",
    ];

    let activeEntities = $derived(
        haStore.entities.filter((e) => e.area_id === haStore.activeAreaId),
    );

    let schedulerItems = $derived(
        haStore.entities
            .filter((entity) => {
                const domain = entity.entity_id.split(".")[0];
                return [
                    "input_boolean",
                    "switch",
                    "light",
                    "input_number",
                ].includes(domain);
            })
            .slice(0, 6)
            .map((entity, index) => {
                const domain = entity.entity_id.split(".")[0];
                return {
                    id: entity.entity_id,
                    icon: schedulerIconFor(domain),
                    name:
                        entity.attributes?.friendly_name ||
                        entity.name ||
                        entity.entity_id,
                    action: schedulerActionFor(domain),
                    days: schedulerDayCycle[index % schedulerDayCycle.length],
                    time: schedulerTimeCycle[index % schedulerTimeCycle.length],
                    enabled: entity.state !== "off",
                };
            }),
    );

    let isInitializing = $state(true);
    let isRecovering = false;

    onMount(async () => {
        // Auto-connect if url and token are provided via query string (QR code scan)
        const params = new URLSearchParams(window.location.search);
        let connectUrl = params.get("url");
        let connectToken = params.get("token");

        if (connectUrl && connectToken) {
            // Save newly scanned credentials to local storage for PWA persistence
            localStorage.setItem("ha_url", connectUrl);
            localStorage.setItem("ha_token", connectToken);

            // Clean up the URL so the token is not visible in the address bar
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
        } else {
            // No URL params, try loading from local storage
            connectUrl = localStorage.getItem("ha_url");
            connectToken = localStorage.getItem("ha_token");
        }

        if (connectUrl && connectToken) {
            // Rely completely on the bulletproof infinite reconnect loop in the store
            haStore.reconnect().finally(() => {
                isInitializing = false;
            });
        } else {
            isInitializing = false;
        }
    });

    /**
     * Recovery strategy for Android backgrounding.
     * When returning to foreground, we must:
     * 1. Verify if our "connected" state is a lie (zombie socket).
     * 2. Reconnect with retries if we are disconnected or zombie.
     */
    async function handleVisibilityChange() {
        if (document.visibilityState !== "visible") return;

        // Prevent competing reconnect loops if Android fires event multiple times
        if (isRecovering) {
            console.log(
                "[Visibility] Recovery already in progress, ignoring duplicate event.",
            );
            return;
        }

        try {
            isRecovering = true;

            // Check 1: Are we genuinely connected?
            if (haStore.connectionStatus === "connected") {
                const isAlive = await haStore.verifyConnection();
                if (isAlive) return; // All good, nothing to do
            }

            // Check 2: We are disconnected, or the verifyConnection failed
            const url = localStorage.getItem("ha_url");
            const token = localStorage.getItem("ha_token");

            if (!url || !token) return;

            console.log(
                "[Visibility] PWA returned to foreground. Need reconnect.",
            );
            isInitializing = true;

            await haStore.reconnect();
        } catch (err) {
            console.error("[Visibility] Reconnect flow failed:", err);
        } finally {
            isInitializing = false;
            isRecovering = false;
        }
    }
</script>

<svelte:document onvisibilitychange={handleVisibilityChange} />

<div id="app">
    <header>
        <h1>HA Dashboard</h1>
        <div class="header-actions">
            {#if haStore.connectionStatus === "connected"}
                <div class="desktop-only">
                    <QRConnect />
                </div>
            {/if}
            <div class="status-badge">
                <span
                    class="status-indicator"
                    class:connected={haStore.connectionStatus === "connected"}
                    class:error={haStore.connectionStatus === "error" ||
                        haStore.connectionStatus === "auth_failed"}
                ></span>
                <span id="conn-status">
                    {#if haStore.connectionStatus === "connected"}
                        Connected
                    {:else if haStore.connectionStatus === "error" || haStore.connectionStatus === "auth_failed"}
                        Auth Failed
                    {:else}
                        Disconnected
                    {/if}
                </span>
            </div>
        </div>
    </header>

    {#if isInitializing || haStore.connectionStatus === "reconnecting"}
        <div
            class="loading-screen glass-panel"
            style="margin: 2rem auto; max-width: 400px; text-align: center; padding: 2rem;"
        >
            <div class="spinner"></div>
            <p style="margin-top: 1rem; color: var(--text-dim);">
                {haStore.connectionStatus === "reconnecting"
                    ? "Reconnecting to Home Assistant..."
                    : "Connecting to Home Assistant..."}
            </p>
            {#if haStore.connectionStatus === "reconnecting" || !isInitializing}
                <button
                    class="btn secondary"
                    style="margin-top: 2rem; width: 100%;"
                    onclick={() => haStore.cancelReconnect()}
                >
                    Cancel / Change Server
                </button>
            {/if}
        </div>
    {:else if haStore.connectionStatus !== "connected"}
        <Login />
    {:else}
        <div id="main-layout">
            <Sidebar />

            <main class="content-area">
                <Tabs />

                <section id="dashboard-section">
                    {#if haStore.activeAreaId && activeEntities.length > 0}
                        {#each activeEntities as entity (entity.entity_id)}
                            {#if ["input_boolean", "switch", "light", "input_number"].includes(entity.entity_id.split(".")[0])}
                                <EntityCard {entity} />
                            {/if}
                        {/each}
                    {:else if haStore.activeAreaId}
                        <div style="color: #64748b; padding: 1rem;">
                            No supported entities found in this area.
                        </div>
                    {/if}
                </section>

                <section class="scheduler-preview">
                    <SchedulerLikeCard items={schedulerItems} />
                </section>
            </main>
        </div>
    {/if}
</div>
