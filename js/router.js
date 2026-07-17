/* =========================================================
   Travel Intelligence Center
   Application Router V1.0.0

   File Path:
   js/router.js

   Purpose:
   - Central navigation service for the application.
   - Registers the five main application routes.
   - Supports page-module registration before or after startup.
   - Handles browser history, URL hashes, delegated navigation,
     active navigation states, route persistence, page lifecycle,
     loading states, errors, focus management, and diagnostics.
   - Does not own or modify travel business data.

   Dependencies:
   - js/config.js
   - js/store.js
   - js/ui.js is optional at load time and may be used when ready.

   Expected Page Modules:
   - js/pages/home.js
   - js/pages/trips.js
   - js/pages/guide.js
   - js/pages/budget.js
   - js/pages/more.js

   Supported Page Module Shape:
   {
     id: "home",
     render(context) => string | Node | void,
     mount(context) => void,
     unmount(context) => void,
     beforeEnter(context) => boolean | Promise<boolean>,
     afterEnter(context) => void,
     beforeLeave(context) => boolean | Promise<boolean>,
     afterLeave(context) => void
   }
========================================================= */

(function (window, document) {
  "use strict";

  const Config = window.TICConfig || window.TIC?.Config;

  if (!Config) {
    throw new Error(
      "TIC Router Error: configuration was not found. Load js/config.js before js/router.js."
    );
  }

  const ROUTER_VERSION = "1.0.0";
  const ROUTE_STORAGE_KEY =
    Config.storage?.currentRouteKey || "tic.current-route.v1";

  const DEFAULT_START_ROUTE =
    Config.app?.startRoute || "home";

  const DEFAULT_FALLBACK_ROUTE =
    Config.app?.fallbackRoute || DEFAULT_START_ROUTE;

  const VIEW_SELECTORS = [
    "[data-router-view]",
    "#app-view",
    "#tic-page",
    "#app-content"
  ];

  const NAVIGATION_SELECTOR = "[data-route]";
  const ACTIVE_CLASSES = ["is-active", "active"];

  const routes = new Map();
  const modules = new Map();
  const listeners = new Set();

  let initialized = false;
  let started = false;
  let navigating = false;
  let navigationSequence = 0;
  let viewElement = null;
  let currentRoute = null;
  let previousRoute = null;
  let currentContext = null;
  let clickHandler = null;
  let popStateHandler = null;
  let hashChangeHandler = null;

  const isObject = (value) =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);

  const clone = (value) => {
    if (value === undefined) {
      return undefined;
    }

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

  const normalizeRouteName = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^#+/, "")
      .replace(/^\/+|\/+$/g, "")
      .split(/[/?#]/)[0]
      .replace(/[^a-z0-9_-]/g, "");

  const escapeHTML = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const getViewElement = () => {
    if (viewElement && document.contains(viewElement)) {
      return viewElement;
    }

    for (const selector of VIEW_SELECTORS) {
      const element = document.querySelector(selector);

      if (element) {
        viewElement = element;
        return viewElement;
      }
    }

    return null;
  };

  const getUI = () =>
    window.TIC?.UI ||
    window.TICUI ||
    null;

  const getStore = () =>
    window.TIC?.Store ||
    window.TICStore ||
    null;

  const getRegisteredModule = (moduleId) => {
    const id = normalizeRouteName(moduleId);

    if (!id) {
      return null;
    }

    return (
      modules.get(id) ||
      window.TIC?.Pages?.[id] ||
      window.TIC?.Modules?.[id] ||
      window[`TIC${id.charAt(0).toUpperCase()}${id.slice(1)}Page`] ||
      window[`TIC${id.charAt(0).toUpperCase()}${id.slice(1)}Module`] ||
      null
    );
  };

  const safeStorageRead = () => {
    try {
      return normalizeRouteName(
        window.localStorage.getItem(ROUTE_STORAGE_KEY)
      );
    } catch (error) {
      return "";
    }
  };

  const safeStorageWrite = (routeName) => {
    try {
      window.localStorage.setItem(
        ROUTE_STORAGE_KEY,
        normalizeRouteName(routeName)
      );
      return true;
    } catch (error) {
      return false;
    }
  };

  const parseLocation = () => {
    const hashRoute = normalizeRouteName(window.location.hash);

    if (hashRoute) {
      return hashRoute;
    }

    const queryRoute = normalizeRouteName(
      new URLSearchParams(window.location.search).get("route")
    );

    if (queryRoute) {
      return queryRoute;
    }

    return "";
  };

  const routeExists = (routeName) =>
    routes.has(normalizeRouteName(routeName));

  const resolveRouteName = (routeName) => {
    const normalized = normalizeRouteName(routeName);

    if (routeExists(normalized)) {
      return normalized;
    }

    if (routeExists(DEFAULT_FALLBACK_ROUTE)) {
      return normalizeRouteName(DEFAULT_FALLBACK_ROUTE);
    }

    if (routeExists(DEFAULT_START_ROUTE)) {
      return normalizeRouteName(DEFAULT_START_ROUTE);
    }

    return routes.keys().next().value || "";
  };

  const getInitialRoute = () => {
    const fromLocation = parseLocation();

    if (routeExists(fromLocation)) {
      return fromLocation;
    }

    const fromStorage = safeStorageRead();

    if (routeExists(fromStorage)) {
      return fromStorage;
    }

    return resolveRouteName(DEFAULT_START_ROUTE);
  };

  const getRouteDefinition = (routeName) =>
    routes.get(resolveRouteName(routeName)) || null;

  const createContext = (
    route,
    params = {},
    options = {}
  ) => ({
    route: route.id,
    routeDefinition: clone(route),
    params: clone(params),
    options: { ...options },
    previousRoute,
    currentRoute: route.id,
    config: Config,
    store: getStore(),
    router: Router,
    ui: getUI(),
    container: getViewElement(),
    navigationId: navigationSequence,
    timestamp: new Date().toISOString()
  });

  const emit = (type, detail = {}) => {
    const payload = {
      type,
      currentRoute,
      previousRoute,
      ...clone(detail)
    };

    listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error("TIC Router subscriber error:", error);
      }
    });

    window.dispatchEvent(
      new CustomEvent(`tic:router:${type}`, {
        detail: payload
      })
    );

    window.dispatchEvent(
      new CustomEvent("tic:route-change", {
        detail: payload
      })
    );

    return payload;
  };

  const setBusy = (busy) => {
    const container = getViewElement();

    if (!container) {
      return;
    }

    container.setAttribute(
      "aria-busy",
      busy ? "true" : "false"
    );

    container.classList.toggle("is-loading", Boolean(busy));
  };

  const renderLoading = (route) => {
    const container = getViewElement();

    if (!container) {
      return;
    }

    container.innerHTML = `
      <section class="startup-card route-loading" aria-live="polite">
        <span class="startup-card__badge">Loading</span>
        <h2 class="startup-card__title">
          جاري فتح ${escapeHTML(route?.title || "الصفحة")}...
        </h2>
        <p class="startup-card__text">
          يتم تجهيز محتوى الصفحة والبيانات المحفوظة.
        </p>
      </section>
    `;
  };

  const renderError = (error, route) => {
    const container = getViewElement();
    const debugEnabled = Config.app?.enableDebug === true;

    if (!container) {
      console.error("TIC Router:", error);
      return;
    }

    const message = debugEnabled
      ? error?.message || "Unknown router error."
      : "تعذر تحميل الصفحة المطلوبة. حاول مرة أخرى.";

    container.innerHTML = `
      <section class="startup-card route-error" role="alert">
        <span class="startup-card__badge">Page Error</span>
        <h2 class="startup-card__title">
          تعذر فتح ${escapeHTML(route?.title || "الصفحة")}
        </h2>
        <p class="startup-card__text">
          ${escapeHTML(message)}
        </p>
        <div class="route-error__actions">
          <button
            type="button"
            class="button button--primary"
            data-route="${escapeHTML(DEFAULT_FALLBACK_ROUTE)}"
          >
            العودة إلى الرئيسية
          </button>
        </div>
      </section>
    `;

    const ui = getUI();

    if (ui && typeof ui.toast === "function") {
      ui.toast("تعذر تحميل الصفحة المطلوبة.", "error");
    }

    console.error("TIC Router navigation error:", error);
  };

  const setDocumentTitle = (route) => {
    const baseTitle =
      Config.nameArabic ||
      Config.name ||
      "Travel Intelligence Center";

    document.title = route?.title
      ? `${route.title} | ${baseTitle}`
      : Config.app?.title || baseTitle;
  };

  const updateHistory = (routeName, options = {}) => {
    if (options.history === false) {
      return;
    }

    const hash = `#${encodeURIComponent(routeName)}`;
    const state = {
      ticRoute: routeName,
      navigationId: navigationSequence
    };

    if (options.replace === true) {
      window.history.replaceState(state, "", hash);
    } else {
      window.history.pushState(state, "", hash);
    }
  };

  const updateNavigationState = (routeName) => {
    document
      .querySelectorAll(NAVIGATION_SELECTOR)
      .forEach((element) => {
        const elementRoute = normalizeRouteName(
          element.getAttribute("data-route")
        );

        const isActive = elementRoute === routeName;

        ACTIVE_CLASSES.forEach((className) => {
          element.classList.toggle(className, isActive);
        });

        if (isActive) {
          element.setAttribute("aria-current", "page");
        } else {
          element.removeAttribute("aria-current");
        }
      });
  };

  const focusView = (options = {}) => {
    const container = getViewElement();

    if (!container || options.focus === false) {
      return;
    }

    if (!container.hasAttribute("tabindex")) {
      container.setAttribute("tabindex", "-1");
    }

    window.requestAnimationFrame(() => {
      try {
        container.focus({
          preventScroll: options.scroll !== false
        });
      } catch (error) {
        container.focus();
      }
    });
  };

  const scrollToTop = (options = {}) => {
    if (options.scroll === false) {
      return;
    }

    const behavior =
      options.scrollBehavior ||
      Config.ui?.scrollBehavior ||
      "smooth";

    window.requestAnimationFrame(() => {
      try {
        window.scrollTo({
          top: 0,
          left: 0,
          behavior
        });
      } catch (error) {
        window.scrollTo(0, 0);
      }
    });
  };

  const callHook = async (
    target,
    hookName,
    context,
    defaultValue = true
  ) => {
    if (!target || typeof target[hookName] !== "function") {
      return defaultValue;
    }

    const result = await target[hookName](context);

    return result === undefined ? defaultValue : result;
  };

  const renderModuleOutput = async (
    module,
    context
  ) => {
    const container = context.container;

    if (!container) {
      throw new Error(
        "TIC Router Error: the shared route view container was not found."
      );
    }

    let output;

    if (typeof module === "function") {
      output = await module(context);
    } else if (typeof module.render === "function") {
      output = await module.render(context);
    } else if (typeof module.mount === "function") {
      output = undefined;
    } else {
      throw new Error(
        `TIC Router Error: page module "${context.route}" has no render or mount function.`
      );
    }

    if (typeof output === "string") {
      container.innerHTML = output;
    } else if (output instanceof window.Node) {
      container.replaceChildren(output);
    } else if (
      Array.isArray(output) &&
      output.every((item) => item instanceof window.Node)
    ) {
      container.replaceChildren(...output);
    }

    if (
      isObject(module) &&
      typeof module.mount === "function"
    ) {
      await module.mount(context);
    }
  };

  const unmountCurrentModule = async (
    nextRoute,
    options = {}
  ) => {
    if (!currentRoute) {
      return true;
    }

    const currentDefinition = routes.get(currentRoute);
    const currentModule = currentDefinition
      ? getRegisteredModule(currentDefinition.module)
      : null;

    const leaveContext = {
      ...(currentContext || {}),
      nextRoute,
      options: { ...options },
      router: Router,
      container: getViewElement()
    };

    const routeCanLeave = await callHook(
      currentDefinition,
      "beforeLeave",
      leaveContext,
      true
    );

    if (routeCanLeave === false) {
      return false;
    }

    const moduleCanLeave = await callHook(
      currentModule,
      "beforeLeave",
      leaveContext,
      true
    );

    if (moduleCanLeave === false) {
      return false;
    }

    await callHook(
      currentModule,
      "unmount",
      leaveContext,
      true
    );

    await callHook(
      currentDefinition,
      "afterLeave",
      leaveContext,
      true
    );

    await callHook(
      currentModule,
      "afterLeave",
      leaveContext,
      true
    );

    return true;
  };

  const registerConfiguredRoutes = () => {
    const configuredRoutes = isObject(Config.routes)
      ? Config.routes
      : {};

    Object.keys(configuredRoutes).forEach((routeName) => {
      const definition = configuredRoutes[routeName] || {};

      Router.register(routeName, {
        id: definition.id || routeName,
        title: definition.title || routeName,
        module: definition.module || routeName,
        meta: definition.meta || {}
      });
    });

    const navigation = Array.isArray(Config.navigation)
      ? Config.navigation
      : [];

    navigation.forEach((item) => {
      if (!item?.id || routes.has(item.id)) {
        return;
      }

      Router.register(item.id, {
        id: item.id,
        title: item.title || item.label || item.id,
        module: item.module || item.id,
        icon: item.icon || "",
        visible: item.visible !== false,
        order: Number(item.order) || routes.size + 1
      });
    });
  };

  const handleNavigationClick = (event) => {
    const trigger = event.target.closest(NAVIGATION_SELECTOR);

    if (!trigger) {
      return;
    }

    if (
      trigger instanceof window.HTMLAnchorElement &&
      trigger.hasAttribute("download")
    ) {
      return;
    }

    const routeName = normalizeRouteName(
      trigger.getAttribute("data-route")
    );

    if (!routeName) {
      return;
    }

    event.preventDefault();

    const params = {};

    Array.from(trigger.attributes).forEach((attribute) => {
      if (
        attribute.name.startsWith("data-param-")
      ) {
        const key = attribute.name.replace("data-param-", "");
        params[key] = attribute.value;
      }
    });

    const view = trigger.getAttribute("data-view");

    if (view) {
      params.view = view;
    }

    Router.go(routeName, {
      params,
      source: "click"
    });
  };

  const bindEvents = () => {
    if (!clickHandler) {
      clickHandler = handleNavigationClick;
      document.addEventListener("click", clickHandler);
    }

    if (!popStateHandler) {
      popStateHandler = (event) => {
        const routeName =
          normalizeRouteName(event.state?.ticRoute) ||
          parseLocation() ||
          DEFAULT_FALLBACK_ROUTE;

        Router.go(routeName, {
          replace: true,
          history: false,
          persist: true,
          source: "popstate"
        });
      };

      window.addEventListener("popstate", popStateHandler);
    }

    if (!hashChangeHandler) {
      hashChangeHandler = () => {
        const routeName = parseLocation();

        if (
          routeName &&
          routeName !== currentRoute &&
          routeExists(routeName)
        ) {
          Router.go(routeName, {
            history: false,
            persist: true,
            source: "hashchange"
          });
        }
      };

      window.addEventListener(
        "hashchange",
        hashChangeHandler
      );
    }
  };

  const unbindEvents = () => {
    if (clickHandler) {
      document.removeEventListener("click", clickHandler);
      clickHandler = null;
    }

    if (popStateHandler) {
      window.removeEventListener(
        "popstate",
        popStateHandler
      );
      popStateHandler = null;
    }

    if (hashChangeHandler) {
      window.removeEventListener(
        "hashchange",
        hashChangeHandler
      );
      hashChangeHandler = null;
    }
  };

  const Router = {
    id: "router",
    version: ROUTER_VERSION,

    init(options = {}) {
      if (initialized) {
        if (options.start === true && !started) {
          this.start(options);
        }

        return this.diagnostics();
      }

      viewElement =
        options.container ||
        getViewElement();

      registerConfiguredRoutes();
      bindEvents();

      initialized = true;

      emit("initialized", {
        routes: this.getRoutes()
      });

      if (options.start === true) {
        this.start(options);
      }

      return this.diagnostics();
    },

    start(options = {}) {
      if (!initialized) {
        this.init();
      }

      if (started && options.force !== true) {
        return Promise.resolve(currentRoute);
      }

      started = true;

      const initialRoute =
        options.route ||
        options.initialRoute ||
        getInitialRoute();

      return this.go(initialRoute, {
        replace: true,
        source: "start",
        ...options
      });
    },

    stop() {
      unbindEvents();
      started = false;

      emit("stopped", {
        route: currentRoute
      });

      return true;
    },

    destroy() {
      this.stop();

      routes.clear();
      modules.clear();
      listeners.clear();

      initialized = false;
      navigating = false;
      currentRoute = null;
      previousRoute = null;
      currentContext = null;
      viewElement = null;

      return true;
    },

    register(routeName, definition = {}) {
      const name = normalizeRouteName(
        definition.id || routeName
      );

      if (!name) {
        throw new Error(
          "TIC Router Error: a valid route name is required."
        );
      }

      const existing = routes.get(name) || {};

      const route = {
        id: name,
        title:
          definition.title ||
          existing.title ||
          name,
        module:
          normalizeRouteName(
            definition.module ||
            existing.module ||
            name
          ),
        icon:
          definition.icon ||
          existing.icon ||
          "",
        visible:
          definition.visible !== undefined
            ? definition.visible !== false
            : existing.visible !== false,
        order:
          Number(definition.order) ||
          Number(existing.order) ||
          routes.size + 1,
        meta: {
          ...(existing.meta || {}),
          ...(definition.meta || {})
        },
        beforeEnter:
          definition.beforeEnter ||
          existing.beforeEnter ||
          null,
        afterEnter:
          definition.afterEnter ||
          existing.afterEnter ||
          null,
        beforeLeave:
          definition.beforeLeave ||
          existing.beforeLeave ||
          null,
        afterLeave:
          definition.afterLeave ||
          existing.afterLeave ||
          null
      };

      routes.set(name, route);

      emit("route-registered", {
        route: clone(route)
      });

      return clone(route);
    },

    unregister(routeName) {
      const name = normalizeRouteName(routeName);

      if (!name || name === currentRoute) {
        return false;
      }

      const deleted = routes.delete(name);

      if (deleted) {
        emit("route-unregistered", {
          route: name
        });
      }

      return deleted;
    },

    registerPage(pageId, pageModule) {
      const id = normalizeRouteName(pageId);

      if (!id) {
        throw new Error(
          "TIC Router Error: a valid page module ID is required."
        );
      }

      if (
        typeof pageModule !== "function" &&
        !isObject(pageModule)
      ) {
        throw new TypeError(
          `TIC Router Error: page module "${id}" must be a function or object.`
        );
      }

      modules.set(id, pageModule);

      window.TIC = window.TIC || {};
      window.TIC.Pages = window.TIC.Pages || {};
      window.TIC.Pages[id] = pageModule;

      emit("page-registered", {
        pageId: id
      });

      return pageModule;
    },

    unregisterPage(pageId) {
      const id = normalizeRouteName(pageId);

      if (!id) {
        return false;
      }

      const deleted = modules.delete(id);

      if (window.TIC?.Pages?.[id]) {
        delete window.TIC.Pages[id];
      }

      if (deleted) {
        emit("page-unregistered", {
          pageId: id
        });
      }

      return deleted;
    },

    async go(routeName, options = {}) {
      if (!initialized) {
        this.init();
      }

      const requestedRoute =
        normalizeRouteName(routeName);

      const resolvedRoute =
        resolveRouteName(requestedRoute);

      const route = routes.get(resolvedRoute);

      if (!route) {
        const error = new Error(
          `TIC Router Error: no route is available for "${requestedRoute}".`
        );

        renderError(error, {
          title: "الصفحة"
        });

        return false;
      }

      if (
        navigating &&
        options.force !== true
      ) {
        return false;
      }

      const params =
        isObject(options.params)
          ? clone(options.params)
          : {};

      if (
        currentRoute === resolvedRoute &&
        options.force !== true
      ) {
        updateNavigationState(resolvedRoute);

        emit("duplicate-navigation", {
          route: resolvedRoute,
          requestedRoute,
          params
        });

        return true;
      }

      navigating = true;
      navigationSequence += 1;
      const activeNavigationId = navigationSequence;

      setBusy(true);

      if (options.loading !== false) {
        renderLoading(route);
      }

      emit("before-change", {
        route: resolvedRoute,
        requestedRoute,
        params,
        navigationId: activeNavigationId,
        source: options.source || "api"
      });

      try {
        const canLeave = await unmountCurrentModule(
          resolvedRoute,
          options
        );

        if (canLeave === false) {
          emit("cancelled", {
            route: resolvedRoute,
            reason: "before-leave"
          });

          return false;
        }

        const module = getRegisteredModule(route.module);

        if (!module) {
          throw new Error(
            `TIC Router Error: page module "${route.module}" is not registered.`
          );
        }

        previousRoute = currentRoute;

        const context = createContext(
          route,
          params,
          options
        );

        const routeCanEnter = await callHook(
          route,
          "beforeEnter",
          context,
          true
        );

        if (routeCanEnter === false) {
          emit("cancelled", {
            route: resolvedRoute,
            reason: "route-before-enter"
          });

          return false;
        }

        const moduleCanEnter = await callHook(
          module,
          "beforeEnter",
          context,
          true
        );

        if (moduleCanEnter === false) {
          emit("cancelled", {
            route: resolvedRoute,
            reason: "module-before-enter"
          });

          return false;
        }

        if (activeNavigationId !== navigationSequence) {
          return false;
        }

        await renderModuleOutput(
          module,
          context
        );

        currentRoute = resolvedRoute;
        currentContext = context;

        if (options.persist !== false) {
          safeStorageWrite(currentRoute);
        }

        updateHistory(currentRoute, options);
        updateNavigationState(currentRoute);
        setDocumentTitle(route);

        await callHook(
          route,
          "afterEnter",
          context,
          true
        );

        await callHook(
          module,
          "afterEnter",
          context,
          true
        );

        scrollToTop(options);
        focusView(options);

        emit("changed", {
          route: currentRoute,
          requestedRoute,
          previousRoute,
          params,
          navigationId: activeNavigationId,
          source: options.source || "api"
        });

        return true;
      } catch (error) {
        renderError(error, route);

        emit("error", {
          route: resolvedRoute,
          requestedRoute,
          error: {
            name: error?.name || "Error",
            message: error?.message || String(error)
          }
        });

        return false;
      } finally {
        navigating = false;
        setBusy(false);
      }
    },

    replace(routeName, options = {}) {
      return this.go(routeName, {
        ...options,
        replace: true
      });
    },

    refresh(options = {}) {
      if (!currentRoute) {
        return this.start(options);
      }

      return this.go(currentRoute, {
        ...options,
        force: true,
        replace: true,
        source: options.source || "refresh"
      });
    },

    back() {
      window.history.back();
      return true;
    },

    forward() {
      window.history.forward();
      return true;
    },

    has(routeName) {
      return routeExists(routeName);
    },

    getRoute(routeName) {
      const route = getRouteDefinition(routeName);
      return route ? clone(route) : null;
    },

    getRoutes() {
      return Array.from(routes.values())
        .sort((a, b) => a.order - b.order)
        .map(clone);
    },

    getCurrentRoute() {
      return currentRoute;
    },

    getPreviousRoute() {
      return previousRoute;
    },

    getCurrentContext() {
      return currentContext
        ? {
            ...currentContext,
            config: Config,
            store: getStore(),
            router: Router,
            ui: getUI(),
            container: getViewElement()
          }
        : null;
    },

    getPage(pageId) {
      return getRegisteredModule(pageId);
    },

    isCurrent(routeName) {
      return (
        currentRoute ===
        normalizeRouteName(routeName)
      );
    },

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError(
          "TIC Router subscriber must be a function."
        );
      }

      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    diagnostics() {
      return {
        id: this.id,
        version: this.version,
        initialized,
        started,
        navigating,
        currentRoute,
        previousRoute,
        routeCount: routes.size,
        registeredPageCount: modules.size,
        routes: Array.from(routes.keys()),
        registeredPages: Array.from(modules.keys()),
        viewFound: Boolean(getViewElement()),
        storageKey: ROUTE_STORAGE_KEY,
        startRoute: DEFAULT_START_ROUTE,
        fallbackRoute: DEFAULT_FALLBACK_ROUTE,
        locationRoute: parseLocation(),
        persistedRoute: safeStorageRead()
      };
    }
  };

  Object.defineProperties(Router, {
    current: {
      enumerable: true,
      get() {
        return currentRoute;
      }
    },

    previous: {
      enumerable: true,
      get() {
        return previousRoute;
      }
    },

    isNavigating: {
      enumerable: true,
      get() {
        return navigating;
      }
    },

    isInitialized: {
      enumerable: true,
      get() {
        return initialized;
      }
    },

    isStarted: {
      enumerable: true,
      get() {
        return started;
      }
    }
  });

  window.TIC = window.TIC || {};
  window.TIC.Pages = window.TIC.Pages || {};
  window.TIC.Router = Router;
  window.TICRouter = Router;

  Router.init();
})(window, document);