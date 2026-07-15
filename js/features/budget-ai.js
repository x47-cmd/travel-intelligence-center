/* =========================================================
   Travel Intelligence Center
   Budget Intelligence Platform
   Budget AI Engine V1.0.0

   File Path:
   js/features/budget-ai.js

   Purpose:
   - Production-ready intelligent decision layer for travel finance.
   - Converts Budget Analytics outputs into prioritized actions.
   - Generates personalized recommendations, saving plans,
     budget scenarios, forecasts, warnings and Arabic answers.
   - Uses deterministic local intelligence with no external API.
   - Reads live data from the central Store and existing engines.
   - Does not render UI and does not own primary persistence.
   - Can optionally save AI preferences and dismissed insights
     through the central Store when supported.

   Dependencies:
   - window.TICBudgetEngine
   - window.TICExpenseEngine
   - window.TICSavingsEngine
   - window.TICBudgetAnalytics
   - window.TICStore / window.Store

   Global:
   - window.TICBudgetAI
   ========================================================= */

(function budgetAIFactory(global) {
  "use strict";

  const VERSION = "1.0.0";
  const ENGINE_NAME = "TICBudgetAI";

  const EVENTS = Object.freeze({
    READY: "tic:budget-ai-ready",
    REFRESHED: "tic:budget-ai-refreshed",
    RECOMMENDATIONS_CHANGED: "tic:budget-ai-recommendations-changed",
    PLAN_CREATED: "tic:budget-ai-plan-created",
    SCENARIO_CREATED: "tic:budget-ai-scenario-created",
    QUESTION_ANSWERED: "tic:budget-ai-question-answered",
    PREFERENCES_CHANGED: "tic:budget-ai-preferences-changed",
    ERROR: "tic:budget-ai-error"
  });

  const PRIORITY = Object.freeze({
    CRITICAL: "critical",
    HIGH: "high",
    MEDIUM: "medium",
    LOW: "low"
  });

  const ACTION_TYPE = Object.freeze({
    PROTECT_BUDGET: "protect-budget",
    REDUCE_SPENDING: "reduce-spending",
    INCREASE_SAVINGS: "increase-savings",
    REVIEW_EXPENSE: "review-expense",
    FUND_TRIP: "fund-trip",
    SET_LIMIT: "set-limit",
    PLAN_PAYMENT: "plan-payment",
    OPTIMIZE_CATEGORY: "optimize-category",
    CELEBRATE: "celebrate",
    SETUP: "setup"
  });

  const INTENT = Object.freeze({
    SUMMARY: "summary",
    REMAINING: "remaining",
    SAVINGS: "savings",
    FORECAST: "forecast",
    REDUCE: "reduce",
    CATEGORY: "category",
    TRIP: "trip",
    HEALTH: "health",
    PLAN: "plan",
    UNKNOWN: "unknown"
  });

  const DEFAULT_PREFERENCES = Object.freeze({
    language: "ar",
    tone: "professional-friendly",
    riskTolerance: "balanced",
    savingAggressiveness: "balanced",
    recommendationLimit: 8,
    hideDismissed: true,
    includePositive: true,
    autoRefresh: true
  });

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
    storeUnsubscribe: null,
    eventBindings: [],
    listeners: new Set(),
    refreshTimer: null,
    lastResult: null,
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

  function normalizeText(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/\s+/g, " ");
  }

  function createId(prefix) {
    return String(prefix || "ai") + "_" +
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

  function addMonths(value, amount) {
    const date = safeDate(value) || new Date();
    date.setMonth(date.getMonth() + toNumber(amount, 0));
    return date;
  }

  function formatMoney(value, currency, language) {
    const amount = round(value, 2);
    const locale = language === "en" ? "en-AE" : "ar-AE";

    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: String(currency || "AED"),
        maximumFractionDigits: 0
      }).format(amount);
    } catch (error) {
      return amount.toLocaleString(locale) + " " + (currency || "AED");
    }
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

  function getAnalyticsEngine() {
    return global.TICBudgetAnalytics || null;
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
        "تعذر قراءة بيانات الذكاء المالي من المخزن.",
        "Unable to read financial intelligence data from the Store.",
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
        "تعذر حفظ تفضيلات الذكاء المالي.",
        "Unable to save financial intelligence preferences.",
        { cause: error.message }
      );
    }

    return false;
  }

  function getAIRoot(storeState) {
    const root = firstDefined(
      storeState && storeState.budgetAI,
      storeState &&
        storeState.budget &&
        storeState.budget.ai,
      storeState &&
        storeState.finance &&
        storeState.finance.budgetAI
    );

    return isObject(root) ? root : {};
  }

  function resolvePreferences(storeState, options) {
    const root = getAIRoot(storeState);
    const stored = isObject(root.preferences) ? root.preferences : {};
    const direct = isObject(options && options.preferences)
      ? options.preferences
      : {};

    return {
      language: ["ar", "en"].includes(
        String(firstDefined(
          direct.language,
          stored.language,
          DEFAULT_PREFERENCES.language
        )).toLowerCase()
      )
        ? String(firstDefined(
            direct.language,
            stored.language,
            DEFAULT_PREFERENCES.language
          )).toLowerCase()
        : DEFAULT_PREFERENCES.language,
      tone: String(firstDefined(
        direct.tone,
        stored.tone,
        DEFAULT_PREFERENCES.tone
      )),
      riskTolerance: String(firstDefined(
        direct.riskTolerance,
        stored.riskTolerance,
        DEFAULT_PREFERENCES.riskTolerance
      )),
      savingAggressiveness: String(firstDefined(
        direct.savingAggressiveness,
        stored.savingAggressiveness,
        DEFAULT_PREFERENCES.savingAggressiveness
      )),
      recommendationLimit: clamp(
        Math.round(toNumber(firstDefined(
          direct.recommendationLimit,
          stored.recommendationLimit,
          DEFAULT_PREFERENCES.recommendationLimit
        ), DEFAULT_PREFERENCES.recommendationLimit)),
        1,
        30
      ),
      hideDismissed: firstDefined(
        direct.hideDismissed,
        stored.hideDismissed,
        DEFAULT_PREFERENCES.hideDismissed
      ) !== false,
      includePositive: firstDefined(
        direct.includePositive,
        stored.includePositive,
        DEFAULT_PREFERENCES.includePositive
      ) !== false,
      autoRefresh: firstDefined(
        direct.autoRefresh,
        stored.autoRefresh,
        DEFAULT_PREFERENCES.autoRefresh
      ) !== false
    };
  }

  function getDismissedIds(storeState) {
    const root = getAIRoot(storeState);

    return new Set(
      asArray(firstDefined(
        root.dismissedRecommendationIds,
        root.dismissed,
        []
      )).map(String)
    );
  }

  function getAnalyticsSnapshot(options) {
    const analytics = getAnalyticsEngine();

    if (analytics) {
      const methods = [
        "getSnapshot",
        "getDashboard",
        "generate"
      ];

      for (let index = 0; index < methods.length; index += 1) {
        const method = methods[index];

        if (typeof analytics[method] === "function") {
          try {
            const result = analytics[method](options || {});
            if (isObject(result)) return result;
          } catch (error) {
            // Continue to fallback.
          }
        }
      }
    }

    const budgetEngine = getBudgetEngine();

    if (budgetEngine) {
      const methods = [
        "getDashboard",
        "analyze",
        "getSummary",
        "getAnnualOverview"
      ];

      for (let index = 0; index < methods.length; index += 1) {
        const method = methods[index];

        if (typeof budgetEngine[method] === "function") {
          try {
            const result = budgetEngine[method](options || {});
            if (isObject(result)) {
              return normalizeFallbackSnapshot(result);
            }
          } catch (error) {
            // Continue to local fallback.
          }
        }
      }
    }

    return buildLocalSnapshot(options || {});
  }

  function normalizeFallbackSnapshot(source) {
    const annualBudget = toNonNegative(firstDefined(
      source.annualBudget,
      source.budget,
      source.totalBudget,
      source.overview && source.overview.budget,
      30000
    ));

    const totalSpent = toNonNegative(firstDefined(
      source.totalSpent,
      source.spent,
      source.overview && source.overview.spent,
      0
    ));

    const remaining = toNumber(firstDefined(
      source.remaining,
      annualBudget - totalSpent
    ), annualBudget - totalSpent);

    return {
      generatedAt: new Date().toISOString(),
      currency: String(firstDefined(
        source.currency,
        source.overview && source.overview.currency,
        "AED"
      )),
      annualBudget: annualBudget,
      totalSpent: totalSpent,
      remaining: remaining,
      usagePercent: percentage(totalSpent, annualBudget, 1),
      expenseCount: toNonNegative(firstDefined(
        source.expenseCount,
        source.count,
        0
      )),
      averageExpense: toNonNegative(source.averageExpense),
      categories: isObject(source.categories)
        ? source.categories
        : { items: [] },
      monthly: isObject(source.monthly)
        ? source.monthly
        : { items: [], averageMonthlySpend: 0 },
      trips: isObject(source.trips)
        ? source.trips
        : { items: [], totalTrips: 0, tripsOverBudget: 0 },
      savings: isObject(source.savings)
        ? source.savings
        : {
            balance: 0,
            monthlySaving: 0,
            coveragePercent: 0,
            remainingToFund: annualBudget
          },
      forecast: isObject(source.forecast)
        ? source.forecast
        : {
            projectedSpend: totalSpent,
            likelyToExceed: totalSpent > annualBudget,
            expectedOverrun: Math.max(0, totalSpent - annualBudget),
            recommendedMonthlyLimit: 0
          },
      health: isObject(source.health)
        ? source.health
        : {
            score: annualBudget > 0
              ? clamp(100 - percentage(totalSpent, annualBudget), 0, 100)
              : 50,
            status: totalSpent > annualBudget ? "critical" : "healthy"
          },
      anomalies: isObject(source.anomalies)
        ? source.anomalies
        : { items: [], count: 0 },
      insights: asArray(source.insights),
      unplanned: isObject(source.unplanned)
        ? source.unplanned
        : { amount: 0, percent: 0, count: 0 }
    };
  }

  function buildLocalSnapshot(options) {
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

    const expenses = asArray(firstDefined(
      storeState.expenses,
      budgetRoot.expenses,
      storeState.finance && storeState.finance.expenses,
      []
    )).filter(function active(expense) {
      return expense && expense.isDeleted !== true &&
        expense.deletedAt == null &&
        String(expense.status || "").toLowerCase() !== "cancelled";
    });

    const totalSpent = round(
      expenses.reduce(function sum(total, expense) {
        const amount = toNonNegative(firstDefined(
          expense.amount,
          expense.total,
          expense.value,
          0
        ));

        const refund = toNonNegative(firstDefined(
          expense.refundAmount,
          expense.refundedAmount,
          0
        ));

        return total + Math.max(0, amount - refund);
      }, 0),
      2
    );

    const savingsRoot = isObject(storeState.savings)
      ? storeState.savings
      : {};

    const balance = toNonNegative(firstDefined(
      savingsRoot.balance,
      savingsRoot.currentBalance,
      0
    ));

    const monthlySaving = toNonNegative(firstDefined(
      savingsRoot.monthlySaving,
      settings.monthlySaving,
      profile.monthlySaving,
      1500
    ));

    return normalizeFallbackSnapshot({
      currency: firstDefined(
        budgetRoot.currency,
        settings.currency,
        profile.currency,
        "AED"
      ),
      annualBudget: annualBudget,
      totalSpent: totalSpent,
      expenseCount: expenses.length,
      savings: {
        balance: balance,
        monthlySaving: monthlySaving,
        coveragePercent: percentage(balance, annualBudget, 1),
        remainingToFund: Math.max(0, annualBudget - balance)
      }
    });
  }

  function priorityWeight(priority) {
    const weights = {
      critical: 400,
      high: 300,
      medium: 200,
      low: 100
    };

    return weights[priority] || 0;
  }

  function makeRecommendation(input) {
    const data = isObject(input) ? input : {};
    const impactAmount = round(toNonNegative(data.impactAmount), 2);
    const confidence = clamp(
      toNumber(data.confidence, 75),
      0,
      100
    );

    return {
      id: String(data.id || createId("recommendation")),
      type: String(data.type || ACTION_TYPE.SETUP),
      priority: String(data.priority || PRIORITY.MEDIUM),
      score: round(
        priorityWeight(data.priority) +
        confidence +
        Math.min(99, impactAmount / 100),
        1
      ),
      titleAr: String(data.titleAr || ""),
      titleEn: String(data.titleEn || ""),
      messageAr: String(data.messageAr || ""),
      messageEn: String(data.messageEn || ""),
      actionLabelAr: String(data.actionLabelAr || "مراجعة"),
      actionLabelEn: String(data.actionLabelEn || "Review"),
      action: isObject(data.action) ? clone(data.action) : null,
      impactAmount: impactAmount,
      impactPercent: round(toNonNegative(data.impactPercent), 1),
      confidence: confidence,
      reasonCodes: asArray(data.reasonCodes).map(String),
      tripId: data.tripId == null ? null : String(data.tripId),
      category: data.category == null ? null : String(data.category),
      expiresAt: data.expiresAt || null,
      generatedAt: new Date().toISOString()
    };
  }

  function generateRecommendations(snapshot, preferences, storeState) {
    const recommendations = [];
    const currency = snapshot.currency || "AED";
    const annualBudget = toNonNegative(snapshot.annualBudget);
    const totalSpent = toNonNegative(snapshot.totalSpent);
    const remaining = toNumber(snapshot.remaining, annualBudget - totalSpent);
    const usage = toNonNegative(snapshot.usagePercent);
    const forecast = isObject(snapshot.forecast) ? snapshot.forecast : {};
    const savings = isObject(snapshot.savings) ? snapshot.savings : {};
    const trips = isObject(snapshot.trips) ? snapshot.trips : { items: [] };
    const categories = isObject(snapshot.categories)
      ? snapshot.categories
      : { items: [] };
    const anomalies = isObject(snapshot.anomalies)
      ? snapshot.anomalies
      : { items: [] };
    const unplanned = isObject(snapshot.unplanned)
      ? snapshot.unplanned
      : { percent: 0 };

    function add(item) {
      recommendations.push(makeRecommendation(item));
    }

    if (annualBudget <= 0) {
      add({
        id: "ai_set_annual_budget",
        type: ACTION_TYPE.SETUP,
        priority: PRIORITY.CRITICAL,
        titleAr: "حدد ميزانية السفر السنوية",
        titleEn: "Set an annual travel budget",
        messageAr:
          "الذكاء المالي يحتاج ميزانية سنوية واضحة حتى يحسب الحدود والتوقعات بدقة.",
        messageEn:
          "Financial intelligence needs a clear annual budget for accurate limits and forecasts.",
        actionLabelAr: "تحديد الميزانية",
        actionLabelEn: "Set budget",
        action: {
          name: "open-budget-settings",
          payload: { field: "annualBudget" }
        },
        confidence: 100,
        reasonCodes: ["ANNUAL_BUDGET_MISSING"]
      });
    }

    if (remaining < 0 || usage > 100) {
      const overrun = Math.abs(Math.min(remaining, 0));

      add({
        id: "ai_annual_budget_exceeded",
        type: ACTION_TYPE.PROTECT_BUDGET,
        priority: PRIORITY.CRITICAL,
        titleAr: "أوقف المصروفات الاختيارية مؤقتاً",
        titleEn: "Pause optional spending temporarily",
        messageAr:
          "تم تجاوز الميزانية السنوية بمقدار " +
          formatMoney(overrun, currency, "ar") +
          ". راجع التسوق والأنشطة والمصروفات غير الضرورية أولاً.",
        messageEn:
          "The annual budget was exceeded by " +
          formatMoney(overrun, currency, "en") +
          ". Review shopping, activities and optional expenses first.",
        actionLabelAr: "فتح خطة التصحيح",
        actionLabelEn: "Open recovery plan",
        action: {
          name: "create-recovery-plan",
          payload: { overrun: overrun }
        },
        impactAmount: overrun,
        impactPercent: usage - 100,
        confidence: 98,
        reasonCodes: ["ANNUAL_OVER_BUDGET"]
      });
    } else if (usage >= 85) {
      const safeReserve = round(annualBudget * 0.10, 2);
      const spendable = Math.max(0, remaining - safeReserve);

      add({
        id: "ai_protect_remaining_budget",
        type: ACTION_TYPE.PROTECT_BUDGET,
        priority: PRIORITY.HIGH,
        titleAr: "احمِ المبلغ المتبقي من الميزانية",
        titleEn: "Protect the remaining budget",
        messageAr:
          "استخدمت " + usage +
          "% من الميزانية. احتفظ باحتياطي " +
          formatMoney(safeReserve, currency, "ar") +
          " ولا تتجاوز مصروفات جديدة بقيمة " +
          formatMoney(spendable, currency, "ar") + ".",
        messageEn:
          "You used " + usage +
          "% of the budget. Keep a reserve of " +
          formatMoney(safeReserve, currency, "en") +
          " and limit new spending to " +
          formatMoney(spendable, currency, "en") + ".",
        actionLabelAr: "تطبيق حد آمن",
        actionLabelEn: "Apply safe limit",
        action: {
          name: "set-safe-spending-limit",
          payload: {
            reserve: safeReserve,
            limit: spendable
          }
        },
        impactAmount: safeReserve,
        confidence: 94,
        reasonCodes: ["ANNUAL_USAGE_HIGH"]
      });
    }

    if (forecast.likelyToExceed) {
      const expectedOverrun = toNonNegative(
        forecast.expectedOverrun
      );

      const monthsRemaining = Math.max(
        1,
        Math.round(toNumber(
          forecast.monthsRemaining,
          1
        ))
      );

      const requiredMonthlyReduction = round(
        expectedOverrun / monthsRemaining,
        2
      );

      add({
        id: "ai_forecast_overrun",
        type: ACTION_TYPE.REDUCE_SPENDING,
        priority: PRIORITY.HIGH,
        titleAr: "خفّض معدل الإنفاق الشهري",
        titleEn: "Reduce the monthly spending rate",
        messageAr:
          "المسار الحالي قد يتجاوز الميزانية بنحو " +
          formatMoney(expectedOverrun, currency, "ar") +
          ". خفّض الإنفاق الشهري بمقدار " +
          formatMoney(requiredMonthlyReduction, currency, "ar") +
          " تقريباً.",
        messageEn:
          "The current trend may exceed the budget by about " +
          formatMoney(expectedOverrun, currency, "en") +
          ". Reduce monthly spending by approximately " +
          formatMoney(requiredMonthlyReduction, currency, "en") + ".",
        actionLabelAr: "إنشاء خطة خفض",
        actionLabelEn: "Create reduction plan",
        action: {
          name: "create-spending-reduction-plan",
          payload: {
            expectedOverrun: expectedOverrun,
            monthlyReduction: requiredMonthlyReduction
          }
        },
        impactAmount: expectedOverrun,
        confidence: 91,
        reasonCodes: ["FORECAST_OVERRUN"]
      });
    }

    const monthlyLimit = toNonNegative(
      forecast.recommendedMonthlyLimit
    );

    if (monthlyLimit > 0) {
      add({
        id: "ai_monthly_safe_limit",
        type: ACTION_TYPE.SET_LIMIT,
        priority: usage >= 75
          ? PRIORITY.HIGH
          : PRIORITY.MEDIUM,
        titleAr: "حد الإنفاق الشهري المقترح",
        titleEn: "Recommended monthly spending limit",
        messageAr:
          "للبقاء داخل الميزانية، اجعل الحد الشهري القادم قريباً من " +
          formatMoney(monthlyLimit, currency, "ar") + ".",
        messageEn:
          "To remain within budget, keep the next monthly limit near " +
          formatMoney(monthlyLimit, currency, "en") + ".",
        actionLabelAr: "اعتماد الحد",
        actionLabelEn: "Use this limit",
        action: {
          name: "set-monthly-budget-limit",
          payload: { amount: monthlyLimit }
        },
        impactAmount: monthlyLimit,
        confidence: 88,
        reasonCodes: ["MONTHLY_LIMIT_AVAILABLE"]
      });
    }

    const savingsBalance = toNonNegative(savings.balance);
    const savingsCoverage = toNonNegative(
      savings.coveragePercent
    );
    const monthlySaving = toNonNegative(
      savings.monthlySaving
    );
    const remainingToFund = toNonNegative(
      savings.remainingToFund
    );

    if (annualBudget > 0 && savingsCoverage < 100) {
      let recommendedSaving = monthlySaving;

      if (preferences.savingAggressiveness === "high") {
        recommendedSaving = Math.max(
          monthlySaving,
          round(annualBudget / 8, 2)
        );
      } else if (
        preferences.savingAggressiveness === "conservative"
      ) {
        recommendedSaving = Math.max(
          monthlySaving,
          round(annualBudget / 18, 2)
        );
      } else {
        recommendedSaving = Math.max(
          monthlySaving,
          round(annualBudget / 12, 2)
        );
      }

      const months = recommendedSaving > 0
        ? Math.ceil(remainingToFund / recommendedSaving)
        : null;

      add({
        id: "ai_savings_gap",
        type: ACTION_TYPE.INCREASE_SAVINGS,
        priority: savingsCoverage < 35
          ? PRIORITY.HIGH
          : PRIORITY.MEDIUM,
        titleAr: "عزز تغطية صندوق السفر",
        titleEn: "Strengthen the travel fund",
        messageAr:
          "الادخار الحالي يغطي " + savingsCoverage +
          "% من الميزانية. ادخار " +
          formatMoney(recommendedSaving, currency, "ar") +
          " شهرياً قد يغطي الفجوة خلال " +
          (months === null ? "مدة غير محددة" : months + " شهر") + ".",
        messageEn:
          "Current savings cover " + savingsCoverage +
          "% of the budget. Saving " +
          formatMoney(recommendedSaving, currency, "en") +
          " monthly may close the gap in " +
          (months === null ? "an undefined period" : months + " month(s)") + ".",
        actionLabelAr: "اعتماد خطة الادخار",
        actionLabelEn: "Use savings plan",
        action: {
          name: "set-savings-plan",
          payload: {
            monthlySaving: recommendedSaving,
            remainingToFund: remainingToFund,
            estimatedMonths: months
          }
        },
        impactAmount: remainingToFund,
        confidence: 90,
        reasonCodes: ["SAVINGS_COVERAGE_GAP"]
      });
    }

    asArray(trips.items).forEach(function tripRecommendation(trip) {
      const planned = toNonNegative(trip.planned);
      const spent = toNonNegative(trip.spent);
      const tripUsage = toNonNegative(trip.usagePercent);
      const tripTitle = String(trip.title || "الرحلة");

      if (planned <= 0) {
        add({
          id: "ai_trip_budget_missing_" + String(trip.id),
          type: ACTION_TYPE.SETUP,
          priority: PRIORITY.MEDIUM,
          titleAr: "حدد ميزانية " + tripTitle,
          titleEn: "Set a budget for " + tripTitle,
          messageAr:
            "الرحلة مرتبطة بالمصروفات لكن لا توجد لها ميزانية واضحة.",
          messageEn:
            "The trip has linked expenses but no clear planned budget.",
          actionLabelAr: "تحديد ميزانية الرحلة",
          actionLabelEn: "Set trip budget",
          action: {
            name: "edit-trip-budget",
            payload: { tripId: trip.id }
          },
          tripId: trip.id,
          confidence: 96,
          reasonCodes: ["TRIP_BUDGET_MISSING"]
        });
      } else if (spent > planned) {
        const overrun = round(spent - planned, 2);

        add({
          id: "ai_trip_over_budget_" + String(trip.id),
          type: ACTION_TYPE.PROTECT_BUDGET,
          priority: PRIORITY.CRITICAL,
          titleAr: tripTitle + " تجاوزت الميزانية",
          titleEn: tripTitle + " exceeded its budget",
          messageAr:
            "التجاوز الحالي " +
            formatMoney(overrun, currency, "ar") +
            ". راجع أكبر فئة إنفاق ومصروفات الرحلة غير المؤكدة.",
          messageEn:
            "The current overrun is " +
            formatMoney(overrun, currency, "en") +
            ". Review the largest category and unconfirmed trip expenses.",
          actionLabelAr: "تحليل الرحلة",
          actionLabelEn: "Analyze trip",
          action: {
            name: "open-trip-finance",
            payload: { tripId: trip.id }
          },
          tripId: trip.id,
          impactAmount: overrun,
          impactPercent: tripUsage - 100,
          confidence: 98,
          reasonCodes: ["TRIP_OVER_BUDGET"]
        });
      } else if (tripUsage >= 85) {
        add({
          id: "ai_trip_near_limit_" + String(trip.id),
          type: ACTION_TYPE.SET_LIMIT,
          priority: PRIORITY.HIGH,
          titleAr: tripTitle + " تقترب من الحد",
          titleEn: tripTitle + " is near its limit",
          messageAr:
            "المتبقي للرحلة " +
            formatMoney(Math.max(0, planned - spent), currency, "ar") +
            " فقط. أوقف الإضافات غير المحجوزة قبل اعتمادها.",
          messageEn:
            "Only " +
            formatMoney(Math.max(0, planned - spent), currency, "en") +
            " remains. Pause unbooked additions before confirming them.",
          actionLabelAr: "فتح مصروفات الرحلة",
          actionLabelEn: "Open trip expenses",
          action: {
            name: "open-trip-expenses",
            payload: { tripId: trip.id }
          },
          tripId: trip.id,
          impactAmount: Math.max(0, planned - spent),
          confidence: 94,
          reasonCodes: ["TRIP_NEAR_LIMIT"]
        });
      }
    });

    const categoryItems = asArray(categories.items)
      .filter(function active(category) {
        return toNonNegative(category.amount) > 0;
      });

    if (categoryItems.length) {
      const dominant = categoryItems[0];
      const share = toNonNegative(dominant.sharePercent);
      const amount = toNonNegative(dominant.amount);
      const targetReductionPercent =
        share >= 60 ? 12 : share >= 45 ? 8 : 5;
      const savingOpportunity = round(
        amount * (targetReductionPercent / 100),
        2
      );

      if (share >= 40) {
        const labels = CATEGORY_LABELS[dominant.key] || {
          ar: dominant.labelAr || dominant.key,
          en: dominant.labelEn || dominant.key
        };

        add({
          id: "ai_optimize_category_" + dominant.key,
          type: ACTION_TYPE.OPTIMIZE_CATEGORY,
          priority: share >= 60
            ? PRIORITY.HIGH
            : PRIORITY.MEDIUM,
          titleAr: "راجع إنفاق " + labels.ar,
          titleEn: "Review " + labels.en + " spending",
          messageAr:
            "تمثل هذه الفئة " + share +
            "% من الإنفاق. خفضها " +
            targetReductionPercent + "% قد يوفر " +
            formatMoney(savingOpportunity, currency, "ar") + ".",
          messageEn:
            "This category represents " + share +
            "% of spending. Reducing it by " +
            targetReductionPercent + "% may save " +
            formatMoney(savingOpportunity, currency, "en") + ".",
          actionLabelAr: "عرض تفاصيل الفئة",
          actionLabelEn: "View category details",
          action: {
            name: "open-category-analysis",
            payload: { category: dominant.key }
          },
          category: dominant.key,
          impactAmount: savingOpportunity,
          impactPercent: targetReductionPercent,
          confidence: 84,
          reasonCodes: ["CATEGORY_CONCENTRATION"]
        });
      }
    }

    asArray(anomalies.items)
      .slice(0, 3)
      .forEach(function anomalyRecommendation(anomaly) {
        add({
          id: "ai_review_anomaly_" + String(anomaly.id),
          type: ACTION_TYPE.REVIEW_EXPENSE,
          priority: anomaly.severity === "high"
            ? PRIORITY.HIGH
            : PRIORITY.MEDIUM,
          titleAr: "راجع مصروفاً غير اعتيادي",
          titleEn: "Review an unusual expense",
          messageAr:
            String(anomaly.title || "مصروف") +
            " بقيمة " +
            formatMoney(anomaly.amount, currency, "ar") +
            " أعلى من النمط المعتاد.",
          messageEn:
            String(anomaly.title || "Expense") +
            " at " +
            formatMoney(anomaly.amount, currency, "en") +
            " is above the usual pattern.",
          actionLabelAr: "مراجعة المصروف",
          actionLabelEn: "Review expense",
          action: {
            name: "open-expense",
            payload: { expenseId: anomaly.id }
          },
          impactAmount: anomaly.amount,
          confidence: 86,
          reasonCodes: ["EXPENSE_ANOMALY"]
        });
      });

    if (toNonNegative(unplanned.percent) >= 25) {
      const amount = toNonNegative(unplanned.amount);

      add({
        id: "ai_control_unplanned",
        type: ACTION_TYPE.REDUCE_SPENDING,
        priority: toNonNegative(unplanned.percent) >= 40
          ? PRIORITY.HIGH
          : PRIORITY.MEDIUM,
        titleAr: "قلل المصروفات غير المخططة",
        titleEn: "Reduce unplanned expenses",
        messageAr:
          "تشكل المصروفات غير المخططة " +
          toNonNegative(unplanned.percent) +
          "% من الإنفاق. ضع حداً مستقلاً لها قبل الرحلة.",
        messageEn:
          "Unplanned expenses represent " +
          toNonNegative(unplanned.percent) +
          "% of spending. Set a separate allowance before the trip.",
        actionLabelAr: "إنشاء حد للطوارئ",
        actionLabelEn: "Create contingency limit",
        action: {
          name: "set-contingency-budget",
          payload: {
            suggestedAmount: round(
              Math.max(annualBudget * 0.05, amount * 0.25),
              2
            )
          }
        },
        impactAmount: round(amount * 0.25, 2),
        confidence: 83,
        reasonCodes: ["UNPLANNED_SPENDING_HIGH"]
      });
    }

    if (
      preferences.includePositive &&
      toNumber(snapshot.health && snapshot.health.score, 0) >= 85 &&
      usage < 80 &&
      !forecast.likelyToExceed
    ) {
      add({
        id: "ai_budget_healthy",
        type: ACTION_TYPE.CELEBRATE,
        priority: PRIORITY.LOW,
        titleAr: "إدارة ميزانيتك ممتازة",
        titleEn: "Your budget management is excellent",
        messageAr:
          "الوضع المالي مستقر، والتوقع الحالي لا يشير إلى تجاوز الميزانية. استمر على نفس معدل الإنفاق والادخار.",
        messageEn:
          "Finances are stable and the current forecast does not indicate an overrun. Maintain the current spending and saving pace.",
        actionLabelAr: "عرض التقرير",
        actionLabelEn: "View report",
        action: {
          name: "open-budget-report",
          payload: {}
        },
        confidence: 95,
        reasonCodes: ["HEALTHY_FINANCIAL_POSITION"]
      });
    }

    const dismissed = getDismissedIds(storeState);

    return recommendations
      .filter(function dismissedFilter(item) {
        return !preferences.hideDismissed ||
          !dismissed.has(item.id);
      })
      .sort(function recommendationSort(a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return b.impactAmount - a.impactAmount;
      })
      .slice(0, preferences.recommendationLimit);
  }

  function createMonthlyPlan(options) {
    const input = isObject(options) ? options : {};
    const storeState = readState(input.store);
    const preferences = resolvePreferences(storeState, input);
    const snapshot = getAnalyticsSnapshot(input);
    const currency = snapshot.currency || "AED";

    const annualBudget = toNonNegative(snapshot.annualBudget);
    const totalSpent = toNonNegative(snapshot.totalSpent);
    const remaining = Math.max(
      0,
      toNumber(snapshot.remaining, annualBudget - totalSpent)
    );

    const forecast = isObject(snapshot.forecast)
      ? snapshot.forecast
      : {};

    const savings = isObject(snapshot.savings)
      ? snapshot.savings
      : {};

    const monthsRemaining = Math.max(
      1,
      Math.round(toNumber(
        input.months ||
        forecast.monthsRemaining,
        12 - new Date().getMonth()
      ))
    );

    const safeReservePercent = preferences.riskTolerance === "conservative"
      ? 0.15
      : preferences.riskTolerance === "aggressive"
        ? 0.05
        : 0.10;

    const reserve = round(
      Math.min(remaining, annualBudget * safeReservePercent),
      2
    );

    const spendableRemaining = Math.max(
      0,
      remaining - reserve
    );

    const monthlySpendingLimit = round(
      spendableRemaining / monthsRemaining,
      2
    );

    const savingsGap = toNonNegative(
      savings.remainingToFund
    );

    let monthlySaving = toNonNegative(
      savings.monthlySaving
    );

    if (monthlySaving <= 0) {
      monthlySaving = round(
        savingsGap / Math.max(1, monthsRemaining),
        2
      );
    }

    if (preferences.savingAggressiveness === "high") {
      monthlySaving = round(monthlySaving * 1.25, 2);
    } else if (
      preferences.savingAggressiveness === "conservative"
    ) {
      monthlySaving = round(monthlySaving * 0.85, 2);
    }

    const categories = asArray(
      snapshot.categories && snapshot.categories.items
    );

    const categoryLimits = categories.map(function categoryLimit(category) {
      const share = toNonNegative(category.sharePercent);
      const base = monthlySpendingLimit * (share / 100);

      let adjustment = 1;

      if (share >= 50) adjustment = 0.88;
      else if (share >= 35) adjustment = 0.93;

      return {
        key: category.key,
        labelAr: category.labelAr ||
          (CATEGORY_LABELS[category.key] || {}).ar ||
          category.key,
        labelEn: category.labelEn ||
          (CATEGORY_LABELS[category.key] || {}).en ||
          category.key,
        currentSharePercent: share,
        suggestedMonthlyLimit: round(base * adjustment, 2),
        reductionPercent: round((1 - adjustment) * 100, 1)
      };
    });

    const plan = {
      id: createId("budget_plan"),
      generatedAt: new Date().toISOString(),
      currency: currency,
      periodMonths: monthsRemaining,
      annualBudget: annualBudget,
      spentToDate: totalSpent,
      remaining: remaining,
      reserve: reserve,
      spendableRemaining: spendableRemaining,
      monthlySpendingLimit: monthlySpendingLimit,
      monthlySavingTarget: monthlySaving,
      expectedSavingsAdded: round(
        monthlySaving * monthsRemaining,
        2
      ),
      categoryLimits: categoryLimits,
      rules: [
        {
          id: "rule-reserve",
          titleAr: "لا تستخدم الاحتياطي إلا للطوارئ",
          titleEn: "Use the reserve only for emergencies",
          amount: reserve
        },
        {
          id: "rule-monthly-limit",
          titleAr: "لا تتجاوز الحد الشهري",
          titleEn: "Do not exceed the monthly limit",
          amount: monthlySpendingLimit
        },
        {
          id: "rule-save-first",
          titleAr: "حوّل الادخار في بداية الشهر",
          titleEn: "Transfer savings at the start of the month",
          amount: monthlySaving
        }
      ],
      summaryAr:
        "الخطة تقسم المتبقي إلى حد شهري قدره " +
        formatMoney(monthlySpendingLimit, currency, "ar") +
        " مع احتياطي " +
        formatMoney(reserve, currency, "ar") +
        " وادخار شهري " +
        formatMoney(monthlySaving, currency, "ar") + ".",
      summaryEn:
        "The plan sets a monthly limit of " +
        formatMoney(monthlySpendingLimit, currency, "en") +
        ", a reserve of " +
        formatMoney(reserve, currency, "en") +
        " and monthly savings of " +
        formatMoney(monthlySaving, currency, "en") + "."
    };

    dispatch(EVENTS.PLAN_CREATED, plan);
    return plan;
  }

  function simulateScenario(input, options) {
    const data = isObject(input) ? input : {};
    const opts = isObject(options) ? options : {};
    const snapshot = getAnalyticsSnapshot(opts);
    const currency = snapshot.currency || "AED";

    const annualBudget = toNonNegative(firstDefined(
      data.annualBudget,
      snapshot.annualBudget
    ));

    const currentSpent = toNonNegative(snapshot.totalSpent);
    const extraExpense = toNonNegative(data.extraExpense);
    const expenseReduction = toNonNegative(data.expenseReduction);
    const monthlySavingChange = toNumber(
      data.monthlySavingChange,
      0
    );
    const months = Math.max(
      1,
      Math.round(toNumber(data.months, 12))
    );

    const currentSavings = toNonNegative(
      snapshot.savings && snapshot.savings.balance
    );

    const currentMonthlySaving = toNonNegative(
      snapshot.savings && snapshot.savings.monthlySaving
    );

    const projectedSpent = round(
      Math.max(
        0,
        currentSpent + extraExpense - expenseReduction
      ),
      2
    );

    const projectedRemaining = round(
      annualBudget - projectedSpent,
      2
    );

    const projectedMonthlySaving = round(
      Math.max(
        0,
        currentMonthlySaving + monthlySavingChange
      ),
      2
    );

    const projectedSavings = round(
      currentSavings +
      (projectedMonthlySaving * months),
      2
    );

    const currentForecastSpend = toNonNegative(
      snapshot.forecast &&
      snapshot.forecast.projectedSpend,
      currentSpent
    );

    const scenarioForecastSpend = round(
      Math.max(
        0,
        currentForecastSpend +
        extraExpense -
        expenseReduction
      ),
      2
    );

    const result = {
      id: createId("budget_scenario"),
      generatedAt: new Date().toISOString(),
      name: String(data.name || "Budget scenario"),
      currency: currency,
      inputs: {
        annualBudget: annualBudget,
        extraExpense: extraExpense,
        expenseReduction: expenseReduction,
        monthlySavingChange: monthlySavingChange,
        months: months
      },
      baseline: {
        spent: currentSpent,
        remaining: toNumber(snapshot.remaining),
        savings: currentSavings,
        monthlySaving: currentMonthlySaving,
        forecastSpend: currentForecastSpend
      },
      scenario: {
        spent: projectedSpent,
        remaining: projectedRemaining,
        usagePercent: percentage(
          projectedSpent,
          annualBudget,
          1
        ),
        savings: projectedSavings,
        monthlySaving: projectedMonthlySaving,
        savingsCoveragePercent: percentage(
          projectedSavings,
          annualBudget,
          1
        ),
        forecastSpend: scenarioForecastSpend,
        forecastOverrun: round(
          Math.max(0, scenarioForecastSpend - annualBudget),
          2
        ),
        withinBudget: scenarioForecastSpend <= annualBudget
      },
      difference: {
        spending: round(projectedSpent - currentSpent, 2),
        remaining: round(
          projectedRemaining -
          toNumber(snapshot.remaining),
          2
        ),
        savings: round(projectedSavings - currentSavings, 2),
        forecast: round(
          scenarioForecastSpend - currentForecastSpend,
          2
        )
      }
    };

    result.verdict = result.scenario.withinBudget
      ? {
          status: "positive",
          titleAr: "السيناريو يبقيك داخل الميزانية",
          titleEn: "The scenario keeps you within budget",
          messageAr:
            "المتبقي المتوقع " +
            formatMoney(
              Math.max(0, result.scenario.remaining),
              currency,
              "ar"
            ) +
            " وتغطية الادخار " +
            result.scenario.savingsCoveragePercent + "%.",
          messageEn:
            "Expected remaining amount is " +
            formatMoney(
              Math.max(0, result.scenario.remaining),
              currency,
              "en"
            ) +
            " and savings coverage is " +
            result.scenario.savingsCoveragePercent + "%."
        }
      : {
          status: "warning",
          titleAr: "السيناريو قد يتجاوز الميزانية",
          titleEn: "The scenario may exceed the budget",
          messageAr:
            "التجاوز المتوقع " +
            formatMoney(
              result.scenario.forecastOverrun,
              currency,
              "ar"
            ) + ".",
          messageEn:
            "The expected overrun is " +
            formatMoney(
              result.scenario.forecastOverrun,
              currency,
              "en"
            ) + "."
        };

    dispatch(EVENTS.SCENARIO_CREATED, result);
    return result;
  }

  function createRecoveryPlan(options) {
    const input = isObject(options) ? options : {};
    const snapshot = getAnalyticsSnapshot(input);
    const currency = snapshot.currency || "AED";
    const annualBudget = toNonNegative(snapshot.annualBudget);

    const overrun = Math.max(
      toNonNegative(input.overrun),
      Math.max(
        0,
        toNonNegative(snapshot.totalSpent) - annualBudget
      ),
      toNonNegative(
        snapshot.forecast &&
        snapshot.forecast.expectedOverrun
      )
    );

    const months = Math.max(
      1,
      Math.round(toNumber(
        snapshot.forecast &&
        snapshot.forecast.monthsRemaining,
        input.months || 3
      ))
    );

    const categories = asArray(
      snapshot.categories &&
      snapshot.categories.items
    ).filter(function positive(item) {
      return toNonNegative(item.amount) > 0;
    });

    const reducibleKeys = new Set([
      "shopping",
      "activities",
      "food",
      "transport",
      "other"
    ]);

    const candidates = categories.filter(function reducible(item) {
      return reducibleKeys.has(String(item.key));
    });

    const totalCandidateAmount = candidates.reduce(
      function sum(total, item) {
        return total + toNonNegative(item.amount);
      },
      0
    );

    const target = overrun > 0
      ? overrun
      : round(annualBudget * 0.05, 2);

    const actions = candidates.map(function recoveryAction(item) {
      const share = totalCandidateAmount > 0
        ? toNonNegative(item.amount) / totalCandidateAmount
        : 0;

      const reduction = round(target * share, 2);

      return {
        category: item.key,
        labelAr: item.labelAr ||
          (CATEGORY_LABELS[item.key] || {}).ar ||
          item.key,
        labelEn: item.labelEn ||
          (CATEGORY_LABELS[item.key] || {}).en ||
          item.key,
        currentAmount: toNonNegative(item.amount),
        targetReduction: Math.min(
          toNonNegative(item.amount),
          reduction
        ),
        suggestedPercent: percentage(
          Math.min(toNonNegative(item.amount), reduction),
          toNonNegative(item.amount),
          1
        )
      };
    });

    const recovered = round(
      actions.reduce(function sum(total, action) {
        return total + action.targetReduction;
      }, 0),
      2
    );

    return {
      id: createId("recovery_plan"),
      generatedAt: new Date().toISOString(),
      currency: currency,
      targetRecovery: target,
      monthlyRecoveryTarget: round(target / months, 2),
      periodMonths: months,
      actions: actions,
      expectedRecovery: recovered,
      remainingGap: round(Math.max(0, target - recovered), 2),
      summaryAr:
        "استهدف استرداد " +
        formatMoney(target, currency, "ar") +
        " خلال " + months +
        " شهر، بمعدل " +
        formatMoney(target / months, currency, "ar") +
        " شهرياً.",
      summaryEn:
        "Target a recovery of " +
        formatMoney(target, currency, "en") +
        " over " + months +
        " month(s), at " +
        formatMoney(target / months, currency, "en") +
        " per month."
    };
  }

  function detectIntent(question) {
    const text = normalizeText(question);

    const rules = [
      {
        intent: INTENT.REMAINING,
        words: ["كم باقي", "المتبقي", "باقي من الميزانيه", "remaining"]
      },
      {
        intent: INTENT.SAVINGS,
        words: ["ادخار", "اوفر", "توفير", "صندوق السفر", "saving"]
      },
      {
        intent: INTENT.FORECAST,
        words: ["توقع", "بتجاوز", "راح اتجاوز", "forecast", "projection"]
      },
      {
        intent: INTENT.REDUCE,
        words: ["اخفض", "اقلّل", "اقلل", "اوفر من المصروف", "reduce", "cut"]
      },
      {
        intent: INTENT.CATEGORY,
        words: ["فئه", "فئة", "اكثر شي صرفت", "وين صرفت", "category"]
      },
      {
        intent: INTENT.TRIP,
        words: ["رحله", "رحلة", "trip"]
      },
      {
        intent: INTENT.HEALTH,
        words: ["صحتي الماليه", "وضعي المالي", "تقييمي", "health", "score"]
      },
      {
        intent: INTENT.PLAN,
        words: ["خطه", "خطة", "وزع الميزانيه", "plan"]
      },
      {
        intent: INTENT.SUMMARY,
        words: ["ملخص", "كيف الميزانيه", "كيف وضعي", "summary"]
      }
    ];

    for (let index = 0; index < rules.length; index += 1) {
      const rule = rules[index];

      if (rule.words.some(function includes(word) {
        return text.includes(normalizeText(word));
      })) {
        return rule.intent;
      }
    }

    return INTENT.UNKNOWN;
  }

  function answerQuestion(question, options) {
    const input = isObject(options) ? options : {};
    const storeState = readState(input.store);
    const preferences = resolvePreferences(storeState, input);
    const snapshot = getAnalyticsSnapshot(input);
    const intent = detectIntent(question);
    const currency = snapshot.currency || "AED";
    const language = preferences.language;
    const recommendations = generateRecommendations(
      snapshot,
      preferences,
      storeState
    );

    let answerAr = "";
    let answerEn = "";
    let data = {};

    if (intent === INTENT.REMAINING) {
      const remaining = toNumber(snapshot.remaining);

      answerAr = remaining >= 0
        ? "المتبقي من ميزانية السفر هو " +
          formatMoney(remaining, currency, "ar") +
          " بعد إنفاق " +
          formatMoney(snapshot.totalSpent, currency, "ar") + "."
        : "تم تجاوز الميزانية بمقدار " +
          formatMoney(Math.abs(remaining), currency, "ar") + ".";

      answerEn = remaining >= 0
        ? "The remaining travel budget is " +
          formatMoney(remaining, currency, "en") +
          " after spending " +
          formatMoney(snapshot.totalSpent, currency, "en") + "."
        : "The budget has been exceeded by " +
          formatMoney(Math.abs(remaining), currency, "en") + ".";

      data = {
        remaining: remaining,
        spent: snapshot.totalSpent,
        annualBudget: snapshot.annualBudget
      };
    } else if (intent === INTENT.SAVINGS) {
      const savings = snapshot.savings || {};

      answerAr =
        "رصيد الادخار الحالي " +
        formatMoney(savings.balance, currency, "ar") +
        " ويغطي " +
        toNonNegative(savings.coveragePercent) +
        "% من الميزانية. الادخار الشهري الحالي " +
        formatMoney(savings.monthlySaving, currency, "ar") + ".";

      answerEn =
        "Current savings are " +
        formatMoney(savings.balance, currency, "en") +
        " and cover " +
        toNonNegative(savings.coveragePercent) +
        "% of the budget. Current monthly savings are " +
        formatMoney(savings.monthlySaving, currency, "en") + ".";

      data = clone(savings);
    } else if (intent === INTENT.FORECAST) {
      const forecast = snapshot.forecast || {};

      answerAr = forecast.likelyToExceed
        ? "نعم، المسار الحالي قد يتجاوز الميزانية بنحو " +
          formatMoney(forecast.expectedOverrun, currency, "ar") +
          ". الحد الشهري المقترح " +
          formatMoney(
            forecast.recommendedMonthlyLimit,
            currency,
            "ar"
          ) + "."
        : "التوقع الحالي يبقيك داخل الميزانية. الإنفاق المتوقع " +
          formatMoney(
            forecast.projectedSpend,
            currency,
            "ar"
          ) + ".";

      answerEn = forecast.likelyToExceed
        ? "Yes. The current trend may exceed the budget by about " +
          formatMoney(forecast.expectedOverrun, currency, "en") +
          ". The recommended monthly limit is " +
          formatMoney(
            forecast.recommendedMonthlyLimit,
            currency,
            "en"
          ) + "."
        : "The current forecast remains within budget. Projected spending is " +
          formatMoney(
            forecast.projectedSpend,
            currency,
            "en"
          ) + ".";

      data = clone(forecast);
    } else if (intent === INTENT.REDUCE) {
      const reductionItems = recommendations.filter(function reduction(item) {
        return [
          ACTION_TYPE.REDUCE_SPENDING,
          ACTION_TYPE.OPTIMIZE_CATEGORY,
          ACTION_TYPE.REVIEW_EXPENSE
        ].includes(item.type);
      });

      const opportunity = reductionItems.reduce(
        function sum(total, item) {
          return total + toNonNegative(item.impactAmount);
        },
        0
      );

      answerAr =
        "أهم فرص الخفض الحالية قد توفر تقريباً " +
        formatMoney(opportunity, currency, "ar") +
        ". ابدأ بأعلى فئة إنفاق والمصروفات غير المخططة.";

      answerEn =
        "The main reduction opportunities may save approximately " +
        formatMoney(opportunity, currency, "en") +
        ". Start with the highest spending category and unplanned expenses.";

      data = {
        opportunity: round(opportunity, 2),
        recommendations: reductionItems
      };
    } else if (intent === INTENT.CATEGORY) {
      const category =
        snapshot.categories &&
        snapshot.categories.highestCategory;

      if (category) {
        answerAr =
          "أعلى فئة إنفاق هي " +
          (category.labelAr || category.key) +
          " بقيمة " +
          formatMoney(category.amount, currency, "ar") +
          " وتمثل " + category.sharePercent +
          "% من الإجمالي.";

        answerEn =
          "The highest spending category is " +
          (category.labelEn || category.key) +
          " at " +
          formatMoney(category.amount, currency, "en") +
          ", representing " + category.sharePercent +
          "% of total spending.";

        data = clone(category);
      } else {
        answerAr = "لا توجد مصروفات كافية لتحليل الفئات حالياً.";
        answerEn = "There is not enough spending data to analyze categories.";
      }
    } else if (intent === INTENT.TRIP) {
      const tripItems = asArray(
        snapshot.trips && snapshot.trips.items
      );

      const risky = tripItems
        .slice()
        .sort(function sortRisk(a, b) {
          return toNonNegative(b.usagePercent) -
            toNonNegative(a.usagePercent);
        })[0];

      if (risky) {
        answerAr =
          "أعلى رحلة من ناحية استخدام الميزانية هي " +
          risky.title + " بنسبة " +
          toNonNegative(risky.usagePercent) +
          "%، والمتبقي " +
          formatMoney(
            Math.max(0, toNumber(risky.remaining)),
            currency,
            "ar"
          ) + ".";

        answerEn =
          "The trip with the highest budget usage is " +
          risky.title + " at " +
          toNonNegative(risky.usagePercent) +
          "%, with " +
          formatMoney(
            Math.max(0, toNumber(risky.remaining)),
            currency,
            "en"
          ) + " remaining.";

        data = clone(risky);
      } else {
        answerAr = "لا توجد رحلات مرتبطة ببيانات الميزانية حالياً.";
        answerEn = "There are no trips linked to budget data yet.";
      }
    } else if (intent === INTENT.HEALTH) {
      const health = snapshot.health || {};

      answerAr =
        "درجة الصحة المالية للسفر " +
        toNumber(health.score, 0) +
        " من 100، والحالة الحالية " +
        String(health.status || "غير محددة") + ".";

      answerEn =
        "The travel financial health score is " +
        toNumber(health.score, 0) +
        " out of 100, with a current status of " +
        String(health.status || "unknown") + ".";

      data = clone(health);
    } else if (intent === INTENT.PLAN) {
      const plan = createMonthlyPlan(input);
      answerAr = plan.summaryAr;
      answerEn = plan.summaryEn;
      data = plan;
    } else {
      const top = recommendations[0];

      answerAr =
        "ميزانيتك السنوية " +
        formatMoney(snapshot.annualBudget, currency, "ar") +
        "، أنفقت " +
        formatMoney(snapshot.totalSpent, currency, "ar") +
        " والمتبقي " +
        formatMoney(snapshot.remaining, currency, "ar") +
        ". " +
        (top ? top.messageAr : "الوضع مستقر حالياً.");

      answerEn =
        "Your annual budget is " +
        formatMoney(snapshot.annualBudget, currency, "en") +
        ", you spent " +
        formatMoney(snapshot.totalSpent, currency, "en") +
        " and have " +
        formatMoney(snapshot.remaining, currency, "en") +
        " remaining. " +
        (top ? top.messageEn : "The current position is stable.");

      data = {
        kpis: {
          annualBudget: snapshot.annualBudget,
          spent: snapshot.totalSpent,
          remaining: snapshot.remaining,
          healthScore:
            snapshot.health && snapshot.health.score
        },
        topRecommendation: top || null
      };
    }

    const result = {
      id: createId("ai_answer"),
      generatedAt: new Date().toISOString(),
      question: String(question || ""),
      intent: intent,
      language: language,
      answer: language === "en" ? answerEn : answerAr,
      answerAr: answerAr,
      answerEn: answerEn,
      data: data,
      suggestedActions: recommendations.slice(0, 3).map(
        function suggested(item) {
          return {
            id: item.id,
            labelAr: item.actionLabelAr,
            labelEn: item.actionLabelEn,
            action: clone(item.action)
          };
        }
      )
    };

    dispatch(EVENTS.QUESTION_ANSWERED, result);
    return result;
  }

  function generateDashboard(options) {
    const input = isObject(options) ? options : {};
    const storeState = readState(input.store);
    const preferences = resolvePreferences(storeState, input);
    const snapshot = getAnalyticsSnapshot(input);

    const recommendations = generateRecommendations(
      snapshot,
      preferences,
      storeState
    );

    const totalOpportunity = round(
      recommendations.reduce(function sum(total, item) {
        if ([
          ACTION_TYPE.REDUCE_SPENDING,
          ACTION_TYPE.OPTIMIZE_CATEGORY,
          ACTION_TYPE.PROTECT_BUDGET,
          ACTION_TYPE.REVIEW_EXPENSE
        ].includes(item.type)) {
          return total + toNonNegative(item.impactAmount);
        }

        return total;
      }, 0),
      2
    );

    const criticalCount = recommendations.filter(
      function critical(item) {
        return item.priority === PRIORITY.CRITICAL;
      }
    ).length;

    const highCount = recommendations.filter(
      function high(item) {
        return item.priority === PRIORITY.HIGH;
      }
    ).length;

    const currency = snapshot.currency || "AED";

    const result = {
      generatedAt: new Date().toISOString(),
      version: VERSION,
      engine: ENGINE_NAME,
      preferences: preferences,
      snapshot: snapshot,
      recommendations: recommendations,
      summary: {
        recommendationCount: recommendations.length,
        criticalCount: criticalCount,
        highCount: highCount,
        totalOpportunity: totalOpportunity,
        healthScore: toNumber(
          snapshot.health && snapshot.health.score,
          0
        ),
        likelyToExceed: Boolean(
          snapshot.forecast &&
          snapshot.forecast.likelyToExceed
        )
      },
      hero: {
        status:
          criticalCount > 0
            ? "critical"
            : highCount > 0
              ? "warning"
              : "healthy",
        titleAr:
          criticalCount > 0
            ? "تحتاج ميزانيتك إلى إجراء الآن"
            : highCount > 0
              ? "لديك فرص لتحسين الميزانية"
              : "ميزانيتك تحت السيطرة",
        titleEn:
          criticalCount > 0
            ? "Your budget needs action now"
            : highCount > 0
              ? "There are opportunities to improve your budget"
              : "Your budget is under control",
        messageAr:
          recommendations[0]
            ? recommendations[0].messageAr
            : "لا توجد مخاطر مالية واضحة حالياً.",
        messageEn:
          recommendations[0]
            ? recommendations[0].messageEn
            : "No clear financial risks are currently detected.",
        opportunityAr:
          totalOpportunity > 0
            ? "فرصة التحسين المقدرة " +
              formatMoney(totalOpportunity, currency, "ar")
            : "",
        opportunityEn:
          totalOpportunity > 0
            ? "Estimated improvement opportunity " +
              formatMoney(totalOpportunity, currency, "en")
            : ""
      },
      quickQuestions: [
        {
          id: "remaining",
          labelAr: "كم باقي من ميزانيتي؟",
          labelEn: "How much budget remains?"
        },
        {
          id: "forecast",
          labelAr: "هل بتجاوز الميزانية؟",
          labelEn: "Will I exceed the budget?"
        },
        {
          id: "reduce",
          labelAr: "وين أقدر أوفر؟",
          labelEn: "Where can I save?"
        },
        {
          id: "plan",
          labelAr: "سوّ لي خطة شهرية",
          labelEn: "Create a monthly plan"
        }
      ]
    };

    return result;
  }

  function savePreferences(preferences, options) {
    const input = isObject(options) ? options : {};
    const storeState = readState(input.store);
    const currentRoot = getAIRoot(storeState);
    const resolved = resolvePreferences(
      storeState,
      { preferences: preferences }
    );

    const nextState = clone(storeState);
    nextState.budgetAI = Object.assign({}, currentRoot, {
      preferences: resolved,
      updatedAt: new Date().toISOString()
    });

    if (isObject(nextState.budget)) {
      nextState.budget.ai = clone(nextState.budgetAI);
    }

    if (isObject(nextState.finance)) {
      nextState.finance.budgetAI = clone(nextState.budgetAI);
    }

    const saved = writeState(nextState, input.store);

    const result = {
      saved: saved,
      preferences: resolved,
      updatedAt: new Date().toISOString()
    };

    dispatch(EVENTS.PREFERENCES_CHANGED, result);
    scheduleRefresh(input);

    return result;
  }

  function dismissRecommendation(id, options) {
    const input = isObject(options) ? options : {};
    const storeState = readState(input.store);
    const root = getAIRoot(storeState);
    const dismissed = new Set(
      asArray(firstDefined(
        root.dismissedRecommendationIds,
        root.dismissed,
        []
      )).map(String)
    );

    dismissed.add(String(id));

    const nextState = clone(storeState);
    nextState.budgetAI = Object.assign({}, root, {
      dismissedRecommendationIds: Array.from(dismissed),
      updatedAt: new Date().toISOString()
    });

    if (isObject(nextState.budget)) {
      nextState.budget.ai = clone(nextState.budgetAI);
    }

    writeState(nextState, input.store);
    scheduleRefresh(input);

    return {
      id: String(id),
      dismissed: true,
      dismissedRecommendationIds: Array.from(dismissed)
    };
  }

  function restoreRecommendation(id, options) {
    const input = isObject(options) ? options : {};
    const storeState = readState(input.store);
    const root = getAIRoot(storeState);
    const dismissed = new Set(
      asArray(firstDefined(
        root.dismissedRecommendationIds,
        root.dismissed,
        []
      )).map(String)
    );

    dismissed.delete(String(id));

    const nextState = clone(storeState);
    nextState.budgetAI = Object.assign({}, root, {
      dismissedRecommendationIds: Array.from(dismissed),
      updatedAt: new Date().toISOString()
    });

    if (isObject(nextState.budget)) {
      nextState.budget.ai = clone(nextState.budgetAI);
    }

    writeState(nextState, input.store);
    scheduleRefresh(input);

    return {
      id: String(id),
      dismissed: false,
      dismissedRecommendationIds: Array.from(dismissed)
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

  function notify(result) {
    state.listeners.forEach(function notifyListener(listener) {
      try {
        listener(clone(result));
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

      const result = generateDashboard(nextOptions);

      state.lastOptions = clone(nextOptions);
      state.lastResult = clone(result);

      dispatch(EVENTS.REFRESHED, result);
      dispatch(
        EVENTS.RECOMMENDATIONS_CHANGED,
        {
          recommendations: result.recommendations,
          summary: result.summary,
          generatedAt: result.generatedAt
        }
      );

      notify(result);
      return clone(result);
    } catch (error) {
      reportError(
        "AI_REFRESH_FAILED",
        "تعذر تحديث الذكاء المالي.",
        "Unable to refresh budget intelligence.",
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
          const storeState = readState(options && options.store);
          const preferences = resolvePreferences(
            storeState,
            options || {}
          );

          if (preferences.autoRefresh) {
            refresh(options || state.lastOptions || {});
          }
        } catch (error) {
          console.error(
            "[" + ENGINE_NAME + "] Scheduled refresh failed.",
            error
          );
        }
      },
      80
    );
  }

  function subscribe(listener, options) {
    if (typeof listener !== "function") {
      throw new TypeError(
        "Budget AI subscriber must be a function."
      );
    }

    state.listeners.add(listener);

    if (!options || options.immediate !== false) {
      listener(
        clone(
          state.lastResult ||
          generateDashboard(options || {})
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

    if (source && typeof source.subscribe === "function") {
      try {
        const unsubscribe = source.subscribe(function onStoreChange() {
          scheduleRefresh({ store: source });
        });

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
      "tic:budget-analytics-refreshed",
      "tic:budget-analytics-changed",
      "tic:expenses-changed",
      "tic:expense-created",
      "tic:expense-updated",
      "tic:expense-deleted",
      "tic:expense-refunded",
      "tic:savings-changed",
      "tic:savings-plan-updated",
      "tic:savings-deposit-added",
      "tic:savings-withdrawal-added",
      "tic:savings-target-created",
      "tic:savings-target-updated",
      "store:changed"
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
      if (typeof state.storeUnsubscribe === "function") {
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
        state.lastResult ||
        generateDashboard(options || {})
      );
    }

    state.initialized = true;
    state.lastOptions = clone(options || {});

    subscribeToSources(options && options.store);
    const result = refresh(options || {});

    dispatch(EVENTS.READY, {
      version: VERSION,
      engine: ENGINE_NAME,
      generatedAt: new Date().toISOString(),
      result: result
    });

    return result;
  }

  function destroy() {
    if (state.refreshTimer) {
      global.clearTimeout(state.refreshTimer);
      state.refreshTimer = null;
    }

    if (typeof state.storeUnsubscribe === "function") {
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
    state.lastResult = null;
    state.lastOptions = null;

    return true;
  }

  const API = Object.freeze({
    version: VERSION,
    name: ENGINE_NAME,
    events: EVENTS,
    constants: Object.freeze({
      PRIORITY: PRIORITY,
      ACTION_TYPE: ACTION_TYPE,
      INTENT: INTENT,
      DEFAULT_PREFERENCES: DEFAULT_PREFERENCES,
      CATEGORY_LABELS: CATEGORY_LABELS
    }),

    initialize: initialize,
    init: initialize,
    refresh: refresh,
    generateDashboard: generateDashboard,
    getDashboard: function getDashboard(options) {
      return generateDashboard(options || {});
    },
    getRecommendations: function getRecommendations(options) {
      const input = isObject(options) ? options : {};
      const storeState = readState(input.store);
      const preferences = resolvePreferences(
        storeState,
        input
      );
      const snapshot = getAnalyticsSnapshot(input);

      return generateRecommendations(
        snapshot,
        preferences,
        storeState
      );
    },
    getTopRecommendation: function getTopRecommendation(options) {
      return API.getRecommendations(options || {})[0] || null;
    },
    getSnapshot: getAnalyticsSnapshot,
    getPreferences: function getPreferences(options) {
      const input = isObject(options) ? options : {};
      return resolvePreferences(
        readState(input.store),
        input
      );
    },
    savePreferences: savePreferences,
    dismissRecommendation: dismissRecommendation,
    restoreRecommendation: restoreRecommendation,
    createMonthlyPlan: createMonthlyPlan,
    createRecoveryPlan: createRecoveryPlan,
    simulateScenario: simulateScenario,
    answerQuestion: answerQuestion,
    ask: answerQuestion,
    detectIntent: detectIntent,
    subscribe: subscribe,
    subscribeToSources: subscribeToSources,
    destroy: destroy,

    utils: Object.freeze({
      isObject: isObject,
      asArray: asArray,
      clone: clone,
      toNumber: toNumber,
      toNonNegative: toNonNegative,
      round: round,
      clamp: clamp,
      percentage: percentage,
      normalizeText: normalizeText,
      safeDate: safeDate,
      addMonths: addMonths,
      formatMoney: formatMoney,
      createId: createId
    })
  });

  global.TIC = global.TIC || {};
  global.TIC.Features = global.TIC.Features || {};
  global.TIC.Features.budgetAI = API;
  global.TICBudgetAI = API;

  /*
   * Initialization is deferred until DOM ready so the Store and the
   * four preceding Budget Intelligence engines can register first.
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
