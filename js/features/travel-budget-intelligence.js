/* =========================================================
   Travel Intelligence Center
   Travel Budget Intelligence Engine V1.0.0

   File Path:
   js/features/travel-budget-intelligence.js

   Purpose:
   - Unified budget-based travel intelligence engine.
   - Combines budget advice, destination matching, season scoring,
     recommendation ranking, savings projection and travel timeline.
   - Reads Store safely without writing to it directly.
   - Uses TravelCostEngine when available and falls back to local estimates.
   - Prepares normalized Planned Trip drafts for PlannedTripEngine.
   - Lightweight in-memory cache for mobile performance.

   Global API:
   window.TravelBudgetIntelligence

   Version:
   1.0.0
   ========================================================= */
(function (window) {
  "use strict";

  const ENGINE_NAME = "TravelBudgetIntelligence";
  const ENGINE_VERSION = "1.0.0";
  const DEFAULT_CURRENCY = "AED";
  const DEFAULT_HOME_AIRPORT = "Abu Dhabi";
  const DEFAULT_MONTHLY_SAVING = 1500;
  const DEFAULT_TARGET_BUDGET = 5000;
  const DEFAULT_TRAVELERS = 1;
  const DEFAULT_DURATION_DAYS = 5;
  const CACHE_TTL_MS = 60000;
  const MAX_RECOMMENDATIONS = 6;

  const BUDGET_LEVELS = Object.freeze({
    STARTER: "starter",
    SHORT_TRIP: "short-trip",
    COMFORT: "comfort",
    PREMIUM: "premium",
    MULTI_TRIP: "multi-trip"
  });

  const STRATEGIES = Object.freeze({
    SAVE_MORE: "save-more",
    SINGLE_TRIP: "single-trip",
    MULTI_TRIP: "multi-trip"
  });

  const MONTH_NAMES_AR = Object.freeze([
    "",
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر"
  ]);

  const DESTINATIONS = Object.freeze([
    {
      id: "baku",
      country: "أذربيجان",
      countryCode: "AZ",
      city: "باكو",
      region: "القوقاز",
      baseCost: 5000,
      idealDays: 5,
      minimumDays: 4,
      maximumDays: 7,
      bestMonths: [4, 5, 9, 10],
      goodMonths: [3, 6, 11],
      avoidMonths: [1, 2],
      winterMonths: [],
      tripTypes: ["city", "nature", "culture", "short-trip"],
      interests: ["food", "history", "nature", "shopping", "culture"],
      climates: ["mild", "cool"],
      accommodationStyles: ["standard", "comfort", "premium"],
      familyFriendly: true,
      quietFriendly: true,
      privacyFriendly: true,
      nightlifeFocused: false,
      halalFriendly: true,
      shattafAvailability: "high",
      flightHours: 3,
      visaType: "easy",
      costProfile: {
        flightPerTraveler: 1200,
        hotelPerNight: 400,
        mealsPerTravelerPerDay: 140,
        transportPerDay: 80,
        activitiesPerTravelerPerDay: 100,
        insurancePerTraveler: 100,
        visaPerTraveler: 0
      },
      highlights: ["المدينة القديمة", "بوليفارد باكو", "قوبوستان", "جبال شاهداغ"]
    },
    {
      id: "budapest",
      country: "المجر",
      countryCode: "HU",
      city: "بودابست",
      region: "أوروبا",
      baseCost: 9500,
      idealDays: 7,
      minimumDays: 5,
      maximumDays: 9,
      bestMonths: [4, 5, 9, 10, 12],
      goodMonths: [6, 7, 8],
      avoidMonths: [1, 2],
      winterMonths: [12],
      tripTypes: ["city", "culture", "romantic"],
      interests: ["architecture", "history", "food", "river", "culture"],
      climates: ["mild", "cold"],
      accommodationStyles: ["comfort", "premium", "luxury"],
      familyFriendly: true,
      quietFriendly: true,
      privacyFriendly: true,
      nightlifeFocused: false,
      halalFriendly: true,
      shattafAvailability: "medium",
      flightHours: 6,
      visaType: "schengen",
      costProfile: {
        flightPerTraveler: 1800,
        hotelPerNight: 600,
        mealsPerTravelerPerDay: 190,
        transportPerDay: 110,
        activitiesPerTravelerPerDay: 150,
        insurancePerTraveler: 140,
        visaPerTraveler: 0
      },
      highlights: ["نهر الدانوب", "قلعة بودا", "البرلمان المجري", "الحمامات الحرارية"]
    },
    {
      id: "switzerland",
      country: "سويسرا",
      countryCode: "CH",
      city: "إنترلاكن",
      region: "أوروبا",
      baseCost: 15000,
      idealDays: 8,
      minimumDays: 6,
      maximumDays: 12,
      bestMonths: [6, 7, 8, 9],
      goodMonths: [5, 10],
      avoidMonths: [3, 4, 11],
      winterMonths: [12, 1, 2],
      tripTypes: ["nature", "luxury", "mountains", "snow"],
      interests: ["scenery", "snow", "lakes", "trains", "nature"],
      climates: ["cool", "cold"],
      accommodationStyles: ["comfort", "premium", "luxury"],
      familyFriendly: true,
      quietFriendly: true,
      privacyFriendly: true,
      nightlifeFocused: false,
      halalFriendly: true,
      shattafAvailability: "medium",
      flightHours: 7,
      visaType: "schengen",
      costProfile: {
        flightPerTraveler: 2500,
        hotelPerNight: 1100,
        mealsPerTravelerPerDay: 320,
        transportPerDay: 230,
        activitiesPerTravelerPerDay: 240,
        insurancePerTraveler: 180,
        visaPerTraveler: 0
      },
      highlights: ["إنترلاكن", "لوتربرونن", "قطارات الجبال", "البحيرات السويسرية"]
    },
    {
      id: "bosnia",
      country: "البوسنة والهرسك",
      countryCode: "BA",
      city: "سراييفو",
      region: "أوروبا",
      baseCost: 5000,
      idealDays: 5,
      minimumDays: 4,
      maximumDays: 8,
      bestMonths: [5, 6, 9, 10],
      goodMonths: [4, 7, 8],
      avoidMonths: [1, 2],
      winterMonths: [],
      tripTypes: ["nature", "culture", "family"],
      interests: ["history", "food", "mountains", "rivers", "nature"],
      climates: ["mild", "cool"],
      accommodationStyles: ["standard", "comfort", "premium"],
      familyFriendly: true,
      quietFriendly: true,
      privacyFriendly: true,
      nightlifeFocused: false,
      halalFriendly: true,
      shattafAvailability: "high",
      flightHours: 6,
      visaType: "easy",
      costProfile: {
        flightPerTraveler: 1500,
        hotelPerNight: 450,
        mealsPerTravelerPerDay: 150,
        transportPerDay: 90,
        activitiesPerTravelerPerDay: 120,
        insurancePerTraveler: 110,
        visaPerTraveler: 0
      },
      highlights: ["سراييفو", "موستار", "شلالات كرافيتسا", "نهر أونا"]
    },
    {
      id: "georgia",
      country: "جورجيا",
      countryCode: "GE",
      city: "تبليسي",
      region: "القوقاز",
      baseCost: 5500,
      idealDays: 6,
      minimumDays: 4,
      maximumDays: 8,
      bestMonths: [5, 6, 9, 10],
      goodMonths: [4, 7, 8],
      avoidMonths: [1, 2],
      winterMonths: [],
      tripTypes: ["nature", "mountains", "city"],
      interests: ["food", "culture", "scenery", "history", "nature"],
      climates: ["mild", "cool"],
      accommodationStyles: ["standard", "comfort", "premium"],
      familyFriendly: true,
      quietFriendly: true,
      privacyFriendly: true,
      nightlifeFocused: false,
      halalFriendly: true,
      shattafAvailability: "high",
      flightHours: 3.5,
      visaType: "easy",
      costProfile: {
        flightPerTraveler: 1100,
        hotelPerNight: 380,
        mealsPerTravelerPerDay: 130,
        transportPerDay: 80,
        activitiesPerTravelerPerDay: 110,
        insurancePerTraveler: 100,
        visaPerTraveler: 0
      },
      highlights: ["تبليسي", "كازبيجي", "جبال القوقاز", "بورجومي"]
    },
    {
      id: "albania",
      country: "ألبانيا",
      countryCode: "AL",
      city: "تيرانا",
      region: "أوروبا",
      baseCost: 7000,
      idealDays: 6,
      minimumDays: 5,
      maximumDays: 9,
      bestMonths: [5, 6, 9],
      goodMonths: [4, 7, 8, 10],
      avoidMonths: [1, 2],
      winterMonths: [],
      tripTypes: ["beach", "nature", "city", "road-trip"],
      interests: ["sea", "food", "nature", "road-trip", "mountains"],
      climates: ["warm", "mild"],
      accommodationStyles: ["standard", "comfort", "premium"],
      familyFriendly: true,
      quietFriendly: true,
      privacyFriendly: true,
      nightlifeFocused: false,
      halalFriendly: true,
      shattafAvailability: "high",
      flightHours: 6,
      visaType: "easy",
      costProfile: {
        flightPerTraveler: 1900,
        hotelPerNight: 500,
        mealsPerTravelerPerDay: 160,
        transportPerDay: 100,
        activitiesPerTravelerPerDay: 130,
        insurancePerTraveler: 120,
        visaPerTraveler: 0
      },
      highlights: ["تيرانا", "ساراندا", "ريفيرا ألبانيا", "بحيرة كومان"]
    },
    {
      id: "maldives",
      country: "المالديف",
      countryCode: "MV",
      city: "ماليه",
      region: "المحيط الهندي",
      baseCost: 13000,
      idealDays: 5,
      minimumDays: 4,
      maximumDays: 7,
      bestMonths: [1, 2, 3, 11, 12],
      goodMonths: [4, 10],
      avoidMonths: [6, 7],
      winterMonths: [],
      tripTypes: ["beach", "luxury", "relaxation", "resort"],
      interests: ["sea", "privacy", "resort", "snorkeling", "relaxation"],
      climates: ["warm"],
      accommodationStyles: ["premium", "luxury"],
      familyFriendly: true,
      quietFriendly: true,
      privacyFriendly: true,
      nightlifeFocused: false,
      halalFriendly: true,
      shattafAvailability: "high",
      flightHours: 4,
      visaType: "easy",
      costProfile: {
        flightPerTraveler: 2200,
        hotelPerNight: 1800,
        mealsPerTravelerPerDay: 350,
        transportPerDay: 400,
        activitiesPerTravelerPerDay: 250,
        insurancePerTraveler: 140,
        visaPerTraveler: 0
      },
      highlights: ["فلل فوق الماء", "شواطئ خاصة", "سنوركلينغ", "منتجعات هادئة"]
    },
    {
      id: "phuket",
      country: "تايلاند",
      countryCode: "TH",
      city: "بوكيت",
      region: "آسيا",
      baseCost: 9000,
      idealDays: 7,
      minimumDays: 5,
      maximumDays: 10,
      bestMonths: [1, 2, 11, 12],
      goodMonths: [3, 4, 10],
      avoidMonths: [5, 6, 7, 8, 9],
      winterMonths: [],
      tripTypes: ["beach", "relaxation", "nature", "resort"],
      interests: ["sea", "food", "privacy", "islands", "nature"],
      climates: ["warm"],
      accommodationStyles: ["comfort", "premium", "luxury"],
      familyFriendly: true,
      quietFriendly: true,
      privacyFriendly: true,
      nightlifeFocused: false,
      halalFriendly: true,
      shattafAvailability: "high",
      flightHours: 6.5,
      visaType: "easy",
      costProfile: {
        flightPerTraveler: 1700,
        hotelPerNight: 700,
        mealsPerTravelerPerDay: 160,
        transportPerDay: 100,
        activitiesPerTravelerPerDay: 160,
        insurancePerTraveler: 120,
        visaPerTraveler: 0
      },
      highlights: ["خليج بانوا", "الجزر القريبة", "منتجعات خاصة", "جولات بحرية"]
    },
    {
      id: "salalah",
      country: "عُمان",
      countryCode: "OM",
      city: "صلالة",
      region: "الخليج",
      baseCost: 3500,
      idealDays: 4,
      minimumDays: 3,
      maximumDays: 6,
      bestMonths: [7, 8, 9],
      goodMonths: [6, 10],
      avoidMonths: [1, 2, 3],
      winterMonths: [],
      tripTypes: ["nature", "short-trip", "family"],
      interests: ["nature", "waterfalls", "mountains", "relaxation"],
      climates: ["mild"],
      accommodationStyles: ["standard", "comfort", "premium"],
      familyFriendly: true,
      quietFriendly: true,
      privacyFriendly: true,
      nightlifeFocused: false,
      halalFriendly: true,
      shattafAvailability: "high",
      flightHours: 2,
      visaType: "easy",
      costProfile: {
        flightPerTraveler: 700,
        hotelPerNight: 350,
        mealsPerTravelerPerDay: 120,
        transportPerDay: 70,
        activitiesPerTravelerPerDay: 80,
        insurancePerTraveler: 70,
        visaPerTraveler: 0
      },
      highlights: ["موسم الخريف", "وادي دربات", "عين جرزيز", "شاطئ المغسيل"]
    },
    {
      id: "istanbul",
      country: "تركيا",
      countryCode: "TR",
      city: "إسطنبول",
      region: "أوروبا وآسيا",
      baseCost: 6500,
      idealDays: 6,
      minimumDays: 4,
      maximumDays: 9,
      bestMonths: [4, 5, 9, 10, 12],
      goodMonths: [6, 7, 8],
      avoidMonths: [1, 2],
      winterMonths: [12],
      tripTypes: ["city", "culture", "shopping"],
      interests: ["food", "history", "shopping", "sea", "culture"],
      climates: ["mild", "cold"],
      accommodationStyles: ["standard", "comfort", "premium", "luxury"],
      familyFriendly: true,
      quietFriendly: false,
      privacyFriendly: true,
      nightlifeFocused: false,
      halalFriendly: true,
      shattafAvailability: "high",
      flightHours: 5,
      visaType: "easy",
      costProfile: {
        flightPerTraveler: 1300,
        hotelPerNight: 500,
        mealsPerTravelerPerDay: 170,
        transportPerDay: 100,
        activitiesPerTravelerPerDay: 140,
        insurancePerTraveler: 110,
        visaPerTraveler: 0
      },
      highlights: ["البوسفور", "السلطان أحمد", "الأسواق", "رحلات بحرية"]
    }
  ]);

  const cache = new Map();
  const listeners = new Set();

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function asMoney(value) {
    return Math.max(0, Math.round(asNumber(value, 0)));
  }

  function asText(value, fallback = "") {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  function normalizeKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/\s+/g, "-");
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function unique(values) {
    return [...new Set(asArray(values).filter(Boolean))];
  }

  function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function addMonths(date, months) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return value;
  }

  function emit(eventName, payload) {
    listeners.forEach((listener) => {
      if (listener.eventName !== eventName && listener.eventName !== "*") return;
      try {
        listener.handler(payload, eventName);
      } catch (error) {
        console.error(`[${ENGINE_NAME}] Listener failed:`, error);
      }
    });

    try {
      window.dispatchEvent(new CustomEvent(`travel:${eventName}`, { detail: payload }));
    } catch (_) {}
  }

  function on(eventName, handler) {
    if (typeof eventName !== "string" || typeof handler !== "function") {
      return function unsubscribeNoop() {};
    }

    const listener = { eventName, handler };
    listeners.add(listener);
    return function unsubscribe() {
      listeners.delete(listener);
    };
  }

  function getStoreState(explicitState) {
    if (isObject(explicitState)) return explicitState;

    const store = window.Store || window.TravelStore || window.AppStore || null;
    if (!store) return {};

    try {
      if (typeof store.getState === "function") return store.getState() || {};
      if (typeof store.get === "function") return store.get() || {};
      if (isObject(store.state)) return store.state;
      if (isObject(store.data)) return store.data;
    } catch (error) {
      console.warn(`[${ENGINE_NAME}] Could not read Store state:`, error);
    }

    return {};
  }

  function extractTravelDNA(state, input) {
    const explicitDNA = isObject(input.travelDNA) ? input.travelDNA : {};
    const stateDNA = isObject(state.travelDNA) ? state.travelDNA : {};
    const profileDNA = isObject(state.profile) && isObject(state.profile.travelDNA)
      ? state.profile.travelDNA
      : {};

    const merged = { ...profileDNA, ...stateDNA, ...explicitDNA };

    return {
      interests: unique([...asArray(merged.interests), ...asArray(merged.preferences)]).map(normalizeKey),
      preferredTripTypes: unique(asArray(merged.preferredTripTypes)).map(normalizeKey),
      preferredClimates: unique(asArray(merged.preferredClimates)).map(normalizeKey),
      accommodationPreferences: unique(asArray(merged.accommodationPreferences)).map(normalizeKey),
      familyFriendly: typeof merged.familyFriendly === "boolean" ? merged.familyFriendly : true,
      quietPlaces: typeof merged.quietPlaces === "boolean" ? merged.quietPlaces : true,
      privacy: typeof merged.privacy === "boolean" ? merged.privacy : true,
      nightlife: typeof merged.nightlife === "boolean" ? merged.nightlife : false,
      halalFriendly: typeof merged.halalFriendly === "boolean" ? merged.halalFriendly : true,
      shattafPreferred: typeof merged.shattafPreferred === "boolean" ? merged.shattafPreferred : true
    };
  }

  function normalizeContext(input = {}) {
    const safeInput = isObject(input) ? input : {};
    const state = getStoreState(safeInput.state);
    const profile = isObject(state.profile) ? state.profile : {};
    const savings = isObject(state.savings) ? state.savings : {};
    const budgets = isObject(state.budgets) ? state.budgets : {};

    return {
      state,
      profile: {
        name: asText(profile.name, "المسافر"),
        currency: asText(safeInput.currency || profile.currency, DEFAULT_CURRENCY),
        homeAirport: asText(safeInput.homeAirport || profile.homeAirport, DEFAULT_HOME_AIRPORT),
        travelStyle: asText(safeInput.travelStyle || profile.travelStyle, "Premium Family"),
        travelers: Math.max(1, Math.round(asNumber(safeInput.travelers || profile.defaultTravelers, DEFAULT_TRAVELERS)))
      },
      budget: {
        available: asMoney(
          safeInput.availableBudget ??
          safeInput.savedAmount ??
          savings.currentAmount ??
          savings.totalSaved ??
          budgets.availableAmount ??
          budgets.savedAmount
        ),
        target: Math.max(1, asMoney(
          safeInput.targetBudget ??
          savings.targetAmount ??
          budgets.targetAmount ??
          profile.annualTravelBudget ??
          DEFAULT_TARGET_BUDGET
        )),
        monthlySaving: asMoney(
          safeInput.monthlySaving ??
          savings.monthlySaving ??
          budgets.monthlySaving ??
          profile.monthlySaving ??
          DEFAULT_MONTHLY_SAVING
        ),
        committed: asMoney(safeInput.committedBudget ?? budgets.committedAmount ?? 0)
      },
      trip: {
        requestedDays: Math.max(1, Math.round(asNumber(safeInput.requestedDays, DEFAULT_DURATION_DAYS))),
        preferredMonth:
          safeInput.preferredMonth !== undefined &&
          safeInput.preferredMonth !== null &&
          safeInput.preferredMonth !== ""
            ? Number(safeInput.preferredMonth)
            : null,
        accommodationLevel: normalizeKey(safeInput.accommodationLevel || "comfort"),
        excludedDestinations: unique(asArray(safeInput.excludedDestinations)).map(normalizeKey),
        maximumFlightHours:
          safeInput.maximumFlightHours !== undefined
            ? Math.max(1, asNumber(safeInput.maximumFlightHours, 12))
            : null
      },
      travelDNA: extractTravelDNA(state, safeInput)
    };
  }

  function classifyBudget(amount) {
    const value = asMoney(amount);
    if (value < 3000) return BUDGET_LEVELS.STARTER;
    if (value < 7000) return BUDGET_LEVELS.SHORT_TRIP;
    if (value < 14000) return BUDGET_LEVELS.COMFORT;
    if (value < 20000) return BUDGET_LEVELS.PREMIUM;
    return BUDGET_LEVELS.MULTI_TRIP;
  }

  function determineStrategy(amount) {
    const value = asMoney(amount);
    if (value < 3000) return STRATEGIES.SAVE_MORE;
    if (value >= 18000) return STRATEGIES.MULTI_TRIP;
    return STRATEGIES.SINGLE_TRIP;
  }

  function projectSavings(budget) {
    const remaining = Math.max(0, budget.target - budget.available);
    const months = remaining === 0
      ? 0
      : budget.monthlySaving > 0
        ? Math.ceil(remaining / budget.monthlySaving)
        : null;

    return {
      remaining,
      months,
      targetDate: months === null ? null : monthKey(addMonths(new Date(), months))
    };
  }

  function getSeason(destination, month) {
    const targetMonth = month || new Date().getMonth() + 1;
    let score = 65;
    let status = "good";
    let pricing = "medium";
    let crowd = "medium";
    let message = "وقت مناسب للسفر.";

    if (destination.bestMonths.includes(targetMonth)) {
      score = 100;
      status = "excellent";
      pricing = "medium-high";
      crowd = "medium-high";
      message = "أفضل وقت للسفر.";
    } else if (destination.winterMonths.includes(targetMonth)) {
      score = 95;
      status = "winter-special";
      pricing = "high";
      crowd = "medium";
      message = "موسم ممتاز للثلوج.";
    } else if (destination.goodMonths.includes(targetMonth)) {
      score = 78;
      status = "good";
      pricing = "medium";
      crowd = "medium";
      message = "موسم جيد.";
    } else if (destination.avoidMonths.includes(targetMonth)) {
      score = 30;
      status = "avoid";
      pricing = "low";
      crowd = "low";
      message = "يفضل اختيار شهر آخر.";
    }

    return {
      month: targetMonth,
      monthName: MONTH_NAMES_AR[targetMonth] || "",
      score,
      status,
      pricing,
      crowd,
      message,
      bestMonths: destination.bestMonths.slice()
    };
  }

  function getBestMonth(destination, preferredMonth) {
    if (preferredMonth && destination.bestMonths.includes(Number(preferredMonth))) {
      return Number(preferredMonth);
    }

    const currentMonth = new Date().getMonth() + 1;
    return destination.bestMonths
      .slice()
      .sort((a, b) => {
        const distanceA = a >= currentMonth ? a - currentMonth : 12 - currentMonth + a;
        const distanceB = b >= currentMonth ? b - currentMonth : 12 - currentMonth + b;
        return distanceA - distanceB;
      })[0] || destination.bestMonths[0] || null;
  }

  function calculateLocalCost(destination, context) {
    const profile = destination.costProfile;
    const travelers = context.profile.travelers;
    const days = Math.max(destination.minimumDays, Math.min(context.trip.requestedDays, destination.maximumDays));
    const nights = Math.max(0, days - 1);
    const rooms = Math.max(1, Math.ceil(travelers / 2));

    const accommodationMultipliers = {
      economy: 0.72,
      standard: 1,
      comfort: 1.22,
      premium: 1.55,
      luxury: 2.15
    };

    const normalizedStyle = normalizeKey(context.profile.travelStyle);
    const styleMultiplier = normalizedStyle.includes("luxury")
      ? 1.7
      : normalizedStyle.includes("premium")
        ? 1.25
        : normalizedStyle.includes("family")
          ? 1.12
          : 1;

    const accommodationMultiplier = accommodationMultipliers[context.trip.accommodationLevel] || 1;

    const breakdown = {
      flight: asMoney(profile.flightPerTraveler * travelers),
      hotel: asMoney(profile.hotelPerNight * nights * rooms * accommodationMultiplier),
      meals: asMoney(profile.mealsPerTravelerPerDay * travelers * days * styleMultiplier),
      transport: asMoney(profile.transportPerDay * days * styleMultiplier),
      activities: asMoney(profile.activitiesPerTravelerPerDay * travelers * days * styleMultiplier),
      insurance: asMoney(profile.insurancePerTraveler * travelers),
      visa: asMoney(profile.visaPerTraveler * travelers)
    };

    const subtotal = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
    const taxes = asMoney(subtotal * 0.05);
    const reserve = asMoney(subtotal * 0.08);
    const total = subtotal + taxes + reserve;

    return {
      days,
      nights,
      rooms,
      breakdown: { ...breakdown, taxes, reserve },
      subtotal,
      total,
      costPerTraveler: asMoney(total / travelers),
      costPerDay: asMoney(total / days)
    };
  }

  function calculateCost(destination, context) {
    const engine = window.TravelCostEngine;

    if (engine && typeof engine.compareWithBudget === "function") {
      try {
        const external = engine.compareWithBudget({
          destinationId: destination.id,
          destination: destination.id,
          city: destination.city,
          country: destination.country,
          durationDays: context.trip.requestedDays,
          travelers: context.profile.travelers,
          travelStyle: context.profile.travelStyle,
          accommodationLevel: context.trip.accommodationLevel,
          availableBudget: context.budget.available,
          currency: context.profile.currency,
          costProfile: destination.costProfile
        });

        if (external && Number.isFinite(Number(external.totalEstimatedCost))) {
          return {
            days: external.trip?.durationDays || context.trip.requestedDays,
            nights: external.trip?.hotelNights ?? Math.max(0, context.trip.requestedDays - 1),
            rooms: external.trip?.rooms || Math.max(1, Math.ceil(context.profile.travelers / 2)),
            breakdown: external.breakdown || {},
            subtotal: external.subtotal || 0,
            total: external.totalEstimatedCost,
            costPerTraveler: external.costPerTraveler || 0,
            costPerDay: external.costPerDay || 0
          };
        }
      } catch (error) {
        console.warn(`[${ENGINE_NAME}] TravelCostEngine failed, using local estimate:`, error);
      }
    }

    return calculateLocalCost(destination, context);
  }

  function scoreDestination(destination, context, cost, season) {
    let score = 30;
    const available = context.budget.available;

    if (available <= 0) score += 8;
    else if (available >= cost.total) score += 28;
    else if (available >= cost.total * 0.85) score += 17;
    else if (available >= cost.total * 0.7) score += 7;
    else score -= 18;

    const dayDifference = Math.abs(context.trip.requestedDays - destination.idealDays);
    if (dayDifference <= 1) score += 8;
    else if (dayDifference <= 3) score += 4;

    score += Math.round(season.score * 0.12);

    const dna = context.travelDNA;
    if (dna.familyFriendly && destination.familyFriendly) score += 6;
    if (dna.quietPlaces && destination.quietFriendly) score += 6;
    if (dna.privacy && destination.privacyFriendly) score += 5;
    if (dna.nightlife === false && destination.nightlifeFocused === false) score += 4;
    if (dna.halalFriendly && destination.halalFriendly) score += 5;
    if (dna.shattafPreferred && destination.shattafAvailability === "high") score += 4;
    if (dna.preferredTripTypes.some((item) => destination.tripTypes.includes(item))) score += 7;
    if (dna.interests.some((item) => destination.interests.includes(item))) score += 7;
    if (dna.preferredClimates.some((item) => destination.climates.includes(item))) score += 5;
    if (dna.accommodationPreferences.some((item) => destination.accommodationStyles.includes(item))) score += 4;

    if (context.trip.maximumFlightHours && destination.flightHours > context.trip.maximumFlightHours) {
      score -= 20;
    }

    return clamp(Math.round(score), 0, 100);
  }

  function buildReasons(destination, context, cost, season, score) {
    const reasons = [];

    if (score >= 85) reasons.push("تطابق قوي جداً مع أسلوب سفرك");
    else if (score >= 70) reasons.push("تطابق جيد مع تفضيلاتك");
    else reasons.push("خيار بديل قابل للدراسة");

    if (context.budget.available >= cost.total) {
      reasons.push("داخل ميزانيتك الحالية");
    } else {
      reasons.push(`تحتاج ${Math.max(0, cost.total - context.budget.available)} ${context.profile.currency} إضافية`);
    }

    if (season.score >= 90) reasons.push("الموسم ممتاز");
    else if (season.score >= 70) reasons.push("الموسم مناسب");
    else reasons.push("يفضل تعديل موعد السفر");

    if (destination.familyFriendly && context.travelDNA.familyFriendly) reasons.push("مناسبة للعائلة");
    if (destination.quietFriendly && context.travelDNA.quietPlaces) reasons.push("مناسبة للهدوء والخصوصية");
    if (destination.halalFriendly && context.travelDNA.halalFriendly) reasons.push("خيارات الطعام الحلال متوفرة");

    return unique(reasons);
  }

  function createRecommendation(destination, context) {
    const cost = calculateCost(destination, context);
    const suggestedMonth = getBestMonth(destination, context.trip.preferredMonth);
    const season = getSeason(destination, context.trip.preferredMonth || suggestedMonth);
    const confidence = scoreDestination(destination, context, cost, season);
    const difference = context.budget.available - cost.total;

    return {
      id: destination.id,
      recommendationId: createId(`recommendation_${destination.id}`),
      title: `${destination.city}، ${destination.country}`,
      country: destination.country,
      countryCode: destination.countryCode,
      city: destination.city,
      region: destination.region,
      durationDays: cost.days,
      hotelNights: cost.nights,
      travelers: context.profile.travelers,
      estimatedCost: cost.total,
      currency: context.profile.currency,
      remainingBudget: Math.max(0, difference),
      additionalAmountNeeded: Math.max(0, -difference),
      budgetStatus: difference >= 0 ? "within-budget" : "over-budget",
      confidence,
      suggestedMonth,
      suggestedMonthName: MONTH_NAMES_AR[suggestedMonth] || "",
      season,
      flightHours: destination.flightHours,
      visaType: destination.visaType,
      halalFriendly: destination.halalFriendly,
      shattafAvailability: destination.shattafAvailability,
      costBreakdown: cost.breakdown,
      costPerTraveler: cost.costPerTraveler,
      costPerDay: cost.costPerDay,
      highlights: destination.highlights.slice(),
      reasons: buildReasons(destination, context, cost, season, confidence),
      source: ENGINE_NAME,
      status: "suggested"
    };
  }

  function findRecommendations(context) {
    const excluded = new Set(context.trip.excludedDestinations);

    return DESTINATIONS
      .filter((destination) =>
        !excluded.has(normalizeKey(destination.id)) &&
        !excluded.has(normalizeKey(destination.country)) &&
        !excluded.has(normalizeKey(destination.city))
      )
      .map((destination) => createRecommendation(destination, context))
      .filter((recommendation) =>
        context.budget.available <= 0 ||
        recommendation.estimatedCost <= context.budget.available * 1.45
      )
      .sort((first, second) =>
        second.confidence !== first.confidence
          ? second.confidence - first.confidence
          : first.estimatedCost - second.estimatedCost
      )
      .slice(0, MAX_RECOMMENDATIONS);
  }

  function buildMultiTripPlan(recommendations, context) {
    if (determineStrategy(context.budget.available) !== STRATEGIES.MULTI_TRIP) {
      return null;
    }

    const eligible = recommendations.filter((item) =>
      item.estimatedCost > 0 && item.estimatedCost <= context.budget.available
    );

    let bestPlan = null;

    for (let firstIndex = 0; firstIndex < eligible.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < eligible.length; secondIndex += 1) {
        const first = eligible[firstIndex];
        const second = eligible[secondIndex];
        const total = first.estimatedCost + second.estimatedCost;

        if (total > context.budget.available) continue;

        const score = first.confidence + second.confidence;
        if (!bestPlan || score > bestPlan.score) {
          bestPlan = {
            id: createId("multi_trip_plan"),
            title: "خطة رحلتين مقترحة",
            trips: [first, second],
            totalEstimatedCost: total,
            remainingBudget: context.budget.available - total,
            score,
            reason: "توزيع الميزانية على رحلتين يمنحك تنوعاً أفضل خلال السنة مع المحافظة على سقف الإنفاق."
          };
        }
      }
    }

    return bestPlan;
  }

  function buildTimeline(context, recommendations, multiTripPlan) {
    const strategy = determineStrategy(context.budget.available);

    if (strategy === STRATEGIES.MULTI_TRIP && multiTripPlan) {
      return multiTripPlan.trips.map((recommendation, index) => ({
        id: createId("timeline"),
        type: "planned-travel-window",
        month: monthKey(addMonths(new Date(), index * 3)),
        destination: recommendation.title,
        destinationId: recommendation.id,
        estimatedCost: recommendation.estimatedCost,
        requiredSaving: 0,
        status: "available-now"
      }));
    }

    const best = recommendations[0];
    if (best) {
      const requiredSaving = Math.max(0, best.estimatedCost - context.budget.available);
      const months = requiredSaving === 0
        ? 0
        : context.budget.monthlySaving > 0
          ? Math.ceil(requiredSaving / context.budget.monthlySaving)
          : null;

      return [{
        id: createId("timeline"),
        type: requiredSaving === 0 ? "travel-ready" : "savings-target",
        month: months === null ? null : monthKey(addMonths(new Date(), months)),
        destination: best.title,
        destinationId: best.id,
        estimatedCost: best.estimatedCost,
        requiredSaving,
        status: requiredSaving === 0 ? "available-now" : "upcoming"
      }];
    }

    const projection = projectSavings(context.budget);
    return projection.targetDate
      ? [{
          id: createId("timeline"),
          type: "savings-target",
          month: projection.targetDate,
          destination: null,
          destinationId: null,
          estimatedCost: context.budget.target,
          requiredSaving: projection.remaining,
          status: projection.months === 0 ? "completed" : "upcoming"
        }]
      : [];
  }

  function buildAdvice(context, projection, recommendations, multiTripPlan) {
    const currency = context.profile.currency;
    const available = context.budget.available;
    const best = recommendations[0] || null;

    if (multiTripPlan) {
      const tripNames = multiTripPlan.trips.map((trip) => trip.title).join(" و");
      return {
        headline: "ميزانيتك تسمح بخطتين للسفر",
        message: `بميزانية ${available} ${currency} يمكنك ترتيب ${tripNames}.`,
        detail: `التكلفة الإجمالية المتوقعة ${multiTripPlan.totalEstimatedCost} ${currency} والمتبقي ${multiTripPlan.remainingBudget} ${currency}.`,
        tone: "premium"
      };
    }

    if (best) {
      if (best.budgetStatus === "within-budget") {
        return {
          headline: `أفضل اقتراح لك: ${best.title}`,
          message: `يمكنك ترتيب رحلة لمدة ${best.durationDays} أيام بتكلفة متوقعة ${best.estimatedCost} ${currency}.`,
          detail: `التطابق ${best.confidence}%، وأفضل شهر مقترح هو ${best.suggestedMonthName || "حسب الموسم"}.`,
          tone: "positive"
        };
      }

      return {
        headline: `أنت قريب من رحلة إلى ${best.title}`,
        message: `جمعت ${available} ${currency} وتحتاج تقريباً ${best.additionalAmountNeeded} ${currency} إضافية.`,
        detail: context.budget.monthlySaving > 0
          ? `بمعدل ادخار ${context.budget.monthlySaving} ${currency} شهرياً يمكنك الوصول للخطة خلال ${Math.ceil(best.additionalAmountNeeded / context.budget.monthlySaving)} أشهر تقريباً.`
          : "حدد مبلغ ادخار شهري حتى نقدر نحسب موعد السفر.",
        tone: "encouraging"
      };
    }

    if (available < 3000) {
      return {
        headline: "بداية ممتازة",
        message: `جمعت حتى الآن ${available} ${currency}.`,
        detail: projection.remaining > 0
          ? `باقي لك ${projection.remaining} ${currency} للوصول إلى هدفك.`
          : "أنت قريب من أول رحلة قصيرة.",
        tone: "encouraging"
      };
    }

    return {
      headline: "ميزانيتك جاهزة للتحليل",
      message: `لديك ${available} ${currency}.`,
      detail: "لم نجد حالياً وجهة مطابقة بما يكفي، جرّب تغيير عدد الأيام أو الشهر.",
      tone: "neutral"
    };
  }

  function buildCacheKey(context) {
    return JSON.stringify({
      budget: context.budget,
      profile: context.profile,
      trip: context.trip,
      travelDNA: context.travelDNA
    });
  }

  function getCached(cacheKey) {
    const entry = cache.get(cacheKey);
    if (!entry) return null;

    if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
      cache.delete(cacheKey);
      return null;
    }

    return entry.value;
  }

  function setCached(cacheKey, value) {
    cache.set(cacheKey, { createdAt: Date.now(), value });
    if (cache.size > 20) cache.delete(cache.keys().next().value);
  }

  function analyze(input = {}) {
    const context = normalizeContext(input);
    const cacheKey = buildCacheKey(context);
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const projection = projectSavings(context.budget);
    const recommendations = findRecommendations(context);
    const multiTripPlan = buildMultiTripPlan(recommendations, context);
    const timeline = buildTimeline(context, recommendations, multiTripPlan);
    const confidence = recommendations.length > 0
      ? Math.round(recommendations.reduce((sum, item) => sum + item.confidence, 0) / recommendations.length)
      : 0;

    const result = deepFreeze({
      id: createId("budget_intelligence"),
      engine: ENGINE_NAME,
      version: ENGINE_VERSION,
      generatedAt: nowISO(),
      status: recommendations.length > 0
        ? "ready"
        : context.budget.available < 3000
          ? "saving"
          : "no-match",
      context,
      budget: {
        ...context.budget,
        currency: context.profile.currency,
        level: classifyBudget(context.budget.available),
        strategy: determineStrategy(context.budget.available),
        remainingToTarget: projection.remaining,
        monthsToTarget: projection.months,
        targetDate: projection.targetDate
      },
      advice: buildAdvice(context, projection, recommendations, multiTripPlan),
      recommendations,
      bestRecommendation: recommendations[0] || null,
      alternativeRecommendations: recommendations.slice(1, 4),
      multiTripPlan,
      timeline,
      confidence: clamp(confidence, 0, 100),
      actions: {
        canAddPlannedTrip: recommendations.length > 0,
        canCreateMultiTripPlan: Boolean(multiTripPlan),
        canSetSavingsGoal: projection.remaining > 0
      }
    });

    setCached(cacheKey, result);
    emit("budget-intelligence-generated", result);
    return result;
  }

  function createPlannedTripDraft(recommendation, options = {}) {
    if (!isObject(recommendation)) {
      throw new TypeError(`[${ENGINE_NAME}] A valid recommendation is required.`);
    }

    const draft = deepFreeze({
      id: createId("planned_trip"),
      type: "planned",
      status: "planned",
      title: asText(options.title || recommendation.title, "رحلة مخطط لها"),
      destinationId: recommendation.id || "",
      country: recommendation.country || "",
      countryCode: recommendation.countryCode || "",
      city: recommendation.city || "",
      startDate: asText(options.startDate || recommendation.suggestedDate),
      endDate: asText(options.endDate),
      suggestedMonth: recommendation.suggestedMonth || null,
      durationDays: Math.max(1, Math.round(asNumber(recommendation.durationDays, DEFAULT_DURATION_DAYS))),
      travelers: Math.max(1, Math.round(asNumber(options.travelers || recommendation.travelers, DEFAULT_TRAVELERS))),
      estimatedBudget: asMoney(recommendation.estimatedCost),
      currency: asText(options.currency || recommendation.currency, DEFAULT_CURRENCY),
      sourceRecommendationId: recommendation.recommendationId || recommendation.id || "",
      source: {
        engine: ENGINE_NAME,
        version: ENGINE_VERSION,
        confidence: recommendation.confidence || 0
      },
      costBreakdown: isObject(recommendation.costBreakdown) ? recommendation.costBreakdown : {},
      highlights: asArray(recommendation.highlights),
      notes: asText(options.notes),
      createdAt: nowISO(),
      updatedAt: nowISO()
    });

    emit("planned-trip-draft-created", draft);
    return draft;
  }

  function getDestinationById(destinationId) {
    const key = normalizeKey(destinationId);
    return DESTINATIONS.find((destination) =>
      normalizeKey(destination.id) === key ||
      normalizeKey(destination.city) === key ||
      normalizeKey(destination.country) === key
    ) || null;
  }

  function getDestinations() {
    return DESTINATIONS.map((destination) => ({
      ...destination,
      bestMonths: destination.bestMonths.slice(),
      goodMonths: destination.goodMonths.slice(),
      avoidMonths: destination.avoidMonths.slice(),
      winterMonths: destination.winterMonths.slice(),
      tripTypes: destination.tripTypes.slice(),
      interests: destination.interests.slice(),
      climates: destination.climates.slice(),
      accommodationStyles: destination.accommodationStyles.slice(),
      highlights: destination.highlights.slice(),
      costProfile: { ...destination.costProfile }
    }));
  }

  function evaluateDestination(destinationId, input = {}) {
    const destination = getDestinationById(destinationId);
    if (!destination) return null;
    return deepFreeze(createRecommendation(destination, normalizeContext(input)));
  }

  function clearCache() {
    cache.clear();
  }

  function getCapabilities() {
    return Object.freeze({
      externalCostEngine: Boolean(
        window.TravelCostEngine &&
        typeof window.TravelCostEngine.compareWithBudget === "function"
      ),
      destinationCount: DESTINATIONS.length,
      caching: true,
      plannedTripDrafts: true,
      multiTripPlanning: true,
      storeWrites: false,
      uiRendering: false
    });
  }

  window.TravelBudgetIntelligence = Object.freeze({
    name: ENGINE_NAME,
    version: ENGINE_VERSION,
    budgetLevels: BUDGET_LEVELS,
    strategies: STRATEGIES,
    analyze,
    generateAdvice: analyze,
    recommend: analyze,
    createPlannedTripDraft,
    evaluateDestination,
    getDestinationById,
    getDestinations,
    classifyBudget,
    determineStrategy,
    clearCache,
    getCapabilities,
    on
  });

  emit("engine-ready", {
    name: ENGINE_NAME,
    version: ENGINE_VERSION
  });

  console.info(`[Travel Intelligence Center] ${ENGINE_NAME} V${ENGINE_VERSION} ready.`);
})(window);
