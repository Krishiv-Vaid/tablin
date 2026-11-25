# Tablin architecture

## Processes

```
┌──────────────────────────┐   PAGE_READY / VISIBILITY_CHANGED / COUNTDOWN_ELAPSED   ┌───────────────────────────┐
│ Content script (per tab) │ ──────────────────────────────────────────────────────▶ │ Background service worker │
│  • local timer → dueAt   │      REQUEST_CLOSE / SNOOZE_TAB                         │  • DistractionManager     │
│  • Overlay + Character   │ ◀────────────────────────────────────────────────────── │  • verifyClosable()       │
│  • unsaved-input check   │                SYNC { idle | waiting | counting | appear }│  • chrome.tabs.remove     │
└──────────────────────────┘                                                         └─────────────┬─────────────┘
                                                                                                   │ GET_STATUS, PAUSE, RESUME,
┌──────────────────────────┐                                                                       │ EMERGENCY_STOP, REOPEN_LAST…
│ Popup / Settings (React) │ ◀─────────────────────────────────────────────────────────────────────┘
│  • chrome.storage.local  │   settings are written directly (validated); the worker listens to storage changes
└──────────────────────────┘
```

## Per-tab lifecycle (worker)

```
           PAGE_READY (matching, enabled site)
                     │
                     ▼
   ┌────────────► waiting ◀──────────────────────────────┐
   │                 │  tab active & visible & watching   │ switched away / hidden / paused
   │                 ▼                                    │ (pause: keep remaining time;
   │             counting  ── dueAt reached + re-verified ─┤  restart: full delay)
   │                 │                                    │
   │                 ▼                                    │
   │             appeared ────────────────────────────────┘
   │                 │
   │   SNOOZE_TAB    │ REQUEST_CLOSE + verifyClosable() ok
   └─────────────────┤
                     ▼
              chrome.tabs.remove(tabId)   →  lastClosed saved for undo (10 min)
```

`dueAt = max(resumedAt + remainingMs, snoozedUntil)`. Everything above is persisted in
`chrome.storage.session` after every event, so a suspended worker resumes exactly where it was.

## Character modes (controller)

```
hidden → entering (pop in, "notice" hop) → moving (walk/run/frustrated, urgency ramps)
                                             │            ▲
                                  grab ──────┤            │ landed
                                             ▼            │
                                         dragging ──release (small pull / Esc)──▶ falling
                                             │
                               release with charge ≥ 0.12
                                             ▼
                                         launching (spring to exit) ──▶ arriving (reach up) ──▶ parked
                                                                                         │
                                                                     overlay: countdown / nudge / notice
```

Behavioural states (`idle, walking, running, approaching, dragged, charging, launching,
celebrating, sleeping, frustrated, tired, reaching`) are a separate state machine with an explicit
transition table. Every accepted transition cross-fades poses over ~180 ms.

## Escalation

`level = min(5, interceptionsThisPeriod + 1)`
`speed = 1 + (max − 1) · ((level − 1) / 4)^k` with k = 1.8 (gentle), 1 (steady) or 0.55 (steep), and
max ≤ 3. The countdown shrinks by `[1, .85, .7, .6, .5]` per level, never below 4 s (or the configured
delay if that's shorter). Periods: local calendar day, or browser session.

## Focus sessions (V2)

```
            FOCUS_START(kind, minutes)
 idle ─────────────────────────────▶ running {startedAt, endsAt}
                                      │   ▲
                         FOCUS_PAUSE  │   │ FOCUS_RESUME (endsAt = now + remainingMs)
                                      ▼   │
                                    paused {remainingMs}
 running ── endsAt reached (alarm / backup timer / any status read) ──▶ completed
          └─ FOCUS_END ─▶ ended early (time credited, not a completed session)
```

Completion is idempotent: the session id is checked against history before anything is recorded.
Completed focus sessions update `stats.days[endDay]` (minutes, sessions, qualifying ≥ 5 min) and
the longest streak, then `syncProgress()` evaluates achievements and grants rewards. All of this
runs inside the single `Serial` lock shared with the distraction manager.

## Achievements, rewards & cosmetics

`computeMetrics(stats)` → `{completedSessions, longestSessionMinutes, bestWeekSessions,
longestStreak, totalIntercepted, totalFocusMinutes}` → `evaluateAchievements()` unlocks anything whose
threshold is met and not yet unlocked, and grants its cosmetic. Cosmetics render as SVG groups in
rig slots (`hatSlot` and `accessorySlot` inside the body group, `effectSlot` and `celebrationSlot`
inside the whole-character group), so they inherit every existing transform.

## Storage schema & migration

| Key (local)     | Since | Contents                                                                          |
| --------------- | ----- | --------------------------------------------------------------------------------- |
| `schemaVersion` | 2     | `2`                                                                               |
| `settings`      | 1     | v2 adds `sites[].delay` (DelayConfig) and `focus`                                 |
| `stats`         | 1     | v2 adds focus fields per day, `totalWatchSessions`, focus totals, `longestStreak` |
| `focus`         | 2     | current session, cycle count, pending celebration                                 |
| `focusHistory`  | 2     | last 500 sessions                                                                 |
| `achievements`  | 2     | id → unlocked-at                                                                  |
| `inventory`     | 2     | unlocked cosmetics + equipped slots                                               |
| `unseenUnlocks` | 2     | unlocks not yet celebrated in the UI                                              |

`migrateStorage()` (v0/v1 → v2) rewrites settings through the v1-aware validator: per-site
`delaySeconds` becomes a preset or custom `DelayConfig`, and `null` becomes inherit. It moves the
v1 `totalFocusSessions` (browser sessions) to `totalWatchSessions`, initialises the new keys only
if they're missing, unlocks achievements that existing data genuinely earned, and stamps
`schemaVersion: 2`. Re-running it changes nothing.

## Future native companion

The `character/` engine has no `chrome.*` dependencies. A macOS app (SwiftUI/AppKit) can host it in a
transparent `WKWebView` panel above all windows, receive "appear" plans from the extension over
native messaging, and report "arrived/close requested" back. The extension's worker keeps the final
say on closing tabs.
