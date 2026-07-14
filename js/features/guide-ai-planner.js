/* =========================================================
   Travel Intelligence Center
   Guide AI Planner V1.0.0

   File Path:
   js/features/guide-ai-planner.js

   Purpose:
   - Builds a complete personalized travel guide plan.
   - Uses country knowledge, user travel history and preferences.
   - Produces ranked cities, daily itinerary, hotels, beaches,
     attractions, transport, entry, safety, money, connectivity,
     food, packing, cultural tips and AI recommendations.
   - Keeps all planning logic independent from guide.js UI.
   - Designed so future UI redesigns only touch the page layer.

   Dependencies:
   - js/data/countries-catalog.js
   - js/data/travel-knowledge.js
   - js/features/destination-recommendation-engine.js
   - js/features/guide-search-engine.js
   - js/store.js

   Global APIs:
   - window.TIC.Features.GuideAIPlanner
   - window.TICGuideAIPlanner
========================================================= */

(function (window) {
  "use strict";

  const MODULE_ID = "guide-ai-planner";
  const MODULE_VERSION = "1.0.0";

  const DEFAULT_OPTIONS = {
    days: 5,
    travelers: 1,
    month: 0,
    tripType: "family",
    budgetLevel: "balanced",
    pace: "balanced",
    requiresHalal: true,
    requiresShattaf: false,
    wantsBeach: false,
    wantsNature: true,
    wantsShopping: false,
    wantsCulture: true,
    wantsLuxury: false,
    includeRestTime: true,
    includeTravelDays: true,
    maxCities: 3
  };

  const BUDGET_LEVELS = {
    budget: {
      labelAr: "اقتصادية",
      hotelTier: 2,
      dailyFactor: 0.75
    },
    balanced: {
      labelAr: "متوازنة",
      hotelTier: 3,
      dailyFactor: 1
    },
    premium: {
      labelAr: "راقية",
      hotelTier: 4,
      dailyFactor: 1.35
    },
    luxury: {
      labelAr: "فاخرة",
      hotelTier: 5,
      dailyFactor: 1.8
    },
    ultraLuxury: {
      labelAr: "فاخرة جداً",
      hotelTier: 5,
      dailyFactor: 2.4
    }
  };

  const TRIP_TYPE_WEIGHTS = {
    family: {
      family: 35,
      beach: 15,
      culture: 10,
      shopping: 10,
      nightlife: -20,
      adventure: 5
    },
    couple: {
      romantic: 35,
      beach: 20,
      luxury: 15,
      culture: 10,
      family: -5
    },
    solo: {
      city: 20,
      culture: 20,
      adventure: 20,
      transport: 10
    },
    friends: {
      adventure: 25,
      city: 20,
      shopping: 10,
      nightlife: 10
    },
    business: {
      city: 30,
      transport: 25,
      business: 25,
      beach: -10
    },
    weekend: {
      city: 20,
      transport: 20,
      compact: 25
    }
  };

  const PACE_DAILY_LOAD = {
    relaxed: 2,
    balanced: 3,
    active: 4
  };

  const MONTH_NAMES_AR = [
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

  const nowISO = () =>
    new Date().toISOString();

  const createId = (prefix = "guide") =>
    `${prefix}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;

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

  const getGuideSearch = () =>
    window.TIC?.Features?.GuideSearch ||
    window.TICGuideSearch ||
    null;

  const getStore = () =>
    window.TIC?.Store ||
    window.TICStore ||
    null;

  const normalizePreferences = (input = {}) => {
    const source = isObject(input)
      ? input
      : {};

    const budgetLevel = Object.prototype.hasOwnProperty.call(
      BUDGET_LEVELS,
      source.budgetLevel
    )
      ? source.budgetLevel
      : DEFAULT_OPTIONS.budgetLevel;

    const tripType =
      Object.prototype.hasOwnProperty.call(
        TRIP_TYPE_WEIGHTS,
        source.tripType
      )
        ? source.tripType
        : DEFAULT_OPTIONS.tripType;

    const pace =
      Object.prototype.hasOwnProperty.call(
        PACE_DAILY_LOAD,
        source.pace
      )
        ? source.pace
        : DEFAULT_OPTIONS.pace;

    return {
      ...DEFAULT_OPTIONS,
      ...clone(source),
      countryCode:
        text(source.countryCode).toUpperCase(),
      city: text(source.city),
      days: Math.max(
        1,
        Math.min(
          30,
          Math.round(
            number(
              source.days,
              DEFAULT_OPTIONS.days
            )
          )
        )
      ),
      travelers: Math.max(
        1,
        Math.min(
          30,
          Math.round(
            number(
              source.travelers,
              DEFAULT_OPTIONS.travelers
            )
          )
        )
      ),
      month: Math.max(
        0,
        Math.min(
          12,
          Math.round(
            number(source.month, 0)
          )
        )
      ),
      tripType,
      budgetLevel,
      pace,
      requiresHalal:
        source.requiresHalal !== false,
      requiresShattaf:
        source.requiresShattaf === true,
      wantsBeach:
        source.wantsBeach === true,
      wantsNature:
        source.wantsNature !== false,
      wantsShopping:
        source.wantsShopping === true,
      wantsCulture:
        source.wantsCulture !== false,
      wantsLuxury:
        source.wantsLuxury === true,
      includeRestTime:
        source.includeRestTime !== false,
      includeTravelDays:
        source.includeTravelDays !== false,
      maxCities: Math.max(
        1,
        Math.min(
          6,
          Math.round(
            number(
              source.maxCities,
              DEFAULT_OPTIONS.maxCities
            )
          )
        )
      )
    };
  };

  const getUserTravelHistory = () => {
    const store = getStore();
    const snapshot =
      store?.getState?.() || {};

    const trips = Array.isArray(snapshot.trips)
      ? snapshot.trips
      : [];

    const wishlist = Array.isArray(snapshot.wishlist)
      ? snapshot.wishlist
      : [];

    const memories = Array.isArray(snapshot.memories)
      ? snapshot.memories
      : [];

    const completedTrips = trips.filter(
      (trip) =>
        trip.status === "completed" ||
        trip.isMemory === true
    );

    return {
      trips: clone(trips),
      completedTrips: clone(completedTrips),
      wishlist: clone(wishlist),
      memories: clone(memories),
      visitedCountryCodes: unique(
        completedTrips
          .map((trip) =>
            text(
              trip.countryCode ||
              trip.iso2
            ).toUpperCase()
          )
          .filter(Boolean)
      ),
      favoriteTripTypes: unique(
        trips
          .map((trip) =>
            text(trip.tripType)
          )
          .filter(Boolean)
      ),
      averageTripDays: completedTrips.length
        ? Math.round(
            completedTrips.reduce(
              (total, trip) =>
                total +
                Math.max(
                  1,
                  number(
                    trip.durationDays,
                    1
                  )
                ),
              0
            ) /
              completedTrips.length
          )
        : 0,
      averageBudget: completedTrips.length
        ? Math.round(
            completedTrips.reduce(
              (total, trip) =>
                total +
                Math.max(
                  0,
                  number(trip.budget)
                ),
              0
            ) /
              completedTrips.length
          )
        : 0
    };
  };

  const scoreTags = (
    tags,
    preferences
  ) => {
    const normalizedTags = unique(tags)
      .map((tag) =>
        tag.toLowerCase()
      );

    let score = 0;

    const weights =
      TRIP_TYPE_WEIGHTS[
        preferences.tripType
      ] || {};

    Object.entries(weights).forEach(
      ([tag, weight]) => {
        if (
          normalizedTags.some((item) =>
            item.includes(tag)
          )
        ) {
          score += weight;
        }
      }
    );

    if (
      preferences.wantsBeach &&
      normalizedTags.some((tag) =>
        /بحر|شاطئ|beach|island/.test(tag)
      )
    ) {
      score += 25;
    }

    if (
      preferences.wantsNature &&
      normalizedTags.some((tag) =>
        /طبيع|جبال|nature|mountain|lake/.test(tag)
      )
    ) {
      score += 18;
    }

    if (
      preferences.wantsShopping &&
      normalizedTags.some((tag) =>
        /تسوق|shopping|market/.test(tag)
      )
    ) {
      score += 15;
    }

    if (
      preferences.wantsCulture &&
      normalizedTags.some((tag) =>
        /ثقاف|تاريخ|culture|history|museum/.test(tag)
      )
    ) {
      score += 15;
    }

    if (
      preferences.wantsLuxury &&
      normalizedTags.some((tag) =>
        /فاخ|luxury|premium|resort/.test(tag)
      )
    ) {
      score += 20;
    }

    return score;
  };

  const rankCities = (
    profile,
    preferences
  ) => {
    const cities = array(
      profile.bestCities
    );

    if (!cities.length) return [];

    return cities
      .map((city, index) => {
        const tags = [
          ...array(city.tags),
          city.nameAr,
          city.nameEn
        ];

        let score =
          100 - index * 4;

        score += scoreTags(
          tags,
          preferences
        );

        if (
          preferences.city &&
          [
            city.nameAr,
            city.nameEn
          ]
            .map((value) =>
              text(value).toLowerCase()
            )
            .includes(
              preferences.city.toLowerCase()
            )
        ) {
          score += 100;
        }

        return {
          ...clone(city),
          score,
          reasons: buildCityReasons(
            city,
            preferences
          )
        };
      })
      .sort((a, b) =>
        b.score - a.score
      )
      .slice(
        0,
        preferences.maxCities
      );
  };

  const buildCityReasons = (
    city,
    preferences
  ) => {
    const tags = array(city.tags)
      .map((tag) =>
        tag.toLowerCase()
      );

    const reasons = [];

    if (
      preferences.wantsBeach &&
      tags.some((tag) =>
        /بحر|شاطئ|beach/.test(tag)
      )
    ) {
      reasons.push(
        "تتناسب مع رغبتك في البحر والشواطئ."
      );
    }

    if (
      preferences.wantsNature &&
      tags.some((tag) =>
        /طبيع|جبال|nature|mountain/.test(tag)
      )
    ) {
      reasons.push(
        "تقدم طبيعة ومناظر مناسبة لأسلوب رحلتك."
      );
    }

    if (
      preferences.tripType === "family" &&
      tags.some((tag) =>
        /عائل|family/.test(tag)
      )
    ) {
      reasons.push(
        "مناسبة للعائلات والأنشطة الهادئة."
      );
    }

    if (
      preferences.wantsLuxury &&
      tags.some((tag) =>
        /فاخ|luxury|premium/.test(tag)
      )
    ) {
      reasons.push(
        "تضم خيارات إقامة وتجارب راقية."
      );
    }

    if (!reasons.length) {
      reasons.push(
        "من أفضل المدن السياحية في الدولة."
      );
    }

    return reasons;
  };

  const allocateDays = (
    cities,
    totalDays
  ) => {
    if (!cities.length) return [];

    if (cities.length === 1) {
      return [{
        ...cities[0],
        allocatedDays: totalDays
      }];
    }

    const weights =
      cities.map((city) =>
        Math.max(
          1,
          number(city.score, 1)
        )
      );

    const totalWeight =
      weights.reduce(
        (sum, value) =>
          sum + value,
        0
      );

    let remaining = totalDays;

    const allocation =
      cities.map((city, index) => {
        const raw =
          totalDays *
          (weights[index] / totalWeight);

        const allocated =
          Math.max(
            1,
            Math.floor(raw)
          );

        remaining -= allocated;

        return {
          ...city,
          allocatedDays: allocated
        };
      });

    let pointer = 0;

    while (remaining > 0) {
      allocation[
        pointer % allocation.length
      ].allocatedDays += 1;

      remaining -= 1;
      pointer += 1;
    }

    while (remaining < 0) {
      const candidate =
        allocation
          .slice()
          .sort(
            (a, b) =>
              b.allocatedDays -
              a.allocatedDays
          )
          .find(
            (item) =>
              item.allocatedDays > 1
          );

      if (!candidate) break;

      candidate.allocatedDays -= 1;
      remaining += 1;
    }

    return allocation;
  };

  const rankAttractions = (
    profile,
    preferences
  ) =>
    array(profile.attractions)
      .map((item, index) => ({
        ...clone(item),
        score:
          100 -
          index * 2 +
          scoreTags(
            [
              item.category,
              ...array(item.tags)
            ],
            preferences
          )
      }))
      .sort((a, b) =>
        b.score - a.score
      );

  const rankBeaches = (
    profile,
    preferences
  ) => {
    if (!preferences.wantsBeach) {
      return [];
    }

    return array(profile.beaches)
      .map((item, index) => ({
        ...clone(item),
        score:
          100 -
          index * 2 +
          scoreTags(
            item.tags,
            preferences
          )
      }))
      .sort((a, b) =>
        b.score - a.score
      );
  };

  const rankHotelAreas = (
    profile,
    preferences
  ) =>
    array(profile.hotelAreas)
      .map((item, index) => ({
        ...clone(item),
        score:
          100 -
          index * 2 +
          scoreTags(
            item.bestFor,
            preferences
          )
      }))
      .sort((a, b) =>
        b.score - a.score
      );

  const rankHotels = (
    profile,
    preferences
  ) =>
    array(profile.hotels)
      .filter((hotel) => {
        if (
          preferences.requiresShattaf &&
          hotel.shattafConfirmed !== true
        ) {
          return false;
        }

        if (
          preferences.tripType === "family" &&
          hotel.familyFriendly === false
        ) {
          return false;
        }

        return true;
      })
      .map((hotel, index) => {
        let score =
          100 - index * 2;

        if (
          preferences.requiresShattaf &&
          hotel.shattafConfirmed === true
        ) {
          score += 40;
        }

        if (
          preferences.requiresHalal &&
          hotel.halalFriendly === true
        ) {
          score += 25;
        }

        if (
          preferences.tripType === "family" &&
          hotel.familyFriendly === true
        ) {
          score += 20;
        }

        if (
          preferences.wantsBeach &&
          hotel.beachfront === true
        ) {
          score += 25;
        }

        return {
          ...clone(hotel),
          score
        };
      })
      .sort((a, b) =>
        b.score - a.score
      );

  const buildDailyItinerary = (
    cities,
    attractions,
    beaches,
    preferences
  ) => {
    const days = [];
    const dailyLoad =
      PACE_DAILY_LOAD[
        preferences.pace
      ] || 3;

    let attractionIndex = 0;
    let beachIndex = 0;
    let dayNumber = 1;

    cities.forEach((city, cityIndex) => {
      for (
        let cityDay = 1;
        cityDay <= city.allocatedDays;
        cityDay += 1
      ) {
        const items = [];

        if (
          cityDay === 1 &&
          cityIndex > 0
        ) {
          items.push({
            type: "transfer",
            title:
              `الانتقال إلى ${city.nameAr}`,
            period: "صباحاً",
            priority: "high"
          });
        }

        while (
          items.length < dailyLoad &&
          attractionIndex <
            attractions.length
        ) {
          const attraction =
            attractions[
              attractionIndex
            ];

          attractionIndex += 1;

          if (
            attraction.cityAr &&
            city.nameAr &&
            attraction.cityAr !==
              city.nameAr
          ) {
            continue;
          }

          items.push({
            type: "attraction",
            title:
              attraction.nameAr ||
              attraction.titleAr ||
              "مكان سياحي",
            period:
              items.length === 0
                ? "صباحاً"
                : items.length === 1
                  ? "بعد الظهر"
                  : "مساءً",
            category:
              attraction.category || "",
            priority: "normal"
          });
        }

        if (
          preferences.wantsBeach &&
          beachIndex <
            beaches.length &&
          items.length < dailyLoad
        ) {
          const beach =
            beaches[beachIndex];

          beachIndex += 1;

          items.push({
            type: "beach",
            title:
              beach.nameAr ||
              "شاطئ مقترح",
            period: "بعد الظهر",
            category: "بحر",
            priority: "normal"
          });
        }

        if (
          preferences.includeRestTime &&
          items.length < dailyLoad
        ) {
          items.push({
            type: "rest",
            title:
              "وقت راحة واستكشاف حر",
            period: "مساءً",
            priority: "optional"
          });
        }

        days.push({
          day: dayNumber,
          city:
            city.nameAr ||
            city.nameEn ||
            "",
          title:
            `اليوم ${dayNumber} في ${
              city.nameAr ||
              city.nameEn ||
              "الوجهة"
            }`,
          items
        });

        dayNumber += 1;
      }
    });

    return days.slice(
      0,
      preferences.days
    );
  };

  const estimateBudget = (
    profile,
    preferences
  ) => {
    const level =
      BUDGET_LEVELS[
        preferences.budgetLevel
      ] ||
      BUDGET_LEVELS.balanced;

    const baseDailyPerPerson = 500;
    const dailyPerPerson =
      Math.round(
        baseDailyPerPerson *
        level.dailyFactor
      );

    const totalDaily =
      dailyPerPerson *
      preferences.travelers;

    const total =
      totalDaily *
      preferences.days;

    return {
      currency: "AED",
      level:
        preferences.budgetLevel,
      levelLabelAr:
        level.labelAr,
      dailyPerPerson,
      estimatedDailyTotal:
        totalDaily,
      estimatedTripTotal:
        total,
      breakdown: {
        accommodation:
          Math.round(total * 0.45),
        food:
          Math.round(total * 0.2),
        transport:
          Math.round(total * 0.12),
        activities:
          Math.round(total * 0.13),
        contingency:
          Math.round(total * 0.1)
      },
      noteAr:
        "التقدير إرشادي ويجب تحديثه لاحقاً وفق أسعار الحجز الفعلية."
    };
  };

  const buildHotelGuidance = (
    profile,
    preferences,
    hotels,
    hotelAreas
  ) => ({
    requirements: {
      shattaf: preferences.requiresShattaf,
      halal: preferences.requiresHalal,
      family:
        preferences.tripType === "family",
      beachfront:
        preferences.wantsBeach
    },
    shattafAdvice:
      text(
        profile.hotelRequirements
          ?.shattaf
      ) ||
      "يجب تأكيد توفر الشطاف مباشرة مع الفندق قبل الدفع.",
    familyRoomAdvice:
      text(
        profile.hotelRequirements
          ?.familyRooms
      ) ||
      "تحقق من الغرف العائلية والغرف المتصلة وسياسة الأطفال.",
    halalAdvice:
      text(
        profile.hotelRequirements
          ?.halalFood
      ) ||
      "تحقق من توفر الطعام الحلال داخل الفندق أو بالقرب منه.",
    rankedHotels:
      hotels.slice(0, 12),
    recommendedAreas:
      hotelAreas.slice(0, 8),
    verificationChecklist: [
      "التأكد من وجود شطاف داخل الحمام كتابةً من الفندق.",
      "مراجعة صور الحمام الحديثة وليس صور الغرفة فقط.",
      "التأكد من مساحة الغرفة وعدد الأسرّة.",
      "مراجعة سياسة الأطفال والإفطار.",
      "التأكد من موقع الفندق بالنسبة للأنشطة.",
      "مراجعة سياسة الإلغاء والدفع.",
      "التأكد من الطعام الحلال عند الحاجة."
    ]
  });

  const buildSeasonAdvice = (
    profile,
    preferences
  ) => {
    const bestMonths = array(
      profile.seasons?.bestMonths
    );

    const avoidMonths = array(
      profile.seasons?.avoidMonths
    );

    const selectedMonth =
      preferences.month;

    let suitability = "unknown";
    let message =
      text(
        profile.seasons?.notesAr
      ) ||
      "تحقق من الطقس والموسم قبل تثبيت الحجوزات.";

    if (
      selectedMonth &&
      bestMonths.includes(
        selectedMonth
      )
    ) {
      suitability = "excellent";
      message =
        `${MONTH_NAMES_AR[selectedMonth]} من الأشهر المناسبة عادةً للزيارة.`;
    } else if (
      selectedMonth &&
      avoidMonths.includes(
        selectedMonth
      )
    ) {
      suitability = "caution";
      message =
        `${MONTH_NAMES_AR[selectedMonth]} قد لا يكون من أفضل الأشهر، راجع الطقس والظروف الموسمية.`;
    } else if (selectedMonth) {
      suitability = "moderate";
      message =
        `يمكن زيارة الوجهة في ${MONTH_NAMES_AR[selectedMonth]} مع مراجعة الطقس قبل السفر.`;
    }

    return {
      month:
        selectedMonth,
      monthNameAr:
        MONTH_NAMES_AR[selectedMonth] ||
        "",
      suitability,
      bestMonths,
      avoidMonths,
      message
    };
  };

  const buildPackingList = (
    profile,
    preferences
  ) => {
    const packing = [
      "جواز السفر والوثائق",
      "التأمين وحجوزات الطيران والفندق",
      "وسيلة دفع احتياطية",
      "شاحن ومحول كهرباء",
      "أدوية شخصية",
      "ملابس مناسبة للموسم"
    ];

    if (
      preferences.wantsBeach
    ) {
      packing.push(
        "ملابس سباحة",
        "واقي شمس",
        "حذاء مناسب للشاطئ"
      );
    }

    if (
      preferences.wantsNature
    ) {
      packing.push(
        "حذاء مريح للمشي",
        "ملابس طبقات",
        "حقيبة يومية خفيفة"
      );
    }

    if (
      preferences.tripType === "family"
    ) {
      packing.push(
        "احتياجات الأطفال",
        "وجبات خفيفة",
        "نسخ من وثائق جميع المسافرين"
      );
    }

    return unique([
      ...packing,
      ...array(
        profile.packingHints
      )
    ]);
  };

  const buildPersonalization = (
    profile,
    preferences,
    history
  ) => {
    const reasons = [];

    if (
      history.averageTripDays > 0
    ) {
      reasons.push(
        `متوسط رحلاتك السابقة ${history.averageTripDays} أيام، وتمت مقارنة المدة الجديدة بهذا النمط.`
      );
    }

    if (
      history.favoriteTripTypes.includes(
        preferences.tripType
      )
    ) {
      reasons.push(
        "نوع الرحلة المختار يتكرر في سجل رحلاتك."
      );
    }

    if (
      preferences.requiresShattaf
    ) {
      reasons.push(
        "تم تفعيل أولوية الفنادق التي تم تأكيد وجود الشطاف فيها."
      );
    }

    if (
      preferences.requiresHalal
    ) {
      reasons.push(
        "تم إعطاء أولوية للطعام الحلال والمناطق المناسبة."
      );
    }

    if (
      preferences.wantsBeach
    ) {
      reasons.push(
        "تم رفع ترتيب المدن والشواطئ والمنتجعات البحرية."
      );
    }

    if (!reasons.length) {
      reasons.push(
        "تم بناء الدليل من تفضيلات الرحلة المحددة."
      );
    }

    return {
      reasons,
      historySummary: history
    };
  };

  const buildIntelligenceNotes = (
    profile,
    preferences,
    cities,
    beaches,
    hotels
  ) => {
    const notes = [];

    if (
      preferences.requiresShattaf &&
      hotels.length === 0
    ) {
      notes.push({
        type: "warning",
        title:
          "لا توجد فنادق مؤكدة بالشطاف في البيانات الحالية",
        message:
          "استخدم مناطق السكن المقترحة وتواصل مع الفندق مباشرة قبل الدفع."
      });
    }

    if (
      preferences.wantsBeach &&
      beaches.length === 0
    ) {
      notes.push({
        type: "info",
        title:
          "الوجهة ليست بحرية في البيانات الحالية",
        message:
          "تم التركيز على المدن والطبيعة والأنشطة البديلة."
      });
    }

    if (
      cities.length === 0
    ) {
      notes.push({
        type: "warning",
        title:
          "تفاصيل المدن تحتاج إثراء",
        message:
          "يمكن إنشاء دليل أساسي للدولة، لكن يجب إضافة بيانات المدن التفصيلية لاحقاً."
      });
    }

    if (
      profile.researchStatus ===
      "pending"
    ) {
      notes.push({
        type: "warning",
        title:
          "الدليل الأساسي غير موثّق بالكامل",
        message:
          "تحقق من التأشيرة، الطقس، الأمان والأسعار من المصادر الرسمية قبل الحجز."
      });
    }

    notes.push({
      type: "security",
      title:
        "المعلومات المتغيرة",
      message:
        "متطلبات الدخول والأسعار والطقس والمعلومات التشغيلية يجب التحقق منها عند التخطيط الفعلي."
    });

    return notes;
  };

  const buildGuide = (
    countryCode,
    inputPreferences = {}
  ) => {
    const countries =
      getCountries();

    const knowledge =
      getKnowledge();

    if (!countries || !knowledge) {
      throw new Error(
        "TIC Guide AI Planner: required data engines are unavailable."
      );
    }

    const preferences =
      normalizePreferences({
        ...inputPreferences,
        countryCode
      });

    if (!preferences.countryCode) {
      throw new Error(
        "TIC Guide AI Planner: country code is required."
      );
    }

    const country =
      countries.getByCode(
        preferences.countryCode
      );

    if (!country) {
      throw new Error(
        `TIC Guide AI Planner: unknown country "${preferences.countryCode}".`
      );
    }

    const context =
      knowledge.buildGuideContext(
        country.iso2,
        preferences
      );

    if (!context) {
      throw new Error(
        "TIC Guide AI Planner: country knowledge is unavailable."
      );
    }

    const profile =
      context.country;

    const history =
      getUserTravelHistory();

    const rankedCities =
      rankCities(
        profile,
        preferences
      );

    const allocatedCities =
      allocateDays(
        rankedCities,
        preferences.days
      );

    const attractions =
      rankAttractions(
        profile,
        preferences
      );

    const beaches =
      rankBeaches(
        profile,
        preferences
      );

    const hotelAreas =
      rankHotelAreas(
        profile,
        preferences
      );

    const hotels =
      rankHotels(
        profile,
        preferences
      );

    const itinerary =
      buildDailyItinerary(
        allocatedCities,
        attractions,
        beaches,
        preferences
      );

    const budget =
      estimateBudget(
        profile,
        preferences
      );

    const guide = {
      id: createId("smart_guide"),
      version: MODULE_VERSION,
      createdAt: nowISO(),
      updatedAt: nowISO(),

      country: {
        code: country.iso2,
        iso3: country.iso3,
        nameAr: country.nameAr,
        nameEn: country.nameEn,
        flag: country.flag,
        continent: country.continent,
        continentAr:
          country.continentAr,
        currency:
          profile.currency ||
          country.currency,
        languages:
          array(profile.languages)
      },

      preferences,
      summary:
        text(profile.summaryAr) ||
        `دليل سياحي مخصص لـ ${country.nameAr}.`,

      season:
        buildSeasonAdvice(
          profile,
          preferences
        ),

      cities:
        allocatedCities,

      attractions:
        attractions.slice(0, 30),

      beaches:
        beaches.slice(0, 20),

      hotelGuidance:
        buildHotelGuidance(
          profile,
          preferences,
          hotels,
          hotelAreas
        ),

      itinerary,

      budget,

      entry:
        clone(profile.entry),

      transport:
        clone(profile.transport),

      safety:
        clone(profile.safety),

      money:
        clone(profile.money),

      connectivity:
        clone(profile.connectivity),

      food:
        clone(profile.food),

      shopping:
        clone(profile.shopping),

      culturalTips:
        unique(
          profile.culturalTips
        ),

      packing:
        buildPackingList(
          profile,
          preferences
        ),

      personalization:
        buildPersonalization(
          profile,
          preferences,
          history
        ),

      intelligenceNotes:
        buildIntelligenceNotes(
          profile,
          preferences,
          allocatedCities,
          beaches,
          hotels
        ),

      sourceState: {
        guideStatus:
          profile.guideStatus,
        researchStatus:
          profile.researchStatus,
        sourceUpdatedAt:
          profile.sourceUpdatedAt,
        verifiedAt:
          profile.verifiedAt
      },

      savePayload: {
        countryCode: country.iso2,
        title:
          `دليل ${country.nameAr}`,
        preferences:
          clone(preferences),
        generatedAt:
          nowISO()
      }
    };

    guide.completeness =
      calculateCompleteness(
        guide
      );

    guide.recommendationSummary =
      buildRecommendationSummary(
        guide
      );

    return guide;
  };

  const calculateCompleteness = (
    guide
  ) => {
    const checks = [
      Boolean(guide.summary),
      guide.cities.length > 0,
      guide.attractions.length > 0,
      Boolean(
        guide.hotelGuidance
      ),
      Boolean(guide.entry),
      Boolean(guide.transport),
      Boolean(guide.safety),
      Boolean(guide.money),
      Boolean(guide.food),
      guide.packing.length > 0,
      guide.itinerary.length > 0
    ];

    return Math.round(
      checks.filter(Boolean).length /
        checks.length *
        100
    );
  };

  const buildRecommendationSummary = (
    guide
  ) => {
    const cityNames =
      guide.cities
        .slice(0, 3)
        .map((city) =>
          city.nameAr
        )
        .filter(Boolean);

    const parts = [
      `المدة المقترحة: ${guide.preferences.days} أيام`,
      cityNames.length
        ? `المدن الأنسب: ${cityNames.join("، ")}`
        : "",
      `الميزانية: ${guide.budget.levelLabelAr}`,
      guide.preferences.requiresShattaf
        ? "أولوية لفنادق الشطاف المؤكد"
        : "",
      guide.preferences.requiresHalal
        ? "مراعاة الطعام الحلال"
        : ""
    ].filter(Boolean);

    return parts.join(" • ");
  };

  const generateForSelectedCountry = (
    preferences = {}
  ) =>
    buildGuide(
      preferences.countryCode,
      preferences
    );

  const suggestDestinations = (
    limit = 8
  ) => {
    const engine =
      getRecommendationEngine();

    return engine?.recommend?.(
      limit
    ) || [];
  };

  const saveGuide = (
    guide,
    options = {}
  ) => {
    if (!isObject(guide)) {
      throw new TypeError(
        "TIC Guide AI Planner: guide must be an object."
      );
    }

    const store =
      getStore();

    if (!store) {
      throw new Error(
        "TIC Guide AI Planner: store is unavailable."
      );
    }

    const savedGuide = {
      ...clone(guide),
      id:
        guide.id ||
        createId("saved_guide"),
      savedAt: nowISO(),
      linkedTripId:
        text(options.tripId)
    };

    const existing =
      store.get?.("guides.savedGuides", []);

    const savedGuides =
      Array.isArray(existing)
        ? clone(existing)
        : [];

    const index =
      savedGuides.findIndex(
        (item) =>
          String(item.id) ===
          String(savedGuide.id)
      );

    if (index >= 0) {
      savedGuides[index] =
        savedGuide;
    } else {
      savedGuides.unshift(
        savedGuide
      );
    }

    store.set(
      "guides.savedGuides",
      savedGuides,
      {
        immediate: true
      }
    );

    if (savedGuide.linkedTripId) {
      const trip =
        store.getTripById?.(
          savedGuide.linkedTripId
        );

      if (trip) {
        const linkedGuideIds =
          unique([
            ...array(
              trip.linkedGuideIds
            ),
            savedGuide.id
          ]);

        store.updateTrip?.(
          trip.id,
          {
            linkedGuideIds,
            travelGuideId:
              savedGuide.id,
            travelGuideSummary:
              savedGuide.recommendationSummary
          }
        );
      }
    }

    return clone(savedGuide);
  };

  const getSavedGuides = () => {
    const store =
      getStore();

    const guides =
      store?.get?.(
        "guides.savedGuides",
        []
      );

    return Array.isArray(guides)
      ? clone(guides)
      : [];
  };

  const deleteSavedGuide = (
    guideId
  ) => {
    const store =
      getStore();

    if (!store) return false;

    const next =
      getSavedGuides().filter(
        (guide) =>
          String(guide.id) !==
          String(guideId)
      );

    store.set(
      "guides.savedGuides",
      next,
      {
        immediate: true
      }
    );

    return true;
  };

  const Planner = {
    id: MODULE_ID,
    version: MODULE_VERSION,

    generate: buildGuide,
    generateForSelectedCountry,
    suggestDestinations,
    saveGuide,
    getSavedGuides,
    deleteSavedGuide,
    normalizePreferences,

    getCountryOptions() {
      return getGuideSearch()
        ?.all?.() || [];
    },

    getCountryByCode(code) {
      return getCountries()
        ?.getByCode?.(code) ||
        null;
    },

    diagnostics() {
      return {
        id: MODULE_ID,
        version: MODULE_VERSION,
        countriesAvailable:
          getCountries()?.count?.() || 0,
        knowledgeAvailable:
          getKnowledge()?.count?.() || 0,
        recommendationEngineAvailable:
          Boolean(
            getRecommendationEngine()
          ),
        guideSearchAvailable:
          Boolean(getGuideSearch()),
        storeAvailable:
          Boolean(getStore()),
        savedGuideCount:
          getSavedGuides().length
      };
    }
  };

  window.TIC = window.TIC || {};
  window.TIC.Features =
    window.TIC.Features || {};
  window.TIC.Features.GuideAIPlanner =
    Planner;
  window.TICGuideAIPlanner =
    Planner;

  window.dispatchEvent(
    new CustomEvent(
      "tic:feature:guide-ai-planner-ready",
      {
        detail:
          Planner.diagnostics()
      }
    )
  );
})(window);
