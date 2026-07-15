/* =========================================================
   Travel Intelligence Center
   Central Store V2.2.0
   Guide Intelligence Integration Ready

   File Path:
   js/store.js

   Purpose:
   - Single source of truth for the entire application.
   - Preserves rich trip, flight, hotel, passport and finance data.
   - Automatically classifies trips by local calendar dates.
   - Keeps Trips, Passport, Guide, Wishlist and Annual Planner synced.
   - Adds complete persistence APIs required by GuideEngine,
     TravelAI and PlannerEngine.
   - Preserves Budget Intelligence persistence architecture.
   - Supports localStorage, migration, backup, restore,
     import, export, subscriptions and legacy Store aliases.

   V2.2.0:
   - Adds annualPlans and guideIntelligence state branches.
   - Adds normalized wishlist and annual-plan records.
   - Adds countryCode, planningStatus and checklist support to trips.
   - Adds Wishlist CRUD APIs.
   - Adds Annual Planner CRUD and conversion-link persistence.
   - Adds generic dispatch() compatibility for the new engines.
   - Adds Guide/Passport statistics synchronized from completed trips.
   - Preserves every V2.1.0 trip, finance and backup API.

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

  const STORE_VERSION = "2.2.0";
  const STORAGE_KEY = Config.storage.stateKey;
  const BACKUP_KEY = Config.storage.backupKey;
  const SCHEMA_VERSION = Config.storage.schemaVersion;
  const AUTO_SAVE_DELAY = Number(Config.storage.autoSaveDelay) || 120;
  const MAX_BACKUPS = Number(Config.storage.maxBackups) || 3;

  const UPCOMING_STATUSES = [
    "draft",
    "planning",
    "planned",
    "booked",
    "confirmed",
    "ready"
  ];

  const ACTIVE_STATUSES = ["ongoing", "active"];
  const LOCKED_STATUSES = ["cancelled", "archived"];

  const PLAN_STATUSES = [
    "idea",
    "considering",
    "shortlisted",
    "planned",
    "ready",
    "converted",
    "cancelled"
  ];

  const TRIP_PLANNING_STATUSES = [
    "draft",
    "planned",
    "booking",
    "ready",
    "active",
    "completed",
    "cancelled"
  ];

  const listeners = new Set();

  let saveTimer = null;
  let transactionDepth = 0;
  let pendingTransactionEvent = null;

  /* =========================================================
     Utilities
  ========================================================= */

  const isObject = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);

  const clone = (value) => {
    if (value === undefined) return undefined;

    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch (_) {
        // Continue to JSON fallback.
      }
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  };

  const nowISO = () => new Date().toISOString();

  const formatLocalDate = (date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");

  const todayISO = () => formatLocalDate(new Date());

  const createId = (prefix = "item") => {
    const random =
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    return `${prefix}_${random}`;
  };

  const toNumber = (value, fallback = 0) => {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
  };

  const toNonNegative = (value, fallback = 0) =>
    Math.max(0, toNumber(value, fallback));

  const toText = (value, fallback = "") =>
    String(value === undefined || value === null ? fallback : value).trim();

  const toBoolean = (value, fallback = false) => {
    if (value === true || value === "true" || value === 1 || value === "1") {
      return true;
    }

    if (value === false || value === "false" || value === 0 || value === "0") {
      return false;
    }

    return fallback;
  };

  const toArray = (value) => (Array.isArray(value) ? clone(value) : []);

  const firstDefined = (...values) =>
    values.find(
      (value) => value !== undefined && value !== null && value !== ""
    );

  const normalizeCountryCode = (value) => {
    const code = toText(value).toUpperCase();
    return code.length >= 2 && code.length <= 3 ? code : "";
  };

  const normalizeDateValue = (value) => {
    const raw = toText(value);
    if (!raw) return "";

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;

    return formatLocalDate(date);
  };

  const normalizeTimeValue = (value) => {
    const raw = toText(value);
    if (!raw) return "";

    const direct = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);

    if (direct) {
      const hours = Math.max(0, Math.min(23, toNumber(direct[1])));
      const minutes = Math.max(0, Math.min(59, toNumber(direct[2])));

      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }

    const arabicPeriod = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(ص|م)$/);

    if (arabicPeriod) {
      let hours = toNumber(arabicPeriod[1]) % 12;
      if (arabicPeriod[3] === "م") hours += 12;

      const minutes = Math.max(
        0,
        Math.min(59, toNumber(arabicPeriod[2], 0))
      );

      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }

    const englishPeriod = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);

    if (englishPeriod) {
      let hours = toNumber(englishPeriod[1]) % 12;
      if (englishPeriod[3].toUpperCase() === "PM") hours += 12;

      const minutes = Math.max(
        0,
        Math.min(59, toNumber(englishPeriod[2], 0))
      );

      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }

    return raw;
  };

  const dateToUtcNumber = (value) => {
    const normalized = normalizeDateValue(value);
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) return null;

    return Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );
  };

  const calculateDurationDays = (startDate, endDate, fallback = 0) => {
    const start = dateToUtcNumber(startDate);
    const end = dateToUtcNumber(endDate);

    if (start === null || end === null || end < start) {
      return Math.max(0, toNumber(fallback, 0));
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
      const targetValue = output[key];

      if (isObject(sourceValue) && isObject(targetValue)) {
        output[key] = deepMerge(targetValue, sourceValue);
      } else {
        output[key] = clone(sourceValue);
      }
    });

    return output;
  };

  const uniqueById = (items) => {
    const map = new Map();

    toArray(items).forEach((item) => {
      if (!item) return;

      const id = String(firstDefined(item.id, item._id, createId("item")));
      map.set(id, { ...clone(item), id });
    });

    return Array.from(map.values());
  };

  const compareTripsNewestFirst = (a, b) => {
    const aDate = dateToUtcNumber(a.endDate || a.startDate) || 0;
    const bDate = dateToUtcNumber(b.endDate || b.startDate) || 0;
    return bDate - aDate;
  };

  const compareTripsSoonestFirst = (a, b) => {
    const aDate = dateToUtcNumber(a.startDate) || Number.MAX_SAFE_INTEGER;
    const bDate = dateToUtcNumber(b.startDate) || Number.MAX_SAFE_INTEGER;
    return aDate - bDate;
  };

  /* =========================================================
     Default state
  ========================================================= */

  const getDefaultState = () => ({
    meta: {
      appId: Config.id,
      appVersion: Config.appVersion,
      storeVersion: STORE_VERSION,
      schemaVersion: SCHEMA_VERSION,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      lastBackupAt: null,
      lastMigrationAt: null,
      lastTripLifecycleSyncAt: null,
      lastGuideSyncAt: null
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
      monthlySaving: 1500,
      familyTravel: true,
      halalPreference: true,
      shattafRequired: true,
      quietPreference: true,
      preferredTripDays: 7,
      preferredClimate: "mild",
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
      annualPlanCount: 0,
      readyAnnualPlans: 0,
      totalTravelSpend: 0,
      totalTravelBudget: 0,
      savedForTravel: 0,
      expenseCount: 0,
      paymentCount: 0,
      overduePayments: 0,
      activeBudgetAlerts: 0,
      unreadBudgetNotifications: 0
    },

    trips: [],
    destinations: [],
    wishlist: [],
    annualPlans: [],

    passport: {
      countries: [],
      visitedCountries: [],
      history: [],
      stamps: [],
      updatedAt: nowISO()
    },

    guideIntelligence: {
      selectedCountryCode: null,
      travelDNA: {},
      recommendations: [],
      recentSearches: [],
      countryViews: {},
      lastGeneratedAt: null,
      updatedAt: nowISO()
    },

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
      expenses: [],
      updatedAt: nowISO()
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
      updatedAt: nowISO()
    },

    payments: [],

    budgetAlerts: {
      items: [],
      rules: {},
      updatedAt: nowISO()
    },

    budgetRecommendations: {
      items: [],
      dismissed: [],
      updatedAt: nowISO()
    },

    budgetNotifications: {
      items: [],
      preferences: {},
      updatedAt: nowISO()
    },

    budgetIntelligence: {
      analytics: {},
      forecast: {},
      health: {},
      integration: {},
      lastSyncAt: null,
      updatedAt: nowISO()
    },

    finance: {
      expenses: [],
      savings: {},
      payments: [],
      alerts: {},
      recommendations: {},
      notifications: {},
      updatedAt: nowISO()
    },

    documents: [],

    packing: {
      templates: [],
      lists: []
    },

    reviews: [],
    memories: [],
    analytics: {},
    notifications: [],

    settings: {
      currency: Config.defaults.currency,
      language: Config.defaults.language,
      theme: Config.defaults.theme,
      dateFormat: Config.defaults.dateFormat,
      annualTravelBudget: 30000,
      monthlySaving: 1500,
      enableAnimations: Config.app.enableAnimations,
      enableNotifications: true,
      confirmBeforeDelete: true,
      autoBackup: true
    }
  });

  /* =========================================================
     Normalizers
  ========================================================= */

  const resolveTripStatus = (status) => {
    const raw = toText(status) || toText(Config.defaults.tripStatus, "planning");

    if (
      isObject(Config.tripStatuses) &&
      Object.prototype.hasOwnProperty.call(Config.tripStatuses, raw)
    ) {
      return raw;
    }

    const supportedStatuses = [
      "draft",
      "planning",
      "planned",
      "booked",
      "confirmed",
      "ready",
      "ongoing",
      "active",
      "completed",
      "cancelled",
      "archived"
    ];

    return supportedStatuses.includes(raw)
      ? raw
      : toText(Config.defaults.tripStatus, "planning");
  };

  const resolveLifecycleStatus = ({
    status,
    startDate,
    endDate,
    durationDays
  }) => {
    const currentStatus = resolveTripStatus(status);

    if (LOCKED_STATUSES.includes(currentStatus)) return currentStatus;

    const normalizedStart = normalizeDateValue(startDate);
    const normalizedEnd =
      normalizeDateValue(endDate) ||
      deriveEndDateFromDuration(normalizedStart, durationDays);

    const today = dateToUtcNumber(todayISO());
    const start = dateToUtcNumber(normalizedStart);
    const end = dateToUtcNumber(normalizedEnd);

    if (start === null && end === null) return currentStatus;
    if (end !== null && today > end) return "completed";

    if (start !== null && today < start) {
      return UPCOMING_STATUSES.includes(currentStatus)
        ? currentStatus
        : "planning";
    }

    if (
      start !== null &&
      today >= start &&
      (end === null || today <= end)
    ) {
      return "active";
    }

    if (start === null && end !== null && today <= end) {
      return ACTIVE_STATUSES.includes(currentStatus)
        ? currentStatus
        : "active";
    }

    return currentStatus;
  };

  const normalizeTripChecklist = (checklist = {}) => ({
    flightBooked: toBoolean(checklist.flightBooked, false),
    hotelBooked: toBoolean(checklist.hotelBooked, false),
    documentsReady: toBoolean(checklist.documentsReady, false),
    insuranceReady: toBoolean(checklist.insuranceReady, false),
    transportPlanned: toBoolean(checklist.transportPlanned, false),
    itineraryReady: toBoolean(checklist.itineraryReady, false)
  });

  const normalizeTrip = (trip = {}) => {
    const source = isObject(trip) ? clone(trip) : {};

    const maxTravelers = toNumber(Config.validation?.trip?.maxTravelers, 99);
    const maxBudget = toNumber(
      Config.validation?.trip?.maxBudget,
      Number.MAX_SAFE_INTEGER
    );
    const notesMaxLength = toNumber(
      Config.validation?.trip?.notesMaxLength,
      10000
    );

    const startDate = normalizeDateValue(source.startDate);
    const sourceDuration = Math.max(
      0,
      toNumber(firstDefined(source.durationDays, source.days), 0)
    );

    const endDate =
      normalizeDateValue(source.endDate) ||
      deriveEndDateFromDuration(startDate, sourceDuration);

    const durationDays = calculateDurationDays(
      startDate,
      endDate,
      sourceDuration
    );

    const previousStatus = resolveTripStatus(source.status);
    const status = resolveLifecycleStatus({
      status: previousStatus,
      startDate,
      endDate,
      durationDays
    });

    const lifecycleChangedAt =
      status !== previousStatus
        ? nowISO()
        : source.lifecycleChangedAt || null;

    const planningStatus = TRIP_PLANNING_STATUSES.includes(
      toText(source.planningStatus)
    )
      ? toText(source.planningStatus)
      : status === "completed"
        ? "completed"
        : status === "active"
          ? "active"
          : status === "ready"
            ? "ready"
            : "planned";

    return {
      ...source,

      id: source.id || createId("trip"),
      title: toText(source.title),
      destination: toText(
        firstDefined(source.destination, source.destinationCountry)
      ),
      country: toText(
        firstDefined(source.country, source.destinationCountry)
      ),
      countryCode: normalizeCountryCode(
        firstDefined(
          source.countryCode,
          source.destinationCountryCode,
          source.guideCountryCode,
          source.destination?.countryCode
        )
      ),
      guideCountryCode: normalizeCountryCode(
        firstDefined(
          source.guideCountryCode,
          source.countryCode,
          source.destinationCountryCode
        )
      ),
      city: toText(firstDefined(source.city, source.destinationCity)),

      purpose: toText(source.purpose, "leisure") || "leisure",
      tripType: toText(source.tripType, "family") || "family",
      travelStyle:
        toText(source.travelStyle, "premium-family") || "premium-family",
      priority: toText(source.priority, "normal") || "normal",

      status,
      planningStatus,
      lifecycleStatus: status,
      lifecycleChangedAt,
      completedAt:
        status === "completed"
          ? source.completedAt || lifecycleChangedAt || nowISO()
          : source.completedAt || null,

      startDate,
      endDate,
      durationDays,
      days: durationDays,

      travelers: Math.max(
        1,
        Math.min(
          maxTravelers,
          toNumber(source.travelers, Config.defaults.travelers || 1)
        )
      ),

      adults: Math.max(0, toNumber(source.adults, source.travelers || 1)),
      children: Math.max(0, toNumber(source.children, 0)),
      infants: Math.max(0, toNumber(source.infants, 0)),

      budget: Math.max(
        0,
        Math.min(maxBudget, toNumber(source.budget, Config.defaults.budget || 0))
      ),
      spent: Math.max(0, toNumber(source.spent, 0)),

      currency:
        toText(source.currency, Config.defaults.currency) ||
        Config.defaults.currency,

      departureAirport: toText(
        source.departureAirport || source.originAirport
      ),
      arrivalAirport: toText(
        source.arrivalAirport || source.destinationAirport
      ),
      airline: toText(source.airline || source.airlineName),
      flightNumber: toText(source.flightNumber || source.flightNo),
      departureDate: normalizeDateValue(
        source.departureDate || source.flightDate
      ),
      departureTime: normalizeTimeValue(
        source.departureTime ||
          source.flightTime ||
          source.flightDepartureTime
      ),
      arrivalDate: normalizeDateValue(source.arrivalDate),
      arrivalTime: normalizeTimeValue(
        source.arrivalTime || source.flightArrivalTime
      ),
      departureDateTime: toText(source.departureDateTime),
      arrivalDateTime: toText(source.arrivalDateTime),
      terminal: toText(source.terminal || source.departureTerminal),
      gate: toText(source.gate || source.departureGate),
      seatNumber: toText(source.seatNumber || source.seat),
      bookingReference: toText(
        source.bookingReference || source.pnr || source.confirmationNumber
      ),
      airportLeadMinutes: Math.max(
        0,
        toNumber(
          source.airportLeadMinutes ?? source.arriveAirportBeforeMinutes,
          120
        )
      ),

      accommodation:
        typeof source.accommodation === "string"
          ? source.accommodation.trim()
          : source.accommodation
            ? clone(source.accommodation)
            : "",
      accommodationAddress: toText(
        source.accommodationAddress || source.hotelAddress
      ),
      hotelName: toText(source.hotelName || source.accommodationName),
      hotelBookingReference: toText(
        source.hotelBookingReference || source.hotelConfirmationNumber
      ),
      hotelCheckIn: normalizeDateValue(source.hotelCheckIn || source.checkIn),
      hotelCheckOut: normalizeDateValue(
        source.hotelCheckOut || source.checkOut
      ),

      transport: toText(source.transport),
      activities: toArray(source.activities),
      notes: toText(source.notes).slice(0, notesMaxLength),
      emergencyContact: toText(source.emergencyContact),
      visaRequired: toBoolean(source.visaRequired, false),
      insuranceRequired: toBoolean(source.insuranceRequired, true),
      featured: toBoolean(source.featured, false),

      annualPlanId: source.annualPlanId || null,
      source: toText(source.source, "manual") || "manual",
      checklist: normalizeTripChecklist(source.checklist),

      ticketImport: source.ticketImport ? clone(source.ticketImport) : null,
      hotelImport: source.hotelImport ? clone(source.hotelImport) : null,
      flight: isObject(source.flight) ? clone(source.flight) : source.flight || null,
      outboundFlight: isObject(source.outboundFlight)
        ? clone(source.outboundFlight)
        : source.outboundFlight || null,
      returnFlight: isObject(source.returnFlight)
        ? clone(source.returnFlight)
        : source.returnFlight || null,
      hotel: isObject(source.hotel) ? clone(source.hotel) : source.hotel || null,

      flights: toArray(source.flights),
      bookings: toArray(source.bookings),
      itinerary: Array.isArray(source.itinerary)
        ? clone(source.itinerary)
        : source.itinerary
          ? clone(source.itinerary)
          : [],
      expenses: toArray(source.expenses),
      documents: toArray(source.documents),
      packing: toArray(source.packing),
      memories: toArray(source.memories),

      coverImage: toText(source.coverImage),
      archivedAt: source.archivedAt || null,
      createdAt: source.createdAt || nowISO(),
      updatedAt: nowISO()
    };
  };

  const normalizeWishlistItem = (item = {}) => {
    const source = isObject(item) ? clone(item) : { countryCode: item };

    return {
      ...source,
      id: source.id || createId("wishlist"),
      countryCode: normalizeCountryCode(
        firstDefined(
          source.countryCode,
          source.code,
          source.iso2,
          source.country?.code
        )
      ),
      countryName: toText(
        firstDefined(
          source.countryName,
          source.country?.nameAr,
          typeof source.country === "string" ? source.country : ""
        )
      ),
      addedAt: source.addedAt || source.createdAt || nowISO(),
      source: toText(source.source, "guide") || "guide",
      priority: Math.max(1, Math.min(5, toNumber(source.priority, 3))),
      preferredMonth: source.preferredMonth
        ? Math.max(1, Math.min(12, toNumber(source.preferredMonth, 1)))
        : null,
      preferredYear: toNumber(source.preferredYear, 0) || null,
      notes: toText(source.notes),
      metadata: isObject(source.metadata) ? clone(source.metadata) : {},
      createdAt: source.createdAt || nowISO(),
      updatedAt: nowISO()
    };
  };

  const normalizeAnnualPlan = (plan = {}) => {
    const source = isObject(plan) ? clone(plan) : {};

    const status = PLAN_STATUSES.includes(toText(source.status))
      ? toText(source.status)
      : "idea";

    return {
      ...source,
      id: source.id || createId("annual_plan"),
      countryCode: normalizeCountryCode(
        firstDefined(
          source.countryCode,
          source.code,
          source.destination?.countryCode
        )
      ),
      countryName: toText(
        firstDefined(
          source.countryName,
          source.destination?.countryName,
          source.country
        )
      ),
      year: Math.max(
        new Date().getFullYear(),
        toNumber(source.year, new Date().getFullYear())
      ),
      month: source.month
        ? Math.max(1, Math.min(12, toNumber(source.month, 1)))
        : null,
      days: Math.max(1, toNumber(source.days, 7)),
      travelers: Math.max(1, toNumber(source.travelers, 1)),
      budgetAED: toNonNegative(
        firstDefined(source.budgetAED, source.budget, 0)
      ),
      status,
      source: toText(source.source, "guide") || "guide",
      convertedTripId: source.convertedTripId || source.tripId || null,
      checklist: {
        destinationSelected:
          source.checklist?.destinationSelected !== false,
        budgetReviewed: toBoolean(source.checklist?.budgetReviewed, false),
        datesSelected: toBoolean(source.checklist?.datesSelected, false),
        flightBooked: toBoolean(source.checklist?.flightBooked, false),
        hotelBooked: toBoolean(source.checklist?.hotelBooked, false),
        documentsReady: toBoolean(source.checklist?.documentsReady, false)
      },
      tags: toArray(source.tags),
      notes: toText(source.notes),
      createdAt: source.createdAt || nowISO(),
      updatedAt: nowISO()
    };
  };

  const normalizeExpense = (expense = {}) => {
    const source = isObject(expense) ? clone(expense) : {};

    return {
      ...source,
      id: source.id || source._id || createId("expense"),
      tripId: source.tripId || null,
      category: toText(source.category || source.type, "other") || "other",
      type: toText(source.type || source.category, "other") || "other",
      title: toText(source.title || source.name || source.description),
      amount: toNonNegative(
        firstDefined(source.amount, source.total, source.value, 0)
      ),
      currency:
        toText(source.currency, Config.defaults.currency) ||
        Config.defaults.currency,
      date: normalizeDateValue(
        firstDefined(source.date, source.paidAt, source.expenseDate, todayISO())
      ),
      paidAt: source.paidAt || source.date || null,
      status: toText(source.status, "paid") || "paid",
      paymentMethod:
        toText(source.paymentMethod || source.method, "other") || "other",
      notes: toText(source.notes),
      reference: toText(source.reference || source.transactionReference),
      deletedAt: source.deletedAt || null,
      isDeleted: toBoolean(source.isDeleted, false),
      createdAt: source.createdAt || nowISO(),
      updatedAt: nowISO()
    };
  };

  const normalizeSavingEntry = (entry = {}) => {
    const source = isObject(entry) ? clone(entry) : { amount: entry };

    return {
      ...source,
      id: source.id || createId("saving"),
      type: toText(source.type, "deposit") || "deposit",
      amount: toNonNegative(source.amount),
      date: normalizeDateValue(source.date || todayISO()),
      notes: toText(source.notes),
      createdAt: source.createdAt || nowISO(),
      updatedAt: nowISO()
    };
  };

  const normalizePayment = (payment = {}) => {
    const source = isObject(payment) ? clone(payment) : {};
    const amount = toNonNegative(source.amount);
    const paidAmount = Math.min(amount, toNonNegative(source.paidAmount));

    let status = toText(source.status, "pending") || "pending";

    if (
      paidAmount >= amount &&
      amount > 0 &&
      !["refunded", "cancelled"].includes(status)
    ) {
      status = "paid";
    } else if (paidAmount > 0 && paidAmount < amount && status === "pending") {
      status = "partial";
    }

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
      currency:
        toText(source.currency, Config.defaults.currency) ||
        Config.defaults.currency,
      status,
      dueDate: normalizeDateValue(source.dueDate),
      paidAt: source.paidAt || null,
      paymentMethod: toText(source.paymentMethod, "other") || "other",
      notes: toText(source.notes),
      deletedAt: source.deletedAt || null,
      createdAt: source.createdAt || nowISO(),
      updatedAt: nowISO()
    };
  };

  const normalizeNotification = (notification = {}) => {
    const source = isObject(notification) ? clone(notification) : {};

    return {
      ...source,
      id: source.id || createId("budget_notification"),
      read: toBoolean(source.read, false),
      status: toText(source.status, "active") || "active",
      createdAt: source.createdAt || nowISO(),
      updatedAt: nowISO()
    };
  };

  /* =========================================================
     Finance synchronization
  ========================================================= */

  const calculateSavingsBalance = (savings) =>
    toArray(savings.entries).reduce((total, item) => {
      const amount = toNonNegative(item.amount);
      return item.type === "withdrawal" ? total - amount : total + amount;
    }, 0);

  const syncFinanceAliases = (currentState) => {
    const expenseCandidates = []
      .concat(toArray(currentState.expenses))
      .concat(toArray(currentState.budgets?.expenses))
      .concat(toArray(currentState.finance?.expenses));

    currentState.expenses = uniqueById(expenseCandidates.map(normalizeExpense));

    currentState.budgets = isObject(currentState.budgets)
      ? currentState.budgets
      : {};
    currentState.budgets.expenses = clone(currentState.expenses);

    currentState.savings = isObject(currentState.savings)
      ? currentState.savings
      : {};

    const savingEntries = uniqueById(
      []
        .concat(toArray(currentState.savings.entries))
        .concat(toArray(currentState.savings.contributions))
        .concat(toArray(currentState.savings.transactions))
        .map(normalizeSavingEntry)
    );

    currentState.savings.entries = savingEntries;
    currentState.savings.contributions = clone(savingEntries);
    currentState.savings.transactions = clone(savingEntries);

    const calculatedBalance = calculateSavingsBalance(currentState.savings);

    currentState.savings.balance = firstDefined(
      currentState.savings.balance,
      currentState.savings.currentBalance,
      currentState.budgets.savingsBalance,
      calculatedBalance
    );

    if (savingEntries.length) currentState.savings.balance = calculatedBalance;

    currentState.savings.currentBalance = toNumber(
      currentState.savings.balance,
      0
    );

    currentState.savings.monthlySaving = toNonNegative(
      firstDefined(
        currentState.savings.monthlySaving,
        currentState.savings.monthlySavingTarget,
        currentState.profile?.monthlySaving,
        currentState.profile?.monthlyTravelSaving,
        currentState.settings?.monthlySaving,
        currentState.budgets?.monthlySavingTarget,
        1500
      )
    );

    currentState.savings.monthlySavingTarget =
      currentState.savings.monthlySaving;

    currentState.payments = uniqueById(
      []
        .concat(toArray(currentState.payments))
        .concat(toArray(currentState.finance?.payments))
        .map(normalizePayment)
    );

    currentState.budgetAlerts = isObject(currentState.budgetAlerts)
      ? currentState.budgetAlerts
      : { items: [], rules: {} };
    currentState.budgetAlerts.items = uniqueById(
      toArray(currentState.budgetAlerts.items)
    );

    currentState.budgetRecommendations = isObject(
      currentState.budgetRecommendations
    )
      ? currentState.budgetRecommendations
      : { items: [], dismissed: [] };
    currentState.budgetRecommendations.items = uniqueById(
      toArray(currentState.budgetRecommendations.items)
    );

    currentState.budgetNotifications = isObject(
      currentState.budgetNotifications
    )
      ? currentState.budgetNotifications
      : { items: [], preferences: {} };
    currentState.budgetNotifications.items = uniqueById(
      toArray(currentState.budgetNotifications.items).map(normalizeNotification)
    );

    currentState.finance = isObject(currentState.finance)
      ? currentState.finance
      : {};
    currentState.finance.expenses = clone(currentState.expenses);
    currentState.finance.savings = clone(currentState.savings);
    currentState.finance.payments = clone(currentState.payments);
    currentState.finance.alerts = clone(currentState.budgetAlerts);
    currentState.finance.recommendations = clone(
      currentState.budgetRecommendations
    );
    currentState.finance.notifications = clone(
      currentState.budgetNotifications
    );
    currentState.finance.updatedAt = nowISO();

    currentState.budgets.savingsBalance = toNumber(
      currentState.savings.balance,
      0
    );
    currentState.budgets.monthlySavingTarget =
      currentState.savings.monthlySaving;

    currentState.profile = isObject(currentState.profile)
      ? currentState.profile
      : {};
    currentState.profile.monthlySaving = currentState.savings.monthlySaving;
    currentState.profile.monthlyTravelSaving =
      currentState.savings.monthlySaving;

    currentState.settings = isObject(currentState.settings)
      ? currentState.settings
      : {};
    currentState.settings.monthlySaving = currentState.savings.monthlySaving;
    currentState.settings.annualTravelBudget = toNonNegative(
      firstDefined(
        currentState.settings.annualTravelBudget,
        currentState.profile.annualTravelBudget,
        currentState.budgets.annualBudget,
        30000
      )
    );

    currentState.profile.annualTravelBudget =
      currentState.settings.annualTravelBudget;
    currentState.budgets.annualBudget =
      currentState.settings.annualTravelBudget;

    return currentState;
  };

  const recalculateTripSpending = (currentState) => {
    const totals = new Map();

    currentState.expenses
      .filter(
        (expense) =>
          !expense.deletedAt &&
          expense.isDeleted !== true &&
          expense.status !== "cancelled"
      )
      .forEach((expense) => {
        if (!expense.tripId) return;

        const key = String(expense.tripId);
        totals.set(
          key,
          toNumber(totals.get(key), 0) + toNonNegative(expense.amount)
        );
      });

    currentState.trips = currentState.trips.map((trip) => ({
      ...trip,
      spent: totals.has(String(trip.id))
        ? totals.get(String(trip.id))
        : toNonNegative(trip.spent),
      updatedAt: trip.updatedAt || nowISO()
    }));

    return currentState;
  };

  /* =========================================================
     State normalization and statistics
  ========================================================= */

  const normalizeState = (input) => {
    const defaults = getDefaultState();
    const merged = deepMerge(defaults, isObject(input) ? input : {});

    merged.meta.appId = Config.id;
    merged.meta.appVersion = Config.appVersion;
    merged.meta.storeVersion = STORE_VERSION;
    merged.meta.schemaVersion = SCHEMA_VERSION;
    merged.meta.updatedAt = nowISO();

    merged.trips = uniqueById(toArray(merged.trips).map(normalizeTrip));
    merged.wishlist = uniqueById(
      toArray(merged.wishlist).map(normalizeWishlistItem)
    ).filter((item) => item.countryCode);

    merged.annualPlans = uniqueById(
      toArray(merged.annualPlans).map(normalizeAnnualPlan)
    ).filter((plan) => plan.countryCode);

    [
      "destinations",
      "documents",
      "reviews",
      "memories",
      "notifications"
    ].forEach((key) => {
      if (!Array.isArray(merged[key])) merged[key] = [];
    });

    merged.passport = isObject(merged.passport)
      ? merged.passport
      : clone(defaults.passport);

    merged.guideIntelligence = isObject(merged.guideIntelligence)
      ? merged.guideIntelligence
      : clone(defaults.guideIntelligence);

    syncFinanceAliases(merged);
    recalculateTripSpending(merged);

    return merged;
  };

  const calculatePlanReadiness = (plan) => {
    const checklist = isObject(plan?.checklist) ? plan.checklist : {};

    const steps = [
      checklist.destinationSelected !== false,
      checklist.budgetReviewed === true,
      checklist.datesSelected === true,
      checklist.flightBooked === true,
      checklist.hotelBooked === true,
      checklist.documentsReady === true
    ];

    const completed = steps.filter(Boolean).length;

    return {
      completed,
      total: steps.length,
      percent: Math.round((completed / steps.length) * 100),
      readyForTrip:
        checklist.flightBooked === true &&
        checklist.hotelBooked === true
    };
  };

  const calculateStatistics = (currentState) => {
    const trips = toArray(currentState.trips);
    const expenses = toArray(currentState.expenses).filter(
      (expense) =>
        !expense.deletedAt &&
        expense.isDeleted !== true &&
        expense.status !== "cancelled"
    );

    const wishlist = toArray(currentState.wishlist);
    const annualPlans = toArray(currentState.annualPlans);
    const visibleTrips = trips.filter((trip) => trip.status !== "archived");
    const completedTrips = visibleTrips.filter(
      (trip) => trip.status === "completed"
    );

    const countries = new Set(
      completedTrips
        .map((trip) => trip.countryCode || toText(trip.country).toLowerCase())
        .filter(Boolean)
    );

    const cities = new Set(
      completedTrips.map((trip) => toText(trip.city).toLowerCase()).filter(Boolean)
    );

    const totalTravelSpend = expenses.reduce(
      (total, expense) => total + toNonNegative(expense.amount),
      0
    );

    const totalTravelBudget = visibleTrips.reduce(
      (total, trip) => total + toNonNegative(trip.budget),
      0
    );

    const overduePayments = currentState.payments.filter(
      (payment) => payment.status === "overdue"
    ).length;

    const activeBudgetAlerts = currentState.budgetAlerts.items.filter(
      (alert) => !["resolved", "dismissed"].includes(alert.status)
    ).length;

    const unreadBudgetNotifications =
      currentState.budgetNotifications.items.filter(
        (notification) =>
          notification.read !== true && notification.status === "active"
      ).length;

    currentState.statistics = {
      totalTrips: visibleTrips.length,
      completedTrips: completedTrips.length,
      upcomingTrips: visibleTrips.filter((trip) =>
        UPCOMING_STATUSES.includes(trip.status)
      ).length,
      activeTrips: visibleTrips.filter((trip) =>
        ACTIVE_STATUSES.includes(trip.status)
      ).length,
      visitedCountries: countries.size,
      visitedCities: cities.size,
      wishlistCount: wishlist.length,
      annualPlanCount: annualPlans.length,
      readyAnnualPlans: annualPlans.filter(
        (plan) => calculatePlanReadiness(plan).readyForTrip
      ).length,
      totalTravelSpend,
      totalTravelBudget,
      savedForTravel: toNumber(currentState.savings.balance, 0),
      expenseCount: expenses.length,
      paymentCount: currentState.payments.length,
      overduePayments,
      activeBudgetAlerts,
      unreadBudgetNotifications
    };

    currentState.budgets.totalSpent = totalTravelSpend;
    currentState.budgets.updatedAt = nowISO();

    return currentState;
  };

  const readStoredState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error("TIC Store: failed to read saved state.", error);
      return null;
    }
  };

  let state = calculateStatistics(
    normalizeState(readStoredState() || getDefaultState())
  );

  /* =========================================================
     Persistence and subscriptions
  ========================================================= */

  const dispatchStoreEvents = (event, snapshotValue) => {
    const detail = { state: snapshotValue, event };

    ["tic:store-change", "store:changed"].forEach((name) => {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    });
  };

  const notifyListeners = (event = {}) => {
    const snapshotValue = clone(state);

    listeners.forEach((listener) => {
      try {
        listener(snapshotValue, event);
      } catch (error) {
        console.error("TIC Store subscriber error:", error);
      }
    });

    dispatchStoreEvents(event, snapshotValue);
  };

  const persistImmediately = (event = { type: "persist" }) => {
    try {
      window.clearTimeout(saveTimer);
      saveTimer = null;
      state.meta.updatedAt = nowISO();

      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      notifyListeners(event);
      return true;
    } catch (error) {
      console.error("TIC Store: failed to save state.", error);
      return false;
    }
  };

  const schedulePersist = (event = { type: "update" }) => {
    if (transactionDepth > 0) {
      pendingTransactionEvent = pendingTransactionEvent || event;
      return;
    }

    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      persistImmediately(event);
    }, AUTO_SAVE_DELAY);
  };

  const replaceStateInternal = (nextState, event = { type: "replace" }) => {
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

    if (!parts.length) return false;

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
    if (path === undefined || path === null || path === "") {
      return clone(target);
    }

    const parts = Array.isArray(path)
      ? path
      : String(path)
          .split(".")
          .map((part) => part.trim())
          .filter(Boolean);

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
    state.trips.findIndex((trip) => String(trip.id) === String(tripId));

  const findExpenseIndex = (expenseId) =>
    state.expenses.findIndex(
      (expense) => String(expense.id) === String(expenseId)
    );

  const findPaymentIndex = (paymentId) =>
    state.payments.findIndex(
      (payment) => String(payment.id) === String(paymentId)
    );

  const findWishlistIndex = (identifier) => {
    const code = normalizeCountryCode(identifier);

    return state.wishlist.findIndex(
      (item) =>
        String(item.id) === String(identifier) ||
        (code && item.countryCode === code)
    );
  };

  const findAnnualPlanIndex = (planId) =>
    state.annualPlans.findIndex(
      (plan) => String(plan.id) === String(planId)
    );

  /* =========================================================
     Public Store API
  ========================================================= */

  const Store = {
    version: STORE_VERSION,

    getState() {
      return clone(state);
    },

    get(path, fallback = null) {
      return getByPath(state, path, fallback);
    },

    set(path, value, options = {}) {
      if (!setByPath(state, path, value)) return false;

      state = calculateStatistics(normalizeState(state));

      if (options.immediate === true) {
        return persistImmediately({ type: "set", path });
      }

      schedulePersist({ type: "set", path });
      return true;
    },

    setState(nextState, options = {}) {
      if (typeof nextState === "function") {
        return this.update(nextState, options);
      }

      return replaceStateInternal(nextState, {
        type: options.eventType || "set-state"
      });
    },

    replaceState(nextState, options = {}) {
      return replaceStateInternal(nextState, {
        type: options.eventType || "replace-state"
      });
    },

    patch(path, partialValue, options = {}) {
      if (isObject(path) && partialValue === undefined) {
        return this.update((draft) => deepMerge(draft, path), options);
      }

      const current = getByPath(state, path, {});

      if (!isObject(current) || !isObject(partialValue)) {
        return this.set(path, partialValue, options);
      }

      return this.set(path, deepMerge(current, partialValue), options);
    },

    update(mutator, options = {}) {
      if (typeof mutator !== "function") {
        throw new TypeError("TIC Store update requires a function.");
      }

      const draft = clone(state);
      const result = mutator(draft);

      state = calculateStatistics(
        normalizeState(result === undefined ? draft : result)
      );

      if (options.immediate === true) {
        persistImmediately({ type: options.eventType || "update" });
      } else {
        schedulePersist({ type: options.eventType || "update" });
      }

      return clone(state);
    },

    transaction(mutator, options = {}) {
      transactionDepth += 1;

      try {
        return this.update(mutator, {
          immediate: false,
          eventType: options.eventType || "transaction"
        });
      } finally {
        transactionDepth -= 1;

        if (transactionDepth === 0) {
          const event = pendingTransactionEvent || {
            type: options.eventType || "transaction"
          };

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

    save() {
      return persistImmediately({ type: "manual-save" });
    },

    /* =======================================================
       Generic action dispatcher
    ======================================================= */

    dispatch(actionOrObject, payload) {
      const action =
        typeof actionOrObject === "string"
          ? actionOrObject
          : actionOrObject?.type;

      const data =
        typeof actionOrObject === "string"
          ? payload
          : actionOrObject?.payload;

      const handlers = {
        "trips/add": () => this.createTrip(data),
        ADD_TRIP: () => this.createTrip(data),
        "trip/add": () => this.createTrip(data),

        "trips/update": () => this.updateTrip(data?.id, data),
        UPDATE_TRIP: () => this.updateTrip(data?.id, data),
        "trip/update": () => this.updateTrip(data?.id, data),

        "wishlist/add": () => this.addWishlistItem(data),
        ADD_WISHLIST_ITEM: () => this.addWishlistItem(data),
        "guide/addWishlist": () => this.addWishlistItem(data),

        "wishlist/update": () => this.updateWishlistItem(data?.id, data),
        UPDATE_WISHLIST_ITEM: () => this.updateWishlistItem(data?.id, data),
        "guide/updateWishlist": () =>
          this.updateWishlistItem(data?.id, data),

        "wishlist/remove": () =>
          this.removeWishlistItem(data?.id || data?.countryCode),
        REMOVE_WISHLIST_ITEM: () =>
          this.removeWishlistItem(data?.id || data?.countryCode),
        "guide/removeWishlist": () =>
          this.removeWishlistItem(data?.id || data?.countryCode),

        "annualPlans/add": () => this.addAnnualPlan(data),
        ADD_ANNUAL_PLAN: () => this.addAnnualPlan(data),
        "guide/addAnnualPlan": () => this.addAnnualPlan(data),

        "annualPlans/update": () =>
          this.updateAnnualPlan(data?.id, data),
        UPDATE_ANNUAL_PLAN: () =>
          this.updateAnnualPlan(data?.id, data),
        "guide/updateAnnualPlan": () =>
          this.updateAnnualPlan(data?.id, data),

        "annualPlans/remove": () =>
          this.removeAnnualPlan(data?.id),
        REMOVE_ANNUAL_PLAN: () =>
          this.removeAnnualPlan(data?.id),
        "guide/removeAnnualPlan": () =>
          this.removeAnnualPlan(data?.id)
      };

      if (!handlers[action]) {
        throw new Error(`TIC Store: unsupported action "${action}".`);
      }

      return handlers[action]();
    },

    commit(actionOrObject, payload) {
      return this.dispatch(actionOrObject, payload);
    },

    execute(actionOrObject, payload) {
      return this.dispatch(actionOrObject, payload);
    },

    /* =======================================================
       Trip APIs and lifecycle
    ======================================================= */

    syncTripStatuses(options = {}) {
      const before = state.trips.map((trip) => ({
        id: trip.id,
        status: trip.status
      }));

      state = calculateStatistics(normalizeState(state));
      state.meta.lastTripLifecycleSyncAt = nowISO();

      const changedTripIds = state.trips
        .filter((trip) => {
          const previous = before.find(
            (item) => String(item.id) === String(trip.id)
          );
          return previous && previous.status !== trip.status;
        })
        .map((trip) => trip.id);

      if (changedTripIds.length || options.forcePersist === true) {
        persistImmediately({
          type: "trip-lifecycle-synced",
          changedTripIds
        });
      }

      return {
        changed: changedTripIds.length > 0,
        changedTripIds: clone(changedTripIds),
        trips: clone(state.trips)
      };
    },

    getTrips(options = {}) {
      this.syncTripStatuses();

      let items = state.trips.filter(
        (trip) => options.includeArchived === true || trip.status !== "archived"
      );

      if (options.status) {
        const statuses = Array.isArray(options.status)
          ? options.status
          : [options.status];

        items = items.filter((trip) => statuses.includes(trip.status));
      }

      if (options.planningStatus) {
        items = items.filter(
          (trip) => trip.planningStatus === options.planningStatus
        );
      }

      if (options.countryCode) {
        const code = normalizeCountryCode(options.countryCode);
        items = items.filter((trip) => trip.countryCode === code);
      }

      if (options.country) {
        const country = toText(options.country).toLowerCase();
        items = items.filter(
          (trip) => toText(trip.country).toLowerCase() === country
        );
      }

      if (options.sort === "newest") items.sort(compareTripsNewestFirst);
      if (options.sort === "soonest") items.sort(compareTripsSoonestFirst);

      return clone(items);
    },

    listTrips(options = {}) {
      return this.getTrips(options);
    },

    getUpcomingTrips() {
      return this.getTrips({ status: UPCOMING_STATUSES, sort: "soonest" });
    },

    getActiveTrips() {
      return this.getTrips({ status: ACTIVE_STATUSES, sort: "soonest" });
    },

    getCompletedTrips() {
      return this.getTrips({ status: "completed", sort: "newest" });
    },

    getPassportTrips() {
      return this.getCompletedTrips();
    },

    getTripLifecycleStatus(tripOrId) {
      const trip = isObject(tripOrId) ? tripOrId : this.getTrip(tripOrId);
      if (!trip) return null;

      return resolveLifecycleStatus({
        status: trip.status,
        startDate: trip.startDate,
        endDate: trip.endDate,
        durationDays: trip.durationDays
      });
    },

    createTrip(tripData) {
      const trip = normalizeTrip(tripData);

      const titleMinLength = toNumber(
        Config.validation?.trip?.titleMinLength,
        1
      );

      const titleMaxLength = toNumber(
        Config.validation?.trip?.titleMaxLength,
        200
      );

      if (trip.title.length < titleMinLength) {
        throw new Error("اسم الرحلة قصير جداً.");
      }

      if (trip.title.length > titleMaxLength) {
        throw new Error("اسم الرحلة أطول من الحد المسموح.");
      }

      state.trips.unshift(trip);
      state = calculateStatistics(normalizeState(state));
      persistImmediately({ type: "trip-created", tripId: trip.id });

      return this.getTrip(trip.id);
    },

    addTrip(tripData) {
      return this.createTrip(tripData);
    },

    updateTrip(tripId, changes = {}) {
      const index = findTripIndex(tripId);
      if (index === -1) return null;

      const current = state.trips[index];

      state.trips[index] = normalizeTrip({
        ...current,
        ...clone(changes),
        id: current.id,
        createdAt: current.createdAt
      });

      state = calculateStatistics(normalizeState(state));
      persistImmediately({ type: "trip-updated", tripId });

      return this.getTrip(tripId);
    },

    upsertTrip(tripData) {
      const tripId = tripData?.id;

      if (tripId && findTripIndex(tripId) !== -1) {
        return this.updateTrip(tripId, tripData);
      }

      return this.createTrip(tripData);
    },

    getTrip(tripId) {
      this.syncTripStatuses();

      const trip = state.trips.find(
        (item) => String(item.id) === String(tripId)
      );

      return trip ? clone(trip) : null;
    },

    getTripById(tripId) {
      return this.getTrip(tripId);
    },

    updateTripChecklist(tripId, changes = {}) {
      const trip = this.getTrip(tripId);
      if (!trip) return null;

      const checklist = normalizeTripChecklist({
        ...trip.checklist,
        ...clone(changes)
      });

      const planningStatus =
        checklist.flightBooked && checklist.hotelBooked
          ? "ready"
          : trip.planningStatus;

      return this.updateTrip(tripId, {
        checklist,
        planningStatus
      });
    },

    deleteTrip(tripId) {
      const index = findTripIndex(tripId);
      if (index === -1) return false;

      state.trips.splice(index, 1);

      state.expenses = state.expenses.filter(
        (expense) => String(expense.tripId) !== String(tripId)
      );

      state.payments = state.payments.filter(
        (payment) => String(payment.tripId) !== String(tripId)
      );

      state = calculateStatistics(normalizeState(state));
      persistImmediately({ type: "trip-deleted", tripId });

      return true;
    },

    archiveTrip(tripId) {
      return this.updateTrip(tripId, {
        status: "archived",
        archivedAt: nowISO()
      });
    },

    restoreTrip(tripId) {
      const trip = this.getTrip(tripId);
      if (!trip) return null;

      return this.updateTrip(tripId, {
        status: resolveLifecycleStatus({
          status: "planning",
          startDate: trip.startDate,
          endDate: trip.endDate,
          durationDays: trip.durationDays
        }),
        archivedAt: null
      });
    },

    /* =======================================================
       Wishlist APIs
    ======================================================= */

    getWishlist(options = {}) {
      let items = clone(state.wishlist);

      if (options.countryCode) {
        const code = normalizeCountryCode(options.countryCode);
        items = items.filter((item) => item.countryCode === code);
      }

      return items;
    },

    getWishlistItem(identifier) {
      const index = findWishlistIndex(identifier);
      return index === -1 ? null : clone(state.wishlist[index]);
    },

    isWishlisted(identifier) {
      return findWishlistIndex(identifier) !== -1;
    },

    addWishlistItem(itemData) {
      const item = normalizeWishlistItem(itemData);

      if (!item.countryCode) {
        throw new Error("رمز الدولة مطلوب لإضافة الأمنية.");
      }

      const existingIndex = findWishlistIndex(item.countryCode);

      if (existingIndex !== -1) {
        return clone(state.wishlist[existingIndex]);
      }

      state.wishlist.unshift(item);
      state = calculateStatistics(normalizeState(state));

      persistImmediately({
        type: "wishlist-item-created",
        wishlistId: item.id,
        countryCode: item.countryCode
      });

      return this.getWishlistItem(item.id);
    },

    addWishlist(itemData) {
      return this.addWishlistItem(itemData);
    },

    updateWishlistItem(identifier, changes = {}) {
      const index = findWishlistIndex(identifier);
      if (index === -1) return null;

      const current = state.wishlist[index];

      state.wishlist[index] = normalizeWishlistItem({
        ...current,
        ...clone(changes),
        id: current.id,
        countryCode: current.countryCode,
        createdAt: current.createdAt
      });

      state = calculateStatistics(normalizeState(state));

      persistImmediately({
        type: "wishlist-item-updated",
        wishlistId: current.id
      });

      return this.getWishlistItem(current.id);
    },

    removeWishlistItem(identifier) {
      const index = findWishlistIndex(identifier);
      if (index === -1) return false;

      const [removed] = state.wishlist.splice(index, 1);
      state = calculateStatistics(normalizeState(state));

      persistImmediately({
        type: "wishlist-item-deleted",
        wishlistId: removed.id,
        countryCode: removed.countryCode
      });

      return true;
    },

    removeWishlist(identifier) {
      return this.removeWishlistItem(identifier);
    },

    toggleWishlist(itemData) {
      const identifier =
        itemData?.id ||
        itemData?.countryCode ||
        itemData;

      if (this.isWishlisted(identifier)) {
        this.removeWishlistItem(identifier);
        return null;
      }

      return this.addWishlistItem(itemData);
    },

    /* =======================================================
       Annual Planner APIs
    ======================================================= */

    getAnnualPlans(options = {}) {
      let items = clone(state.annualPlans);

      if (options.year) {
        items = items.filter(
          (plan) => plan.year === Number(options.year)
        );
      }

      if (options.status) {
        items = items.filter(
          (plan) => plan.status === options.status
        );
      }

      if (options.countryCode) {
        const code = normalizeCountryCode(options.countryCode);
        items = items.filter((plan) => plan.countryCode === code);
      }

      items.sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return (a.month || 13) - (b.month || 13);
      });

      return items;
    },

    getAnnualPlan(planId) {
      const index = findAnnualPlanIndex(planId);
      return index === -1 ? null : clone(state.annualPlans[index]);
    },

    addAnnualPlan(planData) {
      const plan = normalizeAnnualPlan(planData);

      if (!plan.countryCode) {
        throw new Error("الدولة مطلوبة لإنشاء الخطة السنوية.");
      }

      const duplicate = state.annualPlans.find(
        (item) =>
          item.countryCode === plan.countryCode &&
          item.year === plan.year &&
          item.month === plan.month &&
          item.status !== "cancelled"
      );

      if (duplicate) return clone(duplicate);

      state.annualPlans.push(plan);
      state = calculateStatistics(normalizeState(state));

      persistImmediately({
        type: "annual-plan-created",
        planId: plan.id
      });

      return this.getAnnualPlan(plan.id);
    },

    createAnnualPlan(planData) {
      return this.addAnnualPlan(planData);
    },

    updateAnnualPlan(planId, changes = {}) {
      const index = findAnnualPlanIndex(planId);
      if (index === -1) return null;

      const current = state.annualPlans[index];

      state.annualPlans[index] = normalizeAnnualPlan({
        ...current,
        ...clone(changes),
        id: current.id,
        countryCode: current.countryCode,
        createdAt: current.createdAt
      });

      state = calculateStatistics(normalizeState(state));

      persistImmediately({
        type: "annual-plan-updated",
        planId
      });

      return this.getAnnualPlan(planId);
    },

    removeAnnualPlan(planId) {
      const index = findAnnualPlanIndex(planId);
      if (index === -1) return false;

      state.annualPlans.splice(index, 1);
      state = calculateStatistics(normalizeState(state));

      persistImmediately({
        type: "annual-plan-deleted",
        planId
      });

      return true;
    },

    deleteAnnualPlan(planId) {
      return this.removeAnnualPlan(planId);
    },

    linkAnnualPlanToTrip(planId, tripId) {
      return this.updateAnnualPlan(planId, {
        status: "converted",
        convertedTripId: tripId
      });
    },

    /* =======================================================
       Guide Intelligence APIs
    ======================================================= */

    getGuideIntelligence() {
      return clone(state.guideIntelligence);
    },

    setGuideIntelligence(payload = {}) {
      state.guideIntelligence = deepMerge(
        state.guideIntelligence,
        payload
      );

      state.guideIntelligence.updatedAt = nowISO();
      state.meta.lastGuideSyncAt = nowISO();

      schedulePersist({
        type: "guide-intelligence-updated"
      });

      return this.getGuideIntelligence();
    },

    setTravelDNA(payload = {}) {
      return this.setGuideIntelligence({
        travelDNA: clone(payload),
        lastGeneratedAt: nowISO()
      });
    },

    setGuideRecommendations(items = []) {
      return this.setGuideIntelligence({
        recommendations: toArray(items),
        lastGeneratedAt: nowISO()
      });
    },

    setSelectedGuideCountry(countryCode) {
      return this.setGuideIntelligence({
        selectedCountryCode: normalizeCountryCode(countryCode) || null
      });
    },

    /* =======================================================
       Expense APIs
    ======================================================= */

    getExpenses(options = {}) {
      let items = state.expenses.filter(
        (expense) =>
          options.includeDeleted === true ||
          (!expense.deletedAt && expense.isDeleted !== true)
      );

      if (options.tripId) {
        items = items.filter(
          (expense) => String(expense.tripId) === String(options.tripId)
        );
      }

      if (options.category) {
        items = items.filter(
          (expense) => expense.category === options.category
        );
      }

      return clone(items);
    },

    listExpenses(options = {}) {
      return this.getExpenses(options);
    },

    getExpense(expenseId) {
      const item = state.expenses.find(
        (expense) => String(expense.id) === String(expenseId)
      );

      return item ? clone(item) : null;
    },

    createExpense(expenseData) {
      return this.addExpense(expenseData);
    },

    addExpense(expenseData) {
      const expense = normalizeExpense(expenseData);

      if (!expense.title) throw new Error("اسم المصروف مطلوب.");

      if (expense.amount <= 0) {
        throw new Error("قيمة المصروف يجب أن تكون أكبر من صفر.");
      }

      state.expenses.unshift(expense);
      state = calculateStatistics(normalizeState(state));

      persistImmediately({
        type: "expense-created",
        expenseId: expense.id,
        tripId: expense.tripId
      });

      return this.getExpense(expense.id);
    },

    updateExpense(expenseId, changes = {}) {
      const index = findExpenseIndex(expenseId);
      if (index === -1) return null;

      const current = state.expenses[index];

      state.expenses[index] = normalizeExpense({
        ...current,
        ...clone(changes),
        id: current.id,
        createdAt: current.createdAt
      });

      state = calculateStatistics(normalizeState(state));
      persistImmediately({ type: "expense-updated", expenseId });

      return this.getExpense(expenseId);
    },

    deleteExpense(expenseId, options = {}) {
      const index = findExpenseIndex(expenseId);
      if (index === -1) return false;

      if (options.soft === true) {
        state.expenses[index] = normalizeExpense({
          ...state.expenses[index],
          deletedAt: nowISO(),
          isDeleted: true
        });
      } else {
        state.expenses.splice(index, 1);
      }

      state = calculateStatistics(normalizeState(state));
      persistImmediately({ type: "expense-deleted", expenseId });

      return true;
    },

    /* =======================================================
       Savings APIs
    ======================================================= */

    getSavings() {
      return clone(state.savings);
    },

    addSavingEntry(entryData) {
      const entry = normalizeSavingEntry(entryData);

      if (entry.amount <= 0) {
        throw new Error("قيمة الادخار يجب أن تكون أكبر من صفر.");
      }

      state.savings.entries.unshift(entry);
      state = calculateStatistics(normalizeState(state));

      persistImmediately({
        type:
          entry.type === "withdrawal"
            ? "savings-withdrawal-added"
            : "savings-deposit-added",
        savingId: entry.id
      });

      return clone(entry);
    },

    addDeposit(entryData) {
      return this.addSavingEntry({ ...clone(entryData), type: "deposit" });
    },

    deposit(entryData) {
      return this.addDeposit(entryData);
    },

    addWithdrawal(entryData) {
      return this.addSavingEntry({ ...clone(entryData), type: "withdrawal" });
    },

    setMonthlySaving(value) {
      const monthlySaving = isObject(value)
        ? toNonNegative(firstDefined(value.monthlySaving, value.amount, 0))
        : toNonNegative(value);

      state.savings.monthlySaving = monthlySaving;
      state = calculateStatistics(normalizeState(state));

      persistImmediately({
        type: "savings-plan-updated",
        monthlySaving
      });

      return this.getSavings();
    },

    updateSavingsPlan(plan = {}) {
      state.savings = { ...state.savings, ...clone(plan) };
      state = calculateStatistics(normalizeState(state));
      persistImmediately({ type: "savings-plan-updated" });

      return this.getSavings();
    },

    setPlan(plan = {}) {
      return this.updateSavingsPlan(plan);
    },

    savePlan(plan = {}) {
      return this.updateSavingsPlan(plan);
    },

    /* =======================================================
       Payment APIs
    ======================================================= */

    getPayments(options = {}) {
      let items = state.payments.filter(
        (payment) => options.includeDeleted === true || !payment.deletedAt
      );

      if (options.tripId) {
        items = items.filter(
          (payment) => String(payment.tripId) === String(options.tripId)
        );
      }

      return clone(items);
    },

    getPayment(paymentId) {
      const item = state.payments.find(
        (payment) => String(payment.id) === String(paymentId)
      );

      return item ? clone(item) : null;
    },

    createPayment(paymentData) {
      const payment = normalizePayment(paymentData);

      if (!payment.title) throw new Error("اسم الدفعة مطلوب.");

      if (payment.amount <= 0) {
        throw new Error("قيمة الدفعة يجب أن تكون أكبر من صفر.");
      }

      state.payments.unshift(payment);
      state = calculateStatistics(normalizeState(state));

      persistImmediately({
        type: "payment-created",
        paymentId: payment.id
      });

      return this.getPayment(payment.id);
    },

    updatePayment(paymentId, changes = {}) {
      const index = findPaymentIndex(paymentId);
      if (index === -1) return null;

      const current = state.payments[index];

      state.payments[index] = normalizePayment({
        ...current,
        ...clone(changes),
        id: current.id,
        createdAt: current.createdAt
      });

      state = calculateStatistics(normalizeState(state));
      persistImmediately({ type: "payment-updated", paymentId });

      return this.getPayment(paymentId);
    },

    recordPayment(paymentId, paymentData = {}) {
      const current = this.getPayment(paymentId);
      if (!current) return null;

      const amount = toNonNegative(
        firstDefined(paymentData.amount, current.remainingAmount, 0)
      );

      const nextPaidAmount = Math.min(
        current.amount,
        current.paidAmount + amount
      );

      const updated = this.updatePayment(paymentId, {
        paidAmount: nextPaidAmount,
        paidAt: paymentData.paidAt || todayISO()
      });

      if (updated && paymentData.createExpense === true && amount > 0) {
        const expense = this.addExpense({
          tripId: current.tripId,
          title: `دفعة: ${current.title}`,
          amount,
          category: current.type || "other",
          currency: current.currency,
          date: paymentData.paidAt || todayISO(),
          paymentMethod: current.paymentMethod,
          paymentId: current.id,
          status: "paid"
        });

        this.updatePayment(paymentId, { expenseId: expense.id });
      }

      persistImmediately({
        type: "payment-paid",
        paymentId,
        amount
      });

      return this.getPayment(paymentId);
    },

    markPaymentPaid(paymentId, paymentData = {}) {
      return this.recordPayment(paymentId, paymentData);
    },

    deletePayment(paymentId, options = {}) {
      const index = findPaymentIndex(paymentId);
      if (index === -1) return false;

      if (options.soft === true) {
        state.payments[index] = normalizePayment({
          ...state.payments[index],
          deletedAt: nowISO()
        });
      } else {
        state.payments.splice(index, 1);
      }

      state = calculateStatistics(normalizeState(state));
      persistImmediately({ type: "payment-deleted", paymentId });

      return true;
    },

    /* =======================================================
       Budget Intelligence persistence APIs
    ======================================================= */

    setBudgetAlerts(payload = {}) {
      state.budgetAlerts = deepMerge(state.budgetAlerts, payload);
      state = calculateStatistics(normalizeState(state));
      persistImmediately({ type: "budget-alerts-updated" });

      return clone(state.budgetAlerts);
    },

    setBudgetRecommendations(payload = {}) {
      state.budgetRecommendations = deepMerge(
        state.budgetRecommendations,
        payload
      );

      state = calculateStatistics(normalizeState(state));
      persistImmediately({ type: "budget-recommendations-updated" });

      return clone(state.budgetRecommendations);
    },

    setBudgetNotifications(payload = {}) {
      state.budgetNotifications = deepMerge(
        state.budgetNotifications,
        payload
      );

      state = calculateStatistics(normalizeState(state));
      persistImmediately({ type: "budget-notifications-updated" });

      return clone(state.budgetNotifications);
    },

    setBudgetIntelligence(payload = {}) {
      state.budgetIntelligence = deepMerge(
        state.budgetIntelligence,
        payload
      );

      state.budgetIntelligence.updatedAt = nowISO();
      state = calculateStatistics(normalizeState(state));

      schedulePersist({
        type: "budget-intelligence-updated"
      });

      return clone(state.budgetIntelligence);
    },

    /* =======================================================
       Backup / import / export
    ======================================================= */

    createBackup() {
      const backups = this.getBackups();

      const backup = {
        id: createId("backup"),
        createdAt: nowISO(),
        schemaVersion: SCHEMA_VERSION,
        appVersion: Config.appVersion,
        storeVersion: STORE_VERSION,
        state: clone(state)
      };

      backups.unshift(backup);

      try {
        localStorage.setItem(
          BACKUP_KEY,
          JSON.stringify(backups.slice(0, MAX_BACKUPS))
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

      if (!backup || !backup.state) return false;

      replaceStateInternal(backup.state, {
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
          storeVersion: STORE_VERSION,
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

      const importedState = parsed && parsed.state ? parsed.state : parsed;

      if (!isObject(importedState)) {
        throw new Error("ملف البيانات غير صالح.");
      }

      this.createBackup();
      replaceStateInternal(importedState, { type: "data-imported" });

      return clone(state);
    },

    reset(options = {}) {
      if (options.createBackup !== false) {
        this.createBackup();
      }

      state = calculateStatistics(normalizeState(getDefaultState()));
      persistImmediately({ type: "store-reset" });

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
        upcomingTripCount: state.statistics.upcomingTrips,
        activeTripCount: state.statistics.activeTrips,
        completedTripCount: state.statistics.completedTrips,
        passportTripCount: state.statistics.completedTrips,
        visitedCountryCount: state.statistics.visitedCountries,
        wishlistCount: state.wishlist.length,
        annualPlanCount: state.annualPlans.length,
        expenseCount: state.expenses.length,
        paymentCount: state.payments.length,
        savingEntryCount: state.savings.entries.length,
        budgetAlertCount: state.budgetAlerts.items.length,
        budgetNotificationCount: state.budgetNotifications.items.length,
        lastTripLifecycleSyncAt: state.meta.lastTripLifecycleSyncAt,
        lastGuideSyncAt: state.meta.lastGuideSyncAt,
        lastUpdatedAt: state.meta.updatedAt,
        lastBackupAt: state.meta.lastBackupAt
      };
    }
  };

  /* =========================================================
     Startup migration and global registration
  ========================================================= */

  const storedState = readStoredState();

  if (!storedState) {
    state.meta.lastTripLifecycleSyncAt = nowISO();
    state.meta.lastGuideSyncAt = nowISO();

    persistImmediately({
      type: "store-initialized-v2.2.0"
    });
  } else {
    state.meta.lastMigrationAt = nowISO();
    state.meta.lastTripLifecycleSyncAt = nowISO();
    state.meta.lastGuideSyncAt = nowISO();

    persistImmediately({
      type: "store-migrated-v2.2.0"
    });
  }

  window.TIC = window.TIC || {};
  window.TIC.Store = Store;
  window.TICStore = Store;
  window.Store = Store;
  window.TravelStore = Store;
})(window);
