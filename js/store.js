/* =========================================================
   Travel Intelligence Center
   Central Store V1.0.0

   File Path:
   js/store.js

   Purpose:
   - Single source of truth for all application data.
   - Handles localStorage persistence.
   - Provides read, write, update, delete, backup,
     restore, reset, import, export, and subscriptions.
========================================================= */

(function (window) {
  "use strict";

  const Config = window.TICConfig || window.TIC?.Config;

  if (!Config) {
    throw new Error(
      "TIC Store Error: configuration was not found. Load js/config.js before js/store.js."
    );
  }

  const STORAGE_KEY = Config.storage.stateKey;
  const BACKUP_KEY = Config.storage.backupKey;
  const SCHEMA_VERSION = Config.storage.schemaVersion;
  const AUTO_SAVE_DELAY = Number(Config.storage.autoSaveDelay) || 120;
  const MAX_BACKUPS = Number(Config.storage.maxBackups) || 3;

  const listeners = new Set();
  let saveTimer = null;

  const isObject = (value) =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);

  const clone = (value) => {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
  };

  const nowISO = () => new Date().toISOString();

  const createId = (prefix = "item") => {
    const random =
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    return `${prefix}_${random}`;
  };

  const toNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const deepMerge = (target, source) => {
    const output = isObject(target) ? clone(target) : {};

    if (!isObject(source)) {
      return output;
    }

    Object.keys(source).forEach((key) => {
      const sourceValue = source[key];
      const targetValue = output[key];

      if (isObject(sourceValue) && isObject(targetValue)) {
        output[key] = deepMerge(targetValue, sourceValue);
      } else {
        output[key] = clone(sourceValue);
      }
    });

    return output;
  };

  const getDefaultState = () => ({
    meta: {
      appId: Config.id,
      appVersion: Config.appVersion,
      schemaVersion: SCHEMA_VERSION,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      lastBackupAt: null
    },

    profile: {
      id: "profile_main",
      name: Config.defaults.profileName,
      country: Config.defaults.country,
      city: Config.defaults.city,
      language: Config.defaults.language,
      currency: Config.defaults.currency,
      travelStyle: "Premium Family",
      homeAirport: "Abu Dhabi",
      annualTravelBudget: 30000,
      monthlyTravelSaving: 1500,
      avatar: "",
      createdAt: nowISO(),
      updatedAt: nowISO()
    },

    statistics: {
      totalTrips: 0,
      completedTrips: 0,
      upcomingTrips: 0,
      activeTrips: 0,
      visitedCountries: 0,
      visitedCities: 0,
      wishlistCount: 0,
      totalTravelSpend: 0,
      totalTravelBudget: 0,
      savedForTravel: 0
    },

    trips: [],

    destinations: [],

    wishlist: [],

    guides: {
      savedPlaces: [],
      hotels: [],
      restaurants: [],
      activities: [],
      transport: [],
      notes: []
    },

    budgets: {
      annualBudget: 30000,
      monthlySavingTarget: 1500,
      savingsBalance: 0,
      totalSpent: 0,
      categories: {},
      expenses: []
    },

    savings: {
      goals: [],
      contributions: []
    },

    documents: [],

    packing: {
      templates: [],
      lists: []
    },

    reviews: [],

    memories: [],

    notifications: [],

    settings: {
      currency: Config.defaults.currency,
      language: Config.defaults.language,
      theme: Config.defaults.theme,
      dateFormat: Config.defaults.dateFormat,
      enableAnimations: Config.app.enableAnimations,
      enableNotifications: true,
      confirmBeforeDelete: true,
      autoBackup: true
    }
  });

  const normalizeTrip = (trip = {}) => ({
    id: trip.id || createId("trip"),
    title: String(trip.title || "").trim(),
    destination: String(trip.destination || "").trim(),
    country: String(trip.country || "").trim(),
    city: String(trip.city || "").trim(),
    purpose: trip.purpose || "leisure",
    status: Config.tripStatuses[trip.status]
      ? trip.status
      : Config.defaults.tripStatus,
    startDate: trip.startDate || "",
    endDate: trip.endDate || "",
    travelers: Math.max(
      1,
      Math.min(
        Config.validation.trip.maxTravelers,
        toNumber(trip.travelers, Config.defaults.travelers)
      )
    ),
    budget: Math.max(
      0,
      Math.min(
        Config.validation.trip.maxBudget,
        toNumber(trip.budget, Config.defaults.budget)
      )
    ),
    spent: Math.max(0, toNumber(trip.spent, 0)),
    currency: trip.currency || Config.defaults.currency,
    accommodation: trip.accommodation || null,
    flights: Array.isArray(trip.flights) ? clone(trip.flights) : [],
    bookings: Array.isArray(trip.bookings) ? clone(trip.bookings) : [],
    itinerary: Array.isArray(trip.itinerary) ? clone(trip.itinerary) : [],
    expenses: Array.isArray(trip.expenses) ? clone(trip.expenses) : [],
    documents: Array.isArray(trip.documents) ? clone(trip.documents) : [],
    packing: Array.isArray(trip.packing) ? clone(trip.packing) : [],
    memories: Array.isArray(trip.memories) ? clone(trip.memories) : [],
    notes: String(trip.notes || "").slice(
      0,
      Config.validation.trip.notesMaxLength
    ),
    coverImage: String(trip.coverImage || ""),
    archivedAt: trip.archivedAt || null,
    createdAt: trip.createdAt || nowISO(),
    updatedAt: nowISO()
  });

  const normalizeExpense = (expense = {}) => ({
    id: expense.id || createId("expense"),
    tripId: expense.tripId || null,
    category: expense.category || "other",
    title: String(expense.title || "").trim(),
    amount: Math.max(0, toNumber(expense.amount, 0)),
    currency: expense.currency || Config.defaults.currency,
    date: expense.date || new Date().toISOString().slice(0, 10),
    notes: String(expense.notes || ""),
    createdAt: expense.createdAt || nowISO(),
    updatedAt: nowISO()
  });

  const normalizeState = (input) => {
    const defaults = getDefaultState();
    const merged = deepMerge(defaults, isObject(input) ? input : {});

    merged.meta.appId = Config.id;
    merged.meta.appVersion = Config.appVersion;
    merged.meta.schemaVersion = SCHEMA_VERSION;
    merged.meta.updatedAt = nowISO();

    merged.trips = Array.isArray(merged.trips)
      ? merged.trips.map(normalizeTrip)
      : [];

    merged.budgets.expenses = Array.isArray(merged.budgets.expenses)
      ? merged.budgets.expenses.map(normalizeExpense)
      : [];

    [
      "destinations",
      "wishlist",
      "documents",
      "reviews",
      "memories",
      "notifications"
    ].forEach((key) => {
      if (!Array.isArray(merged[key])) {
        merged[key] = [];
      }
    });

    return merged;
  };

  const calculateStatistics = (state) => {
    const trips = Array.isArray(state.trips) ? state.trips : [];
    const expenses = Array.isArray(state.budgets?.expenses)
      ? state.budgets.expenses
      : [];
    const wishlist = Array.isArray(state.wishlist) ? state.wishlist : [];

    const visibleTrips = trips.filter(
      (trip) => trip.status !== "archived"
    );

    const completedTrips = visibleTrips.filter(
      (trip) => trip.status === "completed"
    );

    const countries = new Set(
      completedTrips
        .map((trip) => String(trip.country || "").trim())
        .filter(Boolean)
    );

    const cities = new Set(
      completedTrips
        .map((trip) => String(trip.city || "").trim())
        .filter(Boolean)
    );

    const totalTravelSpend = expenses.reduce(
      (total, expense) => total + toNumber(expense.amount, 0),
      0
    );

    const totalTravelBudget = visibleTrips.reduce(
      (total, trip) => total + toNumber(trip.budget, 0),
      0
    );

    state.statistics = {
      totalTrips: visibleTrips.length,
      completedTrips: completedTrips.length,
      upcomingTrips: visibleTrips.filter((trip) =>
        ["draft", "planned", "confirmed"].includes(trip.status)
      ).length,
      activeTrips: visibleTrips.filter(
        (trip) => trip.status === "active"
      ).length,
      visitedCountries: countries.size,
      visitedCities: cities.size,
      wishlistCount: wishlist.length,
      totalTravelSpend,
      totalTravelBudget,
      savedForTravel: toNumber(state.budgets?.savingsBalance, 0)
    };

    state.budgets.totalSpent = totalTravelSpend;

    return state;
  };

  const readStoredState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return null;
      }

      return JSON.parse(raw);
    } catch (error) {
      console.error("TIC Store: failed to read saved state.", error);
      return null;
    }
  };

  let state = calculateStatistics(
    normalizeState(readStoredState() || getDefaultState())
  );

  const notify = (event = {}) => {
    const snapshot = clone(state);

    listeners.forEach((listener) => {
      try {
        listener(snapshot, event);
      } catch (error) {
        console.error("TIC Store subscriber error:", error);
      }
    });

    window.dispatchEvent(
      new CustomEvent("tic:store-change", {
        detail: {
          state: snapshot,
          event
        }
      })
    );
  };

  const persistImmediately = (event = { type: "persist" }) => {
    try {
      state.meta.updatedAt = nowISO();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      notify(event);
      return true;
    } catch (error) {
      console.error("TIC Store: failed to save state.", error);
      return false;
    }
  };

  const schedulePersist = (event = { type: "update" }) => {
    window.clearTimeout(saveTimer);

    saveTimer = window.setTimeout(() => {
      persistImmediately(event);
    }, AUTO_SAVE_DELAY);
  };

  const replaceState = (nextState, event = { type: "replace" }) => {
    state = calculateStatistics(normalizeState(nextState));
    persistImmediately(event);
    return clone(state);
  };

  const setByPath = (target, path, value) => {
    const parts = Array.isArray(path)
      ? path
      : String(path)
          .split(".")
          .map((part) => part.trim())
          .filter(Boolean);

    if (!parts.length) {
      return false;
    }

    let cursor = target;

    for (let index = 0; index < parts.length - 1; index += 1) {
      const key = parts[index];

      if (!isObject(cursor[key]) && !Array.isArray(cursor[key])) {
        cursor[key] = {};
      }

      cursor = cursor[key];
    }

    cursor[parts[parts.length - 1]] = clone(value);
    return true;
  };

  const getByPath = (target, path, fallback = null) => {
    const parts = Array.isArray(path)
      ? path
      : String(path)
          .split(".")
          .map((part) => part.trim())
          .filter(Boolean);

    if (!parts.length) {
      return clone(target);
    }

    let cursor = target;

    for (const key of parts) {
      if (
        cursor === null ||
        cursor === undefined ||
        !Object.prototype.hasOwnProperty.call(cursor, key)
      ) {
        return clone(fallback);
      }

      cursor = cursor[key];
    }

    return clone(cursor);
  };

  const findTripIndex = (tripId) =>
    state.trips.findIndex((trip) => trip.id === tripId);

  const Store = {
    version: "1.0.0",

    getState() {
      return clone(state);
    },

    get(path, fallback = null) {
      return getByPath(state, path, fallback);
    },

    set(path, value, options = {}) {
      if (!setByPath(state, path, value)) {
        return false;
      }

      state = calculateStatistics(normalizeState(state));

      if (options.immediate === true) {
        return persistImmediately({
          type: "set",
          path
        });
      }

      schedulePersist({
        type: "set",
        path
      });

      return true;
    },

    patch(path, partialValue, options = {}) {
      const current = getByPath(state, path, {});

      if (!isObject(current) || !isObject(partialValue)) {
        return this.set(path, partialValue, options);
      }

      return this.set(
        path,
        deepMerge(current, partialValue),
        options
      );
    },

    update(mutator, options = {}) {
      if (typeof mutator !== "function") {
        throw new TypeError("TIC Store update requires a function.");
      }

      const draft = clone(state);
      const result = mutator(draft);
      const nextState = result === undefined ? draft : result;

      state = calculateStatistics(normalizeState(nextState));

      if (options.immediate === true) {
        persistImmediately({
          type: "update"
        });
      } else {
        schedulePersist({
          type: "update"
        });
      }

      return clone(state);
    },

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError("TIC Store subscriber must be a function.");
      }

      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    save() {
      return persistImmediately({
        type: "manual-save"
      });
    },

    createTrip(tripData) {
      const trip = normalizeTrip(tripData);

      if (
        trip.title.length <
        Config.validation.trip.titleMinLength
      ) {
        throw new Error("اسم الرحلة قصير جداً.");
      }

      if (
        trip.title.length >
        Config.validation.trip.titleMaxLength
      ) {
        throw new Error("اسم الرحلة أطول من الحد المسموح.");
      }

      state.trips.unshift(trip);
      state = calculateStatistics(normalizeState(state));

      persistImmediately({
        type: "trip-created",
        tripId: trip.id
      });

      return clone(trip);
    },

    updateTrip(tripId, changes = {}) {
      const index = findTripIndex(tripId);

      if (index === -1) {
        return null;
      }

      const updatedTrip = normalizeTrip({
        ...state.trips[index],
        ...clone(changes),
        id: tripId,
        createdAt: state.trips[index].createdAt
      });

      state.trips[index] = updatedTrip;
      state = calculateStatistics(normalizeState(state));

      persistImmediately({
        type: "trip-updated",
        tripId
      });

      return clone(updatedTrip);
    },

    getTrip(tripId) {
      const trip = state.trips.find((item) => item.id === tripId);
      return trip ? clone(trip) : null;
    },

    deleteTrip(tripId) {
      const index = findTripIndex(tripId);

      if (index === -1) {
        return false;
      }

      state.trips.splice(index, 1);
      state.budgets.expenses = state.budgets.expenses.filter(
        (expense) => expense.tripId !== tripId
      );

      state = calculateStatistics(normalizeState(state));

      persistImmediately({
        type: "trip-deleted",
        tripId
      });

      return true;
    },

    archiveTrip(tripId) {
      return this.updateTrip(tripId, {
        status: "archived",
        archivedAt: nowISO()
      });
    },

    restoreTrip(tripId) {
      return this.updateTrip(tripId, {
        status: "planned",
        archivedAt: null
      });
    },

    addExpense(expenseData) {
      const expense = normalizeExpense(expenseData);

      if (!expense.title) {
        throw new Error("اسم المصروف مطلوب.");
      }

      if (expense.amount <= 0) {
        throw new Error("قيمة المصروف يجب أن تكون أكبر من صفر.");
      }

      state.budgets.expenses.unshift(expense);

      if (expense.tripId) {
        const tripIndex = findTripIndex(expense.tripId);

        if (tripIndex !== -1) {
          state.trips[tripIndex].spent =
            toNumber(state.trips[tripIndex].spent, 0) +
            expense.amount;
          state.trips[tripIndex].updatedAt = nowISO();
        }
      }

      state = calculateStatistics(normalizeState(state));

      persistImmediately({
        type: "expense-created",
        expenseId: expense.id
      });

      return clone(expense);
    },

    updateExpense(expenseId, changes = {}) {
      const index = state.budgets.expenses.findIndex(
        (expense) => expense.id === expenseId
      );

      if (index === -1) {
        return null;
      }

      const oldExpense = state.budgets.expenses[index];
      const newExpense = normalizeExpense({
        ...oldExpense,
        ...clone(changes),
        id: expenseId,
        createdAt: oldExpense.createdAt
      });

      state.budgets.expenses[index] = newExpense;

      [oldExpense.tripId, newExpense.tripId]
        .filter(Boolean)
        .forEach((tripId) => {
          const tripIndex = findTripIndex(tripId);

          if (tripIndex !== -1) {
            state.trips[tripIndex].spent =
              state.budgets.expenses
                .filter((expense) => expense.tripId === tripId)
                .reduce(
                  (total, expense) =>
                    total + toNumber(expense.amount, 0),
                  0
                );

            state.trips[tripIndex].updatedAt = nowISO();
          }
        });

      state = calculateStatistics(normalizeState(state));

      persistImmediately({
        type: "expense-updated",
        expenseId
      });

      return clone(newExpense);
    },

    deleteExpense(expenseId) {
      const expense = state.budgets.expenses.find(
        (item) => item.id === expenseId
      );

      if (!expense) {
        return false;
      }

      state.budgets.expenses =
        state.budgets.expenses.filter(
          (item) => item.id !== expenseId
        );

      if (expense.tripId) {
        const tripIndex = findTripIndex(expense.tripId);

        if (tripIndex !== -1) {
          state.trips[tripIndex].spent =
            state.budgets.expenses
              .filter(
                (item) => item.tripId === expense.tripId
              )
              .reduce(
                (total, item) =>
                  total + toNumber(item.amount, 0),
                0
              );

          state.trips[tripIndex].updatedAt = nowISO();
        }
      }

      state = calculateStatistics(normalizeState(state));

      persistImmediately({
        type: "expense-deleted",
        expenseId
      });

      return true;
    },

    createBackup() {
      const backups = this.getBackups();

      const backup = {
        id: createId("backup"),
        createdAt: nowISO(),
        schemaVersion: SCHEMA_VERSION,
        appVersion: Config.appVersion,
        state: clone(state)
      };

      backups.unshift(backup);

      const limitedBackups = backups.slice(0, MAX_BACKUPS);

      try {
        localStorage.setItem(
          BACKUP_KEY,
          JSON.stringify(limitedBackups)
        );

        state.meta.lastBackupAt = backup.createdAt;

        persistImmediately({
          type: "backup-created",
          backupId: backup.id
        });

        return clone(backup);
      } catch (error) {
        console.error("TIC Store: failed to create backup.", error);
        return null;
      }
    },

    getBackups() {
      try {
        const raw = localStorage.getItem(BACKUP_KEY);
        const backups = raw ? JSON.parse(raw) : [];
        return Array.isArray(backups) ? backups : [];
      } catch (error) {
        console.error("TIC Store: failed to read backups.", error);
        return [];
      }
    },

    restoreBackup(backupId) {
      const backup = this.getBackups().find(
        (item) => item.id === backupId
      );

      if (!backup || !backup.state) {
        return false;
      }

      replaceState(backup.state, {
        type: "backup-restored",
        backupId
      });

      return true;
    },

    exportData() {
      return JSON.stringify(
        {
          exportedAt: nowISO(),
          appId: Config.id,
          appVersion: Config.appVersion,
          schemaVersion: SCHEMA_VERSION,
          state: clone(state)
        },
        null,
        2
      );
    },

    importData(payload) {
      let parsed = payload;

      if (typeof payload === "string") {
        parsed = JSON.parse(payload);
      }

      const importedState =
        parsed && parsed.state ? parsed.state : parsed;

      if (!isObject(importedState)) {
        throw new Error("ملف البيانات غير صالح.");
      }

      this.createBackup();

      replaceState(importedState, {
        type: "data-imported"
      });

      return clone(state);
    },

    reset(options = {}) {
      if (options.createBackup !== false) {
        this.createBackup();
      }

      state = calculateStatistics(
        normalizeState(getDefaultState())
      );

      persistImmediately({
        type: "store-reset"
      });

      return clone(state);
    },

    diagnostics() {
      return {
        version: this.version,
        storageKey: STORAGE_KEY,
        backupKey: BACKUP_KEY,
        schemaVersion: SCHEMA_VERSION,
        subscriberCount: listeners.size,
        tripCount: state.trips.length,
        expenseCount: state.budgets.expenses.length,
        lastUpdatedAt: state.meta.updatedAt,
        lastBackupAt: state.meta.lastBackupAt
      };
    }
  };

  if (!readStoredState()) {
    persistImmediately({
      type: "store-initialized"
    });
  }

  window.TIC = window.TIC || {};
  window.TIC.Store = Store;
  window.TICStore = Store;
})(window);
