/* =========================================================
   Travel Intelligence Center
   Trips Page Module V3.7.0
   Intelligence, Sync & Store V2.5 Integration Edition
   Part 1 / Core, Guards, Integrations & Scoped Styles

   File Path:
   js/pages/trips.js

   Purpose:
   - Keeps upcoming and active journeys as the operational travel area.
   - Merges completed and historical trips into "جواز سفري".
   - Preserves every existing trip record in Store.
   - Opens each country as a passport folder containing its related trips.
   - Supports adding historical trips directly from the passport.
   - Uses one trip record only; completed trips appear automatically.
   - Normalizes passport countries through WorldGuideData / GuideEngine.
   - Persists ISO countryCode for historical and duplicated trips.
   - Lets users open the matching country guide from Passport.
   - Keeps Guide visited-country statistics synchronized with Passport.
   - Integrates TravelBrain, TravelAssistant, TravelImport and TravelSync.
   - Integrates Store V2.5.0 and App V4.2.0 without hard dependency.
   - Prevents duplicate listeners, duplicate refreshes and render loops.
   - Defers refresh while scrolling, swiping, typing or editing forms.
   - Preserves Store / Router / UI / Trip Form integrations.
   - Injects all scoped styles from this file.

   Dependencies:
   - js/config.js
   - js/store.js
   - js/router.js
   - js/ui.js
   - js/data/world-data.js
   - js/features/guide-engine.js
   - js/features/trip-form.js
   - js/features/travel-brain.js
   - js/features/travel-assistant.js
   - js/features/travel-import.js
   - js/features/travel-sync.js
   - js/app.js

   Global APIs:
   - window.TIC.Pages.trips
   - window.TICTripsPage
========================================================= */

(function tripsPageFactory(window, document) {
  "use strict";

  const PAGE_ID = "trips";
  const PAGE_VERSION = "3.7.0";
  const STYLE_ID = "tic-trips-v370-styles";
  const RENDER_IDLE_DELAY = 120;
  const INTERACTION_RELEASE_DELAY = 280;
  const MAX_REFRESH_WAIT = 1800;

  const state = {
    initialized: false,
    mounted: false,
    destroyed: false,
    container: null,
    activeView: "hub",
    activeTab: "upcoming",
    activeTripId: null,
    activeCountryKey: null,
    filtersOpen: false,
    filters: {
      search: "",
      status: "all",
      type: "all",
      sort: "start-asc"
    },
    memoryDraft: null,
    unsubscribeStore: null,
    unsubscribeSync: null,
    unsubscribeBrain: null,
    unsubscribeAssistant: null,
    actionUnsubscribers: [],
    integrationUnsubscribers: [],
    subscribers: new Set(),
    lastSnapshot: null,
    lastSnapshotSignature: "",
    lastRenderedSignature: "",
    lastRefreshReason: "",
    refreshQueued: false,
    refreshRequestedAt: 0,
    refreshTimer: null,
    renderTimer: null,
    interactionTimer: null,
    scrollTimer: null,
    isRendering: false,
    isRefreshing: false,
    isUserInteracting: false,
    isScrolling: false,
    isTouching: false,
    isTyping: false,
    isFormOpen: false,
    pendingRefreshReason: "",
    mountedAt: 0
  };

  const STATUS_LABELS = Object.freeze({
    draft: "مسودة",
    planning: "قيد التخطيط",
    planned: "مخططة",
    booked: "تم الحجز",
    confirmed: "مؤكدة",
    ready: "جاهزة للسفر",
    ongoing: "جارية الآن",
    active: "جارية الآن",
    completed: "مكتملة",
    cancelled: "ملغاة",
    archived: "مؤرشفة"
  });

  const TYPE_LABELS = Object.freeze({
    family: "عائلية",
    couple: "زوجية",
    friends: "أصدقاء",
    solo: "فردية",
    business: "عمل",
    weekend: "عطلة قصيرة"
  });

  const SORT_OPTIONS = Object.freeze([
    { value: "start-asc", label: "الأقرب أولاً" },
    { value: "start-desc", label: "الأحدث تاريخاً" },
    { value: "created-desc", label: "الأحدث إضافة" },
    { value: "budget-desc", label: "الأعلى ميزانية" },
    { value: "title-asc", label: "الاسم أبجدياً" }
  ]);

  const TAB_LABELS = Object.freeze({
    upcoming: "القادمة",
    ongoing: "الجارية",
    all: "كل الرحلات"
  });

  /* =========================================================
     Utilities
  ========================================================= */

  const isObject = (value) =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);

  const clone = (value) => {
    if (value === undefined) return undefined;

    try {
      return structuredClone(value);
    } catch (_) {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (_) {
        return value;
      }
    }
  };

  const text = (value, fallback = "") =>
    String(value === undefined || value === null ? fallback : value).trim();

  const number = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const escapeHTML = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const toDate = (value) => {
    if (!value) return null;

    const parsed =
      value instanceof Date
        ? value
        : new Date(value);

    return Number.isNaN(parsed.getTime())
      ? null
      : parsed;
  };

  const startOfDay = (value) => {
    const parsed = new Date(value);
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  };

  const createId = (prefix = "trip") =>
    `${prefix}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;

  const normalizeCountryKey = (value) =>
    text(value)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const stableStringify = (value) => {
    const seen = new WeakSet();

    const normalize = (entry) => {
      if (Array.isArray(entry)) {
        return entry.map(normalize);
      }

      if (isObject(entry)) {
        if (seen.has(entry)) return "[Circular]";
        seen.add(entry);

        return Object.keys(entry)
          .sort()
          .reduce((result, key) => {
            const current = entry[key];

            if (
              typeof current !== "function" &&
              current !== undefined
            ) {
              result[key] = normalize(current);
            }

            return result;
          }, {});
      }

      return entry;
    };

    try {
      return JSON.stringify(normalize(value));
    } catch (_) {
      return "";
    }
  };

  const createSignature = (value) => {
    const source = stableStringify(value);
    let hash = 2166136261;

    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return `${source.length}:${(hash >>> 0).toString(36)}`;
  };

  const callSafely = (target, methodNames, ...args) => {
    if (!target) return undefined;

    for (const methodName of methodNames) {
      const method = target?.[methodName];

      if (typeof method === "function") {
        try {
          return method.apply(target, args);
        } catch (error) {
          console.warn(
            `TIC Trips integration method failed: ${methodName}`,
            error
          );
        }
      }
    }

    return undefined;
  };

  const getStore = () =>
    window.TIC?.Store ||
    window.TICStore ||
    window.Store ||
    window.TravelStore ||
    null;

  const getRouter = () =>
    window.TIC?.Router ||
    window.TICRouter ||
    null;

  const getUI = () =>
    window.TIC?.UI ||
    window.TICUI ||
    null;

  const getTripForm = () =>
    window.TIC?.Features?.TripForm ||
    window.TICTripForm ||
    null;

  const getGuideEngine = () =>
    window.GuideEngine ||
    window.TIC?.Features?.GuideEngine ||
    null;

  const getWorldGuideData = () =>
    window.WorldGuideData ||
    window.WorldData ||
    window.TIC?.Data?.WorldGuideData ||
    null;

  const getTravelBrain = () =>
    window.TIC?.Features?.TravelBrain ||
    window.TravelBrain ||
    window.TICTravelBrain ||
    null;

  const getTravelAssistant = () =>
    window.TIC?.Features?.TravelAssistant ||
    window.TravelAssistant ||
    window.TICTravelAssistant ||
    null;

  const getTravelImport = () =>
    window.TIC?.Features?.TravelImport ||
    window.TravelImport ||
    window.TICTravelImport ||
    null;

  const getTravelSync = () =>
    window.TIC?.Features?.TravelSync ||
    window.TravelSync ||
    window.TICTravelSync ||
    null;

  const getApp = () =>
    window.TIC?.App ||
    window.TICApp ||
    window.App ||
    null;

  const getIntegrationRegistry = () => ({
    store: getStore(),
    router: getRouter(),
    ui: getUI(),
    tripForm: getTripForm(),
    guideEngine: getGuideEngine(),
    worldGuideData: getWorldGuideData(),
    travelBrain: getTravelBrain(),
    travelAssistant: getTravelAssistant(),
    travelImport: getTravelImport(),
    travelSync: getTravelSync(),
    app: getApp()
  });

  const resolveCountryRecord = (value, explicitCode = "") => {
    const guide = getGuideEngine();
    const world = getWorldGuideData();
    const code = text(explicitCode).toUpperCase();

    if (code) {
      return (
        guide?.getCountry?.(code) ||
        world?.getCountry?.(code) ||
        null
      );
    }

    const name = text(value);
    if (!name) return null;

    return (
      guide?.getCountry?.(name) ||
      world?.getCountry?.(name) ||
      null
    );
  };

  const resolveCountryCode = (trip = {}) => {
    const explicit = text(
      trip.countryCode ||
      trip.destinationCountryCode ||
      trip.guideCountryCode ||
      trip.destination?.countryCode
    ).toUpperCase();

    if (explicit) return explicit;

    const country = resolveCountryRecord(
      trip.country ||
      trip.destinationCountry ||
      trip.destination
    );

    return text(country?.code).toUpperCase();
  };

  const resolveCountryName = (trip = {}) => {
    const record = resolveCountryRecord(
      trip.country ||
      trip.destinationCountry ||
      trip.destination,
      resolveCountryCode(trip)
    );

    return (
      text(record?.nameAr) ||
      text(trip.country) ||
      text(trip.destinationCountry) ||
      text(trip.destination) ||
      "وجهة غير محددة"
    );
  };

  const resolveContainer = (container) => {
    if (container instanceof window.Element) return container;

    if (typeof container === "string") {
      return document.querySelector(container);
    }

    return (
      document.querySelector("[data-router-view]") ||
      document.querySelector("#app-view") ||
      document.querySelector("#tic-page") ||
      document.querySelector("#app-content")
    );
  };

  const emit = (type, detail = {}) => {
    const payload = {
      type,
      page: PAGE_ID,
      version: PAGE_VERSION,
      timestamp: new Date().toISOString(),
      ...clone(detail)
    };

    state.subscribers.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error("TIC Trips subscriber error:", error);
      }
    });

    try {
      window.dispatchEvent(
        new CustomEvent(`tic:page:${PAGE_ID}:${type}`, {
          detail: payload
        })
      );
    } catch (_) {
      // Ignore in unsupported environments.
    }

    return payload;
  };

  const isEditableTarget = (target) => {
    if (!(target instanceof window.Element)) return false;

    return Boolean(
      target.closest(
        [
          "input",
          "textarea",
          "select",
          "[contenteditable='true']",
          "[data-trips-form]",
          ".trips-modal",
          ".country-sheet"
        ].join(",")
      )
    );
  };

  const hasOpenOverlay = () =>
    Boolean(
      document.querySelector(
        [
          ".trips-modal-backdrop",
          "[data-trip-form-modal]",
          "[data-modal-open='true']"
        ].join(",")
      )
    );

  const isInteractionLocked = () =>
    state.isRendering ||
    state.isRefreshing ||
    state.isUserInteracting ||
    state.isScrolling ||
    state.isTouching ||
    state.isTyping ||
    state.isFormOpen ||
    hasOpenOverlay();

  const clearTimer = (key) => {
    if (!state[key]) return;
    window.clearTimeout(state[key]);
    state[key] = null;
  };

  const releaseInteractionLater = (
    delay = INTERACTION_RELEASE_DELAY
  ) => {
    clearTimer("interactionTimer");

    state.interactionTimer = window.setTimeout(() => {
      state.isUserInteracting = false;
      state.isTyping = false;
      state.isTouching = false;
      state.isFormOpen = hasOpenOverlay();

      if (state.refreshQueued) {
        requestDeferredRefresh(
          state.pendingRefreshReason || "interaction-released",
          { forceAfterWait: true }
        );
      }
    }, delay);
  };

  const markInteraction = (kind = "interaction", target = null) => {
    state.isUserInteracting = true;

    if (kind === "scroll") state.isScrolling = true;
    if (kind === "touch") state.isTouching = true;
    if (kind === "typing" || isEditableTarget(target)) {
      state.isTyping = true;
    }

    state.isFormOpen = hasOpenOverlay();
    releaseInteractionLater();
  };

  const requestDeferredRefresh = (
    reason = "unknown",
    options = {}
  ) => {
    const {
      force = false,
      forceAfterWait = false,
      delay = RENDER_IDLE_DELAY
    } = options;

    if (!state.mounted || state.destroyed) return false;

    const now = Date.now();

    if (!state.refreshRequestedAt) {
      state.refreshRequestedAt = now;
    }

    state.refreshQueued = true;
    state.pendingRefreshReason = text(reason, "unknown");

    const waited = now - state.refreshRequestedAt;
    const canForceAfterWait =
      forceAfterWait && waited >= MAX_REFRESH_WAIT;

    if (!force && !canForceAfterWait && isInteractionLocked()) {
      releaseInteractionLater();
      return false;
    }

    clearTimer("refreshTimer");

    state.refreshTimer = window.setTimeout(() => {
      if (
        !force &&
        !canForceAfterWait &&
        isInteractionLocked()
      ) {
        requestDeferredRefresh(reason, {
          forceAfterWait: true,
          delay
        });
        return;
      }

      state.refreshQueued = false;
      state.refreshRequestedAt = 0;
      state.lastRefreshReason = text(reason, "unknown");
      state.pendingRefreshReason = "";

      emit("refresh-requested", {
        reason: state.lastRefreshReason
      });
    }, Math.max(0, number(delay, RENDER_IDLE_DELAY)));

    return true;
  };

  const attachInteractionGuards = () => {
    const target = state.container || document;

    const onPointerDown = (event) =>
      markInteraction("touch", event.target);

    const onPointerUp = () =>
      releaseInteractionLater(180);

    const onInput = (event) =>
      markInteraction("typing", event.target);

    const onFocusIn = (event) => {
      if (isEditableTarget(event.target)) {
        state.isTyping = true;
        state.isFormOpen = hasOpenOverlay();
      }
    };

    const onFocusOut = () =>
      releaseInteractionLater(220);

    const onScroll = () => {
      state.isScrolling = true;
      state.isUserInteracting = true;
      clearTimer("scrollTimer");

      state.scrollTimer = window.setTimeout(() => {
        state.isScrolling = false;
        releaseInteractionLater(160);
      }, 140);
    };

    target.addEventListener("pointerdown", onPointerDown, {
      passive: true
    });
    target.addEventListener("touchstart", onPointerDown, {
      passive: true
    });
    target.addEventListener("pointerup", onPointerUp, {
      passive: true
    });
    target.addEventListener("touchend", onPointerUp, {
      passive: true
    });
    target.addEventListener("input", onInput, true);
    target.addEventListener("change", onInput, true);
    target.addEventListener("focusin", onFocusIn, true);
    target.addEventListener("focusout", onFocusOut, true);
    window.addEventListener("scroll", onScroll, {
      passive: true
    });

    state.actionUnsubscribers.push(
      () =>
        target.removeEventListener(
          "pointerdown",
          onPointerDown
        ),
      () =>
        target.removeEventListener(
          "touchstart",
          onPointerDown
        ),
      () =>
        target.removeEventListener(
          "pointerup",
          onPointerUp
        ),
      () =>
        target.removeEventListener(
          "touchend",
          onPointerUp
        ),
      () =>
        target.removeEventListener("input", onInput, true),
      () =>
        target.removeEventListener("change", onInput, true),
      () =>
        target.removeEventListener(
          "focusin",
          onFocusIn,
          true
        ),
      () =>
        target.removeEventListener(
          "focusout",
          onFocusOut,
          true
        ),
      () => window.removeEventListener("scroll", onScroll)
    );
  };

  const subscribeIntegration = (
    target,
    eventNames,
    handler
  ) => {
    if (!target || typeof handler !== "function") {
      return null;
    }

    const names = Array.isArray(eventNames)
      ? eventNames
      : [eventNames];

    for (const name of names) {
      const result = callSafely(
        target,
        ["subscribe", "on", "addListener"],
        name,
        handler
      );

      if (typeof result === "function") {
        return result;
      }

      if (
        result &&
        typeof result.unsubscribe === "function"
      ) {
        return () => result.unsubscribe();
      }
    }

    return null;
  };

  const notifyIntelligenceLayer = (
    eventName,
    detail = {}
  ) => {
    const registry = getIntegrationRegistry();
    const payload = {
      source: PAGE_ID,
      pageVersion: PAGE_VERSION,
      event: eventName,
      timestamp: new Date().toISOString(),
      ...clone(detail)
    };

    callSafely(
      registry.travelBrain,
      [
        "ingest",
        "observe",
        "track",
        "handleEvent",
        "dispatch"
      ],
      eventName,
      payload
    );

    callSafely(
      registry.travelAssistant,
      [
        "observe",
        "track",
        "handleEvent",
        "dispatch"
      ],
      eventName,
      payload
    );

    callSafely(
      registry.travelSync,
      [
        "queue",
        "enqueue",
        "markDirty",
        "notify",
        "dispatch"
      ],
      eventName,
      payload
    );

    callSafely(
      registry.app,
      ["emit", "dispatch", "notify"],
      `trips:${eventName}`,
      payload
    );

    return payload;
  };

  const registerIntegrationListeners = () => {
    state.integrationUnsubscribers.splice(0).forEach(
      (unsubscribe) => {
        try {
          unsubscribe?.();
        } catch (_) {
          // Ignore stale integration listeners.
        }
      }
    );

    const registry = getIntegrationRegistry();

    const onExternalChange = (payload = {}) => {
      const source = text(
        payload?.source ||
        payload?.detail?.source
      ).toLowerCase();

      if (
        source === PAGE_ID ||
        source === "tic-trips-page"
      ) {
        return;
      }

      requestDeferredRefresh(
        payload?.reason ||
        payload?.type ||
        "external-integration-change",
        { forceAfterWait: true }
      );
    };

    [
      subscribeIntegration(
        registry.travelSync,
        ["change", "synced", "remote-change", "updated"],
        onExternalChange
      ),
      subscribeIntegration(
        registry.travelImport,
        ["imported", "completed", "change"],
        onExternalChange
      ),
      subscribeIntegration(
        registry.travelBrain,
        ["recommendation", "insight", "change"],
        onExternalChange
      ),
      subscribeIntegration(
        registry.travelAssistant,
        ["action", "change", "updated"],
        onExternalChange
      ),
      subscribeIntegration(
        registry.app,
        ["statechange", "change", "updated"],
        onExternalChange
      )
    ]
      .filter(Boolean)
      .forEach((unsubscribe) =>
        state.integrationUnsubscribers.push(unsubscribe)
      );
  };

  /* =========================================================
     Styles
  ========================================================= */

  const ensureStyles = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [data-page="trips"][data-page-version="3.7.0"] {
        --trips-navy: #061b38;
        --trips-teal: #0f8f83;
        --trips-teal-dark: #08756d;
        --trips-mint: #e8f7f4;
        --trips-soft: #f6f9fc;
        --trips-line: #dce5ef;
        --trips-muted: #75839b;
        --trips-shadow: 0 18px 45px rgba(16, 40, 70, .09);
        color: var(--trips-navy);
        padding-bottom: 30px;
        overscroll-behavior: contain;
        -webkit-tap-highlight-color: transparent;
      }

      [data-page="trips"] * {
        box-sizing: border-box;
      }

      [data-page="trips"] input,
      [data-page="trips"] select,
      [data-page="trips"] textarea,
      [data-page="trips"] button {
        touch-action: manipulation;
      }

      .trips-shell {
        display: grid;
        gap: 24px;
      }

      .trips-hero {
        position: relative;
        overflow: hidden;
        padding: 22px;
        border-radius: 27px;
        background:
          radial-gradient(circle at 15% 5%, rgba(255,255,255,.13) 0 120px, transparent 122px),
          linear-gradient(140deg, #16a797 0%, #0c8079 52%, #082b50 100%);
        color: #fff;
        box-shadow: 0 24px 56px rgba(7, 54, 79, .20);
      }

      .trips-hero::after {
        content: "";
        position: absolute;
        inset-inline-end: -65px;
        bottom: -70px;
        width: 245px;
        height: 170px;
        border-radius: 50%;
        background: rgba(2, 19, 48, .28);
        transform: rotate(-12deg);
      }

      .trips-hero__top,
      .trips-hero__content,
      .trips-hero__actions {
        position: relative;
        z-index: 1;
      }

      .trips-hero__eyebrow {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        padding: 0 13px;
        border: 1px solid rgba(255,255,255,.20);
        border-radius: 999px;
        background: rgba(255,255,255,.10);
        font-size: 11px;
        font-weight: 900;
      }

      .trips-hero h1 {
        margin: 18px 0 8px;
        color: #fff;
        font-size: clamp(32px, 8vw, 44px);
        line-height: 1.05;
      }

      .trips-hero p {
        max-width: 500px;
        margin: 0;
        color: rgba(255,255,255,.82);
        font-size: 14px;
        line-height: 1.8;
      }

      .trips-hero__actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 18px;
      }

      .trips-action,
      .trips-btn,
      .trip-card-v3__open,
      .trip-card-v3__menu,
      .passport-add,
      .trips-next-brief__action {
        font: inherit;
        cursor: pointer;
      }

      .trips-action {
        min-height: 46px;
        padding: 0 12px;
        border: 0;
        border-radius: 15px;
        font-size: 13px;
        font-weight: 900;
      }

      .trips-action--primary {
        background: #fff;
        color: var(--trips-navy);
      }

      .trips-action--glass {
        border: 1px solid rgba(255,255,255,.24);
        background: rgba(255,255,255,.12);
        color: #fff;
      }

      .trips-section {
        display: grid;
        gap: 14px;
      }

      .trips-section__header {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 14px;
      }

      .trips-section__eyebrow {
        margin: 0 0 4px;
        color: var(--trips-teal-dark);
        font-size: 13px;
        font-weight: 950;
        letter-spacing: .07em;
      }

      .trips-section h2 {
        margin: 0;
        color: var(--trips-navy);
        font-size: clamp(24px, 6vw, 32px);
        line-height: 1.2;
      }

      .trips-section__subtitle {
        margin: 4px 0 0;
        color: var(--trips-muted);
        font-size: 13px;
        line-height: 1.7;
      }

      .trips-overview {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }

      .trips-stat {
        min-height: 88px;
        padding: 9px 5px;
        border: 1px solid var(--trips-line);
        border-radius: 18px;
        background: #fff;
        text-align: center;
        box-shadow: 0 11px 28px rgba(16, 40, 70, .045);
      }

      .trips-stat__icon {
        display: grid;
        place-items: center;
        width: 29px;
        height: 29px;
        margin-inline: auto;
        border-radius: 10px;
        background: var(--trips-mint);
        color: var(--trips-navy);
        font-size: 13px;
      }

      .trips-stat strong {
        display: block;
        margin-top: 8px;
        font-size: 19px;
        line-height: 1;
      }

      .trips-stat span {
        display: block;
        margin-top: 4px;
        color: var(--trips-muted);
        font-size: 8.5px;
        font-weight: 800;
      }

      .trips-next-brief {
        display: grid;
        gap: 13px;
        padding: 17px;
        border: 1px solid #cde6e1;
        border-radius: 25px;
        background:
          radial-gradient(circle at 0% 0%, rgba(23,167,151,.13), transparent 34%),
          linear-gradient(145deg, #ffffff, #f1faf8);
        box-shadow: 0 14px 34px rgba(15,118,110,.08);
      }

      .trips-next-brief__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
      }

      .trips-next-brief__head span {
        color: var(--trips-teal-dark);
        font-size: 10px;
        font-weight: 950;
        letter-spacing: .09em;
      }

      .trips-next-brief__head h2 {
        margin: 3px 0 0;
        font-size: 23px;
      }

      .trips-next-brief__head p {
        margin: 4px 0 0;
        color: var(--trips-muted);
        font-size: 13px;
      }

      .trips-next-brief__countdown {
        min-width: 72px;
        padding: 10px 8px;
        border-radius: 999px;
        background: var(--trips-navy);
        color: #fff;
        text-align: center;
      }

      .trips-next-brief__countdown strong,
      .trips-next-brief__countdown small {
        display: block;
      }

      .trips-next-brief__countdown strong {
        font-size: 17px;
      }

      .trips-next-brief__countdown small {
        margin-top: 2px;
        color: rgba(255,255,255,.67);
        font-size: 9px;
      }

      .trips-next-brief__facts {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
      }

      .trips-next-brief__facts > div {
        display: flex;
        align-items: center;
        gap: 7px;
        flex: 1 1 calc(50% - 7px);
        min-width: 125px;
        padding: 9px 10px;
        border: 1px solid rgba(220,229,239,.88);
        border-radius: 999px;
        background: rgba(255,255,255,.85);
      }

      .trips-next-brief__facts > div > span {
        display: grid;
        place-items: center;
        width: 27px;
        height: 27px;
        border-radius: 9px;
        background: var(--trips-mint);
        font-size: 12px;
      }

      .trips-next-brief__facts small,
      .trips-next-brief__facts strong {
        display: block;
      }

      .trips-next-brief__facts small {
        color: var(--trips-muted);
        font-size: 8px;
      }

      .trips-next-brief__facts strong {
        margin-top: 2px;
        font-size: 10px;
      }

      .trips-next-brief__action {
        min-height: 44px;
        border: 0;
        border-radius: 15px;
        background: #fff;
        box-shadow: inset 0 0 0 1px #b9ddd6;
        color: var(--trips-teal-dark);
        font-size: 12px;
        font-weight: 950;
      }

      .trips-zone {
        display: grid;
        gap: 18px;
        padding: 22px 18px;
        border-radius: 30px;
      }

      .trips-zone--journeys {
        border: 1px solid #d5e7ec;
        background:
          radial-gradient(circle at 100% 0%, rgba(23,111,134,.09), transparent 31%),
          linear-gradient(160deg, #fbfdfe 0%, #eef8fa 100%);
        box-shadow: 0 18px 42px rgba(23,111,134,.065);
      }

      .trips-zone--overview,
      .trips-zone--passport {
        padding: 0;
      }

      .trips-zone__marker {
        display: flex;
        align-items: center;
        gap: 11px;
        padding-bottom: 14px;
        border-bottom: 1px solid rgba(6, 27, 56, .10);
      }

      .trips-zone__marker-icon {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        border-radius: 15px;
        background: #dff1f4;
        color: #176f86;
        font-size: 20px;
      }

      .trips-zone__marker-copy small {
        display: block;
        color: #176f86;
        font-size: 9px;
        font-weight: 950;
        letter-spacing: .09em;
      }

      .trips-zone__marker-copy strong {
        display: block;
        margin-top: 2px;
        font-size: 16px;
      }

      .trips-zone__marker-copy p {
        margin: 3px 0 0;
        color: var(--trips-muted);
        font-size: 11px;
      }

      .trips-tabs {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding: 4px;
        border: 1px solid var(--trips-line);
        border-radius: 19px;
        background: rgba(255,255,255,.92);
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior-inline: contain;
      }

      .trips-tabs::-webkit-scrollbar {
        display: none;
      }

      .trips-tab {
        flex: 1 0 auto;
        min-height: 42px;
        padding: 0 14px;
        border: 0;
        border-radius: 14px;
        background: transparent;
        color: var(--trips-muted);
        font: inherit;
        font-size: 13px;
        font-weight: 900;
        cursor: pointer;
      }

      .trips-tab.is-active {
        background: var(--trips-navy);
        color: #fff;
      }

      .trips-tools {
        display: flex;
        gap: 10px;
      }

      .trips-search-wrap {
        position: relative;
        display: flex;
        align-items: center;
        flex: 1;
      }

      .trips-search-wrap > span {
        position: absolute;
        inset-inline-start: 16px;
        color: var(--trips-muted);
      }

      .trips-search {
        width: 100%;
        min-height: 55px;
        padding: 0 18px;
        padding-inline-start: 44px;
        border: 1px solid var(--trips-line);
        border-radius: 18px;
        background: #fff;
        color: var(--trips-navy);
        font: inherit;
        outline: none;
      }

      .trips-filter-toggle {
        min-width: 55px;
        min-height: 55px;
        border: 1px solid var(--trips-line);
        border-radius: 18px;
        background: #fff;
        color: var(--trips-navy);
        font: inherit;
        font-weight: 900;
      }

      .trips-filter-toggle small {
        display: block;
        color: var(--trips-muted);
        font-size: 8px;
      }

      .trips-filters {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        padding: 16px;
        border: 1px solid var(--trips-line);
        border-radius: 24px;
        background: #fff;
      }

      .trips-field {
        display: grid;
        gap: 7px;
      }

      .trips-field label {
        font-size: 13px;
        font-weight: 900;
      }

      .trips-field input,
      .trips-field select,
      .trips-field textarea {
        width: 100%;
        min-height: 52px;
        padding: 0 14px;
        border: 1px solid var(--trips-line);
        border-radius: 16px;
        background: var(--trips-soft);
        color: var(--trips-navy);
        font: inherit;
        outline: none;
      }

      .trips-field textarea {
        min-height: 105px;
        padding-top: 14px;
        resize: vertical;
      }

      .trips-grid,
      .country-grid,
      .trips-details-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .trip-card-v3 {
        overflow: hidden;
        border: 1px solid var(--trips-line);
        border-radius: 25px;
        background: #fff;
        box-shadow: var(--trips-shadow);
      }

      .trip-card-v3__cover {
        position: relative;
        display: flex;
        align-items: flex-end;
        min-height: 112px;
        padding: 16px;
        background: linear-gradient(135deg, #d7f3ee, #73b9bd 53%, #123f59);
      }

      .trip-card-v3__emoji {
        position: absolute;
        inset-inline-start: 18px;
        top: 16px;
        font-size: 38px;
      }

      .trip-card-v3__badge {
        display: inline-flex;
        min-height: 29px;
        padding: 0 10px;
        align-items: center;
        border-radius: 999px;
        background: rgba(255,255,255,.88);
        font-size: 11px;
        font-weight: 950;
      }

      .trip-card-v3__body {
        padding: 17px;
      }

      .trip-card-v3__title-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }

      .trip-card-v3 h3 {
        margin: 0;
        font-size: 24px;
      }

      .trip-card-v3__destination {
        margin: 6px 0 0;
        color: var(--trips-muted);
      }

      .trip-status-v3 {
        display: inline-flex;
        align-items: center;
        min-height: 31px;
        padding: 0 11px;
        border-radius: 999px;
        background: #eef2f7;
        color: #40506a;
        font-size: 12px;
        font-weight: 950;
        white-space: nowrap;
      }

      .trip-status-v3[data-status="ongoing"],
      .trip-status-v3[data-status="active"] {
        background: #fff0d1;
        color: #9d6300;
      }

      .trip-status-v3[data-status="ready"],
      .trip-status-v3[data-status="completed"] {
        background: #e5f6ef;
        color: #0d7563;
      }

      .trip-card-v3__meta {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-top: 18px;
      }

      .trip-card-v3__meta-item {
        min-height: 68px;
        padding: 12px;
        border-radius: 16px;
        background: var(--trips-soft);
      }

      .trip-card-v3__meta-item small {
        display: block;
        color: var(--trips-muted);
      }

      .trip-card-v3__meta-item strong {
        display: block;
        margin-top: 7px;
        font-size: 14px;
      }

      .trip-card-v3__progress {
        margin-top: 16px;
      }

      .trip-card-v3__progress-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 7px;
        color: var(--trips-muted);
        font-size: 13px;
      }

      .trip-card-v3__bar {
        height: 8px;
        overflow: hidden;
        border-radius: 999px;
        background: #e5ebf2;
      }

      .trip-card-v3__bar > span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #16a797, #08766d);
      }

      .trip-card-v3__actions {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        margin-top: 18px;
      }

      .trip-card-v3__open {
        min-height: 48px;
        border: 0;
        border-radius: 16px;
        background: linear-gradient(135deg, #159c90, #0c6f70);
        color: #fff;
        font-weight: 950;
      }

      .trip-card-v3__menu {
        width: 44px;
        height: 44px;
        border: 1px solid var(--trips-line);
        border-radius: 50%;
        background: #fff;
        color: var(--trips-navy);
        font-weight: 950;
      }

      .trips-passport-divider {
        display: flex;
        align-items: center;
        gap: 13px;
        color: #0f766e;
      }

      .trips-passport-divider::before,
      .trips-passport-divider::after {
        content: "";
        flex: 1;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(15,118,110,.24), transparent);
      }

      .trips-passport-divider span {
        padding: 8px 13px;
        border: 1px solid #cfe7e1;
        border-radius: 999px;
        background: #f8fcfb;
        font-size: 10px;
        font-weight: 950;
      }

      .passport-section {
        display: grid;
        gap: 16px;
        padding: 20px;
        border: 1px solid #cfe7e1;
        border-radius: 29px;
        background:
          radial-gradient(circle at 92% 0%, rgba(15,118,110,.10), transparent 31%),
          linear-gradient(155deg, #ffffff 0%, #f0faf7 100%);
        box-shadow: 0 20px 48px rgba(15, 82, 78, .075);
      }

      .passport-head {
        display: flex;
        justify-content: space-between;
        gap: 13px;
      }

      .passport-head h2 {
        margin: 4px 0 0;
        font-size: clamp(25px, 7vw, 34px);
      }

      .passport-head p {
        margin: 5px 0 0;
        color: var(--trips-muted);
        font-size: 13px;
        line-height: 1.65;
      }

      .passport-kicker {
        color: #0f766e;
        font-size: 11px;
        font-weight: 950;
      }

      .passport-icon {
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        border: 1px solid #cfe7e1;
        border-radius: 17px;
        background: #eaf8f5;
        font-size: 23px;
      }

      .passport-toolbar {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
      }

      .passport-add {
        min-height: 48px;
        border: 0;
        border-radius: 16px;
        background: linear-gradient(135deg, #17a797, #0b756e);
        color: #fff;
        font-size: 13px;
        font-weight: 950;
      }

      .passport-count {
        display: grid;
        place-items: center;
        min-width: 78px;
        padding: 0 13px;
        border: 1px solid #cfe7e1;
        border-radius: 16px;
        background: #fff;
        color: var(--trips-muted);
        font-size: 11px;
        font-weight: 900;
      }

      .country-magnet {
        position: relative;
        overflow: hidden;
        min-height: 205px;
        padding: 18px;
        border: 1px solid #d8e8e5;
        border-radius: 25px;
        background:
          radial-gradient(circle at 85% 10%, rgba(255,255,255,.70), transparent 28%),
          linear-gradient(145deg, #fbfefd, #dff3ee);
        box-shadow: 0 13px 30px rgba(15,82,78,.06);
        cursor: pointer;
      }

      .country-magnet__flag {
        font-size: 38px;
      }

      .country-magnet h3 {
        margin: 22px 0 4px;
        font-size: 22px;
      }

      .country-magnet p {
        margin: 0;
        color: var(--trips-muted);
      }

      .country-magnet__count {
        position: absolute;
        inset-inline-end: 16px;
        top: 16px;
        min-width: 46px;
        padding: 6px 9px;
        border-radius: 999px;
        background: var(--trips-navy);
        color: #fff;
        text-align: center;
        font-size: 13px;
        font-weight: 950;
      }

      .country-magnet__count small {
        display: block;
        color: rgba(255,255,255,.68);
        font-size: 7px;
      }

      .country-magnet__stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
        margin-top: 14px;
      }

      .country-magnet__stats > span {
        padding: 8px 5px;
        border-radius: 13px;
        background: rgba(255,255,255,.76);
        text-align: center;
      }

      .country-magnet__stats small,
      .country-magnet__stats strong {
        display: block;
      }

      .country-magnet__stats small {
        color: var(--trips-muted);
        font-size: 8px;
      }

      .country-magnet__stats strong {
        margin-top: 3px;
        font-size: 12px;
      }

      .country-magnet__open {
        display: flex;
        justify-content: space-between;
        margin-top: 13px;
        padding-top: 12px;
        border-top: 1px solid rgba(6,27,56,.08);
        color: var(--trips-teal-dark);
        font-size: 11px;
        font-weight: 950;
      }

      .trips-empty,
      .passport-empty {
        padding: 32px 20px;
        border: 1px dashed #cbd8e6;
        border-radius: 24px;
        background: rgba(255,255,255,.75);
        text-align: center;
      }

      .trips-empty__icon,
      .passport-empty__icon {
        font-size: 42px;
      }

      .trips-empty h3,
      .passport-empty h3 {
        margin: 12px 0 5px;
        font-size: 23px;
      }

      .trips-empty p,
      .passport-empty p {
        margin: 0;
        color: var(--trips-muted);
        line-height: 1.7;
      }

      .trips-btn {
        min-height: 52px;
        border-radius: 17px;
        font-weight: 950;
      }

      .trips-btn--primary {
        border: 0;
        background: linear-gradient(135deg, #17a797, #0b7a72);
        color: #fff;
      }

      .trips-btn--secondary {
        border: 1px solid var(--trips-line);
        background: #fff;
        color: var(--trips-navy);
      }

      .trips-detail-hero {
        padding: 24px;
        border-radius: 31px;
        background:
          radial-gradient(circle at 10% 10%, rgba(255,255,255,.17), transparent 30%),
          linear-gradient(140deg, #139f90, #0a706e 55%, #072746);
        color: #fff;
      }

      .trips-detail-hero__back {
        min-height: 42px;
        padding: 0 14px;
        border: 1px solid rgba(255,255,255,.22);
        border-radius: 14px;
        background: rgba(255,255,255,.10);
        color: #fff;
        font: inherit;
        font-weight: 900;
      }

      .trips-detail-hero h1 {
        margin: 28px 0 8px;
        color: #fff;
        font-size: 38px;
      }

      .trips-detail-hero p {
        margin: 0;
        color: rgba(255,255,255,.80);
      }

      .trips-detail-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 9px;
        margin-top: 20px;
      }

      .trips-detail-box {
        min-height: 105px;
        padding: 17px;
        border: 1px solid var(--trips-line);
        border-radius: 22px;
        background: #fff;
      }

      .trips-detail-box small {
        display: block;
        color: var(--trips-muted);
      }

      .trips-detail-box strong {
        display: block;
        margin-top: 10px;
        font-size: 18px;
        line-height: 1.5;
      }

      .trips-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: grid;
        align-items: end;
        padding: 18px;
        background: rgba(4,14,32,.52);
        backdrop-filter: blur(9px);
        -webkit-backdrop-filter: blur(9px);
        overscroll-behavior: contain;
      }

      .trips-modal,
      .country-sheet {
        width: min(760px, 100%);
        max-height: calc(100vh - 36px);
        max-height: calc(100dvh - 36px);
        margin-inline: auto;
        overflow: auto;
        border-radius: 32px 32px 22px 22px;
        background: #fff;
        box-shadow: 0 35px 90px rgba(0,0,0,.25);
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
      }

      .trips-modal__header {
        position: sticky;
        top: 0;
        z-index: 2;
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 20px;
        border-bottom: 1px solid var(--trips-line);
        background: rgba(255,255,255,.96);
      }

      .trips-modal__header h3 {
        margin: 0;
        font-size: 23px;
      }

      .trips-modal__close {
        width: 42px;
        height: 42px;
        border: 1px solid var(--trips-line);
        border-radius: 14px;
        background: #fff;
        font: inherit;
        font-size: 24px;
      }

      .trips-modal__body {
        display: grid;
        gap: 15px;
        padding: 20px;
      }

      .trips-modal__grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .trips-modal__footer {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        padding: 0 20px 22px;
      }

      .country-sheet__hero {
        padding: 24px;
        background:
          radial-gradient(circle at 10% 10%, rgba(255,255,255,.25), transparent 30%),
          linear-gradient(140deg, #bcefe5, #58b9aa 50%, #0a4e66);
      }

      .country-sheet__hero-top {
        display: flex;
        justify-content: space-between;
        align-items: start;
      }

      .country-sheet__flag {
        font-size: 52px;
      }

      .country-sheet__hero h3 {
        margin: 12px 0 4px;
        font-size: 32px;
      }

      .country-sheet__hero p {
        margin: 0;
        color: rgba(6,27,56,.68);
      }

      .country-sheet__stats {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        margin-top: 18px;
      }

      .country-sheet__stats > div {
        padding: 10px 7px;
        border-radius: 15px;
        background: rgba(255,255,255,.72);
        text-align: center;
      }

      .country-sheet__stats small,
      .country-sheet__stats strong {
        display: block;
      }

      .country-sheet__stats small {
        color: var(--trips-muted);
        font-size: 8px;
      }

      .country-sheet__stats strong {
        margin-top: 4px;
        font-size: 12px;
      }

      .country-sheet__body {
        display: grid;
        gap: 14px;
        padding: 20px;
      }

      .country-sheet__title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .country-sheet__title-row h4 {
        width: 100%;
        margin: 0;
        font-size: 22px;
      }

      .country-trip-list {
        display: grid;
        gap: 11px;
      }

      .country-trip-row {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        padding: 13px;
        border: 1px solid var(--trips-line);
        border-radius: 19px;
        background: var(--trips-soft);
      }

      .country-trip-row__icon {
        display: grid;
        place-items: center;
        width: 43px;
        height: 43px;
        border-radius: 14px;
        background: #fff;
        font-size: 20px;
      }

      .country-trip-row h5 {
        margin: 0;
        font-size: 15px;
      }

      .country-trip-row p {
        margin: 4px 0 0;
        color: var(--trips-muted);
        font-size: 11px;
      }

      .country-trip-row button {
        min-height: 38px;
        padding: 0 12px;
        border: 0;
        border-radius: 12px;
        background: var(--trips-navy);
        color: #fff;
        font: inherit;
        font-size: 10px;
        font-weight: 900;
      }

      @media (max-width: 760px) {
        .trips-grid,
        .trips-filters,
        .trips-modal__grid,
        .trips-details-grid {
          grid-template-columns: 1fr;
        }

        .trips-section__header {
          align-items: start;
          flex-direction: column;
        }
      }

      @media (max-width: 520px) {
        .country-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .country-magnet {
          min-height: 190px;
          padding: 14px;
        }

        .country-sheet__stats {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 390px) {
        .trips-hero__actions,
        .country-grid {
          grid-template-columns: 1fr;
        }

        .trips-next-brief__facts > div {
          flex-basis: 100%;
        }
      }

      @media (min-width: 761px) {
        .trips-modal-backdrop {
          align-items: center;
        }

        .trips-modal,
        .country-sheet {
          border-radius: 30px;
        }
      }
    `;

    document.head.appendChild(style);
  };
  
    /* =========================================================
     Store helpers
  ========================================================= */

  const getStoreState = () => {
    const store = getStore();

    if (!store) return {};

    if (typeof store.getState === "function") {
      try {
        return clone(store.getState()) || {};
      } catch (error) {
        console.warn("TIC Trips: failed to read Store state.", error);
        return {};
      }
    }

    if (typeof store.get === "function") {
      try {
        return {
          profile: store.get("profile"),
          trips: store.get("trips"),
          plannedTrips: store.get("plannedTrips"),
          annualPlans: store.get("annualPlans"),
          documents: store.get("documents"),
          packing: store.get("packing"),
          budgets: store.get("budgets"),
          memories: store.get("memories"),
          notifications: store.get("notifications"),
          guideIntelligence: store.get("guideIntelligence"),
          settings: store.get("settings")
        };
      } catch (error) {
        console.warn("TIC Trips: failed to read Store keys.", error);
      }
    }

    return {};
  };

  const normalizeTripRecord = (trip = {}) => {
    const now = new Date().toISOString();
    const countryCode = resolveCountryCode(trip);
    const country = resolveCountryName(trip);

    return {
      ...clone(trip),
      id: text(trip.id) || createId(),
      title:
        text(trip.title) ||
        text(trip.name) ||
        text(trip.destination) ||
        "رحلة بدون اسم",
      destination:
        text(trip.destination) ||
        text(trip.city) ||
        country,
      country,
      countryCode,
      guideCountryCode:
        text(trip.guideCountryCode).toUpperCase() ||
        countryCode,
      status: text(trip.status, "planning").toLowerCase(),
      planningStatus:
        text(trip.planningStatus) ||
        (text(trip.status).toLowerCase() === "completed"
          ? "completed"
          : "planned"),
      tripType:
        text(trip.tripType || trip.type, "family").toLowerCase(),
      budget: number(trip.budget),
      spent: number(trip.spent),
      travelers: Math.max(1, number(trip.travelers, 1)),
      cities: normalizeCities(trip),
      checklist: isObject(trip.checklist)
        ? clone(trip.checklist)
        : {},
      createdAt:
        text(trip.createdAt) ||
        text(trip.dateCreated) ||
        now,
      updatedAt:
        text(trip.updatedAt) ||
        text(trip.dateUpdated) ||
        now
    };
  };

  const mergeTripCollections = (...collections) => {
    const map = new Map();

    collections
      .flatMap((collection) =>
        Array.isArray(collection) ? collection : []
      )
      .forEach((rawTrip) => {
        if (!isObject(rawTrip)) return;

        const trip = normalizeTripRecord(rawTrip);
        const key = String(trip.id);

        if (!map.has(key)) {
          map.set(key, trip);
          return;
        }

        const existing = map.get(key);
        const existingUpdated =
          toDate(existing.updatedAt)?.getTime() || 0;
        const incomingUpdated =
          toDate(trip.updatedAt)?.getTime() || 0;

        map.set(
          key,
          incomingUpdated >= existingUpdated
            ? { ...existing, ...trip }
            : { ...trip, ...existing }
        );
      });

    return [...map.values()];
  };

  const getTrips = () => {
    const store = getStore();

    if (typeof store?.getTrips === "function") {
      try {
        const result = store.getTrips({
          includeArchived: true,
          includeCompleted: true,
          includePlanned: true
        });

        if (Array.isArray(result)) {
          return result.map(normalizeTripRecord);
        }
      } catch (error) {
        console.warn("TIC Trips: Store.getTrips failed.", error);
      }
    }

    const snapshot = getStoreState();

    return mergeTripCollections(
      snapshot.trips,
      snapshot.plannedTrips
    );
  };

  const findTrip = (tripId) =>
    getTrips().find(
      (trip) => String(trip.id) === String(tripId)
    ) || null;

  const commitStoreMutation = (
    eventName,
    payload = {},
    options = {}
  ) => {
    const {
      refresh = true,
      sync = true,
      notify = true
    } = options;

    const eventPayload = {
      source: PAGE_ID,
      pageVersion: PAGE_VERSION,
      eventName,
      timestamp: new Date().toISOString(),
      ...clone(payload)
    };

    if (notify) {
      emit(eventName, eventPayload);
    }

    if (sync) {
      notifyIntelligenceLayer(eventName, eventPayload);
    }

    if (refresh) {
      requestDeferredRefresh(eventName, {
        forceAfterWait: true
      });
    }

    return eventPayload;
  };

  const saveTrips = (trips, metadata = {}) => {
    const store = getStore();

    if (!store) {
      throw new Error("TIC Trips Error: store is unavailable.");
    }

    const normalizedTrips = mergeTripCollections(trips);
    const mutationMeta = {
      source: PAGE_ID,
      pageVersion: PAGE_VERSION,
      reason: text(metadata.reason, "trips-save"),
      immediate: true,
      silent: Boolean(metadata.silent)
    };

    if (typeof store.set === "function") {
      store.set("trips", clone(normalizedTrips), mutationMeta);

      commitStoreMutation("trips-saved", {
        reason: mutationMeta.reason,
        count: normalizedTrips.length
      });

      return true;
    }

    if (typeof store.update === "function") {
      store.update(
        (currentState = {}) => ({
          ...currentState,
          trips: clone(normalizedTrips)
        }),
        mutationMeta
      );

      commitStoreMutation("trips-saved", {
        reason: mutationMeta.reason,
        count: normalizedTrips.length
      });

      return true;
    }

    if (typeof store.dispatch === "function") {
      store.dispatch({
        type: "TRIPS_REPLACE_ALL",
        payload: clone(normalizedTrips),
        meta: mutationMeta
      });

      commitStoreMutation("trips-saved", {
        reason: mutationMeta.reason,
        count: normalizedTrips.length
      });

      return true;
    }

    throw new Error("TIC Trips Error: persistence is unavailable.");
  };

  const addTripToStore = async (trip) => {
    const store = getStore();
    const normalized = normalizeTripRecord(trip);

    let savedTrip = normalized;

    if (typeof store?.addTrip === "function") {
      savedTrip =
        (await store.addTrip(normalized, {
          source: PAGE_ID,
          immediate: true
        })) || normalized;
    } else if (typeof store?.createTrip === "function") {
      savedTrip =
        (await store.createTrip(normalized, {
          source: PAGE_ID,
          immediate: true
        })) || normalized;
    } else if (typeof store?.upsertTrip === "function") {
      savedTrip =
        (await store.upsertTrip(normalized, {
          source: PAGE_ID,
          immediate: true
        })) || normalized;
    } else {
      const trips = getTrips();

      if (
        !trips.some(
          (item) => String(item.id) === String(normalized.id)
        )
      ) {
        trips.unshift(normalized);
      }

      saveTrips(trips, {
        reason: "trip-created",
        silent: true
      });
    }

    const finalTrip = normalizeTripRecord(savedTrip);

    commitStoreMutation("trip-created", {
      trip: finalTrip,
      tripId: finalTrip.id
    });

    return finalTrip;
  };

  const updateTrip = async (tripId, patch) => {
    const store = getStore();
    const existing = findTrip(tripId);

    if (!existing) return null;

    const updated = normalizeTripRecord({
      ...existing,
      ...clone(patch),
      id: existing.id,
      updatedAt: new Date().toISOString()
    });

    let savedTrip = updated;

    if (typeof store?.updateTrip === "function") {
      savedTrip =
        (await store.updateTrip(
          tripId,
          updated,
          {
            source: PAGE_ID,
            immediate: true
          }
        )) || updated;
    } else if (typeof store?.upsertTrip === "function") {
      savedTrip =
        (await store.upsertTrip(updated, {
          source: PAGE_ID,
          immediate: true
        })) || updated;
    } else {
      const trips = getTrips();
      const index = trips.findIndex(
        (trip) => String(trip.id) === String(tripId)
      );

      if (index >= 0) {
        trips[index] = updated;
        saveTrips(trips, {
          reason: "trip-updated",
          silent: true
        });
      }
    }

    const finalTrip = normalizeTripRecord(savedTrip);

    commitStoreMutation("trip-updated", {
      trip: finalTrip,
      tripId: finalTrip.id,
      patch: clone(patch)
    });

    return finalTrip;
  };

  const deleteTripFromStore = async (tripId) => {
    const store = getStore();
    const existing = findTrip(tripId);

    if (!existing) return false;

    if (typeof store?.deleteTrip === "function") {
      await store.deleteTrip(tripId, {
        source: PAGE_ID,
        immediate: true
      });
    } else if (typeof store?.removeTrip === "function") {
      await store.removeTrip(tripId, {
        source: PAGE_ID,
        immediate: true
      });
    } else {
      saveTrips(
        getTrips().filter(
          (trip) => String(trip.id) !== String(tripId)
        ),
        {
          reason: "trip-deleted",
          silent: true
        }
      );
    }

    commitStoreMutation("trip-deleted", {
      tripId,
      trip: existing
    });

    return true;
  };

  const duplicateTripInStore = async (tripId) => {
    const original = findTrip(tripId);
    if (!original) return null;

    const now = new Date().toISOString();
    const countryCode = resolveCountryCode(original);

    const duplicate = normalizeTripRecord({
      ...clone(original),
      id: createId(),
      title: `${
        original.title ||
        original.destination ||
        "رحلة"
      } - نسخة`,
      status: "planning",
      planningStatus: "planned",
      countryCode,
      guideCountryCode: countryCode,
      annualPlanId: null,
      checklist: {
        flightBooked: false,
        hotelBooked: false,
        documentsReady: false,
        insuranceReady: false,
        transportPlanned: false,
        itineraryReady: false
      },
      isMemory: false,
      memorySource: "",
      spent: 0,
      featured: false,
      createdAt: now,
      updatedAt: now
    });

    const saved = await addTripToStore(duplicate);

    commitStoreMutation(
      "trip-duplicated",
      {
        sourceTripId: original.id,
        tripId: saved.id,
        trip: saved
      },
      {
        refresh: false
      }
    );

    return saved;
  };

  /* =========================================================
     Trip calculations
  ========================================================= */

  const durationDays = (trip = {}) => {
    if (number(trip.durationDays) > 0) {
      return number(trip.durationDays);
    }

    const start = toDate(trip.startDate);
    const end = toDate(trip.endDate);

    if (!start || !end || end < start) return 0;

    return (
      Math.floor(
        (startOfDay(end).getTime() -
          startOfDay(start).getTime()) /
          86400000
      ) + 1
    );
  };

  const daysUntil = (trip = {}) => {
    const start = toDate(trip.startDate);
    if (!start) return null;

    return Math.ceil(
      (startOfDay(start).getTime() -
        startOfDay(new Date()).getTime()) /
        86400000
    );
  };

  const tripStatus = (trip = {}) => {
    const raw = text(trip.status).toLowerCase();

    if (["cancelled", "archived"].includes(raw)) return raw;

    const today = startOfDay(new Date());
    const start = toDate(trip.startDate);
    const end = toDate(trip.endDate);

    if (
      start &&
      end &&
      today >= startOfDay(start) &&
      today <= startOfDay(end)
    ) {
      return "ongoing";
    }

    if (end && startOfDay(end) < today) {
      return "completed";
    }

    if (raw === "active") return "ongoing";

    return raw || "planning";
  };

  const isPassportTrip = (trip = {}) =>
    trip.isMemory === true ||
    trip.memorySource === "manual-history" ||
    tripStatus(trip) === "completed";

  const isUpcomingTrip = (trip = {}) =>
    [
      "draft",
      "planning",
      "planned",
      "booked",
      "confirmed",
      "ready"
    ].includes(tripStatus(trip));

  const formatDate = (value) => {
    const parsed = toDate(value);
    if (!parsed) return "غير محدد";

    try {
      return new Intl.DateTimeFormat("ar-AE", {
        day: "numeric",
        month: "long",
        year: "numeric"
      }).format(parsed);
    } catch (_) {
      return parsed.toLocaleDateString("ar-AE");
    }
  };

  const currency = (value) => {
    const ui = getUI();

    if (typeof ui?.currency === "function") {
      try {
        return ui.currency(number(value));
      } catch (_) {
        // Continue with local formatter.
      }
    }

    try {
      return new Intl.NumberFormat("ar-AE", {
        style: "currency",
        currency: "AED",
        maximumFractionDigits: 0
      }).format(number(value));
    } catch (_) {
      return `${number(value).toLocaleString("ar-AE")} د.إ`;
    }
  };

  const countryFlag = (country, countryCode = "") => {
    const record = resolveCountryRecord(country, countryCode);
    if (record?.flag) return record.flag;

    const normalized = text(country).toLowerCase();

    const flags = {
      "الإمارات": "🇦🇪",
      "الامارات": "🇦🇪",
      "united arab emirates": "🇦🇪",
      "السعودية": "🇸🇦",
      "saudi arabia": "🇸🇦",
      "البحرين": "🇧🇭",
      "bahrain": "🇧🇭",
      "عمان": "🇴🇲",
      "oman": "🇴🇲",
      "قطر": "🇶🇦",
      "qatar": "🇶🇦",
      "الكويت": "🇰🇼",
      "kuwait": "🇰🇼",
      "المالديف": "🇲🇻",
      "maldives": "🇲🇻",
      "تايلاند": "🇹🇭",
      "thailand": "🇹🇭",
      "كازاخستان": "🇰🇿",
      "kazakhstan": "🇰🇿",
      "إسبانيا": "🇪🇸",
      "اسبانيا": "🇪🇸",
      "spain": "🇪🇸",
      "تركيا": "🇹🇷",
      "turkey": "🇹🇷",
      "جورجيا": "🇬🇪",
      "georgia": "🇬🇪",
      "أذربيجان": "🇦🇿",
      "اذربيجان": "🇦🇿",
      "azerbaijan": "🇦🇿",
      "المملكة المتحدة": "🇬🇧",
      "united kingdom": "🇬🇧",
      "فرنسا": "🇫🇷",
      "france": "🇫🇷",
      "إيطاليا": "🇮🇹",
      "italy": "🇮🇹",
      "سويسرا": "🇨🇭",
      "switzerland": "🇨🇭",
      "اليابان": "🇯🇵",
      "japan": "🇯🇵",
      "ماليزيا": "🇲🇾",
      "malaysia": "🇲🇾",
      "إندونيسيا": "🇮🇩",
      "indonesia": "🇮🇩",
      "النمسا": "🇦🇹",
      "austria": "🇦🇹",
      "سنغافورة": "🇸🇬",
      "singapore": "🇸🇬"
    };

    return flags[normalized] || "🌍";
  };

  const normalizeCities = (trip = {}) => {
    const cities = [];

    if (Array.isArray(trip.cities)) {
      cities.push(...trip.cities);
    }

    if (trip.city) cities.push(trip.city);

    if (
      trip.destination &&
      !trip.country &&
      !trip.destinationCountry
    ) {
      cities.push(trip.destination);
    }

    return [
      ...new Set(
        cities
          .map((city) => text(city))
          .filter(Boolean)
      )
    ];
  };

  const buildCountries = (trips = []) => {
    const map = new Map();

    trips
      .filter(isPassportTrip)
      .forEach((trip) => {
        const countryCode = resolveCountryCode(trip);
        const country = resolveCountryName(trip);
        const key =
          countryCode ||
          normalizeCountryKey(country) ||
          "unknown";

        if (!map.has(key)) {
          const record = resolveCountryRecord(
            country,
            countryCode
          );

          map.set(key, {
            key,
            countryCode:
              countryCode ||
              text(record?.code).toUpperCase(),
            country:
              text(record?.nameAr) ||
              country,
            countryNameEn: text(record?.nameEn),
            flag:
              text(record?.flag) ||
              text(trip.countryFlag) ||
              countryFlag(country, countryCode),
            visits: 0,
            cities: new Set(),
            firstVisit: null,
            lastVisit: null,
            totalDays: 0,
            trips: []
          });
        }

        const item = map.get(key);
        const date =
          toDate(trip.startDate) ||
          toDate(trip.endDate) ||
          toDate(trip.createdAt);

        item.visits += 1;
        item.totalDays += Math.max(
          0,
          durationDays(trip)
        );

        item.trips.push(
          normalizeTripRecord({
            ...clone(trip),
            countryCode:
              resolveCountryCode(trip) ||
              item.countryCode,
            country: resolveCountryName(trip)
          })
        );

        normalizeCities(trip).forEach((city) =>
          item.cities.add(city)
        );

        if (date) {
          if (
            !item.firstVisit ||
            date < item.firstVisit
          ) {
            item.firstVisit = date;
          }

          if (
            !item.lastVisit ||
            date > item.lastVisit
          ) {
            item.lastVisit = date;
          }
        }
      });

    return [...map.values()]
      .map((item) => ({
        ...item,
        cities: [...item.cities],
        trips: item.trips.sort(
          (a, b) =>
            (toDate(b.startDate)?.getTime() || 0) -
            (toDate(a.startDate)?.getTime() || 0)
        )
      }))
      .sort(
        (a, b) =>
          (b.lastVisit?.getTime() || 0) -
          (a.lastVisit?.getTime() || 0)
      );
  };

  const statisticsFrom = (trips, countries) => ({
    total: trips.filter(
      (trip) => tripStatus(trip) !== "archived"
    ).length,
    upcoming: trips.filter(isUpcomingTrip).length,
    ongoing: trips.filter(
      (trip) => tripStatus(trip) === "ongoing"
    ).length,
    memories: trips.filter(isPassportTrip).length,
    countries: countries.length,
    cities: new Set(
      trips
        .filter(isPassportTrip)
        .flatMap(normalizeCities)
        .map((city) => city.toLowerCase())
    ).size
  });

  const filteredTripsFrom = (trips) => {
    const search = text(
      state.filters.search
    ).toLowerCase();

    const byTab = trips.filter((trip) => {
      const status = tripStatus(trip);

      if (
        ["archived", "completed"].includes(status)
      ) {
        return false;
      }

      if (state.activeTab === "upcoming") {
        return isUpcomingTrip(trip);
      }

      if (state.activeTab === "ongoing") {
        return status === "ongoing";
      }

      return status !== "archived";
    });

    const result = byTab.filter((trip) => {
      const status = tripStatus(trip);
      const type = text(
        trip.tripType
      ).toLowerCase();

      const searchable = [
        trip.title,
        trip.destination,
        trip.country,
        resolveCountryName(trip),
        trip.countryCode,
        trip.city,
        ...(Array.isArray(trip.cities)
          ? trip.cities
          : []),
        trip.accommodation,
        trip.hotelName,
        trip.airline,
        trip.notes,
        trip.bookingReference
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!search || searchable.includes(search)) &&
        (state.filters.status === "all" ||
          status === state.filters.status) &&
        (state.filters.type === "all" ||
          type === state.filters.type)
      );
    });

    result.sort((a, b) => {
      switch (state.filters.sort) {
        case "start-desc":
          return (
            (toDate(b.startDate)?.getTime() || 0) -
            (toDate(a.startDate)?.getTime() || 0)
          );

        case "created-desc":
          return (
            (toDate(b.createdAt)?.getTime() || 0) -
            (toDate(a.createdAt)?.getTime() || 0)
          );

        case "budget-desc":
          return number(b.budget) - number(a.budget);

        case "title-asc":
          return text(
            a.title || a.destination
          ).localeCompare(
            text(b.title || b.destination),
            "ar"
          );

        case "start-asc":
        default:
          return (
            (toDate(a.startDate)?.getTime() ||
              Number.MAX_SAFE_INTEGER) -
            (toDate(b.startDate)?.getTime() ||
              Number.MAX_SAFE_INTEGER)
          );
      }
    });

    return result;
  };

  const buildSnapshot = () => {
    const trips = getTrips();
    const countries = buildCountries(trips);

    const snapshot = {
      trips,
      countries,
      filteredTrips: filteredTripsFrom(trips),
      activeTrip: state.activeTripId
        ? trips.find(
            (trip) =>
              String(trip.id) ===
              String(state.activeTripId)
          ) || null
        : null,
      activeCountry: state.activeCountryKey
        ? countries.find(
            (country) =>
              country.key ===
              state.activeCountryKey
          ) || null
        : null,
      statistics: statisticsFrom(
        trips,
        countries
      ),
      filters: clone(state.filters),
      activeView: state.activeView,
      activeTab: state.activeTab
    };

    const signature = createSignature({
      trips: snapshot.trips,
      countries: snapshot.countries,
      filteredTripIds:
        snapshot.filteredTrips.map(
          (trip) => trip.id
        ),
      activeTripId:
        snapshot.activeTrip?.id || null,
      activeCountryKey:
        snapshot.activeCountry?.key || null,
      statistics: snapshot.statistics,
      filters: snapshot.filters,
      activeView: snapshot.activeView,
      activeTab: snapshot.activeTab
    });

    state.lastSnapshot = snapshot;
    state.lastSnapshotSignature = signature;

    return snapshot;
  };

  const getNextTrip = (trips) =>
    trips
      .filter(isUpcomingTrip)
      .slice()
      .sort(
        (a, b) =>
          (toDate(a.startDate)?.getTime() ||
            Number.MAX_SAFE_INTEGER) -
          (toDate(b.startDate)?.getTime() ||
            Number.MAX_SAFE_INTEGER)
      )[0] || null;

  /* =========================================================
     Renderers
  ========================================================= */

  const renderOverview = (statistics) => {
    const items = [
      {
        icon: "✈",
        value: statistics.upcoming,
        label: "رحلات قادمة"
      },
      {
        icon: "◎",
        value: statistics.ongoing,
        label: "رحلات جارية"
      },
      {
        icon: "◈",
        value: statistics.countries,
        label: "دول زرتها"
      },
      {
        icon: "♡",
        value: statistics.memories,
        label: "رحلات سابقة"
      }
    ];

    return `
      <div class="trips-overview">
        ${items
          .map(
            (item) => `
              <article class="trips-stat">
                <span class="trips-stat__icon">${escapeHTML(item.icon)}</span>
                <strong>${escapeHTML(item.value)}</strong>
                <span>${escapeHTML(item.label)}</span>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  };

  const renderNextTripBrief = (snapshot) => {
    const trip = getNextTrip(snapshot.trips);
    if (!trip) return "";

    const remaining = daysUntil(trip);
    const destination =
      trip.destination ||
      [trip.city, resolveCountryName(trip)]
        .filter(Boolean)
        .join("، ") ||
      "وجهة غير محددة";

    const readinessItems = [
      {
        icon: "▣",
        label: "التأشيرة",
        value: trip.visaRequired
          ? "مطلوبة"
          : "غير مطلوبة"
      },
      {
        icon: "✓",
        label: "التأمين",
        value: trip.insuranceRequired
          ? "مطلوب"
          : "اختياري"
      },
      {
        icon: "◈",
        label: "العملة",
        value: trip.currency || "AED"
      },
      {
        icon: "✈",
        label: "المطار",
        value:
          trip.departureAirport ||
          "غير محدد"
      }
    ];

    return `
      <section class="trips-next-brief">
        <div class="trips-next-brief__head">
          <div>
            <span>NEXT JOURNEY</span>
            <h2>رحلتك القادمة</h2>
            <p>${escapeHTML(destination)}</p>
          </div>

          <div class="trips-next-brief__countdown">
            <strong>
              ${
                remaining === null
                  ? "—"
                  : remaining === 0
                    ? "اليوم"
                    : remaining === 1
                      ? "يوم"
                      : `${remaining} يوم`
              }
            </strong>
            <small>متبقي</small>
          </div>
        </div>

        <div class="trips-next-brief__facts">
          ${readinessItems
            .map(
              (item) => `
                <div>
                  <span>${escapeHTML(item.icon)}</span>
                  <div>
                    <small>${escapeHTML(item.label)}</small>
                    <strong>${escapeHTML(item.value)}</strong>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>

        <button
          type="button"
          class="trips-next-brief__action"
          data-action="trips-view-details"
          data-trip-id="${escapeHTML(trip.id)}"
        >
          فتح تفاصيل الرحلة
        </button>
      </section>
    `;
  };

  const renderTabs = () => `
    <div class="trips-tabs" role="tablist">
      ${Object.entries(TAB_LABELS)
        .map(
          ([value, label]) => `
            <button
              type="button"
              class="trips-tab ${
                state.activeTab === value
                  ? "is-active"
                  : ""
              }"
              data-trips-tab="${escapeHTML(value)}"
              role="tab"
              aria-selected="${
                state.activeTab === value
                  ? "true"
                  : "false"
              }"
            >
              ${escapeHTML(label)}
            </button>
          `
        )
        .join("")}
    </div>
  `;

  const renderFilters = () => {
    const selected = (value, current) =>
      value === current ? "selected" : "";

    return `
      <div class="trips-tools">
        <label class="trips-search-wrap">
          <span>⌕</span>
          <input
            type="search"
            class="trips-search"
            data-trips-search
            value="${escapeHTML(state.filters.search)}"
            placeholder="ابحث باسم الرحلة أو الدولة أو المدينة..."
            autocomplete="off"
            enterkeyhint="search"
          >
        </label>

        <button
          type="button"
          class="trips-filter-toggle"
          data-action="trips-toggle-filters"
        >
          <span>⌕</span>
          <small>فلترة</small>
        </button>
      </div>

      ${
        state.filtersOpen
          ? `
            <div class="trips-filters">
              <div class="trips-field">
                <label>الحالة</label>
                <select data-trips-filter-status>
                  <option
                    value="all"
                    ${selected(
                      "all",
                      state.filters.status
                    )}
                  >
                    كل الحالات
                  </option>

                  ${Object.entries(STATUS_LABELS)
                    .filter(([value]) =>
                      ![
                        "completed",
                        "archived"
                      ].includes(value)
                    )
                    .map(
                      ([value, label]) => `
                        <option
                          value="${escapeHTML(value)}"
                          ${selected(
                            value,
                            state.filters.status
                          )}
                        >
                          ${escapeHTML(label)}
                        </option>
                      `
                    )
                    .join("")}
                </select>
              </div>

              <div class="trips-field">
                <label>نوع الرحلة</label>
                <select data-trips-filter-type>
                  <option
                    value="all"
                    ${selected(
                      "all",
                      state.filters.type
                    )}
                  >
                    كل الأنواع
                  </option>

                  ${Object.entries(TYPE_LABELS)
                    .map(
                      ([value, label]) => `
                        <option
                          value="${escapeHTML(value)}"
                          ${selected(
                            value,
                            state.filters.type
                          )}
                        >
                          ${escapeHTML(label)}
                        </option>
                      `
                    )
                    .join("")}
                </select>
              </div>

              <div class="trips-field">
                <label>الترتيب</label>
                <select data-trips-sort>
                  ${SORT_OPTIONS.map(
                    (option) => `
                      <option
                        value="${escapeHTML(option.value)}"
                        ${selected(
                          option.value,
                          state.filters.sort
                        )}
                      >
                        ${escapeHTML(option.label)}
                      </option>
                    `
                  ).join("")}
                </select>
              </div>

              <button
                type="button"
                class="trips-btn trips-btn--secondary"
                data-action="trips-clear-filters"
              >
                مسح الفلاتر
              </button>
            </div>
          `
          : ""
      }
    `;
  };

  const renderTripCard = (trip) => {
    const status = tripStatus(trip);
    const remaining = daysUntil(trip);
    const budget = number(trip.budget);
    const spent = number(trip.spent);
    const usage =
      budget > 0
        ? Math.min(
            100,
            Math.max(
              0,
              Math.round(
                (spent / budget) * 100
              )
            )
          )
        : 0;

    const countdown =
      remaining === null
        ? "الموعد غير محدد"
        : remaining === 0
          ? "السفر اليوم"
          : remaining === 1
            ? "متبقي يوم"
            : remaining > 1
              ? `متبقي ${remaining} يوم`
              : "بدأت الرحلة";

    const countryCode = resolveCountryCode(trip);
    const countryName = resolveCountryName(trip);

    const location =
      trip.destination ||
      [trip.city, countryName]
        .filter(Boolean)
        .join("، ") ||
      "وجهة غير محددة";

    return `
      <article
        class="trip-card-v3"
        data-trip-card="${escapeHTML(trip.id)}"
      >
        <div class="trip-card-v3__cover">
          <span class="trip-card-v3__emoji">
            ${escapeHTML(
              trip.emoji ||
              trip.icon ||
              countryFlag(
                countryName,
                countryCode
              )
            )}
          </span>

          <span class="trip-card-v3__badge">
            ${escapeHTML(countdown)}
          </span>
        </div>

        <div class="trip-card-v3__body">
          <div class="trip-card-v3__title-row">
            <div>
              <h3>
                ${escapeHTML(
                  trip.title ||
                  trip.destination ||
                  "رحلة بدون اسم"
                )}
              </h3>

              <p class="trip-card-v3__destination">
                ${escapeHTML(location)}
              </p>
            </div>

            <span
              class="trip-status-v3"
              data-status="${escapeHTML(status)}"
            >
              ${escapeHTML(
                STATUS_LABELS[status] ||
                status
              )}
            </span>
          </div>

          <div class="trip-card-v3__meta">
            <div class="trip-card-v3__meta-item">
              <small>التاريخ</small>
              <strong>
                ${escapeHTML(
                  formatDate(trip.startDate)
                )}
              </strong>
            </div>

            <div class="trip-card-v3__meta-item">
              <small>المدة</small>
              <strong>
                ${
                  durationDays(trip)
                    ? `${durationDays(trip)} يوم`
                    : "—"
                }
              </strong>
            </div>

            <div class="trip-card-v3__meta-item">
              <small>النوع</small>
              <strong>
                ${escapeHTML(
                  TYPE_LABELS[trip.tripType] ||
                  "رحلة"
                )}
              </strong>
            </div>
          </div>

          ${
            budget > 0
              ? `
                <div class="trip-card-v3__progress">
                  <div class="trip-card-v3__progress-row">
                    <span>استخدام الميزانية</span>
                    <strong>${usage}%</strong>
                  </div>

                  <div
                    class="trip-card-v3__bar"
                    role="progressbar"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow="${usage}"
                  >
                    <span style="width:${usage}%"></span>
                  </div>
                </div>
              `
              : ""
          }

          <div class="trip-card-v3__actions">
            <button
              type="button"
              class="trip-card-v3__open"
              data-action="trips-view-details"
              data-trip-id="${escapeHTML(trip.id)}"
            >
              فتح الرحلة
            </button>

            <button
              type="button"
              class="trip-card-v3__menu"
              data-action="trips-card-menu"
              data-trip-id="${escapeHTML(trip.id)}"
              aria-label="إجراءات الرحلة"
            >
              •••
            </button>
          </div>
        </div>
      </article>
    `;
  };

  const renderCountryCard = (country) => `
    <article
      class="country-magnet"
      role="button"
      tabindex="0"
      data-action="trips-open-country"
      data-country-key="${escapeHTML(country.key)}"
      aria-label="فتح سجل ${escapeHTML(country.country)}"
    >
      <span class="country-magnet__count">
        ${escapeHTML(country.visits)}
        <small>زيارة</small>
      </span>

      <div class="country-magnet__flag">
        ${escapeHTML(country.flag)}
      </div>

      <h3>${escapeHTML(country.country)}</h3>

      <p>
        ${
          country.cities.length
            ? escapeHTML(
                country.cities.join("، ")
              )
            : "لم تُسجل المدن بعد"
        }
      </p>

      <div class="country-magnet__stats">
        <span>
          <small>المدن</small>
          <strong>
            ${escapeHTML(country.cities.length)}
          </strong>
        </span>

        <span>
          <small>الأيام</small>
          <strong>
            ${escapeHTML(country.totalDays || 0)}
          </strong>
        </span>

        <span>
          <small>آخر زيارة</small>
          <strong>
            ${
              country.lastVisit
                ? escapeHTML(
                    country.lastVisit.getFullYear()
                  )
                : "—"
            }
          </strong>
        </span>
      </div>

      <div class="country-magnet__open">
        <span>فتح سجل الدولة</span>
        <span>←</span>
      </div>
    </article>
  `;

  const renderEmpty = ({
    icon = "✈",
    title,
    message,
    actionLabel,
    action
  }) => `
    <div class="trips-empty">
      <div class="trips-empty__icon">
        ${escapeHTML(icon)}
      </div>

      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(message)}</p>

      ${
        actionLabel && action
          ? `
            <button
              type="button"
              class="trips-btn trips-btn--primary"
              data-action="${escapeHTML(action)}"
            >
              ${escapeHTML(actionLabel)}
            </button>
          `
          : ""
      }
    </div>
  `;

  const renderTabContent = (snapshot) => {
    if (!snapshot.filteredTrips.length) {
      const emptyByTab = {
        upcoming: {
          icon: "✈",
          title: "لا توجد رحلات قادمة",
          message:
            "أنشئ رحلتك القادمة، وأضف تفاصيل الحجز والميزانية والتجهيز.",
          actionLabel: "إنشاء رحلة جديدة",
          action: "trips-new"
        },
        ongoing: {
          icon: "◎",
          title: "لا توجد رحلة جارية الآن",
          message:
            "عندما يبدأ موعد إحدى رحلاتك ستنتقل إلى هذا القسم تلقائياً."
        },
        all: {
          icon: "✈",
          title: "لا توجد رحلات نشطة",
          message:
            "الرحلات المكتملة موجودة داخل جواز سفرك.",
          actionLabel: "إنشاء رحلة جديدة",
          action: "trips-new"
        }
      };

      return renderEmpty(
        emptyByTab[state.activeTab] ||
        emptyByTab.all
      );
    }

    return `
      <div class="trips-grid">
        ${snapshot.filteredTrips
          .map(renderTripCard)
          .join("")}
      </div>
    `;
  };

  const renderPassport = (snapshot) => `
    <section class="passport-section">
      <div class="passport-head">
        <div>
          <span class="passport-kicker">
            MY TRAVEL PASSPORT
          </span>

          <h2>الدول التي زرتها</h2>

          <p>
            جواز سفرك يجمع الدول والرحلات السابقة في مكان واحد،
            ومربوط مباشرة مع صفحة الدليل.
          </p>
        </div>

        <span class="passport-icon">🌍</span>
      </div>

      <div class="passport-toolbar">
        <button
          type="button"
          class="passport-add"
          data-action="trips-add-memory"
        >
          ＋ إضافة رحلة سابقة
        </button>

        <span class="passport-count">
          ${escapeHTML(
            snapshot.statistics.memories
          )} رحلة
        </span>
      </div>

      ${
        snapshot.countries.length
          ? `
            <div class="country-grid">
              ${snapshot.countries
                .map(renderCountryCard)
                .join("")}
            </div>
          `
          : `
            <div class="passport-empty">
              <div class="passport-empty__icon">🌍</div>
              <h3>جواز سفرك ما زال فارغاً</h3>

              <p>
                أضف رحلة سابقة، والرحلات الحالية ستنضم تلقائياً
                بعد انتهاء تاريخها.
              </p>

              <button
                type="button"
                class="trips-btn trips-btn--primary"
                data-action="trips-add-memory"
              >
                إضافة أول رحلة سابقة
              </button>
            </div>
          `
      }
    </section>
  `;

  const renderHub = (snapshot) => `
    <div class="trips-shell">
      <section class="trips-hero">
        <div class="trips-hero__top">
          <span class="trips-hero__eyebrow">
            TRIPS CENTER
          </span>
        </div>

        <div class="trips-hero__content">
          <h1>رحلاتي</h1>

          <p>
            نظّم رحلاتك القادمة، وبعد اكتمالها تنضم تلقائياً
            إلى جواز سفرك والدليل الذكي.
          </p>
        </div>

        <div class="trips-hero__actions">
          <button
            type="button"
            class="trips-action trips-action--primary"
            data-action="trips-new"
          >
            ＋ رحلة جديدة
          </button>

          <button
            type="button"
            class="trips-action trips-action--glass"
            data-action="trips-add-memory"
          >
            🌍 رحلة سابقة
          </button>
        </div>
      </section>

      <section class="trips-zone trips-zone--overview">
        <section class="trips-section">
          <div class="trips-section__header">
            <div>
              <p class="trips-section__eyebrow">
                QUICK OVERVIEW
              </p>

              <h2>ملخص سفراتك</h2>

              <p class="trips-section__subtitle">
                أرقام مباشرة من جميع الرحلات المحفوظة.
              </p>
            </div>
          </div>

          ${renderOverview(snapshot.statistics)}
        </section>

        ${renderNextTripBrief(snapshot)}
      </section>

      <section class="trips-zone trips-zone--journeys">
        <div class="trips-zone__marker">
          <span class="trips-zone__marker-icon">✈</span>

          <div class="trips-zone__marker-copy">
            <small>JOURNEY OPERATIONS</small>
            <strong>منطقة الرحلات النشطة</strong>
            <p>الرحلات القادمة والجارية والتخطيط لها.</p>
          </div>
        </div>

        <section class="trips-section">
          <div class="trips-section__header">
            <div>
              <p class="trips-section__eyebrow">
                ACTIVE JOURNEYS
              </p>

              <h2>
                ${escapeHTML(
                  TAB_LABELS[state.activeTab] ||
                  "رحلاتك"
                )}
              </h2>

              <p class="trips-section__subtitle">
                الرحلات المكتملة تنتقل إلى جواز السفر تلقائياً.
              </p>
            </div>
          </div>

          ${renderTabs()}
          ${renderFilters()}
          ${renderTabContent(snapshot)}
        </section>
      </section>

      <div class="trips-passport-divider">
        <span>🌍 الانتقال إلى سجل السفر</span>
      </div>

      <section class="trips-zone trips-zone--passport">
        ${renderPassport(snapshot)}
      </section>
    </div>
  `;

  const renderDetails = (trip) => {
    if (!trip) {
      return renderEmpty({
        icon: "!",
        title: "تعذر العثور على الرحلة",
        message:
          "قد تكون الرحلة حُذفت أو لم تعد متوفرة.",
        actionLabel: "العودة إلى رحلاتي",
        action: "trips-back-to-hub"
      });
    }

    const status = tripStatus(trip);
    const countryName =
      resolveCountryName(trip);
    const countryCode =
      resolveCountryCode(trip);

    const fields = [
      ["الدولة", countryName || "—"],
      ["رمز الدولة", countryCode || "—"],
      ["المدينة", trip.city || "—"],
      ["التاريخ", formatDate(trip.startDate)],
      [
        "المدة",
        durationDays(trip)
          ? `${durationDays(trip)} يوم`
          : "—"
      ],
      [
        "الميزانية",
        number(trip.budget) > 0
          ? currency(trip.budget)
          : "غير مسجلة"
      ],
      [
        "المصروف",
        number(trip.spent) > 0
          ? currency(trip.spent)
          : "غير مسجل"
      ],
      [
        "شركة الطيران",
        trip.airline || "—"
      ],
      [
        "رقم الرحلة",
        trip.flightNumber || "—"
      ],
      [
        "الفندق",
        typeof trip.accommodation === "string"
          ? trip.accommodation || "—"
          : trip.hotelName || "—"
      ],
      [
        "رقم الحجز",
        trip.bookingReference || "—"
      ],
      [
        "التقييم",
        number(trip.rating) > 0
          ? `${trip.rating}/5`
          : "غير مقيّمة"
      ]
    ];

    return `
      <div class="trips-shell">
        <section class="trips-detail-hero">
          <button
            type="button"
            class="trips-detail-hero__back"
            data-action="trips-back-to-hub"
          >
            ← العودة
          </button>

          <h1>
            ${escapeHTML(
              trip.title ||
              trip.destination ||
              "تفاصيل الرحلة"
            )}
          </h1>

          <p>
            ${escapeHTML(
              trip.destination ||
              [trip.city, countryName]
                .filter(Boolean)
                .join("، ")
            )}
          </p>

          <div class="trips-detail-actions">
            <span
              class="trip-status-v3"
              data-status="${escapeHTML(status)}"
            >
              ${escapeHTML(
                STATUS_LABELS[status] ||
                status
              )}
            </span>

            <span class="trip-status-v3">
              ${escapeHTML(
                TYPE_LABELS[trip.tripType] ||
                "رحلة"
              )}
            </span>
          </div>

          <div class="trips-detail-actions">
            <button
              type="button"
              class="trips-action trips-action--primary"
              data-action="trips-edit"
              data-trip-id="${escapeHTML(trip.id)}"
            >
              تعديل الرحلة
            </button>

            ${
              countryCode
                ? `
                  <button
                    type="button"
                    class="trips-action trips-action--glass"
                    data-action="trips-open-country-guide"
                    data-country-code="${escapeHTML(countryCode)}"
                  >
                    فتح دليل الدولة
                  </button>
                `
                : ""
            }

            <button
              type="button"
              class="trips-action trips-action--glass"
              data-action="trips-card-menu"
              data-trip-id="${escapeHTML(trip.id)}"
            >
              إجراءات إضافية
            </button>
          </div>
        </section>

        <section class="trips-section">
          <div class="trips-section__header">
            <div>
              <p class="trips-section__eyebrow">
                JOURNEY DETAILS
              </p>

              <h2>تفاصيل الرحلة</h2>
            </div>
          </div>

          <div class="trips-details-grid">
            ${fields
              .map(
                ([label, value]) => `
                  <article class="trips-detail-box">
                    <small>
                      ${escapeHTML(label)}
                    </small>

                    <strong>
                      ${escapeHTML(value)}
                    </strong>
                  </article>
                `
              )
              .join("")}
          </div>
        </section>

        ${
          trip.bestMemory || trip.notes
            ? `
              <section class="trips-section">
                <div class="trips-section__header">
                  <div>
                    <p class="trips-section__eyebrow">
                      MEMORIES
                    </p>

                    <h2>ذكريات وملاحظات</h2>
                  </div>
                </div>

                <div class="trips-details-grid">
                  ${
                    trip.bestMemory
                      ? `
                        <article class="trips-detail-box">
                          <small>أجمل ذكرى</small>
                          <strong>
                            ${escapeHTML(
                              trip.bestMemory
                            )}
                          </strong>
                        </article>
                      `
                      : ""
                  }

                  ${
                    trip.notes
                      ? `
                        <article class="trips-detail-box">
                          <small>ملاحظات الرحلة</small>
                          <strong>
                            ${escapeHTML(
                              trip.notes
                            )}
                          </strong>
                        </article>
                      `
                      : ""
                  }
                </div>
              </section>
            `
            : ""
        }
      </div>
    `;
  };

  const renderPage = (snapshot) => `
    <div
      class="tic-module"
      data-page="trips"
      data-view="${escapeHTML(state.activeView)}"
      data-page-version="${PAGE_VERSION}"
      data-render-signature="${escapeHTML(
        state.lastSnapshotSignature
      )}"
    >
      ${
        state.activeView === "details"
          ? renderDetails(snapshot.activeTrip)
          : renderHub(snapshot)
      }
    </div>
  `;


  /* =========================================================
     Passport modal
  ========================================================= */

  const lockDocumentScroll = () => {
    if (!document.body) return;

    if (!document.body.dataset.tripsPreviousOverflow) {
      document.body.dataset.tripsPreviousOverflow =
        document.body.style.overflow || "";
    }

    document.body.style.overflow = "hidden";
    state.isFormOpen = true;
    state.isUserInteracting = true;
  };

  const unlockDocumentScroll = () => {
    if (!document.body) return;

    if (
      document.querySelector(
        "[data-trips-modal], [data-country-sheet]"
      )
    ) {
      return;
    }

    document.body.style.overflow =
      document.body.dataset.tripsPreviousOverflow || "";

    delete document.body.dataset.tripsPreviousOverflow;

    state.isFormOpen = false;
    releaseInteractionLater(180);
  };

  const renderMemoryModal = () => {
    const draft = state.memoryDraft || {};

    return `
      <div
        class="trips-modal-backdrop"
        data-trips-modal
        data-modal-open="true"
        role="presentation"
      >
        <form
          class="trips-modal"
          data-memory-form
          novalidate
          aria-label="إضافة رحلة سابقة"
        >
          <div class="trips-modal__header">
            <div>
              <h3>إضافة رحلة سابقة</h3>
              <small style="color:#75839b">
                ستُحفظ داخل جواز سفرك وتظهر في الدليل.
              </small>
            </div>

            <button
              type="button"
              class="trips-modal__close"
              data-action="trips-close-modal"
              aria-label="إغلاق"
            >
              ×
            </button>
          </div>

          <div class="trips-modal__body">
            <div class="trips-modal__grid">
              <div class="trips-field">
                <label>اسم الرحلة *</label>
                <input
                  name="title"
                  required
                  autocomplete="off"
                  value="${escapeHTML(draft.title || "")}"
                  placeholder="مثال: رحلة المالديف"
                >
              </div>

              <div class="trips-field">
                <label>الدولة *</label>
                <input
                  name="country"
                  required
                  autocomplete="country-name"
                  value="${escapeHTML(draft.country || "")}"
                  placeholder="مثال: المالديف"
                >
              </div>

              <div class="trips-field">
                <label>المدينة أو الجزيرة</label>
                <input
                  name="city"
                  autocomplete="address-level2"
                  value="${escapeHTML(draft.city || "")}"
                  placeholder="مثال: جنوب ماليه"
                >
              </div>

              <div class="trips-field">
                <label>السنة</label>
                <input
                  name="travelYear"
                  type="number"
                  inputmode="numeric"
                  min="1950"
                  max="2100"
                  value="${escapeHTML(
                    draft.travelYear ||
                    toDate(draft.startDate)?.getFullYear() ||
                    new Date().getFullYear()
                  )}"
                >
              </div>

              <div class="trips-field">
                <label>تاريخ البداية</label>
                <input
                  name="startDate"
                  type="date"
                  value="${escapeHTML(draft.startDate || "")}"
                >
              </div>

              <div class="trips-field">
                <label>تاريخ النهاية</label>
                <input
                  name="endDate"
                  type="date"
                  value="${escapeHTML(draft.endDate || "")}"
                >
              </div>

              <div class="trips-field">
                <label>نوع الرحلة</label>
                <select name="tripType">
                  ${Object.entries(TYPE_LABELS)
                    .map(
                      ([value, label]) => `
                        <option
                          value="${escapeHTML(value)}"
                          ${(draft.tripType || "family") === value ? "selected" : ""}
                        >
                          ${escapeHTML(label)}
                        </option>
                      `
                    )
                    .join("")}
                </select>
              </div>

              <div class="trips-field">
                <label>من سافر معك؟</label>
                <input
                  name="travelCompanions"
                  autocomplete="off"
                  value="${escapeHTML(draft.travelCompanions || "")}"
                >
              </div>

              <div class="trips-field">
                <label>الفندق أو السكن</label>
                <input
                  name="accommodation"
                  autocomplete="off"
                  value="${escapeHTML(
                    typeof draft.accommodation === "string"
                      ? draft.accommodation
                      : draft.hotelName || ""
                  )}"
                >
              </div>

              <div class="trips-field">
                <label>التقييم</label>
                <select name="rating">
                  <option value="">غير محدد</option>
                  ${[5, 4, 3, 2, 1]
                    .map(
                      (rating) => `
                        <option
                          value="${rating}"
                          ${String(draft.rating || "") === String(rating) ? "selected" : ""}
                        >
                          ${rating} من 5
                        </option>
                      `
                    )
                    .join("")}
                </select>
              </div>
            </div>

            <div class="trips-field">
              <label>المدن أو الأماكن التي زرتها</label>
              <input
                name="cities"
                autocomplete="off"
                value="${escapeHTML(
                  Array.isArray(draft.cities)
                    ? draft.cities.join("، ")
                    : draft.cities || ""
                )}"
                placeholder="افصل بينها بفاصلة"
              >
            </div>

            <div class="trips-field">
              <label>أجمل ذكرى</label>
              <textarea name="bestMemory">${escapeHTML(draft.bestMemory || "")}</textarea>
            </div>

            <div class="trips-field">
              <label>ملاحظات إضافية</label>
              <textarea name="notes">${escapeHTML(draft.notes || "")}</textarea>
            </div>

            <label style="display:flex;align-items:center;gap:10px;font-weight:900">
              <input
                type="checkbox"
                name="wouldVisitAgain"
                value="true"
                ${draft.wouldVisitAgain === true ? "checked" : ""}
              >
              أرغب بزيارة هذه الوجهة مرة أخرى
            </label>
          </div>

          <div class="trips-modal__footer">
            <button
              type="button"
              class="trips-btn trips-btn--secondary"
              data-action="trips-close-modal"
            >
              إلغاء
            </button>

            <button
              type="submit"
              class="trips-btn trips-btn--primary"
            >
              حفظ في جواز السفر
            </button>
          </div>
        </form>
      </div>
    `;
  };

  const renderCountrySheet = (country) => {
    if (!country) return "";

    return `
      <div
        class="trips-modal-backdrop"
        data-country-sheet
        data-modal-open="true"
        role="presentation"
      >
        <section
          class="country-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="سجل ${escapeHTML(country.country)}"
        >
          <div class="country-sheet__hero">
            <div class="country-sheet__hero-top">
              <span class="country-sheet__flag">
                ${escapeHTML(country.flag)}
              </span>

              <button
                type="button"
                class="trips-modal__close"
                data-action="trips-close-country"
                aria-label="إغلاق"
              >
                ×
              </button>
            </div>

            <h3>${escapeHTML(country.country)}</h3>
            <p>
              ${
                country.cities.length
                  ? escapeHTML(country.cities.join("، "))
                  : "لم تُسجل المدن بعد"
              }
            </p>

            <div class="country-sheet__stats">
              <div>
                <small>الزيارات</small>
                <strong>${escapeHTML(country.visits)}</strong>
              </div>

              <div>
                <small>المدن</small>
                <strong>${escapeHTML(country.cities.length)}</strong>
              </div>

              <div>
                <small>الأيام</small>
                <strong>${escapeHTML(country.totalDays || 0)}</strong>
              </div>

              <div>
                <small>آخر زيارة</small>
                <strong>
                  ${
                    country.lastVisit
                      ? escapeHTML(country.lastVisit.getFullYear())
                      : "—"
                  }
                </strong>
              </div>
            </div>
          </div>

          <div class="country-sheet__body">
            <div class="country-sheet__title-row">
              <h4>رحلاتك داخل الدولة</h4>

              <button
                type="button"
                class="trips-btn trips-btn--secondary"
                data-action="trips-add-memory"
                style="min-height:40px;padding:0 12px"
              >
                ＋ إضافة رحلة
              </button>

              ${
                country.countryCode
                  ? `
                    <button
                      type="button"
                      class="trips-btn trips-btn--secondary"
                      data-action="trips-open-country-guide"
                      data-country-code="${escapeHTML(country.countryCode)}"
                      style="min-height:40px;padding:0 12px"
                    >
                      فتح دليل الدولة
                    </button>
                  `
                  : ""
              }
            </div>

            <div class="country-trip-list">
              ${country.trips
                .map((trip) => {
                  const year =
                    toDate(trip.startDate)?.getFullYear() ||
                    trip.travelYear ||
                    "—";

                  const location =
                    trip.city ||
                    trip.destination ||
                    country.country;

                  return `
                    <article class="country-trip-row">
                      <span class="country-trip-row__icon">
                        ${escapeHTML(
                          trip.emoji ||
                          trip.icon ||
                          country.flag ||
                          "✈"
                        )}
                      </span>

                      <div>
                        <h5>
                          ${escapeHTML(
                            trip.title ||
                            `رحلة ${country.country}`
                          )}
                        </h5>

                        <p>
                          ${escapeHTML(location)} ·
                          ${escapeHTML(year)}
                          ${
                            number(trip.rating) > 0
                              ? ` · ★ ${escapeHTML(trip.rating)}/5`
                              : ""
                          }
                        </p>
                      </div>

                      <button
                        type="button"
                        data-action="trips-open-country-trip"
                        data-trip-id="${escapeHTML(trip.id)}"
                      >
                        فتح
                      </button>
                    </article>
                  `;
                })
                .join("")}
            </div>
          </div>
        </section>
      </div>
    `;
  };

  const bindOverlayKeyboard = (overlay, closeHandler) => {
    if (!overlay) return;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeHandler();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    const cleanup = () =>
      document.removeEventListener("keydown", onKeyDown);

    overlay.__ticTripsCleanup = cleanup;
  };

  const showMemoryModal = (draft = {}) => {
    closeModal();
    closeCountrySheet();

    state.memoryDraft = clone(draft);
    state.isFormOpen = true;
    state.isUserInteracting = true;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderMemoryModal();

    const modal = wrapper.firstElementChild;
    if (!modal) return false;

    document.body.appendChild(modal);
    lockDocumentScroll();

    const form = modal.querySelector("[data-memory-form]");

    form?.addEventListener("submit", handleMemorySubmit);

    modal.addEventListener("click", (event) => {
      if (
        event.target === modal ||
        event.target.closest(
          '[data-action="trips-close-modal"]'
        )
      ) {
        closeModal();
      }
    });

    modal.addEventListener(
      "input",
      (event) => markInteraction("typing", event.target),
      true
    );

    bindOverlayKeyboard(modal, closeModal);

    window.requestAnimationFrame(() => {
      modal
        .querySelector('input[name="title"]')
        ?.focus({ preventScroll: true });
    });

    emit("passport-modal-opened", {
      mode: draft?.id ? "edit" : "create",
      tripId: draft?.id || null
    });

    return true;
  };

  const showCountrySheet = (countryKey) => {
    closeCountrySheet();

    const snapshot = buildSnapshot();
    const country = snapshot.countries.find(
      (item) => item.key === countryKey
    );

    if (!country) return false;

    state.activeCountryKey = countryKey;
    state.isFormOpen = true;
    state.isUserInteracting = true;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderCountrySheet(country);

    const sheet = wrapper.firstElementChild;
    if (!sheet) return false;

    document.body.appendChild(sheet);
    lockDocumentScroll();

    sheet.addEventListener("click", (event) => {
      if (
        event.target === sheet ||
        event.target.closest(
          '[data-action="trips-close-country"]'
        )
      ) {
        closeCountrySheet();
      }
    });

    bindOverlayKeyboard(sheet, closeCountrySheet);

    emit("passport-country-opened", {
      countryKey,
      countryCode: country.countryCode,
      country: country.country
    });

    return true;
  };

  const closeModal = () => {
    const modal =
      document.querySelector("[data-trips-modal]");

    modal?.__ticTripsCleanup?.();
    modal?.remove();

    state.memoryDraft = null;
    state.isFormOpen = Boolean(
      document.querySelector("[data-country-sheet]")
    );

    unlockDocumentScroll();

    emit("passport-modal-closed");
  };

  const closeCountrySheet = () => {
    const sheet =
      document.querySelector("[data-country-sheet]");

    sheet?.__ticTripsCleanup?.();
    sheet?.remove();

    state.activeCountryKey = null;
    state.isFormOpen = Boolean(
      document.querySelector("[data-trips-modal]")
    );

    unlockDocumentScroll();

    emit("passport-country-closed");
  };

  const handleMemorySubmit = async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const submitButton =
      form.querySelector('[type="submit"]');

    if (submitButton?.disabled) return false;

    const formData = new FormData(form);
    const title = text(formData.get("title"));
    const countryInput = text(
      formData.get("country")
    );

    if (!title || !countryInput) {
      getUI()?.toast?.(
        "أدخل اسم الرحلة والدولة.",
        "error"
      );

      form
        .querySelector(
          !title
            ? '[name="title"]'
            : '[name="country"]'
        )
        ?.focus();

      return false;
    }

    const countryRecord =
      resolveCountryRecord(countryInput);

    const countryCode =
      text(countryRecord?.code).toUpperCase();

    const normalizedCountryName =
      text(countryRecord?.nameAr) ||
      countryInput;

    const travelYear =
      number(formData.get("travelYear")) ||
      new Date().getFullYear();

    const rawStart =
      text(formData.get("startDate"));

    const rawEnd =
      text(formData.get("endDate"));

    const fallbackStart =
      `${travelYear}-01-01`;

    const resolvedStart =
      rawStart || fallbackStart;

    const resolvedEnd =
      rawEnd || rawStart || fallbackStart;

    const startDate = toDate(resolvedStart);
    const endDate = toDate(resolvedEnd);

    if (
      startDate &&
      endDate &&
      endDate < startDate
    ) {
      getUI()?.toast?.(
        "تاريخ النهاية يجب أن يكون بعد تاريخ البداية.",
        "error"
      );

      form
        .querySelector('[name="endDate"]')
        ?.focus();

      return false;
    }

    const now = new Date().toISOString();

    const cities = text(formData.get("cities"))
      .split(/[،,]/)
      .map((city) => text(city))
      .filter(Boolean);

    const existingId =
      state.memoryDraft?.id || null;

    const trip = normalizeTripRecord({
      ...(existingId
        ? clone(state.memoryDraft)
        : {}),
      id: existingId || createId("memory"),
      title,
      destination:
        [
          text(formData.get("city")),
          normalizedCountryName
        ]
          .filter(Boolean)
          .join("، "),
      country: normalizedCountryName,
      countryCode,
      guideCountryCode: countryCode,
      destinationCountry:
        normalizedCountryName,
      destinationCountryCode:
        countryCode,
      city: text(formData.get("city")),
      cities,
      countryFlag: countryFlag(
        normalizedCountryName,
        countryCode
      ),
      travelYear,
      startDate: resolvedStart,
      endDate: resolvedEnd,
      tripType:
        text(formData.get("tripType")) ||
        "family",
      travelCompanions: text(
        formData.get("travelCompanions")
      ),
      accommodation: text(
        formData.get("accommodation")
      ),
      rating: number(formData.get("rating")),
      bestMemory: text(
        formData.get("bestMemory")
      ),
      notes: text(formData.get("notes")),
      wouldVisitAgain:
        formData.get("wouldVisitAgain") ===
        "true",
      status: "completed",
      planningStatus: "completed",
      isMemory: true,
      memorySource: "manual-history",
      source: "passport",
      budget: number(
        state.memoryDraft?.budget
      ),
      spent: number(
        state.memoryDraft?.spent
      ),
      createdAt:
        state.memoryDraft?.createdAt ||
        now,
      updatedAt: now
    });

    try {
      if (submitButton) {
        submitButton.disabled = true;
      }

      state.isRefreshing = true;

      getUI()?.showLoader?.(
        existingId
          ? "جاري تحديث الرحلة..."
          : "جاري حفظ الرحلة السابقة..."
      );

      const savedTrip = existingId
        ? await updateTrip(existingId, trip)
        : await addTripToStore(trip);

      closeModal();

      state.activeTab = "upcoming";
      state.activeView = "hub";
      state.activeTripId = null;
      state.memoryDraft = null;

      requestDeferredRefresh(
        existingId
          ? "passport-trip-updated"
          : "passport-trip-created",
        {
          force: true,
          delay: 0
        }
      );

      getUI()?.toast?.(
        existingId
          ? "تم تحديث الرحلة داخل جواز السفر."
          : "تمت إضافة الرحلة إلى جواز السفر.",
        "success"
      );

      commitStoreMutation(
        existingId
          ? "passport-trip-updated"
          : "passport-trip-created",
        {
          tripId: savedTrip?.id || trip.id,
          trip: savedTrip || trip,
          country: trip.country,
          countryCode
        },
        {
          refresh: false
        }
      );

      return true;
    } catch (error) {
      console.error(
        "TIC Trips passport trip save error:",
        error
      );

      getUI()?.toast?.(
        "تعذر حفظ الرحلة.",
        "error"
      );

      return false;
    } finally {
      state.isRefreshing = false;

      if (submitButton?.isConnected) {
        submitButton.disabled = false;
      }

      getUI()?.hideLoader?.();
    }
  };

  /* =========================================================
     Bindings and actions
  ========================================================= */

  const readActionParams = (payload = {}) => {
    const event =
      payload.event ||
      payload.originalEvent ||
      null;

    const source =
      event?.target?.closest?.(
        [
          "[data-trip-id]",
          "[data-country-key]",
          "[data-country-code]"
        ].join(",")
      ) ||
      null;

    return {
      ...(payload.params || {}),
      tripId:
        payload.params?.tripId ||
        payload.params?.id ||
        source?.getAttribute("data-trip-id") ||
        null,
      countryKey:
        payload.params?.countryKey ||
        source?.getAttribute(
          "data-country-key"
        ) ||
        null,
      countryCode:
        payload.params?.countryCode ||
        source?.getAttribute(
          "data-country-code"
        ) ||
        null
    };
  };

  const applyInputBindings = () => {
    if (!state.container) return;

    state.container
      .querySelectorAll("[data-trips-tab]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            state.activeTab =
              button.getAttribute(
                "data-trips-tab"
              ) ||
              "upcoming";

            state.filters.search = "";
            state.filters.status = "all";
            state.filters.type = "all";

            refresh({
              reason: "tab-changed",
              force: true
            });
          },
          { once: true }
        );
      });

    state.container
      .querySelectorAll("[data-country-key]")
      .forEach((card) => {
        card.addEventListener(
          "keydown",
          (event) => {
            if (
              event.key === "Enter" ||
              event.key === " "
            ) {
              event.preventDefault();

              showCountrySheet(
                card.getAttribute(
                  "data-country-key"
                )
              );
            }
          },
          { once: true }
        );
      });

    const searchInput =
      state.container.querySelector(
        "[data-trips-search]"
      );

    searchInput?.addEventListener(
      "input",
      (event) => {
        state.filters.search =
          event.target.value;

        state.isTyping = true;
        markInteraction(
          "typing",
          event.target
        );

        refresh({
          preserveFocus: true,
          reason: "search-input",
          force: true
        });
      }
    );

    state.container
      .querySelector(
        "[data-trips-filter-status]"
      )
      ?.addEventListener(
        "change",
        (event) => {
          state.filters.status =
            event.target.value;

          refresh({
            reason: "status-filter",
            force: true
          });
        },
        { once: true }
      );

    state.container
      .querySelector(
        "[data-trips-filter-type]"
      )
      ?.addEventListener(
        "change",
        (event) => {
          state.filters.type =
            event.target.value;

          refresh({
            reason: "type-filter",
            force: true
          });
        },
        { once: true }
      );

    state.container
      .querySelector("[data-trips-sort]")
      ?.addEventListener(
        "change",
        (event) => {
          state.filters.sort =
            event.target.value;

          refresh({
            reason: "sort-changed",
            force: true
          });
        },
        { once: true }
      );
  };

  const refresh = (options = {}) => {
    if (
      !state.container ||
      !state.mounted ||
      state.destroyed
    ) {
      return false;
    }

    if (
      !options.force &&
      isInteractionLocked()
    ) {
      return requestDeferredRefresh(
        options.reason ||
        "refresh-during-interaction",
        {
          forceAfterWait: true
        }
      );
    }

    if (state.isRendering) {
      return requestDeferredRefresh(
        options.reason ||
        "refresh-during-render",
        {
          forceAfterWait: true
        }
      );
    }

    const activeElement =
      document.activeElement;

    const preserveSearch =
      options.preserveFocus === true &&
      activeElement?.matches?.(
        "[data-trips-search]"
      );

    const cursor =
      preserveSearch &&
      typeof activeElement.selectionStart ===
        "number"
        ? activeElement.selectionStart
        : null;

    const scrollX =
      window.scrollX ||
      document.documentElement.scrollLeft ||
      0;

    const scrollY =
      window.scrollY ||
      document.documentElement.scrollTop ||
      0;

    state.isRendering = true;

    try {
      const snapshot = buildSnapshot();
      const signature =
        state.lastSnapshotSignature;

      if (
        !options.force &&
        signature &&
        signature ===
          state.lastRenderedSignature
      ) {
        return false;
      }

      state.container.innerHTML =
        renderPage(snapshot);

      state.lastRenderedSignature =
        signature;

      applyInputBindings();

      if (preserveSearch) {
        const input =
          state.container.querySelector(
            "[data-trips-search]"
          );

        if (input) {
          input.focus({
            preventScroll: true
          });

          if (cursor !== null) {
            input.setSelectionRange(
              cursor,
              cursor
            );
          }
        }
      }

      if (
        options.preserveScroll !== false &&
        !options.scrollTop
      ) {
        window.scrollTo(scrollX, scrollY);
      }

      if (options.scrollTop === true) {
        window.scrollTo({
          top: 0,
          behavior:
            options.smooth === false
              ? "auto"
              : "smooth"
        });
      }

      emit("refreshed", {
        reason:
          options.reason ||
          state.lastRefreshReason ||
          "manual",
        view: state.activeView,
        tab: state.activeTab,
        tripCount:
          snapshot.filteredTrips.length,
        passportTripCount:
          snapshot.statistics.memories,
        countryCount:
          snapshot.statistics.countries,
        activeTripId:
          state.activeTripId,
        signature
      });

      return true;
    } finally {
      state.isRendering = false;
      state.isRefreshing = false;
    }
  };

  const scheduleSafeRefresh = (
    reason = "store-change"
  ) => {
    if (
      !state.mounted ||
      state.destroyed
    ) {
      return false;
    }

    return requestDeferredRefresh(
      reason,
      {
        forceAfterWait: true,
        delay: RENDER_IDLE_DELAY
      }
    );
  };

  const registerActions = () => {
    const ui = getUI();

    if (
      !ui ||
      typeof ui.registerAction !==
        "function"
    ) {
      return;
    }

    const register = (name, handler) => {
      if (ui.hasAction?.(name)) return;

      const unsubscribe =
        ui.registerAction(name, handler);

      if (
        typeof unsubscribe ===
        "function"
      ) {
        state.actionUnsubscribers.push(
          unsubscribe
        );
      }
    };

    register("trips-new", () => {
      const tripForm = getTripForm();

      state.isFormOpen = true;

      if (tripForm?.openCreate) {
        return tripForm.openCreate({
          source: PAGE_ID
        });
      }

      return getRouter()?.go?.(
        "trip-form",
        {
          params: {
            mode: "create"
          },
          source: "trips-new"
        }
      );
    });

    register(
      "trips-add-memory",
      () => showMemoryModal({})
    );

    register(
      "trips-open-country",
      (payload) => {
        const { countryKey } =
          readActionParams(payload);

        if (!countryKey) return false;

        return showCountrySheet(
          countryKey
        );
      }
    );

    register(
      "trips-open-country-guide",
      (payload) => {
        const { countryCode } =
          readActionParams(payload);

        if (!countryCode) return false;

        closeCountrySheet();

        const router = getRouter();

        notifyIntelligenceLayer(
          "country-guide-opened",
          {
            countryCode,
            source: "passport"
          }
        );

        if (
          typeof router?.go ===
          "function"
        ) {
          return router.go("guide", {
            params: {
              country: countryCode
            },
            query: {
              country: countryCode
            },
            source:
              "trips-passport-country"
          });
        }

        return false;
      }
    );

    register(
      "trips-close-country",
      () => {
        closeCountrySheet();
        return true;
      }
    );

    register(
      "trips-open-country-trip",
      (payload) => {
        const { tripId } =
          readActionParams(payload);

        if (
          !tripId ||
          !findTrip(tripId)
        ) {
          return false;
        }

        closeCountrySheet();

        state.activeTripId = tripId;
        state.activeView = "details";

        refresh({
          reason:
            "country-trip-opened",
          force: true,
          scrollTop: true
        });

        return true;
      }
    );

    register(
      "trips-close-modal",
      () => {
        closeModal();
        return true;
      }
    );

    register(
      "trips-toggle-filters",
      () => {
        state.filtersOpen =
          !state.filtersOpen;

        refresh({
          reason:
            "filters-toggled",
          force: true
        });

        return true;
      }
    );

    register(
      "trips-clear-filters",
      () => {
        state.filters = {
          search: "",
          status: "all",
          type: "all",
          sort: "start-asc"
        };

        refresh({
          reason:
            "filters-cleared",
          force: true
        });

        return true;
      }
    );

    register(
      "trips-view-details",
      (payload) => {
        const { tripId } =
          readActionParams(payload);

        if (
          !tripId ||
          !findTrip(tripId)
        ) {
          return false;
        }

        state.activeTripId = tripId;
        state.activeView = "details";

        refresh({
          reason:
            "trip-details-opened",
          force: true,
          scrollTop: true
        });

        notifyIntelligenceLayer(
          "trip-opened",
          {
            tripId
          }
        );

        return true;
      }
    );

    register(
      "trips-back-to-hub",
      () => {
        state.activeView = "hub";
        state.activeTripId = null;

        refresh({
          reason:
            "back-to-hub",
          force: true,
          scrollTop: true
        });

        return true;
      }
    );

    register(
      "trips-edit",
      (payload) => {
        const { tripId } =
          readActionParams(payload);

        if (!tripId) return false;

        const trip =
          findTrip(tripId);

        if (!trip) return false;

        if (isPassportTrip(trip)) {
          return showMemoryModal(trip);
        }

        const tripForm =
          getTripForm();

        state.isFormOpen = true;

        if (tripForm?.openEdit) {
          return tripForm.openEdit(
            tripId,
            {
              source: PAGE_ID
            }
          );
        }

        return getRouter()?.go?.(
          "trip-form",
          {
            params: {
              mode: "edit",
              tripId
            },
            source: "trips-edit"
          }
        );
      }
    );

    register(
      "trips-card-menu",
      async (payload) => {
        const { tripId } =
          readActionParams(payload);

        const trip =
          findTrip(tripId);

        if (!trip) {
          ui.toast?.(
            "تعذر العثور على الرحلة.",
            "error"
          );

          return false;
        }

        const choice =
          typeof ui.dialog ===
          "function"
            ? await ui.dialog({
                title:
                  "إجراءات الرحلة",
                message:
                  trip.title ||
                  trip.destination ||
                  "الرحلة",
                icon: "✈",
                actions: [
                  {
                    label: "إلغاء",
                    result: "cancel"
                  },
                  {
                    label: "تعديل",
                    result: "edit",
                    primary: true
                  },
                  {
                    label: "نسخ",
                    result: "duplicate"
                  },
                  {
                    label: "حذف",
                    result: "delete",
                    danger: true
                  }
                ]
              })
            : window.prompt(
                "اكتب: edit أو duplicate أو delete"
              );

        if (choice === "edit") {
          if (isPassportTrip(trip)) {
            return showMemoryModal(
              trip
            );
          }

          const tripForm =
            getTripForm();

          state.isFormOpen = true;

          if (tripForm?.openEdit) {
            return tripForm.openEdit(
              tripId,
              {
                source: PAGE_ID
              }
            );
          }

          return getRouter()?.go?.(
            "trip-form",
            {
              params: {
                mode: "edit",
                tripId
              },
              source:
                "trips-card-menu-edit"
            }
          );
        }

        if (
          choice === "duplicate"
        ) {
          const confirmed =
            typeof ui.confirm ===
            "function"
              ? await ui.confirm({
                  title:
                    "تكرار الرحلة",
                  message:
                    `سيتم إنشاء نسخة جديدة من "${
                      trip.title ||
                      trip.destination
                    }".`,
                  confirmLabel:
                    "إنشاء نسخة",
                  cancelLabel:
                    "إلغاء"
                })
              : window.confirm(
                  "هل تريد إنشاء نسخة من هذه الرحلة؟"
                );

          if (confirmed !== true) {
            return false;
          }

          try {
            state.isRefreshing = true;

            ui.showLoader?.(
              "جاري إنشاء نسخة..."
            );

            const duplicate =
              await duplicateTripInStore(
                tripId
              );

            state.activeView = "hub";
            state.activeTab =
              "upcoming";
            state.activeTripId = null;

            refresh({
              reason:
                "trip-duplicated",
              force: true
            });

            ui.toast?.(
              "تم إنشاء نسخة جديدة.",
              "success"
            );

            return duplicate;
          } finally {
            state.isRefreshing = false;
            ui.hideLoader?.();
          }
        }

        if (choice === "delete") {
          const confirmed =
            typeof ui.confirm ===
            "function"
              ? await ui.confirm({
                  title:
                    "حذف الرحلة",
                  message:
                    `سيتم حذف "${
                      trip.title ||
                      trip.destination
                    }" نهائياً.`,
                  confirmLabel: "حذف",
                  cancelLabel: "إلغاء",
                  danger: true
                })
              : window.confirm(
                  "هل تريد حذف هذه الرحلة نهائياً؟"
                );

          if (confirmed !== true) {
            return false;
          }

          try {
            state.isRefreshing = true;

            ui.showLoader?.(
              "جاري حذف الرحلة..."
            );

            await deleteTripFromStore(
              tripId
            );

            state.activeView = "hub";
            state.activeTripId = null;

            refresh({
              reason:
                "trip-deleted",
              force: true
            });

            ui.toast?.(
              "تم حذف الرحلة.",
              "success"
            );

            return true;
          } finally {
            state.isRefreshing = false;
            ui.hideLoader?.();
          }
        }

        return false;
      }
    );
  };

  const subscribeToStore = () => {
    const store = getStore();

    if (
      !store ||
      typeof store.subscribe !==
        "function" ||
      state.unsubscribeStore
    ) {
      return;
    }

    const handleStoreChange = (
      change = {}
    ) => {
      const source = text(
        change?.source ||
        change?.meta?.source ||
        change?.detail?.source
      ).toLowerCase();

      const reason =
        change?.reason ||
        change?.type ||
        change?.action?.type ||
        "store-change";

      if (
        source === PAGE_ID &&
        state.isRefreshing
      ) {
        return;
      }

      scheduleSafeRefresh(reason);
    };

    const unsubscribe =
      store.subscribe(
        handleStoreChange
      );

    if (
      typeof unsubscribe ===
      "function"
    ) {
      state.unsubscribeStore =
        unsubscribe;
    } else if (
      unsubscribe &&
      typeof unsubscribe.unsubscribe ===
        "function"
    ) {
      state.unsubscribeStore =
        () => unsubscribe.unsubscribe();
    } else {
      state.unsubscribeStore =
        () => {};
    }
  };


  /* =========================================================
     Planned Trips integration
  ========================================================= */

  const PLANNED_STYLE_ID =
    "tic-planned-trips-integration-styles";

  const PLANNED_SECTION_SELECTOR =
    "[data-planned-trips-section]";

  const plannedRuntime = {
    rendering: false,
    lastSignature: "",
    pendingActionIds: new Set()
  };

  const nonNegative = (value, fallback = 0) =>
    Math.max(0, number(value, fallback));

  const asArray = (value) =>
    Array.isArray(value) ? clone(value) : [];

  const notify = (message, tone = "info") => {
    const ui = getUI();

    if (typeof ui?.toast === "function") {
      try {
        return ui.toast(message, { tone });
      } catch (_) {
        return ui.toast(message, tone);
      }
    }

    if (typeof ui?.showToast === "function") {
      return ui.showToast(message, tone);
    }

    console.log(`[Trips:${tone}] ${message}`);
    return null;
  };

  const getPlannedTrips = () => {
    const store = getStore();

    try {
      if (
        typeof store?.getPlannedTrips ===
        "function"
      ) {
        return asArray(
          store.getPlannedTrips({
            includeArchived: false,
            includeConverted: false
          })
        ).filter(
          (trip) =>
            ![
              "archived",
              "cancelled",
              "converted"
            ].includes(
              text(trip.status).toLowerCase()
            )
        );
      }

      return asArray(
        getStoreState().plannedTrips
      ).filter(
        (trip) =>
          ![
            "archived",
            "cancelled",
            "converted"
          ].includes(
            text(trip.status).toLowerCase()
          )
      );
    } catch (error) {
      console.warn(
        "TIC Trips: failed to list planned trips.",
        error
      );

      return [];
    }
  };

  const findPlannedTrip = (plannedTripId) =>
    getPlannedTrips().find(
      (trip) =>
        String(trip.id) ===
        String(plannedTripId)
    ) || null;

  const calculateReadiness = (trip = {}) => {
    const checklist =
      isObject(trip.checklist)
        ? trip.checklist
        : {};

    const primary = [
      checklist.flightBooked === true,
      checklist.hotelBooked === true
    ];

    const secondary = [
      checklist.destinationApproved !== false,
      checklist.budgetApproved === true,
      checklist.insuranceReady === true,
      checklist.visaReady === true,
      checklist.documentsReady === true,
      checklist.activitiesPlanned === true,
      checklist.packingReady === true
    ];

    const allSteps = [
      ...primary,
      ...secondary
    ];

    const completed =
      allSteps.filter(Boolean).length;

    const total =
      allSteps.length;

    return {
      completed,
      total,
      percent: total
        ? Math.round(
            (completed / total) * 100
          )
        : 0,
      flightBooked:
        checklist.flightBooked === true,
      hotelBooked:
        checklist.hotelBooked === true,
      readyForPromotion:
        checklist.flightBooked === true &&
        checklist.hotelBooked === true
    };
  };

  const formatPlannedCurrency = (
    value,
    currencyCode = "AED"
  ) => {
    try {
      return new Intl.NumberFormat(
        "ar-AE",
        {
          style: "currency",
          currency:
            currencyCode || "AED",
          maximumFractionDigits: 0
        }
      ).format(number(value));
    } catch (_) {
      return `${Math.round(
        number(value)
      ).toLocaleString("ar-AE")} ${
        currencyCode || "AED"
      }`;
    }
  };

  const monthLabel = (month) => {
    const labels = [
      "",
      "يناير",
      "فبراير",
      "مارس",
      "أبريل",
      "مايو",
      "يونيو",
      "يوليو",
      "أغسطس",
      "سبتمبر",
      "أكتوبر",
      "نوفمبر",
      "ديسمبر"
    ];

    return (
      labels[number(month)] ||
      "التاريخ لاحقاً"
    );
  };

  const ensurePlannedTripsStyles = () => {
    if (
      document.getElementById(
        PLANNED_STYLE_ID
      )
    ) {
      return;
    }

    const style =
      document.createElement("style");

    style.id = PLANNED_STYLE_ID;

    style.textContent = `
      .planned-trips-section {
        display: grid;
        gap: 15px;
        padding: 20px;
        border: 1px solid #d7e1ee;
        border-radius: 29px;
        background:
          radial-gradient(circle at 100% 0%, rgba(76, 111, 255, .09), transparent 34%),
          linear-gradient(155deg, #ffffff 0%, #f5f7ff 100%);
        box-shadow: 0 18px 42px rgba(34, 56, 108, .07);
      }

      .planned-trips-section__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 13px;
      }

      .planned-trips-section__kicker {
        color: #5267c9;
        font-size: 10px;
        font-weight: 950;
        letter-spacing: .09em;
      }

      .planned-trips-section__head h2 {
        margin: 4px 0 0;
        color: #061b38;
        font-size: clamp(25px, 7vw, 33px);
      }

      .planned-trips-section__head p {
        margin: 5px 0 0;
        color: #75839b;
        font-size: 13px;
        line-height: 1.7;
      }

      .planned-trips-section__count {
        display: grid;
        place-items: center;
        min-width: 72px;
        min-height: 48px;
        padding: 0 12px;
        border: 1px solid #d8def7;
        border-radius: 16px;
        background: #fff;
        color: #5267c9;
        font-size: 12px;
        font-weight: 950;
      }

      .planned-trips-list {
        display: grid;
        gap: 13px;
      }

      .planned-trip-card {
        overflow: hidden;
        border: 1px solid #dce3f2;
        border-radius: 24px;
        background: #fff;
        box-shadow: 0 12px 30px rgba(34, 56, 108, .055);
      }

      .planned-trip-card__top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 17px;
        background:
          radial-gradient(circle at 100% 0%, rgba(98, 119, 255, .12), transparent 40%),
          #f8f9ff;
      }

      .planned-trip-card__chip {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        background: #e9edff;
        color: #485dbf;
        font-size: 10px;
        font-weight: 950;
      }

      .planned-trip-card__top h3 {
        margin: 8px 0 4px;
        color: #061b38;
        font-size: 21px;
      }

      .planned-trip-card__top p {
        margin: 0;
        color: #75839b;
        font-size: 12px;
      }

      .planned-trip-card__score {
        min-width: 57px;
        padding: 9px 8px;
        border-radius: 15px;
        background: #061b38;
        color: #fff;
        text-align: center;
      }

      .planned-trip-card__score strong,
      .planned-trip-card__score small {
        display: block;
      }

      .planned-trip-card__score strong {
        font-size: 17px;
      }

      .planned-trip-card__score small {
        margin-top: 2px;
        color: rgba(255,255,255,.68);
        font-size: 8px;
      }

      .planned-trip-card__body {
        display: grid;
        gap: 14px;
        padding: 17px;
      }

      .planned-trip-card__facts {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }

      .planned-trip-card__facts > div {
        padding: 11px 9px;
        border-radius: 15px;
        background: #f6f8fc;
        text-align: center;
      }

      .planned-trip-card__facts small,
      .planned-trip-card__facts strong {
        display: block;
      }

      .planned-trip-card__facts small {
        color: #75839b;
        font-size: 8px;
      }

      .planned-trip-card__facts strong {
        margin-top: 4px;
        color: #061b38;
        font-size: 11px;
      }

      .planned-trip-progress__head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 7px;
        color: #75839b;
        font-size: 11px;
      }

      .planned-trip-progress__track {
        height: 8px;
        overflow: hidden;
        border-radius: 999px;
        background: #e6eaf3;
      }

      .planned-trip-progress__track > span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #596fd0, #7d8cf4);
      }

      .planned-trip-checklist {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 9px;
      }

      .planned-trip-check {
        display: flex;
        align-items: center;
        gap: 9px;
        min-height: 47px;
        padding: 9px 11px;
        border: 1px solid #dce3f2;
        border-radius: 15px;
        background: #fff;
        color: #061b38;
        font: inherit;
        text-align: start;
        cursor: pointer;
      }

      .planned-trip-check:disabled,
      .planned-trip-btn:disabled {
        cursor: not-allowed;
        opacity: .58;
      }

      .planned-trip-check.is-complete {
        border-color: #bfe5d7;
        background: #effaf6;
        color: #0b7565;
      }

      .planned-trip-check__icon {
        display: grid;
        place-items: center;
        width: 27px;
        height: 27px;
        flex: 0 0 27px;
        border-radius: 9px;
        background: #eef1f8;
        font-size: 12px;
      }

      .planned-trip-check.is-complete .planned-trip-check__icon {
        background: #d7f1e7;
      }

      .planned-trip-check span:last-child {
        font-size: 11px;
        font-weight: 900;
      }

      .planned-trip-card__actions {
        display: grid;
        grid-template-columns: 1fr 1fr auto;
        gap: 8px;
      }

      .planned-trip-btn {
        min-height: 45px;
        padding: 0 11px;
        border-radius: 14px;
        font: inherit;
        font-size: 11px;
        font-weight: 950;
        cursor: pointer;
      }

      .planned-trip-btn--primary {
        border: 0;
        background: linear-gradient(135deg, #576dcc, #4054ae);
        color: #fff;
      }

      .planned-trip-btn--secondary {
        border: 1px solid #dce3f2;
        background: #fff;
        color: #061b38;
      }

      .planned-trip-btn--danger {
        width: 44px;
        border: 1px solid #f0d1d5;
        background: #fff7f8;
        color: #a33142;
      }

      .planned-trips-empty {
        padding: 29px 18px;
        border: 1px dashed #cfd7e8;
        border-radius: 22px;
        background: rgba(255,255,255,.78);
        text-align: center;
      }

      .planned-trips-empty__icon {
        font-size: 39px;
      }

      .planned-trips-empty h3 {
        margin: 11px 0 4px;
        color: #061b38;
        font-size: 21px;
      }

      .planned-trips-empty p {
        margin: 0;
        color: #75839b;
        font-size: 12px;
        line-height: 1.7;
      }

      @media (max-width: 520px) {
        .planned-trips-section {
          padding: 17px;
        }

        .planned-trips-section__head {
          align-items: stretch;
          flex-direction: column;
        }

        .planned-trips-section__count {
          align-self: flex-start;
          min-height: 39px;
        }

        .planned-trip-card__facts {
          grid-template-columns: 1fr;
        }

        .planned-trip-checklist {
          grid-template-columns: 1fr;
        }

        .planned-trip-card__actions {
          grid-template-columns: 1fr 1fr;
        }

        .planned-trip-btn--danger {
          width: auto;
          grid-column: 1 / -1;
        }
      }
    `;

    document.head.appendChild(style);
  };

  const renderPlannedTripCard = (trip) => {
    const readiness =
      calculateReadiness(trip);

    const storeState =
      getStoreState();

    const currencyCode =
      trip.currency ||
      storeState.profile?.currency ||
      "AED";

    const title =
      trip.title ||
      `رحلة ${
        trip.city ||
        trip.country ||
        "مخطط لها"
      }`;

    const location = [
      trip.city,
      trip.country
    ]
      .filter(Boolean)
      .join("، ");

    const budget =
      nonNegative(
        trip.estimatedBudget ??
        trip.budget ??
        trip.totalCost
      );

    const month =
      trip.startDate
        ? text(trip.startDate).slice(0, 10)
        : monthLabel(
            trip.suggestedMonth
          );

    const pending =
      plannedRuntime.pendingActionIds.has(
        String(trip.id)
      );

    return `
      <article
        class="planned-trip-card"
        data-planned-trip-id="${escapeHTML(trip.id)}"
      >
        <div class="planned-trip-card__top">
          <div>
            <span class="planned-trip-card__chip">
              PLANNED JOURNEY
            </span>

            <h3>${escapeHTML(title)}</h3>

            <p>
              ${escapeHTML(
                location ||
                "الوجهة محددة من الاقتراح الذكي"
              )}
            </p>
          </div>

          <div class="planned-trip-card__score">
            <strong>${readiness.percent}%</strong>
            <small>جاهزية</small>
          </div>
        </div>

        <div class="planned-trip-card__body">
          <div class="planned-trip-card__facts">
            <div>
              <small>الميزانية المتوقعة</small>
              <strong>
                ${escapeHTML(
                  formatPlannedCurrency(
                    budget,
                    currencyCode
                  )
                )}
              </strong>
            </div>

            <div>
              <small>المدة</small>
              <strong>
                ${number(
                  trip.durationDays,
                  5
                )} أيام
              </strong>
            </div>

            <div>
              <small>التوقيت المقترح</small>
              <strong>
                ${escapeHTML(month)}
              </strong>
            </div>
          </div>

          <div class="planned-trip-progress">
            <div class="planned-trip-progress__head">
              <span>تقدم التجهيز</span>
              <strong>
                ${readiness.completed}
                من
                ${readiness.total}
              </strong>
            </div>

            <div
              class="planned-trip-progress__track"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow="${readiness.percent}"
            >
              <span
                style="width:${readiness.percent}%"
              ></span>
            </div>
          </div>

          <div class="planned-trip-checklist">
            <button
              type="button"
              class="planned-trip-check ${
                readiness.flightBooked
                  ? "is-complete"
                  : ""
              }"
              data-planned-action="toggle-check"
              data-planned-trip-id="${escapeHTML(trip.id)}"
              data-check-key="flightBooked"
              aria-pressed="${
                readiness.flightBooked
                  ? "true"
                  : "false"
              }"
              ${pending ? "disabled" : ""}
            >
              <span class="planned-trip-check__icon">
                ${
                  readiness.flightBooked
                    ? "✓"
                    : "✈"
                }
              </span>

              <span>
                ${
                  readiness.flightBooked
                    ? "تم شراء التذكرة"
                    : "علّم عند شراء التذكرة"
                }
              </span>
            </button>

            <button
              type="button"
              class="planned-trip-check ${
                readiness.hotelBooked
                  ? "is-complete"
                  : ""
              }"
              data-planned-action="toggle-check"
              data-planned-trip-id="${escapeHTML(trip.id)}"
              data-check-key="hotelBooked"
              aria-pressed="${
                readiness.hotelBooked
                  ? "true"
                  : "false"
              }"
              ${pending ? "disabled" : ""}
            >
              <span class="planned-trip-check__icon">
                ${
                  readiness.hotelBooked
                    ? "✓"
                    : "⌂"
                }
              </span>

              <span>
                ${
                  readiness.hotelBooked
                    ? "تم حجز الفندق"
                    : "علّم عند حجز الفندق"
                }
              </span>
            </button>
          </div>

          <div class="planned-trip-card__actions">
            <button
              type="button"
              class="planned-trip-btn planned-trip-btn--primary"
              data-planned-action="open-guide"
              data-country-code="${escapeHTML(
                trip.countryCode ||
                trip.guideCountryCode ||
                ""
              )}"
              ${pending ? "disabled" : ""}
            >
              دليل الوجهة
            </button>

            <button
              type="button"
              class="planned-trip-btn planned-trip-btn--secondary"
              data-planned-action="promote"
              data-planned-trip-id="${escapeHTML(trip.id)}"
              ${
                readiness.readyForPromotion &&
                !pending
                  ? ""
                  : "disabled"
              }
            >
              ${
                readiness.readyForPromotion
                  ? "تحويل إلى رحلة جاهزة"
                  : "أكمل التذكرة والفندق"
              }
            </button>

            <button
              type="button"
              class="planned-trip-btn planned-trip-btn--danger"
              data-planned-action="delete"
              data-planned-trip-id="${escapeHTML(trip.id)}"
              aria-label="حذف الرحلة المخطط لها"
              ${pending ? "disabled" : ""}
            >
              ×
            </button>
          </div>
        </div>
      </article>
    `;
  };

  const renderPlannedTripsSection = (
    plannedTrips
  ) => `
    <section
      class="planned-trips-section"
      data-planned-trips-section
      data-integration-version="${PAGE_VERSION}"
    >
      <div class="planned-trips-section__head">
        <div>
          <span class="planned-trips-section__kicker">
            PLANNED TRIPS
          </span>

          <h2>الرحلات المخطط لها</h2>

          <p>
            أفكار رحلات وافقت عليها، وتتحول تلقائياً إلى رحلة جاهزة
            بعد شراء التذكرة وحجز الفندق.
          </p>
        </div>

        <span class="planned-trips-section__count">
          ${plannedTrips.length} مخططة
        </span>
      </div>

      ${
        plannedTrips.length
          ? `
            <div class="planned-trips-list">
              ${plannedTrips
                .map(renderPlannedTripCard)
                .join("")}
            </div>
          `
          : `
            <div class="planned-trips-empty">
              <div class="planned-trips-empty__icon">
                🧭
              </div>

              <h3>لا توجد رحلات مخطط لها</h3>

              <p>
                أضف اقتراحاً من مستشار السفر في صفحة الميزانية،
                وسيظهر هنا مع خطوات التجهيز.
              </p>
            </div>
          `
      }
    </section>
  `;

  const buildPlannedTripsSignature = (
    plannedTrips
  ) =>
    createSignature(
      plannedTrips.map((trip) => ({
        id: trip.id,
        status: trip.status,
        updatedAt: trip.updatedAt,
        convertedTripId:
          trip.convertedTripId,
        checklist:
          trip.checklist,
        budget:
          trip.estimatedBudget ??
          trip.budget,
        startDate:
          trip.startDate,
        suggestedMonth:
          trip.suggestedMonth
      }))
    );

  const injectPlannedTrips = (
    force = false
  ) => {
    if (
      plannedRuntime.rendering ||
      !state.container ||
      !state.mounted ||
      state.activeView === "details"
    ) {
      return false;
    }

    const page =
      state.container.querySelector(
        '[data-page="trips"]'
      );

    if (!page) return false;

    const target =
      page.querySelector(
        ".trips-zone--journeys"
      ) ||
      page.querySelector(
        ".trips-passport-divider"
      );

    if (!target) return false;

    const plannedTrips =
      getPlannedTrips();

    const signature =
      buildPlannedTripsSignature(
        plannedTrips
      );

    if (
      !force &&
      signature ===
        plannedRuntime.lastSignature &&
      page.querySelector(
        PLANNED_SECTION_SELECTOR
      )
    ) {
      return false;
    }

    plannedRuntime.rendering = true;

    try {
      page
        .querySelector(
          PLANNED_SECTION_SELECTOR
        )
        ?.remove();

      target.insertAdjacentHTML(
        "beforebegin",
        renderPlannedTripsSection(
          plannedTrips
        )
      );

      plannedRuntime.lastSignature =
        signature;

      return true;
    } finally {
      plannedRuntime.rendering = false;
    }
  };

  const withPlannedActionLock = async (
    plannedTripId,
    operation
  ) => {
    const key =
      String(plannedTripId);

    if (
      plannedRuntime.pendingActionIds.has(
        key
      )
    ) {
      return false;
    }

    plannedRuntime.pendingActionIds.add(
      key
    );

    injectPlannedTrips(true);

    try {
      return await operation();
    } finally {
      plannedRuntime.pendingActionIds.delete(
        key
      );

      plannedRuntime.lastSignature = "";

      requestDeferredRefresh(
        "planned-trip-action-complete",
        {
          force: true,
          delay: 0
        }
      );
    }
  };

  const updateChecklist = async (
    plannedTripId,
    checkKey
  ) =>
    withPlannedActionLock(
      plannedTripId,
      async () => {
        const store = getStore();
        const trip =
          findPlannedTrip(
            plannedTripId
          );

        if (!store || !trip) {
          notify(
            "تعذر العثور على الرحلة المخطط لها.",
            "danger"
          );

          return false;
        }

        const allowedKeys = [
          "flightBooked",
          "hotelBooked"
        ];

        if (
          !allowedKeys.includes(
            checkKey
          )
        ) {
          return false;
        }

        const currentValue =
          trip.checklist?.[checkKey] ===
          true;

        const changes = {
          [checkKey]: !currentValue
        };

        try {
          let updated = null;

          if (
            typeof store
              .updatePlannedTripChecklist ===
            "function"
          ) {
            updated =
              await store
                .updatePlannedTripChecklist(
                  plannedTripId,
                  changes,
                  {
                    autoPromote: false,
                    source: PAGE_ID,
                    immediate: true
                  }
                );
          } else if (
            typeof store
              .updatePlannedTrip ===
            "function"
          ) {
            updated =
              await store
                .updatePlannedTrip(
                  plannedTripId,
                  {
                    checklist: {
                      ...(trip.checklist ||
                        {}),
                      ...changes
                    },
                    updatedAt:
                      new Date()
                        .toISOString()
                  },
                  {
                    source: PAGE_ID,
                    immediate: true
                  }
                );
          }

          if (!updated) {
            notify(
              "تعذر تحديث التجهيز. تأكد من Store V2.5.0.",
              "danger"
            );

            return false;
          }

          const finalTrip =
            isObject(updated)
              ? updated
              : {
                  ...trip,
                  checklist: {
                    ...(trip.checklist ||
                      {}),
                    ...changes
                  }
                };

          const readiness =
            calculateReadiness(
              finalTrip
            );

          notify(
            !currentValue
              ? "تم تحديث خطوة التجهيز."
              : "تم إلغاء علامة التجهيز.",
            "success"
          );

          commitStoreMutation(
            "planned-trip-checklist-updated",
            {
              plannedTripId,
              checkKey,
              value: !currentValue,
              readiness
            },
            {
              refresh: false
            }
          );

          if (
            readiness.readyForPromotion
          ) {
            return promotePlannedTrip(
              plannedTripId,
              true,
              {
                skipLock: true
              }
            );
          }

          return true;
        } catch (error) {
          console.error(
            "TIC Trips planned checklist update failed.",
            error
          );

          notify(
            error?.message ||
            "تعذر تحديث خطوة التجهيز.",
            "danger"
          );

          return false;
        }
      }
    );

  const fallbackPromotePlannedTrip =
    async (store, trip) => {
      const now =
        new Date().toISOString();

      const countryCode =
        resolveCountryCode(trip);

      const readyTrip =
        normalizeTripRecord({
          ...clone(trip),
          id:
            trip.convertedTripId ||
            createId("trip"),
          plannedTripId:
            trip.id,
          status: "ready",
          planningStatus: "ready",
          countryCode,
          guideCountryCode:
            countryCode,
          isMemory: false,
          memorySource: "",
          createdAt:
            trip.createdAt || now,
          updatedAt: now
        });

      const existingReady =
        getTrips().find(
          (item) =>
            String(
              item.plannedTripId
            ) === String(trip.id)
        );

      const savedTrip =
        existingReady ||
        await addTripToStore(
          readyTrip
        );

      if (
        typeof store
          .updatePlannedTrip ===
        "function"
      ) {
        await store.updatePlannedTrip(
          trip.id,
          {
            status: "converted",
            planningStatus:
              "converted",
            convertedTripId:
              savedTrip.id,
            convertedAt: now,
            updatedAt: now
          },
          {
            source: PAGE_ID,
            immediate: true
          }
        );
      }

      return savedTrip;
    };

  const promotePlannedTrip = async (
    plannedTripId,
    automatic = false,
    options = {}
  ) => {
    const operation = async () => {
      const store = getStore();
      const trip =
        findPlannedTrip(
          plannedTripId
        );

      if (!store || !trip) {
        notify(
          "تعذر العثور على الرحلة المخطط لها.",
          "danger"
        );

        return false;
      }

      const readiness =
        calculateReadiness(trip);

      if (
        !readiness.readyForPromotion
      ) {
        notify(
          "يجب شراء التذكرة وحجز الفندق أولاً.",
          "warning"
        );

        return false;
      }

      try {
        let result = null;

        if (
          typeof store
            .promotePlannedTripToReady ===
          "function"
        ) {
          result =
            await store
              .promotePlannedTripToReady(
                plannedTripId,
                {
                  automatic,
                  source: PAGE_ID,
                  immediate: true,
                  preventDuplicate: true
                }
              );
        } else if (
          typeof store
            .convertPlannedTripToTrip ===
          "function"
        ) {
          result =
            await store
              .convertPlannedTripToTrip(
                plannedTripId,
                {
                  status: "ready",
                  planningStatus:
                    "ready",
                  automatic,
                  source: PAGE_ID,
                  preventDuplicate: true
                }
              );
        } else {
          result =
            await fallbackPromotePlannedTrip(
              store,
              trip
            );
        }

        if (!result) {
          notify(
            "تعذر تحويل الرحلة. تأكد من Store V2.5.0.",
            "danger"
          );

          return false;
        }

        notify(
          automatic
            ? "اكتمل الحجز وتحولت الرحلة تلقائياً إلى رحلة جاهزة."
            : "تم تحويل الرحلة إلى رحلة جاهزة.",
          "success"
        );

        commitStoreMutation(
          "planned-trip-promoted",
          {
            plannedTripId,
            result: clone(result),
            automatic
          },
          {
            refresh: false
          }
        );

        state.activeView = "hub";
        state.activeTab =
          "upcoming";
        state.activeTripId = null;

        return result;
      } catch (error) {
        console.error(
          "TIC Trips planned promotion failed.",
          error
        );

        notify(
          error?.message ||
          "تعذر تحويل الرحلة إلى جاهزة.",
          "danger"
        );

        return false;
      }
    };

    if (options.skipLock) {
      return operation();
    }

    return withPlannedActionLock(
      plannedTripId,
      operation
    );
  };

  const deletePlannedTrip = async (
    plannedTripId
  ) => {
    const store = getStore();
    const trip =
      findPlannedTrip(
        plannedTripId
      );

    if (!store || !trip) {
      notify(
        "تعذر العثور على الرحلة.",
        "danger"
      );

      return false;
    }

    const confirmed =
      typeof getUI()?.confirm ===
      "function"
        ? await getUI().confirm({
            title:
              "حذف الرحلة المخطط لها",
            message:
              `سيتم حذف "${
                trip.title ||
                trip.city ||
                trip.country ||
                "الرحلة"
              }" من خططك.`,
            confirmLabel: "حذف",
            cancelLabel: "إلغاء",
            danger: true
          })
        : window.confirm(
            "هل تريد حذف هذه الرحلة المخطط لها؟"
          );

    if (confirmed !== true) {
      return false;
    }

    return withPlannedActionLock(
      plannedTripId,
      async () => {
        try {
          let result = null;

          if (
            typeof store
              .deletePlannedTrip ===
            "function"
          ) {
            result =
              await store
                .deletePlannedTrip(
                  plannedTripId,
                  {
                    source: PAGE_ID,
                    immediate: true
                  }
                );
          } else if (
            typeof store
              .removePlannedTrip ===
            "function"
          ) {
            result =
              await store
                .removePlannedTrip(
                  plannedTripId,
                  {
                    source: PAGE_ID,
                    immediate: true
                  }
                );
          } else if (
            typeof store.set ===
            "function"
          ) {
            const plannedTrips =
              getPlannedTrips().filter(
                (item) =>
                  String(item.id) !==
                  String(
                    plannedTripId
                  )
              );

            store.set(
              "plannedTrips",
              plannedTrips,
              {
                source: PAGE_ID,
                immediate: true
              }
            );

            result = true;
          }

          if (
            result === false ||
            result === null
          ) {
            notify(
              "تعذر حذف الرحلة المخطط لها.",
              "danger"
            );

            return false;
          }

          notify(
            "تم حذف الرحلة المخطط لها.",
            "success"
          );

          commitStoreMutation(
            "planned-trip-deleted",
            {
              plannedTripId,
              trip
            },
            {
              refresh: false
            }
          );

          return true;
        } catch (error) {
          console.error(
            "TIC Trips planned deletion failed.",
            error
          );

          notify(
            error?.message ||
            "تعذر حذف الرحلة.",
            "danger"
          );

          return false;
        }
      }
    );
  };

  const openPlannedGuide = (
    countryCode
  ) => {
    const router =
      getRouter();

    notifyIntelligenceLayer(
      "planned-trip-guide-opened",
      {
        countryCode:
          countryCode || null
      }
    );

    if (
      typeof router?.go ===
      "function"
    ) {
      router.go("guide", {
        params: {
          country:
            countryCode || ""
        },
        query: {
          country:
            countryCode || ""
        },
        source:
          "planned-trips"
      });

      return true;
    }

    window.location.hash =
      countryCode
        ? `#guide?country=${encodeURIComponent(
            countryCode
          )}`
        : "#guide";

    return true;
  };

  const handlePlannedTripsClick = (
    event
  ) => {
    const target =
      event.target.closest(
        "[data-planned-action]"
      );

    if (
      !target ||
      !state.container?.contains(
        target
      )
    ) {
      return;
    }

    event.preventDefault();

    if (target.disabled) return;

    const action =
      target.dataset.plannedAction;

    if (
      action === "toggle-check"
    ) {
      updateChecklist(
        target.dataset
          .plannedTripId,
        target.dataset.checkKey
      );

      return;
    }

    if (action === "promote") {
      promotePlannedTrip(
        target.dataset
          .plannedTripId,
        false
      );

      return;
    }

    if (action === "delete") {
      deletePlannedTrip(
        target.dataset
          .plannedTripId
      );

      return;
    }

    if (action === "open-guide") {
      openPlannedGuide(
        target.dataset
          .countryCode || ""
      );
    }
  };

  const bindPlannedTripsEvents = () => {
    if (
      !state.container ||
      state.plannedTripsClickBound
    ) {
      return;
    }

    state.container.addEventListener(
      "click",
      handlePlannedTripsClick
    );

    state.plannedTripsClickBound =
      true;
  };

  const unbindPlannedTripsEvents = () => {
    if (
      !state.container ||
      !state.plannedTripsClickBound
    ) {
      return;
    }

    state.container.removeEventListener(
      "click",
      handlePlannedTripsClick
    );

    state.plannedTripsClickBound =
      false;
  };

  const cancelDeferredRefresh = () => {
    clearTimer("refreshTimer");
    clearTimer("renderTimer");
    clearTimer("interactionTimer");
    clearTimer("scrollTimer");

    state.refreshQueued = false;
    state.refreshRequestedAt = 0;
    state.pendingRefreshReason = "";
    state.lastRefreshReason = "";
    state.isRefreshing = false;
    state.isRendering = false;

    return true;
  };
  
  /* =========================================================
     Public page API
  ========================================================= */

  const TripsPage = {
    id: PAGE_ID,
    title: "رحلاتي",
    icon: "✈",
    version: PAGE_VERSION,

    init() {
      if (state.initialized) {
        return this.diagnostics();
      }

      ensureStyles();
      ensurePlannedTripsStyles();
      registerActions();
      subscribeToStore();
      registerIntegrationListeners();

      state.initialized = true;
      state.destroyed = false;

      emit("initialized", {
        version: PAGE_VERSION
      });

      notifyIntelligenceLayer(
        "trips-page-initialized",
        {
          version: PAGE_VERSION
        }
      );

      return this.diagnostics();
    },

    render(context = {}) {
      this.init();

      const params =
        context.params || {};

      if (params.tripId) {
        state.activeTripId =
          params.tripId;
      }

      state.activeView =
        params.view === "details" &&
        params.tripId
          ? "details"
          : "hub";

      if (
        params.tab &&
        TAB_LABELS[params.tab]
      ) {
        state.activeTab =
          params.tab;
      }

      return renderPage(
        buildSnapshot()
      );
    },

    mount(context = {}) {
      this.init();

      const container =
        resolveContainer(
          context.container
        );

      if (!container) {
        throw new Error(
          "TIC Trips Error: route container not found."
        );
      }

      const params =
        context.params || {};

      state.activeView =
        params.view === "details" &&
        params.tripId
          ? "details"
          : "hub";

      state.activeTripId =
        params.tripId || null;

      if (
        params.tab &&
        TAB_LABELS[params.tab]
      ) {
        state.activeTab =
          params.tab;
      }

      if (
        state.container &&
        state.container !== container
      ) {
        unbindPlannedTripsEvents();
      }

      state.container =
        container;

      state.mounted = true;
      state.destroyed = false;

      const snapshot =
        buildSnapshot();

      container.innerHTML =
        renderPage(snapshot);

      state.lastRenderedSignature =
        state.lastSnapshotSignature;

      applyInputBindings();
      bindPlannedTripsEvents();
      injectPlannedTrips(true);

      emit("mounted", {
        view: state.activeView,
        tab: state.activeTab,
        activeTripId:
          state.activeTripId,
        tripCount:
          snapshot.trips.length,
        plannedTripCount:
          getPlannedTrips().length,
        passportTripCount:
          snapshot.statistics.memories
      });

      notifyIntelligenceLayer(
        "trips-page-mounted",
        {
          view: state.activeView,
          tab: state.activeTab,
          tripCount:
            snapshot.trips.length,
          plannedTripCount:
            getPlannedTrips().length
        }
      );

      return container;
    },

    afterEnter(context = {}) {
      const container =
        resolveContainer(
          context.container
        );

      if (container) {
        if (
          state.container &&
          state.container !== container
        ) {
          unbindPlannedTripsEvents();
        }

        state.container =
          container;

        state.mounted = true;
      }

      applyInputBindings();
      bindPlannedTripsEvents();
      injectPlannedTrips(true);

      return true;
    },

    unmount() {
      closeModal();
      closeCountrySheet();
      cancelDeferredRefresh();

      unbindPlannedTripsEvents();

      const previousContainer =
        state.container;

      state.mounted = false;
      state.container = null;
      state.isUserInteracting = false;
      state.isScrolling = false;
      state.isTyping = false;
      state.isFormOpen = false;

      emit("unmounted", {
        view: state.activeView,
        tab: state.activeTab,
        activeTripId:
          state.activeTripId
      });

      if (
        previousContainer &&
        previousContainer.isConnected
      ) {
        previousContainer
          .querySelector(
            PLANNED_SECTION_SELECTOR
          )
          ?.remove();
      }

      return true;
    },

    refresh(options = {}) {
      const result =
        refresh(options);

      if (
        result !== false &&
        state.activeView !== "details"
      ) {
        bindPlannedTripsEvents();
        injectPlannedTrips(true);
      }

      return result;
    },

    openTrip(tripId) {
      if (!findTrip(tripId)) {
        return false;
      }

      state.activeTripId =
        tripId;

      state.activeView =
        "details";

      return this.refresh({
        reason: "api-open-trip",
        force: true,
        scrollTop: true
      });
    },

    openHub(tab = "upcoming") {
      state.activeTripId = null;
      state.activeView = "hub";

      if (TAB_LABELS[tab]) {
        state.activeTab = tab;
      }

      return this.refresh({
        reason: "api-open-hub",
        force: true
      });
    },

    openList() {
      return this.openHub("all");
    },

    openMemories() {
      return this.openCountries();
    },

    openCountries() {
      state.activeView = "hub";
      state.activeTab =
        "upcoming";

      const result =
        this.refresh({
          reason:
            "api-open-countries",
          force: true
        });

      window.requestAnimationFrame(
        () => {
          state.container
            ?.querySelector(
              ".passport-section"
            )
            ?.scrollIntoView({
              behavior: "smooth",
              block: "start"
            });
        }
      );

      return result;
    },

    openCountry(countryKey) {
      const normalized =
        normalizeCountryKey(
          countryKey
        );

      const country =
        buildSnapshot()
          .countries
          .find(
            (item) =>
              item.key === normalized ||
              item.countryCode ===
                text(
                  countryKey
                ).toUpperCase()
          );

      return country
        ? showCountrySheet(
            country.key
          )
        : false;
    },

    openPlannedTrips() {
      state.activeView = "hub";
      state.activeTab =
        "upcoming";

      const result =
        this.refresh({
          reason:
            "api-open-planned-trips",
          force: true
        });

      window.requestAnimationFrame(
        () => {
          state.container
            ?.querySelector(
              PLANNED_SECTION_SELECTOR
            )
            ?.scrollIntoView({
              behavior: "smooth",
              block: "start"
            });
        }
      );

      return result;
    },

    addPastTrip() {
      return showMemoryModal({});
    },

    setFilters(filters = {}) {
      state.filters = {
        ...state.filters,
        ...clone(filters)
      };

      this.refresh({
        reason: "api-set-filters",
        force: true
      });

      return clone(
        state.filters
      );
    },

    getFilters() {
      return clone(
        state.filters
      );
    },

    getSnapshot() {
      return clone(
        state.lastSnapshot ||
        buildSnapshot()
      );
    },

    getPlannedTrips() {
      return clone(
        getPlannedTrips()
      );
    },

    updatePlannedTripChecklist(
      plannedTripId,
      checkKey
    ) {
      return updateChecklist(
        plannedTripId,
        checkKey
      );
    },

    promotePlannedTrip(
      plannedTripId
    ) {
      return promotePlannedTrip(
        plannedTripId,
        false
      );
    },

    deletePlannedTrip(
      plannedTripId
    ) {
      return deletePlannedTrip(
        plannedTripId
      );
    },

    subscribe(listener) {
      if (
        typeof listener !==
        "function"
      ) {
        throw new TypeError(
          "TIC Trips subscriber must be a function."
        );
      }

      state.subscribers.add(
        listener
      );

      return () =>
        state.subscribers.delete(
          listener
        );
    },

    destroy() {
      this.unmount();

      if (
        typeof state.unsubscribeStore ===
        "function"
      ) {
        state.unsubscribeStore();
      }

      state.actionUnsubscribers.forEach(
        (unsubscribe) => {
          try {
            unsubscribe?.();
          } catch (_) {
            // Ignore cleanup errors.
          }
        }
      );

      state.integrationUnsubscribers
        ?.forEach(
          (unsubscribe) => {
            try {
              unsubscribe?.();
            } catch (_) {
              // Ignore cleanup errors.
            }
          }
        );

      document
        .getElementById(STYLE_ID)
        ?.remove();

      document
        .getElementById(
          PLANNED_STYLE_ID
        )
        ?.remove();

      state.unsubscribeStore =
        null;

      state.actionUnsubscribers =
        [];

      state.integrationUnsubscribers =
        [];

      state.subscribers.clear();
      state.lastSnapshot = null;
      state.lastSnapshotSignature =
        "";

      state.lastRenderedSignature =
        "";

      state.activeView = "hub";
      state.activeTab =
        "upcoming";

      state.activeTripId = null;
      state.activeCountryKey =
        null;

      state.initialized = false;
      state.destroyed = true;

      plannedRuntime.lastSignature =
        "";

      plannedRuntime
        .pendingActionIds
        .clear();

      return true;
    },

    diagnostics() {
      return {
        id: this.id,
        title: this.title,
        version: this.version,
        initialized:
          state.initialized,
        mounted: state.mounted,
        destroyed:
          state.destroyed,
        activeView:
          state.activeView,
        activeTab:
          state.activeTab,
        activeTripId:
          state.activeTripId,
        activeCountryKey:
          state.activeCountryKey,
        filters: clone(
          state.filters
        ),
        filtersOpen:
          state.filtersOpen,
        hasContainer:
          Boolean(
            state.container
          ),
        isRendering:
          Boolean(
            state.isRendering
          ),
        isRefreshing:
          Boolean(
            state.isRefreshing
          ),
        isUserInteracting:
          Boolean(
            state.isUserInteracting
          ),
        isScrolling:
          Boolean(
            state.isScrolling
          ),
        isTyping:
          Boolean(
            state.isTyping
          ),
        isFormOpen:
          Boolean(
            state.isFormOpen
          ),
        refreshQueued:
          Boolean(
            state.refreshQueued
          ),
        storeAvailable:
          Boolean(getStore()),
        routerAvailable:
          Boolean(getRouter()),
        uiAvailable:
          Boolean(getUI()),
        tripFormAvailable:
          Boolean(
            getTripForm()
          ),
        guideEngineAvailable:
          Boolean(
            getGuideEngine()
          ),
        worldGuideDataAvailable:
          Boolean(
            getWorldGuideData()
          ),
        travelBrainAvailable:
          Boolean(
            getTravelBrain?.()
          ),
        travelAssistantAvailable:
          Boolean(
            getTravelAssistant?.()
          ),
        travelImportAvailable:
          Boolean(
            getTravelImport?.()
          ),
        travelSyncAvailable:
          Boolean(
            getTravelSync?.()
          ),
        actionCount:
          state.actionUnsubscribers
            .length,
        integrationBindingCount:
          state
            .integrationUnsubscribers
            ?.length || 0,
        subscriberCount:
          state.subscribers.size,
        hasSnapshot:
          Boolean(
            state.lastSnapshot
          ),
        snapshotSignature:
          state.lastSnapshotSignature,
        renderedSignature:
          state.lastRenderedSignature,
        plannedTrips: {
          count:
            getPlannedTrips().length,
          sectionInjected:
            Boolean(
              state.container
                ?.querySelector(
                  PLANNED_SECTION_SELECTOR
                )
            ),
          lastSignature:
            plannedRuntime.lastSignature,
          pendingActionCount:
            plannedRuntime
              .pendingActionIds
              .size
        }
      };
    }
  };

  window.TIC =
    window.TIC || {};

  window.TIC.Pages =
    window.TIC.Pages || {};

  window.TIC.Pages.trips =
    TripsPage;

  window.TICTripsPage =
    TripsPage;

  const router =
    getRouter();

  if (
    router &&
    typeof router.register ===
      "function"
  ) {
    if (!router.has?.("trips")) {
      router.register(
        "trips",
        {
          id: "trips",
          title: "رحلاتي",
          module: "trips",
          icon: "✈",
          visible: true,
          order: 2
        }
      );
    }

    router.registerPage?.(
      "trips",
      TripsPage
    );
  }

  const ui =
    getUI();

  if (
    ui &&
    typeof ui.registerAction ===
      "function"
  ) {
    const registerPublicAction = (
      name,
      handler
    ) => {
      if (ui.hasAction?.(name)) {
        return;
      }

      try {
        const unsubscribe =
          ui.registerAction(
            name,
            handler
          );

        if (
          typeof unsubscribe ===
          "function"
        ) {
          state
            .actionUnsubscribers
            .push(unsubscribe);
        }
      } catch (error) {
        console.warn(
          `TIC Trips public action registration failed: ${name}`,
          error
        );
      }
    };

    registerPublicAction(
      "trips-open-planned",
      () =>
        TripsPage.openPlannedTrips()
    );

    registerPublicAction(
      "planned-trip-promote",
      (payload = {}) =>
        TripsPage.promotePlannedTrip(
          payload.params
            ?.plannedTripId ||
          payload.plannedTripId
        )
    );
  }

  TripsPage.init();
})(window, document);
