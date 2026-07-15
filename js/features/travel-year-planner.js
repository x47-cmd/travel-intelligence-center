/* =========================================================
   Travel Intelligence Center
   Travel Year Planner V1.0.0

   File Path:
   js/features/travel-year-planner.js

   Purpose:
   - Builds a complete intelligent annual travel plan.
   - Distributes trips across the year without date conflicts.
   - Uses Travel DNA, destination recommendations, country data,
     travel knowledge, budgets, wishlist and existing trips.
   - Suggests the best country, month, duration, booking windows,
     estimated budget, trip type and explanation for every slot.
   - Supports manual constraints, locked months and saved plans.
   - Keeps annual planning logic independent from guide.js UI.
   - Exposes a stable API for Guide Intelligence and future pages.

   Dependencies:
   - js/config.js
   - js/store.js
   - js/router.js
   - js/ui.js
   - js/data/countries-catalog.js
   - js/data/travel-knowledge.js
   - js/features/destination-recommendation-engine.js
   - js/features/guide-ai-planner.js
   - js/features/travel-dna.js

   Global APIs:
   - window.TIC.Features.TravelYearPlanner
   - window.TICTravelYearPlanner
========================================================= */

(function (window) {
  "use strict";

  const MODULE_ID = "travel-year-planner";
  const MODULE_VERSION = "1.0.0";
  const STORE_PATH = "guides.yearPlanner";

  const MONTHS_AR = [
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
  ];

  const SEASONS_AR = {
    winter: "الشتاء",
    spring: "الربيع",
    summer: "الصيف",
    autumn: "الخريف"
  };

  const DEFAULT_OPTIONS = {
    year: new Date().getFullYear(),
    tripsCount: 3,
    annualBudget: 30000,
    travelers: 2,
    homeCountryCode: "AE",
    homeAirport: "AUH",
    preferredTripTypes: ["family", "couple"],
    preferredMonths: [],
    blockedMonths: [],
    lockedSlots: [],
    minimumGapDays: 28,
    shortTripDays: 4,
    mediumTripDays: 7,
    longTripDays: 10,
    includeWeekendTrips: true,
    includeWishlist: true,
    avoidVisitedCountries: false,
    requireHalal: true,
    requireShattaf: false,
    wantsBeach: true,
    wantsNature: true,
    wantsShopping: false,
    wantsCulture: true,
    wantsLuxury: false,
    budgetLevel: "balanced",
    pace: "balanced",
    currency: "AED",
    persist: false
  };

  const TRIP_LENGTHS = {
    weekend: { min: 2, max: 4, defaultDays: 3, budgetShare: 0.12 },
    short: { min: 4, max: 6, defaultDays: 5, budgetShare: 0.22 },
    medium: { min: 6, max: 9, defaultDays: 7, budgetShare: 0.32 },
    long: { min: 9, max: 21, defaultDays: 11, budgetShare: 0.46 }
  };

  const SEASON_MONTHS = {
    winter: [12, 1, 2],
    spring: [3, 4, 5],
    summer: [6, 7, 8],
    autumn: [9, 10, 11]
  };

  const isObject = (value) =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);

  const clone = (value) => {
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
  };

  const text = (value) =>
    String(value ?? "").trim();

  const number = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const array = (value) =>
    Array.isArray(value) ? clone(value) : [];

  const unique = (values) =>
    Array.from(
      new Set(
        array(values)
          .map((item) => text(item))
          .filter(Boolean)
      )
    );

  const clamp = (value, min, max) =>
    Math.min(max, Math.max(min, number(value)));

  const nowISO = () =>
    new Date().toISOString();

  const createId = (prefix = "year_plan") =>
    `${prefix}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;

  const getConfig = () =>
    window.TICConfig ||
    window.TIC?.Config ||
    {};

  const getStore = () =>
    window.TIC?.Store ||
    window.TICStore ||
    null;

  const getRouter = () =>
    window.TIC?.Router ||
    window.TICRouter ||
    null;

  const getUI = () =>
    window.TIC?.UI ||
    window.TICUI ||
    null;

  const getCountries = () =>
    window.TIC?.Data?.Countries ||
    window.TICCountriesCatalog ||
    null;

  const getKnowledge = () =>
    window.TIC?.Data?.TravelKnowledge ||
    window.TICTravelKnowledge ||
    null;

  const getRecommendationEngine = () =>
    window.TIC?.Features?.DestinationRecommendation ||
    window.TICDestinationRecommendation ||
    null;

  const getGuidePlanner = () =>
    window.TIC?.Features?.GuideAIPlanner ||
    window.TICGuideAIPlanner ||
    null;

  const getTravelDNA = () =>
    window.TIC?.Features?.TravelDNA ||
    window.TICTravelDNA ||
    null;

  const getStateSnapshot = () => {
    const store = getStore();

    if (!store) return {};

    if (typeof store.getState === "function") {
      return clone(store.getState()) || {};
    }

    return {
      profile: clone(store.get?.("profile", {})) || {},
      trips: clone(store.get?.("trips", [])) || [],
      wishlist: clone(store.get?.("wishlist", [])) || [],
      budgets: clone(store.get?.("budgets", {})) || {},
      guides: clone(store.get?.("guides", {})) || {}
    };
  };

  const normalizeDate = (value) => {
    if (!value) return null;

    const date =
      value instanceof Date
        ? new Date(value.getTime())
        : new Date(value);

    return Number.isNaN(date.getTime())
      ? null
      : date;
  };

  const toDateOnly = (date) =>
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );

  const addDays = (date, days) => {
    const result = new Date(date.getTime());
    result.setDate(result.getDate() + number(days));
    return result;
  };

  const diffDays = (start, end) => {
    const first = toDateOnly(start).getTime();
    const second = toDateOnly(end).getTime();
    return Math.floor((second - first) / 86400000);
  };

  const formatISODate = (value) => {
    const date = normalizeDate(value);
    if (!date) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const seasonForMonth = (month) => {
    const match = Object.entries(SEASON_MONTHS)
      .find(([, months]) => months.includes(month));

    return match ? match[0] : "spring";
  };

  const normalizeMonthList = (value) =>
    unique(array(value))
      .map((item) => clamp(Math.round(number(item)), 1, 12))
      .filter((item, index, source) => source.indexOf(item) === index);

  const normalizeOptions = (input = {}) => {
    const source = isObject(input) ? input : {};
    const config = getConfig();
    const snapshot = getStateSnapshot();
    const profile = snapshot.profile || {};

    const configuredBudget =
      number(
        profile.annualTravelBudget,
        number(
          config.profile?.annualTravelBudget,
          number(config.defaults?.annualTravelBudget, 30000)
        )
      );

    const configuredCurrency =
      text(
        profile.currency ||
        config.currency ||
        config.profile?.currency ||
        "AED"
      );

    const options = {
      ...DEFAULT_OPTIONS,
      ...clone(source),
      year: clamp(
        Math.round(number(source.year, DEFAULT_OPTIONS.year)),
        2020,
        2100
      ),
      tripsCount: clamp(
        Math.round(number(source.tripsCount, DEFAULT_OPTIONS.tripsCount)),
        1,
        12
      ),
      annualBudget: Math.max(
        0,
        number(source.annualBudget, configuredBudget)
      ),
      travelers: clamp(
        Math.round(number(source.travelers, DEFAULT_OPTIONS.travelers)),
        1,
        30
      ),
      homeCountryCode: text(
        source.homeCountryCode ||
        profile.homeCountryCode ||
        DEFAULT_OPTIONS.homeCountryCode
      ).toUpperCase(),
      homeAirport: text(
        source.homeAirport ||
        profile.homeAirport ||
        config.profile?.homeAirport ||
        DEFAULT_OPTIONS.homeAirport
      ).toUpperCase(),
      preferredTripTypes: unique(
        source.preferredTripTypes?.length
          ? source.preferredTripTypes
          : DEFAULT_OPTIONS.preferredTripTypes
      ),
      preferredMonths: normalizeMonthList(source.preferredMonths),
      blockedMonths: normalizeMonthList(source.blockedMonths),
      lockedSlots: array(source.lockedSlots)
        .filter(isObject)
        .map((slot) => ({
          ...clone(slot),
          month: clamp(Math.round(number(slot.month)), 1, 12),
          countryCode: text(slot.countryCode).toUpperCase()
        })),
      minimumGapDays: clamp(
        Math.round(number(source.minimumGapDays, DEFAULT_OPTIONS.minimumGapDays)),
        0,
        180
      ),
      shortTripDays: clamp(
        Math.round(number(source.shortTripDays, DEFAULT_OPTIONS.shortTripDays)),
        2,
        10
      ),
      mediumTripDays: clamp(
        Math.round(number(source.mediumTripDays, DEFAULT_OPTIONS.mediumTripDays)),
        4,
        14
      ),
      longTripDays: clamp(
        Math.round(number(source.longTripDays, DEFAULT_OPTIONS.longTripDays)),
        7,
        30
      ),
      currency: text(source.currency || configuredCurrency || "AED").toUpperCase(),
      requireHalal: source.requireHalal !== false,
      requireShattaf: source.requireShattaf === true,
      wantsBeach: source.wantsBeach !== false,
      wantsNature: source.wantsNature !== false,
      wantsShopping: source.wantsShopping === true,
      wantsCulture: source.wantsCulture !== false,
      wantsLuxury: source.wantsLuxury === true,
      includeWeekendTrips: source.includeWeekendTrips !== false,
      includeWishlist: source.includeWishlist !== false,
      avoidVisitedCountries: source.avoidVisitedCountries === true,
      persist: source.persist === true
    };

    options.blockedMonths = options.blockedMonths.filter(
      (month) => !options.preferredMonths.includes(month)
    );

    return options;
  };

  const getExistingTrips = (year) => {
    const snapshot = getStateSnapshot();

    return array(snapshot.trips)
      .map((trip) => {
        const startDate = normalizeDate(trip.startDate);
        const endDate = normalizeDate(trip.endDate || trip.startDate);

        return {
          ...clone(trip),
          startDate,
          endDate,
          year: startDate?.getFullYear() || null
        };
      })
      .filter(
        (trip) =>
          trip.startDate &&
          trip.year === year &&
          trip.status !== "cancelled"
      )
      .sort((a, b) => a.startDate - b.startDate);
  };

  const getVisitedCountryCodes = () => {
    const snapshot = getStateSnapshot();

    return unique(
      array(snapshot.trips)
        .filter(
          (trip) =>
            trip.status === "completed" ||
            trip.isMemory === true ||
            trip.memorySource
        )
        .map((trip) =>
          text(
            trip.countryCode ||
            trip.iso2 ||
            trip.countryIso2
          ).toUpperCase()
        )
        .filter(Boolean)
    );
  };

  const resolveCountry = (countryCode) => {
    const countries = getCountries();
    const code = text(countryCode).toUpperCase();

    if (!countries || !code) return null;

    return (
      countries.getByCode?.(code) ||
      countries.get?.(code) ||
      countries.find?.(code) ||
      null
    );
  };

  const resolveKnowledgeProfile = (countryCode) => {
    const knowledge = getKnowledge();
    const code = text(countryCode).toUpperCase();

    if (!knowledge || !code) return null;

    return (
      knowledge.getCountryProfile?.(code) ||
      knowledge.getByCountryCode?.(code) ||
      knowledge.get?.(code) ||
      null
    );
  };

  const buildTravelDNA = () => {
    const engine = getTravelDNA();

    if (!engine) return null;

    try {
      return (
        engine.build?.({ persist: false }) ||
        engine.analyze?.({ persist: false }) ||
        engine.getProfile?.() ||
        engine.getSnapshot?.() ||
        null
      );
    } catch (error) {
      console.error("TIC Travel Year Planner Travel DNA error:", error);
      return null;
    }
  };

  const getDestinationRecommendations = (options, dna) => {
    const engine = getRecommendationEngine();
    const visitedCountryCodes = getVisitedCountryCodes();
    const snapshot = getStateSnapshot();

    const request = {
      limit: Math.max(18, options.tripsCount * 5),
      travelers: options.travelers,
      annualBudget: options.annualBudget,
      budgetLevel: options.budgetLevel,
      preferredMonths: options.preferredMonths,
      blockedMonths: options.blockedMonths,
      tripTypes: options.preferredTripTypes,
      requireHalal: options.requireHalal,
      requireShattaf: options.requireShattaf,
      wantsBeach: options.wantsBeach,
      wantsNature: options.wantsNature,
      wantsShopping: options.wantsShopping,
      wantsCulture: options.wantsCulture,
      wantsLuxury: options.wantsLuxury,
      avoidCountryCodes: options.avoidVisitedCountries
        ? visitedCountryCodes
        : [],
      includeWishlist: options.includeWishlist,
      wishlist: array(snapshot.wishlist),
      travelDNA: dna
    };

    if (engine) {
      try {
        const result =
          engine.recommend?.(request) ||
          engine.getRecommendations?.(request) ||
          engine.rank?.(request) ||
          [];

        const normalized = Array.isArray(result)
          ? result
          : array(result?.items || result?.recommendations);

        if (normalized.length) {
          return normalized.map((item, index) => ({
            ...clone(item),
            countryCode: text(
              item.countryCode ||
              item.iso2 ||
              item.code
            ).toUpperCase(),
            score: number(item.score, 100 - index),
            reasons: array(item.reasons || item.explanations)
          }));
        }
      } catch (error) {
        console.error(
          "TIC Travel Year Planner recommendation error:",
          error
        );
      }
    }

    const countries = getCountries();
    const fallback =
      countries?.getAll?.() ||
      countries?.list?.() ||
      countries?.countries ||
      [];

    return array(fallback)
      .filter((country) => {
        const code = text(country.iso2 || country.countryCode).toUpperCase();
        return (
          code &&
          code !== options.homeCountryCode &&
          !options.blockedCountryCodes?.includes?.(code)
        );
      })
      .slice(0, Math.max(18, options.tripsCount * 5))
      .map((country, index) => ({
        ...clone(country),
        countryCode: text(country.iso2 || country.countryCode).toUpperCase(),
        score: 80 - index,
        reasons: ["وجهة مناسبة لإضافتها إلى خطة السفر السنوية."]
      }));
  };

  const extractBestMonths = (recommendation, profile) => {
    const values = [
      ...array(recommendation.bestMonths),
      ...array(profile?.bestMonths),
      ...array(profile?.bestMonthsToVisit),
      ...array(profile?.weather?.bestMonths)
    ];

    return normalizeMonthList(values);
  };

  const extractWorstMonths = (recommendation, profile) => {
    const values = [
      ...array(recommendation.worstMonths),
      ...array(profile?.worstMonths),
      ...array(profile?.worstMonthsToVisit),
      ...array(profile?.weather?.worstMonths)
    ];

    return normalizeMonthList(values);
  };

  const scoreMonthForDestination = (
    month,
    recommendation,
    profile,
    options
  ) => {
    let score = 50;
    const bestMonths = extractBestMonths(recommendation, profile);
    const worstMonths = extractWorstMonths(recommendation, profile);

    if (bestMonths.includes(month)) score += 45;
    if (worstMonths.includes(month)) score -= 70;
    if (options.preferredMonths.includes(month)) score += 25;
    if (options.blockedMonths.includes(month)) score -= 200;

    const season = seasonForMonth(month);
    const dnaScores = recommendation.travelDNA?.scores || {};

    if (season === "summer" && number(dnaScores.warmWeather) >= 65) {
      score += 10;
    }

    if (season === "winter" && number(dnaScores.coldWeather) >= 65) {
      score += 10;
    }

    return score;
  };

  const buildMonthCandidates = (recommendation, options) => {
    const profile = resolveKnowledgeProfile(recommendation.countryCode);

    return Array.from({ length: 12 }, (_, index) => index + 1)
      .filter((month) => !options.blockedMonths.includes(month))
      .map((month) => ({
        month,
        score: scoreMonthForDestination(
          month,
          recommendation,
          profile,
          options
        )
      }))
      .sort((a, b) => b.score - a.score);
  };

  const chooseTripLength = (index, options, recommendation) => {
    const total = options.tripsCount;
    const position = total <= 1 ? 1 : index / (total - 1);
    const suggested =
      number(
        recommendation.idealDurationDays ||
        recommendation.durationDays ||
        recommendation.recommendedDays,
        0
      );

    if (suggested > 0) {
      if (suggested <= 4) {
        return { type: "weekend", days: clamp(Math.round(suggested), 2, 4) };
      }

      if (suggested <= 6) {
        return { type: "short", days: clamp(Math.round(suggested), 4, 6) };
      }

      if (suggested <= 9) {
        return { type: "medium", days: clamp(Math.round(suggested), 6, 9) };
      }

      return { type: "long", days: clamp(Math.round(suggested), 9, 21) };
    }

    if (
      options.includeWeekendTrips &&
      total >= 4 &&
      index === total - 1
    ) {
      return {
        type: "weekend",
        days: clamp(options.shortTripDays - 1, 2, 4)
      };
    }

    if (position < 0.35) {
      return {
        type: "medium",
        days: options.mediumTripDays
      };
    }

    if (position > 0.75 && total <= 3) {
      return {
        type: "long",
        days: options.longTripDays
      };
    }

    return {
      type: "short",
      days: options.shortTripDays
    };
  };

  const calculateBudgetShare = (
    lengthType,
    recommendation,
    remainingBudget,
    remainingSlots
  ) => {
    const baseShare =
      TRIP_LENGTHS[lengthType]?.budgetShare ||
      TRIP_LENGTHS.medium.budgetShare;

    const scoreFactor =
      clamp(number(recommendation.score, 70), 0, 120) / 100;

    const averageAvailable =
      remainingSlots > 0
        ? remainingBudget / remainingSlots
        : remainingBudget;

    const weighted =
      averageAvailable *
      (0.75 + baseShare) *
      (0.8 + scoreFactor * 0.25);

    return Math.max(
      0,
      Math.min(
        remainingBudget,
        Math.round(weighted / 50) * 50
      )
    );
  };

  const isDateRangeAvailable = (
    startDate,
    endDate,
    occupiedRanges,
    minimumGapDays
  ) =>
    occupiedRanges.every((range) => {
      const rangeStart = addDays(range.startDate, -minimumGapDays);
      const rangeEnd = addDays(range.endDate, minimumGapDays);

      return endDate < rangeStart || startDate > rangeEnd;
    });

  const findAvailableDates = (
    year,
    preferredMonth,
    durationDays,
    occupiedRanges,
    minimumGapDays
  ) => {
    const candidateDays = [8, 15, 22, 1];

    for (let monthOffset = 0; monthOffset < 12; monthOffset += 1) {
      const month =
        ((preferredMonth - 1 + monthOffset) % 12) + 1;

      const targetYear =
        preferredMonth - 1 + monthOffset >= 12
          ? year + 1
          : year;

      if (targetYear !== year) continue;

      for (const day of candidateDays) {
        const startDate = new Date(targetYear, month - 1, day);
        const endDate = addDays(startDate, durationDays - 1);

        if (endDate.getFullYear() !== year) continue;

        if (
          isDateRangeAvailable(
            startDate,
            endDate,
            occupiedRanges,
            minimumGapDays
          )
        ) {
          return { startDate, endDate, month };
        }
      }
    }

    return null;
  };

  const buildBookingWindows = (startDate, tripLengthType) => {
    const flightLeadDays =
      tripLengthType === "long"
        ? 150
        : tripLengthType === "medium"
          ? 120
          : 75;

    const hotelLeadDays =
      tripLengthType === "long"
        ? 120
        : tripLengthType === "medium"
          ? 90
          : 60;

    const flightWindowStart = addDays(startDate, -(flightLeadDays + 30));
    const flightWindowEnd = addDays(startDate, -flightLeadDays);
    const hotelWindowStart = addDays(startDate, -(hotelLeadDays + 30));
    const hotelWindowEnd = addDays(startDate, -hotelLeadDays);

    return {
      flight: {
        startDate: formatISODate(flightWindowStart),
        endDate: formatISODate(flightWindowEnd),
        leadDays: flightLeadDays,
        labelAr:
          `احجز الطيران تقريباً قبل ${flightLeadDays} يوماً.`
      },
      hotel: {
        startDate: formatISODate(hotelWindowStart),
        endDate: formatISODate(hotelWindowEnd),
        leadDays: hotelLeadDays,
        labelAr:
          `احجز الفندق تقريباً قبل ${hotelLeadDays} يوماً.`
      }
    };
  };

  const buildSlotReasons = (
    recommendation,
    month,
    tripLength,
    dna,
    options
  ) => {
    const reasons = [
      ...array(recommendation.reasons),
      ...array(recommendation.explanations)
    ];

    const profile = resolveKnowledgeProfile(recommendation.countryCode);
    const bestMonths = extractBestMonths(recommendation, profile);

    if (bestMonths.includes(month)) {
      reasons.push(
        `${MONTHS_AR[month]} من أفضل أوقات زيارة هذه الوجهة.`
      );
    }

    const scores = dna?.scores || dna?.profile?.scores || {};

    if (options.wantsNature && number(scores.nature) >= 60) {
      reasons.push("الوجهة تناسب اهتمامك بالطبيعة والمناظر الهادئة.");
    }

    if (options.wantsBeach && number(scores.beach) >= 60) {
      reasons.push("تدعم تفضيلك للبحر والشواطئ.");
    }

    if (options.wantsLuxury && number(scores.luxury) >= 60) {
      reasons.push("تتوفر فيها تجارب إقامة راقية تناسب أسلوب سفرك.");
    }

    reasons.push(
      `مدة ${tripLength.days} أيام مناسبة لهذا النوع من الرحلات.`
    );

    return unique(reasons).slice(0, 5);
  };

  const createLockedSlot = (
    locked,
    options,
    occupiedRanges
  ) => {
    const month = clamp(number(locked.month, 1), 1, 12);
    const days = clamp(
      Math.round(number(locked.days, options.mediumTripDays)),
      2,
      30
    );

    const explicitStart = normalizeDate(locked.startDate);
    const explicitEnd = normalizeDate(locked.endDate);

    const dates =
      explicitStart && explicitEnd
        ? {
            startDate: explicitStart,
            endDate: explicitEnd,
            month: explicitStart.getMonth() + 1
          }
        : findAvailableDates(
            options.year,
            month,
            days,
            occupiedRanges,
            0
          );

    if (!dates) return null;

    const country = resolveCountry(locked.countryCode);
    const countryNameAr =
      text(
        locked.countryNameAr ||
        country?.nameAr ||
        country?.arabicName ||
        locked.countryCode
      );

    const slot = {
      id: text(locked.id) || createId("locked_trip"),
      locked: true,
      source: "manual",
      countryCode: text(locked.countryCode).toUpperCase(),
      countryNameAr,
      countryNameEn: text(
        locked.countryNameEn ||
        country?.nameEn ||
        country?.englishName
      ),
      month: dates.month,
      monthNameAr: MONTHS_AR[dates.month],
      season: seasonForMonth(dates.month),
      seasonNameAr: SEASONS_AR[seasonForMonth(dates.month)],
      startDate: formatISODate(dates.startDate),
      endDate: formatISODate(dates.endDate),
      durationDays: diffDays(dates.startDate, dates.endDate) + 1,
      tripLengthType: text(locked.tripLengthType || "medium"),
      tripType: text(locked.tripType || options.preferredTripTypes[0] || "family"),
      estimatedBudget: Math.max(0, number(locked.estimatedBudget)),
      currency: options.currency,
      travelers: Math.max(1, number(locked.travelers, options.travelers)),
      reasons: unique(
        locked.reasons?.length
          ? locked.reasons
          : ["رحلة مثبتة يدوياً ضمن الخطة السنوية."]
      ),
      bookingWindows: buildBookingWindows(
        dates.startDate,
        text(locked.tripLengthType || "medium")
      ),
      createdAt: nowISO()
    };

    occupiedRanges.push({
      startDate: dates.startDate,
      endDate: dates.endDate,
      source: "locked",
      id: slot.id
    });

    return slot;
  };

  const buildGuidePreview = (slot, options) => {
    const planner = getGuidePlanner();

    if (!planner) return null;

    try {
      return (
        planner.createPlan?.({
          countryCode: slot.countryCode,
          days: slot.durationDays,
          travelers: slot.travelers,
          month: slot.month,
          tripType: slot.tripType,
          budgetLevel: options.budgetLevel,
          pace: options.pace,
          requiresHalal: options.requireHalal,
          requiresShattaf: options.requireShattaf,
          wantsBeach: options.wantsBeach,
          wantsNature: options.wantsNature,
          wantsShopping: options.wantsShopping,
          wantsCulture: options.wantsCulture,
          wantsLuxury: options.wantsLuxury,
          persist: false
        }) ||
        planner.build?.({
          countryCode: slot.countryCode,
          days: slot.durationDays,
          month: slot.month,
          persist: false
        }) ||
        null
      );
    } catch (error) {
      console.error("TIC Travel Year Planner guide preview error:", error);
      return null;
    }
  };

  const buildAnnualSummary = (
    slots,
    options,
    existingTrips,
    unallocatedBudget
  ) => {
    const plannedBudget = slots.reduce(
      (total, slot) => total + number(slot.estimatedBudget),
      0
    );

    const existingBudget = existingTrips.reduce(
      (total, trip) => total + Math.max(0, number(trip.budget)),
      0
    );

    const totalTravelDays = slots.reduce(
      (total, slot) => total + number(slot.durationDays),
      0
    );

    const monthsCovered = unique(
      slots.map((slot) => String(slot.month))
    ).map(Number);

    return {
      year: options.year,
      suggestedTrips: slots.length,
      existingTrips: existingTrips.length,
      totalTrips: slots.length + existingTrips.length,
      totalTravelDays,
      annualBudget: options.annualBudget,
      plannedBudget,
      existingBudget,
      totalCommittedBudget: plannedBudget + existingBudget,
      remainingBudget: Math.max(
        0,
        options.annualBudget - plannedBudget - existingBudget
      ),
      unallocatedBudget: Math.max(0, unallocatedBudget),
      budgetUsagePercent:
        options.annualBudget > 0
          ? Math.round(
              ((plannedBudget + existingBudget) / options.annualBudget) * 100
            )
          : 0,
      monthsCovered,
      seasonsCovered: unique(
        slots.map((slot) => slot.season)
      ),
      countryCodes: unique(
        slots.map((slot) => slot.countryCode)
      ),
      currency: options.currency
    };
  };

  const validatePlan = (plan) => {
    const issues = [];
    const slots = array(plan?.slots);

    slots.forEach((slot, index) => {
      const startDate = normalizeDate(slot.startDate);
      const endDate = normalizeDate(slot.endDate);

      if (!slot.countryCode) {
        issues.push({
          type: "missing-country",
          slotIndex: index,
          message: "إحدى الرحلات لا تحتوي على رمز دولة."
        });
      }

      if (!startDate || !endDate || endDate < startDate) {
        issues.push({
          type: "invalid-date",
          slotIndex: index,
          message: "إحدى الرحلات تحتوي على تاريخ غير صالح."
        });
      }

      if (number(slot.estimatedBudget) < 0) {
        issues.push({
          type: "invalid-budget",
          slotIndex: index,
          message: "ميزانية إحدى الرحلات غير صالحة."
        });
      }
    });

    for (let first = 0; first < slots.length; first += 1) {
      for (let second = first + 1; second < slots.length; second += 1) {
        const firstStart = normalizeDate(slots[first].startDate);
        const firstEnd = normalizeDate(slots[first].endDate);
        const secondStart = normalizeDate(slots[second].startDate);
        const secondEnd = normalizeDate(slots[second].endDate);

        if (
          firstStart &&
          firstEnd &&
          secondStart &&
          secondEnd &&
          firstStart <= secondEnd &&
          secondStart <= firstEnd
        ) {
          issues.push({
            type: "date-overlap",
            slotIndexes: [first, second],
            message: "يوجد تعارض زمني بين رحلتين في الخطة."
          });
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  };

  const generate = (input = {}) => {
    const options = normalizeOptions(input);
    const existingTrips = getExistingTrips(options.year);
    const dna = buildTravelDNA();
    const recommendations = getDestinationRecommendations(options, dna);

    const occupiedRanges = existingTrips.map((trip) => ({
      startDate: trip.startDate,
      endDate: trip.endDate,
      source: "existing",
      id: trip.id
    }));

    const lockedSlots = options.lockedSlots
      .map((locked) =>
        createLockedSlot(locked, options, occupiedRanges)
      )
      .filter(Boolean);

    const targetAutoSlots = Math.max(
      0,
      options.tripsCount - lockedSlots.length
    );

    const visitedCodes = new Set(getVisitedCountryCodes());
    const selectedCodes = new Set(
      lockedSlots.map((slot) => slot.countryCode)
    );

    const existingBudget = existingTrips.reduce(
      (total, trip) => total + Math.max(0, number(trip.budget)),
      0
    );

    let remainingBudget = Math.max(
      0,
      options.annualBudget -
      existingBudget -
      lockedSlots.reduce(
        (total, slot) => total + number(slot.estimatedBudget),
        0
      )
    );

    const autoSlots = [];

    for (
      let recommendationIndex = 0;
      recommendationIndex < recommendations.length &&
      autoSlots.length < targetAutoSlots;
      recommendationIndex += 1
    ) {
      const recommendation = recommendations[recommendationIndex];
      const countryCode = text(
        recommendation.countryCode ||
        recommendation.iso2 ||
        recommendation.code
      ).toUpperCase();

      if (!countryCode || countryCode === options.homeCountryCode) {
        continue;
      }

      if (selectedCodes.has(countryCode)) {
        continue;
      }

      if (
        options.avoidVisitedCountries &&
        visitedCodes.has(countryCode)
      ) {
        continue;
      }

      const length = chooseTripLength(
        autoSlots.length,
        options,
        recommendation
      );

      const monthCandidates = buildMonthCandidates(
        recommendation,
        options
      );

      let dates = null;

      for (const monthCandidate of monthCandidates) {
        dates = findAvailableDates(
          options.year,
          monthCandidate.month,
          length.days,
          occupiedRanges,
          options.minimumGapDays
        );

        if (dates) break;
      }

      if (!dates) continue;

      const remainingSlots =
        targetAutoSlots - autoSlots.length;

      const estimatedBudget = calculateBudgetShare(
        length.type,
        recommendation,
        remainingBudget,
        remainingSlots
      );

      const country = resolveCountry(countryCode);
      const profile = resolveKnowledgeProfile(countryCode);
      const reasons = buildSlotReasons(
        recommendation,
        dates.month,
        length,
        dna,
        options
      );

      const slot = {
        id: createId("year_trip"),
        locked: false,
        source: "ai",
        recommendationScore: Math.round(
          number(recommendation.score, 0)
        ),
        countryCode,
        countryNameAr: text(
          recommendation.countryNameAr ||
          recommendation.nameAr ||
          country?.nameAr ||
          country?.arabicName ||
          countryCode
        ),
        countryNameEn: text(
          recommendation.countryNameEn ||
          recommendation.nameEn ||
          country?.nameEn ||
          country?.englishName
        ),
        flag: text(
          recommendation.flag ||
          country?.flag ||
          country?.emoji
        ),
        month: dates.month,
        monthNameAr: MONTHS_AR[dates.month],
        season: seasonForMonth(dates.month),
        seasonNameAr: SEASONS_AR[seasonForMonth(dates.month)],
        startDate: formatISODate(dates.startDate),
        endDate: formatISODate(dates.endDate),
        durationDays: length.days,
        tripLengthType: length.type,
        tripType:
          options.preferredTripTypes[
            autoSlots.length %
            Math.max(1, options.preferredTripTypes.length)
          ] || "family",
        travelers: options.travelers,
        estimatedBudget,
        currency: options.currency,
        budgetLevel: options.budgetLevel,
        reasons,
        bestMonths: extractBestMonths(recommendation, profile),
        worstMonths: extractWorstMonths(recommendation, profile),
        bookingWindows: buildBookingWindows(
          dates.startDate,
          length.type
        ),
        idealDuration:
          number(
            recommendation.idealDurationDays ||
            profile?.idealDurationDays ||
            profile?.idealDuration,
            length.days
          ),
        tags: unique([
          ...array(recommendation.tags),
          ...array(profile?.tags)
        ]),
        createdAt: nowISO()
      };

      slot.guidePreview = buildGuidePreview(slot, options);

      autoSlots.push(slot);
      selectedCodes.add(countryCode);
      remainingBudget = Math.max(
        0,
        remainingBudget - estimatedBudget
      );

      occupiedRanges.push({
        startDate: dates.startDate,
        endDate: dates.endDate,
        source: "suggested",
        id: slot.id
      });
    }

    const slots = [...lockedSlots, ...autoSlots]
      .sort(
        (a, b) =>
          normalizeDate(a.startDate) -
          normalizeDate(b.startDate)
      );

    const plan = {
      id: text(input.id) || createId(),
      moduleId: MODULE_ID,
      version: MODULE_VERSION,
      year: options.year,
      title: `خطة السفر الذكية لعام ${options.year}`,
      options: clone(options),
      travelDNA: clone(dna),
      slots,
      existingTrips: existingTrips.map((trip) => ({
        ...clone(trip),
        startDate: formatISODate(trip.startDate),
        endDate: formatISODate(trip.endDate)
      })),
      summary: buildAnnualSummary(
        slots,
        options,
        existingTrips,
        remainingBudget
      ),
      warnings: [],
      createdAt: nowISO(),
      updatedAt: nowISO()
    };

    if (slots.length < options.tripsCount) {
      plan.warnings.push(
        "لم يتم العثور على عدد كافٍ من الفترات المتاحة ضمن القيود الحالية."
      );
    }

    if (
      plan.summary.totalCommittedBudget >
      options.annualBudget
    ) {
      plan.warnings.push(
        "إجمالي الميزانية المخططة أعلى من الميزانية السنوية."
      );
    }

    const validation = validatePlan(plan);
    plan.validation = validation;

    if (!validation.valid) {
      plan.warnings.push(
        ...validation.issues.map((issue) => issue.message)
      );
    }

    if (options.persist) {
      save(plan);
    }

    emit("generated", {
      planId: plan.id,
      year: plan.year,
      slotsCount: plan.slots.length
    });

    return clone(plan);
  };

  const save = (plan) => {
    if (!isObject(plan)) {
      throw new TypeError(
        "TIC Travel Year Planner: a valid plan object is required."
      );
    }

    const store = getStore();

    if (!store) {
      throw new Error(
        "TIC Travel Year Planner: Store is not available."
      );
    }

    const current =
      clone(store.get?.(STORE_PATH, {})) || {};

    const plans = array(current.plans);
    const normalized = {
      ...clone(plan),
      updatedAt: nowISO()
    };

    const existingIndex = plans.findIndex(
      (item) => item.id === normalized.id
    );

    if (existingIndex >= 0) {
      plans[existingIndex] = normalized;
    } else {
      plans.unshift(normalized);
    }

    const payload = {
      ...current,
      activePlanId: normalized.id,
      plans,
      updatedAt: nowISO()
    };

    if (typeof store.set === "function") {
      store.set(STORE_PATH, payload);
    } else if (typeof store.patch === "function") {
      store.patch({
        guides: {
          yearPlanner: payload
        }
      });
    } else {
      throw new Error(
        "TIC Travel Year Planner: Store does not support set or patch."
      );
    }

    emit("saved", {
      planId: normalized.id,
      year: normalized.year
    });

    return clone(normalized);
  };

  const getSavedPlans = () => {
    const store = getStore();
    if (!store) return [];

    const value =
      store.get?.(STORE_PATH, {}) ||
      getStateSnapshot()?.guides?.yearPlanner ||
      {};

    return array(value.plans)
      .sort(
        (a, b) =>
          new Date(b.updatedAt || 0) -
          new Date(a.updatedAt || 0)
      );
  };

  const getActivePlan = () => {
    const store = getStore();
    if (!store) return null;

    const value =
      store.get?.(STORE_PATH, {}) ||
      getStateSnapshot()?.guides?.yearPlanner ||
      {};

    const plans = array(value.plans);
    const active =
      plans.find(
        (plan) =>
          plan.id === value.activePlanId
      ) ||
      plans[0] ||
      null;

    return clone(active);
  };

  const getPlanById = (planId) =>
    clone(
      getSavedPlans().find(
        (plan) => plan.id === text(planId)
      ) || null
    );

  const remove = (planId) => {
    const id = text(planId);
    const store = getStore();

    if (!id || !store) return false;

    const current =
      clone(store.get?.(STORE_PATH, {})) || {};

    const plans = array(current.plans);
    const filtered = plans.filter(
      (plan) => plan.id !== id
    );

    if (filtered.length === plans.length) {
      return false;
    }

    const payload = {
      ...current,
      plans: filtered,
      activePlanId:
        current.activePlanId === id
          ? filtered[0]?.id || null
          : current.activePlanId,
      updatedAt: nowISO()
    };

    store.set?.(STORE_PATH, payload);

    emit("removed", { planId: id });

    return true;
  };

  const setActivePlan = (planId) => {
    const id = text(planId);
    const store = getStore();

    if (!id || !store) return null;

    const current =
      clone(store.get?.(STORE_PATH, {})) || {};

    const plan = array(current.plans)
      .find((item) => item.id === id);

    if (!plan) return null;

    store.set?.(STORE_PATH, {
      ...current,
      activePlanId: id,
      updatedAt: nowISO()
    });

    emit("activated", {
      planId: id,
      year: plan.year
    });

    return clone(plan);
  };

  const convertSlotToTripDraft = (
    slot,
    plan = getActivePlan()
  ) => {
    if (!isObject(slot)) return null;

    return {
      id: null,
      title:
        `رحلة ${text(slot.countryNameAr || slot.countryCode)}`,
      destination:
        text(slot.countryNameAr || slot.countryCode),
      country:
        text(slot.countryNameAr),
      countryCode:
        text(slot.countryCode).toUpperCase(),
      startDate: text(slot.startDate),
      endDate: text(slot.endDate),
      durationDays: number(slot.durationDays),
      travelers: number(slot.travelers, 1),
      tripType: text(slot.tripType || "family"),
      travelStyle: text(
        slot.budgetLevel === "luxury"
          ? "luxury"
          : slot.budgetLevel === "premium"
            ? "premium-family"
            : "balanced"
      ),
      budget: number(slot.estimatedBudget),
      currency: text(slot.currency || plan?.summary?.currency || "AED"),
      status: "planning",
      notes: unique([
        `تم إنشاؤها من خطة السفر السنوية ${plan?.year || ""}.`,
        ...array(slot.reasons)
      ]).join("\n"),
      source: "travel-year-planner",
      sourcePlanId: plan?.id || null,
      sourceSlotId: slot.id || null
    };
  };

  const openGuideForSlot = (slot) => {
    const router = getRouter();

    if (!router || !slot?.countryCode) {
      return false;
    }

    const query = {
      country: slot.countryCode,
      month: slot.month,
      days: slot.durationDays,
      source: MODULE_ID
    };

    if (typeof router.go === "function") {
      router.go("guide", { query });
      return true;
    }

    if (typeof router.navigate === "function") {
      router.navigate("guide", { query });
      return true;
    }

    return false;
  };

  const emit = (type, detail = {}) => {
    const payload = {
      type,
      feature: MODULE_ID,
      timestamp: nowISO(),
      ...clone(detail)
    };

    window.dispatchEvent(
      new CustomEvent(
        `tic:feature:${MODULE_ID}:${type}`,
        { detail: payload }
      )
    );

    window.dispatchEvent(
      new CustomEvent("tic:travel-year-planner", {
        detail: payload
      })
    );

    return payload;
  };

  const notify = (message, tone = "success") => {
    const ui = getUI();

    if (typeof ui?.toast === "function") {
      ui.toast(message, { tone });
      return true;
    }

    if (typeof ui?.notify === "function") {
      ui.notify({
        message,
        tone
      });
      return true;
    }

    return false;
  };

  const diagnostics = () => ({
    id: MODULE_ID,
    version: MODULE_VERSION,
    ready: true,
    dependencies: {
      config: Boolean(getConfig()),
      store: Boolean(getStore()),
      router: Boolean(getRouter()),
      ui: Boolean(getUI()),
      countries: Boolean(getCountries()),
      knowledge: Boolean(getKnowledge()),
      recommendationEngine: Boolean(getRecommendationEngine()),
      guidePlanner: Boolean(getGuidePlanner()),
      travelDNA: Boolean(getTravelDNA())
    },
    savedPlans: getSavedPlans().length,
    activePlanId: getActivePlan()?.id || null,
    timestamp: nowISO()
  });

  const init = () => {
    window.TIC = window.TIC || {};
    window.TIC.Features = window.TIC.Features || {};

    emit("ready", diagnostics());

    return API;
  };

  const API = Object.freeze({
    id: MODULE_ID,
    version: MODULE_VERSION,
    monthsAr: Object.freeze([...MONTHS_AR]),
    seasonsAr: Object.freeze({ ...SEASONS_AR }),
    defaults: Object.freeze(clone(DEFAULT_OPTIONS)),
    normalizeOptions,
    generate,
    build: generate,
    createPlan: generate,
    validate: validatePlan,
    save,
    remove,
    deletePlan: remove,
    getSavedPlans,
    getActivePlan,
    getPlanById,
    setActivePlan,
    convertSlotToTripDraft,
    openGuideForSlot,
    notify,
    diagnostics,
    init
  });

  window.TIC = window.TIC || {};
  window.TIC.Features = window.TIC.Features || {};
  window.TIC.Features.TravelYearPlanner = API;
  window.TICTravelYearPlanner = API;

  init();
})(window);
