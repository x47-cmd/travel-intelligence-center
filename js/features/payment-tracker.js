/* =========================================================
   Travel Intelligence Center
   Budget Intelligence Platform
   Payment Tracker Engine V1.0.0

   File Path:
   js/features/payment-tracker.js

   Purpose:
   - Production-ready payment tracking layer for travel finance.
   - Tracks planned, pending, partially paid, paid, refunded,
     overdue and cancelled travel payments.
   - Connects payments with trips, expenses, budgets and savings.
   - Supports installments, due dates, reminders and reconciliation.
   - Produces payment dashboards, forecasts and alert-ready data.
   - Reads and writes through the central Store when supported.
   - Refreshes automatically when finance data changes.

   Dependencies:
   - window.TICBudgetEngine
   - window.TICExpenseEngine
   - window.TICSavingsEngine
   - window.TICBudgetAnalytics
   - window.TICBudgetAI
   - window.TICStore / window.Store

   Global:
   - window.TICPaymentTracker
   ========================================================= */

(function paymentTrackerFactory(global) {
  "use strict";

  const VERSION = "1.0.0";
  const ENGINE_NAME = "TICPaymentTracker";

  const EVENTS = Object.freeze({
    READY: "tic:payment-tracker-ready",
    REFRESHED: "tic:payment-tracker-refreshed",
    CHANGED: "tic:payments-changed",
    CREATED: "tic:payment-created",
    UPDATED: "tic:payment-updated",
    DELETED: "tic:payment-deleted",
    STATUS_CHANGED: "tic:payment-status-changed",
    PAID: "tic:payment-paid",
    PARTIALLY_PAID: "tic:payment-partially-paid",
    REFUNDED: "tic:payment-refunded",
    REMINDER_CREATED: "tic:payment-reminder-created",
    RECONCILED: "tic:payment-reconciled",
    ERROR: "tic:payment-tracker-error"
  });

  const STATUS = Object.freeze({
    PLANNED: "planned",
    PENDING: "pending",
    PARTIAL: "partial",
    PAID: "paid",
    OVERDUE: "overdue",
    REFUNDED: "refunded",
    CANCELLED: "cancelled"
  });

  const TYPE = Object.freeze({
    FLIGHT: "flight",
    HOTEL: "hotel",
    TRANSPORT: "transport",
    ACTIVITY: "activity",
    INSURANCE: "insurance",
    VISA: "visa",
    FOOD: "food",
    SHOPPING: "shopping",
    INSTALLMENT: "installment",
    OTHER: "other"
  });

  const PRIORITY = Object.freeze({
    CRITICAL: "critical",
    HIGH: "high",
    MEDIUM: "medium",
    LOW: "low"
  });

  const PAYMENT_METHOD = Object.freeze({
    CARD: "card",
    CASH: "cash",
    BANK_TRANSFER: "bank-transfer",
    WALLET: "wallet",
    APPLE_PAY: "apple-pay",
    TABBY: "tabby",
    TAMARA: "tamara",
    OTHER: "other"
  });

  const DEFAULT_CURRENCY = "AED";
  const DEFAULT_REMINDER_DAYS = Object.freeze([14, 7, 3, 1, 0]);

  const TYPE_LABELS = Object.freeze({
    flight: { ar: "الطيران", en: "Flight" },
    hotel: { ar: "الفندق", en: "Hotel" },
    transport: { ar: "المواصلات", en: "Transport" },
    activity: { ar: "النشاط", en: "Activity" },
    insurance: { ar: "التأمين", en: "Insurance" },
    visa: { ar: "التأشيرة", en: "Visa" },
    food: { ar: "الطعام", en: "Food" },
    shopping: { ar: "التسوق", en: "Shopping" },
    installment: { ar: "القسط", en: "Installment" },
    other: { ar: "دفعة أخرى", en: "Other payment" }
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

  function createId(prefix) {
    return String(prefix || "payment") + "_" +
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

  function daysBetween(from, to) {
    const start = startOfDay(from);
    const end = startOfDay(to);

    return Math.round(
      (end.getTime() - start.getTime()) / 86400000
    );
  }

  function normalizeCurrency(value) {
    return String(value || DEFAULT_CURRENCY)
      .trim()
      .toUpperCase() || DEFAULT_CURRENCY;
  }

  function normalizeStatus(value, fallback) {
    const raw = String(value || fallback || STATUS.PLANNED)
      .trim()
      .toLowerCase();

    const aliases = {
      draft: STATUS.PLANNED,
      scheduled: STATUS.PLANNED,
      waiting: STATUS.PENDING,
      unpaid: STATUS.PENDING,
      partially_paid: STATUS.PARTIAL,
      "partially-paid": STATUS.PARTIAL,
      complete: STATUS.PAID,
      completed: STATUS.PAID,
      settled: STATUS.PAID,
      returned: STATUS.REFUNDED,
      canceled: STATUS.CANCELLED
    };

    const normalized = aliases[raw] || raw;

    return Object.values(STATUS).includes(normalized)
      ? normalized
      : (fallback || STATUS.PLANNED);
  }

  function normalizeType(value) {
    const raw = String(value || TYPE.OTHER)
      .trim()
      .toLowerCase();

    const aliases = {
      flights: TYPE.FLIGHT,
      hotel: TYPE.HOTEL,
      hotels: TYPE.HOTEL,
      car: TYPE.TRANSPORT,
      taxi: TYPE.TRANSPORT,
      activities: TYPE.ACTIVITY,
      tickets: TYPE.ACTIVITY,
      visas: TYPE.VISA,
      installment_payment: TYPE.INSTALLMENT
    };

    const normalized = aliases[raw] || raw;

    return Object.values(TYPE).includes(normalized)
      ? normalized
      : TYPE.OTHER;
  }

  function normalizeMethod(value) {
    const raw = String(value || PAYMENT_METHOD.OTHER)
      .trim()
      .toLowerCase();

    const aliases = {
      visa: PAYMENT_METHOD.CARD,
      mastercard: PAYMENT_METHOD.CARD,
      debit: PAYMENT_METHOD.CARD,
      credit: PAYMENT_METHOD.CARD,
      transfer: PAYMENT_METHOD.BANK_TRANSFER,
      bank: PAYMENT_METHOD.BANK_TRANSFER,
      applepay: PAYMENT_METHOD.APPLE_PAY
    };

    const normalized = aliases[raw] || raw;

    return Object.values(PAYMENT_METHOD).includes(normalized)
      ? normalized
      : PAYMENT_METHOD.OTHER;
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
        "تعذر قراءة بيانات الدفعات من المخزن.",
        "Unable to read payment data from the Store.",
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

        if (typeof source.save === "function") {
          source.save();
        }

        return true;
      }

      if (isObject(source.data)) {
        source.data = nextState;

        if (typeof source.save === "function") {
          source.save();
        }

        return true;
      }
    } catch (error) {
      reportError(
        "STORE_WRITE_FAILED",
        "تعذر حفظ بيانات الدفعات.",
        "Unable to save payment data.",
        { cause: error.message }
      );
    }

    return false;
  }

  function getPaymentsFromState(storeState) {
    const candidates = [
      storeState && storeState.payments,
      storeState &&
        storeState.budget &&
        storeState.budget.payments,
      storeState &&
        storeState.finance &&
        storeState.finance.payments,
      storeState &&
        storeState.travelFinance &&
        storeState.travelFinance.payments
    ];

    for (let index = 0; index < candidates.length; index += 1) {
      if (Array.isArray(candidates[index])) {
        return candidates[index];
      }
    }

    return [];
  }

  function persistPayments(payments, store) {
    const storeState = clone(readState(store));

    storeState.payments = clone(payments);

    if (isObject(storeState.budget)) {
      storeState.budget.payments = clone(payments);
    }

    if (isObject(storeState.finance)) {
      storeState.finance.payments = clone(payments);
    }

    if (isObject(storeState.travelFinance)) {
      storeState.travelFinance.payments = clone(payments);
    }

    return writeState(storeState, store);
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

  function getExpensesFromState(storeState) {
    return asArray(firstDefined(
      storeState && storeState.expenses,
      storeState &&
        storeState.budget &&
        storeState.budget.expenses,
      storeState &&
        storeState.finance &&
        storeState.finance.expenses,
      []
    ));
  }

  function resolveCurrency(storeState, input) {
    const profile = isObject(storeState && storeState.profile)
      ? storeState.profile
      : {};

    const settings = isObject(storeState && storeState.settings)
      ? storeState.settings
      : {};

    return normalizeCurrency(firstDefined(
      input && input.currency,
      storeState &&
        storeState.budget &&
        storeState.budget.currency,
      settings.currency,
      profile.currency,
      DEFAULT_CURRENCY
    ));
  }

  function normalizeInstallment(installment, index, paymentCurrency) {
    const amount = toNonNegative(firstDefined(
      installment && installment.amount,
      installment && installment.value,
      0
    ));

    const paidAmount = toNonNegative(firstDefined(
      installment && installment.paidAmount,
      installment && installment.amountPaid,
      0
    ));

    const dueDate = safeDate(firstDefined(
      installment && installment.dueDate,
      installment && installment.date,
      null
    ));

    let status = normalizeStatus(
      installment && installment.status,
      paidAmount >= amount && amount > 0
        ? STATUS.PAID
        : paidAmount > 0
          ? STATUS.PARTIAL
          : STATUS.PENDING
    );

    if (
      status !== STATUS.PAID &&
      status !== STATUS.CANCELLED &&
      dueDate &&
      dueDate < startOfDay(new Date())
    ) {
      status = STATUS.OVERDUE;
    }

    return {
      id: String(firstDefined(
        installment && installment.id,
        "installment_" + index
      )),
      sequence: toNumber(firstDefined(
        installment && installment.sequence,
        index + 1
      ), index + 1),
      title: String(firstDefined(
        installment && installment.title,
        "Installment " + (index + 1)
      )),
      amount: round(amount, 2),
      paidAmount: round(Math.min(amount, paidAmount), 2),
      remainingAmount: round(
        Math.max(0, amount - paidAmount),
        2
      ),
      currency: normalizeCurrency(firstDefined(
        installment && installment.currency,
        paymentCurrency
      )),
      dueDate: dueDate ? dueDate.toISOString() : null,
      paidAt: safeDate(
        installment && installment.paidAt
      )
        ? safeDate(
            installment && installment.paidAt
          ).toISOString()
        : null,
      status: status,
      paymentMethod: normalizeMethod(
        installment && installment.paymentMethod
      ),
      reference: firstDefined(
        installment && installment.reference,
        installment && installment.transactionReference,
        null
      ),
      notes: String(firstDefined(
        installment && installment.notes,
        ""
      )),
      createdAt: firstDefined(
        installment && installment.createdAt,
        new Date().toISOString()
      ),
      updatedAt: firstDefined(
        installment && installment.updatedAt,
        new Date().toISOString()
      )
    };
  }

  function calculateInstallmentTotals(installments) {
    const items = asArray(installments);

    const total = round(
      items.reduce(function sum(value, item) {
        return value + toNonNegative(item.amount);
      }, 0),
      2
    );

    const paid = round(
      items.reduce(function sum(value, item) {
        return value + toNonNegative(item.paidAmount);
      }, 0),
      2
    );

    return {
      total: total,
      paid: paid,
      remaining: round(Math.max(0, total - paid), 2),
      count: items.length,
      paidCount: items.filter(function paidItem(item) {
        return item.status === STATUS.PAID;
      }).length,
      overdueCount: items.filter(function overdue(item) {
        return item.status === STATUS.OVERDUE;
      }).length
    };
  }

  function calculatePaymentStatus(payment, now) {
    const dateNow = startOfDay(now || new Date());
    const total = toNonNegative(payment.amount);
    const paidAmount = toNonNegative(payment.paidAmount);
    const refundedAmount = toNonNegative(payment.refundedAmount);
    const dueDate = safeDate(payment.dueDate);
    const requested = normalizeStatus(
      payment.status,
      STATUS.PLANNED
    );

    if (requested === STATUS.CANCELLED) {
      return STATUS.CANCELLED;
    }

    if (
      refundedAmount >= paidAmount &&
      paidAmount > 0
    ) {
      return STATUS.REFUNDED;
    }

    if (paidAmount >= total && total > 0) {
      return STATUS.PAID;
    }

    if (paidAmount > 0 && paidAmount < total) {
      if (dueDate && dueDate < dateNow) {
        return STATUS.OVERDUE;
      }

      return STATUS.PARTIAL;
    }

    if (dueDate && dueDate < dateNow) {
      return STATUS.OVERDUE;
    }

    if (requested === STATUS.PENDING) {
      return STATUS.PENDING;
    }

    return STATUS.PLANNED;
  }

  function normalizePayment(payment, index, storeState, options) {
    const input = isObject(payment) ? payment : {};
    const currency = resolveCurrency(storeState, options);
    const amount = toNonNegative(firstDefined(
      input.amount,
      input.total,
      input.value,
      0
    ));

    const paidAmount = toNonNegative(firstDefined(
      input.paidAmount,
      input.amountPaid,
      input.settledAmount,
      0
    ));

    const refundedAmount = toNonNegative(firstDefined(
      input.refundedAmount,
      input.refundAmount,
      0
    ));

    const installments = asArray(
      input.installments
    ).map(function normalize(item, installmentIndex) {
      return normalizeInstallment(
        item,
        installmentIndex,
        firstDefined(input.currency, currency)
      );
    });

    const installmentTotals =
      calculateInstallmentTotals(installments);

    const resolvedPaidAmount = installments.length
      ? installmentTotals.paid
      : paidAmount;

    const dueDate = safeDate(firstDefined(
      input.dueDate,
      input.paymentDueDate,
      input.date,
      null
    ));

    const normalized = {
      id: String(firstDefined(
        input.id,
        input._id,
        input.uuid,
        "payment_" + index
      )),
      tripId: firstDefined(
        input.tripId,
        input.travelId,
        null
      ),
      expenseId: firstDefined(
        input.expenseId,
        input.linkedExpenseId,
        null
      ),
      budgetId: firstDefined(
        input.budgetId,
        input.linkedBudgetId,
        null
      ),
      savingsTargetId: firstDefined(
        input.savingsTargetId,
        input.targetId,
        null
      ),
      title: String(firstDefined(
        input.title,
        input.name,
        input.description,
        "Payment"
      )),
      provider: String(firstDefined(
        input.provider,
        input.vendor,
        input.merchant,
        ""
      )),
      type: normalizeType(firstDefined(
        input.type,
        input.category,
        TYPE.OTHER
      )),
      amount: round(
        installments.length
          ? installmentTotals.total
          : amount,
        2
      ),
      paidAmount: round(
        Math.min(
          installments.length
            ? installmentTotals.total
            : amount,
          resolvedPaidAmount
        ),
        2
      ),
      refundedAmount: round(refundedAmount, 2),
      currency: normalizeCurrency(firstDefined(
        input.currency,
        currency
      )),
      dueDate: dueDate ? dueDate.toISOString() : null,
      paidAt: safeDate(input.paidAt)
        ? safeDate(input.paidAt).toISOString()
        : null,
      paymentMethod: normalizeMethod(
        input.paymentMethod
      ),
      reference: firstDefined(
        input.reference,
        input.transactionReference,
        input.bookingReference,
        null
      ),
      notes: String(firstDefined(
        input.notes,
        ""
      )),
      installments: installments,
      reminderDays: asArray(firstDefined(
        input.reminderDays,
        DEFAULT_REMINDER_DAYS
      ))
        .map(function number(value) {
          return Math.round(toNumber(value, 0));
        })
        .filter(function unique(value, itemIndex, array) {
          return array.indexOf(value) === itemIndex;
        })
        .sort(function descending(a, b) {
          return b - a;
        }),
      reminderHistory: asArray(
        input.reminderHistory
      ),
      tags: asArray(input.tags).map(String),
      metadata: isObject(input.metadata)
        ? clone(input.metadata)
        : {},
      createdAt: firstDefined(
        input.createdAt,
        new Date().toISOString()
      ),
      updatedAt: firstDefined(
        input.updatedAt,
        new Date().toISOString()
      ),
      deletedAt: input.deletedAt || null,
      isDeleted: input.isDeleted === true
    };

    normalized.remainingAmount = round(
      Math.max(
        0,
        normalized.amount - normalized.paidAmount
      ),
      2
    );

    normalized.netPaidAmount = round(
      Math.max(
        0,
        normalized.paidAmount -
        normalized.refundedAmount
      ),
      2
    );

    normalized.status = calculatePaymentStatus(
      Object.assign({}, normalized, {
        status: input.status
      }),
      options && options.now
    );

    normalized.progressPercent = percentage(
      normalized.paidAmount,
      normalized.amount,
      1
    );

    normalized.daysUntilDue = normalized.dueDate
      ? daysBetween(
          new Date(),
          normalized.dueDate
        )
      : null;

    normalized.isDueSoon =
      normalized.daysUntilDue !== null &&
      normalized.daysUntilDue >= 0 &&
      normalized.daysUntilDue <= 7 &&
      ![
        STATUS.PAID,
        STATUS.REFUNDED,
        STATUS.CANCELLED
      ].includes(normalized.status);

    normalized.isOverdue =
      normalized.status === STATUS.OVERDUE;

    return normalized;
  }

  function listPayments(options) {
    const input = isObject(options) ? options : {};
    const storeState = readState(input.store);
    const source = getPaymentsFromState(storeState);

    let items = source
      .map(function normalize(item, index) {
        return normalizePayment(
          item,
          index,
          storeState,
          input
        );
      })
      .filter(function active(item) {
        return input.includeDeleted === true ||
          (!item.isDeleted && !item.deletedAt);
      });

    if (input.tripId != null) {
      items = items.filter(function byTrip(item) {
        return String(item.tripId || "") ===
          String(input.tripId);
      });
    }

    if (input.status) {
      const statuses = asArray(input.status)
        .concat(
          Array.isArray(input.status)
            ? []
            : [input.status]
        )
        .map(function normalize(value) {
          return normalizeStatus(value);
        });

      items = items.filter(function byStatus(item) {
        return statuses.includes(item.status);
      });
    }

    if (input.type) {
      const types = asArray(input.type)
        .concat(
          Array.isArray(input.type)
            ? []
            : [input.type]
        )
        .map(normalizeType);

      items = items.filter(function byType(item) {
        return types.includes(item.type);
      });
    }

    if (input.fromDate) {
      const from = startOfDay(input.fromDate);

      items = items.filter(function fromDate(item) {
        const due = safeDate(item.dueDate);
        return due && due >= from;
      });
    }

    if (input.toDate) {
      const to = endOfDay(input.toDate);

      items = items.filter(function toDate(item) {
        const due = safeDate(item.dueDate);
        return due && due <= to;
      });
    }

    if (input.query) {
      const query = String(input.query).trim().toLowerCase();

      items = items.filter(function search(item) {
        return [
          item.title,
          item.provider,
          item.reference,
          item.notes,
          item.type
        ].some(function field(value) {
          return String(value || "")
            .toLowerCase()
            .includes(query);
        });
      });
    }

    items.sort(function sortPayments(a, b) {
      const priorityA = a.isOverdue
        ? 3
        : a.isDueSoon
          ? 2
          : 1;

      const priorityB = b.isOverdue
        ? 3
        : b.isDueSoon
          ? 2
          : 1;

      if (priorityB !== priorityA) {
        return priorityB - priorityA;
      }

      const dateA = safeDate(a.dueDate);
      const dateB = safeDate(b.dueDate);

      if (dateA && dateB) {
        return dateA - dateB;
      }

      if (dateA) return -1;
      if (dateB) return 1;

      return String(b.createdAt)
        .localeCompare(String(a.createdAt));
    });

    return items;
  }

  function validatePaymentInput(input, partial) {
    const errors = [];
    const data = isObject(input) ? input : {};

    if (!partial || Object.prototype.hasOwnProperty.call(data, "title")) {
      if (!String(data.title || data.name || "").trim()) {
        errors.push({
          field: "title",
          messageAr: "عنوان الدفعة مطلوب.",
          messageEn: "Payment title is required."
        });
      }
    }

    if (!partial || Object.prototype.hasOwnProperty.call(data, "amount")) {
      if (toNumber(data.amount, NaN) < 0) {
        errors.push({
          field: "amount",
          messageAr: "قيمة الدفعة غير صحيحة.",
          messageEn: "Payment amount is invalid."
        });
      }
    }

    if (
      data.dueDate &&
      !safeDate(data.dueDate)
    ) {
      errors.push({
        field: "dueDate",
        messageAr: "تاريخ الاستحقاق غير صحيح.",
        messageEn: "Due date is invalid."
      });
    }

    if (
      data.paidAt &&
      !safeDate(data.paidAt)
    ) {
      errors.push({
        field: "paidAt",
        messageAr: "تاريخ الدفع غير صحيح.",
        messageEn: "Paid date is invalid."
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  function createPayment(input, options) {
    const opts = isObject(options) ? options : {};
    const validation = validatePaymentInput(input, false);

    if (!validation.valid) {
      const error = new Error(
        validation.errors[0].messageEn
      );

      error.code = "PAYMENT_VALIDATION_FAILED";
      error.validation = validation;
      throw error;
    }

    const storeState = readState(opts.store);
    const payments = getPaymentsFromState(storeState);
    const now = new Date().toISOString();

    const draft = Object.assign({}, input, {
      id: String(
        input.id || createId("payment")
      ),
      createdAt: now,
      updatedAt: now,
      status: normalizeStatus(
        input.status,
        STATUS.PLANNED
      )
    });

    const normalized = normalizePayment(
      draft,
      payments.length,
      storeState,
      opts
    );

    const nextPayments = payments.concat([normalized]);
    const saved = persistPayments(
      nextPayments,
      opts.store
    );

    const result = {
      saved: saved,
      payment: normalized
    };

    dispatch(EVENTS.CREATED, result);
    dispatch(EVENTS.CHANGED, result);
    scheduleRefresh(opts);

    return clone(normalized);
  }

  function getPaymentById(id, options) {
    return listPayments(options || {}).find(
      function match(item) {
        return String(item.id) === String(id);
      }
    ) || null;
  }

  function updatePayment(id, patch, options) {
    const opts = isObject(options) ? options : {};
    const validation = validatePaymentInput(
      patch,
      true
    );

    if (!validation.valid) {
      const error = new Error(
        validation.errors[0].messageEn
      );

      error.code = "PAYMENT_VALIDATION_FAILED";
      error.validation = validation;
      throw error;
    }

    const storeState = readState(opts.store);
    const payments = getPaymentsFromState(storeState);
    let updated = null;

    const nextPayments = payments.map(function update(item, index) {
      const itemId = String(firstDefined(
        item && item.id,
        "payment_" + index
      ));

      if (itemId !== String(id)) return item;

      const merged = Object.assign({}, item, patch, {
        id: itemId,
        updatedAt: new Date().toISOString()
      });

      updated = normalizePayment(
        merged,
        index,
        storeState,
        opts
      );

      return updated;
    });

    if (!updated) {
      return null;
    }

    persistPayments(nextPayments, opts.store);

    const result = { payment: updated };
    dispatch(EVENTS.UPDATED, result);
    dispatch(EVENTS.CHANGED, result);
    scheduleRefresh(opts);

    return clone(updated);
  }

  function deletePayment(id, options) {
    const opts = isObject(options) ? options : {};
    const hardDelete = opts.hardDelete === true;
    const storeState = readState(opts.store);
    const payments = getPaymentsFromState(storeState);
    let deleted = null;

    const nextPayments = hardDelete
      ? payments.filter(function remove(item, index) {
          const itemId = String(firstDefined(
            item && item.id,
            "payment_" + index
          ));

          if (itemId === String(id)) {
            deleted = item;
            return false;
          }

          return true;
        })
      : payments.map(function softDelete(item, index) {
          const itemId = String(firstDefined(
            item && item.id,
            "payment_" + index
          ));

          if (itemId !== String(id)) return item;

          deleted = Object.assign({}, item, {
            isDeleted: true,
            deletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });

          return deleted;
        });

    if (!deleted) return false;

    persistPayments(nextPayments, opts.store);

    dispatch(EVENTS.DELETED, {
      id: String(id),
      hardDelete: hardDelete
    });

    dispatch(EVENTS.CHANGED, {
      id: String(id)
    });

    scheduleRefresh(opts);
    return true;
  }

  function setStatus(id, status, options) {
    const normalizedStatus = normalizeStatus(status);
    const payment = updatePayment(
      id,
      { status: normalizedStatus },
      options || {}
    );

    if (payment) {
      dispatch(EVENTS.STATUS_CHANGED, {
        id: String(id),
        status: normalizedStatus,
        payment: payment
      });
    }

    return payment;
  }

  function recordPayment(id, input, options) {
    const data = isObject(input) ? input : {};
    const opts = isObject(options) ? options : {};
    const current = getPaymentById(id, opts);

    if (!current) return null;

    const amount = toNonNegative(firstDefined(
      data.amount,
      current.remainingAmount
    ));

    const newPaidAmount = round(
      Math.min(
        current.amount,
        current.paidAmount + amount
      ),
      2
    );

    const patch = {
      paidAmount: newPaidAmount,
      paidAt: firstDefined(
        data.paidAt,
        new Date().toISOString()
      ),
      paymentMethod: firstDefined(
        data.paymentMethod,
        current.paymentMethod
      ),
      reference: firstDefined(
        data.reference,
        current.reference
      ),
      notes: String(firstDefined(
        data.notes,
        current.notes,
        ""
      )),
      status:
        newPaidAmount >= current.amount
          ? STATUS.PAID
          : STATUS.PARTIAL
    };

    const updated = updatePayment(
      id,
      patch,
      opts
    );

    if (!updated) return null;

    if (updated.status === STATUS.PAID) {
      dispatch(EVENTS.PAID, {
        payment: updated,
        amount: amount
      });
    } else {
      dispatch(EVENTS.PARTIALLY_PAID, {
        payment: updated,
        amount: amount
      });
    }

    if (data.createExpense === true) {
      reconcileToExpense(
        updated.id,
        Object.assign({}, data, {
          amount: amount
        }),
        opts
      );
    }

    return updated;
  }

  function recordRefund(id, input, options) {
    const data = isObject(input) ? input : {};
    const opts = isObject(options) ? options : {};
    const current = getPaymentById(id, opts);

    if (!current) return null;

    const amount = toNonNegative(firstDefined(
      data.amount,
      current.netPaidAmount
    ));

    const refundedAmount = round(
      Math.min(
        current.paidAmount,
        current.refundedAmount + amount
      ),
      2
    );

    const updated = updatePayment(
      id,
      {
        refundedAmount: refundedAmount,
        refundReference: firstDefined(
          data.reference,
          current.refundReference,
          null
        ),
        refundNotes: String(firstDefined(
          data.notes,
          current.refundNotes,
          ""
        )),
        refundedAt: firstDefined(
          data.refundedAt,
          new Date().toISOString()
        ),
        status:
          refundedAmount >= current.paidAmount
            ? STATUS.REFUNDED
            : current.status
      },
      opts
    );

    if (updated) {
      dispatch(EVENTS.REFUNDED, {
        payment: updated,
        amount: amount
      });
    }

    return updated;
  }

  function buildInstallmentSchedule(input) {
    const data = isObject(input) ? input : {};
    const totalAmount = toNonNegative(data.totalAmount);
    const count = Math.max(
      1,
      Math.round(toNumber(data.count, 1))
    );

    const firstDueDate = safeDate(
      data.firstDueDate
    ) || addDays(new Date(), 30);

    const intervalDays = Math.max(
      1,
      Math.round(toNumber(
        data.intervalDays,
        30
      ))
    );

    const baseAmount = round(
      totalAmount / count,
      2
    );

    let allocated = 0;

    return Array.from(
      { length: count },
      function create(_, index) {
        const isLast = index === count - 1;
        const amount = isLast
          ? round(totalAmount - allocated, 2)
          : baseAmount;

        allocated += amount;

        const dueDate = addDays(
          firstDueDate,
          intervalDays * index
        );

        return {
          id: createId("installment"),
          sequence: index + 1,
          title: String(
            data.titlePrefix || "Installment"
          ) + " " + (index + 1),
          amount: amount,
          paidAmount: 0,
          remainingAmount: amount,
          currency: normalizeCurrency(
            data.currency
          ),
          dueDate: dueDate.toISOString(),
          paidAt: null,
          status: STATUS.PENDING,
          paymentMethod: normalizeMethod(
            data.paymentMethod
          ),
          reference: null,
          notes: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }
    );
  }

  function recordInstallmentPayment(
    paymentId,
    installmentId,
    input,
    options
  ) {
    const opts = isObject(options) ? options : {};
    const data = isObject(input) ? input : {};
    const current = getPaymentById(
      paymentId,
      opts
    );

    if (!current) return null;

    let matched = false;

    const installments = current.installments.map(
      function updateInstallment(item) {
        if (
          String(item.id) !== String(installmentId)
        ) {
          return item;
        }

        matched = true;

        const amount = toNonNegative(firstDefined(
          data.amount,
          item.remainingAmount
        ));

        const paidAmount = round(
          Math.min(
            item.amount,
            item.paidAmount + amount
          ),
          2
        );

        return Object.assign({}, item, {
          paidAmount: paidAmount,
          remainingAmount: round(
            Math.max(0, item.amount - paidAmount),
            2
          ),
          status:
            paidAmount >= item.amount
              ? STATUS.PAID
              : STATUS.PARTIAL,
          paidAt: firstDefined(
            data.paidAt,
            new Date().toISOString()
          ),
          paymentMethod: normalizeMethod(
            firstDefined(
              data.paymentMethod,
              item.paymentMethod
            )
          ),
          reference: firstDefined(
            data.reference,
            item.reference
          ),
          notes: String(firstDefined(
            data.notes,
            item.notes,
            ""
          )),
          updatedAt: new Date().toISOString()
        });
      }
    );

    if (!matched) return null;

    return updatePayment(
      paymentId,
      { installments: installments },
      opts
    );
  }

  function createReminder(paymentId, input, options) {
    const opts = isObject(options) ? options : {};
    const data = isObject(input) ? input : {};
    const payment = getPaymentById(
      paymentId,
      opts
    );

    if (!payment) return null;

    const reminder = {
      id: createId("payment_reminder"),
      paymentId: payment.id,
      title: String(firstDefined(
        data.title,
        "Payment reminder"
      )),
      messageAr: String(firstDefined(
        data.messageAr,
        "تذكير بدفعة " + payment.title
      )),
      messageEn: String(firstDefined(
        data.messageEn,
        "Reminder for " + payment.title
      )),
      scheduledFor: (
        safeDate(data.scheduledFor) ||
        addDays(
          payment.dueDate || new Date(),
          -Math.abs(
            Math.round(toNumber(
              data.daysBefore,
              3
            ))
          )
        )
      ).toISOString(),
      status: "scheduled",
      createdAt: new Date().toISOString(),
      sentAt: null
    };

    const history = asArray(
      payment.reminderHistory
    ).concat([reminder]);

    updatePayment(
      paymentId,
      { reminderHistory: history },
      opts
    );

    dispatch(EVENTS.REMINDER_CREATED, {
      paymentId: payment.id,
      reminder: reminder
    });

    return reminder;
  }

  function generateAutomaticReminders(options) {
    const opts = isObject(options) ? options : {};
    const now = startOfDay(
      opts.now || new Date()
    );

    const items = listPayments(opts);
    const reminders = [];

    items.forEach(function generate(payment) {
      if (
        [
          STATUS.PAID,
          STATUS.REFUNDED,
          STATUS.CANCELLED
        ].includes(payment.status)
      ) {
        return;
      }

      const due = safeDate(payment.dueDate);
      if (!due) return;

      const days = daysBetween(now, due);

      if (!payment.reminderDays.includes(days)) {
        return;
      }

      const exists = asArray(
        payment.reminderHistory
      ).some(function duplicate(reminder) {
        return (
          String(reminder.type || "") === "automatic" &&
          dateKey(reminder.scheduledFor) === dateKey(now) &&
          toNumber(reminder.daysBefore, NaN) === days
        );
      });

      if (exists) return;

      reminders.push({
        id: createId("payment_reminder"),
        paymentId: payment.id,
        type: "automatic",
        daysBefore: days,
        scheduledFor: now.toISOString(),
        titleAr:
          days < 0
            ? "دفعة متأخرة"
            : days === 0
              ? "دفعة مستحقة اليوم"
              : "دفعة قريبة",
        titleEn:
          days < 0
            ? "Overdue payment"
            : days === 0
              ? "Payment due today"
              : "Upcoming payment",
        messageAr:
          payment.title + " بقيمة " +
          payment.remainingAmount + " " +
          payment.currency,
        messageEn:
          payment.title + " for " +
          payment.remainingAmount + " " +
          payment.currency,
        status: "ready",
        createdAt: new Date().toISOString()
      });
    });

    return reminders;
  }

  function reconcileToExpense(paymentId, input, options) {
    const opts = isObject(options) ? options : {};
    const data = isObject(input) ? input : {};
    const payment = getPaymentById(
      paymentId,
      opts
    );

    if (!payment) return null;

    const expenseEngine = global.TICExpenseEngine;
    let expense = null;

    const expensePayload = {
      id: firstDefined(
        data.expenseId,
        createId("expense")
      ),
      tripId: payment.tripId,
      title: firstDefined(
        data.title,
        payment.title
      ),
      category: payment.type,
      amount: toNonNegative(firstDefined(
        data.amount,
        payment.paidAmount,
        payment.amount
      )),
      currency: payment.currency,
      date: firstDefined(
        data.date,
        payment.paidAt,
        new Date().toISOString()
      ),
      paymentMethod: payment.paymentMethod,
      status: STATUS.PAID,
      source: "payment-tracker",
      paymentId: payment.id,
      reference: payment.reference
    };

    if (
      expenseEngine &&
      typeof expenseEngine.createExpense === "function"
    ) {
      try {
        expense = expenseEngine.createExpense(
          expensePayload,
          opts
        );
      } catch (error) {
        // Continue to Store fallback.
      }
    }

    if (!expense) {
      const storeState = clone(
        readState(opts.store)
      );

      const expenses = getExpensesFromState(
        storeState
      );

      expense = expensePayload;

      storeState.expenses = expenses.concat([
        expense
      ]);

      if (isObject(storeState.budget)) {
        storeState.budget.expenses =
          clone(storeState.expenses);
      }

      if (isObject(storeState.finance)) {
        storeState.finance.expenses =
          clone(storeState.expenses);
      }

      writeState(storeState, opts.store);
    }

    updatePayment(
      payment.id,
      { expenseId: expense.id },
      opts
    );

    dispatch(EVENTS.RECONCILED, {
      paymentId: payment.id,
      expense: expense
    });

    return expense;
  }

  function buildTripLookup(storeState) {
    const map = new Map();

    getTripsFromState(storeState).forEach(
      function mapTrip(trip, index) {
        const id = String(firstDefined(
          trip && trip.id,
          trip && trip._id,
          "trip_" + index
        ));

        map.set(id, {
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
          )
        });
      }
    );

    return map;
  }

  function buildAlerts(payments) {
    const alerts = [];

    payments.forEach(function build(payment) {
      if (payment.status === STATUS.OVERDUE) {
        alerts.push({
          id: "payment_overdue_" + payment.id,
          paymentId: payment.id,
          priority: PRIORITY.CRITICAL,
          type: "overdue",
          titleAr: "دفعة متأخرة",
          titleEn: "Overdue payment",
          messageAr:
            payment.title + " متأخرة بمقدار " +
            Math.abs(payment.daysUntilDue || 0) +
            " يوم، والمتبقي " +
            payment.remainingAmount + " " +
            payment.currency + ".",
          messageEn:
            payment.title + " is overdue by " +
            Math.abs(payment.daysUntilDue || 0) +
            " day(s), with " +
            payment.remainingAmount + " " +
            payment.currency + " remaining.",
          action: {
            name: "open-payment",
            payload: { paymentId: payment.id }
          }
        });
      } else if (payment.isDueSoon) {
        alerts.push({
          id: "payment_due_soon_" + payment.id,
          paymentId: payment.id,
          priority:
            payment.daysUntilDue <= 1
              ? PRIORITY.HIGH
              : PRIORITY.MEDIUM,
          type: "due-soon",
          titleAr:
            payment.daysUntilDue === 0
              ? "دفعة مستحقة اليوم"
              : "دفعة قريبة",
          titleEn:
            payment.daysUntilDue === 0
              ? "Payment due today"
              : "Upcoming payment",
          messageAr:
            payment.title + " تستحق خلال " +
            payment.daysUntilDue +
            " يوم، والمتبقي " +
            payment.remainingAmount + " " +
            payment.currency + ".",
          messageEn:
            payment.title + " is due in " +
            payment.daysUntilDue +
            " day(s), with " +
            payment.remainingAmount + " " +
            payment.currency + " remaining.",
          action: {
            name: "open-payment",
            payload: { paymentId: payment.id }
          }
        });
      }
    });

    return alerts.sort(function priority(a, b) {
      const weights = {
        critical: 4,
        high: 3,
        medium: 2,
        low: 1
      };

      return weights[b.priority] -
        weights[a.priority];
    });
  }

  function buildDashboard(options) {
    const opts = isObject(options) ? options : {};
    const storeState = readState(opts.store);
    const payments = listPayments(opts);
    const tripLookup = buildTripLookup(storeState);

    const enriched = payments.map(function enrich(payment) {
      const trip = payment.tripId == null
        ? null
        : tripLookup.get(String(payment.tripId));

      return Object.assign({}, payment, {
        trip: trip || null,
        typeLabelAr:
          (TYPE_LABELS[payment.type] || TYPE_LABELS.other).ar,
        typeLabelEn:
          (TYPE_LABELS[payment.type] || TYPE_LABELS.other).en
      });
    });

    const active = enriched.filter(function activeOnly(item) {
      return ![
        STATUS.CANCELLED,
        STATUS.REFUNDED
      ].includes(item.status);
    });

    const totalAmount = round(
      active.reduce(function sum(total, item) {
        return total + item.amount;
      }, 0),
      2
    );

    const paidAmount = round(
      active.reduce(function sum(total, item) {
        return total + item.paidAmount;
      }, 0),
      2
    );

    const remainingAmount = round(
      active.reduce(function sum(total, item) {
        return total + item.remainingAmount;
      }, 0),
      2
    );

    const overdueAmount = round(
      active
        .filter(function overdue(item) {
          return item.status === STATUS.OVERDUE;
        })
        .reduce(function sum(total, item) {
          return total + item.remainingAmount;
        }, 0),
      2
    );

    const dueSoonAmount = round(
      active
        .filter(function dueSoon(item) {
          return item.isDueSoon;
        })
        .reduce(function sum(total, item) {
          return total + item.remainingAmount;
        }, 0),
      2
    );

    const statusGroups = {};

    Object.values(STATUS).forEach(function init(status) {
      statusGroups[status] = {
        status: status,
        count: 0,
        amount: 0,
        remainingAmount: 0
      };
    });

    enriched.forEach(function group(item) {
      const group = statusGroups[item.status];

      group.count += 1;
      group.amount += item.amount;
      group.remainingAmount += item.remainingAmount;
    });

    Object.values(statusGroups).forEach(function finalize(group) {
      group.amount = round(group.amount, 2);
      group.remainingAmount = round(
        group.remainingAmount,
        2
      );
    });

    const typeGroups = {};

    enriched.forEach(function groupType(item) {
      typeGroups[item.type] = typeGroups[item.type] || {
        type: item.type,
        labelAr:
          (TYPE_LABELS[item.type] || TYPE_LABELS.other).ar,
        labelEn:
          (TYPE_LABELS[item.type] || TYPE_LABELS.other).en,
        count: 0,
        amount: 0,
        paidAmount: 0,
        remainingAmount: 0
      };

      typeGroups[item.type].count += 1;
      typeGroups[item.type].amount += item.amount;
      typeGroups[item.type].paidAmount += item.paidAmount;
      typeGroups[item.type].remainingAmount +=
        item.remainingAmount;
    });

    const byType = Object.values(typeGroups)
      .map(function finalize(item) {
        return {
          type: item.type,
          labelAr: item.labelAr,
          labelEn: item.labelEn,
          count: item.count,
          amount: round(item.amount, 2),
          paidAmount: round(item.paidAmount, 2),
          remainingAmount: round(
            item.remainingAmount,
            2
          )
        };
      })
      .sort(function descending(a, b) {
        return b.amount - a.amount;
      });

    const byMonthMap = {};

    enriched.forEach(function monthGroup(item) {
      if (!item.dueDate) return;

      const key = monthKey(item.dueDate);

      byMonthMap[key] = byMonthMap[key] || {
        key: key,
        count: 0,
        amount: 0,
        paidAmount: 0,
        remainingAmount: 0
      };

      byMonthMap[key].count += 1;
      byMonthMap[key].amount += item.amount;
      byMonthMap[key].paidAmount += item.paidAmount;
      byMonthMap[key].remainingAmount +=
        item.remainingAmount;
    });

    const byMonth = Object.values(byMonthMap)
      .map(function finalize(item) {
        return {
          key: item.key,
          count: item.count,
          amount: round(item.amount, 2),
          paidAmount: round(item.paidAmount, 2),
          remainingAmount: round(
            item.remainingAmount,
            2
          )
        };
      })
      .sort(function chronological(a, b) {
        return a.key.localeCompare(b.key);
      });

    const alerts = buildAlerts(enriched);

    const upcoming = enriched.filter(function upcoming(item) {
      return (
        item.dueDate &&
        ![
          STATUS.PAID,
          STATUS.REFUNDED,
          STATUS.CANCELLED
        ].includes(item.status) &&
        item.daysUntilDue !== null &&
        item.daysUntilDue >= 0
      );
    }).slice(0, 10);

    const overdue = enriched.filter(function overdue(item) {
      return item.status === STATUS.OVERDUE;
    });

    const dashboard = {
      generatedAt: new Date().toISOString(),
      version: VERSION,
      currency: resolveCurrency(
        storeState,
        opts
      ),
      summary: {
        totalPayments: enriched.length,
        activePayments: active.length,
        totalAmount: totalAmount,
        paidAmount: paidAmount,
        remainingAmount: remainingAmount,
        completionPercent: percentage(
          paidAmount,
          totalAmount,
          1
        ),
        overdueCount: overdue.length,
        overdueAmount: overdueAmount,
        dueSoonCount: upcoming.filter(function soon(item) {
          return item.isDueSoon;
        }).length,
        dueSoonAmount: dueSoonAmount,
        refundedCount: enriched.filter(function refunded(item) {
          return item.status === STATUS.REFUNDED;
        }).length,
        cancelledCount: enriched.filter(function cancelled(item) {
          return item.status === STATUS.CANCELLED;
        }).length
      },
      payments: enriched,
      upcoming: upcoming,
      overdue: overdue,
      alerts: alerts,
      automaticReminders:
        generateAutomaticReminders(opts),
      byStatus: Object.values(statusGroups),
      byType: byType,
      byMonth: byMonth,
      charts: {
        status: {
          labels: Object.values(statusGroups).map(
            function label(item) {
              return item.status;
            }
          ),
          amounts: Object.values(statusGroups).map(
            function amount(item) {
              return item.amount;
            }
          ),
          counts: Object.values(statusGroups).map(
            function count(item) {
              return item.count;
            }
          )
        },
        type: {
          labelsAr: byType.map(function label(item) {
            return item.labelAr;
          }),
          labelsEn: byType.map(function label(item) {
            return item.labelEn;
          }),
          amounts: byType.map(function amount(item) {
            return item.amount;
          }),
          remaining: byType.map(function remaining(item) {
            return item.remainingAmount;
          })
        },
        monthly: {
          labels: byMonth.map(function label(item) {
            return item.key;
          }),
          totals: byMonth.map(function value(item) {
            return item.amount;
          }),
          paid: byMonth.map(function value(item) {
            return item.paidAmount;
          }),
          remaining: byMonth.map(function value(item) {
            return item.remainingAmount;
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

      const dashboard = buildDashboard(
        nextOptions
      );

      state.lastOptions = clone(nextOptions);
      state.lastDashboard = clone(dashboard);

      dispatch(EVENTS.REFRESHED, dashboard);
      notify(dashboard);

      return clone(dashboard);
    } catch (error) {
      reportError(
        "PAYMENT_REFRESH_FAILED",
        "تعذر تحديث متتبع الدفعات.",
        "Unable to refresh the payment tracker.",
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
      70
    );
  }

  function subscribe(listener, options) {
    if (typeof listener !== "function") {
      throw new TypeError(
        "Payment Tracker subscriber must be a function."
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
      "tic:budget-analytics-refreshed",
      "tic:budget-ai-refreshed"
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
      STATUS: STATUS,
      TYPE: TYPE,
      PRIORITY: PRIORITY,
      PAYMENT_METHOD: PAYMENT_METHOD,
      DEFAULT_CURRENCY: DEFAULT_CURRENCY,
      DEFAULT_REMINDER_DAYS: DEFAULT_REMINDER_DAYS,
      TYPE_LABELS: TYPE_LABELS
    }),

    initialize: initialize,
    init: initialize,
    refresh: refresh,
    buildDashboard: buildDashboard,
    getDashboard: function getDashboard(options) {
      return buildDashboard(options || {});
    },
    getSummary: function getSummary(options) {
      return buildDashboard(options || {}).summary;
    },
    getAlerts: function getAlerts(options) {
      return buildDashboard(options || {}).alerts;
    },
    getUpcoming: function getUpcoming(options) {
      return buildDashboard(options || {}).upcoming;
    },
    getOverdue: function getOverdue(options) {
      return buildDashboard(options || {}).overdue;
    },
    listPayments: listPayments,
    getPayments: listPayments,
    getPaymentById: getPaymentById,
    createPayment: createPayment,
    updatePayment: updatePayment,
    deletePayment: deletePayment,
    setStatus: setStatus,
    recordPayment: recordPayment,
    markPaid: function markPaid(id, input, options) {
      return recordPayment(
        id,
        Object.assign({}, input || {}, {
          amount: firstDefined(
            input && input.amount,
            getPaymentById(id, options || {}) &&
              getPaymentById(id, options || {}).remainingAmount
          )
        }),
        options || {}
      );
    },
    recordRefund: recordRefund,
    buildInstallmentSchedule: buildInstallmentSchedule,
    recordInstallmentPayment: recordInstallmentPayment,
    createReminder: createReminder,
    generateAutomaticReminders:
      generateAutomaticReminders,
    reconcileToExpense: reconcileToExpense,
    validatePaymentInput: validatePaymentInput,
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
      createId: createId,
      safeDate: safeDate,
      startOfDay: startOfDay,
      endOfDay: endOfDay,
      addDays: addDays,
      dateKey: dateKey,
      monthKey: monthKey,
      daysBetween: daysBetween,
      normalizeCurrency: normalizeCurrency,
      normalizeStatus: normalizeStatus,
      normalizeType: normalizeType,
      normalizeMethod: normalizeMethod,
      calculatePaymentStatus:
        calculatePaymentStatus
    })
  });

  global.TIC = global.TIC || {};
  global.TIC.Features = global.TIC.Features || {};
  global.TIC.Features.paymentTracker = API;
  global.TICPaymentTracker = API;

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
