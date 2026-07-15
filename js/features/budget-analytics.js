/* =========================================================
   Travel Intelligence Center
   Budget Intelligence Platform
   Budget Analytics Engine V1.0.0

   File Path:
   js/features/budget-analytics.js

   Purpose:
   - Production-ready analytics layer for the Budget platform.
   - Combines Budget, Expense and Savings engine outputs.
   - Builds annual, monthly, category, trip and savings reports.
   - Detects spending trends, anomalies, risks and opportunities.
   - Produces chart-ready series and dashboard-ready KPIs.
   - Supports period comparison and financial forecasting.
   - Reads from the central Store without owning persistence.
   - Automatically refreshes when Store or finance events change.

   Dependencies:
   - window.TICBudgetEngine
   - window.TICExpenseEngine
   - window.TICSavingsEngine
   - window.TICStore / window.Store

   Global:
   - window.TICBudgetAnalytics
   ========================================================= */

(function budgetAnalyticsFactory(global) {
  "use strict";

  const VERSION = "1.0.0";
  const ENGINE_NAME = "TICBudgetAnalytics";

  const EVENTS = Object.freeze({
    READY: "tic:budget-analytics-ready",
    REFRESHED: "tic:budget-analytics-refreshed",
    CHANGED: "tic:budget-analytics-changed",
    ERROR: "tic:budget-analytics-error"
  });

  const PERIOD = Object.freeze({
    MONTH: "month",
    QUARTER: "quarter",
    YEAR: "year",
    CUSTOM: "custom"
  });

  const HEALTH = Object.freeze({
    EXCELLENT: "excellent",
    HEALTHY: "healthy",
    WATCH: "watch",
    WARNING: "warning",
    CRITICAL: "critical"
  });

  const TREND = Object.freeze({
    UP: "up",
    DOWN: "down",
    STABLE: "stable",
    NEW: "new"
  });

  const DEFAULT_CURRENCY = "AED";
  const DEFAULT_ANNUAL_BUDGET = 30000;
  const DEFAULT_MONTHLY_SAVING = 1500;

  const MONTHS_AR = Object.freeze([
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر"
  ]);

  const MONTHS_EN = Object.freeze([
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ]);

  const CATEGORY_LABELS = Object.freeze({
    flights: { ar: "الطيران", en: "Flights" },
    hotels: { ar: "الفنادق", en: "Hotels" },
    food: { ar: "المطاعم", en: "Food" },
    transport: { ar: "المواصلات", en: "Transport" },
    activities: { ar: "الأنشطة", en: "Activities" },
    shopping: { ar: "التسوق", en: "Shopping" },
    insurance: { ar: "التأمين", en: "Insurance" },
    visa: { ar: "التأشيرات", en: "Visa" },
    connectivity: { ar: "الاتصال والشرائح", en: "Connectivity" },
    other: { ar: "أخرى", en: "Other" }
  });

  const state = {
    initialized: false,
    subscribed: false,
    unsubscribeStore: null,
    listeners: new Set(),
    lastSnapshot: null,
    lastOptions: null,
    refreshTimer: null,
    eventBindings: []
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

  function median(values) {
    const items = asArray(values)
      .map(function mapNumber(value) {
        return toNumber(value, NaN);
      })
      .filter(Number.isFinite)
      .sort(function sortAscending(a, b) {
        return a - b;
      });

    if (!items.length) return 0;

    const middle = Math.floor(items.length / 2);

    if (items.length % 2 === 0) {
      return round((items[middle - 1] + items[middle]) / 2, 2);
    }

    return round(items[middle], 2);
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

  function startOfMonth(value) {
    const date = safeDate(value) || new Date();
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function endOfMonth(value) {
    const date = startOfMonth(value);
    date.setMonth(date.getMonth() + 1);
    date.setMilliseconds(-1);
    return date;
  }

  function startOfYear(value) {
    const date = safeDate(value) || new Date();
    date.setMonth(0, 1);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function endOfYear(value) {
    const date = startOfYear(value);
    date.setFullYear(date.getFullYear() + 1);
    date.setMilliseconds(-1);
    return date;
  }

  function addMonths(value, amount) {
    const date = safeDate(value) || new Date();
    date.setMonth(date.getMonth() + toNumber(amount, 0));
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

  function monthKey(value) {
    const date = safeDate(value);
    if (!date) return "";

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0")
    ].join("-");
  }

  function normalizeCurrency(value) {
    const budgetEngine = getBudgetEngine();

    if (
      budgetEngine &&
      budgetEngine.utils &&
      typeof budgetEngine.utils.normalizeCurrency === "function"
    ) {
      return budgetEngine.utils.normalizeCurrency(
        value || DEFAULT_CURRENCY
      );
    }

    return String(value || DEFAULT_CURRENCY)
      .trim()
      .toUpperCase() || DEFAULT_CURRENCY;
  }

  function normalizeCategory(value) {
    const budgetEngine = getBudgetEngine();

    if (
      budgetEngine &&
      budgetEngine.utils &&
      typeof budgetEngine.utils.normalizeCategory === "function"
    ) {
      return budgetEngine.utils.normalizeCategory(value || "other");
    }

    const raw = String(value || "other").trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, raw)
      ? raw
      : "other";
  }

  function normalizeStatus(value, fallback) {
    const raw = String(value || fallback || "")
      .trim()
      .toLowerCase();

    const aliases = {
      complete: "paid",
      completed: "paid",
      settled: "paid",
      done: "paid",
      returned: "refunded",
      canceled: "cancelled",
      draft: "planned",
      waiting: "pending",
      scheduled: "planned"
    };

    return aliases[raw] || raw || fallback;
  }

  function getBudgetEngine() {
    return global.TICBudgetEngine || null;
  }

  function getExpenseEngine() {
    return global.TICExpenseEngine || null;
  }

  function getSavingsEngine() {
    return global.TICSavingsEngine || null;
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
        "تعذر قراءة بيانات التحليلات من المخزن.",
        "Unable to read analytics data from the Store.",
        { cause: error.message }
      );
    }

    return {};
  }

  function getExpensesFromState(storeState) {
    const candidates = [
      storeState && storeState.expenses,
      storeState && storeState.budget && storeState.budget.expenses,
      storeState && storeState.budgets && storeState.budgets.expenses,
      storeState && storeState.finance && storeState.finance.expenses,
      storeState &&
        storeState.travelFinance &&
        storeState.travelFinance.expenses
    ];

    for (let index = 0; index < candidates.length; index += 1) {
      if (Array.isArray(candidates[index])) {
        return candidates[index];
      }
    }

    return [];
  }

  function getSavingsRoot(storeState) {
    const candidate = firstDefined(
      storeState && storeState.savings,
      storeState &&
        storeState.finance &&
        storeState.finance.savings,
      storeState &&
        storeState.travelFinance &&
        storeState.travelFinance.savings
    );

    if (Array.isArray(candidate)) {
      return { entries: candidate };
    }

    return isObject(candidate) ? candidate : {};
  }

  function getTripsFromState(storeState) {
    return asArray(firstDefined(
      storeState && storeState.trips,
      storeState &&
        storeState.travel &&
        storeState.travel.trips,
      []
    ));
  }

  function getBudgetsFromState(storeState) {
    if (Array.isArray(storeState && storeState.budgets)) {
      return storeState.budgets;
    }

    if (
      isObject(storeState && storeState.budget) &&
      Array.isArray(storeState.budget.tripBudgets)
    ) {
      return storeState.budget.tripBudgets;
    }

    if (
      isObject(storeState && storeState.budgets) &&
      Array.isArray(storeState.budgets.tripBudgets)
    ) {
      return storeState.budgets.tripBudgets;
    }

    return [];
  }

  function resolveCurrency(storeState, options) {
    const profile = isObject(storeState && storeState.profile)
      ? storeState.profile
      : {};

    const settings = isObject(storeState && storeState.settings)
      ? storeState.settings
      : {};

    const budgetRoot = isObject(storeState && storeState.budget)
      ? storeState.budget
      : {};

    return normalizeCurrency(firstDefined(
      options && options.currency,
      budgetRoot.currency,
      settings.currency,
      profile.currency,
      storeState && storeState.currency,
      DEFAULT_CURRENCY
    ));
  }

  function resolveAnnualBudget(storeState, options) {
    const profile = isObject(storeState && storeState.profile)
      ? storeState.profile
      : {};

    const settings = isObject(storeState && storeState.settings)
      ? storeState.settings
      : {};

    const budgetRoot = isObject(storeState && storeState.budget)
      ? storeState.budget
      : {};

    return toNonNegative(firstDefined(
      options && options.annualBudget,
      budgetRoot.annualBudget,
      budgetRoot.total,
      settings.annualTravelBudget,
      profile.annualTravelBudget,
      DEFAULT_ANNUAL_BUDGET
    ));
  }

  function resolveMonthlySaving(storeState, options) {
    const profile = isObject(storeState && storeState.profile)
      ? storeState.profile
      : {};

    const settings = isObject(storeState && storeState.settings)
      ? storeState.settings
      : {};

    const savingsRoot = getSavingsRoot(storeState);

    return toNonNegative(firstDefined(
      options && options.monthlySaving,
      savingsRoot.monthlySaving,
      savingsRoot.monthlyTarget,
      settings.monthlySaving,
      profile.monthlySaving,
      DEFAULT_MONTHLY_SAVING
    ));
  }

  function resolvePeriod(options) {
    const input = options || {};
    const now = safeDate(input.now) || new Date();
    const type = String(input.period || PERIOD.YEAR).toLowerCase();

    if (input.startDate || input.endDate) {
      const start = startOfDay(
        input.startDate || startOfYear(now)
      );

      const end = endOfDay(
        input.endDate || endOfYear(now)
      );

      return {
        type: PERIOD.CUSTOM,
        startDate: start,
        endDate: end < start ? endOfDay(start) : end
      };
    }

    if (type === PERIOD.MONTH) {
      return {
        type: PERIOD.MONTH,
        startDate: startOfMonth(now),
        endDate: endOfMonth(now)
      };
    }

    if (type === PERIOD.QUARTER) {
      const quarterStartMonth =
        Math.floor(now.getMonth() / 3) * 3;

      const start = new Date(
        now.getFullYear(),
        quarterStartMonth,
        1
      );

      const end = new Date(
        now.getFullYear(),
        quarterStartMonth + 3,
        0,
        23,
        59,
        59,
        999
      );

      return {
        type: PERIOD.QUARTER,
        startDate: start,
        endDate: end
      };
    }

    return {
      type: PERIOD.YEAR,
      startDate: startOfYear(now),
      endDate: endOfYear(now)
    };
  }

  function inPeriod(value, period) {
    const date = safeDate(value);
    if (!date) return false;

    return date >= period.startDate && date <= period.endDate;
  }

  function getExpenseDate(expense) {
    return firstDefined(
      expense && expense.paidAt,
      expense && expense.date,
      expense && expense.expenseDate,
      expense && expense.transactionDate,
      expense && expense.createdAt
    );
  }

  function getExpenseAmount(expense) {
    const status = normalizeStatus(
      expense && expense.status,
      "paid"
    );

    if (status === "cancelled") return 0;

    const gross = toNonNegative(firstDefined(
      expense && expense.amount,
      expense && expense.total,
      expense && expense.value,
      0
    ));

    const refunded = toNonNegative(firstDefined(
      expense && expense.refundAmount,
      expense && expense.refundedAmount,
      status === "refunded" ? gross : 0
    ));

    return round(Math.max(0, gross - refunded), 2);
  }

  function normalizeExpense(expense, index, currency) {
    const date = safeDate(getExpenseDate(expense));
    const amount = getExpenseAmount(expense);

    return {
      id: String(firstDefined(
        expense && expense.id,
        expense && expense._id,
        expense && expense.uuid,
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
      category: normalizeCategory(
        firstDefined(
          expense && expense.category,
          expense && expense.type,
          "other"
        )
      ),
      status: normalizeStatus(
        expense && expense.status,
        "paid"
      ),
      amount: amount,
      originalAmount: toNonNegative(firstDefined(
        expense && expense.amount,
        expense && expense.total,
        amount
      )),
      refundedAmount: round(
        Math.max(
          0,
          toNonNegative(firstDefined(
            expense && expense.refundAmount,
            expense && expense.refundedAmount,
            0
          ))
        ),
        2
      ),
      currency: normalizeCurrency(
        firstDefined(
          expense && expense.currency,
          currency
        )
      ),
      date: date,
      dateISO: date ? date.toISOString() : null,
      monthKey: date ? monthKey(date) : "",
      dayKey: date ? dateKey(date) : "",
      paymentMethod: String(firstDefined(
        expense && expense.paymentMethod,
        expense && expense.method,
        "unknown"
      )),
      recurring: Boolean(
        expense &&
        expense.recurrence &&
        expense.recurrence !== "none"
      ),
      source: expense
    };
  }

  function getNormalizedExpenses(storeState, options) {
    const currency = resolveCurrency(storeState, options);
    const expenseEngine = getExpenseEngine();

    let source = null;

    if (expenseEngine) {
      const methods = [
        "listExpenses",
        "getExpenses",
        "getAll",
        "list"
      ];

      for (let index = 0; index < methods.length; index += 1) {
        const method = methods[index];

        if (typeof expenseEngine[method] === "function") {
          try {
            const result = expenseEngine[method]({
              includeDeleted: false,
              store: options && options.store
            });

            const candidate = Array.isArray(result)
              ? result
              : asArray(
                  result &&
                  (result.items || result.expenses || result.data)
                );

            if (candidate.length || Array.isArray(result)) {
              source = candidate;
              break;
            }
          } catch (error) {
            // Fall back to direct Store data.
          }
        }
      }
    }

    const expenses = source || getExpensesFromState(storeState);

    return asArray(expenses)
      .filter(function activeOnly(expense) {
        return !expense || (
          expense.deletedAt == null &&
          expense.isDeleted !== true
        );
      })
      .map(function normalize(item, index) {
        return normalizeExpense(item, index, currency);
      });
  }

  function getTripBudgetAmount(trip, budget) {
    return toNonNegative(firstDefined(
      budget && budget.plannedTotal,
      budget && budget.total,
      budget && budget.amount,
      trip && trip.budget,
      trip && trip.plannedBudget,
      trip && trip.estimatedBudget,
      0
    ));
  }

  function buildTripAnalytics(storeState, expenses, currency) {
    const trips = getTripsFromState(storeState)
      .filter(function activeOnly(trip) {
        return trip && trip.deletedAt == null && trip.isDeleted !== true;
      });

    const budgets = getBudgetsFromState(storeState);

    const budgetMap = new Map();

    budgets.forEach(function mapBudget(budget) {
      const tripId = firstDefined(
        budget && budget.tripId,
        budget && budget.travelId
      );

      if (tripId !== undefined && tripId !== null) {
        budgetMap.set(String(tripId), budget);
      }
    });

    const knownTripIds = new Set();

    const items = trips.map(function mapTrip(trip, index) {
      const id = String(firstDefined(
        trip && trip.id,
        trip && trip._id,
        "trip_" + index
      ));

      knownTripIds.add(id);

      const tripExpenses = expenses.filter(function matchExpense(expense) {
        return String(expense.tripId || "") === id;
      });

      const spent = round(
        tripExpenses.reduce(function sum(total, expense) {
          return total + expense.amount;
        }, 0),
        2
      );

      const planned = getTripBudgetAmount(
        trip,
        budgetMap.get(id)
      );

      const remaining = round(planned - spent, 2);
      const usagePercent = percentage(spent, planned, 1);

      return {
        id: id,
        title: String(firstDefined(
          trip && trip.title,
          trip && trip.name,
          trip && trip.destination,
          "Trip"
        )),
        destination: firstDefined(
          trip && trip.destination,
          trip && trip.city,
          trip && trip.country,
          ""
        ),
        startDate: firstDefined(
          trip && trip.startDate,
          trip && trip.departureDate,
          null
        ),
        endDate: firstDefined(
          trip && trip.endDate,
          trip && trip.returnDate,
          null
        ),
        status: String(firstDefined(
          trip && trip.status,
          "planned"
        )),
        currency: normalizeCurrency(firstDefined(
          trip && trip.currency,
          currency
        )),
        planned: round(planned, 2),
        spent: spent,
        remaining: remaining,
        usagePercent: usagePercent,
        expenseCount: tripExpenses.length,
        averageExpense: tripExpenses.length
          ? round(spent / tripExpenses.length, 2)
          : 0,
        largestExpense: tripExpenses.length
          ? Math.max.apply(
              null,
              tripExpenses.map(function amount(item) {
                return item.amount;
              })
            )
          : 0,
        statusHealth:
          planned <= 0
            ? "not-set"
            : usagePercent > 100
              ? "over"
              : usagePercent >= 85
                ? "warning"
                : usagePercent >= 65
                  ? "watch"
                  : "healthy"
      };
    });

    const orphanGroups = {};

    expenses.forEach(function collectOrphan(expense) {
      const tripId = expense.tripId == null
        ? ""
        : String(expense.tripId);

      if (!tripId || knownTripIds.has(tripId)) return;

      orphanGroups[tripId] = orphanGroups[tripId] || [];
      orphanGroups[tripId].push(expense);
    });

    Object.keys(orphanGroups).forEach(function addOrphan(tripId) {
      const tripExpenses = orphanGroups[tripId];
      const spent = round(
        tripExpenses.reduce(function sum(total, expense) {
          return total + expense.amount;
        }, 0),
        2
      );

      items.push({
        id: tripId,
        title: "Linked trip",
        destination: "",
        startDate: null,
        endDate: null,
        status: "unknown",
        currency: currency,
        planned: 0,
        spent: spent,
        remaining: -spent,
        usagePercent: 0,
        expenseCount: tripExpenses.length,
        averageExpense: tripExpenses.length
          ? round(spent / tripExpenses.length, 2)
          : 0,
        largestExpense: tripExpenses.length
          ? Math.max.apply(
              null,
              tripExpenses.map(function amount(item) {
                return item.amount;
              })
            )
          : 0,
        statusHealth: "not-set",
        orphanedReference: true
      });
    });

    items.sort(function sortBySpent(a, b) {
      return b.spent - a.spent;
    });

    return {
      items: items,
      totalTrips: items.length,
      tripsWithBudget: items.filter(function hasBudget(item) {
        return item.planned > 0;
      }).length,
      tripsOverBudget: items.filter(function over(item) {
        return item.planned > 0 && item.spent > item.planned;
      }).length,
      tripsNearLimit: items.filter(function near(item) {
        return (
          item.planned > 0 &&
          item.usagePercent >= 85 &&
          item.usagePercent <= 100
        );
      }).length,
      totalPlanned: round(
        items.reduce(function sum(total, item) {
          return total + item.planned;
        }, 0),
        2
      ),
      totalSpent: round(
        items.reduce(function sum(total, item) {
          return total + item.spent;
        }, 0),
        2
      ),
      highestSpendingTrip: items[0] || null,
      mostEfficientTrip:
        items
          .filter(function valid(item) {
            return item.planned > 0 && item.spent > 0;
          })
          .sort(function efficient(a, b) {
            return a.usagePercent - b.usagePercent;
          })[0] || null
    };
  }

  function buildCategoryAnalytics(expenses, totalSpent) {
    const groups = {};

    Object.keys(CATEGORY_LABELS).forEach(function initialize(key) {
      groups[key] = {
        key: key,
        labelAr: CATEGORY_LABELS[key].ar,
        labelEn: CATEGORY_LABELS[key].en,
        amount: 0,
        count: 0,
        average: 0,
        sharePercent: 0,
        largestExpense: null,
        items: []
      };
    });

    expenses.forEach(function groupExpense(expense) {
      const key = normalizeCategory(expense.category);
      const group = groups[key] || groups.other;

      group.amount += expense.amount;
      group.count += 1;
      group.items.push(expense);

      if (
        !group.largestExpense ||
        expense.amount > group.largestExpense.amount
      ) {
        group.largestExpense = {
          id: expense.id,
          title: expense.title,
          amount: expense.amount,
          date: expense.dateISO
        };
      }
    });

    const items = Object.keys(groups)
      .map(function finalize(key) {
        const group = groups[key];

        group.amount = round(group.amount, 2);
        group.average = group.count
          ? round(group.amount / group.count, 2)
          : 0;
        group.sharePercent = percentage(
          group.amount,
          totalSpent,
          1
        );
        delete group.items;

        return group;
      })
      .sort(function sortDescending(a, b) {
        return b.amount - a.amount;
      });

    return {
      items: items,
      highestCategory:
        items.find(function hasValue(item) {
          return item.amount > 0;
        }) || null,
      activeCategoryCount:
        items.filter(function active(item) {
          return item.amount > 0;
        }).length,
      concentrationPercent:
        items.length
          ? round(
              items
                .slice(0, 3)
                .reduce(function topThree(total, item) {
                  return total + item.sharePercent;
                }, 0),
              1
            )
          : 0
    };
  }

  function buildMonthlyAnalytics(expenses, period) {
    const cursor = startOfMonth(period.startDate);
    const last = startOfMonth(period.endDate);
    const items = [];

    while (cursor <= last) {
      const key = monthKey(cursor);

      const monthExpenses = expenses.filter(function matchMonth(expense) {
        return expense.monthKey === key;
      });

      const amount = round(
        monthExpenses.reduce(function sum(total, expense) {
          return total + expense.amount;
        }, 0),
        2
      );

      items.push({
        key: key,
        year: cursor.getFullYear(),
        month: cursor.getMonth() + 1,
        labelAr: MONTHS_AR[cursor.getMonth()],
        labelEn: MONTHS_EN[cursor.getMonth()],
        amount: amount,
        count: monthExpenses.length,
        averageExpense: monthExpenses.length
          ? round(amount / monthExpenses.length, 2)
          : 0
      });

      cursor.setMonth(cursor.getMonth() + 1);
    }

    const values = items.map(function amount(item) {
      return item.amount;
    });

    items.forEach(function addTrend(item, index) {
      const previous = index > 0 ? items[index - 1].amount : null;

      if (previous === null) {
        item.trend = TREND.NEW;
        item.changeAmount = 0;
        item.changePercent = 0;
        return;
      }

      item.changeAmount = round(item.amount - previous, 2);
      item.changePercent = previous > 0
        ? round(((item.amount - previous) / previous) * 100, 1)
        : (item.amount > 0 ? 100 : 0);

      item.trend =
        Math.abs(item.changePercent) < 3
          ? TREND.STABLE
          : item.changePercent > 0
            ? TREND.UP
            : TREND.DOWN;
    });

    const highestMonth = items
      .slice()
      .sort(function descending(a, b) {
        return b.amount - a.amount;
      })[0] || null;

    const lowestActiveMonth = items
      .filter(function active(item) {
        return item.amount > 0;
      })
      .sort(function ascending(a, b) {
        return a.amount - b.amount;
      })[0] || null;

    return {
      items: items,
      averageMonthlySpend: average(values),
      medianMonthlySpend: median(values),
      monthlyVolatility: standardDeviation(values),
      highestMonth: highestMonth,
      lowestActiveMonth: lowestActiveMonth,
      activeMonths: items.filter(function active(item) {
        return item.amount > 0;
      }).length
    };
  }

  function buildSavingsAnalytics(storeState, options, annualBudget) {
    const savingsEngine = getSavingsEngine();
    let engineSummary = null;

    if (savingsEngine) {
      const methods = [
        "getDashboard",
        "getSummary",
        "analyze",
        "getSavingsSummary"
      ];

      for (let index = 0; index < methods.length; index += 1) {
        const method = methods[index];

        if (typeof savingsEngine[method] === "function") {
          try {
            const result = savingsEngine[method]({
              store: options && options.store,
              annualBudget: annualBudget
            });

            if (isObject(result)) {
              engineSummary = result;
              break;
            }
          } catch (error) {
            // Fall back to direct Store data.
          }
        }
      }
    }

    const root = getSavingsRoot(storeState);
    const entries = asArray(firstDefined(
      root.entries,
      root.transactions,
      root.history,
      []
    )).filter(function activeOnly(entry) {
      return entry && entry.deletedAt == null && entry.isDeleted !== true;
    });

    const deposits = entries.filter(function deposit(entry) {
      const type = String(firstDefined(
        entry && entry.type,
        entry && entry.entryType,
        "deposit"
      )).toLowerCase();

      return [
        "deposit",
        "saving",
        "saved",
        "credit",
        "income"
      ].includes(type);
    });

    const withdrawals = entries.filter(function withdrawal(entry) {
      const type = String(firstDefined(
        entry && entry.type,
        entry && entry.entryType,
        ""
      )).toLowerCase();

      return [
        "withdrawal",
        "withdraw",
        "debit",
        "expense"
      ].includes(type);
    });

    const totalDeposits = round(
      deposits.reduce(function sum(total, entry) {
        return total + toNonNegative(firstDefined(
          entry && entry.amount,
          entry && entry.value,
          0
        ));
      }, 0),
      2
    );

    const totalWithdrawals = round(
      withdrawals.reduce(function sum(total, entry) {
        return total + toNonNegative(firstDefined(
          entry && entry.amount,
          entry && entry.value,
          0
        ));
      }, 0),
      2
    );

    const calculatedBalance = round(
      totalDeposits - totalWithdrawals,
      2
    );

    const balance = toNumber(firstDefined(
      engineSummary && engineSummary.balance,
      engineSummary && engineSummary.currentBalance,
      engineSummary &&
        engineSummary.summary &&
        engineSummary.summary.balance,
      root.balance,
      root.currentBalance,
      calculatedBalance
    ), calculatedBalance);

    const monthlySaving = resolveMonthlySaving(
      storeState,
      options
    );

    const coveragePercent = percentage(
      Math.max(0, balance),
      annualBudget,
      1
    );

    const remainingToFund = round(
      Math.max(0, annualBudget - Math.max(0, balance)),
      2
    );

    const monthsToFund = monthlySaving > 0
      ? Math.ceil(remainingToFund / monthlySaving)
      : null;

    const targetDate = monthsToFund === null
      ? null
      : addMonths(new Date(), monthsToFund).toISOString();

    const targets = asArray(firstDefined(
      root.targets,
      root.goals,
      storeState && storeState.savingsTargets,
      []
    )).filter(function activeTarget(target) {
      const status = String(firstDefined(
        target && target.status,
        "active"
      )).toLowerCase();

      return (
        target &&
        target.deletedAt == null &&
        target.isDeleted !== true &&
        status !== "cancelled"
      );
    });

    return {
      balance: round(balance, 2),
      totalDeposits: totalDeposits,
      totalWithdrawals: totalWithdrawals,
      monthlySaving: round(monthlySaving, 2),
      annualTarget: round(annualBudget, 2),
      coveragePercent: coveragePercent,
      remainingToFund: remainingToFund,
      monthsToFund: monthsToFund,
      estimatedTargetDate: targetDate,
      entryCount: entries.length,
      depositCount: deposits.length,
      withdrawalCount: withdrawals.length,
      activeTargets: targets.filter(function active(target) {
        return String(target.status || "active").toLowerCase() === "active";
      }).length,
      completedTargets: targets.filter(function completed(target) {
        return ["completed", "done", "finished"].includes(
          String(target.status || "").toLowerCase()
        );
      }).length,
      engineSummary: engineSummary
    };
  }

  function buildPaymentMethodAnalytics(expenses, totalSpent) {
    const groups = {};

    expenses.forEach(function group(expense) {
      const key = String(
        expense.paymentMethod || "unknown"
      ).trim().toLowerCase() || "unknown";

      groups[key] = groups[key] || {
        key: key,
        amount: 0,
        count: 0,
        sharePercent: 0
      };

      groups[key].amount += expense.amount;
      groups[key].count += 1;
    });

    const items = Object.values(groups)
      .map(function finalize(item) {
        return {
          key: item.key,
          amount: round(item.amount, 2),
          count: item.count,
          sharePercent: percentage(
            item.amount,
            totalSpent,
            1
          )
        };
      })
      .sort(function descending(a, b) {
        return b.amount - a.amount;
      });

    return {
      items: items,
      primaryMethod: items[0] || null
    };
  }

  function buildDailyAnalytics(expenses) {
    const groups = {};

    expenses.forEach(function group(expense) {
      if (!expense.dayKey) return;

      groups[expense.dayKey] = groups[expense.dayKey] || {
        date: expense.dayKey,
        amount: 0,
        count: 0
      };

      groups[expense.dayKey].amount += expense.amount;
      groups[expense.dayKey].count += 1;
    });

    const items = Object.values(groups)
      .map(function finalize(item) {
        return {
          date: item.date,
          amount: round(item.amount, 2),
          count: item.count
        };
      })
      .sort(function chronological(a, b) {
        return a.date.localeCompare(b.date);
      });

    return {
      items: items,
      activeDays: items.length,
      averageDailySpend: average(
        items.map(function amount(item) {
          return item.amount;
        })
      ),
      highestDay:
        items
          .slice()
          .sort(function descending(a, b) {
            return b.amount - a.amount;
          })[0] || null
    };
  }

  function buildAnomalies(expenses, categoryAnalytics) {
    const amounts = expenses
      .map(function amount(expense) {
        return expense.amount;
      })
      .filter(function positive(amount) {
        return amount > 0;
      });

    if (amounts.length < 4) {
      return {
        items: [],
        threshold: 0,
        count: 0
      };
    }

    const mean = average(amounts);
    const deviation = standardDeviation(amounts);
    const threshold = round(mean + (deviation * 2), 2);

    const anomalies = expenses
      .filter(function unusual(expense) {
        return expense.amount > threshold && expense.amount > 0;
      })
      .map(function mapAnomaly(expense) {
        return {
          id: expense.id,
          title: expense.title,
          amount: expense.amount,
          category: expense.category,
          date: expense.dateISO,
          reason: "above-normal",
          varianceFromAverage: round(
            expense.amount - mean,
            2
          ),
          severity:
            expense.amount >= mean + (deviation * 3)
              ? "high"
              : "medium"
        };
      })
      .sort(function descending(a, b) {
        return b.amount - a.amount;
      });

    const dominantCategory =
      categoryAnalytics.highestCategory;

    if (
      dominantCategory &&
      dominantCategory.sharePercent >= 60
    ) {
      anomalies.push({
        id: "category_concentration_" +
          dominantCategory.key,
        title: dominantCategory.labelEn,
        amount: dominantCategory.amount,
        category: dominantCategory.key,
        date: null,
        reason: "category-concentration",
        varianceFromAverage: 0,
        severity:
          dominantCategory.sharePercent >= 75
            ? "high"
            : "medium",
        sharePercent: dominantCategory.sharePercent
      });
    }

    return {
      items: anomalies,
      threshold: threshold,
      count: anomalies.length,
      averageExpense: mean,
      standardDeviation: deviation
    };
  }

  function calculateHealthScore(input) {
    const annualUsage = input.annualBudget > 0
      ? percentage(input.totalSpent, input.annualBudget, 1)
      : 0;

    let usageScore = 100;

    if (annualUsage > 120) usageScore = 0;
    else if (annualUsage > 100) usageScore = 25;
    else if (annualUsage > 90) usageScore = 50;
    else if (annualUsage > 75) usageScore = 70;
    else if (annualUsage > 50) usageScore = 85;

    const savingsScore = clamp(
      input.savings.coveragePercent,
      0,
      100
    );

    const tripScore = input.trips.totalTrips
      ? clamp(
          100 -
          (
            input.trips.tripsOverBudget * 25 +
            input.trips.tripsNearLimit * 10
          ),
          0,
          100
        )
      : 100;

    const anomalyScore = clamp(
      100 - (input.anomalies.count * 10),
      0,
      100
    );

    const controlScore = input.expenseCount
      ? clamp(
          100 -
          (
            input.unplannedPercent * 0.5
          ),
          0,
          100
        )
      : 100;

    const score = round(
      (
        usageScore * 0.30 +
        savingsScore * 0.25 +
        tripScore * 0.20 +
        anomalyScore * 0.10 +
        controlScore * 0.15
      ),
      0
    );

    let status = HEALTH.EXCELLENT;

    if (score < 40) status = HEALTH.CRITICAL;
    else if (score < 55) status = HEALTH.WARNING;
    else if (score < 70) status = HEALTH.WATCH;
    else if (score < 85) status = HEALTH.HEALTHY;

    return {
      score: score,
      status: status,
      components: {
        annualUsage: round(usageScore, 0),
        savingsCoverage: round(savingsScore, 0),
        tripControl: round(tripScore, 0),
        anomalyControl: round(anomalyScore, 0),
        planningControl: round(controlScore, 0)
      }
    };
  }

  function buildForecast(input) {
    const now = safeDate(input.now) || new Date();
    const periodStart = input.period.startDate;
    const periodEnd = input.period.endDate;
    const elapsedDays = Math.max(
      1,
      daysBetween(periodStart, now) + 1
    );
    const totalDays = Math.max(
      1,
      daysBetween(periodStart, periodEnd) + 1
    );

    const elapsedRatio = clamp(
      elapsedDays / totalDays,
      0,
      1
    );

    const projectedSpend = elapsedRatio > 0
      ? round(input.totalSpent / elapsedRatio, 2)
      : input.totalSpent;

    const projectedRemaining = round(
      input.annualBudget - projectedSpend,
      2
    );

    const projectedUsagePercent = percentage(
      projectedSpend,
      input.annualBudget,
      1
    );

    const recentMonths = input.monthly.items
      .filter(function active(item) {
        return item.amount > 0;
      })
      .slice(-3);

    const recentAverage = average(
      recentMonths.map(function amount(item) {
        return item.amount;
      })
    );

    const monthsRemaining = Math.max(
      0,
      12 - (now.getMonth() + 1)
    );

    const runRateProjection = round(
      input.totalSpent +
      (recentAverage * monthsRemaining),
      2
    );

    const recommendedMonthlyLimit = monthsRemaining > 0
      ? round(
          Math.max(
            0,
            input.annualBudget - input.totalSpent
          ) / monthsRemaining,
          2
        )
      : 0;

    return {
      elapsedDays: elapsedDays,
      totalDays: totalDays,
      elapsedPercent: round(elapsedRatio * 100, 1),
      projectedSpend: projectedSpend,
      projectedRemaining: projectedRemaining,
      projectedUsagePercent: projectedUsagePercent,
      recentMonthlyAverage: recentAverage,
      runRateProjection: runRateProjection,
      monthsRemaining: monthsRemaining,
      recommendedMonthlyLimit: recommendedMonthlyLimit,
      likelyToExceed:
        input.annualBudget > 0 &&
        Math.max(projectedSpend, runRateProjection) >
          input.annualBudget,
      expectedOverrun: round(
        Math.max(
          0,
          Math.max(projectedSpend, runRateProjection) -
            input.annualBudget
        ),
        2
      )
    };
  }

  function buildInsights(input) {
    const insights = [];

    if (input.annualBudget <= 0) {
      insights.push({
        id: "annual-budget-missing",
        type: "setup",
        severity: "high",
        titleAr: "الميزانية السنوية غير محددة",
        titleEn: "Annual budget is not set",
        messageAr:
          "حدد ميزانية السفر السنوية لتفعيل التوقعات والتنبيهات بدقة.",
        messageEn:
          "Set an annual travel budget to enable accurate forecasts and alerts."
      });
    }

    if (input.usagePercent > 100) {
      insights.push({
        id: "annual-over-budget",
        type: "risk",
        severity: "critical",
        titleAr: "تجاوزت الميزانية السنوية",
        titleEn: "Annual budget exceeded",
        messageAr:
          "إجمالي الإنفاق أعلى من الميزانية بمقدار " +
          round(input.totalSpent - input.annualBudget, 2) +
          " " +
          input.currency +
          ".",
        messageEn:
          "Total spending exceeds the annual budget by " +
          round(input.totalSpent - input.annualBudget, 2) +
          " " +
          input.currency +
          "."
      });
    } else if (input.usagePercent >= 85) {
      insights.push({
        id: "annual-near-limit",
        type: "warning",
        severity: "high",
        titleAr: "الميزانية السنوية تقترب من الحد",
        titleEn: "Annual budget is near its limit",
        messageAr:
          "تم استخدام " +
          input.usagePercent +
          "% من الميزانية السنوية.",
        messageEn:
          input.usagePercent +
          "% of the annual budget has been used."
      });
    }

    if (input.forecast.likelyToExceed) {
      insights.push({
        id: "forecast-overrun",
        type: "forecast",
        severity: "high",
        titleAr: "التوقع الحالي يشير إلى تجاوز الميزانية",
        titleEn: "Current forecast indicates an overrun",
        messageAr:
          "قد يصل التجاوز المتوقع إلى " +
          input.forecast.expectedOverrun +
          " " +
          input.currency +
          ".",
        messageEn:
          "The expected overrun may reach " +
          input.forecast.expectedOverrun +
          " " +
          input.currency +
          "."
      });
    }

    if (input.trips.tripsOverBudget > 0) {
      insights.push({
        id: "trips-over-budget",
        type: "trip",
        severity: "high",
        titleAr: "رحلات تجاوزت ميزانيتها",
        titleEn: "Trips exceeded their budgets",
        messageAr:
          input.trips.tripsOverBudget +
          " رحلة تجاوزت الميزانية المحددة.",
        messageEn:
          input.trips.tripsOverBudget +
          " trip(s) exceeded their planned budgets."
      });
    }

    if (
      input.categories.highestCategory &&
      input.categories.highestCategory.sharePercent >= 45
    ) {
      const category = input.categories.highestCategory;

      insights.push({
        id: "dominant-category-" + category.key,
        type: "category",
        severity:
          category.sharePercent >= 65
            ? "high"
            : "medium",
        titleAr:
          "تركيز مرتفع في " + category.labelAr,
        titleEn:
          "High concentration in " + category.labelEn,
        messageAr:
          "تشكل هذه الفئة " +
          category.sharePercent +
          "% من إجمالي الإنفاق.",
        messageEn:
          "This category represents " +
          category.sharePercent +
          "% of total spending."
      });
    }

    if (input.savings.coveragePercent < 50) {
      insights.push({
        id: "low-savings-coverage",
        type: "savings",
        severity:
          input.savings.coveragePercent < 25
            ? "high"
            : "medium",
        titleAr: "تغطية الادخار منخفضة",
        titleEn: "Savings coverage is low",
        messageAr:
          "الادخار الحالي يغطي " +
          input.savings.coveragePercent +
          "% من الميزانية السنوية.",
        messageEn:
          "Current savings cover " +
          input.savings.coveragePercent +
          "% of the annual budget."
      });
    }

    if (input.anomalies.count > 0) {
      insights.push({
        id: "expense-anomalies",
        type: "anomaly",
        severity: "medium",
        titleAr: "مصروفات غير اعتيادية",
        titleEn: "Unusual expenses detected",
        messageAr:
          "تم رصد " +
          input.anomalies.count +
          " حالة تحتاج إلى مراجعة.",
        messageEn:
          input.anomalies.count +
          " item(s) may require review."
      });
    }

    if (
      input.expenseCount > 0 &&
      input.unplannedPercent >= 30
    ) {
      insights.push({
        id: "high-unplanned-spend",
        type: "planning",
        severity: "medium",
        titleAr: "نسبة المصروفات غير المخططة مرتفعة",
        titleEn: "Unplanned spending is high",
        messageAr:
          input.unplannedPercent +
          "% من الإنفاق غير مخطط مسبقاً.",
        messageEn:
          input.unplannedPercent +
          "% of spending was not planned in advance."
      });
    }

    if (!insights.length) {
      insights.push({
        id: "healthy-budget",
        type: "positive",
        severity: "low",
        titleAr: "الوضع المالي للسفر مستقر",
        titleEn: "Travel finances are stable",
        messageAr:
          "الإنفاق والادخار ضمن نطاق صحي حالياً.",
        messageEn:
          "Spending and savings are currently within a healthy range."
      });
    }

    return insights;
  }

  function buildChartData(input) {
    return {
      monthlySpend: {
        labels: input.monthly.items.map(function label(item) {
          return item.labelAr;
        }),
        labelsEn: input.monthly.items.map(function label(item) {
          return item.labelEn;
        }),
        values: input.monthly.items.map(function value(item) {
          return item.amount;
        }),
        keys: input.monthly.items.map(function key(item) {
          return item.key;
        })
      },
      categorySpend: {
        labels: input.categories.items.map(function label(item) {
          return item.labelAr;
        }),
        labelsEn: input.categories.items.map(function label(item) {
          return item.labelEn;
        }),
        values: input.categories.items.map(function value(item) {
          return item.amount;
        }),
        percentages: input.categories.items.map(function value(item) {
          return item.sharePercent;
        }),
        keys: input.categories.items.map(function key(item) {
          return item.key;
        })
      },
      tripBudget: {
        labels: input.trips.items.map(function label(item) {
          return item.title;
        }),
        planned: input.trips.items.map(function value(item) {
          return item.planned;
        }),
        spent: input.trips.items.map(function value(item) {
          return item.spent;
        }),
        remaining: input.trips.items.map(function value(item) {
          return item.remaining;
        }),
        ids: input.trips.items.map(function id(item) {
          return item.id;
        })
      },
      paymentMethods: {
        labels: input.paymentMethods.items.map(function label(item) {
          return item.key;
        }),
        values: input.paymentMethods.items.map(function value(item) {
          return item.amount;
        })
      },
      savingsProgress: {
        target: input.annualBudget,
        saved: input.savings.balance,
        remaining: input.savings.remainingToFund,
        coveragePercent: input.savings.coveragePercent
      },
      annualGauge: {
        budget: input.annualBudget,
        spent: input.totalSpent,
        remaining: input.remaining,
        usagePercent: input.usagePercent
      }
    };
  }

  function generateSnapshot(options) {
    const input = options || {};
    const storeState = readState(input.store);
    const period = resolvePeriod(input);
    const currency = resolveCurrency(storeState, input);
    const annualBudget = resolveAnnualBudget(
      storeState,
      input
    );

    const normalizedExpenses = getNormalizedExpenses(
      storeState,
      input
    );

    const expenses = normalizedExpenses.filter(function filterPeriod(expense) {
      if (!expense.date) return Boolean(input.includeUndated);
      return inPeriod(expense.date, period);
    });

    const totalSpent = round(
      expenses.reduce(function sum(total, expense) {
        return total + expense.amount;
      }, 0),
      2
    );

    const totalOriginal = round(
      expenses.reduce(function sum(total, expense) {
        return total + expense.originalAmount;
      }, 0),
      2
    );

    const totalRefunded = round(
      expenses.reduce(function sum(total, expense) {
        return total + expense.refundedAmount;
      }, 0),
      2
    );

    const plannedExpenses = expenses.filter(function planned(expense) {
      return expense.status === "planned";
    });

    const paidExpenses = expenses.filter(function paid(expense) {
      return expense.status === "paid";
    });

    const pendingExpenses = expenses.filter(function pending(expense) {
      return expense.status === "pending";
    });

    const unplannedExpenses = expenses.filter(function unplanned(expense) {
      return !["planned", "pending"].includes(expense.status);
    });

    const remaining = round(
      annualBudget - totalSpent,
      2
    );

    const usagePercent = percentage(
      totalSpent,
      annualBudget,
      1
    );

    const categories = buildCategoryAnalytics(
      expenses,
      totalSpent
    );

    const monthly = buildMonthlyAnalytics(
      expenses,
      period
    );

    const trips = buildTripAnalytics(
      storeState,
      normalizedExpenses,
      currency
    );

    const savings = buildSavingsAnalytics(
      storeState,
      input,
      annualBudget
    );

    const paymentMethods = buildPaymentMethodAnalytics(
      expenses,
      totalSpent
    );

    const daily = buildDailyAnalytics(expenses);
    const anomalies = buildAnomalies(
      expenses,
      categories
    );

    const unplannedAmount = round(
      unplannedExpenses.reduce(function sum(total, expense) {
        return total + expense.amount;
      }, 0),
      2
    );

    const unplannedPercent = percentage(
      unplannedAmount,
      totalSpent,
      1
    );

    const base = {
      generatedAt: new Date().toISOString(),
      version: VERSION,
      currency: currency,
      period: {
        type: period.type,
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString()
      },
      annualBudget: round(annualBudget, 2),
      totalSpent: totalSpent,
      totalOriginal: totalOriginal,
      totalRefunded: totalRefunded,
      remaining: remaining,
      usagePercent: usagePercent,
      expenseCount: expenses.length,
      averageExpense: expenses.length
        ? round(totalSpent / expenses.length, 2)
        : 0,
      medianExpense: median(
        expenses.map(function amount(expense) {
          return expense.amount;
        })
      ),
      largestExpense:
        expenses
          .slice()
          .sort(function descending(a, b) {
            return b.amount - a.amount;
          })[0] || null,
      planned: {
        amount: round(
          plannedExpenses.reduce(function sum(total, expense) {
            return total + expense.amount;
          }, 0),
          2
        ),
        count: plannedExpenses.length
      },
      paid: {
        amount: round(
          paidExpenses.reduce(function sum(total, expense) {
            return total + expense.amount;
          }, 0),
          2
        ),
        count: paidExpenses.length
      },
      pending: {
        amount: round(
          pendingExpenses.reduce(function sum(total, expense) {
            return total + expense.amount;
          }, 0),
          2
        ),
        count: pendingExpenses.length
      },
      unplanned: {
        amount: unplannedAmount,
        percent: unplannedPercent,
        count: unplannedExpenses.length
      },
      categories: categories,
      monthly: monthly,
      daily: daily,
      trips: trips,
      savings: savings,
      paymentMethods: paymentMethods,
      anomalies: anomalies
    };

    const forecast = buildForecast({
      now: input.now,
      period: period,
      annualBudget: annualBudget,
      totalSpent: totalSpent,
      monthly: monthly
    });

    const health = calculateHealthScore({
      annualBudget: annualBudget,
      totalSpent: totalSpent,
      savings: savings,
      trips: trips,
      anomalies: anomalies,
      expenseCount: expenses.length,
      unplannedPercent: unplannedPercent
    });

    const insights = buildInsights({
      currency: currency,
      annualBudget: annualBudget,
      totalSpent: totalSpent,
      usagePercent: usagePercent,
      expenseCount: expenses.length,
      unplannedPercent: unplannedPercent,
      categories: categories,
      trips: trips,
      savings: savings,
      anomalies: anomalies,
      forecast: forecast
    });

    const snapshot = Object.assign(base, {
      forecast: forecast,
      health: health,
      insights: insights
    });

    snapshot.charts = buildChartData(snapshot);

    snapshot.kpis = {
      annualBudget: snapshot.annualBudget,
      spent: snapshot.totalSpent,
      remaining: snapshot.remaining,
      usagePercent: snapshot.usagePercent,
      saved: snapshot.savings.balance,
      savingsCoverage: snapshot.savings.coveragePercent,
      healthScore: snapshot.health.score,
      overBudgetTrips: snapshot.trips.tripsOverBudget,
      anomalyCount: snapshot.anomalies.count,
      projectedSpend: snapshot.forecast.projectedSpend
    };

    return snapshot;
  }

  function comparePeriods(currentOptions, previousOptions) {
    const current = generateSnapshot(currentOptions || {});
    let previousInput = previousOptions;

    if (!previousInput) {
      const currentStart = safeDate(
        current.period.startDate
      );

      const currentEnd = safeDate(
        current.period.endDate
      );

      const duration = Math.max(
        1,
        daysBetween(currentStart, currentEnd) + 1
      );

      const previousEnd = new Date(
        currentStart.getTime() - 1
      );

      const previousStart = new Date(
        previousEnd.getTime() -
        ((duration - 1) * 86400000)
      );

      previousInput = Object.assign(
        {},
        currentOptions || {},
        {
          startDate: previousStart.toISOString(),
          endDate: previousEnd.toISOString()
        }
      );
    }

    const previous = generateSnapshot(previousInput);

    function change(currentValue, previousValue) {
      const currentNumber = toNumber(currentValue, 0);
      const previousNumber = toNumber(previousValue, 0);
      const amount = round(
        currentNumber - previousNumber,
        2
      );

      const percent = previousNumber !== 0
        ? round(
            (amount / Math.abs(previousNumber)) * 100,
            1
          )
        : (currentNumber !== 0 ? 100 : 0);

      return {
        current: currentNumber,
        previous: previousNumber,
        changeAmount: amount,
        changePercent: percent,
        trend:
          Math.abs(percent) < 3
            ? TREND.STABLE
            : percent > 0
              ? TREND.UP
              : TREND.DOWN
      };
    }

    return {
      generatedAt: new Date().toISOString(),
      current: current,
      previous: previous,
      comparison: {
        spending: change(
          current.totalSpent,
          previous.totalSpent
        ),
        remaining: change(
          current.remaining,
          previous.remaining
        ),
        savings: change(
          current.savings.balance,
          previous.savings.balance
        ),
        averageExpense: change(
          current.averageExpense,
          previous.averageExpense
        ),
        expenseCount: change(
          current.expenseCount,
          previous.expenseCount
        ),
        healthScore: change(
          current.health.score,
          previous.health.score
        )
      }
    };
  }

  function getTripReport(tripId, options) {
    const snapshot = generateSnapshot(options || {});
    const id = String(tripId || "");

    const trip = snapshot.trips.items.find(function match(item) {
      return String(item.id) === id;
    });

    if (!trip) return null;

    const storeState = readState(options && options.store);
    const expenses = getNormalizedExpenses(
      storeState,
      options || {}
    ).filter(function matchExpense(expense) {
      return String(expense.tripId || "") === id;
    });

    const total = round(
      expenses.reduce(function sum(value, expense) {
        return value + expense.amount;
      }, 0),
      2
    );

    return {
      generatedAt: new Date().toISOString(),
      currency: trip.currency,
      trip: trip,
      categories: buildCategoryAnalytics(
        expenses,
        total
      ),
      monthly: buildMonthlyAnalytics(
        expenses,
        {
          startDate:
            safeDate(trip.startDate) ||
            startOfYear(new Date()),
          endDate:
            safeDate(trip.endDate) ||
            endOfYear(new Date())
        }
      ),
      daily: buildDailyAnalytics(expenses),
      expenses: expenses.map(function publicExpense(expense) {
        const copy = clone(expense);
        delete copy.source;
        return copy;
      })
    };
  }

  function getCategoryReport(category, options) {
    const key = normalizeCategory(category);
    const storeState = readState(options && options.store);
    const period = resolvePeriod(options || {});
    const currency = resolveCurrency(
      storeState,
      options || {}
    );

    const expenses = getNormalizedExpenses(
      storeState,
      options || {}
    ).filter(function match(expense) {
      return (
        expense.category === key &&
        (
          !expense.date ||
          inPeriod(expense.date, period)
        )
      );
    });

    const total = round(
      expenses.reduce(function sum(value, expense) {
        return value + expense.amount;
      }, 0),
      2
    );

    return {
      generatedAt: new Date().toISOString(),
      category: key,
      labelAr: CATEGORY_LABELS[key].ar,
      labelEn: CATEGORY_LABELS[key].en,
      currency: currency,
      period: {
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString()
      },
      amount: total,
      count: expenses.length,
      averageExpense: expenses.length
        ? round(total / expenses.length, 2)
        : 0,
      largestExpense:
        expenses
          .slice()
          .sort(function descending(a, b) {
            return b.amount - a.amount;
          })[0] || null,
      monthly: buildMonthlyAnalytics(
        expenses,
        period
      ),
      expenses: expenses.map(function publicExpense(expense) {
        const copy = clone(expense);
        delete copy.source;
        return copy;
      })
    };
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

  function notify(snapshot) {
    state.listeners.forEach(function call(listener) {
      try {
        listener(clone(snapshot));
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

      const snapshot = generateSnapshot(nextOptions);

      state.lastOptions = clone(nextOptions);
      state.lastSnapshot = clone(snapshot);

      dispatch(EVENTS.REFRESHED, snapshot);
      dispatch(EVENTS.CHANGED, snapshot);
      notify(snapshot);

      return clone(snapshot);
    } catch (error) {
      reportError(
        "ANALYTICS_REFRESH_FAILED",
        "تعذر تحديث تحليلات الميزانية.",
        "Unable to refresh budget analytics.",
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
      function runRefresh() {
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
      60
    );
  }

  function subscribe(listener, options) {
    if (typeof listener !== "function") {
      throw new TypeError(
        "Budget Analytics subscriber must be a function."
      );
    }

    state.listeners.add(listener);

    if (options && options.immediate !== false) {
      listener(
        clone(
          state.lastSnapshot ||
          generateSnapshot(options || {})
        )
      );
    }

    return function unsubscribe() {
      state.listeners.delete(listener);
    };
  }

  function subscribeToStore(store) {
    if (state.subscribed) {
      return state.unsubscribeStore || function noop() {};
    }

    const source = resolveStore(store);

    if (source && typeof source.subscribe === "function") {
      try {
        const unsubscribe = source.subscribe(function onStoreChange() {
          scheduleRefresh({
            store: source
          });
        });

        if (typeof unsubscribe === "function") {
          state.unsubscribeStore = unsubscribe;
        }

        state.subscribed = true;
      } catch (error) {
        reportError(
          "STORE_SUBSCRIBE_FAILED",
          "تعذر الاشتراك في تحديثات المخزن.",
          "Unable to subscribe to Store updates.",
          { cause: error.message }
        );
      }
    }

    const financeEvents = [
      "store:changed",
      "budget:updated",
      "expense:created",
      "expense:updated",
      "expense:deleted",
      "tic:expenses-changed",
      "tic:expense-created",
      "tic:expense-updated",
      "tic:expense-deleted",
      "tic:expense-refunded",
      "tic:savings-changed",
      "tic:savings-plan-updated",
      "tic:savings-deposit-added",
      "tic:savings-withdrawal-added",
      "tic:savings-entry-updated",
      "tic:savings-entry-deleted",
      "tic:savings-target-created",
      "tic:savings-target-updated",
      "tic:savings-target-deleted"
    ];

    financeEvents.forEach(function bind(eventName) {
      const handler = function onFinanceChange() {
        scheduleRefresh({
          store: source
        });
      };

      global.addEventListener(eventName, handler);

      state.eventBindings.push({
        name: eventName,
        handler: handler
      });
    });

    return function unsubscribeAll() {
      if (typeof state.unsubscribeStore === "function") {
        state.unsubscribeStore();
      }

      state.eventBindings.forEach(function unbind(binding) {
        global.removeEventListener(
          binding.name,
          binding.handler
        );
      });

      state.eventBindings = [];
      state.unsubscribeStore = null;
      state.subscribed = false;
    };
  }

  function initialize(options) {
    if (state.initialized) {
      if (options && options.refresh === true) {
        return refresh(options);
      }

      return clone(
        state.lastSnapshot ||
        generateSnapshot(options || {})
      );
    }

    state.initialized = true;
    state.lastOptions = clone(options || {});

    subscribeToStore(options && options.store);

    const snapshot = refresh(options || {});

    dispatch(EVENTS.READY, {
      version: VERSION,
      engine: ENGINE_NAME,
      generatedAt: new Date().toISOString(),
      snapshot: snapshot
    });

    return snapshot;
  }

  function destroy() {
    if (state.refreshTimer) {
      global.clearTimeout(state.refreshTimer);
      state.refreshTimer = null;
    }

    if (typeof state.unsubscribeStore === "function") {
      state.unsubscribeStore();
    }

    state.eventBindings.forEach(function unbind(binding) {
      global.removeEventListener(
        binding.name,
        binding.handler
      );
    });

    state.eventBindings = [];
    state.unsubscribeStore = null;
    state.subscribed = false;
    state.listeners.clear();
    state.initialized = false;
    state.lastSnapshot = null;
    state.lastOptions = null;

    return true;
  }

  const API = Object.freeze({
    version: VERSION,
    name: ENGINE_NAME,
    events: EVENTS,
    constants: Object.freeze({
      PERIOD: PERIOD,
      HEALTH: HEALTH,
      TREND: TREND,
      DEFAULT_CURRENCY: DEFAULT_CURRENCY,
      DEFAULT_ANNUAL_BUDGET: DEFAULT_ANNUAL_BUDGET,
      DEFAULT_MONTHLY_SAVING: DEFAULT_MONTHLY_SAVING,
      MONTHS_AR: MONTHS_AR,
      MONTHS_EN: MONTHS_EN,
      CATEGORY_LABELS: CATEGORY_LABELS
    }),

    initialize: initialize,
    init: initialize,
    refresh: refresh,
    generate: generateSnapshot,
    getSnapshot: function getSnapshot(options) {
      if (options) return generateSnapshot(options);

      return clone(
        state.lastSnapshot ||
        generateSnapshot(state.lastOptions || {})
      );
    },
    getDashboard: function getDashboard(options) {
      return generateSnapshot(options || {});
    },
    getKPIs: function getKPIs(options) {
      return generateSnapshot(options || {}).kpis;
    },
    getInsights: function getInsights(options) {
      return generateSnapshot(options || {}).insights;
    },
    getCharts: function getCharts(options) {
      return generateSnapshot(options || {}).charts;
    },
    getForecast: function getForecast(options) {
      return generateSnapshot(options || {}).forecast;
    },
    getHealth: function getHealth(options) {
      return generateSnapshot(options || {}).health;
    },
    getTripReport: getTripReport,
    getCategoryReport: getCategoryReport,
    comparePeriods: comparePeriods,
    subscribe: subscribe,
    subscribeToStore: subscribeToStore,
    destroy: destroy,

    utils: Object.freeze({
      asArray: asArray,
      clone: clone,
      toNumber: toNumber,
      toNonNegative: toNonNegative,
      round: round,
      clamp: clamp,
      percentage: percentage,
      average: average,
      median: median,
      standardDeviation: standardDeviation,
      safeDate: safeDate,
      dateKey: dateKey,
      monthKey: monthKey,
      normalizeCurrency: normalizeCurrency,
      normalizeCategory: normalizeCategory,
      resolvePeriod: resolvePeriod
    })
  });

  global.TIC = global.TIC || {};
  global.TIC.Features = global.TIC.Features || {};
  global.TIC.Features.budgetAnalytics = API;
  global.TICBudgetAnalytics = API;

  /*
   * Initialization is intentionally deferred until DOM ready so all
   * preceding engines and the Store have a chance to register first.
   */
  if (global.document && global.document.readyState === "loading") {
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
