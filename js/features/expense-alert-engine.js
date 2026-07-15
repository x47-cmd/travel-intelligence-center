/* =========================================================
   Travel Intelligence Center
   Budget Intelligence Platform
   Expense Alert Engine V1.0.0

   File Path:
   js/features/expense-alert-engine.js

   Purpose:
   - Production-ready alert and risk detection layer for travel finance.
   - Monitors expenses, budgets, savings, payments and analytics.
   - Detects overspending, unusual transactions, category concentration,
     duplicated expenses, rapid spending, refund issues, overdue payments,
     low savings coverage and trip budget risks.
   - Produces prioritized, actionable alerts in Arabic and English.
   - Supports acknowledgement, dismissal, snoozing and resolution.
   - Reads and writes alert state through the central Store when supported.
   - Refreshes automatically when finance data changes.

   Dependencies:
   - window.TICBudgetEngine
   - window.TICExpenseEngine
   - window.TICSavingsEngine
   - window.TICBudgetAnalytics
   - window.TICBudgetAI
   - window.TICPaymentTracker
   - window.TICStore / window.Store

   Global:
   - window.TICExpenseAlertEngine
   ========================================================= */

(function expenseAlertEngineFactory(global) {
  "use strict";

  const VERSION = "1.0.0";
  const ENGINE_NAME = "TICExpenseAlertEngine";

  const EVENTS = Object.freeze({
    READY: "tic:expense-alert-engine-ready",
    REFRESHED: "tic:expense-alerts-refreshed",
    CHANGED: "tic:expense-alerts-changed",
    CREATED: "tic:expense-alert-created",
    UPDATED: "tic:expense-alert-updated",
    ACKNOWLEDGED: "tic:expense-alert-acknowledged",
    DISMISSED: "tic:expense-alert-dismissed",
    SNOOZED: "tic:expense-alert-snoozed",
    RESOLVED: "tic:expense-alert-resolved",
    ERROR: "tic:expense-alert-error"
  });

  const SEVERITY = Object.freeze({
    CRITICAL: "critical",
    HIGH: "high",
    MEDIUM: "medium",
    LOW: "low",
    INFO: "info"
  });

  const STATUS = Object.freeze({
    ACTIVE: "active",
    ACKNOWLEDGED: "acknowledged",
    SNOOZED: "snoozed",
    RESOLVED: "resolved",
    DISMISSED: "dismissed"
  });

  const TYPE = Object.freeze({
    ANNUAL_BUDGET_EXCEEDED: "annual-budget-exceeded",
    ANNUAL_BUDGET_NEAR_LIMIT: "annual-budget-near-limit",
    FORECAST_OVERRUN: "forecast-overrun",
    TRIP_BUDGET_EXCEEDED: "trip-budget-exceeded",
    TRIP_BUDGET_NEAR_LIMIT: "trip-budget-near-limit",
    CATEGORY_CONCENTRATION: "category-concentration",
    CATEGORY_SPIKE: "category-spike",
    UNUSUAL_EXPENSE: "unusual-expense",
    DUPLICATE_EXPENSE: "duplicate-expense",
    RAPID_SPENDING: "rapid-spending",
    LARGE_EXPENSE: "large-expense",
    UNPLANNED_SPENDING: "unplanned-spending",
    PAYMENT_OVERDUE: "payment-overdue",
    PAYMENT_DUE_SOON: "payment-due-soon",
    REFUND_PENDING: "refund-pending",
    SAVINGS_COVERAGE_LOW: "savings-coverage-low",
    SAVINGS_PLAN_BEHIND: "savings-plan-behind",
    MISSING_TRIP_BUDGET: "missing-trip-budget",
    MISSING_ANNUAL_BUDGET: "missing-annual-budget",
    DATA_QUALITY: "data-quality",
    POSITIVE: "positive"
  });

  const DEFAULT_RULES = Object.freeze({
    annualBudgetWarningPercent: 85,
    annualBudgetCriticalPercent: 100,
    tripBudgetWarningPercent: 85,
    tripBudgetCriticalPercent: 100,
    categoryConcentrationPercent: 45,
    categoryCriticalPercent: 65,
    largeExpensePercentOfBudget: 10,
    unusualExpenseDeviationMultiplier: 2,
    rapidSpendingDays: 3,
    rapidSpendingPercentOfMonthlyAverage: 60,
    unplannedSpendingPercent: 30,
    lowSavingsCoveragePercent: 40,
    criticalSavingsCoveragePercent: 20,
    dueSoonDays: 7,
    refundPendingDays: 14,
    duplicateWindowDays: 3,
    duplicateAmountTolerance: 0.01,
    positiveHealthScore: 85,
    maxAlerts: 100
  });

  const state = {
    initialized: false,
    subscribed: false,
    storeUnsubscribe: null,
    eventBindings: [],
    listeners: new Set(),
    refreshTimer: null,
    lastDashboard: null,
    lastOptions: null
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

  function toNonNegative(value, fallback) {
    return Math.max(0, toNumber(value, fallback));
  }

  function round(value, decimals) {
    const precision = Number.isInteger(decimals) ? decimals : 2;
    const factor = Math.pow(10, precision);

    return Math.round(
      (toNumber(value, 0) + Number.EPSILON) * factor
    ) / factor;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, toNumber(value, min)));
  }

  function percentage(part, total, decimals) {
    const normalizedTotal = toNumber(total, 0);
    if (normalizedTotal <= 0) return 0;

    return round(
      (toNumber(part, 0) / normalizedTotal) * 100,
      decimals ?? 1
    );
  }

  function average(values) {
    const items = asArray(values)
      .map(function mapNumber(value) {
        return toNumber(value, NaN);
      })
      .filter(Number.isFinite);

    if (!items.length) return 0;

    return round(
      items.reduce(function sum(total, value) {
        return total + value;
      }, 0) / items.length,
      2
    );
  }

  function standardDeviation(values) {
    const items = asArray(values)
      .map(function mapNumber(value) {
        return toNumber(value, NaN);
      })
      .filter(Number.isFinite);

    if (items.length < 2) return 0;

    const mean = average(items);
    const variance = items.reduce(function calculate(total, value) {
      return total + Math.pow(value - mean, 2);
    }, 0) / items.length;

    return round(Math.sqrt(variance), 2);
  }

  function createId(prefix) {
    return String(prefix || "alert") + "_" +
      Date.now().toString(36) + "_" +
      Math.random().toString(36).slice(2, 9);
  }

  function safeDate(value) {
    if (!value) return null;

    const date = value instanceof Date
      ? new Date(value.getTime())
      : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function startOfDay(value) {
    const date = safeDate(value) || new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function endOfDay(value) {
    const date = startOfDay(value);
    date.setHours(23, 59, 59, 999);
    return date;
  }

  function addDays(value, amount) {
    const date = safeDate(value) || new Date();
    date.setDate(date.getDate() + toNumber(amount, 0));
    return date;
  }

  function daysBetween(from, to) {
    const start = startOfDay(from);
    const end = startOfDay(to);

    return Math.round(
      (end.getTime() - start.getTime()) / 86400000
    );
  }

  function dateKey(value) {
    const date = safeDate(value);
    if (!date) return "";

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function normalizeText(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/\s+/g, " ");
  }

  function normalizeCurrency(value) {
    return String(value || "AED")
      .trim()
      .toUpperCase() || "AED";
  }

  function formatMoney(value, currency, language) {
    const locale = language === "en" ? "en-AE" : "ar-AE";

    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: normalizeCurrency(currency),
        maximumFractionDigits: 0
      }).format(round(value, 2));
    } catch (error) {
      return round(value, 2).toLocaleString(locale) +
        " " + normalizeCurrency(currency);
    }
  }

  function severityWeight(value) {
    const weights = {
      critical: 500,
      high: 400,
      medium: 300,
      low: 200,
      info: 100
    };

    return weights[value] || 0;
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
        "تعذر قراءة بيانات تنبيهات المصروفات.",
        "Unable to read expense alert data from the Store.",
        { cause: error.message }
      );
    }

    return {};
  }

  function writeState(nextState, store) {
    const source = resolveStore(store);

    if (!source) return false;

    try {
      if (typeof source.setState === "function") {
        source.setState(nextState);
        return true;
      }

      if (typeof source.replaceState === "function") {
        source.replaceState(nextState);
        return true;
      }

      if (typeof source.set === "function") {
        source.set(nextState);
        return true;
      }

      if (typeof source.update === "function") {
        source.update(nextState);
        return true;
      }

      if (isObject(source.state)) {
        source.state = nextState;
        if (typeof source.save === "function") source.save();
        return true;
      }

      if (isObject(source.data)) {
        source.data = nextState;
        if (typeof source.save === "function") source.save();
        return true;
      }
    } catch (error) {
      reportError(
        "STORE_WRITE_FAILED",
        "تعذر حفظ حالة التنبيه.",
        "Unable to save alert state.",
        { cause: error.message }
      );
    }

    return false;
  }

  function getAlertRoot(storeState) {
    const root = firstDefined(
      storeState && storeState.expenseAlerts,
      storeState &&
        storeState.budget &&
        storeState.budget.expenseAlerts,
      storeState &&
        storeState.finance &&
        storeState.finance.expenseAlerts
    );

    return isObject(root) ? root : {};
  }

  function getPersistedAlertStates(storeState) {
    const root = getAlertRoot(storeState);

    return asArray(firstDefined(
      root.states,
      root.alertStates,
      root.items,
      []
    ));
  }

  function resolveRules(storeState, options) {
    const root = getAlertRoot(storeState);
    const storedRules = isObject(root.rules) ? root.rules : {};
    const providedRules = isObject(options && options.rules)
      ? options.rules
      : {};

    const merged = Object.assign(
      {},
      DEFAULT_RULES,
      storedRules,
      providedRules
    );

    Object.keys(DEFAULT_RULES).forEach(function normalizeRule(key) {
      merged[key] = toNumber(
        merged[key],
        DEFAULT_RULES[key]
      );
    });

    return merged;
  }

  function persistAlertStates(states, rules, store) {
    const nextState = clone(readState(store));
    const root = getAlertRoot(nextState);

    nextState.expenseAlerts = Object.assign({}, root, {
      states: clone(states),
      rules: clone(rules),
      updatedAt: new Date().toISOString()
    });

    if (isObject(nextState.budget)) {
      nextState.budget.expenseAlerts =
        clone(nextState.expenseAlerts);
    }

    if (isObject(nextState.finance)) {
      nextState.finance.expenseAlerts =
        clone(nextState.expenseAlerts);
    }

    return writeState(nextState, store);
  }

  function getAnalyticsSnapshot(options) {
    const engine = global.TICBudgetAnalytics;

    if (engine) {
      const methods = [
        "getSnapshot",
        "getDashboard",
        "generate"
      ];

      for (let index = 0; index < methods.length; index += 1) {
        const method = methods[index];

        if (typeof engine[method] === "function") {
          try {
            const result = engine[method](options || {});
            if (isObject(result)) return result;
          } catch (error) {
            // Continue to fallback.
          }
        }
      }
    }

    return buildFallbackSnapshot(options || {});
  }

  function getPaymentsDashboard(options) {
    const engine = global.TICPaymentTracker;

    if (engine) {
      const methods = [
        "getDashboard",
        "buildDashboard"
      ];

      for (let index = 0; index < methods.length; index += 1) {
        const method = methods[index];

        if (typeof engine[method] === "function") {
          try {
            const result = engine[method](options || {});
            if (isObject(result)) return result;
          } catch (error) {
            // Continue to fallback.
          }
        }
      }
    }

    return {
      summary: {},
      payments: [],
      alerts: [],
      upcoming: [],
      overdue: []
    };
  }

  function getExpenses(options) {
    const input = isObject(options) ? options : {};
    const engine = global.TICExpenseEngine;

    if (engine) {
      const methods = [
        "listExpenses",
        "getExpenses",
        "getAll",
        "list"
      ];

      for (let index = 0; index < methods.length; index += 1) {
        const method = methods[index];

        if (typeof engine[method] === "function") {
          try {
            const result = engine[method](input);
            const items = Array.isArray(result)
              ? result
              : asArray(
                  result &&
                  (result.items || result.expenses || result.data)
                );

            if (items.length || Array.isArray(result)) {
              return items;
            }
          } catch (error) {
            // Continue to Store fallback.
          }
        }
      }
    }

    const storeState = readState(input.store);

    return asArray(firstDefined(
      storeState.expenses,
      storeState.budget && storeState.budget.expenses,
      storeState.finance && storeState.finance.expenses,
      []
    ));
  }

  function buildFallbackSnapshot(options) {
    const storeState = readState(options && options.store);
    const profile = isObject(storeState.profile) ? storeState.profile : {};
    const settings = isObject(storeState.settings) ? storeState.settings : {};
    const budgetRoot = isObject(storeState.budget) ? storeState.budget : {};
    const annualBudget = toNonNegative(firstDefined(
      options && options.annualBudget,
      budgetRoot.annualBudget,
      settings.annualTravelBudget,
      profile.annualTravelBudget,
      30000
    ));

    const expenses = getExpenses(options || {})
      .filter(function active(expense) {
        return expense &&
          expense.deletedAt == null &&
          expense.isDeleted !== true &&
          String(expense.status || "").toLowerCase() !== "cancelled";
      });

    const totalSpent = round(
      expenses.reduce(function sum(total, expense) {
        return total + toNonNegative(firstDefined(
          expense.amount,
          expense.total,
          expense.value,
          0
        ));
      }, 0),
      2
    );

    return {
      generatedAt: new Date().toISOString(),
      currency: normalizeCurrency(firstDefined(
        budgetRoot.currency,
        settings.currency,
        profile.currency,
        "AED"
      )),
      annualBudget: annualBudget,
      totalSpent: totalSpent,
      remaining: round(annualBudget - totalSpent, 2),
      usagePercent: percentage(totalSpent, annualBudget, 1),
      expenseCount: expenses.length,
      categories: { items: [] },
      trips: { items: [] },
      monthly: { items: [], averageMonthlySpend: 0 },
      daily: { items: [], averageDailySpend: 0 },
      savings: {
        balance: 0,
        coveragePercent: 0,
        monthlySaving: 0,
        remainingToFund: annualBudget
      },
      forecast: {
        projectedSpend: totalSpent,
        likelyToExceed: totalSpent > annualBudget,
        expectedOverrun: Math.max(0, totalSpent - annualBudget)
      },
      health: {
        score: annualBudget > 0
          ? clamp(100 - percentage(totalSpent, annualBudget), 0, 100)
          : 50,
        status: totalSpent > annualBudget ? "critical" : "healthy"
      },
      anomalies: { items: [], count: 0 },
      unplanned: { amount: 0, percent: 0, count: 0 }
    };
  }

  function normalizeExpense(expense, index, currency) {
    const date = safeDate(firstDefined(
      expense && expense.paidAt,
      expense && expense.date,
      expense && expense.expenseDate,
      expense && expense.transactionDate,
      expense && expense.createdAt
    ));

    const amount = toNonNegative(firstDefined(
      expense && expense.amount,
      expense && expense.total,
      expense && expense.value,
      0
    ));

    return {
      id: String(firstDefined(
        expense && expense.id,
        expense && expense._id,
        "expense_" + index
      )),
      tripId: firstDefined(
        expense && expense.tripId,
        expense && expense.travelId,
        null
      ),
      title: String(firstDefined(
        expense && expense.title,
        expense && expense.name,
        expense && expense.description,
        "Expense"
      )),
      category: String(firstDefined(
        expense && expense.category,
        expense && expense.type,
        "other"
      )).toLowerCase(),
      amount: round(amount, 2),
      currency: normalizeCurrency(firstDefined(
        expense && expense.currency,
        currency
      )),
      status: String(firstDefined(
        expense && expense.status,
        "paid"
      )).toLowerCase(),
      paymentMethod: String(firstDefined(
        expense && expense.paymentMethod,
        expense && expense.method,
        "unknown"
      )).toLowerCase(),
      reference: firstDefined(
        expense && expense.reference,
        expense && expense.transactionReference,
        null
      ),
      date: date,
      dateISO: date ? date.toISOString() : null,
      createdAt: firstDefined(
        expense && expense.createdAt,
        date ? date.toISOString() : null
      ),
      updatedAt: firstDefined(
        expense && expense.updatedAt,
        null
      ),
      source: expense
    };
  }

  function makeAlert(input) {
    const data = isObject(input) ? input : {};

    return {
      id: String(data.id || createId("expense_alert")),
      type: String(data.type || TYPE.DATA_QUALITY),
      severity: String(data.severity || SEVERITY.MEDIUM),
      score: round(
        severityWeight(data.severity) +
        clamp(toNumber(data.confidence, 75), 0, 100) +
        Math.min(
          99,
          toNonNegative(data.impactAmount) / 100
        ),
        1
      ),
      status: STATUS.ACTIVE,
      titleAr: String(data.titleAr || ""),
      titleEn: String(data.titleEn || ""),
      messageAr: String(data.messageAr || ""),
      messageEn: String(data.messageEn || ""),
      actionLabelAr: String(
        data.actionLabelAr || "مراجعة"
      ),
      actionLabelEn: String(
        data.actionLabelEn || "Review"
      ),
      action: isObject(data.action)
        ? clone(data.action)
        : null,
      impactAmount: round(
        toNonNegative(data.impactAmount),
        2
      ),
      impactPercent: round(
        toNonNegative(data.impactPercent),
        1
      ),
      confidence: clamp(
        toNumber(data.confidence, 75),
        0,
        100
      ),
      expenseId: data.expenseId == null
        ? null
        : String(data.expenseId),
      tripId: data.tripId == null
        ? null
        : String(data.tripId),
      paymentId: data.paymentId == null
        ? null
        : String(data.paymentId),
      category: data.category == null
        ? null
        : String(data.category),
      dueDate: data.dueDate || null,
      fingerprint: String(
        data.fingerprint ||
        [
          data.type,
          data.expenseId,
          data.tripId,
          data.paymentId,
          data.category
        ].filter(Boolean).join("|")
      ),
      reasonCodes: asArray(data.reasonCodes).map(String),
      metadata: isObject(data.metadata)
        ? clone(data.metadata)
        : {},
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      acknowledgedAt: null,
      dismissedAt: null,
      snoozedUntil: null,
      resolvedAt: null
    };
  }

  function detectBudgetAlerts(snapshot, rules) {
    const alerts = [];
    const currency = snapshot.currency || "AED";
    const annualBudget = toNonNegative(snapshot.annualBudget);
    const totalSpent = toNonNegative(snapshot.totalSpent);
    const usage = toNonNegative(snapshot.usagePercent);
    const remaining = toNumber(
      snapshot.remaining,
      annualBudget - totalSpent
    );

    if (annualBudget <= 0) {
      alerts.push(makeAlert({
        id: "alert_missing_annual_budget",
        type: TYPE.MISSING_ANNUAL_BUDGET,
        severity: SEVERITY.HIGH,
        titleAr: "الميزانية السنوية غير محددة",
        titleEn: "Annual budget is not set",
        messageAr:
          "حدد ميزانية السفر السنوية حتى تعمل التنبيهات والتوقعات بدقة.",
        messageEn:
          "Set an annual travel budget so alerts and forecasts can work accurately.",
        actionLabelAr: "تحديد الميزانية",
        actionLabelEn: "Set budget",
        action: {
          name: "open-budget-settings",
          payload: { field: "annualBudget" }
        },
        confidence: 100,
        reasonCodes: ["ANNUAL_BUDGET_MISSING"]
      }));
    } else if (
      usage >= rules.annualBudgetCriticalPercent ||
      remaining < 0
    ) {
      const overrun = Math.abs(Math.min(remaining, 0));

      alerts.push(makeAlert({
        id: "alert_annual_budget_exceeded",
        type: TYPE.ANNUAL_BUDGET_EXCEEDED,
        severity: SEVERITY.CRITICAL,
        titleAr: "تم تجاوز ميزانية السفر السنوية",
        titleEn: "Annual travel budget exceeded",
        messageAr:
          "إجمالي الإنفاق تجاوز الميزانية بمقدار " +
          formatMoney(overrun, currency, "ar") + ".",
        messageEn:
          "Total spending exceeded the budget by " +
          formatMoney(overrun, currency, "en") + ".",
        actionLabelAr: "فتح خطة التصحيح",
        actionLabelEn: "Open recovery plan",
        action: {
          name: "create-recovery-plan",
          payload: { overrun: overrun }
        },
        impactAmount: overrun,
        impactPercent: Math.max(0, usage - 100),
        confidence: 99,
        reasonCodes: ["ANNUAL_BUDGET_EXCEEDED"]
      }));
    } else if (
      usage >= rules.annualBudgetWarningPercent
    ) {
      alerts.push(makeAlert({
        id: "alert_annual_budget_near_limit",
        type: TYPE.ANNUAL_BUDGET_NEAR_LIMIT,
        severity: usage >= 95
          ? SEVERITY.HIGH
          : SEVERITY.MEDIUM,
        titleAr: "ميزانية السفر تقترب من الحد",
        titleEn: "Travel budget is near its limit",
        messageAr:
          "تم استخدام " + usage +
          "% من الميزانية، والمتبقي " +
          formatMoney(
            Math.max(0, remaining),
            currency,
            "ar"
          ) + ".",
        messageEn:
          usage +
          "% of the budget has been used, with " +
          formatMoney(
            Math.max(0, remaining),
            currency,
            "en"
          ) + " remaining.",
        actionLabelAr: "مراجعة الميزانية",
        actionLabelEn: "Review budget",
        action: {
          name: "open-budget-overview",
          payload: {}
        },
        impactAmount: Math.max(0, remaining),
        impactPercent: usage,
        confidence: 96,
        reasonCodes: ["ANNUAL_BUDGET_NEAR_LIMIT"]
      }));
    }

    const forecast = isObject(snapshot.forecast)
      ? snapshot.forecast
      : {};

    if (forecast.likelyToExceed) {
      alerts.push(makeAlert({
        id: "alert_forecast_overrun",
        type: TYPE.FORECAST_OVERRUN,
        severity: SEVERITY.HIGH,
        titleAr: "التوقع الحالي يشير إلى تجاوز الميزانية",
        titleEn: "Current forecast indicates an overrun",
        messageAr:
          "قد يصل التجاوز المتوقع إلى " +
          formatMoney(
            forecast.expectedOverrun,
            currency,
            "ar"
          ) + ".",
        messageEn:
          "The expected overrun may reach " +
          formatMoney(
            forecast.expectedOverrun,
            currency,
            "en"
          ) + ".",
        actionLabelAr: "إنشاء خطة خفض",
        actionLabelEn: "Create reduction plan",
        action: {
          name: "create-spending-reduction-plan",
          payload: {
            expectedOverrun:
              toNonNegative(forecast.expectedOverrun)
          }
        },
        impactAmount:
          toNonNegative(forecast.expectedOverrun),
        confidence: 92,
        reasonCodes: ["FORECAST_OVERRUN"]
      }));
    }

    return alerts;
  }

  function detectTripAlerts(snapshot, rules) {
    const alerts = [];
    const currency = snapshot.currency || "AED";
    const trips = asArray(
      snapshot.trips && snapshot.trips.items
    );

    trips.forEach(function inspect(trip) {
      const planned = toNonNegative(trip.planned);
      const spent = toNonNegative(trip.spent);
      const usage = toNonNegative(trip.usagePercent);
      const title = String(trip.title || "الرحلة");

      if (planned <= 0 && spent > 0) {
        alerts.push(makeAlert({
          id: "alert_trip_budget_missing_" + trip.id,
          type: TYPE.MISSING_TRIP_BUDGET,
          severity: SEVERITY.MEDIUM,
          titleAr: "ميزانية الرحلة غير محددة",
          titleEn: "Trip budget is not set",
          messageAr:
            title +
            " لديها مصروفات مسجلة بدون ميزانية مخططة.",
          messageEn:
            title +
            " has recorded expenses without a planned budget.",
          actionLabelAr: "تحديد ميزانية الرحلة",
          actionLabelEn: "Set trip budget",
          action: {
            name: "edit-trip-budget",
            payload: { tripId: trip.id }
          },
          tripId: trip.id,
          confidence: 98,
          reasonCodes: ["TRIP_BUDGET_MISSING"]
        }));

        return;
      }

      if (
        spent > planned ||
        usage >= rules.tripBudgetCriticalPercent
      ) {
        const overrun = round(
          Math.max(0, spent - planned),
          2
        );

        alerts.push(makeAlert({
          id: "alert_trip_budget_exceeded_" + trip.id,
          type: TYPE.TRIP_BUDGET_EXCEEDED,
          severity: SEVERITY.CRITICAL,
          titleAr: title + " تجاوزت الميزانية",
          titleEn: title + " exceeded its budget",
          messageAr:
            "التجاوز الحالي " +
            formatMoney(overrun, currency, "ar") +
            " ونسبة الاستخدام " + usage + "%.",
          messageEn:
            "The current overrun is " +
            formatMoney(overrun, currency, "en") +
            " and budget usage is " + usage + "%.",
          actionLabelAr: "تحليل مصروفات الرحلة",
          actionLabelEn: "Analyze trip expenses",
          action: {
            name: "open-trip-finance",
            payload: { tripId: trip.id }
          },
          impactAmount: overrun,
          impactPercent: Math.max(0, usage - 100),
          tripId: trip.id,
          confidence: 99,
          reasonCodes: ["TRIP_BUDGET_EXCEEDED"]
        }));
      } else if (
        usage >= rules.tripBudgetWarningPercent
      ) {
        const remaining = Math.max(
          0,
          planned - spent
        );

        alerts.push(makeAlert({
          id: "alert_trip_budget_near_limit_" + trip.id,
          type: TYPE.TRIP_BUDGET_NEAR_LIMIT,
          severity: usage >= 95
            ? SEVERITY.HIGH
            : SEVERITY.MEDIUM,
          titleAr: title + " تقترب من حد الميزانية",
          titleEn: title + " is near its budget limit",
          messageAr:
            "المتبقي للرحلة " +
            formatMoney(remaining, currency, "ar") +
            " فقط.",
          messageEn:
            "Only " +
            formatMoney(remaining, currency, "en") +
            " remains for this trip.",
          actionLabelAr: "فتح ميزانية الرحلة",
          actionLabelEn: "Open trip budget",
          action: {
            name: "open-trip-budget",
            payload: { tripId: trip.id }
          },
          impactAmount: remaining,
          impactPercent: usage,
          tripId: trip.id,
          confidence: 95,
          reasonCodes: ["TRIP_BUDGET_NEAR_LIMIT"]
        }));
      }
    });

    return alerts;
  }

  function detectCategoryAlerts(snapshot, rules) {
    const alerts = [];
    const currency = snapshot.currency || "AED";
    const categories = asArray(
      snapshot.categories && snapshot.categories.items
    ).filter(function active(item) {
      return toNonNegative(item.amount) > 0;
    });

    categories.forEach(function inspect(category) {
      const share = toNonNegative(
        category.sharePercent
      );

      if (
        share >= rules.categoryConcentrationPercent
      ) {
        const critical =
          share >= rules.categoryCriticalPercent;

        alerts.push(makeAlert({
          id: "alert_category_concentration_" +
            category.key,
          type: TYPE.CATEGORY_CONCENTRATION,
          severity: critical
            ? SEVERITY.HIGH
            : SEVERITY.MEDIUM,
          titleAr:
            "تركيز مرتفع في " +
            String(category.labelAr || category.key),
          titleEn:
            "High concentration in " +
            String(category.labelEn || category.key),
          messageAr:
            "تمثل هذه الفئة " + share +
            "% من إجمالي الإنفاق بقيمة " +
            formatMoney(
              category.amount,
              currency,
              "ar"
            ) + ".",
          messageEn:
            "This category represents " + share +
            "% of total spending at " +
            formatMoney(
              category.amount,
              currency,
              "en"
            ) + ".",
          actionLabelAr: "تحليل الفئة",
          actionLabelEn: "Analyze category",
          action: {
            name: "open-category-analysis",
            payload: { category: category.key }
          },
          category: category.key,
          impactAmount: category.amount,
          impactPercent: share,
          confidence: 91,
          reasonCodes: ["CATEGORY_CONCENTRATION"]
        }));
      }
    });

    return alerts;
  }

  function detectAnomalyAlerts(snapshot) {
    const alerts = [];
    const currency = snapshot.currency || "AED";
    const anomalies = asArray(
      snapshot.anomalies && snapshot.anomalies.items
    );

    anomalies.forEach(function inspect(anomaly) {
      alerts.push(makeAlert({
        id: "alert_unusual_expense_" + anomaly.id,
        type: TYPE.UNUSUAL_EXPENSE,
        severity:
          anomaly.severity === "high"
            ? SEVERITY.HIGH
            : SEVERITY.MEDIUM,
        titleAr: "مصروف غير اعتيادي",
        titleEn: "Unusual expense detected",
        messageAr:
          String(anomaly.title || "مصروف") +
          " بقيمة " +
          formatMoney(
            anomaly.amount,
            currency,
            "ar"
          ) +
          " أعلى من نمط الإنفاق المعتاد.",
        messageEn:
          String(anomaly.title || "Expense") +
          " at " +
          formatMoney(
            anomaly.amount,
            currency,
            "en"
          ) +
          " is above the normal spending pattern.",
        actionLabelAr: "مراجعة المصروف",
        actionLabelEn: "Review expense",
        action: {
          name: "open-expense",
          payload: { expenseId: anomaly.id }
        },
        expenseId: anomaly.id,
        category: anomaly.category,
        impactAmount: anomaly.amount,
        confidence: 88,
        reasonCodes: ["UNUSUAL_EXPENSE"]
      }));
    });

    return alerts;
  }

  function detectDuplicateAlerts(expenses, rules) {
    const alerts = [];
    const sorted = expenses
      .filter(function valid(item) {
        return item.date && item.amount > 0;
      })
      .sort(function chronological(a, b) {
        return a.date - b.date;
      });

    const processed = new Set();

    for (let firstIndex = 0; firstIndex < sorted.length; firstIndex += 1) {
      const first = sorted[firstIndex];

      if (processed.has(first.id)) continue;

      const matches = [first];

      for (
        let secondIndex = firstIndex + 1;
        secondIndex < sorted.length;
        secondIndex += 1
      ) {
        const second = sorted[secondIndex];
        const distance = Math.abs(
          daysBetween(first.date, second.date)
        );

        if (distance > rules.duplicateWindowDays) {
          break;
        }

        const sameAmount =
          Math.abs(first.amount - second.amount) <=
          rules.duplicateAmountTolerance;

        const sameTitle =
          normalizeText(first.title) ===
          normalizeText(second.title);

        const sameCategory =
          first.category === second.category;

        if (
          sameAmount &&
          sameTitle &&
          sameCategory
        ) {
          matches.push(second);
        }
      }

      if (matches.length > 1) {
        matches.forEach(function mark(item) {
          processed.add(item.id);
        });

        const ids = matches
          .map(function id(item) {
            return item.id;
          })
          .sort();

        alerts.push(makeAlert({
          id: "alert_duplicate_expense_" +
            ids.join("_"),
          type: TYPE.DUPLICATE_EXPENSE,
          severity: SEVERITY.HIGH,
          titleAr: "مصروفات متشابهة قد تكون مكررة",
          titleEn: "Similar expenses may be duplicated",
          messageAr:
            "تم العثور على " +
            matches.length +
            " مصروفات متشابهة بعنوان " +
            first.title +
            " وبقيمة " +
            formatMoney(
              first.amount,
              first.currency,
              "ar"
            ) + ".",
          messageEn:
            matches.length +
            " similar expenses were found for " +
            first.title +
            " at " +
            formatMoney(
              first.amount,
              first.currency,
              "en"
            ) + ".",
          actionLabelAr: "مراجعة التكرار",
          actionLabelEn: "Review duplicates",
          action: {
            name: "review-duplicate-expenses",
            payload: { expenseIds: ids }
          },
          expenseId: first.id,
          impactAmount: round(
            first.amount * (matches.length - 1),
            2
          ),
          confidence: 94,
          reasonCodes: ["POSSIBLE_DUPLICATE_EXPENSE"],
          metadata: { expenseIds: ids }
        }));
      }
    }

    return alerts;
  }

  function detectLargeExpenseAlerts(
    expenses,
    snapshot,
    rules
  ) {
    const alerts = [];
    const annualBudget = toNonNegative(
      snapshot.annualBudget
    );

    if (annualBudget <= 0) return alerts;

    const threshold = round(
      annualBudget *
      (
        rules.largeExpensePercentOfBudget /
        100
      ),
      2
    );

    expenses.forEach(function inspect(expense) {
      if (expense.amount < threshold) return;

      alerts.push(makeAlert({
        id: "alert_large_expense_" + expense.id,
        type: TYPE.LARGE_EXPENSE,
        severity:
          expense.amount >= threshold * 2
            ? SEVERITY.HIGH
            : SEVERITY.MEDIUM,
        titleAr: "مصروف كبير مقارنة بالميزانية",
        titleEn: "Large expense compared with budget",
        messageAr:
          expense.title + " بقيمة " +
          formatMoney(
            expense.amount,
            expense.currency,
            "ar"
          ) +
          " يمثل " +
          percentage(
            expense.amount,
            annualBudget,
            1
          ) +
          "% من الميزانية السنوية.",
        messageEn:
          expense.title + " at " +
          formatMoney(
            expense.amount,
            expense.currency,
            "en"
          ) +
          " represents " +
          percentage(
            expense.amount,
            annualBudget,
            1
          ) +
          "% of the annual budget.",
        actionLabelAr: "مراجعة المصروف",
        actionLabelEn: "Review expense",
        action: {
          name: "open-expense",
          payload: { expenseId: expense.id }
        },
        expenseId: expense.id,
        tripId: expense.tripId,
        category: expense.category,
        impactAmount: expense.amount,
        impactPercent: percentage(
          expense.amount,
          annualBudget,
          1
        ),
        confidence: 98,
        reasonCodes: ["LARGE_EXPENSE"]
      }));
    });

    return alerts;
  }

  function detectRapidSpendingAlerts(
    expenses,
    snapshot,
    rules
  ) {
    const alerts = [];
    const now = startOfDay(new Date());
    const start = addDays(
      now,
      -(Math.max(1, rules.rapidSpendingDays) - 1)
    );

    const recent = expenses.filter(function within(item) {
      return item.date &&
        item.date >= start &&
        item.date <= endOfDay(now);
    });

    const recentTotal = round(
      recent.reduce(function sum(total, item) {
        return total + item.amount;
      }, 0),
      2
    );

    const monthlyAverage = toNonNegative(
      snapshot.monthly &&
      snapshot.monthly.averageMonthlySpend
    );

    const threshold = round(
      monthlyAverage *
      (
        rules.rapidSpendingPercentOfMonthlyAverage /
        100
      ),
      2
    );

    if (
      recent.length >= 2 &&
      monthlyAverage > 0 &&
      recentTotal >= threshold
    ) {
      alerts.push(makeAlert({
        id: "alert_rapid_spending_" + dateKey(now),
        type: TYPE.RAPID_SPENDING,
        severity:
          recentTotal >= monthlyAverage
            ? SEVERITY.HIGH
            : SEVERITY.MEDIUM,
        titleAr: "ارتفاع سريع في الإنفاق",
        titleEn: "Rapid increase in spending",
        messageAr:
          "تم إنفاق " +
          formatMoney(
            recentTotal,
            snapshot.currency,
            "ar"
          ) +
          " خلال آخر " +
          rules.rapidSpendingDays +
          " أيام.",
        messageEn:
          formatMoney(
            recentTotal,
            snapshot.currency,
            "en"
          ) +
          " was spent during the last " +
          rules.rapidSpendingDays +
          " days.",
        actionLabelAr: "مراجعة المصروفات الأخيرة",
        actionLabelEn: "Review recent expenses",
        action: {
          name: "open-recent-expenses",
          payload: {
            fromDate: start.toISOString(),
            toDate: now.toISOString()
          }
        },
        impactAmount: recentTotal,
        impactPercent: percentage(
          recentTotal,
          monthlyAverage,
          1
        ),
        confidence: 89,
        reasonCodes: ["RAPID_SPENDING"],
        metadata: {
          expenseIds: recent.map(function id(item) {
            return item.id;
          })
        }
      }));
    }

    return alerts;
  }

  function detectUnplannedSpendingAlert(
    snapshot,
    rules
  ) {
    const unplanned = isObject(snapshot.unplanned)
      ? snapshot.unplanned
      : {};

    const percent = toNonNegative(
      unplanned.percent
    );

    if (
      percent < rules.unplannedSpendingPercent
    ) {
      return [];
    }

    return [
      makeAlert({
        id: "alert_unplanned_spending",
        type: TYPE.UNPLANNED_SPENDING,
        severity:
          percent >= 50
            ? SEVERITY.HIGH
            : SEVERITY.MEDIUM,
        titleAr: "المصروفات غير المخططة مرتفعة",
        titleEn: "Unplanned spending is high",
        messageAr:
          "تشكل المصروفات غير المخططة " +
          percent +
          "% من إجمالي الإنفاق.",
        messageEn:
          "Unplanned expenses represent " +
          percent +
          "% of total spending.",
        actionLabelAr: "إنشاء حد للطوارئ",
        actionLabelEn: "Create contingency limit",
        action: {
          name: "set-contingency-budget",
          payload: {
            suggestedAmount: round(
              toNonNegative(unplanned.amount) * 0.25,
              2
            )
          }
        },
        impactAmount:
          toNonNegative(unplanned.amount),
        impactPercent: percent,
        confidence: 91,
        reasonCodes: ["UNPLANNED_SPENDING_HIGH"]
      })
    ];
  }

  function detectSavingsAlerts(snapshot, rules) {
    const alerts = [];
    const savings = isObject(snapshot.savings)
      ? snapshot.savings
      : {};

    const coverage = toNonNegative(
      savings.coveragePercent
    );

    if (
      coverage < rules.lowSavingsCoveragePercent
    ) {
      alerts.push(makeAlert({
        id: "alert_savings_coverage_low",
        type: TYPE.SAVINGS_COVERAGE_LOW,
        severity:
          coverage <
          rules.criticalSavingsCoveragePercent
            ? SEVERITY.HIGH
            : SEVERITY.MEDIUM,
        titleAr: "تغطية صندوق السفر منخفضة",
        titleEn: "Travel fund coverage is low",
        messageAr:
          "الادخار الحالي يغطي " +
          coverage +
          "% فقط من الميزانية السنوية.",
        messageEn:
          "Current savings cover only " +
          coverage +
          "% of the annual budget.",
        actionLabelAr: "فتح خطة الادخار",
        actionLabelEn: "Open savings plan",
        action: {
          name: "open-savings-plan",
          payload: {}
        },
        impactAmount:
          toNonNegative(savings.remainingToFund),
        impactPercent: coverage,
        confidence: 96,
        reasonCodes: ["SAVINGS_COVERAGE_LOW"]
      }));
    }

    if (
      toNonNegative(savings.monthlySaving) <= 0 &&
      toNonNegative(savings.remainingToFund) > 0
    ) {
      alerts.push(makeAlert({
        id: "alert_savings_plan_behind",
        type: TYPE.SAVINGS_PLAN_BEHIND,
        severity: SEVERITY.MEDIUM,
        titleAr: "لا توجد خطة ادخار شهرية فعالة",
        titleEn: "No active monthly savings plan",
        messageAr:
          "حدد مبلغاً شهرياً ثابتاً لتمويل ميزانية السفر.",
        messageEn:
          "Set a fixed monthly amount to fund the travel budget.",
        actionLabelAr: "إنشاء خطة ادخار",
        actionLabelEn: "Create savings plan",
        action: {
          name: "set-savings-plan",
          payload: {}
        },
        confidence: 95,
        reasonCodes: ["MONTHLY_SAVING_MISSING"]
      }));
    }

    return alerts;
  }

  function detectPaymentAlerts(paymentDashboard) {
    const alerts = [];

    asArray(paymentDashboard.overdue).forEach(
      function overdue(payment) {
        alerts.push(makeAlert({
          id: "alert_payment_overdue_" + payment.id,
          type: TYPE.PAYMENT_OVERDUE,
          severity: SEVERITY.CRITICAL,
          titleAr: "دفعة متأخرة",
          titleEn: "Overdue payment",
          messageAr:
            payment.title + " متأخرة والمتبقي " +
            formatMoney(
              payment.remainingAmount,
              payment.currency,
              "ar"
            ) + ".",
          messageEn:
            payment.title +
            " is overdue with " +
            formatMoney(
              payment.remainingAmount,
              payment.currency,
              "en"
            ) +
            " remaining.",
          actionLabelAr: "فتح الدفعة",
          actionLabelEn: "Open payment",
          action: {
            name: "open-payment",
            payload: { paymentId: payment.id }
          },
          paymentId: payment.id,
          tripId: payment.tripId,
          dueDate: payment.dueDate,
          impactAmount: payment.remainingAmount,
          confidence: 100,
          reasonCodes: ["PAYMENT_OVERDUE"]
        }));
      }
    );

    asArray(paymentDashboard.upcoming)
      .filter(function dueSoon(payment) {
        return payment.isDueSoon;
      })
      .forEach(function upcoming(payment) {
        alerts.push(makeAlert({
          id: "alert_payment_due_soon_" + payment.id,
          type: TYPE.PAYMENT_DUE_SOON,
          severity:
            toNumber(payment.daysUntilDue, 99) <= 1
              ? SEVERITY.HIGH
              : SEVERITY.MEDIUM,
          titleAr:
            toNumber(payment.daysUntilDue, 99) === 0
              ? "دفعة مستحقة اليوم"
              : "دفعة قريبة",
          titleEn:
            toNumber(payment.daysUntilDue, 99) === 0
              ? "Payment due today"
              : "Upcoming payment",
          messageAr:
            payment.title + " تستحق خلال " +
            toNumber(payment.daysUntilDue, 0) +
            " يوم بقيمة " +
            formatMoney(
              payment.remainingAmount,
              payment.currency,
              "ar"
            ) + ".",
          messageEn:
            payment.title + " is due in " +
            toNumber(payment.daysUntilDue, 0) +
            " day(s) for " +
            formatMoney(
              payment.remainingAmount,
              payment.currency,
              "en"
            ) + ".",
          actionLabelAr: "فتح الدفعة",
          actionLabelEn: "Open payment",
          action: {
            name: "open-payment",
            payload: { paymentId: payment.id }
          },
          paymentId: payment.id,
          tripId: payment.tripId,
          dueDate: payment.dueDate,
          impactAmount: payment.remainingAmount,
          confidence: 99,
          reasonCodes: ["PAYMENT_DUE_SOON"]
        }));
      });

    return alerts;
  }

  function detectPositiveAlert(snapshot, rules) {
    const healthScore = toNumber(
      snapshot.health && snapshot.health.score,
      0
    );

    const forecastOverrun = Boolean(
      snapshot.forecast &&
      snapshot.forecast.likelyToExceed
    );

    if (
      healthScore < rules.positiveHealthScore ||
      forecastOverrun
    ) {
      return [];
    }

    return [
      makeAlert({
        id: "alert_positive_financial_health",
        type: TYPE.POSITIVE,
        severity: SEVERITY.INFO,
        titleAr: "الوضع المالي للسفر ممتاز",
        titleEn: "Travel finances are in excellent shape",
        messageAr:
          "درجة الصحة المالية " +
          healthScore +
          " من 100، ولا يوجد تجاوز متوقع حالياً.",
        messageEn:
          "The financial health score is " +
          healthScore +
          " out of 100, with no expected overrun.",
        actionLabelAr: "عرض التقرير",
        actionLabelEn: "View report",
        action: {
          name: "open-budget-report",
          payload: {}
        },
        confidence: 95,
        reasonCodes: ["POSITIVE_FINANCIAL_HEALTH"]
      })
    ];
  }

  function applyPersistedStates(alerts, persistedStates) {
    const stateMap = new Map();

    asArray(persistedStates).forEach(function mapState(item) {
      const key = String(
        firstDefined(
          item && item.id,
          item && item.fingerprint,
          ""
        )
      );

      if (key) stateMap.set(key, item);
    });

    const now = new Date();

    return alerts.map(function apply(alert) {
      const persisted =
        stateMap.get(alert.id) ||
        stateMap.get(alert.fingerprint);

      if (!persisted) return alert;

      const status = String(
        persisted.status || STATUS.ACTIVE
      );

      const snoozedUntil = safeDate(
        persisted.snoozedUntil
      );

      let effectiveStatus = status;

      if (
        status === STATUS.SNOOZED &&
        snoozedUntil &&
        snoozedUntil <= now
      ) {
        effectiveStatus = STATUS.ACTIVE;
      }

      return Object.assign({}, alert, {
        status: effectiveStatus,
        acknowledgedAt:
          persisted.acknowledgedAt || null,
        dismissedAt:
          persisted.dismissedAt || null,
        snoozedUntil:
          effectiveStatus === STATUS.SNOOZED
            ? persisted.snoozedUntil
            : null,
        resolvedAt:
          persisted.resolvedAt || null,
        updatedAt:
          persisted.updatedAt ||
          alert.updatedAt
      });
    });
  }

  function deduplicateAlerts(alerts) {
    const map = new Map();

    alerts.forEach(function merge(alert) {
      const key = alert.fingerprint || alert.id;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, alert);
        return;
      }

      if (
        severityWeight(alert.severity) >
        severityWeight(existing.severity)
      ) {
        map.set(key, alert);
      }
    });

    return Array.from(map.values());
  }

  function generateAlerts(options) {
    const input = isObject(options) ? options : {};
    const storeState = readState(input.store);
    const rules = resolveRules(storeState, input);
    const snapshot = getAnalyticsSnapshot(input);
    const paymentDashboard =
      getPaymentsDashboard(input);

    const currency = snapshot.currency || "AED";

    const expenses = getExpenses(input)
      .filter(function active(expense) {
        return expense &&
          expense.deletedAt == null &&
          expense.isDeleted !== true &&
          String(expense.status || "")
            .toLowerCase() !== "cancelled";
      })
      .map(function normalize(item, index) {
        return normalizeExpense(
          item,
          index,
          currency
        );
      });

    let alerts = [];

    alerts = alerts.concat(
      detectBudgetAlerts(snapshot, rules),
      detectTripAlerts(snapshot, rules),
      detectCategoryAlerts(snapshot, rules),
      detectAnomalyAlerts(snapshot),
      detectDuplicateAlerts(expenses, rules),
      detectLargeExpenseAlerts(
        expenses,
        snapshot,
        rules
      ),
      detectRapidSpendingAlerts(
        expenses,
        snapshot,
        rules
      ),
      detectUnplannedSpendingAlert(
        snapshot,
        rules
      ),
      detectSavingsAlerts(snapshot, rules),
      detectPaymentAlerts(paymentDashboard)
    );

    if (input.includePositive !== false) {
      alerts = alerts.concat(
        detectPositiveAlert(snapshot, rules)
      );
    }

    alerts = deduplicateAlerts(alerts);

    alerts = applyPersistedStates(
      alerts,
      getPersistedAlertStates(storeState)
    );

    if (input.includeDismissed !== true) {
      alerts = alerts.filter(function visible(alert) {
        return alert.status !== STATUS.DISMISSED;
      });
    }

    if (input.includeResolved !== true) {
      alerts = alerts.filter(function visible(alert) {
        return alert.status !== STATUS.RESOLVED;
      });
    }

    if (input.includeSnoozed !== true) {
      alerts = alerts.filter(function visible(alert) {
        return alert.status !== STATUS.SNOOZED;
      });
    }

    alerts.sort(function sortAlerts(a, b) {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return String(b.generatedAt)
        .localeCompare(String(a.generatedAt));
    });

    return alerts.slice(
      0,
      Math.max(1, rules.maxAlerts)
    );
  }

  function buildDashboard(options) {
    const input = isObject(options) ? options : {};
    const alerts = generateAlerts(input);

    const counts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
      active: 0,
      acknowledged: 0,
      snoozed: 0,
      resolved: 0,
      dismissed: 0
    };

    alerts.forEach(function count(alert) {
      if (
        Object.prototype.hasOwnProperty.call(
          counts,
          alert.severity
        )
      ) {
        counts[alert.severity] += 1;
      }

      if (
        Object.prototype.hasOwnProperty.call(
          counts,
          alert.status
        )
      ) {
        counts[alert.status] += 1;
      }
    });

    const activeAlerts = alerts.filter(function active(alert) {
      return [
        STATUS.ACTIVE,
        STATUS.ACKNOWLEDGED
      ].includes(alert.status);
    });

    const topAlert = activeAlerts[0] || null;

    const groupedByType = {};

    alerts.forEach(function group(alert) {
      groupedByType[alert.type] =
        groupedByType[alert.type] || {
          type: alert.type,
          count: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          info: 0
        };

      groupedByType[alert.type].count += 1;
      groupedByType[alert.type][alert.severity] += 1;
    });

    return {
      generatedAt: new Date().toISOString(),
      version: VERSION,
      engine: ENGINE_NAME,
      alerts: alerts,
      activeAlerts: activeAlerts,
      topAlert: topAlert,
      summary: {
        total: alerts.length,
        active: activeAlerts.length,
        critical: counts.critical,
        high: counts.high,
        medium: counts.medium,
        low: counts.low,
        info: counts.info,
        acknowledged: counts.acknowledged,
        snoozed: counts.snoozed,
        resolved: counts.resolved,
        dismissed: counts.dismissed,
        requiresImmediateAction:
          counts.critical > 0,
        riskLevel:
          counts.critical > 0
            ? SEVERITY.CRITICAL
            : counts.high > 0
              ? SEVERITY.HIGH
              : counts.medium > 0
                ? SEVERITY.MEDIUM
                : counts.low > 0
                  ? SEVERITY.LOW
                  : SEVERITY.INFO
      },
      byType: Object.values(groupedByType)
        .sort(function descending(a, b) {
          return b.count - a.count;
        }),
      charts: {
        severity: {
          labels: [
            SEVERITY.CRITICAL,
            SEVERITY.HIGH,
            SEVERITY.MEDIUM,
            SEVERITY.LOW,
            SEVERITY.INFO
          ],
          values: [
            counts.critical,
            counts.high,
            counts.medium,
            counts.low,
            counts.info
          ]
        },
        status: {
          labels: [
            STATUS.ACTIVE,
            STATUS.ACKNOWLEDGED,
            STATUS.SNOOZED,
            STATUS.RESOLVED,
            STATUS.DISMISSED
          ],
          values: [
            counts.active,
            counts.acknowledged,
            counts.snoozed,
            counts.resolved,
            counts.dismissed
          ]
        },
        type: {
          labels: Object.values(groupedByType)
            .map(function label(item) {
              return item.type;
            }),
          values: Object.values(groupedByType)
            .map(function value(item) {
              return item.count;
            })
        }
      }
    };
  }

  function updateAlertState(id, patch, options) {
    const input = isObject(options) ? options : {};
    const storeState = readState(input.store);
    const rules = resolveRules(storeState, input);
    const states = getPersistedAlertStates(
      storeState
    );

    let updated = null;
    let found = false;

    const nextStates = states.map(function update(item) {
      const itemId = String(firstDefined(
        item && item.id,
        item && item.fingerprint,
        ""
      ));

      if (itemId !== String(id)) {
        return item;
      }

      found = true;

      updated = Object.assign({}, item, patch, {
        id: String(id),
        updatedAt: new Date().toISOString()
      });

      return updated;
    });

    if (!found) {
      updated = Object.assign({
        id: String(id),
        fingerprint: String(id),
        status: STATUS.ACTIVE,
        createdAt: new Date().toISOString()
      }, patch, {
        updatedAt: new Date().toISOString()
      });

      nextStates.push(updated);
    }

    persistAlertStates(
      nextStates,
      rules,
      input.store
    );

    dispatch(EVENTS.UPDATED, {
      id: String(id),
      state: updated
    });

    dispatch(EVENTS.CHANGED, {
      id: String(id),
      state: updated
    });

    scheduleRefresh(input);

    return clone(updated);
  }

  function acknowledgeAlert(id, options) {
    const result = updateAlertState(
      id,
      {
        status: STATUS.ACKNOWLEDGED,
        acknowledgedAt: new Date().toISOString(),
        dismissedAt: null,
        snoozedUntil: null,
        resolvedAt: null
      },
      options || {}
    );

    dispatch(EVENTS.ACKNOWLEDGED, {
      id: String(id),
      state: result
    });

    return result;
  }

  function dismissAlert(id, options) {
    const result = updateAlertState(
      id,
      {
        status: STATUS.DISMISSED,
        dismissedAt: new Date().toISOString(),
        snoozedUntil: null
      },
      options || {}
    );

    dispatch(EVENTS.DISMISSED, {
      id: String(id),
      state: result
    });

    return result;
  }

  function snoozeAlert(id, until, options) {
    const snoozedUntil =
      safeDate(until) ||
      addDays(new Date(), 1);

    const result = updateAlertState(
      id,
      {
        status: STATUS.SNOOZED,
        snoozedUntil:
          snoozedUntil.toISOString(),
        dismissedAt: null
      },
      options || {}
    );

    dispatch(EVENTS.SNOOZED, {
      id: String(id),
      snoozedUntil:
        snoozedUntil.toISOString(),
      state: result
    });

    return result;
  }

  function resolveAlert(id, options) {
    const result = updateAlertState(
      id,
      {
        status: STATUS.RESOLVED,
        resolvedAt: new Date().toISOString(),
        snoozedUntil: null
      },
      options || {}
    );

    dispatch(EVENTS.RESOLVED, {
      id: String(id),
      state: result
    });

    return result;
  }

  function restoreAlert(id, options) {
    return updateAlertState(
      id,
      {
        status: STATUS.ACTIVE,
        acknowledgedAt: null,
        dismissedAt: null,
        snoozedUntil: null,
        resolvedAt: null
      },
      options || {}
    );
  }

  function saveRules(rules, options) {
    const input = isObject(options) ? options : {};
    const storeState = readState(input.store);
    const currentRules = resolveRules(
      storeState,
      input
    );

    const nextRules = Object.assign(
      {},
      currentRules,
      isObject(rules) ? rules : {}
    );

    persistAlertStates(
      getPersistedAlertStates(storeState),
      nextRules,
      input.store
    );

    scheduleRefresh(input);

    return clone(nextRules);
  }

  function dispatch(name, detail) {
    try {
      global.dispatchEvent(
        new CustomEvent(name, {
          detail: clone(detail)
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
      generatedAt: new Date().toISOString()
    };

    dispatch(EVENTS.ERROR, payload);
    return payload;
  }

  function notify(dashboard) {
    state.listeners.forEach(function call(listener) {
      try {
        listener(clone(dashboard));
      } catch (error) {
        console.error(
          "[" + ENGINE_NAME + "] Listener failed.",
          error
        );
      }
    });
  }

  function refresh(options) {
    try {
      const nextOptions = Object.assign(
        {},
        state.lastOptions || {},
        options || {}
      );

      const dashboard = buildDashboard(
        nextOptions
      );

      state.lastOptions = clone(nextOptions);
      state.lastDashboard = clone(dashboard);

      dispatch(EVENTS.REFRESHED, dashboard);
      dispatch(EVENTS.CHANGED, dashboard);

      notify(dashboard);

      return clone(dashboard);
    } catch (error) {
      reportError(
        "ALERT_REFRESH_FAILED",
        "تعذر تحديث تنبيهات المصروفات.",
        "Unable to refresh expense alerts.",
        { cause: error.message }
      );

      throw error;
    }
  }

  function scheduleRefresh(options) {
    if (state.refreshTimer) {
      global.clearTimeout(state.refreshTimer);
    }

    state.refreshTimer = global.setTimeout(
      function scheduledRefresh() {
        state.refreshTimer = null;

        try {
          refresh(options || state.lastOptions || {});
        } catch (error) {
          console.error(
            "[" + ENGINE_NAME + "] Scheduled refresh failed.",
            error
          );
        }
      },
      75
    );
  }

  function subscribe(listener, options) {
    if (typeof listener !== "function") {
      throw new TypeError(
        "Expense Alert subscriber must be a function."
      );
    }

    state.listeners.add(listener);

    if (!options || options.immediate !== false) {
      listener(
        clone(
          state.lastDashboard ||
          buildDashboard(options || {})
        )
      );
    }

    return function unsubscribe() {
      state.listeners.delete(listener);
    };
  }

  function subscribeToSources(store) {
    if (state.subscribed) {
      return state.storeUnsubscribe || function noop() {};
    }

    const source = resolveStore(store);

    if (
      source &&
      typeof source.subscribe === "function"
    ) {
      try {
        const unsubscribe = source.subscribe(
          function onStoreChange() {
            scheduleRefresh({ store: source });
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

    const sourceEvents = [
      "store:changed",
      "tic:expenses-changed",
      "tic:expense-created",
      "tic:expense-updated",
      "tic:expense-deleted",
      "tic:expense-refunded",
      "tic:savings-changed",
      "tic:savings-plan-updated",
      "tic:payment-tracker-refreshed",
      "tic:payments-changed",
      "tic:payment-created",
      "tic:payment-updated",
      "tic:payment-paid",
      "tic:payment-refunded",
      "tic:budget-analytics-refreshed",
      "tic:budget-analytics-changed",
      "tic:budget-ai-refreshed",
      "tic:budget-ai-recommendations-changed"
    ];

    sourceEvents.forEach(function bind(name) {
      const handler = function onSourceChange() {
        scheduleRefresh({ store: source });
      };

      global.addEventListener(name, handler);

      state.eventBindings.push({
        name: name,
        handler: handler
      });
    });

    state.subscribed = true;

    return function unsubscribeAll() {
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
    };
  }

  function initialize(options) {
    if (state.initialized) {
      if (options && options.refresh === true) {
        return refresh(options);
      }

      return clone(
        state.lastDashboard ||
        buildDashboard(options || {})
      );
    }

    state.initialized = true;
    state.lastOptions = clone(options || {});

    subscribeToSources(
      options && options.store
    );

    const dashboard = refresh(options || {});

    dispatch(EVENTS.READY, {
      version: VERSION,
      engine: ENGINE_NAME,
      generatedAt: new Date().toISOString(),
      dashboard: dashboard
    });

    return dashboard;
  }

  function destroy() {
    if (state.refreshTimer) {
      global.clearTimeout(state.refreshTimer);
      state.refreshTimer = null;
    }

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
    state.listeners.clear();
    state.subscribed = false;
    state.initialized = false;
    state.lastDashboard = null;
    state.lastOptions = null;

    return true;
  }

  const API = Object.freeze({
    version: VERSION,
    name: ENGINE_NAME,
    events: EVENTS,
    constants: Object.freeze({
      SEVERITY: SEVERITY,
      STATUS: STATUS,
      TYPE: TYPE,
      DEFAULT_RULES: DEFAULT_RULES
    }),

    initialize: initialize,
    init: initialize,
    refresh: refresh,
    generateAlerts: generateAlerts,
    getAlerts: generateAlerts,
    buildDashboard: buildDashboard,
    getDashboard: function getDashboard(options) {
      return buildDashboard(options || {});
    },
    getSummary: function getSummary(options) {
      return buildDashboard(options || {}).summary;
    },
    getTopAlert: function getTopAlert(options) {
      return buildDashboard(options || {}).topAlert;
    },
    getCriticalAlerts: function getCriticalAlerts(options) {
      return generateAlerts(options || {}).filter(
        function critical(alert) {
          return alert.severity === SEVERITY.CRITICAL;
        }
      );
    },
    acknowledgeAlert: acknowledgeAlert,
    dismissAlert: dismissAlert,
    snoozeAlert: snoozeAlert,
    resolveAlert: resolveAlert,
    restoreAlert: restoreAlert,
    updateAlertState: updateAlertState,
    getRules: function getRules(options) {
      const input = isObject(options) ? options : {};
      return resolveRules(
        readState(input.store),
        input
      );
    },
    saveRules: saveRules,
    subscribe: subscribe,
    subscribeToSources: subscribeToSources,
    destroy: destroy,

    utils: Object.freeze({
      isObject: isObject,
      asArray: asArray,
      clone: clone,
      firstDefined: firstDefined,
      toNumber: toNumber,
      toNonNegative: toNonNegative,
      round: round,
      clamp: clamp,
      percentage: percentage,
      average: average,
      standardDeviation: standardDeviation,
      createId: createId,
      safeDate: safeDate,
      startOfDay: startOfDay,
      endOfDay: endOfDay,
      addDays: addDays,
      daysBetween: daysBetween,
      dateKey: dateKey,
      normalizeText: normalizeText,
      normalizeCurrency: normalizeCurrency,
      formatMoney: formatMoney,
      severityWeight: severityWeight
    })
  });

  global.TIC = global.TIC || {};
  global.TIC.Features = global.TIC.Features || {};
  global.TIC.Features.expenseAlertEngine = API;
  global.TICExpenseAlertEngine = API;

  /*
   * Initialization is deferred until DOM ready so the Store and the
   * preceding Budget Intelligence engines can register first.
   */
  if (
    global.document &&
    global.document.readyState === "loading"
  ) {
    global.document.addEventListener(
      "DOMContentLoaded",
      function initializeOnReady() {
        try {
          initialize();
        } catch (error) {
          console.error(
            "[" + ENGINE_NAME + "] Initialization failed.",
            error
          );
        }
      },
      { once: true }
    );
  } else {
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
