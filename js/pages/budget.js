/* =========================================================
   Travel Intelligence Center
   Budget Page Module V2.0.0

   File Path:
   js/pages/budget.js

   Purpose:
   - Premium iPhone-first travel budget dashboard.
   - Tracks annual budget, trip budgets, savings and expenses.
   - Reads live data from TIC Store.
   - Uses TIC UI and TIC Router.

   Dependencies:
   - js/config.js
   - js/store.js
   - js/router.js
   - js/ui.js

   Global APIs:
   - window.TIC.Pages.budget
   - window.TICBudgetPage
========================================================= */

(function (window, document) {
  "use strict";

  const Config = window.TICConfig || window.TIC?.Config || {};
  const PAGE_ID = "budget";
  const PAGE_VERSION = "2.0.0";

  const state = {
    initialized: false,
    mounted: false,
    container: null,
    unsubscribeStore: null,
    actionUnsubscribers: [],
    subscribers: new Set(),
    lastSnapshot: null
  };

  const clone = (value) => {
    if (value === undefined) return undefined;

    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch (error) {
        // Continue to fallback.
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

  const getStore = () =>
    window.TIC?.Store ||
    window.TICStore ||
    null;

  const getRouter = () =>
    window.TIC?.Router ||
    window.TICRouter ||
    null;

  const getUI = () =>
    window.TIC?.UI ||
    window.TICUI ||
    null;

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
        console.error("TIC Budget subscriber error:", error);
      }
    });

    window.dispatchEvent(
      new CustomEvent(`tic:page:${PAGE_ID}:${type}`, {
        detail: payload
      })
    );

    return payload;
  };

  const getStoreState = () => {
    const store = getStore();

    if (!store) return {};

    if (typeof store.getState === "function") {
      return clone(store.getState()) || {};
    }

    if (typeof store.get === "function") {
      return {
        profile: store.get("profile"),
        trips: store.get("trips"),
        budgets: store.get("budgets"),
        savings: store.get("savings")
      };
    }

    return {};
  };

  const buildSnapshot = () => {
    const raw = getStoreState();
    const profile =
      raw.profile &&
      typeof raw.profile === "object"
        ? raw.profile
        : {};

    const trips = Array.isArray(raw.trips)
      ? raw.trips
      : [];

    const annualBudget = number(
      profile.annualTravelBudget,
      number(
        Config.profile?.annualTravelBudget,
        30000
      )
    );

    const monthlySaving = number(
      profile.monthlySaving,
      number(
        Config.profile?.monthlySaving,
        1500
      )
    );

    const totalTripBudget = trips.reduce(
      (total, trip) =>
        total + number(trip.budget),
      0
    );

    const totalSpent = trips.reduce(
      (total, trip) =>
        total + number(trip.spent),
      0
    );

    const remainingAnnual = Math.max(
      0,
      annualBudget - totalSpent
    );

    const annualUsage =
      annualBudget > 0
        ? Math.min(
            100,
            Math.round(
              (totalSpent / annualBudget) * 100
            )
          )
        : 0;

    const savingsSource = Array.isArray(raw.savings)
      ? raw.savings
      : [];

    const totalSavings = savingsSource.reduce(
      (total, item) =>
        total +
        number(
          typeof item === "number"
            ? item
            : item.amount
        ),
      0
    );

    const snapshot = {
      raw,
      profile,
      trips,
      annualBudget,
      monthlySaving,
      totalTripBudget,
      totalSpent,
      remainingAnnual,
      annualUsage,
      totalSavings,
      statistics: {
        tripsWithBudget: trips.filter(
          (trip) => number(trip.budget) > 0
        ).length,
        overBudgetTrips: trips.filter(
          (trip) =>
            number(trip.spent) >
            number(trip.budget)
        ).length,
        averageTripBudget:
          trips.length > 0
            ? Math.round(
                totalTripBudget /
                trips.length
              )
            : 0
      }
    };

    state.lastSnapshot = snapshot;

    return snapshot;
  };

  const renderOverview = (snapshot) => {
    const ui = getUI();

    return `
      <article class="tic-budget-overview">
        <small>الميزانية السنوية</small>

        <strong>
          ${escapeHTML(
            ui.currency(
              snapshot.annualBudget
            )
          )}
        </strong>

        <p style="margin-top:10px;color:rgba(255,255,255,.72)">
          تم استخدام ${snapshot.annualUsage}% من الميزانية
        </p>

        <div style="margin-top:18px">
          ${ui.progress(
            snapshot.annualUsage,
            {
              label: "استخدام الميزانية",
              hint:
                `${ui.currency(
                  snapshot.remainingAnnual
                )} متبقي`
            }
          )}
        </div>

        <div class="tic-budget-breakdown">
          <div class="tic-budget-breakdown-item">
            <small>إجمالي المصروف</small>
            <strong>
              ${escapeHTML(
                ui.currency(
                  snapshot.totalSpent
                )
              )}
            </strong>
          </div>

          <div class="tic-budget-breakdown-item">
            <small>الادخار الشهري</small>
            <strong>
              ${escapeHTML(
                ui.currency(
                  snapshot.monthlySaving
                )
              )}
            </strong>
          </div>

          <div class="tic-budget-breakdown-item">
            <small>إجمالي الادخار</small>
            <strong>
              ${escapeHTML(
                ui.currency(
                  snapshot.totalSavings
                )
              )}
            </strong>
          </div>
        </div>
      </article>
    `;
  };

  const renderStatistics = (snapshot) => {
    const ui = getUI();

    return ui.grid(
      [
        {
          icon: "◈",
          value: ui.currency(
            snapshot.totalTripBudget
          ),
          label: "ميزانيات الرحلات",
          subtitle:
            "الإجمالي المخطط"
        },
        {
          icon: "✈",
          value:
            snapshot.statistics.tripsWithBudget,
          label: "رحلات بميزانية",
          subtitle:
            "رحلات محددة مالياً"
        },
        {
          icon: "!",
          value:
            snapshot.statistics.overBudgetTrips,
          label: "تجاوز الميزانية",
          subtitle:
            "تحتاج مراجعة"
        },
        {
          icon: "◎",
          value: ui.currency(
            snapshot.statistics.averageTripBudget
          ),
          label: "متوسط الرحلة",
          subtitle:
            "حسب الرحلات الحالية"
        }
      ]
        .map((item) => ui.stat(item))
        .join(""),
      {
        columns: 4
      }
    );
  };

  const renderTripBudgets = (snapshot) => {
    const ui = getUI();

    if (!snapshot.trips.length) {
      return ui.empty({
        icon: "◈",
        title: "لا توجد بيانات ميزانية",
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
      <div class="tic-settings-list">
        ${snapshot.trips
          .map((trip) => {
            const budget = number(trip.budget);
            const spent = number(trip.spent);

            const usage =
              budget > 0
                ? Math.min(
                    100,
                    Math.round(
                      (spent / budget) * 100
                    )
                  )
                : 0;

            const remaining =
              budget - spent;

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
                  </div>

                  ${ui.badge(
                    usage > 100
                      ? "متجاوزة"
                      : usage >= 80
                        ? "قريبة"
                        : "ضمن الخطة",
                    usage > 100
                      ? "danger"
                      : usage >= 80
                        ? "warning"
                        : "success"
                  )}
                </div>

                <div class="tic-trip-meta">
                  ${ui.info(
                    "الميزانية",
                    ui.currency(budget)
                  )}

                  ${ui.info(
                    "المصروف",
                    ui.currency(spent)
                  )}

                  ${ui.info(
                    "المتبقي",
                    ui.currency(
                      Math.max(0, remaining)
                    )
                  )}
                </div>

                <div style="margin-top:15px">
                  ${ui.progress(
                    Math.min(100, usage),
                    {
                      label:
                        "استخدام الميزانية",
                      hint:
                        usage > 100
                          ? `تجاوز بمقدار ${ui.currency(
                              Math.abs(remaining)
                            )}`
                          : `${usage}% مستخدم`
                    }
                  )}
                </div>

                <div style="margin-top:15px">
                  ${ui.button({
                    label: "عرض الرحلة",
                    route: "trips",
                    view: "details",
                    params: {
                      tripId: trip.id
                    },
                    block: true
                  })}
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  };

  const renderSavings = (snapshot) => {
    const ui = getUI();

    const yearlySaving =
      snapshot.monthlySaving * 12;

    const coverage =
      snapshot.annualBudget > 0
        ? Math.min(
            100,
            Math.round(
              (yearlySaving /
                snapshot.annualBudget) *
                100
            )
          )
        : 0;

    return ui.grid(
      `
        ${ui.card({
          icon: "◈",
          title: "الادخار الشهري",
          description:
            "المبلغ المحدد لتجهيز الرحلات القادمة.",
          body: `
            <strong class="tic-stat-value">
              ${escapeHTML(
                ui.currency(
                  snapshot.monthlySaving
                )
              )}
            </strong>

            <p class="tic-card-text">
              سنوياً:
              ${escapeHTML(
                ui.currency(yearlySaving)
              )}
            </p>
          `
        })}

        ${ui.card({
          icon: "✓",
          title: "تغطية الميزانية",
          description:
            "نسبة تغطية الادخار السنوي للميزانية.",
          body: ui.progress(
            coverage,
            {
              label:
                "تغطية الادخار",
              hint:
                `${coverage}% من الميزانية السنوية`
            }
          )
        })}
      `,
      {
        columns: 2
      }
    );
  };

  const renderInsights = (snapshot) => {
    const ui = getUI();
    const insights = [];

    if (
      snapshot.statistics.overBudgetTrips > 0
    ) {
      insights.push({
        icon: "!",
        title: "رحلات تجاوزت الميزانية",
        description:
          `لديك ${snapshot.statistics.overBudgetTrips} رحلة تحتاج مراجعة المصروفات.`,
        tone: "warning"
      });
    }

    if (snapshot.monthlySaving <= 0) {
      insights.push({
        icon: "◈",
        title: "حدد ادخاراً شهرياً",
        description:
          "إضافة مبلغ شهري تساعدك على تجهيز الرحلات القادمة.",
        tone: "info"
      });
    }

    if (
      snapshot.annualUsage >= 80 &&
      snapshot.annualUsage <= 100
    ) {
      insights.push({
        icon: "!",
        title: "الميزانية السنوية قاربت على الانتهاء",
        description:
          "راجع الرحلات القادمة قبل إضافة مصروفات جديدة.",
        tone: "warning"
      });
    }

    if (!insights.length) {
      insights.push({
        icon: "✓",
        title: "الوضع المالي منظم",
        description:
          "لا توجد تنبيهات مالية مهمة حالياً.",
        tone: "success"
      });
    }

    return ui.grid(
      insights
        .map((item) =>
          ui.card({
            icon: item.icon,
            title: item.title,
            description: item.description,
            badge:
              item.tone === "success"
                ? "ممتاز"
                : item.tone === "warning"
                  ? "تنبيه"
                  : "معلومة",
            badgeTone: item.tone
          })
        )
        .join(""),
      {
        columns: 2
      }
    );
  };

  const renderPage = (snapshot) => {
    const ui = getUI();

    return `
      <div
        class="tic-module"
        data-page="budget"
        data-page-version="${PAGE_VERSION}"
      >
        ${ui.hero({
          badge: "Budget Center",
          title: "ميزانية السفر",
          subtitle:
            "تابع ميزانيتك السنوية والادخار ومصروفات الرحلات من مكان واحد.",
          actions: [
            {
              label: "عرض الرحلات",
              route: "trips",
              primary: true,
              icon: "✈"
            }
          ]
        })}

        ${ui.section({
          eyebrow: "ANNUAL OVERVIEW",
          title: "الملخص المالي",
          subtitle:
            "نظرة شاملة على ميزانية السفر الحالية.",
          content: renderOverview(snapshot)
        })}

        ${ui.section({
          eyebrow: "BUDGET SNAPSHOT",
          title: "مؤشرات الميزانية",
          subtitle:
            "أهم الأرقام المرتبطة برحلاتك.",
          content:
            renderStatistics(snapshot)
        })}

        ${ui.section({
          eyebrow: "TRIP BUDGETS",
          title: "ميزانيات الرحلات",
          subtitle:
            "تابع الميزانية والمصروف والمتبقي لكل رحلة.",
          content:
            renderTripBudgets(snapshot)
        })}

        ${ui.section({
          eyebrow: "SAVINGS",
          title: "خطة الادخار",
          subtitle:
            "تابع الادخار الشهري ومدى تغطيته للميزانية.",
          content:
            renderSavings(snapshot)
        })}

        ${ui.section({
          eyebrow: "SMART INSIGHTS",
          title: "ملاحظات ذكية",
          subtitle:
            "تنبيهات مالية مبنية على بيانات السفر الحالية.",
          content:
            renderInsights(snapshot)
        })}
      </div>
    `;
  };

  const refresh = () => {
    if (!state.container || !state.mounted) {
      return false;
    }

    const snapshot = buildSnapshot();

    state.container.innerHTML =
      renderPage(snapshot);

    emit("refreshed", {
      annualBudget:
        snapshot.annualBudget,
      totalSpent:
        snapshot.totalSpent,
      annualUsage:
        snapshot.annualUsage
    });

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

      state.actionUnsubscribers.push(
        ui.registerAction(name, handler)
      );
    };

    register("budget-open-trips", () =>
      getRouter()?.go?.("trips")
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
          refresh();
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

      registerActions();
      subscribeToStore();

      state.initialized = true;

      emit("initialized", {
        version: PAGE_VERSION
      });

      return this.diagnostics();
    },

    render() {
      this.init();
      return renderPage(buildSnapshot());
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

      state.container = container;
      state.mounted = true;

      const snapshot = buildSnapshot();

      container.innerHTML =
        renderPage(snapshot);

      emit("mounted", {
        annualBudget:
          snapshot.annualBudget,
        totalSpent:
          snapshot.totalSpent
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

      if (
        typeof state.unsubscribeStore === "function"
      ) {
        state.unsubscribeStore();
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

      state.unsubscribeStore = null;
      state.actionUnsubscribers = [];
      state.subscribers.clear();
      state.lastSnapshot = null;
      state.initialized = false;

      return true;
    },

    diagnostics() {
      return {
        id: this.id,
        title: this.title,
        version: this.version,
        initialized: state.initialized,
        mounted: state.mounted,
        hasContainer: Boolean(
          state.container
        ),
        storeAvailable: Boolean(getStore()),
        routerAvailable: Boolean(
          getRouter()
        ),
        uiAvailable: Boolean(getUI()),
        actionCount:
          state.actionUnsubscribers.length,
        subscriberCount:
          state.subscribers.size,
        hasSnapshot: Boolean(
          state.lastSnapshot
        )
      };
    }
  };

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
