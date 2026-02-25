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
        if (typeof document === "undefined") return;

        const now = new Date().toISOString();
        if (document.visibilityState === "hidden") {
            console.log(
                `[V12 TIMER] OS triggered background -> EVENT at ${now}`,
            );
            hiddenAt = Date.now();

            // CRITICAL FIX: When going to background, ALWAYS cancel any in-progress
            // reconnect and reset the recovery lock. This prevents the deadlock where
            // a user briefly opens the app, triggers reconnect(), then backgrounds it again.
            // Without this reset, isRecovering stays true forever and blocks the next foreground attempt.
            if (isRecovering) {
                console.log(
                    `[V12 TIMER] Cancelling in-progress reconnect & resetting lock for next foreground event`,
                );
                haStore.cancelReconnect();
                isRecovering = false;
                isInitializing = false;
            }
            return;
        }

        if (document.visibilityState !== "visible") return;

        console.log(`[V11 TIMER] OS triggered foreground -> EVENT at ${now}`);

        // Prevent competing reconnect loops if Android fires event multiple times
        if (isRecovering) {
            console.log(`[V11 TIMER] Already recovering. Ignored.`);
            return;
        }

        try {
            isRecovering = true;
            const timeHiddenMs = Date.now() - hiddenAt;
            console.log(
                `[V11 TIMER] Device was hidden for ${timeHiddenMs}ms...`,
            );

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
                    console.log(
                        `[V11 TIMER] Mobile > 5s logic HIT. Forcing Disconnect at ${new Date().toISOString()}`,
                    );
                    haStore.forceDisconnectForFastRecovery();
                } else {
                    console.log(
                        `[V11 TIMER] verifying connection (ping)... at ${new Date().toISOString()}`,
                    );
                    const isAlive = await haStore.verifyConnection();
                    console.log(
                        `[V11 TIMER] verifyConnection result: ${isAlive} at ${new Date().toISOString()}`,
                    );
                    if (isAlive) {
                        return; // All good, nothing to do
                    }
                }
            } else if (haStore.connectionStatus === "reconnecting") {
                // Background reconnect loop might be sleeping in its 5s backoff.
                // Cancel it so we can start a fresh, 0-delay instant connecting loop immediately.
                console.log(
                    `[V11 TIMER] cancelling background loop... at ${new Date().toISOString()}`,
                );
                haStore.cancelReconnect();
            }

            // Check 2: We are disconnected, or the verifyConnection failed
            const url = localStorage.getItem("ha_url");
            const token = localStorage.getItem("ha_token");

            if (!url || !token) return;

            // SILENT RECONNECT: Do NOT set isInitializing = true!
            // The user already has a fully rendered dashboard from the previous session.
            // We reconnect entirely in the background. Svelte's $state reactivity will
            // silently update button colors the instant fresh data arrives.
            // The loading screen only appears on cold starts (no cached entities).
            console.log(
                `[V12] Silent reconnect started at ${new Date().toISOString()}`,
            );
            haStore
                .reconnect()
                .then(() => {
                    console.log(
                        `[V12] Silent reconnect FINISHED at ${new Date().toISOString()}`,
                    );
                })
                .catch((e) => console.error(e));
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
                >[TEST V15]</span
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

    {#if isInitializing || haStore.connectionStatus === "reconnect_failed"}
        <div
            class="loading-screen glass-panel"
            style="margin: 2rem auto; max-width: 400px; text-align: center; padding: 2rem;"
        >
            {#if haStore.connectionStatus === "reconnect_failed"}
                <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
                <h2 style="color: var(--text-color); margin-bottom: 0.5rem;">
                    Connection Lost
                </h2>
                <p style="color: var(--text-dim); margin-bottom: 2rem;">
                    Unable to reach Home Assistant after 5 minutes.<br />Please
                    check your network.
                </p>
                <button
                    class="btn primary"
                    style="width: 100%; margin-bottom: 1rem;"
                    onclick={() => {
                        isInitializing = true;
                        haStore.reconnect();
                    }}
                >
                    Retry Connection
                </button>
            {:else}
                <div class="spinner"></div>
                <p style="margin-top: 1rem; color: var(--text-dim);">
                    {haStore.connectionStatus === "reconnecting"
                        ? "Reconnecting to Home Assistant..."
                        : "Connecting to Home Assistant..."}
                </p>
            {/if}

            <button
                class="btn secondary"
                style="margin-top: 1rem; width: 100%;"
                onclick={() => {
                    haStore.cancelReconnect();
                    isInitializing = false;
                    isRecovering = false;
                }}
            >
                Cancel / Change Server
            </button>
        </div>
    {:else if haStore.connectionStatus !== "connected" && haStore.entities.length === 0}
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
