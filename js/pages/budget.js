/* =========================================================
   Travel Intelligence Center
   Budget Intelligence Platform Page V3.1.1

   File Path:
   js/pages/budget.js

   Purpose:
   - Complete Budget Intelligence page.
   - Preserves Store, Router, UI and ten-engine integration.
   - Improves iPhone scrolling and content hierarchy.
   - Keeps expenses, savings, payments, AI, alerts and reports.
========================================================= */

(function (window, document) {
  "use strict";

  const Config = window.TICConfig || window.TIC?.Config || {};
  const PAGE_ID = "budget";
  const PAGE_VERSION = "3.1.1";

  const VIEWS = Object.freeze({
    OVERVIEW: "overview",
    EXPENSES: "expenses",
    SAVINGS: "savings",
    PAYMENTS: "payments",
    ALERTS: "alerts",
    REPORTS: "reports"
  });

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
    activeView: VIEWS.OVERVIEW,
    activeDialog: null,
    refreshTimer: null,
    lastSignature: "",

    // Scroll stability V3.1.1
    isUserScrolling: false,
    scrollIdleTimer: null,
    pendingRefresh: false,
    lastKnownScrollY: 0
  };

  const clone = (value) => {
    if (value === undefined) return undefined;
    if (typeof structuredClone === "function") {
      try { return structuredClone(value); } catch (_) {}
    }
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
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
    number(total) > 0
      ? Math.round((number(part) / number(total)) * 100)
      : 0;

  const asArray = (value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return Object.values(value);
    return [];
  };

  const firstDefined = (...values) =>
    values.find((value) => value !== undefined && value !== null && value !== "");

  const getStore = () =>
    window.TIC?.Store || window.TICStore || window.Store || null;

  const getRouter = () =>
    window.TIC?.Router || window.TICRouter || null;

  const getUI = () =>
    window.TIC?.UI || window.TICUI || null;

  const engines = () => ({
    budget: window.TICBudgetEngine || window.TIC?.Features?.budgetEngine || null,
    expense: window.TICExpenseEngine || window.TIC?.Features?.expenseEngine || null,
    savings: window.TICSavingsEngine || window.TIC?.Features?.savingsEngine || null,
    analytics: window.TICBudgetAnalytics || window.TIC?.Features?.budgetAnalytics || null,
    ai: window.TICBudgetAI || window.TIC?.Features?.budgetAI || null,
    payments: window.TICPaymentTracker || window.TIC?.Features?.paymentTracker || null,
    alerts: window.TICExpenseAlertEngine || window.TIC?.Features?.expenseAlertEngine || null,
    export: window.TICBudgetExportEngine || window.TIC?.Features?.budgetExportEngine || null,
    notifications: window.TICBudgetNotificationEngine || window.TIC?.Features?.budgetNotificationEngine || null,
    integration: window.TICBudgetIntegrationEngine || window.TIC?.Features?.budgetIntegrationEngine || null
  });

  const resolveContainer = (container) => {
    if (container instanceof window.Element) return container;
    if (typeof container === "string") return document.querySelector(container);

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
      try { listener(payload); } catch (error) {
        console.error("TIC Budget subscriber error:", error);
      }
    });

    window.dispatchEvent(
      new CustomEvent(`tic:page:${PAGE_ID}:${type}`, { detail: payload })
    );

    return payload;
  };

  const notify = (message, tone = "info") => {
    const ui = getUI();
    if (ui?.toast) return ui.toast(message, { tone });
    if (ui?.showToast) return ui.showToast(message, tone);
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
        if (full && typeof full === "object") return clone(full);

        return {
          profile: store.get("profile"),
          trips: store.get("trips"),
          budgets: store.get("budgets"),
          expenses: store.get("expenses"),
          savings: store.get("savings"),
          payments: store.get("payments"),
          budgetNotifications: store.get("budgetNotifications")
        };
      }

      if (store.state) return clone(store.state);
      if (store.data) return clone(store.data);
    } catch (error) {
      console.error("TIC Budget Store read error:", error);
    }

    return {};
  };

  const callEngine = (engine, methods, args = []) => {
    if (!engine) return null;

    for (const method of methods) {
      if (typeof engine[method] !== "function") continue;

      try {
        return engine[method](...args);
      } catch (error) {
        console.warn(`TIC Budget engine method failed: ${method}`, error);
      }
    }

    return null;
  };

  const fallbackSnapshot = (raw) => {
    const profile = raw.profile && typeof raw.profile === "object" ? raw.profile : {};
    const trips = asArray(raw.trips);
    const expenses = asArray(
      firstDefined(raw.expenses, raw.budget?.expenses, raw.budgets?.expenses, raw.finance?.expenses, [])
    );

    const annualBudget = nonNegative(
      firstDefined(
        raw.budget?.annualBudget,
        raw.budgets?.annualBudget,
        profile.annualTravelBudget,
        Config.profile?.annualTravelBudget,
        30000
      )
    );

    const totalSpent = expenses.length
      ? expenses.reduce((total, item) => total + nonNegative(firstDefined(item.amount, item.total, item.value, 0)), 0)
      : trips.reduce((total, trip) => total + nonNegative(firstDefined(trip.spent, trip.totalSpent, 0)), 0);

    const savingsRoot = raw.savings || {};
    const savingEntries = asArray(
      savingsRoot.entries || savingsRoot.transactions || savingsRoot.contributions
    );

    const balance = nonNegative(
      firstDefined(
        savingsRoot.balance,
        savingsRoot.currentBalance,
        raw.budgets?.savingsBalance,
        savingEntries.reduce((total, item) => total + nonNegative(item.amount), 0),
        0
      )
    );

    const monthlySaving = nonNegative(
      firstDefined(
        savingsRoot.monthlySaving,
        raw.budgets?.monthlySavingTarget,
        profile.monthlySaving,
        profile.monthlyTravelSaving,
        1500
      )
    );

    const tripItems = trips.map((trip, index) => {
      const planned = nonNegative(firstDefined(trip.budget, trip.plannedBudget, 0));
      const spent = nonNegative(firstDefined(trip.spent, trip.totalSpent, 0));

      return {
        id: String(firstDefined(trip.id, `trip_${index}`)),
        title: trip.title || trip.destination || "رحلة",
        destination: trip.destination || trip.country || "",
        planned,
        spent,
        remaining: planned - spent,
        usagePercent: percentage(spent, planned),
        expenseCount: expenses.filter((expense) => String(expense.tripId) === String(trip.id)).length
      };
    });

    const remaining = annualBudget - totalSpent;
    const usagePercent = percentage(totalSpent, annualBudget);

    return {
      currency: profile.currency || "AED",
      annualBudget,
      totalSpent,
      remaining,
      usagePercent,
      expenses,
      savings: {
        balance,
        monthlySaving,
        coveragePercent: percentage(balance, annualBudget),
        remainingToFund: Math.max(0, annualBudget - balance)
      },
      trips: {
        items: tripItems,
        totalTrips: tripItems.length,
        totalPlanned: tripItems.reduce((total, trip) => total + trip.planned, 0),
        totalSpent,
        tripsOverBudget: tripItems.filter((trip) => trip.planned > 0 && trip.spent > trip.planned).length,
        tripsNearLimit: tripItems.filter((trip) => trip.usagePercent >= 85 && trip.usagePercent <= 100).length
      },
      categories: { items: [] },
      monthly: { items: [] },
      forecast: {
        projectedSpend: totalSpent,
        likelyToExceed: totalSpent > annualBudget,
        expectedOverrun: Math.max(0, totalSpent - annualBudget),
        recommendedMonthlyLimit:
          Math.max(0, annualBudget - totalSpent) /
          Math.max(1, 12 - new Date().getMonth())
      },
      health: {
        score: Math.max(0, Math.min(100, 100 - Math.max(0, usagePercent - 50))),
        status:
          usagePercent > 100
            ? "critical"
            : usagePercent >= 85
              ? "warning"
              : "healthy"
      }
    };
  };

  const buildSnapshot = () => {
    const raw = getStoreState();
    const modules = engines();

    const integrated =
      callEngine(modules.integration, ["getUnifiedDashboard", "getDashboard"], [
        { store: getStore() }
      ]) || {};

    const analytics =
      integrated.analytics ||
      callEngine(modules.analytics, ["getDashboard", "getSnapshot", "generate"], [
        { store: getStore() }
      ]) ||
      fallbackSnapshot(raw);

    const ai =
      integrated.ai ||
      callEngine(modules.ai, ["getDashboard", "generateDashboard"], [
        { store: getStore() }
      ]) ||
      { recommendations: [], summary: {} };

    const payments =
      integrated.payments ||
      callEngine(modules.payments, ["getDashboard", "buildDashboard"], [
        { store: getStore() }
      ]) ||
      { payments: [], upcoming: [], summary: {} };

    const alerts =
      integrated.alerts ||
      callEngine(modules.alerts, ["getDashboard", "buildDashboard"], [
        { store: getStore() }
      ]) ||
      { alerts: [], activeAlerts: [], summary: {} };

    const notifications =
      integrated.notifications ||
      callEngine(modules.notifications, ["getDashboard", "buildDashboard"], [
        { store: getStore() }
      ]) ||
      { notifications: [], unread: [], summary: {} };

    const integrationHealth =
      callEngine(modules.integration, ["getHealth"], []) ||
      integrated.integration ||
      null;

    const expenseList =
      asArray(analytics.expenses).length
        ? asArray(analytics.expenses)
        : asArray(
            callEngine(
              modules.expense,
              ["listExpenses", "getExpenses", "getAll", "list"],
              [{ store: getStore(), includeDeleted: false }]
            ) ||
            raw.expenses ||
            raw.budget?.expenses ||
            raw.budgets?.expenses
          );

    const snapshot = {
      raw,
      analytics,
      ai,
      payments,
      alerts,
      notifications,
      integrationHealth,
      expenses: expenseList,
      currency: analytics.currency || raw.profile?.currency || "AED",
      annualBudget: nonNegative(analytics.annualBudget),
      totalSpent: nonNegative(analytics.totalSpent),
      remaining: number(
        analytics.remaining,
        nonNegative(analytics.annualBudget) - nonNegative(analytics.totalSpent)
      ),
      usagePercent: nonNegative(analytics.usagePercent),
      healthScore: number(analytics.health?.score, 0),
      healthStatus: analytics.health?.status || "unknown",
      savings: analytics.savings || {},
      trips: analytics.trips || { items: [] },
      categories: analytics.categories || { items: [] },
      monthly: analytics.monthly || { items: [] },
      forecast: analytics.forecast || {},
      recommendations: asArray(ai.recommendations),
      activeAlerts: asArray(alerts.activeAlerts || alerts.alerts),
      unreadNotifications: asArray(notifications.unread)
    };

    state.lastSnapshot = snapshot;
    return snapshot;
  };

  const currency = (value, snapshot = state.lastSnapshot) => {
    const ui = getUI();

    if (ui?.currency) {
      return ui.currency(number(value), snapshot?.currency);
    }

    try {
      return new Intl.NumberFormat("ar-AE", {
        style: "currency",
        currency: snapshot?.currency || "AED",
        maximumFractionDigits: 0
      }).format(number(value));
    } catch (_) {
      return `${Math.round(number(value)).toLocaleString("ar-AE")} ${snapshot?.currency || "AED"}`;
    }
  };

  const badge = (label, tone = "info") => `
    <span class="tic-badge tic-badge-${escapeHTML(tone)}">
      ${escapeHTML(label)}
    </span>
  `;

  const progress = (value, label, hint) => {
    const normalized = Math.max(0, Math.min(100, number(value)));

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
      ${icon ? `<span aria-hidden="true">${escapeHTML(icon)}</span>` : ""}
      <span>${escapeHTML(label)}</span>
    </button>
  `;

  const renderHero = (snapshot) => {
    const unread =
      snapshot.notifications?.summary?.unread ||
      snapshot.unreadNotifications.length;

    return `
      <section class="tic-budget-hero">
        <div>
          <span class="tic-hero-badge">Budget Intelligence</span>
          <h1>مركز الميزانية الذكي</h1>
          <p>ميزانية السفر والمصروفات والادخار والدفعات في مكان واحد.</p>
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

        ${
          unread > 0
            ? `<div class="tic-budget-hero-notice">لديك ${escapeHTML(unread)} إشعار مالي غير مقروء.</div>`
            : ""
        }
      </section>
    `;
  };

  const renderTabs = () => {
    const tabs = [
      [VIEWS.OVERVIEW, "نظرة عامة"],
      [VIEWS.EXPENSES, "المصروفات"],
      [VIEWS.SAVINGS, "الادخار"],
      [VIEWS.PAYMENTS, "الدفعات"],
      [VIEWS.ALERTS, "التنبيهات"],
      [VIEWS.REPORTS, "التقارير"]
    ];

    return `
      <nav class="tic-budget-tabs" aria-label="أقسام الميزانية">
        ${tabs
          .map(
            ([id, label]) => `
              <button
                type="button"
                class="tic-budget-tab ${state.activeView === id ? "is-active" : ""}"
                data-budget-view="${id}"
                aria-pressed="${state.activeView === id ? "true" : "false"}"
              >
                ${escapeHTML(label)}
              </button>
            `
          )
          .join("")}
      </nav>
    `;
  };

  const renderRecommendation = (snapshot) => {
    const item = snapshot.recommendations[0];

    if (!item) {
      return `
        <article class="tic-card tic-card-body tic-budget-ai-card">
          <div class="tic-feature-row">
            <div>
              <span class="tic-chip">AI</span>
              <h3 class="tic-card-title">وضعك المالي منظم</h3>
              <p class="tic-card-text">لا توجد توصيات عاجلة حالياً.</p>
            </div>
            ${badge("ممتاز", "success")}
          </div>
        </article>
      `;
    }

    const priorityLabel =
      item.priority === "critical"
        ? "عاجل"
        : item.priority === "high"
          ? "مهم"
          : "اقتراح";

    const priorityTone =
      item.priority === "critical"
        ? "danger"
        : item.priority === "high"
          ? "warning"
          : "info";

    return `
      <article class="tic-card tic-card-body tic-budget-ai-card">
        <div class="tic-feature-row">
          <div>
            <span class="tic-chip">AI RECOMMENDATION</span>
            <h3 class="tic-card-title">
              ${escapeHTML(item.titleAr || item.title || "توصية مالية")}
            </h3>
          </div>
          ${badge(priorityLabel, priorityTone)}
        </div>

        <p class="tic-card-text">
          ${escapeHTML(item.messageAr || item.message || "")}
        </p>

        <div class="tic-budget-inline-actions">
          ${button({
            label: item.actionLabelAr || item.actionLabel || "تنفيذ التوصية",
            action: "run-recommendation",
            tone: "primary",
            attrs: `data-recommendation-id="${escapeHTML(item.id)}"`
          })}
          ${button({
            label: "إخفاء",
            action: "dismiss-recommendation",
            attrs: `data-recommendation-id="${escapeHTML(item.id)}"`
          })}
        </div>
      </article>
    `;
  };

  const renderOverviewCard = (snapshot) => {
    const over = snapshot.remaining < 0;
    const statusTone =
      over
        ? "danger"
        : snapshot.usagePercent >= 85
          ? "warning"
          : "success";

    return `
      <article class="tic-budget-overview">
        <div class="tic-budget-overview-head">
          <div>
            <small>الميزانية السنوية</small>
            <strong>${escapeHTML(currency(snapshot.annualBudget, snapshot))}</strong>
          </div>
          ${badge(
            over
              ? "متجاوزة"
              : snapshot.usagePercent >= 85
                ? "قريبة من الحد"
                : "ضمن الخطة",
            statusTone
          )}
        </div>

        <p class="tic-budget-overview-copy">
          ${
            over
              ? `تجاوزت الميزانية بمقدار ${escapeHTML(currency(Math.abs(snapshot.remaining), snapshot))}.`
              : `استخدمت ${Math.round(snapshot.usagePercent)}% والمتبقي ${escapeHTML(currency(snapshot.remaining, snapshot))}.`
          }
        </p>

        ${progress(
          Math.min(100, snapshot.usagePercent),
          "استخدام الميزانية",
          `${Math.round(snapshot.usagePercent)}%`
        )}

        <div class="tic-budget-breakdown">
          <div class="tic-budget-breakdown-item">
            <small>إجمالي المصروف</small>
            <strong>${escapeHTML(currency(snapshot.totalSpent, snapshot))}</strong>
          </div>
          <div class="tic-budget-breakdown-item">
            <small>رصيد الادخار</small>
            <strong>${escapeHTML(currency(snapshot.savings?.balance, snapshot))}</strong>
          </div>
          <div class="tic-budget-breakdown-item">
            <small>الصحة المالية</small>
            <strong>${Math.round(snapshot.healthScore)}/100</strong>
          </div>
          <div class="tic-budget-breakdown-item">
            <small>الإنفاق المتوقع</small>
            <strong>${escapeHTML(currency(snapshot.forecast?.projectedSpend, snapshot))}</strong>
          </div>
        </div>
      </article>
    `;
  };

  const renderKpis = (snapshot) => {
    const items = [
      {
        icon: "◈",
        value: currency(snapshot.trips?.totalPlanned, snapshot),
        label: "ميزانيات الرحلات",
        subtitle: `${snapshot.trips?.totalTrips || 0} رحلة`
      },
      {
        icon: "◎",
        value: currency(snapshot.payments?.summary?.remainingAmount, snapshot),
        label: "دفعات متبقية",
        subtitle: `${snapshot.payments?.summary?.overdueCount || 0} متأخرة`
      },
      {
        icon: "!",
        value: snapshot.alerts?.summary?.active || snapshot.activeAlerts.length,
        label: "تنبيهات نشطة",
        subtitle: `${snapshot.alerts?.summary?.critical || 0} حرجة`
      },
      {
        icon: "✦",
        value: snapshot.recommendations.length,
        label: "توصيات ذكية",
        subtitle: snapshot.forecast?.likelyToExceed ? "تحتاج إجراء" : "الوضع مستقر"
      }
    ];

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

  const renderUpcoming = (snapshot) => {
    const items = asArray(snapshot.payments?.upcoming).slice(0, 3);

    if (!items.length) {
      return `
        <article class="tic-card tic-card-body">
          <h3 class="tic-card-title">لا توجد دفعات قريبة</h3>
          <p class="tic-card-text">جميع دفعات السفر الحالية منظمة.</p>
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
                    <span class="tic-chip">${escapeHTML(item.typeLabelAr || item.type || "دفعة")}</span>
                    <h3 class="tic-card-title">${escapeHTML(item.title || "دفعة")}</h3>
                    <p class="tic-card-text">
                      ${escapeHTML(
                        item.daysUntilDue === 0
                          ? "مستحقة اليوم"
                          : `تستحق خلال ${item.daysUntilDue} يوم`
                      )}
                    </p>
                  </div>
                  <strong>${escapeHTML(currency(item.remainingAmount, snapshot))}</strong>
                </div>

                <div class="tic-budget-inline-actions">
                  ${button({
                    label: "تسجيل دفع",
                    action: "pay-payment",
                    tone: "primary",
                    attrs: `data-payment-id="${escapeHTML(item.id)}"`
                  })}
                  ${button({
                    label: "عرض الكل",
                    action: "switch-payments"
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
    const trips = asArray(snapshot.trips?.items).slice(0, 4);

    if (!trips.length) {
      return `
        <article class="tic-card tic-card-body">
          <h3 class="tic-card-title">لا توجد ميزانيات رحلات</h3>
          <p class="tic-card-text">أنشئ رحلة وحدد ميزانيتها لتظهر هنا.</p>
        </article>
      `;
    }

    return `
      <div class="tic-settings-list">
        ${trips
          .map((trip) => {
            const usage = nonNegative(trip.usagePercent);
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
                    <span class="tic-chip">${escapeHTML(trip.destination || "رحلة")}</span>
                    <h3 class="tic-card-title">${escapeHTML(trip.title || "رحلة بدون اسم")}</h3>
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
                    <strong>${escapeHTML(currency(trip.planned, snapshot))}</strong>
                  </div>
                  <div>
                    <small>المصروف</small>
                    <strong>${escapeHTML(currency(trip.spent, snapshot))}</strong>
                  </div>
                  <div>
                    <small>المتبقي</small>
                    <strong>${escapeHTML(currency(Math.max(0, number(trip.remaining)), snapshot))}</strong>
                  </div>
                </div>

                <div style="margin-top:14px">
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
                    attrs: `data-trip-id="${escapeHTML(trip.id)}"`
                  })}
                  ${button({
                    label: "إضافة مصروف",
                    action: "add-expense",
                    tone: "primary",
                    attrs: `data-trip-id="${escapeHTML(trip.id)}"`
                  })}
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  };

  const renderOverview = (snapshot) => `
    <section class="tic-budget-view" data-budget-panel="${VIEWS.OVERVIEW}">
      <section>
        <div class="tic-budget-section-heading">
          <div>
            <small>SMART ACTION</small>
            <h2>أفضل إجراء الآن</h2>
            <p>أهم توصية مالية حسب وضعك الحالي.</p>
          </div>
          ${button({ label: "اسأل الذكاء", action: "ask-ai" })}
        </div>
        ${renderRecommendation(snapshot)}
      </section>

      ${renderOverviewCard(snapshot)}
      ${renderKpis(snapshot)}

      <div class="tic-budget-split">
        <section>
          <div class="tic-budget-section-heading">
            <div>
              <small>UPCOMING</small>
              <h2>الدفعات القادمة</h2>
            </div>
            ${button({ label: "عرض الكل", action: "switch-payments" })}
          </div>
          ${renderUpcoming(snapshot)}
        </section>

        <section>
          <div class="tic-budget-section-heading">
            <div>
              <small>TRIP BUDGETS</small>
              <h2>ميزانيات الرحلات</h2>
            </div>
            ${button({ label: "عرض الرحلات", action: "open-trips" })}
          </div>
          ${renderTripBudgets(snapshot)}
        </section>
      </div>
    </section>
  `;

  const renderExpenses = (snapshot) => {
    const expenses = asArray(snapshot.expenses)
      .slice()
      .sort((a, b) =>
        String(firstDefined(b.date, b.paidAt, b.createdAt, "")).localeCompare(
          String(firstDefined(a.date, a.paidAt, a.createdAt, ""))
        )
      );

    return `
      <section class="tic-budget-view" data-budget-panel="${VIEWS.EXPENSES}">
        <div class="tic-budget-section-heading">
          <div>
            <small>EXPENSE CENTER</small>
            <h2>المصروفات</h2>
            <p>سجل مصروفات السفر واربطها بالرحلات.</p>
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
                    const id = firstDefined(item.id, item._id, "");
                    return `
                      <article class="tic-card tic-card-body">
                        <div class="tic-feature-row">
                          <div>
                            <span class="tic-chip">${escapeHTML(item.category || item.type || "أخرى")}</span>
                            <h3 class="tic-card-title">${escapeHTML(item.title || item.name || "مصروف")}</h3>
                            <p class="tic-card-text">${escapeHTML(String(firstDefined(item.date, item.paidAt, item.createdAt, "")).slice(0, 10))}</p>
                          </div>
                          <strong>${escapeHTML(currency(firstDefined(item.amount, item.total, item.value, 0), snapshot))}</strong>
                        </div>

                        <div class="tic-budget-inline-actions">
                          ${button({
                            label: "تعديل",
                            action: "edit-expense",
                            attrs: `data-expense-id="${escapeHTML(id)}"`
                          })}
                          ${button({
                            label: "حذف",
                            action: "delete-expense",
                            tone: "danger",
                            attrs: `data-expense-id="${escapeHTML(id)}"`
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
                <h3 class="tic-card-title">لا توجد مصروفات مسجلة</h3>
                <p class="tic-card-text">أضف أول مصروف حتى تبدأ التحليلات الذكية.</p>
              </article>
            `
        }
      </section>
    `;
  };

  const renderSavings = (snapshot) => {
    const saving = snapshot.savings || {};
    const monthly = nonNegative(saving.monthlySaving);
    const balance = nonNegative(saving.balance);
    const coverage = nonNegative(saving.coveragePercent);

    return `
      <section class="tic-budget-view" data-budget-panel="${VIEWS.SAVINGS}">
        <div class="tic-budget-section-heading">
          <div>
            <small>SAVINGS CENTER</small>
            <h2>خطة الادخار</h2>
            <p>تابع صندوق السفر وحدد المبلغ الشهري المناسب.</p>
          </div>

          <div class="tic-budget-inline-actions">
            ${button({ label: "إيداع", action: "add-saving", tone: "primary", icon: "+" })}
            ${button({ label: "تعديل الخطة", action: "edit-saving-plan" })}
          </div>
        </div>

        <div class="tic-budget-savings-grid">
          <article class="tic-card tic-card-body">
            <small>رصيد صندوق السفر</small>
            <strong class="tic-stat-value">${escapeHTML(currency(balance, snapshot))}</strong>
            <p class="tic-card-text">
              المتبقي لتمويل الميزانية:
              ${escapeHTML(currency(saving.remainingToFund, snapshot))}
            </p>
          </article>

          <article class="tic-card tic-card-body">
            <small>الادخار الشهري</small>
            <strong class="tic-stat-value">${escapeHTML(currency(monthly, snapshot))}</strong>
            <p class="tic-card-text">سنوياً: ${escapeHTML(currency(monthly * 12, snapshot))}</p>
          </article>

          <article class="tic-card tic-card-body">
            <small>تغطية الميزانية</small>
            <strong class="tic-stat-value">${Math.round(coverage)}%</strong>
            ${progress(coverage, "تغطية صندوق السفر", `${Math.round(coverage)}%`)}
          </article>
        </div>

        ${button({
          label: "إنشاء خطة شهرية ذكية",
          action: "create-monthly-plan",
          tone: "primary",
          block: true,
          icon: "✦"
        })}
      </section>
    `;
  };

  const renderPayments = (snapshot) => {
    const payments = asArray(snapshot.payments?.payments);

    return `
      <section class="tic-budget-view" data-budget-panel="${VIEWS.PAYMENTS}">
        <div class="tic-budget-section-heading">
          <div>
            <small>PAYMENT TRACKER</small>
            <h2>الدفعات والحجوزات</h2>
            <p>تابع الدفعات المستحقة والمدفوعات المكتملة.</p>
          </div>
          ${button({
            label: "إضافة دفعة",
            action: "add-payment",
            tone: "primary",
            icon: "+"
          })}
        </div>

        ${renderKpis({
          ...snapshot,
          trips: { totalPlanned: snapshot.payments?.summary?.totalAmount, totalTrips: 0 },
          recommendations: [],
          activeAlerts: [],
          alerts: { summary: { active: snapshot.payments?.summary?.overdueCount || 0, critical: 0 } },
          payments: {
            ...snapshot.payments,
            summary: {
              ...snapshot.payments?.summary,
              remainingAmount: snapshot.payments?.summary?.remainingAmount
            }
          },
          forecast: { likelyToExceed: false }
        })}

        <div class="tic-settings-list">
          ${
            payments.length
              ? payments
                  .slice(0, 40)
                  .map(
                    (item) => `
                      <article class="tic-card tic-card-body">
                        <div class="tic-feature-row">
                          <div>
                            <span class="tic-chip">${escapeHTML(item.typeLabelAr || item.type || "دفعة")}</span>
                            <h3 class="tic-card-title">${escapeHTML(item.title || "دفعة")}</h3>
                            <p class="tic-card-text">
                              ${item.dueDate ? `الاستحقاق: ${escapeHTML(String(item.dueDate).slice(0, 10))}` : "بدون تاريخ استحقاق"}
                            </p>
                          </div>
                          <div>
                            <strong>${escapeHTML(currency(item.remainingAmount, snapshot))}</strong>
                            <div style="margin-top:7px">
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

                        <div style="margin-top:14px">
                          ${progress(item.progressPercent, "نسبة الدفع", `${Math.round(nonNegative(item.progressPercent))}%`)}
                        </div>

                        <div class="tic-budget-inline-actions">
                          ${
                            !["paid", "refunded", "cancelled"].includes(item.status)
                              ? button({
                                  label: "تسجيل دفع",
                                  action: "pay-payment",
                                  tone: "primary",
                                  attrs: `data-payment-id="${escapeHTML(item.id)}"`
                                })
                              : ""
                          }
                          ${button({
                            label: "تعديل",
                            action: "edit-payment",
                            attrs: `data-payment-id="${escapeHTML(item.id)}"`
                          })}
                          ${button({
                            label: "حذف",
                            action: "delete-payment",
                            tone: "danger",
                            attrs: `data-payment-id="${escapeHTML(item.id)}"`
                          })}
                        </div>
                      </article>
                    `
                  )
                  .join("")
              : `
                <article class="tic-card tic-card-body">
                  <h3 class="tic-card-title">لا توجد دفعات</h3>
                  <p class="tic-card-text">أضف حجوزات الطيران والفنادق والأقساط لتتبعها.</p>
                </article>
              `
          }
        </div>
      </section>
    `;
  };

  const renderAlerts = (snapshot) => `
    <section class="tic-budget-view" data-budget-panel="${VIEWS.ALERTS}">
      <div class="tic-budget-section-heading">
        <div>
          <small>RISK CENTER</small>
          <h2>التنبيهات المالية</h2>
          <p>المخاطر والمصروفات غير الاعتيادية والدفعات المتأخرة.</p>
        </div>
        ${button({ label: "تحديث التحليل", action: "refresh-alerts" })}
      </div>

      <div class="tic-settings-list">
        ${
          snapshot.activeAlerts.length
            ? snapshot.activeAlerts
                .slice(0, 50)
                .map(
                  (item) => `
                    <article class="tic-card tic-card-body">
                      <div class="tic-feature-row">
                        <div>
                          <span class="tic-chip">${escapeHTML(item.type || "تنبيه")}</span>
                          <h3 class="tic-card-title">${escapeHTML(item.titleAr || item.title || "تنبيه مالي")}</h3>
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

                      <p class="tic-card-text">${escapeHTML(item.messageAr || item.message || "")}</p>

                      <div class="tic-budget-inline-actions">
                        ${button({
                          label: item.actionLabelAr || "فتح",
                          action: "run-alert-action",
                          tone: "primary",
                          attrs: `data-alert-id="${escapeHTML(item.id)}"`
                        })}
                        ${button({
                          label: "تمت المراجعة",
                          action: "acknowledge-alert",
                          attrs: `data-alert-id="${escapeHTML(item.id)}"`
                        })}
                        ${button({
                          label: "تأجيل",
                          action: "snooze-alert",
                          attrs: `data-alert-id="${escapeHTML(item.id)}"`
                        })}
                      </div>
                    </article>
                  `
                )
                .join("")
            : `
              <article class="tic-card tic-card-body">
                <h3 class="tic-card-title">لا توجد تنبيهات نشطة</h3>
                <p class="tic-card-text">الوضع المالي منظم حالياً.</p>
              </article>
            `
        }
      </div>
    </section>
  `;

  const renderReports = (snapshot) => {
    const categories = asArray(snapshot.categories?.items).slice(0, 6);
    const months = asArray(snapshot.monthly?.items).slice(-6);

    return `
      <section class="tic-budget-view" data-budget-panel="${VIEWS.REPORTS}">
        <div class="tic-budget-section-heading">
          <div>
            <small>REPORTS & EXPORT</small>
            <h2>التقارير المالية</h2>
            <p>صدّر البيانات وراجع التوقعات والفئات والاتجاهات.</p>
          </div>

          <div class="tic-budget-inline-actions">
            ${button({ label: "CSV", action: "export-csv" })}
            ${button({ label: "JSON", action: "export-json" })}
            ${button({ label: "طباعة", action: "print-report", tone: "primary" })}
          </div>
        </div>

        <div class="tic-budget-split">
          <article class="tic-card tic-card-body">
            <h3 class="tic-card-title">التوقع السنوي</h3>
            <div class="tic-trip-meta">
              <div>
                <small>الإنفاق المتوقع</small>
                <strong>${escapeHTML(currency(snapshot.forecast?.projectedSpend, snapshot))}</strong>
              </div>
              <div>
                <small>التجاوز المتوقع</small>
                <strong>${escapeHTML(currency(snapshot.forecast?.expectedOverrun, snapshot))}</strong>
              </div>
              <div>
                <small>الحد الشهري</small>
                <strong>${escapeHTML(currency(snapshot.forecast?.recommendedMonthlyLimit, snapshot))}</strong>
              </div>
            </div>
          </article>

          <article class="tic-card tic-card-body">
            <h3 class="tic-card-title">صحة النظام</h3>
            <div class="tic-trip-meta">
              <div>
                <small>الجاهزية</small>
                <strong>${escapeHTML(snapshot.integrationHealth?.score || 0)}%</strong>
              </div>
              <div>
                <small>المحركات</small>
                <strong>${escapeHTML(snapshot.integrationHealth?.readyModules || 0)}</strong>
              </div>
              <div>
                <small>آخر مزامنة</small>
                <strong>${escapeHTML(String(snapshot.integrationHealth?.lastSyncAt || "-").slice(0, 16))}</strong>
              </div>
            </div>
          </article>
        </div>

        <div class="tic-budget-split">
          <article class="tic-card tic-card-body">
            <h3 class="tic-card-title">أعلى فئات الإنفاق</h3>
            ${
              categories.length
                ? categories
                    .map(
                      (item) => `
                        <div class="tic-budget-report-row">
                          <span>${escapeHTML(item.labelAr || item.key || "فئة")}</span>
                          <strong>${escapeHTML(currency(item.amount, snapshot))}</strong>
                        </div>
                      `
                    )
                    .join("")
                : `<p class="tic-card-text">لا توجد بيانات فئات كافية.</p>`
            }
          </article>

          <article class="tic-card tic-card-body">
            <h3 class="tic-card-title">الإنفاق الشهري</h3>
            ${
              months.length
                ? months
                    .map(
                      (item) => `
                        <div class="tic-budget-report-row">
                          <span>${escapeHTML(item.labelAr || item.key || "شهر")}</span>
                          <strong>${escapeHTML(currency(item.amount, snapshot))}</strong>
                        </div>
                      `
                    )
                    .join("")
                : `<p class="tic-card-text">لا توجد بيانات شهرية كافية.</p>`
            }
          </article>
        </div>
      </section>
    `;
  };

  const renderActiveView = (snapshot) => {
    switch (state.activeView) {
      case VIEWS.EXPENSES: return renderExpenses(snapshot);
      case VIEWS.SAVINGS: return renderSavings(snapshot);
      case VIEWS.PAYMENTS: return renderPayments(snapshot);
      case VIEWS.ALERTS: return renderAlerts(snapshot);
      case VIEWS.REPORTS: return renderReports(snapshot);
      default: return renderOverview(snapshot);
    }
  };

  const renderPage = (snapshot) => `
    <div
      class="tic-module tic-budget-platform"
      data-page="${PAGE_ID}"
      data-page-version="${PAGE_VERSION}"
    >
      ${renderHero(snapshot)}
      ${renderTabs()}
      ${renderActiveView(snapshot)}
      <div data-budget-dialog-root></div>
    </div>
  `;

  const renderDialogShell = ({
    title,
    subtitle = "",
    body = "",
    submitLabel = "حفظ",
    submitAction = ""
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
            ${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ""}
          </div>
          <button
            type="button"
            class="tic-budget-dialog-close"
            data-budget-action="close-dialog"
            aria-label="إغلاق"
          >×</button>
        </header>

        <div class="tic-budget-dialog-body">${body}</div>

        <footer class="tic-budget-dialog-footer">
          ${button({ label: "إلغاء", action: "close-dialog" })}
          ${submitAction ? button({ label: submitLabel, action: submitAction, tone: "primary" }) : ""}
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
          <select name="${escapeHTML(name)}" ${required ? "required" : ""}>
            ${options
              .map(
                (item) => `
                  <option
                    value="${escapeHTML(item.value)}"
                    ${String(item.value) === String(value) ? "selected" : ""}
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

  const openDialog = (name, payload = {}) => {
    if (!state.container) return false;

    const root = state.container.querySelector("[data-budget-dialog-root]");
    if (!root) return false;

    const snapshot = state.lastSnapshot || buildSnapshot();
    let html = "";

    if (name === "expense") {
      const expense = payload.expense || {};
      const tripOptions = [
        { value: "", label: "بدون رحلة" },
        ...asArray(snapshot.trips?.items).map((trip) => ({
          value: trip.id,
          label: trip.title
        }))
      ];

      html = renderDialogShell({
        title: payload.mode === "edit" ? "تعديل المصروف" : "إضافة مصروف",
        subtitle: "سجّل المصروف ليظهر في التحليلات.",
        submitLabel: payload.mode === "edit" ? "حفظ التعديل" : "إضافة المصروف",
        submitAction: "submit-expense",
        body: `
          <form
            class="tic-budget-form"
            data-budget-form="expense"
            data-mode="${escapeHTML(payload.mode || "create")}"
            data-expense-id="${escapeHTML(firstDefined(expense.id, expense._id, ""))}"
          >
            ${formField({
              label: "اسم المصروف",
              name: "title",
              value: expense.title || expense.name || "",
              placeholder: "مثال: تذاكر الطيران",
              required: true
            })}
            <div class="tic-budget-form-grid">
              ${formField({
                label: "القيمة",
                name: "amount",
                type: "number",
                value: firstDefined(expense.amount, expense.total, ""),
                required: true
              })}
              ${formField({
                label: "التاريخ",
                name: "date",
                type: "date",
                value: String(firstDefined(expense.date, expense.paidAt, new Date().toISOString())).slice(0, 10),
                required: true
              })}
            </div>
            <div class="tic-budget-form-grid">
              ${formField({
                label: "الفئة",
                name: "category",
                value: expense.category || "other",
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
                value: firstDefined(payload.tripId, expense.tripId, ""),
                options: tripOptions
              })}
            </div>
            ${formField({
              label: "طريقة الدفع",
              name: "paymentMethod",
              value: expense.paymentMethod || "card",
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
        subtitle: "أضف إيداعاً جديداً إلى صندوق السفر.",
        submitLabel: "إضافة الإيداع",
        submitAction: "submit-saving",
        body: `
          <form class="tic-budget-form" data-budget-form="saving">
            ${formField({ label: "القيمة", name: "amount", type: "number", required: true })}
            ${formField({
              label: "التاريخ",
              name: "date",
              type: "date",
              value: new Date().toISOString().slice(0, 10),
              required: true
            })}
            ${formField({
              label: "ملاحظة",
              name: "notes",
              placeholder: "مثال: ادخار شهر يوليو"
            })}
          </form>
        `
      });
    }

    if (name === "saving-plan") {
      html = renderDialogShell({
        title: "تعديل خطة الادخار",
        subtitle: "حدد المبلغ الشهري لصندوق السفر.",
        submitLabel: "حفظ الخطة",
        submitAction: "submit-saving-plan",
        body: `
          <form class="tic-budget-form" data-budget-form="saving-plan">
            ${formField({
              label: "الادخار الشهري",
              name: "monthlySaving",
              type: "number",
              value: snapshot.savings?.monthlySaving || 0,
              required: true
            })}
          </form>
        `
      });
    }

    if (name === "payment") {
      const payment = payload.payment || {};

      html = renderDialogShell({
        title: payload.mode === "edit" ? "تعديل الدفعة" : "إضافة دفعة",
        subtitle: "أضف دفعة حجز أو قسط وتاريخ الاستحقاق.",
        submitLabel: payload.mode === "edit" ? "حفظ التعديل" : "إضافة الدفعة",
        submitAction: "submit-payment",
        body: `
          <form
            class="tic-budget-form"
            data-budget-form="payment"
            data-mode="${escapeHTML(payload.mode || "create")}"
            data-payment-id="${escapeHTML(payment.id || "")}"
          >
            ${formField({
              label: "اسم الدفعة",
              name: "title",
              value: payment.title || "",
              placeholder: "مثال: دفعة الفندق",
              required: true
            })}
            <div class="tic-budget-form-grid">
              ${formField({
                label: "القيمة",
                name: "amount",
                type: "number",
                value: payment.amount || "",
                required: true
              })}
              ${formField({
                label: "تاريخ الاستحقاق",
                name: "dueDate",
                type: "date",
                value: String(payment.dueDate || "").slice(0, 10),
                required: true
              })}
            </div>
            <div class="tic-budget-form-grid">
              ${formField({
                label: "النوع",
                name: "type",
                value: payment.type || "other",
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
                value: payment.paymentMethod || "card",
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
        subtitle: "أدخل المبلغ المدفوع لهذه الدفعة.",
        submitLabel: "تسجيل الدفع",
        submitAction: "submit-payment-record",
        body: `
          <form
            class="tic-budget-form"
            data-budget-form="payment-record"
            data-payment-id="${escapeHTML(payload.paymentId)}"
          >
            ${formField({
              label: "المبلغ المدفوع",
              name: "amount",
              type: "number",
              value: payload.payment?.remainingAmount || "",
              required: true
            })}
            ${formField({
              label: "تاريخ الدفع",
              name: "paidAt",
              type: "date",
              value: new Date().toISOString().slice(0, 10),
              required: true
            })}
          </form>
        `
      });
    }

    if (name === "ask-ai") {
      html = renderDialogShell({
        title: "اسأل الذكاء المالي",
        subtitle: "اسأل عن الميزانية أو الادخار أو التوقعات.",
        submitLabel: "إرسال السؤال",
        submitAction: "submit-ai-question",
        body: `
          <form class="tic-budget-form" data-budget-form="ai-question">
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
              <button type="button" data-ai-question="كم باقي من ميزانيتي؟">كم باقي؟</button>
              <button type="button" data-ai-question="هل بتجاوز الميزانية؟">هل بتجاوز؟</button>
              <button type="button" data-ai-question="وين أقدر أوفر؟">وين أوفر؟</button>
              <button type="button" data-ai-question="سو لي خطة شهرية">خطة شهرية</button>
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
        subtitle: "توزيع مقترح للمتبقي والادخار والاحتياطي.",
        submitLabel: "إغلاق",
        submitAction: "close-dialog",
        body: `
          <div class="tic-budget-plan-summary">
            <article>
              <small>حد الإنفاق الشهري</small>
              <strong>${escapeHTML(currency(plan.monthlySpendingLimit, snapshot))}</strong>
            </article>
            <article>
              <small>الادخار الشهري</small>
              <strong>${escapeHTML(currency(plan.monthlySavingTarget, snapshot))}</strong>
            </article>
            <article>
              <small>الاحتياطي</small>
              <strong>${escapeHTML(currency(plan.reserve, snapshot))}</strong>
            </article>
          </div>
          <p class="tic-card-text">${escapeHTML(plan.summaryAr || "")}</p>
        `
      });
    }

    if (!html) return false;

    root.innerHTML = html;
    state.activeDialog = name;
    document.body.classList.add("tic-budget-dialog-open");

    window.requestAnimationFrame(() => {
      root.querySelector("input, select, textarea")?.focus();
    });

    return true;
  };

  const closeDialog = () => {
    if (!state.container) return false;

    const root = state.container.querySelector("[data-budget-dialog-root]");
    if (root) root.innerHTML = "";

    state.activeDialog = null;
    document.body.classList.remove("tic-budget-dialog-open");
    return true;
  };

  const getFormData = (name) => {
    const form = state.container?.querySelector(`[data-budget-form="${name}"]`);
    if (!form || !form.reportValidity()) return null;

    return {
      form,
      values: Object.fromEntries(new FormData(form).entries())
    };
  };

  const signature = (snapshot) => {
    try {
      return JSON.stringify({
        view: state.activeView,
        annualBudget: snapshot.annualBudget,
        totalSpent: snapshot.totalSpent,
        remaining: snapshot.remaining,
        usagePercent: snapshot.usagePercent,
        healthScore: snapshot.healthScore,
        healthStatus: snapshot.healthStatus,
        savings: snapshot.savings,
        trips: snapshot.trips,
        expenses: snapshot.expenses,
        payments: snapshot.payments,
        alerts: snapshot.alerts,
        notifications: snapshot.notifications,
        recommendations: snapshot.recommendations,
        integrationHealth: snapshot.integrationHealth
      });
    } catch (error) {
      return `${Date.now()}`;
    }
  };

  const markScrollActivity = () => {
    if (!state.mounted || state.activeDialog) {
      return;
    }

    state.isUserScrolling = true;
    state.lastKnownScrollY = window.scrollY;

    if (state.scrollIdleTimer) {
      window.clearTimeout(state.scrollIdleTimer);
    }

    state.scrollIdleTimer = window.setTimeout(() => {
      state.scrollIdleTimer = null;
      state.isUserScrolling = false;
      state.lastKnownScrollY = window.scrollY;

      if (state.pendingRefresh) {
        state.pendingRefresh = false;
        scheduleRefresh({
          force: false,
          delay: 220
        });
      }
    }, 420);
  };

  const bindScrollStability = () => {
    if (
      state.eventBindings.some(
        (binding) => binding.name === "budget-scroll"
      )
    ) {
      return;
    }

    const scrollHandler = () => {
      markScrollActivity();
    };

    const touchStartHandler = () => {
      if (!state.mounted || state.activeDialog) {
        return;
      }

      state.isUserScrolling = true;
      state.lastKnownScrollY = window.scrollY;
    };

    const touchEndHandler = () => {
      markScrollActivity();
    };

    window.addEventListener(
      "scroll",
      scrollHandler,
      { passive: true }
    );

    window.addEventListener(
      "touchstart",
      touchStartHandler,
      { passive: true }
    );

    window.addEventListener(
      "touchmove",
      scrollHandler,
      { passive: true }
    );

    window.addEventListener(
      "touchend",
      touchEndHandler,
      { passive: true }
    );

    state.eventBindings.push(
      {
        name: "budget-scroll",
        eventName: "scroll",
        handler: scrollHandler,
        target: window
      },
      {
        name: "budget-touchstart",
        eventName: "touchstart",
        handler: touchStartHandler,
        target: window
      },
      {
        name: "budget-touchmove",
        eventName: "touchmove",
        handler: scrollHandler,
        target: window
      },
      {
        name: "budget-touchend",
        eventName: "touchend",
        handler: touchEndHandler,
        target: window
      }
    );
  };

  const refresh = ({
    preserveScroll = true,
    force = false
  } = {}) => {
    if (
      !state.container ||
      !state.mounted ||
      state.refreshing
    ) {
      return false;
    }

    if (
      !force &&
      (state.isUserScrolling || state.activeDialog)
    ) {
      state.pendingRefresh = true;
      return false;
    }

    state.refreshing = true;

    try {
      const snapshot = buildSnapshot();
      const nextSignature = signature(snapshot);

      if (
        !force &&
        nextSignature === state.lastSignature
      ) {
        return false;
      }

      state.container.innerHTML =
        renderPage(snapshot);

      state.lastSignature =
        nextSignature;

      bindContainerEvents();

      /*
       * Important:
       * Do not restore window.scrollY after automatic refresh.
       * Replacing the page content and immediately calling scrollTo()
       * during iPhone momentum scrolling is what caused the page jump.
       */
      if (!preserveScroll) {
        window.requestAnimationFrame(() => {
          window.scrollTo({
            top: 0,
            behavior: "auto"
          });
        });
      } else {
        state.lastKnownScrollY =
          window.scrollY;
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

  const scheduleRefresh = ({
    force = false,
    delay = 260
  } = {}) => {
    if (!state.mounted) {
      return false;
    }

    if (
      !force &&
      (state.isUserScrolling || state.activeDialog)
    ) {
      state.pendingRefresh = true;
      return false;
    }

    if (state.refreshTimer) {
      window.clearTimeout(
        state.refreshTimer
      );
    }

    state.refreshTimer =
      window.setTimeout(() => {
        state.refreshTimer = null;

        if (!state.mounted) {
          return;
        }

        if (
          !force &&
          (state.isUserScrolling || state.activeDialog)
        ) {
          state.pendingRefresh = true;
          return;
        }

        refresh({
          preserveScroll: true,
          force
        });
      }, delay);

    return true;
  };

  const switchView = (view) => {
    if (!Object.values(VIEWS).includes(view)) return false;

    state.activeView = view;
    refresh({ preserveScroll: false, force: true });

    window.requestAnimationFrame(() => {
      const platform = state.container?.querySelector(".tic-budget-platform");
      if (!platform) return;

      const top = platform.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, top - 112), behavior: "auto" });
    });

    return true;
  };

  const executeSourceAction = (sourceItem) => {
    const action = sourceItem?.action;
    if (!action?.name) return false;

    const name = action.name;
    const payload = action.payload || {};

    if (name.includes("trip") && payload.tripId) {
      getRouter()?.go?.("trips", { view: "details", tripId: payload.tripId });
      return true;
    }

    if (name.includes("payment")) return switchView(VIEWS.PAYMENTS);
    if (name.includes("expense")) return switchView(VIEWS.EXPENSES);
    if (name.includes("saving")) return switchView(VIEWS.SAVINGS);
    if (name.includes("report") || name.includes("forecast")) return switchView(VIEWS.REPORTS);

    return false;
  };

  const handleAction = async (action, target) => {
    const modules = engines();
    const snapshot = state.lastSnapshot || buildSnapshot();

    if (action === "close-dialog") return void closeDialog();
    if (action === "add-expense") return void openDialog("expense", { tripId: target.dataset.tripId || "" });
    if (action === "add-saving") return void openDialog("saving");
    if (action === "edit-saving-plan") return void openDialog("saving-plan");
    if (action === "add-payment") return void openDialog("payment");
    if (action === "ask-ai") return void openDialog("ask-ai");
    if (action === "switch-payments") return void switchView(VIEWS.PAYMENTS);
    if (action === "open-trips") return void getRouter()?.go?.("trips");

    if (action === "open-trip") {
      return void getRouter()?.go?.("trips", {
        view: "details",
        tripId: target.dataset.tripId
      });
    }

    if (action === "edit-expense") {
      const expense = snapshot.expenses.find(
        (item) => String(firstDefined(item.id, item._id)) === String(target.dataset.expenseId)
      );
      if (expense) openDialog("expense", { mode: "edit", expense });
      return;
    }

    if (action === "submit-expense") {
      const result = getFormData("expense");
      if (!result) return;

      const { form, values } = result;
      const payload = {
        title: values.title,
        amount: nonNegative(values.amount),
        date: values.date,
        category: values.category,
        tripId: values.tripId || null,
        paymentMethod: values.paymentMethod,
        currency: snapshot.currency,
        status: "paid"
      };

      const saved =
        form.dataset.mode === "edit"
          ? callEngine(modules.expense, ["updateExpense", "update"], [
              form.dataset.expenseId,
              payload,
              { store: getStore() }
            ])
          : callEngine(modules.expense, ["createExpense", "create", "addExpense"], [
              payload,
              { store: getStore() }
            ]);

      if (saved === null) return notify("تعذر حفظ المصروف.", "danger");

      closeDialog();
      notify(form.dataset.mode === "edit" ? "تم تعديل المصروف." : "تمت إضافة المصروف.", "success");
      return void refresh({ preserveScroll: true, force: true });
    }

    if (action === "delete-expense") {
      if (!window.confirm("هل تريد حذف هذا المصروف؟")) return;

      const result = callEngine(modules.expense, ["deleteExpense", "removeExpense", "delete"], [
        target.dataset.expenseId,
        { store: getStore() }
      ]);

      if (result === null) return notify("تعذر حذف المصروف.", "danger");

      notify("تم حذف المصروف.", "success");
      return void refresh({ preserveScroll: true, force: true });
    }

    if (action === "submit-saving") {
      const result = getFormData("saving");
      if (!result) return;

      const saved = callEngine(modules.savings, ["addDeposit", "createEntry", "addEntry", "deposit"], [
        {
          amount: nonNegative(result.values.amount),
          date: result.values.date,
          notes: result.values.notes,
          type: "deposit"
        },
        { store: getStore() }
      ]);

      if (saved === null) return notify("تعذر إضافة مبلغ الادخار.", "danger");

      closeDialog();
      notify("تمت إضافة مبلغ الادخار.", "success");
      return void refresh({ preserveScroll: true, force: true });
    }

    if (action === "submit-saving-plan") {
      const result = getFormData("saving-plan");
      if (!result) return;

      const saved = callEngine(modules.savings, ["setMonthlySaving", "updatePlan", "setPlan", "savePlan"], [
        { monthlySaving: nonNegative(result.values.monthlySaving) },
        { store: getStore() }
      ]);

      if (saved === null) return notify("تعذر حفظ خطة الادخار.", "danger");

      closeDialog();
      notify("تم تحديث خطة الادخار.", "success");
      return void refresh({ preserveScroll: true, force: true });
    }

    if (action === "create-monthly-plan") {
      const plan = callEngine(modules.ai, ["createMonthlyPlan"], [
        { store: getStore() }
      ]);

      if (!plan) return notify("تعذر إنشاء الخطة الذكية.", "danger");
      return void openDialog("monthly-plan", { plan });
    }

    if (action === "edit-payment") {
      const payment = asArray(snapshot.payments?.payments).find(
        (item) => String(item.id) === String(target.dataset.paymentId)
      );

      if (payment) openDialog("payment", { mode: "edit", payment });
      return;
    }

    if (action === "submit-payment") {
      const result = getFormData("payment");
      if (!result) return;

      const { form, values } = result;
      const payload = {
        title: values.title,
        amount: nonNegative(values.amount),
        dueDate: values.dueDate,
        type: values.type,
        paymentMethod: values.paymentMethod,
        currency: snapshot.currency,
        status: "pending"
      };

      const saved =
        form.dataset.mode === "edit"
          ? callEngine(modules.payments, ["updatePayment"], [
              form.dataset.paymentId,
              payload,
              { store: getStore() }
            ])
          : callEngine(modules.payments, ["createPayment"], [
              payload,
              { store: getStore() }
            ]);

      if (!saved) return notify("تعذر حفظ الدفعة.", "danger");

      closeDialog();
      notify("تم حفظ الدفعة.", "success");
      return void refresh({ preserveScroll: true, force: true });
    }

    if (action === "pay-payment") {
      const id = target.dataset.paymentId;
      const payment = asArray(snapshot.payments?.payments).find(
        (item) => String(item.id) === String(id)
      );

      return void openDialog("pay-payment", { paymentId: id, payment });
    }

    if (action === "submit-payment-record") {
      const result = getFormData("payment-record");
      if (!result) return;

      const saved = callEngine(modules.payments, ["recordPayment", "markPaid"], [
        result.form.dataset.paymentId,
        {
          amount: nonNegative(result.values.amount),
          paidAt: result.values.paidAt,
          createExpense: true
        },
        { store: getStore() }
      ]);

      if (!saved) return notify("تعذر تسجيل الدفع.", "danger");

      closeDialog();
      notify("تم تسجيل الدفع وربطه بالمصروفات.", "success");
      return void refresh({ preserveScroll: true, force: true });
    }

    if (action === "delete-payment") {
      if (!window.confirm("هل تريد حذف هذه الدفعة؟")) return;

      const result = callEngine(modules.payments, ["deletePayment"], [
        target.dataset.paymentId,
        { store: getStore() }
      ]);

      if (!result) return notify("تعذر حذف الدفعة.", "danger");

      notify("تم حذف الدفعة.", "success");
      return void refresh({ preserveScroll: true, force: true });
    }

    if (action === "submit-ai-question") {
      const result = getFormData("ai-question");
      if (!result) return;

      const answer = callEngine(modules.ai, ["answerQuestion", "ask"], [
        result.values.question,
        { store: getStore() }
      ]);

      const output = state.container?.querySelector("[data-ai-answer]");
      if (!answer || !output) return notify("تعذر الحصول على إجابة.", "danger");

      output.innerHTML = `
        <article class="tic-card tic-card-body tic-budget-ai-answer">
          <span class="tic-chip">AI ANSWER</span>
          <p>${escapeHTML(answer.answerAr || answer.answer || "")}</p>
        </article>
      `;
      return;
    }

    if (action === "run-recommendation") {
      const item = snapshot.recommendations.find(
        (entry) => String(entry.id) === String(target.dataset.recommendationId)
      );

      if (!executeSourceAction(item)) {
        notify(item?.messageAr || "تم فتح التوصية.", "info");
      }
      return;
    }

    if (action === "dismiss-recommendation") {
      callEngine(modules.ai, ["dismissRecommendation"], [
        target.dataset.recommendationId,
        { store: getStore() }
      ]);

      notify("تم إخفاء التوصية.", "success");
      return void refresh({ preserveScroll: true, force: true });
    }

    if (action === "run-alert-action") {
      const item = snapshot.activeAlerts.find(
        (entry) => String(entry.id) === String(target.dataset.alertId)
      );

      if (!executeSourceAction(item)) {
        notify(item?.messageAr || "تم فتح التنبيه.", "info");
      }
      return;
    }

    if (action === "acknowledge-alert") {
      callEngine(modules.alerts, ["acknowledgeAlert"], [
        target.dataset.alertId,
        { store: getStore() }
      ]);

      notify("تمت مراجعة التنبيه.", "success");
      return void refresh({ preserveScroll: true, force: true });
    }

    if (action === "snooze-alert") {
      callEngine(modules.alerts, ["snoozeAlert"], [
        target.dataset.alertId,
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        { store: getStore() }
      ]);

      notify("تم تأجيل التنبيه ليوم واحد.", "success");
      return void refresh({ preserveScroll: true, force: true });
    }

    if (action === "refresh-alerts") {
      callEngine(modules.alerts, ["refresh"], [{ store: getStore() }]);
      notify("تم تحديث التنبيهات.", "success");
      return void refresh({ preserveScroll: true, force: true });
    }

    if (action === "export-csv") {
      return void callEngine(modules.export, ["downloadReport"], [
        { store: getStore(), report: "expenses", format: "csv" }
      ]);
    }

    if (action === "export-json") {
      return void callEngine(modules.export, ["downloadReport"], [
        { store: getStore(), report: "full", format: "json" }
      ]);
    }

    if (action === "print-report") {
      return void callEngine(modules.export, ["printReport"], [
        { store: getStore(), report: "executive", format: "html" }
      ]);
    }
  };

  const onContainerClick = (event) => {
    const question = event.target.closest("[data-ai-question]");

    if (question) {
      const textarea = state.container?.querySelector(
        '[data-budget-form="ai-question"] textarea'
      );

      if (textarea) {
        textarea.value = question.dataset.aiQuestion;
        textarea.focus();
      }
      return;
    }

    const view = event.target.closest("[data-budget-view]");

    if (view) {
      switchView(view.dataset.budgetView);
      return;
    }

    const target = event.target.closest("[data-budget-action]");

    if (!target) {
      if (event.target.matches("[data-budget-dialog-backdrop]")) closeDialog();
      return;
    }

    event.preventDefault();

    handleAction(target.dataset.budgetAction, target).catch((error) => {
      console.error("TIC Budget action failed:", error);
      notify("حدث خطأ أثناء تنفيذ العملية.", "danger");
    });
  };

  const bindContainerEvents = () => {
    if (!state.container) return;

    state.container.removeEventListener("click", onContainerClick);
    state.container.addEventListener("click", onContainerClick);
  };

  const registerActions = () => {
    const ui = getUI();

    if (!ui || typeof ui.registerAction !== "function") return;

    const register = (name, handler) => {
      if (ui.hasAction?.(name)) return;

      const unsubscribe = ui.registerAction(name, handler);

      if (typeof unsubscribe === "function") {
        state.actionUnsubscribers.push(unsubscribe);
      }
    };

    register("budget-add-expense", () => openDialog("expense"));
    register("budget-ask-ai", () => openDialog("ask-ai"));
    register("budget-open-trips", () => getRouter()?.go?.("trips"));
  };

  const subscribeToStore = () => {
    const store = getStore();

    if (!store || typeof store.subscribe !== "function" || state.unsubscribeStore) return;

    state.unsubscribeStore = store.subscribe(() => {
      if (state.mounted && !state.activeDialog) scheduleRefresh();
    });
  };

  const subscribeToIntegration = () => {
    const integration = engines().integration;

    if (
      !integration ||
      typeof integration.subscribe !== "function" ||
      state.integrationUnsubscribe
    ) {
      return;
    }

    state.integrationUnsubscribe = integration.subscribe(
      () => {
        if (state.mounted && !state.activeDialog) scheduleRefresh();
      },
      { immediate: false }
    );
  };

  const bindGlobalEvents = () => {
    if (state.eventBindings.length) return;

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
        if (state.mounted && !state.activeDialog) scheduleRefresh();
      };

      window.addEventListener(name, handler);
      state.eventBindings.push({ name, handler });
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
        console.warn("TIC Budget integration bootstrap warning:", error);
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
        engine[method]({ store: getStore() });
      } catch (error) {
        console.warn("TIC Budget engine bootstrap warning:", error);
      }
    });
  };

  const BudgetPage = {
    id: PAGE_ID,
    title: "الميزانية",
    icon: "◈",
    version: PAGE_VERSION,

    init() {
      if (state.initialized) return this.diagnostics();

      bootstrapEngines();
      registerActions();
      subscribeToStore();
      subscribeToIntegration();
      bindGlobalEvents();
      bindScrollStability();

      state.initialized = true;

      emit("initialized", {
        version: PAGE_VERSION,
        engines: Object.fromEntries(
          Object.entries(engines()).map(([key, value]) => [key, Boolean(value)])
        )
      });

      return this.diagnostics();
    },

    render() {
      this.init();
      return renderPage(buildSnapshot());
    },

    mount(context = {}) {
      this.init();

      const container = resolveContainer(context.container);

      if (!container) {
        throw new Error("TIC Budget Error: route container not found.");
      }

      state.container = container;
      state.mounted = true;

      const snapshot = buildSnapshot();

      container.innerHTML = renderPage(snapshot);
      state.lastSignature = signature(snapshot);
      state.lastKnownScrollY = window.scrollY;

      bindContainerEvents();
      bindScrollStability();

      emit("mounted", {
        annualBudget: snapshot.annualBudget,
        totalSpent: snapshot.totalSpent,
        healthScore: snapshot.healthScore
      });

      return container;
    },

    afterEnter(context = {}) {
      const container = resolveContainer(context.container);

      if (container) {
        state.container = container;
        state.mounted = true;
      }

      bindContainerEvents();
      bindScrollStability();

      refresh({
        preserveScroll: false,
        force: true
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
        state.container.removeEventListener("click", onContainerClick);
      }

      state.mounted = false;
      state.container = null;

      emit("unmounted");
      return true;
    },

    refresh,

    setView(view) {
      return switchView(view);
    },

    getView() {
      return state.activeView;
    },

    getSnapshot() {
      return clone(state.lastSnapshot || buildSnapshot());
    },

    getDashboard() {
      return this.getSnapshot();
    },

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError("TIC Budget subscriber must be a function.");
      }

      state.subscribers.add(listener);
      return () => state.subscribers.delete(listener);
    },

    destroy() {
      this.unmount();

      if (typeof state.unsubscribeStore === "function") state.unsubscribeStore();
      if (typeof state.integrationUnsubscribe === "function") state.integrationUnsubscribe();

      state.actionUnsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === "function") unsubscribe();
      });

      state.eventBindings.forEach(({
        name,
        eventName,
        handler,
        target = window
      }) => {
        target.removeEventListener(
          eventName || name,
          handler
        );
      });

      if (state.refreshTimer) {
        window.clearTimeout(state.refreshTimer);
      }

      if (state.scrollIdleTimer) {
        window.clearTimeout(state.scrollIdleTimer);
      }

      state.unsubscribeStore = null;
      state.integrationUnsubscribe = null;
      state.actionUnsubscribers = [];
      state.eventBindings = [];
      state.refreshTimer = null;
      state.scrollIdleTimer = null;
      state.isUserScrolling = false;
      state.pendingRefresh = false;
      state.lastKnownScrollY = 0;
      state.subscribers.clear();
      state.lastSnapshot = null;
      state.lastSignature = "";
      state.activeView = VIEWS.OVERVIEW;
      state.initialized = false;
      state.refreshing = false;

      return true;
    },

    diagnostics() {
      const availableEngines = Object.fromEntries(
        Object.entries(engines()).map(([key, engine]) => [key, Boolean(engine)])
      );

      return {
        id: this.id,
        title: this.title,
        version: this.version,
        initialized: state.initialized,
        mounted: state.mounted,
        activeView: state.activeView,
        activeDialog: state.activeDialog,
        hasContainer: Boolean(state.container),
        storeAvailable: Boolean(getStore()),
        routerAvailable: Boolean(getRouter()),
        uiAvailable: Boolean(getUI()),
        engines: availableEngines,
        connectedEngineCount: Object.values(availableEngines).filter(Boolean).length,
        actionCount: state.actionUnsubscribers.length,
        eventBindingCount: state.eventBindings.length,
        subscriberCount: state.subscribers.size,
        hasSnapshot: Boolean(state.lastSnapshot),
        integrationHealth: clone(state.lastSnapshot?.integrationHealth || null)
      };
    }
  };

  window.TIC = window.TIC || {};
  window.TIC.Pages = window.TIC.Pages || {};
  window.TIC.Pages.budget = BudgetPage;
  window.TICBudgetPage = BudgetPage;

  const router = getRouter();

  if (router && typeof router.register === "function") {
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

    if (typeof router.registerPage === "function") {
      router.registerPage("budget", BudgetPage);
    }
  }

  BudgetPage.init();
})(window, document);
