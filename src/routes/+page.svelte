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
            // Attempt to connect with up to 3 retries for cold start reliability
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    await haStore.initConnection(connectUrl, connectToken);
                    break; // Success, stop retrying
                } catch (err) {
                    console.error(
                        `[Mount] Connection attempt ${attempt}/3 failed:`,
                        err,
                    );
                    if (attempt < 3) {
                        await new Promise((r) => setTimeout(r, 1500)); // Wait before retry
                    }
                }
            }
        }

        isInitializing = false;
    });

    /**
     * Backup strategy for Android zombie sockets.
     * When the page becomes visible again (user returns from background),
     * actively check if the WebSocket is still alive.
     */
    function handleVisibilityChange() {
        if (document.visibilityState === "visible") {
            console.log(
                "[Visibility] Page became visible, checking connection health...",
            );
            haStore.checkAndReconnect();
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
            style="margin: 2rem auto; max-width: 400px; text-align: center;"
        >
            <div class="spinner"></div>
            <p style="margin-top: 1rem; color: var(--text-dim);">
                {haStore.connectionStatus === "reconnecting"
                    ? "Reconnecting to Home Assistant..."
                    : "Connecting to Home Assistant..."}
            </p>
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
