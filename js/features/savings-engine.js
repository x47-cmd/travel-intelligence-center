/* =========================================================
   Travel Intelligence Center
   Budget Intelligence Platform
   Savings Engine V1.0.0

   File Path:
   js/features/savings-engine.js

   Purpose:
   - Production-ready savings management engine.
   - Manages monthly saving plans, deposits, withdrawals,
     targets, trip funding and savings forecasts.
   - Calculates coverage, readiness, target dates and gaps.
   - Synchronizes through the central Store.
   - Does not render UI directly.

   Dependencies:
   - window.TICBudgetEngine
   - window.TICExpenseEngine
   - window.TICStore / window.Store

   Global:
   - window.TICSavingsEngine
   ========================================================= */

(function savingsEngineFactory(global) {
  "use strict";

  const VERSION = "1.0.0";
  const ENGINE_NAME = "TICSavingsEngine";

  const EVENTS = Object.freeze({
    READY: "tic:savings-engine-ready",
    PLAN_UPDATED: "tic:savings-plan-updated",
    DEPOSIT_ADDED: "tic:savings-deposit-added",
    WITHDRAWAL_ADDED: "tic:savings-withdrawal-added",
    ENTRY_UPDATED: "tic:savings-entry-updated",
    ENTRY_DELETED: "tic:savings-entry-deleted",
    TARGET_CREATED: "tic:savings-target-created",
    TARGET_UPDATED: "tic:savings-target-updated",
    TARGET_DELETED: "tic:savings-target-deleted",
    CHANGED: "tic:savings-changed",
    ERROR: "tic:savings-error"
  });

  const ENTRY_TYPE = Object.freeze({
    DEPOSIT: "deposit",
    WITHDRAWAL: "withdrawal",
    ADJUSTMENT: "adjustment"
  });

  const TARGET_STATUS = Object.freeze({
    ACTIVE: "active",
    COMPLETED: "completed",
    PAUSED: "paused",
    CANCELLED: "cancelled"
  });

  const TARGET_TYPE = Object.freeze({
    ANNUAL_BUDGET: "annual-budget",
    TRIP: "trip",
    EMERGENCY: "emergency",
    CUSTOM: "custom"
  });

  const DEFAULT_CURRENCY = "AED";
  const DEFAULT_MONTHLY_SAVING = 1500;
  const DEFAULT_ANNUAL_BUDGET = 30000;
  const MAX_TITLE_LENGTH = 140;
  const MAX_NOTE_LENGTH = 1000;

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
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (fallback ?? 0);
  }

  function toNonNegative(value, fallback) {
    return Math.max(0, toNumber(value, fallback));
  }

  function round(value, decimals) {
    const precision = Number.isInteger(decimals) ? decimals : 2;
    const factor = Math.pow(10, precision);
    return Math.round((toNumber(value, 0) + Number.EPSILON) * factor) / factor;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, toNumber(value, min)));
  }

  function percentage(part, total, decimals) {
    if (toNumber(total, 0) <= 0) return 0;
    return round((toNumber(part, 0) / toNumber(total, 0)) * 100, decimals ?? 1);
  }

  function normalizeString(value, fallback, maxLength) {
    const text = String(value ?? fallback ?? "").trim();
    return typeof maxLength === "number" ? text.slice(0, maxLength) : text;
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

  function monthsBetween(from, to) {
    const start = startOfMonth(from);
    const end = startOfMonth(to);

    return Math.max(
      0,
      ((end.getFullYear() - start.getFullYear()) * 12) +
      (end.getMonth() - start.getMonth())
    );
  }

  function addMonths(value, months) {
    const date = safeDate(value) || new Date();
    date.setMonth(date.getMonth() + Math.max(0, Math.round(toNumber(months, 0))));
    return date;
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

    return normalizeString(value || DEFAULT_CURRENCY, DEFAULT_CURRENCY).toUpperCase();
  }

  function normalizeEntryType(value, fallback) {
    const raw = normalizeString(value, fallback || ENTRY_TYPE.DEPOSIT).toLowerCase();

    const aliases = {
      saving: ENTRY_TYPE.DEPOSIT,
      saved: ENTRY_TYPE.DEPOSIT,
      credit: ENTRY_TYPE.DEPOSIT,
      income: ENTRY_TYPE.DEPOSIT,
      سحب: ENTRY_TYPE.WITHDRAWAL,
      debit: ENTRY_TYPE.WITHDRAWAL,
      expense: ENTRY_TYPE.WITHDRAWAL,
      withdraw: ENTRY_TYPE.WITHDRAWAL,
      correction: ENTRY_TYPE.ADJUSTMENT
    };

    const normalized = aliases[raw] || raw;

    return Object.values(ENTRY_TYPE).includes(normalized)
      ? normalized
      : (fallback || ENTRY_TYPE.DEPOSIT);
  }

  function normalizeTargetStatus(value, fallback) {
    const raw = normalizeString(value, fallback || TARGET_STATUS.ACTIVE).toLowerCase();

    const aliases = {
      done: TARGET_STATUS.COMPLETED,
      complete: TARGET_STATUS.COMPLETED,
      finished: TARGET_STATUS.COMPLETED,
      stopped: TARGET_STATUS.PAUSED,
      canceled: TARGET_STATUS.CANCELLED
    };

    const normalized = aliases[raw] || raw;

    return Object.values(TARGET_STATUS).includes(normalized)
      ? normalized
      : (fallback || TARGET_STATUS.ACTIVE);
  }

  function normalizeTargetType(value) {
    const raw = normalizeString(value, TARGET_TYPE.CUSTOM).toLowerCase();

    const aliases = {
      annual: TARGET_TYPE.ANNUAL_BUDGET,
      budget: TARGET_TYPE.ANNUAL_BUDGET,
      tripbudget: TARGET_TYPE.TRIP,
      travel: TARGET_TYPE.TRIP,
      reserve: TARGET_TYPE.EMERGENCY
    };

    const normalized = aliases[raw] || raw;

    return Object.values(TARGET_TYPE).includes(normalized)
      ? normalized
      : TARGET_TYPE.CUSTOM;
  }

  function createId(prefix) {
    const safePrefix = normalizeString(prefix, "saving")
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
        "تعذر قراءة بيانات الادخار من المخزن.",
        "Unable to read savings data from the Store.",
        { cause: error.message }
      );
    }

    return {};
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
        "المخزن الحالي لا يدعم تحديث بيانات الادخار.",
        "The current Store does not support savings updates."
      );
    } catch (error) {
      if (error && error.code) throw error;

      fail(
        "STORE_WRITE_FAILED",
        "تعذر حفظ بيانات الادخار.",
        "Unable to save savings data.",
        { cause: error.message }
      );
    }

    return false;
  }

  function getProfile(state) {
    return isObject(state && state.profile) ? state.profile : {};
  }

  function getSettings(state) {
    return isObject(state && state.settings) ? state.settings : {};
  }

  function getBudgetRoot(state) {
    if (isObject(state && state.budget)) return state.budget;
    if (isObject(state && state.budgets) && !Array.isArray(state.budgets)) return state.budgets;
    return {};
  }

  function getSavingsRoot(state) {
    const candidate = firstDefined(
      state && state.savings,
      state && state.finance && state.finance.savings,
      state && state.travelFinance && state.travelFinance.savings
    );

    if (Array.isArray(candidate)) {
      return {
        entries: candidate
      };
    }

    return isObject(candidate) ? candidate : {};
  }

  function getEntriesFromState(state) {
    const root = getSavingsRoot(state);

    return asArray(firstDefined(
      root.entries,
      root.transactions,
      root.history,
      Array.isArray(state && state.savings) ? state.savings : []
    ));
  }

  function getTargetsFromState(state) {
    const root = getSavingsRoot(state);

    return asArray(firstDefined(
      root.targets,
      root.goals,
      state && state.savingsTargets,
      []
    ));
  }

  function getTripsFromState(state) {
    return asArray(firstDefined(
      state && state.trips,
      state && state.travel && state.travel.trips,
      []
    ));
  }

  function resolveCurrency(state) {
    const profile = getProfile(state);
    const settings = getSettings(state);
    const savings = getSavingsRoot(state);
    const budget = getBudgetRoot(state);

    return normalizeCurrency(firstDefined(
      savings.currency,
      budget.currency,
      settings.currency,
      profile.currency,
      state && state.currency,
      DEFAULT_CURRENCY
    ));
  }

  function resolveMonthlySaving(state) {
    const profile = getProfile(state);
    const settings = getSettings(state);
    const savings = getSavingsRoot(state);
    const budget = getBudgetRoot(state);

    return toNonNegative(firstDefined(
      savings.monthlySaving,
      savings.monthlyAmount,
      budget.monthlySaving,
      settings.monthlySaving,
      profile.monthlySaving,
      state && state.monthlySaving,
      DEFAULT_MONTHLY_SAVING
    ), DEFAULT_MONTHLY_SAVING);
  }

  function resolveAnnualBudget(state) {
    const profile = getProfile(state);
    const settings = getSettings(state);
    const budget = getBudgetRoot(state);

    return toNonNegative(firstDefined(
      budget.annualBudget,
      budget.annualTravelBudget,
      settings.annualTravelBudget,
      profile.annualTravelBudget,
      state && state.annualTravelBudget,
      DEFAULT_ANNUAL_BUDGET
    ), DEFAULT_ANNUAL_BUDGET);
  }

  function setSavingsInState(state, payload) {
    const nextState = clone(state || {});
    const root = {
      ...getSavingsRoot(nextState),
      ...clone(payload)
    };

    nextState.savings = root;

    if (isObject(nextState.finance)) {
      nextState.finance.savings = clone(root);
    }

    if (isObject(nextState.travelFinance)) {
      nextState.travelFinance.savings = clone(root);
    }

    return nextState;
  }

  function commit(payload, store) {
    const state = readState(store);
    const nextState = setSavingsInState(state, payload);

    writeState(nextState, store);

    const result = {
      savings: clone(nextState.savings),
      updatedAt: new Date().toISOString()
    };

    dispatch(EVENTS.CHANGED, result);
    return result;
  }

  function normalizeEntryInput(input, options) {
    const data = isObject(input) ? input : {};
    const opts = isObject(options) ? options : {};
    const state = opts.state || readState(opts.store);
    const now = new Date().toISOString();

    const type = normalizeEntryType(firstDefined(
      data.type,
      data.transactionType,
      data.direction
    ), ENTRY_TYPE.DEPOSIT);

    const amount = round(toNonNegative(firstDefined(
      data.amount,
      data.value,
      data.total
    ), 0), 2);

    return {
      id: normalizeString(firstDefined(
        data.id,
        data._id,
        data.uuid
      ), opts.generateId === false ? "" : createId("saving_entry")),
      type: type,
      amount: amount,
      signedAmount: type === ENTRY_TYPE.WITHDRAWAL
        ? -amount
        : amount,
      currency: normalizeCurrency(firstDefined(
        data.currency,
        resolveCurrency(state)
      )),
      date: toIso(firstDefined(
        data.date,
        data.createdAt,
        data.savedAt,
        data.transactionDate
      ), true),
      title: normalizeString(firstDefined(
        data.title,
        data.name,
        type === ENTRY_TYPE.WITHDRAWAL ? "سحب من الادخار" : "إيداع ادخار"
      ), "", MAX_TITLE_LENGTH),
      notes: normalizeString(firstDefined(
        data.notes,
        data.note,
        ""
      ), "", MAX_NOTE_LENGTH),
      tripId: normalizeString(firstDefined(
        data.tripId,
        data.trip_id,
        data.trip && data.trip.id,
        ""
      ), ""),
      targetId: normalizeString(firstDefined(
        data.targetId,
        data.goalId,
        ""
      ), ""),
      paymentMethod: normalizeString(firstDefined(
        data.paymentMethod,
        data.method,
        ""
      ), "", 80),
      metadata: isObject(data.metadata) ? clone(data.metadata) : {},
      createdAt: toIso(firstDefined(data.createdAt, now), true),
      updatedAt: now,
      deletedAt: toIso(data.deletedAt, false),
      isDeleted: data.isDeleted === true
    };
  }

  function normalizeTargetInput(input, options) {
    const data = isObject(input) ? input : {};
    const opts = isObject(options) ? options : {};
    const state = opts.state || readState(opts.store);
    const now = new Date().toISOString();

    const amount = round(toNonNegative(firstDefined(
      data.amount,
      data.targetAmount,
      data.goalAmount,
      data.total
    ), 0), 2);

    const savedAmount = round(toNonNegative(firstDefined(
      data.savedAmount,
      data.currentAmount,
      data.progressAmount,
      0
    ), 0), 2);

    const status = normalizeTargetStatus(firstDefined(
      data.status,
      TARGET_STATUS.ACTIVE
    ));

    return {
      id: normalizeString(firstDefined(
        data.id,
        data._id,
        data.uuid
      ), opts.generateId === false ? "" : createId("saving_target")),
      type: normalizeTargetType(firstDefined(
        data.type,
        data.targetType,
        TARGET_TYPE.CUSTOM
      )),
      title: normalizeString(firstDefined(
        data.title,
        data.name,
        "هدف ادخار"
      ), "هدف ادخار", MAX_TITLE_LENGTH),
      amount: amount,
      savedAmount: savedAmount,
      remainingAmount: round(Math.max(0, amount - savedAmount), 2),
      currency: normalizeCurrency(firstDefined(
        data.currency,
        resolveCurrency(state)
      )),
      monthlyContribution: round(toNonNegative(firstDefined(
        data.monthlyContribution,
        data.monthlySaving,
        resolveMonthlySaving(state)
      ), resolveMonthlySaving(state)), 2),
      startDate: toIso(firstDefined(
        data.startDate,
        data.createdAt,
        now
      ), true),
      targetDate: toIso(firstDefined(
        data.targetDate,
        data.deadline,
        data.endDate
      ), false),
      tripId: normalizeString(firstDefined(
        data.tripId,
        data.trip_id,
        data.trip && data.trip.id,
        ""
      ), ""),
      priority: clamp(Math.round(toNumber(firstDefined(
        data.priority,
        3
      ), 3)), 1, 5),
      status: status,
      notes: normalizeString(firstDefined(
        data.notes,
        data.note,
        ""
      ), "", MAX_NOTE_LENGTH),
      metadata: isObject(data.metadata) ? clone(data.metadata) : {},
      createdAt: toIso(firstDefined(data.createdAt, now), true),
      updatedAt: now,
      completedAt: status === TARGET_STATUS.COMPLETED
        ? toIso(firstDefined(data.completedAt, now), true)
        : toIso(data.completedAt, false),
      deletedAt: toIso(data.deletedAt, false),
      isDeleted: data.isDeleted === true
    };
  }

  function validateEntry(input, options) {
    const entry = normalizeEntryInput(input, {
      ...(options || {}),
      generateId: false
    });

    const issues = [];

    if (entry.amount <= 0) {
      issues.push({
        field: "amount",
        code: "AMOUNT_INVALID",
        messageAr: "قيمة حركة الادخار يجب أن تكون أكبر من صفر.",
        messageEn: "Savings entry amount must be greater than zero."
      });
    }

    if (!Object.values(ENTRY_TYPE).includes(entry.type)) {
      issues.push({
        field: "type",
        code: "TYPE_INVALID",
        messageAr: "نوع حركة الادخار غير صحيح.",
        messageEn: "Savings entry type is invalid."
      });
    }

    if (!entry.currency) {
      issues.push({
        field: "currency",
        code: "CURRENCY_REQUIRED",
        messageAr: "عملة حركة الادخار مطلوبة.",
        messageEn: "Savings entry currency is required."
      });
    }

    return {
      valid: issues.length === 0,
      issues: issues,
      entry: entry
    };
  }

  function validateTarget(input, options) {
    const target = normalizeTargetInput(input, {
      ...(options || {}),
      generateId: false
    });

    const issues = [];

    if (!target.title) {
      issues.push({
        field: "title",
        code: "TITLE_REQUIRED",
        messageAr: "اسم هدف الادخار مطلوب.",
        messageEn: "Savings target title is required."
      });
    }

    if (target.amount <= 0) {
      issues.push({
        field: "amount",
        code: "AMOUNT_INVALID",
        messageAr: "قيمة هدف الادخار يجب أن تكون أكبر من صفر.",
        messageEn: "Savings target amount must be greater than zero."
      });
    }

    if (target.savedAmount > target.amount) {
      issues.push({
        field: "savedAmount",
        code: "SAVED_EXCEEDS_TARGET",
        messageAr: "المبلغ المدخر أكبر من قيمة الهدف.",
        messageEn: "Saved amount exceeds the target amount."
      });
    }

    const startDate = safeDate(target.startDate);
    const targetDate = safeDate(target.targetDate);

    if (startDate && targetDate && targetDate < startDate) {
      issues.push({
        field: "targetDate",
        code: "TARGET_DATE_INVALID",
        messageAr: "تاريخ الوصول للهدف يسبق تاريخ بداية الادخار.",
        messageEn: "Target date cannot be before the start date."
      });
    }

    return {
      valid: issues.length === 0,
      issues: issues,
      target: target
    };
  }

  function assertValidEntry(input, options) {
    const result = validateEntry(input, options);

    if (!result.valid) {
      fail(
        "SAVINGS_ENTRY_VALIDATION_FAILED",
        "بيانات حركة الادخار غير صحيحة.",
        "Savings entry data is invalid.",
        result.issues
      );
    }

    return result.entry;
  }

  function assertValidTarget(input, options) {
    const result = validateTarget(input, options);

    if (!result.valid) {
      fail(
        "SAVINGS_TARGET_VALIDATION_FAILED",
        "بيانات هدف الادخار غير صحيحة.",
        "Savings target data is invalid.",
        result.issues
      );
    }

    return result.target;
  }

  function listEntries(options) {
    const opts = isObject(options) ? options : {};
    const state = opts.state || readState(opts.store);

    let entries = getEntriesFromState(state).map(function mapEntry(entry) {
      return normalizeEntryInput(entry, {
        state: state,
        generateId: false
      });
    });

    if (opts.includeDeleted !== true) {
      entries = entries.filter(function activeEntry(entry) {
        return !entry.isDeleted;
      });
    }

    if (opts.type) {
      const type = normalizeEntryType(opts.type, opts.type);
      entries = entries.filter(function byType(entry) {
        return entry.type === type;
      });
    }

    if (opts.tripId !== undefined) {
      entries = entries.filter(function byTrip(entry) {
        return entry.tripId === String(opts.tripId);
      });
    }

    if (opts.targetId !== undefined) {
      entries = entries.filter(function byTarget(entry) {
        return entry.targetId === String(opts.targetId);
      });
    }

    if (opts.from) {
      const from = safeDate(opts.from);

      if (from) {
        entries = entries.filter(function fromFilter(entry) {
          const date = safeDate(entry.date);
          return date && date >= from;
        });
      }
    }

    if (opts.to) {
      const to = safeDate(opts.to);

      if (to) {
        to.setHours(23, 59, 59, 999);

        entries = entries.filter(function toFilter(entry) {
          const date = safeDate(entry.date);
          return date && date <= to;
        });
      }
    }

    entries.sort(function sortEntries(a, b) {
      return (safeDate(b.date)?.getTime() || 0) -
        (safeDate(a.date)?.getTime() || 0);
    });

    if (Number.isInteger(opts.limit) && opts.limit >= 0) {
      entries = entries.slice(0, opts.limit);
    }

    return clone(entries);
  }

  function listTargets(options) {
    const opts = isObject(options) ? options : {};
    const state = opts.state || readState(opts.store);

    let targets = getTargetsFromState(state).map(function mapTarget(target) {
      return normalizeTargetInput(target, {
        state: state,
        generateId: false
      });
    });

    if (opts.includeDeleted !== true) {
      targets = targets.filter(function activeTarget(target) {
        return !target.isDeleted;
      });
    }

    if (opts.status) {
      const status = normalizeTargetStatus(opts.status, opts.status);
      targets = targets.filter(function byStatus(target) {
        return target.status === status;
      });
    }

    if (opts.type) {
      const type = normalizeTargetType(opts.type);
      targets = targets.filter(function byType(target) {
        return target.type === type;
      });
    }

    if (opts.tripId !== undefined) {
      targets = targets.filter(function byTrip(target) {
        return target.tripId === String(opts.tripId);
      });
    }

    targets.sort(function sortTargets(a, b) {
      if (a.priority !== b.priority) return b.priority - a.priority;

      const aDate = safeDate(a.targetDate);
      const bDate = safeDate(b.targetDate);

      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;

      return aDate.getTime() - bDate.getTime();
    });

    return clone(targets);
  }

  function getEntryById(id, options) {
    const targetId = normalizeString(id, "");

    return listEntries({
      ...(options || {}),
      includeDeleted: true
    }).find(function findEntry(entry) {
      return entry.id === targetId;
    }) || null;
  }

  function getTargetById(id, options) {
    const targetId = normalizeString(id, "");

    return listTargets({
      ...(options || {}),
      includeDeleted: true
    }).find(function findTarget(target) {
      return target.id === targetId;
    }) || null;
  }

  function getBalance(options) {
    const opts = isObject(options) ? options : {};
    const entries = listEntries({
      ...opts,
      includeDeleted: false
    });

    return round(entries.reduce(function calculate(sum, entry) {
      if (entry.type === ENTRY_TYPE.WITHDRAWAL) {
        return sum - entry.amount;
      }

      return sum + entry.amount;
    }, 0), 2);
  }

  function addEntry(input, options) {
    const opts = isObject(options) ? options : {};
    const state = readState(opts.store);
    const entry = assertValidEntry(input, {
      state: state,
      store: opts.store
    });

    const entries = getEntriesFromState(state).map(function mapEntry(item) {
      return normalizeEntryInput(item, {
        state: state,
        generateId: false
      });
    });

    if (entries.some(function duplicate(item) {
      return item.id === entry.id;
    })) {
      fail(
        "SAVINGS_ENTRY_ID_EXISTS",
        "يوجد سجل ادخار آخر بالمعرف نفسه.",
        "Another savings entry already uses this ID.",
        { id: entry.id }
      );
    }

    entries.unshift(entry);

    const savingsRoot = getSavingsRoot(state);
    const payload = {
      ...savingsRoot,
      entries: entries,
      balance: round(getBalance({
        state: setSavingsInState(state, {
          ...savingsRoot,
          entries: entries
        })
      }), 2),
      updatedAt: new Date().toISOString()
    };

    commit(payload, opts.store);

    dispatch(
      entry.type === ENTRY_TYPE.WITHDRAWAL
        ? EVENTS.WITHDRAWAL_ADDED
        : EVENTS.DEPOSIT_ADDED,
      { entry: entry }
    );

    return clone(entry);
  }

  function addDeposit(input, options) {
    return addEntry({
      ...(isObject(input) ? input : {}),
      type: ENTRY_TYPE.DEPOSIT
    }, options);
  }

  function addWithdrawal(input, options) {
    const opts = isObject(options) ? options : {};
    const data = isObject(input) ? input : {};
    const currentBalance = getBalance(opts);
    const amount = toNonNegative(data.amount, 0);

    if (amount > currentBalance && opts.allowNegative !== true) {
      fail(
        "INSUFFICIENT_SAVINGS",
        "قيمة السحب أكبر من رصيد الادخار الحالي.",
        "Withdrawal amount exceeds the current savings balance.",
        {
          balance: currentBalance,
          amount: amount
        }
      );
    }

    return addEntry({
      ...data,
      type: ENTRY_TYPE.WITHDRAWAL
    }, opts);
  }

  function updateEntry(id, patch, options) {
    const opts = isObject(options) ? options : {};
    const state = readState(opts.store);

    const entries = getEntriesFromState(state).map(function mapEntry(item) {
      return normalizeEntryInput(item, {
        state: state,
        generateId: false
      });
    });

    const targetId = normalizeString(id, "");
    const index = entries.findIndex(function findEntry(entry) {
      return entry.id === targetId;
    });

    if (index < 0) {
      fail(
        "SAVINGS_ENTRY_NOT_FOUND",
        "سجل الادخار المطلوب غير موجود.",
        "The requested savings entry was not found.",
        { id: targetId }
      );
    }

    const previous = entries[index];
    const updated = assertValidEntry({
      ...previous,
      ...(isObject(patch) ? patch : {}),
      id: previous.id,
      createdAt: previous.createdAt,
      updatedAt: new Date().toISOString()
    }, {
      state: state,
      store: opts.store
    });

    entries[index] = updated;

    const savingsRoot = getSavingsRoot(state);
    const virtualState = setSavingsInState(state, {
      ...savingsRoot,
      entries: entries
    });

    const payload = {
      ...savingsRoot,
      entries: entries,
      balance: getBalance({
        state: virtualState
      }),
      updatedAt: new Date().toISOString()
    };

    commit(payload, opts.store);

    dispatch(EVENTS.ENTRY_UPDATED, {
      previous: previous,
      entry: updated
    });

    return clone(updated);
  }

  function deleteEntry(id, options) {
    const opts = isObject(options) ? options : {};
    const hardDelete = opts.hard === true;
    const state = readState(opts.store);

    const entries = getEntriesFromState(state).map(function mapEntry(item) {
      return normalizeEntryInput(item, {
        state: state,
        generateId: false
      });
    });

    const targetId = normalizeString(id, "");
    const index = entries.findIndex(function findEntry(entry) {
      return entry.id === targetId;
    });

    if (index < 0) {
      fail(
        "SAVINGS_ENTRY_NOT_FOUND",
        "سجل الادخار المطلوب غير موجود.",
        "The requested savings entry was not found.",
        { id: targetId }
      );
    }

    const entry = entries[index];
    let nextEntries;

    if (hardDelete) {
      nextEntries = entries.filter(function keep(item) {
        return item.id !== targetId;
      });
    } else {
      entry.isDeleted = true;
      entry.deletedAt = new Date().toISOString();
      entry.updatedAt = new Date().toISOString();
      nextEntries = entries.slice();
      nextEntries[index] = entry;
    }

    const savingsRoot = getSavingsRoot(state);
    const virtualState = setSavingsInState(state, {
      ...savingsRoot,
      entries: nextEntries
    });

    commit({
      ...savingsRoot,
      entries: nextEntries,
      balance: getBalance({
        state: virtualState
      }),
      updatedAt: new Date().toISOString()
    }, opts.store);

    dispatch(EVENTS.ENTRY_DELETED, {
      entry: entry,
      hard: hardDelete
    });

    return clone(entry);
  }

  function createTarget(input, options) {
    const opts = isObject(options) ? options : {};
    const state = readState(opts.store);
    const target = assertValidTarget(input, {
      state: state,
      store: opts.store
    });

    const targets = getTargetsFromState(state).map(function mapTarget(item) {
      return normalizeTargetInput(item, {
        state: state,
        generateId: false
      });
    });

    if (targets.some(function duplicate(item) {
      return item.id === target.id;
    })) {
      fail(
        "SAVINGS_TARGET_ID_EXISTS",
        "يوجد هدف ادخار آخر بالمعرف نفسه.",
        "Another savings target already uses this ID.",
        { id: target.id }
      );
    }

    targets.unshift(target);

    const savingsRoot = getSavingsRoot(state);

    commit({
      ...savingsRoot,
      targets: targets,
      updatedAt: new Date().toISOString()
    }, opts.store);

    dispatch(EVENTS.TARGET_CREATED, {
      target: target
    });

    return clone(target);
  }

  function updateTarget(id, patch, options) {
    const opts = isObject(options) ? options : {};
    const state = readState(opts.store);

    const targets = getTargetsFromState(state).map(function mapTarget(item) {
      return normalizeTargetInput(item, {
        state: state,
        generateId: false
      });
    });

    const targetId = normalizeString(id, "");
    const index = targets.findIndex(function findTarget(target) {
      return target.id === targetId;
    });

    if (index < 0) {
      fail(
        "SAVINGS_TARGET_NOT_FOUND",
        "هدف الادخار المطلوب غير موجود.",
        "The requested savings target was not found.",
        { id: targetId }
      );
    }

    const previous = targets[index];
    const updated = assertValidTarget({
      ...previous,
      ...(isObject(patch) ? patch : {}),
      id: previous.id,
      createdAt: previous.createdAt,
      updatedAt: new Date().toISOString()
    }, {
      state: state,
      store: opts.store
    });

    if (updated.savedAmount >= updated.amount) {
      updated.status = TARGET_STATUS.COMPLETED;
      updated.savedAmount = updated.amount;
      updated.remainingAmount = 0;
      updated.completedAt = updated.completedAt || new Date().toISOString();
    }

    targets[index] = updated;

    const savingsRoot = getSavingsRoot(state);

    commit({
      ...savingsRoot,
      targets: targets,
      updatedAt: new Date().toISOString()
    }, opts.store);

    dispatch(EVENTS.TARGET_UPDATED, {
      previous: previous,
      target: updated
    });

    return clone(updated);
  }

  function deleteTarget(id, options) {
    const opts = isObject(options) ? options : {};
    const hardDelete = opts.hard === true;
    const state = readState(opts.store);

    const targets = getTargetsFromState(state).map(function mapTarget(item) {
      return normalizeTargetInput(item, {
        state: state,
        generateId: false
      });
    });

    const targetId = normalizeString(id, "");
    const index = targets.findIndex(function findTarget(target) {
      return target.id === targetId;
    });

    if (index < 0) {
      fail(
        "SAVINGS_TARGET_NOT_FOUND",
        "هدف الادخار المطلوب غير موجود.",
        "The requested savings target was not found.",
        { id: targetId }
      );
    }

    const target = targets[index];
    let nextTargets;

    if (hardDelete) {
      nextTargets = targets.filter(function keep(item) {
        return item.id !== targetId;
      });
    } else {
      target.isDeleted = true;
      target.deletedAt = new Date().toISOString();
      target.updatedAt = new Date().toISOString();
      nextTargets = targets.slice();
      nextTargets[index] = target;
    }

    const savingsRoot = getSavingsRoot(state);

    commit({
      ...savingsRoot,
      targets: nextTargets,
      updatedAt: new Date().toISOString()
    }, opts.store);

    dispatch(EVENTS.TARGET_DELETED, {
      target: target,
      hard: hardDelete
    });

    return clone(target);
  }

  function allocateToTarget(targetId, amount, options) {
    const opts = isObject(options) ? options : {};
    const target = getTargetById(targetId, {
      store: opts.store
    });

    if (!target) {
      fail(
        "SAVINGS_TARGET_NOT_FOUND",
        "هدف الادخار المطلوب غير موجود.",
        "The requested savings target was not found.",
        { id: targetId }
      );
    }

    const allocation = round(toNonNegative(amount, 0), 2);

    if (allocation <= 0) {
      fail(
        "ALLOCATION_INVALID",
        "قيمة التخصيص يجب أن تكون أكبر من صفر.",
        "Allocation amount must be greater than zero."
      );
    }

    const remaining = Math.max(0, target.amount - target.savedAmount);
    const applied = Math.min(allocation, remaining);

    const entry = addDeposit({
      amount: applied,
      currency: target.currency,
      targetId: target.id,
      tripId: target.tripId,
      title: "إيداع لهدف: " + target.title,
      notes: opts.notes || ""
    }, opts);

    const updatedTarget = updateTarget(target.id, {
      savedAmount: round(target.savedAmount + applied, 2)
    }, opts);

    return {
      entry: entry,
      target: updatedTarget,
      allocated: applied,
      excess: round(Math.max(0, allocation - applied), 2)
    };
  }

  function updatePlan(plan, options) {
    const opts = isObject(options) ? options : {};
    const state = readState(opts.store);
    const savingsRoot = getSavingsRoot(state);

    const monthlySaving = round(toNonNegative(firstDefined(
      plan && plan.monthlySaving,
      plan && plan.monthlyAmount,
      resolveMonthlySaving(state)
    ), resolveMonthlySaving(state)), 2);

    const annualTarget = round(toNonNegative(firstDefined(
      plan && plan.annualTarget,
      plan && plan.annualSavingTarget,
      monthlySaving * 12
    ), monthlySaving * 12), 2);

    const payload = {
      ...savingsRoot,
      monthlySaving: monthlySaving,
      annualTarget: annualTarget,
      currency: normalizeCurrency(firstDefined(
        plan && plan.currency,
        savingsRoot.currency,
        resolveCurrency(state)
      )),
      autoDepositEnabled: Boolean(firstDefined(
        plan && plan.autoDepositEnabled,
        savingsRoot.autoDepositEnabled,
        false
      )),
      depositDay: clamp(Math.round(toNumber(firstDefined(
        plan && plan.depositDay,
        savingsRoot.depositDay,
        1
      ), 1)), 1, 28),
      updatedAt: new Date().toISOString()
    };

    commit(payload, opts.store);

    dispatch(EVENTS.PLAN_UPDATED, {
      plan: payload
    });

    return clone(payload);
  }

  function getPlan(options) {
    const opts = isObject(options) ? options : {};
    const state = opts.state || readState(opts.store);
    const savingsRoot = getSavingsRoot(state);
    const monthlySaving = resolveMonthlySaving(state);

    return {
      monthlySaving: round(monthlySaving, 2),
      annualTarget: round(toNonNegative(firstDefined(
        savingsRoot.annualTarget,
        savingsRoot.annualSavingTarget,
        monthlySaving * 12
      ), monthlySaving * 12), 2),
      currency: resolveCurrency(state),
      autoDepositEnabled: savingsRoot.autoDepositEnabled === true,
      depositDay: clamp(Math.round(toNumber(
        savingsRoot.depositDay,
        1
      )), 1, 28)
    };
  }

  function getMonthlySummary(options) {
    const opts = isObject(options) ? options : {};
    const referenceDate = safeDate(opts.date) || new Date();
    const from = startOfMonth(referenceDate);
    const to = endOfMonth(referenceDate);

    const entries = listEntries({
      ...opts,
      from: from,
      to: to
    });

    const deposits = entries.filter(function deposit(entry) {
      return entry.type === ENTRY_TYPE.DEPOSIT;
    });

    const withdrawals = entries.filter(function withdrawal(entry) {
      return entry.type === ENTRY_TYPE.WITHDRAWAL;
    });

    const deposited = round(deposits.reduce(function sum(total, entry) {
      return total + entry.amount;
    }, 0), 2);

    const withdrawn = round(withdrawals.reduce(function sum(total, entry) {
      return total + entry.amount;
    }, 0), 2);

    const plan = getPlan({
      ...opts,
      state: opts.state || readState(opts.store)
    });

    return {
      month: from.getMonth() + 1,
      year: from.getFullYear(),
      from: from.toISOString(),
      to: to.toISOString(),
      planned: plan.monthlySaving,
      deposited: deposited,
      withdrawn: withdrawn,
      net: round(deposited - withdrawn, 2),
      completionPercent: plan.monthlySaving > 0
        ? percentage(deposited, plan.monthlySaving, 1)
        : 0,
      remaining: round(Math.max(0, plan.monthlySaving - deposited), 2),
      depositsCount: deposits.length,
      withdrawalsCount: withdrawals.length
    };
  }

  function getAnnualSummary(options) {
    const opts = isObject(options) ? options : {};
    const state = opts.state || readState(opts.store);
    const year = Math.round(toNumber(opts.year, new Date().getFullYear()));

    const from = new Date(year, 0, 1);
    const to = new Date(year, 11, 31, 23, 59, 59, 999);

    const entries = listEntries({
      ...opts,
      state: state,
      from: from,
      to: to
    });

    const deposits = entries.filter(function deposit(entry) {
      return entry.type === ENTRY_TYPE.DEPOSIT;
    });

    const withdrawals = entries.filter(function withdrawal(entry) {
      return entry.type === ENTRY_TYPE.WITHDRAWAL;
    });

    const deposited = round(deposits.reduce(function sum(total, entry) {
      return total + entry.amount;
    }, 0), 2);

    const withdrawn = round(withdrawals.reduce(function sum(total, entry) {
      return total + entry.amount;
    }, 0), 2);

    const plan = getPlan({
      state: state
    });

    const annualBudget = resolveAnnualBudget(state);
    const balance = getBalance({
      state: state
    });

    return {
      year: year,
      currency: resolveCurrency(state),
      planned: plan.annualTarget,
      deposited: deposited,
      withdrawn: withdrawn,
      net: round(deposited - withdrawn, 2),
      balance: balance,
      completionPercent: plan.annualTarget > 0
        ? percentage(deposited, plan.annualTarget, 1)
        : 0,
      annualBudgetCoveragePercent: annualBudget > 0
        ? percentage(plan.annualTarget, annualBudget, 1)
        : 0,
      currentBalanceCoveragePercent: annualBudget > 0
        ? percentage(balance, annualBudget, 1)
        : 0,
      remainingToPlan: round(Math.max(0, plan.annualTarget - deposited), 2),
      annualBudget: round(annualBudget, 2)
    };
  }

  function buildTargetProgress(target, options) {
    const opts = isObject(options) ? options : {};
    const monthlyContribution = toNonNegative(firstDefined(
      opts.monthlyContribution,
      target.monthlyContribution,
      getPlan(opts).monthlySaving
    ), 0);

    const remaining = round(Math.max(0, target.amount - target.savedAmount), 2);
    const monthsNeeded = monthlyContribution > 0
      ? Math.ceil(remaining / monthlyContribution)
      : null;

    const projectedDate = monthsNeeded !== null
      ? addMonths(new Date(), monthsNeeded).toISOString()
      : null;

    const targetDate = safeDate(target.targetDate);
    const monthsAvailable = targetDate
      ? monthsBetween(new Date(), targetDate)
      : null;

    const requiredMonthly = targetDate && monthsAvailable !== null
      ? (
          monthsAvailable <= 0
            ? remaining
            : round(remaining / Math.max(1, monthsAvailable), 2)
        )
      : 0;

    const onTrack = target.status === TARGET_STATUS.COMPLETED ||
      !targetDate ||
      (
        monthlyContribution > 0 &&
        monthlyContribution >= requiredMonthly
      );

    return {
      ...target,
      remainingAmount: remaining,
      progressPercent: target.amount > 0
        ? percentage(target.savedAmount, target.amount, 1)
        : 0,
      monthsNeeded: monthsNeeded,
      projectedDate: projectedDate,
      monthsAvailable: monthsAvailable,
      requiredMonthly: requiredMonthly,
      onTrack: onTrack,
      gapPerMonth: round(Math.max(0, requiredMonthly - monthlyContribution), 2)
    };
  }

  function getTargetProgress(options) {
    const opts = isObject(options) ? options : {};

    return listTargets(opts).map(function mapTarget(target) {
      return buildTargetProgress(target, opts);
    });
  }

  function createTripTarget(tripId, options) {
    const opts = isObject(options) ? options : {};
    const state = readState(opts.store);

    const trip = getTripsFromState(state).find(function findTrip(item) {
      return String(firstDefined(
        item.id,
        item._id,
        item.uuid,
        item.key
      )) === String(tripId);
    });

    if (!trip) {
      fail(
        "TRIP_NOT_FOUND",
        "الرحلة المطلوبة غير موجودة.",
        "The requested trip was not found.",
        { tripId: tripId }
      );
    }

    const amount = toNonNegative(firstDefined(
      trip.budget,
      trip.totalBudget,
      trip.plannedBudget,
      trip.estimatedBudget,
      opts.amount
    ), 0);

    if (amount <= 0) {
      fail(
        "TRIP_BUDGET_MISSING",
        "ميزانية الرحلة غير محددة.",
        "The trip budget is missing.",
        { tripId: tripId }
      );
    }

    const existing = listTargets({
      store: opts.store,
      type: TARGET_TYPE.TRIP,
      tripId: String(tripId)
    })[0];

    if (existing) {
      return existing;
    }

    return createTarget({
      type: TARGET_TYPE.TRIP,
      tripId: String(tripId),
      title: "ادخار " + normalizeString(firstDefined(
        trip.title,
        trip.name,
        trip.tripName,
        "رحلة"
      ), "رحلة"),
      amount: amount,
      savedAmount: 0,
      currency: normalizeCurrency(firstDefined(
        trip.currency,
        resolveCurrency(state)
      )),
      targetDate: firstDefined(
        trip.startDate,
        trip.departureDate,
        trip.dateFrom,
        trip.dates && trip.dates.start
      ),
      monthlyContribution: firstDefined(
        opts.monthlyContribution,
        resolveMonthlySaving(state)
      ),
      priority: firstDefined(opts.priority, 4),
      status: TARGET_STATUS.ACTIVE
    }, opts);
  }

  function buildForecast(options) {
    const opts = isObject(options) ? options : {};
    const state = opts.state || readState(opts.store);
    const plan = getPlan({
      state: state
    });

    const balance = getBalance({
      state: state
    });

    const annualBudget = resolveAnnualBudget(state);
    const targets = getTargetProgress({
      state: state,
      monthlyContribution: plan.monthlySaving
    });

    const activeTargets = targets.filter(function active(target) {
      return target.status === TARGET_STATUS.ACTIVE;
    });

    const totalTargetAmount = round(activeTargets.reduce(function sum(total, target) {
      return total + target.amount;
    }, 0), 2);

    const totalSavedTowardTargets = round(activeTargets.reduce(function sum(total, target) {
      return total + target.savedAmount;
    }, 0), 2);

    const totalRemainingTargets = round(activeTargets.reduce(function sum(total, target) {
      return total + target.remainingAmount;
    }, 0), 2);

    const monthsToAnnualBudget = plan.monthlySaving > 0
      ? Math.ceil(Math.max(0, annualBudget - balance) / plan.monthlySaving)
      : null;

    const projectedAnnualSavings = round(
      balance + (plan.monthlySaving * 12),
      2
    );

    const earliestTarget = activeTargets
      .filter(function hasDate(target) {
        return Boolean(target.targetDate);
      })
      .sort(function sortDate(a, b) {
        return (safeDate(a.targetDate)?.getTime() || 0) -
          (safeDate(b.targetDate)?.getTime() || 0);
      })[0] || null;

    const offTrackTargets = activeTargets.filter(function offTrack(target) {
      return !target.onTrack;
    });

    return {
      currency: plan.currency,
      balance: balance,
      monthlySaving: plan.monthlySaving,
      annualTarget: plan.annualTarget,
      annualBudget: annualBudget,
      projectedAnnualSavings: projectedAnnualSavings,
      projectedCoveragePercent: annualBudget > 0
        ? percentage(projectedAnnualSavings, annualBudget, 1)
        : 0,
      monthsToAnnualBudget: monthsToAnnualBudget,
      projectedAnnualBudgetDate: monthsToAnnualBudget !== null
        ? addMonths(new Date(), monthsToAnnualBudget).toISOString()
        : null,
      totalTargetAmount: totalTargetAmount,
      totalSavedTowardTargets: totalSavedTowardTargets,
      totalRemainingTargets: totalRemainingTargets,
      activeTargetsCount: activeTargets.length,
      offTrackTargetsCount: offTrackTargets.length,
      earliestTarget: clone(earliestTarget),
      canCoverAnnualBudget: projectedAnnualSavings >= annualBudget,
      fundingGap: round(Math.max(0, annualBudget - projectedAnnualSavings), 2)
    };
  }

  function calculateReadiness(options) {
    const opts = isObject(options) ? options : {};
    const state = opts.state || readState(opts.store);
    const annual = getAnnualSummary({
      state: state
    });
    const forecast = buildForecast({
      state: state
    });
    const targets = getTargetProgress({
      state: state
    });

    const targetTrackScore = targets.length
      ? (
          targets.filter(function onTrack(target) {
            return target.onTrack;
          }).length / targets.length
        ) * 100
      : 100;

    const annualCoverageScore = clamp(
      annual.currentBalanceCoveragePercent,
      0,
      100
    );

    const monthlyDiscipline = getMonthlySummary({
      state: state
    }).completionPercent;

    const forecastScore = forecast.canCoverAnnualBudget ? 100 : clamp(
      forecast.projectedCoveragePercent,
      0,
      100
    );

    const score = Math.round(
      (annualCoverageScore * 0.30) +
      (clamp(monthlyDiscipline, 0, 100) * 0.25) +
      (targetTrackScore * 0.20) +
      (forecastScore * 0.25)
    );

    let status = "excellent";
    let labelAr = "ممتاز";

    if (score < 50) {
      status = "critical";
      labelAr = "يحتاج تدخل";
    } else if (score < 70) {
      status = "warning";
      labelAr = "يحتاج تحسين";
    } else if (score < 85) {
      status = "good";
      labelAr = "جيد";
    }

    return {
      score: score,
      status: status,
      labelAr: labelAr,
      components: {
        annualCoverage: Math.round(annualCoverageScore),
        monthlyDiscipline: Math.round(clamp(monthlyDiscipline, 0, 100)),
        targetTrack: Math.round(targetTrackScore),
        forecastCoverage: Math.round(forecastScore)
      }
    };
  }

  function buildSnapshot(input, options) {
    const opts = isObject(options) ? options : {};
    const state = isObject(input) ? input : readState(opts.store);

    const plan = getPlan({
      state: state
    });

    const balance = getBalance({
      state: state
    });

    const monthly = getMonthlySummary({
      state: state
    });

    const annual = getAnnualSummary({
      state: state
    });

    const targets = getTargetProgress({
      state: state
    });

    const forecast = buildForecast({
      state: state
    });

    const readiness = calculateReadiness({
      state: state
    });

    return {
      generatedAt: new Date().toISOString(),
      engine: ENGINE_NAME,
      version: VERSION,
      currency: resolveCurrency(state),
      plan: plan,
      balance: balance,
      monthly: monthly,
      annual: annual,
      targets: targets,
      forecast: forecast,
      readiness: readiness,
      entries: listEntries({
        state: state,
        limit: 20
      }),
      counters: {
        entries: listEntries({
          state: state
        }).length,
        targets: targets.length,
        activeTargets: targets.filter(function active(target) {
          return target.status === TARGET_STATUS.ACTIVE;
        }).length,
        completedTargets: targets.filter(function completed(target) {
          return target.status === TARGET_STATUS.COMPLETED;
        }).length
      }
    };
  }

  function exportData(options) {
    const opts = isObject(options) ? options : {};
    const state = readState(opts.store);

    return {
      exportedAt: new Date().toISOString(),
      engine: ENGINE_NAME,
      version: VERSION,
      plan: getPlan({ state: state }),
      balance: getBalance({ state: state }),
      entries: listEntries({
        state: state,
        includeDeleted: opts.includeDeleted === true
      }),
      targets: listTargets({
        state: state,
        includeDeleted: opts.includeDeleted === true
      }),
      annualSummary: getAnnualSummary({ state: state }),
      monthlySummary: getMonthlySummary({ state: state }),
      forecast: buildForecast({ state: state }),
      readiness: calculateReadiness({ state: state })
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
      listener(buildSnapshot(state));
    });
  }

  const API = Object.freeze({
    name: ENGINE_NAME,
    version: VERSION,

    constants: Object.freeze({
      EVENTS: EVENTS,
      ENTRY_TYPE: ENTRY_TYPE,
      TARGET_STATUS: TARGET_STATUS,
      TARGET_TYPE: TARGET_TYPE,
      DEFAULT_CURRENCY: DEFAULT_CURRENCY,
      DEFAULT_MONTHLY_SAVING: DEFAULT_MONTHLY_SAVING,
      DEFAULT_ANNUAL_BUDGET: DEFAULT_ANNUAL_BUDGET
    }),

    utils: Object.freeze({
      asArray: asArray,
      clone: clone,
      toNumber: toNumber,
      toNonNegative: toNonNegative,
      round: round,
      clamp: clamp,
      percentage: percentage,
      safeDate: safeDate,
      normalizeCurrency: normalizeCurrency,
      normalizeEntryType: normalizeEntryType,
      normalizeTargetStatus: normalizeTargetStatus,
      normalizeTargetType: normalizeTargetType,
      createId: createId
    }),

    readState: readState,

    getPlan: getPlan,
    updatePlan: updatePlan,

    listEntries: listEntries,
    getEntryById: getEntryById,
    validateEntry: validateEntry,
    addEntry: addEntry,
    addDeposit: addDeposit,
    addWithdrawal: addWithdrawal,
    updateEntry: updateEntry,
    deleteEntry: deleteEntry,

    listTargets: listTargets,
    getTargetById: getTargetById,
    validateTarget: validateTarget,
    createTarget: createTarget,
    updateTarget: updateTarget,
    deleteTarget: deleteTarget,
    allocateToTarget: allocateToTarget,
    createTripTarget: createTripTarget,

    getBalance: getBalance,
    getMonthlySummary: getMonthlySummary,
    getAnnualSummary: getAnnualSummary,
    buildTargetProgress: buildTargetProgress,
    getTargetProgress: getTargetProgress,
    buildForecast: buildForecast,
    calculateReadiness: calculateReadiness,
    buildSnapshot: buildSnapshot,

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
