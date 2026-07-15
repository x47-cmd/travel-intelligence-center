/* =========================================================
   Travel Intelligence Center
   Application Bootstrap V2.1.0

   File Path:
   js/app.js

   Purpose:
   - Bootstraps the complete application safely.
   - Connects Config, Data, Store, Router, UI, Features and Pages.
   - Initializes Guide Intelligence Platform dependencies.
   - Registers all available page modules.
   - Restores the requested route when possible.
   - Falls back to the home page when needed.
   - Keeps the application stable on iPhone and desktop.
   - Provides diagnostics for the complete runtime.

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
   - js/pages/home.js
   - js/pages/trips.js
   - js/pages/guide.js
   - js/pages/budget.js
   - js/pages/more.js
========================================================= */

(function (window, document) {
  "use strict";

  window.TIC = window.TIC || {};

  const TIC = window.TIC;
  const APP_VERSION = "2.1.0";

  const state = {
    initialized: false,
    started: false,
    starting: false,
    container: null,
    registeredPages: new Set(),
    initializedFeatures: new Set(),
    errors: [],
    startTime: null
  };

  const getContainer = () =>
    document.querySelector("[data-router-view]") ||
    document.querySelector("#app-view") ||
    document.querySelector("#tic-page") ||
    document.querySelector("#app-content") ||
    document.querySelector("#app");

  const normalizeRoute = (value) =>
    String(value || "")
      .trim()
      .replace(/^#\/?/, "")
      .split("?")[0]
      .split("/")[0] || "home";

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

    return normalizeRoute(configuredRoute);
  };

  const recordError = (stage, error) => {
    const entry = {
      stage,
      message:
        error instanceof Error
          ? error.message
          : String(error),
      timestamp: new Date().toISOString()
    };

    state.errors.push(entry);

    console.error(
      `Travel Intelligence Center ${stage} error:`,
      error
    );

    return entry;
  };

  const initializeFeature = (
    featureId,
    feature
  ) => {
    if (
      !featureId ||
      !feature ||
      state.initializedFeatures.has(featureId)
    ) {
      return false;
    }

    try {
      if (
        typeof feature.init === "function"
      ) {
        feature.init();
      }

      state.initializedFeatures.add(
        featureId
      );

      return true;
    } catch (error) {
      recordError(
        `initialize-feature:${featureId}`,
        error
      );

      return false;
    }
  };

  const initializeFeatures = () => {
    const orderedFeatures = [
      [
        "trip-form",
        TIC.Features?.TripForm ||
        window.TICTripForm
      ],
      [
        "destination-recommendation",
        TIC.Features?.DestinationRecommendation ||
        window.TICDestinationRecommendation
      ],
      [
        "guide-search",
        TIC.Features?.GuideSearch ||
        window.TICGuideSearch
      ],
      [
        "guide-ai-planner",
        TIC.Features?.GuideAIPlanner ||
        window.TICGuideAIPlanner
      ],
      [
        "travel-dna",
        TIC.Features?.TravelDNA ||
        window.TICTravelDNA
      ],
      [
        "travel-year-planner",
        TIC.Features?.TravelYearPlanner ||
        window.TICTravelYearPlanner
      ],
      [
        "guide-intelligence",
        TIC.Features?.GuideIntelligence ||
        window.TICGuideIntelligence
      ]
    ];

    orderedFeatures.forEach(
      ([featureId, feature]) => {
        initializeFeature(
          featureId,
          feature
        );
      }
    );

    Object.entries(
      TIC.Features || {}
    ).forEach(
      ([featureId, feature]) => {
        initializeFeature(
          featureId,
          feature
        );
      }
    );

    return state.initializedFeatures.size;
  };

  const registerPages = () => {
    const router = TIC.Router;

    if (
      !router ||
      typeof router.registerPage !== "function"
    ) {
      return 0;
    }

    Object.entries(TIC.Pages || {}).forEach(
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
            pageModule.init();
          }

          router.registerPage(
            pageId,
            pageModule
          );

          state.registeredPages.add(
            pageId
          );
        } catch (error) {
          recordError(
            `register-page:${pageId}`,
            error
          );
        }
      }
    );

    return state.registeredPages.size;
  };

  const mountFallback = (route = "home") => {
    const container =
      state.container || getContainer();

    const page =
      TIC.Pages?.[route] ||
      TIC.Pages?.home;

    if (!container || !page) {
      throw new Error(
        "Application container or fallback page is unavailable."
      );
    }

    if (typeof page.mount === "function") {
      page.mount({
        container,
        route
      });

      return true;
    }

    if (typeof page.render === "function") {
      container.innerHTML =
        page.render({
          container,
          route
        });

      if (
        typeof page.afterEnter === "function"
      ) {
        page.afterEnter({
          container,
          route
        });
      }

      return true;
    }

    throw new Error(
      `Page "${route}" cannot be mounted.`
    );
  };

  const startRouter = async () => {
    const router = TIC.Router;
    const route = getInitialRoute();

    if (
      router &&
      typeof router.go === "function"
    ) {
      try {
        const result = router.go(
          route,
          {
            source: "app-bootstrap",
            replace: true
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

  const initializeModules = () => {
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

    state.container = getContainer();

    if (!state.container) {
      throw new Error(
        "Application route container was not found."
      );
    }

    if (
      typeof TIC.Router.init === "function"
    ) {
      TIC.Router.init({
        container: state.container
      });
    }

    initializeFeatures();
    registerPages();

    return true;
  };

  const runDiagnostics = () => {
    const featureDiagnostics = {};

    Object.entries(
      TIC.Features || {}
    ).forEach(
      ([featureId, feature]) => {
        try {
          featureDiagnostics[featureId] =
            typeof feature?.diagnostics === "function"
              ? feature.diagnostics()
              : {
                  available: Boolean(feature)
                };
        } catch (error) {
          featureDiagnostics[featureId] = {
            available: Boolean(feature),
            error: error.message
          };
        }
      }
    );

    const pageDiagnostics = {};

    Object.entries(
      TIC.Pages || {}
    ).forEach(
      ([pageId, page]) => {
        try {
          pageDiagnostics[pageId] =
            typeof page?.diagnostics === "function"
              ? page.diagnostics()
              : {
                  available: Boolean(page)
                };
        } catch (error) {
          pageDiagnostics[pageId] = {
            available: Boolean(page),
            error: error.message
          };
        }
      }
    );

    return {
      id: "app",
      version: APP_VERSION,
      initialized:
        state.initialized,
      started:
        state.started,
      starting:
        state.starting,
      hasContainer:
        Boolean(state.container),
      configAvailable:
        Boolean(TIC.Config),
      dataAvailable:
        Boolean(TIC.Data),
      storeAvailable:
        Boolean(TIC.Store),
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
      featureDiagnostics,
      pageDiagnostics,
      errorCount:
        state.errors.length,
      errors:
        state.errors.slice(),
      startTime:
        state.startTime
    };
  };

  const App = {
    id: "app",
    version: APP_VERSION,

    async init() {
      if (state.initialized) {
        return this.diagnostics();
      }

      if (state.starting) {
        return this.diagnostics();
      }

      state.starting = true;
      state.startTime =
        new Date().toISOString();

      try {
        initializeModules();

        state.initialized = true;

        await startRouter();

        state.started = true;

        window.dispatchEvent(
          new CustomEvent(
            "tic:app:started",
            {
              detail: {
                version: APP_VERSION,
                route: getInitialRoute(),
                registeredPages:
                  Array.from(
                    state.registeredPages
                  ),
                initializedFeatures:
                  Array.from(
                    state.initializedFeatures
                  ),
                timestamp:
                  new Date().toISOString()
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
      }

      return this.diagnostics();
    },

    async restart() {
      state.initialized = false;
      state.started = false;
      state.starting = false;
      state.container = null;
      state.registeredPages.clear();
      state.initializedFeatures.clear();
      state.errors = [];
      state.startTime = null;

      return this.init();
    },

    registerPages() {
      return registerPages();
    },

    initializeFeatures() {
      return initializeFeatures();
    },

    go(route, options = {}) {
      if (
        TIC.Router &&
        typeof TIC.Router.go === "function"
      ) {
        return TIC.Router.go(
          route,
          options
        );
      }

      return mountFallback(route);
    },

    diagnostics() {
      return runDiagnostics();
    }
  };

  TIC.App = App;
  window.TICApp = App;

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
