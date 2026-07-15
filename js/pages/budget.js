/* =========================================================
   Travel Intelligence Center
   Budget Intelligence Platform Page V3.0.0

   File Path:
   js/pages/budget.js

   Purpose:
   - Production-ready Budget Intelligence Platform page.
   - Preserves the stable page lifecycle, Router registration,
     Store subscription and UI action architecture.
   - Connects the page with all Budget Intelligence engines.
   - Provides annual overview, smart KPIs, trip budgets,
     savings, expenses, payments, alerts, AI recommendations,
     notifications, exports and system health.
   - Supports safe fallbacks when one or more engines are absent.
   - Mobile-first and optimized for iPhone layouts.

   Dependencies:
   - js/config.js
   - js/store.js
   - js/router.js
   - js/ui.js
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

   Global APIs:
   - window.TIC.Pages.budget
   - window.TICBudgetPage
========================================================= */

(function budgetPageFactory(window, document) {
  "use strict";

  const Config = window.TICConfig || window.TIC?.Config || {};
  const PAGE_ID = "budget";
  const PAGE_VERSION = "3.0.0";

  const VIEW = Object.freeze({
    OVERVIEW: "overview",
    EXPENSES: "expenses",
    SAVINGS: "savings",
    PAYMENTS: "payments",
    ALERTS: "alerts",
    AI: "ai"
  });

  const state = {
    initialized: false,
    mounted: false,
    container: null,
    unsubscribeStore: null,
    engineUnsubscribers: [],
    actionUnsubscribers: [],
    eventBindings: [],
    subscribers: new Set(),
    lastSnapshot: null,
    activeView: VIEW.OVERVIEW,
    activeTripId: null,
    refreshTimer: null,
    rendering: false
  };

  /* =========================================================
     Generic utilities
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

  const escapeHTML = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const number = (value, fallback = 0) => {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
  };

  const array = (value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      return Object.values(value);
    }
    return [];
  };

  const object = (value) =>
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? value
      : {};

  const firstDefined = (...values) => {
    for (const value of values) {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        return value;
      }
    }

    return undefined;
  };

  const clamp = (value, min, max) =>
    Math.min(
      max,
      Math.max(min, number(value, min))
    );

  const percent = (part, total) =>
    total > 0
      ? Math.round(
          (number(part) / number(total)) * 100
        )
      : 0;

  const safeDate = (value) => {
    if (!value) return null;

    const date = value instanceof Date
      ? new Date(value.getTime())
      : new Date(value);

    return Number.isNaN(date.getTime())
      ? null
      : date;
  };

  const formatDate = (value) => {
    const date = safeDate(value);

    if (!date) return "غير محدد";

    try {
      return new Intl.DateTimeFormat("ar-AE", {
        year: "numeric",
        month: "short",
        day: "numeric"
      }).format(date);
    } catch (error) {
      return date.toISOString().slice(0, 10);
    }
  };

  const formatMoney = (value, currency = "AED") => {
    const ui = getUI();

    if (ui && typeof ui.currency === "function") {
      try {
        return ui.currency(
          number(value),
          currency
        );
      } catch (error) {
        // Continue to Intl fallback.
      }
    }

    try {
      return new Intl.NumberFormat("ar-AE", {
        style: "currency",
        currency: String(currency || "AED"),
        maximumFractionDigits: 0
      }).format(number(value));
    } catch (error) {
      return `${Math.round(number(value)).toLocaleString("ar-AE")} ${currency}`;
    }
  };

  const toneFromUsage = (usage) => {
    if (usage > 100) return "danger";
    if (usage >= 85) return "warning";
    if (usage >= 65) return "info";
    return "success";
  };

  const statusLabel = (status) => {
    const labels = {
      planned: "مخططة",
      pending: "معلقة",
      partial: "مدفوعة جزئياً",
      paid: "مدفوعة",
      overdue: "متأخرة",
      refunded: "مسترجعة",
      cancelled: "ملغاة",
      active: "نشط",
      acknowledged: "تمت المراجعة",
      snoozed: "مؤجل",
      resolved: "تم الحل",
      dismissed: "مخفي"
    };

    return labels[String(status || "").toLowerCase()] ||
      String(status || "غير محدد");
  };

  const severityTone = (severity) => {
    const normalized = String(
      severity || ""
    ).toLowerCase();

    if (normalized === "critical") return "danger";
    if (normalized === "high") return "warning";
    if (normalized === "medium") return "info";
    if (normalized === "low") return "success";
    return "neutral";
  };

  /* =========================================================
     Core services and engines
  ========================================================= */

  const getStore = () =>
    window.TIC?.Store ||
    window.TICStore ||
    window.Store ||
    null;

  const getRouter = () =>
    window.TIC?.Router ||
    window.TICRouter ||
    null;

  const getUI = () =>
    window.TIC?.UI ||
    window.TICUI ||
    null;

  const getEngines = () => ({
    budget:
      window.TICBudgetEngine ||
      window.TIC?.Features?.budgetEngine ||
      null,
    expense:
      window.TICExpenseEngine ||
      window.TIC?.Features?.expenseEngine ||
      null,
    savings:
      window.TICSavingsEngine ||
      window.TIC?.Features?.savingsEngine ||
      null,
    analytics:
      window.TICBudgetAnalytics ||
      window.TIC?.Features?.budgetAnalytics ||
      null,
    ai:
      window.TICBudgetAI ||
      window.TIC?.Features?.budgetAI ||
      null,
    payments:
      window.TICPaymentTracker ||
      window.TIC?.Features?.paymentTracker ||
      null,
    alerts:
      window.TICExpenseAlertEngine ||
      window.TIC?.Features?.expenseAlertEngine ||
      null,
    export:
      window.TICBudgetExportEngine ||
      window.TIC?.Features?.budgetExportEngine ||
      null,
    notifications:
      window.TICBudgetNotificationEngine ||
      window.TIC?.Features?.budgetNotificationEngine ||
      null,
    integration:
      window.TICBudgetIntegrationEngine ||
      window.TIC?.Features?.budgetIntegrationEngine ||
      null
  });

  const resolveContainer = (container) => {
    if (container instanceof window.Element) {
      return container;
    }

    if (typeof container === "string") {
      return document.querySelector(container);
    }

    return (
      document.querySelector("[data-router-view]") ||
      document.querySelector("#app-view") ||
      document.querySelector("#tic-page") ||
      document.querySelector("#app-content")
    );
  };

  const callEngine = (
    engine,
    methods,
    args = []
  ) => {
    if (!engine) return null;

    for (const method of methods) {
      if (typeof engine[method] !== "function") {
        continue;
      }

      try {
        return engine[method](...args);
      } catch (error) {
        console.warn(
          `TIC Budget Page: ${method} failed.`,
          error
        );
      }
    }

    return null;
  };

  /* =========================================================
     Events and lifecycle helpers
  ========================================================= */

  const emit = (type, detail = {}) => {
    const payload = {
      type,
      page: PAGE_ID,
      timestamp: new Date().toISOString(),
      ...clone(detail)
    };

    state.subscribers.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error(
          "TIC Budget subscriber error:",
          error
        );
      }
    });

    window.dispatchEvent(
      new CustomEvent(
        `tic:page:${PAGE_ID}:${type}`,
        { detail: payload }
      )
    );

    return payload;
  };

  const scheduleRefresh = (delay = 70) => {
    if (!state.mounted) return;

    if (state.refreshTimer) {
      window.clearTimeout(state.refreshTimer);
    }

    state.refreshTimer = window.setTimeout(
      () => {
        state.refreshTimer = null;
        refresh();
      },
      delay
    );
  };

  /* =========================================================
     Store and fallback data
  ========================================================= */

  const getStoreState = () => {
    const store = getStore();

    if (!store) return {};

    try {
      if (typeof store.getState === "function") {
        return clone(store.getState()) || {};
      }

      if (typeof store.get === "function") {
        const result = store.get();

        if (
          result &&
          typeof result === "object"
        ) {
          return clone(result);
        }

        return {
          profile: store.get("profile"),
          trips: store.get("trips"),
          budgets: store.get("budgets"),
          savings: store.get("savings"),
          expenses: store.get("expenses"),
          payments: store.get("payments")
        };
      }

      if (store.state) return clone(store.state);
      if (store.data) return clone(store.data);
    } catch (error) {
      console.warn(
        "TIC Budget Page: Store read failed.",
        error
      );
    }

    return {};
  };

  const buildFallbackAnalytics = (raw) => {
    const profile = object(raw.profile);
    const settings = object(raw.settings);
    const budgetRoot = object(raw.budget);

    const trips = array(
      firstDefined(
        raw.trips,
        raw.travel?.trips,
        []
      )
    );

    const expenses = array(
      firstDefined(
        raw.expenses,
        budgetRoot.expenses,
        raw.finance?.expenses,
        []
      )
    ).filter(
      (expense) =>
        expense &&
        !expense.deletedAt &&
        expense.isDeleted !== true &&
        String(expense.status || "")
          .toLowerCase() !== "cancelled"
    );

    const annualBudget = number(
      firstDefined(
        budgetRoot.annualBudget,
        settings.annualTravelBudget,
        profile.annualTravelBudget,
        Config.profile?.annualTravelBudget,
        30000
      )
    );

    const totalSpent = expenses.length
      ? expenses.reduce(
          (total, expense) =>
            total +
            number(
              firstDefined(
                expense.amount,
                expense.total,
                expense.value,
                0
              )
            ),
          0
        )
      : trips.reduce(
          (total, trip) =>
            total + number(trip.spent),
          0
        );

    const totalTripBudget = trips.reduce(
      (total, trip) =>
        total +
        number(
          firstDefined(
            trip.budget,
            trip.plannedBudget,
            trip.estimatedBudget,
            0
          )
        ),
      0
    );

    const savingsRoot = firstDefined(
      raw.savings,
      raw.finance?.savings,
      {}
    );

    let savingsBalance = 0;
    let monthlySaving = number(
      firstDefined(
        object(savingsRoot).monthlySaving,
        settings.monthlySaving,
        profile.monthlySaving,
        Config.profile?.monthlySaving,
        1500
      )
    );

    if (Array.isArray(savingsRoot)) {
      savingsBalance = savingsRoot.reduce(
        (total, item) =>
          total +
          number(
            typeof item === "number"
              ? item
              : item.amount
          ),
        0
      );
    } else {
      savingsBalance = number(
        firstDefined(
          savingsRoot.balance,
          savingsRoot.currentBalance,
          0
        )
      );
    }

    const remaining = annualBudget - totalSpent;
    const usagePercent = percent(
      totalSpent,
      annualBudget
    );

    const tripItems = trips.map(
      (trip, index) => {
        const planned = number(
          firstDefined(
            trip.budget,
            trip.plannedBudget,
            trip.estimatedBudget,
            0
          )
        );

        const spent = number(
          firstDefined(
            trip.spent,
            0
          )
        );

        return {
          id: String(
            firstDefined(
              trip.id,
              trip._id,
              `trip_${index}`
            )
          ),
          title: String(
            firstDefined(
              trip.title,
              trip.name,
              trip.destination,
              "رحلة"
            )
          ),
          destination: String(
            firstDefined(
              trip.destination,
              trip.city,
              trip.country,
              ""
            )
          ),
          startDate: firstDefined(
            trip.startDate,
            trip.departureDate,
            null
          ),
          endDate: firstDefined(
            trip.endDate,
            trip.returnDate,
            null
          ),
          planned,
          spent,
          remaining: planned - spent,
          usagePercent: percent(
            spent,
            planned
          ),
          statusHealth:
            planned <= 0
              ? "not-set"
              : spent > planned
                ? "over"
                : spent / planned >= 0.85
                  ? "warning"
                  : "healthy"
        };
      }
    );

    const paymentItems = array(
      firstDefined(
        raw.payments,
        budgetRoot.payments,
        raw.finance?.payments,
        []
      )
    );

    return {
      currency: firstDefined(
        budgetRoot.currency,
        settings.currency,
        profile.currency,
        "AED"
      ),
      annualBudget,
      totalSpent,
      totalTripBudget,
      remaining,
      usagePercent,
      expenseCount: expenses.length,
      averageExpense:
        expenses.length > 0
          ? totalSpent / expenses.length
          : 0,
      trips: {
        items: tripItems,
        totalTrips: tripItems.length,
        tripsWithBudget:
          tripItems.filter(
            (trip) => trip.planned > 0
          ).length,
        tripsOverBudget:
          tripItems.filter(
            (trip) =>
              trip.planned > 0 &&
              trip.spent > trip.planned
          ).length,
        totalPlanned: totalTripBudget,
        totalSpent
      },
      savings: {
        balance: savingsBalance,
        monthlySaving,
        annualTarget: annualBudget,
        coveragePercent: percent(
          savingsBalance,
          annualBudget
        ),
        remainingToFund: Math.max(
          0,
          annualBudget - savingsBalance
        )
      },
      payments: paymentItems,
      categories: { items: [] },
      monthly: { items: [] },
      daily: { items: [] },
      forecast: {
        projectedSpend: totalSpent,
        expectedOverrun: Math.max(
          0,
          totalSpent - annualBudget
        ),
        likelyToExceed:
          totalSpent > annualBudget,
        recommendedMonthlyLimit: 0
      },
      health: {
        score:
          annualBudget > 0
            ? clamp(
                100 - usagePercent,
                0,
                100
              )
            : 50,
        status:
          usagePercent > 100
            ? "critical"
            : usagePercent >= 85
              ? "warning"
              : "healthy"
      },
      insights: [],
      charts: {}
    };
  };

  /* =========================================================
     Snapshot builder
  ========================================================= */

  const buildSnapshot = () => {
    const raw = getStoreState();
    const engines = getEngines();

    const unified = callEngine(
      engines.integration,
      [
        "getUnifiedDashboard",
        "getDashboard"
      ],
      [{ store: getStore() }]
    );

    const analytics =
      object(
        unified?.analytics ||
        callEngine(
          engines.analytics,
          [
            "getDashboard",
            "getSnapshot",
            "generate"
          ],
          [{ store: getStore() }]
        )
      );

    const fallback = buildFallbackAnalytics(raw);

    const mergedAnalytics = {
      ...fallback,
      ...analytics,
      trips: {
        ...fallback.trips,
        ...object(analytics.trips)
      },
      savings: {
        ...fallback.savings,
        ...object(analytics.savings)
      },
      forecast: {
        ...fallback.forecast,
        ...object(analytics.forecast)
      },
      health: {
        ...fallback.health,
        ...object(analytics.health)
      },
      categories: {
        ...fallback.categories,
        ...object(analytics.categories)
      },
      monthly: {
        ...fallback.monthly,
        ...object(analytics.monthly)
      }
    };

    const ai = object(
      unified?.ai ||
      callEngine(
        engines.ai,
        [
          "getDashboard",
          "generateDashboard"
        ],
        [{ store: getStore() }]
      )
    );

    const payments = object(
      unified?.payments ||
      callEngine(
        engines.payments,
        [
          "getDashboard",
          "buildDashboard"
        ],
        [{ store: getStore() }]
      )
    );

    const alerts = object(
      unified?.alerts ||
      callEngine(
        engines.alerts,
        [
          "getDashboard",
          "buildDashboard"
        ],
        [{ store: getStore() }]
      )
    );

    const notifications = object(
      unified?.notifications ||
      callEngine(
        engines.notifications,
        [
          "getDashboard",
          "buildDashboard"
        ],
        [{ store: getStore() }]
      )
    );

    const health = object(
      callEngine(
        engines.integration,
        ["getHealth"],
        []
      )
    );

    const expenseList = array(
      callEngine(
        engines.expense,
        [
          "listExpenses",
          "getExpenses",
          "getAll",
          "list"
        ],
        [{ store: getStore() }]
      )
    );

    const expenses = expenseList.length
      ? expenseList
      : array(
          firstDefined(
            raw.expenses,
            raw.budget?.expenses,
            raw.finance?.expenses,
            []
          )
        );

    const snapshot = {
      raw,
      engines,
      unified,
      analytics: mergedAnalytics,
      ai,
      payments,
      alerts,
      notifications,
      integrationHealth: health,
      profile: object(raw.profile),
      expenses,
      currency: firstDefined(
        mergedAnalytics.currency,
        raw.settings?.currency,
        raw.profile?.currency,
        "AED"
      ),
      generatedAt: new Date().toISOString()
    };

    state.lastSnapshot = snapshot;
    return snapshot;
  };

  /* =========================================================
     UI primitives
  ========================================================= */

  const renderBadge = (text, tone = "neutral") => {
    const ui = getUI();

    if (ui && typeof ui.badge === "function") {
      return ui.badge(text, tone);
    }

    return `
      <span class="tic-chip tic-chip-${escapeHTML(tone)}">
        ${escapeHTML(text)}
      </span>
    `;
  };

  const renderProgress = (
    value,
    label,
    hint
  ) => {
    const ui = getUI();
    const normalized = clamp(value, 0, 100);

    if (ui && typeof ui.progress === "function") {
      return ui.progress(
        normalized,
        { label, hint }
      );
    }

    return `
      <div class="tic-progress">
        <div class="tic-feature-row">
          <span>${escapeHTML(label)}</span>
          <small>${escapeHTML(hint)}</small>
        </div>
        <div class="tic-progress-track">
          <span style="width:${normalized}%"></span>
        </div>
      </div>
    `;
  };

  const renderInfo = (label, value) => {
    const ui = getUI();

    if (ui && typeof ui.info === "function") {
      return ui.info(label, value);
    }

    return `
      <div class="tic-info">
        <small>${escapeHTML(label)}</small>
        <strong>${escapeHTML(value)}</strong>
      </div>
    `;
  };

  const renderButton = (options) => {
    const ui = getUI();

    if (ui && typeof ui.button === "function") {
      return ui.button(options);
    }

    const action = options.action
      ? `data-action="${escapeHTML(options.action)}"`
      : "";

    return `
      <button
        type="button"
        class="tic-button ${options.primary ? "tic-button-primary" : ""}"
        ${action}
      >
        ${escapeHTML(options.label)}
      </button>
    `;
  };

  const renderStat = ({
    icon,
    value,
    label,
    subtitle
  }) => {
    const ui = getUI();

    if (ui && typeof ui.stat === "function") {
      return ui.stat({
        icon,
        value,
        label,
        subtitle
      });
    }

    return `
      <article class="tic-card tic-card-body">
        <div class="tic-feature-row">
          <span>${escapeHTML(icon)}</span>
          <strong>${escapeHTML(value)}</strong>
        </div>
        <h3 class="tic-card-title">
          ${escapeHTML(label)}
        </h3>
        <p class="tic-card-text">
          ${escapeHTML(subtitle)}
        </p>
      </article>
    `;
  };

  const renderGrid = (
    content,
    columns = 2
  ) => {
    const ui = getUI();

    if (ui && typeof ui.grid === "function") {
      return ui.grid(content, { columns });
    }

    return `
      <div class="tic-grid tic-grid-${columns}">
        ${content}
      </div>
    `;
  };

  const renderCard = (options) => {
    const ui = getUI();

    if (ui && typeof ui.card === "function") {
      return ui.card(options);
    }

    return `
      <article class="tic-card tic-card-body">
        <div class="tic-feature-row">
          <span>${escapeHTML(options.icon || "◈")}</span>
          ${
            options.badge
              ? renderBadge(
                  options.badge,
                  options.badgeTone
                )
              : ""
          }
        </div>
        <h3 class="tic-card-title">
          ${escapeHTML(options.title || "")}
        </h3>
        <p class="tic-card-text">
          ${escapeHTML(options.description || "")}
        </p>
        ${options.body || ""}
      </article>
    `;
  };

  const renderSection = ({
    eyebrow,
    title,
    subtitle,
    content,
    actions = ""
  }) => {
    const ui = getUI();

    if (ui && typeof ui.section === "function") {
      return ui.section({
        eyebrow,
        title,
        subtitle,
        content,
        actions
      });
    }

    return `
      <section class="tic-section">
        <header class="tic-section-header">
          <div>
            <small>${escapeHTML(eyebrow)}</small>
            <h2>${escapeHTML(title)}</h2>
            <p>${escapeHTML(subtitle)}</p>
          </div>
          ${actions || ""}
        </header>
        ${content}
      </section>
    `;
  };

  /* =========================================================
     Main page sections
  ========================================================= */

  const renderHero = (snapshot) => {
    const ui = getUI();
    const analytics = snapshot.analytics;
    const usage = number(
      analytics.usagePercent
    );
    const healthScore = number(
      analytics.health?.score
    );

    const heroConfig = {
      badge: "Budget Intelligence",
      title: "مركز الميزانية الذكي",
      subtitle:
        "تحكم بميزانية سفرك، مصروفاتك، ادخارك، دفعاتك وتنبيهاتك من منصة مالية واحدة.",
      actions: [
        {
          label: "إضافة مصروف",
          action: "budget-add-expense",
          primary: true,
          icon: "+"
        },
        {
          label: "تصدير التقرير",
          action: "budget-export-report",
          icon: "⇩"
        }
      ]
    };

    const hero = ui && typeof ui.hero === "function"
      ? ui.hero(heroConfig)
      : `
          <section class="tic-hero">
            <span class="tic-chip">
              ${heroConfig.badge}
            </span>
            <h1>${heroConfig.title}</h1>
            <p>${heroConfig.subtitle}</p>
            <div class="tic-actions">
              ${renderButton({
                label: "إضافة مصروف",
                action: "budget-add-expense",
                primary: true
              })}
              ${renderButton({
                label: "تصدير التقرير",
                action: "budget-export-report"
              })}
            </div>
          </section>
        `;

    return `
      ${hero}

      <div class="tic-budget-intelligence-strip">
        <div>
          <small>استخدام الميزانية</small>
          <strong>${usage}%</strong>
        </div>

        <div>
          <small>الصحة المالية</small>
          <strong>${healthScore}/100</strong>
        </div>

        <div>
          <small>التنبيهات الحرجة</small>
          <strong>
            ${number(
              snapshot.alerts?.summary?.critical
            )}
          </strong>
        </div>

        <div>
          <small>الإشعارات الجديدة</small>
          <strong>
            ${number(
              snapshot.notifications?.summary?.unread
            )}
          </strong>
        </div>
      </div>
    `;
  };

  const renderNavigation = () => {
    const tabs = [
      {
        id: VIEW.OVERVIEW,
        label: "النظرة العامة",
        icon: "◈"
      },
      {
        id: VIEW.EXPENSES,
        label: "المصروفات",
        icon: "◉"
      },
      {
        id: VIEW.SAVINGS,
        label: "الادخار",
        icon: "◇"
      },
      {
        id: VIEW.PAYMENTS,
        label: "الدفعات",
        icon: "▣"
      },
      {
        id: VIEW.ALERTS,
        label: "التنبيهات",
        icon: "!"
      },
      {
        id: VIEW.AI,
        label: "الذكاء المالي",
        icon: "✦"
      }
    ];

    return `
      <nav
        class="tic-budget-tabs"
        aria-label="أقسام الميزانية"
      >
        ${tabs.map((tab) => `
          <button
            type="button"
            class="tic-budget-tab ${
              state.activeView === tab.id
                ? "is-active"
                : ""
            }"
            data-action="budget-switch-view"
            data-view="${escapeHTML(tab.id)}"
          >
            <span>${escapeHTML(tab.icon)}</span>
            <strong>${escapeHTML(tab.label)}</strong>
          </button>
        `).join("")}
      </nav>
    `;
  };

  const renderAnnualOverview = (snapshot) => {
    const analytics = snapshot.analytics;
    const budget = number(
      analytics.annualBudget
    );
    const spent = number(
      analytics.totalSpent
    );
    const remaining = number(
      analytics.remaining,
      budget - spent
    );
    const usage = number(
      analytics.usagePercent
    );
    const projectedSpend = number(
      analytics.forecast?.projectedSpend
    );
    const expectedOverrun = number(
      analytics.forecast?.expectedOverrun
    );
    const likelyToExceed = Boolean(
      analytics.forecast?.likelyToExceed
    );

    return `
      <article class="tic-budget-overview">
        <div class="tic-feature-row">
          <div>
            <small>الميزانية السنوية</small>
            <strong>
              ${escapeHTML(
                formatMoney(
                  budget,
                  snapshot.currency
                )
              )}
            </strong>
          </div>

          ${renderBadge(
            usage > 100
              ? "متجاوزة"
              : usage >= 85
                ? "قريبة من الحد"
                : "ضمن الخطة",
            toneFromUsage(usage)
          )}
        </div>

        <p style="margin-top:10px;color:rgba(255,255,255,.72)">
          تم استخدام ${usage}% من ميزانية السفر السنوية.
        </p>

        <div style="margin-top:18px">
          ${renderProgress(
            usage,
            "استخدام الميزانية",
            remaining >= 0
              ? `${formatMoney(
                  remaining,
                  snapshot.currency
                )} متبقي`
              : `تجاوز بمقدار ${formatMoney(
                  Math.abs(remaining),
                  snapshot.currency
                )}`
          )}
        </div>

        <div class="tic-budget-breakdown">
          <div class="tic-budget-breakdown-item">
            <small>إجمالي المصروف</small>
            <strong>
              ${escapeHTML(
                formatMoney(
                  spent,
                  snapshot.currency
                )
              )}
            </strong>
          </div>

          <div class="tic-budget-breakdown-item">
            <small>الإنفاق المتوقع</small>
            <strong>
              ${escapeHTML(
                formatMoney(
                  projectedSpend,
                  snapshot.currency
                )
              )}
            </strong>
          </div>

          <div class="tic-budget-breakdown-item">
            <small>وضع التوقع</small>
            <strong>
              ${
                likelyToExceed
                  ? `تجاوز ${escapeHTML(
                      formatMoney(
                        expectedOverrun,
                        snapshot.currency
                      )
                    )}`
                  : "ضمن الميزانية"
              }
            </strong>
          </div>
        </div>
      </article>
    `;
  };

  const renderKPIs = (snapshot) => {
    const analytics = snapshot.analytics;
    const payments = snapshot.payments;
    const alerts = snapshot.alerts;
    const notifications = snapshot.notifications;

    const items = [
      {
        icon: "◈",
        value: formatMoney(
          analytics.trips?.totalPlanned ||
          analytics.totalTripBudget ||
          0,
          snapshot.currency
        ),
        label: "ميزانيات الرحلات",
        subtitle: "الإجمالي المخطط"
      },
      {
        icon: "✈",
        value: number(
          analytics.trips?.tripsWithBudget
        ),
        label: "رحلات بميزانية",
        subtitle: "رحلات محددة مالياً"
      },
      {
        icon: "▣",
        value: formatMoney(
          payments.summary?.remainingAmount,
          snapshot.currency
        ),
        label: "دفعات متبقية",
        subtitle:
          `${number(
            payments.summary?.overdueCount
          )} متأخرة`
      },
      {
        icon: "!",
        value: number(
          alerts.summary?.active
        ),
        label: "تنبيهات نشطة",
        subtitle:
          `${number(
            alerts.summary?.critical
          )} حرجة`
      },
      {
        icon: "◇",
        value: formatMoney(
          analytics.savings?.balance,
          snapshot.currency
        ),
        label: "صندوق السفر",
        subtitle:
          `${number(
            analytics.savings?.coveragePercent
          )}% تغطية`
      },
      {
        icon: "✦",
        value: array(
          snapshot.ai?.recommendations
        ).length,
        label: "توصيات ذكية",
        subtitle: "قرارات قابلة للتنفيذ"
      },
      {
        icon: "◎",
        value: `${number(
          analytics.health?.score
        )}/100`,
        label: "الصحة المالية",
        subtitle:
          statusLabel(
            analytics.health?.status
          )
      },
      {
        icon: "●",
        value: number(
          notifications.summary?.unread
        ),
        label: "إشعارات جديدة",
        subtitle: "تحتاج مراجعتك"
      }
    ];

    return renderGrid(
      items.map(renderStat).join(""),
      4
    );
  };

  const renderTripBudgets = (snapshot) => {
    const trips = array(
      snapshot.analytics.trips?.items
    );

    if (!trips.length) {
      return renderCard({
        icon: "✈",
        title: "لا توجد ميزانيات رحلات",
        description:
          "أنشئ رحلة وحدد ميزانيتها لتظهر هنا.",
        body: `
          <div style="margin-top:14px">
            ${renderButton({
              label: "فتح الرحلات",
              action: "budget-open-trips",
              primary: true
            })}
          </div>
        `
      });
    }

    return `
      <div class="tic-settings-list">
        ${trips.map((trip) => {
          const planned = number(
            firstDefined(
              trip.planned,
              trip.budget,
              0
            )
          );

          const spent = number(
            firstDefined(
              trip.spent,
              0
            )
          );

          const remaining = number(
            firstDefined(
              trip.remaining,
              planned - spent
            )
          );

          const usage = number(
            firstDefined(
              trip.usagePercent,
              percent(spent, planned)
            )
          );

          return `
            <article class="tic-card tic-card-body">
              <div class="tic-feature-row">
                <div>
                  <span class="tic-chip">
                    ${escapeHTML(
                      trip.destination ||
                      "رحلة"
                    )}
                  </span>

                  <h3
                    class="tic-card-title"
                    style="margin-top:10px"
                  >
                    ${escapeHTML(
                      trip.title ||
                      trip.destination ||
                      "رحلة بدون اسم"
                    )}
                  </h3>

                  <p class="tic-card-text">
                    ${formatDate(
                      trip.startDate
                    )}
                    —
                    ${formatDate(
                      trip.endDate
                    )}
                  </p>
                </div>

                ${renderBadge(
                  usage > 100
                    ? "متجاوزة"
                    : usage >= 85
                      ? "قريبة"
                      : planned <= 0
                        ? "غير محددة"
                        : "ضمن الخطة",
                  planned <= 0
                    ? "neutral"
                    : toneFromUsage(usage)
                )}
              </div>

              <div class="tic-trip-meta">
                ${renderInfo(
                  "الميزانية",
                  formatMoney(
                    planned,
                    snapshot.currency
                  )
                )}

                ${renderInfo(
                  "المصروف",
                  formatMoney(
                    spent,
                    snapshot.currency
                  )
                )}

                ${renderInfo(
                  "المتبقي",
                  formatMoney(
                    Math.max(0, remaining),
                    snapshot.currency
                  )
                )}
              </div>

              <div style="margin-top:15px">
                ${renderProgress(
                  usage,
                  "استخدام ميزانية الرحلة",
                  usage > 100
                    ? `تجاوز بمقدار ${formatMoney(
                        Math.abs(remaining),
                        snapshot.currency
                      )}`
                    : `${usage}% مستخدم`
                )}
              </div>

              <div
                class="tic-actions"
                style="margin-top:15px"
              >
                ${renderButton({
                  label: "عرض الرحلة",
                  action: "budget-open-trip"
                }).replace(
                  "<button",
                  `<button data-trip-id="${escapeHTML(
                    trip.id
                  )}"`
                )}

                ${renderButton({
                  label: "إضافة مصروف",
                  action: "budget-add-trip-expense",
                  primary: true
                }).replace(
                  "<button",
                  `<button data-trip-id="${escapeHTML(
                    trip.id
                  )}"`
                )}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;
  };

  const renderSavingsOverview = (snapshot) => {
    const savings = snapshot.analytics.savings || {};
    const monthlySaving = number(
      savings.monthlySaving
    );
    const balance = number(
      savings.balance
    );
    const coverage = number(
      savings.coveragePercent
    );
    const remainingToFund = number(
      savings.remainingToFund
    );
    const monthsToFund = firstDefined(
      savings.monthsToFund,
      monthlySaving > 0
        ? Math.ceil(
            remainingToFund /
            monthlySaving
          )
        : null
    );

    return renderGrid(
      [
        renderCard({
          icon: "◇",
          title: "الرصيد الحالي",
          description:
            "إجمالي المبلغ المتوفر في صندوق السفر.",
          body: `
            <strong class="tic-stat-value">
              ${escapeHTML(
                formatMoney(
                  balance,
                  snapshot.currency
                )
              )}
            </strong>
          `
        }),
        renderCard({
          icon: "↗",
          title: "الادخار الشهري",
          description:
            "المبلغ المخصص شهرياً لتمويل السفر.",
          body: `
            <strong class="tic-stat-value">
              ${escapeHTML(
                formatMoney(
                  monthlySaving,
                  snapshot.currency
                )
              )}
            </strong>
          `
        }),
        renderCard({
          icon: "✓",
          title: "تغطية الميزانية",
          description:
            "نسبة تغطية صندوق السفر للميزانية السنوية.",
          body: renderProgress(
            coverage,
            "تغطية الادخار",
            `${coverage}% من الميزانية`
          )
        }),
        renderCard({
          icon: "◎",
          title: "الوصول للهدف",
          description:
            "المدة المتوقعة للوصول إلى تغطية كاملة.",
          body: `
            <strong class="tic-stat-value">
              ${
                monthsToFund == null
                  ? "غير محدد"
                  : `${monthsToFund} شهر`
              }
            </strong>
          `
        })
      ].join(""),
      2
    );
  };

  const renderRecentExpenses = (snapshot) => {
    const expenses = snapshot.expenses
      .filter(
        (expense) =>
          expense &&
          !expense.deletedAt &&
          expense.isDeleted !== true
      )
      .slice()
      .sort((a, b) => {
        const dateA = safeDate(
          firstDefined(
            a.paidAt,
            a.date,
            a.expenseDate,
            a.createdAt
          )
        );

        const dateB = safeDate(
          firstDefined(
            b.paidAt,
            b.date,
            b.expenseDate,
            b.createdAt
          )
        );

        return (
          (dateB?.getTime() || 0) -
          (dateA?.getTime() || 0)
        );
      })
      .slice(0, 8);

    if (!expenses.length) {
      return renderCard({
        icon: "◉",
        title: "لا توجد مصروفات",
        description:
          "أضف أول مصروف لتبدأ التحليلات الذكية.",
        body: `
          <div style="margin-top:14px">
            ${renderButton({
              label: "إضافة مصروف",
              action: "budget-add-expense",
              primary: true
            })}
          </div>
        `
      });
    }

    return `
      <div class="tic-settings-list">
        ${expenses.map((expense) => {
          const amount = number(
            firstDefined(
              expense.amount,
              expense.total,
              expense.value,
              0
            )
          );

          const date = firstDefined(
            expense.paidAt,
            expense.date,
            expense.expenseDate,
            expense.createdAt
          );

          return `
            <article class="tic-card tic-card-body">
              <div class="tic-feature-row">
                <div>
                  <span class="tic-chip">
                    ${escapeHTML(
                      firstDefined(
                        expense.category,
                        expense.type,
                        "other"
                      )
                    )}
                  </span>

                  <h3
                    class="tic-card-title"
                    style="margin-top:8px"
                  >
                    ${escapeHTML(
                      firstDefined(
                        expense.title,
                        expense.name,
                        expense.description,
                        "مصروف"
                      )
                    )}
                  </h3>

                  <p class="tic-card-text">
                    ${escapeHTML(
                      formatDate(date)
                    )}
                  </p>
                </div>

                <div style="text-align:end">
                  <strong class="tic-stat-value">
                    ${escapeHTML(
                      formatMoney(
                        amount,
                        firstDefined(
                          expense.currency,
                          snapshot.currency
                        )
                      )
                    )}
                  </strong>

                  <div style="margin-top:6px">
                    ${renderBadge(
                      statusLabel(
                        expense.status || "paid"
                      ),
                      expense.status === "refunded"
                        ? "info"
                        : "success"
                    )}
                  </div>
                </div>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;
  };

  const renderPayments = (snapshot) => {
    const paymentItems = array(
      snapshot.payments.payments
    );

    if (!paymentItems.length) {
      return renderCard({
        icon: "▣",
        title: "لا توجد دفعات مسجلة",
        description:
          "سجل دفعات الفنادق والطيران والحجوزات لمتابعتها.",
        body: `
          <div style="margin-top:14px">
            ${renderButton({
              label: "إضافة دفعة",
              action: "budget-add-payment",
              primary: true
            })}
          </div>
        `
      });
    }

    return `
      <div class="tic-settings-list">
        ${paymentItems
          .slice(0, 10)
          .map((payment) => `
            <article class="tic-card tic-card-body">
              <div class="tic-feature-row">
                <div>
                  <span class="tic-chip">
                    ${escapeHTML(
                      payment.typeLabelAr ||
                      payment.type ||
                      "دفعة"
                    )}
                  </span>

                  <h3
                    class="tic-card-title"
                    style="margin-top:8px"
                  >
                    ${escapeHTML(
                      payment.title || "دفعة"
                    )}
                  </h3>

                  <p class="tic-card-text">
                    الاستحقاق:
                    ${escapeHTML(
                      formatDate(
                        payment.dueDate
                      )
                    )}
                  </p>
                </div>

                ${renderBadge(
                  statusLabel(payment.status),
                  payment.status === "overdue"
                    ? "danger"
                    : payment.status === "paid"
                      ? "success"
                      : payment.status === "partial"
                        ? "warning"
                        : "info"
                )}
              </div>

              <div class="tic-trip-meta">
                ${renderInfo(
                  "الإجمالي",
                  formatMoney(
                    payment.amount,
                    payment.currency ||
                    snapshot.currency
                  )
                )}

                ${renderInfo(
                  "المدفوع",
                  formatMoney(
                    payment.paidAmount,
                    payment.currency ||
                    snapshot.currency
                  )
                )}

                ${renderInfo(
                  "المتبقي",
                  formatMoney(
                    payment.remainingAmount,
                    payment.currency ||
                    snapshot.currency
                  )
                )}
              </div>

              <div style="margin-top:14px">
                ${renderProgress(
                  payment.progressPercent,
                  "تقدم الدفع",
                  `${number(
                    payment.progressPercent
                  )}% مكتمل`
                )}
              </div>

              <div
                class="tic-actions"
                style="margin-top:14px"
              >
                ${
                  payment.status !== "paid" &&
                  payment.status !== "refunded" &&
                  payment.status !== "cancelled"
                    ? renderButton({
                        label: "تسجيل دفع",
                        action: "budget-record-payment",
                        primary: true
                      }).replace(
                        "<button",
                        `<button data-payment-id="${escapeHTML(
                          payment.id
                        )}"`
                      )
                    : ""
                }

                ${renderButton({
                  label: "عرض التفاصيل",
                  action: "budget-view-payment"
                }).replace(
                  "<button",
                  `<button data-payment-id="${escapeHTML(
                    payment.id
                  )}"`
                )}
              </div>
            </article>
          `)
          .join("")}
      </div>
    `;
  };

  const renderAlerts = (snapshot) => {
    const alertItems = array(
      snapshot.alerts.alerts
    );

    if (!alertItems.length) {
      return renderCard({
        icon: "✓",
        title: "لا توجد تنبيهات مهمة",
        description:
          "الوضع المالي منظم ولا توجد مخاطر واضحة حالياً.",
        badge: "ممتاز",
        badgeTone: "success"
      });
    }

    return `
      <div class="tic-settings-list">
        ${alertItems
          .slice(0, 10)
          .map((alert) => `
            <article class="tic-card tic-card-body">
              <div class="tic-feature-row">
                <div>
                  ${renderBadge(
                    alert.severity === "critical"
                      ? "حرج"
                      : alert.severity === "high"
                        ? "مرتفع"
                        : alert.severity === "medium"
                          ? "متوسط"
                          : "معلومة",
                    severityTone(
                      alert.severity
                    )
                  )}

                  <h3
                    class="tic-card-title"
                    style="margin-top:10px"
                  >
                    ${escapeHTML(
                      alert.titleAr ||
                      alert.titleEn ||
                      "تنبيه"
                    )}
                  </h3>
                </div>

                ${renderBadge(
                  statusLabel(alert.status),
                  alert.status === "active"
                    ? "warning"
                    : "neutral"
                )}
              </div>

              <p class="tic-card-text">
                ${escapeHTML(
                  alert.messageAr ||
                  alert.messageEn ||
                  ""
                )}
              </p>

              <div
                class="tic-actions"
                style="margin-top:14px"
              >
                ${
                  alert.action
                    ? renderButton({
                        label:
                          alert.actionLabelAr ||
                          "فتح",
                        action:
                          "budget-run-alert-action",
                        primary: true
                      }).replace(
                        "<button",
                        `<button data-alert-id="${escapeHTML(
                          alert.id
                        )}"`
                      )
                    : ""
                }

                ${renderButton({
                  label: "تمت المراجعة",
                  action:
                    "budget-acknowledge-alert"
                }).replace(
                  "<button",
                  `<button data-alert-id="${escapeHTML(
                    alert.id
                  )}"`
                )}

                ${renderButton({
                  label: "تأجيل",
                  action:
                    "budget-snooze-alert"
                }).replace(
                  "<button",
                  `<button data-alert-id="${escapeHTML(
                    alert.id
                  )}"`
                )}
              </div>
            </article>
          `)
          .join("")}
      </div>
    `;
  };

  const renderAI = (snapshot) => {
    const recommendations = array(
      snapshot.ai.recommendations
    );

    const hero = object(snapshot.ai.hero);

    const heroCard = renderCard({
      icon: "✦",
      title:
        hero.titleAr ||
        "الذكاء المالي",
      description:
        hero.messageAr ||
        "تحليل ذكي لميزانية السفر الحالية.",
      badge:
        snapshot.ai.summary?.criticalCount > 0
          ? "إجراء مطلوب"
          : "تحليل مباشر",
      badgeTone:
        snapshot.ai.summary?.criticalCount > 0
          ? "danger"
          : "info",
      body: hero.opportunityAr
        ? `
          <p class="tic-card-text" style="margin-top:12px">
            ${escapeHTML(
              hero.opportunityAr
            )}
          </p>
        `
        : ""
    });

    if (!recommendations.length) {
      return heroCard;
    }

    return `
      ${heroCard}

      <div
        class="tic-settings-list"
        style="margin-top:16px"
      >
        ${recommendations
          .slice(0, 8)
          .map((item) => `
            <article class="tic-card tic-card-body">
              <div class="tic-feature-row">
                <div>
                  ${renderBadge(
                    item.priority === "critical"
                      ? "حرج"
                      : item.priority === "high"
                        ? "أولوية عالية"
                        : item.priority === "medium"
                          ? "أولوية متوسطة"
                          : "اقتراح",
                    severityTone(
                      item.priority
                    )
                  )}

                  <h3
                    class="tic-card-title"
                    style="margin-top:10px"
                  >
                    ${escapeHTML(
                      item.titleAr ||
                      item.titleEn ||
                      "توصية"
                    )}
                  </h3>
                </div>

                ${
                  item.impactAmount > 0
                    ? `
                      <strong>
                        ${escapeHTML(
                          formatMoney(
                            item.impactAmount,
                            snapshot.currency
                          )
                        )}
                      </strong>
                    `
                    : ""
                }
              </div>

              <p class="tic-card-text">
                ${escapeHTML(
                  item.messageAr ||
                  item.messageEn ||
                  ""
                )}
              </p>

              <div
                class="tic-actions"
                style="margin-top:14px"
              >
                ${
                  item.action
                    ? renderButton({
                        label:
                          item.actionLabelAr ||
                          "تنفيذ",
                        action:
                          "budget-run-ai-action",
                        primary: true
                      }).replace(
                        "<button",
                        `<button data-recommendation-id="${escapeHTML(
                          item.id
                        )}"`
                      )
                    : ""
                }

                ${renderButton({
                  label: "إخفاء",
                  action:
                    "budget-dismiss-recommendation"
                }).replace(
                  "<button",
                  `<button data-recommendation-id="${escapeHTML(
                    item.id
                  )}"`
                )}
              </div>
            </article>
          `)
          .join("")}
      </div>

      <div style="margin-top:16px">
        ${renderButton({
          label: "أنشئ لي خطة شهرية",
          action: "budget-create-monthly-plan",
          primary: true
        })}
      </div>
    `;
  };

  const renderHealth = (snapshot) => {
    const health = snapshot.integrationHealth;
    const modules = object(health.modules);
    const items = Object.values(modules);

    if (!items.length) {
      return renderCard({
        icon: "◎",
        title: "حالة الربط",
        description:
          "محرك الربط المركزي غير متاح، والصفحة تعمل بوضع التوافق.",
        badge: "Fallback",
        badgeTone: "warning"
      });
    }

    return renderCard({
      icon: "◎",
      title: "جاهزية منصة الميزانية",
      description:
        `${number(
          health.readyModules
        )} من ${number(
          health.totalModules
        )} محركات جاهزة.`,
      badge:
        health.status === "ready"
          ? "جاهزة"
          : health.status === "degraded"
            ? "جزئية"
            : "تحتاج مراجعة",
      badgeTone:
        health.status === "ready"
          ? "success"
          : health.status === "degraded"
            ? "warning"
            : "danger",
      body: `
        <div style="margin-top:14px">
          ${renderProgress(
            health.score,
            "جاهزية المنصة",
            `${number(
              health.score
            )}%`
          )}
        </div>
      `
    });
  };

  const renderOverviewView = (snapshot) => `
    ${renderSection({
      eyebrow: "ANNUAL OVERVIEW",
      title: "الملخص المالي",
      subtitle:
        "نظرة شاملة على ميزانية السفر الحالية والتوقع القادم.",
      content:
        renderAnnualOverview(snapshot)
    })}

    ${renderSection({
      eyebrow: "BUDGET SNAPSHOT",
      title: "مؤشرات الميزانية",
      subtitle:
        "أهم الأرقام المرتبطة بالرحلات والادخار والدفعات.",
      content:
        renderKPIs(snapshot)
    })}

    ${renderSection({
      eyebrow: "TRIP BUDGETS",
      title: "ميزانيات الرحلات",
      subtitle:
        "تابع الميزانية والمصروف والمتبقي لكل رحلة.",
      content:
        renderTripBudgets(snapshot)
    })}

    ${renderSection({
      eyebrow: "SAVINGS",
      title: "صندوق السفر",
      subtitle:
        "تابع الادخار الشهري وتغطية الميزانية.",
      content:
        renderSavingsOverview(snapshot)
    })}

    ${renderSection({
      eyebrow: "SMART AI",
      title: "أفضل توصية الآن",
      subtitle:
        "توصية مالية ذكية مبنية على بياناتك الحالية.",
      content:
        renderAI({
          ...snapshot,
          ai: {
            ...snapshot.ai,
            recommendations: array(
              snapshot.ai.recommendations
            ).slice(0, 1)
          }
        })
    })}

    ${renderSection({
      eyebrow: "SYSTEM HEALTH",
      title: "جاهزية المنصة",
      subtitle:
        "حالة الربط بين جميع محركات الميزانية.",
      content:
        renderHealth(snapshot)
    })}
  `;

  const renderActiveView = (snapshot) => {
    if (state.activeView === VIEW.EXPENSES) {
      return renderSection({
        eyebrow: "EXPENSE CENTER",
        title: "المصروفات",
        subtitle:
          "راجع أحدث المصروفات وسجل مصروفات جديدة.",
        actions: renderButton({
          label: "إضافة مصروف",
          action: "budget-add-expense",
          primary: true
        }),
        content:
          renderRecentExpenses(snapshot)
      });
    }

    if (state.activeView === VIEW.SAVINGS) {
      return renderSection({
        eyebrow: "SAVINGS INTELLIGENCE",
        title: "الادخار",
        subtitle:
          "تابع رصيد صندوق السفر وخطة الوصول للهدف.",
        actions: renderButton({
          label: "إضافة ادخار",
          action: "budget-add-saving",
          primary: true
        }),
        content:
          renderSavingsOverview(snapshot)
      });
    }

    if (state.activeView === VIEW.PAYMENTS) {
      return renderSection({
        eyebrow: "PAYMENT TRACKER",
        title: "الدفعات",
        subtitle:
          "تابع دفعات الفنادق والطيران والحجوزات.",
        actions: renderButton({
          label: "إضافة دفعة",
          action: "budget-add-payment",
          primary: true
        }),
        content:
          renderPayments(snapshot)
      });
    }

    if (state.activeView === VIEW.ALERTS) {
      return renderSection({
        eyebrow: "FINANCIAL ALERTS",
        title: "التنبيهات",
        subtitle:
          "تنبيهات مالية مرتبة حسب الخطورة والأولوية.",
        content:
          renderAlerts(snapshot)
      });
    }

    if (state.activeView === VIEW.AI) {
      return renderSection({
        eyebrow: "BUDGET AI",
        title: "الذكاء المالي",
        subtitle:
          "توصيات وخطط ذكية لتحسين ميزانية السفر.",
        content:
          renderAI(snapshot)
      });
    }

    return renderOverviewView(snapshot);
  };

  const renderPage = (snapshot) => `
    <div
      class="tic-module tic-budget-platform"
      data-page="budget"
      data-page-version="${PAGE_VERSION}"
      data-budget-view="${escapeHTML(
        state.activeView
      )}"
    >
      ${renderHero(snapshot)}
      ${renderNavigation()}
      <div
        class="tic-budget-view"
        data-budget-view-content
      >
        ${renderActiveView(snapshot)}
      </div>
    </div>
  `;

  /* =========================================================
     Rendering and refresh
  ========================================================= */

  function refresh() {
    if (
      !state.container ||
      !state.mounted ||
      state.rendering
    ) {
      return false;
    }

    state.rendering = true;

    try {
      const snapshot = buildSnapshot();

      state.container.innerHTML =
        renderPage(snapshot);

      emit("refreshed", {
        annualBudget:
          snapshot.analytics.annualBudget,
        totalSpent:
          snapshot.analytics.totalSpent,
        annualUsage:
          snapshot.analytics.usagePercent,
        activeView:
          state.activeView
      });

      return true;
    } finally {
      state.rendering = false;
    }
  }

  /* =========================================================
     Actions
  ========================================================= */

  const toast = (
    message,
    tone = "info"
  ) => {
    const ui = getUI();

    if (ui && typeof ui.toast === "function") {
      ui.toast(message, { tone });
      return;
    }

    console.log(
      `[TIC Budget ${tone}]`,
      message
    );
  };

  const runNamedAction = (
    action,
    source
  ) => {
    if (!action) return false;

    const name = String(action.name || "");
    const payload = object(action.payload);
    const router = getRouter();

    const routeMap = {
      "open-budget-settings": "more",
      "open-budget-overview": "budget",
      "open-budget-forecast": "budget",
      "open-budget-report": "budget",
      "open-savings-plan": "budget",
      "open-trip-finance": "trips",
      "open-trip-budget": "trips",
      "open-trip-expenses": "trips",
      "open-payment": "budget",
      "open-expense": "budget",
      "open-category-analysis": "budget",
      "open-recent-expenses": "budget"
    };

    if (routeMap[name] && router?.go) {
      router.go(
        routeMap[name],
        {
          action: name,
          ...payload,
          source
        }
      );

      return true;
    }

    if (
      name === "create-recovery-plan" ||
      name === "create-spending-reduction-plan"
    ) {
      const engine = getEngines().ai;

      const plan = callEngine(
        engine,
        ["createRecoveryPlan"],
        [{
          store: getStore(),
          ...payload
        }]
      );

      if (plan) {
        toast(
          plan.summaryAr ||
          "تم إنشاء خطة التصحيح.",
          "success"
        );
        emit("recovery-plan-created", {
          plan
        });
        return true;
      }
    }

    if (name === "set-savings-plan") {
      state.activeView = VIEW.SAVINGS;
      refresh();
      return true;
    }

    window.dispatchEvent(
      new CustomEvent(
        "tic:budget:action",
        {
          detail: {
            action: clone(action),
            source
          }
        }
      )
    );

    return true;
  };

  const registerActions = () => {
    const ui = getUI();

    if (
      !ui ||
      typeof ui.registerAction !== "function"
    ) {
      return;
    }

    const register = (name, handler) => {
      if (ui.hasAction?.(name)) return;

      const unsubscribe =
        ui.registerAction(name, handler);

      if (typeof unsubscribe === "function") {
        state.actionUnsubscribers.push(
          unsubscribe
        );
      }
    };

    register(
      "budget-open-trips",
      () => getRouter()?.go?.("trips")
    );

    register(
      "budget-switch-view",
      ({ element, dataset, event } = {}) => {
        const view = firstDefined(
          dataset?.view,
          element?.dataset?.view,
          event?.target?.closest?.(
            "[data-view]"
          )?.dataset?.view
        );

        if (
          view &&
          Object.values(VIEW).includes(view)
        ) {
          state.activeView = view;
          refresh();
        }
      }
    );

    register(
      "budget-add-expense",
      () => {
        const engine = getEngines().expense;

        if (
          engine &&
          typeof engine.openForm === "function"
        ) {
          engine.openForm({
            store: getStore()
          });
          return;
        }

        window.dispatchEvent(
          new CustomEvent(
            "tic:budget:open-expense-form",
            {
              detail: {
                tripId: state.activeTripId
              }
            }
          )
        );

        toast(
          "افتح نموذج إضافة المصروف.",
          "info"
        );
      }
    );

    register(
      "budget-add-trip-expense",
      ({ element } = {}) => {
        state.activeTripId =
          element?.dataset?.tripId || null;

        window.dispatchEvent(
          new CustomEvent(
            "tic:budget:open-expense-form",
            {
              detail: {
                tripId: state.activeTripId
              }
            }
          )
        );
      }
    );

    register(
      "budget-open-trip",
      ({ element } = {}) => {
        const tripId =
          element?.dataset?.tripId;

        getRouter()?.go?.(
          "trips",
          {
            view: "details",
            tripId
          }
        );
      }
    );

    register(
      "budget-add-saving",
      () => {
        window.dispatchEvent(
          new CustomEvent(
            "tic:budget:open-saving-form"
          )
        );
      }
    );

    register(
      "budget-add-payment",
      () => {
        window.dispatchEvent(
          new CustomEvent(
            "tic:budget:open-payment-form"
          )
        );
      }
    );

    register(
      "budget-record-payment",
      ({ element } = {}) => {
        window.dispatchEvent(
          new CustomEvent(
            "tic:budget:record-payment",
            {
              detail: {
                paymentId:
                  element?.dataset?.paymentId
              }
            }
          )
        );
      }
    );

    register(
      "budget-view-payment",
      ({ element } = {}) => {
        window.dispatchEvent(
          new CustomEvent(
            "tic:budget:view-payment",
            {
              detail: {
                paymentId:
                  element?.dataset?.paymentId
              }
            }
          )
        );
      }
    );

    register(
      "budget-acknowledge-alert",
      ({ element } = {}) => {
        const id =
          element?.dataset?.alertId;

        if (!id) return;

        callEngine(
          getEngines().alerts,
          ["acknowledgeAlert"],
          [id, { store: getStore() }]
        );

        scheduleRefresh();
      }
    );

    register(
      "budget-snooze-alert",
      ({ element } = {}) => {
        const id =
          element?.dataset?.alertId;

        if (!id) return;

        const until = new Date();
        until.setDate(until.getDate() + 1);

        callEngine(
          getEngines().alerts,
          ["snoozeAlert"],
          [
            id,
            until.toISOString(),
            { store: getStore() }
          ]
        );

        scheduleRefresh();
      }
    );

    register(
      "budget-run-alert-action",
      ({ element } = {}) => {
        const id =
          element?.dataset?.alertId;

        const alert = array(
          state.lastSnapshot?.alerts?.alerts
        ).find(
          (item) =>
            String(item.id) === String(id)
        );

        if (alert?.action) {
          runNamedAction(
            alert.action,
            "alert"
          );
        }
      }
    );

    register(
      "budget-run-ai-action",
      ({ element } = {}) => {
        const id =
          element?.dataset?.recommendationId;

        const recommendation = array(
          state.lastSnapshot?.ai?.recommendations
        ).find(
          (item) =>
            String(item.id) === String(id)
        );

        if (recommendation?.action) {
          runNamedAction(
            recommendation.action,
            "ai"
          );
        }
      }
    );

    register(
      "budget-dismiss-recommendation",
      ({ element } = {}) => {
        const id =
          element?.dataset?.recommendationId;

        if (!id) return;

        callEngine(
          getEngines().ai,
          ["dismissRecommendation"],
          [id, { store: getStore() }]
        );

        scheduleRefresh();
      }
    );

    register(
      "budget-create-monthly-plan",
      () => {
        const plan = callEngine(
          getEngines().ai,
          ["createMonthlyPlan"],
          [{ store: getStore() }]
        );

        if (plan) {
          emit("monthly-plan-created", {
            plan
          });

          toast(
            plan.summaryAr ||
            "تم إنشاء الخطة الشهرية.",
            "success"
          );
        }
      }
    );

    register(
      "budget-export-report",
      () => {
        const result = callEngine(
          getEngines().export,
          ["downloadReport"],
          [{
            store: getStore(),
            report: "full",
            format: "html",
            language: "ar"
          }]
        );

        if (result) {
          toast(
            "تم تجهيز تقرير الميزانية.",
            "success"
          );
        } else {
          toast(
            "محرك التصدير غير متاح حالياً.",
            "warning"
          );
        }
      }
    );
  };

  /* =========================================================
     Subscriptions
  ========================================================= */

  const subscribeToStore = () => {
    const store = getStore();

    if (
      !store ||
      typeof store.subscribe !== "function" ||
      state.unsubscribeStore
    ) {
      return;
    }

    try {
      state.unsubscribeStore =
        store.subscribe(() => {
          if (state.mounted) {
            scheduleRefresh();
          }
        });
    } catch (error) {
      console.warn(
        "TIC Budget Page: Store subscription failed.",
        error
      );
    }
  };

  const subscribeToEngines = () => {
    const engines = getEngines();

    [
      engines.integration,
      engines.analytics,
      engines.ai,
      engines.payments,
      engines.alerts,
      engines.notifications
    ].forEach((engine) => {
      if (
        engine &&
        typeof engine.subscribe === "function"
      ) {
        try {
          const unsubscribe =
            engine.subscribe(
              () => {
                if (state.mounted) {
                  scheduleRefresh();
                }
              },
              { immediate: false }
            );

          if (
            typeof unsubscribe === "function"
          ) {
            state.engineUnsubscribers.push(
              unsubscribe
            );
          }
        } catch (error) {
          console.warn(
            "TIC Budget Page: Engine subscription failed.",
            error
          );
        }
      }
    });
  };

  const bindWindowEvents = () => {
    const names = [
      "tic:budget-analytics-changed",
      "tic:budget-ai-recommendations-changed",
      "tic:payments-changed",
      "tic:expense-alerts-changed",
      "tic:budget-notifications-changed",
      "tic:savings-changed",
      "tic:expenses-changed"
    ];

    names.forEach((name) => {
      const handler = () => {
        if (state.mounted) {
          scheduleRefresh();
        }
      };

      window.addEventListener(
        name,
        handler
      );

      state.eventBindings.push({
        name,
        handler
      });
    });
  };

  /* =========================================================
     Public page API
  ========================================================= */

  const BudgetPage = {
    id: PAGE_ID,
    title: "الميزانية",
    icon: "◈",
    version: PAGE_VERSION,

    init() {
      if (state.initialized) {
        return this.diagnostics();
      }

      const integration =
        getEngines().integration;

      callEngine(
        integration,
        ["initialize", "bootstrap", "init"],
        [{ store: getStore() }]
      );

      registerActions();
      subscribeToStore();
      subscribeToEngines();
      bindWindowEvents();

      state.initialized = true;

      emit("initialized", {
        version: PAGE_VERSION,
        engines:
          this.diagnostics().engines
      });

      return this.diagnostics();
    },

    render(context = {}) {
      this.init();

      if (
        context.view &&
        Object.values(VIEW).includes(
          context.view
        )
      ) {
        state.activeView = context.view;
      }

      return renderPage(
        buildSnapshot()
      );
    },

    mount(context = {}) {
      this.init();

      const container = resolveContainer(
        context.container
      );

      if (!container) {
        throw new Error(
          "TIC Budget Error: route container not found."
        );
      }

      if (
        context.view &&
        Object.values(VIEW).includes(
          context.view
        )
      ) {
        state.activeView = context.view;
      }

      state.container = container;
      state.mounted = true;

      const snapshot = buildSnapshot();

      container.innerHTML =
        renderPage(snapshot);

      emit("mounted", {
        annualBudget:
          snapshot.analytics.annualBudget,
        totalSpent:
          snapshot.analytics.totalSpent,
        activeView:
          state.activeView
      });

      return container;
    },

    afterEnter(context = {}) {
      const container = resolveContainer(
        context.container
      );

      if (container) {
        state.container = container;
        state.mounted = true;
      }

      if (
        context.view &&
        Object.values(VIEW).includes(
          context.view
        )
      ) {
        state.activeView = context.view;
      }

      refresh();
      return true;
    },

    unmount() {
      state.mounted = false;
      state.container = null;

      emit("unmounted");
      return true;
    },

    refresh,

    setView(view) {
      if (
        !Object.values(VIEW).includes(view)
      ) {
        return false;
      }

      state.activeView = view;

      if (state.mounted) {
        refresh();
      }

      return true;
    },

    getView() {
      return state.activeView;
    },

    getSnapshot() {
      return clone(
        state.lastSnapshot ||
        buildSnapshot()
      );
    },

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError(
          "TIC Budget subscriber must be a function."
        );
      }

      state.subscribers.add(listener);

      return () =>
        state.subscribers.delete(listener);
    },

    destroy() {
      this.unmount();

      if (state.refreshTimer) {
        window.clearTimeout(
          state.refreshTimer
        );
        state.refreshTimer = null;
      }

      if (
        typeof state.unsubscribeStore === "function"
      ) {
        state.unsubscribeStore();
      }

      state.engineUnsubscribers.forEach(
        (unsubscribe) => {
          if (
            typeof unsubscribe === "function"
          ) {
            unsubscribe();
          }
        }
      );

      state.actionUnsubscribers.forEach(
        (unsubscribe) => {
          if (
            typeof unsubscribe === "function"
          ) {
            unsubscribe();
          }
        }
      );

      state.eventBindings.forEach(
        ({ name, handler }) => {
          window.removeEventListener(
            name,
            handler
          );
        }
      );

      state.unsubscribeStore = null;
      state.engineUnsubscribers = [];
      state.actionUnsubscribers = [];
      state.eventBindings = [];
      state.subscribers.clear();
      state.lastSnapshot = null;
      state.activeView = VIEW.OVERVIEW;
      state.activeTripId = null;
      state.initialized = false;

      return true;
    },

    diagnostics() {
      const engines = getEngines();

      return {
        id: this.id,
        title: this.title,
        version: this.version,
        initialized: state.initialized,
        mounted: state.mounted,
        activeView: state.activeView,
        hasContainer: Boolean(
          state.container
        ),
        storeAvailable: Boolean(
          getStore()
        ),
        routerAvailable: Boolean(
          getRouter()
        ),
        uiAvailable: Boolean(
          getUI()
        ),
        actionCount:
          state.actionUnsubscribers.length,
        engineSubscriptionCount:
          state.engineUnsubscribers.length,
        subscriberCount:
          state.subscribers.size,
        hasSnapshot: Boolean(
          state.lastSnapshot
        ),
        engines: {
          budget: Boolean(
            engines.budget
          ),
          expense: Boolean(
            engines.expense
          ),
          savings: Boolean(
            engines.savings
          ),
          analytics: Boolean(
            engines.analytics
          ),
          ai: Boolean(
            engines.ai
          ),
          payments: Boolean(
            engines.payments
          ),
          alerts: Boolean(
            engines.alerts
          ),
          export: Boolean(
            engines.export
          ),
          notifications: Boolean(
            engines.notifications
          ),
          integration: Boolean(
            engines.integration
          )
        }
      };
    }
  };

  /* =========================================================
     Global registration
  ========================================================= */

  window.TIC = window.TIC || {};
  window.TIC.Pages = window.TIC.Pages || {};
  window.TIC.Pages.budget = BudgetPage;
  window.TICBudgetPage = BudgetPage;

  const router = getRouter();

  if (
    router &&
    typeof router.register === "function"
  ) {
    if (!router.has?.("budget")) {
      router.register("budget", {
        id: "budget",
        title: "الميزانية",
        module: "budget",
        icon: "◈",
        visible: true,
        order: 4
      });
    }

    if (
      typeof router.registerPage === "function"
    ) {
      router.registerPage(
        "budget",
        BudgetPage
      );
    }
  }

  BudgetPage.init();
})(window, document);
