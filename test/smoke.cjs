/**
 * Deterministic smoke test for the browser half of dsh-pomodoro-clock.
 *
 * It does NOT boot the real DSH shell. It loads client.js exactly the way the
 * browser module system does — `window.__ModuleLoader__.load({ id, factory })`
 * then `factory(require)` — with a minimal React shim, then runs
 * `descriptor.apply(ctx)` against a recording ctx and invokes every registered
 * component once. Any throw, missing slot, or dictionary drift fails the run.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const BUNDLE = path.resolve(__dirname, "../client.js");
const failures = [];
const ok = (label) => console.log(`  ok   ${label}`);
const fail = (label, detail) => {
  failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
  console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
};

/* ------------------------------------------------------------------ React shim */
function createElement(type, props, ...children) {
  const flat = children
    .flat(Infinity)
    .filter((c) => c !== null && c !== undefined && typeof c !== "boolean");
  return { $$el: true, type, props: props || {}, children: flat };
}
const Fragment = Symbol.for("react.fragment");

const React = {
  Fragment,
  createElement,
  useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
  useReducer: (reducer, initial) => [initial, () => {}],
  useRef: (initial) => ({ current: initial }),
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useEffect: () => {},
  useLayoutEffect: () => {},
  useImperativeHandle: () => {},
  useContext: () => ({}),
  useSyncExternalStore: (subscribe, getSnapshot) => {
    if (typeof subscribe === "function") subscribe(() => {});
    return getSnapshot();
  },
  memo: (component) => component,
  forwardRef: (fn) => fn,
  Children: { toArray: (c) => (Array.isArray(c) ? c : c == null ? [] : [c]) },
};

/* --------------------------------------------------------- browser environment */
const intervals = new Map();
let intervalSeq = 0;
const timers = new Map();
let timerSeq = 0;
const storage = new Map();

/* WebAudio + speech stand-ins, so the alarm path is exercised instead of skipped. */
const oscillators = [];
class FakeParam {
  constructor(name) { this.name = name; this.value = 0; this.ramps = []; }
  setValueAtTime(v) { this.value = v; return this; }
  exponentialRampToValueAtTime(v, t) { this.ramps.push([v, t]); this.value = v; return this; }
}
class FakeAudioContext {
  constructor() { this.state = "running"; this.destination = { kind: "destination" }; }
  get currentTime() { return clockNow / 1000; }
  resume() { this.state = "running"; return Promise.resolve(); }
  createOscillator() {
    const node = { type: "sine", frequency: new FakeParam("frequency"), started: null, stopped: null, connect() {}, start(t) { this.started = t; }, stop(t) { this.stopped = t; } };
    oscillators.push(node);
    return node;
  }
  createGain() { return { gain: new FakeParam("gain"), connect() {} }; }
}
class FakeUtterance {
  constructor(text) { this.text = text; this.lang = ""; this.rate = 1; this.pitch = 1; this.volume = 1; }
}
const speech = { spoken: [], cancelled: 0, cancel() { this.cancelled += 1; }, speak(u) { this.spoken.push(u); } };

/* Window listeners, so a drag can be simulated pointermove by pointermove. */
const winListeners = new Map();
const listen = (type, fn) => {
  const list = winListeners.get(type) || [];
  list.push(fn);
  winListeners.set(type, list);
};
const unlisten = (type, fn) => {
  const list = winListeners.get(type) || [];
  winListeners.set(type, list.filter((it) => it !== fn));
};

/* A clock the harness owns, so "the countdown reached zero" is a real event
 * instead of a hop over the system clock. */
const RealDate = Date;
let clockNow = RealDate.UTC(2026, 10, 8, 9, 0, 0);
class ClockDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(clockNow);
    else super(...args);
  }
  static now() {
    return clockNow;
  }
}

const advance = (ms) => {
  clockNow += ms;
  for (const fn of [...intervals.values()]) {
    try {
      fn();
    } catch (error) {
      fail("interval callback", error && error.message);
    }
  }
};

const windowStub = {
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  setInterval: (fn) => {
    const id = ++intervalSeq;
    intervals.set(id, fn);
    return id;
  },
  clearInterval: (id) => intervals.delete(id),
  setTimeout: (fn) => {
    const id = ++timerSeq;
    timers.set(id, fn);
    return id;
  },
  clearTimeout: (id) => timers.delete(id),
  AudioContext: FakeAudioContext,
  webkitAudioContext: FakeAudioContext,
  speechSynthesis: speech,
  SpeechSynthesisUtterance: FakeUtterance,
  Notification: undefined,
  innerHeight: 900,
  addEventListener: listen,
  removeEventListener: unlisten,
  dispatch(type, event) {
    for (const fn of [...(winListeners.get(type) || [])]) fn(event);
  },
};

/** Fire every pending setTimeout callback, in scheduling order. */
const flushTimers = () => {
  let guard = 0;
  while (timers.size > 0 && guard < 50) {
    guard += 1;
    const [id, fn] = [...timers][0];
    timers.delete(id);
    fn();
  }
};

let loaded = null;
const windowApron = Object.assign({}, windowStub, {
  __ModuleLoader__: {
    load(descriptor) {
      loaded = descriptor;
    },
  },
});

const sandbox = {
  window: windowApron,
  globalThis: windowApron,
  console,
  Date: ClockDate,
  Math,
  JSON,
  Set,
  Map,
  Array,
  Object,
  String,
  Number,
  Boolean,
  Promise,
  Error,
  isFinite: Number.isFinite,
};
vm.createContext(sandbox);

/* ------------------------------------------------------------------- load step */
console.log("\n[1] module registration");
try {
  const source = fs.readFileSync(BUNDLE, "utf8");
  vm.runInContext(source, sandbox, { filename: "client.js" });
  if (!loaded) throw new Error("client.js never called window.__ModuleLoader__.load");
  if (typeof loaded.id !== "string" || !loaded.id) throw new Error("descriptor.id missing");
  if (typeof loaded.factory !== "function") throw new Error("descriptor.factory missing");
  ok(`registered id=${loaded.id}`);
} catch (error) {
  fail("module load", error && error.message);
  process.exit(1);
}

/* ---------------------------------------------------------------- materialize */
console.log("\n[2] factory materialization");
let plugin = null;
const requireShim = (specifier) => {
  if (specifier === "react") return React;
  throw new Error(`unexpected require("${specifier}") — the browser table only answers react`);
};
try {
  plugin = loaded.factory(requireShim);
  if (!plugin || typeof plugin.apply !== "function") throw new Error("factory did not return { apply }");
  ok(`exports inject=${JSON.stringify(plugin.inject)}`);
} catch (error) {
  fail("factory", error && error.stack);
  process.exit(1);
}

/* ------------------------------------------------------------------ fake shell */
const recorded = { tabs: [], slots: [], dictionaries: [], errors: [] };
const disposers = [];

const dictionaries = {
  active: "zh",
  listeners: new Set(),
  register(ns, dicts) {
    recorded.dictionaries.push({ ns, dicts });
    return () => {};
  },
  bind(ns) {
    return (key, params) => {
      const dict = recorded.dictionaries.find((d) => d.ns === ns && d.dicts[dictionaries.active]);
      const table = dict ? dict.dicts[dictionaries.active] : null;
      const template = table && typeof table[key] === "string" ? table[key] : key;
      return params
        ? template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
        : template;
    };
  },
  getSnapshot: () => ({ active: dictionaries.active, locales: ["zh", "en"], revision: 1 }),
  getLocale: () => dictionaries.active,
  subscribe(fn) {
    dictionaries.listeners.add(fn);
    return () => dictionaries.listeners.delete(fn);
  },
  setLocale: () => {},
  addLanguage: () => {},
  translate: (ns, key, params) => dictionaries.bind(ns)(key, params),
};

const sidebarRight = {
  openTab(kind, options) {
    recorded.lastOpenTab = { kind, options };
  },
  openResource() {},
  close() {},
};

const sidebarRightTabs = {
  register(definition) {
    recorded.tabs.push(definition);
    return () => {};
  },
};

function makeOwner(getImpl) {
  const owner = {
    get(name) {
      return getImpl(name);
    },
    effect(fn, label) {
      const result = typeof fn === "function" ? fn() : undefined;
      if (typeof result === "function") disposers.push(result);
      void label;
      return result;
    },
    on() {
      return () => {};
    },
    slots: {
      register(definition, component) {
        recorded.slots.push({ definition, component });
        return () => {};
      },
      inject(name, factory) {
        return factory();
      },
      registerFactory() {
        return () => {};
      },
    },
  };
  return owner;
}

const rootGet = (name) => {
  if (name === "locale") return dictionaries;
  if (name === "sidebarRight") return sidebarRight;
  if (name === "slots") return makeOwner(rootGet).slots;
  if (name === "sessions") return {};
  return undefined;
};

const rootCtx = makeOwner(rootGet);
rootCtx.inject = (names, callback) => {
  const list = typeof names === "string" ? [names] : names;
  const owner = makeOwner((name) => {
    if (name === "sidebarRightTabs") return sidebarRightTabs;
    if (name === "sidebarRight") return sidebarRight;
    if (name === "locale") return dictionaries;
    if (name === "slots") return owner.slots;
    return undefined;
  });
  owner.inject = (inner, cb) => rootCtx.inject(inner, cb);
  return callback(owner);
};

console.log("\n[3] apply(ctx)");
try {
  plugin.apply(rootCtx);
  ok("apply returned without throwing");
} catch (error) {
  fail("apply", error && error.stack);
}

/* -------------------------------------------------------------- registration */
console.log("\n[4] registrations");

const bodySlot = recorded.slots.find(
  (r) => r.definition && r.definition.name === "sidebar.right.pane.tab" && r.definition.key === "dsh-pomodoro-clock",
);
const freshSnapshot = bodySlot && typeof bodySlot.definition.inject === "function"
  ? bodySlot.definition.inject().store.getSnapshot()
  : null;

if (recorded.tabs.length === 0) fail("sidebarRightTabs.register", "the tab type was never registered");
for (const definition of recorded.tabs) {
  const missing = ["id", "kind", "title"].filter((field) => !definition[field]);
  if (missing.length > 0) fail("tab definition", `missing ${missing.join(", ")}`);
  if (definition.priority !== "extension") fail("tab priority", `expected "extension", got ${definition.priority}`);
  const guide = definition.guide;
  if (!Array.isArray(guide) || guide.length === 0) {
    fail("tab guide", "no guide entry registered");
  } else {
    for (const entry of guide) {
      if (!entry.id) fail("guide entry", "missing id (required by SidebarRightGuideEntry)");
      if (typeof entry.order !== "number") fail("guide entry", "missing numeric order");
      if (typeof entry.title !== "function") fail("guide entry", "title is not a function");
    }
  }
  let title = null;
  try {
    title = definition.title("sidebar://" + definition.kind);
  } catch (error) {
    fail("tab title()", error && error.message);
  }
  ok(`tab type id=${definition.id} kind=${definition.kind} title=${JSON.stringify(title)}`);
}

const slotIndex = new Map();
for (const record of recorded.slots) {
  const definition = record.definition || {};
  const key = definition.key || definition.id || "(none)";
  slotIndex.set(`${definition.name}#${key}`, record);
  ok(`slot ${definition.name} key=${key} order=${definition.order}`);
}

const expected = [
  ["sidebar.right.pane.tab", "dsh-pomodoro-clock"],
  ["sidebar.right.pane.tab.title", "dsh-pomodoro-clock"],
];
for (const [name, key] of expected) {
  if (!slotIndex.has(`${name}#${key}`)) fail("missing slot", `${name} keyed by ${key}`);
}
const composerDock = recorded.slots.find(
  (r) => r.definition && r.definition.name === "conversation.composer.dock",
);
if (composerDock) fail("composer dock", "the pill was removed on request; it must not be registered again");

const edgeSlot = recorded.slots.find((r) => r.definition && r.definition.name === "shell.overlay");
if (!edgeSlot) fail("missing slot", "shell.overlay (the right-edge handle + popover)");
else if (edgeSlot.definition.id !== "dsh-pomodoro") fail("edge slot", `id is ${edgeSlot.definition.id}`);

/* ------------------------------------------------------------------ locale */
console.log("\n[5] dictionaries");
const dict = recorded.dictionaries.find((d) => d.dicts && d.dicts.zh && d.dicts.en);
if (!dict) {
  fail("locale.register", "no namespace carrying both zh and en");
} else {
  const zh = Object.keys(dict.dicts.zh).sort();
  const en = Object.keys(dict.dicts.en).sort();
  const onlyZh = zh.filter((k) => !en.includes(k));
  const onlyEn = en.filter((k) => !zh.includes(k));
  if (onlyZh.length) fail("dictionary drift", `only in zh: ${onlyZh.join(", ")}`);
  if (onlyEn.length) fail("dictionary drift", `only in en: ${onlyEn.join(", ")}`);
  ok(`namespace ${dict.ns}: ${zh.length} keys in zh, ${en.length} in en`);
  const bound = dictionaries.bind(dict.ns);
  const zhTitle = dict.dicts.zh["tab.title"];
  dictionaries.active = "zh";
  if (bound("tab.title") !== zhTitle) fail("bind()", "zh lookup drifted");
  dictionaries.active = "en";
  const enTitle = bound("tab.title");
  if (!enTitle || enTitle === "tab.title") fail("bind()", "en lookup returned the key itself");
  ok(`bind(): zh=${JSON.stringify(zhTitle)} en=${JSON.stringify(enTitle)}`);
  dictionaries.active = "zh";
}

/* --------------------------------------------------------------- components */
console.log("\n[6] component invocation");

function walk(node, depth, seen) {
  if (node === null || node === undefined || node === false) return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, depth, seen);
    return;
  }
  if (typeof node === "string" || typeof node === "number") return;
  if (typeof node === "boolean") return;
  if (typeof node === "object" && !node.$$el) return; /* style bags and other opaque props */
  if (!node.type) {
    fail("render tree", `element without a type; ctor=${node && node.constructor && node.constructor.name}; own=${JSON.stringify(Object.getOwnPropertyNames(node))}; $$el=${String(node && node.$$el)}; type=${String(node && node.type)}; str=${String(node).slice(0, 60)}`);
    return;
  }
  if (typeof node.type === "string" && node.type === "style" && depth > 1) return;
  /* A nested function component (the shared panel) has to be inlined: this
     shim renders shallowly, so React would never reach its internals. */
  if (typeof node.type === "function" && depth < 6) {
    seen.count += 1;
    let rendered;
    try {
      rendered = node.type(node.props || {});
    } catch (error) {
      fail("component", `${node.type.name || "anonymous"}: ${error && error.stack}`);
      return;
    }
    walk(rendered, depth + 1, seen);
    return;
  }
  seen.count += 1;
  const props = node.props || {};
  for (const key of Object.keys(props)) {
    if (key === "children") continue;
    const value = props[key];
    if (typeof value === "function") {
      if (/^on[A-Z]/.test(key)) seen.handlers.push({ label: key, fn: value });
      continue;
    }
    walk(value, depth + 1, seen);
  }
  walk(node.children, depth + 1, seen);
}

for (const record of recorded.slots) {
  const name = record.definition.name;
  const key = record.definition.key || record.definition.id || "";
  const label = `${name}#${key}`;
  if (!record.component) {
    fail(label, "no component passed to slots.register");
    continue;
  }
  let injectProps = {};
  try {
    injectProps =
      typeof record.definition.inject === "function" ? record.definition.inject() || {} : {};
  } catch (error) {
    fail(`${label} inject()`, error && error.message);
  }
  const props = Object.assign({}, injectProps, {
    // props the shell supplies to a tab body / title / dock seat
    useTabInfo: () =>
      ({
        sidebar: { expanded: true, fullscreen: false },
        panel: { id: "pane-1", isFloating: false },
        tab: { id: "tab-1", visible: true, navigation: { address: "sidebar://pomodoro", params: {}, revision: 0 }, actions: {} },
      }),
    useSessions: () => ({}),
    usePanelInfo: () => ({}),
    sessionId: "session-test",
  });
  try {
    const tree = record.component(props);
    const seen = { count: 0, handlers: [] };
    walk(tree, 0, seen);
    ok(`${label} rendered ${seen.count} node(s), ${seen.handlers.length} handler(s)`);
    for (const handler of seen.handlers) {
      try {
        handler.fn({ preventDefault() {}, stopPropagation() {}, target: { value: "4" }, currentTarget: { value: "4" } });
      } catch (error) {
        fail(`${label} ${handler.label}()`, error && error.stack);
      }
    }
  } catch (error) {
    fail(`${label} render`, error && error.stack);
  }
}

/* ------------------------------------------------- right-edge dock states */
console.log("\n[6b] right-edge dock (handle <-> popover)");
try {
  const record = edgeSlot;
  const injectProps = record.definition.inject();
  const ui = injectProps.ui;
  if (!ui || typeof ui.set !== "function") fail("dock ui", "no observable in the injected props");
  else {
    ui.set(false);
    const collapsed = record.component(injectProps);
    const seenA = { count: 0, handlers: [] };
    walk(collapsed, 0, seenA);
    if (seenA.count === 0) fail("dock handle", "rendered nothing when collapsed");
    else ok(`handle: ${seenA.count} node(s), click opens it`);
    if (ui.getSnapshot().open !== false) fail("dock handle state", "expected collapsed");

    ui.set(true);
    const expanded = record.component(injectProps);
    const seenB = { count: 0, handlers: [] };
    walk(expanded, 0, seenB);
    if (seenB.count < 10) fail("dock popover", `only ${seenB.count} node(s)`);
    else ok(`popover: ${seenB.count} node(s), ${seenB.handlers.length} handler(s)`);

    ui.set(false);
    if (ui.getSnapshot().open !== false) fail("dock collapse", "ui.set(false) did not close it");
    else ok("collapse returns to the handle");
  }
} catch (error) {
  fail("dock states", error && error.stack);
}

/* --------------------------------------------------- draggable edge anchor */
console.log("\n[6c] the handle drags along the edge");
try {
  const dockProps = edgeSlot.definition.inject();
  const ui = dockProps.ui;
  ui.set(false);
  ui.setTop(226);
  const tree = edgeSlot.component(dockProps);
  const button = tree && tree.props ? tree.props : null;
  if (!button || typeof button.onPointerDown !== "function") {
    fail("anchor drag", "the collapsed handle has no onPointerDown");
  } else {
    ok("anchor: the handle starts at " + ui.getTop() + "px");
    button.onPointerDown({
      clientY: 300,
      button: 0,
      pointerId: 1,
      currentTarget: { offsetHeight: 96, setPointerCapture() {} },
    });
    windowStub.dispatch("pointermove", { clientY: 420 });
    windowStub.dispatch("pointerup", {});
    if (ui.getTop() !== 346) fail("anchor drag", `after a 120px drag top=${ui.getTop()}, expected 346`);
    ok(`anchor: dragged to ${ui.getTop()}px`);
    if (storage.get("dsh.pomodoro.anchor") !== "346") {
      fail("anchor persist", `stored "${storage.get("dsh.pomodoro.anchor")}"`);
    }
    ok("anchor: the position is persisted");

    button.onClick({});
    if (ui.getSnapshot().open !== false) fail("anchor click guard", "the click that ends a drag opened the popover");
    ok("anchor: the click ending a drag does not open");
    button.onClick({});
    if (ui.getSnapshot().open !== true) fail("anchor click", "a plain click no longer opens");
    ok("anchor: a plain click still opens");

    ui.set(false);
    ui.setTop(99999);
    if (ui.getTop() > 700) fail("anchor clamp", `clamped to ${ui.getTop()}`);
    else ok(`anchor: clamped to ${ui.getTop()}px, never past the viewport`);

    /* The expanded card has to follow the handle, not sit at a fixed height. */
    ui.setTop(300);
    ui.set(true);
    const high = edgeSlot.component(dockProps);
    const highStyle = high && high.props ? high.props.style : null;
    if (!highStyle || highStyle.top !== "300px") fail("anchor popover", JSON.stringify(highStyle));
    else ok("popover: opens at the handle height (top: 300px)");

    ui.set(false);
    ui.setTop(700);
    ui.set(true);
    const low = edgeSlot.component(dockProps);
    const lowStyle = low && low.props ? low.props.style : null;
    if (!lowStyle || lowStyle.top !== "auto" || !/^\d+px$/.test(String(lowStyle.bottom))) {
      fail("anchor popover low half", JSON.stringify(lowStyle));
    } else {
      ok(`popover: flips above the handle in the lower half (bottom: ${lowStyle.bottom})`);
    }
    ui.set(false);
    ui.setTop(226);
  }
} catch (error) {
  fail("draggable anchor", error && error.stack);
}

/* -------------------------------------------------------- timer behaviour */
console.log("\n[7] timer behaviour (store driving)");
try {
  const bodyRecord = slotIndex.get("sidebar.right.pane.tab#dsh-pomodoro-clock");
  const store = bodyRecord && bodyRecord.definition.inject ? bodyRecord.definition.inject().store : null;
  if (!store) {
    fail("store", "the tab body was not given a store prop");
  } else {
    if (!freshSnapshot) {
      fail("fresh snapshot", "could not read the store right after apply");
    } else {
      if (freshSnapshot.phase !== "focus") fail("initial phase", `expected focus, got ${freshSnapshot.phase}`);
      if (freshSnapshot.remaining !== 25 * 60 * 1000) fail("initial remaining", `${freshSnapshot.remaining}ms`);
      ok(`fresh store: phase=${freshSnapshot.phase} remaining=${Math.round(freshSnapshot.remaining / 60000)}min`);
    }
    /* the render pass above exercised every handler, so re-baseline before driving */
    store.pause();
    store.setPhase("focus");
    store.reset();
    let renders = 0;
    const off = store.subscribe(() => {
      renders += 1;
    });
    store.start();
    const running = store.getSnapshot();
    if (!running.running) fail("start()", "running stayed false");
    if (!(running.endsAt > clockNow)) fail("start()", "endsAt was not set in the future");
    store.pause();
    if (store.getSnapshot().running) fail("pause()", "running stayed true");
    store.reset();
    const reset = store.getSnapshot();
    if (reset.remaining !== store.durationMs("focus")) {
      fail("reset()", `remaining=${reset.remaining}ms vs durationMs(focus)=${store.durationMs("focus")}ms`);
    }
    store.skip();
    const skipped = store.getSnapshot();
    if (skipped.phase === "focus") fail("skip()", `phase stayed ${skipped.phase}`);
    ok(`start/pause/reset/skip ok, snapshot swaps=${renders}, phase after skip=${skipped.phase}`);
    off();
    store.dispose();
    ok("dispose() cleared listeners and the ticker");
  }
} catch (error) {
  fail("store driving", error && error.stack);
}

/* ------------------------------------------------- one-shot finish + sound */
console.log("\n[7b] one-shot finish and the sound choice");
try {
  const bodyRecord = slotIndex.get("sidebar.right.pane.tab#dsh-pomodoro-clock");
  const store = bodyRecord && bodyRecord.definition.inject ? bodyRecord.definition.inject().store : null;
  if (!store) {
    fail("one-shot", "the tab body was not given a store prop");
  } else {
    /* `freshSnapshot` predates the render pass, which clicks both mode tabs. */
    const defaultMode = freshSnapshot && freshSnapshot.settings ? freshSnapshot.settings.mode : undefined;
    if (defaultMode !== "once") {
      fail("default mode", `expected the one-shot countdown, got ${defaultMode}`);
    }
    store.setSetting("mode", "once");
    store.setDuration("focus", 1);
    store.reset();
    store.start();
    advance(61_000);
    const after = store.getSnapshot();
    if (after.running) fail("one-shot finish", "the countdown kept running after it hit zero");
    if (after.phase !== "focus") fail("one-shot phase", `advanced to ${after.phase}`);
    if (after.remaining !== 60_000) fail("one-shot re-arm", `${after.remaining}ms`);
    if (!after.notice || after.notice.key !== "notice.done") {
      fail("one-shot notice", JSON.stringify(after.notice));
    }
    if (!(after.completed >= 1)) fail("one-shot count", "completed did not increase");
    ok(`one-shot: stops at zero, stays on focus, re-armed at ${Math.round(after.remaining / 1000)}s, note=${after.notice.key}`);

    store.setSetting("mode", "cycle");
    store.setDuration("focus", 1);
    store.reset();
    store.start();
    advance(61_000);
    const cycled = store.getSnapshot();
    if (cycled.phase === "focus") fail("cycle finish", "the phase did not advance");
    ok(`cycle: advanced to ${cycled.phase}, running=${cycled.running}`);

    store.setSetting("sound", "woodblock");
    if (store.getSnapshot().settings.sound !== "woodblock") {
      fail("sound select", `stored ${store.getSnapshot().settings.sound}`);
    }
    store.setSetting("sound", "bogus");
    if (store.getSnapshot().settings.sound !== "woodblock") fail("sound guard", "an unknown id was accepted");
    store.previewSound();
    ok("sound: woodblock kept, unknown id ignored, preview() did not throw");

    store.setSetting("sound", "airport");
    if (store.getSnapshot().settings.sound !== "airport") fail("sound: airport", "the airport chime id was rejected");
    store.previewSound();
    ok("sound: the airport chime is selectable and previews");

    store.setSetting("mode", "once");
    store.skip();
    if (store.getSnapshot().phase !== "focus") {
      fail("one-shot skip", `skip left the timer on ${store.getSnapshot().phase}`);
    }
    ok("one-shot: skip re-arms the countdown instead of changing phase");
    store.dispose();
  }
console.log("\n[7c] the alarm cue itself");
try {
  const bodyRecord = slotIndex.get("sidebar.right.pane.tab#dsh-pomodoro-clock");
  const store = bodyRecord && bodyRecord.definition.inject ? bodyRecord.definition.inject().store : null;
  if (!store) {
    fail("alarm cue", "no store to drive");
  } else {
    oscillators.length = 0;
    speech.spoken.length = 0;
    store.setSetting("sound", "airport");
    store.previewSound("focus");
    flushTimers();
    /* Five notes, each struck as a fundamental plus one quiet overtone. */
    if (oscillators.length !== 10) fail("airport notes", `scheduled ${oscillators.length} oscillators, expected 10`);
    ok("airport: 5 notes scheduled, each with an overtone");
    const first = oscillators[0];
    const last = oscillators[oscillators.length - 2];
    if (!(last.started > first.started)) fail("airport timing", "notes did not advance in time");
    ok(`airport: cue spans ${(last.stopped - first.started).toFixed(1)}s of audio`);
    if (speech.spoken.length !== 1) fail("airport speech", `spoke ${speech.spoken.length} lines`);
    const line = speech.spoken[0];
    if (!/^(zh|en)/.test(line.lang)) fail("airport speech lang", line.lang);
    if (!line.text || line.text.length < 8) fail("airport speech text", String(line.text));
    ok(`airport: spoken line (${line.lang}) "${line.text}"`);
    store.previewSound("short");
    flushTimers();
    ok("airport: the break line is spoken for a finished break");
    store.dispose();
  }
} catch (error) {
  fail("alarm cue", error && error.stack);
}

} catch (error) {
  fail("one-shot modes", error && error.stack);
}

/* ------------------------------------------------------------------- result */
console.log("\n[8] teardown");
for (const dispose of disposers) {
  try {
    dispose();
  } catch (error) {
    fail("disposer", error && error.message);
  }
}
if (intervals.size > 0) fail("ticker leak", `${intervals.size} interval(s) still armed after dispose`);

console.log("");
if (failures.length === 0) {
  console.log("PASS — client bundle loads, applies, registers, renders and drives the timer.");
  process.exit(0);
}
console.log(`FAIL — ${failures.length} problem(s):`);
for (const failure of failures) console.log(`  - ${failure}`);
process.exit(1);
