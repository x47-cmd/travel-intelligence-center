/* =========================================================
   Travel Intelligence Center
   Route Performance Layer V1.0.0

   File Path:
   js/extensions/performance/route-performance.js

   Purpose:
   - Makes page navigation feel immediate.
   - Prevents repeated route presses and duplicate renders.
   - Adds route prewarming, lightweight page reveal, and safe route timing.
   - Works as an extension layer without rewriting legacy router files.
   - Designed for iPhone-first PWA navigation and RTL layouts.

   Required:
   - js/extensions/performance/performance-core.js

   Notes:
   - This file does not modify application data.
   - This file does not replace the existing router.
   - All behavior is defensive and automatically disables itself
     when the expected router hooks are not available.
   ========================================================= */

(function routePerformanceBootstrap(global) {
  "use strict";

  const PerformanceCore = global.TravelPerformance;

  if (!global || !PerformanceCore || global.TravelRoutePerformance?.version) {
    return;
  }

  const VERSION = "1.0.0";
  const NAMESPACE = "TravelRoutePerformance";

  const DEFAULT_CONFIG = Object.freeze({
    enabled: true,
    navigationLockMs: 280,
    settleDelayMs: 90,
    prewarmDelayMs: 160,
    routeTimeoutMs: 4500,
    activeClass: "is-active",
    pendingClass: "is-route-pending",
    readyClass: "is-route-ready",
    bodyNavigatingClass: "is-navigating",
    bodyInteractiveClass: "is-route-interactive",
    routeAttribute: "data-route",
    navSelector:
      "[data-route], [data-page], [data-nav], .bottom-nav a, .bottom-nav button, .app-nav a, .app-nav button",
    pageRootSelector:
      "#app, #app-root, #page-root, #main-content, main, [data-page-root]",
    ignoreModifiedClicks: true,
    enablePrewarm: true,
    enableNativeClickGuard: true,
    enableHistoryHooks: true,
    enableHashHooks: true
  });

  const state = {
    config: { ...DEFAULT_CONFIG },
    initialized: false,
    destroyed: false,
    navigating: false,
    navigationStartedAt: 0,
    navigationToken: "",
    activeRoute: "",
    pendingRoute: "",
    lastRequestedRoute: "",
    lastRequestAt: 0,
    settleTimerCancel: null,
    timeoutCancel: null,
    prewarmCancel: null,
    originalPushState: null,
    originalReplaceState: null,
    clickHandler: null,
    popStateHandler: null,
    hashChangeHandler: null,
    routeEndUnsubscribe: null,
    routeStartUnsubscribe: null,
    cleanupCallbacks: new Set()
  };

  function log(...args) {
    if (state.config.debug) {
      console.log(`[${NAMESPACE}]`, ...args);
    }
  }

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeRoute(route) {
    let value = safeText(route);

    if (!value) {
      return "";
    }

    value = value.replace(/^#/, "");
    value = value.replace(/^\/+/, "");
    value = value.split("?")[0];
    value = value.split("&")[0];

    if (value.includes("/")) {
      const parts = value.split("/").filter(Boolean);
      value = parts[parts.length - 1] || value;
    }

    return value.toLowerCase();
  }

  function currentRouteFromLocation() {
    const hashRoute = normalizeRoute(global.location?.hash);

    if (hashRoute) {
      return hashRoute;
    }

    const pathname = safeText(global.location?.pathname);

    if (!pathname || pathname === "/") {
      return "home";
    }

    return normalizeRoute(pathname) || "home";
  }

  function extractRouteFromElement(element) {
    if (!(element instanceof Element)) {
      return "";
    }

    const explicit =
      element.getAttribute("data-route") ||
      element.getAttribute("data-page") ||
      element.getAttribute("data-nav") ||
      element.getAttribute("href") ||
      element.getAttribute("aria-controls") ||
      "";

    if (explicit) {
      return normalizeRoute(explicit);
    }

    const action = element.getAttribute("data-action") || "";

    if (/home/i.test(action)) return "home";
    if (/trip/i.test(action)) return "trips";
    if (/guide/i.test(action)) return "guide";
    if (/budget/i.test(action)) return "budget";
    if (/more|setting/i.test(action)) return "more";

    const label = safeText(
      element.getAttribute("aria-label") ||
        element.textContent ||
        ""
    );

    if (/الرئيسية|home/i.test(label)) return "home";
    if (/رحلاتي|رحلة|trips?/i.test(label)) return "trips";
    if (/الدليل|guide/i.test(label)) return "guide";
    if (/الميزانية|budget/i.test(label)) return "budget";
    if (/المزيد|more/i.test(label)) return "more";

    return "";
  }

  function getPageRoot() {
    const selectors = state.config.pageRootSelector
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    for (const selector of selectors) {
      const element = document.querySelector(selector);

      if (element) {
        return element;
      }
    }

    return document.body;
  }

  function setBodyClass(className, enabled) {
    if (!document.body || !className) {
      return;
    }

    document.body.classList.toggle(className, Boolean(enabled));
  }

  function markNavigationControls(route) {
    const normalized = normalizeRoute(route);

    document.querySelectorAll(state.config.navSelector).forEach((element) => {
      const elementRoute = extractRouteFromElement(element);
      const isPending = normalized && elementRoute === normalized;

      element.classList.toggle(state.config.pendingClass, isPending);
      element.toggleAttribute("aria-busy", isPending);
    });
  }

  function clearNavigationControls() {
    document.querySelectorAll(state.config.navSelector).forEach((element) => {
      element.classList.remove(state.config.pendingClass);
      element.removeAttribute("aria-busy");
    });
  }

  function revealPageShell(route) {
    const root = getPageRoot();

    if (!root) {
      return;
    }

    root.setAttribute("data-route-state", "opening");
    root.setAttribute("data-pending-route", normalizeRoute(route));
    root.style.setProperty("content-visibility", "auto");

    PerformanceCore.nextFrame(
      () => {
        if (!root.isConnected) {
          return;
        }

        root.setAttribute("data-route-state", "visible");
        setBodyClass(state.config.bodyInteractiveClass, true);
      },
      {
        key: "route-performance:reveal",
        replace: true
      }
    );
  }

  function clearPageShellState() {
    const root = getPageRoot();

    if (!root) {
      return;
    }

    root.removeAttribute("data-pending-route");
    root.setAttribute("data-route-state", "ready");
  }

  function beginNavigation(route, meta = {}) {
    const normalized = normalizeRoute(route);

    if (!state.config.enabled || !normalized) {
      return "";
    }

    const now = Date.now();
    const duplicate =
      state.navigating &&
      state.pendingRoute === normalized &&
      now - state.lastRequestAt < state.config.navigationLockMs;

    if (duplicate) {
      PerformanceCore.emit("route-request-blocked", {
        route: normalized,
        reason: "duplicate-navigation"
      });

      return state.navigationToken;
    }

    if (
      normalized === state.activeRoute &&
      now - state.lastRequestAt < state.config.navigationLockMs
    ) {
      PerformanceCore.emit("route-request-blocked", {
        route: normalized,
        reason: "already-active"
      });

      return state.navigationToken;
    }

    finishNavigation({
      cancelled: true,
      reason: "superseded"
    });

    state.navigating = true;
    state.navigationStartedAt = now;
    state.pendingRoute = normalized;
    state.lastRequestedRoute = normalized;
    state.lastRequestAt = now;
    state.navigationToken = PerformanceCore.beginRoute(normalized, meta);

    setBodyClass(state.config.bodyNavigatingClass, true);
    setBodyClass(state.config.bodyInteractiveClass, false);

    markNavigationControls(normalized);
    revealPageShell(normalized);

    state.timeoutCancel = PerformanceCore.defer(
      () => {
        finishNavigation({
          timedOut: true,
          reason: "route-timeout"
        });
      },
      state.config.routeTimeoutMs,
      {
        key: "route-performance:timeout",
        replace: true
      }
    );

    PerformanceCore.emit("navigation-started", {
      route: normalized,
      token: state.navigationToken,
      meta
    });

    return state.navigationToken;
  }

  function finishNavigation(meta = {}) {
    if (!state.navigating && !state.navigationToken) {
      return 0;
    }

    state.settleTimerCancel?.();
    state.timeoutCancel?.();

    state.settleTimerCancel = null;
    state.timeoutCancel = null;

    const completedRoute =
      normalizeRoute(meta.route) ||
      state.pendingRoute ||
      currentRouteFromLocation();

    const token = state.navigationToken;
    const duration = token
      ? PerformanceCore.endRoute(token, {
          route: completedRoute,
          ...meta
        })
      : 0;

    state.activeRoute = completedRoute;
    state.pendingRoute = "";
    state.navigationToken = "";
    state.navigationStartedAt = 0;
    state.navigating = false;

    clearNavigationControls();
    clearPageShellState();

    setBodyClass(state.config.bodyNavigatingClass, false);
    setBodyClass(state.config.bodyInteractiveClass, true);

    PerformanceCore.emit("navigation-finished", {
      route: completedRoute,
      duration,
      meta
    });

    return duration;
  }

  function settleNavigation(route, meta = {}) {
    state.settleTimerCancel?.();

    state.settleTimerCancel = PerformanceCore.defer(
      () => {
        finishNavigation({
          route,
          ...meta
        });
      },
      state.config.settleDelayMs,
      {
        key: "route-performance:settle",
        replace: true
      }
    );
  }

  function notifyRouteRendered(route, meta = {}) {
    const normalized = normalizeRoute(route || state.pendingRoute);

    if (!normalized) {
      return;
    }

    settleNavigation(normalized, {
      source: "render-notification",
      ...meta
    });
  }

  function prewarmRoute(route) {
    if (!state.config.enablePrewarm) {
      return;
    }

    const normalized = normalizeRoute(route);

    if (!normalized || normalized === state.activeRoute) {
      return;
    }

    state.prewarmCancel?.();

    state.prewarmCancel = PerformanceCore.scheduleIdle(
      () => {
        try {
          const event = new CustomEvent("travel-route-prewarm", {
            detail: {
              route: normalized
            }
          });

          global.dispatchEvent(event);

          PerformanceCore.emit("route-prewarmed", {
            route: normalized
          });
        } catch (_) {
          // Ignore CustomEvent failures in old test environments.
        }
      },
      {
        key: `route-performance:prewarm:${normalized}`,
        timeout: state.config.prewarmDelayMs,
        replace: true
      }
    );
  }

  function isModifiedClick(event) {
    return Boolean(
      event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button > 0
    );
  }

  function shouldIgnoreElement(element) {
    if (!(element instanceof Element)) {
      return true;
    }

    if (
      element.closest(
        "[disabled], [aria-disabled='true'], input, textarea, select, [contenteditable='true']"
      )
    ) {
      return true;
    }

    const href = element.getAttribute("href") || "";

    if (
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("http://") ||
      href.startsWith("https://")
    ) {
      return true;
    }

    return false;
  }

  function handleNavigationClick(event) {
    if (
      !state.config.enabled ||
      state.destroyed ||
      event.defaultPrevented ||
      (state.config.ignoreModifiedClicks && isModifiedClick(event))
    ) {
      return;
    }

    const target = event.target?.closest?.(state.config.navSelector);

    if (!target || shouldIgnoreElement(target)) {
      return;
    }

    const route = extractRouteFromElement(target);

    if (!route) {
      return;
    }

    beginNavigation(route, {
      source: "navigation-click"
    });
  }

  function handlePointerIntent(event) {
    const target = event.target?.closest?.(state.config.navSelector);

    if (!target || shouldIgnoreElement(target)) {
      return;
    }

    const route = extractRouteFromElement(target);

    if (route) {
      prewarmRoute(route);
    }
  }

  function wrapHistoryMethod(methodName) {
    if (!global.history || typeof global.history[methodName] !== "function") {
      return;
    }

    const original = global.history[methodName];

    if (methodName === "pushState") {
      state.originalPushState = original;
    } else {
      state.originalReplaceState = original;
    }

    global.history[methodName] = function wrappedHistoryMethod(...args) {
      const result = original.apply(this, args);
      const route = currentRouteFromLocation();

      if (!state.navigating) {
        beginNavigation(route, {
          source: methodName
        });
      }

      settleNavigation(route, {
        source: methodName
      });

      return result;
    };
  }

  function restoreHistoryMethods() {
    if (state.originalPushState && global.history) {
      global.history.pushState = state.originalPushState;
    }

    if (state.originalReplaceState && global.history) {
      global.history.replaceState = state.originalReplaceState;
    }

    state.originalPushState = null;
    state.originalReplaceState = null;
  }

  function observeRouterEvents() {
    const routeStartEvents = [
      "route:start",
      "router:start",
      "page:before-open",
      "page:change-start",
      "travel:route-start"
    ];

    const routeEndEvents = [
      "route:end",
      "router:end",
      "page:opened",
      "page:rendered",
      "page:change-end",
      "travel:route-end"
    ];

    routeStartEvents.forEach((eventName) => {
      const listener = (event) => {
        const detail = event?.detail || {};
        const route =
          detail.route ||
          detail.page ||
          detail.pageId ||
          detail.name ||
          currentRouteFromLocation();

        beginNavigation(route, {
          source: eventName
        });
      };

      global.addEventListener(eventName, listener);
      state.cleanupCallbacks.add(() =>
        global.removeEventListener(eventName, listener)
      );
    });

    routeEndEvents.forEach((eventName) => {
      const listener = (event) => {
        const detail = event?.detail || {};
        const route =
          detail.route ||
          detail.page ||
          detail.pageId ||
          detail.name ||
          state.pendingRoute ||
          currentRouteFromLocation();

        notifyRouteRendered(route, {
          source: eventName
        });
      };

      global.addEventListener(eventName, listener);
      state.cleanupCallbacks.add(() =>
        global.removeEventListener(eventName, listener)
      );
    });
  }

  function bindNativeNavigation() {
    if (state.config.enableNativeClickGuard) {
      state.clickHandler = handleNavigationClick;

      document.addEventListener("click", state.clickHandler, {
        capture: true,
        passive: true
      });

      document.addEventListener("pointerenter", handlePointerIntent, {
        capture: true,
        passive: true
      });

      document.addEventListener("touchstart", handlePointerIntent, {
        capture: true,
        passive: true
      });

      state.cleanupCallbacks.add(() => {
        document.removeEventListener("click", state.clickHandler, {
          capture: true
        });

        document.removeEventListener("pointerenter", handlePointerIntent, {
          capture: true
        });

        document.removeEventListener("touchstart", handlePointerIntent, {
          capture: true
        });
      });
    }

    if (state.config.enableHistoryHooks) {
      wrapHistoryMethod("pushState");
      wrapHistoryMethod("replaceState");
    }

    if (state.config.enableHashHooks) {
      state.hashChangeHandler = () => {
        const route = currentRouteFromLocation();

        if (!state.navigating) {
          beginNavigation(route, {
            source: "hashchange"
          });
        }

        settleNavigation(route, {
          source: "hashchange"
        });
      };

      global.addEventListener("hashchange", state.hashChangeHandler);
      state.cleanupCallbacks.add(() =>
        global.removeEventListener("hashchange", state.hashChangeHandler)
      );
    }

    state.popStateHandler = () => {
      const route = currentRouteFromLocation();

      beginNavigation(route, {
        source: "popstate"
      });

      settleNavigation(route, {
        source: "popstate"
      });
    };

    global.addEventListener("popstate", state.popStateHandler);
    state.cleanupCallbacks.add(() =>
      global.removeEventListener("popstate", state.popStateHandler)
    );
  }

  function configure(options = {}) {
    if (options && typeof options === "object") {
      state.config = {
        ...state.config,
        ...options
      };
    }

    return { ...state.config };
  }

  function initialize(options = {}) {
    if (state.initialized || state.destroyed) {
      return getStatus();
    }

    configure(options);

    state.activeRoute = currentRouteFromLocation();

    bindNativeNavigation();
    observeRouterEvents();

    state.routeStartUnsubscribe = PerformanceCore.on(
      "route-start",
      (event) => {
        if (!state.navigationToken) {
          state.navigationToken = event.token || "";
        }
      }
    );

    state.routeEndUnsubscribe = PerformanceCore.on(
      "route-end",
      (event) => {
        if (
          state.navigating &&
          event.pageId &&
          normalizeRoute(event.pageId) === state.pendingRoute
        ) {
          settleNavigation(event.pageId, {
            source: "performance-core-route-end"
          });
        }
      }
    );

    state.initialized = true;

    document.documentElement?.classList.add("route-performance-enabled");
    setBodyClass(state.config.bodyInteractiveClass, true);

    PerformanceCore.emit("route-performance-ready", {
      version: VERSION,
      activeRoute: state.activeRoute
    });

    log("Ready", VERSION);
    return getStatus();
  }

  function getStatus() {
    return {
      version: VERSION,
      initialized: state.initialized,
      enabled: state.config.enabled,
      navigating: state.navigating,
      activeRoute: state.activeRoute,
      pendingRoute: state.pendingRoute,
      lastRequestedRoute: state.lastRequestedRoute,
      navigationStartedAt: state.navigationStartedAt
    };
  }

  function destroy() {
    if (state.destroyed) {
      return;
    }

    state.destroyed = true;

    state.settleTimerCancel?.();
    state.timeoutCancel?.();
    state.prewarmCancel?.();

    state.routeStartUnsubscribe?.();
    state.routeEndUnsubscribe?.();

    state.cleanupCallbacks.forEach((cleanup) => {
      try {
        cleanup();
      } catch (_) {
        // Ignore cleanup errors.
      }
    });

    state.cleanupCallbacks.clear();

    restoreHistoryMethods();
    clearNavigationControls();
    clearPageShellState();

    setBodyClass(state.config.bodyNavigatingClass, false);
    setBodyClass(state.config.bodyInteractiveClass, false);

    document.documentElement?.classList.remove(
      "route-performance-enabled"
    );

    state.initialized = false;
  }

  const api = Object.freeze({
    version: VERSION,
    initialize,
    configure,
    beginNavigation,
    finishNavigation,
    notifyRouteRendered,
    prewarmRoute,
    getStatus,
    destroy
  });

  Object.defineProperty(global, NAMESPACE, {
    configurable: false,
    enumerable: true,
    writable: false,
    value: api
  });

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => initialize(),
      { once: true }
    );
  } else {
    initialize();
  }
})(window);
