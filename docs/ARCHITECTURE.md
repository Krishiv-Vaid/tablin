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

## Future native companion

The `character/` engine has no `chrome.*` dependencies. A macOS app (SwiftUI/AppKit) can host it in a
transparent `WKWebView` panel above all windows, receive "appear" plans from the extension over
native messaging, and report "arrived/close requested" back. The extension's worker keeps the final
say on closing tabs.
