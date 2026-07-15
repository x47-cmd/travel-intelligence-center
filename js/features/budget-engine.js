/* =========================================================
   Travel Intelligence Center
   Budget Intelligence Platform
   Budget Engine V1.0.0

   File Path:
   js/features/budget-engine.js

   Purpose:
   - Central financial calculation engine for the Budget page.
   - Normalizes budget, trip, expense, saving and payment data.
   - Produces annual summaries, trip summaries, financial health,
     budget alerts, forecasts and dashboard-ready metrics.
   - Reads from the existing application Store without owning UI.
   - Does not write directly to localStorage; persistence remains
     the responsibility of the Store / Budget Storage layer.

   Global:
   - window.TICBudgetEngine
   ========================================================= */

(function budgetEngineFactory(global) {
  "use strict";

  const VERSION = "1.0.0";
  const ENGINE_NAME = "TICBudgetEngine";

  const DEFAULT_CURRENCY = "AED";
  const DEFAULT_ANNUAL_BUDGET = 30000;
  const DEFAULT_MONTHLY_SAVING = 1500;

  const STATUS = Object.freeze({
    HEALTHY: "healthy",
    WATCH: "watch",
    WARNING: "warning",
    CRITICAL: "critical"
  });

  const TRIP_STATUS = Object.freeze({
    PLANNED: "planned",
    UPCOMING: "upcoming",
    ACTIVE: "active",
    COMPLETED: "completed",
    CANCELLED: "cancelled"
  });

  const EXPENSE_STATUS = Object.freeze({
    PLANNED: "planned",
    PENDING: "pending",
    PAID: "paid",
    REFUNDED: "refunded",
    CANCELLED: "cancelled"
  });

  const PAYMENT_STATUS = Object.freeze({
    UPCOMING: "upcoming",
    DUE: "due",
    PAID: "paid",
    OVERDUE: "overdue",
    CANCELLED: "cancelled"
  });

  const DEFAULT_CATEGORY_KEYS = Object.freeze([
    "flights",
    "hotels",
    "food",
    "transport",
    "activities",
    "shopping",
    "insurance",
    "visa",
    "connectivity",
    "other"
  ]);

  const CATEGORY_ALIASES = Object.freeze({
    flight: "flights",
    flights: "flights",
    airline: "flights",
    airfare: "flights",
    ticket: "flights",
    tickets: "flights",
    طيران: "flights",
    تذاكر: "flights",

    hotel: "hotels",
    hotels: "hotels",
    accommodation: "hotels",
    stay: "hotels",
    فندق: "hotels",
    فنادق: "hotels",
    سكن: "hotels",

    food: "food",
    restaurant: "food",
    restaurants: "food",
    dining: "food",
    meals: "food",
    مطاعم: "food",
    طعام: "food",

    transport: "transport",
    transportation: "transport",
    taxi: "transport",
    rental: "transport",
    car: "transport",
    مواصلات: "transport",
    تاكسي: "transport",
    سيارة: "transport",

    activity: "activities",
    activities: "activities",
    attraction: "activities",
    attractions: "activities",
    entertainment: "activities",
    فعالية: "activities",
    فعاليات: "activities",
    أنشطة: "activities",

    shopping: "shopping",
    purchases: "shopping",
    تسوق: "shopping",
    مشتريات: "shopping",

    insurance: "insurance",
    تأمين: "insurance",

    visa: "visa",
    visas: "visa",
    تأشيرة: "visa",
    فيزا: "visa",

    connectivity: "connectivity",
    internet: "connectivity",
    sim: "connectivity",
    esim: "connectivity",
    شريحة: "connectivity",
    انترنت: "connectivity",

    other: "other",
    miscellaneous: "other",
    misc: "other",
    أخرى: "other",
    اخر: "other"
  });

  const CATEGORY_META = Object.freeze({
    flights: {
      key: "flights",
      labelAr: "الطيران",
      labelEn: "Flights",
      icon: "✈️"
    },
    hotels: {
      key: "hotels",
      labelAr: "الفنادق",
      labelEn: "Hotels",
      icon: "🏨"
    },
    food: {
      key: "food",
      labelAr: "المطاعم",
      labelEn: "Food",
      icon: "🍽️"
    },
    transport: {
      key: "transport",
      labelAr: "المواصلات",
      labelEn: "Transport",
      icon: "🚕"
    },
    activities: {
      key: "activities",
      labelAr: "الأنشطة",
      labelEn: "Activities",
      icon: "🎟️"
    },
    shopping: {
      key: "shopping",
      labelAr: "التسوق",
      labelEn: "Shopping",
      icon: "🛍️"
    },
    insurance: {
      key: "insurance",
      labelAr: "التأمين",
      labelEn: "Insurance",
      icon: "🛡️"
    },
    visa: {
      key: "visa",
      labelAr: "التأشيرات",
      labelEn: "Visa",
      icon: "🛂"
    },
    connectivity: {
      key: "connectivity",
      labelAr: "الاتصال والشرائح",
      labelEn: "Connectivity",
      icon: "📶"
    },
    other: {
      key: "other",
      labelAr: "مصروفات أخرى",
      labelEn: "Other",
      icon: "🧾"
    }
  });

  const HEALTH_WEIGHTS = Object.freeze({
    annualUsage: 30,
    savingsCoverage: 25,
    tripControl: 20,
    overduePayments: 15,
    emergencyBuffer: 10
  });

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;

    if (isObject(value)) {
      return Object.values(value);
    }

    return [];
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

  function sumBy(items, getter) {
    return asArray(items).reduce(function reduceSum(total, item, index) {
      const amount = typeof getter === "function"
        ? getter(item, index)
        : item && getter
          ? item[getter]
          : item;

      return total + toNumber(amount, 0);
    }, 0);
  }

  function safeDate(value) {
    if (!value) return null;

    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function startOfDay(value) {
    const date = safeDate(value) || new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function differenceInCalendarDays(from, to) {
    const start = startOfDay(from);
    const end = startOfDay(to);
    return Math.round((end.getTime() - start.getTime()) / 86400000);
  }

  function normalizeId(value, prefix, index) {
    const candidate = firstDefined(
      value && value.id,
      value && value._id,
      value && value.uuid,
      value && value.key
    );

    if (candidate !== undefined) return String(candidate);
    return String(prefix || "item") + "_" + String(index || 0);
  }

  function normalizeStatus(value, fallback) {
    const status = String(value || fallback || "").trim().toLowerCase();

    const aliases = {
      draft: "planned",
      planning: "planned",
      booked: "upcoming",
      confirmed: "upcoming",
      current: "active",
      ongoing: "active",
      done: "completed",
      finished: "completed",
      canceled: "cancelled",

      unpaid: "pending",
      complete: "paid",
      settled: "paid",
      returned: "refunded",

      late: "overdue"
    };

    return aliases[status] || status || fallback;
  }

  function normalizeCategory(value) {
    const raw = String(value || "other").trim().toLowerCase();
    return CATEGORY_ALIASES[raw] || (DEFAULT_CATEGORY_KEYS.includes(raw) ? raw : "other");
  }

  function normalizeCurrency(value) {
    return String(value || DEFAULT_CURRENCY).trim().toUpperCase() || DEFAULT_CURRENCY;
  }

  function getNested(source, path, fallback) {
    if (!source || !path) return fallback;

    const parts = String(path).split(".");
    let current = source;

    for (let index = 0; index < parts.length; index += 1) {
      if (current === undefined || current === null) return fallback;
      current = current[parts[index]];
    }

    return current === undefined ? fallback : current;
  }

  function readStoreState(store) {
    const source = store || global.TICStore || global.Store || global.store;

    if (!source) return {};

    try {
      if (typeof source.getState === "function") {
        return source.getState() || {};
      }

      if (typeof source.get === "function") {
        const state = source.get();
        if (isObject(state)) return state;
      }

      if (isObject(source.state)) {
        return source.state;
      }

      if (isObject(source.data)) {
        return source.data;
      }

      if (isObject(source)) {
        return source;
      }
    } catch (error) {
      console.warn("[" + ENGINE_NAME + "] Unable to read Store state.", error);
    }

    return {};
  }

  function getProfile(state) {
    return isObject(state && state.profile) ? state.profile : {};
  }

  function getSettings(state) {
    return isObject(state && state.settings) ? state.settings : {};
  }

  function getBudgetRoot(state) {
    const candidate = firstDefined(
      state && state.budget,
      state && state.budgets,
      getNested(state, "finance.budget"),
      getNested(state, "travelFinance.budget")
    );

    if (Array.isArray(candidate)) {
      return { tripBudgets: candidate };
    }

    return isObject(candidate) ? candidate : {};
  }

  function resolveCurrency(state, options) {
    const profile = getProfile(state);
    const settings = getSettings(state);
    const budgetRoot = getBudgetRoot(state);

    return normalizeCurrency(firstDefined(
      options && options.currency,
      budgetRoot.currency,
      settings.currency,
      profile.currency,
      state && state.currency,
      DEFAULT_CURRENCY
    ));
  }

  function resolveAnnualBudget(state, options) {
    const profile = getProfile(state);
    const settings = getSettings(state);
    const budgetRoot = getBudgetRoot(state);

    return toNonNegative(firstDefined(
      options && options.annualBudget,
      budgetRoot.annualBudget,
      budgetRoot.annualTravelBudget,
      budgetRoot.yearlyBudget,
      getNested(state, "budgets.annualBudget"),
      settings.annualTravelBudget,
      profile.annualTravelBudget,
      state && state.annualTravelBudget,
      DEFAULT_ANNUAL_BUDGET
    ), DEFAULT_ANNUAL_BUDGET);
  }

  function resolveMonthlySaving(state, options) {
    const profile = getProfile(state);
    const settings = getSettings(state);
    const budgetRoot = getBudgetRoot(state);

    return toNonNegative(firstDefined(
      options && options.monthlySaving,
      budgetRoot.monthlySaving,
      budgetRoot.monthlySavings,
      getNested(state, "savings.monthlySaving"),
      getNested(state, "savings.monthlyAmount"),
      settings.monthlySaving,
      profile.monthlySaving,
      state && state.monthlySaving,
      DEFAULT_MONTHLY_SAVING
    ), DEFAULT_MONTHLY_SAVING);
  }

  function getTrips(state) {
    return asArray(firstDefined(
      state && state.trips,
      getNested(state, "travel.trips"),
      getNested(state, "data.trips"),
      []
    ));
  }

  function getExpenses(state) {
    const budgetRoot = getBudgetRoot(state);

    return asArray(firstDefined(
      state && state.expenses,
      budgetRoot.expenses,
      getNested(state, "finance.expenses"),
      getNested(state, "travelFinance.expenses"),
      []
    ));
  }

  function getPayments(state) {
    const budgetRoot = getBudgetRoot(state);

    return asArray(firstDefined(
      state && state.payments,
      budgetRoot.payments,
      getNested(state, "finance.payments"),
      getNested(state, "travelFinance.payments"),
      []
    ));
  }

  function getSavingsEntries(state) {
    const root = firstDefined(
      state && state.savings,
      getNested(state, "finance.savings"),
      getNested(state, "travelFinance.savings")
    );

    if (Array.isArray(root)) return root;

    if (isObject(root)) {
      return asArray(firstDefined(root.entries, root.transactions, root.history, []));
    }

    return [];
  }

  function getExplicitTripBudgets(state) {
    const budgetRoot = getBudgetRoot(state);

    return asArray(firstDefined(
      budgetRoot.tripBudgets,
      budgetRoot.trips,
      getNested(state, "tripBudgets"),
      []
    ));
  }

  function normalizeTrip(rawTrip, index) {
    const trip = isObject(rawTrip) ? rawTrip : {};

    const startDate = safeDate(firstDefined(
      trip.startDate,
      trip.departureDate,
      trip.dateFrom,
      getNested(trip, "dates.start"),
      getNested(trip, "dates.from")
    ));

    const endDate = safeDate(firstDefined(
      trip.endDate,
      trip.returnDate,
      trip.dateTo,
      getNested(trip, "dates.end"),
      getNested(trip, "dates.to")
    ));

    const durationFromDates = startDate && endDate
      ? Math.max(1, differenceInCalendarDays(startDate, endDate) + 1)
      : 0;

    const travelers = Math.max(1, Math.round(toNumber(firstDefined(
      trip.travelers,
      trip.travellers,
      trip.people,
      trip.guests,
      trip.passengers,
      getNested(trip, "party.count")
    ), 1)));

    const budget = toNonNegative(firstDefined(
      trip.budget,
      trip.totalBudget,
      trip.plannedBudget,
      trip.estimatedBudget,
      getNested(trip, "finance.budget"),
      getNested(trip, "budget.total"),
      getNested(trip, "budget.amount")
    ), 0);

    const directSpent = toNonNegative(firstDefined(
      trip.spent,
      trip.totalSpent,
      trip.actualCost,
      trip.expensesTotal,
      getNested(trip, "finance.spent"),
      getNested(trip, "budget.spent")
    ), 0);

    const explicitStatus = normalizeStatus(firstDefined(
      trip.status,
      trip.tripStatus,
      getNested(trip, "meta.status")
    ), "");

    let inferredStatus = explicitStatus;

    if (!inferredStatus) {
      const today = startOfDay(new Date());

      if (startDate && endDate && today > startOfDay(endDate)) {
        inferredStatus = TRIP_STATUS.COMPLETED;
      } else if (startDate && today >= startOfDay(startDate)) {
        inferredStatus = TRIP_STATUS.ACTIVE;
      } else if (startDate) {
        inferredStatus = TRIP_STATUS.UPCOMING;
      } else {
        inferredStatus = TRIP_STATUS.PLANNED;
      }
    }

    return {
      id: normalizeId(trip, "trip", index),
      source: trip,
      title: String(firstDefined(
        trip.title,
        trip.name,
        trip.tripName,
        trip.destinationName,
        "رحلة"
      )),
      destination: String(firstDefined(
        trip.destination,
        trip.country,
        trip.city,
        getNested(trip, "location.name"),
        ""
      )),
      country: String(firstDefined(
        trip.country,
        getNested(trip, "destination.country"),
        ""
      )),
      city: String(firstDefined(
        trip.city,
        getNested(trip, "destination.city"),
        ""
      )),
      startDate: startDate ? startDate.toISOString() : null,
      endDate: endDate ? endDate.toISOString() : null,
      days: Math.max(1, Math.round(toNumber(firstDefined(
        trip.days,
        trip.duration,
        trip.durationDays,
        durationFromDates
      ), durationFromDates || 1))),
      travelers: travelers,
      status: inferredStatus,
      budget: budget,
      directSpent: directSpent,
      currency: normalizeCurrency(firstDefined(
        trip.currency,
        getNested(trip, "budget.currency"),
        DEFAULT_CURRENCY
      )),
      createdAt: safeDate(firstDefined(trip.createdAt, trip.created_at))
        ? safeDate(firstDefined(trip.createdAt, trip.created_at)).toISOString()
        : null,
      updatedAt: safeDate(firstDefined(trip.updatedAt, trip.updated_at))
        ? safeDate(firstDefined(trip.updatedAt, trip.updated_at)).toISOString()
        : null
    };
  }

  function normalizeExpense(rawExpense, index) {
    const expense = isObject(rawExpense) ? rawExpense : {};

    const amount = toNonNegative(firstDefined(
      expense.amount,
      expense.value,
      expense.total,
      expense.cost,
      expense.price
    ), 0);

    const status = normalizeStatus(firstDefined(
      expense.status,
      expense.paymentStatus,
      expense.state
    ), EXPENSE_STATUS.PAID);

    const date = safeDate(firstDefined(
      expense.date,
      expense.paidAt,
      expense.createdAt,
      expense.transactionDate,
      expense.bookingDate
    ));

    return {
      id: normalizeId(expense, "expense", index),
      source: expense,
      tripId: String(firstDefined(
        expense.tripId,
        expense.trip_id,
        getNested(expense, "trip.id"),
        ""
      )),
      title: String(firstDefined(
        expense.title,
        expense.name,
        expense.description,
        expense.merchant,
        CATEGORY_META[normalizeCategory(expense.category)].labelAr
      )),
      category: normalizeCategory(firstDefined(
        expense.category,
        expense.categoryKey,
        expense.type
      )),
      amount: amount,
      currency: normalizeCurrency(firstDefined(expense.currency, DEFAULT_CURRENCY)),
      status: status,
      date: date ? date.toISOString() : null,
      isPaid: status === EXPENSE_STATUS.PAID,
      isRefunded: status === EXPENSE_STATUS.REFUNDED,
      isCancelled: status === EXPENSE_STATUS.CANCELLED,
      notes: String(firstDefined(expense.notes, expense.note, "")),
      paymentMethod: String(firstDefined(
        expense.paymentMethod,
        expense.method,
        ""
      ))
    };
  }

  function normalizePayment(rawPayment, index) {
    const payment = isObject(rawPayment) ? rawPayment : {};

    const dueDate = safeDate(firstDefined(
      payment.dueDate,
      payment.date,
      payment.paymentDate,
      payment.deadline
    ));

    let status = normalizeStatus(firstDefined(
      payment.status,
      payment.paymentStatus,
      payment.state
    ), PAYMENT_STATUS.UPCOMING);

    if (
      dueDate &&
      status !== PAYMENT_STATUS.PAID &&
      status !== PAYMENT_STATUS.CANCELLED
    ) {
      const daysUntilDue = differenceInCalendarDays(new Date(), dueDate);

      if (daysUntilDue < 0) status = PAYMENT_STATUS.OVERDUE;
      else if (daysUntilDue === 0) status = PAYMENT_STATUS.DUE;
    }

    return {
      id: normalizeId(payment, "payment", index),
      source: payment,
      tripId: String(firstDefined(
        payment.tripId,
        payment.trip_id,
        getNested(payment, "trip.id"),
        ""
      )),
      title: String(firstDefined(
        payment.title,
        payment.name,
        payment.description,
        "دفعة سفر"
      )),
      category: normalizeCategory(firstDefined(
        payment.category,
        payment.type
      )),
      amount: toNonNegative(firstDefined(
        payment.amount,
        payment.value,
        payment.total,
        payment.cost
      ), 0),
      currency: normalizeCurrency(firstDefined(payment.currency, DEFAULT_CURRENCY)),
      status: status,
      dueDate: dueDate ? dueDate.toISOString() : null,
      daysUntilDue: dueDate ? differenceInCalendarDays(new Date(), dueDate) : null,
      isPaid: status === PAYMENT_STATUS.PAID,
      isOverdue: status === PAYMENT_STATUS.OVERDUE,
      notes: String(firstDefined(payment.notes, payment.note, ""))
    };
  }

  function normalizeSavingEntry(rawEntry, index) {
    const entry = isObject(rawEntry) ? rawEntry : {};

    const date = safeDate(firstDefined(
      entry.date,
      entry.createdAt,
      entry.savedAt,
      entry.transactionDate
    ));

    const rawType = String(firstDefined(
      entry.type,
      entry.transactionType,
      "deposit"
    )).toLowerCase();

    const isWithdrawal = [
      "withdrawal",
      "withdraw",
      "expense",
      "debit",
      "سحب"
    ].includes(rawType);

    return {
      id: normalizeId(entry, "saving", index),
      source: entry,
      amount: toNonNegative(firstDefined(
        entry.amount,
        entry.value,
        entry.total
      ), 0),
      direction: isWithdrawal ? -1 : 1,
      type: isWithdrawal ? "withdrawal" : "deposit",
      date: date ? date.toISOString() : null,
      currency: normalizeCurrency(firstDefined(entry.currency, DEFAULT_CURRENCY)),
      notes: String(firstDefined(entry.notes, entry.note, ""))
    };
  }

  function normalizeExplicitTripBudget(rawBudget, index) {
    const budget = isObject(rawBudget) ? rawBudget : {};

    return {
      id: normalizeId(budget, "trip_budget", index),
      source: budget,
      tripId: String(firstDefined(
        budget.tripId,
        budget.trip_id,
        getNested(budget, "trip.id"),
        budget.id,
        ""
      )),
      amount: toNonNegative(firstDefined(
        budget.amount,
        budget.budget,
        budget.totalBudget,
        budget.plannedBudget,
        budget.limit
      ), 0),
      spent: toNonNegative(firstDefined(
        budget.spent,
        budget.totalSpent,
        budget.actualCost
      ), 0),
      currency: normalizeCurrency(firstDefined(budget.currency, DEFAULT_CURRENCY))
    };
  }

  function createNormalizedContext(input, options) {
    const opts = isObject(options) ? options : {};

    const state = isObject(input)
      ? input
      : readStoreState(opts.store);

    const trips = getTrips(state).map(normalizeTrip);
    const expenses = getExpenses(state).map(normalizeExpense);
    const payments = getPayments(state).map(normalizePayment);
    const savingsEntries = getSavingsEntries(state).map(normalizeSavingEntry);
    const explicitTripBudgets = getExplicitTripBudgets(state).map(normalizeExplicitTripBudget);

    return {
      state: state,
      currency: resolveCurrency(state, opts),
      annualBudget: resolveAnnualBudget(state, opts),
      monthlySaving: resolveMonthlySaving(state, opts),
      trips: trips,
      expenses: expenses,
      payments: payments,
      savingsEntries: savingsEntries,
      explicitTripBudgets: explicitTripBudgets,
      options: opts
    };
  }

  function getExpenseEffectiveAmount(expense) {
    if (!expense || expense.isCancelled) return 0;
    if (expense.isRefunded) return -Math.abs(toNumber(expense.amount, 0));
    return Math.abs(toNumber(expense.amount, 0));
  }

  function calculateExpenseTotal(expenses, options) {
    const opts = isObject(options) ? options : {};
    const includePending = opts.includePending === true;

    return round(sumBy(expenses, function expenseAmount(expense) {
      if (!expense || expense.isCancelled) return 0;

      if (!includePending && !expense.isPaid && !expense.isRefunded) {
        return 0;
      }

      return getExpenseEffectiveAmount(expense);
    }), 2);
  }

  function calculateCommittedExpenseTotal(expenses) {
    return round(sumBy(expenses, function committedAmount(expense) {
      if (!expense || expense.isCancelled || expense.isRefunded) return 0;
      return Math.abs(toNumber(expense.amount, 0));
    }), 2);
  }

  function calculateSavingsBalance(context) {
    const explicitRoot = firstDefined(
      context.state && context.state.savings,
      getNested(context.state, "finance.savings"),
      getNested(context.state, "travelFinance.savings")
    );

    const explicitBalance = isObject(explicitRoot)
      ? firstDefined(
          explicitRoot.balance,
          explicitRoot.totalSaved,
          explicitRoot.currentAmount,
          explicitRoot.saved
        )
      : undefined;

    if (explicitBalance !== undefined) {
      return toNonNegative(explicitBalance, 0);
    }

    return round(sumBy(context.savingsEntries, function savingAmount(entry) {
      return entry.amount * entry.direction;
    }), 2);
  }

  function resolveTripBudgetAmount(trip, context) {
    const explicit = context.explicitTripBudgets.find(function findBudget(item) {
      return item.tripId && item.tripId === trip.id;
    });

    return toNonNegative(firstDefined(
      explicit && explicit.amount,
      trip.budget
    ), 0);
  }

  function resolveTripSpentAmount(trip, context) {
    const matchingExpenses = context.expenses.filter(function filterExpense(expense) {
      return expense.tripId && expense.tripId === trip.id;
    });

    const expenseSpent = calculateExpenseTotal(matchingExpenses);

    const explicit = context.explicitTripBudgets.find(function findBudget(item) {
      return item.tripId && item.tripId === trip.id;
    });

    return round(Math.max(
      expenseSpent,
      toNonNegative(explicit && explicit.spent, 0),
      toNonNegative(trip.directSpent, 0)
    ), 2);
  }

  function buildTripSummary(trip, context) {
    const budget = resolveTripBudgetAmount(trip, context);
    const spent = resolveTripSpentAmount(trip, context);
    const remaining = round(Math.max(0, budget - spent), 2);
    const variance = round(budget - spent, 2);
    const usagePercent = budget > 0 ? percentage(spent, budget, 1) : 0;
    const costPerDay = trip.days > 0 ? round(spent / trip.days, 2) : 0;
    const budgetPerDay = trip.days > 0 ? round(budget / trip.days, 2) : 0;
    const costPerPerson = trip.travelers > 0 ? round(spent / trip.travelers, 2) : 0;
    const budgetPerPerson = trip.travelers > 0 ? round(budget / trip.travelers, 2) : 0;

    const matchingExpenses = context.expenses.filter(function filterExpense(expense) {
      return expense.tripId && expense.tripId === trip.id;
    });

    const matchingPayments = context.payments.filter(function filterPayment(payment) {
      return payment.tripId && payment.tripId === trip.id;
    });

    const pendingPayments = matchingPayments.filter(function filterPending(payment) {
      return !payment.isPaid && payment.status !== PAYMENT_STATUS.CANCELLED;
    });

    const outstanding = round(sumBy(pendingPayments, "amount"), 2);

    let budgetStatus = STATUS.HEALTHY;

    if (usagePercent >= 100) budgetStatus = STATUS.CRITICAL;
    else if (usagePercent >= 90) budgetStatus = STATUS.WARNING;
    else if (usagePercent >= 75) budgetStatus = STATUS.WATCH;

    return {
      id: trip.id,
      trip: trip,
      title: trip.title,
      destination: trip.destination,
      country: trip.country,
      city: trip.city,
      status: trip.status,
      currency: trip.currency || context.currency,
      startDate: trip.startDate,
      endDate: trip.endDate,
      days: trip.days,
      travelers: trip.travelers,
      budget: budget,
      spent: spent,
      committed: calculateCommittedExpenseTotal(matchingExpenses),
      remaining: remaining,
      variance: variance,
      usagePercent: usagePercent,
      costPerDay: costPerDay,
      budgetPerDay: budgetPerDay,
      costPerPerson: costPerPerson,
      budgetPerPerson: budgetPerPerson,
      outstandingPayments: outstanding,
      expensesCount: matchingExpenses.length,
      paymentsCount: matchingPayments.length,
      budgetStatus: budgetStatus,
      isOverBudget: spent > budget && budget > 0,
      isNearLimit: usagePercent >= 75 && usagePercent < 100
    };
  }

  function getTripSummaries(input, options) {
    const context = input && input.trips && input.expenses
      ? input
      : createNormalizedContext(input, options);

    return context.trips.map(function mapTrip(trip) {
      return buildTripSummary(trip, context);
    });
  }

  function getCategoryBreakdown(input, options) {
    const context = input && input.expenses
      ? input
      : createNormalizedContext(input, options);

    const paidTotal = calculateExpenseTotal(context.expenses);

    return DEFAULT_CATEGORY_KEYS.map(function mapCategory(key) {
      const categoryExpenses = context.expenses.filter(function filterCategory(expense) {
        return expense.category === key;
      });

      const spent = calculateExpenseTotal(categoryExpenses);
      const committed = calculateCommittedExpenseTotal(categoryExpenses);

      return {
        ...CATEGORY_META[key],
        spent: spent,
        committed: committed,
        sharePercent: paidTotal > 0 ? percentage(spent, paidTotal, 1) : 0,
        transactionsCount: categoryExpenses.length
      };
    }).sort(function sortCategories(a, b) {
      return b.spent - a.spent;
    });
  }

  function getAnnualOverview(input, options) {
    const context = input && input.trips && input.expenses
      ? input
      : createNormalizedContext(input, options);

    const tripSummaries = getTripSummaries(context);
    const expenseSpent = calculateExpenseTotal(context.expenses);
    const tripSpent = sumBy(tripSummaries, "spent");
    const totalSpent = round(Math.max(expenseSpent, tripSpent), 2);
    const remaining = round(Math.max(0, context.annualBudget - totalSpent), 2);
    const variance = round(context.annualBudget - totalSpent, 2);
    const usagePercent = context.annualBudget > 0
      ? percentage(totalSpent, context.annualBudget, 1)
      : 0;

    const totalTripBudgets = round(sumBy(tripSummaries, "budget"), 2);
    const activeTripSummaries = tripSummaries.filter(function activeTrip(summary) {
      return summary.status !== TRIP_STATUS.CANCELLED;
    });

    const budgetedTrips = activeTripSummaries.filter(function budgetedTrip(summary) {
      return summary.budget > 0;
    });

    const savingsBalance = calculateSavingsBalance(context);
    const annualSavingPlan = round(context.monthlySaving * 12, 2);
    const savingsCoveragePercent = context.annualBudget > 0
      ? percentage(annualSavingPlan, context.annualBudget, 1)
      : 0;

    const pendingPayments = context.payments.filter(function pendingPayment(payment) {
      return !payment.isPaid && payment.status !== PAYMENT_STATUS.CANCELLED;
    });

    const overduePayments = pendingPayments.filter(function overduePayment(payment) {
      return payment.isOverdue;
    });

    return {
      currency: context.currency,
      annualBudget: round(context.annualBudget, 2),
      totalSpent: totalSpent,
      remaining: remaining,
      variance: variance,
      usagePercent: usagePercent,
      totalTripBudgets: totalTripBudgets,
      unallocatedBudget: round(Math.max(0, context.annualBudget - totalTripBudgets), 2),
      tripsCount: activeTripSummaries.length,
      budgetedTripsCount: budgetedTrips.length,
      averageTripBudget: budgetedTrips.length
        ? round(totalTripBudgets / budgetedTrips.length, 2)
        : 0,
      averageTripSpent: budgetedTrips.length
        ? round(sumBy(budgetedTrips, "spent") / budgetedTrips.length, 2)
        : 0,
      monthlySaving: round(context.monthlySaving, 2),
      annualSavingPlan: annualSavingPlan,
      savingsBalance: savingsBalance,
      savingsCoveragePercent: savingsCoveragePercent,
      pendingPaymentsTotal: round(sumBy(pendingPayments, "amount"), 2),
      pendingPaymentsCount: pendingPayments.length,
      overduePaymentsTotal: round(sumBy(overduePayments, "amount"), 2),
      overduePaymentsCount: overduePayments.length,
      isOverBudget: totalSpent > context.annualBudget,
      committedTotal: calculateCommittedExpenseTotal(context.expenses)
    };
  }

  function calculateFinancialHealth(input, options) {
    const context = input && input.trips && input.expenses
      ? input
      : createNormalizedContext(input, options);

    const overview = getAnnualOverview(context);
    const trips = getTripSummaries(context);

    const overBudgetTrips = trips.filter(function filterOverBudget(trip) {
      return trip.isOverBudget;
    }).length;

    const controlledTrips = trips.filter(function filterControlled(trip) {
      return trip.budget > 0 && !trip.isOverBudget;
    }).length;

    const tripControlRatio = trips.length > 0
      ? controlledTrips / trips.length
      : 1;

    let annualUsageScore = 100;

    if (overview.usagePercent > 100) {
      annualUsageScore = Math.max(0, 100 - ((overview.usagePercent - 100) * 4));
    } else if (overview.usagePercent >= 90) {
      annualUsageScore = 70;
    } else if (overview.usagePercent >= 75) {
      annualUsageScore = 85;
    }

    const savingTarget = Math.max(
      overview.annualBudget,
      overview.totalTripBudgets
    );

    const projectedAnnualSavings = overview.annualSavingPlan + overview.savingsBalance;
    const savingsScore = savingTarget > 0
      ? clamp((projectedAnnualSavings / savingTarget) * 100, 0, 100)
      : 100;

    const tripControlScore = clamp(tripControlRatio * 100, 0, 100);

    const overduePenaltyRatio = overview.pendingPaymentsTotal > 0
      ? overview.overduePaymentsTotal / overview.pendingPaymentsTotal
      : 0;

    const paymentsScore = clamp(100 - (overduePenaltyRatio * 100), 0, 100);

    const emergencyBufferTarget = Math.max(
      overview.monthlySaving * 2,
      overview.annualBudget * 0.1
    );

    const emergencyBufferScore = emergencyBufferTarget > 0
      ? clamp((overview.savingsBalance / emergencyBufferTarget) * 100, 0, 100)
      : 100;

    const weightedScore = (
      (annualUsageScore * HEALTH_WEIGHTS.annualUsage) +
      (savingsScore * HEALTH_WEIGHTS.savingsCoverage) +
      (tripControlScore * HEALTH_WEIGHTS.tripControl) +
      (paymentsScore * HEALTH_WEIGHTS.overduePayments) +
      (emergencyBufferScore * HEALTH_WEIGHTS.emergencyBuffer)
    ) / 100;

    const score = Math.round(clamp(weightedScore, 0, 100));

    let status = STATUS.HEALTHY;
    let labelAr = "ممتاز";
    let labelEn = "Excellent";

    if (score < 50) {
      status = STATUS.CRITICAL;
      labelAr = "حرج";
      labelEn = "Critical";
    } else if (score < 70) {
      status = STATUS.WARNING;
      labelAr = "يحتاج تحسين";
      labelEn = "Needs Improvement";
    } else if (score < 85) {
      status = STATUS.WATCH;
      labelAr = "جيد";
      labelEn = "Good";
    }

    return {
      score: score,
      status: status,
      labelAr: labelAr,
      labelEn: labelEn,
      components: {
        annualUsage: Math.round(annualUsageScore),
        savingsCoverage: Math.round(savingsScore),
        tripControl: Math.round(tripControlScore),
        paymentDiscipline: Math.round(paymentsScore),
        emergencyBuffer: Math.round(emergencyBufferScore)
      },
      details: {
        overBudgetTrips: overBudgetTrips,
        controlledTrips: controlledTrips,
        overduePaymentsCount: overview.overduePaymentsCount,
        annualUsagePercent: overview.usagePercent,
        savingsCoveragePercent: overview.savingsCoveragePercent
      }
    };
  }

  function buildAlerts(input, options) {
    const context = input && input.trips && input.expenses
      ? input
      : createNormalizedContext(input, options);

    const overview = getAnnualOverview(context);
    const trips = getTripSummaries(context);
    const alerts = [];

    function pushAlert(alert) {
      alerts.push({
        id: alert.id,
        type: alert.type || "info",
        severity: alert.severity || STATUS.WATCH,
        titleAr: alert.titleAr || "",
        messageAr: alert.messageAr || "",
        titleEn: alert.titleEn || "",
        messageEn: alert.messageEn || "",
        tripId: alert.tripId || null,
        amount: toNumber(alert.amount, 0),
        createdAt: new Date().toISOString()
      });
    }

    if (overview.isOverBudget) {
      pushAlert({
        id: "annual_budget_exceeded",
        type: "annual-budget",
        severity: STATUS.CRITICAL,
        titleAr: "تم تجاوز الميزانية السنوية",
        messageAr: "تجاوز الإنفاق ميزانية السفر السنوية بمقدار " +
          round(Math.abs(overview.variance), 2) + " " + overview.currency + ".",
        titleEn: "Annual budget exceeded",
        messageEn: "Travel spending is above the annual budget.",
        amount: Math.abs(overview.variance)
      });
    } else if (overview.usagePercent >= 90) {
      pushAlert({
        id: "annual_budget_90",
        type: "annual-budget",
        severity: STATUS.WARNING,
        titleAr: "اقتربت من الحد السنوي",
        messageAr: "تم استخدام " + overview.usagePercent + "% من ميزانية السفر السنوية.",
        titleEn: "Annual limit is near",
        messageEn: "Most of the annual travel budget has been used."
      });
    } else if (overview.usagePercent >= 75) {
      pushAlert({
        id: "annual_budget_75",
        type: "annual-budget",
        severity: STATUS.WATCH,
        titleAr: "مراجعة الميزانية السنوية",
        messageAr: "وصل استخدام الميزانية إلى " + overview.usagePercent + "%.",
        titleEn: "Review annual budget",
        messageEn: "Annual budget usage has reached the watch level."
      });
    }

    trips.forEach(function tripAlert(summary) {
      if (summary.isOverBudget) {
        pushAlert({
          id: "trip_over_budget_" + summary.id,
          type: "trip-budget",
          severity: STATUS.CRITICAL,
          titleAr: "رحلة تجاوزت الميزانية",
          messageAr: summary.title + " تجاوزت ميزانيتها بمقدار " +
            round(Math.abs(summary.variance), 2) + " " + summary.currency + ".",
          titleEn: "Trip budget exceeded",
          messageEn: summary.title + " is over budget.",
          tripId: summary.id,
          amount: Math.abs(summary.variance)
        });
      } else if (summary.usagePercent >= 90) {
        pushAlert({
          id: "trip_near_limit_" + summary.id,
          type: "trip-budget",
          severity: STATUS.WARNING,
          titleAr: "رحلة قريبة من حد الميزانية",
          messageAr: summary.title + " استخدمت " + summary.usagePercent + "% من ميزانيتها.",
          titleEn: "Trip budget nearly used",
          messageEn: summary.title + " is close to its budget limit.",
          tripId: summary.id
        });
      }
    });

    context.payments.forEach(function paymentAlert(payment) {
      if (payment.isOverdue) {
        pushAlert({
          id: "payment_overdue_" + payment.id,
          type: "payment",
          severity: STATUS.CRITICAL,
          titleAr: "دفعة متأخرة",
          messageAr: payment.title + " بقيمة " + payment.amount + " " +
            payment.currency + " تجاوزت موعدها.",
          titleEn: "Overdue payment",
          messageEn: payment.title + " is overdue.",
          tripId: payment.tripId || null,
          amount: payment.amount
        });
      } else if (
        !payment.isPaid &&
        payment.daysUntilDue !== null &&
        payment.daysUntilDue >= 0 &&
        payment.daysUntilDue <= 7
      ) {
        pushAlert({
          id: "payment_due_soon_" + payment.id,
          type: "payment",
          severity: STATUS.WATCH,
          titleAr: "دفعة قريبة",
          messageAr: payment.title + " تستحق خلال " +
            payment.daysUntilDue + " يوم.",
          titleEn: "Payment due soon",
          messageEn: payment.title + " is due soon.",
          tripId: payment.tripId || null,
          amount: payment.amount
        });
      }
    });

    if (
      overview.annualSavingPlan > 0 &&
      overview.annualSavingPlan < overview.totalTripBudgets
    ) {
      pushAlert({
        id: "savings_gap",
        type: "savings",
        severity: STATUS.WARNING,
        titleAr: "فجوة في خطة الادخار",
        messageAr: "خطة الادخار السنوية أقل من ميزانيات الرحلات المخططة بمقدار " +
          round(overview.totalTripBudgets - overview.annualSavingPlan, 2) +
          " " + overview.currency + ".",
        titleEn: "Savings gap",
        messageEn: "Projected annual savings are below planned trip budgets.",
        amount: overview.totalTripBudgets - overview.annualSavingPlan
      });
    }

    const severityOrder = {
      critical: 3,
      warning: 2,
      watch: 1,
      healthy: 0
    };

    return alerts.sort(function sortAlerts(a, b) {
      return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
    });
  }

  function buildForecast(input, options) {
    const context = input && input.trips && input.expenses
      ? input
      : createNormalizedContext(input, options);

    const overview = getAnnualOverview(context);
    const today = new Date();
    const monthIndex = today.getMonth();
    const elapsedMonths = Math.max(1, monthIndex + 1);
    const remainingMonths = Math.max(0, 12 - elapsedMonths);

    const monthlyBurnRate = round(overview.totalSpent / elapsedMonths, 2);
    const projectedYearEndSpend = round(monthlyBurnRate * 12, 2);
    const projectedVariance = round(overview.annualBudget - projectedYearEndSpend, 2);

    const monthsUntilBudgetExhausted = monthlyBurnRate > 0
      ? round(overview.remaining / monthlyBurnRate, 1)
      : null;

    const plannedSavingsByYearEnd = round(
      overview.savingsBalance + (overview.monthlySaving * remainingMonths),
      2
    );

    const uncoveredTripBudget = round(
      Math.max(0, overview.totalTripBudgets - plannedSavingsByYearEnd),
      2
    );

    return {
      elapsedMonths: elapsedMonths,
      remainingMonths: remainingMonths,
      monthlyBurnRate: monthlyBurnRate,
      projectedYearEndSpend: projectedYearEndSpend,
      projectedVariance: projectedVariance,
      projectedUsagePercent: overview.annualBudget > 0
        ? percentage(projectedYearEndSpend, overview.annualBudget, 1)
        : 0,
      monthsUntilBudgetExhausted: monthsUntilBudgetExhausted,
      plannedSavingsByYearEnd: plannedSavingsByYearEnd,
      uncoveredTripBudget: uncoveredTripBudget,
      isProjectedOverBudget: projectedYearEndSpend > overview.annualBudget,
      canFundPlannedTrips: plannedSavingsByYearEnd >= overview.totalTripBudgets
    };
  }

  function buildSnapshot(input, options) {
    const context = createNormalizedContext(input, options);
    const annualOverview = getAnnualOverview(context);
    const tripBudgets = getTripSummaries(context);
    const categories = getCategoryBreakdown(context);
    const financialHealth = calculateFinancialHealth(context);
    const alerts = buildAlerts(context);
    const forecast = buildForecast(context);

    const upcomingPayments = context.payments
      .filter(function filterUpcoming(payment) {
        return !payment.isPaid && payment.status !== PAYMENT_STATUS.CANCELLED;
      })
      .sort(function sortPayments(a, b) {
        const aDate = safeDate(a.dueDate);
        const bDate = safeDate(b.dueDate);

        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;

        return aDate.getTime() - bDate.getTime();
      });

    return {
      generatedAt: new Date().toISOString(),
      engine: ENGINE_NAME,
      version: VERSION,
      currency: context.currency,
      annualOverview: annualOverview,
      financialHealth: financialHealth,
      tripBudgets: tripBudgets,
      categories: categories,
      upcomingPayments: upcomingPayments,
      savings: {
        monthlySaving: annualOverview.monthlySaving,
        annualSavingPlan: annualOverview.annualSavingPlan,
        currentBalance: annualOverview.savingsBalance,
        coveragePercent: annualOverview.savingsCoveragePercent
      },
      forecast: forecast,
      alerts: alerts,
      counters: {
        trips: tripBudgets.length,
        expenses: context.expenses.length,
        payments: context.payments.length,
        alerts: alerts.length,
        overBudgetTrips: tripBudgets.filter(function overBudget(item) {
          return item.isOverBudget;
        }).length
      }
    };
  }

  function formatMoney(value, currency, locale, options) {
    const amount = toNumber(value, 0);
    const resolvedCurrency = normalizeCurrency(currency || DEFAULT_CURRENCY);
    const resolvedLocale = locale || "ar-AE";

    try {
      return new Intl.NumberFormat(resolvedLocale, {
        style: "currency",
        currency: resolvedCurrency,
        maximumFractionDigits: options && Number.isInteger(options.maximumFractionDigits)
          ? options.maximumFractionDigits
          : 0
      }).format(amount);
    } catch (error) {
      return round(amount, 2).toLocaleString(resolvedLocale) + " " + resolvedCurrency;
    }
  }

  function subscribe(listener, store) {
    if (typeof listener !== "function") {
      throw new TypeError("[" + ENGINE_NAME + "] subscribe requires a function.");
    }

    const source = store || global.TICStore || global.Store || global.store;

    if (!source || typeof source.subscribe !== "function") {
      return function unsubscribeNoop() {};
    }

    return source.subscribe(function handleStoreChange(state) {
      listener(buildSnapshot(state));
    });
  }

  function validateState(input, options) {
    const context = createNormalizedContext(input, options);
    const issues = [];

    if (context.annualBudget <= 0) {
      issues.push({
        code: "ANNUAL_BUDGET_MISSING",
        severity: STATUS.WARNING,
        messageAr: "الميزانية السنوية غير محددة أو تساوي صفراً.",
        messageEn: "Annual budget is missing or zero."
      });
    }

    context.expenses.forEach(function validateExpense(expense) {
      if (expense.amount <= 0) {
        issues.push({
          code: "EXPENSE_AMOUNT_INVALID",
          severity: STATUS.WARNING,
          itemId: expense.id,
          messageAr: "يوجد مصروف بقيمة غير صحيحة.",
          messageEn: "An expense has an invalid amount."
        });
      }
    });

    context.payments.forEach(function validatePayment(payment) {
      if (payment.amount <= 0) {
        issues.push({
          code: "PAYMENT_AMOUNT_INVALID",
          severity: STATUS.WARNING,
          itemId: payment.id,
          messageAr: "يوجد موعد دفع بقيمة غير صحيحة.",
          messageEn: "A payment has an invalid amount."
        });
      }
    });

    return {
      valid: issues.length === 0,
      issues: issues
    };
  }

  const API = Object.freeze({
    name: ENGINE_NAME,
    version: VERSION,

    constants: Object.freeze({
      DEFAULT_CURRENCY: DEFAULT_CURRENCY,
      DEFAULT_ANNUAL_BUDGET: DEFAULT_ANNUAL_BUDGET,
      DEFAULT_MONTHLY_SAVING: DEFAULT_MONTHLY_SAVING,
      STATUS: STATUS,
      TRIP_STATUS: TRIP_STATUS,
      EXPENSE_STATUS: EXPENSE_STATUS,
      PAYMENT_STATUS: PAYMENT_STATUS,
      CATEGORY_META: CATEGORY_META,
      CATEGORY_KEYS: DEFAULT_CATEGORY_KEYS,
      HEALTH_WEIGHTS: HEALTH_WEIGHTS
    }),

    utils: Object.freeze({
      asArray: asArray,
      toNumber: toNumber,
      toNonNegative: toNonNegative,
      round: round,
      clamp: clamp,
      percentage: percentage,
      safeDate: safeDate,
      normalizeCategory: normalizeCategory,
      normalizeCurrency: normalizeCurrency,
      formatMoney: formatMoney
    }),

    readStoreState: readStoreState,
    createNormalizedContext: createNormalizedContext,

    normalizeTrip: normalizeTrip,
    normalizeExpense: normalizeExpense,
    normalizePayment: normalizePayment,
    normalizeSavingEntry: normalizeSavingEntry,

    calculateExpenseTotal: calculateExpenseTotal,
    calculateCommittedExpenseTotal: calculateCommittedExpenseTotal,
    calculateSavingsBalance: calculateSavingsBalance,

    getAnnualOverview: getAnnualOverview,
    getTripSummaries: getTripSummaries,
    getCategoryBreakdown: getCategoryBreakdown,
    calculateFinancialHealth: calculateFinancialHealth,
    buildAlerts: buildAlerts,
    buildForecast: buildForecast,
    buildSnapshot: buildSnapshot,

    validateState: validateState,
    subscribe: subscribe
  });

  Object.defineProperty(global, ENGINE_NAME, {
    value: API,
    writable: false,
    enumerable: true,
    configurable: true
  });

  global.dispatchEvent(new CustomEvent("tic:budget-engine-ready", {
    detail: {
      name: ENGINE_NAME,
      version: VERSION
    }
  }));

  console.info("[" + ENGINE_NAME + "] V" + VERSION + " ready.");
})(window);
