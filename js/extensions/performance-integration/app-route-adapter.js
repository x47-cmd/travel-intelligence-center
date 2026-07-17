/* =========================================================
   Travel Intelligence Center
   App Route Adapter V1.0.0

   File Path:
   js/extensions/performance-integration/app-route-adapter.js

   Purpose:
   - Integrates the existing application router with the performance layer.
   - Detects route changes from hash, history, clicks, and application events.
   - Prevents duplicate route work when the same page is selected repeatedly.
   - Emits a stable route lifecycle for page-specific performance adapters.
   - Keeps legacy router and app files untouched.

   Required Load Order:
   1) js/extensions/performance-integration/integration-core.js
   2) js/extensions/performance-integration/app-route-adapter.js
   ========================================================= */

(function appRouteAdapterBootstrap(global) {
  "use strict";

  if (!global || global.TravelAppRouteAdapter?.version) {
    return;
  }

  const VERSION = "1.0.0";
  const NAME = "TravelAppRouteAdapter";

  const DEFAULT_CONFIG = Object.freeze({
    debug: false,
    routeSettleMs: 90,
    duplicateWindowMs: 420,
    navigationSelectors: [
      "[data-route]",
      "[data-page]",
      "[data-nav]",
      "[data-target-page]",
      "a[href^='#']",
      ".bottom-nav a",
      ".bottom-nav button",
      ".nav-item",
      ".tab-button"
    ],
    ignoredTargets: [
      "[disabled]",
      "[aria-disabled='true']",
      "[data-no-route]",
      "[data-performance-ignore]"
    ]
  });

  const state = {
    config: { ...DEFAULT_CONFIG },
    initialized: false,
    destroyed: false,
    currentRoute: "",
    pendingRoute: "",
    lastRequestedRoute: "",
    lastRequestedAt: 0,
    routeTimer: null,
    cleanupCallbacks: new Set(),
    originalPushState: null,
    originalReplaceState: null
  };

  function log(...args) {
    if (state.config.debug) {
      console.log(`[${NAME}]`, ...args);
    }
  }

  function getIntegration() {
    return global.TravelPerformanceIntegration || null;
  }

  function getRoutePerformance() {
    return global.TravelRoutePerformance || null;
  }

  function normalizeRoute(route) {
    const integration = getIntegration();

    if (integration?.normalizeRoute) {
      return integration.normalizeRoute(route);
    }

    return String(route || "")
      .trim()
      .toLowerCase()
      .replace(/^#/, "")
      .replace(/^\/+/, "")
      .split("?")[0]
      .split("&")[0];
  }

  function detectRoute() {
    return (
      getIntegration()?.detectRoute?.() ||
      normalizeRoute(global.location?.hash) ||
      normalizeRoute(global.location?.pathname) ||
      "home"
    );
  }

  function emit(type, detail = {}) {
    const payload = {
      route: state.currentRoute,
      pendingRoute: state.pendingRoute,
      timestamp: Date.now(),
      ...detail
    };

    try {
      global.dispatchEvent(
        new CustomEvent(`travel-app-route:${type}`, {
          detail: payload
        })
      );
    } catch (_) {
      // Ignore CustomEvent limitations in test environments.
    }

    getIntegration()?.emit?.(`app-route-${type}`, payload);
    return payload;
  }

  function isIgnoredTarget(target) {
    if (!(target instanceof Element)) {
      return true;
    }

    return state.config.ignoredTargets.some((selector) => {
      try {
        return Boolean(target.closest(selector));
      } catch (_) {
        return false;
      }
    });
  }

  function findNavigationTarget(startNode) {
    if (!(startNode instanceof Element)) {
      return null;
    }

    for (const selector of state.config.navigationSelectors) {
      try {
        const target = startNode.closest(selector);

        if (target) {
          return target;
        }
      } catch (_) {
        // Ignore invalid custom selectors.
      }
    }

    return null;
  }

  function routeFromElement(element) {
    if (!element) {
      return "";
    }

    const raw =
      element.getAttribute("data-route") ||
      element.getAttribute("data-page") ||
      element.getAttribute("data-nav") ||
      element.getAttribute("data-target-page") ||
      element.getAttribute("href") ||
      "";

    return normalizeRoute(raw);
  }

  function isDuplicateRequest(route) {
    const normalized = normalizeRoute(route);
    const now = Date.now();

    return (
      normalized &&
      normalized === state.lastRequestedRoute &&
      now - state.lastRequestedAt <= state.config.duplicateWindowMs
    );
  }

  function recordRequest(route) {
    state.lastRequestedRoute = normalizeRoute(route);
    state.lastRequestedAt = Date.now();
  }

  function cancelPendingRoute(reason = "cancelled") {
    if (state.routeTimer) {
      clearTimeout(state.routeTimer);
      state.routeTimer = null;
    }

    if (!state.pendingRoute) {
      return;
    }

    emit("cancelled", {
      cancelledRoute: state.pendingRoute,
      reason
    });

    state.pendingRoute = "";
  }

  function settleRoute(route, meta = {}) {
    const normalized = normalizeRoute(route || detectRoute());

    if (!normalized) {
      return;
    }

    if (state.routeTimer) {
      clearTimeout(state.routeTimer);
    }

    state.routeTimer = setTimeout(() => {
      state.routeTimer = null;

      const detected = detectRoute();
      const finalRoute = normalizeRoute(detected || normalized);

      if (!finalRoute) {
        return;
      }

      state.currentRoute = finalRoute;
      state.pendingRoute = "";

      getIntegration()?.handleRouteEnd?.(finalRoute, {
        source: NAME,
        ...meta
      });

      getRoutePerformance()?.notifyRouteRendered?.(finalRoute, {
        source: NAME,
        ...meta
      });

      emit("settled", {
        settledRoute: finalRoute,
        meta
      });

      log("Route settled:", finalRoute);
    }, state.config.routeSettleMs);
  }

  function startRoute(route, meta = {}) {
    const normalized = normalizeRoute(route || detectRoute());

    if (!normalized) {
      return false;
    }

    if (
      normalized === state.currentRoute &&
      !state.pendingRoute &&
      isDuplicateRequest(normalized)
    ) {
      emit("duplicate-skipped", {
        skippedRoute: normalized,
        meta
      });

      return false;
    }

    if (state.pendingRoute && state.pendingRoute !== normalized) {
      cancelPendingRoute("superseded");
    }

    recordRequest(normalized);
    state.pendingRoute = normalized;

    getIntegration()?.handleRouteStart?.(normalized, {
      source: NAME,
      ...meta
    });

    try {
      getRoutePerformance()?.startNavigation?.(normalized, {
        source: NAME,
        ...meta
      });
    } catch (_) {
      // Optional API: fail safely when unavailable.
    }

    emit("started", {
      nextRoute: normalized,
      meta
    });

    return true;
  }

  function handlePotentialRouteChange(route, meta = {}) {
    const normalized = normalizeRoute(route || detectRoute());

    if (!normalized) {
      return;
    }

    const started = startRoute(normalized, meta);

    if (!started && normalized === state.currentRoute) {
      return;
    }

    settleRoute(normalized, meta);
  }

  function handleClick(event) {
    if (
      event.defaultPrevented ||
      event.button > 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const navigationTarget = findNavigationTarget(event.target);

    if (!navigationTarget || isIgnoredTarget(navigationTarget)) {
      return;
    }

    const route = routeFromElement(navigationTarget);

    if (!route) {
      return;
    }

    startRoute(route, {
      source: "navigation-click"
    });
  }

  function handleHashChange() {
    handlePotentialRouteChange(detectRoute(), {
      source: "hashchange"
    });
  }

  function handlePopState() {
    handlePotentialRouteChange(detectRoute(), {
      source: "popstate"
    });
  }

  function patchHistory() {
    if (!global.history) {
      return;
    }

    state.originalPushState = global.history.pushState;
    state.originalReplaceState = global.history.replaceState;

    if (typeof state.originalPushState === "function") {
      global.history.pushState = function patchedPushState(...args) {
        const result = state.originalPushState.apply(this, args);

        queueMicrotask(() => {
          handlePotentialRouteChange(detectRoute(), {
            source: "history.pushState"
          });
        });

        return result;
      };
    }

    if (typeof state.originalReplaceState === "function") {
      global.history.replaceState = function patchedReplaceState(...args) {
        const result = state.originalReplaceState.apply(this, args);

        queueMicrotask(() => {
          handlePotentialRouteChange(detectRoute(), {
            source: "history.replaceState"
          });
        });

        return result;
      };
    }
  }

  function restoreHistory() {
    if (!global.history) {
      return;
    }

    if (state.originalPushState) {
      global.history.pushState = state.originalPushState;
    }

    if (state.originalReplaceState) {
      global.history.replaceState = state.originalReplaceState;
    }

    state.originalPushState = null;
    state.originalReplaceState = null;
  }

  function bindApplicationRouteEvents() {
    const startEvents = [
      "route:start",
      "router:start",
      "page:before-open",
      "page:change-start",
      "travel:route-start"
    ];

    const endEvents = [
      "route:end",
      "router:end",
      "page:opened",
      "page:rendered",
      "page:change-end",
      "travel:route-end"
    ];

    startEvents.forEach((eventName) => {
      const listener = (event) => {
        const detail = event?.detail || {};

        startRoute(
          detail.route ||
            detail.page ||
            detail.pageId ||
            detail.name ||
            detectRoute(),
          {
            source: eventName
          }
        );
      };

      global.addEventListener(eventName, listener);
      state.cleanupCallbacks.add(() =>
        global.removeEventListener(eventName, listener)
      );
    });

    endEvents.forEach((eventName) => {
      const listener = (event) => {
        const detail = event?.detail || {};
        const route =
          detail.route ||
          detail.page ||
          detail.pageId ||
          detail.name ||
          detectRoute();

        settleRoute(route, {
          source: eventName
        });
      };

      global.addEventListener(eventName, listener);
      state.cleanupCallbacks.add(() =>
        global.removeEventListener(eventName, listener)
      );
    });
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

    state.currentRoute = detectRoute();

    document.addEventListener("click", handleClick, true);
    global.addEventListener("hashchange", handleHashChange);
    global.addEventListener("popstate", handlePopState);

    state.cleanupCallbacks.add(() =>
      document.removeEventListener("click", handleClick, true)
    );

    state.cleanupCallbacks.add(() =>
      global.removeEventListener("hashchange", handleHashChange)
    );

    state.cleanupCallbacks.add(() =>
      global.removeEventListener("popstate", handlePopState)
    );

    patchHistory();
    bindApplicationRouteEvents();

    state.initialized = true;

    getIntegration()?.registerAdapter?.("app-router", api);

    settleRoute(state.currentRoute, {
      source: "initial-load"
    });

    emit("ready", {
      version: VERSION,
      currentRoute: state.currentRoute
    });

    log("Ready", VERSION, state.currentRoute);
    return getStatus();
  }

  function register() {
    return true;
  }

  function activate() {
    return getStatus();
  }

  function deactivate() {
    cancelPendingRoute("adapter-deactivated");
  }

  function refresh() {
    const detected = detectRoute();

    if (detected && detected !== state.currentRoute) {
      handlePotentialRouteChange(detected, {
        source: "adapter-refresh"
      });
    }
  }

  function invalidate() {
    state.lastRequestedRoute = "";
    state.lastRequestedAt = 0;
  }

  function getStatus() {
    return {
      version: VERSION,
      initialized: state.initialized,
      currentRoute: state.currentRoute,
      pendingRoute: state.pendingRoute,
      lastRequestedRoute: state.lastRequestedRoute,
      lastRequestedAt: state.lastRequestedAt
    };
  }

  function destroy() {
    if (state.destroyed) {
      return;
    }

    state.destroyed = true;
    cancelPendingRoute("destroyed");

    state.cleanupCallbacks.forEach((cleanup) => {
      try {
        cleanup();
      } catch (_) {
        // Ignore cleanup failures.
      }
    });

    state.cleanupCallbacks.clear();
    restoreHistory();

    state.initialized = false;
  }

  const api = Object.freeze({
    version: VERSION,
    initialize,
    configure,
    register,
    activate,
    deactivate,
    refresh,
    invalidate,
    startRoute,
    settleRoute,
    cancelPendingRoute,
    detectRoute,
    getStatus,
    destroy
  });

  Object.defineProperty(global, NAME, {
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
