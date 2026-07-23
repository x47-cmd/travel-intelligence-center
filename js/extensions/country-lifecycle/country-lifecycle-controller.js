/* =========================================================
   Travel Intelligence Center
   Country Lifecycle Controller V1.0.0
   Country Lifecycle System - UI Orchestration & Action Controller

   File Path:
   js/extensions/country-lifecycle/country-lifecycle-controller.js

   Purpose:
   - Connects CountryLifecycleEngine, Model and ItineraryParser.
   - Exposes stable commands for the future Guide V6 interface.
   - Keeps UI logic out of frozen legacy files.
   - Handles create, edit, convert, activate and complete actions.
   - Handles itinerary paste, place progress and checklist updates.
   - Emits scoped controller events for page modules.
   - Prevents duplicate bindings and stale actions.
   - Supports progressive integration with the current application.
   ========================================================= */

(function countryLifecycleControllerBootstrap(global) {
  'use strict';

  if (!global || global.CountryLifecycleController?.__initialized) {
    return;
  }

  const VERSION = '1.0.0';

  const EVENT = Object.freeze({
    READY: 'tic:country-lifecycle-controller:ready',
    STATE: 'tic:country-lifecycle-controller:state',
    ACTION_START: 'tic:country-lifecycle-controller:action-start',
    ACTION_SUCCESS: 'tic:country-lifecycle-controller:action-success',
    ACTION_ERROR: 'tic:country-lifecycle-controller:action-error',
    SELECTION: 'tic:country-lifecycle-controller:selection',
    FILTER: 'tic:country-lifecycle-controller:filter',
    MODAL: 'tic:country-lifecycle-controller:modal',
    REFRESH: 'tic:country-lifecycle-controller:refresh'
  });

  const VIEW = Object.freeze({
    WISHLIST: 'wishlist',
    UPCOMING: 'upcoming',
    ACTIVE: 'active',
    PASSPORT: 'completed',
    ALL: 'all'
  });

  const ACTION = Object.freeze({
    CREATE_COUNTRY: 'create-country',
    UPDATE_COUNTRY: 'update-country',
    DELETE_COUNTRY: 'delete-country',
    ARCHIVE_COUNTRY: 'archive-country',
    CONVERT_TO_UPCOMING: 'convert-to-upcoming',
    ACTIVATE_TRIP: 'activate-trip',
    COMPLETE_TRIP: 'complete-trip',
    IMPORT_ITINERARY: 'import-itinerary',
    MARK_VISITED: 'mark-visited',
    SKIP_PLACE: 'skip-place',
    RESET_PLACE: 'reset-place',
    TOGGLE_CHECKLIST: 'toggle-checklist',
    ADD_EXPENSE: 'add-expense',
    SELECT_COUNTRY: 'select-country',
    SELECT_VIEW: 'select-view',
    REFRESH: 'refresh'
  });

  const runtime = {
    initialized: false,
    destroyed: false,
    busy: false,
    selectedCountryId: '',
    selectedView: VIEW.WISHLIST,
    query: '',
    modal: null,
    lastAction: null,
    lastError: null,
    listeners: [],
    actionQueue: Promise.resolve(),
    stateRevision: 0
  };

  function nowISO() {
    return new Date().toISOString();
  }

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function asString(value, fallback = '') {
    if (value === null || value === undefined) {
      return fallback;
    }

    return String(value).trim();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function clone(value) {
    if (value === undefined) {
      return undefined;
    }

    try {
      if (typeof structuredClone === 'function') {
        return structuredClone(value);
      }
    } catch (_) {
      // Continue to JSON fallback.
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  function dispatch(name, detail = {}) {
    try {
      global.dispatchEvent(
        new CustomEvent(name, {
          detail: clone({
            version: VERSION,
            timestamp: nowISO(),
            ...detail
          })
        })
      );
    } catch (_) {
      // Controller events are supplementary.
    }
  }

  function getEngine() {
    return global.CountryLifecycleEngine || null;
  }

  function getModel() {
    return global.CountryLifecycleModel || null;
  }

  function getParser() {
    return global.ItineraryParser || null;
  }

  function ensureEngine() {
    const engine = getEngine();

    if (!engine) {
      throw new Error('CountryLifecycleEngine is not available.');
    }

    if (!engine.isReady?.()) {
      engine.init?.();
    }

    return engine;
  }

  function normalizeView(view) {
    const value = asString(view).toLowerCase();
    return Object.values(VIEW).includes(value) ? value : VIEW.WISHLIST;
  }

  function matchesQuery(record, query) {
    const normalizedQuery = asString(query).toLowerCase();

    if (!normalizedQuery) {
      return true;
    }

    const fields = [
      record.name,
      record.localizedName,
      record.countryCode,
      record.city,
      record.summary,
      record.notes,
      ...(record.tags || [])
    ];

    return fields.some((field) =>
      asString(field).toLowerCase().includes(normalizedQuery)
    );
  }

  function getRecordsForView(view = runtime.selectedView) {
    const engine = ensureEngine();
    const normalizedView = normalizeView(view);

    const records = normalizedView === VIEW.ALL
      ? engine.getAll()
      : engine.getByStatus(normalizedView);

    return records.filter((record) => matchesQuery(record, runtime.query));
  }

  function getSelectedCountry() {
    if (!runtime.selectedCountryId) {
      return null;
    }

    return ensureEngine().getById(runtime.selectedCountryId);
  }

  function getState() {
    const engine = getEngine();
    const records = engine?.isReady?.()
      ? getRecordsForView(runtime.selectedView)
      : [];

    return clone({
      version: VERSION,
      initialized: runtime.initialized,
      busy: runtime.busy,
      selectedCountryId: runtime.selectedCountryId,
      selectedCountry: getSelectedCountry(),
      selectedView: runtime.selectedView,
      query: runtime.query,
      modal: runtime.modal,
      lastAction: runtime.lastAction,
      lastError: runtime.lastError,
      records,
      stats: engine?.getStats?.() || null,
      revision: runtime.stateRevision
    });
  }

  function publishState(reason = 'update') {
    runtime.stateRevision += 1;

    dispatch(EVENT.STATE, {
      reason,
      state: getState()
    });

    return getState();
  }

  function setBusy(value, action = '') {
    runtime.busy = Boolean(value);

    if (runtime.busy) {
      dispatch(EVENT.ACTION_START, {
        action,
        state: getState()
      });
    }
  }

  function execute(action, task) {
    runtime.actionQueue = runtime.actionQueue
      .catch(() => undefined)
      .then(async () => {
        setBusy(true, action);
        runtime.lastAction = action;
        runtime.lastError = null;
        publishState('action-start');

        try {
          const result = await task();

          dispatch(EVENT.ACTION_SUCCESS, {
            action,
            result
          });

          return result;
        } catch (error) {
          const normalizedError =
            error instanceof Error
              ? error
              : new Error(asString(error, 'Unknown controller error.'));

          runtime.lastError = {
            action,
            message: normalizedError.message,
            timestamp: nowISO()
          };

          dispatch(EVENT.ACTION_ERROR, {
            action,
            message: normalizedError.message
          });

          throw normalizedError;
        } finally {
          runtime.busy = false;
          publishState('action-finish');
        }
      });

    return runtime.actionQueue;
  }

  function selectView(view) {
    runtime.selectedView = normalizeView(view);

    dispatch(EVENT.FILTER, {
      view: runtime.selectedView,
      query: runtime.query
    });

    return publishState('select-view');
  }

  function setSearchQuery(query) {
    runtime.query = asString(query);

    dispatch(EVENT.FILTER, {
      view: runtime.selectedView,
      query: runtime.query
    });

    return publishState('search');
  }

  function selectCountry(id) {
    const countryId = asString(id);

    if (countryId && !ensureEngine().getById(countryId)) {
      throw new Error('Country record not found.');
    }

    runtime.selectedCountryId = countryId;

    dispatch(EVENT.SELECTION, {
      countryId,
      country: getSelectedCountry()
    });

    return publishState('select-country');
  }

  function clearSelection() {
    return selectCountry('');
  }

  function openModal(type, payload = {}) {
    runtime.modal = {
      type: asString(type),
      payload: isObject(payload) ? clone(payload) : {},
      openedAt: nowISO()
    };

    dispatch(EVENT.MODAL, {
      open: true,
      modal: runtime.modal
    });

    return publishState('open-modal');
  }

  function closeModal() {
    const previous = runtime.modal;
    runtime.modal = null;

    dispatch(EVENT.MODAL, {
      open: false,
      modal: previous
    });

    return publishState('close-modal');
  }

  function createCountry(input) {
    return execute(ACTION.CREATE_COUNTRY, async () => {
      const engine = ensureEngine();
      const model = getModel();

      const payload = model?.createCountry
        ? model.createCountry(input)
        : input;

      const validation = model?.validateCountry?.(payload);

      if (validation && !validation.valid) {
        const message = validation.errors
          .map((issue) => issue.message)
          .join(' ');

        throw new Error(message || 'Country data is invalid.');
      }

      const created = engine.create(payload, {
        source: 'country-lifecycle-controller'
      });

      runtime.selectedCountryId = created.id;
      runtime.selectedView = created.status;

      return created;
    });
  }

  function updateCountry(id, patch) {
    return execute(ACTION.UPDATE_COUNTRY, async () => {
      const engine = ensureEngine();
      const current = engine.getById(id);

      if (!current) {
        throw new Error('Country record not found.');
      }

      const model = getModel();
      const merged = model?.mergeCountry
        ? model.mergeCountry(current, patch)
        : patch;

      const validation = model?.validateCountry?.(merged);

      if (validation && !validation.valid) {
        throw new Error(
          validation.errors.map((issue) => issue.message).join(' ')
        );
      }

      return engine.update(id, patch, {
        reason: 'controller-update'
      });
    });
  }

  function deleteCountry(id, options = {}) {
    return execute(
      options.archive === false
        ? ACTION.DELETE_COUNTRY
        : ACTION.ARCHIVE_COUNTRY,
      async () => {
        const engine = ensureEngine();
        const removed = engine.remove(id, {
          archive: options.archive !== false
        });

        if (runtime.selectedCountryId === id) {
          runtime.selectedCountryId = '';
        }

        return removed;
      }
    );
  }

  function convertToUpcoming(id, tripDetails) {
    return execute(ACTION.CONVERT_TO_UPCOMING, async () => {
      const engine = ensureEngine();
      const model = getModel();
      const current = engine.getById(id);

      if (!current) {
        throw new Error('Country record not found.');
      }

      const candidate = model?.mergeCountry
        ? model.mergeCountry(current, {
            dates: {
              startDate:
                tripDetails?.startDate ||
                tripDetails?.dates?.startDate,
              endDate:
                tripDetails?.endDate ||
                tripDetails?.dates?.endDate
            },
            travelers: tripDetails?.travelers,
            transport: tripDetails?.transport,
            trip: tripDetails?.trip
          })
        : current;

      const transitionValidation = model?.validateTransition?.(
        candidate,
        'upcoming'
      );

      if (transitionValidation && !transitionValidation.valid) {
        throw new Error(
          transitionValidation.issues
            .map((issue) => issue.message)
            .join(' ')
        );
      }

      const updated = engine.convertWishlistToUpcoming(id, tripDetails);
      runtime.selectedView = VIEW.UPCOMING;
      runtime.selectedCountryId = updated.id;

      return updated;
    });
  }

  function activateTrip(id, options = {}) {
    return execute(ACTION.ACTIVATE_TRIP, async () => {
      const updated = ensureEngine().activate(id, options);
      runtime.selectedView = VIEW.ACTIVE;
      runtime.selectedCountryId = updated.id;
      return updated;
    });
  }

  function completeTrip(id, data = {}) {
    return execute(ACTION.COMPLETE_TRIP, async () => {
      const updated = ensureEngine().complete(id, data);
      runtime.selectedView = VIEW.PASSPORT;
      runtime.selectedCountryId = updated.id;
      return updated;
    });
  }

  function importItinerary(id, text, options = {}) {
    return execute(ACTION.IMPORT_ITINERARY, async () => {
      const parser = getParser();

      if (!parser) {
        throw new Error('ItineraryParser is not available.');
      }

      const validation = parser.validate(text);

      if (!validation.valid) {
        throw new Error(
          validation.issues
            .filter((issue) => issue.severity === 'error')
            .map((issue) => issue.message)
            .join(' ')
        );
      }

      const parsed = parser.parseToModel(text, options);
      const engine = ensureEngine();
      const current = engine.getById(id);

      if (!current) {
        throw new Error('Country record not found.');
      }

      let days = parsed.days;

      if (options.merge) {
        days = parser.mergeParsedDays(
          current.itinerary?.days,
          parsed.days,
          { replace: false }
        );
      }

      if (options.addMapLinks !== false) {
        days = parser.enrichWithMapLinks(days);
      }

      const record = engine.setItinerary(id, {
        rawText: parsed.rawText,
        parserVersion: parser.version,
        days
      }, {
        parserVersion: parser.version
      });

      return {
        record,
        parsed: {
          ...parsed,
          days
        }
      };
    });
  }

  function markPlaceVisited(recordId, dayId, placeId, metadata = {}) {
    return execute(ACTION.MARK_VISITED, async () =>
      ensureEngine().markPlaceVisited(
        recordId,
        dayId,
        placeId,
        metadata
      )
    );
  }

  function skipPlace(recordId, dayId, placeId, metadata = {}) {
    return execute(ACTION.SKIP_PLACE, async () =>
      ensureEngine().skipPlace(
        recordId,
        dayId,
        placeId,
        metadata
      )
    );
  }

  function resetPlace(recordId, dayId, placeId) {
    return execute(ACTION.RESET_PLACE, async () =>
      ensureEngine().resetPlace(recordId, dayId, placeId)
    );
  }

  function toggleChecklist(recordId, itemId, completed) {
    return execute(ACTION.TOGGLE_CHECKLIST, async () =>
      ensureEngine().toggleChecklistItem(
        recordId,
        itemId,
        completed
      )
    );
  }

  function addExpense(recordId, expense) {
    return execute(ACTION.ADD_EXPENSE, async () =>
      ensureEngine().addExpense(recordId, expense)
    );
  }

  function refresh(reason = 'manual') {
    return execute(ACTION.REFRESH, async () => {
      const engine = ensureEngine();
      engine.synchronizeStatuses?.();

      dispatch(EVENT.REFRESH, {
        reason
      });

      return getState();
    });
  }

  function getDashboardData() {
    const engine = ensureEngine();
    const active = engine.getCurrentActive();
    const upcoming = engine.getUpcoming(1)[0] || null;
    const wishlist = engine.getByStatus('wishlist');
    const completed = engine.getByStatus('completed');

    return clone({
      active,
      upcoming,
      wishlistCount: wishlist.length,
      completedCount: completed.length,
      stats: engine.getStats()
    });
  }

  function getCountrySummary(id) {
    const engine = ensureEngine();
    const model = getModel();
    const country = engine.getById(id);

    if (!country) {
      return null;
    }

    return clone({
      country,
      countdown: model?.getCountdown?.(country) ?? engine.getCountdown(id),
      duration: model?.getDuration?.(country) ?? null,
      currentDay:
        model?.getCurrentDay?.(country) ??
        engine.getCurrentDay(id),
      nextPlace: model?.getNextPendingPlace?.(country) ?? null,
      tripProgress:
        model?.calculateTripProgress?.(country) ?? null,
      checklistReadiness:
        model?.calculateChecklistReadiness?.(
          country.trip?.checklist
        ) ?? country.trip?.readiness ?? 0,
      spent:
        model?.calculateSpent?.(country) ?? 0,
      remainingBudget:
        model?.calculateRemainingBudget?.(country) ?? 0
    });
  }

  function bindEngineEvents() {
    const eventNames = [
      'tic:country-lifecycle:change',
      'tic:country-lifecycle:transition',
      'tic:country-lifecycle:day-progress',
      'tic:country-lifecycle:place-status'
    ];

    const handler = () => {
      if (runtime.destroyed) {
        return;
      }

      publishState('engine-event');
    };

    eventNames.forEach((name) => {
      global.addEventListener(name, handler, {
        passive: true
      });

      runtime.listeners.push(() => {
        global.removeEventListener(name, handler);
      });
    });
  }

  function init() {
    if (runtime.initialized && !runtime.destroyed) {
      return api;
    }

    runtime.initialized = true;
    runtime.destroyed = false;

    ensureEngine();
    bindEngineEvents();

    dispatch(EVENT.READY, {
      state: getState()
    });

    publishState('init');

    return api;
  }

  function destroy() {
    if (runtime.destroyed) {
      return;
    }

    runtime.destroyed = true;
    runtime.initialized = false;

    for (const cleanup of runtime.listeners.splice(0)) {
      try {
        cleanup();
      } catch (_) {
        // Continue cleanup.
      }
    }
  }

  const api = Object.freeze({
    __initialized: true,
    version: VERSION,

    EVENT,
    VIEW,
    ACTION,

    init,
    destroy,

    getState,
    getDashboardData,
    getCountrySummary,
    getRecordsForView,
    getSelectedCountry,

    selectView,
    setSearchQuery,
    selectCountry,
    clearSelection,

    openModal,
    closeModal,

    createCountry,
    updateCountry,
    deleteCountry,
    convertToUpcoming,
    activateTrip,
    completeTrip,
    importItinerary,

    markPlaceVisited,
    skipPlace,
    resetPlace,
    toggleChecklist,
    addExpense,

    refresh
  });

  global.CountryLifecycleController = api;

  if (global.document?.readyState === 'loading') {
    global.document.addEventListener(
      'DOMContentLoaded',
      () => api.init(),
      { once: true }
    );
  } else {
    api.init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
