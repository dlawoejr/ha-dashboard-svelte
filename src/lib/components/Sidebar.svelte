<script>
    import { haStore } from "../stores/ha-store.svelte.js";
</script>

<aside id="sidebar" class="glass-panel">
    {#if haStore.floors.length === 0}
        <div class="sidebar-item no-floors">No Floors Configured</div>
    {:else}
        {#each haStore.floors as floor}
            <button
                class="sidebar-item {floor.floor_id === haStore.activeFloorId &&
                haStore.activeView === 'dashboard'
                    ? 'active'
                    : ''}"
                onclick={() => haStore.selectFloor(floor.floor_id)}
                type="button"
            >
                <span class="icon">🏢</span>
                {floor.name}
            </button>
        {/each}
    {/if}

    <!-- Scheduler menu item -->
    <div class="sidebar-divider"></div>
    <button
        class="sidebar-item {haStore.activeView === 'scheduler'
            ? 'active'
            : ''}"
        onclick={() => haStore.setActiveView("scheduler")}
        type="button"
    >
        <span class="icon">📅</span> 스케줄러
    </button>
</aside>

<style>
    .sidebar-item {
        width: 100%;
        text-align: left;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        border: none;
        background: transparent;
        font-family: inherit;
        font-size: 0.95rem;
    }

    .icon {
        font-size: 1.1rem;
    }

    .no-floors {
        padding: 1rem;
        text-align: center;
        opacity: 0.5;
    }
</style>
