<script>
    import { onMount } from "svelte";
    import { haStore } from "../stores/ha-store.svelte.js";

    let url = $state("");
    let token = $state("");
    let errorMessage = $state("");
    let isConnecting = $state(false);

    onMount(() => {
        const savedUrl = localStorage.getItem("ha_url");
        if (savedUrl) {
            url = savedUrl;
        } else {
            url = "http://localhost:8123";
        }
    });

    async function handleConnect() {
        if (!url || !token) {
            errorMessage = "URL and Token are required!";
            return;
        }

        isConnecting = true;
        errorMessage = "";

        // Clean up the URL just in case the user pasted the WebSocket address directly
        // or a previous bug stored it that way
        let cleanUrl = url;
        if (cleanUrl.endsWith("/api/websocket")) {
            cleanUrl = cleanUrl.replace("/api/websocket", "");
        }
        cleanUrl = cleanUrl
            .replace("ws://", "http://")
            .replace("wss://", "https://");

        try {
            await haStore.initConnection(cleanUrl, token);
            localStorage.setItem("ha_url", cleanUrl);
            localStorage.setItem("ha_token", token);
            url = cleanUrl; // Update input field to show clean URL
        } catch (err) {
            errorMessage =
                err instanceof Error
                    ? err.message
                    : "Connection failed. Check console for details.";
        } finally {
            isConnecting = false;
        }
    }
</script>

<section id="login-section" class="glass-panel">
    <div class="input-group">
        <label for="ha-url">Home Assistant Instance URL</label>
        <input
            type="text"
            id="ha-url"
            placeholder="http://homeassistant.local:8123"
            bind:value={url}
        />
    </div>
    <div class="input-group">
        <label for="ha-token">Long-Lived Access Token</label>
        <input
            type="password"
            id="ha-token"
            placeholder="Paste your token here"
            bind:value={token}
        />
    </div>
    <button id="btn-connect" onclick={handleConnect} disabled={isConnecting}>
        {isConnecting ? "Connecting..." : "Connect to Dashboard"}
    </button>

    {#if errorMessage || haStore.connectionStatus === "auth_failed"}
        <div
            class="error-message"
            style="color: #ef4444; margin-top: 1rem; text-align: center;"
        >
            {errorMessage || "Authentication Failed"}
        </div>
    {/if}
</section>
