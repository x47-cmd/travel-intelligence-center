Travel Intelligence Center
Budget Page UX Stabilization Patch V3.1.0

TARGET FILE:
js/pages/budget.js

IMPORTANT:
Apply the following replacements inside the current js/pages/budget.js file.
Do not create a second JavaScript file.

=========================================================
1) Replace the page version
=========================================================

FIND:
const PAGE_VERSION = "3.0.0";

REPLACE WITH:
const PAGE_VERSION = "3.1.0";

=========================================================
2) Add the following state properties
=========================================================

Inside the state object, after:
refreshTimer: null

replace it with:
refreshTimer: null,
lastRenderSignature: "",
lastRefreshAt: 0,
passiveRefreshDelay: 220

=========================================================
3) Replace renderHero completely
=========================================================

const renderHero = (snapshot) => {
  const unread =
    snapshot.notifications?.summary?.unread ||
    snapshot.unreadNotifications.length;

  return `
    <section class="tic-budget-hero tic-budget-hero-compact">
      <div class="tic-budget-hero-copy">
        <span class="tic-budget-hero-badge">
          Budget Intelligence
        </span>

        <h1>مركز الميزانية الذكي</h1>

        <p>
          تابع ميزانية السفر والمصروفات والادخار
          والدفعات والتوقعات من مكان واحد.
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

      ${
        unread > 0
          ? `
            <button
              type="button"
              class="tic-budget-hero-notice"
              data-budget-view="alerts"
            >
              <span>!</span>
              <span>
                لديك ${escapeHTML(unread)}
                إشعار مالي غير مقروء
              </span>
            </button>
          `
          : ""
      }
    </section>
  `;
};

=========================================================
4) Replace renderOverviewView completely
=========================================================

const renderOverviewView = (snapshot) => `
  <section
    class="tic-budget-view"
    data-budget-panel="overview"
  >
    <section class="tic-budget-priority-section">
      <div class="tic-budget-section-heading">
        <div>
          <small>SMART ACTION</small>
          <h2>أفضل إجراء الآن</h2>
        </div>

        ${button({
          label: "اسأل الذكاء",
          action: "show-ai"
        })}
      </div>

      ${renderTopRecommendation(snapshot)}
    </section>

    <section class="tic-budget-section-gap">
      ${renderFinancialOverview(snapshot)}
    </section>

    <section class="tic-budget-section-gap">
      ${renderKpis(snapshot)}
    </section>

    <div class="tic-budget-split tic-budget-section-gap">
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

      <section>
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
    </div>
  </section>
`;

=========================================================
5) Add this helper before refresh
=========================================================

const buildRenderSignature = (snapshot) =>
  JSON.stringify({
    view: state.activeView,
    annualBudget: snapshot.annualBudget,
    totalSpent: snapshot.totalSpent,
    remaining: snapshot.remaining,
    usagePercent: snapshot.usagePercent,
    healthScore: snapshot.healthScore,
    savingsBalance: snapshot.savings?.balance,
    monthlySaving: snapshot.savings?.monthlySaving,
    tripCount: snapshot.trips?.totalTrips,
    tripPlanned: snapshot.trips?.totalPlanned,
    expenseCount: snapshot.expenses.length,
    paymentCount:
      asArray(snapshot.payments?.payments).length,
    paymentRemaining:
      snapshot.payments?.summary?.remainingAmount,
    alertCount: snapshot.activeAlerts.length,
    notificationCount:
      snapshot.unreadNotifications.length,
    recommendationIds:
      snapshot.recommendations.map(
        (item) => item.id
      )
  });

=========================================================
6) Replace refresh completely
=========================================================

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
    state.activeDialog &&
    force !== true
  ) {
    return false;
  }

  state.refreshing = true;

  try {
    const snapshot = buildSnapshot();
    const signature =
      buildRenderSignature(snapshot);

    if (
      !force &&
      signature === state.lastRenderSignature
    ) {
      return false;
    }

    const scrollTop =
      preserveScroll
        ? window.scrollY
        : 0;

    state.container.innerHTML =
      renderPage(snapshot);

    state.lastRenderSignature =
      signature;

    state.lastRefreshAt =
      Date.now();

    bindContainerEvents();

    if (
      preserveScroll &&
      Math.abs(window.scrollY - scrollTop) > 2
    ) {
      window.requestAnimationFrame(() => {
        window.scrollTo(
          0,
          scrollTop
        );
      });
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

=========================================================
7) Replace scheduleRefresh completely
=========================================================

const scheduleRefresh = ({
  force = false,
  preserveScroll = true
} = {}) => {
  if (state.refreshTimer) {
    window.clearTimeout(
      state.refreshTimer
    );
  }

  state.refreshTimer =
    window.setTimeout(() => {
      state.refreshTimer = null;

      if (
        state.mounted &&
        !state.activeDialog
      ) {
        refresh({
          force,
          preserveScroll
        });
      }
    }, state.passiveRefreshDelay);
};

=========================================================
8) Replace the view-switch block inside onContainerClick
=========================================================

FIND:
if (view) {
  state.activeView =
    view.dataset.budgetView;

  refresh({ preserveScroll: false });
  return;
}

REPLACE WITH:
if (view) {
  const nextView =
    view.dataset.budgetView;

  if (
    !Object.values(VIEWS).includes(nextView) ||
    nextView === state.activeView
  ) {
    return;
  }

  state.activeView = nextView;
  state.lastRenderSignature = "";

  refresh({
    preserveScroll: false,
    force: true
  });

  window.requestAnimationFrame(() => {
    const platform =
      state.container?.querySelector(
        ".tic-budget-platform"
      );

    if (platform) {
      const top =
        platform.getBoundingClientRect().top +
        window.scrollY -
        12;

      window.scrollTo({
        top,
        behavior: "smooth"
      });
    }
  });

  return;
}

=========================================================
9) Update mount rendering
=========================================================

Inside mount(), immediately after:

container.innerHTML =
  renderPage(snapshot);

ADD:

state.lastRenderSignature =
  buildRenderSignature(snapshot);

=========================================================
10) Update afterEnter
=========================================================

Replace:

refresh({
  preserveScroll: false
});

With:

state.lastRenderSignature = "";

refresh({
  preserveScroll: false,
  force: true
});

=========================================================
11) Update setView
=========================================================

Replace the complete setView method with:

setView(view) {
  if (
    !Object.values(VIEWS).includes(view)
  ) {
    return false;
  }

  if (state.activeView === view) {
    return true;
  }

  state.activeView = view;
  state.lastRenderSignature = "";

  if (state.mounted) {
    refresh({
      preserveScroll: false,
      force: true
    });
  }

  return true;
},

=========================================================
12) Add cleanup in destroy
=========================================================

Inside destroy(), before return true, add:

state.lastRenderSignature = "";
state.lastRefreshAt = 0;

=========================================================
RESULT
=========================================================

This patch keeps all ten Budget Intelligence engines and all
existing features intact, while fixing the main iPhone UX issues:

- Avoids repeated full-page re-rendering when data did not change.
- Prevents refreshes while a dialog is open.
- Reduces event-storm refreshes with one debounced refresh.
- Keeps delegated click events active after rendering.
- Stops unnecessary scroll restoration calls.
- Makes tab switching controlled and predictable.
- Moves the AI recommendation above the large financial card.
- Uses a compact custom hero with correct local action names.
