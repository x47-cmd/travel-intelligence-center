/* =========================================================
   Travel Intelligence Center
   Budget Intelligence Platform Page V3.0.0

   File Path:
   js/pages/budget.js

   Purpose:
   - Production-ready Budget Intelligence Platform page.
   - Preserves the stable page lifecycle, Router registration,
     Store subscription and TIC UI integration.
   - Connects all ten Budget Intelligence engines.
   - Supports annual budget intelligence, trip budgets, expenses,
     savings, payments, AI recommendations, alerts, notifications,
     reports, export and system health.
   - Provides iPhone-first responsive rendering and local dialogs.
   - Keeps all finance data synchronized through the central Store.

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

  const state = {
    initialized: false,
    mounted: false,
    refreshing: false,
    container: null,
    unsubscribeStore: null,
    integrationUnsubscribe: null,
    actionUnsubscribers: [],
    eventBindings: [],
    subscribers: new Set(),
    lastSnapshot: null,
    activeView: "overview",
    activeDialog: null,
    refreshTimer: null
  };

  const VIEWS = Object.freeze({
    OVERVIEW: "overview",
    EXPENSES: "expenses",
    SAVINGS: "savings",
    PAYMENTS: "payments",
    ALERTS: "alerts",
    REPORTS: "reports"
  });

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
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const nonNegative = (value, fallback = 0) =>
    Math.max(0, number(value, fallback));

  const percentage = (part, total) =>
    total > 0
      ? Math.round((number(part) / number(total)) * 100)
      : 0;

  const asArray = (value) => {
    if (Array.isArray(value)) return value;

    if (
      value &&
      typeof value === "object"
    ) {
      return Object.values(value);
    }

    return [];
  };

  const firstDefined = (...values) =>
    values.find(
      (value) =>
        value !== undefined &&
        value !== null &&
        value !== ""
    );

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

  const engines = () => ({
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

  const notify = (message, tone = "info") => {
    const ui = getUI();

    if (ui?.toast) {
      ui.toast(message, { tone });
      return;
    }

    if (ui?.showToast) {
      ui.showToast(message, tone);
      return;
    }

    console.log(`[Budget:${tone}] ${message}`);
  };

  const getStoreState = () => {
    const store = getStore();

    if (!store) return {};

    try {
      if (typeof store.getState === "function") {
        return clone(store.getState()) || {};
      }

      if (typeof store.get === "function") {
        const full = store.get();

        if (
          full &&
          typeof full === "object"
        ) {
          return clone(full);
        }

        return {
          profile: store.get("profile"),
          trips: store.get("trips"),
          budgets: store.get("budgets"),
          expenses: store.get("expenses"),
          savings: store.get("savings"),
          payments: store.get("payments"),
          budgetNotifications:
            store.get("budgetNotifications")
        };
      }

      if (store.state) {
        return clone(store.state);
      }

      if (store.data) {
        return clone(store.data);
      }
    } catch (error) {
      console.error(
        "TIC Budget Store read error:",
        error
      );
    }

    return {};
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
          `TIC Budget engine method failed: ${method}`,
          error
        );
      }
    }

    return null;
  };

  const fallbackSnapshot = (raw) => {
    const profile =
      raw.profile &&
      typeof raw.profile === "object"
        ? raw.profile
        : {};

    const settings =
      raw.settings &&
      typeof raw.settings === "object"
        ? raw.settings
        : {};

    const trips = asArray(raw.trips);

    const annualBudget = nonNegative(
      firstDefined(
        raw.budget?.annualBudget,
        profile.annualTravelBudget,
        settings.annualTravelBudget,
        Config.profile?.annualTravelBudget,
        30000
      )
    );

    const monthlySaving = nonNegative(
      firstDefined(
        raw.savings?.monthlySaving,
        profile.monthlySaving,
        settings.monthlySaving,
        Config.profile?.monthlySaving,
        1500
      )
    );

    const expenses = asArray(
      firstDefined(
        raw.expenses,
        raw.budget?.expenses,
        raw.finance?.expenses,
        []
      )
    );

    const totalSpent = expenses.length
      ? expenses.reduce(
          (total, item) =>
            total +
            nonNegative(
              firstDefined(
                item.amount,
                item.total,
                item.value,
                0
              )
            ),
          0
        )
      : trips.reduce(
          (total, trip) =>
            total + nonNegative(trip.spent),
          0
        );

    const totalTripBudget = trips.reduce(
      (total, trip) =>
        total +
        nonNegative(
          firstDefined(
            trip.budget,
            trip.plannedBudget,
            0
          )
        ),
      0
    );

    const savingsRoot = raw.savings;
    const savingsEntries = Array.isArray(
      savingsRoot
    )
      ? savingsRoot
      : asArray(
          savingsRoot?.entries ||
          savingsRoot?.transactions
        );

    const totalSavings = nonNegative(
      firstDefined(
        savingsRoot?.balance,
        savingsRoot?.currentBalance,
        savingsEntries.reduce(
          (total, item) =>
            total +
            nonNegative(
              typeof item === "number"
                ? item
                : item.amount
            ),
          0
        )
      )
    );

    const remaining = annualBudget - totalSpent;
    const usagePercent = percentage(
      totalSpent,
      annualBudget
    );

    return {
      generatedAt: new Date().toISOString(),
      currency: firstDefined(
        raw.budget?.currency,
        profile.currency,
        settings.currency,
        "AED"
      ),
      annualBudget,
      totalSpent,
      remaining,
      usagePercent,
      expenseCount: expenses.length,
      averageExpense:
        expenses.length > 0
          ? totalSpent / expenses.length
          : 0,
      expenses,
      savings: {
        balance: totalSavings,
        monthlySaving,
        coveragePercent: percentage(
          totalSavings,
          annualBudget
        ),
        remainingToFund: Math.max(
          0,
          annualBudget - totalSavings
        )
      },
      trips: {
        items: trips.map((trip, index) => {
          const planned = nonNegative(
            firstDefined(
              trip.budget,
              trip.plannedBudget,
              0
            )
          );

          const spent = nonNegative(
            firstDefined(
              trip.spent,
              trip.totalSpent,
              0
            )
          );

          return {
            id: String(
              firstDefined(
                trip.id,
                `trip_${index}`
              )
            ),
            title:
              trip.title ||
              trip.destination ||
              "رحلة",
            destination:
              trip.destination || "",
            planned,
            spent,
            remaining: planned - spent,
            usagePercent:
              percentage(spent, planned),
            expenseCount: 0
          };
        }),
        totalTrips: trips.length,
        totalPlanned: totalTripBudget,
        totalSpent,
        tripsOverBudget: trips.filter(
          (trip) =>
            nonNegative(trip.spent) >
            nonNegative(trip.budget)
        ).length,
        tripsNearLimit: trips.filter(
          (trip) => {
            const usage = percentage(
              trip.spent,
              trip.budget
            );

            return (
              usage >= 85 &&
              usage <= 100
            );
          }
        ).length
      },
      categories: {
        items: []
      },
      monthly: {
        items: [],
        averageMonthlySpend:
          totalSpent / 12
      },
      forecast: {
        projectedSpend: totalSpent,
        likelyToExceed:
          totalSpent > annualBudget,
        expectedOverrun: Math.max(
          0,
          totalSpent - annualBudget
        ),
        recommendedMonthlyLimit:
          Math.max(
            0,
            annualBudget - totalSpent
          ) / Math.max(
            1,
            12 - new Date().getMonth()
          )
      },
      health: {
        score: Math.max(
          0,
          Math.min(
            100,
            100 - Math.max(
              0,
              usagePercent - 50
            )
          )
        ),
        status:
          usagePercent > 100
            ? "critical"
            : usagePercent >= 85
              ? "warning"
              : "healthy"
      },
      anomalies: {
        items: [],
        count: 0
      },
      insights: [],
      charts: {},
      raw
    };
  };

  const buildSnapshot = () => {
    const raw = getStoreState();
    const modules = engines();

    const integrationDashboard =
      callEngine(
        modules.integration,
        [
          "getUnifiedDashboard",
          "getDashboard"
        ],
        [{ store: getStore() }]
      );

    const analytics =
      integrationDashboard?.analytics ||
      callEngine(
        modules.analytics,
        [
          "getDashboard",
          "getSnapshot",
          "generate"
        ],
        [{ store: getStore() }]
      ) ||
      fallbackSnapshot(raw);

    const ai =
      integrationDashboard?.ai ||
      callEngine(
        modules.ai,
        [
          "getDashboard",
          "generateDashboard"
        ],
        [{ store: getStore() }]
      ) ||
      {
        recommendations: [],
        summary: {}
      };

    const payments =
      integrationDashboard?.payments ||
      callEngine(
        modules.payments,
        [
          "getDashboard",
          "buildDashboard"
        ],
        [{ store: getStore() }]
      ) ||
      {
        payments: [],
        upcoming: [],
        overdue: [],
        alerts: [],
        summary: {}
      };

    const alerts =
      integrationDashboard?.alerts ||
      callEngine(
        modules.alerts,
        [
          "getDashboard",
          "buildDashboard"
        ],
        [{ store: getStore() }]
      ) ||
      {
        alerts: [],
        activeAlerts: [],
        summary: {}
      };

    const notifications =
      integrationDashboard?.notifications ||
      callEngine(
        modules.notifications,
        [
          "getDashboard",
          "buildDashboard"
        ],
        [{ store: getStore() }]
      ) ||
      {
        notifications: [],
        unread: [],
        summary: {}
      };

    const integrationHealth =
      callEngine(
        modules.integration,
        ["getHealth"],
        []
      ) ||
      integrationDashboard?.integration ||
      null;

    const expenses = (() => {
      const fromAnalytics = asArray(
        analytics.expenses
      );

      if (fromAnalytics.length) {
        return fromAnalytics;
      }

      const fromEngine = callEngine(
        modules.expense,
        [
          "listExpenses",
          "getExpenses",
          "getAll",
          "list"
        ],
        [{
          store: getStore(),
          includeDeleted: false
        }]
      );

      if (Array.isArray(fromEngine)) {
        return fromEngine;
      }

      return asArray(
        raw.expenses ||
        raw.budget?.expenses ||
        raw.finance?.expenses
      );
    })();

    const snapshot = {
      generatedAt: new Date().toISOString(),
      raw,
      analytics,
      ai,
      payments,
      alerts,
      notifications,
      integrationHealth,
      expenses,
      currency:
        analytics.currency ||
        raw.profile?.currency ||
        "AED",
      annualBudget: nonNegative(
        analytics.annualBudget
      ),
      totalSpent: nonNegative(
        analytics.totalSpent
      ),
      remaining: number(
        analytics.remaining,
        nonNegative(analytics.annualBudget) -
        nonNegative(analytics.totalSpent)
      ),
      usagePercent: nonNegative(
        analytics.usagePercent
      ),
      healthScore: number(
        analytics.health?.score,
        0
      ),
      healthStatus:
        analytics.health?.status ||
        "unknown",
      savings:
        analytics.savings || {},
      trips:
        analytics.trips || {
          items: []
        },
      categories:
        analytics.categories || {
          items: []
        },
      monthly:
        analytics.monthly || {
          items: []
        },
      forecast:
        analytics.forecast || {},
      insights: asArray(
        analytics.insights
      ),
      recommendations: asArray(
        ai.recommendations
      ),
      activeAlerts: asArray(
        alerts.activeAlerts ||
        alerts.alerts
      ),
      unreadNotifications: asArray(
        notifications.unread
      )
    };

    state.lastSnapshot = snapshot;
    return snapshot;
  };

  const currency = (
    value,
    snapshot = state.lastSnapshot
  ) => {
    const ui = getUI();

    if (ui?.currency) {
      return ui.currency(
        number(value),
        snapshot?.currency
      );
    }

    try {
      return new Intl.NumberFormat("ar-AE", {
        style: "currency",
        currency:
          snapshot?.currency || "AED",
        maximumFractionDigits: 0
      }).format(number(value));
    } catch (error) {
      return `${Math.round(number(value)).toLocaleString("ar-AE")} ${
        snapshot?.currency || "AED"
      }`;
    }
  };

  const badge = (label, tone = "info") => {
    const ui = getUI();

    if (ui?.badge) {
      return ui.badge(label, tone);
    }

    return `
      <span class="tic-badge tic-badge-${escapeHTML(tone)}">
        ${escapeHTML(label)}
      </span>
    `;
  };

  const progress = (
    value,
    label,
    hint
  ) => {
    const ui = getUI();
    const normalized = Math.max(
      0,
      Math.min(100, number(value))
    );

    if (ui?.progress) {
      return ui.progress(normalized, {
        label,
        hint
      });
    }

    return `
      <div class="tic-budget-progress">
        <div class="tic-budget-progress-head">
          <span>${escapeHTML(label)}</span>
          <span>${escapeHTML(hint)}</span>
        </div>
        <div class="tic-budget-progress-track">
          <span style="width:${normalized}%"></span>
        </div>
      </div>
    `;
  };

  const button = ({
    label,
    action,
    tone = "secondary",
    icon = "",
    block = false,
    attrs = ""
  }) => `
    <button
      type="button"
      class="tic-btn ${
        tone === "primary"
          ? "tic-btn-primary"
          : tone === "danger"
            ? "tic-btn-danger"
            : "tic-btn-secondary"
      } ${block ? "tic-btn-block" : ""}"
      data-budget-action="${escapeHTML(action)}"
      ${attrs}
    >
      ${icon ? `<span>${escapeHTML(icon)}</span>` : ""}
      <span>${escapeHTML(label)}</span>
    </button>
  `;

  const renderViewTabs = () => {
    const tabs = [
      ["overview", "نظرة عامة"],
      ["expenses", "المصروفات"],
      ["savings", "الادخار"],
      ["payments", "الدفعات"],
      ["alerts", "التنبيهات"],
      ["reports", "التقارير"]
    ];

    return `
      <nav
        class="tic-budget-tabs"
        aria-label="أقسام الميزانية"
      >
        ${tabs
          .map(
            ([id, label]) => `
              <button
                type="button"
                class="tic-budget-tab ${
                  state.activeView === id
                    ? "is-active"
                    : ""
                }"
                data-budget-view="${id}"
              >
                ${escapeHTML(label)}
              </button>
            `
          )
          .join("")}
      </nav>
    `;
  };

  const renderHero = (snapshot) => {
    const ui = getUI();
    const unread =
      snapshot.notifications?.summary?.unread ||
      snapshot.unreadNotifications.length;

    const heroConfig = {
      badge: "Budget Intelligence",
      title: "مركز الميزانية الذكي",
      subtitle:
        "تحكم في ميزانية السفر والمصروفات والادخار والدفعات والتوقعات من منصة واحدة.",
      actions: [
        {
          label: "إضافة مصروف",
          action: "budget-add-expense",
          primary: true,
          icon: "+"
        },
        {
          label: "اسأل الذكاء المالي",
          action: "budget-ask-ai",
          icon: "✦"
        }
      ]
    };

    if (ui?.hero) {
      return `
        ${ui.hero(heroConfig)}
        ${
          unread > 0
            ? `
              <div class="tic-budget-hero-notice">
                لديك ${escapeHTML(unread)} إشعار مالي غير مقروء.
              </div>
            `
            : ""
        }
      `;
    }

    return `
      <section class="tic-budget-hero">
        <div>
          <span class="tic-chip">Budget Intelligence</span>
          <h1>مركز الميزانية الذكي</h1>
          <p>
            تحكم في ميزانية السفر والمصروفات والادخار
            والدفعات والتوقعات من منصة واحدة.
          </p>
        </div>

        <div class="tic-budget-hero-actions">
          ${button({
            label: "إضافة مصروف",
            action: "add-expense",
            tone: "primary",
            icon: "+"
          })}
          ${button({
            label: "اسأل الذكاء المالي",
            action: "ask-ai",
            icon: "✦"
          })}
        </div>
      </section>
    `;
  };

  const renderFinancialOverview = (snapshot) => {
    const remaining = snapshot.remaining;
    const over = remaining < 0;
    const usage = snapshot.usagePercent;
    const statusTone =
      over
        ? "danger"
        : usage >= 85
          ? "warning"
          : "success";

    return `
      <article class="tic-budget-overview">
        <div class="tic-budget-overview-head">
          <div>
            <small>الميزانية السنوية</small>
            <strong>
              ${escapeHTML(
                currency(
                  snapshot.annualBudget,
                  snapshot
                )
              )}
            </strong>
          </div>

          ${badge(
            over
              ? "متجاوزة"
              : usage >= 85
                ? "قريبة من الحد"
                : "ضمن الخطة",
            statusTone
          )}
        </div>

        <p class="tic-budget-overview-copy">
          ${
            over
              ? `تجاوزت الميزانية بمقدار ${escapeHTML(
                  currency(
                    Math.abs(remaining),
                    snapshot
                  )
                )}.`
              : `استخدمت ${escapeHTML(
                  Math.round(usage)
                )}% والمتبقي ${escapeHTML(
                  currency(
                    remaining,
                    snapshot
                  )
                )}.`
          }
        </p>

        ${progress(
          Math.min(100, usage),
          "استخدام الميزانية",
          `${Math.round(usage)}%`
        )}

        <div class="tic-budget-breakdown">
          <div class="tic-budget-breakdown-item">
            <small>إجمالي المصروف</small>
            <strong>
              ${escapeHTML(
                currency(
                  snapshot.totalSpent,
                  snapshot
                )
              )}
            </strong>
          </div>

          <div class="tic-budget-breakdown-item">
            <small>رصيد الادخار</small>
            <strong>
              ${escapeHTML(
                currency(
                  snapshot.savings?.balance,
                  snapshot
                )
              )}
            </strong>
          </div>

          <div class="tic-budget-breakdown-item">
            <small>الصحة المالية</small>
            <strong>
              ${escapeHTML(
                Math.round(snapshot.healthScore)
              )}/100
            </strong>
          </div>

          <div class="tic-budget-breakdown-item">
            <small>الإنفاق المتوقع</small>
            <strong>
              ${escapeHTML(
                currency(
                  snapshot.forecast?.projectedSpend,
                  snapshot
                )
              )}
            </strong>
          </div>
        </div>
      </article>
    `;
  };

  const renderKpis = (snapshot) => {
    const ui = getUI();

    const items = [
      {
        icon: "◈",
        value: currency(
          snapshot.trips?.totalPlanned,
          snapshot
        ),
        label: "ميزانيات الرحلات",
        subtitle:
          `${snapshot.trips?.totalTrips || 0} رحلة`
      },
      {
        icon: "◎",
        value: currency(
          snapshot.payments?.summary
            ?.remainingAmount,
          snapshot
        ),
        label: "دفعات متبقية",
        subtitle:
          `${snapshot.payments?.summary?.overdueCount || 0} متأخرة`
      },
      {
        icon: "!",
        value:
          snapshot.alerts?.summary?.active ||
          snapshot.activeAlerts.length,
        label: "تنبيهات نشطة",
        subtitle:
          `${snapshot.alerts?.summary?.critical || 0} حرجة`
      },
      {
        icon: "✦",
        value:
          snapshot.recommendations.length,
        label: "توصيات ذكية",
        subtitle:
          snapshot.forecast?.likelyToExceed
            ? "تحتاج إجراء"
            : "الوضع مستقر"
      }
    ];

    if (ui?.grid && ui?.stat) {
      return ui.grid(
        items
          .map((item) => ui.stat(item))
          .join(""),
        { columns: 4 }
      );
    }

    return `
      <div class="tic-budget-kpis">
        ${items
          .map(
            (item) => `
              <article class="tic-budget-kpi">
                <span>${escapeHTML(item.icon)}</span>
                <strong>${escapeHTML(item.value)}</strong>
                <h3>${escapeHTML(item.label)}</h3>
                <p>${escapeHTML(item.subtitle)}</p>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  };

  const renderTopRecommendation = (snapshot) => {
    const item =
      snapshot.recommendations[0];

    if (!item) {
      return `
        <article class="tic-card tic-card-body">
          <div class="tic-feature-row">
            <div>
              <span class="tic-chip">AI</span>
              <h3 class="tic-card-title">
                وضعك المالي منظم
              </h3>
              <p class="tic-card-text">
                لا توجد توصيات عاجلة حالياً.
              </p>
            </div>
            ${badge("ممتاز", "success")}
          </div>
        </article>
      `;
    }

    return `
      <article class="tic-card tic-card-body tic-budget-ai-card">
        <div class="tic-feature-row">
          <div>
            <span class="tic-chip">AI RECOMMENDATION</span>
            <h3 class="tic-card-title">
              ${escapeHTML(item.titleAr)}
            </h3>
          </div>

          ${badge(
            item.priority === "critical"
              ? "عاجل"
              : item.priority === "high"
                ? "مهم"
                : "اقتراح",
            item.priority === "critical"
              ? "danger"
              : item.priority === "high"
                ? "warning"
                : "info"
          )}
        </div>

        <p class="tic-card-text">
          ${escapeHTML(item.messageAr)}
        </p>

        <div class="tic-budget-inline-actions">
          ${button({
            label:
              item.actionLabelAr ||
              "تنفيذ التوصية",
            action: "run-recommendation",
            tone: "primary",
            attrs: `data-recommendation-id="${escapeHTML(
              item.id
            )}"`
          })}

          ${button({
            label: "إخفاء",
            action: "dismiss-recommendation",
            attrs: `data-recommendation-id="${escapeHTML(
              item.id
            )}"`
          })}
        </div>
      </article>
    `;
  };

  const renderUpcomingPayments = (snapshot) => {
    const items = asArray(
      snapshot.payments?.upcoming
    ).slice(0, 4);

    if (!items.length) {
      return `
        <article class="tic-card tic-card-body">
          <h3 class="tic-card-title">
            لا توجد دفعات قريبة
          </h3>
          <p class="tic-card-text">
            جميع دفعات السفر الحالية منظمة.
          </p>
        </article>
      `;
    }

    return `
      <div class="tic-settings-list">
        ${items
          .map(
            (item) => `
              <article class="tic-card tic-card-body">
                <div class="tic-feature-row">
                  <div>
                    <span class="tic-chip">
                      ${escapeHTML(
                        item.typeLabelAr ||
                        item.type ||
                        "دفعة"
                      )}
                    </span>
                    <h3 class="tic-card-title">
                      ${escapeHTML(item.title)}
                    </h3>
                    <p class="tic-card-text">
                      ${escapeHTML(
                        item.daysUntilDue === 0
                          ? "مستحقة اليوم"
                          : `تستحق خلال ${item.daysUntilDue} يوم`
                      )}
                    </p>
                  </div>

                  <strong>
                    ${escapeHTML(
                      currency(
                        item.remainingAmount,
                        snapshot
                      )
                    )}
                  </strong>
                </div>

                <div class="tic-budget-inline-actions">
                  ${button({
                    label: "تسجيل دفع",
                    action: "pay-payment",
                    tone: "primary",
                    attrs: `data-payment-id="${escapeHTML(
                      item.id
                    )}"`
                  })}
                  ${button({
                    label: "التفاصيل",
                    action: "view-payment",
                    attrs: `data-payment-id="${escapeHTML(
                      item.id
                    )}"`
                  })}
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  };

  const renderTripBudgets = (snapshot) => {
    const items = asArray(
      snapshot.trips?.items
    );

    if (!items.length) {
      const ui = getUI();

      if (ui?.empty) {
        return ui.empty({
          icon: "◈",
          title: "لا توجد ميزانيات رحلات",
          message:
            "أنشئ رحلة وحدد ميزانيتها لتظهر هنا.",
          action: {
            label: "إنشاء رحلة",
            route: "trips",
            primary: true
          }
        });
      }

      return `
        <article class="tic-card tic-card-body">
          <h3 class="tic-card-title">
            لا توجد ميزانيات رحلات
          </h3>
          <p class="tic-card-text">
            أنشئ رحلة وحدد ميزانيتها لتظهر هنا.
          </p>
        </article>
      `;
    }

    return `
      <div class="tic-settings-list">
        ${items
          .slice(0, 6)
          .map((trip) => {
            const usage = nonNegative(
              trip.usagePercent
            );

            const tone =
              trip.planned <= 0
                ? "info"
                : usage > 100
                  ? "danger"
                  : usage >= 85
                    ? "warning"
                    : "success";

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
                    <h3 class="tic-card-title">
                      ${escapeHTML(
                        trip.title ||
                        "رحلة بدون اسم"
                      )}
                    </h3>
                  </div>

                  ${badge(
                    trip.planned <= 0
                      ? "بدون ميزانية"
                      : usage > 100
                        ? "متجاوزة"
                        : usage >= 85
                          ? "قريبة"
                          : "ضمن الخطة",
                    tone
                  )}
                </div>

                <div class="tic-trip-meta">
                  <div>
                    <small>المخطط</small>
                    <strong>
                      ${escapeHTML(
                        currency(
                          trip.planned,
                          snapshot
                        )
                      )}
                    </strong>
                  </div>
                  <div>
                    <small>المصروف</small>
                    <strong>
                      ${escapeHTML(
                        currency(
                          trip.spent,
                          snapshot
                        )
                      )}
                    </strong>
                  </div>
                  <div>
                    <small>المتبقي</small>
                    <strong>
                      ${escapeHTML(
                        currency(
                          Math.max(
                            0,
                            number(trip.remaining)
                          ),
                          snapshot
                        )
                      )}
                    </strong>
                  </div>
                </div>

                <div style="margin-top:15px">
                  ${progress(
                    Math.min(100, usage),
                    "استخدام ميزانية الرحلة",
                    `${Math.round(usage)}%`
                  )}
                </div>

                <div class="tic-budget-inline-actions">
                  ${button({
                    label: "عرض الرحلة",
                    action: "open-trip",
                    attrs: `data-trip-id="${escapeHTML(
                      trip.id
                    )}"`
                  })}
                  ${button({
                    label: "إضافة مصروف",
                    action: "add-expense",
                    tone: "primary",
                    attrs: `data-trip-id="${escapeHTML(
                      trip.id
                    )}"`
                  })}
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  };

  const renderOverviewView = (snapshot) => `
    <section class="tic-budget-view" data-budget-panel="overview">
      ${renderFinancialOverview(snapshot)}

      <div class="tic-budget-section-gap">
        ${renderKpis(snapshot)}
      </div>

      <div class="tic-budget-split">
        <section>
          <div class="tic-budget-section-heading">
            <div>
              <small>SMART ACTION</small>
              <h2>أفضل إجراء الآن</h2>
            </div>
            ${button({
              label: "كل التوصيات",
              action: "show-ai"
            })}
          </div>
          ${renderTopRecommendation(snapshot)}
        </section>

        <section>
          <div class="tic-budget-section-heading">
            <div>
              <small>UPCOMING</small>
              <h2>الدفعات القادمة</h2>
            </div>
            ${button({
              label: "عرض الكل",
              action: "switch-payments"
            })}
          </div>
          ${renderUpcomingPayments(snapshot)}
        </section>
      </div>

      <section class="tic-budget-section-gap">
        <div class="tic-budget-section-heading">
          <div>
            <small>TRIP BUDGETS</small>
            <h2>ميزانيات الرحلات</h2>
          </div>
          ${button({
            label: "عرض الرحلات",
            action: "open-trips"
          })}
        </div>
        ${renderTripBudgets(snapshot)}
      </section>
    </section>
  `;

  const renderExpensesView = (snapshot) => {
    const expenses = asArray(
      snapshot.expenses
    ).slice().sort((a, b) =>
      String(
        firstDefined(
          b.date,
          b.paidAt,
          b.createdAt,
          ""
        )
      ).localeCompare(
        String(
          firstDefined(
            a.date,
            a.paidAt,
            a.createdAt,
            ""
          )
        )
      )
    );

    return `
      <section class="tic-budget-view" data-budget-panel="expenses">
        <div class="tic-budget-section-heading">
          <div>
            <small>EXPENSE CENTER</small>
            <h2>المصروفات</h2>
            <p>
              سجل مصروفات السفر واربطها بالرحلات والفئات.
            </p>
          </div>

          ${button({
            label: "إضافة مصروف",
            action: "add-expense",
            tone: "primary",
            icon: "+"
          })}
        </div>

        ${
          expenses.length
            ? `
              <div class="tic-settings-list">
                ${expenses
                  .slice(0, 40)
                  .map((item) => {
                    const id = firstDefined(
                      item.id,
                      item._id,
                      ""
                    );

                    return `
                      <article class="tic-card tic-card-body">
                        <div class="tic-feature-row">
                          <div>
                            <span class="tic-chip">
                              ${escapeHTML(
                                item.category ||
                                item.type ||
                                "أخرى"
                              )}
                            </span>
                            <h3 class="tic-card-title">
                              ${escapeHTML(
                                item.title ||
                                item.name ||
                                "مصروف"
                              )}
                            </h3>
                            <p class="tic-card-text">
                              ${escapeHTML(
                                String(
                                  firstDefined(
                                    item.date,
                                    item.paidAt,
                                    item.createdAt,
                                    ""
                                  )
                                ).slice(0, 10)
                              )}
                            </p>
                          </div>

                          <strong>
                            ${escapeHTML(
                              currency(
                                firstDefined(
                                  item.amount,
                                  item.total,
                                  item.value,
                                  0
                                ),
                                snapshot
                              )
                            )}
                          </strong>
                        </div>

                        <div class="tic-budget-inline-actions">
                          ${button({
                            label: "تعديل",
                            action: "edit-expense",
                            attrs: `data-expense-id="${escapeHTML(
                              id
                            )}"`
                          })}
                          ${button({
                            label: "حذف",
                            action: "delete-expense",
                            tone: "danger",
                            attrs: `data-expense-id="${escapeHTML(
                              id
                            )}"`
                          })}
                        </div>
                      </article>
                    `;
                  })
                  .join("")}
              </div>
            `
            : `
              <article class="tic-card tic-card-body">
                <h3 class="tic-card-title">
                  لا توجد مصروفات مسجلة
                </h3>
                <p class="tic-card-text">
                  أضف أول مصروف حتى تبدأ التحليلات الذكية.
                </p>
              </article>
            `
        }
      </section>
    `;
  };

  const renderSavingsView = (snapshot) => {
    const saving = snapshot.savings || {};
    const monthly = nonNegative(
      saving.monthlySaving
    );
    const balance = nonNegative(
      saving.balance
    );
    const coverage = nonNegative(
      saving.coveragePercent
    );

    return `
      <section class="tic-budget-view" data-budget-panel="savings">
        <div class="tic-budget-section-heading">
          <div>
            <small>SAVINGS CENTER</small>
            <h2>خطة الادخار</h2>
            <p>
              تابع صندوق السفر وحدد المبلغ الشهري المناسب.
            </p>
          </div>

          <div class="tic-budget-inline-actions">
            ${button({
              label: "إيداع",
              action: "add-saving",
              tone: "primary",
              icon: "+"
            })}
            ${button({
              label: "تعديل الخطة",
              action: "edit-saving-plan"
            })}
          </div>
        </div>

        <div class="tic-budget-savings-grid">
          <article class="tic-card tic-card-body">
            <small>رصيد صندوق السفر</small>
            <strong class="tic-stat-value">
              ${escapeHTML(
                currency(balance, snapshot)
              )}
            </strong>
            <p class="tic-card-text">
              المتبقي لتمويل الميزانية:
              ${escapeHTML(
                currency(
                  saving.remainingToFund,
                  snapshot
                )
              )}
            </p>
          </article>

          <article class="tic-card tic-card-body">
            <small>الادخار الشهري</small>
            <strong class="tic-stat-value">
              ${escapeHTML(
                currency(monthly, snapshot)
              )}
            </strong>
            <p class="tic-card-text">
              سنوياً:
              ${escapeHTML(
                currency(
                  monthly * 12,
                  snapshot
                )
              )}
            </p>
          </article>

          <article class="tic-card tic-card-body">
            <small>تغطية الميزانية</small>
            <strong class="tic-stat-value">
              ${escapeHTML(
                Math.round(coverage)
              )}%
            </strong>
            ${progress(
              coverage,
              "تغطية صندوق السفر",
              `${Math.round(coverage)}%`
            )}
          </article>
        </div>

        <div class="tic-budget-section-gap">
          ${button({
            label: "إنشاء خطة شهرية ذكية",
            action: "create-monthly-plan",
            tone: "primary",
            block: true,
            icon: "✦"
          })}
        </div>
      </section>
    `;
  };

  const renderPaymentsView = (snapshot) => {
    const payments = asArray(
      snapshot.payments?.payments
    );

    return `
      <section class="tic-budget-view" data-budget-panel="payments">
        <div class="tic-budget-section-heading">
          <div>
            <small>PAYMENT TRACKER</small>
            <h2>الدفعات والحجوزات</h2>
            <p>
              تابع الدفعات المستحقة والأقساط والمدفوعات المكتملة.
            </p>
          </div>

          ${button({
            label: "إضافة دفعة",
            action: "add-payment",
            tone: "primary",
            icon: "+"
          })}
        </div>

        <div class="tic-budget-kpis">
          <article class="tic-budget-kpi">
            <span>◎</span>
            <strong>
              ${escapeHTML(
                currency(
                  snapshot.payments?.summary
                    ?.totalAmount,
                  snapshot
                )
              )}
            </strong>
            <h3>إجمالي الدفعات</h3>
          </article>

          <article class="tic-budget-kpi">
            <span>✓</span>
            <strong>
              ${escapeHTML(
                currency(
                  snapshot.payments?.summary
                    ?.paidAmount,
                  snapshot
                )
              )}
            </strong>
            <h3>تم دفعه</h3>
          </article>

          <article class="tic-budget-kpi">
            <span>◈</span>
            <strong>
              ${escapeHTML(
                currency(
                  snapshot.payments?.summary
                    ?.remainingAmount,
                  snapshot
                )
              )}
            </strong>
            <h3>المتبقي</h3>
          </article>

          <article class="tic-budget-kpi">
            <span>!</span>
            <strong>
              ${escapeHTML(
                snapshot.payments?.summary
                  ?.overdueCount || 0
              )}
            </strong>
            <h3>متأخرة</h3>
          </article>
        </div>

        <div class="tic-settings-list tic-budget-section-gap">
          ${
            payments.length
              ? payments
                  .slice(0, 40)
                  .map(
                    (item) => `
                      <article class="tic-card tic-card-body">
                        <div class="tic-feature-row">
                          <div>
                            <span class="tic-chip">
                              ${escapeHTML(
                                item.typeLabelAr ||
                                item.type ||
                                "دفعة"
                              )}
                            </span>
                            <h3 class="tic-card-title">
                              ${escapeHTML(item.title)}
                            </h3>
                            <p class="tic-card-text">
                              ${
                                item.dueDate
                                  ? `الاستحقاق: ${escapeHTML(
                                      String(
                                        item.dueDate
                                      ).slice(0, 10)
                                    )}`
                                  : "بدون تاريخ استحقاق"
                              }
                            </p>
                          </div>

                          <div style="text-align:end">
                            <strong>
                              ${escapeHTML(
                                currency(
                                  item.remainingAmount,
                                  snapshot
                                )
                              )}
                            </strong>
                            <div style="margin-top:8px">
                              ${badge(
                                item.status === "paid"
                                  ? "مدفوعة"
                                  : item.status === "overdue"
                                    ? "متأخرة"
                                    : item.status === "partial"
                                      ? "جزئية"
                                      : "معلقة",
                                item.status === "paid"
                                  ? "success"
                                  : item.status === "overdue"
                                    ? "danger"
                                    : item.status === "partial"
                                      ? "warning"
                                      : "info"
                              )}
                            </div>
                          </div>
                        </div>

                        ${progress(
                          item.progressPercent,
                          "نسبة الدفع",
                          `${Math.round(
                            nonNegative(
                              item.progressPercent
                            )
                          )}%`
                        )}

                        <div class="tic-budget-inline-actions">
                          ${
                            item.status !== "paid" &&
                            item.status !== "refunded" &&
                            item.status !== "cancelled"
                              ? button({
                                  label: "تسجيل دفع",
                                  action: "pay-payment",
                                  tone: "primary",
                                  attrs: `data-payment-id="${escapeHTML(
                                    item.id
                                  )}"`
                                })
                              : ""
                          }
                          ${button({
                            label: "تعديل",
                            action: "edit-payment",
                            attrs: `data-payment-id="${escapeHTML(
                              item.id
                            )}"`
                          })}
                          ${button({
                            label: "حذف",
                            action: "delete-payment",
                            tone: "danger",
                            attrs: `data-payment-id="${escapeHTML(
                              item.id
                            )}"`
                          })}
                        </div>
                      </article>
                    `
                  )
                  .join("")
              : `
                <article class="tic-card tic-card-body">
                  <h3 class="tic-card-title">
                    لا توجد دفعات
                  </h3>
                  <p class="tic-card-text">
                    أضف حجوزات الطيران والفنادق والأقساط لتتبعها.
                  </p>
                </article>
              `
          }
        </div>
      </section>
    `;
  };

  const renderAlertsView = (snapshot) => {
    const alerts = snapshot.activeAlerts;

    return `
      <section class="tic-budget-view" data-budget-panel="alerts">
        <div class="tic-budget-section-heading">
          <div>
            <small>RISK CENTER</small>
            <h2>التنبيهات المالية</h2>
            <p>
              المخاطر والمصروفات غير الاعتيادية والدفعات المتأخرة.
            </p>
          </div>

          ${button({
            label: "تحديث التحليل",
            action: "refresh-alerts"
          })}
        </div>

        <div class="tic-settings-list">
          ${
            alerts.length
              ? alerts
                  .slice(0, 50)
                  .map(
                    (item) => `
                      <article class="tic-card tic-card-body">
                        <div class="tic-feature-row">
                          <div>
                            <span class="tic-chip">
                              ${escapeHTML(item.type)}
                            </span>
                            <h3 class="tic-card-title">
                              ${escapeHTML(item.titleAr)}
                            </h3>
                          </div>

                          ${badge(
                            item.severity === "critical"
                              ? "حرج"
                              : item.severity === "high"
                                ? "مرتفع"
                                : item.severity === "medium"
                                  ? "متوسط"
                                  : "معلومة",
                            item.severity === "critical"
                              ? "danger"
                              : item.severity === "high"
                                ? "warning"
                                : "info"
                          )}
                        </div>

                        <p class="tic-card-text">
                          ${escapeHTML(item.messageAr)}
                        </p>

                        <div class="tic-budget-inline-actions">
                          ${button({
                            label:
                              item.actionLabelAr ||
                              "فتح",
                            action: "run-alert-action",
                            tone: "primary",
                            attrs: `data-alert-id="${escapeHTML(
                              item.id
                            )}"`
                          })}
                          ${button({
                            label: "تمت المراجعة",
                            action: "acknowledge-alert",
                            attrs: `data-alert-id="${escapeHTML(
                              item.id
                            )}"`
                          })}
                          ${button({
                            label: "تأجيل",
                            action: "snooze-alert",
                            attrs: `data-alert-id="${escapeHTML(
                              item.id
                            )}"`
                          })}
                        </div>
                      </article>
                    `
                  )
                  .join("")
              : `
                <article class="tic-card tic-card-body">
                  <h3 class="tic-card-title">
                    لا توجد تنبيهات نشطة
                  </h3>
                  <p class="tic-card-text">
                    الوضع المالي منظم حالياً.
                  </p>
                </article>
              `
          }
        </div>
      </section>
    `;
  };

  const renderReportsView = (snapshot) => {
    const categories = asArray(
      snapshot.categories?.items
    ).slice(0, 6);

    const months = asArray(
      snapshot.monthly?.items
    );

    return `
      <section class="tic-budget-view" data-budget-panel="reports">
        <div class="tic-budget-section-heading">
          <div>
            <small>REPORTS & EXPORT</small>
            <h2>التقارير المالية</h2>
            <p>
              صدّر البيانات وراجع التوقعات والفئات والاتجاهات.
            </p>
          </div>

          <div class="tic-budget-inline-actions">
            ${button({
              label: "تصدير CSV",
              action: "export-csv"
            })}
            ${button({
              label: "تصدير JSON",
              action: "export-json"
            })}
            ${button({
              label: "طباعة التقرير",
              action: "print-report",
              tone: "primary"
            })}
          </div>
        </div>

        <div class="tic-budget-split">
          <article class="tic-card tic-card-body">
            <h3 class="tic-card-title">
              التوقع السنوي
            </h3>

            <div class="tic-trip-meta">
              <div>
                <small>الإنفاق المتوقع</small>
                <strong>
                  ${escapeHTML(
                    currency(
                      snapshot.forecast?.projectedSpend,
                      snapshot
                    )
                  )}
                </strong>
              </div>

              <div>
                <small>التجاوز المتوقع</small>
                <strong>
                  ${escapeHTML(
                    currency(
                      snapshot.forecast?.expectedOverrun,
                      snapshot
                    )
                  )}
                </strong>
              </div>

              <div>
                <small>الحد الشهري المقترح</small>
                <strong>
                  ${escapeHTML(
                    currency(
                      snapshot.forecast
                        ?.recommendedMonthlyLimit,
                      snapshot
                    )
                  )}
                </strong>
              </div>
            </div>
          </article>

          <article class="tic-card tic-card-body">
            <h3 class="tic-card-title">
              صحة النظام
            </h3>

            <div class="tic-trip-meta">
              <div>
                <small>جاهزية المنصة</small>
                <strong>
                  ${escapeHTML(
                    snapshot.integrationHealth?.score ||
                    0
                  )}%
                </strong>
              </div>

              <div>
                <small>المحركات الجاهزة</small>
                <strong>
                  ${escapeHTML(
                    snapshot.integrationHealth
                      ?.readyModules || 0
                  )}
                </strong>
              </div>

              <div>
                <small>آخر مزامنة</small>
                <strong>
                  ${escapeHTML(
                    String(
                      snapshot.integrationHealth
                        ?.lastSyncAt || "-"
                    ).slice(0, 16)
                  )}
                </strong>
              </div>
            </div>
          </article>
        </div>

        <div class="tic-budget-split tic-budget-section-gap">
          <article class="tic-card tic-card-body">
            <h3 class="tic-card-title">
              أعلى فئات الإنفاق
            </h3>

            ${
              categories.length
                ? categories
                    .map(
                      (item) => `
                        <div class="tic-budget-report-row">
                          <span>
                            ${escapeHTML(
                              item.labelAr ||
                              item.key
                            )}
                          </span>
                          <strong>
                            ${escapeHTML(
                              currency(
                                item.amount,
                                snapshot
                              )
                            )}
                          </strong>
                        </div>
                      `
                    )
                    .join("")
                : `
                  <p class="tic-card-text">
                    لا توجد بيانات فئات كافية.
                  </p>
                `
            }
          </article>

          <article class="tic-card tic-card-body">
            <h3 class="tic-card-title">
              الإنفاق الشهري
            </h3>

            ${
              months.length
                ? months
                    .slice(-6)
                    .map(
                      (item) => `
                        <div class="tic-budget-report-row">
                          <span>
                            ${escapeHTML(
                              item.labelAr ||
                              item.key
                            )}
                          </span>
                          <strong>
                            ${escapeHTML(
                              currency(
                                item.amount,
                                snapshot
                              )
                            )}
                          </strong>
                        </div>
                      `
                    )
                    .join("")
                : `
                  <p class="tic-card-text">
                    لا توجد بيانات شهرية كافية.
                  </p>
                `
            }
          </article>
        </div>
      </section>
    `;
  };

  const renderActiveView = (snapshot) => {
    if (state.activeView === VIEWS.EXPENSES) {
      return renderExpensesView(snapshot);
    }

    if (state.activeView === VIEWS.SAVINGS) {
      return renderSavingsView(snapshot);
    }

    if (state.activeView === VIEWS.PAYMENTS) {
      return renderPaymentsView(snapshot);
    }

    if (state.activeView === VIEWS.ALERTS) {
      return renderAlertsView(snapshot);
    }

    if (state.activeView === VIEWS.REPORTS) {
      return renderReportsView(snapshot);
    }

    return renderOverviewView(snapshot);
  };

  const renderPage = (snapshot) => `
    <div
      class="tic-module tic-budget-platform"
      data-page="budget"
      data-page-version="${PAGE_VERSION}"
    >
      ${renderHero(snapshot)}
      ${renderViewTabs()}
      ${renderActiveView(snapshot)}
      <div data-budget-dialog-root></div>
    </div>
  `;

  const renderDialogShell = ({
    title,
    subtitle = "",
    body = "",
    submitLabel = "حفظ",
    submitAction = "",
    danger = false
  }) => `
    <div class="tic-budget-dialog-backdrop" data-budget-dialog-backdrop>
      <section
        class="tic-budget-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="${escapeHTML(title)}"
      >
        <header class="tic-budget-dialog-head">
          <div>
            <h2>${escapeHTML(title)}</h2>
            ${
              subtitle
                ? `<p>${escapeHTML(subtitle)}</p>`
                : ""
            }
          </div>

          <button
            type="button"
            class="tic-budget-dialog-close"
            data-budget-action="close-dialog"
            aria-label="إغلاق"
          >
            ×
          </button>
        </header>

        <div class="tic-budget-dialog-body">
          ${body}
        </div>

        <footer class="tic-budget-dialog-footer">
          ${button({
            label: "إلغاء",
            action: "close-dialog"
          })}

          ${
            submitAction
              ? button({
                  label: submitLabel,
                  action: submitAction,
                  tone: danger
                    ? "danger"
                    : "primary"
                })
              : ""
          }
        </footer>
      </section>
    </div>
  `;

  const formField = ({
    label,
    name,
    type = "text",
    value = "",
    placeholder = "",
    required = false,
    options = null
  }) => {
    if (Array.isArray(options)) {
      return `
        <label class="tic-budget-field">
          <span>${escapeHTML(label)}</span>
          <select
            name="${escapeHTML(name)}"
            ${required ? "required" : ""}
          >
            ${options
              .map(
                (item) => `
                  <option
                    value="${escapeHTML(item.value)}"
                    ${
                      String(item.value) ===
                      String(value)
                        ? "selected"
                        : ""
                    }
                  >
                    ${escapeHTML(item.label)}
                  </option>
                `
              )
              .join("")}
          </select>
        </label>
      `;
    }

    return `
      <label class="tic-budget-field">
        <span>${escapeHTML(label)}</span>
        <input
          type="${escapeHTML(type)}"
          name="${escapeHTML(name)}"
          value="${escapeHTML(value)}"
          placeholder="${escapeHTML(placeholder)}"
          ${required ? "required" : ""}
        >
      </label>
    `;
  };

  const openDialog = (
    name,
    payload = {}
  ) => {
    if (!state.container) return false;

    const root = state.container.querySelector(
      "[data-budget-dialog-root]"
    );

    if (!root) return false;

    const snapshot =
      state.lastSnapshot ||
      buildSnapshot();

    let html = "";

    if (name === "expense") {
      const expense = payload.expense || {};
      const tripOptions = [
        {
          value: "",
          label: "بدون رحلة"
        },
        ...asArray(snapshot.trips?.items).map(
          (trip) => ({
            value: trip.id,
            label: trip.title
          })
        )
      ];

      html = renderDialogShell({
        title:
          payload.mode === "edit"
            ? "تعديل المصروف"
            : "إضافة مصروف",
        subtitle:
          "سجّل تفاصيل المصروف ليظهر في التحليلات والميزانية.",
        submitLabel:
          payload.mode === "edit"
            ? "حفظ التعديل"
            : "إضافة المصروف",
        submitAction: "submit-expense",
        body: `
          <form
            class="tic-budget-form"
            data-budget-form="expense"
            data-mode="${escapeHTML(
              payload.mode || "create"
            )}"
            data-expense-id="${escapeHTML(
              firstDefined(
                expense.id,
                expense._id,
                ""
              )
            )}"
          >
            ${formField({
              label: "اسم المصروف",
              name: "title",
              value:
                expense.title ||
                expense.name ||
                "",
              placeholder:
                "مثال: تذاكر الطيران",
              required: true
            })}

            <div class="tic-budget-form-grid">
              ${formField({
                label: "القيمة",
                name: "amount",
                type: "number",
                value: firstDefined(
                  expense.amount,
                  expense.total,
                  ""
                ),
                required: true
              })}

              ${formField({
                label: "التاريخ",
                name: "date",
                type: "date",
                value: String(
                  firstDefined(
                    expense.date,
                    expense.paidAt,
                    new Date().toISOString()
                  )
                ).slice(0, 10),
                required: true
              })}
            </div>

            <div class="tic-budget-form-grid">
              ${formField({
                label: "الفئة",
                name: "category",
                value:
                  expense.category ||
                  "other",
                options: [
                  { value: "flights", label: "الطيران" },
                  { value: "hotels", label: "الفنادق" },
                  { value: "food", label: "المطاعم" },
                  { value: "transport", label: "المواصلات" },
                  { value: "activities", label: "الأنشطة" },
                  { value: "shopping", label: "التسوق" },
                  { value: "insurance", label: "التأمين" },
                  { value: "visa", label: "التأشيرة" },
                  { value: "connectivity", label: "الاتصال" },
                  { value: "other", label: "أخرى" }
                ]
              })}

              ${formField({
                label: "الرحلة",
                name: "tripId",
                value: firstDefined(
                  payload.tripId,
                  expense.tripId,
                  ""
                ),
                options: tripOptions
              })}
            </div>

            ${formField({
              label: "طريقة الدفع",
              name: "paymentMethod",
              value:
                expense.paymentMethod ||
                "card",
              options: [
                { value: "card", label: "بطاقة" },
                { value: "cash", label: "نقداً" },
                { value: "bank-transfer", label: "تحويل بنكي" },
                { value: "apple-pay", label: "Apple Pay" },
                { value: "other", label: "أخرى" }
              ]
            })}
          </form>
        `
      });
    }

    if (name === "saving") {
      html = renderDialogShell({
        title: "إضافة مبلغ للادخار",
        subtitle:
          "أضف إيداعاً جديداً إلى صندوق السفر.",
        submitLabel: "إضافة الإيداع",
        submitAction: "submit-saving",
        body: `
          <form
            class="tic-budget-form"
            data-budget-form="saving"
          >
            ${formField({
              label: "القيمة",
              name: "amount",
              type: "number",
              required: true
            })}

            ${formField({
              label: "التاريخ",
              name: "date",
              type: "date",
              value:
                new Date()
                  .toISOString()
                  .slice(0, 10),
              required: true
            })}

            ${formField({
              label: "ملاحظة",
              name: "notes",
              placeholder:
                "مثال: ادخار شهر يوليو"
            })}
          </form>
        `
      });
    }

    if (name === "saving-plan") {
      html = renderDialogShell({
        title: "تعديل خطة الادخار",
        subtitle:
          "حدد المبلغ الشهري الذي تريد تحويله لصندوق السفر.",
        submitLabel: "حفظ الخطة",
        submitAction: "submit-saving-plan",
        body: `
          <form
            class="tic-budget-form"
            data-budget-form="saving-plan"
          >
            ${formField({
              label: "الادخار الشهري",
              name: "monthlySaving",
              type: "number",
              value:
                snapshot.savings?.monthlySaving ||
                0,
              required: true
            })}
          </form>
        `
      });
    }

    if (name === "payment") {
      const payment = payload.payment || {};

      html = renderDialogShell({
        title:
          payload.mode === "edit"
            ? "تعديل الدفعة"
            : "إضافة دفعة",
        subtitle:
          "أضف دفعة حجز أو قسط وتاريخ الاستحقاق.",
        submitLabel:
          payload.mode === "edit"
            ? "حفظ التعديل"
            : "إضافة الدفعة",
        submitAction: "submit-payment",
        body: `
          <form
            class="tic-budget-form"
            data-budget-form="payment"
            data-mode="${escapeHTML(
              payload.mode || "create"
            )}"
            data-payment-id="${escapeHTML(
              payment.id || ""
            )}"
          >
            ${formField({
              label: "اسم الدفعة",
              name: "title",
              value: payment.title || "",
              placeholder:
                "مثال: دفعة الفندق",
              required: true
            })}

            <div class="tic-budget-form-grid">
              ${formField({
                label: "القيمة",
                name: "amount",
                type: "number",
                value:
                  payment.amount || "",
                required: true
              })}

              ${formField({
                label: "تاريخ الاستحقاق",
                name: "dueDate",
                type: "date",
                value:
                  String(
                    payment.dueDate || ""
                  ).slice(0, 10),
                required: true
              })}
            </div>

            <div class="tic-budget-form-grid">
              ${formField({
                label: "النوع",
                name: "type",
                value:
                  payment.type || "other",
                options: [
                  { value: "flight", label: "طيران" },
                  { value: "hotel", label: "فندق" },
                  { value: "transport", label: "مواصلات" },
                  { value: "activity", label: "نشاط" },
                  { value: "insurance", label: "تأمين" },
                  { value: "visa", label: "تأشيرة" },
                  { value: "installment", label: "قسط" },
                  { value: "other", label: "أخرى" }
                ]
              })}

              ${formField({
                label: "طريقة الدفع",
                name: "paymentMethod",
                value:
                  payment.paymentMethod ||
                  "card",
                options: [
                  { value: "card", label: "بطاقة" },
                  { value: "cash", label: "نقداً" },
                  { value: "bank-transfer", label: "تحويل بنكي" },
                  { value: "apple-pay", label: "Apple Pay" },
                  { value: "other", label: "أخرى" }
                ]
              })}
            </div>
          </form>
        `
      });
    }

    if (name === "pay-payment") {
      html = renderDialogShell({
        title: "تسجيل دفع",
        subtitle:
          "أدخل المبلغ المدفوع لهذه الدفعة.",
        submitLabel: "تسجيل الدفع",
        submitAction: "submit-payment-record",
        body: `
          <form
            class="tic-budget-form"
            data-budget-form="payment-record"
            data-payment-id="${escapeHTML(
              payload.paymentId
            )}"
          >
            ${formField({
              label: "المبلغ المدفوع",
              name: "amount",
              type: "number",
              value:
                payload.payment?.remainingAmount ||
                "",
              required: true
            })}

            ${formField({
              label: "تاريخ الدفع",
              name: "paidAt",
              type: "date",
              value:
                new Date()
                  .toISOString()
                  .slice(0, 10),
              required: true
            })}
          </form>
        `
      });
    }

    if (name === "ask-ai") {
      html = renderDialogShell({
        title: "اسأل الذكاء المالي",
        subtitle:
          "اسأل عن الميزانية أو الادخار أو التوقعات.",
        submitLabel: "إرسال السؤال",
        submitAction: "submit-ai-question",
        body: `
          <form
            class="tic-budget-form"
            data-budget-form="ai-question"
          >
            <label class="tic-budget-field">
              <span>السؤال</span>
              <textarea
                name="question"
                rows="4"
                required
                placeholder="مثال: وين أقدر أوفر؟"
              ></textarea>
            </label>

            <div class="tic-budget-quick-questions">
              <button type="button" data-ai-question="كم باقي من ميزانيتي؟">
                كم باقي؟
              </button>
              <button type="button" data-ai-question="هل بتجاوز الميزانية؟">
                هل بتجاوز؟
              </button>
              <button type="button" data-ai-question="وين أقدر أوفر؟">
                وين أوفر؟
              </button>
              <button type="button" data-ai-question="سو لي خطة شهرية">
                خطة شهرية
              </button>
            </div>
          </form>

          <div data-ai-answer></div>
        `
      });
    }

    if (name === "monthly-plan") {
      const plan = payload.plan || {};

      html = renderDialogShell({
        title: "الخطة الشهرية الذكية",
        subtitle:
          "توزيع مقترح للمتبقي والادخار والاحتياطي.",
        submitLabel: "إغلاق",
        submitAction: "close-dialog",
        body: `
          <div class="tic-budget-plan-summary">
            <article>
              <small>حد الإنفاق الشهري</small>
              <strong>
                ${escapeHTML(
                  currency(
                    plan.monthlySpendingLimit,
                    snapshot
                  )
                )}
              </strong>
            </article>
            <article>
              <small>الادخار الشهري</small>
              <strong>
                ${escapeHTML(
                  currency(
                    plan.monthlySavingTarget,
                    snapshot
                  )
                )}
              </strong>
            </article>
            <article>
              <small>الاحتياطي</small>
              <strong>
                ${escapeHTML(
                  currency(
                    plan.reserve,
                    snapshot
                  )
                )}
              </strong>
            </article>
          </div>

          <p class="tic-card-text">
            ${escapeHTML(
              plan.summaryAr || ""
            )}
          </p>
        `
      });
    }

    if (!html) return false;

    root.innerHTML = html;
    state.activeDialog = name;

    document.body.classList.add(
      "tic-budget-dialog-open"
    );

    root
      .querySelector(
        "input, select, textarea"
      )
      ?.focus();

    return true;
  };

  const closeDialog = () => {
    if (!state.container) return false;

    const root = state.container.querySelector(
      "[data-budget-dialog-root]"
    );

    if (root) {
      root.innerHTML = "";
    }

    state.activeDialog = null;

    document.body.classList.remove(
      "tic-budget-dialog-open"
    );

    return true;
  };

  const formData = (name) => {
    const form = state.container?.querySelector(
      `[data-budget-form="${name}"]`
    );

    if (!form) return null;

    if (!form.reportValidity()) {
      return null;
    }

    return {
      form,
      values: Object.fromEntries(
        new FormData(form).entries()
      )
    };
  };

  const refresh = ({
    preserveScroll = true
  } = {}) => {
    if (
      !state.container ||
      !state.mounted ||
      state.refreshing
    ) {
      return false;
    }

    state.refreshing = true;

    const scrollTop = preserveScroll
      ? window.scrollY
      : 0;

    try {
      const snapshot = buildSnapshot();

      state.container.innerHTML =
        renderPage(snapshot);

      if (preserveScroll) {
        window.requestAnimationFrame(() =>
          window.scrollTo({
            top: scrollTop,
            behavior: "auto"
          })
        );
      }

      emit("refreshed", {
        annualBudget:
          snapshot.annualBudget,
        totalSpent:
          snapshot.totalSpent,
        usagePercent:
          snapshot.usagePercent,
        activeView:
          state.activeView
      });

      return true;
    } finally {
      state.refreshing = false;
    }
  };

  const scheduleRefresh = () => {
    if (state.refreshTimer) {
      window.clearTimeout(
        state.refreshTimer
      );
    }

    state.refreshTimer =
      window.setTimeout(() => {
        state.refreshTimer = null;

        if (state.mounted) {
          refresh();
        }
      }, 100);
  };

  const executeSourceAction = (
    sourceItem
  ) => {
    const action = sourceItem?.action;

    if (!action?.name) {
      return false;
    }

    const actionName = action.name;
    const payload = action.payload || {};

    if (
      actionName.includes("trip") &&
      payload.tripId
    ) {
      getRouter()?.go?.(
        "trips",
        {
          view: "details",
          tripId: payload.tripId
        }
      );

      return true;
    }

    if (
      actionName.includes("payment") &&
      payload.paymentId
    ) {
      state.activeView = VIEWS.PAYMENTS;
      refresh({ preserveScroll: false });
      return true;
    }

    if (
      actionName.includes("expense") &&
      payload.expenseId
    ) {
      state.activeView = VIEWS.EXPENSES;
      refresh({ preserveScroll: false });
      return true;
    }

    if (
      actionName.includes("saving")
    ) {
      state.activeView = VIEWS.SAVINGS;
      refresh({ preserveScroll: false });
      return true;
    }

    if (
      actionName.includes("report") ||
      actionName.includes("forecast")
    ) {
      state.activeView = VIEWS.REPORTS;
      refresh({ preserveScroll: false });
      return true;
    }

    return false;
  };

  const handleAction = async (
    action,
    target
  ) => {
    const modules = engines();
    const snapshot =
      state.lastSnapshot ||
      buildSnapshot();

    if (action === "close-dialog") {
      closeDialog();
      return;
    }

    if (action === "add-expense") {
      openDialog("expense", {
        tripId:
          target.dataset.tripId || ""
      });
      return;
    }

    if (action === "edit-expense") {
      const id =
        target.dataset.expenseId;

      const expense = snapshot.expenses.find(
        (item) =>
          String(
            firstDefined(
              item.id,
              item._id
            )
          ) === String(id)
      );

      if (expense) {
        openDialog("expense", {
          mode: "edit",
          expense
        });
      }

      return;
    }

    if (action === "submit-expense") {
      const result = formData("expense");

      if (!result) return;

      const { form, values } = result;
      const mode = form.dataset.mode;
      const id = form.dataset.expenseId;

      const payload = {
        title: values.title,
        amount: nonNegative(values.amount),
        date: values.date,
        category: values.category,
        tripId: values.tripId || null,
        paymentMethod:
          values.paymentMethod,
        currency: snapshot.currency,
        status: "paid"
      };

      let saved = null;

      if (mode === "edit" && id) {
        saved = callEngine(
          modules.expense,
          ["updateExpense", "update"],
          [
            id,
            payload,
            { store: getStore() }
          ]
        );
      } else {
        saved = callEngine(
          modules.expense,
          ["createExpense", "create", "addExpense"],
          [
            payload,
            { store: getStore() }
          ]
        );
      }

      if (saved === null) {
        notify(
          "تعذر حفظ المصروف عبر المحرك.",
          "danger"
        );
        return;
      }

      closeDialog();
      notify(
        mode === "edit"
          ? "تم تعديل المصروف."
          : "تمت إضافة المصروف.",
        "success"
      );
      scheduleRefresh();
      return;
    }

    if (action === "delete-expense") {
      const id =
        target.dataset.expenseId;

      if (
        !window.confirm(
          "هل تريد حذف هذا المصروف؟"
        )
      ) {
        return;
      }

      const result = callEngine(
        modules.expense,
        ["deleteExpense", "removeExpense", "delete"],
        [
          id,
          { store: getStore() }
        ]
      );

      if (result === null) {
        notify(
          "تعذر حذف المصروف.",
          "danger"
        );
        return;
      }

      notify(
        "تم حذف المصروف.",
        "success"
      );
      scheduleRefresh();
      return;
    }

    if (action === "add-saving") {
      openDialog("saving");
      return;
    }

    if (action === "submit-saving") {
      const result = formData("saving");

      if (!result) return;

      const payload = {
        amount: nonNegative(
          result.values.amount
        ),
        date: result.values.date,
        notes: result.values.notes,
        type: "deposit"
      };

      const saved = callEngine(
        modules.savings,
        [
          "addDeposit",
          "createEntry",
          "addEntry",
          "deposit"
        ],
        [
          payload,
          { store: getStore() }
        ]
      );

      if (saved === null) {
        notify(
          "تعذر إضافة مبلغ الادخار.",
          "danger"
        );
        return;
      }

      closeDialog();
      notify(
        "تمت إضافة مبلغ الادخار.",
        "success"
      );
      scheduleRefresh();
      return;
    }

    if (action === "edit-saving-plan") {
      openDialog("saving-plan");
      return;
    }

    if (action === "submit-saving-plan") {
      const result =
        formData("saving-plan");

      if (!result) return;

      const monthlySaving =
        nonNegative(
          result.values.monthlySaving
        );

      const saved = callEngine(
        modules.savings,
        [
          "setMonthlySaving",
          "updatePlan",
          "setPlan",
          "savePlan"
        ],
        [
          {
            monthlySaving
          },
          { store: getStore() }
        ]
      );

      if (saved === null) {
        notify(
          "تعذر حفظ خطة الادخار.",
          "danger"
        );
        return;
      }

      closeDialog();
      notify(
        "تم تحديث خطة الادخار.",
        "success"
      );
      scheduleRefresh();
      return;
    }

    if (action === "create-monthly-plan") {
      const plan = callEngine(
        modules.ai,
        ["createMonthlyPlan"],
        [{ store: getStore() }]
      );

      if (!plan) {
        notify(
          "تعذر إنشاء الخطة الذكية.",
          "danger"
        );
        return;
      }

      openDialog("monthly-plan", {
        plan
      });
      return;
    }

    if (action === "add-payment") {
      openDialog("payment");
      return;
    }

    if (action === "edit-payment") {
      const id =
        target.dataset.paymentId;

      const payment =
        asArray(
          snapshot.payments?.payments
        ).find(
          (item) =>
            String(item.id) === String(id)
        );

      if (payment) {
        openDialog("payment", {
          mode: "edit",
          payment
        });
      }

      return;
    }

    if (action === "submit-payment") {
      const result = formData("payment");

      if (!result) return;

      const { form, values } = result;

      const payload = {
        title: values.title,
        amount: nonNegative(
          values.amount
        ),
        dueDate: values.dueDate,
        type: values.type,
        paymentMethod:
          values.paymentMethod,
        currency: snapshot.currency,
        status: "pending"
      };

      const saved =
        form.dataset.mode === "edit"
          ? callEngine(
              modules.payments,
              ["updatePayment"],
              [
                form.dataset.paymentId,
                payload,
                { store: getStore() }
              ]
            )
          : callEngine(
              modules.payments,
              ["createPayment"],
              [
                payload,
                { store: getStore() }
              ]
            );

      if (!saved) {
        notify(
          "تعذر حفظ الدفعة.",
          "danger"
        );
        return;
      }

      closeDialog();
      notify(
        "تم حفظ الدفعة.",
        "success"
      );
      scheduleRefresh();
      return;
    }

    if (action === "pay-payment") {
      const id =
        target.dataset.paymentId;

      const payment =
        asArray(
          snapshot.payments?.payments
        ).find(
          (item) =>
            String(item.id) === String(id)
        );

      openDialog("pay-payment", {
        paymentId: id,
        payment
      });
      return;
    }

    if (
      action === "submit-payment-record"
    ) {
      const result =
        formData("payment-record");

      if (!result) return;

      const saved = callEngine(
        modules.payments,
        ["recordPayment", "markPaid"],
        [
          result.form.dataset.paymentId,
          {
            amount: nonNegative(
              result.values.amount
            ),
            paidAt:
              result.values.paidAt,
            createExpense: true
          },
          { store: getStore() }
        ]
      );

      if (!saved) {
        notify(
          "تعذر تسجيل الدفع.",
          "danger"
        );
        return;
      }

      closeDialog();
      notify(
        "تم تسجيل الدفع وربطه بالمصروفات.",
        "success"
      );
      scheduleRefresh();
      return;
    }

    if (action === "delete-payment") {
      const id =
        target.dataset.paymentId;

      if (
        !window.confirm(
          "هل تريد حذف هذه الدفعة؟"
        )
      ) {
        return;
      }

      const result = callEngine(
        modules.payments,
        ["deletePayment"],
        [
          id,
          { store: getStore() }
        ]
      );

      if (!result) {
        notify(
          "تعذر حذف الدفعة.",
          "danger"
        );
        return;
      }

      notify(
        "تم حذف الدفعة.",
        "success"
      );
      scheduleRefresh();
      return;
    }

    if (action === "ask-ai") {
      openDialog("ask-ai");
      return;
    }

    if (action === "submit-ai-question") {
      const result =
        formData("ai-question");

      if (!result) return;

      const answer = callEngine(
        modules.ai,
        ["answerQuestion", "ask"],
        [
          result.values.question,
          { store: getStore() }
        ]
      );

      const output =
        state.container?.querySelector(
          "[data-ai-answer]"
        );

      if (!answer || !output) {
        notify(
          "تعذر الحصول على إجابة.",
          "danger"
        );
        return;
      }

      output.innerHTML = `
        <article class="tic-card tic-card-body tic-budget-ai-answer">
          <span class="tic-chip">AI ANSWER</span>
          <p>${escapeHTML(answer.answerAr || answer.answer)}</p>
        </article>
      `;

      return;
    }

    if (
      action === "run-recommendation"
    ) {
      const id =
        target.dataset.recommendationId;

      const item =
        snapshot.recommendations.find(
          (entry) =>
            String(entry.id) === String(id)
        );

      if (
        !executeSourceAction(item)
      ) {
        notify(
          item?.messageAr ||
          "تم فتح التوصية.",
          "info"
        );
      }

      return;
    }

    if (
      action === "dismiss-recommendation"
    ) {
      const id =
        target.dataset.recommendationId;

      callEngine(
        modules.ai,
        ["dismissRecommendation"],
        [
          id,
          { store: getStore() }
        ]
      );

      notify(
        "تم إخفاء التوصية.",
        "success"
      );
      scheduleRefresh();
      return;
    }

    if (action === "run-alert-action") {
      const id =
        target.dataset.alertId;

      const item =
        snapshot.activeAlerts.find(
          (entry) =>
            String(entry.id) === String(id)
        );

      if (!executeSourceAction(item)) {
        notify(
          item?.messageAr ||
          "تم فتح التنبيه.",
          "info"
        );
      }

      return;
    }

    if (action === "acknowledge-alert") {
      const id =
        target.dataset.alertId;

      callEngine(
        modules.alerts,
        ["acknowledgeAlert"],
        [
          id,
          { store: getStore() }
        ]
      );

      notify(
        "تمت مراجعة التنبيه.",
        "success"
      );
      scheduleRefresh();
      return;
    }

    if (action === "snooze-alert") {
      const id =
        target.dataset.alertId;

      callEngine(
        modules.alerts,
        ["snoozeAlert"],
        [
          id,
          new Date(
            Date.now() +
            24 * 60 * 60 * 1000
          ).toISOString(),
          { store: getStore() }
        ]
      );

      notify(
        "تم تأجيل التنبيه ليوم واحد.",
        "success"
      );
      scheduleRefresh();
      return;
    }

    if (action === "refresh-alerts") {
      callEngine(
        modules.alerts,
        ["refresh"],
        [{ store: getStore() }]
      );

      notify(
        "تم تحديث التنبيهات.",
        "success"
      );
      scheduleRefresh();
      return;
    }

    if (action === "export-csv") {
      callEngine(
        modules.export,
        ["downloadReport"],
        [{
          store: getStore(),
          report: "expenses",
          format: "csv"
        }]
      );
      return;
    }

    if (action === "export-json") {
      callEngine(
        modules.export,
        ["downloadReport"],
        [{
          store: getStore(),
          report: "full",
          format: "json"
        }]
      );
      return;
    }

    if (action === "print-report") {
      callEngine(
        modules.export,
        ["printReport"],
        [{
          store: getStore(),
          report: "executive",
          format: "html"
        }]
      );
      return;
    }

    if (
      action === "switch-payments"
    ) {
      state.activeView = VIEWS.PAYMENTS;
      refresh({ preserveScroll: false });
      return;
    }

    if (action === "show-ai") {
      openDialog("ask-ai");
      return;
    }

    if (action === "open-trips") {
      getRouter()?.go?.("trips");
      return;
    }

    if (action === "open-trip") {
      getRouter()?.go?.(
        "trips",
        {
          view: "details",
          tripId: target.dataset.tripId
        }
      );
    }
  };

  const onContainerClick = (event) => {
    const question = event.target.closest(
      "[data-ai-question]"
    );

    if (question) {
      const textarea =
        state.container?.querySelector(
          '[data-budget-form="ai-question"] textarea'
        );

      if (textarea) {
        textarea.value =
          question.dataset.aiQuestion;
        textarea.focus();
      }

      return;
    }

    const view = event.target.closest(
      "[data-budget-view]"
    );

    if (view) {
      state.activeView =
        view.dataset.budgetView;

      refresh({ preserveScroll: false });
      return;
    }

    const target = event.target.closest(
      "[data-budget-action]"
    );

    if (!target) {
      if (
        event.target.matches(
          "[data-budget-dialog-backdrop]"
        )
      ) {
        closeDialog();
      }

      return;
    }

    event.preventDefault();

    handleAction(
      target.dataset.budgetAction,
      target
    ).catch((error) => {
      console.error(
        "TIC Budget action failed:",
        error
      );

      notify(
        "حدث خطأ أثناء تنفيذ العملية.",
        "danger"
      );
    });
  };

  const bindContainerEvents = () => {
    if (!state.container) return;

    state.container.removeEventListener(
      "click",
      onContainerClick
    );

    state.container.addEventListener(
      "click",
      onContainerClick
    );
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
        ui.registerAction(
          name,
          handler
        );

      if (
        typeof unsubscribe === "function"
      ) {
        state.actionUnsubscribers.push(
          unsubscribe
        );
      }
    };

    register(
      "budget-add-expense",
      () => openDialog("expense")
    );

    register(
      "budget-ask-ai",
      () => openDialog("ask-ai")
    );

    register(
      "budget-open-trips",
      () => getRouter()?.go?.("trips")
    );
  };

  const subscribeToStore = () => {
    const store = getStore();

    if (
      !store ||
      typeof store.subscribe !== "function" ||
      state.unsubscribeStore
    ) {
      return;
    }

    state.unsubscribeStore =
      store.subscribe(() => {
        if (state.mounted) {
          scheduleRefresh();
        }
      });
  };

  const subscribeToIntegration = () => {
    const integration =
      engines().integration;

    if (
      !integration ||
      typeof integration.subscribe !== "function" ||
      state.integrationUnsubscribe
    ) {
      return;
    }

    state.integrationUnsubscribe =
      integration.subscribe(
        () => {
          if (state.mounted) {
            scheduleRefresh();
          }
        },
        { immediate: false }
      );
  };

  const bindGlobalEvents = () => {
    if (state.eventBindings.length) {
      return;
    }

    [
      "tic:expenses-changed",
      "tic:savings-changed",
      "tic:payments-changed",
      "tic:budget-analytics-changed",
      "tic:budget-ai-recommendations-changed",
      "tic:expense-alerts-changed",
      "tic:budget-notifications-changed",
      "tic:budget-integration-sync-completed"
    ].forEach((name) => {
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

  const bootstrapEngines = () => {
    const modules = engines();

    if (
      modules.integration &&
      typeof modules.integration.initialize === "function"
    ) {
      try {
        modules.integration.initialize({
          store: getStore(),
          strictMode: false,
          autoSync: true
        });
      } catch (error) {
        console.warn(
          "TIC Budget integration bootstrap warning:",
          error
        );
      }

      return;
    }

    Object.values(modules).forEach((engine) => {
      if (!engine) return;

      const method =
        typeof engine.initialize === "function"
          ? "initialize"
          : typeof engine.init === "function"
            ? "init"
            : null;

      if (!method) return;

      try {
        engine[method]({
          store: getStore()
        });
      } catch (error) {
        console.warn(
          "TIC Budget engine bootstrap warning:",
          error
        );
      }
    });
  };

  const BudgetPage = {
    id: PAGE_ID,
    title: "الميزانية",
    icon: "◈",
    version: PAGE_VERSION,

    init() {
      if (state.initialized) {
        return this.diagnostics();
      }

      bootstrapEngines();
      registerActions();
      subscribeToStore();
      subscribeToIntegration();
      bindGlobalEvents();

      state.initialized = true;

      emit("initialized", {
        version: PAGE_VERSION,
        engines: Object.fromEntries(
          Object.entries(engines())
            .map(([key, value]) => [
              key,
              Boolean(value)
            ])
        )
      });

      return this.diagnostics();
    },

    render() {
      this.init();
      return renderPage(
        buildSnapshot()
      );
    },

    mount(context = {}) {
      this.init();

      const container =
        resolveContainer(
          context.container
        );

      if (!container) {
        throw new Error(
          "TIC Budget Error: route container not found."
        );
      }

      state.container = container;
      state.mounted = true;

      const snapshot = buildSnapshot();

      container.innerHTML =
        renderPage(snapshot);

      bindContainerEvents();

      emit("mounted", {
        annualBudget:
          snapshot.annualBudget,
        totalSpent:
          snapshot.totalSpent,
        healthScore:
          snapshot.healthScore
      });

      return container;
    },

    afterEnter(context = {}) {
      const container =
        resolveContainer(
          context.container
        );

      if (container) {
        state.container = container;
        state.mounted = true;
      }

      bindContainerEvents();
      refresh({
        preserveScroll: false
      });

      return true;
    },

    beforeLeave() {
      closeDialog();
      return true;
    },

    unmount() {
      closeDialog();

      if (state.container) {
        state.container.removeEventListener(
          "click",
          onContainerClick
        );
      }

      state.mounted = false;
      state.container = null;

      emit("unmounted");

      return true;
    },

    refresh,

    setView(view) {
      if (
        !Object.values(VIEWS).includes(view)
      ) {
        return false;
      }

      state.activeView = view;

      if (state.mounted) {
        refresh({
          preserveScroll: false
        });
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

    getDashboard() {
      return this.getSnapshot();
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

      if (
        typeof state.unsubscribeStore === "function"
      ) {
        state.unsubscribeStore();
      }

      if (
        typeof state.integrationUnsubscribe === "function"
      ) {
        state.integrationUnsubscribe();
      }

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

      if (state.refreshTimer) {
        window.clearTimeout(
          state.refreshTimer
        );
      }

      state.unsubscribeStore = null;
      state.integrationUnsubscribe = null;
      state.actionUnsubscribers = [];
      state.eventBindings = [];
      state.refreshTimer = null;
      state.subscribers.clear();
      state.lastSnapshot = null;
      state.activeView = VIEWS.OVERVIEW;
      state.initialized = false;
      state.refreshing = false;

      return true;
    },

    diagnostics() {
      const availableEngines =
        Object.fromEntries(
          Object.entries(engines())
            .map(([key, engine]) => [
              key,
              Boolean(engine)
            ])
        );

      return {
        id: this.id,
        title: this.title,
        version: this.version,
        initialized:
          state.initialized,
        mounted:
          state.mounted,
        activeView:
          state.activeView,
        hasContainer:
          Boolean(state.container),
        storeAvailable:
          Boolean(getStore()),
        routerAvailable:
          Boolean(getRouter()),
        uiAvailable:
          Boolean(getUI()),
        engines:
          availableEngines,
        connectedEngineCount:
          Object.values(
            availableEngines
          ).filter(Boolean).length,
        actionCount:
          state.actionUnsubscribers.length,
        eventBindingCount:
          state.eventBindings.length,
        subscriberCount:
          state.subscribers.size,
        hasSnapshot:
          Boolean(state.lastSnapshot),
        integrationHealth:
          clone(
            state.lastSnapshot
              ?.integrationHealth ||
            null
          )
      };
    }
  };

  window.TIC = window.TIC || {};
  window.TIC.Pages =
    window.TIC.Pages || {};
  window.TIC.Pages.budget =
    BudgetPage;
  window.TICBudgetPage =
    BudgetPage;

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