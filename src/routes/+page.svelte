<script>
    import { onMount } from "svelte";
    import { haStore } from "$lib/stores/ha-store.svelte";
    import Login from "$lib/components/Login.svelte";
    import Sidebar from "$lib/components/Sidebar.svelte";
    import Tabs from "$lib/components/Tabs.svelte";
    import EntityCard from "$lib/components/EntityCard.svelte";
    import QRConnect from "$lib/components/QRConnect.svelte";

    let activeEntities = $derived(
        haStore.entities.filter((e) => e.area_id === haStore.activeAreaId),
    );

    let isInitializing = $state(true);
    let isRecovering = false;
    let hiddenAt = 0; // Track when the app goes into the background

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
     * Browser native 'online' event.
     * Fires immediately when OS network is restored or DevTools offline box is unchecked.
     */
    async function handleOnline() {
        if (haStore.connectionStatus !== "connected") {
            isInitializing = true;
            await haStore.reconnect();
            isInitializing = false;
        }
    }

    async function handleOffline() {
        // Handle offline state if necessary
    }

    /**
     * Recovery strategy for Android backgrounding.
     * When returning to foreground, we must:
     * 1. Verify if our "connected" state is a lie (zombie socket).
     * 2. Reconnect with retries if we are disconnected or zombie.
     */
    async function handleVisibilityChange() {
        if (document.visibilityState === "hidden") {
            hiddenAt = Date.now();
            return;
        }

        if (document.visibilityState !== "visible") return;

        // Prevent competing reconnect loops if Android fires event multiple times
        if (isRecovering) {
            return;
        }

        try {
            isRecovering = true;
            const timeHiddenMs = Date.now() - hiddenAt;

            // Check 1: Are we genuinely connected?
            if (haStore.connectionStatus === "connected") {
                // EXTREME OPTIMIZATION FOR MOBILE ONLY:
                // Desktop browsers usually keep WebSockets alive in background tabs.
                // Mobile OSs (Android/iOS) murder them mercilessly to save battery.
                const isMobile =
                    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                        navigator.userAgent,
                    );

                if (isMobile && hiddenAt > 0 && timeHiddenMs > 5000) {
                    // Force the store to consider it disconnected to trigger immediate reconnect logic below
                    haStore.forceDisconnectForFastRecovery();
                } else {
                    const isAlive = await haStore.verifyConnection();
                    if (isAlive) {
                        return; // All good, nothing to do
                    }
                }
            } else if (haStore.connectionStatus === "reconnecting") {
                // Background reconnect loop might be sleeping in its 5s backoff.
                // Cancel it so we can start a fresh, 0-delay instant connecting loop immediately.
                haStore.cancelReconnect();
            }

            // Check 2: We are disconnected, or the verifyConnection failed
            const url = localStorage.getItem("ha_url");
            const token = localStorage.getItem("ha_token");

            if (!url || !token) return;

            isInitializing = true;
            await haStore.reconnect();
        } catch (err) {
            console.error("[Visibility EVENT] Reconnect flow failed:", err);
        } finally {
            isInitializing = false;
            isRecovering = false;
        }
    }
</script>

<svelte:window ononline={handleOnline} onoffline={handleOffline} />
<svelte:document onvisibilitychange={handleVisibilityChange} />

<div id="app">
    <header>
        <h1>
            HA Dashboard <span
                style="color: yellow; font-size: 0.5em; vertical-align: middle; background: #333; padding: 2px 6px; border-radius: 4px; margin-left: 8px; -webkit-text-fill-color: initial;"
                >[TEST V8]</span
            >
        </h1>
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
                    onclick={() => {
                        haStore.cancelReconnect();
                        isInitializing = false;
                        isRecovering = false;
                    }}
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
            </main>
        </div>
    {/if}
</div>
