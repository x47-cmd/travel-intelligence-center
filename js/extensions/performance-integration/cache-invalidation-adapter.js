/* =========================================================
   Travel Intelligence Center
   Cache Invalidation Adapter V1.0.0

   File Path:
   js/extensions/performance-integration/cache-invalidation-adapter.js

   Purpose:
   - Invalidates page and data caches when travel data changes.
   - Keeps cached Trips and Guide views fresh.
   - Listens to store, import, sync, storage, and custom events.
   - Supports route-specific and global invalidation.
   - Works without modifying frozen legacy files.
   - Fails safely when optional performance modules are unavailable.

   Required Load Order:
   1) js/extensions/performance-integration/integration-core.js
   2) js/extensions/performance-integration/cache-invalidation-adapter.js
   ========================================================= */

(function cacheInvalidationAdapterBootstrap(global) {
  "use strict";

  if (!global || global.TravelCacheInvalidationAdapter?.version) {
    return;
  }

  const VERSION = "1.0.0";
  const NAME = "TravelCacheInvalidationAdapter";

  const DEFAULT_CONFIG = Object.freeze({
    debug: false,
    debounceMs: 80,
    storageKeys: [
      "travel-intelligence-center",
      "travel-data",
      "travel-store",
      "tic-store",
      "trips",
      "destinations",
      "wishlist",
      "guides",
      "budgets",
      "profile",
      "settings"
    ],
    routeMap: {
      trips: ["trips", "passport", "plannedTrips", "memories"],
      guide: ["destinations", "wishlist", "guides", "recommendations"],
      budget: ["budgets", "savings", "expenses"],
      home: [
        "trips",
        "destinations",
        "wishlist",
        "budgets",
        "notifications",
        "statistics"
      ],
      more: ["profile", "documents", "packing", "settings"]
    },
    globalEvents: [
      "travel:data-changed",
      "store:changed",
      "store:updated",
      "travel-import:completed",
      "travel-sync:completed",
      "travel-brain:updated",
      "travel-assistant:updated"
    ],
    routeEvents: {
      trips: [
        "trip:created",
        "trip:updated",
        "trip:deleted",
        "trip:completed",
        "trip:restored",
        "passport:updated",
        "planned-trip:updated"
      ],
      guide: [
        "guide:updated",
        "destination:updated",
        "wishlist:updated",
        "recommendations:updated"
      ],
      budget: [
        "budget:updated",
        "expense:updated",
        "savings:updated"
      ],
      home: [
        "dashboard:updated",
        "statistics:updated",
        "notification:updated"
      ],
      more: [
        "profile:updated",
        "documents:updated",
        "packing:updated",
        "settings:updated"
      ]
    }
  });

  const state = {
    config: { ...DEFAULT_CONFIG },
    initialized: false,
    destroyed: false,
    cleanupCallbacks: new Set(),
    pendingRoutes: new Set(),
    timer: null,
    invalidationCount: 0,
    lastInvalidationAt: 0,
    lastReason: ""
  };

  function log(...args) {
    if (state.config.debug) {
      console.log(`[${NAME}]`, ...args);
    }
  }

  function warn(...args) {
    console.warn(`[${NAME}]`, ...args);
  }

  function getIntegration() {
    return global.TravelPerformanceIntegration || null;
  }

  function getPageCache() {
    return global.TravelPageCache || null;
  }

  function getPerformanceCore() {
    return global.TravelPerformance || null;
  }

  function getDataPrefetch() {
    return global.TravelDataPrefetch || null;
  }

  function normalizeRoute(route) {
    return (
      getIntegration()?.normalizeRoute?.(route) ||
      String(route || "").trim().toLowerCase()
    );
  }

  function emit(type, detail = {}) {
    const payload = {
      timestamp: Date.now(),
      ...detail
    };

    try {
      global.dispatchEvent(
        new CustomEvent(`travel-cache:${type}`, {
          detail: payload
        })
      );
    } catch (_) {
      // Ignore CustomEvent limitations.
    }

    return payload;
  }

  function routesForChangedKeys(keys = []) {
    const changed = new Set(
      keys
        .map((key) => String(key || "").trim())
        .filter(Boolean)
    );

    if (!changed.size) {
      return [];
    }

    const routes = [];

    Object.entries(state.config.routeMap).forEach(([route, routeKeys]) => {
      const matched = routeKeys.some((key) => changed.has(key));

      if (matched) {
        routes.push(route);
      }
    });

    return routes;
  }

  function clearDataPrefetch() {
    const prefetch = getDataPrefetch();

    try {
      prefetch?.clear?.();
    } catch (_) {
      // Optional API.
    }

    try {
      prefetch?.invalidate?.();
    } catch (_) {
      // Optional API.
    }
  }

  function performInvalidation(routes, reason = "data-changed") {
    const integration = getIntegration();
    const normalizedRoutes = [...new Set(
      (routes || [])
        .map(normalizeRoute)
        .filter(Boolean)
    )];

    if (!normalizedRoutes.length) {
      integration?.invalidateAll?.(reason);
      getPageCache()?.clear?.();
      getPerformanceCore()?.invalidatePage?.();
      getPerformanceCore()?.invalidateMemo?.();
      clearDataPrefetch();
    } else {
      normalizedRoutes.forEach((route) => {
        integration?.invalidateRoute?.(route, reason);
        getPageCache()?.invalidate?.(route);
        getPerformanceCore()?.invalidatePage?.(route);
      });

      getPerformanceCore()?.invalidateMemo?.();
      clearDataPrefetch();
    }

    state.invalidationCount += 1;
    state.lastInvalidationAt = Date.now();
    state.lastReason = reason;

    emit("invalidated", {
      routes: normalizedRoutes,
      global: normalizedRoutes.length === 0,
      reason,
      count: state.invalidationCount
    });

    log("Invalidated", normalizedRoutes, reason);
  }

  function flush(reason = "scheduled") {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }

    const routes = [...state.pendingRoutes];
    state.pendingRoutes.clear();

    performInvalidation(routes, reason);
  }

  function schedule(routes = [], reason = "data-changed") {
    routes.forEach((route) => {
      const normalized = normalizeRoute(route);

      if (normalized) {
        state.pendingRoutes.add(normalized);
      }
    });

    if (state.timer) {
      clearTimeout(state.timer);
    }

    state.timer = setTimeout(() => {
      flush(reason);
    }, state.config.debounceMs);
  }

  function invalidateRoute(route, reason = "manual-route-invalidation") {
    const normalized = normalizeRoute(route);

    if (!normalized) {
      return false;
    }

    schedule([normalized], reason);
    return true;
  }

  function invalidateRoutes(routes, reason = "manual-route-invalidation") {
    if (!Array.isArray(routes)) {
      return false;
    }

    schedule(routes, reason);
    return true;
  }

  function invalidateAll(reason = "manual-global-invalidation") {
    state.pendingRoutes.clear();

    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }

    performInvalidation([], reason);
  }

  function handleGlobalEvent(event) {
    const detail = event?.detail || {};
    const routes = Array.isArray(detail.routes)
      ? detail.routes
      : detail.route
        ? [detail.route]
        : [];

    if (routes.length) {
      schedule(routes, event.type);
      return;
    }

    const changedKeys = Array.isArray(detail.keys)
      ? detail.keys
      : Array.isArray(detail.changedKeys)
        ? detail.changedKeys
        : detail.key
          ? [detail.key]
          : [];

    const mappedRoutes = routesForChangedKeys(changedKeys);

    if (mappedRoutes.length) {
      schedule(mappedRoutes, event.type);
    } else {
      invalidateAll(event.type);
    }
  }

  function handleStorageEvent(event) {
    const key = String(event?.key || "");

    if (!key) {
      return;
    }

    const matches = state.config.storageKeys.some((storageKey) => {
      return key === storageKey || key.includes(storageKey);
    });

    if (!matches) {
      return;
    }

    const mappedRoutes = routesForChangedKeys([key]);

    if (mappedRoutes.length) {
      schedule(mappedRoutes, "storage");
    } else {
      invalidateAll("storage");
    }
  }

  function bindGlobalEvents() {
    state.config.globalEvents.forEach((eventName) => {
      const listener = handleGlobalEvent;

      global.addEventListener(eventName, listener);
      state.cleanupCallbacks.add(() => {
        global.removeEventListener(eventName, listener);
      });
    });
  }

  function bindRouteEvents() {
    Object.entries(state.config.routeEvents).forEach(
      ([route, eventNames]) => {
        eventNames.forEach((eventName) => {
          const listener = () => {
            schedule([route], eventName);
          };

          global.addEventListener(eventName, listener);
          state.cleanupCallbacks.add(() => {
            global.removeEventListener(eventName, listener);
          });
        });
      }
    );
  }

  function bindStorageEvent() {
    global.addEventListener("storage", handleStorageEvent);

    state.cleanupCallbacks.add(() => {
      global.removeEventListener("storage", handleStorageEvent);
    });
  }

  function configure(options = {}) {
    if (options && typeof options === "object") {
      state.config = {
        ...state.config,
        ...options,
        routeMap: {
          ...state.config.routeMap,
          ...(options.routeMap || {})
        },
        routeEvents: {
          ...state.config.routeEvents,
          ...(options.routeEvents || {})
        }
      };
    }

    return { ...state.config };
  }

  function initialize(options = {}) {
    if (state.initialized || state.destroyed) {
      return getStatus();
    }

    configure(options);
    bindGlobalEvents();
    bindRouteEvents();
    bindStorageEvent();

    state.initialized = true;

    emit("ready", {
      version: VERSION
    });

    log("Ready", VERSION);
    return getStatus();
  }

  function register() {
    return initialize();
  }

  function activate() {
    return getStatus();
  }

  function deactivate() {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }

    state.pendingRoutes.clear();
  }

  function refresh() {
    return getStatus();
  }

  function invalidate(context = {}) {
    const route = context.route || context.invalidatedRoute;

    if (route) {
      invalidateRoute(route, context.reason || "adapter-invalidated");
    } else {
      invalidateAll(context.reason || "adapter-invalidated");
    }
  }

  function getStatus() {
    return {
      version: VERSION,
      initialized: state.initialized,
      pendingRoutes: [...state.pendingRoutes],
      invalidationCount: state.invalidationCount,
      lastInvalidationAt: state.lastInvalidationAt,
      lastReason: state.lastReason
    };
  }

  function destroy() {
    if (state.destroyed) {
      return;
    }

    state.destroyed = true;
    deactivate();

    state.cleanupCallbacks.forEach((cleanup) => {
      try {
        cleanup();
      } catch (error) {
        warn("Cleanup failed.", error);
      }
    });

    state.cleanupCallbacks.clear();
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
    invalidateRoute,
    invalidateRoutes,
    invalidateAll,
    routesForChangedKeys,
    flush,
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
