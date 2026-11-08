/**
 * dsh-pomodoro-clock — browser side.
 *
 * A Pomodoro timer for the DSH Web UI:
 *   - a right-edge handle that opens a floating popover (`shell.overlay`),
 *   - a page tab of its own kind (`pomodoro`) rendered into `sidebar.right.pane.tab`,
 *   - a live mm:ss title on the tab chip (`sidebar.right.pane.tab.title`).
 *
 * The factory below is side-effect free: every resource is registered inside
 * `apply`, and the timer state lives in a store created there and handed to the
 * components as injected props.
 */
window.__ModuleLoader__.load({
  id: "dsh-pomodoro-clock",
  factory(require) {
    const React = require("react");
    const h = React.createElement;

    const NS = "dshPomodoro";
    const TAB_ID = "dsh-pomodoro-clock";
    const TAB_KIND = "pomodoro";
    const STORAGE_KEY = "dsh.pomodoro.v1";
    const OVERLAY_KEY = "dsh.pomodoro.overlay";
    const ANCHOR_KEY = "dsh.pomodoro.anchor";
    /** Default handle position: the weather card's column, 8px below it. */
    const DEFAULT_ANCHOR_TOP = 226;
    const TICK_MS = 250;
    const MINUTE = 60_000;
    const PHASES = ["focus", "short", "long"];
    const DEFAULT_SETTINGS = {
      mode: "once",
      focus: 25,
      short: 5,
      long: 15,
      rounds: 4,
      autoStart: true,
      sound: "chime",
      notify: false,
    };
    /** Selectable alarms. `off` is a real choice, not a missing setting. */
    const SOUND_IDS = ["chime", "airport", "bell", "woodblock", "off"];
    /*
     * `partial` adds a soft overtone so a note rings like a struck chime instead of
     * a synth beep; `repeat`/`repeatGap` let a short motif ring out instead of
     * being over before the user looks up; `speech` appends a spoken line.
     */
    const SOUND_SPECS = {
      chime: { type: "sine", partial: 2.01, notes: [783.99, 783.99, 1046.5], gap: 0.52, decay: 1.6, peak: 0.16, repeat: 2, repeatGap: 0.9 },
      /* Five descending struck notes — the airport "ding-dong" cue — then a voice. */
      airport: { type: "sine", partial: 2.76, notes: [1318.5, 1174.66, 1046.5, 880, 659.25], gap: 0.58, decay: 2.6, peak: 0.15, repeat: 1, speech: true },
      bell: { type: "triangle", partial: 1.5, notes: [880, 1318.5], gap: 0.62, decay: 3.2, peak: 0.13, repeat: 2, repeatGap: 2.2 },
      woodblock: { type: "square", notes: [1180, 940, 1180], gap: 0.19, decay: 0.14, peak: 0.12, repeat: 3, repeatGap: 0.5 },
    };
    const PHASE_ACCENT = {
      focus: "var(--dsw-alias-brand-primary)",
      short: "var(--dsw-alias-state-success-primary)",
      long: "var(--dsw-alias-state-business-primary)",
    };

    /** Runtime dictionaries. The locale fallback chain always ends at `en`. */
    const DICTIONARIES = {
      zh: {
        "tab.title": "番茄钟",
        "guide.title": "番茄钟",
        "guide.description": "单次计时或番茄循环，结束响一声。",
        "mode.once": "单次",
        "mode.cycle": "番茄循环",
        "setting.mode": "模式",
        "setting.duration": "计时时长",
        "phase.focus": "专注",
        "phase.short": "短休息",
        "phase.long": "长休息",
        "state.running": "进行中",
        "state.idle": "待开始",
        "action.start": "开始",
        "action.pause": "暂停",
        "action.resume": "继续",
        "action.reset": "重置",
        "action.skip": "跳过",
        "notice.focusDone": "专注完成，休息一下。",
        "notice.breakDone": "休息结束，回到专注。",
        "notice.cycleDone": "完成 {count} 轮，长休息一下。",
        "notice.done": "时间到，{minutes} 分钟已完成。",
        "stat.today": "今日完成",
        "stat.cycle": "当前轮次",
        "stat.pomodoros": "{count} 个番茄",
        "setting.focus": "专注时长",
        "setting.short": "短休息时长",
        "setting.long": "长休息时长",
        "setting.rounds": "循环轮数",
        "setting.autoStart": "自动进入下一阶段",
        "setting.sound": "提示音",
        "sound.chime": "清脆三声",
        "sound.airport": "机场播报",
        "sound.bell": "钟声",
        "sound.woodblock": "木鱼",
        "sound.off": "静音",
        "sound.preview": "试听提示音",
        "speech.focusDone": "本次专注时间已结束，请稍作休息。",
        "speech.breakDone": "休息时间结束，可以开始下一轮了。",
        "setting.notify": "桌面通知",
        "unit.minutes": "{count} 分钟",
        "pill.hint": "打开番茄钟",
        "handle.drag": "拖动可上下移动，单击展开",
        "action.collapse": "收起",
        "a11y.progress": "已完成 {percent}%",
      },
      en: {
        "tab.title": "Pomodoro",
        "guide.title": "Pomodoro timer",
        "guide.description": "A one-shot countdown or a Pomodoro cycle, with a chime at the end.",
        "mode.once": "One-shot",
        "mode.cycle": "Pomodoro cycle",
        "setting.mode": "Mode",
        "setting.duration": "Countdown",
        "phase.focus": "Focus",
        "phase.short": "Short break",
        "phase.long": "Long break",
        "state.running": "Running",
        "state.idle": "Ready",
        "action.start": "Start",
        "action.pause": "Pause",
        "action.resume": "Resume",
        "action.reset": "Reset",
        "action.skip": "Skip",
        "notice.focusDone": "Focus done — take a break.",
        "notice.breakDone": "Break over — back to focus.",
        "notice.cycleDone": "{count} rounds done, take a long break.",
        "notice.done": "Time is up — {minutes} minutes done.",
        "stat.today": "Done today",
        "stat.cycle": "Round",
        "stat.pomodoros": "{count} pomodoros",
        "setting.focus": "Focus length",
        "setting.short": "Short break length",
        "setting.long": "Long break length",
        "setting.rounds": "Rounds per cycle",
        "setting.autoStart": "Auto-start the next phase",
        "setting.sound": "Sound",
        "sound.chime": "Chime",
        "sound.airport": "Airport chime",
        "sound.bell": "Bell",
        "sound.woodblock": "Woodblock",
        "sound.off": "Silent",
        "sound.preview": "Preview the sound",
        "speech.focusDone": "Your focus session is over. Please take a short break.",
        "speech.breakDone": "Break is over. Ready when you are.",
        "setting.notify": "Desktop notification",
        "unit.minutes": "{count} min",
        "pill.hint": "Open the pomodoro timer",
        "handle.drag": "Drag to move, click to open",
        "action.collapse": "Collapse",
        "a11y.progress": "{percent}% elapsed",
      },
    };

    const CSS = `
.dsh-pom {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--dsw-alias-label-primary);
  background: transparent;
}
/* docked tab in the right column */
.dsh-pom--pane { height: 100%; overflow-y: auto; }
/* right-edge popover over the whole frame */
.dsh-pom--overlay {
  position: fixed;
  right: 14px;
  top: 86px;
  z-index: 70;
  width: 320px;
  max-height: calc(100vh - 130px);
  overflow-y: auto;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-xl, 12px);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: -6px 10px 28px rgba(0, 0, 0, 0.16);
  pointer-events: auto;
}
/* collapsed handle hugging the right edge */
.dsh-pom__launcher {
  position: fixed;
  right: 0;
  top: 226px;
  z-index: 70;
  box-sizing: border-box;
  width: 54px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 9px 7px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-right: 0;
  border-radius: var(--dsw-radius-xl, 12px) 0 0 var(--dsw-radius-xl, 12px);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: -4px 6px 18px rgba(0, 0, 0, 0.14);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  cursor: grab;
  touch-action: none;
  user-select: none;
  pointer-events: auto;
}
.dsh-pom__launcher:active { cursor: grabbing; }
.dsh-pom__launcher:hover { background: var(--dsw-alias-bg-layer-2); }
.dsh-pom__launcher:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.dsh-pom__launcher-time {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.dsh-pom__dot { width: 5px; height: 5px; border-radius: 50%; }
@media (max-width: 900px) {
  .dsh-pom--overlay { width: 260px; right: 8px; }
}
.dsh-pom * { box-sizing: border-box; }
.dsh-pom__head { display: flex; align-items: center; gap: 8px; }
.dsh-pom__phase { font-size: 14px; font-weight: 600; }
.dsh-pom__badge { margin-left: auto; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.dsh-pom__collapse {
  margin-left: 4px;
  width: 22px; height: 22px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid transparent;
  border-radius: var(--dsw-radius-md, 8px);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 11px; line-height: 1;
  cursor: pointer;
}
.dsh-pom__collapse:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh-pom__collapse:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.dsh-pom__ring { position: relative; width: 168px; height: 168px; margin: 0 auto; }
.dsh-pom__ring-track { stroke: var(--dsw-alias-border-l2); }
.dsh-pom__ring-bar { transition: stroke-dashoffset 0.3s linear, stroke 0.2s linear; }
.dsh-pom__time {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
}
.dsh-pom__clock {
  font-size: 34px; font-weight: 650; letter-spacing: 0.5px;
  font-variant-numeric: tabular-nums;
}
.dsh-pom__state { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.dsh-pom__actions { display: flex; gap: 8px; justify-content: center; }
.dsh-pom__btn {
  appearance: none; cursor: pointer;
  border-radius: var(--dsw-radius-md, 8px);
  border: 1px solid transparent;
  padding: 6px 14px;
  font-size: 13px;
  font-family: inherit;
  transition: background 0.15s ease, opacity 0.15s ease;
}
.dsh-pom__btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-pom__btn--primary {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
  min-width: 84px;
}
.dsh-pom__btn--primary:hover { background: var(--dsw-alias-button-primary-hover); }
.dsh-pom__btn--ghost {
  background: transparent;
  border-color: var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
}
.dsh-pom__btn--ghost:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-pom__tabs {
  display: flex; gap: 4px; padding: 3px;
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-bg-l2);
}
.dsh-pom__tab {
  flex: 1; appearance: none; cursor: pointer;
  border: 0; border-radius: var(--dsw-radius-md, 8px);
  background: transparent; color: var(--dsw-alias-label-secondary);
  padding: 5px 4px; font-size: 12px; font-family: inherit;
}
.dsh-pom__tab:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-pom__tab.is-active {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.dsh-pom__notice {
  padding: 7px 10px;
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-bg-l2);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.dsh-pom__stats {
  display: flex; gap: 14px; font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-pom__section {
  border-top: 1px solid var(--dsw-alias-border-l1);
  padding-top: 8px;
  display: flex; flex-direction: column; gap: 2px;
}
.dsh-pom__section-title {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--dsw-alias-label-tertiary); margin-bottom: 4px;
}
.dsh-pom__row {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 3px 0;
}
.dsh-pom__label { color: var(--dsw-alias-label-secondary); }
.dsh-pom__stepper { display: flex; align-items: center; gap: 4px; }
.dsh-pom__num {
  min-width: 40px; text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
}
.dsh-pom__mini {
  appearance: none; cursor: pointer;
  width: 22px; height: 22px; line-height: 1;
  border-radius: var(--dsw-radius-md, 8px);
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent; color: var(--dsw-alias-label-secondary);
  font-family: inherit; font-size: 13px;
}
.dsh-pom__mini:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-pom__mini:disabled { opacity: 0.4; cursor: default; }
.dsh-pom__check { cursor: pointer; }
.dsh-pom__check input { accent-color: var(--dsw-alias-brand-primary); }
.dsh-pom__select {
  appearance: none;
  cursor: pointer;
  padding: 3px 8px;
  border-radius: var(--dsw-radius-md, 8px);
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 11px;
}
.dsh-pom__select:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-pom__title {
  font-variant-numeric: tabular-nums;
  display: inline-flex; align-items: center; gap: 4px;
}
`;

    const todayKey = () => {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      return `${now.getFullYear()}-${month}-${day}`;
    };

    const formatClock = (ms) => {
      const total = Math.max(0, Math.ceil(ms / 1000));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;
      const pad = (value) => String(value).padStart(2, "0");
      return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
    };

    /** The tomato mark used as the tab guide icon and the composer pill mark. */
    function TomatoIcon(props) {
      const size = props && typeof props.size === "number" ? props.size : 16;
      const className = props ? props.className : undefined;
      return h("svg", {
        className,
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        "aria-hidden": "true",
      }, [
        h("circle", { key: "body", cx: 12, cy: 14.5, r: 7.6, fill: "#e5484d" }),
        h("path", {
          key: "leaf-left",
          d: "M11.6 6.6C9.5 7 7.6 5.7 6.6 3.5c2.6-.3 4.4.8 5 3.1Z",
          fill: "#46c662",
        }),
        h("path", {
          key: "leaf-right",
          d: "M12.4 6.6c2.1.4 4-0.8 5-3.1-2.6-.3-4.4.8-5 3.1Z",
          fill: "#3fb950",
        }),
        h("path", {
          key: "stem",
          d: "M12 7.2V3.8",
          stroke: "#2f9e44",
          strokeWidth: 1.7,
          strokeLinecap: "round",
        }),
      ]);
    }

    /**
     * The timer itself. One store per client instance; components read it through
     * `useSyncExternalStore`, so every mutation is a snapshot swap.
     */
    function createStore(t, lang) {
      const activeLang = typeof lang === "function" ? lang : () => "";
      const listeners = new Set();
      const state = {
        phase: "focus",
        running: false,
        endsAt: 0,
        remaining: DEFAULT_SETTINGS.focus * MINUTE,
        completed: 0,
        cycle: 0,
        date: todayKey(),
        notice: null,
        settings: { ...DEFAULT_SETTINGS },
      };
      let snapshot = { ...state, settings: { ...state.settings } };
      let ticker = null;
      let audio = null;
      let lastSecond = -1;

      const emit = () => {
        snapshot = { ...state, settings: { ...state.settings } };
        for (const listener of [...listeners]) {
          try {
            listener();
          } catch (error) {
            console.warn("[dsh-pomodoro] a store listener failed:", error);
          }
        }
      };

      const durationMs = (phase) => {
        const minutes = Number(state.settings[phase]);
        const safe = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_SETTINGS[phase];
        return Math.round(safe * MINUTE);
      };

      const persist = () => {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
            phase: state.phase,
            running: state.running,
            endsAt: state.endsAt,
            remaining: state.remaining,
            completed: state.completed,
            cycle: state.cycle,
            date: state.date,
            settings: state.settings,
          }));
        } catch (error) {
          /* private mode or a full quota: the timer still runs */
        }
      };

      /** The line the airport cue reads out, in the language on screen. */
      const speechLine = (finishedPhase) => (finishedPhase && finishedPhase !== "focus"
        ? t("speech.breakDone")
        : t("speech.focusDone"));

      const speechTimers = new Set();
      const speakLine = (text, delaySeconds) => {
        const synth = window.speechSynthesis;
        const Utterance = window.SpeechSynthesisUtterance;
        if (!text || !synth || typeof Utterance !== "function") return;
        const fire = () => {
          try {
            const utterance = new Utterance(text);
            utterance.lang = String(activeLang()).startsWith("en") ? "en-US" : "zh-CN";
            utterance.rate = 0.92;
            utterance.pitch = 0.94;
            utterance.volume = 0.95;
            if (typeof synth.cancel === "function") synth.cancel();
            synth.speak(utterance);
          } catch (error) {
            /* a missing voice is not a failure */
          }
        };
        if (typeof window.setTimeout !== "function") {
          fire();
          return;
        }
        const id = window.setTimeout(() => {
          speechTimers.delete(id);
          fire();
        }, Math.max(0, Math.round(delaySeconds * 1000)));
        speechTimers.add(id);
      };

      const stopSpeech = () => {
        for (const id of speechTimers) {
          try { window.clearTimeout(id); } catch (error) { /* already gone */ }
        }
        speechTimers.clear();
        try {
          if (window.speechSynthesis && typeof window.speechSynthesis.cancel === "function") {
            window.speechSynthesis.cancel();
          }
        } catch (error) {
          /* nothing to cancel */
        }
      };

      /** One struck note: the fundamental, plus a quiet overtone when the spec asks. */
      const strike = (spec, frequency, at) => {
        const partial = typeof spec.partial === "number" ? spec.partial : 0;
        const voices = partial > 0
          ? [{ ratio: 1, level: spec.peak }, { ratio: partial, level: spec.peak * 0.3 }]
          : [{ ratio: 1, level: spec.peak }];
        for (const voice of voices) {
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          oscillator.type = spec.type;
          oscillator.frequency.value = frequency * voice.ratio;
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.exponentialRampToValueAtTime(voice.level, at + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + spec.decay);
          oscillator.connect(gain);
          gain.connect(audio.destination);
          oscillator.start(at);
          oscillator.stop(at + spec.decay + 0.03);
        }
      };

      const playAlarm = (soundId, finishedPhase) => {
        const spec = SOUND_SPECS[soundId];
        if (!spec) return;
        try {
          const AudioCtor = window.AudioContext || window.webkitAudioContext;
          if (typeof AudioCtor !== "function") return;
          if (audio === null) audio = new AudioCtor();
          if (audio.state === "suspended" && typeof audio.resume === "function") void audio.resume();
          const rounds = typeof spec.repeat === "number" && spec.repeat > 0 ? Math.floor(spec.repeat) : 1;
          const motif = spec.notes.length * spec.gap + spec.decay * 0.5;
          const base = audio.currentTime;
          for (let round = 0; round < rounds; round += 1) {
            const offset = base + round * (motif + (spec.repeatGap || 0));
            spec.notes.forEach((frequency, index) => strike(spec, frequency, offset + index * spec.gap));
          }
          if (spec.speech) speakLine(speechLine(finishedPhase), rounds * (motif + (spec.repeatGap || 0)) - spec.decay * 0.4);
        } catch (error) {
          /* audio is a nicety, never a failure */
        }
      };

      const notifyDesktop = (title, body) => {
        try {
          if (typeof window.Notification === "undefined") return;
          if (window.Notification.permission === "granted") {
            new window.Notification(title, { body, tag: "dsh-pomodoro" });
          }
        } catch (error) {
          /* notifications are a nicety, never a failure */
        }
      };

      const requestNotifyPermission = () => {
        try {
          if (typeof window.Notification === "undefined") return;
          if (window.Notification.permission === "default" && typeof window.Notification.requestPermission === "function") {
            void window.Notification.requestPermission();
          }
        } catch (error) {
          /* the browser refused; the checkbox still reflects the intent */
        }
      };

      const finish = () => {
        const finished = state.phase;
        const minutes = Math.max(1, Math.round(durationMs(finished) / MINUTE));
        state.running = false;
        state.endsAt = 0;
        lastSecond = -1;
        stopTicker();

        /* One-shot: ring once, stop dead, re-arm the same countdown. */
        if (state.settings.mode !== "cycle") {
          state.completed += 1;
          state.cycle = 0;
          state.remaining = durationMs(finished);
          state.notice = { key: "notice.done", params: { minutes } };
          playAlarm(state.settings.sound, finished);
          if (state.settings.notify) notifyDesktop(t("notice.done", { minutes }), formatClock(state.remaining));
          persist();
          emit();
          return;
        }

        const rounds = Math.max(1, Math.round(Number(state.settings.rounds)) || DEFAULT_SETTINGS.rounds);
        let next = "focus";
        let noticeKey = "notice.breakDone";
        if (finished === "focus") {
          state.completed += 1;
          state.cycle += 1;
          if (state.cycle % rounds === 0) {
            next = "long";
            noticeKey = "notice.cycleDone";
          } else {
            next = "short";
            noticeKey = "notice.focusDone";
          }
        } else {
          state.cycle = 0;
        }
        state.phase = next;
        state.remaining = durationMs(next);
        state.notice = { key: noticeKey, params: { count: rounds } };
        playAlarm(state.settings.sound, finished);
        if (state.settings.notify) notifyDesktop(t(noticeKey, { count: rounds }), t(`phase.${next}`));
        if (state.settings.autoStart) {
          state.running = true;
          state.endsAt = Date.now() + state.remaining;
          lastSecond = Math.ceil(state.remaining / 1000);
        }
        persist();
        emit();
        if (state.running) startTicker();
      };

      const tick = () => {
        if (!state.running) {
          stopTicker();
          return;
        }
        const left = Math.max(0, state.endsAt - Date.now());
        const second = Math.ceil(left / 1000);
        if (second !== lastSecond) {
          lastSecond = second;
          state.remaining = left;
          emit();
        }
        if (left <= 0) finish();
      };

      function startTicker() {
        if (ticker !== null) return;
        ticker = window.setInterval(tick, TICK_MS);
      }

      function stopTicker() {
        if (ticker === null) return;
        window.clearInterval(ticker);
        ticker = null;
      }

      const restore = () => {
        try {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          if (!raw) return;
          const saved = JSON.parse(raw);
          if (!saved || typeof saved !== "object") return;
          if (saved.date !== todayKey()) return;
          if (saved.settings && typeof saved.settings === "object") {
            for (const key of Object.keys(DEFAULT_SETTINGS)) {
              const value = saved.settings[key];
              if (key === "sound") {
                /* Older builds stored a boolean here. */
                if (typeof value === "string" && SOUND_IDS.includes(value)) state.settings.sound = value;
                else if (value === true) state.settings.sound = "chime";
                else if (value === false) state.settings.sound = "off";
              } else if (key === "mode") {
                if (value === "once" || value === "cycle") state.settings.mode = value;
              } else if (typeof DEFAULT_SETTINGS[key] === "boolean") {
                if (typeof value === "boolean") state.settings[key] = value;
              } else if (typeof value === "number" && Number.isFinite(value)) {
                state.settings[key] = value;
              }
            }
          }
          if (PHASES.includes(saved.phase)) state.phase = saved.phase;
          state.completed = Number.isFinite(saved.completed) ? Math.max(0, saved.completed) : 0;
          state.cycle = Number.isFinite(saved.cycle) ? Math.max(0, saved.cycle) : 0;
          if (saved.running && Number.isFinite(saved.endsAt)) {
            state.endsAt = saved.endsAt;
            state.remaining = Math.max(0, saved.endsAt - Date.now());
            state.running = true;
          } else {
            state.remaining = Number.isFinite(saved.remaining) ? Math.max(0, saved.remaining) : durationMs(state.phase);
          }
        } catch (error) {
          console.warn("[dsh-pomodoro] could not restore the saved timer:", error);
        }
        /* One-shot never sits on a break phase left over from a cycle run. */
        if (state.settings.mode !== "cycle" && state.phase !== "focus") {
          state.phase = "focus";
          state.remaining = durationMs("focus");
          state.running = false;
          state.endsAt = 0;
        }
      };

      const start = () => {
        if (state.running) return;
        if (state.remaining <= 0) state.remaining = durationMs(state.phase);
        state.running = true;
        state.endsAt = Date.now() + state.remaining;
        state.notice = null;
        lastSecond = Math.ceil(state.remaining / 1000);
        startTicker();
        persist();
        emit();
      };

      const pause = () => {
        if (!state.running) return;
        state.remaining = Math.max(0, state.endsAt - Date.now());
        state.running = false;
        state.endsAt = 0;
        state.notice = null;
        stopTicker();
        persist();
        emit();
      };

      const toggle = () => {
        if (state.running) pause();
        else start();
      };

      const reset = () => {
        state.running = false;
        state.endsAt = 0;
        state.remaining = durationMs(state.phase);
        state.notice = null;
        lastSecond = -1;
        stopTicker();
        persist();
        emit();
      };

      const skip = () => {
        /* A one-shot countdown has no next phase to skip to. */
        if (state.settings.mode !== "cycle") {
          reset();
          return;
        }
        const finished = state.phase;
        const next = finished === "focus" ? "short" : "focus";
        if (finished !== "focus") state.cycle = 0;
        state.phase = next;
        state.remaining = durationMs(next);
        state.running = false;
        state.endsAt = 0;
        state.notice = null;
        lastSecond = -1;
        stopTicker();
        persist();
        emit();
      };

      const setPhase = (phase) => {
        if (!PHASES.includes(phase) || phase === state.phase) return;
        state.phase = phase;
        state.remaining = durationMs(phase);
        state.running = false;
        state.endsAt = 0;
        state.notice = null;
        lastSecond = -1;
        stopTicker();
        persist();
        emit();
      };

      const setDuration = (phase, minutes) => {
        if (!PHASES.includes(phase)) return;
        const next = Math.min(120, Math.max(1, Math.round(Number(minutes) || 1)));
        state.settings[phase] = next;
        if (!state.running && phase === state.phase) state.remaining = durationMs(phase);
        persist();
        emit();
      };

      /** Switching modes always re-arms the focus countdown; nothing keeps running. */
      const applyMode = (mode) => {
        if (mode !== "once" && mode !== "cycle") return;
        if (state.settings.mode === mode) return;
        state.settings.mode = mode;
        state.phase = "focus";
        state.running = false;
        state.endsAt = 0;
        state.cycle = 0;
        state.remaining = durationMs("focus");
        state.notice = null;
        lastSecond = -1;
        stopTicker();
        persist();
        emit();
      };

      const setSetting = (key, value) => {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) return;
        if (key === "mode") {
          applyMode(value);
          return;
        }
        if (key === "notify") {
          state.settings.notify = Boolean(value);
          if (state.settings.notify) requestNotifyPermission();
        } else if (key === "sound") {
          if (SOUND_IDS.includes(value)) state.settings.sound = value;
        } else if (key === "rounds") {
          state.settings.rounds = Math.min(12, Math.max(1, Math.round(Number(value) || 1)));
        } else if (typeof DEFAULT_SETTINGS[key] === "boolean") {
          state.settings[key] = Boolean(value);
        }
        persist();
        emit();
      };

      const subscribe = (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      };

      const getSnapshot = () => snapshot;

      const bump = () => {
        emit();
      };

      const dispose = () => {
        stopTicker();
        stopSpeech();
        persist();
        listeners.clear();
      };

      restore();
      if (state.running) {
        lastSecond = Math.ceil(state.remaining / 1000);
        startTicker();
      }
      emit();

      return {
        subscribe,
        getSnapshot,
        bump,
        dispose,
        durationMs,
        start,
        pause,
        toggle,
        reset,
        skip,
        setPhase,
        setDuration,
        setSetting,
        previewSound: (phase) => playAlarm(state.settings.sound, phase),
      };
    }

    /** The timer itself: shared by the docked tab and the right-edge popover. */
    function PomodoroPanel(props) {
      const store = props.store;
      const t = props.t;
      const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

      const total = store.durationMs(state.phase);
      const ratio = total > 0 ? Math.min(1, Math.max(0, 1 - state.remaining / total)) : 0;
      const circumference = 2 * Math.PI * 74;
      const accent = PHASE_ACCENT[state.phase] || PHASE_ACCENT.focus;
      const once = state.settings.mode !== "cycle";
      const modeTab = (mode, label) => h("button", {
        key: mode,
        type: "button",
        className: `dsh-pom__tab${(state.settings.mode === mode) ? " is-active" : ""}`,
        onClick: () => store.setSetting("mode", mode),
      }, label);

      const stepper = (label, value, onChange, min, max) => h("div", { className: "dsh-pom__row" },
        h("span", { className: "dsh-pom__label" }, label),
        h("div", { className: "dsh-pom__stepper" },
          h("button", {
            key: "minus",
            type: "button",
            className: "dsh-pom__mini",
            onClick: () => onChange(value - 1),
            disabled: value <= min,
            "aria-label": label,
          }, "−"),
          h("span", { key: "value", className: "dsh-pom__num" }, String(value)),
          h("button", {
            key: "plus",
            type: "button",
            className: "dsh-pom__mini",
            onClick: () => onChange(value + 1),
            disabled: value >= max,
            "aria-label": label,
          }, "+"),
        ),
      );

      const toggleRow = (label, checked, onChange) => h("label", { className: "dsh-pom__row dsh-pom__check" },
        h("span", { className: "dsh-pom__label" }, label),
        h("input", {
          type: "checkbox",
          checked,
          onChange: (event) => onChange(event.target.checked),
        }),
      );

      return h(React.Fragment, null,
        h("div", { className: "dsh-pom__head" },
          h(TomatoIcon, { size: 18 }),
          h("span", { className: "dsh-pom__phase", style: { color: accent } }, once ? t("mode.once") : t(`phase.${state.phase}`)),
          h("span", { className: "dsh-pom__badge" }, t("stat.pomodoros", { count: state.completed })),
          props.onCollapse
            ? h("button", {
              type: "button",
              className: "dsh-pom__collapse",
              title: t("action.collapse"),
              "aria-label": t("action.collapse"),
              onClick: props.onCollapse,
            }, "\u2304")
            : null,
        ),
        h("div", { className: "dsh-pom__tabs" },
          modeTab("once", t("mode.once")),
          modeTab("cycle", t("mode.cycle")),
        ),
        h("div", { className: "dsh-pom__ring" },
          h("svg", { width: 168, height: 168, viewBox: "0 0 168 168", role: "img", "aria-label": t("a11y.progress", { percent: Math.round(ratio * 100) }) },
            h("circle", { className: "dsh-pom__ring-track", cx: 84, cy: 84, r: 74, fill: "none", strokeWidth: 8 }),
            h("circle", {
              className: "dsh-pom__ring-bar",
              cx: 84,
              cy: 84,
              r: 74,
              fill: "none",
              strokeWidth: 8,
              strokeLinecap: "round",
              strokeDasharray: circumference,
              strokeDashoffset: circumference * (1 - ratio),
              transform: "rotate(-90 84 84)",
              style: { stroke: accent },
            }),
          ),
          h("div", { className: "dsh-pom__time" },
            h("div", { className: "dsh-pom__clock" }, formatClock(state.remaining)),
            h("div", { className: "dsh-pom__state" }, state.running ? t("state.running") : t("state.idle")),
          ),
        ),
        h("div", { className: "dsh-pom__actions" },
          h("button", {
            type: "button",
            className: "dsh-pom__btn dsh-pom__btn--primary",
            onClick: () => store.toggle(),
          }, state.running ? t("action.pause") : (state.remaining < total ? t("action.resume") : t("action.start"))),
          h("button", {
            type: "button",
            className: "dsh-pom__btn dsh-pom__btn--ghost",
            onClick: () => store.reset(),
          }, t("action.reset")),
          once
            ? null
            : h("button", {
              type: "button",
              className: "dsh-pom__btn dsh-pom__btn--ghost",
              onClick: () => store.skip(),
            }, t("action.skip")),
        ),
        once
          ? null
          : h("div", { className: "dsh-pom__tabs" },
            ...PHASES.map((phase) => h("button", {
              key: phase,
              type: "button",
              className: `dsh-pom__tab${phase === state.phase ? " is-active" : ""}`,
              onClick: () => store.setPhase(phase),
            }, t(`phase.${phase}`))),
          ),
        state.notice
          ? h("div", { className: "dsh-pom__notice", role: "status" }, t(state.notice.key, state.notice.params))
          : null,
        h("div", { className: "dsh-pom__stats" },
          h("span", null, `${t("stat.today")} ${state.completed}`),
          once ? null : h("span", null, `${t("stat.cycle")} ${state.cycle}/${state.settings.rounds}`),
        ),
        h("div", { className: "dsh-pom__section" },
          h("div", { className: "dsh-pom__section-title" }, once ? t("setting.duration") : t("setting.focus")),
          once
            ? stepper(t("setting.duration"), state.settings.focus, (value) => store.setDuration("focus", value), 1, 120)
            : h(React.Fragment, null,
              stepper(t("setting.focus"), state.settings.focus, (value) => store.setDuration("focus", value), 1, 120),
              stepper(t("setting.short"), state.settings.short, (value) => store.setDuration("short", value), 1, 60),
              stepper(t("setting.long"), state.settings.long, (value) => store.setDuration("long", value), 1, 60),
              stepper(t("setting.rounds"), state.settings.rounds, (value) => store.setSetting("rounds", value), 1, 12),
            ),
        ),
        h("div", { className: "dsh-pom__section" },
          once
            ? null
            : toggleRow(t("setting.autoStart"), state.settings.autoStart, (value) => store.setSetting("autoStart", value)),
          h("div", { className: "dsh-pom__row" },
            h("span", { className: "dsh-pom__label" }, t("setting.sound")),
            h("div", { className: "dsh-pom__stepper" },
              h("select", {
                className: "dsh-pom__select",
                value: state.settings.sound,
                onChange: (event) => store.setSetting("sound", event.target.value),
              },
                ...SOUND_IDS.map((id) => h("option", { key: id, value: id }, t(`sound.${id}`))),
              ),
              h("button", {
                type: "button",
                className: "dsh-pom__mini",
                title: t("sound.preview"),
                "aria-label": t("sound.preview"),
                onClick: () => store.previewSound(),
              }, "▶"),
            ),
          ),
          toggleRow(t("setting.notify"), state.settings.notify, (value) => store.setSetting("notify", value)),
        ),
      );
    }

    /** The docked tab body. */
    function PomodoroBody(props) {
      return h("div", { className: "dsh-pom dsh-pom--pane" },
        h("style", null, CSS),
        h(PomodoroPanel, props),
      );
    }

    /**
     * The frame-wide right-edge surface: a handle hugging the edge that opens a
     * popover card, exactly like the weather chip beside it. Both states read
     * the same timer store, so the countdown keeps running while collapsed.
     */
    function PomodoroDock(props) {
      const store = props.store;
      const t = props.t;
      const ui = props.ui;
      const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
      const view = React.useSyncExternalStore(ui.subscribe, ui.getSnapshot, ui.getSnapshot);
      const storedTop = React.useSyncExternalStore(ui.subscribe, ui.getTopSnapshot, ui.getTopSnapshot);
      const [dragging, setDragging] = React.useState(null);
      const dragMoved = React.useRef(false);
      const accent = PHASE_ACCENT[state.phase] || PHASE_ACCENT.focus;
      const top = dragging === null ? storedTop : dragging;

      /* The handle is dragged up and down along the right edge; a plain click opens. */
      const beginDrag = (event) => {
        if (!event || typeof event.clientY !== "number") return;
        if (typeof event.button === "number" && event.button !== 0) return;
        const startY = event.clientY;
        const startTop = ui.getTop();
        const handle = event.currentTarget;
        const height = handle && handle.offsetHeight ? handle.offsetHeight : 96;
        const viewport = typeof window.innerHeight === "number" && window.innerHeight > 0 ? window.innerHeight : 900;
        const maxTop = Math.max(8, viewport - height - 8);
        let lastTop = null;
        dragMoved.current = false;
        if (handle && typeof handle.setPointerCapture === "function" && typeof event.pointerId === "number") {
          try { handle.setPointerCapture(event.pointerId); } catch (error) { /* capture is optional */ }
        }
        const detach = () => {
          if (typeof window.removeEventListener === "function") {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", finish);
            window.removeEventListener("pointercancel", finish);
          }
        };
        const onMove = (moveEvent) => {
          const dy = moveEvent.clientY - startY;
          if (Math.abs(dy) > 3) dragMoved.current = true;
          if (!dragMoved.current) return;
          lastTop = Math.max(8, Math.min(maxTop, Math.round(startTop + dy)));
          setDragging(lastTop);
        };
        const finish = () => {
          detach();
          setDragging(null);
          if (dragMoved.current && lastTop !== null) ui.setTop(lastTop);
        };
        if (typeof window.addEventListener === "function") {
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", finish);
          window.addEventListener("pointercancel", finish);
        }
      };

      const openPopover = () => {
        if (dragMoved.current) {
          dragMoved.current = false;
          return;
        }
        ui.set(true);
      };

      if (!view.open) {
        return h("button", {
          type: "button",
          className: "dsh-pom__launcher",
          title: t("handle.drag"),
          "aria-label": t("handle.drag"),
          style: { top: `${top}px` },
          onPointerDown: beginDrag,
          onClick: openPopover,
        },
          h("style", null, CSS),
          h(TomatoIcon, { size: 15 }),
          h("span", { className: "dsh-pom__launcher-time" }, formatClock(state.remaining)),
          state.running
            ? h("span", { className: "dsh-pom__dot", style: { background: accent } })
            : null,
        );
      }

      /* The card opens from the handle's own height: below it, or above it in the lower half. */
      const viewportHeight = typeof window.innerHeight === "number" && window.innerHeight > 0 ? window.innerHeight : 900;
      const placeAbove = top > viewportHeight / 2;
      const overlayStyle = placeAbove
        ? {
          top: "auto",
          bottom: `${Math.max(12, Math.round(viewportHeight - top))}px`,
          maxHeight: `${Math.max(200, Math.round(top) - 24)}px`,
        }
        : {
          top: `${Math.round(top)}px`,
          maxHeight: `${Math.max(200, Math.round(viewportHeight - top - 16))}px`,
        };

      return h("div", { className: "dsh-pom dsh-pom--overlay", style: overlayStyle },
        h("style", null, CSS),
        h(PomodoroPanel, { store, t, onCollapse: () => ui.set(false) }),
      );
    }

    /** The tab chip title: a live countdown. */
    function PomodoroTabTitle(props) {
      const store = props.store;
      const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
      return h("span", { className: "dsh-pom__title" }, formatClock(state.remaining));
    }

    /**
     * Open/collapsed state and vertical anchor of the right-edge popover. It is
     * its own tiny observable so the handle and the popover follow the same
     * switch, and so both choices survive a reload.
     */
    function createUi() {
      let open = false;
      try {
        open = window.localStorage.getItem(OVERLAY_KEY) === "1";
      } catch (error) {
        open = false;
      }

      const clampTop = (value) => {
        const viewport = typeof window.innerHeight === "number" && window.innerHeight > 0 ? window.innerHeight : 900;
        return Math.max(8, Math.min(Math.round(viewport * 0.72), Math.round(Number(value) || 0)));
      };
      let anchor = DEFAULT_ANCHOR_TOP;
      try {
        const saved = Number(window.localStorage.getItem(ANCHOR_KEY));
        if (Number.isFinite(saved) && saved > 0) anchor = clampTop(saved);
      } catch (error) {
        anchor = DEFAULT_ANCHOR_TOP;
      }

      let snapshot = { open };
      const listeners = new Set();
      const emit = () => {
        for (const listener of listeners) listener();
      };
      const set = (value) => {
        const next = value === true;
        if (next === open) return;
        open = next;
        snapshot = { open };
        try {
          window.localStorage.setItem(OVERLAY_KEY, open ? "1" : "0");
        } catch (error) {
          /* private mode: the popover simply reopens collapsed */
        }
        emit();
      };
      return {
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        getSnapshot: () => snapshot,
        set,
        toggle: () => set(!open),
        isOpen: () => open,
        getTopSnapshot: () => anchor,
        getTop: () => anchor,
        setTop(value) {
          const next = clampTop(value);
          if (next === anchor) return;
          anchor = next;
          try {
            window.localStorage.setItem(ANCHOR_KEY, String(anchor));
          } catch (error) {
            /* private mode: the handle keeps the position for this page only */
          }
          emit();
        },
      };
    }

    function apply(ctx) {
      const locale = ctx.get("locale");
      const t = typeof locale?.bind === "function"
        ? locale.bind(NS)
        : (key, params) => locale?.translate?.(NS, key, params) ?? key;

      ctx.effect(() => {
        try {
          return locale.register(NS, DICTIONARIES);
        } catch (error) {
          /* a hot reload can register the namespace twice; the dictionary is already live */
          console.warn("[dsh-pomodoro] locale dictionaries:", error?.message ?? error);
          return () => {};
        }
      }, "dsh-pomodoro: locale dictionaries");

      const store = createStore(t, () => locale?.getSnapshot?.()?.active ?? "");
      const ui = createUi();

      ctx.effect(() => locale.subscribe(() => store.bump()), "dsh-pomodoro: locale subscription");

      ctx.inject(["sidebarRightTabs"], (tabOwner) => {
        const tabs = tabOwner.get("sidebarRightTabs");
        tabOwner.effect(() => tabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          priority: "extension",
          title: () => t("tab.title"),
          guide: [{
            id: "pomodoro",
            order: 50,
            title: () => t("guide.title"),
            description: () => t("guide.description"),
            icon: TomatoIcon,
          }],
        }), "dsh-pomodoro: sidebar tab type");

        const tabRegister = tabOwner.slots.register.bind(tabOwner.slots);
        tabOwner.slots.inject("sidebar.right.pane.tab", () => tabRegister({
          name: "sidebar.right.pane.tab",
          key: TAB_ID,
          inject: () => ({ store, t }),
        }, PomodoroBody));
        tabOwner.slots.inject("sidebar.right.pane.tab.title", () => tabRegister({
          name: "sidebar.right.pane.tab.title",
          key: TAB_ID,
          inject: () => ({ store, t }),
        }, PomodoroTabTitle));
      });

      /* The right-edge handle + popover live in the frame-wide layer, so they
         stay put above every column and outside its scroll container. */
      ctx.slots.inject("shell.overlay", () => ctx.slots.register({
        name: "shell.overlay",
        id: "dsh-pomodoro",
        order: 60,
        label: () => t("tab.title"),
        inject: () => ({ store, t, ui }),
      }, PomodoroDock));

      /* Escape collapses the popover, the way a popover is expected to behave. */
      ctx.effect(() => {
        if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
          return undefined;
        }
        const onKeyDown = (event) => {
          if (event && event.key === "Escape" && ui.isOpen()) ui.set(false);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
      }, "dsh-pomodoro: escape collapses the popover");

      ctx.effect(() => () => store.dispose(), "dsh-pomodoro: dispose the timer store");
    }

    return {
      inject: ["slots", "locale"],
      apply,
    };
  },
});
