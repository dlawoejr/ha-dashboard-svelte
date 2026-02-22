<script>
    // @ts-nocheck
    let { items = [] } = $props();

    let rows = $state([]);

    $effect(() => {
        rows = items.map((item) => ({ ...item }));
    });

    function onToggle(index, event) {
        rows[index].enabled = event.target.checked;
    }
</script>

<section class="scheduler-card">
    <h2>Scheduler</h2>

    {#if rows.length === 0}
        <p class="empty">No schedulable entities found.</p>
    {:else}
        <div class="rows">
            {#each rows as row, index (row.id)}
                <div class="schedule-row" class:disabled={!row.enabled}>
                    <div class="icon-cell" aria-hidden="true">{row.icon}</div>
                    <div class="content-cell">
                        <div class="primary">{row.name}</div>
                        <div class="secondary">{row.action}</div>
                        <div class="secondary">{row.days}</div>
                        <div class="secondary">{row.time}</div>
                    </div>
                    <label class="switch" title="Enable schedule">
                        <input
                            type="checkbox"
                            checked={row.enabled}
                            onchange={(e) => onToggle(index, e)}
                        />
                        <span class="slider"></span>
                    </label>
                </div>
            {/each}
        </div>

        <div class="footer-actions">
            <button type="button" class="add-btn">ADD ITEM</button>
        </div>
    {/if}
</section>

<style>
    .scheduler-card {
        background: #fafafa;
        color: #212121;
        border-radius: 12px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        padding: 1rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.16);
    }

    h2 {
        margin: 0 0 0.75rem 0;
        font-size: 1.8rem;
        font-weight: 500;
        color: #212121;
        background: none;
        -webkit-text-fill-color: initial;
    }

    .rows {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .schedule-row {
        display: grid;
        grid-template-columns: 34px 1fr auto;
        align-items: center;
        gap: 0.75rem;
        padding: 0.35rem 0;
    }

    .schedule-row.disabled {
        opacity: 0.45;
    }

    .icon-cell {
        width: 34px;
        height: 34px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        font-size: 0.95rem;
        background: rgba(33, 150, 243, 0.12);
        color: #1e88e5;
    }

    .primary {
        font-size: 1.02rem;
        font-weight: 600;
        color: #2f2f2f;
    }

    .secondary {
        font-size: 0.9rem;
        line-height: 1.35;
        color: #6f6f6f;
    }

    .switch {
        position: relative;
        width: 42px;
        height: 24px;
        display: inline-block;
    }

    .switch input {
        opacity: 0;
        width: 0;
        height: 0;
    }

    .slider {
        position: absolute;
        inset: 0;
        cursor: pointer;
        background: #c8c8c8;
        border-radius: 999px;
        transition: 0.2s;
    }

    .slider::before {
        content: "";
        position: absolute;
        height: 18px;
        width: 18px;
        left: 3px;
        top: 3px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
        transition: 0.2s;
    }

    .switch input:checked + .slider {
        background: #4daaf0;
    }

    .switch input:checked + .slider::before {
        transform: translateX(18px);
    }

    .footer-actions {
        margin-top: 0.85rem;
    }

    .add-btn {
        width: auto;
        border: 1px solid #4daaf0;
        background: transparent;
        color: #4daaf0;
        border-radius: 6px;
        padding: 0.5rem 0.85rem;
        font-size: 0.85rem;
        letter-spacing: 0.06em;
        font-weight: 700;
    }

    .add-btn:hover {
        transform: none;
        opacity: 1;
        background: rgba(77, 170, 240, 0.08);
    }

    .empty {
        color: #6f6f6f;
        font-size: 0.95rem;
    }

    @media (max-width: 768px) {
        .scheduler-card {
            padding: 0.85rem;
        }

        h2 {
            font-size: 1.45rem;
        }

        .secondary {
            font-size: 0.84rem;
        }
    }
</style>

