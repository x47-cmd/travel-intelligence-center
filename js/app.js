/* =========================================================
   Travel Intelligence Center
   Application Bootstrap V4.0.0
   Unified Guide + Trips + Budget Runtime

   File Path:
   js/app.js

   Purpose:
   - Bootstraps the complete application safely.
   - Connects Config, Data, Store, Router, UI, Features and Pages.
   - Initializes the new compact Guide Intelligence architecture:
     WorldGuideData, GuideEngine, TravelAI and PlannerEngine.
   - Preserves all existing Budget Intelligence engines.
   - Registers all available page modules.
   - Restores the requested route when possible.
   - Falls back to the Home page when needed.
   - Keeps the application stable on iPhone and desktop.
   - Prevents duplicate initialization and duplicate routing.
   - Supports synchronous and asynchronous module initialization.
   - Provides complete runtime diagnostics.
   - Preserves compatibility with legacy Guide Intelligence modules
     when they are still loaded.

   Required load order:
   - js/config.js
   - js/data.js
   - js/store.js
   - js/router.js
   - js/ui.js
   - js/data/world-data.js
   - js/features/guide-engine.js
   - js/features/travel-ai.js
   - js/features/planner-engine.js
   - js/features/trip-form.js
   - Budget Intelligence engine files
   - js/pages/home.js
   - js/pages/trips.js
   - js/pages/guide.js
   - js/pages/budget.js
   - js/pages/more.js
   - js/app.js

   Global APIs:
   - window.TIC.App
   - window.TICApp
========================================================= */

(function applicationBootstrapFactory(window, document) {
  "use strict";

  window.TIC = window.TIC || {};

  const TIC = window.TIC;
  const APP_VERSION = "4.0.0";

  const FEATURE_GROUP = Object.freeze({
    CORE: "core",
    GUIDE: "guide",
    BUDGET: "budget",
    LEGACY_GUIDE: "legacy-guide",
    OTHER: "other"
  });

  const state = {
    initialized: false,
    started: false,
    starting: false,
    restarting: false,
    container: null,
    registeredPages: new Set(),
    initializedFeatures: new Set(),
    featureResults: new Map(),
    pageResults: new Map(),
    errors: [],
    warnings: [],
    startTime: null,
    endTime: null,
    activeRoute: null,
    storeUnsubscribe: null,
    eventBindings: [],
    startupPromise: null,
    routerStarted: false
  };

  /* =========================================================
     Utilities
  ========================================================= */

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

  const isObject = (value) =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);

  const nowISO = () =>
    new Date().toISOString();

  const normalizeRoute = (value) =>
    String(value || "")
      .trim()
      .replace(/^#\/?/, "")
      .split("?")[0]
      .split("/")[0] || "home";

  const getContainer = () =>
    document.querySelector("[data-router-view]") ||
    document.querySelector("#app-view") ||
    document.querySelector("#tic-page") ||
    document.querySelector("#app-content") ||
    document.querySelector("#app");

  const isPromiseLike = (value) =>
    value &&
    typeof value.then === "function";

  const settle = async (value) =>
    isPromiseLike(value)
      ? await value
      : value;

  const dispatch = (name, detail = {}) => {
    try {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: clone(detail)
        })
      );
    } catch (_) {
      // Ignore in test environments without CustomEvent.
    }
  };

  const recordError = (
    stage,
    error,
    details = null
  ) => {
    const entry = {
      stage,
      message:
        error instanceof Error
          ? error.message
          : String(error),
      details: clone(details),
      timestamp: nowISO()
    };

    state.errors.push(entry);

    console.error(
      `Travel Intelligence Center ${stage} error:`,
      error
    );

    dispatch("tic:app:error", entry);

    return entry;
  };

  const recordWarning = (
    stage,
    message,
    details = null
  ) => {
    const entry = {
      stage,
      message: String(message || ""),
      details: clone(details),
      timestamp: nowISO()
    };

    state.warnings.push(entry);

    console.warn(
      `Travel Intelligence Center ${stage} warning:`,
      message
    );

    dispatch("tic:app:warning", entry);

    return entry;
  };

  const getInitialRoute = () => {
    const hashRoute = normalizeRoute(
      window.location.hash
    );

    const configuredRoute =
      TIC.Config?.router?.defaultRoute ||
      TIC.Config?.defaultRoute ||
      "home";

    if (
      hashRoute &&
      TIC.Pages?.[hashRoute]
    ) {
      return hashRoute;
    }

    const normalizedConfiguredRoute =
      normalizeRoute(configuredRoute);

    if (
      TIC.Pages?.[
        normalizedConfiguredRoute
      ]
    ) {
      return normalizedConfiguredRoute;
    }

    return "home";
  };

  const resolveFeatureMethod = (feature) => {
    if (!feature) return null;

    if (typeof feature.initialize === "function") {
      return "initialize";
    }

    if (typeof feature.init === "function") {
      return "init";
    }

    if (typeof feature.bootstrap === "function") {
      return "bootstrap";
    }

    if (typeof feature.start === "function") {
      return "start";
    }

    return null;
  };

  const callFeature = (
    feature,
    method,
    options = {}
  ) => {
    if (
      !feature ||
      !method ||
      typeof feature[method] !== "function"
    ) {
      return null;
    }

    return feature[method](options);
  };

  /* =========================================================
     Runtime resolution
  ========================================================= */

  const resolveModules = () => {
    TIC.Config =
      TIC.Config ||
      window.TICConfig ||
      {};

    TIC.Data =
      TIC.Data ||
      window.TICData ||
      {};

    TIC.Store =
      TIC.Store ||
      window.TICStore ||
      window.Store ||
      window.TravelStore ||
      {};

    TIC.Router =
      TIC.Router ||
      window.TICRouter ||
      {};

    TIC.UI =
      TIC.UI ||
      window.TICUI ||
      {};

    TIC.Pages =
      TIC.Pages || {};

    TIC.Features =
      TIC.Features || {};

    TIC.Data.WorldGuideData =
      TIC.Data.WorldGuideData ||
      window.WorldGuideData ||
      window.WorldData ||
      null;

    TIC.Features.GuideEngine =
      TIC.Features.GuideEngine ||
      window.GuideEngine ||
      null;

    TIC.Features.TravelAI =
      TIC.Features.TravelAI ||
      window.TravelAI ||
      window.TravelIntelligence ||
      null;

    TIC.Features.PlannerEngine =
      TIC.Features.PlannerEngine ||
      window.PlannerEngine ||
      window.TravelPlannerEngine ||
      null;

    return {
      config: TIC.Config,
      data: TIC.Data,
      store: TIC.Store,
      router: TIC.Router,
      ui: TIC.UI,
      pages: TIC.Pages,
      features: TIC.Features
    };
  };

  const getOrderedFeatures = () => [
    {
      id: "trip-form",
      group: FEATURE_GROUP.CORE,
      required: false,
      feature:
        TIC.Features?.TripForm ||
        TIC.Features?.tripForm ||
        window.TICTripForm
    },

    {
      id: "world-guide-data",
      group: FEATURE_GROUP.GUIDE,
      required: true,
      feature:
        TIC.Data?.WorldGuideData ||
        window.WorldGuideData ||
        window.WorldData
    },

    {
      id: "planner-engine",
      group: FEATURE_GROUP.GUIDE,
      required: true,
      feature:
        TIC.Features?.PlannerEngine ||
        window.PlannerEngine ||
        window.TravelPlannerEngine
    },

    {
      id: "travel-ai",
      group: FEATURE_GROUP.GUIDE,
      required: true,
      feature:
        TIC.Features?.TravelAI ||
        window.TravelAI ||
        window.TravelIntelligence
    },

    {
      id: "guide-engine",
      group: FEATURE_GROUP.GUIDE,
      required: true,
      feature:
        TIC.Features?.GuideEngine ||
        window.GuideEngine
    },

    /* Legacy Guide modules remain optional for compatibility. */
    {
      id: "destination-recommendation",
      group: FEATURE_GROUP.LEGACY_GUIDE,
      required: false,
      feature:
        TIC.Features?.DestinationRecommendation ||
        TIC.Features?.destinationRecommendation ||
        window.TICDestinationRecommendation
    },

    {
      id: "guide-search",
      group: FEATURE_GROUP.LEGACY_GUIDE,
      required: false,
      feature:
        TIC.Features?.GuideSearch ||
        TIC.Features?.guideSearch ||
        window.TICGuideSearch
    },

    {
      id: "guide-ai-planner",
      group: FEATURE_GROUP.LEGACY_GUIDE,
      required: false,
      feature:
        TIC.Features?.GuideAIPlanner ||
        TIC.Features?.guideAIPlanner ||
        window.TICGuideAIPlanner
    },

    {
      id: "travel-dna",
      group: FEATURE_GROUP.LEGACY_GUIDE,
      required: false,
      feature:
        TIC.Features?.TravelDNA ||
        TIC.Features?.travelDNA ||
        window.TICTravelDNA
    },

    {
      id: "travel-year-planner",
      group: FEATURE_GROUP.LEGACY_GUIDE,
      required: false,
      feature:
        TIC.Features?.TravelYearPlanner ||
        TIC.Features?.travelYearPlanner ||
        window.TICTravelYearPlanner
    },

    {
      id: "guide-intelligence",
      group: FEATURE_GROUP.LEGACY_GUIDE,
      required: false,
      feature:
        TIC.Features?.GuideIntelligence ||
        TIC.Features?.guideIntelligence ||
        window.TICGuideIntelligence
    },

    {
      id: "budget-engine",
      group: FEATURE_GROUP.BUDGET,
      required: false,
      feature:
        TIC.Features?.budgetEngine ||
        window.TICBudgetEngine
    },

    {
      id: "expense-engine",
      group: FEATURE_GROUP.BUDGET,
      required: false,
      feature:
        TIC.Features?.expenseEngine ||
        window.TICExpenseEngine
    },

    {
      id: "savings-engine",
      group: FEATURE_GROUP.BUDGET,
      required: false,
      feature:
        TIC.Features?.savingsEngine ||
        window.TICSavingsEngine
    },

    {
      id: "budget-analytics",
      group: FEATURE_GROUP.BUDGET,
      required: false,
      feature:
        TIC.Features?.budgetAnalytics ||
        window.TICBudgetAnalytics
    },

    {
      id: "budget-ai",
      group: FEATURE_GROUP.BUDGET,
      required: false,
      feature:
        TIC.Features?.budgetAI ||
        window.TICBudgetAI
    },

    {
      id: "payment-tracker",
      group: FEATURE_GROUP.BUDGET,
      required: false,
      feature:
        TIC.Features?.paymentTracker ||
        window.TICPaymentTracker
    },

    {
      id: "expense-alert-engine",
      group: FEATURE_GROUP.BUDGET,
      required: false,
      feature:
        TIC.Features?.expenseAlertEngine ||
        window.TICExpenseAlertEngine
    },

    {
      id: "budget-export-engine",
      group: FEATURE_GROUP.BUDGET,
      required: false,
      feature:
        TIC.Features?.budgetExportEngine ||
        window.TICBudgetExportEngine
    },

    {
      id: "budget-notification-engine",
      group: FEATURE_GROUP.BUDGET,
      required: false,
      feature:
        TIC.Features?.budgetNotificationEngine ||
        window.TICBudgetNotificationEngine
    },

    {
      id: "budget-integration-engine",
      group: FEATURE_GROUP.BUDGET,
      required: false,
      feature:
        TIC.Features?.budgetIntegrationEngine ||
        window.TICBudgetIntegrationEngine
    }
  ];

  /* =========================================================
     Feature initialization
  ========================================================= */

  const initializeFeature = async (descriptor) => {
    const {
      id,
      group,
      required,
      feature
    } = descriptor;

    if (
      !id ||
      state.initializedFeatures.has(id)
    ) {
      return false;
    }

    if (!feature) {
      const result = {
        id,
        group,
        required,
        available: false,
        initialized: false,
        method: null,
        result: null,
        error: "feature-not-found"
      };

      state.featureResults.set(id, result);

      if (required) {
        recordWarning(
          `initialize-feature:${id}`,
          "Required feature was not found.",
          result
        );
      }

      return false;
    }

    const method =
      resolveFeatureMethod(feature);

    try {
      const featureOptions = {
        store: TIC.Store,
        router: TIC.Router,
        ui: TIC.UI,
        config: TIC.Config,
        data: TIC.Data,
        worldData:
          TIC.Data?.WorldGuideData ||
          window.WorldGuideData ||
          window.WorldData ||
          null,
        guideEngine:
          TIC.Features?.GuideEngine ||
          window.GuideEngine ||
          null,
        travelAI:
          TIC.Features?.TravelAI ||
          window.TravelAI ||
          null,
        plannerEngine:
          TIC.Features?.PlannerEngine ||
          window.PlannerEngine ||
          null,
        app: App,
        autoSync: true,
        strictMode: false
      };

      const rawResult =
        method
          ? callFeature(
              feature,
              method,
              featureOptions
            )
          : null;

      const result =
        await settle(rawResult);

      state.initializedFeatures.add(id);

      const entry = {
        id,
        group,
        required,
        available: true,
        initialized: true,
        method,
        result:
          result === undefined
            ? null
            : clone(result),
        version:
          feature.version ||
          feature.VERSION ||
          null,
        error: null
      };

      state.featureResults.set(id, entry);

      dispatch(
        "tic:app:feature-initialized",
        entry
      );

      return true;
    } catch (error) {
      const entry = {
        id,
        group,
        required,
        available: true,
        initialized: false,
        method,
        result: null,
        version:
          feature.version ||
          feature.VERSION ||
          null,
        error: error.message
      };

      state.featureResults.set(id, entry);

      recordError(
        `initialize-feature:${id}`,
        error,
        entry
      );

      return false;
    }
  };

  const initializeFeatures = async () => {
    const descriptors =
      getOrderedFeatures();

    for (const descriptor of descriptors) {
      await initializeFeature(descriptor);
    }

    const knownFeatures =
      new Set(
        descriptors
          .map((descriptor) => descriptor.feature)
          .filter(Boolean)
      );

    for (
      const [featureId, feature]
      of Object.entries(TIC.Features || {})
    ) {
      const alreadyKnown =
        knownFeatures.has(feature) ||
        descriptors.some(
          (descriptor) =>
            descriptor.id === featureId
        );

      if (alreadyKnown) continue;

      await initializeFeature({
        id: featureId,
        group: FEATURE_GROUP.OTHER,
        required: false,
        feature
      });
    }

    return state.initializedFeatures.size;
  };

  /* =========================================================
     Page registration
  ========================================================= */

  const registerPages = async () => {
    const router = TIC.Router;

    if (
      !router ||
      typeof router.registerPage !== "function"
    ) {
      recordWarning(
        "register-pages",
        "Router registerPage API is unavailable."
      );

      return 0;
    }

    for (
      const [pageId, pageModule]
      of Object.entries(TIC.Pages || {})
    ) {
      if (
        !pageId ||
        !pageModule ||
        state.registeredPages.has(pageId)
      ) {
        continue;
      }

      try {
        if (
          typeof pageModule.init === "function"
        ) {
          await settle(
            pageModule.init({
              store: TIC.Store,
              router: TIC.Router,
              ui: TIC.UI,
              app: App
            })
          );
        }

        router.registerPage(
          pageId,
          pageModule
        );

        state.registeredPages.add(pageId);

        state.pageResults.set(
          pageId,
          {
            id: pageId,
            registered: true,
            version:
              pageModule.version ||
              null,
            error: null
          }
        );
      } catch (error) {
        state.pageResults.set(
          pageId,
          {
            id: pageId,
            registered: false,
            version:
              pageModule.version ||
              null,
            error: error.message
          }
        );

        recordError(
          `register-page:${pageId}`,
          error
        );
      }
    }

    return state.registeredPages.size;
  };

  /* =========================================================
     Router and fallback rendering
  ========================================================= */

  const mountFallback = async (
    route = "home"
  ) => {
    const container =
      state.container ||
      getContainer();

    const page =
      TIC.Pages?.[route] ||
      TIC.Pages?.home;

    if (!container || !page) {
      throw new Error(
        "Application container or fallback page is unavailable."
      );
    }

    if (
      typeof page.mount === "function"
    ) {
      await settle(
        page.mount({
          container,
          route,
          store: TIC.Store,
          router: TIC.Router,
          ui: TIC.UI,
          app: App
        })
      );

      state.activeRoute = route;

      return true;
    }

    if (
      typeof page.render === "function"
    ) {
      const rendered =
        await settle(
          page.render({
            container,
            route,
            store: TIC.Store,
            router: TIC.Router,
            ui: TIC.UI,
            app: App
          })
        );

      container.innerHTML =
        rendered || "";

      if (
        typeof page.afterEnter === "function"
      ) {
        await settle(
          page.afterEnter({
            container,
            route,
            store: TIC.Store,
            router: TIC.Router,
            ui: TIC.UI,
            app: App
          })
        );
      }

      state.activeRoute = route;

      return true;
    }

    throw new Error(
      `Page "${route}" cannot be mounted.`
    );
  };

  const startRouter = async () => {
    if (state.routerStarted) {
      return true;
    }

    const router = TIC.Router;
    const route = getInitialRoute();

    state.activeRoute = route;

    if (
      router &&
      typeof router.go === "function"
    ) {
      try {
        await settle(
          router.go(
            route,
            {
              source:
                "app-bootstrap",
              replace: true,
              store: TIC.Store,
              app: App
            }
          )
        );

        state.routerStarted = true;

        return true;
      } catch (error) {
        recordError(
          `route:${route}`,
          error
        );
      }
    }

    await mountFallback(route);

    state.routerStarted = true;

    return true;
  };

  /* =========================================================
     Store and runtime events
  ========================================================= */

  const syncTripLifecycle = () => {
    try {
      TIC.Store?.syncTripStatuses?.({
        forcePersist: false
      });
    } catch (error) {
      recordWarning(
        "trip-lifecycle-sync",
        "Trip lifecycle synchronization failed.",
        {
          error: error.message
        }
      );
    }
  };

  const subscribeToStore = () => {
    if (
      state.storeUnsubscribe ||
      !TIC.Store ||
      typeof TIC.Store.subscribe !== "function"
    ) {
      return false;
    }

    try {
      state.storeUnsubscribe =
        TIC.Store.subscribe(
          (
            snapshot,
            event
          ) => {
            dispatch(
              "tic:app:store-updated",
              {
                event:
                  clone(event),
                updatedAt:
                  snapshot?.meta
                    ?.updatedAt ||
                  nowISO()
              }
            );
          }
        );

      return true;
    } catch (error) {
      recordError(
        "subscribe-store",
        error
      );

      return false;
    }
  };

  const bindRuntimeEvents = () => {
    if (state.eventBindings.length) {
      return;
    }

    const bindings = [
      {
        name:
          "tic:budget-integration-health-changed",
        handler:
          (event) => {
            dispatch(
              "tic:app:budget-health-changed",
              event.detail
            );
          }
      },

      {
        name:
          "tic:budget-integration-sync-failed",
        handler:
          (event) => {
            recordWarning(
              "budget-sync",
              "Budget Intelligence synchronization reported a failure.",
              event.detail
            );
          }
      },

      {
        name:
          "tic:page:trips:passport-trip-created",
        handler:
          () => {
            dispatch(
              "tic:guide:refresh-requested",
              {
                source:
                  "passport-trip-created"
              }
            );
          }
      },

      {
        name:
          "tic:page:trips:passport-trip-updated",
        handler:
          () => {
            dispatch(
              "tic:guide:refresh-requested",
              {
                source:
                  "passport-trip-updated"
              }
            );
          }
      },

      {
        name:
          "hashchange",
        handler:
          () => {
            state.activeRoute =
              normalizeRoute(
                window.location.hash
              );
          }
      },

      {
        name:
          "visibilitychange",
        target:
          document,
        handler:
          () => {
            if (
              document.visibilityState ===
              "visible"
            ) {
              syncTripLifecycle();
            }
          }
      }
    ];

    bindings.forEach(
      ({
        name,
        handler,
        target = window
      }) => {
        target.addEventListener(
          name,
          handler
        );

        state.eventBindings.push({
          name,
          handler,
          target
        });
      }
    );
  };

  const unbindRuntimeEvents = () => {
    state.eventBindings.forEach(
      ({
        name,
        handler,
        target = window
      }) => {
        target.removeEventListener(
          name,
          handler
        );
      }
    );

    state.eventBindings = [];
  };

  /* =========================================================
     Module initialization
  ========================================================= */

  const initializeModules = async () => {
    resolveModules();

    if (
      typeof TIC.Store.init === "function"
    ) {
      await settle(TIC.Store.init());
    }

    syncTripLifecycle();

    if (
      typeof TIC.UI.init === "function"
    ) {
      await settle(TIC.UI.init());
    }

    state.container =
      getContainer();

    if (!state.container) {
      throw new Error(
        "Application route container was not found."
      );
    }

    if (
      typeof TIC.Router.init === "function"
    ) {
      await settle(
        TIC.Router.init({
          container:
            state.container,
          store:
            TIC.Store,
          app:
            App
        })
      );
    }

    subscribeToStore();
    bindRuntimeEvents();

    await initializeFeatures();
    await registerPages();

    return true;
  };

  /* =========================================================
     Diagnostics
  ========================================================= */

  const collectFeatureDiagnostics = () => {
    const diagnostics = {};

    getOrderedFeatures().forEach(
      (descriptor) => {
        const feature =
          descriptor.feature;

        try {
          diagnostics[
            descriptor.id
          ] =
            typeof feature?.diagnostics === "function"
              ? feature.diagnostics()
              : {
                  available:
                    Boolean(feature),
                  initialized:
                    state.initializedFeatures.has(
                      descriptor.id
                    ),
                  group:
                    descriptor.group,
                  required:
                    descriptor.required,
                  version:
                    feature?.version ||
                    feature?.VERSION ||
                    null
                };
        } catch (error) {
          diagnostics[
            descriptor.id
          ] = {
            available:
              Boolean(feature),
            initialized:
              state.initializedFeatures.has(
                descriptor.id
              ),
            group:
              descriptor.group,
            required:
              descriptor.required,
            error:
              error.message
          };
        }
      }
    );

    return diagnostics;
  };

  const collectPageDiagnostics = () => {
    const diagnostics = {};

    Object.entries(
      TIC.Pages || {}
    ).forEach(
      ([pageId, page]) => {
        try {
          diagnostics[pageId] =
            typeof page?.diagnostics === "function"
              ? page.diagnostics()
              : {
                  available:
                    Boolean(page),
                  registered:
                    state.registeredPages.has(
                      pageId
                    ),
                  version:
                    page?.version ||
                    null
                };
        } catch (error) {
          diagnostics[pageId] = {
            available:
              Boolean(page),
            registered:
              state.registeredPages.has(
                pageId
              ),
            error:
              error.message
          };
        }
      }
    );

    return diagnostics;
  };

  const getBudgetHealth = () => {
    const integration =
      TIC.Features?.budgetIntegrationEngine ||
      window.TICBudgetIntegrationEngine;

    if (
      integration &&
      typeof integration.getHealth === "function"
    ) {
      try {
        return integration.getHealth();
      } catch (error) {
        return {
          status: "failed",
          score: 0,
          error: error.message
        };
      }
    }

    const budgetFeatures =
      getOrderedFeatures().filter(
        (item) =>
          item.group ===
          FEATURE_GROUP.BUDGET
      );

    const available =
      budgetFeatures.filter(
        (item) =>
          Boolean(item.feature)
      ).length;

    return {
      status:
        available ===
        budgetFeatures.length
          ? "ready"
          : available > 0
            ? "degraded"
            : "deferred",
      score:
        budgetFeatures.length > 0
          ? Math.round(
              (
                available /
                budgetFeatures.length
              ) * 100
            )
          : 0,
      totalModules:
        budgetFeatures.length,
      readyModules:
        available
    };
  };

  const getGuideHealth = () => {
    const ids = [
      "world-guide-data",
      "planner-engine",
      "travel-ai",
      "guide-engine"
    ];

    const results =
      ids.map(
        (id) =>
          state.featureResults.get(id)
      );

    const ready =
      results.filter(
        (result) =>
          result?.available &&
          result?.initialized
      ).length;

    const world =
      TIC.Data?.WorldGuideData ||
      window.WorldGuideData ||
      window.WorldData;

    const stats =
      world?.getStats?.() ||
      null;

    return {
      status:
        ready === ids.length
          ? "ready"
          : ready > 0
            ? "degraded"
            : "disconnected",
      score:
        Math.round(
          (ready / ids.length) * 100
        ),
      readyModules:
        ready,
      totalModules:
        ids.length,
      totalCountries:
        stats?.totalCountries ||
        world?.countries?.length ||
        0,
      modules: {
        worldGuideData:
          Boolean(world),
        plannerEngine:
          Boolean(
            TIC.Features?.PlannerEngine ||
            window.PlannerEngine
          ),
        travelAI:
          Boolean(
            TIC.Features?.TravelAI ||
            window.TravelAI
          ),
        guideEngine:
          Boolean(
            TIC.Features?.GuideEngine ||
            window.GuideEngine
          )
      }
    };
  };

  const runDiagnostics = () => {
    const featureDiagnostics =
      collectFeatureDiagnostics();

    const pageDiagnostics =
      collectPageDiagnostics();

    return {
      id: "app",
      version: APP_VERSION,

      initialized:
        state.initialized,

      started:
        state.started,

      starting:
        state.starting,

      restarting:
        state.restarting,

      hasContainer:
        Boolean(state.container),

      activeRoute:
        state.activeRoute,

      routerStarted:
        state.routerStarted,

      configAvailable:
        Boolean(TIC.Config),

      dataAvailable:
        Boolean(TIC.Data),

      storeAvailable:
        Boolean(TIC.Store),

      storeVersion:
        TIC.Store?.version ||
        null,

      routerAvailable:
        Boolean(TIC.Router),

      uiAvailable:
        Boolean(TIC.UI),

      worldGuideDataAvailable:
        Boolean(
          TIC.Data?.WorldGuideData ||
          window.WorldGuideData ||
          window.WorldData
        ),

      registeredPages:
        Array.from(
          state.registeredPages
        ),

      initializedFeatures:
        Array.from(
          state.initializedFeatures
        ),

      guideIntelligence:
        getGuideHealth(),

      budgetIntelligence:
        clone(getBudgetHealth()),

      featureDiagnostics,
      pageDiagnostics,

      featureResults:
        Object.fromEntries(
          state.featureResults
        ),

      pageResults:
        Object.fromEntries(
          state.pageResults
        ),

      warningCount:
        state.warnings.length,

      warnings:
        state.warnings.slice(),

      errorCount:
        state.errors.length,

      errors:
        state.errors.slice(),

      startTime:
        state.startTime,

      endTime:
        state.endTime
    };
  };

  /* =========================================================
     Public App API
  ========================================================= */

  const App = {
    id: "app",
    version: APP_VERSION,

    async init() {
      if (state.initialized) {
        return this.diagnostics();
      }

      if (
        state.starting &&
        state.startupPromise
      ) {
        return state.startupPromise;
      }

      state.starting = true;
      state.startTime = nowISO();
      state.endTime = null;

      state.startupPromise =
        (async () => {
          try {
            await initializeModules();

            state.initialized = true;

            await startRouter();

            state.started = true;
            state.endTime = nowISO();

            const diagnostics =
              this.diagnostics();

            dispatch(
              "tic:app:started",
              {
                version:
                  APP_VERSION,
                route:
                  state.activeRoute ||
                  getInitialRoute(),
                registeredPages:
                  Array.from(
                    state.registeredPages
                  ),
                initializedFeatures:
                  Array.from(
                    state.initializedFeatures
                  ),
                guideIntelligence:
                  diagnostics
                    .guideIntelligence,
                budgetIntelligence:
                  diagnostics
                    .budgetIntelligence,
                timestamp:
                  nowISO()
              }
            );

            console.log(
              `Travel Intelligence Center V${APP_VERSION} started.`
            );
          } catch (error) {
            recordError(
              "bootstrap",
              error
            );

            const container =
              state.container ||
              getContainer();

            if (container) {
              container.innerHTML = `
                <section class="tic-empty-state">
                  <div class="tic-empty-icon">!</div>

                  <h2>تعذر تشغيل التطبيق</h2>

                  <p>
                    حدث خطأ أثناء تحميل مركز السفر الذكي.
                    أعد تحديث الصفحة وحاول مرة أخرى.
                  </p>

                  <button
                    type="button"
                    class="tic-btn tic-btn-primary"
                    onclick="window.location.reload()"
                  >
                    إعادة تحميل الصفحة
                  </button>
                </section>
              `;
            }
          } finally {
            state.starting = false;
            state.startupPromise = null;
          }

          return this.diagnostics();
        })();

      return state.startupPromise;
    },

    async restart() {
      if (state.restarting) {
        return this.diagnostics();
      }

      state.restarting = true;

      try {
        if (
          typeof state.storeUnsubscribe === "function"
        ) {
          state.storeUnsubscribe();
        }

        state.storeUnsubscribe = null;

        unbindRuntimeEvents();

        state.initialized = false;
        state.started = false;
        state.starting = false;
        state.container = null;
        state.activeRoute = null;
        state.routerStarted = false;
        state.registeredPages.clear();
        state.initializedFeatures.clear();
        state.featureResults.clear();
        state.pageResults.clear();
        state.errors = [];
        state.warnings = [];
        state.startTime = null;
        state.endTime = null;

        return await this.init();
      } finally {
        state.restarting = false;
      }
    },

    async registerPages() {
      return await registerPages();
    },

    async initializeFeatures() {
      return await initializeFeatures();
    },

    async initializeFeature(
      id,
      feature,
      options = {}
    ) {
      return await initializeFeature({
        id,
        feature,
        group:
          options.group ||
          FEATURE_GROUP.OTHER,
        required:
          options.required === true
      });
    },

    go(
      route,
      options = {}
    ) {
      const normalizedRoute =
        normalizeRoute(route);

      state.activeRoute =
        normalizedRoute;

      if (
        TIC.Router &&
        typeof TIC.Router.go === "function"
      ) {
        return TIC.Router.go(
          normalizedRoute,
          options
        );
      }

      return mountFallback(
        normalizedRoute
      );
    },

    getActiveRoute() {
      return (
        state.activeRoute ||
        getInitialRoute()
      );
    },

    getGuideHealth() {
      return clone(
        getGuideHealth()
      );
    },

    getBudgetHealth() {
      return clone(
        getBudgetHealth()
      );
    },

    diagnostics() {
      return runDiagnostics();
    }
  };

  TIC.App = App;
  window.TICApp = App;

  /* =========================================================
     Automatic startup
  ========================================================= */

  const start = () => {
    App.init();
  };

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      start,
      {
        once: true
      }
    );
  } else {
    start();
  }
})(window, document);
