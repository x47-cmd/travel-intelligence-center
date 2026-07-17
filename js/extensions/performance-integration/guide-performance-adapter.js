/* =========================================================
   Travel Intelligence Center
   Guide Performance Adapter V1.0.0

   File Path:
   js/extensions/performance-integration/guide-performance-adapter.js

   Purpose:
   - Optimizes the Guide page without modifying the frozen legacy file.
   - Defers heavy country-card work until needed.
   - Applies safe content-visibility and containment.
   - Lazily activates images and non-critical guide regions.
   - Preserves search and scroll responsiveness.
   - Works with existing performance modules when available.
   - Fails safely when selectors or optional APIs are unavailable.

   Required Load Order:
   1) js/extensions/performance-integration/integration-core.js
   2) js/extensions/performance-integration/app-route-adapter.js
   3) js/extensions/performance-integration/guide-performance-adapter.js
   ========================================================= */

(function guidePerformanceAdapterBootstrap(global) {
  "use strict";

  if (!global || global.TravelGuidePerformanceAdapter?.version) {
    return;
  }

  const VERSION = "1.0.0";
  const NAME = "TravelGuidePerformanceAdapter";

  const DEFAULT_CONFIG = Object.freeze({
    debug: false,
    route: "guide",
    refreshDebounceMs: 56,
    searchDebounceMs: 120,
    idleTimeoutMs: 1200,
    minimumVirtualizedItems: 8,
    sectionSelectors: [
      "[data-guide-section]",
      ".guide-section",
      ".guide-results",
      ".guide-grid",
      ".countries-grid",
      ".country-list",
      ".destination-list",
      ".guide-categories",
      ".guide-content",
      ".guide-recommendations"
    ],
    itemSelectors: [
      "[data-country-code]",
      "[data-guide-card]",
      ".guide-card",
      ".country-card",
      ".destination-card",
      ".guide-result-card"
    ],
    imageSelectors: [
      "img[data-src]",
      "img[loading='lazy']",
      ".guide-card img",
      ".country-card img",
      ".destination-card img"
    ],
    searchSelectors: [
      "input[type='search']",
      "[data-guide-search]",
      "#guide-search",
      ".guide-search input"
    ],
    dynamicRootSelectors: [
      "[data-page='guide']",
      "[data-route='guide']",
      "#guide-page",
      ".guide-page",
      ".page-guide"
    ]
  });

  const state = {
    config: { ...DEFAULT_CONFIG },
    registered: false,
    active: false,
    destroyed: false,
    root: null,
    pageRoot: null,
    observer: null,
    refreshTimer: null,
    searchTimer: null,
    idleHandle: null,
    cleanupCallbacks: new Set(),
    enhancedSections: new WeakSet(),
    enhancedItems: new WeakSet(),
    boundSearchInputs: new WeakSet(),
    scrollY: 0,
    lastRefreshAt: 0,
    lastQuery: ""
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

  function getVirtualScroll() {
    return global.TravelVirtualScroll || null;
  }

  function getImageLazyLoader() {
    return global.TravelImageLazyLoader || null;
  }

  function getRenderOptimizer() {
    return global.TravelRenderOptimizer || null;
  }

  function getPerformanceCore() {
    return global.TravelPerformance || null;
  }

  function getPageRoot(root = state.root) {
    if (!root) {
      return null;
    }

    for (const selector of state.config.dynamicRootSelectors) {
      try {
        const element = root.matches?.(selector)
          ? root
          : root.querySelector?.(selector);

        if (element) {
          return element;
        }
      } catch (_) {
        // Ignore invalid selectors.
      }
    }

    return root;
  }

  function queryAll(selectors, root = state.pageRoot) {
    if (!root) {
      return [];
    }

    const results = new Set();

    selectors.forEach((selector) => {
      try {
        root.querySelectorAll(selector).forEach((element) => {
          results.add(element);
        });
      } catch (_) {
        // Ignore invalid selectors.
      }
    });

    return [...results];
  }

  function applySectionContainment(section) {
    if (!section || state.enhancedSections.has(section)) {
      return;
    }

    state.enhancedSections.add(section);

    section.style.setProperty("content-visibility", "auto");
    section.style.setProperty(
      "contain-intrinsic-size",
      section.dataset.intrinsicSize || "1px 760px"
    );

    if (!section.style.contain) {
      section.style.setProperty("contain", "layout paint style");
    }

    section.dataset.performanceEnhanced = "true";
  }

  function applyItemContainment(item) {
    if (!item || state.enhancedItems.has(item)) {
      return;
    }

    state.enhancedItems.add(item);

    item.style.setProperty("content-visibility", "auto");
    item.style.setProperty(
      "contain-intrinsic-size",
      item.dataset.intrinsicSize || "1px 240px"
    );

    item.dataset.performanceItem = "true";
  }

  function enhanceImages() {
    const images = queryAll(state.config.imageSelectors);

    images.forEach((image) => {
      if (!(image instanceof HTMLImageElement)) {
        return;
      }

      if (!image.loading) {
        image.loading = "lazy";
      }

      image.decoding = "async";
      image.fetchPriority = "low";
    });

    try {
      getImageLazyLoader()?.observe?.(images);
    } catch (_) {
      // Optional API.
    }

    return images.length;
  }

  function enhanceSections() {
    const sections = queryAll(state.config.sectionSelectors);
    sections.forEach(applySectionContainment);
    return sections.length;
  }

  function enhanceItems() {
    const items = queryAll(state.config.itemSelectors);

    items.forEach(applyItemContainment);

    if (items.length >= state.config.minimumVirtualizedItems) {
      try {
        getVirtualScroll()?.observe?.(items, {
          root: null,
          rootMargin: "420px 0px",
          threshold: 0.01
        });
      } catch (_) {
        // Optional API.
      }
    }

    return items.length;
  }

  function handleSearchInput(event) {
    const input = event.currentTarget;
    const value = String(input?.value || "").trim();

    state.lastQuery = value;

    if (state.searchTimer) {
      clearTimeout(state.searchTimer);
    }

    state.searchTimer = setTimeout(() => {
      state.searchTimer = null;

      const optimizer = getRenderOptimizer();

      if (optimizer?.render) {
        optimizer.render(
          `${NAME}:search-refresh`,
          () => performRefresh("guide-search")
        );
      } else {
        performRefresh("guide-search");
      }
    }, state.config.searchDebounceMs);
  }

  function bindSearchInputs() {
    const inputs = queryAll(state.config.searchSelectors);

    inputs.forEach((input) => {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }

      if (state.boundSearchInputs.has(input)) {
        return;
      }

      state.boundSearchInputs.add(input);
      input.addEventListener("input", handleSearchInput, {
        passive: true
      });

      state.cleanupCallbacks.add(() => {
        input.removeEventListener("input", handleSearchInput);
      });
    });

    return inputs.length;
  }

  function runIdleTasks() {
    cancelIdleTasks();

    const task = () => {
      state.idleHandle = null;

      if (!state.active || state.destroyed) {
        return;
      }

      enhanceImages();

      try {
        getPerformanceCore()?.scheduleIdle?.(
          () => {
            if (!state.active || state.destroyed) {
              return;
            }

            queryAll(["button", "a", "[role='button']"]).forEach((element) => {
              element.style.setProperty(
                "-webkit-tap-highlight-color",
                "transparent"
              );
            });
          },
          {
            timeout: state.config.idleTimeoutMs
          }
        );
      } catch (_) {
        // Optional API.
      }
    };

    if (typeof global.requestIdleCallback === "function") {
      state.idleHandle = global.requestIdleCallback(task, {
        timeout: state.config.idleTimeoutMs
      });
    } else {
      state.idleHandle = global.setTimeout(task, 120);
    }
  }

  function cancelIdleTasks() {
    if (state.idleHandle == null) {
      return;
    }

    if (typeof global.cancelIdleCallback === "function") {
      global.cancelIdleCallback(state.idleHandle);
    } else {
      global.clearTimeout(state.idleHandle);
    }

    state.idleHandle = null;
  }

  function performRefresh(reason = "manual") {
    if (!state.active || !state.pageRoot || state.destroyed) {
      return null;
    }

    state.lastRefreshAt = Date.now();

    const result = {
      route: state.config.route,
      reason,
      sections: enhanceSections(),
      items: enhanceItems(),
      images: enhanceImages(),
      searchInputs: bindSearchInputs(),
      lastQuery: state.lastQuery,
      refreshedAt: state.lastRefreshAt
    };

    runIdleTasks();
    log("Refreshed", result);
    return result;
  }

  function scheduleRefresh(reason = "scheduled") {
    if (state.refreshTimer) {
      clearTimeout(state.refreshTimer);
    }

    state.refreshTimer = setTimeout(() => {
      state.refreshTimer = null;

      const optimizer = getRenderOptimizer();

      if (optimizer?.render) {
        optimizer.render(
          `${NAME}:refresh`,
          () => performRefresh(reason)
        );
      } else {
        performRefresh(reason);
      }
    }, state.config.refreshDebounceMs);
  }

  function bindMutationObserver() {
    if (
      typeof MutationObserver !== "function" ||
      !state.pageRoot ||
      state.observer
    ) {
      return;
    }

    state.observer = new MutationObserver((mutations) => {
      const hasRelevantChanges = mutations.some((mutation) => {
        return (
          mutation.type === "childList" &&
          (mutation.addedNodes.length > 0 ||
            mutation.removedNodes.length > 0)
        );
      });

      if (hasRelevantChanges) {
        scheduleRefresh("guide-dom-changed");
      }
    });

    state.observer.observe(state.pageRoot, {
      childList: true,
      subtree: true
    });
  }

  function unbindMutationObserver() {
    try {
      state.observer?.disconnect?.();
    } catch (_) {
      // Ignore cleanup errors.
    }

    state.observer = null;
  }

  function restoreScroll() {
    if (!state.scrollY) {
      return;
    }

    requestAnimationFrame(() => {
      global.scrollTo({
        top: state.scrollY,
        left: 0,
        behavior: "auto"
      });
    });
  }

  function saveScroll() {
    state.scrollY = global.scrollY || 0;
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

  function register(context = {}) {
    if (state.registered || state.destroyed) {
      return true;
    }

    state.registered = true;

    const integration = context.integration || getIntegration();

    if (integration && integration.getAdapter?.(state.config.route) !== api) {
      integration.registerAdapter?.(state.config.route, api);
    }

    log("Registered");
    return true;
  }

  function activate(context = {}) {
    if (state.destroyed) {
      return null;
    }

    state.active = true;
    state.root =
      context.root ||
      getIntegration()?.getAppRoot?.() ||
      document.body;

    state.pageRoot = getPageRoot(state.root);

    if (!state.pageRoot) {
      warn("Guide page root was not found.");
      return null;
    }

    bindMutationObserver();
    restoreScroll();

    const result = performRefresh(
      context.context?.reason || "route-activate"
    );

    try {
      getPerformanceCore()?.emit?.("guide-performance-activated", {
        route: state.config.route,
        result
      });
    } catch (_) {
      // Optional API.
    }

    return result;
  }

  function deactivate() {
    if (!state.active) {
      return;
    }

    saveScroll();
    state.active = false;

    if (state.refreshTimer) {
      clearTimeout(state.refreshTimer);
      state.refreshTimer = null;
    }

    if (state.searchTimer) {
      clearTimeout(state.searchTimer);
      state.searchTimer = null;
    }

    cancelIdleTasks();
    unbindMutationObserver();

    state.root = null;
    state.pageRoot = null;

    log("Deactivated");
  }

  function refresh(context = {}) {
    if (!state.active || state.destroyed) {
      return null;
    }

    state.root = context.root || state.root;
    state.pageRoot = getPageRoot(state.root);

    scheduleRefresh(context.reason || "adapter-refresh");
    return getStatus();
  }

  function invalidate(context = {}) {
    state.enhancedSections = new WeakSet();
    state.enhancedItems = new WeakSet();
    state.boundSearchInputs = new WeakSet();

    if (state.active) {
      scheduleRefresh(context.reason || "adapter-invalidated");
    }
  }

  function getStatus() {
    return {
      version: VERSION,
      registered: state.registered,
      active: state.active,
      hasRoot: Boolean(state.pageRoot),
      scrollY: state.scrollY,
      lastQuery: state.lastQuery,
      lastRefreshAt: state.lastRefreshAt
    };
  }

  function destroy() {
    if (state.destroyed) {
      return;
    }

    deactivate();
    state.destroyed = true;

    state.cleanupCallbacks.forEach((cleanup) => {
      try {
        cleanup();
      } catch (_) {
        // Ignore cleanup errors.
      }
    });

    state.cleanupCallbacks.clear();
    state.registered = false;
  }

  const api = Object.freeze({
    version: VERSION,
    configure,
    register,
    activate,
    deactivate,
    refresh,
    invalidate,
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
      () => register(),
      { once: true }
    );
  } else {
    register();
  }
})(window);
