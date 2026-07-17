/* =========================================================
   Travel Intelligence Center
   Performance Integration Core V1.0.0

   File Path:
   js/extensions/performance-integration/integration-core.js

   Purpose:
   - Connects the existing application to the new performance layer.
   - Keeps frozen legacy files untouched.
   - Provides safe route detection, page-root discovery, invalidation,
     render lifecycle hooks, and adapter registration.
   - Allows page-specific adapters for Trips and Guide.
   - Fails safely when any optional performance module is unavailable.

   Required Load Order:
   1) js/extensions/performance/performance-core.js
   2) js/extensions/performance/route-performance.js
   3) js/extensions/performance/page-cache.js
   4) js/extensions/performance/render-optimizer.js
   5) js/extensions/performance/virtual-scroll.js
   6) js/extensions/performance/image-lazy-loader.js
   7) js/extensions/performance/data-prefetch.js
   8) js/extensions/performance/memory-manager.js
   9) js/extensions/performance/performance-monitor.js
   10) js/extensions/performance/performance-bootstrap.js
   11) js/extensions/performance-integration/integration-core.js
   ========================================================= */

(function performanceIntegrationCoreBootstrap(global) {
  "use strict";

  if (!global || global.TravelPerformanceIntegration?.version) {
    return;
  }

  const VERSION = "1.0.0";
  const NAME = "TravelPerformanceIntegration";

  const DEFAULT_CONFIG = Object.freeze({
    debug: false,
    appRootSelectors: [
      "#app",
      "#app-root",
      "#page-root",
      "#main-content",
      "main",
      "[data-page-root]",
      "[data-router-view]"
    ],
    routeAttributes: [
      "data-route",
      "data-page",
      "data-view",
      "data-current-page"
    ],
    mutationDebounceMs: 36,
    routeSettleMs: 80,
    cacheRoutes: ["home", "trips", "guide", "budget", "more"],
    heavyRoutes: ["trips", "guide"],
    ignoredMutationAttributes: [
      "class",
      "style",
      "aria-busy",
      "data-route-state",
      "data-pending-route"
    ]
  });

  const state = {
    config: { ...DEFAULT_CONFIG },
    initialized: false,
    destroyed: false,
    activeRoute: "",
    pendingRoute: "",
    adapters: new Map(),
    routeSessions: new Map(),
    cleanupCallbacks: new Set(),
    mutationObserver: null,
    mutationTimer: null,
    lastMutationAt: 0,
    lastSnapshotByRoute: new Map(),
    listenersBound: false
  };

  function log(...args) {
    if (state.config.debug) {
      console.log(`[${NAME}]`, ...args);
    }
  }

  function warn(...args) {
    console.warn(`[${NAME}]`, ...args);
  }

  function normalizeRoute(value) {
    let route = String(value || "").trim().toLowerCase();

    if (!route) {
      return "";
    }

    route = route.replace(/^#/, "");
    route = route.replace(/^\/+/, "");
    route = route.split("?")[0];
    route = route.split("&")[0];

    if (route.includes("/")) {
      const parts = route.split("/").filter(Boolean);
      route = parts[parts.length - 1] || route;
    }

    if (/^trip(?:s)?$/.test(route)) return "trips";
    if (/^guide$/.test(route)) return "guide";
    if (/^budget$/.test(route)) return "budget";
    if (/^more|settings?$/.test(route)) return "more";
    if (/^home|dashboard$/.test(route)) return "home";

    return route;
  }

  function routeFromLocation() {
    const hash = normalizeRoute(global.location?.hash);

    if (hash) {
      return hash;
    }

    return normalizeRoute(global.location?.pathname) || "home";
  }

  function getAppRoot() {
    for (const selector of state.config.appRootSelectors) {
      try {
        const element = document.querySelector(selector);

        if (element) {
          return element;
        }
      } catch (_) {
        // Ignore invalid selectors supplied by external configuration.
      }
    }

    return document.body || document.documentElement;
  }

  function routeFromDom() {
    const root = getAppRoot();

    if (!root) {
      return "";
    }

    for (const attribute of state.config.routeAttributes) {
      const value =
        root.getAttribute?.(attribute) ||
        document.body?.getAttribute?.(attribute) ||
        document.documentElement?.getAttribute?.(attribute);

      const route = normalizeRoute(value);

      if (route) {
        return route;
      }
    }

    const visiblePage = document.querySelector(
      "[data-page]:not([hidden]), [data-route]:not([hidden]), .page.is-active, .page.active"
    );

    if (visiblePage) {
      return normalizeRoute(
        visiblePage.getAttribute("data-page") ||
          visiblePage.getAttribute("data-route") ||
          visiblePage.id
      );
    }

    return "";
  }

  function detectRoute() {
    return routeFromDom() || routeFromLocation() || "home";
  }

  function getPerformanceCore() {
    return global.TravelPerformance || null;
  }

  function getRoutePerformance() {
    return global.TravelRoutePerformance || null;
  }

  function getPageCache() {
    return global.TravelPageCache || null;
  }

  function getRenderOptimizer() {
    return global.TravelRenderOptimizer || null;
  }

  function emit(type, detail = {}) {
    const payload = {
      type,
      route: state.activeRoute,
      timestamp: Date.now(),
      ...detail
    };

    try {
      global.dispatchEvent(
        new CustomEvent(`travel-integration:${type}`, {
          detail: payload
        })
      );
    } catch (_) {
      // CustomEvent may not exist in some test environments.
    }

    getPerformanceCore()?.emit?.(`integration-${type}`, payload);
    return payload;
  }

  function registerAdapter(route, adapter) {
    const normalized = normalizeRoute(route);

    if (!normalized || !adapter || typeof adapter !== "object") {
      return false;
    }

    unregisterAdapter(normalized);
    state.adapters.set(normalized, adapter);

    try {
      adapter.register?.({
        route: normalized,
        integration: api
      });
    } catch (error) {
      warn(`Adapter registration failed for "${normalized}".`, error);
    }

    emit("adapter-registered", {
      adapterRoute: normalized,
      version: adapter.version || "unknown"
    });

    if (state.initialized && state.activeRoute === normalized) {
      activateAdapter(normalized, {
        reason: "registered-on-active-route"
      });
    }

    return true;
  }

  function unregisterAdapter(route) {
    const normalized = normalizeRoute(route);
    const adapter = state.adapters.get(normalized);

    if (!adapter) {
      return false;
    }

    try {
      adapter.destroy?.();
    } catch (error) {
      warn(`Adapter cleanup failed for "${normalized}".`, error);
    }

    state.adapters.delete(normalized);
    emit("adapter-unregistered", {
      adapterRoute: normalized
    });

    return true;
  }

  function getAdapter(route = state.activeRoute) {
    return state.adapters.get(normalizeRoute(route)) || null;
  }

  function createRouteSession(route, meta = {}) {
    const normalized = normalizeRoute(route);
    const core = getPerformanceCore();
    const existing = state.routeSessions.get(normalized);

    existing?.cancel?.("superseded");

    const renderSession = core?.createRenderSession?.(normalized) || null;
    const session = {
      route: normalized,
      startedAt: performance.now?.() || Date.now(),
      meta,
      renderSession,
      cancelled: false,
      cancel(reason = "cancelled") {
        if (this.cancelled) {
          return;
        }

        this.cancelled = true;
        this.renderSession?.cancel?.(reason);
      },
      finish(extra = {}) {
        if (this.cancelled) {
          return 0;
        }

        const duration =
          this.renderSession?.finish?.({
            ...this.meta,
            ...extra
          }) ||
          (performance.now?.() || Date.now()) - this.startedAt;

        state.routeSessions.delete(normalized);
        return duration;
      }
    };

    state.routeSessions.set(normalized, session);
    return session;
  }

  function cancelRouteSession(route, reason = "cancelled") {
    const normalized = normalizeRoute(route);
    const session = state.routeSessions.get(normalized);

    if (!session) {
      return false;
    }

    session.cancel(reason);
    state.routeSessions.delete(normalized);
    return true;
  }

  function snapshotRoute(route = state.activeRoute) {
    const normalized = normalizeRoute(route);
    const root = getAppRoot();

    if (!normalized || !root || !state.config.cacheRoutes.includes(normalized)) {
      return null;
    }

    const snapshot = {
      route: normalized,
      html: root.innerHTML,
      scrollY: global.scrollY || 0,
      savedAt: Date.now()
    };

    state.lastSnapshotByRoute.set(normalized, snapshot);

    try {
      getPageCache()?.save?.(normalized, snapshot);
    } catch (error) {
      warn(`Could not cache route "${normalized}".`, error);
    }

    getPerformanceCore()?.cachePage?.(normalized, snapshot, {
      meta: {
        source: NAME
      }
    });

    emit("route-snapshotted", {
      snapshotRoute: normalized
    });

    return snapshot;
  }

  function getSnapshot(route) {
    const normalized = normalizeRoute(route);

    if (!normalized) {
      return null;
    }

    return (
      getPageCache()?.restore?.(normalized) ||
      getPerformanceCore()?.getCachedPage?.(normalized) ||
      state.lastSnapshotByRoute.get(normalized) ||
      null
    );
  }

  function invalidateRoute(route, reason = "data-changed") {
    const normalized = normalizeRoute(route);

    if (!normalized) {
      return;
    }

    state.lastSnapshotByRoute.delete(normalized);
    getPageCache()?.invalidate?.(normalized);
    getPerformanceCore()?.invalidatePage?.(normalized);

    const adapter = getAdapter(normalized);

    try {
      adapter?.invalidate?.({
        route: normalized,
        reason
      });
    } catch (error) {
      warn(`Adapter invalidation failed for "${normalized}".`, error);
    }

    emit("route-invalidated", {
      invalidatedRoute: normalized,
      reason
    });
  }

  function invalidateAll(reason = "global-data-changed") {
    [...state.lastSnapshotByRoute.keys()].forEach((route) => {
      invalidateRoute(route, reason);
    });

    getPageCache()?.clear?.();
    getPerformanceCore()?.invalidatePage?.();
    getPerformanceCore()?.invalidateMemo?.();

    emit("all-invalidated", {
      reason
    });
  }

  function activateAdapter(route, context = {}) {
    const normalized = normalizeRoute(route);
    const adapter = getAdapter(normalized);

    if (!adapter) {
      return null;
    }

    const session = createRouteSession(normalized, context);

    try {
      const result = adapter.activate?.({
        route: normalized,
        root: getAppRoot(),
        session,
        integration: api,
        context
      });

      if (result && typeof result.then === "function") {
        result
          .then(() => {
            session.finish({
              source: "adapter-activate"
            });
          })
          .catch((error) => {
            session.cancel("adapter-error");
            warn(`Adapter activation failed for "${normalized}".`, error);
          });
      } else {
        session.finish({
          source: "adapter-activate"
        });
      }

      return result;
    } catch (error) {
      session.cancel("adapter-error");
      warn(`Adapter activation failed for "${normalized}".`, error);
      return null;
    }
  }

  function deactivateAdapter(route, context = {}) {
    const normalized = normalizeRoute(route);
    const adapter = getAdapter(normalized);

    cancelRouteSession(normalized, "route-deactivated");

    if (!adapter) {
      return;
    }

    try {
      adapter.deactivate?.({
        route: normalized,
        root: getAppRoot(),
        integration: api,
        context
      });
    } catch (error) {
      warn(`Adapter deactivation failed for "${normalized}".`, error);
    }
  }

  function handleRouteStart(route, meta = {}) {
    const normalized = normalizeRoute(route || detectRoute());

    if (!normalized) {
      return;
    }

    if (state.activeRoute && state.activeRoute !== normalized) {
      snapshotRoute(state.activeRoute);
      deactivateAdapter(state.activeRoute, {
        reason: "route-change",
        nextRoute: normalized
      });
    }

    state.pendingRoute = normalized;

    emit("route-start", {
      nextRoute: normalized,
      meta
    });
  }

  function handleRouteEnd(route, meta = {}) {
    const normalized = normalizeRoute(route || detectRoute());

    if (!normalized) {
      return;
    }

    state.activeRoute = normalized;
    state.pendingRoute = "";

    const routePerformance = getRoutePerformance();
    routePerformance?.notifyRouteRendered?.(normalized, {
      source: NAME,
      ...meta
    });

    activateAdapter(normalized, {
      reason: "route-ready",
      ...meta
    });

    emit("route-end", {
      currentRoute: normalized,
      meta
    });
  }

  function scheduleMutationProcessing() {
    if (state.mutationTimer) {
      clearTimeout(state.mutationTimer);
    }

    state.mutationTimer = setTimeout(() => {
      state.mutationTimer = null;
      const detected = detectRoute();

      if (detected !== state.activeRoute) {
        handleRouteStart(detected, {
          source: "mutation-observer"
        });

        getRenderOptimizer()?.render?.(
          `integration:route:${detected}`,
          () => {
            handleRouteEnd(detected, {
              source: "mutation-observer"
            });
          }
        );
      } else {
        const adapter = getAdapter(detected);

        try {
          adapter?.refresh?.({
            route: detected,
            root: getAppRoot(),
            integration: api,
            reason: "dom-mutation"
          });
        } catch (error) {
          warn(`Adapter refresh failed for "${detected}".`, error);
        }
      }
    }, state.config.mutationDebounceMs);
  }

  function bindMutationObserver() {
    if (typeof MutationObserver !== "function") {
      return;
    }

    const root = getAppRoot();

    if (!root) {
      return;
    }

    state.mutationObserver = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        if (mutation.type === "childList") {
          return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
        }

        if (mutation.type === "attributes") {
          return !state.config.ignoredMutationAttributes.includes(
            mutation.attributeName
          );
        }

        return false;
      });

      if (!relevant) {
        return;
      }

      state.lastMutationAt = Date.now();
      scheduleMutationProcessing();
    });

    state.mutationObserver.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: state.config.routeAttributes
    });
  }

  function bindLifecycleEvents() {
    if (state.listenersBound) {
      return;
    }

    const routeStartEvents = [
      "route:start",
      "router:start",
      "page:before-open",
      "page:change-start",
      "travel:route-start",
      "travel-performance:navigation-started"
    ];

    const routeEndEvents = [
      "route:end",
      "router:end",
      "page:opened",
      "page:rendered",
      "page:change-end",
      "travel:route-end",
      "travel-performance:navigation-finished"
    ];

    routeStartEvents.forEach((eventName) => {
      const listener = (event) => {
        const detail = event?.detail || {};

        handleRouteStart(
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

    routeEndEvents.forEach((eventName) => {
      const listener = (event) => {
        const detail = event?.detail || {};

        handleRouteEnd(
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

    const dataEvents = [
      "store:changed",
      "store:updated",
      "travel:data-changed",
      "travel-sync:completed",
      "travel-import:completed"
    ];

    dataEvents.forEach((eventName) => {
      const listener = (event) => {
        const detail = event?.detail || {};
        const routes = Array.isArray(detail.routes)
          ? detail.routes
          : detail.route
            ? [detail.route]
            : [];

        if (routes.length) {
          routes.forEach((route) =>
            invalidateRoute(route, eventName)
          );
        } else {
          invalidateAll(eventName);
        }
      };

      global.addEventListener(eventName, listener);
      state.cleanupCallbacks.add(() =>
        global.removeEventListener(eventName, listener)
      );
    });

    state.listenersBound = true;
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
    state.activeRoute = detectRoute();

    bindLifecycleEvents();
    bindMutationObserver();

    state.initialized = true;

    activateAdapter(state.activeRoute, {
      reason: "initial-load"
    });

    emit("ready", {
      version: VERSION,
      activeRoute: state.activeRoute
    });

    log("Ready", VERSION, state.activeRoute);
    return getStatus();
  }

  function getStatus() {
    return {
      version: VERSION,
      initialized: state.initialized,
      activeRoute: state.activeRoute,
      pendingRoute: state.pendingRoute,
      adapters: [...state.adapters.keys()],
      cachedRoutes: [...state.lastSnapshotByRoute.keys()],
      lastMutationAt: state.lastMutationAt
    };
  }

  function destroy() {
    if (state.destroyed) {
      return;
    }

    state.destroyed = true;

    if (state.mutationTimer) {
      clearTimeout(state.mutationTimer);
      state.mutationTimer = null;
    }

    try {
      state.mutationObserver?.disconnect?.();
    } catch (_) {
      // Ignore observer cleanup failures.
    }

    state.mutationObserver = null;

    [...state.routeSessions.keys()].forEach((route) => {
      cancelRouteSession(route, "integration-destroyed");
    });

    [...state.adapters.keys()].forEach((route) => {
      unregisterAdapter(route);
    });

    state.cleanupCallbacks.forEach((cleanup) => {
      try {
        cleanup();
      } catch (_) {
        // Ignore cleanup failures.
      }
    });

    state.cleanupCallbacks.clear();
    state.lastSnapshotByRoute.clear();
    state.listenersBound = false;
    state.initialized = false;
  }

  const api = Object.freeze({
    version: VERSION,
    initialize,
    configure,
    detectRoute,
    normalizeRoute,
    getAppRoot,
    registerAdapter,
    unregisterAdapter,
    getAdapter,
    snapshotRoute,
    getSnapshot,
    invalidateRoute,
    invalidateAll,
    handleRouteStart,
    handleRouteEnd,
    createRouteSession,
    cancelRouteSession,
    emit,
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
