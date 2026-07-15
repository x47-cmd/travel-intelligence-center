/* =========================================================
   Travel Intelligence Center
   Application Bootstrap V3.0.0
   Guide + Budget Intelligence Ready

   File Path:
   js/app.js

   Purpose:
   - Bootstraps the complete application safely.
   - Connects Config, Data, Store, Router, UI, Features and Pages.
   - Initializes Guide Intelligence Platform dependencies.
   - Initializes Budget Intelligence Platform dependencies.
   - Registers all available page modules.
   - Restores the requested route when possible.
   - Falls back to the home page when needed.
   - Keeps the application stable on iPhone and desktop.
   - Provides diagnostics for the complete runtime.
   - Prevents duplicate feature initialization and duplicate routing.
   - Preserves compatibility with all existing page lifecycle APIs.

   Dependencies:
   - js/config.js
   - js/data.js
   - js/store.js
   - js/router.js
   - js/ui.js
   - js/data/countries-catalog.js
   - js/data/travel-knowledge.js
   - js/features/trip-form.js
   - js/features/destination-recommendation-engine.js
   - js/features/guide-search-engine.js
   - js/features/guide-ai-planner.js
   - js/features/travel-dna.js
   - js/features/travel-year-planner.js
   - js/features/guide-intelligence.js
   - js/features/budget-engine.js
   - js/features/expense-engine.js
   - js/features/savings-engine.js
   - js/features/budget-analytics.js
   - js/features/budget-ai.js
   - js/features/payment-tracker.js
   - js/features/expense-alert-engine.js
   - js/features/budget-export-engine.js
   - js/features/budget-notification-engine.js
   - js/features/budget-integration-engine.js
   - js/pages/home.js
   - js/pages/trips.js
   - js/pages/guide.js
   - js/pages/budget.js
   - js/pages/more.js

   Global APIs:
   - window.TIC.App
   - window.TICApp
========================================================= */

(function applicationBootstrapFactory(window, document) {
  "use strict";

  window.TIC = window.TIC || {};

  const TIC = window.TIC;
  const APP_VERSION = "3.0.0";

  const FEATURE_GROUP = Object.freeze({
    CORE: "core",
    GUIDE: "guide",
    BUDGET: "budget",
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
    startupPromise: null
  };

  /* =========================================================
     Utilities
  ========================================================= */

  const clone = (value) => {
    if (value === undefined) return undefined;

    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch (error) {
        // Continue to JSON fallback.
      }
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  };

  const isObject = (value) =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);

  const asArray = (value) => {
    if (Array.isArray(value)) return value;

    if (isObject(value)) {
      return Object.values(value);
    }

    return [];
  };

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

    window.dispatchEvent(
      new CustomEvent(
        "tic:app:error",
        {
          detail: clone(entry)
        }
      )
    );

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

  const resolveFeatureMethod = (
    feature
  ) => {
    if (!feature) return null;

    if (
      typeof feature.initialize === "function"
    ) {
      return "initialize";
    }

    if (
      typeof feature.init === "function"
    ) {
      return "init";
    }

    if (
      typeof feature.bootstrap === "function"
    ) {
      return "bootstrap";
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
     Runtime module resolution
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
      id: "destination-recommendation",
      group: FEATURE_GROUP.GUIDE,
      required: false,
      feature:
        TIC.Features?.DestinationRecommendation ||
        TIC.Features?.destinationRecommendation ||
        window.TICDestinationRecommendation
    },

    {
      id: "guide-search",
      group: FEATURE_GROUP.GUIDE,
      required: false,
      feature:
        TIC.Features?.GuideSearch ||
        TIC.Features?.guideSearch ||
        window.TICGuideSearch
    },

    {
      id: "guide-ai-planner",
      group: FEATURE_GROUP.GUIDE,
      required: false,
      feature:
        TIC.Features?.GuideAIPlanner ||
        TIC.Features?.guideAIPlanner ||
        window.TICGuideAIPlanner
    },

    {
      id: "travel-dna",
      group: FEATURE_GROUP.GUIDE,
      required: false,
      feature:
        TIC.Features?.TravelDNA ||
        TIC.Features?.travelDNA ||
        window.TICTravelDNA
    },

    {
      id: "travel-year-planner",
      group: FEATURE_GROUP.GUIDE,
      required: false,
      feature:
        TIC.Features?.TravelYearPlanner ||
        TIC.Features?.travelYearPlanner ||
        window.TICTravelYearPlanner
    },

    {
      id: "guide-intelligence",
      group: FEATURE_GROUP.GUIDE,
      required: false,
      feature:
        TIC.Features?.GuideIntelligence ||
        TIC.Features?.guideIntelligence ||
        window.TICGuideIntelligence
    },

    {
      id: "budget-engine",
      group: FEATURE_GROUP.BUDGET,
      required: true,
      feature:
        TIC.Features?.budgetEngine ||
        window.TICBudgetEngine
    },

    {
      id: "expense-engine",
      group: FEATURE_GROUP.BUDGET,
      required: true,
      feature:
        TIC.Features?.expenseEngine ||
        window.TICExpenseEngine
    },

    {
      id: "savings-engine",
      group: FEATURE_GROUP.BUDGET,
      required: true,
      feature:
        TIC.Features?.savingsEngine ||
        window.TICSavingsEngine
    },

    {
      id: "budget-analytics",
      group: FEATURE_GROUP.BUDGET,
      required: true,
      feature:
        TIC.Features?.budgetAnalytics ||
        window.TICBudgetAnalytics
    },

    {
      id: "budget-ai",
      group: FEATURE_GROUP.BUDGET,
      required: true,
      feature:
        TIC.Features?.budgetAI ||
        window.TICBudgetAI
    },

    {
      id: "payment-tracker",
      group: FEATURE_GROUP.BUDGET,
      required: true,
      feature:
        TIC.Features?.paymentTracker ||
        window.TICPaymentTracker
    },

    {
      id: "expense-alert-engine",
      group: FEATURE_GROUP.BUDGET,
      required: true,
      feature:
        TIC.Features?.expenseAlertEngine ||
        window.TICExpenseAlertEngine
    },

    {
      id: "budget-export-engine",
      group: FEATURE_GROUP.BUDGET,
      required: true,
      feature:
        TIC.Features?.budgetExportEngine ||
        window.TICBudgetExportEngine
    },

    {
      id: "budget-notification-engine",
      group: FEATURE_GROUP.BUDGET,
      required: true,
      feature:
        TIC.Features?.budgetNotificationEngine ||
        window.TICBudgetNotificationEngine
    },

    {
      id: "budget-integration-engine",
      group: FEATURE_GROUP.BUDGET,
      required: true,
      feature:
        TIC.Features?.budgetIntegrationEngine ||
        window.TICBudgetIntegrationEngine
    }
  ];

  /* =========================================================
     Feature initialization
  ========================================================= */

  const initializeFeature = (
    descriptor
  ) => {
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

      state.featureResults.set(
        id,
        result
      );

      if (required) {
        recordWarning(
          `initialize-feature:${id}`,
          "Required Budget feature was not found.",
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
        app: App,
        autoSync: true,
        strictMode: false
      };

      const result =
        method
          ? callFeature(
              feature,
              method,
              featureOptions
            )
          : null;

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
            : result,
        version:
          feature.version ||
          feature.VERSION ||
          null,
        error: null
      };

      state.featureResults.set(
        id,
        entry
      );

      window.dispatchEvent(
        new CustomEvent(
          "tic:app:feature-initialized",
          {
            detail: clone(entry)
          }
        )
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

      state.featureResults.set(
        id,
        entry
      );

      recordError(
        `initialize-feature:${id}`,
        error,
        entry
      );

      return false;
    }
  };

  const initializeFeatures = () => {
    const descriptors =
      getOrderedFeatures();

    descriptors.forEach(
      (descriptor) => {
        initializeFeature(
          descriptor
        );
      }
    );

    Object.entries(
      TIC.Features || {}
    ).forEach(
      ([featureId, feature]) => {
        const alreadyKnown =
          descriptors.some(
            (descriptor) =>
              descriptor.feature === feature ||
              descriptor.id === featureId
          );

        if (alreadyKnown) return;

        initializeFeature({
          id: featureId,
          group: FEATURE_GROUP.OTHER,
          required: false,
          feature
        });
      }
    );

    return state.initializedFeatures.size;
  };

  /* =========================================================
     Page registration
  ========================================================= */

  const registerPages = () => {
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

    Object.entries(
      TIC.Pages || {}
    ).forEach(
      ([pageId, pageModule]) => {
        if (
          !pageId ||
          !pageModule ||
          state.registeredPages.has(pageId)
        ) {
          return;
        }

        try {
          if (
            typeof pageModule.init === "function"
          ) {
            pageModule.init({
              store: TIC.Store,
              router: TIC.Router,
              ui: TIC.UI,
              app: App
            });
          }

          router.registerPage(
            pageId,
            pageModule
          );

          state.registeredPages.add(
            pageId
          );

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
    );

    return state.registeredPages.size;
  };

  /* =========================================================
     Router and fallback rendering
  ========================================================= */

  const mountFallback = (
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
      page.mount({
        container,
        route,
        store: TIC.Store,
        router: TIC.Router,
        ui: TIC.UI,
        app: App
      });

      state.activeRoute = route;

      return true;
    }

    if (
      typeof page.render === "function"
    ) {
      container.innerHTML =
        page.render({
          container,
          route,
          store: TIC.Store,
          router: TIC.Router,
          ui: TIC.UI,
          app: App
        });

      if (
        typeof page.afterEnter === "function"
      ) {
        page.afterEnter({
          container,
          route,
          store: TIC.Store,
          router: TIC.Router,
          ui: TIC.UI,
          app: App
        });
      }

      state.activeRoute = route;

      return true;
    }

    throw new Error(
      `Page "${route}" cannot be mounted.`
    );
  };

  const startRouter = async () => {
    const router = TIC.Router;
    const route = getInitialRoute();

    state.activeRoute = route;

    if (
      router &&
      typeof router.go === "function"
    ) {
      try {
        const result = router.go(
          route,
          {
            source:
              "app-bootstrap",
            replace: true,
            store: TIC.Store,
            app: App
          }
        );

        if (
          result &&
          typeof result.then === "function"
        ) {
          await result;
        }

        return true;
      } catch (error) {
        recordError(
          `route:${route}`,
          error
        );
      }
    }

    return mountFallback(route);
  };

  /* =========================================================
     Store and runtime events
  ========================================================= */

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
            window.dispatchEvent(
              new CustomEvent(
                "tic:app:store-updated",
                {
                  detail: {
                    event:
                      clone(event),
                    updatedAt:
                      snapshot?.meta
                        ?.updatedAt ||
                      nowISO()
                  }
                }
              )
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
    if (
      state.eventBindings.length
    ) {
      return;
    }

    const bindings = [
      {
        name:
          "tic:budget-integration-health-changed",
        handler:
          (event) => {
            window.dispatchEvent(
              new CustomEvent(
                "tic:app:budget-health-changed",
                {
                  detail:
                    clone(
                      event.detail
                    )
                }
              )
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
          "hashchange",
        handler:
          () => {
            state.activeRoute =
              normalizeRoute(
                window.location.hash
              );
          }
      }
    ];

    bindings.forEach(
      ({ name, handler }) => {
        window.addEventListener(
          name,
          handler
        );

        state.eventBindings.push({
          name,
          handler
        });
      }
    );
  };

  const unbindRuntimeEvents = () => {
    state.eventBindings.forEach(
      ({ name, handler }) => {
        window.removeEventListener(
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

  const initializeModules = () => {
    resolveModules();

    if (
      typeof TIC.Store.init === "function"
    ) {
      TIC.Store.init();
    }

    if (
      typeof TIC.UI.init === "function"
    ) {
      TIC.UI.init();
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
      TIC.Router.init({
        container:
          state.container,
        store:
          TIC.Store,
        app:
          App
      });
    }

    subscribeToStore();
    bindRuntimeEvents();
    initializeFeatures();
    registerPages();

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
            : "disconnected",
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

  const runDiagnostics = () => {
    const featureDiagnostics =
      collectFeatureDiagnostics();

    const pageDiagnostics =
      collectPageDiagnostics();

    const budgetHealth =
      getBudgetHealth();

    const guideFeatureIds = [
      "destination-recommendation",
      "guide-search",
      "guide-ai-planner",
      "travel-dna",
      "travel-year-planner",
      "guide-intelligence"
    ];

    const guideReady =
      guideFeatureIds.filter(
        (id) =>
          featureDiagnostics[id]
            ?.available
      ).length;

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

      countriesCatalogAvailable:
        Boolean(
          TIC.Data?.Countries ||
          window.TICCountriesCatalog
        ),

      travelKnowledgeAvailable:
        Boolean(
          TIC.Data?.TravelKnowledge ||
          window.TICTravelKnowledge
        ),

      registeredPages:
        Array.from(
          state.registeredPages
        ),

      initializedFeatures:
        Array.from(
          state.initializedFeatures
        ),

      guideIntelligence: {
        ready:
          guideReady ===
          guideFeatureIds.length,
        readyFeatures:
          guideReady,
        totalFeatures:
          guideFeatureIds.length
      },

      budgetIntelligence:
        clone(budgetHealth),

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
            initializeModules();

            state.initialized = true;

            await startRouter();

            state.started = true;
            state.endTime = nowISO();

            const diagnostics =
              this.diagnostics();

            window.dispatchEvent(
              new CustomEvent(
                "tic:app:started",
                {
                  detail: {
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
                }
              )
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
                  <div class="tic-empty-icon">
                    !
                  </div>

                  <h2>
                    تعذر تشغيل التطبيق
                  </h2>

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

    registerPages() {
      return registerPages();
    },

    initializeFeatures() {
      return initializeFeatures();
    },

    initializeFeature(
      id,
      feature,
      options = {}
    ) {
      return initializeFeature({
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
