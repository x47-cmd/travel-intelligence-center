/* =========================================================
   Travel Intelligence Center
   Performance & Stability Core V1.0.0

   File Path:
   js/extensions/performance/performance-core.js

   Purpose:
   - Adds a safe performance layer without rewriting legacy pages.
   - Provides page caching, deferred work, memoization, idle scheduling,
     render cancellation, route timing, and lightweight diagnostics.
   - Designed for iPhone-first PWA behavior and RTL applications.
   - Keeps all APIs namespaced under window.TravelPerformance.

   Integration:
   - Load this file before the other performance extension files.
   - Do not remove or rename existing page modules.
   - This file does not alter application data.
   ========================================================= */

(function performanceCoreBootstrap(global) {
  "use strict";

  if (!global || global.TravelPerformance?.version) {
    return;
  }

  const VERSION = "1.0.0";
  const NAMESPACE = "TravelPerformance";

  const DEFAULT_CONFIG = Object.freeze({
    debug: false,
    enablePageCache: true,
    enableDiagnostics: true,
    maxCachedPages: 4,
    cacheMaxAge: 5 * 60 * 1000,
    idleTimeout: 700,
    routeWarningThreshold: 220,
    renderWarningThreshold: 120,
    longTaskThreshold: 55,
    defaultBatchSize: 6,
    defaultFrameBudget: 10
  });

  const state = {
    config: { ...DEFAULT_CONFIG },
    startedAt: Date.now(),
    activePage: "",
    routeStartedAt: 0,
    routeSequence: 0,
    pageCache: new Map(),
    memoCache: new Map(),
    jobs: new Map(),
    metrics: [],
    listeners: new Map(),
    cleanupCallbacks: new Set(),
    longTaskObserver: null,
    destroyed: false
  };

  function now() {
    return global.performance?.now?.() ?? Date.now();
  }

  function safeClone(value) {
    if (value == null || typeof value !== "object") {
      return value;
    }

    try {
      return structuredClone(value);
    } catch (_) {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (_) {
        return value;
      }
    }
  }

  function log(...args) {
    if (state.config.debug) {
      console.log(`[${NAMESPACE}]`, ...args);
    }
  }

  function warn(...args) {
    if (state.config.debug) {
      console.warn(`[${NAMESPACE}]`, ...args);
    }
  }

  function createId(prefix = "job") {
    state.routeSequence += 1;
    return `${prefix}_${Date.now()}_${state.routeSequence}`;
  }

  function emit(type, detail = {}) {
    const payload = {
      type,
      timestamp: Date.now(),
      ...detail
    };

    const listeners = state.listeners.get(type);

    if (listeners) {
      [...listeners].forEach((listener) => {
        try {
          listener(payload);
        } catch (error) {
          warn("Listener failed:", type, error);
        }
      });
    }

    try {
      global.dispatchEvent(
        new CustomEvent(`travel-performance:${type}`, {
          detail: payload
        })
      );
    } catch (_) {
      // CustomEvent may not be available in some test environments.
    }

    return payload;
  }

  function on(type, listener) {
    if (typeof listener !== "function") {
      return function noop() {};
    }

    if (!state.listeners.has(type)) {
      state.listeners.set(type, new Set());
    }

    state.listeners.get(type).add(listener);

    return function unsubscribe() {
      state.listeners.get(type)?.delete(listener);
    };
  }

  function recordMetric(name, duration, meta = {}) {
    if (!state.config.enableDiagnostics) {
      return null;
    }

    const metric = {
      name: String(name || "metric"),
      duration: Number(duration || 0),
      timestamp: Date.now(),
      page: state.activePage || "",
      meta: safeClone(meta)
    };

    state.metrics.push(metric);

    if (state.metrics.length > 120) {
      state.metrics.splice(0, state.metrics.length - 120);
    }

    emit("metric", metric);
    return metric;
  }

  function measure(name, callback, meta = {}) {
    if (typeof callback !== "function") {
      return undefined;
    }

    const started = now();

    try {
      const result = callback();

      if (result && typeof result.then === "function") {
        return result.finally(() => {
          const duration = now() - started;
          recordMetric(name, duration, meta);
        });
      }

      const duration = now() - started;
      recordMetric(name, duration, meta);
      return result;
    } catch (error) {
      const duration = now() - started;
      recordMetric(name, duration, {
        ...meta,
        failed: true
      });
      throw error;
    }
  }

  function configure(options = {}) {
    if (!options || typeof options !== "object") {
      return { ...state.config };
    }

    state.config = {
      ...state.config,
      ...options
    };

    prunePageCache();
    emit("configured", { config: { ...state.config } });
    return { ...state.config };
  }

  function scheduleIdle(callback, options = {}) {
    if (typeof callback !== "function") {
      return function noop() {};
    }

    const {
      timeout = state.config.idleTimeout,
      key = createId("idle"),
      replace = true
    } = options;

    if (replace) {
      cancelJob(key);
    }

    let cancelled = false;
    let nativeId = null;
    let fallbackId = null;

    const run = (deadline) => {
      if (cancelled || state.destroyed) {
        return;
      }

      state.jobs.delete(key);

      try {
        callback(
          deadline || {
            didTimeout: true,
            timeRemaining: () => 0
          }
        );
      } catch (error) {
        warn("Idle job failed:", key, error);
        emit("job-error", { key, error });
      }
    };

    if (typeof global.requestIdleCallback === "function") {
      nativeId = global.requestIdleCallback(run, { timeout });
    } else {
      fallbackId = global.setTimeout(() => run(null), Math.min(timeout, 120));
    }

    const cancel = () => {
      if (cancelled) {
        return;
      }

      cancelled = true;

      if (nativeId != null && typeof global.cancelIdleCallback === "function") {
        global.cancelIdleCallback(nativeId);
      }

      if (fallbackId != null) {
        global.clearTimeout(fallbackId);
      }

      state.jobs.delete(key);
    };

    state.jobs.set(key, cancel);
    return cancel;
  }

  function nextFrame(callback, options = {}) {
    if (typeof callback !== "function") {
      return function noop() {};
    }

    const {
      key = createId("frame"),
      replace = true
    } = options;

    if (replace) {
      cancelJob(key);
    }

    let cancelled = false;
    const raf =
      typeof global.requestAnimationFrame === "function"
        ? global.requestAnimationFrame.bind(global)
        : (fn) => global.setTimeout(() => fn(now()), 16);

    const cancelRaf =
      typeof global.cancelAnimationFrame === "function"
        ? global.cancelAnimationFrame.bind(global)
        : global.clearTimeout.bind(global);

    const frameId = raf((timestamp) => {
      state.jobs.delete(key);

      if (cancelled || state.destroyed) {
        return;
      }

      try {
        callback(timestamp);
      } catch (error) {
        warn("Frame job failed:", key, error);
        emit("job-error", { key, error });
      }
    });

    const cancel = () => {
      if (cancelled) {
        return;
      }

      cancelled = true;
      cancelRaf(frameId);
      state.jobs.delete(key);
    };

    state.jobs.set(key, cancel);
    return cancel;
  }

  function defer(callback, delay = 0, options = {}) {
    if (typeof callback !== "function") {
      return function noop() {};
    }

    const {
      key = createId("timer"),
      replace = true
    } = options;

    if (replace) {
      cancelJob(key);
    }

    let cancelled = false;

    const timerId = global.setTimeout(() => {
      state.jobs.delete(key);

      if (cancelled || state.destroyed) {
        return;
      }

      try {
        callback();
      } catch (error) {
        warn("Deferred job failed:", key, error);
        emit("job-error", { key, error });
      }
    }, Math.max(0, Number(delay) || 0));

    const cancel = () => {
      if (cancelled) {
        return;
      }

      cancelled = true;
      global.clearTimeout(timerId);
      state.jobs.delete(key);
    };

    state.jobs.set(key, cancel);
    return cancel;
  }

  function cancelJob(key) {
    const cancel = state.jobs.get(key);

    if (typeof cancel === "function") {
      try {
        cancel();
      } catch (_) {
        state.jobs.delete(key);
      }

      return true;
    }

    return false;
  }

  function cancelJobs(prefix = "") {
    const keys = [...state.jobs.keys()];

    keys.forEach((key) => {
      if (!prefix || String(key).startsWith(prefix)) {
        cancelJob(key);
      }
    });
  }

  async function processInBatches(items, worker, options = {}) {
    const source = Array.isArray(items) ? items : [];
    const execute = typeof worker === "function" ? worker : () => undefined;

    const {
      batchSize = state.config.defaultBatchSize,
      frameBudget = state.config.defaultFrameBudget,
      signal,
      onProgress
    } = options;

    const size = Math.max(1, Number(batchSize) || 1);
    const budget = Math.max(4, Number(frameBudget) || 8);

    let index = 0;
    const results = [];

    while (index < source.length) {
      if (signal?.aborted || state.destroyed) {
        break;
      }

      const frameStarted = now();
      let processed = 0;

      while (
        index < source.length &&
        processed < size &&
        now() - frameStarted < budget
      ) {
        results[index] = await execute(source[index], index, source);
        index += 1;
        processed += 1;
      }

      if (typeof onProgress === "function") {
        onProgress({
          completed: index,
          total: source.length,
          progress: source.length ? index / source.length : 1
        });
      }

      if (index < source.length) {
        await new Promise((resolve) => nextFrame(resolve));
      }
    }

    return results;
  }

  function memoize(key, factory, options = {}) {
    const {
      maxAge = 60 * 1000,
      clone = false
    } = options;

    const cacheKey = String(key);
    const existing = state.memoCache.get(cacheKey);

    if (existing && Date.now() - existing.createdAt <= maxAge) {
      return clone ? safeClone(existing.value) : existing.value;
    }

    const value = typeof factory === "function" ? factory() : factory;

    state.memoCache.set(cacheKey, {
      createdAt: Date.now(),
      value
    });

    return clone ? safeClone(value) : value;
  }

  function invalidateMemo(prefix = "") {
    if (!prefix) {
      state.memoCache.clear();
      return;
    }

    [...state.memoCache.keys()].forEach((key) => {
      if (key.startsWith(prefix)) {
        state.memoCache.delete(key);
      }
    });
  }

  function cachePage(pageId, payload, options = {}) {
    if (!state.config.enablePageCache || !pageId) {
      return false;
    }

    const {
      maxAge = state.config.cacheMaxAge,
      meta = {}
    } = options;

    const entry = {
      pageId: String(pageId),
      payload,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      maxAge,
      meta: safeClone(meta)
    };

    state.pageCache.set(entry.pageId, entry);
    prunePageCache();
    emit("page-cached", {
      pageId: entry.pageId,
      meta: entry.meta
    });

    return true;
  }

  function getCachedPage(pageId) {
    if (!state.config.enablePageCache || !pageId) {
      return null;
    }

    const key = String(pageId);
    const entry = state.pageCache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() - entry.createdAt > entry.maxAge) {
      state.pageCache.delete(key);
      emit("page-cache-expired", { pageId: key });
      return null;
    }

    entry.accessedAt = Date.now();
    emit("page-cache-hit", { pageId: key });
    return entry.payload;
  }

  function hasCachedPage(pageId) {
    return getCachedPage(pageId) != null;
  }

  function invalidatePage(pageId) {
    if (!pageId) {
      state.pageCache.clear();
      emit("page-cache-cleared", {});
      return;
    }

    const key = String(pageId);
    const deleted = state.pageCache.delete(key);

    if (deleted) {
      emit("page-cache-invalidated", { pageId: key });
    }
  }

  function prunePageCache() {
    const currentTime = Date.now();

    [...state.pageCache.entries()].forEach(([key, entry]) => {
      if (currentTime - entry.createdAt > entry.maxAge) {
        state.pageCache.delete(key);
      }
    });

    const max = Math.max(1, Number(state.config.maxCachedPages) || 1);

    if (state.pageCache.size <= max) {
      return;
    }

    const ordered = [...state.pageCache.entries()].sort(
      (a, b) => a[1].accessedAt - b[1].accessedAt
    );

    while (ordered.length && state.pageCache.size > max) {
      const [key] = ordered.shift();
      state.pageCache.delete(key);
    }
  }

  function beginRoute(pageId, meta = {}) {
    state.activePage = String(pageId || "");
    state.routeStartedAt = now();

    const token = createId("route");

    emit("route-start", {
      token,
      pageId: state.activePage,
      meta: safeClone(meta)
    });

    return token;
  }

  function endRoute(token, meta = {}) {
    const duration = state.routeStartedAt ? now() - state.routeStartedAt : 0;

    recordMetric("route", duration, {
      token,
      pageId: state.activePage,
      ...meta
    });

    if (duration >= state.config.routeWarningThreshold) {
      emit("slow-route", {
        token,
        pageId: state.activePage,
        duration,
        meta: safeClone(meta)
      });
    }

    emit("route-end", {
      token,
      pageId: state.activePage,
      duration,
      meta: safeClone(meta)
    });

    state.routeStartedAt = 0;
    return duration;
  }

  function createRenderSession(pageId = state.activePage) {
    const sessionId = createId(`render_${pageId || "page"}`);
    const controller =
      typeof AbortController === "function"
        ? new AbortController()
        : {
            signal: { aborted: false },
            abort() {
              this.signal.aborted = true;
            }
          };

    const startedAt = now();
    let finished = false;

    return {
      id: sessionId,
      pageId,
      signal: controller.signal,

      cancel(reason = "cancelled") {
        if (finished) {
          return;
        }

        controller.abort(reason);
        cancelJobs(sessionId);
        emit("render-cancelled", {
          sessionId,
          pageId,
          reason
        });
      },

      finish(meta = {}) {
        if (finished) {
          return 0;
        }

        finished = true;
        const duration = now() - startedAt;

        recordMetric("render", duration, {
          sessionId,
          pageId,
          ...meta
        });

        if (duration >= state.config.renderWarningThreshold) {
          emit("slow-render", {
            sessionId,
            pageId,
            duration,
            meta: safeClone(meta)
          });
        }

        return duration;
      }
    };
  }

  function addCleanup(callback) {
    if (typeof callback !== "function") {
      return function noop() {};
    }

    state.cleanupCallbacks.add(callback);

    return function removeCleanup() {
      state.cleanupCallbacks.delete(callback);
    };
  }

  function observeLongTasks() {
    if (
      !state.config.enableDiagnostics ||
      typeof PerformanceObserver !== "function"
    ) {
      return;
    }

    try {
      state.longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.duration >= state.config.longTaskThreshold) {
            recordMetric("long-task", entry.duration, {
              name: entry.name,
              startTime: entry.startTime
            });

            emit("long-task", {
              duration: entry.duration,
              name: entry.name
            });
          }
        });
      });

      state.longTaskObserver.observe({
        entryTypes: ["longtask"]
      });
    } catch (_) {
      state.longTaskObserver = null;
    }
  }

  function getDiagnostics() {
    const metrics = [...state.metrics];
    const routes = metrics.filter((item) => item.name === "route");
    const renders = metrics.filter((item) => item.name === "render");
    const longTasks = metrics.filter((item) => item.name === "long-task");

    const average = (entries) => {
      if (!entries.length) {
        return 0;
      }

      return (
        entries.reduce((sum, entry) => sum + entry.duration, 0) /
        entries.length
      );
    };

    return {
      version: VERSION,
      uptime: Date.now() - state.startedAt,
      activePage: state.activePage,
      cachedPages: [...state.pageCache.keys()],
      memoEntries: state.memoCache.size,
      pendingJobs: state.jobs.size,
      routeAverage: average(routes),
      renderAverage: average(renders),
      longTaskCount: longTasks.length,
      recentMetrics: metrics.slice(-30)
    };
  }

  function destroy() {
    if (state.destroyed) {
      return;
    }

    state.destroyed = true;
    cancelJobs();

    state.cleanupCallbacks.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        warn("Cleanup failed:", error);
      }
    });

    state.cleanupCallbacks.clear();
    state.listeners.clear();
    state.pageCache.clear();
    state.memoCache.clear();
    state.metrics.length = 0;

    try {
      state.longTaskObserver?.disconnect?.();
    } catch (_) {
      // Ignore observer cleanup errors.
    }

    state.longTaskObserver = null;
  }

  const api = Object.freeze({
    version: VERSION,
    configure,
    on,
    emit,
    measure,
    recordMetric,
    scheduleIdle,
    nextFrame,
    defer,
    cancelJob,
    cancelJobs,
    processInBatches,
    memoize,
    invalidateMemo,
    cachePage,
    getCachedPage,
    hasCachedPage,
    invalidatePage,
    prunePageCache,
    beginRoute,
    endRoute,
    createRenderSession,
    addCleanup,
    getDiagnostics,
    destroy
  });

  Object.defineProperty(global, NAMESPACE, {
    configurable: false,
    enumerable: true,
    writable: false,
    value: api
  });

  observeLongTasks();
  emit("ready", { version: VERSION });
  log("Ready", VERSION);
})(window);
