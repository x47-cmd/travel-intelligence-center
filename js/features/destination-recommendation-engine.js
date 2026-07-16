/* =========================================================
   Travel Intelligence Center
   Destination Recommendation Engine V2.0.0

   File Path:
   js/features/destination-recommendation-engine.js

   Purpose:
   - Builds destination recommendations from real user history.
   - Uses visited countries, trip ratings, wishlist, travel profile,
     trip preferences, budget, month, duration and traveler count.
   - Penalizes destinations rated poorly in previous trips.
   - Prevents generic recommendations from overriding explicit user feedback.
   - Produces transparent scores, reasons, warnings and budget estimates.
   - Supports fast cached recommendation results for mobile performance.
   - Remains independent from the Guide UI.

   Dependencies:
   - js/store.js
   - js/data/countries-catalog.js or compatible Countries API
   - js/data/travel-knowledge.js or compatible TravelKnowledge API

   Global APIs:
   - window.TIC.Features.DestinationRecommendation
   - window.TICDestinationRecommendation
========================================================= */

(function destinationRecommendationFactory(window) {
  "use strict";

  const ENGINE_ID = "destination-recommendation-engine";
  const ENGINE_VERSION = "2.0.0";

  const DEFAULT_LIMIT = 8;
  const MAX_LIMIT = 30;
  const LOW_RATING_THRESHOLD = 2.5;
  const VERY_LOW_RATING_THRESHOLD = 2;
  const CACHE_TTL_MS = 5 * 60 * 1000;

  const Countries =
    window.TIC?.Data?.Countries ||
    window.TICCountries ||
    window.CountriesCatalog ||
    null;

  const Knowledge =
    window.TIC?.Data?.TravelKnowledge ||
    window.TICTravelKnowledge ||
    window.TravelKnowledge ||
    null;

  const getStore = () =>
    window.TIC?.Store ||
    window.TICStore ||
    window.Store ||
    window.TravelStore ||
    null;

  const cache = new Map();

  /* =========================================================
     Utilities
  ========================================================= */

  const clone = (value) => {
    if (value === undefined) return undefined;

    try {
      return structuredClone(value);
    } catch (_) {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (_) {
        return value;
      }
    }
  };

  const safeArray = (value) =>
    Array.isArray(value) ? value : [];

  const text = (value, fallback = "") =>
    String(value === undefined || value === null ? fallback : value).trim();

  const number = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const clamp = (value, minimum, maximum) =>
    Math.min(maximum, Math.max(minimum, value));

  const unique = (items) =>
    [...new Set(safeArray(items).filter(Boolean))];

  const normalizeCode = (value) =>
    text(value).toUpperCase();

  const normalizeText = (value) =>
    text(value)
      .toLocaleLowerCase("ar")
      .normalize("NFKD")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/\s+/g, " ");

  const includesAny = (source, keywords) => {
    const haystack = normalizeText(source);

    return safeArray(keywords).some((keyword) =>
      haystack.includes(normalizeText(keyword))
    );
  };

  const state = () =>
    getStore()?.getState?.() || {};

  const invalidateCache = () => {
    cache.clear();
    return true;
  };

  const getCached = (key) => {
    const entry = cache.get(key);

    if (!entry) return null;

    if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
      cache.delete(key);
      return null;
    }

    return clone(entry.value);
  };

  const setCached = (key, value) => {
    cache.set(key, {
      createdAt: Date.now(),
      value: clone(value)
    });

    return clone(value);
  };

  /* =========================================================
     Data normalization
  ========================================================= */

  const getCountries = () => {
    if (!Countries) return [];

    try {
      if (typeof Countries.getAll === "function") {
        return safeArray(Countries.getAll());
      }

      if (Array.isArray(Countries)) {
        return Countries;
      }

      if (Array.isArray(Countries.items)) {
        return Countries.items;
      }
    } catch (error) {
      console.error("TIC Recommendation countries error:", error);
    }

    return [];
  };

  const getKnowledge = (code) => {
    if (!Knowledge || !code) return null;

    try {
      if (typeof Knowledge.getCountry === "function") {
        return Knowledge.getCountry(code);
      }

      if (Knowledge[code]) {
        return Knowledge[code];
      }

      if (Knowledge.countries?.[code]) {
        return Knowledge.countries[code];
      }
    } catch (error) {
      console.error("TIC Recommendation knowledge error:", error);
    }

    return null;
  };

  const normalizeCountry = (country) => {
    const code = normalizeCode(
      country.iso2 ||
      country.code ||
      country.countryCode
    );

    return {
      ...country,
      code,
      iso2: code,
      nameAr:
        country.nameAr ||
        country.arabicName ||
        country.country ||
        country.name ||
        code,
      nameEn:
        country.nameEn ||
        country.englishName ||
        country.name ||
        code,
      flag: country.flag || "🌍"
    };
  };

  const normalizeRating = (trip) => {
    const candidates = [
      trip.rating,
      trip.review?.rating,
      trip.reviewRating,
      trip.tripRating,
      trip.countryRating,
      trip.experienceRating,
      trip.score
    ];

    for (const candidate of candidates) {
      const value = number(candidate, NaN);

      if (Number.isFinite(value)) {
        if (value > 5 && value <= 10) return value / 2;
        if (value > 10 && value <= 100) return value / 20;
        return clamp(value, 0, 5);
      }
    }

    return null;
  };

  const getTripCountryCode = (trip) =>
    normalizeCode(
      trip.countryCode ||
      trip.destination?.countryCode ||
      trip.destinationCode ||
      trip.country?.code ||
      trip.countryISO2 ||
      trip.iso2
    );

  const getTripCountryName = (trip) =>
    text(
      trip.countryName ||
      trip.destination?.country ||
      trip.destination?.countryName ||
      trip.country?.nameAr ||
      trip.country ||
      ""
    );

  const getTrips = () =>
    safeArray(state().trips);

  const getWishlist = () => {
    const snapshot = state();

    return safeArray(
      snapshot.wishlist ||
      snapshot.guideWishlist ||
      snapshot.travelWishlist
    );
  };

  const getAnnualPlans = () => {
    const snapshot = state();

    return safeArray(
      snapshot.annualPlans ||
      snapshot.travelPlans ||
      snapshot.planner?.annualPlans
    );
  };

  const getProfile = () => {
    const snapshot = state();

    return {
      ...snapshot.profile,
      ...snapshot.settings?.profile,
      travelStyle:
        snapshot.profile?.travelStyle ||
        snapshot.settings?.travelStyle ||
        snapshot.travelStyle ||
        "",
      homeAirport:
        snapshot.profile?.homeAirport ||
        snapshot.settings?.homeAirport ||
        snapshot.homeAirport ||
        "",
      annualTravelBudget:
        number(
          snapshot.profile?.annualTravelBudget ||
          snapshot.settings?.annualTravelBudget ||
          snapshot.budgets?.annualTravelBudget,
          0
        ),
      monthlySaving:
        number(
          snapshot.profile?.monthlySaving ||
          snapshot.settings?.monthlySaving ||
          snapshot.savings?.monthlySaving,
          0
        )
    };
  };

  /* =========================================================
     User history intelligence
  ========================================================= */

  const buildTripHistory = () => {
    const byCountry = new Map();

    getTrips().forEach((trip) => {
      const code = getTripCountryCode(trip);

      if (!code) return;

      const existing = byCountry.get(code) || {
        code,
        visits: 0,
        ratings: [],
        averageRating: null,
        lastVisitedAt: null,
        tripIds: [],
        notes: [],
        tags: []
      };

      existing.visits += 1;
      existing.tripIds.push(trip.id);

      const rating = normalizeRating(trip);

      if (rating !== null) {
        existing.ratings.push(rating);
      }

      const visitedAt =
        trip.endDate ||
        trip.returnDate ||
        trip.startDate ||
        trip.departureDate ||
        trip.updatedAt ||
        trip.createdAt ||
        null;

      if (
        visitedAt &&
        (!existing.lastVisitedAt ||
          new Date(visitedAt) > new Date(existing.lastVisitedAt))
      ) {
        existing.lastVisitedAt = visitedAt;
      }

      existing.notes.push(
        text(trip.review?.notes || trip.notes || trip.feedback || "")
      );

      existing.tags.push(
        ...safeArray(trip.tags),
        ...safeArray(trip.preferences),
        ...safeArray(trip.activities),
        ...safeArray(trip.review?.liked),
        ...safeArray(trip.review?.disliked)
      );

      byCountry.set(code, existing);
    });

    byCountry.forEach((entry) => {
      entry.ratings = entry.ratings.filter(Number.isFinite);

      entry.averageRating = entry.ratings.length
        ? entry.ratings.reduce((sum, value) => sum + value, 0) /
          entry.ratings.length
        : null;

      entry.notes = unique(entry.notes.filter(Boolean));
      entry.tags = unique(entry.tags.filter(Boolean));
    });

    return byCountry;
  };

  const visitedCodes = () =>
    [...buildTripHistory().keys()];

  const buildWishlistCodes = () =>
    new Set(
      getWishlist()
        .map((item) =>
          normalizeCode(
            item.countryCode ||
            item.code ||
            item.country?.code
          )
        )
        .filter(Boolean)
    );

  const buildAnnualPlanCodes = () =>
    new Set(
      getAnnualPlans()
        .map((item) =>
          normalizeCode(
            item.countryCode ||
            item.code ||
            item.country?.code
          )
        )
        .filter(Boolean)
    );

  const inferPreferences = () => {
    const profile = getProfile();
    const trips = getTrips();

    const preferenceText = [
      profile.travelStyle,
      profile.preferences,
      profile.travelPreferences,
      profile.favoriteActivities,
      profile.preferredEnvironment,
      profile.tripStyle,
      ...trips.flatMap((trip) => [
        trip.travelStyle,
        trip.notes,
        trip.review?.notes,
        ...safeArray(trip.tags),
        ...safeArray(trip.activities),
        ...safeArray(trip.preferences),
        ...safeArray(trip.review?.liked)
      ])
    ].join(" ");

    const dislikedText = trips
      .flatMap((trip) => [
        trip.review?.notes,
        ...safeArray(trip.review?.disliked),
        ...safeArray(trip.dislikes)
      ])
      .join(" ");

    return {
      beach: includesAny(preferenceText, [
        "بحر",
        "شاطئ",
        "شواطئ",
        "sea",
        "beach",
        "island",
        "جزيرة"
      ]),
      nature: includesAny(preferenceText, [
        "طبيعة",
        "جبال",
        "غابات",
        "شلالات",
        "nature",
        "mountain",
        "waterfall",
        "forest",
        "lake"
      ]),
      luxury: includesAny(preferenceText, [
        "رفاهية",
        "فاخر",
        "فخم",
        "premium",
        "luxury",
        "resort",
        "منتجع"
      ]),
      family: includesAny(preferenceText, [
        "عائلة",
        "عائلي",
        "family",
        "children",
        "kids"
      ]),
      quiet: includesAny(preferenceText, [
        "هدوء",
        "هادئ",
        "خصوصية",
        "private",
        "quiet",
        "relax"
      ]),
      walking: includesAny(preferenceText, [
        "تمشية",
        "مشي",
        "walk",
        "walking",
        "promenade"
      ]),
      cities: includesAny(preferenceText, [
        "مدن",
        "مدينة",
        "city",
        "shopping",
        "تسوق"
      ]),
      halal: includesAny(preferenceText, [
        "حلال",
        "halal",
        "مسلم",
        "muslim"
      ]),
      shattaf: includesAny(preferenceText, [
        "شطاف",
        "bidet"
      ]),
      nightlifeDisliked: includesAny(dislikedText, [
        "سهر",
        "ملاهي",
        "nightlife",
        "club"
      ])
    };
  };

  /* =========================================================
     Destination intelligence
  ========================================================= */

  const extractTraits = (country, guide) => {
    const source = [
      country.nameAr,
      country.nameEn,
      country.summary,
      country.description,
      guide?.summary,
      guide?.description,
      ...safeArray(country.travelStyles),
      ...safeArray(guide?.travelStyles),
      ...safeArray(country.experiences),
      ...safeArray(guide?.experiences),
      ...safeArray(country.attractions),
      ...safeArray(guide?.attractions),
      ...safeArray(country.seasons),
      ...safeArray(guide?.bestCities),
      ...safeArray(country.cities)
    ].join(" ");

    return {
      beach:
        safeArray(guide?.beaches).length > 0 ||
        safeArray(country.beaches).length > 0 ||
        includesAny(source, ["بحر", "شاطئ", "جزيرة", "beach", "sea", "island"]),
      nature:
        includesAny(source, [
          "طبيعة",
          "جبال",
          "شلال",
          "غابة",
          "بحيرة",
          "nature",
          "mountain",
          "waterfall",
          "forest",
          "lake"
        ]),
      luxury:
        includesAny(source, [
          "رفاهية",
          "فاخر",
          "منتجع",
          "luxury",
          "premium",
          "resort"
        ]),
      family:
        country.familyFriendly === true ||
        guide?.familyFriendly === true ||
        includesAny(source, ["عائلة", "عائلي", "family", "kids"]),
      quiet:
        includesAny(source, [
          "هدوء",
          "هادئ",
          "خصوصية",
          "quiet",
          "private",
          "relax"
        ]),
      walking:
        includesAny(source, [
          "تمشية",
          "مشي",
          "ممشى",
          "walk",
          "walking",
          "promenade"
        ]),
      cities:
        safeArray(guide?.bestCities).length >= 2 ||
        safeArray(country.cities).length >= 2,
      halal:
        guide?.hotelRequirements?.halalFood === true ||
        guide?.halal?.friendly === true ||
        country.halal?.friendly === true,
      shattaf:
        guide?.hotelRequirements?.shattaf === true ||
        includesAny(
          [
            country.shattafAvailability,
            guide?.shattafAvailability
          ].join(" "),
          ["متوفر", "عالي", "good", "available"]
        )
    };
  };

  const getBestMonths = (country, guide) =>
    unique([
      ...safeArray(country.bestMonths),
      ...safeArray(guide?.bestMonths),
      ...safeArray(country.recommendedMonths),
      ...safeArray(guide?.recommendedMonths)
    ])
      .map((month) => number(month, 0))
      .filter((month) => month >= 1 && month <= 12);

  const getAvoidMonths = (country, guide) =>
    unique([
      ...safeArray(country.monthsToAvoid),
      ...safeArray(guide?.monthsToAvoid),
      ...safeArray(country.avoidMonths)
    ])
      .map((month) => number(month, 0))
      .filter((month) => month >= 1 && month <= 12);

  const getEstimatedCost = (country, guide, options) => {
    const days = clamp(number(options.days, 7), 1, 30);
    const travelers = clamp(number(options.travelers, 2), 1, 20);

    const directEstimate =
      number(
        country.estimatedIdealTrip?.totalAED ||
        guide?.estimatedIdealTrip?.totalAED ||
        guide?.budget?.estimatedTotalAED ||
        country.estimatedTotalAED,
        0
      );

    if (directEstimate > 0) {
      return {
        totalAED: Math.round(directEstimate),
        source: "direct"
      };
    }

    const flightPerPerson = number(
      guide?.costs?.flightAED ||
      country.costs?.flightAED ||
      guide?.flightEstimateAED ||
      country.flightEstimateAED,
      1800
    );

    const hotelPerNight = number(
      guide?.costs?.hotelNightAED ||
      country.costs?.hotelNightAED ||
      guide?.hotelEstimateAED ||
      country.hotelEstimateAED,
      650
    );

    const dailyPerPerson = number(
      guide?.costs?.dailyAED ||
      country.costs?.dailyAED ||
      guide?.dailyEstimateAED ||
      country.dailyEstimateAED,
      350
    );

    const nights = Math.max(1, days - 1);

    return {
      totalAED: Math.round(
        flightPerPerson * travelers +
        hotelPerNight * nights +
        dailyPerPerson * days * travelers
      ),
      source: "calculated"
    };
  };

  const getBudgetFit = (estimatedCost, budget) => {
    const normalizedBudget = number(budget, 0);

    if (!normalizedBudget || !estimatedCost) {
      return {
        score: 0,
        status: "unknown",
        differenceAED: 0
      };
    }

    const ratio = estimatedCost / normalizedBudget;

    if (ratio <= 0.8) {
      return {
        score: 14,
        status: "excellent",
        differenceAED: normalizedBudget - estimatedCost
      };
    }

    if (ratio <= 1) {
      return {
        score: 10,
        status: "good",
        differenceAED: normalizedBudget - estimatedCost
      };
    }

    if (ratio <= 1.15) {
      return {
        score: -5,
        status: "slightly_over",
        differenceAED: normalizedBudget - estimatedCost
      };
    }

    if (ratio <= 1.35) {
      return {
        score: -12,
        status: "over",
        differenceAED: normalizedBudget - estimatedCost
      };
    }

    return {
      score: -22,
      status: "far_over",
      differenceAED: normalizedBudget - estimatedCost
    };
  };

  const scoreDestination = ({
    country,
    guide,
    options,
    preferences,
    history,
    wishlistCodes,
    annualPlanCodes
  }) => {
    const code = country.code;
    const traits = extractTraits(country, guide);
    const bestMonths = getBestMonths(country, guide);
    const avoidMonths = getAvoidMonths(country, guide);
    const estimate = getEstimatedCost(country, guide, options);
    const budgetFit = getBudgetFit(
      estimate.totalAED,
      options.budget
    );

    const previous = history.get(code) || null;

    let score = 42;
    const reasons = [];
    const warnings = [];
    const breakdown = {
      base: 42,
      preferences: 0,
      history: 0,
      season: 0,
      budget: 0,
      practical: 0,
      wishlist: 0
    };

    const addPreference = (condition, points, reason) => {
      if (!condition) return;

      score += points;
      breakdown.preferences += points;

      if (reason) reasons.push(reason);
    };

    addPreference(
      preferences.beach && traits.beach,
      10,
      "توفر شواطئ أو أجواء بحرية تناسب تفضيلاتك."
    );

    addPreference(
      preferences.nature && traits.nature,
      10,
      "تتميز بالطبيعة والجبال أو البحيرات."
    );

    addPreference(
      preferences.luxury && traits.luxury,
      8,
      "فيها خيارات إقامة وتجارب فاخرة."
    );

    addPreference(
      preferences.family && traits.family,
      7,
      "مناسبة للرحلات العائلية."
    );

    addPreference(
      preferences.quiet && traits.quiet,
      6,
      "توفر أجواء هادئة وخصوصية."
    );

    addPreference(
      preferences.walking && traits.walking,
      5,
      "مناسبة للمشي والتمشية."
    );

    addPreference(
      preferences.cities && traits.cities,
      4,
      "فيها مدن وخيارات متنوعة للاستكشاف."
    );

    if (preferences.halal && traits.halal) {
      score += 6;
      breakdown.practical += 6;
      reasons.push("خيارات الحلال متوفرة بشكل أفضل.");
    }

    if (preferences.shattaf && traits.shattaf) {
      score += 4;
      breakdown.practical += 4;
      reasons.push("توفر الشطاف فيها أفضل من وجهات أخرى.");
    }

    if (wishlistCodes.has(code)) {
      score += 8;
      breakdown.wishlist += 8;
      reasons.push("سبق وحفظتها في قائمة الأمنيات.");
    }

    if (annualPlanCodes.has(code)) {
      score += 5;
      breakdown.wishlist += 5;
      reasons.push("موجودة ضمن خطتك السنوية.");
    }

    const month = clamp(number(options.month, 0), 0, 12);

    if (month && bestMonths.includes(month)) {
      score += 10;
      breakdown.season += 10;
      reasons.push("الشهر المختار من أفضل مواسمها.");
    } else if (month && avoidMonths.includes(month)) {
      score -= 18;
      breakdown.season -= 18;
      warnings.push("الشهر المختار ليس من أفضل أوقات السفر لهذه الوجهة.");
    }

    score += budgetFit.score;
    breakdown.budget += budgetFit.score;

    if (budgetFit.status === "excellent") {
      reasons.push("تكلفتها مناسبة جداً للميزانية المحددة.");
    } else if (budgetFit.status === "good") {
      reasons.push("تكلفتها ضمن الميزانية المحددة.");
    } else if (budgetFit.status === "far_over") {
      warnings.push("تكلفتها المتوقعة أعلى بكثير من ميزانيتك.");
    }

    const recommendedDays =
      number(
        country.recommendedDays?.ideal ||
        guide?.recommendedDays?.ideal ||
        country.idealDays ||
        guide?.idealDays,
        0
      );

    if (recommendedDays > 0) {
      const difference = Math.abs(
        recommendedDays - number(options.days, 7)
      );

      if (difference <= 2) {
        score += 5;
        breakdown.practical += 5;
        reasons.push("المدة المختارة مناسبة لطبيعة الوجهة.");
      } else if (difference >= 6) {
        score -= 4;
        breakdown.practical -= 4;
      }
    }

    if (previous) {
      if (
        previous.averageRating !== null &&
        previous.averageRating <= VERY_LOW_RATING_THRESHOLD
      ) {
        score -= 55;
        breakdown.history -= 55;
        warnings.push(
          `سبق أن قيّمت هذه الوجهة ${previous.averageRating.toFixed(1)} من 5.`
        );
      } else if (
        previous.averageRating !== null &&
        previous.averageRating < LOW_RATING_THRESHOLD
      ) {
        score -= 38;
        breakdown.history -= 38;
        warnings.push(
          `تقييمك السابق لهذه الوجهة منخفض (${previous.averageRating.toFixed(1)} من 5).`
        );
      } else if (
        previous.averageRating !== null &&
        previous.averageRating >= 4
      ) {
        score += 8;
        breakdown.history += 8;
        reasons.push(
          `سبق أن أعطيتها تقييماً مرتفعاً (${previous.averageRating.toFixed(1)} من 5).`
        );
      }

      if (previous.visits > 0) {
        score -= 6;
        breakdown.history -= 6;
        warnings.push("سبق أن زرت هذه الوجهة.");
      }
    }

    if (
      preferences.beach &&
      !traits.beach &&
      preferences.nature &&
      !traits.nature
    ) {
      score -= 12;
      breakdown.preferences -= 12;
      warnings.push("لا تتطابق جيداً مع تفضيلاتك البحرية والطبيعية.");
    }

    if (
      preferences.luxury &&
      !traits.luxury
    ) {
      score -= 5;
      breakdown.preferences -= 5;
    }

    const finalScore = clamp(Math.round(score), 0, 98);

    return {
      code,
      country: {
        ...country,
        code,
        wishlisted: wishlistCodes.has(code)
      },
      score: finalScore,
      reasons: unique(reasons).slice(0, 4),
      warnings: unique(warnings).slice(0, 3),
      traits,
      bestMonths,
      avoidMonths,
      estimate,
      budgetFit,
      previousExperience: previous
        ? {
            visits: previous.visits,
            averageRating: previous.averageRating,
            lastVisitedAt: previous.lastVisitedAt
          }
        : null,
      breakdown
    };
  };

  /* =========================================================
     Recommendation API
  ========================================================= */

  const buildOptions = (input = {}) => ({
    limit: clamp(
      number(input.limit, DEFAULT_LIMIT),
      1,
      MAX_LIMIT
    ),
    budget: Math.max(
      0,
      number(
        input.budget ||
        input.budgetAED ||
        input.selectedBudget,
        0
      )
    ),
    days: clamp(
      number(input.days, 7),
      1,
      30
    ),
    travelers: clamp(
      number(input.travelers, 2),
      1,
      20
    ),
    month: clamp(
      number(input.month, new Date().getMonth() + 1),
      1,
      12
    ),
    includeVisited: input.includeVisited === true,
    excludeLowRated: input.excludeLowRated !== false,
    minimumScore: clamp(
      number(input.minimumScore, 0),
      0,
      100
    ),
    forceRefresh: input.forceRefresh === true
  });

  const recommendationCacheKey = (options) => {
    const snapshot = state();

    return JSON.stringify({
      version: ENGINE_VERSION,
      options,
      tripsCount: safeArray(snapshot.trips).length,
      wishlistCount: safeArray(snapshot.wishlist).length,
      annualPlansCount: safeArray(
        snapshot.annualPlans ||
        snapshot.travelPlans
      ).length,
      updatedAt:
        snapshot.updatedAt ||
        snapshot.meta?.updatedAt ||
        ""
    });
  };

  const recommend = (input = DEFAULT_LIMIT) => {
    const rawOptions =
      typeof input === "number"
        ? { limit: input }
        : input || {};

    const options = buildOptions(rawOptions);
    const key = recommendationCacheKey(options);

    if (!options.forceRefresh) {
      const cached = getCached(key);

      if (cached) return cached;
    }

    const countries = getCountries()
      .map(normalizeCountry)
      .filter((country) => country.code);

    if (!countries.length) return [];

    const history = buildTripHistory();
    const wishlistCodes = buildWishlistCodes();
    const annualPlanCodes = buildAnnualPlanCodes();
    const preferences = inferPreferences();

    const results = countries
      .map((country) => {
        const guide = getKnowledge(country.code);

        return scoreDestination({
          country,
          guide,
          options,
          preferences,
          history,
          wishlistCodes,
          annualPlanCodes
        });
      })
      .filter((item) => {
        const previous = item.previousExperience;

        if (
          !options.includeVisited &&
          previous?.visits > 0
        ) {
          return false;
        }

        if (
          options.excludeLowRated &&
          previous?.averageRating !== null &&
          previous?.averageRating <= VERY_LOW_RATING_THRESHOLD
        ) {
          return false;
        }

        return item.score >= options.minimumScore;
      })
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        const aCost = number(a.estimate?.totalAED, Infinity);
        const bCost = number(b.estimate?.totalAED, Infinity);

        return aCost - bCost;
      })
      .slice(0, options.limit);

    return setCached(key, results);
  };

  const explain = (countryCode, input = {}) => {
    const code = normalizeCode(countryCode);

    if (!code) return null;

    const result = recommend({
      ...input,
      limit: MAX_LIMIT,
      includeVisited: true,
      excludeLowRated: false,
      minimumScore: 0
    }).find((item) => item.code === code);

    return result || null;
  };

  const getUserProfile = () => ({
    profile: clone(getProfile()),
    preferences: clone(inferPreferences()),
    visitedCodes: visitedCodes(),
    wishlistCodes: [...buildWishlistCodes()],
    annualPlanCodes: [...buildAnnualPlanCodes()]
  });

  const Engine = {
    id: ENGINE_ID,
    version: ENGINE_VERSION,

    recommend,
    explain,
    visitedCodes,
    getUserProfile,
    invalidateCache,

    diagnostics() {
      const history = buildTripHistory();
      const preferences = inferPreferences();
      const sample = recommend({
        limit: DEFAULT_LIMIT
      });

      return {
        id: ENGINE_ID,
        version: ENGINE_VERSION,
        countriesAvailable: getCountries().length,
        visitedCountries: history.size,
        wishlistCountries: buildWishlistCodes().size,
        annualPlanCountries: buildAnnualPlanCodes().size,
        preferences,
        cacheEntries: cache.size,
        recommendationCount: sample.length,
        lowRatedCountries: [...history.values()]
          .filter(
            (entry) =>
              entry.averageRating !== null &&
              entry.averageRating <= LOW_RATING_THRESHOLD
          )
          .map((entry) => ({
            code: entry.code,
            rating: entry.averageRating
          }))
      };
    }
  };

  window.TIC = window.TIC || {};
  window.TIC.Features = window.TIC.Features || {};
  window.TIC.Features.DestinationRecommendation = Engine;
  window.TICDestinationRecommendation = Engine;

  try {
    getStore()?.subscribe?.(() => {
      invalidateCache();
    });
  } catch (_) {
    // Store subscription is optional.
  }
})(window);
