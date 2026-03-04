<script>
    import { haStore } from "../stores/ha-store.svelte.js";
    import { fade, scale } from "svelte/transition";

    let { entity } = $props();

    let domain = $derived(entity.entity_id.split(".")[0]);
    let name = $derived(entity.name || entity.entity_id);
    let state = $derived(entity.state);
    let attrs = $derived(entity.attributes || {});

    // For input_number
    let numValue = $state(0);

    // Sync local state when external state changes
    $effect(() => {
        if (domain === "input_number") {
            numValue = parseFloat(state) || 0;
        }
    });

    async function handleToggle(e) {
        const isChecked = e.target.checked;
        // Optimistic UI update
        haStore.updateEntityState({
            entity_id: entity.entity_id,
            state: isChecked ? "on" : "off",
            attributes: attrs,
        });

        try {
            await haStore.toggleEntity(entity.entity_id, isChecked, domain);
        } catch (err) {
            console.error("Toggle failed, reverting state", err);
            // Revert on failure
            haStore.updateEntityState({
                entity_id: entity.entity_id,
                state: state,
                attributes: attrs,
            });
        }
    }

    async function handleNumberChange(e) {
        const val = parseFloat(e.target.value);
        numValue = val;

        // Optimistic UI update
        haStore.updateEntityState({
            entity_id: entity.entity_id,
            state: val.toString(),
            attributes: attrs,
        });

        try {
            await haStore.setNumber(entity.entity_id, val);
        } catch (err) {
            console.error("Number change failed, reverting state", err);
            // Revert on failure
            numValue = parseFloat(state) || 0;
            haStore.updateEntityState({
                entity_id: entity.entity_id,
                state: state,
                attributes: attrs,
            });
        }
    }
</script>

<div class="entity-card" data-id={entity.entity_id} in:fade={{ duration: 400 }}>
    {#if ["input_boolean", "switch", "light"].includes(domain)}
        <div class="entity-header">
            <span class="entity-type">{domain.replace("_", " ")}</span>
            <label class="switch">
                <input
                    type="checkbox"
                    checked={state === "on"}
                    onchange={handleToggle}
                />
                <span class="slider"></span>
            </label>
        </div>
        <div class="entity-name">{name}</div>
        <div class="entity-state {state}">
            {#key state}
                <span in:scale={{ duration: 300, start: 0.9 }}>
                    {state.toUpperCase()}
                </span>
            {/key}
        </div>
    {:else if domain === "input_number"}
        <!-- Input Number UI -->
        <div class="entity-header">
            <span class="entity-type">Value Controller</span>
            <div class="number-input-group">
                <input
                    type="number"
                    class="number-input"
                    min={attrs.min || 0}
                    max={attrs.max || 100}
                    step={attrs.step || 1}
                    value={numValue}
                    onchange={handleNumberChange}
                />
                <span class="unit">{attrs.unit_of_measurement || ""}</span>
            </div>
        </div>
        <div class="entity-name">{name}</div>
        <div class="slider-container">
            <input
                type="range"
                class="range-slider"
                min={attrs.min || 0}
                max={attrs.max || 100}
                step={attrs.step || 1}
                value={numValue}
                oninput={(e) => (numValue = parseFloat(e.target.value))}
                onchange={handleNumberChange}
            />
            <div
                class="slider-track-fill"
                style="width: {((numValue - (attrs.min || 0)) /
                    ((attrs.max || 100) - (attrs.min || 0))) *
                    100}%"
            ></div>
        </div>
    {:else}
        <!-- Fallback for unsupported domains -->
        <div class="entity-header">
            <span class="entity-type">{domain}</span>
        </div>
        <div class="entity-name">{name}</div>
        <div class="entity-state">{state}</div>
    {/if}
</div>

<style>
    .slider-container {
        position: relative;
        width: 100%;
        height: 24px;
        display: flex;
        align-items: center;
    }

    .slider-track-fill {
        position: absolute;
        left: 0;
        height: 6px;
        background: var(--accent-gradient);
        border-radius: 5px;
        pointer-events: none;
        z-index: 1;
        box-shadow: 0 0 10px hsla(var(--h-accent), var(--s-accent), 60%, 0.3);
    }

    .range-slider {
        z-index: 2;
        margin: 0 !important;
    }

    .entity-state span {
        display: inline-block;
    }

    .entity-state.on {
        color: var(--success);
        text-shadow: 0 0 15px hsla(150, 84%, 39%, 0.4);
    }

    .entity-state.off {
        color: var(--danger);
        text-shadow: 0 0 15px hsla(0, 84%, 60%, 0.4);
    }
</style>
