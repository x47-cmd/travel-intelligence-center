/* =========================================================
   Travel Intelligence Center
   Central Store V2.5.0
   Stable Compatibility & Persistence Core

   File Path:
   js/store.js

   Purpose:
   - Single source of truth for the entire application.
   - Preserves every public API used by current pages and engines.
   - Keeps backward compatibility with Trips, Planned Trips, Guide,
     Passport, Wishlist, Annual Planner, legacy Budget and Finance data.
   - Preserves the Simple Travel Budget Wallet introduced in V2.4.0.
   - Improves normalization, migrations, transactions, backups,
     restore/import/export validation, lifecycle synchronization,
     persistence safety and diagnostics.

   Global APIs:
   - window.TIC.Store
   - window.TICStore
   - window.Store
   - window.TravelStore
========================================================= */

(function centralStoreFactory(window) {
  "use strict";

  const Config = window.TICConfig || window.TIC?.Config;

  if (!Config) {
    throw new Error(
      "TIC Store Error: configuration was not found. Load js/config.js before js/store.js."
    );
  }

  const STORE_VERSION = "2.5.0";
  const STORAGE_KEY = Config.storage?.stateKey || "tic_state";
  const BACKUP_KEY = Config.storage?.backupKey || "tic_backups";
  const SCHEMA_VERSION = Config.storage?.schemaVersion || 1;
  const AUTO_SAVE_DELAY = Math.max(0, Number(Config.storage?.autoSaveDelay) || 120);
  const MAX_BACKUPS = Math.max(1, Number(Config.storage?.maxBackups) || 3);

  const UPCOMING_STATUSES = Object.freeze([
    "draft", "planning", "planned", "booked", "confirmed", "ready"
  ]);
  const ACTIVE_STATUSES = Object.freeze(["ongoing", "active"]);
  const LOCKED_STATUSES = Object.freeze(["cancelled", "archived"]);
  const TRIP_STATUSES = Object.freeze([
    ...UPCOMING_STATUSES,
    ...ACTIVE_STATUSES,
    "completed",
    ...LOCKED_STATUSES
  ]);
  const PLAN_STATUSES = Object.freeze([
    "idea", "considering", "shortlisted", "planned", "ready",
    "converted", "cancelled", "archived"
  ]);
  const REQUIRED_PLANNED_ITEMS = Object.freeze([
    "destinationApproved", "budgetApproved", "flightBooked", "hotelBooked"
  ]);
  const OPTIONAL_PLANNED_ITEMS = Object.freeze([
    "insuranceReady", "visaReady", "documentsReady",
    "activitiesPlanned", "packingReady"
  ]);
  const BUDGET_TRANSACTION_TYPES = Object.freeze([
    "deposit", "withdrawal", "expense"
  ]);

  const listeners = new Set();
  let saveTimer = null;
  let transactionDepth = 0;
  let transactionDraft = null;
  let pendingTransactionEvent = null;
  let state = null;

  /* =========================================================
     Utilities
  ========================================================= */

  const hasOwn = (object, key) =>
    Object.prototype.hasOwnProperty.call(object, key);

  const isObject = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);

  const clone = (value) => {
    if (value === undefined) return undefined;
    if (typeof structuredClone === "function") {
      try { return structuredClone(value); } catch (_) {}
    }
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  };

  const nowISO = () => new Date().toISOString();
  const todayISO = () => nowISO().slice(0, 10);

  const createId = (prefix = "item") => {
    const random =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    return `${prefix}_${random}`;
  };

  const toNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const toNonNegative = (value, fallback = 0) =>
    Math.max(0, toNumber(value, fallback));

  const toText = (value, fallback = "") =>
    String(value === undefined || value === null ? fallback : value).trim();

  const toBoolean = (value, fallback = false) => {
    if (value === true || value === "true" || value === 1 || value === "1") return true;
    if (value === false || value === "false" || value === 0 || value === "0") return false;
    return fallback;
  };

  const toArray = (value) => Array.isArray(value) ? clone(value) : [];

  const firstDefined = (...values) =>
    values.find((value) => value !== undefined && value !== null && value !== "");

  const normalizeCountryCode = (value) => {
    const code = toText(value).toUpperCase();
    return /^[A-Z]{2,3}$/.test(code) ? code : "";
  };

  const normalizeDateValue = (value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return [
        value.getFullYear(),
        String(value.getMonth() + 1).padStart(2, "0"),
        String(value.getDate()).padStart(2, "0")
      ].join("-");
    }

    const raw = toText(value);
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, "0"),
      String(parsed.getDate()).padStart(2, "0")
    ].join("-");
  };

  const normalizeTimeValue = (value) => {
    const raw = toText(value);
    if (!raw) return "";
    const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return raw;
    const hours = Math.min(23, Math.max(0, toNumber(match[1])));
    const minutes = Math.min(59, Math.max(0, toNumber(match[2])));
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  };

  const dateToUtcNumber = (value) => {
    const match = normalizeDateValue(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match
      ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      : null;
  };

  const calculateDurationDays = (startDate, endDate, fallback = 0) => {
    const start = dateToUtcNumber(startDate);
    const end = dateToUtcNumber(endDate);
    if (start === null || end === null || end < start) {
      return Math.max(0, Math.floor(toNumber(fallback, 0)));
    }
    return Math.floor((end - start) / 86400000) + 1;
  };

  const deriveEndDateFromDuration = (startDate, durationDays) => {
    const start = dateToUtcNumber(startDate);
    const duration = Math.max(0, Math.floor(toNumber(durationDays, 0)));
    if (start === null || duration <= 0) return "";
    const date = new Date(start + (duration - 1) * 86400000);
    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
  };

  const deepMerge = (target, source) => {
    const output = isObject(target) ? clone(target) : {};
    if (!isObject(source)) return output;
    Object.keys(source).forEach((key) => {
      const sourceValue = source[key];
      output[key] = isObject(sourceValue) && isObject(output[key])
        ? deepMerge(output[key], sourceValue)
        : clone(sourceValue);
    });
    return output;
  };

  const uniqueById = (items, prefix = "item") => {
    const map = new Map();
    toArray(items).forEach((item) => {
      if (item === null || item === undefined) return;
      const source = isObject(item) ? clone(item) : { value: item };
      const id = String(firstDefined(source.id, source._id, createId(prefix)));
      map.set(id, { ...source, id });
    });
    return Array.from(map.values());
  };

  const safeParse = (raw, fallback = null) => {
    try { return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; }
  };

  const safeStorageGet = (key) => {
    try { return window.localStorage.getItem(key); }
    catch (error) {
      console.error(`TIC Store: failed to read localStorage key "${key}".`, error);
      return null;
    }
  };

  const safeStorageSet = (key, value) => {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.error(`TIC Store: failed to write localStorage key "${key}".`, error);
      return false;
    }
  };

  const emitWindowEvent = (name, detail) => {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (_) {}
  };

  /* =========================================================
     Defaults
  ========================================================= */

  const getDefaultState = () => {
    const timestamp = nowISO();
    const currency = Config.defaults?.currency || "AED";
    const language = Config.defaults?.language || "ar";

    return {
      meta: {
        appId: Config.id,
        appVersion: Config.appVersion,
        storeVersion: STORE_VERSION,
        schemaVersion: SCHEMA_VERSION,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastBackupAt: null,
        lastMigrationAt: null,
        lastTripLifecycleSyncAt: null,
        lastGuideSyncAt: null,
        lastBudgetTravelSyncAt: null,
        lastBudgetWalletSyncAt: null,
        migrationHistory: []
      },
      profile: {
        id: "profile_main",
        name: Config.defaults?.profileName || "يوسف",
        country: Config.defaults?.country || "UAE",
        city: Config.defaults?.city || "Abu Dhabi",
        language,
        currency,
        travelStyle: "Premium Family",
        homeAirport: "Abu Dhabi",
        annualTravelBudget: 30000,
        monthlyTravelSaving: 1500,
        monthlySaving: 1500,
        familyTravel: true,
        halalPreference: true,
        shattafRequired: true,
        quietPreference: true,
        preferredTripDays: 7,
        preferredClimate: "mild",
        avatar: "",
        createdAt: timestamp,
        updatedAt: timestamp
      },
      statistics: {},
      trips: [],
      plannedTrips: [],
      destinations: [],
      wishlist: [],
      annualPlans: [],
      passport: {
        countries: [], visitedCountries: [], history: [], stamps: [], updatedAt: timestamp
      },
      guideIntelligence: {
        selectedCountryCode: null,
        travelDNA: {},
        recommendations: [],
        recentSearches: [],
        countryViews: {},
        lastGeneratedAt: null,
        updatedAt: timestamp
      },
      budgetWallet: {
        version: STORE_VERSION,
        currency,
        openingBalance: 0,
        balance: 0,
        transactions: [],
        createdAt: timestamp,
        updatedAt: timestamp
      },
      budgetTravelIntelligence: {
        currentAnalysis: null,
        recommendations: [],
        timeline: [],
        multiTripPlan: null,
        history: [],
        dismissedRecommendationIds: [],
        acceptedRecommendationIds: [],
        lastGeneratedAt: null,
        updatedAt: timestamp
      },
      guides: {
        savedPlaces: [], hotels: [], restaurants: [], activities: [], transport: [], notes: []
      },
      budgets: {
        annualBudget: 30000,
        monthlySavingTarget: 1500,
        savingsBalance: 0,
        totalSpent: 0,
        categories: {},
        expenses: [],
        updatedAt: timestamp
      },
      expenses: [],
      savings: {
        monthlySaving: 1500,
        monthlySavingTarget: 1500,
        balance: 0,
        currentBalance: 0,
        targetAmount: 30000,
        goals: [],
        contributions: [],
        entries: [],
        transactions: [],
        updatedAt: timestamp
      },
      payments: [],
      budgetAlerts: { items: [], rules: {}, updatedAt: timestamp },
      budgetRecommendations: { items: [], dismissed: [], updatedAt: timestamp },
      budgetNotifications: { items: [], preferences: {}, updatedAt: timestamp },
      budgetIntelligence: {
        analytics: {}, forecast: {}, health: {}, integration: {},
        lastSyncAt: null, updatedAt: timestamp
      },
      finance: {
        expenses: [], savings: {}, payments: [], alerts: {},
        recommendations: {}, notifications: {}, updatedAt: timestamp
      },
      documents: [],
      packing: { templates: [], lists: [] },
      reviews: [],
      memories: [],
      analytics: {},
      notifications: [],
      settings: {
        currency,
        language,
        theme: Config.defaults?.theme || "system",
        dateFormat: Config.defaults?.dateFormat || "DD/MM/YYYY",
        annualTravelBudget: 30000,
        monthlySaving: 1500,
        enableAnimations: Config.app?.enableAnimations !== false,
        enableNotifications: true,
        confirmBeforeDelete: true,
        autoBackup: true
      }
    };
  };

  /* =========================================================
     Normalizers
  ========================================================= */

  const resolveTripStatus = (status) => {
    const value = toText(status || Config.defaults?.tripStatus || "planning");
    return TRIP_STATUSES.includes(value) ? value : "planning";
  };

  const resolveLifecycleStatus = ({ status, startDate, endDate, durationDays }) => {
    const current = resolveTripStatus(status);
    if (LOCKED_STATUSES.includes(current)) return current;

    const start = dateToUtcNumber(startDate);
    const end = dateToUtcNumber(endDate || deriveEndDateFromDuration(startDate, durationDays));
    const today = dateToUtcNumber(todayISO());

    if (start === null && end === null) return current;
    if (end !== null && today > end) return "completed";
    if (start !== null && today < start) {
      return UPCOMING_STATUSES.includes(current) ? current : "planning";
    }
    if (start !== null && today >= start && (end === null || today <= end)) {
      return "active";
    }
    return current;
  };

  const normalizeTripChecklist = (checklist = {}) => ({
    destinationApproved: toBoolean(checklist.destinationApproved, true),
    budgetApproved: toBoolean(checklist.budgetApproved, false),
    flightBooked: toBoolean(checklist.flightBooked, false),
    hotelBooked: toBoolean(checklist.hotelBooked, false),
    documentsReady: toBoolean(checklist.documentsReady, false),
    insuranceReady: toBoolean(checklist.insuranceReady, false),
    visaReady: toBoolean(checklist.visaReady, false),
    transportPlanned: toBoolean(checklist.transportPlanned, false),
    itineraryReady: toBoolean(checklist.itineraryReady, false),
    activitiesPlanned: toBoolean(checklist.activitiesPlanned, false),
    packingReady: toBoolean(checklist.packingReady, false)
  });

  const normalizeTrip = (trip = {}, options = {}) => {
    const source = isObject(trip) ? clone(trip) : {};
    const startDate = normalizeDateValue(source.startDate);
    const rawDuration = Math.max(0, Math.floor(toNumber(firstDefined(source.durationDays, source.days), 0)));
    const endDate = normalizeDateValue(source.endDate) || deriveEndDateFromDuration(startDate, rawDuration);
    const durationDays = calculateDurationDays(startDate, endDate, rawDuration);
    const status = resolveLifecycleStatus({ status: source.status, startDate, endDate, durationDays });
    const timestamp = nowISO();

    return {
      ...source,
      id: source.id || createId("trip"),
      title: toText(source.title),
      destination: toText(firstDefined(source.destination, source.destinationCountry)),
      country: toText(firstDefined(source.country, source.destinationCountry)),
      countryCode: normalizeCountryCode(firstDefined(
        source.countryCode, source.destinationCountryCode, source.guideCountryCode
      )),
      city: toText(firstDefined(source.city, source.destinationCity)),
      purpose: toText(source.purpose, "leisure") || "leisure",
      tripType: toText(source.tripType, "family") || "family",
      travelStyle: toText(source.travelStyle, "premium-family") || "premium-family",
      priority: toText(source.priority, "normal") || "normal",
      status,
      planningStatus:
        status === "completed" ? "completed" :
        status === "active" ? "active" :
        status === "ready" ? "ready" :
        toText(source.planningStatus, "planned") || "planned",
      lifecycleStatus: status,
      completedAt: status === "completed"
        ? (source.completedAt || timestamp)
        : (source.completedAt || null),
      startDate,
      endDate,
      durationDays,
      days: durationDays,
      travelers: Math.max(1, Math.floor(toNumber(source.travelers, 1))),
      adults: Math.max(0, Math.floor(toNumber(source.adults, source.travelers || 1))),
      children: Math.max(0, Math.floor(toNumber(source.children, 0))),
      infants: Math.max(0, Math.floor(toNumber(source.infants, 0))),
      budget: toNonNegative(firstDefined(source.budget, source.estimatedBudget, 0)),
      estimatedBudget: toNonNegative(firstDefined(source.estimatedBudget, source.budget, 0)),
      spent: toNonNegative(source.spent, 0),
      currency: toText(source.currency, Config.defaults?.currency || "AED") || "AED",
      departureAirport: toText(source.departureAirport || source.originAirport),
      arrivalAirport: toText(source.arrivalAirport || source.destinationAirport),
      airline: toText(source.airline || source.airlineName),
      flightNumber: toText(source.flightNumber || source.flightNo),
      departureDate: normalizeDateValue(source.departureDate || source.flightDate),
      departureTime: normalizeTimeValue(source.departureTime || source.flightTime),
      arrivalDate: normalizeDateValue(source.arrivalDate),
      arrivalTime: normalizeTimeValue(source.arrivalTime),
      bookingReference: toText(source.bookingReference || source.pnr || source.confirmationNumber),
      airportLeadMinutes: Math.max(0, Math.floor(toNumber(source.airportLeadMinutes, 120))),
      accommodation: typeof source.accommodation === "string"
        ? source.accommodation.trim()
        : source.accommodation ? clone(source.accommodation) : "",
      accommodationAddress: toText(source.accommodationAddress || source.hotelAddress),
      hotelName: toText(source.hotelName || source.accommodationName),
      hotelBookingReference: toText(source.hotelBookingReference || source.hotelConfirmationNumber),
      hotelCheckIn: normalizeDateValue(source.hotelCheckIn || source.checkIn),
      hotelCheckOut: normalizeDateValue(source.hotelCheckOut || source.checkOut),
      activities: toArray(source.activities),
      notes: toText(source.notes),
      emergencyContact: toText(source.emergencyContact),
      visaRequired: toBoolean(source.visaRequired, false),
      insuranceRequired: toBoolean(source.insuranceRequired, true),
      featured: toBoolean(source.featured, false),
      annualPlanId: source.annualPlanId || null,
      plannedTripId: source.plannedTripId || null,
      sourceRecommendationId: source.sourceRecommendationId || null,
      source: toText(source.source, "manual") || "manual",
      checklist: normalizeTripChecklist(source.checklist),
      costBreakdown: isObject(source.costBreakdown) ? clone(source.costBreakdown) : {},
      flights: toArray(source.flights),
      bookings: toArray(source.bookings),
      itinerary: toArray(source.itinerary),
      expenses: toArray(source.expenses),
      documents: toArray(source.documents),
      packing: toArray(source.packing),
      memories: toArray(source.memories),
      coverImage: toText(source.coverImage),
      archivedAt: source.archivedAt || null,
      convertedAt: source.convertedAt || null,
      createdAt: source.createdAt || timestamp,
      updatedAt: options.preserveUpdatedAt ? (source.updatedAt || timestamp) : timestamp
    };
  };

  const normalizePlannedChecklist = (checklist = {}, estimatedBudget = 0) => ({
    destinationApproved: toBoolean(checklist.destinationApproved, true),
    budgetApproved: toBoolean(checklist.budgetApproved, toNonNegative(estimatedBudget) > 0),
    flightBooked: toBoolean(checklist.flightBooked, false),
    hotelBooked: toBoolean(checklist.hotelBooked, false),
    insuranceReady: toBoolean(checklist.insuranceReady, false),
    visaReady: toBoolean(checklist.visaReady, false),
    documentsReady: toBoolean(checklist.documentsReady, false),
    activitiesPlanned: toBoolean(checklist.activitiesPlanned, false),
    packingReady: toBoolean(checklist.packingReady, false)
  });

  const calculatePlannedReadiness = (trip = {}) => {
    const checklist = normalizePlannedChecklist(trip.checklist, trip.estimatedBudget);
    const requiredCompleted = REQUIRED_PLANNED_ITEMS.filter((item) => checklist[item]).length;
    const optionalCompleted = OPTIONAL_PLANNED_ITEMS.filter((item) => checklist[item]).length;
    return {
      percentage: Math.round(
        (requiredCompleted / REQUIRED_PLANNED_ITEMS.length) * 80 +
        (optionalCompleted / OPTIONAL_PLANNED_ITEMS.length) * 20
      ),
      requiredCompleted,
      requiredTotal: REQUIRED_PLANNED_ITEMS.length,
      optionalCompleted,
      optionalTotal: OPTIONAL_PLANNED_ITEMS.length,
      readyForConversion: REQUIRED_PLANNED_ITEMS.every((item) => checklist[item] === true),
      missingRequiredItems: REQUIRED_PLANNED_ITEMS.filter((item) => checklist[item] !== true)
    };
  };

  const normalizePlannedTrip = (trip = {}, options = {}) => {
    const source = isObject(trip) ? clone(trip) : {};
    const estimatedBudget = toNonNegative(firstDefined(source.estimatedBudget, source.budget, 0));
    const checklist = normalizePlannedChecklist(source.checklist, estimatedBudget);
    const readiness = calculatePlannedReadiness({ ...source, estimatedBudget, checklist });
    let status = toText(source.status, "planned");
    if (!["converted", "archived", "cancelled"].includes(status)) {
      status = readiness.readyForConversion ? "ready" : "planned";
    }
    const timestamp = nowISO();

    return {
      ...source,
      id: source.id || createId("planned_trip"),
      type: "planned",
      status,
      title: toText(source.title) || [source.city, source.country].filter(Boolean).join("، ") || "رحلة مخطط لها",
      destinationId: toText(source.destinationId),
      country: toText(source.country),
      countryCode: normalizeCountryCode(source.countryCode),
      city: toText(source.city),
      startDate: normalizeDateValue(source.startDate),
      endDate: normalizeDateValue(source.endDate),
      suggestedMonth: source.suggestedMonth !== undefined && source.suggestedMonth !== null && source.suggestedMonth !== ""
        ? Math.min(12, Math.max(1, Math.floor(toNumber(source.suggestedMonth, 1))))
        : null,
      durationDays: Math.max(1, Math.floor(toNumber(source.durationDays, 5))),
      travelers: Math.max(1, Math.floor(toNumber(source.travelers, 1))),
      estimatedBudget,
      currency: toText(source.currency, Config.defaults?.currency || "AED") || "AED",
      sourceRecommendationId: source.sourceRecommendationId || null,
      sourceAnalysisId: source.sourceAnalysisId || null,
      source: isObject(source.source)
        ? clone(source.source)
        : { engine: toText(source.source, "manual") || "manual" },
      costBreakdown: isObject(source.costBreakdown) ? clone(source.costBreakdown) : {},
      highlights: toArray(source.highlights),
      checklist,
      readiness,
      notes: toText(source.notes),
      booking: isObject(source.booking)
        ? clone(source.booking)
        : { flightReference: "", hotelReference: "" },
      convertedTripId: source.convertedTripId || null,
      convertedAt: source.convertedAt || null,
      archived: status === "archived" || toBoolean(source.archived, false),
      createdAt: source.createdAt || timestamp,
      updatedAt: options.preserveUpdatedAt ? (source.updatedAt || timestamp) : timestamp
    };
  };

  const normalizeWishlistItem = (item = {}, options = {}) => {
    const source = isObject(item) ? clone(item) : { countryCode: item };
    const timestamp = nowISO();
    return {
      ...source,
      id: source.id || createId("wishlist"),
      countryCode: normalizeCountryCode(firstDefined(source.countryCode, source.code, source.iso2)),
      countryName: toText(source.countryName),
      source: toText(source.source, "guide") || "guide",
      priority: Math.min(5, Math.max(1, Math.floor(toNumber(source.priority, 3)))),
      preferredMonth: source.preferredMonth
        ? Math.min(12, Math.max(1, Math.floor(toNumber(source.preferredMonth, 1))))
        : null,
      preferredYear: toNumber(source.preferredYear, 0) || null,
      notes: toText(source.notes),
      metadata: isObject(source.metadata) ? clone(source.metadata) : {},
      createdAt: source.createdAt || timestamp,
      updatedAt: options.preserveUpdatedAt ? (source.updatedAt || timestamp) : timestamp
    };
  };

  const normalizeAnnualPlan = (plan = {}, options = {}) => {
    const source = isObject(plan) ? clone(plan) : {};
    const timestamp = nowISO();
    const status = toText(source.status);
    return {
      ...source,
      id: source.id || createId("annual_plan"),
      countryCode: normalizeCountryCode(source.countryCode),
      countryName: toText(source.countryName || source.country),
      year: Math.max(new Date().getFullYear(), Math.floor(toNumber(source.year, new Date().getFullYear()))),
      month: source.month ? Math.min(12, Math.max(1, Math.floor(toNumber(source.month, 1)))) : null,
      days: Math.max(1, Math.floor(toNumber(source.days, 7))),
      travelers: Math.max(1, Math.floor(toNumber(source.travelers, 1))),
      budgetAED: toNonNegative(firstDefined(source.budgetAED, source.budget, 0)),
      status: PLAN_STATUSES.includes(status) ? status : "idea",
      source: toText(source.source, "guide") || "guide",
      convertedTripId: source.convertedTripId || source.tripId || null,
      checklist: {
        destinationSelected: source.checklist?.destinationSelected !== false,
        budgetReviewed: toBoolean(source.checklist?.budgetReviewed, false),
        datesSelected: toBoolean(source.checklist?.datesSelected, false),
        flightBooked: toBoolean(source.checklist?.flightBooked, false),
        hotelBooked: toBoolean(source.checklist?.hotelBooked, false),
        documentsReady: toBoolean(source.checklist?.documentsReady, false)
      },
      tags: toArray(source.tags),
      notes: toText(source.notes),
      createdAt: source.createdAt || timestamp,
      updatedAt: options.preserveUpdatedAt ? (source.updatedAt || timestamp) : timestamp
    };
  };

  const normalizeExpense = (expense = {}, options = {}) => {
    const source = isObject(expense) ? clone(expense) : {};
    const timestamp = nowISO();
    return {
      ...source,
      id: source.id || source._id || createId("expense"),
      tripId: source.tripId || null,
      category: toText(source.category || source.type, "other") || "other",
      type: toText(source.type || source.category, "other") || "other",
      title: toText(source.title || source.name || source.description),
      amount: toNonNegative(firstDefined(source.amount, source.total, source.value, 0)),
      currency: toText(source.currency, Config.defaults?.currency || "AED") || "AED",
      date: normalizeDateValue(firstDefined(source.date, source.paidAt, source.expenseDate)),
      status: toText(source.status, "paid") || "paid",
      paymentMethod: toText(source.paymentMethod || source.method, "other") || "other",
      notes: toText(source.notes),
      deletedAt: source.deletedAt || null,
      isDeleted: toBoolean(source.isDeleted, false),
      createdAt: source.createdAt || timestamp,
      updatedAt: options.preserveUpdatedAt ? (source.updatedAt || timestamp) : timestamp
    };
  };

  const normalizeSavingEntry = (entry = {}, options = {}) => {
    const source = isObject(entry) ? clone(entry) : { amount: entry };
    const timestamp = nowISO();
    return {
      ...source,
      id: source.id || createId("saving"),
      type: toText(source.type, "deposit") || "deposit",
      amount: toNonNegative(source.amount),
      date: normalizeDateValue(source.date) || todayISO(),
      notes: toText(source.notes),
      createdAt: source.createdAt || timestamp,
      updatedAt: options.preserveUpdatedAt ? (source.updatedAt || timestamp) : timestamp
    };
  };

  const normalizePayment = (payment = {}, options = {}) => {
    const source = isObject(payment) ? clone(payment) : {};
    const amount = toNonNegative(source.amount);
    const paidAmount = Math.min(amount, toNonNegative(source.paidAmount));
    let status = toText(source.status, "pending") || "pending";
    if (amount > 0 && paidAmount >= amount) status = "paid";
    else if (paidAmount > 0) status = "partial";
    else if (source.dueDate && dateToUtcNumber(source.dueDate) < dateToUtcNumber(todayISO()) && status === "pending") status = "overdue";
    const timestamp = nowISO();
    return {
      ...source,
      id: source.id || createId("payment"),
      tripId: source.tripId || null,
      expenseId: source.expenseId || null,
      title: toText(source.title || source.name),
      type: toText(source.type, "other") || "other",
      amount,
      paidAmount,
      remainingAmount: Math.max(0, amount - paidAmount),
      progressPercent: amount > 0 ? Math.round((paidAmount / amount) * 100) : 0,
      currency: toText(source.currency, Config.defaults?.currency || "AED") || "AED",
      status,
      dueDate: normalizeDateValue(source.dueDate),
      paidAt: source.paidAt || null,
      paymentMethod: toText(source.paymentMethod, "other") || "other",
      notes: toText(source.notes),
      deletedAt: source.deletedAt || null,
      createdAt: source.createdAt || timestamp,
      updatedAt: options.preserveUpdatedAt ? (source.updatedAt || timestamp) : timestamp
    };
  };

  const normalizeBudgetTransaction = (transaction = {}, index = 0, options = {}) => {
    const source = isObject(transaction) ? clone(transaction) : {};
    const rawType = toText(source.type, "deposit");
    const type = BUDGET_TRANSACTION_TYPES.includes(rawType) ? rawType : "deposit";
    const timestamp = nowISO();
    return {
      ...source,
      id: source.id || createId(`budget_tx_${index}`),
      type,
      amount: toNonNegative(source.amount),
      title: toText(source.title,
        type === "deposit" ? "إضافة رصيد" :
        type === "withdrawal" ? "سحب من الرصيد" : "مصروف سفر"
      ),
      category: toText(source.category, type === "expense" ? "other" : ""),
      notes: toText(source.notes),
      date: normalizeDateValue(source.date || source.createdAt || todayISO()) || todayISO(),
      source: toText(source.source, "budget-page") || "budget-page",
      createdAt: source.createdAt || timestamp,
      updatedAt: options.preserveUpdatedAt ? (source.updatedAt || timestamp) : timestamp
    };
  };

  const calculateBudgetWalletTotals = (wallet = {}) => {
    const openingBalance = toNonNegative(wallet.openingBalance);
    let deposits = openingBalance;
    let withdrawals = 0;
    let expenses = 0;

    toArray(wallet.transactions).forEach((transaction) => {
      const amount = toNonNegative(transaction.amount);
      if (transaction.type === "deposit") deposits += amount;
      else if (transaction.type === "withdrawal") withdrawals += amount;
      else if (transaction.type === "expense") expenses += amount;
    });

    const rawBalance = deposits - withdrawals - expenses;
    return {
      deposits,
      withdrawals,
      expenses,
      balance: Math.max(0, rawBalance),
      rawBalance,
      transactionCount: toArray(wallet.transactions).length
    };
  };

  const normalizeBudgetWallet = (wallet = {}, currency = Config.defaults?.currency || "AED", options = {}) => {
    const source = isObject(wallet) ? clone(wallet) : {};
    const transactions = uniqueById(
      toArray(source.transactions)
        .map((transaction, index) => normalizeBudgetTransaction(transaction, index, options))
        .filter((transaction) => transaction.amount > 0),
      "budget_tx"
    ).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    const normalized = {
      ...source,
      version: STORE_VERSION,
      currency: toText(source.currency, currency) || currency,
      openingBalance: toNonNegative(source.openingBalance),
      transactions,
      createdAt: source.createdAt || nowISO(),
      updatedAt: options.preserveUpdatedAt ? (source.updatedAt || nowISO()) : nowISO()
    };
    const totals = calculateBudgetWalletTotals(normalized);
    return { ...normalized, balance: totals.balance, totals };
  };

  /* =========================================================
     Migration and state normalization
  ========================================================= */

  const migrateLegacyState = (input) => {
    const source = isObject(input) ? clone(input) : {};
    const migrationHistory = toArray(source.meta?.migrationHistory);

    if (!Array.isArray(source.trips) && Array.isArray(source.travelTrips)) {
      source.trips = source.travelTrips;
    }
    if (!Array.isArray(source.plannedTrips) && Array.isArray(source.tripPlans)) {
      source.plannedTrips = source.tripPlans;
    }
    if (!Array.isArray(source.wishlist) && Array.isArray(source.destinationsWishlist)) {
      source.wishlist = source.destinationsWishlist;
    }
    if (!Array.isArray(source.annualPlans) && Array.isArray(source.annualPlanner)) {
      source.annualPlans = source.annualPlanner;
    }
    if (!Array.isArray(source.expenses) && Array.isArray(source.finance?.expenses)) {
      source.expenses = source.finance.expenses;
    }
    if (!Array.isArray(source.payments) && Array.isArray(source.finance?.payments)) {
      source.payments = source.finance.payments;
    }
    if (!isObject(source.savings) && isObject(source.finance?.savings)) {
      source.savings = source.finance.savings;
    }

    source.meta = isObject(source.meta) ? source.meta : {};
    const previousVersion = toText(source.meta.storeVersion, "legacy");
    if (previousVersion !== STORE_VERSION) {
      migrationHistory.unshift({
        id: createId("migration"),
        fromStoreVersion: previousVersion,
        toStoreVersion: STORE_VERSION,
        migratedAt: nowISO()
      });
    }
    source.meta.migrationHistory = migrationHistory.slice(0, 25);
    return source;
  };

  const normalizeState = (input, options = {}) => {
    const defaults = getDefaultState();
    const migrated = migrateLegacyState(input);
    const merged = deepMerge(defaults, migrated);
    const preserveUpdatedAt = options.preserveUpdatedAt === true;
    const timestamp = nowISO();

    merged.meta = deepMerge(defaults.meta, merged.meta);
    merged.meta.appId = Config.id;
    merged.meta.appVersion = Config.appVersion;
    merged.meta.storeVersion = STORE_VERSION;
    merged.meta.schemaVersion = SCHEMA_VERSION;
    merged.meta.createdAt = merged.meta.createdAt || timestamp;
    merged.meta.updatedAt = preserveUpdatedAt ? (merged.meta.updatedAt || timestamp) : timestamp;
    merged.meta.migrationHistory = toArray(merged.meta.migrationHistory).slice(0, 25);

    merged.profile = deepMerge(defaults.profile, merged.profile);
    merged.profile.updatedAt = preserveUpdatedAt ? (merged.profile.updatedAt || timestamp) : timestamp;

    merged.trips = uniqueById(
      toArray(merged.trips).map((trip) => normalizeTrip(trip, { preserveUpdatedAt })),
      "trip"
    );
    merged.plannedTrips = uniqueById(
      toArray(merged.plannedTrips).map((trip) => normalizePlannedTrip(trip, { preserveUpdatedAt })),
      "planned_trip"
    );
    merged.wishlist = uniqueById(
      toArray(merged.wishlist).map((item) => normalizeWishlistItem(item, { preserveUpdatedAt })),
      "wishlist"
    ).filter((item) => item.countryCode);
    merged.annualPlans = uniqueById(
      toArray(merged.annualPlans).map((plan) => normalizeAnnualPlan(plan, { preserveUpdatedAt })),
      "annual_plan"
    );

    merged.expenses = uniqueById(
      [
        ...toArray(merged.expenses),
        ...toArray(merged.budgets?.expenses),
        ...toArray(merged.finance?.expenses)
      ].map((expense) => normalizeExpense(expense, { preserveUpdatedAt })),
      "expense"
    );

    merged.savings = deepMerge(defaults.savings, isObject(merged.savings) ? merged.savings : {});
    merged.savings.entries = uniqueById(
      [
        ...toArray(merged.savings.entries),
        ...toArray(merged.savings.contributions),
        ...toArray(merged.savings.transactions)
      ].map((entry) => normalizeSavingEntry(entry, { preserveUpdatedAt })),
      "saving"
    );
    merged.savings.monthlySaving = toNonNegative(firstDefined(
      merged.savings.monthlySaving,
      merged.profile?.monthlySaving,
      merged.settings?.monthlySaving,
      1500
    ));
    merged.savings.monthlySavingTarget = merged.savings.monthlySaving;

    merged.payments = uniqueById(
      [...toArray(merged.payments), ...toArray(merged.finance?.payments)]
        .map((payment) => normalizePayment(payment, { preserveUpdatedAt })),
      "payment"
    );

    merged.budgetWallet = normalizeBudgetWallet(
      merged.budgetWallet,
      merged.profile?.currency || Config.defaults?.currency || "AED",
      { preserveUpdatedAt }
    );

    merged.budgetTravelIntelligence = deepMerge(
      defaults.budgetTravelIntelligence,
      isObject(merged.budgetTravelIntelligence) ? merged.budgetTravelIntelligence : {}
    );
    merged.budgetTravelIntelligence.recommendations = uniqueById(
      toArray(merged.budgetTravelIntelligence.recommendations),
      "budget_recommendation"
    );
    merged.budgetTravelIntelligence.history = uniqueById(
      toArray(merged.budgetTravelIntelligence.history),
      "budget_analysis"
    ).slice(0, 20);
    merged.budgetTravelIntelligence.dismissedRecommendationIds = Array.from(new Set(
      toArray(merged.budgetTravelIntelligence.dismissedRecommendationIds).map(String)
    ));
    merged.budgetTravelIntelligence.acceptedRecommendationIds = Array.from(new Set(
      toArray(merged.budgetTravelIntelligence.acceptedRecommendationIds).map(String)
    ));

    merged.budgets = deepMerge(defaults.budgets, merged.budgets);
    merged.finance = deepMerge(defaults.finance, merged.finance);
    merged.guideIntelligence = deepMerge(defaults.guideIntelligence, merged.guideIntelligence);
    merged.passport = deepMerge(defaults.passport, merged.passport);
    merged.settings = deepMerge(defaults.settings, merged.settings);

    merged.budgets.expenses = clone(merged.expenses);
    merged.budgets.savingsBalance = merged.budgetWallet.balance;
    merged.budgets.monthlySavingTarget = merged.savings.monthlySaving;
    merged.savings.balance = merged.budgetWallet.balance;
    merged.savings.currentBalance = merged.budgetWallet.balance;
    merged.finance.expenses = clone(merged.expenses);
    merged.finance.savings = clone(merged.savings);
    merged.finance.payments = clone(merged.payments);
    merged.finance.updatedAt = preserveUpdatedAt ? (merged.finance.updatedAt || timestamp) : timestamp;

    return merged;
  };

  const calculateStatistics = (currentState) => {
    const visibleTrips = currentState.trips.filter((trip) => trip.status !== "archived");
    const visiblePlannedTrips = currentState.plannedTrips.filter(
      (trip) => !["archived", "cancelled"].includes(trip.status)
    );
    const completedTrips = visibleTrips.filter((trip) => trip.status === "completed");
    const expenses = currentState.expenses.filter(
      (expense) => !expense.deletedAt && expense.isDeleted !== true && expense.status !== "cancelled"
    );
    const countries = new Set(completedTrips.map(
      (trip) => trip.countryCode || toText(trip.country).toLowerCase()
    ).filter(Boolean));
    const cities = new Set(completedTrips.map(
      (trip) => toText(trip.city).toLowerCase()
    ).filter(Boolean));
    const totalTravelSpend = expenses.reduce((sum, expense) => sum + toNonNegative(expense.amount), 0);
    const totalTravelBudget = visibleTrips.reduce((sum, trip) => sum + toNonNegative(trip.budget), 0);
    const walletTotals = calculateBudgetWalletTotals(currentState.budgetWallet);

    currentState.budgetWallet.balance = walletTotals.balance;
    currentState.budgetWallet.totals = walletTotals;
    currentState.statistics = {
      totalTrips: visibleTrips.length,
      completedTrips: completedTrips.length,
      upcomingTrips: visibleTrips.filter((trip) => UPCOMING_STATUSES.includes(trip.status)).length,
      activeTrips: visibleTrips.filter((trip) => ACTIVE_STATUSES.includes(trip.status)).length,
      plannedTrips: visiblePlannedTrips.length,
      readyPlannedTrips: visiblePlannedTrips.filter((trip) => trip.readiness?.readyForConversion).length,
      convertedPlannedTrips: currentState.plannedTrips.filter((trip) => trip.status === "converted").length,
      visitedCountries: countries.size,
      visitedCities: cities.size,
      wishlistCount: currentState.wishlist.length,
      annualPlanCount: currentState.annualPlans.length,
      readyAnnualPlans: currentState.annualPlans.filter(
        (plan) => plan.checklist?.flightBooked && plan.checklist?.hotelBooked
      ).length,
      totalTravelSpend,
      totalTravelBudget,
      savedForTravel: walletTotals.balance,
      expenseCount: expenses.length,
      paymentCount: currentState.payments.length,
      overduePayments: currentState.payments.filter((payment) => payment.status === "overdue").length,
      activeBudgetAlerts: toArray(currentState.budgetAlerts?.items).filter(
        (alert) => !["resolved", "dismissed"].includes(alert.status)
      ).length,
      unreadBudgetNotifications: toArray(currentState.budgetNotifications?.items).filter(
        (notification) => notification.read !== true && notification.status === "active"
      ).length,
      budgetTravelRecommendationCount: currentState.budgetTravelIntelligence.recommendations.length,
      budgetWalletBalance: walletTotals.balance,
      budgetWalletDeposits: walletTotals.deposits,
      budgetWalletWithdrawals: walletTotals.withdrawals,
      budgetWalletExpenses: walletTotals.expenses,
      budgetWalletTransactionCount: walletTotals.transactionCount
    };

    currentState.budgets.totalSpent = totalTravelSpend;
    currentState.budgets.savingsBalance = walletTotals.balance;
    currentState.savings.balance = walletTotals.balance;
    currentState.savings.currentBalance = walletTotals.balance;
    currentState.budgets.updatedAt = nowISO();
    return currentState;
  };

  const rebuildState = (nextState, options = {}) =>
    calculateStatistics(normalizeState(nextState, options));

  const readStoredState = () => safeParse(safeStorageGet(STORAGE_KEY), null);

  /* =========================================================
     Persistence
  ========================================================= */

  const notifyListeners = (event = {}) => {
    const snapshot = clone(state);
    listeners.forEach((listener) => {
      try { listener(snapshot, event); }
      catch (error) { console.error("TIC Store subscriber error:", error); }
    });
    const detail = { state: snapshot, event };
    emitWindowEvent("tic:store-change", detail);
    emitWindowEvent("store:changed", detail);
  };

  const persistImmediately = (event = { type: "persist" }) => {
    window.clearTimeout(saveTimer);
    saveTimer = null;
    state.meta.updatedAt = nowISO();
    const success = safeStorageSet(STORAGE_KEY, JSON.stringify(state));
    if (success) notifyListeners(event);
    return success;
  };

  const schedulePersist = (event = { type: "update" }) => {
    if (transactionDepth > 0) {
      pendingTransactionEvent = pendingTransactionEvent || event;
      return true;
    }
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => persistImmediately(event), AUTO_SAVE_DELAY);
    return true;
  };

  const replaceStateInternal = (nextState, event = { type: "replace" }, options = {}) => {
    state = rebuildState(nextState, options);
    persistImmediately(event);
    return clone(state);
  };

  const commitMutation = (mutator, event, options = {}) => {
    const working = transactionDepth > 0 && transactionDraft ? transactionDraft : clone(state);
    const result = mutator(working);
    const candidate = result === undefined ? working : result;
    const rebuilt = rebuildState(candidate);

    if (transactionDepth > 0) {
      transactionDraft = rebuilt;
      pendingTransactionEvent = pendingTransactionEvent || event;
      return clone(rebuilt);
    }

    state = rebuilt;
    if (options.immediate === false) schedulePersist(event);
    else persistImmediately(event);
    return clone(state);
  };

  const findTripIndex = (tripId, source = state) =>
    source.trips.findIndex((trip) => String(trip.id) === String(tripId));
  const findPlannedTripIndex = (tripId, source = state) =>
    source.plannedTrips.findIndex((trip) => String(trip.id) === String(tripId));
  const findBudgetTransactionIndex = (transactionId, source = state) =>
    source.budgetWallet.transactions.findIndex(
      (transaction) => String(transaction.id) === String(transactionId)
    );

  const emitBudgetWalletChanged = (transaction = null, transactionId = null) => {
    emitWindowEvent("tic:budget-wallet-changed", {
      wallet: clone(state.budgetWallet),
      transaction: clone(transaction),
      transactionId
    });
  };

  /* =========================================================
     Public API
  ========================================================= */

  const Store = {
    version: STORE_VERSION,

    getState() { return clone(state); },

    get(path, fallback = null) {
      if (!path) return clone(state);
      const parts = String(path).split(".").filter(Boolean);
      let cursor = state;
      for (const key of parts) {
        if (cursor === null || cursor === undefined || !hasOwn(cursor, key)) return clone(fallback);
        cursor = cursor[key];
      }
      return clone(cursor);
    },

    set(path, value, options = {}) {
      const parts = String(path).split(".").filter(Boolean);
      if (!parts.length) return false;
      commitMutation((draft) => {
        let cursor = draft;
        for (let index = 0; index < parts.length - 1; index += 1) {
          const key = parts[index];
          if (!isObject(cursor[key]) && !Array.isArray(cursor[key])) cursor[key] = {};
          cursor = cursor[key];
        }
        cursor[parts[parts.length - 1]] = clone(value);
      }, { type: "set", path }, { immediate: options.immediate === true });
      return true;
    },

    update(mutator, options = {}) {
      if (typeof mutator !== "function") {
        throw new TypeError("TIC Store update requires a function.");
      }
      return commitMutation(mutator, {
        type: options.eventType || "update"
      }, { immediate: options.immediate === true });
    },

    setState(nextState, options = {}) {
      if (typeof nextState === "function") return this.update(nextState, options);
      return replaceStateInternal(nextState, { type: options.eventType || "set-state" });
    },

    replaceState(nextState, options = {}) {
      return replaceStateInternal(nextState, { type: options.eventType || "replace-state" });
    },

    patch(path, value, options = {}) {
      if (isObject(path) && value === undefined) {
        return this.update((draft) => deepMerge(draft, path), options);
      }
      const current = this.get(path, {});
      return this.set(path,
        isObject(current) && isObject(value) ? deepMerge(current, value) : value,
        options
      );
    },

    transaction(mutator, options = {}) {
      if (typeof mutator !== "function") {
        throw new TypeError("TIC Store transaction requires a function.");
      }
      const outermost = transactionDepth === 0;
      if (outermost) transactionDraft = clone(state);
      transactionDepth += 1;
      try {
        const result = mutator(transactionDraft);
        if (result !== undefined) transactionDraft = result;
        transactionDraft = rebuildState(transactionDraft);
        return clone(transactionDraft);
      } catch (error) {
        if (outermost) {
          transactionDraft = null;
          pendingTransactionEvent = null;
        }
        throw error;
      } finally {
        transactionDepth -= 1;
        if (outermost && transactionDepth === 0 && transactionDraft) {
          state = transactionDraft;
          transactionDraft = null;
          const event = pendingTransactionEvent || { type: options.eventType || "transaction" };
          pendingTransactionEvent = null;
          persistImmediately(event);
        }
      }
    },

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError("TIC Store subscriber must be a function.");
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    save() { return persistImmediately({ type: "manual-save" }); },

    dispatch(actionOrObject, payload) {
      const action = typeof actionOrObject === "string" ? actionOrObject : actionOrObject?.type;
      const data = typeof actionOrObject === "string" ? payload : actionOrObject?.payload;
      const handlers = {
        "trips/add": () => this.createTrip(data),
        ADD_TRIP: () => this.createTrip(data),
        "trips/update": () => this.updateTrip(data?.id, data),
        "trips/remove": () => this.deleteTrip(data?.id || data),
        "plannedTrips/add": () => this.createPlannedTrip(data),
        ADD_PLANNED_TRIP: () => this.createPlannedTrip(data),
        "plannedTrips/update": () => this.updatePlannedTrip(data?.id, data),
        "plannedTrips/checklist": () => this.updatePlannedTripChecklist(data?.id, data?.checklist || data),
        "plannedTrips/convert": () => this.convertPlannedTrip(data?.id || data?.plannedTripId, data),
        "plannedTrips/remove": () => this.deletePlannedTrip(data?.id || data),
        "budgetWallet/set": () => this.setBudgetWallet(data),
        "budgetWallet/deposit": () => this.addBudgetDeposit(data),
        "budgetWallet/withdraw": () => this.addBudgetWithdrawal(data),
        "budgetWallet/expense": () => this.addBudgetExpense(data),
        "budgetWallet/removeTransaction": () => this.deleteBudgetTransaction(data?.id || data),
        "budgetTravel/setAnalysis": () => this.setBudgetTravelAnalysis(data),
        "budgetTravel/dismissRecommendation": () => this.dismissBudgetTravelRecommendation(data?.id || data),
        "budgetTravel/acceptRecommendation": () => this.acceptBudgetTravelRecommendation(data?.id || data)
      };
      if (!handlers[action]) throw new Error(`TIC Store: unsupported action "${action}".`);
      return handlers[action]();
    },

    commit(actionOrObject, payload) { return this.dispatch(actionOrObject, payload); },
    execute(actionOrObject, payload) { return this.dispatch(actionOrObject, payload); },

    /* Budget Wallet */
    getBudgetWallet() { return clone(state.budgetWallet); },
    getTravelBalance() { return toNonNegative(state.budgetWallet.balance); },

    setBudgetWallet(wallet = {}) {
      state = commitMutation((draft) => {
        draft.budgetWallet = normalizeBudgetWallet(
          wallet,
          draft.profile?.currency || Config.defaults?.currency || "AED"
        );
        if (draft.budgetWallet.totals.rawBalance < 0) {
          throw new Error("رصيد المحفظة الناتج لا يمكن أن يكون أقل من صفر.");
        }
        draft.meta.lastBudgetWalletSyncAt = nowISO();
      }, { type: "budget-wallet-set" });
      emitBudgetWalletChanged();
      return this.getBudgetWallet();
    },

    saveBudgetWallet(wallet = {}) { return this.setBudgetWallet(wallet); },

    getBudgetTransactions(options = {}) {
      let items = clone(state.budgetWallet.transactions);
      if (options.type) {
        const types = Array.isArray(options.type) ? options.type : [options.type];
        items = items.filter((transaction) => types.includes(transaction.type));
      }
      if (options.limit !== undefined) items = items.slice(0, Math.max(0, Math.floor(toNumber(options.limit))));
      return items;
    },

    getBudgetTransaction(transactionId) {
      const index = findBudgetTransactionIndex(transactionId);
      return index === -1 ? null : clone(state.budgetWallet.transactions[index]);
    },

    addBudgetTransaction(transactionData = {}) {
      const transaction = normalizeBudgetTransaction({
        ...clone(transactionData),
        id: transactionData.id || createId("budget_tx"),
        createdAt: transactionData.createdAt || nowISO()
      });
      if (transaction.amount <= 0) throw new Error("قيمة الحركة يجب أن تكون أكبر من صفر.");
      if (["withdrawal", "expense"].includes(transaction.type) && transaction.amount > state.budgetWallet.balance) {
        throw new Error("المبلغ أكبر من رصيد السفر الحالي.");
      }

      commitMutation((draft) => {
        draft.budgetWallet.transactions.unshift(transaction);
        draft.budgetWallet = normalizeBudgetWallet(
          draft.budgetWallet,
          draft.profile?.currency || Config.defaults?.currency || "AED"
        );
        if (draft.budgetWallet.totals.rawBalance < 0) throw new Error("الرصيد لا يكفي لإتمام الحركة.");
        draft.meta.lastBudgetWalletSyncAt = nowISO();
      }, {
        type: "budget-wallet-transaction-created",
        transactionId: transaction.id,
        transactionType: transaction.type
      });
      const saved = this.getBudgetTransaction(transaction.id);
      emitBudgetWalletChanged(saved);
      return saved;
    },

    addBudgetDeposit(data = {}) {
      return this.addBudgetTransaction({ ...clone(data), type: "deposit", title: data.title || "إضافة رصيد" });
    },
    depositBudget(data = {}) { return this.addBudgetDeposit(data); },
    addBudgetWithdrawal(data = {}) {
      return this.addBudgetTransaction({ ...clone(data), type: "withdrawal", title: data.title || "سحب من الرصيد" });
    },
    withdrawBudget(data = {}) { return this.addBudgetWithdrawal(data); },
    addBudgetExpense(data = {}) {
      return this.addBudgetTransaction({
        ...clone(data), type: "expense", title: data.title || "مصروف سفر", category: data.category || "other"
      });
    },
    spendFromBudget(data = {}) { return this.addBudgetExpense(data); },

    updateBudgetTransaction(transactionId, changes = {}) {
      const index = findBudgetTransactionIndex(transactionId);
      if (index === -1) return null;
      const current = state.budgetWallet.transactions[index];
      const updated = normalizeBudgetTransaction({
        ...current, ...clone(changes), id: current.id, createdAt: current.createdAt
      });
      if (updated.amount <= 0) throw new Error("قيمة الحركة يجب أن تكون أكبر من صفر.");

      commitMutation((draft) => {
        const draftIndex = findBudgetTransactionIndex(transactionId, draft);
        draft.budgetWallet.transactions[draftIndex] = updated;
        draft.budgetWallet = normalizeBudgetWallet(draft.budgetWallet, draft.profile?.currency || "AED");
        if (draft.budgetWallet.totals.rawBalance < 0) throw new Error("التعديل يجعل الرصيد أقل من صفر.");
        draft.meta.lastBudgetWalletSyncAt = nowISO();
      }, { type: "budget-wallet-transaction-updated", transactionId });
      const saved = this.getBudgetTransaction(transactionId);
      emitBudgetWalletChanged(saved);
      return saved;
    },

    deleteBudgetTransaction(transactionId) {
      if (findBudgetTransactionIndex(transactionId) === -1) return false;
      commitMutation((draft) => {
        const index = findBudgetTransactionIndex(transactionId, draft);
        draft.budgetWallet.transactions.splice(index, 1);
        draft.budgetWallet = normalizeBudgetWallet(draft.budgetWallet, draft.profile?.currency || "AED");
        draft.meta.lastBudgetWalletSyncAt = nowISO();
      }, { type: "budget-wallet-transaction-deleted", transactionId });
      emitBudgetWalletChanged(null, transactionId);
      return true;
    },

    clearBudgetWallet(options = {}) {
      commitMutation((draft) => {
        draft.budgetWallet = normalizeBudgetWallet({
          currency: draft.budgetWallet.currency,
          openingBalance: options.keepOpeningBalance === true ? draft.budgetWallet.openingBalance : 0,
          transactions: [],
          createdAt: draft.budgetWallet.createdAt,
          updatedAt: nowISO()
        });
        draft.meta.lastBudgetWalletSyncAt = nowISO();
      }, { type: "budget-wallet-cleared" });
      emitBudgetWalletChanged();
      return this.getBudgetWallet();
    },

    /* Trips */
    getTrips(options = {}) {
      let items = state.trips.filter((trip) => options.includeArchived === true || trip.status !== "archived");
      if (options.status) {
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        items = items.filter((trip) => statuses.includes(trip.status));
      }
      items = clone(items);
      if (options.sort === "soonest") {
        items.sort((a, b) =>
          (dateToUtcNumber(a.startDate) ?? Number.MAX_SAFE_INTEGER) -
          (dateToUtcNumber(b.startDate) ?? Number.MAX_SAFE_INTEGER)
        );
      }
      return items;
    },
    listTrips(options = {}) { return this.getTrips(options); },
    getUpcomingTrips() { return this.getTrips({ status: UPCOMING_STATUSES, sort: "soonest" }); },
    getActiveTrips() { return this.getTrips({ status: ACTIVE_STATUSES }); },
    getCompletedTrips() { return this.getTrips({ status: "completed" }); },
    getPassportTrips() { return this.getCompletedTrips(); },
    getTrip(tripId) {
      const trip = state.trips.find((item) => String(item.id) === String(tripId));
      return trip ? clone(trip) : null;
    },
    getTripById(tripId) { return this.getTrip(tripId); },

    createTrip(tripData = {}) {
      const trip = normalizeTrip(tripData);
      if (!trip.title) throw new Error("اسم الرحلة مطلوب.");
      commitMutation((draft) => { draft.trips.unshift(trip); }, { type: "trip-created", tripId: trip.id });
      return this.getTrip(trip.id);
    },
    addTrip(tripData) { return this.createTrip(tripData); },

    updateTrip(tripId, changes = {}) {
      if (findTripIndex(tripId) === -1) return null;
      commitMutation((draft) => {
        const index = findTripIndex(tripId, draft);
        const current = draft.trips[index];
        draft.trips[index] = normalizeTrip({
          ...current, ...clone(changes), id: current.id, createdAt: current.createdAt
        });
      }, { type: "trip-updated", tripId });
      return this.getTrip(tripId);
    },

    upsertTrip(tripData = {}) {
      return tripData.id && findTripIndex(tripData.id) !== -1
        ? this.updateTrip(tripData.id, tripData)
        : this.createTrip(tripData);
    },

    updateTripChecklist(tripId, changes = {}) {
      const trip = this.getTrip(tripId);
      if (!trip) return null;
      const checklist = normalizeTripChecklist({ ...trip.checklist, ...clone(changes) });
      return this.updateTrip(tripId, {
        checklist,
        planningStatus: checklist.flightBooked && checklist.hotelBooked ? "ready" : trip.planningStatus
      });
    },

    deleteTrip(tripId) {
      if (findTripIndex(tripId) === -1) return false;
      commitMutation((draft) => {
        draft.trips.splice(findTripIndex(tripId, draft), 1);
        draft.expenses = draft.expenses.filter((expense) => String(expense.tripId) !== String(tripId));
        draft.payments = draft.payments.filter((payment) => String(payment.tripId) !== String(tripId));
      }, { type: "trip-deleted", tripId });
      return true;
    },
    archiveTrip(tripId) { return this.updateTrip(tripId, { status: "archived", archivedAt: nowISO() }); },
    restoreTrip(tripId) { return this.updateTrip(tripId, { status: "planning", archivedAt: null }); },

    syncTripLifecycle(options = {}) {
      const before = JSON.stringify(state.trips.map((trip) => [trip.id, trip.status]));
      commitMutation((draft) => {
        draft.trips = draft.trips.map((trip) => normalizeTrip(trip));
        draft.meta.lastTripLifecycleSyncAt = nowISO();
      }, { type: "trip-lifecycle-synced" }, { immediate: options.immediate !== false });
      const after = JSON.stringify(state.trips.map((trip) => [trip.id, trip.status]));
      return { changed: before !== after, trips: this.getTrips({ includeArchived: true }) };
    },

    /* Planned Trips */
    getPlannedTrips(options = {}) {
      let items = clone(state.plannedTrips);
      if (options.includeArchived !== true) {
        items = items.filter((trip) => !["archived", "cancelled"].includes(trip.status));
      }
      if (options.status) {
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        items = items.filter((trip) => statuses.includes(trip.status));
      }
      if (options.ready === true) items = items.filter((trip) => trip.readiness?.readyForConversion === true);
      return items;
    },
    listPlannedTrips(options = {}) { return this.getPlannedTrips(options); },
    getPlannedTrip(tripId) {
      const index = findPlannedTripIndex(tripId);
      return index === -1 ? null : clone(state.plannedTrips[index]);
    },

    createPlannedTrip(tripData = {}) {
      const trip = normalizePlannedTrip(tripData);
      if (trip.sourceRecommendationId) {
        const existing = state.plannedTrips.find((item) =>
          String(item.sourceRecommendationId) === String(trip.sourceRecommendationId) &&
          !["archived", "cancelled"].includes(item.status)
        );
        if (existing) return clone(existing);
      }
      commitMutation((draft) => {
        draft.plannedTrips.unshift(trip);
        if (trip.sourceRecommendationId) {
          const ids = new Set(draft.budgetTravelIntelligence.acceptedRecommendationIds.map(String));
          ids.add(String(trip.sourceRecommendationId));
          draft.budgetTravelIntelligence.acceptedRecommendationIds = Array.from(ids);
        }
      }, { type: "planned-trip-created", plannedTripId: trip.id });
      return this.getPlannedTrip(trip.id);
    },
    addPlannedTrip(tripData) { return this.createPlannedTrip(tripData); },

    updatePlannedTrip(tripId, changes = {}) {
      if (findPlannedTripIndex(tripId) === -1) return null;
      commitMutation((draft) => {
        const index = findPlannedTripIndex(tripId, draft);
        const current = draft.plannedTrips[index];
        draft.plannedTrips[index] = normalizePlannedTrip({
          ...current,
          ...clone(changes),
          checklist: { ...current.checklist, ...(isObject(changes.checklist) ? changes.checklist : {}) },
          id: current.id,
          createdAt: current.createdAt
        });
      }, { type: "planned-trip-updated", plannedTripId: tripId });
      return this.getPlannedTrip(tripId);
    },

    updatePlannedTripChecklist(tripId, changes = {}) {
      const trip = this.getPlannedTrip(tripId);
      return trip ? this.updatePlannedTrip(tripId, { checklist: { ...trip.checklist, ...clone(changes) } }) : null;
    },

    setPlannedTripChecklistItem(tripId, item, completed = true) {
      if (![...REQUIRED_PLANNED_ITEMS, ...OPTIONAL_PLANNED_ITEMS].includes(item)) {
        throw new Error(`Unknown planned trip checklist item: ${item}`);
      }
      return this.updatePlannedTripChecklist(tripId, { [item]: completed === true });
    },

    canConvertPlannedTrip(tripId) {
      return Boolean(this.getPlannedTrip(tripId)?.readiness?.readyForConversion);
    },

    convertPlannedTrip(tripId, options = {}) {
      const plannedTrip = this.getPlannedTrip(tripId);
      if (!plannedTrip) return null;
      if (plannedTrip.status === "converted" && plannedTrip.convertedTripId) {
        return this.getTrip(plannedTrip.convertedTripId);
      }
      if (!plannedTrip.readiness?.readyForConversion) {
        return {
          success: false,
          status: "blocked",
          reason: "REQUIREMENTS_NOT_MET",
          missingRequiredItems: plannedTrip.readiness?.missingRequiredItems || []
        };
      }

      const convertedAt = nowISO();
      const activeTrip = normalizeTrip({
        ...plannedTrip,
        id: options.tripId || createId("trip"),
        plannedTripId: plannedTrip.id,
        budget: plannedTrip.estimatedBudget,
        status: "ready",
        planningStatus: "ready",
        source: "planned-trip",
        convertedAt,
        checklist: { ...plannedTrip.checklist, flightBooked: true, hotelBooked: true },
        bookingReference: options.flightReference || plannedTrip.booking?.flightReference || "",
        hotelBookingReference: options.hotelReference || plannedTrip.booking?.hotelReference || "",
        createdAt: nowISO()
      });

      commitMutation((draft) => {
        const index = findPlannedTripIndex(tripId, draft);
        draft.trips.unshift(activeTrip);
        draft.plannedTrips[index] = normalizePlannedTrip({
          ...draft.plannedTrips[index],
          status: "converted",
          convertedTripId: activeTrip.id,
          convertedAt
        });
      }, { type: "planned-trip-converted", plannedTripId: tripId, tripId: activeTrip.id });
      return this.getTrip(activeTrip.id);
    },

    archivePlannedTrip(tripId) { return this.updatePlannedTrip(tripId, { status: "archived", archived: true }); },
    restorePlannedTrip(tripId) {
      return this.updatePlannedTrip(tripId, {
        status: "planned", archived: false, convertedTripId: null, convertedAt: null
      });
    },
    deletePlannedTrip(tripId) {
      if (findPlannedTripIndex(tripId) === -1) return false;
      commitMutation((draft) => {
        draft.plannedTrips.splice(findPlannedTripIndex(tripId, draft), 1);
      }, { type: "planned-trip-deleted", plannedTripId: tripId });
      return true;
    },

    /* Budget Travel Intelligence */
    getBudgetTravelIntelligence() { return clone(state.budgetTravelIntelligence); },
    setBudgetTravelAnalysis(analysis = {}) {
      const normalized = isObject(analysis) ? clone(analysis) : {};
      normalized.id = normalized.id || createId("budget_analysis");
      normalized.savedAt = nowISO();
      commitMutation((draft) => {
        const branch = draft.budgetTravelIntelligence;
        branch.currentAnalysis = normalized;
        branch.recommendations = uniqueById(toArray(normalized.recommendations), "budget_recommendation");
        branch.timeline = toArray(normalized.timeline);
        branch.multiTripPlan = normalized.multiTripPlan ? clone(normalized.multiTripPlan) : null;
        branch.history = uniqueById([normalized, ...toArray(branch.history)], "budget_analysis").slice(0, 20);
        branch.lastGeneratedAt = normalized.generatedAt || nowISO();
        branch.updatedAt = nowISO();
        draft.meta.lastBudgetTravelSyncAt = nowISO();
      }, { type: "budget-travel-analysis-saved", analysisId: normalized.id });
      return this.getBudgetTravelIntelligence();
    },
    saveBudgetTravelAnalysis(analysis) { return this.setBudgetTravelAnalysis(analysis); },
    clearBudgetTravelAnalysis() {
      commitMutation((draft) => {
        const branch = draft.budgetTravelIntelligence;
        branch.currentAnalysis = null;
        branch.recommendations = [];
        branch.timeline = [];
        branch.multiTripPlan = null;
        branch.updatedAt = nowISO();
      }, { type: "budget-travel-analysis-cleared" });
      return this.getBudgetTravelIntelligence();
    },
    getBudgetTravelRecommendations(options = {}) {
      let items = clone(state.budgetTravelIntelligence.recommendations);
      if (options.includeDismissed !== true) {
        const dismissed = new Set(state.budgetTravelIntelligence.dismissedRecommendationIds.map(String));
        items = items.filter((item) => !dismissed.has(String(item.id)));
      }
      return items;
    },
    dismissBudgetTravelRecommendation(recommendationId, options = {}) {
      if (!recommendationId) return false;
      commitMutation((draft) => {
        const ids = new Set(draft.budgetTravelIntelligence.dismissedRecommendationIds.map(String));
        ids.add(String(recommendationId));
        draft.budgetTravelIntelligence.dismissedRecommendationIds = Array.from(ids);
        draft.budgetTravelIntelligence.updatedAt = nowISO();
      }, { type: "budget-travel-recommendation-dismissed", recommendationId }, {
        immediate: options.persist !== false
      });
      return true;
    },
    acceptBudgetTravelRecommendation(recommendationId, options = {}) {
      if (!recommendationId) return false;
      commitMutation((draft) => {
        const ids = new Set(draft.budgetTravelIntelligence.acceptedRecommendationIds.map(String));
        ids.add(String(recommendationId));
        draft.budgetTravelIntelligence.acceptedRecommendationIds = Array.from(ids);
        draft.budgetTravelIntelligence.updatedAt = nowISO();
      }, { type: "budget-travel-recommendation-accepted", recommendationId }, {
        immediate: options.persist !== false
      });
      return true;
    },
    createPlannedTripFromRecommendation(recommendation, options = {}) {
      if (!isObject(recommendation)) throw new Error("بيانات الاقتراح غير صالحة.");
      let draft = {
        title: recommendation.title,
        destinationId: recommendation.destinationId || recommendation.id,
        country: recommendation.country,
        countryCode: recommendation.countryCode,
        city: recommendation.city,
        suggestedMonth: recommendation.suggestedMonth,
        durationDays: recommendation.durationDays || recommendation.days,
        travelers: recommendation.travelers,
        estimatedBudget: firstDefined(
          recommendation.estimatedCost,
          recommendation.estimatedBudget,
          recommendation.budget,
          recommendation.cost
        ),
        currency: recommendation.currency || state.profile?.currency || Config.defaults?.currency || "AED",
        sourceRecommendationId: recommendation.recommendationId || recommendation.id,
        sourceAnalysisId: state.budgetTravelIntelligence.currentAnalysis?.id || null,
        source: {
          engine: recommendation.source || "SimpleTravelBudgetAdvisor",
          confidence: recommendation.confidence || 0
        },
        costBreakdown: recommendation.costBreakdown,
        highlights: recommendation.highlights || recommendation.tags,
        notes: options.notes || recommendation.summary || "",
        ...options
      };
      if (window.PlannedTripEngine && typeof window.PlannedTripEngine.create === "function") {
        try { draft = window.PlannedTripEngine.create(draft); } catch (_) {}
      }
      return this.createPlannedTrip(draft);
    },

    /* Guide */
    getGuideIntelligence() { return clone(state.guideIntelligence); },
    setGuideIntelligence(payload = {}) {
      commitMutation((draft) => {
        draft.guideIntelligence = deepMerge(draft.guideIntelligence, payload);
        draft.guideIntelligence.updatedAt = nowISO();
        draft.meta.lastGuideSyncAt = nowISO();
      }, { type: "guide-intelligence-updated" }, { immediate: false });
      return this.getGuideIntelligence();
    },
    setTravelDNA(payload = {}) {
      return this.setGuideIntelligence({ travelDNA: clone(payload), lastGeneratedAt: nowISO() });
    },
    setGuideRecommendations(items = []) {
      return this.setGuideIntelligence({ recommendations: toArray(items), lastGeneratedAt: nowISO() });
    },
    setSelectedGuideCountry(countryCode) {
      return this.setGuideIntelligence({ selectedCountryCode: normalizeCountryCode(countryCode) || null });
    },

    /* Wishlist */
    getWishlist() { return clone(state.wishlist); },
    addWishlistItem(itemData) {
      const item = normalizeWishlistItem(itemData);
      if (!item.countryCode) throw new Error("رمز الدولة مطلوب.");
      const existing = state.wishlist.find((current) => current.countryCode === item.countryCode);
      if (existing) return clone(existing);
      commitMutation((draft) => { draft.wishlist.unshift(item); }, {
        type: "wishlist-item-created", wishlistId: item.id
      });
      return clone(item);
    },
    addWishlist(itemData) { return this.addWishlistItem(itemData); },
    isWishlisted(identifier) {
      const code = normalizeCountryCode(identifier);
      return state.wishlist.some((item) =>
        String(item.id) === String(identifier) || (code && item.countryCode === code)
      );
    },
    removeWishlistItem(identifier) {
      const code = normalizeCountryCode(identifier);
      const index = state.wishlist.findIndex((item) =>
        String(item.id) === String(identifier) || (code && item.countryCode === code)
      );
      if (index === -1) return false;
      commitMutation((draft) => {
        const draftIndex = draft.wishlist.findIndex((item) =>
          String(item.id) === String(identifier) || (code && item.countryCode === code)
        );
        draft.wishlist.splice(draftIndex, 1);
      }, { type: "wishlist-item-deleted" });
      return true;
    },
    removeWishlist(identifier) { return this.removeWishlistItem(identifier); },
    toggleWishlist(itemData) {
      const identifier = itemData?.id || itemData?.countryCode || itemData;
      if (this.isWishlisted(identifier)) {
        this.removeWishlistItem(identifier);
        return null;
      }
      return this.addWishlistItem(itemData);
    },

    /* Annual Planner */
    getAnnualPlans() { return clone(state.annualPlans); },
    getAnnualPlan(planId) {
      return clone(state.annualPlans.find((plan) => String(plan.id) === String(planId)) || null);
    },
    addAnnualPlan(planData) {
      const plan = normalizeAnnualPlan(planData);
      commitMutation((draft) => { draft.annualPlans.push(plan); }, {
        type: "annual-plan-created", planId: plan.id
      });
      return clone(plan);
    },
    createAnnualPlan(planData) { return this.addAnnualPlan(planData); },
    updateAnnualPlan(planId, changes = {}) {
      const current = this.getAnnualPlan(planId);
      if (!current) return null;
      commitMutation((draft) => {
        const index = draft.annualPlans.findIndex((plan) => String(plan.id) === String(planId));
        draft.annualPlans[index] = normalizeAnnualPlan({
          ...draft.annualPlans[index], ...clone(changes), id: current.id, createdAt: current.createdAt
        });
      }, { type: "annual-plan-updated", planId });
      return this.getAnnualPlan(planId);
    },
    removeAnnualPlan(planId) {
      if (!this.getAnnualPlan(planId)) return false;
      commitMutation((draft) => {
        const index = draft.annualPlans.findIndex((plan) => String(plan.id) === String(planId));
        draft.annualPlans.splice(index, 1);
      }, { type: "annual-plan-deleted", planId });
      return true;
    },
    deleteAnnualPlan(planId) { return this.removeAnnualPlan(planId); },
    linkAnnualPlanToTrip(planId, tripId) {
      return this.updateAnnualPlan(planId, { status: "converted", convertedTripId: tripId });
    },

    /* Expenses and Savings */
    getExpenses(options = {}) {
      let items = state.expenses.filter((expense) =>
        options.includeDeleted === true || (!expense.deletedAt && expense.isDeleted !== true)
      );
      if (options.tripId) items = items.filter((expense) => String(expense.tripId) === String(options.tripId));
      return clone(items);
    },
    listExpenses(options = {}) { return this.getExpenses(options); },
    getExpense(expenseId) {
      return clone(state.expenses.find((expense) => String(expense.id) === String(expenseId)) || null);
    },
    addExpense(expenseData) {
      const expense = normalizeExpense(expenseData);
      if (!expense.title || expense.amount <= 0) throw new Error("بيانات المصروف غير مكتملة.");
      commitMutation((draft) => { draft.expenses.unshift(expense); }, {
        type: "expense-created", expenseId: expense.id
      });
      return this.getExpense(expense.id);
    },
    createExpense(expenseData) { return this.addExpense(expenseData); },
    updateExpense(expenseId, changes = {}) {
      const current = this.getExpense(expenseId);
      if (!current) return null;
      commitMutation((draft) => {
        const index = draft.expenses.findIndex((expense) => String(expense.id) === String(expenseId));
        draft.expenses[index] = normalizeExpense({
          ...draft.expenses[index], ...clone(changes), id: current.id, createdAt: current.createdAt
        });
      }, { type: "expense-updated", expenseId });
      return this.getExpense(expenseId);
    },
    deleteExpense(expenseId, options = {}) {
      if (!this.getExpense(expenseId)) return false;
      commitMutation((draft) => {
        const index = draft.expenses.findIndex((expense) => String(expense.id) === String(expenseId));
        if (options.soft === true) {
          draft.expenses[index] = normalizeExpense({
            ...draft.expenses[index], deletedAt: nowISO(), isDeleted: true
          });
        } else draft.expenses.splice(index, 1);
      }, { type: "expense-deleted", expenseId });
      return true;
    },
    getSavings() { return clone(state.savings); },
    addSavingEntry(entryData) {
      const entry = normalizeSavingEntry(entryData);
      if (entry.amount <= 0) throw new Error("قيمة الادخار يجب أن تكون أكبر من صفر.");
      const walletTransaction = entry.type === "withdrawal"
        ? this.addBudgetWithdrawal({ amount: entry.amount, title: entry.notes || "سحب من الادخار", notes: entry.notes, date: entry.date, sourceSavingEntryId: entry.id })
        : this.addBudgetDeposit({ amount: entry.amount, title: entry.notes || "إضافة ادخار", notes: entry.notes, date: entry.date, sourceSavingEntryId: entry.id });
      commitMutation((draft) => {
        if (!draft.savings.entries.some((item) => item.id === entry.id)) draft.savings.entries.unshift(entry);
        draft.savings.updatedAt = nowISO();
      }, { type: "saving-entry-created", savingEntryId: entry.id }, { immediate: false });
      return { ...clone(entry), walletTransactionId: walletTransaction?.id || null };
    },
    addDeposit(entryData) { return this.addSavingEntry({ ...clone(entryData), type: "deposit" }); },
    deposit(entryData) { return this.addDeposit(entryData); },
    addWithdrawal(entryData) { return this.addSavingEntry({ ...clone(entryData), type: "withdrawal" }); },
    setMonthlySaving(value) {
      const amount = toNonNegative(isObject(value) ? firstDefined(value.monthlySaving, value.amount, 0) : value);
      commitMutation((draft) => {
        draft.savings.monthlySaving = amount;
        draft.savings.monthlySavingTarget = amount;
        draft.profile.monthlySaving = amount;
        draft.profile.monthlyTravelSaving = amount;
        draft.settings.monthlySaving = amount;
      }, { type: "savings-plan-updated" });
      return this.getSavings();
    },
    updateSavingsPlan(plan = {}) {
      commitMutation((draft) => { draft.savings = { ...draft.savings, ...clone(plan), updatedAt: nowISO() }; }, {
        type: "savings-plan-updated"
      });
      return this.getSavings();
    },
    setPlan(plan = {}) { return this.updateSavingsPlan(plan); },
    savePlan(plan = {}) { return this.updateSavingsPlan(plan); },

    /* Payments */
    getPayments() { return clone(state.payments); },
    getPayment(paymentId) {
      return clone(state.payments.find((payment) => String(payment.id) === String(paymentId)) || null);
    },
    createPayment(paymentData) {
      const payment = normalizePayment(paymentData);
      if (!payment.title || payment.amount <= 0) throw new Error("بيانات الدفعة غير مكتملة.");
      commitMutation((draft) => { draft.payments.unshift(payment); }, {
        type: "payment-created", paymentId: payment.id
      });
      return this.getPayment(payment.id);
    },
    updatePayment(paymentId, changes = {}) {
      const current = this.getPayment(paymentId);
      if (!current) return null;
      commitMutation((draft) => {
        const index = draft.payments.findIndex((payment) => String(payment.id) === String(paymentId));
        draft.payments[index] = normalizePayment({
          ...draft.payments[index], ...clone(changes), id: current.id, createdAt: current.createdAt
        });
      }, { type: "payment-updated", paymentId });
      return this.getPayment(paymentId);
    },
    recordPayment(paymentId, paymentData = {}) {
      const payment = this.getPayment(paymentId);
      if (!payment) return null;
      return this.updatePayment(paymentId, {
        paidAmount: Math.min(payment.amount, payment.paidAmount + toNonNegative(
          firstDefined(paymentData.amount, payment.remainingAmount, 0)
        )),
        paidAt: paymentData.paidAt || nowISO()
      });
    },
    markPaymentPaid(paymentId, paymentData = {}) { return this.recordPayment(paymentId, paymentData); },
    deletePayment(paymentId) {
      if (!this.getPayment(paymentId)) return false;
      commitMutation((draft) => {
        const index = draft.payments.findIndex((payment) => String(payment.id) === String(paymentId));
        draft.payments.splice(index, 1);
      }, { type: "payment-deleted", paymentId });
      return true;
    },

    /* Budget compatibility */
    setBudgetAlerts(payload = {}) {
      commitMutation((draft) => { draft.budgetAlerts = deepMerge(draft.budgetAlerts, payload); }, {
        type: "budget-alerts-updated"
      });
      return clone(state.budgetAlerts);
    },
    setBudgetRecommendations(payload = {}) {
      commitMutation((draft) => { draft.budgetRecommendations = deepMerge(draft.budgetRecommendations, payload); }, {
        type: "budget-recommendations-updated"
      });
      return clone(state.budgetRecommendations);
    },
    setBudgetNotifications(payload = {}) {
      commitMutation((draft) => { draft.budgetNotifications = deepMerge(draft.budgetNotifications, payload); }, {
        type: "budget-notifications-updated"
      });
      return clone(state.budgetNotifications);
    },
    setBudgetIntelligence(payload = {}) {
      commitMutation((draft) => {
        draft.budgetIntelligence = deepMerge(draft.budgetIntelligence, payload);
        draft.budgetIntelligence.updatedAt = nowISO();
      }, { type: "budget-intelligence-updated" }, { immediate: false });
      return clone(state.budgetIntelligence);
    },

    /* Backup / Restore / Import / Export */
    createBackup(options = {}) {
      const backups = this.getBackups();
      const backup = {
        id: createId("backup"),
        createdAt: nowISO(),
        reason: toText(options.reason, "manual"),
        appId: Config.id,
        schemaVersion: SCHEMA_VERSION,
        appVersion: Config.appVersion,
        storeVersion: STORE_VERSION,
        state: clone(state)
      };
      backups.unshift(backup);
      const saved = safeStorageSet(BACKUP_KEY, JSON.stringify(backups.slice(0, MAX_BACKUPS)));
      if (!saved) throw new Error("تعذر إنشاء النسخة الاحتياطية.");
      state.meta.lastBackupAt = backup.createdAt;
      persistImmediately({ type: "backup-created", backupId: backup.id });
      return clone(backup);
    },

    getBackups() {
      const backups = safeParse(safeStorageGet(BACKUP_KEY), []);
      return Array.isArray(backups) ? clone(backups) : [];
    },

    deleteBackup(backupId) {
      const backups = this.getBackups();
      const next = backups.filter((backup) => String(backup.id) !== String(backupId));
      if (next.length === backups.length) return false;
      return safeStorageSet(BACKUP_KEY, JSON.stringify(next));
    },

    restoreBackup(backupId) {
      const backup = this.getBackups().find((item) => String(item.id) === String(backupId));
      if (!backup?.state || !isObject(backup.state)) return false;
      this.createBackup({ reason: "before-restore" });
      replaceStateInternal(backup.state, { type: "backup-restored", backupId });
      return true;
    },

    exportData(options = {}) {
      const envelope = {
        exportedAt: nowISO(),
        appId: Config.id,
        appVersion: Config.appVersion,
        storeVersion: STORE_VERSION,
        schemaVersion: SCHEMA_VERSION,
        format: "tic-store-export",
        state: clone(state)
      };
      return options.asObject === true ? envelope : JSON.stringify(envelope, null, 2);
    },

    importData(payload, options = {}) {
      const parsed = typeof payload === "string" ? safeParse(payload, null) : payload;
      const importedState = parsed?.state || parsed;
      if (!isObject(importedState)) throw new Error("ملف البيانات غير صالح.");
      if (parsed?.appId && parsed.appId !== Config.id && options.allowForeignApp !== true) {
        throw new Error("ملف البيانات لا ينتمي إلى تطبيق مركز السفر الذكي.");
      }
      this.createBackup({ reason: "before-import" });
      return replaceStateInternal(importedState, { type: "data-imported" });
    },

    reset(options = {}) {
      if (options.createBackup !== false) this.createBackup({ reason: "before-reset" });
      state = rebuildState(getDefaultState());
      persistImmediately({ type: "store-reset" });
      return clone(state);
    },

    diagnostics() {
      const serialized = JSON.stringify(state);
      return {
        version: STORE_VERSION,
        storageKey: STORAGE_KEY,
        backupKey: BACKUP_KEY,
        schemaVersion: SCHEMA_VERSION,
        stateBytes: new Blob([serialized]).size,
        tripCount: state.trips.length,
        plannedTripCount: state.plannedTrips.length,
        readyPlannedTripCount: state.statistics.readyPlannedTrips,
        convertedPlannedTripCount: state.statistics.convertedPlannedTrips,
        recommendationCount: state.statistics.budgetTravelRecommendationCount,
        budgetWalletBalance: state.budgetWallet.balance,
        budgetWalletTransactionCount: state.budgetWallet.transactions.length,
        backupCount: this.getBackups().length,
        subscriberCount: listeners.size,
        pendingSave: Boolean(saveTimer),
        transactionDepth,
        lastUpdatedAt: state.meta.updatedAt,
        lastMigrationAt: state.meta.lastMigrationAt,
        lastTripLifecycleSyncAt: state.meta.lastTripLifecycleSyncAt,
        lastBudgetTravelSyncAt: state.meta.lastBudgetTravelSyncAt,
        lastBudgetWalletSyncAt: state.meta.lastBudgetWalletSyncAt
      };
    }
  };

  /* =========================================================
     Startup
  ========================================================= */

  const storedState = readStoredState();
  state = rebuildState(storedState || getDefaultState());
  state.meta.lastMigrationAt = storedState ? nowISO() : null;
  state.meta.lastTripLifecycleSyncAt = nowISO();
  state.meta.lastGuideSyncAt = state.meta.lastGuideSyncAt || nowISO();
  state.meta.lastBudgetTravelSyncAt = state.meta.lastBudgetTravelSyncAt || nowISO();
  state.meta.lastBudgetWalletSyncAt = state.meta.lastBudgetWalletSyncAt || nowISO();

  persistImmediately({
    type: storedState ? "store-migrated-v2.5.0" : "store-initialized-v2.5.0"
  });

  window.TIC = window.TIC || {};
  window.TIC.Store = Store;
  window.TICStore = Store;
  window.Store = Store;
  window.TravelStore = Store;
})(window);
