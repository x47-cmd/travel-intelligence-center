/* =========================================================
   Travel Intelligence Center
   Budget Intelligence Platform
   Budget Notification Engine V1.0.0

   File Path:
   js/features/budget-notification-engine.js

   Purpose:
   - Production-ready notification orchestration for travel finance.
   - Converts alerts, payments, AI recommendations and analytics
     into user-facing in-app notifications.
   - Supports unread/read, archive, delete, snooze, priority,
     deduplication, batching and delivery preferences.
   - Persists notification state through the central Store.
   - Produces notification center summaries and badge counts.
   - Refreshes automatically when finance events change.

   Dependencies:
   - window.TICBudgetAnalytics
   - window.TICBudgetAI
   - window.TICPaymentTracker
   - window.TICExpenseAlertEngine
   - window.TICStore / window.Store

   Global:
   - window.TICBudgetNotificationEngine
   ========================================================= */

(function budgetNotificationEngineFactory(global) {
  "use strict";

  const VERSION = "1.0.0";
  const ENGINE_NAME = "TICBudgetNotificationEngine";

  const EVENTS = Object.freeze({
    READY: "tic:budget-notification-engine-ready",
    REFRESHED: "tic:budget-notifications-refreshed",
    CHANGED: "tic:budget-notifications-changed",
    CREATED: "tic:budget-notification-created",
    UPDATED: "tic:budget-notification-updated",
    READ: "tic:budget-notification-read",
    UNREAD: "tic:budget-notification-unread",
    ARCHIVED: "tic:budget-notification-archived",
    DELETED: "tic:budget-notification-deleted",
    SNOOZED: "tic:budget-notification-snoozed",
    DELIVERED: "tic:budget-notification-delivered",
    PREFERENCES_CHANGED: "tic:budget-notification-preferences-changed",
    ERROR: "tic:budget-notification-error"
  });

  const TYPE = Object.freeze({
    ALERT: "alert",
    PAYMENT: "payment",
    AI: "ai",
    BUDGET: "budget",
    SAVINGS: "savings",
    SYSTEM: "system",
    POSITIVE: "positive"
  });

  const PRIORITY = Object.freeze({
    CRITICAL: "critical",
    HIGH: "high",
    MEDIUM: "medium",
    LOW: "low",
    INFO: "info"
  });

  const STATUS = Object.freeze({
    ACTIVE: "active",
    SNOOZED: "snoozed",
    ARCHIVED: "archived",
    DELETED: "deleted"
  });

  const DEFAULT_PREFERENCES = Object.freeze({
    enabled: true,
    inApp: true,
    browser: false,
    sound: false,
    vibration: false,
    showPositive: true,
    showAIRecommendations: true,
    showPaymentReminders: true,
    showBudgetAlerts: true,
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    digestMode: "instant",
    maxVisible: 100,
    autoArchiveDays: 90
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

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, toNumber(value, min)));
  }

  function round(value, decimals) {
    const precision = Number.isInteger(decimals) ? decimals : 2;
    const factor = Math.pow(10, precision);

    return Math.round(
      (toNumber(value, 0) + Number.EPSILON) * factor
    ) / factor;
  }

  function createId(prefix) {
    return String(prefix || "notification") + "_" +
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

  function addDays(value, amount) {
    const date = safeDate(value) || new Date();
    date.setDate(date.getDate() + toNumber(amount, 0));
    return date;
  }

  function normalizePriority(value) {
    const raw = String(value || PRIORITY.MEDIUM)
      .trim()
      .toLowerCase();

    return Object.values(PRIORITY).includes(raw)
      ? raw
      : PRIORITY.MEDIUM;
  }

  function priorityWeight(priority) {
    const weights = {
      critical: 500,
      high: 400,
      medium: 300,
      low: 200,
      info: 100
    };

    return weights[priority] || 0;
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
        "تعذر قراءة بيانات الإشعارات.",
        "Unable to read notification data.",
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
        "تعذر حفظ بيانات الإشعارات.",
        "Unable to save notification data.",
        { cause: error.message }
      );
    }

    return false;
  }

  function getRoot(storeState) {
    const root = firstDefined(
      storeState && storeState.budgetNotifications,
      storeState &&
        storeState.budget &&
        storeState.budget.notifications,
      storeState &&
        storeState.finance &&
        storeState.finance.notifications
    );

    return isObject(root) ? root : {};
  }

  function getStoredNotifications(storeState) {
    const root = getRoot(storeState);

    return asArray(firstDefined(
      root.items,
      root.notifications,
      []
    ));
  }

  function getPreferences(storeState, options) {
    const root = getRoot(storeState);
    const stored = isObject(root.preferences)
      ? root.preferences
      : {};

    const provided = isObject(options && options.preferences)
      ? options.preferences
      : {};

    const merged = Object.assign(
      {},
      DEFAULT_PREFERENCES,
      stored,
      provided
    );

    merged.enabled = merged.enabled !== false;
    merged.inApp = merged.inApp !== false;
    merged.browser = merged.browser === true;
    merged.sound = merged.sound === true;
    merged.vibration = merged.vibration === true;
    merged.showPositive = merged.showPositive !== false;
    merged.showAIRecommendations =
      merged.showAIRecommendations !== false;
    merged.showPaymentReminders =
      merged.showPaymentReminders !== false;
    merged.showBudgetAlerts =
      merged.showBudgetAlerts !== false;
    merged.quietHoursEnabled =
      merged.quietHoursEnabled === true;
    merged.maxVisible = clamp(
      Math.round(toNumber(
        merged.maxVisible,
        DEFAULT_PREFERENCES.maxVisible
      )),
      10,
      500
    );
    merged.autoArchiveDays = clamp(
      Math.round(toNumber(
        merged.autoArchiveDays,
        DEFAULT_PREFERENCES.autoArchiveDays
      )),
      1,
      3650
    );

    return merged;
  }

  function persist(items, preferences, store) {
    const nextState = clone(readState(store));
    const root = getRoot(nextState);

    nextState.budgetNotifications = Object.assign({}, root, {
      items: clone(items),
      preferences: clone(preferences),
      updatedAt: new Date().toISOString()
    });

    if (isObject(nextState.budget)) {
      nextState.budget.notifications =
        clone(nextState.budgetNotifications);
    }

    if (isObject(nextState.finance)) {
      nextState.finance.notifications =
        clone(nextState.budgetNotifications);
    }

    return writeState(nextState, store);
  }

  function callEngine(engine, methods, options) {
    if (!engine) return null;

    for (let index = 0; index < methods.length; index += 1) {
      const method = methods[index];

      if (typeof engine[method] === "function") {
        try {
          const result = engine[method](options || {});
          if (result !== undefined && result !== null) {
            return result;
          }
        } catch (error) {
          // Continue to next compatible method.
        }
      }
    }

    return null;
  }

  function isQuietHours(preferences, now) {
    if (!preferences.quietHoursEnabled) return false;

    const date = safeDate(now) || new Date();
    const current = date.getHours() * 60 + date.getMinutes();

    function parse(value) {
      const parts = String(value || "00:00").split(":");
      return clamp(toNumber(parts[0], 0), 0, 23) * 60 +
        clamp(toNumber(parts[1], 0), 0, 59);
    }

    const start = parse(preferences.quietHoursStart);
    const end = parse(preferences.quietHoursEnd);

    if (start === end) return true;

    if (start < end) {
      return current >= start && current < end;
    }

    return current >= start || current < end;
  }

  function makeNotification(input) {
    const data = isObject(input) ? input : {};
    const now = new Date().toISOString();

    return {
      id: String(data.id || createId("budget_notification")),
      fingerprint: String(
        data.fingerprint ||
        [
          data.source,
          data.sourceId,
          data.type,
          data.titleAr,
          data.titleEn
        ].filter(Boolean).join("|")
      ),
      source: String(data.source || "budget"),
      sourceId: data.sourceId == null
        ? null
        : String(data.sourceId),
      type: String(data.type || TYPE.BUDGET),
      priority: normalizePriority(data.priority),
      status: STATUS.ACTIVE,
      titleAr: String(data.titleAr || ""),
      titleEn: String(data.titleEn || ""),
      messageAr: String(data.messageAr || ""),
      messageEn: String(data.messageEn || ""),
      actionLabelAr: String(data.actionLabelAr || "فتح"),
      actionLabelEn: String(data.actionLabelEn || "Open"),
      action: isObject(data.action)
        ? clone(data.action)
        : null,
      tripId: data.tripId == null
        ? null
        : String(data.tripId),
      expenseId: data.expenseId == null
        ? null
        : String(data.expenseId),
      paymentId: data.paymentId == null
        ? null
        : String(data.paymentId),
      alertId: data.alertId == null
        ? null
        : String(data.alertId),
      recommendationId: data.recommendationId == null
        ? null
        : String(data.recommendationId),
      read: data.read === true,
      delivered: data.delivered === true,
      deliveredAt: data.deliveredAt || null,
      readAt: data.readAt || null,
      archivedAt: data.archivedAt || null,
      deletedAt: data.deletedAt || null,
      snoozedUntil: data.snoozedUntil || null,
      expiresAt: data.expiresAt || null,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      metadata: isObject(data.metadata)
        ? clone(data.metadata)
        : {}
    };
  }

  function fromAlert(alert) {
    return makeNotification({
      id: "notification_alert_" + alert.id,
      fingerprint: "alert|" + alert.id,
      source: "expense-alert-engine",
      sourceId: alert.id,
      type: alert.type === "positive"
        ? TYPE.POSITIVE
        : TYPE.ALERT,
      priority: alert.severity,
      titleAr: alert.titleAr,
      titleEn: alert.titleEn,
      messageAr: alert.messageAr,
      messageEn: alert.messageEn,
      actionLabelAr: alert.actionLabelAr,
      actionLabelEn: alert.actionLabelEn,
      action: alert.action,
      tripId: alert.tripId,
      expenseId: alert.expenseId,
      paymentId: alert.paymentId,
      alertId: alert.id,
      expiresAt: alert.expiresAt || null,
      metadata: {
        severity: alert.severity,
        alertType: alert.type,
        impactAmount: alert.impactAmount
      }
    });
  }

  function fromPayment(payment) {
    const days = toNumber(payment.daysUntilDue, 0);
    const overdue = payment.status === "overdue";

    return makeNotification({
      id: "notification_payment_" + payment.id,
      fingerprint: "payment|" + payment.id + "|" + payment.status,
      source: "payment-tracker",
      sourceId: payment.id,
      type: TYPE.PAYMENT,
      priority: overdue
        ? PRIORITY.CRITICAL
        : days <= 1
          ? PRIORITY.HIGH
          : PRIORITY.MEDIUM,
      titleAr: overdue
        ? "دفعة متأخرة"
        : days === 0
          ? "دفعة مستحقة اليوم"
          : "دفعة قريبة",
      titleEn: overdue
        ? "Overdue payment"
        : days === 0
          ? "Payment due today"
          : "Upcoming payment",
      messageAr:
        payment.title + " بقيمة " +
        round(payment.remainingAmount, 2) +
        " " + payment.currency,
      messageEn:
        payment.title + " for " +
        round(payment.remainingAmount, 2) +
        " " + payment.currency,
      actionLabelAr: "فتح الدفعة",
      actionLabelEn: "Open payment",
      action: {
        name: "open-payment",
        payload: { paymentId: payment.id }
      },
      tripId: payment.tripId,
      paymentId: payment.id,
      expiresAt: payment.dueDate || null,
      metadata: {
        dueDate: payment.dueDate,
        daysUntilDue: payment.daysUntilDue,
        amount: payment.remainingAmount
      }
    });
  }

  function fromRecommendation(item) {
    return makeNotification({
      id: "notification_ai_" + item.id,
      fingerprint: "ai|" + item.id,
      source: "budget-ai",
      sourceId: item.id,
      type: TYPE.AI,
      priority: item.priority,
      titleAr: item.titleAr,
      titleEn: item.titleEn,
      messageAr: item.messageAr,
      messageEn: item.messageEn,
      actionLabelAr: item.actionLabelAr,
      actionLabelEn: item.actionLabelEn,
      action: item.action,
      tripId: item.tripId,
      recommendationId: item.id,
      expiresAt: item.expiresAt || null,
      metadata: {
        confidence: item.confidence,
        impactAmount: item.impactAmount,
        recommendationType: item.type
      }
    });
  }

  function fromAnalytics(snapshot) {
    const notifications = [];
    const currency = snapshot.currency || "AED";

    if (
      snapshot.forecast &&
      snapshot.forecast.likelyToExceed
    ) {
      notifications.push(makeNotification({
        id: "notification_budget_forecast_overrun",
        fingerprint: "budget|forecast-overrun",
        source: "budget-analytics",
        sourceId: "forecast-overrun",
        type: TYPE.BUDGET,
        priority: PRIORITY.HIGH,
        titleAr: "توقع بتجاوز الميزانية",
        titleEn: "Budget overrun forecast",
        messageAr:
          "التجاوز المتوقع " +
          round(snapshot.forecast.expectedOverrun, 2) +
          " " + currency,
        messageEn:
          "Expected overrun: " +
          round(snapshot.forecast.expectedOverrun, 2) +
          " " + currency,
        actionLabelAr: "عرض التوقعات",
        actionLabelEn: "View forecast",
        action: {
          name: "open-budget-forecast",
          payload: {}
        }
      }));
    }

    if (
      snapshot.savings &&
      toNonNegative(snapshot.savings.coveragePercent) < 40
    ) {
      notifications.push(makeNotification({
        id: "notification_savings_low",
        fingerprint: "savings|coverage-low",
        source: "budget-analytics",
        sourceId: "savings-low",
        type: TYPE.SAVINGS,
        priority:
          toNonNegative(snapshot.savings.coveragePercent) < 20
            ? PRIORITY.HIGH
            : PRIORITY.MEDIUM,
        titleAr: "تغطية الادخار منخفضة",
        titleEn: "Savings coverage is low",
        messageAr:
          "تغطية الادخار الحالية " +
          toNonNegative(snapshot.savings.coveragePercent) +
          "% فقط.",
        messageEn:
          "Current savings coverage is only " +
          toNonNegative(snapshot.savings.coveragePercent) +
          "%.",
        actionLabelAr: "فتح خطة الادخار",
        actionLabelEn: "Open savings plan",
        action: {
          name: "open-savings-plan",
          payload: {}
        }
      }));
    }

    if (
      snapshot.health &&
      toNumber(snapshot.health.score, 0) >= 85 &&
      !(
        snapshot.forecast &&
        snapshot.forecast.likelyToExceed
      )
    ) {
      notifications.push(makeNotification({
        id: "notification_budget_healthy",
        fingerprint: "budget|healthy",
        source: "budget-analytics",
        sourceId: "healthy",
        type: TYPE.POSITIVE,
        priority: PRIORITY.INFO,
        titleAr: "وضع ميزانيتك ممتاز",
        titleEn: "Your budget is in great shape",
        messageAr:
          "درجة الصحة المالية " +
          toNumber(snapshot.health.score, 0) +
          " من 100.",
        messageEn:
          "Financial health score: " +
          toNumber(snapshot.health.score, 0) +
          " out of 100.",
        actionLabelAr: "عرض التقرير",
        actionLabelEn: "View report",
        action: {
          name: "open-budget-report",
          payload: {}
        }
      }));
    }

    return notifications;
  }

  function mergeNotifications(generated, stored) {
    const storedMap = new Map();

    asArray(stored).forEach(function mapStored(item) {
      const normalized = makeNotification(item);
      storedMap.set(normalized.fingerprint, normalized);
      storedMap.set(normalized.id, normalized);
    });

    const generatedIds = new Set();

    const merged = asArray(generated).map(function merge(item) {
      generatedIds.add(item.id);
      generatedIds.add(item.fingerprint);

      const existing =
        storedMap.get(item.id) ||
        storedMap.get(item.fingerprint);

      if (!existing) return item;

      return Object.assign({}, item, {
        status: existing.status,
        read: existing.read,
        delivered: existing.delivered,
        deliveredAt: existing.deliveredAt,
        readAt: existing.readAt,
        archivedAt: existing.archivedAt,
        deletedAt: existing.deletedAt,
        snoozedUntil: existing.snoozedUntil,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString()
      });
    });

    asArray(stored).forEach(function keepManual(item) {
      const normalized = makeNotification(item);

      if (
        !generatedIds.has(normalized.id) &&
        !generatedIds.has(normalized.fingerprint)
      ) {
        merged.push(normalized);
      }
    });

    return merged;
  }

  function cleanup(items, preferences) {
    const now = new Date();
    const archiveThreshold = addDays(
      now,
      -preferences.autoArchiveDays
    );

    return asArray(items)
      .map(function clean(item) {
        const notification = makeNotification(item);

        const snoozedUntil = safeDate(
          notification.snoozedUntil
        );

        if (
          notification.status === STATUS.SNOOZED &&
          snoozedUntil &&
          snoozedUntil <= now
        ) {
          notification.status = STATUS.ACTIVE;
          notification.snoozedUntil = null;
        }

        const createdAt = safeDate(
          notification.createdAt
        );

        if (
          notification.status === STATUS.ACTIVE &&
          notification.read &&
          createdAt &&
          createdAt < archiveThreshold
        ) {
          notification.status = STATUS.ARCHIVED;
          notification.archivedAt =
            notification.archivedAt ||
            new Date().toISOString();
        }

        return notification;
      })
      .filter(function keep(item) {
        if (item.status === STATUS.DELETED) {
          return false;
        }

        const expiresAt = safeDate(item.expiresAt);

        if (
          expiresAt &&
          expiresAt < now &&
          item.status === STATUS.ACTIVE
        ) {
          return false;
        }

        return true;
      });
  }

  function generate(options) {
    const input = isObject(options) ? options : {};
    const storeState = readState(input.store);
    const preferences = getPreferences(storeState, input);

    if (!preferences.enabled) {
      return cleanup(
        getStoredNotifications(storeState),
        preferences
      );
    }

    const generated = [];

    if (preferences.showBudgetAlerts) {
      const alertsDashboard = callEngine(
        global.TICExpenseAlertEngine,
        ["getDashboard", "buildDashboard"],
        input
      ) || {};

      asArray(alertsDashboard.alerts)
        .filter(function active(alert) {
          return ![
            "dismissed",
            "resolved",
            "snoozed"
          ].includes(String(alert.status));
        })
        .forEach(function addAlert(alert) {
          if (
            alert.type === "positive" &&
            !preferences.showPositive
          ) {
            return;
          }

          generated.push(fromAlert(alert));
        });
    }

    if (preferences.showPaymentReminders) {
      const paymentDashboard = callEngine(
        global.TICPaymentTracker,
        ["getDashboard", "buildDashboard"],
        input
      ) || {};

      const paymentItems = []
        .concat(asArray(paymentDashboard.overdue))
        .concat(
          asArray(paymentDashboard.upcoming)
            .filter(function dueSoon(payment) {
              return payment.isDueSoon;
            })
        );

      paymentItems.forEach(function addPayment(payment) {
        generated.push(fromPayment(payment));
      });
    }

    if (preferences.showAIRecommendations) {
      const aiDashboard = callEngine(
        global.TICBudgetAI,
        ["getDashboard", "generateDashboard"],
        input
      ) || {};

      asArray(aiDashboard.recommendations)
        .slice(0, 5)
        .forEach(function addRecommendation(item) {
          if (
            item.type === "celebrate" &&
            !preferences.showPositive
          ) {
            return;
          }

          generated.push(fromRecommendation(item));
        });
    }

    const analytics = callEngine(
      global.TICBudgetAnalytics,
      ["getSnapshot", "getDashboard", "generate"],
      input
    ) || {};

    fromAnalytics(analytics).forEach(function addAnalytics(item) {
      if (
        item.type === TYPE.POSITIVE &&
        !preferences.showPositive
      ) {
        return;
      }

      generated.push(item);
    });

    const merged = cleanup(
      mergeNotifications(
        generated,
        getStoredNotifications(storeState)
      ),
      preferences
    );

    const unique = new Map();

    merged.forEach(function deduplicate(item) {
      const key = item.fingerprint || item.id;
      const existing = unique.get(key);

      if (!existing) {
        unique.set(key, item);
        return;
      }

      if (
        priorityWeight(item.priority) >
        priorityWeight(existing.priority)
      ) {
        unique.set(key, item);
      }
    });

    return Array.from(unique.values())
      .sort(function sortItems(a, b) {
        if (
          priorityWeight(b.priority) !==
          priorityWeight(a.priority)
        ) {
          return priorityWeight(b.priority) -
            priorityWeight(a.priority);
        }

        return String(b.createdAt)
          .localeCompare(String(a.createdAt));
      })
      .slice(0, preferences.maxVisible);
  }

  function persistCurrent(items, options) {
    const input = isObject(options) ? options : {};
    const storeState = readState(input.store);
    const preferences = getPreferences(storeState, input);

    return persist(items, preferences, input.store);
  }

  function createNotification(input, options) {
    const opts = isObject(options) ? options : {};
    const items = generate(
      Object.assign({}, opts, {
        includeStoredOnly: true
      })
    );

    const notification = makeNotification(input);

    const next = items.filter(function removeDuplicate(item) {
      return (
        item.id !== notification.id &&
        item.fingerprint !== notification.fingerprint
      );
    }).concat([notification]);

    persistCurrent(next, opts);

    dispatch(EVENTS.CREATED, {
      notification: notification
    });

    dispatch(EVENTS.CHANGED, {
      notification: notification
    });

    scheduleRefresh(opts);

    return clone(notification);
  }

  function updateNotification(id, patch, options) {
    const opts = isObject(options) ? options : {};
    const items = generate(opts);
    let updated = null;

    const next = items.map(function update(item) {
      if (String(item.id) !== String(id)) {
        return item;
      }

      updated = makeNotification(
        Object.assign({}, item, patch, {
          id: item.id,
          fingerprint: item.fingerprint,
          updatedAt: new Date().toISOString()
        })
      );

      return updated;
    });

    if (!updated) return null;

    persistCurrent(next, opts);

    dispatch(EVENTS.UPDATED, {
      notification: updated
    });

    dispatch(EVENTS.CHANGED, {
      notification: updated
    });

    scheduleRefresh(opts);

    return clone(updated);
  }

  function markRead(id, options) {
    const updated = updateNotification(
      id,
      {
        read: true,
        readAt: new Date().toISOString()
      },
      options || {}
    );

    if (updated) {
      dispatch(EVENTS.READ, {
        notification: updated
      });
    }

    return updated;
  }

  function markUnread(id, options) {
    const updated = updateNotification(
      id,
      {
        read: false,
        readAt: null
      },
      options || {}
    );

    if (updated) {
      dispatch(EVENTS.UNREAD, {
        notification: updated
      });
    }

    return updated;
  }

  function archiveNotification(id, options) {
    const updated = updateNotification(
      id,
      {
        status: STATUS.ARCHIVED,
        archivedAt: new Date().toISOString()
      },
      options || {}
    );

    if (updated) {
      dispatch(EVENTS.ARCHIVED, {
        notification: updated
      });
    }

    return updated;
  }

  function deleteNotification(id, options) {
    const updated = updateNotification(
      id,
      {
        status: STATUS.DELETED,
        deletedAt: new Date().toISOString()
      },
      options || {}
    );

    if (updated) {
      dispatch(EVENTS.DELETED, {
        notification: updated
      });
    }

    return updated;
  }

  function snoozeNotification(id, until, options) {
    const date = safeDate(until) || addDays(new Date(), 1);

    const updated = updateNotification(
      id,
      {
        status: STATUS.SNOOZED,
        snoozedUntil: date.toISOString()
      },
      options || {}
    );

    if (updated) {
      dispatch(EVENTS.SNOOZED, {
        notification: updated
      });
    }

    return updated;
  }

  function restoreNotification(id, options) {
    return updateNotification(
      id,
      {
        status: STATUS.ACTIVE,
        archivedAt: null,
        deletedAt: null,
        snoozedUntil: null
      },
      options || {}
    );
  }

  function markAllRead(options) {
    const input = isObject(options) ? options : {};
    const items = generate(input);
    const now = new Date().toISOString();

    const next = items.map(function read(item) {
      return Object.assign({}, item, {
        read: true,
        readAt: item.readAt || now,
        updatedAt: now
      });
    });

    persistCurrent(next, input);

    dispatch(EVENTS.CHANGED, {
      action: "mark-all-read",
      count: next.length
    });

    scheduleRefresh(input);
    return next.length;
  }

  function archiveAllRead(options) {
    const input = isObject(options) ? options : {};
    const items = generate(input);
    const now = new Date().toISOString();
    let count = 0;

    const next = items.map(function archive(item) {
      if (!item.read || item.status !== STATUS.ACTIVE) {
        return item;
      }

      count += 1;

      return Object.assign({}, item, {
        status: STATUS.ARCHIVED,
        archivedAt: now,
        updatedAt: now
      });
    });

    persistCurrent(next, input);

    dispatch(EVENTS.CHANGED, {
      action: "archive-all-read",
      count: count
    });

    scheduleRefresh(input);
    return count;
  }

  async function deliverBrowserNotification(notification, options) {
    const input = isObject(options) ? options : {};
    const storeState = readState(input.store);
    const preferences = getPreferences(storeState, input);

    if (
      !preferences.enabled ||
      !preferences.browser ||
      typeof global.Notification === "undefined"
    ) {
      return {
        delivered: false,
        reason: "browser-notifications-disabled"
      };
    }

    if (isQuietHours(preferences, input.now)) {
      return {
        delivered: false,
        reason: "quiet-hours"
      };
    }

    let permission = global.Notification.permission;

    if (permission === "default") {
      try {
        permission = await global.Notification.requestPermission();
      } catch (error) {
        return {
          delivered: false,
          reason: "permission-request-failed"
        };
      }
    }

    if (permission !== "granted") {
      return {
        delivered: false,
        reason: "permission-denied"
      };
    }

    const language = String(
      firstDefined(input.language, "ar")
    ).toLowerCase();

    const title = language === "en"
      ? notification.titleEn
      : notification.titleAr;

    const body = language === "en"
      ? notification.messageEn
      : notification.messageAr;

    try {
      const browserNotification = new global.Notification(
        title,
        {
          body: body,
          tag: notification.fingerprint,
          renotify: false,
          silent: !preferences.sound,
          data: {
            notificationId: notification.id,
            action: notification.action
          }
        }
      );

      if (preferences.vibration && global.navigator) {
        try {
          global.navigator.vibrate([100, 50, 100]);
        } catch (error) {
          // Vibration is optional.
        }
      }

      browserNotification.onclick = function onClick() {
        try {
          global.focus();
        } catch (error) {
          // Ignore.
        }

        global.dispatchEvent(
          new CustomEvent("tic:notification-action", {
            detail: {
              notification: clone(notification)
            }
          })
        );

        browserNotification.close();
      };

      markDelivered(notification.id, input);

      return {
        delivered: true,
        browserNotification: browserNotification
      };
    } catch (error) {
      return {
        delivered: false,
        reason: error.message
      };
    }
  }

  function markDelivered(id, options) {
    const updated = updateNotification(
      id,
      {
        delivered: true,
        deliveredAt: new Date().toISOString()
      },
      options || {}
    );

    if (updated) {
      dispatch(EVENTS.DELIVERED, {
        notification: updated
      });
    }

    return updated;
  }

  function savePreferences(preferences, options) {
    const input = isObject(options) ? options : {};
    const storeState = readState(input.store);
    const items = getStoredNotifications(storeState);

    const resolved = getPreferences(
      storeState,
      { preferences: preferences }
    );

    persist(items, resolved, input.store);

    dispatch(EVENTS.PREFERENCES_CHANGED, {
      preferences: resolved
    });

    scheduleRefresh(input);

    return clone(resolved);
  }

  function buildDashboard(options) {
    const input = isObject(options) ? options : {};
    const storeState = readState(input.store);
    const preferences = getPreferences(storeState, input);
    const items = generate(input);

    const active = items.filter(function activeOnly(item) {
      return item.status === STATUS.ACTIVE;
    });

    const unread = active.filter(function unreadOnly(item) {
      return !item.read;
    });

    const archived = items.filter(function archivedOnly(item) {
      return item.status === STATUS.ARCHIVED;
    });

    const snoozed = items.filter(function snoozedOnly(item) {
      return item.status === STATUS.SNOOZED;
    });

    const counts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0
    };

    active.forEach(function count(item) {
      if (
        Object.prototype.hasOwnProperty.call(
          counts,
          item.priority
        )
      ) {
        counts[item.priority] += 1;
      }
    });

    const byTypeMap = {};

    active.forEach(function group(item) {
      byTypeMap[item.type] = byTypeMap[item.type] || {
        type: item.type,
        total: 0,
        unread: 0
      };

      byTypeMap[item.type].total += 1;

      if (!item.read) {
        byTypeMap[item.type].unread += 1;
      }
    });

    const dashboard = {
      generatedAt: new Date().toISOString(),
      version: VERSION,
      engine: ENGINE_NAME,
      preferences: preferences,
      notifications: items,
      active: active,
      unread: unread,
      archived: archived,
      snoozed: snoozed,
      topNotification: unread[0] || active[0] || null,
      summary: {
        total: items.length,
        active: active.length,
        unread: unread.length,
        archived: archived.length,
        snoozed: snoozed.length,
        critical: counts.critical,
        high: counts.high,
        medium: counts.medium,
        low: counts.low,
        info: counts.info,
        badgeCount: unread.length,
        hasUrgent:
          counts.critical > 0 ||
          counts.high > 0
      },
      byType: Object.values(byTypeMap),
      charts: {
        priority: {
          labels: [
            PRIORITY.CRITICAL,
            PRIORITY.HIGH,
            PRIORITY.MEDIUM,
            PRIORITY.LOW,
            PRIORITY.INFO
          ],
          values: [
            counts.critical,
            counts.high,
            counts.medium,
            counts.low,
            counts.info
          ]
        },
        type: {
          labels: Object.values(byTypeMap)
            .map(function label(item) {
              return item.type;
            }),
          total: Object.values(byTypeMap)
            .map(function total(item) {
              return item.total;
            }),
          unread: Object.values(byTypeMap)
            .map(function unreadCount(item) {
              return item.unread;
            })
        }
      }
    };

    return dashboard;
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

      const dashboard = buildDashboard(nextOptions);

      state.lastOptions = clone(nextOptions);
      state.lastDashboard = clone(dashboard);

      persist(
        dashboard.notifications,
        dashboard.preferences,
        nextOptions.store
      );

      dispatch(EVENTS.REFRESHED, dashboard);
      dispatch(EVENTS.CHANGED, dashboard);

      notify(dashboard);

      return clone(dashboard);
    } catch (error) {
      reportError(
        "NOTIFICATION_REFRESH_FAILED",
        "تعذر تحديث إشعارات الميزانية.",
        "Unable to refresh budget notifications.",
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
      80
    );
  }

  function subscribe(listener, options) {
    if (typeof listener !== "function") {
      throw new TypeError(
        "Budget Notification subscriber must be a function."
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
      "tic:expense-alerts-refreshed",
      "tic:expense-alerts-changed",
      "tic:expense-alert-created",
      "tic:expense-alert-updated",
      "tic:payment-tracker-refreshed",
      "tic:payments-changed",
      "tic:payment-created",
      "tic:payment-updated",
      "tic:payment-paid",
      "tic:payment-refunded",
      "tic:budget-ai-refreshed",
      "tic:budget-ai-recommendations-changed",
      "tic:budget-analytics-refreshed",
      "tic:budget-analytics-changed",
      "tic:savings-changed",
      "tic:expenses-changed"
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
      TYPE: TYPE,
      PRIORITY: PRIORITY,
      STATUS: STATUS,
      DEFAULT_PREFERENCES: DEFAULT_PREFERENCES
    }),

    initialize: initialize,
    init: initialize,
    refresh: refresh,
    generate: generate,
    getNotifications: generate,
    buildDashboard: buildDashboard,
    getDashboard: function getDashboard(options) {
      return buildDashboard(options || {});
    },
    getSummary: function getSummary(options) {
      return buildDashboard(options || {}).summary;
    },
    getUnread: function getUnread(options) {
      return buildDashboard(options || {}).unread;
    },
    getBadgeCount: function getBadgeCount(options) {
      return buildDashboard(options || {}).summary.badgeCount;
    },
    getTopNotification: function getTopNotification(options) {
      return buildDashboard(options || {}).topNotification;
    },

    createNotification: createNotification,
    updateNotification: updateNotification,
    markRead: markRead,
    markUnread: markUnread,
    markAllRead: markAllRead,
    archiveNotification: archiveNotification,
    archiveAllRead: archiveAllRead,
    deleteNotification: deleteNotification,
    snoozeNotification: snoozeNotification,
    restoreNotification: restoreNotification,
    markDelivered: markDelivered,
    deliverBrowserNotification: deliverBrowserNotification,

    getPreferences: function getPreferencesPublic(options) {
      const input = isObject(options) ? options : {};

      return getPreferences(
        readState(input.store),
        input
      );
    },
    savePreferences: savePreferences,
    isQuietHours: isQuietHours,

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
      clamp: clamp,
      round: round,
      createId: createId,
      safeDate: safeDate,
      addDays: addDays,
      normalizePriority: normalizePriority,
      priorityWeight: priorityWeight,
      makeNotification: makeNotification
    })
  });

  global.TIC = global.TIC || {};
  global.TIC.Features = global.TIC.Features || {};
  global.TIC.Features.budgetNotificationEngine = API;
  global.TICBudgetNotificationEngine = API;

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
