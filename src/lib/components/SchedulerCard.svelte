<script>
    import { haStore } from "$lib/stores/ha-store.svelte";
    import { fade } from "svelte/transition";

    // Form state
    let selectedEntity = $state("");
    let selectedAction = $state("turn_on");
    let timeHour = $state(8);
    let timeMinute = $state(0);
    let scheduleName = $state("");
    let selectedDays = $state(["daily"]);
    let isSubmitting = $state(false);
    let showModal = $state(false);

    // Edit mode
    let editingScheduleId = $state(null); // null = create mode, string = edit mode

    const dayOptions = [
        { value: "daily", label: "매일" },
        { value: "workday", label: "평일" },
        { value: "weekend", label: "주말" },
        { value: "mon", label: "월" },
        { value: "tue", label: "화" },
        { value: "wed", label: "수" },
        { value: "thu", label: "목" },
        { value: "fri", label: "금" },
        { value: "sat", label: "토" },
        { value: "sun", label: "일" },
    ];

    // input_boolean entities that belong to a floor/area (dashboard-managed only)
    let booleanEntities = $derived(
        haStore.entities
            .filter(
                (e) => e.entity_id.startsWith("input_boolean.") && e.area_id,
            )
            .map((e) => {
                const label =
                    e.labels && e.labels.length > 0 ? e.labels[0] : "";
                const idNum = parseInt(e.entity_id.split("_").pop()) || 0;
                const suffix = idNum % 2 !== 0 ? " 열기" : " 닫기";
                const displayName = label ? label + suffix : e.name;
                return { ...e, displayName };
            }),
    );

    // Load schedules on mount
    $effect(() => {
        if (haStore.activeView === "scheduler") {
            haStore.loadSchedules();
        }
    });

    function toggleDay(day) {
        const special = ["daily", "workday", "weekend"];
        if (special.includes(day)) {
            selectedDays = [day];
        } else {
            let newDays = selectedDays.filter((d) => !special.includes(d));
            if (newDays.includes(day)) {
                newDays = newDays.filter((d) => d !== day);
            } else {
                newDays.push(day);
            }
            selectedDays = newDays.length > 0 ? newDays : ["daily"];
        }
    }

    function resetForm() {
        editingScheduleId = null;
        selectedEntity = "";
        selectedAction = "turn_on";
        timeHour = 8;
        timeMinute = 0;
        scheduleName = "";
        selectedDays = ["daily"];
        showModal = false;
    }

    function startAdd() {
        resetForm();
        showModal = true;
    }

    function startEdit(schedule) {
        editingScheduleId = schedule.schedule_id;
        scheduleName = schedule.name || "";
        selectedDays = schedule.weekdays || ["daily"];

        // Parse time
        const ts = schedule.timeslots?.[0];
        if (ts?.start) {
            const parts = ts.start.split(":");
            timeHour = parseInt(parts[0]) || 0;
            timeMinute = parseInt(parts[1]) || 0;
        }

        // Parse entity & action
        const action = ts?.actions?.[0];
        if (action) {
            selectedEntity = action.entity_id || "";
            selectedAction = (action.service || "").includes("turn_on")
                ? "turn_on"
                : "turn_off";
        }
        showModal = true;
    }

    async function handleSubmit() {
        if (!selectedEntity || isSubmitting) return;
        isSubmitting = true;

        const timeStr = `${String(timeHour).padStart(2, "0")}:${String(timeMinute).padStart(2, "0")}:00`;
        const service =
            selectedAction === "turn_on"
                ? "input_boolean.turn_on"
                : "input_boolean.turn_off";

        const data = {
            weekdays: selectedDays,
            timeslots: [
                {
                    start: timeStr,
                    actions: [
                        {
                            service: service,
                            entity_id: selectedEntity,
                            service_data: {},
                        },
                    ],
                },
            ],
            repeat_type: "repeat",
            name: getEntityDisplayName(selectedEntity) || null,
        };

        try {
            if (editingScheduleId) {
                // Edit mode
                data.schedule_id = editingScheduleId;
                await haStore.editSchedule(data);
            } else {
                // Create mode
                await haStore.addSchedule(data);
            }
            resetForm();
        } catch (err) {
            console.error("Failed to save schedule:", err);
        }
        isSubmitting = false;
    }

    async function handleDelete(scheduleId) {
        if (!confirm("정말 이 스케줄을 삭제하시겠습니까?")) return;
        try {
            await haStore.deleteSchedule(scheduleId);
            if (editingScheduleId === scheduleId) resetForm();
        } catch (err) {
            console.error("Failed to delete schedule:", err);
        }
    }

    async function toggleEnabled(schedule) {
        const entityId = schedule.entity_id;
        if (!entityId) {
            console.error(
                "[Scheduler] No entity_id. Schedule:",
                JSON.stringify(schedule),
            );
            return;
        }

        const currentlyEnabled = isEnabled(schedule);

        // Optimistic update - now directly on store state if needed,
        // but store handles it better. Here we just wait for event.
        // Actually haStore.toggleEntity just calls service, it doesn't update schedules.
        // So we might want to keep the optimistic update on the store's schedules.
        // But for now let's just wait for the server event.
        /*
        haStore.schedules = haStore.schedules.map((s) =>
            s.schedule_id === schedule.schedule_id
                ? { ...s, enabled: !currentlyEnabled }
                : s,
        );
        */

        try {
            await haStore.toggleEntity(entityId, !currentlyEnabled, "switch");
        } catch (err) {
            console.error("[Scheduler] Toggle failed:", err);
        }
    }

    function formatTime(timeStr) {
        if (!timeStr) return "";
        const parts = timeStr.split(":");
        return `${parts[0]}:${parts[1]}`;
    }

    function formatDays(weekdays) {
        if (!weekdays) return "";
        const dayMap = {
            daily: "매일",
            workday: "평일",
            weekend: "주말",
            mon: "월",
            tue: "화",
            wed: "수",
            thu: "목",
            fri: "금",
            sat: "토",
            sun: "일",
        };
        return weekdays.map((d) => dayMap[d] || d).join(", ");
    }

    function getEntityDisplayName(entityId) {
        if (!entityId) return "";
        const entity = booleanEntities.find((e) => e.entity_id === entityId);
        return entity ? entity.displayName : entityId;
    }

    function getActionLabel(actions) {
        if (!actions || !actions.length) return "";
        const svc = actions[0].service || "";
        return svc.includes("turn_on") ? "🟢 ON" : "🔴 OFF";
    }

    function getScheduleEntityId(schedule) {
        if (!schedule?.timeslots?.length) return "";
        const actions = schedule.timeslots[0].actions;
        if (!actions?.length) return "";
        return actions[0].entity_id || "";
    }

    function isEnabled(schedule) {
        return schedule.enabled !== false;
    }

    // Group schedules by label
    let groupedSchedules = $derived.by(() => {
        const groups = {};
        haStore.schedules.forEach((s) => {
            const entityId = getScheduleEntityId(s);
            const name = getEntityDisplayName(entityId) || "기타";
            if (!groups[name]) groups[name] = [];
            groups[name].push(s);
        });
        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    });
</script>

<div class="scheduler-card">
    <!-- Header with Add Button -->
    <div class="scheduler-header">
        <h3 class="section-title">📋 스케줄 목록</h3>
        <button class="add-icon-btn" onclick={startAdd} title="새 스케줄 추가">
            <span class="icon">＋</span>
        </button>
    </div>

    <!-- Schedule List -->
    <div class="scheduler-list glass-panel">
        {#if haStore.loadingSchedules}
            <div class="loading-msg">불러오는 중...</div>
        {:else if haStore.schedules.length === 0}
            <div class="empty-msg">등록된 스케줄이 없습니다.</div>
        {:else}
            <div class="schedule-items">
                {#each groupedSchedules as [label, items]}
                    <div class="schedule-group">
                        <div class="group-header">{label}</div>
                        {#each items as schedule}
                            <div
                                class="schedule-item"
                                class:disabled={!isEnabled(schedule)}
                            >
                                <div class="schedule-info">
                                    <div class="schedule-details">
                                        <span class="schedule-time"
                                            >{formatTime(
                                                schedule.timeslots?.[0]?.start,
                                            )}</span
                                        >
                                        <span class="schedule-days"
                                            >{formatDays(
                                                schedule.weekdays,
                                            )}</span
                                        >
                                        <span class="schedule-action"
                                            >{getActionLabel(
                                                schedule.timeslots?.[0]
                                                    ?.actions,
                                            )}</span
                                        >
                                    </div>
                                    <div class="schedule-entity">
                                        {#if !isEnabled(schedule)}
                                            <span class="paused-badge"
                                                >일시정지</span
                                            >
                                        {/if}
                                        {getEntityDisplayName(
                                            getScheduleEntityId(schedule),
                                        )}
                                    </div>
                                </div>
                                <div class="schedule-actions">
                                    <button
                                        class="icon-btn toggle-btn"
                                        class:enabled={isEnabled(schedule)}
                                        onclick={() => toggleEnabled(schedule)}
                                        type="button"
                                        title={isEnabled(schedule)
                                            ? "비활성화"
                                            : "활성화"}
                                    >
                                        {isEnabled(schedule) ? "⏸" : "▶️"}
                                    </button>
                                    <button
                                        class="icon-btn edit-btn"
                                        onclick={() => startEdit(schedule)}
                                        type="button"
                                        title="수정">✏️</button
                                    >
                                    <button
                                        class="icon-btn delete-btn"
                                        onclick={() =>
                                            handleDelete(schedule.schedule_id)}
                                        type="button"
                                        title="삭제">🗑️</button
                                    >
                                </div>
                            </div>
                        {/each}
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <!-- Popup Modal Form -->
    {#if showModal}
        <div
            class="modal-backdrop"
            onclick={(e) => e.target === e.currentTarget && resetForm()}
            aria-hidden="true"
        >
            <div
                class="modal-content glass-panel"
                transition:fade={{ duration: 200 }}
                onclick={(e) => e.stopPropagation()}
            >
                <div class="modal-header">
                    <h3 class="modal-title">
                        {editingScheduleId ? "✏️ 스케줄 수정" : "📅 새 스케줄"}
                    </h3>
                </div>

                <div class="modal-body">
                    <div class="form-row">
                        <label for="entity-select">기기 선택</label>
                        <select
                            id="entity-select"
                            bind:value={selectedEntity}
                            class="form-select"
                        >
                            <option value="">-- 선택하세요 --</option>
                            {#each booleanEntities as entity}
                                <option value={entity.entity_id}>
                                    {entity.displayName}
                                </option>
                            {/each}
                        </select>
                    </div>

                    <div class="form-row">
                        <label for="action-select">동작</label>
                        <div class="action-toggle">
                            <button
                                class="action-btn {selectedAction === 'turn_on'
                                    ? 'active on'
                                    : ''}"
                                onclick={() => (selectedAction = "turn_on")}
                                type="button">ON</button
                            >
                            <button
                                class="action-btn {selectedAction === 'turn_off'
                                    ? 'active off'
                                    : ''}"
                                onclick={() => (selectedAction = "turn_off")}
                                type="button">OFF</button
                            >
                        </div>
                    </div>

                    <div class="form-row">
                        <label for="time-hour">시간</label>
                        <div class="time-picker">
                            <input
                                id="time-hour"
                                type="number"
                                min="0"
                                max="23"
                                bind:value={timeHour}
                                class="time-input"
                            />
                            <span class="time-sep">:</span>
                            <input
                                type="number"
                                min="0"
                                max="59"
                                bind:value={timeMinute}
                                class="time-input"
                            />
                        </div>
                    </div>

                    <div class="form-row">
                        <label for="day-picker">요일</label>
                        <div id="day-picker" class="day-picker">
                            <div class="day-row special-days">
                                {#each dayOptions.slice(0, 3) as day}
                                    <button
                                        class="day-btn {selectedDays.includes(
                                            day.value,
                                        )
                                            ? 'active'
                                            : ''}"
                                        onclick={() => toggleDay(day.value)}
                                        type="button">{day.label}</button
                                    >
                                {/each}
                            </div>
                            <div class="day-row week-days">
                                {#each dayOptions.slice(3) as day}
                                    <button
                                        class="day-btn {selectedDays.includes(
                                            day.value,
                                        )
                                            ? 'active'
                                            : ''}"
                                        onclick={() => toggleDay(day.value)}
                                        type="button">{day.label}</button
                                    >
                                {/each}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="modal-footer">
                    <button class="modal-cancel-btn" onclick={resetForm}
                        >취소</button
                    >
                    <button
                        class="modal-submit-btn"
                        onclick={handleSubmit}
                        disabled={!selectedEntity || isSubmitting}
                    >
                        {isSubmitting
                            ? "저장 중..."
                            : editingScheduleId
                              ? "저장하기"
                              : "추가하기"}
                    </button>
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    .scheduler-card {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        height: 100%;
        overflow: hidden;
        padding-bottom: 1rem;
        position: relative;
    }

    .scheduler-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 4px;
    }

    .add-icon-btn {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: var(
            --accent-gradient,
            linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)
        );
        border: none;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
    }

    .add-icon-btn:hover {
        transform: scale(1.1) rotate(90deg);
        box-shadow: 0 6px 16px rgba(139, 92, 246, 0.4);
    }

    .add-icon-btn .icon {
        font-size: 1.5rem;
        font-weight: bold;
        line-height: 1;
    }

    .section-title {
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--text-main, #f8fafc);
        margin: 0;
    }

    /* --- List Styles --- */
    .scheduler-list {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
        flex: 1;
        min-height: 0;
        overflow: hidden;
    }

    .loading-msg,
    .empty-msg {
        text-align: center;
        color: var(--text-dim, #94a3b8);
        padding: 2.5rem 0;
        font-size: 0.95rem;
    }

    .schedule-items {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        overflow-y: auto;
        padding-right: 4px;
        flex: 1;
    }

    .schedule-items::-webkit-scrollbar {
        width: 6px;
    }

    .schedule-items::-webkit-scrollbar-track {
        background: transparent;
    }

    .schedule-items::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 10px;
    }

    .schedule-items::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    .schedule-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 18px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.05);
        transition: all 0.2s;
    }

    .schedule-item:hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(255, 255, 255, 0.1);
    }

    .schedule-item.disabled {
        opacity: 0.75;
        background: repeating-linear-gradient(
            -45deg,
            rgba(0, 0, 0, 0.1),
            rgba(0, 0, 0, 0.1) 10px,
            rgba(255, 255, 255, 0.02) 10px,
            rgba(255, 255, 255, 0.02) 20px
        );
        border: 1px dashed rgba(239, 68, 68, 0.3);
    }

    .schedule-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
    }

    .schedule-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
    }

    .group-header {
        font-size: 0.9rem;
        font-weight: 700;
        color: var(--accent-color, #8b5cf6);
        padding: 4px 8px;
        background: rgba(139, 92, 246, 0.1);
        border-radius: 8px;
        margin-bottom: 2px;
        border-left: 3px solid #8b5cf6;
    }

    .paused-badge {
        font-size: 0.75rem;
        font-weight: 800;
        padding: 4px 10px;
        border-radius: 6px;
        background: #ef4444;
        color: #ffffff;
        box-shadow: 0 2px 10px rgba(239, 68, 68, 0.4);
        margin-right: 8px;
        display: inline-block;
        letter-spacing: 0.5px;
        vertical-align: middle;
    }

    .schedule-details {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
    }

    .schedule-time {
        font-weight: 700;
        font-size: 0.9rem;
        color: var(--accent-color, #8b5cf6);
    }

    .schedule-days {
        font-size: 0.8rem;
        color: var(--text-dim, #94a3b8);
    }

    .schedule-action {
        font-size: 0.8rem;
        font-weight: 500;
    }

    .schedule-entity {
        font-size: 0.75rem;
        color: var(--text-dim, #94a3b8);
        opacity: 0.6;
        margin-top: 2px;
    }

    /* Action buttons */
    .schedule-actions {
        display: flex;
        gap: 6px;
        flex-shrink: 0;
        margin-left: 12px;
    }

    .icon-btn {
        width: 36px;
        height: 36px;
        padding: 0;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.05);
        cursor: pointer;
        font-size: 1rem;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .icon-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        transform: translateY(-2px);
    }

    .toggle-btn.enabled {
        border-color: rgba(16, 185, 129, 0.3);
        background: rgba(16, 185, 129, 0.1);
    }

    .edit-btn:hover {
        border-color: rgba(59, 130, 246, 0.3);
        background: rgba(59, 130, 246, 0.1);
    }

    .delete-btn:hover {
        background: rgba(239, 68, 68, 0.15);
        border-color: rgba(239, 68, 68, 0.3);
    }

    /* --- Modal Styles --- */
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(12px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: 20px;
        pointer-events: auto;
    }

    .modal-content {
        position: relative;
        width: 100%;
        max-width: 450px;
        background: rgba(15, 23, 42, 0.95) !important;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 20px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
        pointer-events: auto;
        animation: modalIn 0.3s ease-out;
    }

    @keyframes modalIn {
        from {
            transform: scale(0.95);
            opacity: 0;
        }
        to {
            transform: scale(1);
            opacity: 1;
        }
    }

    .modal-header {
        padding: 20px 24px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.02);
    }

    .modal-title {
        font-size: 1.25rem;
        font-weight: 800;
        color: #f8fafc;
        margin: 0;
        white-space: nowrap;
        line-height: 1;
    }

    .modal-body {
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        max-height: 65vh;
        overflow-y: auto;
    }

    .modal-footer {
        padding: 20px 24px;
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(0, 0, 0, 0.1);
    }

    .modal-cancel-btn {
        padding: 10px 20px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        color: var(--text-main, #f8fafc);
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .modal-cancel-btn:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .modal-submit-btn {
        padding: 10px 24px;
        background: var(
            --accent-gradient,
            linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)
        );
        border: none;
        border-radius: 12px;
        color: white;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(139, 92, 246, 0.2);
    }

    .modal-submit-btn:hover:not(:disabled) {
        box-shadow: 0 6px 18px rgba(139, 92, 246, 0.3);
        transform: translateY(-1px);
    }

    .modal-submit-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Reuse row styles but scoped for modal */
    .form-row {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .form-row label {
        font-size: 0.85rem;
        color: var(--text-dim, #94a3b8);
        font-weight: 600;
    }

    .form-select {
        padding: 12px 16px;
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        color: #f8fafc;
        font-size: 0.95rem;
        outline: none;
        width: 100%;
        transition: all 0.2s;
        cursor: pointer;
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='Length19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 12px center;
        background-size: 16px;
    }

    .form-select:hover {
        background-color: rgba(15, 23, 42, 0.8);
        border-color: rgba(139, 92, 246, 0.4);
    }

    .form-select:focus {
        border-color: #8b5cf6;
        box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.2);
    }

    .form-select option {
        background: #1e293b;
        color: #f8fafc;
        padding: 12px;
    }

    .action-toggle {
        display: flex;
        gap: 0.75rem;
    }

    .action-btn {
        flex: 1;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(0, 0, 0, 0.15);
        color: var(--text-dim, #94a3b8);
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .action-btn.active.on {
        background: rgba(16, 185, 129, 0.15);
        border-color: #10b981;
        color: #10b981;
        box-shadow: 0 0 15px rgba(16, 185, 129, 0.1);
    }

    .action-btn.active.off {
        background: rgba(239, 68, 68, 0.15);
        border-color: #ef4444;
        color: #ef4444;
        box-shadow: 0 0 15px rgba(239, 68, 68, 0.1);
    }

    .time-picker {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .time-input {
        width: 70px;
        padding: 12px;
        text-align: center;
        background: rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        color: var(--text-main, #f8fafc);
        font-size: 1.4rem;
        font-weight: 700;
        outline: none;
    }

    .day-picker {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .day-row {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .day-btn {
        flex: 1;
        min-width: 0;
        padding: 10px 4px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.05);
        color: var(--text-dim, #94a3b8);
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        text-align: center;
        white-space: nowrap;
    }

    .day-btn.active {
        background: rgba(139, 92, 246, 0.15);
        border-color: #8b5cf6;
        color: #8b5cf6;
    }

    .special-days .day-btn {
        padding: 12px 8px;
    }
</style>
