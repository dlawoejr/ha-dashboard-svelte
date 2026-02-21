<script>
    import { onMount } from "svelte";
    import QRCode from "qrcode";
    import { haStore } from "../stores/ha-store.svelte";

    let showModal = $state(false);
    let qrDataUrl = $state("");

    async function generateQR() {
        if (!haStore.currentUrl || !haStore.currentToken) return;

        const connectUrl = new URL(window.location.origin);
        connectUrl.searchParams.set("url", haStore.currentUrl);
        connectUrl.searchParams.set("token", haStore.currentToken);

        try {
            qrDataUrl = await QRCode.toDataURL(connectUrl.toString(), {
                width: 300,
                margin: 2,
                color: {
                    dark: "#0f172a",
                    light: "#ffffff",
                },
            });
            showModal = true;
        } catch (err) {
            console.error("Failed to generate QR code", err);
        }
    }

    function closeModal() {
        showModal = false;
    }
</script>

<button class="qr-btn" onclick={generateQR} title="Connect Mobile Device">
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
    >
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
        <line x1="12" y1="18" x2="12.01" y2="18"></line>
    </svg>
    <span>📱 Mobile</span>
</button>

{#if showModal}
    <div class="modal-backdrop" onclick={closeModal}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="modal-content" onclick={(e) => e.stopPropagation()}>
            <div class="modal-header">
                <h2>Connect Mobile Device</h2>
                <button class="close-btn" onclick={closeModal}>✕</button>
            </div>
            <div class="modal-body">
                <p>
                    Scan this QR code with your mobile device's camera to
                    instantly connect to this Home Assistant dashboard.
                </p>
                {#if qrDataUrl}
                    <img
                        src={qrDataUrl}
                        alt="Connection QR Code"
                        class="qr-image"
                    />
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .qr-btn {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        padding: 0.5rem 1rem;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s ease;
    }

    .qr-btn:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .modal-content {
        background: rgba(30, 41, 59, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 1.5rem;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        color: white;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
    }

    .modal-header h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
    }

    .close-btn {
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0;
        line-height: 1;
    }

    .close-btn:hover {
        color: white;
    }

    .modal-body p {
        color: #94a3b8;
        font-size: 0.9rem;
        line-height: 1.5;
        margin-bottom: 1.5rem;
        text-align: center;
    }

    .qr-image {
        display: block;
        margin: 0 auto;
        border-radius: 8px;
        background: white;
        padding: 0.5rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
</style>
