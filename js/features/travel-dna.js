/* =========================================================
   Travel Intelligence Center
   Travel DNA Engine V1.0.0

   File Path:
   js/features/travel-dna.js

   Purpose:
   - Builds a persistent personal travel profile from user data.
   - Learns from trips, memories, wishlist, budgets and saved guides.
   - Produces normalized scores, traits, habits and explanation reasons.
   - Provides one stable API for Home, Trips, Guide and future engines.
   - Keeps personalization logic independent from all page UI files.

   Dependencies:
   - js/store.js
   - js/data/countries-catalog.js
   - js/data/travel-knowledge.js

   Global APIs:
   - window.TIC.Features.TravelDNA
   - window.TICTravelDNA
========================================================= */

(function (window) {
  "use strict";

  const MODULE_ID = "travel-dna";
  const MODULE_VERSION = "1.0.0";
  const PROFILE_PATH = "profile.travelDNA";

  const DEFAULT_SCORES = {
    luxury: 50,
    budget: 50,
    beach: 50,
    nature: 50,
    city: 50,
    culture: 50,
    shopping: 50,
    adventure: 50,
    relaxation: 50,
    family: 50,
    couple: 50,
    solo: 50,
    food: 50,
    privacy: 50,
    premiumHotels: 50,
    shortTrips: 50,
    longTrips: 50,
    warmWeather: 50,
    coldWeather: 50
  };

  const SCORE_KEYS = Object.keys(DEFAULT_SCORES);

  const TRAIT_LABELS_AR = {
    luxury: "السفر الفاخر",
    budget: "السفر الاقتصادي",
    beach: "البحر والشواطئ",
    nature: "الطبيعة",
    city: "المدن",
    culture: "الثقافة والتاريخ",
    shopping: "التسوق",
    adventure: "المغامرات",
    relaxation: "الاسترخاء",
    family: "السفر العائلي",
    couple: "رحلات الأزواج",
    solo: "السفر الفردي",
    food: "تجارب الطعام",
    privacy: "الخصوصية",
    premiumHotels: "الفنادق الراقية",
    shortTrips: "الرحلات القصيرة",
    longTrips: "الرحلات الطويلة",
    warmWeather: "الأجواء الدافئة",
    coldWeather: "الأجواء الباردة"
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

    return Number.isFinite(parsed)
      ? parsed
      : fallback;
  };

  const array = (value) =>
    Array.isArray(value)
      ? clone(value)
      : [];

  const unique = (values) =>
    Array.from(
      new Set(
        array(values)
          .map(text)
          .filter(Boolean)
      )
    );

  const clamp = (value, min = 0, max = 100) =>
    Math.min(
      max,
      Math.max(
        min,
        Number(value) || 0
      )
    );

  const nowISO = () =>
    new Date().toISOString();

  const getStore = () =>
    window.TIC?.Store ||
    window.TICStore ||
    null;

  const getCountries = () =>
    window.TIC?.Data?.Countries ||
    window.TICCountriesCatalog ||
    null;

  const getKnowledge = () =>
    window.TIC?.Data?.TravelKnowledge ||
    window.TICTravelKnowledge ||
    null;

  const normalizeDate = (value) => {
    if (!value) return null;

    const date =
      value instanceof Date
        ? value
        : new Date(value);

    return Number.isNaN(
      date.getTime()
    )
      ? null
      : date;
  };

  const durationDays = (trip = {}) => {
    const direct =
      Math.max(
        0,
        number(
          trip.durationDays,
          0
        )
      );

    if (direct > 0) {
      return direct;
    }

    const start =
      normalizeDate(trip.startDate);

    const end =
      normalizeDate(trip.endDate);

    if (
      !start ||
      !end ||
      end < start
    ) {
      return 0;
    }

    return (
      Math.floor(
        (
          new Date(
            end.getFullYear(),
            end.getMonth(),
            end.getDate()
          ).getTime() -
          new Date(
            start.getFullYear(),
            start.getMonth(),
            start.getDate()
          ).getTime()
        ) / 86400000
      ) + 1
    );
  };

  const getStateSnapshot = () => {
    const store = getStore();

    if (!store) {
      return {};
    }

    if (
      typeof store.getState ===
      "function"
    ) {
      return clone(
        store.getState()
      ) || {};
    }

    return {
      profile:
        store.get?.(
          "profile",
          {}
        ) || {},
      trips:
        store.get?.(
          "trips",
          []
        ) || [],
      wishlist:
        store.get?.(
          "wishlist",
          []
        ) || [],
      memories:
        store.get?.(
          "memories",
          []
        ) || [],
      reviews:
        store.get?.(
          "reviews",
          []
        ) || [],
      guides:
        store.get?.(
          "guides",
          {}
        ) || {},
      budgets:
        store.get?.(
          "budgets",
          {}
        ) || {}
    };
  };

  const getCompletedTrips = (trips) =>
    array(trips).filter(
      (trip) =>
        trip.status ===
          "completed" ||
        trip.isMemory === true ||
        trip.memorySource
    );

  const normalizeCountryCode = (
    item = {}
  ) => {
    const direct = text(
      item.countryCode ||
      item.iso2 ||
      item.countryIso2
    ).toUpperCase();

    if (/^[A-Z]{2}$/.test(direct)) {
      return direct;
    }

    const countries =
      getCountries();

    const countryName =
      text(
        item.country ||
        item.countryName ||
        item.destinationCountry
      );

    if (
      !countries ||
      !countryName
    ) {
      return "";
    }

    const result =
      countries.search?.(
        countryName,
        {
          limit: 1
        }
      ) || [];

    return result[0]?.iso2 || "";
  };

  const collectTags = (trip = {}) => {
    const tags = [
      trip.tripType,
      trip.travelStyle,
      trip.purpose,
      trip.destination,
      trip.country,
      trip.city,
      trip.accommodation,
      trip.transport,
      trip.notes,
      trip.bestMemory,
      trip.memoryMood,
      trip.hotelType,
      trip.roomType,
      trip.favoriteActivity
    ];

    [
      trip.tags,
      trip.activities,
      trip.preferences,
      trip.interests,
      trip.experiences
    ].forEach((collection) => {
      array(collection).forEach(
        (item) => {
          if (typeof item === "string") {
            tags.push(item);
          } else if (isObject(item)) {
            tags.push(
              item.title,
              item.name,
              item.category,
              ...array(item.tags)
            );
          }
        }
      );
    });

    return unique(tags)
      .map((tag) =>
        tag.toLowerCase()
      );
  };

  const containsAny = (
    tags,
    patterns
  ) =>
    tags.some((tag) =>
      patterns.some((pattern) =>
        tag.includes(pattern)
      )
    );

  const scoreFromTrip = (
    trip,
    scores,
    weight = 1
  ) => {
    const tags =
      collectTags(trip);

    const tripType =
      text(
        trip.tripType
      ).toLowerCase();

    const travelStyle =
      text(
        trip.travelStyle
      ).toLowerCase();

    const days =
      durationDays(trip);

    const budget =
      Math.max(
        0,
        number(trip.budget)
      );

    const travelers =
      Math.max(
        1,
        number(
          trip.travelers,
          1
        )
      );

    const perPersonBudget =
      budget / travelers;

    const rating =
      clamp(
        number(
          trip.rating,
          trip.reviewRating || 0
        ),
        0,
        5
      );

    const satisfactionWeight =
      rating > 0
        ? 0.7 +
          rating / 5
        : 1;

    const factor =
      weight *
      satisfactionWeight;

    const add = (
      key,
      amount
    ) => {
      scores[key] +=
        amount * factor;
    };

    if (
      ["family"].includes(
        tripType
      )
    ) {
      add("family", 16);
    }

    if (
      ["couple", "honeymoon"].includes(
        tripType
      )
    ) {
      add("couple", 18);
      add("privacy", 8);
    }

    if (
      tripType === "solo"
    ) {
      add("solo", 18);
    }

    if (
      tripType === "business"
    ) {
      add("city", 12);
      add("shortTrips", 8);
    }

    if (
      travelStyle.includes(
        "lux"
      ) ||
      travelStyle.includes(
        "premium"
      ) ||
      containsAny(tags, [
        "فاخ",
        "luxury",
        "premium",
        "five star",
        "5 star",
        "villa",
        "resort"
      ])
    ) {
      add("luxury", 18);
      add(
        "premiumHotels",
        16
      );
      add("privacy", 8);
    }

    if (
      travelStyle.includes(
        "budget"
      ) ||
      containsAny(tags, [
        "اقتصاد",
        "budget",
        "cheap",
        "hostel"
      ])
    ) {
      add("budget", 18);
    }

    if (
      containsAny(tags, [
        "بحر",
        "شاطئ",
        "جزيرة",
        "beach",
        "sea",
        "island",
        "snorkel",
        "diving",
        "فلل مائية"
      ])
    ) {
      add("beach", 20);
      add("relaxation", 9);
    }

    if (
      containsAny(tags, [
        "طبيع",
        "جبال",
        "بحيرة",
        "ريف",
        "nature",
        "mountain",
        "lake",
        "forest",
        "canyon"
      ])
    ) {
      add("nature", 18);
    }

    if (
      containsAny(tags, [
        "مدينة",
        "city",
        "downtown",
        "urban",
        "مول",
        "metro"
      ])
    ) {
      add("city", 15);
    }

    if (
      containsAny(tags, [
        "ثقاف",
        "تاريخ",
        "متحف",
        "قصر",
        "مسجد",
        "culture",
        "history",
        "museum",
        "heritage"
      ])
    ) {
      add("culture", 16);
    }

    if (
      containsAny(tags, [
        "تسوق",
        "سوق",
        "shopping",
        "mall",
        "outlet"
      ])
    ) {
      add("shopping", 15);
    }

    if (
      containsAny(tags, [
        "مغامر",
        "هايكن",
        "تزلج",
        "سفاري",
        "adventure",
        "hiking",
        "ski",
        "safari",
        "zipline"
      ])
    ) {
      add("adventure", 18);
    }

    if (
      containsAny(tags, [
        "هدوء",
        "استرخاء",
        "سبا",
        "خصوص",
        "relax",
        "spa",
        "quiet",
        "private"
      ])
    ) {
      add("relaxation", 18);
      add("privacy", 12);
    }

    if (
      containsAny(tags, [
        "مطعم",
        "طعام",
        "حلال",
        "food",
        "restaurant",
        "cafe"
      ])
    ) {
      add("food", 14);
    }

    if (
      days > 0 &&
      days <= 4
    ) {
      add("shortTrips", 18);
    }

    if (days >= 8) {
      add("longTrips", 18);
    }

    if (
      perPersonBudget >= 7000
    ) {
      add("luxury", 12);
      add(
        "premiumHotels",
        10
      );
    } else if (
      perPersonBudget > 0 &&
      perPersonBudget <= 2500
    ) {
      add("budget", 12);
    }

    if (
      trip.featured === true ||
      trip.favorite === true ||
      rating >= 4
    ) {
      add("relaxation", 3);
      add("culture", 2);
      add("nature", 2);
    }

    const month =
      normalizeDate(
        trip.startDate
      )?.getMonth() + 1;

    if (
      month &&
      [4, 5, 6, 7, 8, 9].includes(
        month
      )
    ) {
      add(
        "warmWeather",
        8
      );
    }

    if (
      month &&
      [11, 12, 1, 2].includes(
        month
      )
    ) {
      add(
        "coldWeather",
        8
      );
    }
  };

  const scoreFromWishlist = (
    wishlist,
    scores
  ) => {
    array(wishlist).forEach(
      (item) => {
        const tags =
          collectTags(item);

        const add = (
          key,
          amount
        ) => {
          scores[key] += amount;
        };

        if (
          containsAny(tags, [
            "بحر",
            "شاطئ",
            "beach",
            "island"
          ])
        ) {
          add("beach", 6);
        }

        if (
          containsAny(tags, [
            "طبيع",
            "جبال",
            "nature"
          ])
        ) {
          add("nature", 6);
        }

        if (
          containsAny(tags, [
            "فاخ",
            "luxury",
            "resort"
          ])
        ) {
          add("luxury", 6);
        }

        if (
          containsAny(tags, [
            "مدينة",
            "city"
          ])
        ) {
          add("city", 5);
        }
      }
    );
  };

  const scoreFromSavedGuides = (
    guides,
    scores
  ) => {
    array(guides).forEach(
      (guide) => {
        const preferences =
          guide.preferences || {};

        const add = (
          key,
          amount
        ) => {
          scores[key] += amount;
        };

        if (
          preferences.wantsBeach
        ) {
          add("beach", 5);
        }

        if (
          preferences.wantsNature
        ) {
          add("nature", 5);
        }

        if (
          preferences.wantsShopping
        ) {
          add("shopping", 5);
        }

        if (
          preferences.wantsCulture
        ) {
          add("culture", 5);
        }

        if (
          preferences.wantsLuxury
        ) {
          add("luxury", 5);
        }

        if (
          preferences.requiresShattaf
        ) {
          add("privacy", 3);
          add(
            "premiumHotels",
            3
          );
        }

        if (
          preferences.tripType ===
          "family"
        ) {
          add("family", 5);
        }

        if (
          preferences.tripType ===
          "couple"
        ) {
          add("couple", 5);
        }

        if (
          preferences.tripType ===
          "solo"
        ) {
          add("solo", 5);
        }
      }
    );
  };

  const normalizeScores = (
    rawScores,
    evidenceCount
  ) => {
    const normalized = {};

    SCORE_KEYS.forEach((key) => {
      const baseline =
        DEFAULT_SCORES[key];

      const evidenceFactor =
        evidenceCount > 0
          ? Math.min(
              1,
              evidenceCount / 8
            )
          : 0;

      const raw =
        rawScores[key];

      const adjusted =
        baseline +
        raw *
          (0.45 +
            evidenceFactor * 0.55);

      normalized[key] =
        Math.round(
          clamp(adjusted)
        );
    });

    return normalized;
  };

  const buildHabits = (
    completedTrips
  ) => {
    const durations =
      completedTrips
        .map(durationDays)
        .filter(
          (value) =>
            value > 0
        );

    const budgets =
      completedTrips
        .map((trip) =>
          number(trip.budget)
        )
        .filter(
          (value) =>
            value > 0
        );

    const travelers =
      completedTrips
        .map((trip) =>
          number(
            trip.travelers,
            1
          )
        )
        .filter(
          (value) =>
            value > 0
        );

    const months =
      completedTrips
        .map((trip) =>
          normalizeDate(
            trip.startDate
          )?.getMonth() + 1
        )
        .filter(Boolean);

    const modes =
      completedTrips
        .map((trip) =>
          text(trip.tripType)
        )
        .filter(Boolean);

    const average = (
      values
    ) =>
      values.length
        ? Math.round(
            values.reduce(
              (sum, value) =>
                sum + value,
              0
            ) / values.length
          )
        : 0;

    const mostCommon = (
      values
    ) => {
      const map = new Map();

      values.forEach((value) => {
        map.set(
          value,
          (map.get(value) || 0) + 1
        );
      });

      return Array.from(
        map.entries()
      ).sort(
        (a, b) =>
          b[1] - a[1]
      )[0]?.[0] || null;
    };

    return {
      averageTripDays:
        average(durations),
      averageBudget:
        average(budgets),
      averageTravelers:
        average(travelers),
      preferredMonth:
        mostCommon(months),
      preferredTripType:
        mostCommon(modes),
      shortTripRate:
        durations.length
          ? Math.round(
              durations.filter(
                (days) =>
                  days <= 4
              ).length /
                durations.length *
                100
            )
          : 0,
      longTripRate:
        durations.length
          ? Math.round(
              durations.filter(
                (days) =>
                  days >= 8
              ).length /
                durations.length *
                100
            )
          : 0
    };
  };

  const buildVisitedProfile = (
    completedTrips
  ) => {
    const countryMap =
      new Map();

    completedTrips.forEach(
      (trip) => {
        const code =
          normalizeCountryCode(
            trip
          );

        const countryName =
          text(trip.country);

        if (
          !code &&
          !countryName
        ) {
          return;
        }

        const key =
          code || countryName;

        const current =
          countryMap.get(key) || {
            code,
            country:
              countryName,
            visits: 0,
            days: 0,
            cities: new Set(),
            lastVisit: null
          };

        current.visits += 1;
        current.days +=
          durationDays(trip);

        [
          trip.city,
          ...array(trip.cities)
        ]
          .map(text)
          .filter(Boolean)
          .forEach((city) =>
            current.cities.add(city)
          );

        const visitDate =
          normalizeDate(
            trip.startDate
          );

        if (
          visitDate &&
          (
            !current.lastVisit ||
            visitDate >
              current.lastVisit
          )
        ) {
          current.lastVisit =
            visitDate;
        }

        countryMap.set(
          key,
          current
        );
      }
    );

    return Array.from(
      countryMap.values()
    )
      .map((item) => ({
        code: item.code,
        country:
          item.country ||
          getCountries()
            ?.getByCode?.(
              item.code
            )
            ?.nameAr ||
          "",
        visits:
          item.visits,
        days:
          item.days,
        cities:
          Array.from(
            item.cities
          ),
        lastVisit:
          item.lastVisit
            ? item.lastVisit.toISOString()
            : null
      }))
      .sort(
        (a, b) =>
          b.visits -
          a.visits ||
          b.days -
          a.days
      );
  };

  const buildTraits = (
    scores
  ) =>
    Object.entries(scores)
      .map(
        ([key, score]) => ({
          key,
          labelAr:
            TRAIT_LABELS_AR[key] ||
            key,
          score
        })
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  const buildPersona = (
    traits
  ) => {
    const top =
      traits.slice(0, 4);

    const labels =
      top.map(
        (trait) =>
          trait.labelAr
      );

    let titleAr =
      "مسافر متوازن";

    const keys =
      top.map(
        (trait) =>
          trait.key
      );

    if (
      keys.includes("luxury") &&
      keys.includes("beach")
    ) {
      titleAr =
        "مسافر فاخر محب للبحر";
    } else if (
      keys.includes("family") &&
      keys.includes("nature")
    ) {
      titleAr =
        "مسافر عائلي محب للطبيعة";
    } else if (
      keys.includes("culture") &&
      keys.includes("city")
    ) {
      titleAr =
        "مستكشف المدن والثقافة";
    } else if (
      keys.includes("adventure") &&
      keys.includes("nature")
    ) {
      titleAr =
        "مغامر محب للطبيعة";
    } else if (
      keys.includes("relaxation") &&
      keys.includes("privacy")
    ) {
      titleAr =
        "مسافر هادئ يبحث عن الخصوصية";
    }

    return {
      titleAr,
      topTraits: top,
      summaryAr:
        labels.length
          ? `تميل إلى ${labels.join("، ")}.`
          : "لا توجد بيانات كافية بعد لبناء بصمة دقيقة."
    };
  };

  const buildReasons = (
    profile
  ) => {
    const reasons = [];

    if (
      profile.habits
        .averageTripDays > 0
    ) {
      reasons.push(
        `متوسط مدة رحلاتك ${profile.habits.averageTripDays} أيام.`
      );
    }

    if (
      profile.habits
        .preferredTripType
    ) {
      reasons.push(
        `أكثر نوع رحلة يتكرر لديك: ${profile.habits.preferredTripType}.`
      );
    }

    const topTrait =
      profile.traits[0];

    if (topTrait) {
      reasons.push(
        `أعلى سمة حالياً هي ${topTrait.labelAr} بنسبة ${topTrait.score}%.`
      );
    }

    if (
      profile.visitedCountries
        .length
    ) {
      reasons.push(
        `تم تحليل ${profile.visitedCountries.length} دولة من سجل السفر.`
      );
    }

    if (
      profile.evidence
        .completedTripCount === 0
    ) {
      reasons.push(
        "أضف رحلات سابقة وتقييماتها حتى تصبح التوصيات أدق."
      );
    }

    return reasons;
  };

  const buildProfile = (
    options = {}
  ) => {
    const snapshot =
      getStateSnapshot();

    const trips =
      array(snapshot.trips);

    const completedTrips =
      getCompletedTrips(
        trips
      );

    const wishlist =
      array(snapshot.wishlist);

    const savedGuides =
      array(
        snapshot.guides
          ?.savedGuides
      );

    const rawScores =
      SCORE_KEYS.reduce(
        (result, key) => {
          result[key] = 0;
          return result;
        },
        {}
      );

    completedTrips.forEach(
      (trip) =>
        scoreFromTrip(
          trip,
          rawScores,
          1
        )
    );

    trips
      .filter(
        (trip) =>
          !completedTrips.some(
            (completed) =>
              String(completed.id) ===
              String(trip.id)
          )
      )
      .forEach(
        (trip) =>
          scoreFromTrip(
            trip,
            rawScores,
            0.35
          )
      );

    scoreFromWishlist(
      wishlist,
      rawScores
    );

    scoreFromSavedGuides(
      savedGuides,
      rawScores
    );

    const evidenceCount =
      completedTrips.length +
      Math.min(
        5,
        wishlist.length
      ) +
      Math.min(
        5,
        savedGuides.length
      );

    const scores =
      normalizeScores(
        rawScores,
        evidenceCount
      );

    const habits =
      buildHabits(
        completedTrips
      );

    const visitedCountries =
      buildVisitedProfile(
        completedTrips
      );

    const traits =
      buildTraits(scores);

    const persona =
      buildPersona(traits);

    const profile = {
      id: "travel_dna_main",
      version:
        MODULE_VERSION,
      generatedAt:
        nowISO(),
      updatedAt:
        nowISO(),

      confidence:
        Math.round(
          clamp(
            evidenceCount * 8,
            5,
            100
          )
        ),

      scores,
      traits,
      persona,
      habits,
      visitedCountries,

      evidence: {
        totalTripCount:
          trips.length,
        completedTripCount:
          completedTrips.length,
        wishlistCount:
          wishlist.length,
        savedGuideCount:
          savedGuides.length,
        analyzedCountryCount:
          visitedCountries.length
      },

      preferences: {
        requiresHalal:
          snapshot.profile
            ?.requiresHalal !== false,
        requiresShattaf:
          snapshot.profile
            ?.requiresShattaf === true,
        homeAirport:
          text(
            snapshot.profile
              ?.homeAirport
          ),
        currency:
          text(
            snapshot.profile
              ?.currency
          ) || "AED",
        travelStyle:
          text(
            snapshot.profile
              ?.travelStyle
          )
      },

      reasons: [],
      metadata: {
        source:
          "local-travel-history",
        automatic:
          options.automatic !== false,
        schemaVersion: 1
      }
    };

    profile.reasons =
      buildReasons(profile);

    return profile;
  };

  const saveProfile = (
    profile
  ) => {
    const store =
      getStore();

    if (!store) {
      return false;
    }

    const normalized =
      isObject(profile)
        ? clone(profile)
        : buildProfile();

    if (
      typeof store.set ===
      "function"
    ) {
      store.set(
        PROFILE_PATH,
        normalized,
        {
          immediate: true
        }
      );

      return clone(
        normalized
      );
    }

    if (
      typeof store.patch ===
      "function"
    ) {
      store.patch(
        "profile",
        {
          travelDNA:
            normalized
        },
        {
          immediate: true
        }
      );

      return clone(
        normalized
      );
    }

    return false;
  };

  const refresh = (
    options = {}
  ) => {
    const profile =
      buildProfile(options);

    if (
      options.persist !== false
    ) {
      saveProfile(profile);
    }

    window.dispatchEvent(
      new CustomEvent(
        "tic:travel-dna:updated",
        {
          detail:
            clone(profile)
        }
      )
    );

    return profile;
  };

  const getProfile = (
    options = {}
  ) => {
    const store =
      getStore();

    const saved =
      store?.get?.(
        PROFILE_PATH,
        null
      );

    if (
      isObject(saved) &&
      options.fresh !== true
    ) {
      return clone(saved);
    }

    return refresh({
      persist:
        options.persist !== false
    });
  };

  const getScores = (
    options = {}
  ) =>
    clone(
      getProfile(options)
        .scores
    );

  const getTraits = (
    limit = 6,
    options = {}
  ) =>
    clone(
      getProfile(options)
        .traits
        .slice(
          0,
          Math.max(
            1,
            number(limit, 6)
          )
        )
    );

  const getPreferenceWeights = (
    options = {}
  ) => {
    const profile =
      getProfile(options);

    return {
      beach:
        profile.scores.beach,
      nature:
        profile.scores.nature,
      city:
        profile.scores.city,
      culture:
        profile.scores.culture,
      shopping:
        profile.scores.shopping,
      adventure:
        profile.scores.adventure,
      relaxation:
        profile.scores.relaxation,
      luxury:
        profile.scores.luxury,
      budget:
        profile.scores.budget,
      family:
        profile.scores.family,
      couple:
        profile.scores.couple,
      solo:
        profile.scores.solo,
      privacy:
        profile.scores.privacy,
      food:
        profile.scores.food
    };
  };

  const explainRecommendation = (
    destination = {},
    options = {}
  ) => {
    const profile =
      getProfile(options);

    const countryCode =
      text(
        destination.countryCode ||
        destination.code ||
        destination.iso2
      ).toUpperCase();

    const knowledge =
      getKnowledge()
        ?.getCountry?.(
          countryCode
        );

    const reasons = [];

    if (
      profile.scores.beach >= 65 &&
      knowledge?.beaches?.length
    ) {
      reasons.push(
        "لأنك تميل للبحر وهذه الوجهة لديها خيارات شاطئية."
      );
    }

    if (
      profile.scores.nature >= 65 &&
      (
        knowledge?.natureActivities
          ?.length ||
        knowledge?.bestCities
          ?.some((city) =>
            array(city.tags).some(
              (tag) =>
                /طبيع|جبال|nature|mountain/i.test(
                  tag
                )
            )
          )
      )
    ) {
      reasons.push(
        "لأن سجل رحلاتك يظهر اهتماماً بالطبيعة."
      );
    }

    if (
      profile.scores.luxury >= 65 &&
      knowledge?.hotelAreas?.length
    ) {
      reasons.push(
        "لأنك تفضل الإقامة الراقية والوجهة توفر مناطق فندقية مناسبة."
      );
    }

    if (
      profile.scores.family >= 65 &&
      knowledge?.familyActivities
        ?.length
    ) {
      reasons.push(
        "لأن أسلوب سفرك عائلي وتتوفر أنشطة مناسبة للعائلة."
      );
    }

    if (!reasons.length) {
      reasons.push(
        "تتناسب مع نمط رحلاتك الحالي ومدة سفرك المعتادة."
      );
    }

    return {
      countryCode,
      reasons,
      confidence:
        profile.confidence
    };
  };

  const reset = () => {
    const store =
      getStore();

    if (!store) {
      return false;
    }

    store.set?.(
      PROFILE_PATH,
      null,
      {
        immediate: true
      }
    );

    window.dispatchEvent(
      new CustomEvent(
        "tic:travel-dna:reset"
      )
    );

    return true;
  };

  const TravelDNA = {
    id: MODULE_ID,
    version:
      MODULE_VERSION,

    buildProfile,
    refresh,
    getProfile,
    getScores,
    getTraits,
    getPreferenceWeights,
    explainRecommendation,
    saveProfile,
    reset,

    diagnostics() {
      const profile =
        getProfile({
          fresh: false,
          persist: false
        });

      return {
        id: MODULE_ID,
        version:
          MODULE_VERSION,
        storeAvailable:
          Boolean(getStore()),
        countriesAvailable:
          getCountries()
            ?.count?.() || 0,
        knowledgeAvailable:
          getKnowledge()
            ?.count?.() || 0,
        confidence:
          profile.confidence,
        completedTripCount:
          profile.evidence
            .completedTripCount,
        analyzedCountryCount:
          profile.evidence
            .analyzedCountryCount,
        topTrait:
          profile.traits[0] ||
          null
      };
    }
  };

  window.TIC =
    window.TIC || {};

  window.TIC.Features =
    window.TIC.Features || {};

  window.TIC.Features.TravelDNA =
    TravelDNA;

  window.TICTravelDNA =
    TravelDNA;

  window.dispatchEvent(
    new CustomEvent(
      "tic:feature:travel-dna-ready",
      {
        detail:
          TravelDNA.diagnostics()
      }
    )
  );
})(window);
