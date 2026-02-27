<script>
    import { haStore } from "../stores/ha-store.svelte.js";
</script>

<aside id="sidebar" class="glass-panel">
    {#if haStore.floors.length === 0}
        <div class="sidebar-item">No Floors Configured</div>
    {:else}
        {#each haStore.floors as floor}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                class="sidebar-item {floor.floor_id === haStore.activeFloorId
                    ? 'active'
                    : ''}"
                onclick={() => haStore.selectFloor(floor.floor_id)}
            >
                {floor.name}
            </div>
        {/each}
    {/if}

    <!-- Scheduler menu item -->
    <div class="sidebar-divider"></div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="sidebar-item {haStore.activeView === 'scheduler'
            ? 'active'
            : ''}"
        onclick={() => haStore.setActiveView("scheduler")}
    >
        📅 스케줄러
    </div>
</aside>
