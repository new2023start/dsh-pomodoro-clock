# dsh-pomodoro-clock

A Pomodoro timer that lives in the DeepSeek Harness **right sidebar** — a handle on the right edge you
can park anywhere, a floating card that follows it, one-shot or cycle counting, and five synthesized
chimes (including an airport-style cue that reads its announcement out loud).

- No build step, no runtime dependencies, no audio files: every sound is synthesized in the browser.
- Chinese and English UI, following the Harness language setting.
- Runs entirely client-side; nothing leaves your machine.

## Install

From the plugin market (`Plugins → Market → dsh-pomodoro-clock → Install`), or by hand:

```bash
dsh plugin add dsh-pomodoro-clock
```

Installing adds seats to your profile; nothing shipped is replaced.

## What it adds

| Surface | Seat | What you get |
| --- | --- | --- |
| Right-edge handle + popover | `shell.overlay` (id `dsh-pomodoro`) | Collapsed handle hugging the right edge (`mm:ss` + running dot) that opens a floating timer card; `⌄` collapses it |
| Right sidebar page tab | `sidebar.right.pane.tab` (key `dsh-pomodoro-clock`) | The same timer as a docked page tab |
| Tab chip title | `sidebar.right.pane.tab.title` | A live `mm:ss` countdown on the tab |
| Right sidebar guide | guide entry `pomodoro` | A "Pomodoro timer" card in the right-sidebar guide page |

## How to open it

1. **Fastest** — the right-edge handle: click it and the card opens in place, above the conversation,
   without touching the layout. Drag the handle up or down to park it wherever it suits you: the
   position is stored in `localStorage` (`dsh.pomodoro.anchor`) and clamped to the viewport, so it
   survives a reload and never leaves the screen. The card opens from the handle's own height — below
   it in the upper half of the window, above it in the lower half — so moving the handle moves the card.
2. Prefer a docked pane? The *Pomodoro timer* card in the right-sidebar guide opens the tab.

Both surfaces read the same store, so the countdown keeps running while collapsed, while the popover
is closed, and in the tab chip. Opening one never resets the other.

## Behaviour

Two modes, both ending in a selectable cue:

- **One-shot** (default) — a single countdown: set the minutes, start, and when it reaches zero it rings
  once, stops, and re-arms the same countdown. No break, no next phase, no loop.
- **Pomodoro cycle** — focus (25 min) / short break (5 min) / long break (15 min) with a configurable
  number of rounds; *Auto-start* carries you into the next phase.

Switching modes re-arms the timer and clears the running phase. Progress is stored in `localStorage`
under `dsh.pomodoro.v1`; the daily counter resets when the calendar day changes.

## Settings

One-shot: the countdown length (1–120 min).

Cycle: focus / short break / long break length, rounds per cycle (1–12), auto-start.

Both: **sound** (`清脆三声` chime · `机场播报` airport · `钟声` bell · `木鱼` woodblock · `静音` silent, with a
`▶` preview next to the dropdown) and desktop notification.

Every cue is synthesized with WebAudio: each note is a fundamental plus a quiet overtone, and every
motif repeats so it rings for 3–8 s instead of a single beep. `机场播报` adds a spoken line through
`speechSynthesis` ("本次专注时间已结束，请稍作休息。" / English, following the UI language) after its
five-note descending cue. No audio files ship with the bundle; on a platform with no voice installed
the cue still plays, just without the announcement.

## Development

```bash
node test/smoke.cjs
```

`test/smoke.cjs` loads the real `client.js` in a `vm` sandbox with a stubbed window, fake WebAudio and
`speechSynthesis`, and a harness-owned clock. It asserts that the bundle registers its seats, renders
every surface, drives the timer to zero, schedules the alarm cue and speaks the announcement, and that
the handle can be dragged and remembers where it was put. No browser, no network.

## Notes

- The client side uses only the `--dsw-alias-*` theme tokens, so it follows the active theme.
- Visible strings are registered in the `dshPomodoro` locale namespace (`zh` + `en`; the locale fallback
  chain ends at `en`, so every other language falls back to English).

## License

MIT — see [LICENSE](LICENSE).
