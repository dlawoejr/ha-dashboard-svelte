<script>
    import { haStore } from "../stores/ha-store.svelte.js";

    let floorAreas = $derived(
        haStore.areas
            .filter((area) => area.floor_id === haStore.activeFloorId)
            .sort((a, b) => a.name.localeCompare(b.name)),
    );
</script>

<nav id="area-tabs" class="glass-panel">
    {#if floorAreas.length === 0}
        <div class="tab-item">No Areas</div>
    {:else}
        {#each floorAreas as area}
            <button
                class="tab-item {area.area_id === haStore.activeAreaId
                    ? 'active'
                    : ''}"
                onclick={() => haStore.selectArea(area.area_id)}
            >
                {area.name}
            </button>
        {/each}
    {/if}
</nav>
