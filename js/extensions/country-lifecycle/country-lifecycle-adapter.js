/* =========================================================
   Travel Intelligence Center
   Country Lifecycle Adapter V1.0.0

   File Path:
   js/extensions/country-lifecycle/country-lifecycle-adapter.js

   Purpose:
   - Freezes the legacy Guide page without deleting it.
   - Keeps the old Guide implementation available as a safe fallback.
   - Replaces Guide runtime rendering with CountryLifecyclePage.
   - Does not modify js/pages/guide.js.
   ========================================================= */

(function countryLifecycleAdapterBootstrap(global) {
  'use strict';

  if (!global || global.CountryLifecycleAdapter?.__initialized) {
    return;
  }

  const VERSION = '1.0.0';
  const VIEW_SELECTOR = '[data-router-view], #app-view';

  const state = {
    mounted: false,
    container: null,
    legacyGuidePage: global.GuidePage || null
  };

  function getContainer(target) {
    if (target instanceof Element) {
      return target;
    }

    return global.document?.querySelector(VIEW_SELECTOR) || null;
  }

  function ensureModules() {
    const required = [
      'CountryLifecycleEngine',
      'CountryLifecycleModel',
      'ItineraryParser',
      'CountryLifecycleController',
      'CountryLifecyclePage',
      'ActiveTripEngine',
      'PassportEngine'
    ];

    const missing = required.filter((name) => !global[name]);

    if (missing.length) {
      throw new Error(
        `Country Lifecycle modules are missing: ${missing.join(', ')}`
      );
    }
  }

  function startModules() {
    global.CountryLifecycleEngine?.init?.();
    global.CountryLifecycleController?.init?.();
    global.ActiveTripEngine?.init?.();
    global.PassportEngine?.init?.();
  }

  function mount(target) {
    const container = getContainer(target);

    if (!container) {
      throw new Error('Guide page container was not found.');
    }

    ensureModules();
    startModules();

    if (state.mounted && state.container === container) {
      global.CountryLifecyclePage?.refresh?.();
      return container;
    }

    unmount();

    state.container = container;
    global.CountryLifecyclePage.mount(container);
    state.mounted = true;

    return container;
  }

  function refresh() {
    if (!state.mounted) {
      return mount();
    }

    global.CountryLifecyclePage?.refresh?.();
    return state.container;
  }

  function unmount() {
    if (!state.mounted) {
      return;
    }

    try {
      global.CountryLifecyclePage?.unmount?.();
    } finally {
      state.mounted = false;
      state.container = null;
    }
  }

  function render(target) {
    return mount(target);
  }

  function init(target) {
    return mount(target);
  }

  function fallback(target) {
    const legacy = state.legacyGuidePage;

    if (!legacy) {
      throw new Error('Legacy Guide fallback is not available.');
    }

    if (typeof legacy.mount === 'function') {
      return legacy.mount(getContainer(target));
    }

    if (typeof legacy.init === 'function') {
      return legacy.init(getContainer(target));
    }

    if (typeof legacy.render === 'function') {
      return legacy.render(getContainer(target));
    }

    throw new Error('Legacy Guide fallback has no supported page API.');
  }

  const pageApi = Object.freeze({
    version: VERSION,
    init,
    mount,
    render,
    refresh,
    unmount,
    destroy: unmount
  });

  const adapterApi = Object.freeze({
    __initialized: true,
    version: VERSION,
    page: pageApi,
    mount,
    refresh,
    unmount,
    fallback,
    getLegacyGuidePage() {
      return state.legacyGuidePage;
    }
  });

  global.CountryLifecycleAdapter = adapterApi;

  /*
   * Runtime freeze:
   * guide.js remains loaded and untouched, but the router receives
   * the new page API from this point onward.
   */
  global.LegacyGuidePage = state.legacyGuidePage;
  global.GuidePage = pageApi;
})(typeof window !== 'undefined' ? window : globalThis);
