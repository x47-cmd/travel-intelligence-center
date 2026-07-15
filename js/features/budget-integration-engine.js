/* =========================================================
   Travel Intelligence Center
   Budget Intelligence Platform
   Budget Integration Engine V1.0.0

   File Path:
   js/features/budget-integration-engine.js

   Purpose:
   - Central integration and orchestration layer for the complete
     Budget Intelligence Platform.
   - Connects all budget engines with the Store and page lifecycle.
   - Validates engine availability, version compatibility,
     readiness, subscriptions and event flow.
   - Provides unified dashboard, health checks, diagnostics,
     synchronization, bootstrap and recovery operations.
   - Prevents duplicate subscriptions and uncontrolled refresh loops.
   - Exposes one stable API for the Budget page and application shell.

   Dependencies:
   - window.TICBudgetEngine
   - window.TICExpenseEngine
   - window.TICSavingsEngine
   - window.TICBudgetAnalytics
   - window.TICBudgetAI
   - window.TICPaymentTracker
   - window.TICExpenseAlertEngine
   - window.TICBudgetExportEngine
   - window.TICBudgetNotificationEngine
   - window.TICStore / window.Store

   Global:
   - window.TICBudgetIntegrationEngine
   ========================================================= */

(function budgetIntegrationEngineFactory(global) {
  "use strict";

  const VERSION = "1.0.0";
  const ENGINE_NAME = "TICBudgetIntegrationEngine";

  const EVENTS = Object.freeze({
    READY: "tic:budget-integration-ready",
    BOOTSTRAP_STARTED: "tic:budget-integration-bootstrap-started",
    BOOTSTRAP_COMPLETED: "tic:budget-integration-bootstrap-completed",
    BOOTSTRAP_FAILED: "tic:budget-integration-bootstrap-failed",
    SYNC_STARTED: "tic:budget-integration-sync-started",
    SYNC_COMPLETED: "tic:budget-integration-sync-completed",
    SYNC_FAILED: "tic:budget-integration-sync-failed",
    HEALTH_CHANGED: "tic:budget-integration-health-changed",
    ENGINE_CONNECTED: "tic:budget-engine-connected",
    ENGINE_DISCONNECTED: "tic:budget-engine-disconnected",
    ERROR: "tic:budget-integration-error"
  });

  const STATUS = Object.freeze({
    READY: "ready",
    DEGRADED: "degraded",
    FAILED: "failed",
    INITIALIZING: "initializing",
    DISCONNECTED: "disconnected"
  });

  const MODULES = Object.freeze({
    budget: {
      key: "budget",
      globalName: "TICBudgetEngine",
      required: true
    },
    expense: {
      key: "expense",
      globalName: "TICExpenseEngine",
      required: true
    },
    savings: {
      key: "savings",
      globalName: "TICSavingsEngine",
      required: true
    },
    analytics: {
      key: "analytics",
      globalName: "TICBudgetAnalytics",
      required: true
    },
    ai: {
      key: "ai",
      globalName: "TICBudgetAI",
      required: true
    },
    payments: {
      key: "payments",
      globalName: "TICPaymentTracker",
      required: true
    },
    alerts: {
      key: "alerts",
      globalName: "TICExpenseAlertEngine",
      required: true
    },
    export: {
      key: "export",
      globalName: "TICBudgetExportEngine",
      required: true
    },
    notifications: {
      key: "notifications",
      globalName: "TICBudgetNotificationEngine",
      required: true
    }
  });

  const DEFAULTS = Object.freeze({
    autoBootstrap: true,
    autoSync: true,
    syncDebounceMs: 120,
    startupTimeoutMs: 5000,
    healthCheckIntervalMs: 60000,
    strictMode: false,
    recoverOnFailure: true,
    exposeUnifiedDashboard: true
  });

  const SOURCE_EVENTS = Object.freeze([
    "store:changed",
    "tic:expenses-changed",
    "tic:expense-created",
    "tic:expense-updated",
    "tic:expense-deleted",
    "tic:expense-refunded",
    "tic:savings-changed",
    "tic:savings-plan-updated",
    "tic:savings-deposit-added",
    "tic:savings-withdrawal-added",
    "tic:payments-changed",
    "tic:payment-created",
    "tic:payment-updated",
    "tic:payment-paid",
    "tic:payment-refunded",
    "tic:budget-analytics-changed",
    "tic:budget-ai-recommendations-changed",
    "tic:expense-alerts-changed",
    "tic:budget-notifications-changed"
  ]);

  const state = {
    initialized: false,
    bootstrapping: false,
    syncing: false,
    subscribed: false,
    status: STATUS.DISCONNECTED,
    options: null,
    store: null,
    storeUnsubscribe: null,
    eventBindings: [],
    listeners: new Set(),
    syncTimer: null,
    healthTimer: null,
    lastSyncAt: null,
    lastHealth: null,
    lastDashboard: null,
    moduleStates: {},
    syncCount: 0,
    errorCount: 0
  };

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (isObject(value)) return Object.values(value);
    return [];
  }

  function clone(value) {
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
  }

  function firstDefined() {
    for (let index = 0; index < arguments.length; index += 1) {
      const value = arguments[index];

      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }

    return undefined;
  }

  function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (fallback ?? 0);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, toNumber(value, min)));
  }

  function createId(prefix) {
    return String(prefix || "integration") + "_" +
      Date.now().toString(36) + "_" +
      Math.random().toString(36).slice(2, 9);
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function resolveOptions(options) {
    const input = isObject(options) ? options : {};

    return Object.assign({}, DEFAULTS, input, {
      syncDebounceMs: clamp(
        Math.round(toNumber(
          input.syncDebounceMs,
          DEFAULTS.syncDebounceMs
        )),
        0,
        5000
      ),
      startupTimeoutMs: clamp(
        Math.round(toNumber(
          input.startupTimeoutMs,
          DEFAULTS.startupTimeoutMs
        )),
        500,
        30000
      ),
      healthCheckIntervalMs: clamp(
        Math.round(toNumber(
          input.healthCheckIntervalMs,
          DEFAULTS.healthCheckIntervalMs
        )),
        5000,
        3600000
      )
    });
  }

  function resolveStore(store) {
    return store ||
      global.TICStore ||
      global.Store ||
      global.store ||
      null;
  }

  function readState(store) {
    const source = resolveStore(store);

    if (!source) return {};

    try {
      if (typeof source.getState === "function") {
        return source.getState() || {};
      }

      if (typeof source.get === "function") {
        const result = source.get();
        if (isObject(result)) return result;
      }

      if (isObject(source.state)) return source.state;
      if (isObject(source.data)) return source.data;
      if (isObject(source)) return source;
    } catch (error) {
      reportError(
        "STORE_READ_FAILED",
        "تعذر قراءة بيانات الربط من المخزن.",
        "Unable to read integration data from the Store.",
        { cause: error.message }
      );
    }

    return {};
  }

  function getModuleDefinition(key) {
    return MODULES[key] || null;
  }

  function getModule(key) {
    const definition = getModuleDefinition(key);

    if (!definition) return null;

    return global[definition.globalName] || null;
  }

  function moduleExists(key) {
    return Boolean(getModule(key));
  }

  function getModuleVersion(module) {
    return String(
      firstDefined(
        module && module.version,
        module && module.VERSION,
        "unknown"
      )
    );
  }

  function hasMethod(module, method) {
    return Boolean(
      module &&
      typeof module[method] === "function"
    );
  }

  function callModule(key, methods, args) {
    const module = getModule(key);

    if (!module) {
      return {
        success: false,
        key: key,
        method: null,
        result: null,
        error: "module-not-found"
      };
    }

    const methodList = asArray(methods);

    for (let index = 0; index < methodList.length; index += 1) {
      const method = methodList[index];

      if (typeof module[method] !== "function") {
        continue;
      }

      try {
        const result = module[method].apply(
          module,
          asArray(args)
        );

        return {
          success: true,
          key: key,
          method: method,
          result: result,
          error: null
        };
      } catch (error) {
        return {
          success: false,
          key: key,
          method: method,
          result: null,
          error: error.message
        };
      }
    }

    return {
      success: false,
      key: key,
      method: null,
      result: null,
      error: "compatible-method-not-found"
    };
  }

  function inspectModule(key) {
    const definition = getModuleDefinition(key);
    const module = getModule(key);

    if (!definition) {
      return {
        key: key,
        exists: false,
        required: false,
        ready: false,
        status: STATUS.FAILED,
        version: "unknown",
        methods: {}
      };
    }

    const methodChecks = {
      initialize: hasMethod(module, "initialize") ||
        hasMethod(module, "init"),
      refresh: hasMethod(module, "refresh"),
      dashboard: hasMethod(module, "getDashboard") ||
        hasMethod(module, "buildDashboard") ||
        hasMethod(module, "getSnapshot"),
      subscribe: hasMethod(module, "subscribe"),
      destroy: hasMethod(module, "destroy")
    };

    const exists = Boolean(module);
    const coreReady =
      exists &&
      methodChecks.initialize &&
      methodChecks.dashboard;

    return {
      key: key,
      globalName: definition.globalName,
      exists: exists,
      required: definition.required,
      ready: coreReady,
      status:
        !exists
          ? STATUS.DISCONNECTED
          : coreReady
            ? STATUS.READY
            : STATUS.DEGRADED,
      version: getModuleVersion(module),
      methods: methodChecks
    };
  }

  function inspectAllModules() {
    const result = {};

    Object.keys(MODULES).forEach(function inspect(key) {
      result[key] = inspectModule(key);
    });

    state.moduleStates = clone(result);
    return result;
  }

  function initializeModule(key, options) {
    const module = getModule(key);

    if (!module) {
      return {
        key: key,
        initialized: false,
        error: "module-not-found"
      };
    }

    const method =
      hasMethod(module, "initialize")
        ? "initialize"
        : hasMethod(module, "init")
          ? "init"
          : null;

    if (!method) {
      return {
        key: key,
        initialized: false,
        error: "initialize-method-not-found"
      };
    }

    try {
      const result = module[method](
        Object.assign({}, options || {}, {
          store: state.store
        })
      );

      const payload = {
        key: key,
        initialized: true,
        method: method,
        version: getModuleVersion(module),
        result: result,
        error: null
      };

      dispatch(EVENTS.ENGINE_CONNECTED, payload);
      return payload;
    } catch (error) {
      const payload = {
        key: key,
        initialized: false,
        method: method,
        version: getModuleVersion(module),
        result: null,
        error: error.message
      };

      dispatch(EVENTS.ENGINE_DISCONNECTED, payload);
      return payload;
    }
  }

  function initializeAllModules(options) {
    const results = [];

    Object.keys(MODULES).forEach(function initialize(key) {
      results.push(
        initializeModule(key, options)
      );
    });

    return results;
  }

  function getUnifiedDashboard(options) {
    const input = isObject(options) ? options : {};
    const storeState = readState(
      input.store || state.store
    );

    const analytics = callModule(
      "analytics",
      ["getDashboard", "getSnapshot", "generate"],
      [Object.assign({}, input, { store: state.store })]
    );

    const ai = callModule(
      "ai",
      ["getDashboard", "generateDashboard"],
      [Object.assign({}, input, { store: state.store })]
    );

    const payments = callModule(
      "payments",
      ["getDashboard", "buildDashboard"],
      [Object.assign({}, input, { store: state.store })]
    );

    const alerts = callModule(
      "alerts",
      ["getDashboard", "buildDashboard"],
      [Object.assign({}, input, { store: state.store })]
    );

    const notifications = callModule(
      "notifications",
      ["getDashboard", "buildDashboard"],
      [Object.assign({}, input, { store: state.store })]
    );

    const savings = callModule(
      "savings",
      ["getDashboard", "getSummary", "analyze"],
      [Object.assign({}, input, { store: state.store })]
    );

    const expense = callModule(
      "expense",
      ["getDashboard", "getSummary", "analyze", "listExpenses"],
      [Object.assign({}, input, { store: state.store })]
    );

    const budget = callModule(
      "budget",
      ["getDashboard", "getSummary", "analyze", "getAnnualOverview"],
      [Object.assign({}, input, { store: state.store })]
    );

    const dashboard = {
      generatedAt: nowISO(),
      version: VERSION,
      engine: ENGINE_NAME,
      status: state.status,
      storeConnected: Boolean(state.store),
      profile: clone(
        storeState && storeState.profile
      ),
      settings: clone(
        storeState && storeState.settings
      ),
      budget:
        budget.success
          ? clone(budget.result)
          : null,
      expenses:
        expense.success
          ? clone(expense.result)
          : null,
      savings:
        savings.success
          ? clone(savings.result)
          : null,
      analytics:
        analytics.success
          ? clone(analytics.result)
          : null,
      ai:
        ai.success
          ? clone(ai.result)
          : null,
      payments:
        payments.success
          ? clone(payments.result)
          : null,
      alerts:
        alerts.success
          ? clone(alerts.result)
          : null,
      notifications:
        notifications.success
          ? clone(notifications.result)
          : null,
      integration: {
        syncCount: state.syncCount,
        errorCount: state.errorCount,
        lastSyncAt: state.lastSyncAt,
        moduleStates: clone(state.moduleStates)
      }
    };

    dashboard.summary = {
      annualBudget: firstDefined(
        dashboard.analytics &&
          dashboard.analytics.annualBudget,
        dashboard.budget &&
          dashboard.budget.annualBudget,
        0
      ),
      totalSpent: firstDefined(
        dashboard.analytics &&
          dashboard.analytics.totalSpent,
        dashboard.budget &&
          dashboard.budget.totalSpent,
        0
      ),
      remaining: firstDefined(
        dashboard.analytics &&
          dashboard.analytics.remaining,
        dashboard.budget &&
          dashboard.budget.remaining,
        0
      ),
      healthScore: firstDefined(
        dashboard.analytics &&
          dashboard.analytics.health &&
          dashboard.analytics.health.score,
        0
      ),
      recommendationCount: asArray(
        dashboard.ai &&
        dashboard.ai.recommendations
      ).length,
      criticalAlerts: firstDefined(
        dashboard.alerts &&
          dashboard.alerts.summary &&
          dashboard.alerts.summary.critical,
        0
      ),
      unreadNotifications: firstDefined(
        dashboard.notifications &&
          dashboard.notifications.summary &&
          dashboard.notifications.summary.unread,
        0
      ),
      overduePayments: firstDefined(
        dashboard.payments &&
          dashboard.payments.summary &&
          dashboard.payments.summary.overdueCount,
        0
      )
    };

    state.lastDashboard = clone(dashboard);
    return dashboard;
  }

  function calculateHealth() {
    const modules = inspectAllModules();
    const keys = Object.keys(modules);

    const total = keys.length;
    const existing = keys.filter(function exists(key) {
      return modules[key].exists;
    }).length;

    const ready = keys.filter(function readyModule(key) {
      return modules[key].ready;
    }).length;

    const requiredMissing = keys.filter(function missing(key) {
      return (
        modules[key].required &&
        !modules[key].exists
      );
    });

    const degraded = keys.filter(function degradedModule(key) {
      return modules[key].status === STATUS.DEGRADED;
    });

    const score = total > 0
      ? Math.round((ready / total) * 100)
      : 0;

    let status = STATUS.READY;

    if (requiredMissing.length > 0) {
      status = STATUS.FAILED;
    } else if (
      degraded.length > 0 ||
      ready < total
    ) {
      status = STATUS.DEGRADED;
    }

    const health = {
      generatedAt: nowISO(),
      status: status,
      score: score,
      totalModules: total,
      existingModules: existing,
      readyModules: ready,
      missingModules: requiredMissing,
      degradedModules: degraded,
      storeConnected: Boolean(state.store),
      subscribed: state.subscribed,
      syncing: state.syncing,
      lastSyncAt: state.lastSyncAt,
      syncCount: state.syncCount,
      errorCount: state.errorCount,
      modules: modules
    };

    const previousStatus =
      state.lastHealth &&
      state.lastHealth.status;

    state.lastHealth = clone(health);
    state.status = status;

    if (previousStatus !== status) {
      dispatch(EVENTS.HEALTH_CHANGED, health);
    }

    return health;
  }

  function refreshModule(key, options) {
    const module = getModule(key);

    if (!module) {
      return {
        key: key,
        refreshed: false,
        method: null,
        error: "module-not-found"
      };
    }

    const methods = [
      "refresh",
      "getDashboard",
      "buildDashboard",
      "getSnapshot"
    ];

    for (let index = 0; index < methods.length; index += 1) {
      const method = methods[index];

      if (typeof module[method] !== "function") {
        continue;
      }

      try {
        const result = module[method](
          Object.assign({}, options || {}, {
            store: state.store
          })
        );

        return {
          key: key,
          refreshed: true,
          method: method,
          result: result,
          error: null
        };
      } catch (error) {
        return {
          key: key,
          refreshed: false,
          method: method,
          result: null,
          error: error.message
        };
      }
    }

    return {
      key: key,
      refreshed: false,
      method: null,
      result: null,
      error: "refresh-method-not-found"
    };
  }

  function sync(options) {
    if (state.syncing) {
      return clone(
        state.lastDashboard ||
        getUnifiedDashboard(options || {})
      );
    }

    state.syncing = true;

    const syncId = createId("budget_sync");

    dispatch(EVENTS.SYNC_STARTED, {
      id: syncId,
      generatedAt: nowISO()
    });

    try {
      const refreshOrder = [
        "budget",
        "expense",
        "savings",
        "payments",
        "analytics",
        "ai",
        "alerts",
        "notifications"
      ];

      const results = refreshOrder.map(
        function refresh(key) {
          return refreshModule(key, options || {});
        }
      );

      const failures = results.filter(
        function failed(item) {
          return !item.refreshed;
        }
      );

      if (
        failures.length &&
        state.options &&
        state.options.strictMode
      ) {
        throw new Error(
          "Budget integration sync failed for: " +
          failures.map(function key(item) {
            return item.key;
          }).join(", ")
        );
      }

      state.syncCount += 1;
      state.lastSyncAt = nowISO();

      const dashboard = getUnifiedDashboard(
        options || {}
      );

      const health = calculateHealth();

      const result = {
        id: syncId,
        generatedAt: nowISO(),
        dashboard: dashboard,
        health: health,
        moduleResults: results,
        failures: failures
      };

      dispatch(EVENTS.SYNC_COMPLETED, result);
      notify(result);

      return clone(dashboard);
    } catch (error) {
      state.errorCount += 1;

      const payload = {
        id: syncId,
        message: error.message,
        generatedAt: nowISO()
      };

      dispatch(EVENTS.SYNC_FAILED, payload);

      reportError(
        "SYNC_FAILED",
        "تعذر مزامنة منصة الميزانية.",
        "Unable to synchronize the Budget platform.",
        { cause: error.message }
      );

      if (
        state.options &&
        state.options.recoverOnFailure
      ) {
        try {
          recover();
        } catch (recoveryError) {
          // Recovery failure is already reflected in health.
        }
      }

      throw error;
    } finally {
      state.syncing = false;
    }
  }

  function scheduleSync(options) {
    if (
      !state.options ||
      state.options.autoSync === false
    ) {
      return;
    }

    if (state.syncTimer) {
      global.clearTimeout(state.syncTimer);
    }

    state.syncTimer = global.setTimeout(
      function runScheduledSync() {
        state.syncTimer = null;

        try {
          sync(options || state.options || {});
        } catch (error) {
          console.error(
            "[" + ENGINE_NAME + "] Scheduled sync failed.",
            error
          );
        }
      },
      state.options.syncDebounceMs
    );
  }

  function subscribeToStore() {
    if (state.subscribed) {
      return true;
    }

    const source = state.store;

    if (
      source &&
      typeof source.subscribe === "function"
    ) {
      try {
        const unsubscribe = source.subscribe(
          function onStoreChange() {
            scheduleSync({ store: source });
          }
        );

        if (typeof unsubscribe === "function") {
          state.storeUnsubscribe = unsubscribe;
        }
      } catch (error) {
        reportError(
          "STORE_SUBSCRIBE_FAILED",
          "تعذر الاشتراك في تحديثات المخزن.",
          "Unable to subscribe to Store updates.",
          { cause: error.message }
        );
      }
    }

    SOURCE_EVENTS.forEach(function bind(name) {
      const handler = function onSourceEvent(event) {
        if (
          event &&
          event.detail &&
          event.detail.engine === ENGINE_NAME
        ) {
          return;
        }

        scheduleSync({ store: source });
      };

      global.addEventListener(name, handler);

      state.eventBindings.push({
        name: name,
        handler: handler
      });
    });

    state.subscribed = true;
    return true;
  }

  function unsubscribeAll() {
    if (
      typeof state.storeUnsubscribe === "function"
    ) {
      state.storeUnsubscribe();
    }

    state.eventBindings.forEach(function unbind(binding) {
      global.removeEventListener(
        binding.name,
        binding.handler
      );
    });

    state.storeUnsubscribe = null;
    state.eventBindings = [];
    state.subscribed = false;

    return true;
  }

  function startHealthMonitor() {
    stopHealthMonitor();

    if (
      !state.options ||
      state.options.healthCheckIntervalMs <= 0
    ) {
      return false;
    }

    state.healthTimer = global.setInterval(
      function healthCheck() {
        try {
          calculateHealth();
        } catch (error) {
          console.error(
            "[" + ENGINE_NAME + "] Health check failed.",
            error
          );
        }
      },
      state.options.healthCheckIntervalMs
    );

    return true;
  }

  function stopHealthMonitor() {
    if (state.healthTimer) {
      global.clearInterval(state.healthTimer);
      state.healthTimer = null;
    }

    return true;
  }

  function bootstrap(options) {
    if (state.bootstrapping) {
      return clone(
        state.lastDashboard ||
        getUnifiedDashboard(options || {})
      );
    }

    state.bootstrapping = true;
    state.status = STATUS.INITIALIZING;

    const bootstrapId = createId("budget_bootstrap");
    const resolved = resolveOptions(options);

    state.options = resolved;
    state.store = resolveStore(resolved.store);

    dispatch(EVENTS.BOOTSTRAP_STARTED, {
      id: bootstrapId,
      generatedAt: nowISO(),
      options: clone(resolved)
    });

    try {
      const moduleInspection = inspectAllModules();

      const missingRequired = Object.keys(moduleInspection)
        .filter(function missing(key) {
          return (
            moduleInspection[key].required &&
            !moduleInspection[key].exists
          );
        });

      if (
        missingRequired.length &&
        resolved.strictMode
      ) {
        throw new Error(
          "Missing required Budget modules: " +
          missingRequired.join(", ")
        );
      }

      const initializationResults =
        initializeAllModules({
          store: state.store
        });

      subscribeToStore();
      startHealthMonitor();

      const dashboard = sync({
        store: state.store
      });

      const health = calculateHealth();

      state.initialized = true;

      const result = {
        id: bootstrapId,
        generatedAt: nowISO(),
        dashboard: dashboard,
        health: health,
        initializationResults: initializationResults
      };

      dispatch(EVENTS.BOOTSTRAP_COMPLETED, result);
      dispatch(EVENTS.READY, result);

      return clone(dashboard);
    } catch (error) {
      state.errorCount += 1;
      state.status = STATUS.FAILED;

      const payload = {
        id: bootstrapId,
        message: error.message,
        generatedAt: nowISO()
      };

      dispatch(EVENTS.BOOTSTRAP_FAILED, payload);

      reportError(
        "BOOTSTRAP_FAILED",
        "تعذر تشغيل منصة الميزانية الذكية.",
        "Unable to bootstrap the Budget Intelligence Platform.",
        { cause: error.message }
      );

      throw error;
    } finally {
      state.bootstrapping = false;
    }
  }

  function recover(options) {
    unsubscribeAll();
    stopHealthMonitor();

    const inspection = inspectAllModules();

    const disconnected = Object.keys(inspection)
      .filter(function disconnectedModule(key) {
        return !inspection[key].ready;
      });

    disconnected.forEach(function reinitialize(key) {
      initializeModule(
        key,
        Object.assign({}, state.options || {}, options || {})
      );
    });

    subscribeToStore();
    startHealthMonitor();

    const dashboard = sync(
      Object.assign(
        {},
        state.options || {},
        options || {},
        { store: state.store }
      )
    );

    return {
      recovered: true,
      disconnectedModules: disconnected,
      dashboard: dashboard,
      health: calculateHealth()
    };
  }

  function getDiagnostics() {
    return {
      generatedAt: nowISO(),
      engine: ENGINE_NAME,
      version: VERSION,
      initialized: state.initialized,
      bootstrapping: state.bootstrapping,
      syncing: state.syncing,
      subscribed: state.subscribed,
      status: state.status,
      storeConnected: Boolean(state.store),
      syncCount: state.syncCount,
      errorCount: state.errorCount,
      lastSyncAt: state.lastSyncAt,
      options: clone(state.options),
      health: clone(
        state.lastHealth ||
        calculateHealth()
      ),
      moduleStates: clone(
        state.moduleStates ||
        inspectAllModules()
      )
    };
  }

  function validateDataFlow() {
    const checks = [];

    const storeState = readState(state.store);

    checks.push({
      key: "store-readable",
      passed: isObject(storeState),
      details: null
    });

    const analytics = callModule(
      "analytics",
      ["getSnapshot", "getDashboard", "generate"],
      [{ store: state.store }]
    );

    checks.push({
      key: "analytics-readable",
      passed: analytics.success,
      details: analytics.error
    });

    const payments = callModule(
      "payments",
      ["getDashboard", "buildDashboard"],
      [{ store: state.store }]
    );

    checks.push({
      key: "payments-readable",
      passed: payments.success,
      details: payments.error
    });

    const alerts = callModule(
      "alerts",
      ["getDashboard", "buildDashboard"],
      [{ store: state.store }]
    );

    checks.push({
      key: "alerts-readable",
      passed: alerts.success,
      details: alerts.error
    });

    const notifications = callModule(
      "notifications",
      ["getDashboard", "buildDashboard"],
      [{ store: state.store }]
    );

    checks.push({
      key: "notifications-readable",
      passed: notifications.success,
      details: notifications.error
    });

    const exportEngine = getModule("export");

    checks.push({
      key: "export-ready",
      passed: Boolean(
        exportEngine &&
        typeof exportEngine.exportReport === "function"
      ),
      details: null
    });

    return {
      generatedAt: nowISO(),
      passed: checks.every(function passed(check) {
        return check.passed;
      }),
      checks: checks
    };
  }

  function subscribe(listener, options) {
    if (typeof listener !== "function") {
      throw new TypeError(
        "Budget Integration subscriber must be a function."
      );
    }

    state.listeners.add(listener);

    if (!options || options.immediate !== false) {
      listener(
        clone({
          dashboard:
            state.lastDashboard ||
            getUnifiedDashboard(options || {}),
          health:
            state.lastHealth ||
            calculateHealth()
        })
      );
    }

    return function unsubscribe() {
      state.listeners.delete(listener);
    };
  }

  function notify(payload) {
    state.listeners.forEach(function call(listener) {
      try {
        listener(clone(payload));
      } catch (error) {
        console.error(
          "[" + ENGINE_NAME + "] Listener failed.",
          error
        );
      }
    });
  }

  function dispatch(name, detail) {
    try {
      global.dispatchEvent(
        new CustomEvent(name, {
          detail: clone(
            Object.assign(
              {
                engine: ENGINE_NAME
              },
              detail || {}
            )
          )
        })
      );
    } catch (error) {
      console.warn(
        "[" + ENGINE_NAME + "] Unable to dispatch event:",
        name,
        error
      );
    }
  }

  function reportError(code, messageAr, messageEn, details) {
    const payload = {
      code: code,
      messageAr: messageAr || "",
      messageEn: messageEn || "",
      details: details || null,
      generatedAt: nowISO()
    };

    dispatch(EVENTS.ERROR, payload);
    return payload;
  }

  function initialize(options) {
    if (state.initialized) {
      if (options && options.refresh === true) {
        return sync(options);
      }

      return clone(
        state.lastDashboard ||
        getUnifiedDashboard(options || {})
      );
    }

    return bootstrap(options || {});
  }

  function destroy() {
    if (state.syncTimer) {
      global.clearTimeout(state.syncTimer);
      state.syncTimer = null;
    }

    stopHealthMonitor();
    unsubscribeAll();

    Object.keys(MODULES).forEach(function destroyModule(key) {
      const module = getModule(key);

      if (
        module &&
        typeof module.destroy === "function"
      ) {
        try {
          module.destroy();
        } catch (error) {
          // Continue destroying remaining modules.
        }
      }
    });

    state.listeners.clear();
    state.initialized = false;
    state.bootstrapping = false;
    state.syncing = false;
    state.status = STATUS.DISCONNECTED;
    state.options = null;
    state.store = null;
    state.lastSyncAt = null;
    state.lastHealth = null;
    state.lastDashboard = null;
    state.moduleStates = {};
    state.syncCount = 0;
    state.errorCount = 0;

    return true;
  }

  const API = Object.freeze({
    version: VERSION,
    name: ENGINE_NAME,
    events: EVENTS,
    constants: Object.freeze({
      STATUS: STATUS,
      MODULES: MODULES,
      DEFAULTS: DEFAULTS,
      SOURCE_EVENTS: SOURCE_EVENTS
    }),

    initialize: initialize,
    init: initialize,
    bootstrap: bootstrap,
    sync: sync,
    scheduleSync: scheduleSync,
    recover: recover,
    destroy: destroy,

    getUnifiedDashboard: getUnifiedDashboard,
    getDashboard: function getDashboard(options) {
      return getUnifiedDashboard(options || {});
    },
    getHealth: calculateHealth,
    getDiagnostics: getDiagnostics,
    validateDataFlow: validateDataFlow,
    inspectModule: inspectModule,
    inspectAllModules: inspectAllModules,
    initializeModule: initializeModule,
    initializeAllModules: initializeAllModules,
    refreshModule: refreshModule,
    getModule: getModule,
    moduleExists: moduleExists,

    subscribe: subscribe,
    subscribeToStore: subscribeToStore,
    unsubscribeAll: unsubscribeAll,
    startHealthMonitor: startHealthMonitor,
    stopHealthMonitor: stopHealthMonitor,

    utils: Object.freeze({
      isObject: isObject,
      asArray: asArray,
      clone: clone,
      firstDefined: firstDefined,
      toNumber: toNumber,
      clamp: clamp,
      createId: createId,
      nowISO: nowISO,
      resolveOptions: resolveOptions,
      resolveStore: resolveStore,
      readState: readState,
      getModuleVersion: getModuleVersion,
      hasMethod: hasMethod
    })
  });

  global.TIC = global.TIC || {};
  global.TIC.Features = global.TIC.Features || {};
  global.TIC.Features.budgetIntegrationEngine = API;
  global.TICBudgetIntegrationEngine = API;

  if (
    global.document &&
    global.document.readyState === "loading"
  ) {
    global.document.addEventListener(
      "DOMContentLoaded",
      function initializeOnReady() {
        if (DEFAULTS.autoBootstrap) {
          try {
            initialize();
          } catch (error) {
            console.error(
              "[" + ENGINE_NAME + "] Initialization failed.",
              error
            );
          }
        }
      },
      { once: true }
    );
  } else if (DEFAULTS.autoBootstrap) {
    global.setTimeout(function initializeSoon() {
      try {
        initialize();
      } catch (error) {
        console.error(
          "[" + ENGINE_NAME + "] Initialization failed.",
          error
        );
      }
    }, 0);
  }
})(window);
