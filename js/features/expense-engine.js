/* =========================================================
   Travel Intelligence Center
   Budget Intelligence Platform
   Expense Engine V1.0.0

   File Path:
   js/features/expense-engine.js

   Purpose:
   - Production-ready expense management engine.
   - Owns expense CRUD operations and validation.
   - Supports trip-linked expenses, categories, refunds,
     recurring items, split expenses and transaction history.
   - Synchronizes changes through the central Store.
   - Exposes dashboard-ready expense summaries.
   - Does not render UI directly.

   Dependencies:
   - window.TICBudgetEngine
   - window.TICStore / window.Store

   Global:
   - window.TICExpenseEngine
   ========================================================= */

(function expenseEngineFactory(global) {
  "use strict";

  const VERSION = "1.0.0";
  const ENGINE_NAME = "TICExpenseEngine";

  const EVENTS = Object.freeze({
    READY: "tic:expense-engine-ready",
    CREATED: "tic:expense-created",
    UPDATED: "tic:expense-updated",
    DELETED: "tic:expense-deleted",
    REFUNDED: "tic:expense-refunded",
    RESTORED: "tic:expense-restored",
    CHANGED: "tic:expenses-changed",
    ERROR: "tic:expense-error"
  });

  const EXPENSE_STATUS = Object.freeze({
    PLANNED: "planned",
    PENDING: "pending",
    PAID: "paid",
    REFUNDED: "refunded",
    CANCELLED: "cancelled"
  });

  const TRANSACTION_TYPE = Object.freeze({
    EXPENSE: "expense",
    REFUND: "refund",
    ADJUSTMENT: "adjustment"
  });

  const RECURRENCE = Object.freeze({
    NONE: "none",
    WEEKLY: "weekly",
    MONTHLY: "monthly",
    YEARLY: "yearly"
  });

  const DEFAULT_CATEGORY = "other";
  const DEFAULT_CURRENCY = "AED";
  const MAX_NOTE_LENGTH = 1000;
  const MAX_TITLE_LENGTH = 140;

  function getBudgetEngine() {
    return global.TICBudgetEngine || null;
  }

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

    try {
      return structuredClone(value);
    } catch (error) {
      return JSON.parse(JSON.stringify(value));
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
    const number = Number(value);
    return Number.isFinite(number) ? number : (fallback ?? 0);
  }

  function toNonNegative(value, fallback) {
    return Math.max(0, toNumber(value, fallback));
  }

  function round(value, decimals) {
    const precision = Number.isInteger(decimals) ? decimals : 2;
    const factor = Math.pow(10, precision);
    return Math.round((toNumber(value, 0) + Number.EPSILON) * factor) / factor;
  }

  function normalizeString(value, fallback, maxLength) {
    const text = String(value ?? fallback ?? "").trim();
    return typeof maxLength === "number" ? text.slice(0, maxLength) : text;
  }

  function normalizeCurrency(value) {
    const budgetEngine = getBudgetEngine();

    if (
      budgetEngine &&
      budgetEngine.utils &&
      typeof budgetEngine.utils.normalizeCurrency === "function"
    ) {
      return budgetEngine.utils.normalizeCurrency(value || DEFAULT_CURRENCY);
    }

    return String(value || DEFAULT_CURRENCY).trim().toUpperCase() || DEFAULT_CURRENCY;
  }

  function normalizeCategory(value) {
    const budgetEngine = getBudgetEngine();

    if (
      budgetEngine &&
      budgetEngine.utils &&
      typeof budgetEngine.utils.normalizeCategory === "function"
    ) {
      return budgetEngine.utils.normalizeCategory(value || DEFAULT_CATEGORY);
    }

    return normalizeString(value || DEFAULT_CATEGORY, DEFAULT_CATEGORY).toLowerCase();
  }

  function safeDate(value) {
    if (!value) return null;

    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function toIso(value, fallbackToNow) {
    const date = safeDate(value);

    if (date) return date.toISOString();
    return fallbackToNow ? new Date().toISOString() : null;
  }

  function normalizeStatus(value, fallback) {
    const raw = normalizeString(value, fallback || EXPENSE_STATUS.PAID).toLowerCase();

    const aliases = {
      complete: EXPENSE_STATUS.PAID,
      completed: EXPENSE_STATUS.PAID,
      settled: EXPENSE_STATUS.PAID,
      done: EXPENSE_STATUS.PAID,
      unpaid: EXPENSE_STATUS.PENDING,
      waiting: EXPENSE_STATUS.PENDING,
      scheduled: EXPENSE_STATUS.PLANNED,
      draft: EXPENSE_STATUS.PLANNED,
      returned: EXPENSE_STATUS.REFUNDED,
      canceled: EXPENSE_STATUS.CANCELLED
    };

    const status = aliases[raw] || raw;

    return Object.values(EXPENSE_STATUS).includes(status)
      ? status
      : (fallback || EXPENSE_STATUS.PAID);
  }

  function normalizeRecurrence(value) {
    const raw = normalizeString(value, RECURRENCE.NONE).toLowerCase();

    return Object.values(RECURRENCE).includes(raw)
      ? raw
      : RECURRENCE.NONE;
  }

  function createId(prefix) {
    const safePrefix = normalizeString(prefix, "expense")
      .replace(/[^a-zA-Z0-9_-]/g, "_");

    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return safePrefix + "_" + global.crypto.randomUUID();
    }

    return safePrefix + "_" +
      Date.now().toString(36) + "_" +
      Math.random().toString(36).slice(2, 10);
  }

  function dispatch(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, {
        detail: clone(detail)
      }));
    } catch (error) {
      console.warn("[" + ENGINE_NAME + "] Unable to dispatch event:", name, error);
    }
  }

  function fail(code, messageAr, messageEn, details) {
    const error = new Error(messageEn || messageAr || code);
    error.code = code;
    error.messageAr = messageAr || "";
    error.messageEn = messageEn || "";
    error.details = details || null;

    dispatch(EVENTS.ERROR, {
      code: code,
      messageAr: error.messageAr,
      messageEn: error.messageEn,
      details: details || null
    });

    throw error;
  }

  function resolveStore(store) {
    return store || global.TICStore || global.Store || global.store || null;
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
      fail(
        "STORE_READ_FAILED",
        "تعذر قراءة بيانات المصروفات من المخزن.",
        "Unable to read expense data from the Store.",
        { cause: error.message }
      );
    }

    return {};
  }

  function getExpensesFromState(state) {
    if (!state) return [];

    if (Array.isArray(state.expenses)) return state.expenses;

    if (isObject(state.budget) && Array.isArray(state.budget.expenses)) {
      return state.budget.expenses;
    }

    if (isObject(state.budgets) && Array.isArray(state.budgets.expenses)) {
      return state.budgets.expenses;
    }

    if (
      isObject(state.finance) &&
      Array.isArray(state.finance.expenses)
    ) {
      return state.finance.expenses;
    }

    if (
      isObject(state.travelFinance) &&
      Array.isArray(state.travelFinance.expenses)
    ) {
      return state.travelFinance.expenses;
    }

    return [];
  }

  function getTransactionsFromState(state) {
    if (!state) return [];

    if (Array.isArray(state.transactions)) return state.transactions;

    if (isObject(state.budget) && Array.isArray(state.budget.transactions)) {
      return state.budget.transactions;
    }

    if (isObject(state.budgets) && Array.isArray(state.budgets.transactions)) {
      return state.budgets.transactions;
    }

    if (
      isObject(state.finance) &&
      Array.isArray(state.finance.transactions)
    ) {
      return state.finance.transactions;
    }

    return [];
  }

  function getTripsFromState(state) {
    return asArray(firstDefined(
      state && state.trips,
      state && state.travel && state.travel.trips,
      []
    ));
  }

  function getSettingsFromState(state) {
    return isObject(state && state.settings) ? state.settings : {};
  }

  function getProfileFromState(state) {
    return isObject(state && state.profile) ? state.profile : {};
  }

  function resolveDefaultCurrency(state) {
    const settings = getSettingsFromState(state);
    const profile = getProfileFromState(state);

    return normalizeCurrency(firstDefined(
      settings.currency,
      profile.currency,
      state && state.currency,
      DEFAULT_CURRENCY
    ));
  }

  function writeState(nextState, store) {
    const source = resolveStore(store);

    if (!source) {
      fail(
        "STORE_NOT_FOUND",
        "لم يتم العثور على مخزن التطبيق.",
        "Application Store was not found."
      );
    }

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

      fail(
        "STORE_WRITE_UNSUPPORTED",
        "المخزن الحالي لا يدعم تحديث بيانات المصروفات.",
        "The current Store does not support expense updates."
      );
    } catch (error) {
      if (error && error.code) throw error;

      fail(
        "STORE_WRITE_FAILED",
        "تعذر حفظ بيانات المصروفات.",
        "Unable to save expense data.",
        { cause: error.message }
      );
    }

    return false;
  }

  function setExpensesInState(state, expenses) {
    const nextState = clone(state || {});
    const normalizedExpenses = clone(asArray(expenses));

    /*
     * The canonical target is state.expenses.
     * Existing nested references are mirrored when present so this engine
     * remains compatible until the final Store migration is completed.
     */
    nextState.expenses = normalizedExpenses;

    if (isObject(nextState.budget)) {
      nextState.budget.expenses = clone(normalizedExpenses);
    }

    if (isObject(nextState.budgets) && !Array.isArray(nextState.budgets)) {
      nextState.budgets.expenses = clone(normalizedExpenses);
    }

    if (isObject(nextState.finance)) {
      nextState.finance.expenses = clone(normalizedExpenses);
    }

    if (isObject(nextState.travelFinance)) {
      nextState.travelFinance.expenses = clone(normalizedExpenses);
    }

    return nextState;
  }

  function setTransactionsInState(state, transactions) {
    const nextState = clone(state || {});
    const normalizedTransactions = clone(asArray(transactions));

    nextState.transactions = normalizedTransactions;

    if (isObject(nextState.budget)) {
      nextState.budget.transactions = clone(normalizedTransactions);
    }

    if (isObject(nextState.budgets) && !Array.isArray(nextState.budgets)) {
      nextState.budgets.transactions = clone(normalizedTransactions);
    }

    if (isObject(nextState.finance)) {
      nextState.finance.transactions = clone(normalizedTransactions);
    }

    return nextState;
  }

  function commit(expenses, transactions, store) {
    const currentState = readState(store);
    let nextState = setExpensesInState(currentState, expenses);

    if (transactions) {
      nextState = setTransactionsInState(nextState, transactions);
    }

    writeState(nextState, store);

    const payload = {
      expenses: clone(expenses),
      transactions: clone(transactions || getTransactionsFromState(nextState)),
      count: expenses.length,
      updatedAt: new Date().toISOString()
    };

    dispatch(EVENTS.CHANGED, payload);
    return payload;
  }

  function findTrip(state, tripId) {
    if (!tripId) return null;

    return getTripsFromState(state).find(function matchTrip(trip) {
      return String(firstDefined(
        trip.id,
        trip._id,
        trip.uuid,
        trip.key
      )) === String(tripId);
    }) || null;
  }

  function normalizeSplit(split, amount) {
    if (!split) return null;

    const members = asArray(firstDefined(split.members, split.people, split.participants));
    const shares = members.map(function mapMember(member, index) {
      const item = isObject(member) ? member : { name: String(member) };

      return {
        id: normalizeString(firstDefined(item.id, item.key), "person_" + index),
        name: normalizeString(firstDefined(item.name, item.label), "مسافر " + (index + 1), 80),
        amount: toNonNegative(item.amount, 0),
        percentage: toNonNegative(item.percentage, 0),
        paid: item.paid === true
      };
    });

    if (!shares.length) return null;

    const explicitTotal = round(
      shares.reduce(function total(sum, item) {
        return sum + item.amount;
      }, 0),
      2
    );

    if (explicitTotal <= 0) {
      const equalShare = round(amount / shares.length, 2);
      let assigned = 0;

      shares.forEach(function assignEqual(item, index) {
        if (index === shares.length - 1) {
          item.amount = round(amount - assigned, 2);
        } else {
          item.amount = equalShare;
          assigned += equalShare;
        }

        item.percentage = amount > 0
          ? round((item.amount / amount) * 100, 2)
          : 0;
      });
    } else {
      shares.forEach(function assignPercent(item) {
        item.percentage = amount > 0
          ? round((item.amount / amount) * 100, 2)
          : 0;
      });
    }

    return {
      enabled: true,
      method: normalizeString(split.method, "custom"),
      members: shares,
      total: round(shares.reduce(function sumShares(sum, item) {
        return sum + item.amount;
      }, 0), 2)
    };
  }

  function normalizeAttachment(item, index) {
    const attachment = isObject(item) ? item : {};

    return {
      id: normalizeString(firstDefined(attachment.id, attachment.key), "attachment_" + index),
      name: normalizeString(firstDefined(
        attachment.name,
        attachment.filename,
        "مرفق"
      ), "مرفق", 180),
      type: normalizeString(firstDefined(
        attachment.type,
        attachment.mimeType,
        ""
      ), "", 100),
      url: normalizeString(firstDefined(
        attachment.url,
        attachment.dataUrl,
        attachment.path,
        ""
      ), "", 5000),
      size: toNonNegative(firstDefined(
        attachment.size,
        attachment.sizeBytes
      ), 0)
    };
  }

  function normalizeExpenseInput(input, options) {
    const data = isObject(input) ? input : {};
    const opts = isObject(options) ? options : {};
    const state = opts.state || readState(opts.store);
    const now = new Date().toISOString();

    const amount = round(toNonNegative(firstDefined(
      data.amount,
      data.value,
      data.total,
      data.cost,
      data.price
    ), 0), 2);

    const status = normalizeStatus(firstDefined(
      data.status,
      data.paymentStatus,
      EXPENSE_STATUS.PAID
    ), EXPENSE_STATUS.PAID);

    const date = toIso(firstDefined(
      data.date,
      data.transactionDate,
      data.paidAt,
      data.createdAt
    ), true);

    const attachments = asArray(firstDefined(
      data.attachments,
      data.receipts,
      data.files
    )).map(normalizeAttachment);

    const normalized = {
      id: normalizeString(firstDefined(
        data.id,
        data._id,
        data.uuid
      ), opts.generateId === false ? "" : createId("expense")),
      tripId: normalizeString(firstDefined(
        data.tripId,
        data.trip_id,
        data.trip && data.trip.id,
        ""
      ), ""),
      title: normalizeString(firstDefined(
        data.title,
        data.name,
        data.description,
        "مصروف سفر"
      ), "مصروف سفر", MAX_TITLE_LENGTH),
      description: normalizeString(firstDefined(
        data.description,
        data.details,
        ""
      ), "", 500),
      category: normalizeCategory(firstDefined(
        data.category,
        data.categoryKey,
        data.type,
        DEFAULT_CATEGORY
      )),
      amount: amount,
      originalAmount: round(toNonNegative(firstDefined(
        data.originalAmount,
        data.localAmount,
        amount
      ), amount), 2),
      currency: normalizeCurrency(firstDefined(
        data.currency,
        resolveDefaultCurrency(state)
      )),
      originalCurrency: normalizeCurrency(firstDefined(
        data.originalCurrency,
        data.localCurrency,
        data.currency,
        resolveDefaultCurrency(state)
      )),
      exchangeRate: round(toNonNegative(firstDefined(
        data.exchangeRate,
        data.rate,
        1
      ), 1), 6),
      status: status,
      transactionType: normalizeString(firstDefined(
        data.transactionType,
        TRANSACTION_TYPE.EXPENSE
      ), TRANSACTION_TYPE.EXPENSE).toLowerCase(),
      date: date,
      dueDate: toIso(firstDefined(data.dueDate, data.deadline), false),
      merchant: normalizeString(firstDefined(
        data.merchant,
        data.vendor,
        data.provider,
        ""
      ), "", 160),
      location: normalizeString(firstDefined(
        data.location,
        data.city,
        data.country,
        ""
      ), "", 180),
      paymentMethod: normalizeString(firstDefined(
        data.paymentMethod,
        data.method,
        ""
      ), "", 80),
      bookingReference: normalizeString(firstDefined(
        data.bookingReference,
        data.reference,
        data.confirmationNumber,
        ""
      ), "", 120),
      notes: normalizeString(firstDefined(
        data.notes,
        data.note,
        ""
      ), "", MAX_NOTE_LENGTH),
      tags: asArray(data.tags)
        .map(function normalizeTag(tag) {
          return normalizeString(tag, "", 60);
        })
        .filter(Boolean),
      recurring: {
        enabled: Boolean(
          data.recurring === true ||
          (isObject(data.recurring) && data.recurring.enabled === true)
        ),
        frequency: normalizeRecurrence(firstDefined(
          isObject(data.recurring) && data.recurring.frequency,
          data.recurrence,
          RECURRENCE.NONE
        )),
        nextDate: toIso(firstDefined(
          isObject(data.recurring) && data.recurring.nextDate,
          data.nextDate
        ), false),
        endDate: toIso(firstDefined(
          isObject(data.recurring) && data.recurring.endDate,
          data.recurringEndDate
        ), false)
      },
      split: normalizeSplit(firstDefined(
        data.split,
        data.costSplit
      ), amount),
      attachments: attachments,
      metadata: isObject(data.metadata) ? clone(data.metadata) : {},
      createdAt: toIso(firstDefined(data.createdAt, now), true),
      updatedAt: now,
      paidAt: status === EXPENSE_STATUS.PAID
        ? toIso(firstDefined(data.paidAt, date), true)
        : toIso(data.paidAt, false),
      refundedAt: status === EXPENSE_STATUS.REFUNDED
        ? toIso(firstDefined(data.refundedAt, now), true)
        : toIso(data.refundedAt, false),
      cancelledAt: status === EXPENSE_STATUS.CANCELLED
        ? toIso(firstDefined(data.cancelledAt, now), true)
        : toIso(data.cancelledAt, false),
      deletedAt: toIso(data.deletedAt, false),
      isDeleted: data.isDeleted === true
    };

    if (normalized.transactionType === TRANSACTION_TYPE.REFUND) {
      normalized.status = EXPENSE_STATUS.REFUNDED;
    }

    return normalized;
  }

  function validateExpense(expense, options) {
    const data = normalizeExpenseInput(expense, {
      ...(options || {}),
      generateId: false
    });

    const issues = [];
    const state = (options && options.state) || readState(options && options.store);

    if (!data.title) {
      issues.push({
        field: "title",
        code: "TITLE_REQUIRED",
        messageAr: "اسم المصروف مطلوب.",
        messageEn: "Expense title is required."
      });
    }

    if (data.amount <= 0 && data.status !== EXPENSE_STATUS.CANCELLED) {
      issues.push({
        field: "amount",
        code: "AMOUNT_INVALID",
        messageAr: "قيمة المصروف يجب أن تكون أكبر من صفر.",
        messageEn: "Expense amount must be greater than zero."
      });
    }

    if (!data.currency) {
      issues.push({
        field: "currency",
        code: "CURRENCY_REQUIRED",
        messageAr: "عملة المصروف مطلوبة.",
        messageEn: "Expense currency is required."
      });
    }

    if (!Object.values(EXPENSE_STATUS).includes(data.status)) {
      issues.push({
        field: "status",
        code: "STATUS_INVALID",
        messageAr: "حالة المصروف غير صحيحة.",
        messageEn: "Expense status is invalid."
      });
    }

    if (data.tripId && !findTrip(state, data.tripId)) {
      issues.push({
        field: "tripId",
        code: "TRIP_NOT_FOUND",
        messageAr: "الرحلة المرتبطة بالمصروف غير موجودة.",
        messageEn: "The linked trip does not exist."
      });
    }

    if (
      data.originalCurrency !== data.currency &&
      data.exchangeRate <= 0
    ) {
      issues.push({
        field: "exchangeRate",
        code: "EXCHANGE_RATE_INVALID",
        messageAr: "سعر الصرف يجب أن يكون أكبر من صفر.",
        messageEn: "Exchange rate must be greater than zero."
      });
    }

    if (
      data.split &&
      Math.abs(round(data.split.total - data.amount, 2)) > 0.05
    ) {
      issues.push({
        field: "split",
        code: "SPLIT_TOTAL_MISMATCH",
        messageAr: "مجموع تقسيم المصروف لا يساوي قيمة المصروف.",
        messageEn: "Expense split total does not match the expense amount."
      });
    }

    const recurrence = data.recurring;

    if (
      recurrence.enabled &&
      recurrence.frequency === RECURRENCE.NONE
    ) {
      issues.push({
        field: "recurring.frequency",
        code: "RECURRENCE_REQUIRED",
        messageAr: "حدد تكرار المصروف.",
        messageEn: "Recurring frequency is required."
      });
    }

    return {
      valid: issues.length === 0,
      issues: issues,
      expense: data
    };
  }

  function assertValidExpense(expense, options) {
    const result = validateExpense(expense, options);

    if (!result.valid) {
      fail(
        "EXPENSE_VALIDATION_FAILED",
        "بيانات المصروف غير مكتملة أو غير صحيحة.",
        "Expense data is incomplete or invalid.",
        result.issues
      );
    }

    return result.expense;
  }

  function createTransaction(expense, type, extra) {
    const transactionType = type || TRANSACTION_TYPE.EXPENSE;
    const payload = isObject(extra) ? extra : {};
    const isRefund = transactionType === TRANSACTION_TYPE.REFUND;

    return {
      id: createId("transaction"),
      expenseId: expense.id,
      tripId: expense.tripId || "",
      type: transactionType,
      title: normalizeString(firstDefined(
        payload.title,
        isRefund ? "استرداد: " + expense.title : expense.title
      ), expense.title, MAX_TITLE_LENGTH),
      category: expense.category,
      amount: round(toNonNegative(firstDefined(
        payload.amount,
        expense.amount
      ), expense.amount), 2),
      direction: isRefund ? "credit" : "debit",
      currency: expense.currency,
      date: toIso(firstDefined(payload.date, new Date()), true),
      status: normalizeString(firstDefined(
        payload.status,
        expense.status
      ), expense.status),
      paymentMethod: expense.paymentMethod,
      merchant: expense.merchant,
      notes: normalizeString(firstDefined(
        payload.notes,
        expense.notes,
        ""
      ), "", MAX_NOTE_LENGTH),
      metadata: {
        expenseStatus: expense.status,
        source: ENGINE_NAME,
        ...(isObject(payload.metadata) ? payload.metadata : {})
      },
      createdAt: new Date().toISOString()
    };
  }

  function list(options) {
    const opts = isObject(options) ? options : {};
    const state = opts.state || readState(opts.store);
    let expenses = getExpensesFromState(state)
      .map(function normalizeStored(expense) {
        return normalizeExpenseInput(expense, {
          state: state,
          generateId: false
        });
      });

    if (opts.includeDeleted !== true) {
      expenses = expenses.filter(function activeExpense(expense) {
        return !expense.isDeleted;
      });
    }

    if (opts.tripId !== undefined) {
      expenses = expenses.filter(function byTrip(expense) {
        return expense.tripId === String(opts.tripId);
      });
    }

    if (opts.category) {
      const category = normalizeCategory(opts.category);
      expenses = expenses.filter(function byCategory(expense) {
        return expense.category === category;
      });
    }

    if (opts.status) {
      const status = normalizeStatus(opts.status, opts.status);
      expenses = expenses.filter(function byStatus(expense) {
        return expense.status === status;
      });
    }

    if (opts.currency) {
      const currency = normalizeCurrency(opts.currency);
      expenses = expenses.filter(function byCurrency(expense) {
        return expense.currency === currency;
      });
    }

    if (opts.from) {
      const fromDate = safeDate(opts.from);

      if (fromDate) {
        expenses = expenses.filter(function fromFilter(expense) {
          const expenseDate = safeDate(expense.date);
          return expenseDate && expenseDate >= fromDate;
        });
      }
    }

    if (opts.to) {
      const toDate = safeDate(opts.to);

      if (toDate) {
        toDate.setHours(23, 59, 59, 999);

        expenses = expenses.filter(function toFilter(expense) {
          const expenseDate = safeDate(expense.date);
          return expenseDate && expenseDate <= toDate;
        });
      }
    }

    if (opts.search) {
      const query = normalizeString(opts.search, "").toLowerCase();

      expenses = expenses.filter(function searchExpense(expense) {
        return [
          expense.title,
          expense.description,
          expense.merchant,
          expense.location,
          expense.notes,
          expense.bookingReference,
          expense.category
        ].some(function includesQuery(value) {
          return String(value || "").toLowerCase().includes(query);
        });
      });
    }

    const sortBy = normalizeString(opts.sortBy, "date");
    const direction = normalizeString(opts.direction, "desc").toLowerCase() === "asc"
      ? 1
      : -1;

    expenses.sort(function sortExpenses(a, b) {
      if (sortBy === "amount") {
        return (a.amount - b.amount) * direction;
      }

      if (sortBy === "title") {
        return a.title.localeCompare(b.title, "ar") * direction;
      }

      if (sortBy === "createdAt") {
        const aCreated = safeDate(a.createdAt);
        const bCreated = safeDate(b.createdAt);
        return ((aCreated?.getTime() || 0) - (bCreated?.getTime() || 0)) * direction;
      }

      const aDate = safeDate(a.date);
      const bDate = safeDate(b.date);
      return ((aDate?.getTime() || 0) - (bDate?.getTime() || 0)) * direction;
    });

    if (Number.isInteger(opts.limit) && opts.limit >= 0) {
      expenses = expenses.slice(0, opts.limit);
    }

    return clone(expenses);
  }

  function getById(id, options) {
    const targetId = normalizeString(id, "");

    if (!targetId) return null;

    return list({
      ...(options || {}),
      includeDeleted: true
    }).find(function findExpense(expense) {
      return expense.id === targetId;
    }) || null;
  }

  function create(input, options) {
    const opts = isObject(options) ? options : {};
    const state = readState(opts.store);
    const expense = assertValidExpense(input, {
      state: state,
      store: opts.store
    });

    const expenses = getExpensesFromState(state).map(function normalizeStored(item) {
      return normalizeExpenseInput(item, {
        state: state,
        generateId: false
      });
    });

    if (expenses.some(function duplicate(item) {
      return item.id === expense.id;
    })) {
      fail(
        "EXPENSE_ID_EXISTS",
        "يوجد مصروف آخر بالمعرف نفسه.",
        "Another expense already uses this ID.",
        { id: expense.id }
      );
    }

    const nextExpenses = [expense].concat(expenses);
    const transactions = getTransactionsFromState(state).slice();

    if (
      expense.status === EXPENSE_STATUS.PAID ||
      expense.status === EXPENSE_STATUS.REFUNDED
    ) {
      transactions.unshift(createTransaction(
        expense,
        expense.status === EXPENSE_STATUS.REFUNDED
          ? TRANSACTION_TYPE.REFUND
          : TRANSACTION_TYPE.EXPENSE
      ));
    }

    commit(nextExpenses, transactions, opts.store);

    dispatch(EVENTS.CREATED, {
      expense: expense
    });

    return clone(expense);
  }

  function update(id, patch, options) {
    const opts = isObject(options) ? options : {};
    const state = readState(opts.store);
    const expenses = getExpensesFromState(state).map(function normalizeStored(item) {
      return normalizeExpenseInput(item, {
        state: state,
        generateId: false
      });
    });

    const targetId = normalizeString(id, "");
    const index = expenses.findIndex(function findExpense(expense) {
      return expense.id === targetId;
    });

    if (index < 0) {
      fail(
        "EXPENSE_NOT_FOUND",
        "المصروف المطلوب غير موجود.",
        "The requested expense was not found.",
        { id: targetId }
      );
    }

    const previous = expenses[index];
    const merged = {
      ...previous,
      ...(isObject(patch) ? patch : {}),
      id: previous.id,
      createdAt: previous.createdAt,
      updatedAt: new Date().toISOString()
    };

    const expense = assertValidExpense(merged, {
      state: state,
      store: opts.store
    });

    const transactions = getTransactionsFromState(state).slice();

    const becamePaid =
      previous.status !== EXPENSE_STATUS.PAID &&
      expense.status === EXPENSE_STATUS.PAID;

    const becameRefunded =
      previous.status !== EXPENSE_STATUS.REFUNDED &&
      expense.status === EXPENSE_STATUS.REFUNDED;

    if (becamePaid) {
      transactions.unshift(createTransaction(expense, TRANSACTION_TYPE.EXPENSE));
    }

    if (becameRefunded) {
      transactions.unshift(createTransaction(expense, TRANSACTION_TYPE.REFUND));
    }

    expenses[index] = expense;
    commit(expenses, transactions, opts.store);

    dispatch(EVENTS.UPDATED, {
      previous: previous,
      expense: expense
    });

    return clone(expense);
  }

  function remove(id, options) {
    const opts = isObject(options) ? options : {};
    const hardDelete = opts.hard === true;
    const state = readState(opts.store);

    const expenses = getExpensesFromState(state).map(function normalizeStored(item) {
      return normalizeExpenseInput(item, {
        state: state,
        generateId: false
      });
    });

    const targetId = normalizeString(id, "");
    const index = expenses.findIndex(function findExpense(expense) {
      return expense.id === targetId;
    });

    if (index < 0) {
      fail(
        "EXPENSE_NOT_FOUND",
        "المصروف المطلوب غير موجود.",
        "The requested expense was not found.",
        { id: targetId }
      );
    }

    const expense = expenses[index];
    let nextExpenses;

    if (hardDelete) {
      nextExpenses = expenses.filter(function keepExpense(item) {
        return item.id !== targetId;
      });
    } else {
      expense.isDeleted = true;
      expense.deletedAt = new Date().toISOString();
      expense.updatedAt = new Date().toISOString();
      nextExpenses = expenses.slice();
      nextExpenses[index] = expense;
    }

    const transactions = getTransactionsFromState(state).slice();

    commit(nextExpenses, transactions, opts.store);

    dispatch(EVENTS.DELETED, {
      expense: expense,
      hard: hardDelete
    });

    return clone(expense);
  }

  function restore(id, options) {
    const opts = isObject(options) ? options : {};
    const expense = getById(id, {
      store: opts.store,
      includeDeleted: true
    });

    if (!expense) {
      fail(
        "EXPENSE_NOT_FOUND",
        "المصروف المطلوب غير موجود.",
        "The requested expense was not found.",
        { id: id }
      );
    }

    if (!expense.isDeleted) {
      return expense;
    }

    const restored = update(id, {
      isDeleted: false,
      deletedAt: null
    }, opts);

    dispatch(EVENTS.RESTORED, {
      expense: restored
    });

    return restored;
  }

  function markPaid(id, paymentData, options) {
    const data = isObject(paymentData) ? paymentData : {};

    return update(id, {
      status: EXPENSE_STATUS.PAID,
      paidAt: toIso(firstDefined(data.paidAt, data.date, new Date()), true),
      paymentMethod: firstDefined(data.paymentMethod, data.method),
      amount: firstDefined(data.amount, undefined),
      notes: firstDefined(data.notes, undefined)
    }, options);
  }

  function markPending(id, options) {
    return update(id, {
      status: EXPENSE_STATUS.PENDING,
      paidAt: null
    }, options);
  }

  function cancel(id, reason, options) {
    return update(id, {
      status: EXPENSE_STATUS.CANCELLED,
      cancelledAt: new Date().toISOString(),
      notes: normalizeString(reason, "", MAX_NOTE_LENGTH)
    }, options);
  }

  function refund(id, refundData, options) {
    const opts = isObject(options) ? options : {};
    const data = isObject(refundData) ? refundData : {};
    const expense = getById(id, {
      store: opts.store,
      includeDeleted: false
    });

    if (!expense) {
      fail(
        "EXPENSE_NOT_FOUND",
        "المصروف المطلوب غير موجود.",
        "The requested expense was not found.",
        { id: id }
      );
    }

    if (expense.status === EXPENSE_STATUS.REFUNDED) {
      fail(
        "EXPENSE_ALREADY_REFUNDED",
        "تم استرداد هذا المصروف مسبقاً.",
        "This expense has already been refunded.",
        { id: id }
      );
    }

    const refundAmount = round(toNonNegative(firstDefined(
      data.amount,
      expense.amount
    ), expense.amount), 2);

    if (refundAmount > expense.amount) {
      fail(
        "REFUND_EXCEEDS_EXPENSE",
        "قيمة الاسترداد أكبر من قيمة المصروف.",
        "Refund amount exceeds the expense amount.",
        {
          expenseAmount: expense.amount,
          refundAmount: refundAmount
        }
      );
    }

    const state = readState(opts.store);
    const expenses = getExpensesFromState(state).map(function normalizeStored(item) {
      return normalizeExpenseInput(item, {
        state: state,
        generateId: false
      });
    });

    const index = expenses.findIndex(function findExpense(item) {
      return item.id === expense.id;
    });

    const fullRefund = Math.abs(refundAmount - expense.amount) <= 0.01;

    const updatedExpense = {
      ...expense,
      status: fullRefund
        ? EXPENSE_STATUS.REFUNDED
        : expense.status,
      refundedAt: new Date().toISOString(),
      refund: {
        amount: refundAmount,
        currency: expense.currency,
        date: toIso(firstDefined(data.date, new Date()), true),
        reason: normalizeString(firstDefined(data.reason, data.notes), "", 500),
        full: fullRefund
      },
      updatedAt: new Date().toISOString()
    };

    expenses[index] = updatedExpense;

    const transactions = getTransactionsFromState(state).slice();
    transactions.unshift(createTransaction(
      updatedExpense,
      TRANSACTION_TYPE.REFUND,
      {
        amount: refundAmount,
        date: firstDefined(data.date, new Date()),
        notes: firstDefined(data.reason, data.notes, ""),
        metadata: {
          fullRefund: fullRefund
        }
      }
    ));

    commit(expenses, transactions, opts.store);

    dispatch(EVENTS.REFUNDED, {
      expense: updatedExpense,
      refundAmount: refundAmount,
      fullRefund: fullRefund
    });

    return clone(updatedExpense);
  }

  function duplicate(id, overrides, options) {
    const expense = getById(id, options);

    if (!expense) {
      fail(
        "EXPENSE_NOT_FOUND",
        "المصروف المطلوب غير موجود.",
        "The requested expense was not found.",
        { id: id }
      );
    }

    const copy = {
      ...expense,
      ...(isObject(overrides) ? overrides : {}),
      id: createId("expense"),
      title: firstDefined(
        overrides && overrides.title,
        expense.title + " - نسخة"
      ),
      status: firstDefined(
        overrides && overrides.status,
        EXPENSE_STATUS.PLANNED
      ),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paidAt: null,
      refundedAt: null,
      cancelledAt: null,
      deletedAt: null,
      isDeleted: false
    };

    return create(copy, options);
  }

  function calculateEffectiveAmount(expense) {
    if (!expense || expense.isDeleted) return 0;
    if (expense.status === EXPENSE_STATUS.CANCELLED) return 0;

    const amount = toNonNegative(expense.amount, 0);
    const refundAmount = toNonNegative(
      expense.refund && expense.refund.amount,
      0
    );

    if (expense.status === EXPENSE_STATUS.REFUNDED) {
      return round(Math.max(0, amount - refundAmount), 2);
    }

    return round(Math.max(0, amount - refundAmount), 2);
  }

  function summary(options) {
    const opts = isObject(options) ? options : {};
    const expenses = list({
      ...opts,
      includeDeleted: false
    });

    const paid = expenses.filter(function paidExpense(expense) {
      return expense.status === EXPENSE_STATUS.PAID;
    });

    const pending = expenses.filter(function pendingExpense(expense) {
      return [
        EXPENSE_STATUS.PENDING,
        EXPENSE_STATUS.PLANNED
      ].includes(expense.status);
    });

    const refunded = expenses.filter(function refundedExpense(expense) {
      return expense.status === EXPENSE_STATUS.REFUNDED ||
        toNonNegative(expense.refund && expense.refund.amount, 0) > 0;
    });

    const cancelled = expenses.filter(function cancelledExpense(expense) {
      return expense.status === EXPENSE_STATUS.CANCELLED;
    });

    const spent = round(paid.reduce(function total(sum, expense) {
      return sum + calculateEffectiveAmount(expense);
    }, 0), 2);

    const committed = round(
      paid.concat(pending).reduce(function total(sum, expense) {
        return sum + calculateEffectiveAmount(expense);
      }, 0),
      2
    );

    const refundTotal = round(refunded.reduce(function total(sum, expense) {
      return sum + toNonNegative(
        expense.refund && expense.refund.amount,
        expense.status === EXPENSE_STATUS.REFUNDED ? expense.amount : 0
      );
    }, 0), 2);

    const average = paid.length > 0
      ? round(spent / paid.length, 2)
      : 0;

    const largest = paid.slice().sort(function sortLargest(a, b) {
      return b.amount - a.amount;
    })[0] || null;

    return {
      currency: opts.currency || (
        expenses[0] ? expenses[0].currency : DEFAULT_CURRENCY
      ),
      count: expenses.length,
      paidCount: paid.length,
      pendingCount: pending.length,
      refundedCount: refunded.length,
      cancelledCount: cancelled.length,
      spent: spent,
      committed: committed,
      pendingTotal: round(committed - spent, 2),
      refundTotal: refundTotal,
      averageExpense: average,
      largestExpense: clone(largest),
      lastExpense: clone(expenses[0] || null)
    };
  }

  function groupByCategory(options) {
    const expenses = list({
      ...(options || {}),
      includeDeleted: false
    });

    const groups = {};

    expenses.forEach(function collect(expense) {
      const key = expense.category || DEFAULT_CATEGORY;

      if (!groups[key]) {
        groups[key] = {
          category: key,
          count: 0,
          spent: 0,
          committed: 0,
          refunded: 0,
          expenses: []
        };
      }

      groups[key].count += 1;
      groups[key].expenses.push(expense);

      if (expense.status === EXPENSE_STATUS.PAID) {
        groups[key].spent += calculateEffectiveAmount(expense);
      }

      if ([
        EXPENSE_STATUS.PAID,
        EXPENSE_STATUS.PENDING,
        EXPENSE_STATUS.PLANNED
      ].includes(expense.status)) {
        groups[key].committed += calculateEffectiveAmount(expense);
      }

      groups[key].refunded += toNonNegative(
        expense.refund && expense.refund.amount,
        expense.status === EXPENSE_STATUS.REFUNDED ? expense.amount : 0
      );
    });

    const totalSpent = Object.values(groups).reduce(function total(sum, group) {
      return sum + group.spent;
    }, 0);

    return Object.values(groups)
      .map(function finalize(group) {
        return {
          ...group,
          spent: round(group.spent, 2),
          committed: round(group.committed, 2),
          refunded: round(group.refunded, 2),
          sharePercent: totalSpent > 0
            ? round((group.spent / totalSpent) * 100, 1)
            : 0
        };
      })
      .sort(function sortGroups(a, b) {
        return b.spent - a.spent;
      });
  }

  function groupByTrip(options) {
    const opts = isObject(options) ? options : {};
    const state = readState(opts.store);
    const trips = getTripsFromState(state);
    const expenses = list({
      ...opts,
      state: state,
      includeDeleted: false
    });

    const groups = {};

    expenses.forEach(function collect(expense) {
      const key = expense.tripId || "unassigned";

      if (!groups[key]) {
        const trip = findTrip(state, expense.tripId);

        groups[key] = {
          tripId: expense.tripId || "",
          tripTitle: normalizeString(firstDefined(
            trip && trip.title,
            trip && trip.name,
            trip && trip.tripName,
            expense.tripId ? "رحلة" : "غير مرتبط برحلة"
          ), ""),
          count: 0,
          spent: 0,
          committed: 0,
          expenses: []
        };
      }

      groups[key].count += 1;
      groups[key].expenses.push(expense);

      if (expense.status === EXPENSE_STATUS.PAID) {
        groups[key].spent += calculateEffectiveAmount(expense);
      }

      if ([
        EXPENSE_STATUS.PAID,
        EXPENSE_STATUS.PENDING,
        EXPENSE_STATUS.PLANNED
      ].includes(expense.status)) {
        groups[key].committed += calculateEffectiveAmount(expense);
      }
    });

    trips.forEach(function ensureTrip(trip) {
      const tripId = String(firstDefined(trip.id, trip._id, trip.uuid, ""));

      if (tripId && !groups[tripId] && opts.includeEmptyTrips === true) {
        groups[tripId] = {
          tripId: tripId,
          tripTitle: normalizeString(firstDefined(
            trip.title,
            trip.name,
            trip.tripName,
            "رحلة"
          ), "رحلة"),
          count: 0,
          spent: 0,
          committed: 0,
          expenses: []
        };
      }
    });

    return Object.values(groups)
      .map(function finalize(group) {
        return {
          ...group,
          spent: round(group.spent, 2),
          committed: round(group.committed, 2)
        };
      })
      .sort(function sortGroups(a, b) {
        return b.spent - a.spent;
      });
  }

  function getTimeline(options) {
    const opts = isObject(options) ? options : {};
    const state = readState(opts.store);

    const expenses = list({
      ...opts,
      state: state,
      includeDeleted: false
    }).map(function toExpenseTimeline(expense) {
      return {
        id: "expense_" + expense.id,
        sourceId: expense.id,
        sourceType: TRANSACTION_TYPE.EXPENSE,
        tripId: expense.tripId,
        title: expense.title,
        category: expense.category,
        amount: expense.amount,
        effectiveAmount: calculateEffectiveAmount(expense),
        direction: "debit",
        currency: expense.currency,
        date: expense.date,
        status: expense.status,
        merchant: expense.merchant,
        notes: expense.notes
      };
    });

    const transactions = getTransactionsFromState(state).map(function normalizeTransaction(
      transaction,
      index
    ) {
      return {
        id: normalizeString(
          firstDefined(transaction.id, transaction.key),
          "transaction_" + index
        ),
        sourceId: normalizeString(firstDefined(
          transaction.expenseId,
          transaction.sourceId,
          ""
        ), ""),
        sourceType: normalizeString(firstDefined(
          transaction.type,
          TRANSACTION_TYPE.ADJUSTMENT
        ), TRANSACTION_TYPE.ADJUSTMENT),
        tripId: normalizeString(firstDefined(
          transaction.tripId,
          ""
        ), ""),
        title: normalizeString(firstDefined(
          transaction.title,
          transaction.description,
          "عملية مالية"
        ), "عملية مالية"),
        category: normalizeCategory(transaction.category),
        amount: round(toNonNegative(transaction.amount, 0), 2),
        effectiveAmount: round(toNonNegative(transaction.amount, 0), 2),
        direction: normalizeString(
          transaction.direction,
          transaction.type === TRANSACTION_TYPE.REFUND ? "credit" : "debit"
        ),
        currency: normalizeCurrency(firstDefined(
          transaction.currency,
          resolveDefaultCurrency(state)
        )),
        date: toIso(firstDefined(
          transaction.date,
          transaction.createdAt
        ), true),
        status: normalizeString(transaction.status, ""),
        merchant: normalizeString(transaction.merchant, ""),
        notes: normalizeString(transaction.notes, "")
      };
    });

    const includeTransactions = opts.transactions === true;
    const timeline = includeTransactions
      ? expenses.concat(transactions)
      : expenses;

    timeline.sort(function sortTimeline(a, b) {
      return (safeDate(b.date)?.getTime() || 0) -
        (safeDate(a.date)?.getTime() || 0);
    });

    if (Number.isInteger(opts.limit) && opts.limit >= 0) {
      return clone(timeline.slice(0, opts.limit));
    }

    return clone(timeline);
  }

  function calculateDailyAverage(options) {
    const opts = isObject(options) ? options : {};
    const expenses = list({
      ...opts,
      status: EXPENSE_STATUS.PAID,
      includeDeleted: false
    });

    if (!expenses.length) {
      return {
        days: 0,
        total: 0,
        dailyAverage: 0
      };
    }

    const dates = expenses
      .map(function getDate(expense) {
        return safeDate(expense.date);
      })
      .filter(Boolean)
      .sort(function sortDates(a, b) {
        return a.getTime() - b.getTime();
      });

    if (!dates.length) {
      return {
        days: 0,
        total: 0,
        dailyAverage: 0
      };
    }

    const firstDate = new Date(dates[0]);
    const lastDate = new Date(dates[dates.length - 1]);

    firstDate.setHours(0, 0, 0, 0);
    lastDate.setHours(0, 0, 0, 0);

    const days = Math.max(
      1,
      Math.round((lastDate.getTime() - firstDate.getTime()) / 86400000) + 1
    );

    const total = round(expenses.reduce(function sumExpenses(sum, expense) {
      return sum + calculateEffectiveAmount(expense);
    }, 0), 2);

    return {
      days: days,
      total: total,
      dailyAverage: round(total / days, 2),
      from: firstDate.toISOString(),
      to: lastDate.toISOString()
    };
  }

  function exportData(options) {
    const opts = isObject(options) ? options : {};
    const state = readState(opts.store);

    return {
      exportedAt: new Date().toISOString(),
      engine: ENGINE_NAME,
      version: VERSION,
      expenses: list({
        state: state,
        includeDeleted: opts.includeDeleted === true
      }),
      transactions: clone(getTransactionsFromState(state)),
      summary: summary({
        state: state
      }),
      categories: groupByCategory({
        state: state
      }),
      trips: groupByTrip({
        state: state,
        includeEmptyTrips: true
      })
    };
  }

  function subscribe(listener, store) {
    if (typeof listener !== "function") {
      throw new TypeError("[" + ENGINE_NAME + "] subscribe requires a function.");
    }

    const source = resolveStore(store);

    if (!source || typeof source.subscribe !== "function") {
      return function unsubscribeNoop() {};
    }

    return source.subscribe(function handleChange(state) {
      listener({
        expenses: list({ state: state }),
        summary: summary({ state: state }),
        categories: groupByCategory({ state: state }),
        timeline: getTimeline({ state: state, limit: 10 })
      });
    });
  }

  function createExpenseDraft(defaults, options) {
    const state = readState(options && options.store);

    return normalizeExpenseInput({
      title: "",
      amount: 0,
      currency: resolveDefaultCurrency(state),
      category: DEFAULT_CATEGORY,
      status: EXPENSE_STATUS.PLANNED,
      date: new Date().toISOString(),
      ...(isObject(defaults) ? defaults : {})
    }, {
      state: state
    });
  }

  const API = Object.freeze({
    name: ENGINE_NAME,
    version: VERSION,

    constants: Object.freeze({
      EVENTS: EVENTS,
      EXPENSE_STATUS: EXPENSE_STATUS,
      TRANSACTION_TYPE: TRANSACTION_TYPE,
      RECURRENCE: RECURRENCE,
      DEFAULT_CATEGORY: DEFAULT_CATEGORY,
      DEFAULT_CURRENCY: DEFAULT_CURRENCY
    }),

    utils: Object.freeze({
      asArray: asArray,
      clone: clone,
      toNumber: toNumber,
      toNonNegative: toNonNegative,
      round: round,
      safeDate: safeDate,
      normalizeCurrency: normalizeCurrency,
      normalizeCategory: normalizeCategory,
      normalizeStatus: normalizeStatus,
      createId: createId
    }),

    readState: readState,
    list: list,
    getById: getById,

    createExpenseDraft: createExpenseDraft,
    normalizeExpenseInput: normalizeExpenseInput,
    validateExpense: validateExpense,

    create: create,
    update: update,
    remove: remove,
    restore: restore,
    duplicate: duplicate,

    markPaid: markPaid,
    markPending: markPending,
    cancel: cancel,
    refund: refund,

    summary: summary,
    groupByCategory: groupByCategory,
    groupByTrip: groupByTrip,
    getTimeline: getTimeline,
    calculateDailyAverage: calculateDailyAverage,
    calculateEffectiveAmount: calculateEffectiveAmount,

    exportData: exportData,
    subscribe: subscribe
  });

  Object.defineProperty(global, ENGINE_NAME, {
    value: API,
    writable: false,
    enumerable: true,
    configurable: true
  });

  dispatch(EVENTS.READY, {
    name: ENGINE_NAME,
    version: VERSION
  });

  console.info("[" + ENGINE_NAME + "] V" + VERSION + " ready.");
})(window);
