<script>
    import { haStore } from "$lib/stores/ha-store.svelte";

    let { group } = $props();

    // Extracted props
    let numberEntity = $derived(group.number_entity);
    let booleans = $derived(group.boolean_entities); // [boolA, boolB]

    let amount = $derived(parseFloat(numberEntity.state) || 0);
    // 0-100% calculation
    let percentage = $derived(Math.max(0, Math.min(100, (amount / 100) * 100)));

    // Switch state from booleans
    // Up: A On, B Off
    // Down: A Off, B On
    // Center: A Off, B Off
    let boolA = $derived(booleans[0]);
    let boolB = $derived(booleans[1]);

    let isUp = $derived(boolA.state === "on" && boolB.state === "off");
    let isDown = $derived(boolA.state === "off" && boolB.state === "on");
    let isCenter = $derived(boolA.state === "off" && boolB.state === "off");

    function setUp() {
        if (isDown) return; // Prevent direct Down -> Up
        if (!isUp) {
            haStore.toggleEntity(boolA.entity_id, true, "input_boolean");
            haStore.toggleEntity(boolB.entity_id, false, "input_boolean");
        }
    }
    function setDown() {
        if (isUp) return; // Prevent direct Up -> Down
        if (!isDown) {
            haStore.toggleEntity(boolA.entity_id, false, "input_boolean");
            haStore.toggleEntity(boolB.entity_id, true, "input_boolean");
        }
    }
    function setCenter() {
        if (!isCenter) {
            haStore.toggleEntity(boolA.entity_id, false, "input_boolean");
            haStore.toggleEntity(boolB.entity_id, false, "input_boolean");
        }
    }

    // Needle angle calculation: 0% is left (-90deg), 100% is right (+90deg)
    let needleAngle = $derived(-90 + (percentage / 100) * 180);

    // --- Drag and Drop Switch ---
    // Track total height = 130px, padding top/bottom = 10px
    // Usable track = 110px, 3 positions: 0px, 55px, 110px
    // Knob height = 40px, offset = knobTop
    let switchPositions = [0, 55, 110]; // top positions for Up, Center, Down
    let currentSwitchIndex = $derived(isUp ? 0 : isDown ? 2 : 1);
    let knobTop = $derived(switchPositions[currentSwitchIndex]);

    let isDragging = $state(false);
    let dragY = $state(0);
    let dragKnobTop = $state(0);
    let optimisticIndex = $state(-1); // -1 = no override

    // Effective top position: drag > optimistic > actual
    let effectiveTop = $derived(
        isDragging
            ? dragKnobTop
            : optimisticIndex >= 0
              ? switchPositions[optimisticIndex]
              : knobTop,
    );

    // Clear optimistic override when HA state catches up
    $effect(() => {
        if (optimisticIndex >= 0 && currentSwitchIndex === optimisticIndex) {
            optimisticIndex = -1;
        }
    });

    function onPointerDown(e) {
        isDragging = true;
        dragY = e.clientY;
        dragKnobTop = effectiveTop;
        e.target.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e) {
        if (!isDragging) return;
        const delta = e.clientY - dragY;
        dragKnobTop = Math.max(0, Math.min(110, knobTop + delta));
    }

    function onPointerUp() {
        if (!isDragging) return;
        isDragging = false;
        // Snap to nearest position
        let nearest = 0;
        let minDist = Math.abs(dragKnobTop - switchPositions[0]);
        for (let i = 1; i < switchPositions.length; i++) {
            const dist = Math.abs(dragKnobTop - switchPositions[i]);
            if (dist < minDist) {
                minDist = dist;
                nearest = i;
            }
        }
        // Set optimistic position immediately
        optimisticIndex = nearest;
        // Apply action based on snapped position
        if (nearest === 0) setUp();
        else if (nearest === 2) setDown();
        else setCenter();
    }
</script>

<div class="label-group-card glass-panel">
    <div class="content">
        <!-- Gauge part -->
        <div class="gauge-container">
            <div class="gauge">
                <svg viewBox="0 0 100 60" class="gauge-svg" overflow="visible">
                    <!-- Solid Blue Background arc (Track) -->
                    <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        stroke="#0ea5e9"
                        stroke-width="12"
                        stroke-linecap="butt"
                    />
                    <!-- Yellow Wedge Needle -->
                    <!-- Base at y=30 to leave gap for number area near center(y=50) -->
                    <polygon
                        points="46,30 54,30 50,4"
                        fill="#facc15"
                        style="transform: rotate({needleAngle}deg); transform-origin: 50px 50px; transition: transform 0.5s ease;"
                    />
                </svg>
                <div class="gauge-center">
                    <span class="gauge-value">{Math.round(amount)}</span>
                    <span class="gauge-unit">%</span>
                </div>
            </div>
            <div class="gauge-label">{group.label_name} 열림 상태</div>
        </div>

        <!-- 3-Way Switch (Vertical Pill with Drag) -->
        <div class="switch-container">
            <!-- Track and Knob -->
            <div class="switch-track">
                <div
                    class="switch-knob"
                    style="top: {effectiveTop}px;"
                    onpointerdown={onPointerDown}
                    onpointermove={onPointerMove}
                    onpointerup={onPointerUp}
                    role="slider"
                    aria-valuenow={currentSwitchIndex}
                    tabindex="0"
                ></div>
            </div>
            <!-- Labels next to the track -->
            <div class="switch-labels">
                <button
                    class="switch-label"
                    class:active={isUp}
                    ondblclick={setUp}>열기</button
                >
                <button
                    class="switch-label"
                    class:active={isCenter}
                    ondblclick={setCenter}>정지</button
                >
                <button
                    class="switch-label"
                    class:active={isDown}
                    ondblclick={setDown}>닫기</button
                >
            </div>
        </div>
    </div>
</div>

<style>
    .label-group-card {
        padding: 1.2rem;
        border-radius: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        background: rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(10px);
        box-shadow:
            0 4px 6px -1px rgba(0, 0, 0, 0.1),
            0 2px 4px -1px rgba(0, 0, 0, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .content {
        display: flex;
        justify-content: space-around;
        align-items: center;
    }
    .gauge-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
    }
    .gauge {
        width: 180px; /* Bigger gauge */
        position: relative;
    }
    .gauge-svg {
        width: 100%;
        display: block;
    }
    .gauge-center {
        position: absolute;
        bottom: 5px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: baseline;
        gap: 2px;
        z-index: 3;
    }
    .gauge-value {
        font-size: 2.2rem;
        font-weight: 800;
        color: var(--text-color, #fff);
    }
    .gauge-unit {
        font-size: 1rem;
        font-weight: 600;
        color: var(--text-dim, #94a3b8);
    }
    .gauge-label {
        margin-top: 5px;
        font-size: 0.85rem;
        color: var(--text-dim, #94a3b8);
        text-align: center;
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* 3-Way Switch: Vertical pill with drag knob */
    .switch-container {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 10px;
    }
    .switch-track {
        width: 30px;
        height: 150px; /* 10+130+10 */
        background: #1e293b;
        border-radius: 15px;
        position: relative;
        padding: 10px 0;
        cursor: pointer;
    }
    .switch-knob {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        width: 26px;
        height: 40px;
        background: #3b82f6;
        border-radius: 13px;
        box-shadow: 0 0 12px rgba(59, 130, 246, 0.5);
        cursor: grab;
        touch-action: none;
    }
    .switch-knob:active {
        cursor: grabbing;
        box-shadow: 0 0 18px rgba(59, 130, 246, 0.7);
    }
    .switch-labels {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        height: 150px;
        padding: 8px 0;
    }
    .switch-label {
        border: none;
        background: transparent;
        color: var(--text-dim, #94a3b8);
        font-size: 0.85rem;
        font-weight: 500;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 8px;
        transition: all 0.2s;
        text-align: left;
    }
    .switch-label:hover {
        color: var(--text-color, #fff);
    }
    .switch-label.active {
        color: #3b82f6;
        font-weight: 700;
    }
</style>
