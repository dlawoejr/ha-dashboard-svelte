<script>
    import { haStore } from "$lib/stores/ha-store.svelte";

    let schedules = $state([]);
    let loading = $state(true);

    // Form state
    let selectedEntity = $state("");
    let selectedAction = $state("turn_on");
    let timeHour = $state(8);
    let timeMinute = $state(0);
    let scheduleName = $state("");
    let selectedDays = $state(["daily"]);
    let isSubmitting = $state(false);

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
        haStore.entities.filter(
            (e) => e.entity_id.startsWith("input_boolean.") && e.area_id,
        ),
    );

    // Load schedules on mount
    $effect(() => {
        if (haStore.activeView === "scheduler") {
            loadSchedules();
        }
    });

    async function loadSchedules() {
        loading = true;
        try {
            const result = await haStore.getSchedules();
            schedules = Array.isArray(result) ? result : [];
        } catch (err) {
            console.error("Failed to load schedules:", err);
            schedules = [];
        }
        loading = false;
    }

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
            name: scheduleName || null,
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
            await loadSchedules();
        } catch (err) {
            console.error("Failed to save schedule:", err);
        }
        isSubmitting = false;
    }

    async function handleDelete(scheduleId) {
        try {
            await haStore.deleteSchedule(scheduleId);
            if (editingScheduleId === scheduleId) resetForm();
            await loadSchedules();
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
        console.log(
            `[Scheduler] Toggle: ${entityId} → switch.${currentlyEnabled ? "turn_off" : "turn_on"}`,
        );

        // Optimistic update: instantly toggle the local state
        schedules = schedules.map((s) =>
            s.schedule_id === schedule.schedule_id
                ? { ...s, enabled: !currentlyEnabled }
                : s,
        );

        try {
            const result = await haStore.toggleEntity(
                entityId,
                !currentlyEnabled,
                "switch",
            );
            console.log("[Scheduler] Toggle result:", result);
        } catch (err) {
            console.error("[Scheduler] Toggle failed:", err);
            // Revert on failure
            schedules = schedules.map((s) =>
                s.schedule_id === schedule.schedule_id
                    ? { ...s, enabled: currentlyEnabled }
                    : s,
            );
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

    function getEntityName(entityId) {
        if (!entityId) return "";
        const entity = haStore.entities.find((e) => e.entity_id === entityId);
        return (
            entity?.attributes?.friendly_name ||
            entityId.replace("input_boolean.", "")
        );
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
</script>

<div class="scheduler-card">
    <!-- Top: Create/Edit form -->
    <div class="scheduler-form glass-panel">
        <div class="form-header">
            <h3 class="section-title">
                {editingScheduleId ? "✏️ 스케줄 수정" : "📅 새 스케줄"}
            </h3>
            {#if editingScheduleId}
                <button
                    class="cancel-edit-btn"
                    onclick={resetForm}
                    type="button">✕ 취소</button
                >
            {/if}
        </div>

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
                        {entity.attributes?.friendly_name || entity.entity_id}
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
                {#each dayOptions as day}
                    <button
                        class="day-btn {selectedDays.includes(day.value)
                            ? 'active'
                            : ''}"
                        onclick={() => toggleDay(day.value)}
                        type="button">{day.label}</button
                    >
                {/each}
            </div>
        </div>

        <div class="form-row">
            <label for="schedule-name">이름 (선택)</label>
            <input
                id="schedule-name"
                type="text"
                bind:value={scheduleName}
                class="form-input"
                placeholder="스케줄 이름..."
            />
        </div>

        <button
            class="submit-btn"
            onclick={handleSubmit}
            disabled={!selectedEntity || isSubmitting}
        >
            {isSubmitting
                ? "저장 중..."
                : editingScheduleId
                  ? "💾 수정 저장"
                  : "➕ 스케줄 추가"}
        </button>
    </div>

    <!-- Bottom: Schedule list -->
    <div class="scheduler-list glass-panel">
        <h3 class="section-title">📋 스케줄 목록</h3>

        {#if loading}
            <div class="loading-msg">불러오는 중...</div>
        {:else if schedules.length === 0}
            <div class="empty-msg">등록된 스케줄이 없습니다.</div>
        {:else}
            <div class="schedule-items">
                {#each schedules as schedule}
                    <div
                        class="schedule-item"
                        class:disabled={!isEnabled(schedule)}
                        class:editing={editingScheduleId ===
                            schedule.schedule_id}
                    >
                        <div class="schedule-info">
                            <div class="schedule-name">
                                {schedule.name ||
                                    getEntityName(
                                        getScheduleEntityId(schedule),
                                    )}
                                {#if !isEnabled(schedule)}
                                    <span class="paused-badge">일시정지</span>
                                {/if}
                            </div>
                            <div class="schedule-details">
                                <span class="schedule-time"
                                    >{formatTime(
                                        schedule.timeslots?.[0]?.start,
                                    )}</span
                                >
                                <span class="schedule-days"
                                    >{formatDays(schedule.weekdays)}</span
                                >
                                <span class="schedule-action"
                                    >{getActionLabel(
                                        schedule.timeslots?.[0]?.actions,
                                    )}</span
                                >
                            </div>
                            <div class="schedule-entity">
                                {getEntityName(getScheduleEntityId(schedule))}
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
        {/if}

        <button class="refresh-btn" onclick={loadSchedules} type="button"
            >🔄 새로고침</button
        >
    </div>
</div>

<style>
    .scheduler-card {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        overflow-y: auto;
        padding-bottom: 2rem;
    }

    .section-title {
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--text-main, #f8fafc);
        margin-bottom: 0;
    }

    /* --- Form Styles --- */
    .scheduler-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .form-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
    }

    .cancel-edit-btn {
        padding: 4px 12px;
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 8px;
        color: #ef4444;
        font-size: 0.8rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        width: auto;
    }

    .cancel-edit-btn:hover {
        background: rgba(239, 68, 68, 0.3);
        transform: none;
    }

    .form-row {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }

    .form-row label {
        font-size: 0.8rem;
        color: var(--text-dim, #94a3b8);
        font-weight: 600;
    }

    .form-select,
    .form-input {
        padding: 10px 14px;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
        border-radius: 10px;
        color: var(--text-main, #f8fafc);
        font-size: 0.9rem;
        outline: none;
        width: 100%;
    }

    .form-select:focus,
    .form-input:focus {
        border-color: var(--accent-color, #8b5cf6);
    }

    .form-select option {
        background: #1e293b;
        color: #f8fafc;
    }

    .action-toggle {
        display: flex;
        gap: 0.5rem;
    }

    .action-btn {
        flex: 1;
        padding: 10px;
        border-radius: 10px;
        border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
        background: rgba(0, 0, 0, 0.2);
        color: var(--text-dim, #94a3b8);
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .action-btn.active.on {
        background: rgba(16, 185, 129, 0.2);
        border-color: #10b981;
        color: #10b981;
    }

    .action-btn.active.off {
        background: rgba(239, 68, 68, 0.2);
        border-color: #ef4444;
        color: #ef4444;
    }

    .time-picker {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .time-input {
        width: 60px;
        padding: 10px;
        text-align: center;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
        border-radius: 10px;
        color: var(--text-main, #f8fafc);
        font-size: 1.2rem;
        font-weight: 700;
        outline: none;
    }

    .time-input:focus {
        border-color: var(--accent-color, #8b5cf6);
    }

    .time-sep {
        font-size: 1.4rem;
        font-weight: 700;
        color: var(--text-dim, #94a3b8);
    }

    .day-picker {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
    }

    .day-btn {
        padding: 6px 12px;
        border-radius: 999px;
        border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
        background: rgba(0, 0, 0, 0.2);
        color: var(--text-dim, #94a3b8);
        font-size: 0.78rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        width: auto;
    }

    .day-btn.active {
        background: rgba(139, 92, 246, 0.2);
        border-color: var(--accent-color, #8b5cf6);
        color: var(--accent-color, #8b5cf6);
    }

    .submit-btn {
        padding: 12px;
        background: var(
            --accent-gradient,
            linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)
        );
        border: none;
        border-radius: 12px;
        color: white;
        font-weight: 600;
        cursor: pointer;
        transition:
            transform 0.2s,
            opacity 0.2s;
        margin-top: 0.5rem;
    }

    .submit-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        opacity: 0.9;
    }

    .submit-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* --- List Styles --- */
    .scheduler-list {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
    }

    .loading-msg,
    .empty-msg {
        text-align: center;
        color: var(--text-dim, #94a3b8);
        padding: 2rem 0;
        font-size: 0.9rem;
    }

    .schedule-items {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .schedule-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 12px;
        border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
        transition: all 0.2s;
    }

    .schedule-item:hover {
        background: rgba(0, 0, 0, 0.3);
    }

    .schedule-item.disabled {
        opacity: 0.5;
    }

    .schedule-item.editing {
        border-color: var(--accent-color, #8b5cf6);
        background: rgba(139, 92, 246, 0.08);
    }

    .schedule-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
        min-width: 0;
    }

    .schedule-name {
        font-weight: 600;
        font-size: 0.95rem;
        color: var(--text-main, #f8fafc);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .paused-badge {
        font-size: 0.65rem;
        font-weight: 500;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(251, 191, 36, 0.2);
        color: #fbbf24;
        border: 1px solid rgba(251, 191, 36, 0.3);
        flex-shrink: 0;
    }

    .schedule-details {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
    }

    .schedule-time {
        font-weight: 700;
        font-size: 0.85rem;
        color: var(--accent-color, #8b5cf6);
    }

    .schedule-days {
        font-size: 0.78rem;
        color: var(--text-dim, #94a3b8);
    }

    .schedule-action {
        font-size: 0.78rem;
    }

    .schedule-entity {
        font-size: 0.75rem;
        color: var(--text-dim, #94a3b8);
        opacity: 0.7;
    }

    /* Action buttons */
    .schedule-actions {
        display: flex;
        gap: 4px;
        flex-shrink: 0;
        margin-left: 8px;
    }

    .icon-btn {
        width: 34px;
        height: 34px;
        padding: 0;
        border-radius: 8px;
        border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
        background: rgba(255, 255, 255, 0.05);
        cursor: pointer;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .icon-btn:hover {
        background: rgba(255, 255, 255, 0.15);
        transform: none;
    }

    .toggle-btn.enabled {
        border-color: rgba(16, 185, 129, 0.3);
        background: rgba(16, 185, 129, 0.1);
    }

    .toggle-btn:not(.enabled) {
        border-color: rgba(251, 191, 36, 0.3);
        background: rgba(251, 191, 36, 0.1);
    }

    .edit-btn:hover {
        border-color: rgba(59, 130, 246, 0.4);
        background: rgba(59, 130, 246, 0.15);
    }

    .delete-btn {
        border-color: rgba(239, 68, 68, 0.2) !important;
        background: rgba(239, 68, 68, 0.1) !important;
    }

    .delete-btn:hover {
        background: rgba(239, 68, 68, 0.3) !important;
        border-color: #ef4444 !important;
    }

    .refresh-btn {
        padding: 8px 16px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
        border-radius: 10px;
        color: var(--text-dim, #94a3b8);
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s;
        width: auto;
        align-self: center;
    }

    .refresh-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--text-main, #f8fafc);
        transform: none;
    }
</style>
