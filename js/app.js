/* =========================================================
   Travel Intelligence Center
   Application Bootstrap V2.0.0

   File Path:
   js/app.js

   Purpose:
   - Bootstraps the complete application safely.
   - Connects Config, Store, Router, UI and Pages.
   - Registers all available page modules.
   - Restores the requested route when possible.
   - Falls back to the home page when needed.
   - Keeps the application stable on iPhone and desktop.

   Dependencies:
   - js/config.js
   - js/data.js
   - js/store.js
   - js/router.js
   - js/ui.js
   - js/features/trip-form.js
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
  const APP_VERSION = "2.0.0";

  const state = {
    initialized: false,
    started: false,
    starting: false,
    container: null,
    registeredPages: new Set(),
    errors: []
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
      hashRoute !== "home" &&
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
          router.registerPage(
            pageId,
            pageModule
          );

          state.registeredPages.add(pageId);
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
        const result = router.go(route, {
          source: "app-bootstrap",
          replace: true
        });

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

    registerPages();

    return true;
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
      state.registeredPages.clear();
      state.errors = [];

      return this.init();
    },

    registerPages() {
      return registerPages();
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
      return {
        id: this.id,
        version: this.version,
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
        registeredPages:
          Array.from(
            state.registeredPages
          ),
        errorCount:
          state.errors.length,
        errors:
          state.errors.slice()
      };
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
