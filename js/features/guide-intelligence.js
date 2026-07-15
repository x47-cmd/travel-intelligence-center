/* =========================================================
   Travel Intelligence Center
   Guide Intelligence Platform V1.0.0

   File Path:
   js/features/guide-intelligence.js

   Purpose:
   - Central orchestration layer for the Guide Intelligence Platform.
   - Combines country catalog, travel knowledge, search, recommendation,
     AI planning, Travel DNA and annual travel planning.
   - Provides a single stable API for js/pages/guide.js.
   - Normalizes country profiles into a complete guide experience.
   - Supports intelligent recommendations, filters, comparisons,
     planning, caching, persistence, diagnostics and future expansion.
   - Keeps page rendering independent from intelligence engines.

   Dependencies:
   - js/config.js
   - js/store.js
   - js/router.js
   - js/ui.js
   - js/data/countries-catalog.js
   - js/data/travel-knowledge.js
   - js/features/destination-recommendation-engine.js
   - js/features/guide-search-engine.js
   - js/features/guide-ai-planner.js
   - js/features/travel-dna.js
   - js/features/travel-year-planner.js

   Global APIs:
   - window.TIC.Features.GuideIntelligence
   - window.TICGuideIntelligence
========================================================= */

(function (window) {
  "use strict";

  const MODULE_ID = "guide-intelligence";
  const MODULE_VERSION = "1.0.0";
  const STORE_PATH = "guides.intelligence";
  const CACHE_TTL_MS = 1000 * 60 * 20;

  const DEFAULT_FILTERS = Object.freeze({
    query: "",
    region: "",
    continent: "",
    climate: "",
    visa: "",
    halal: null,
    shattaf: null,
    beach: null,
    nature: null,
    family: null,
    couples: null,
    children: null,
    shopping: null,
    budgetLevel: "",
    maxBudget: null,
    month: null,
    durationDays: null,
    sortBy: "recommended",
    sortDirection: "desc",
    limit: 50
  });

  const SECTION_KEYS = Object.freeze([
    "overview",
    "cities",
    "hotels",
    "shattafHotels",
    "resorts",
    "beaches",
    "attractions",
    "activities",
    "halalRestaurants",
    "cafes",
    "transportation",
    "carRental",
    "visa",
    "currency",
    "language",
    "electricity",
    "internet",
    "weather",
    "bestMonths",
    "worstMonths",
    "budget",
    "idealDuration",
    "flightBooking",
    "hotelBooking",
    "tips",
    "warnings",
    "packing",
    "family",
    "couples",
    "children",
    "nature",
    "sea",
    "shopping"
  ]);

  const cache = new Map();

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
          .map((item) =>
            typeof item === "string"
              ? text(item)
              : JSON.stringify(item)
          )
          .filter(Boolean)
      )
    ).map((item) => {
      try {
        return JSON.parse(item);
      } catch (error) {
        return item;
      }
    });

  const nowISO = () =>
    new Date().toISOString();

  const createId = (prefix = "guide_intelligence") =>
    `${prefix}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;

  const normalizeCode = (value) =>
    text(value).toUpperCase();

  const normalizeBoolean = (value) => {
    if (value === true || value === false) return value;
    if (value === "true") return true;
    if (value === "false") return false;
    return null;
  };

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

  const getCountriesCatalog = () =>
    window.TIC?.Data?.Countries ||
    window.TICCountriesCatalog ||
    null;

  const getTravelKnowledge = () =>
    window.TIC?.Data?.TravelKnowledge ||
    window.TICTravelKnowledge ||
    null;

  const getRecommendationEngine = () =>
    window.TIC?.Features?.DestinationRecommendation ||
    window.TICDestinationRecommendation ||
    null;

  const getSearchEngine = () =>
    window.TIC?.Features?.GuideSearch ||
    window.TICGuideSearch ||
    null;

  const getAIPlanner = () =>
    window.TIC?.Features?.GuideAIPlanner ||
    window.TICGuideAIPlanner ||
    null;

  const getTravelDNA = () =>
    window.TIC?.Features?.TravelDNA ||
    window.TICTravelDNA ||
    null;

  const getYearPlanner = () =>
    window.TIC?.Features?.TravelYearPlanner ||
    window.TICTravelYearPlanner ||
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
      guides: clone(store.get?.("guides", {})) || {},
      budgets: clone(store.get?.("budgets", {})) || {},
      settings: clone(store.get?.("settings", {})) || {}
    };
  };

  const getCountryByCode = (countryCode) => {
    const catalog = getCountriesCatalog();
    const code = normalizeCode(countryCode);

    if (!catalog || !code) return null;

    try {
      return clone(
        catalog.getByCode?.(code) ||
        catalog.get?.(code) ||
        catalog.find?.(code) ||
        catalog.findByCode?.(code) ||
        null
      );
    } catch (error) {
      console.error("Guide Intelligence country lookup error:", error);
      return null;
    }
  };

  const getAllCountries = () => {
    const catalog = getCountriesCatalog();

    if (!catalog) return [];

    try {
      const result =
        catalog.getAll?.() ||
        catalog.list?.() ||
        catalog.countries ||
        catalog.items ||
        [];

      return array(result);
    } catch (error) {
      console.error("Guide Intelligence catalog error:", error);
      return [];
    }
  };

  const getKnowledgeProfile = (countryCode) => {
    const knowledge = getTravelKnowledge();
    const code = normalizeCode(countryCode);

    if (!knowledge || !code) return null;

    try {
      return clone(
        knowledge.getCountryProfile?.(code) ||
        knowledge.getByCountryCode?.(code) ||
        knowledge.get?.(code) ||
        knowledge.find?.(code) ||
        null
      );
    } catch (error) {
      console.error("Guide Intelligence knowledge lookup error:", error);
      return null;
    }
  };

  const normalizeFilters = (input = {}) => {
    const source = isObject(input) ? input : {};

    return {
      ...DEFAULT_FILTERS,
      ...clone(source),
      query: text(source.query),
      region: text(source.region),
      continent: text(source.continent),
      climate: text(source.climate),
      visa: text(source.visa),
      halal: normalizeBoolean(source.halal),
      shattaf: normalizeBoolean(source.shattaf),
      beach: normalizeBoolean(source.beach),
      nature: normalizeBoolean(source.nature),
      family: normalizeBoolean(source.family),
      couples: normalizeBoolean(source.couples),
      children: normalizeBoolean(source.children),
      shopping: normalizeBoolean(source.shopping),
      budgetLevel: text(source.budgetLevel),
      maxBudget:
        source.maxBudget === null ||
        source.maxBudget === undefined ||
        source.maxBudget === ""
          ? null
          : Math.max(0, number(source.maxBudget)),
      month:
        source.month === null ||
        source.month === undefined ||
        source.month === ""
          ? null
          : Math.min(12, Math.max(1, Math.round(number(source.month)))),
      durationDays:
        source.durationDays === null ||
        source.durationDays === undefined ||
        source.durationDays === ""
          ? null
          : Math.max(1, Math.round(number(source.durationDays))),
      sortBy: text(source.sortBy || "recommended"),
      sortDirection:
        text(source.sortDirection).toLowerCase() === "asc"
          ? "asc"
          : "desc",
      limit: Math.min(
        250,
        Math.max(1, Math.round(number(source.limit, 50)))
      )
    };
  };

  const cacheKey = (...parts) =>
    parts
      .map((part) =>
        typeof part === "string"
          ? part
          : JSON.stringify(part)
      )
      .join("::");

  const readCache = (key) => {
    const item = cache.get(key);

    if (!item) return null;

    if (Date.now() - item.createdAt > CACHE_TTL_MS) {
      cache.delete(key);
      return null;
    }

    return clone(item.value);
  };

  const writeCache = (key, value) => {
    cache.set(key, {
      createdAt: Date.now(),
      value: clone(value)
    });

    return clone(value);
  };

  const clearCache = (prefix = "") => {
    if (!prefix) {
      cache.clear();
      return true;
    }

    Array.from(cache.keys())
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => cache.delete(key));

    return true;
  };

  const getTravelDNAProfile = (options = {}) => {
    const engine = getTravelDNA();

    if (!engine) return null;

    try {
      return clone(
        engine.build?.({
          persist: options.persist === true
        }) ||
        engine.analyze?.({
          persist: options.persist === true
        }) ||
        engine.getProfile?.() ||
        engine.getSnapshot?.() ||
        null
      );
    } catch (error) {
      console.error("Guide Intelligence Travel DNA error:", error);
      return null;
    }
  };

  const normalizeEntityList = (value) =>
    array(value)
      .map((item, index) => {
        if (typeof item === "string") {
          return {
            id: `item_${index + 1}`,
            nameAr: text(item),
            nameEn: "",
            description: "",
            tags: []
          };
        }

        if (!isObject(item)) return null;

        return {
          id:
            text(item.id) ||
            text(item.slug) ||
            `item_${index + 1}`,
          nameAr:
            text(
              item.nameAr ||
              item.arabicName ||
              item.name ||
              item.titleAr ||
              item.title
            ),
          nameEn:
            text(
              item.nameEn ||
              item.englishName ||
              item.titleEn
            ),
          description:
            text(
              item.description ||
              item.summary ||
              item.note
            ),
          city:
            text(
              item.city ||
              item.cityName ||
              item.location
            ),
          category:
            text(
              item.category ||
              item.type
            ),
          rating: number(item.rating, 0),
          priceLevel:
            text(
              item.priceLevel ||
              item.budgetLevel
            ),
          halal:
            item.halal === true ||
            item.isHalal === true,
          shattaf:
            item.shattaf === true ||
            item.hasShattaf === true ||
            item.bidets === true,
          family:
            item.family === true ||
            item.familyFriendly === true,
          children:
            item.children === true ||
            item.kidsFriendly === true,
          couples:
            item.couples === true ||
            item.romantic === true,
          beach:
            item.beach === true ||
            item.sea === true,
          nature:
            item.nature === true,
          shopping:
            item.shopping === true,
          website: text(item.website),
          image: text(item.image || item.imageUrl),
          tags: unique(array(item.tags)),
          raw: clone(item)
        };
      })
      .filter(Boolean);

  const normalizeMonthList = (value) =>
    unique(
      array(value)
        .map((item) => {
          if (typeof item === "number") {
            return Math.min(12, Math.max(1, Math.round(item)));
          }

          if (isObject(item)) {
            return Math.min(
              12,
              Math.max(
                1,
                Math.round(
                  number(
                    item.month ||
                    item.number ||
                    item.value
                  )
                )
              )
            );
          }

          const parsed = number(item, NaN);
          return Number.isFinite(parsed)
            ? Math.min(12, Math.max(1, Math.round(parsed)))
            : null;
        })
        .filter(Boolean)
    );

  const normalizeTextList = (value) =>
    unique(
      array(value)
        .map((item) =>
          typeof item === "string"
            ? text(item)
            : text(
                item?.text ||
                item?.title ||
                item?.name ||
                item?.description
              )
        )
        .filter(Boolean)
    );

  const deriveGuideSections = (country, profile) => {
    const source = {
      ...clone(country || {}),
      ...clone(profile || {})
    };

    const hotels = normalizeEntityList(
      source.hotels ||
      source.bestHotels ||
      source.accommodation?.hotels
    );

    const shattafHotels = normalizeEntityList(
      source.shattafHotels ||
      source.hotelsWithShattaf ||
      source.accommodation?.shattafHotels ||
      hotels.filter((hotel) => hotel.shattaf)
    );

    return {
      overview: {
        titleAr:
          text(
            source.nameAr ||
            source.arabicName ||
            country?.nameAr
          ),
        titleEn:
          text(
            source.nameEn ||
            source.englishName ||
            country?.nameEn
          ),
        summary:
          text(
            source.overview ||
            source.summary ||
            source.description ||
            source.about
          ),
        flag:
          text(
            source.flag ||
            source.emoji ||
            country?.flag
          ),
        capital:
          text(
            source.capitalAr ||
            source.capital ||
            source.capitalCity
          ),
        region:
          text(
            source.region ||
            source.continent
          ),
        safety:
          text(
            source.safety ||
            source.safetyLevel
          ),
        travelStyle:
          normalizeTextList(
            source.travelStyle ||
            source.travelStyles ||
            source.tags
          )
      },
      cities: normalizeEntityList(
        source.cities ||
        source.bestCities ||
        source.destinations?.cities
      ),
      hotels,
      shattafHotels,
      resorts: normalizeEntityList(
        source.resorts ||
        source.bestResorts ||
        source.accommodation?.resorts
      ),
      beaches: normalizeEntityList(
        source.beaches ||
        source.bestBeaches ||
        source.destinations?.beaches
      ),
      attractions: normalizeEntityList(
        source.attractions ||
        source.touristAttractions ||
        source.places ||
        source.destinations?.attractions
      ),
      activities: normalizeEntityList(
        source.activities ||
        source.bestActivities ||
        source.experiences
      ),
      halalRestaurants: normalizeEntityList(
        source.halalRestaurants ||
        source.restaurants?.halal ||
        source.restaurants
      ).filter(
        (item) =>
          item.halal ||
          source.halalRestaurants ||
          source.restaurants?.halal
      ),
      cafes: normalizeEntityList(
        source.cafes ||
        source.bestCafes
      ),
      transportation: {
        overview:
          text(
            source.transportation?.overview ||
            source.transportOverview ||
            source.transportation
          ),
        methods: normalizeEntityList(
          source.transportation?.methods ||
          source.transportMethods ||
          source.publicTransport
        ),
        cards: normalizeTextList(
          source.transportation?.cards ||
          source.transportCards
        ),
        apps: normalizeTextList(
          source.transportation?.apps ||
          source.transportApps
        ),
        tips: normalizeTextList(
          source.transportation?.tips ||
          source.transportTips
        )
      },
      carRental: {
        available:
          source.carRental?.available !== false &&
          source.carRentalAvailable !== false,
        requirements: normalizeTextList(
          source.carRental?.requirements ||
          source.carRentalRequirements
        ),
        companies: normalizeEntityList(
          source.carRental?.companies ||
          source.carRentalCompanies
        ),
        tips: normalizeTextList(
          source.carRental?.tips ||
          source.drivingTips
        )
      },
      visa: {
        required:
          source.visa?.required ??
          source.visaRequired ??
          null,
        type:
          text(
            source.visa?.type ||
            source.visaType
          ),
        duration:
          text(
            source.visa?.duration ||
            source.visaDuration
          ),
        process:
          normalizeTextList(
            source.visa?.process ||
            source.visaSteps
          ),
        notes:
          normalizeTextList(
            source.visa?.notes ||
            source.visaNotes
          )
      },
      currency: {
        name:
          text(
            source.currency?.name ||
            source.currencyName ||
            source.currency
          ),
        code:
          text(
            source.currency?.code ||
            source.currencyCode
          ).toUpperCase(),
        symbol:
          text(
            source.currency?.symbol ||
            source.currencySymbol
          ),
        cashTips:
          normalizeTextList(
            source.currency?.tips ||
            source.moneyTips
          )
      },
      language: {
        primary:
          text(
            source.language?.primary ||
            source.primaryLanguage ||
            source.language
          ),
        common:
          normalizeTextList(
            source.language?.common ||
            source.languages
          ),
        englishLevel:
          text(
            source.language?.englishLevel ||
            source.englishLevel
          ),
        usefulPhrases:
          normalizeEntityList(
            source.language?.usefulPhrases ||
            source.usefulPhrases
          )
      },
      electricity: {
        voltage:
          text(
            source.electricity?.voltage ||
            source.voltage
          ),
        frequency:
          text(
            source.electricity?.frequency ||
            source.frequency
          ),
        plugTypes:
          normalizeTextList(
            source.electricity?.plugTypes ||
            source.plugTypes
          ),
        adapterNeeded:
          source.electricity?.adapterNeeded ??
          source.adapterNeeded ??
          null
      },
      internet: {
        quality:
          text(
            source.internet?.quality ||
            source.internetQuality
          ),
        esim:
          source.internet?.esim ??
          source.esimAvailable ??
          null,
        providers:
          normalizeTextList(
            source.internet?.providers ||
            source.mobileProviders
          ),
        tips:
          normalizeTextList(
            source.internet?.tips ||
            source.internetTips
          )
      },
      weather: {
        overview:
          text(
            source.weather?.overview ||
            source.weatherOverview ||
            source.climate
          ),
        climate:
          text(
            source.weather?.climate ||
            source.climate
          ),
        monthly:
          clone(
            source.weather?.monthly ||
            source.monthlyWeather ||
            {}
          )
      },
      bestMonths: normalizeMonthList(
        source.bestMonths ||
        source.bestMonthsToVisit ||
        source.weather?.bestMonths
      ),
      worstMonths: normalizeMonthList(
        source.worstMonths ||
        source.worstMonthsToVisit ||
        source.weather?.worstMonths
      ),
      budget: {
        currency:
          text(
            source.budget?.currency ||
            source.currencyCode ||
            source.currency?.code
          ).toUpperCase(),
        dailyBudget:
          clone(
            source.budget?.daily ||
            source.dailyBudget ||
            {}
          ),
        tripBudget:
          clone(
            source.budget?.trip ||
            source.recommendedBudget ||
            {}
          ),
        notes:
          normalizeTextList(
            source.budget?.notes ||
            source.budgetTips
          )
      },
      idealDuration: {
        minimumDays:
          number(
            source.idealDuration?.minimumDays ||
            source.minimumDays,
            0
          ),
        recommendedDays:
          number(
            source.idealDuration?.recommendedDays ||
            source.idealDurationDays ||
            source.recommendedDays,
            0
          ),
        maximumDays:
          number(
            source.idealDuration?.maximumDays ||
            source.maximumDays,
            0
          ),
        note:
          text(
            source.idealDuration?.note ||
            source.durationNote
          )
      },
      flightBooking: {
        bestLeadDays:
          number(
            source.flightBooking?.bestLeadDays ||
            source.bestFlightBookingLeadDays,
            90
          ),
        bestWindow:
          text(
            source.flightBooking?.bestWindow ||
            source.bestFlightBookingTime
          ),
        tips:
          normalizeTextList(
            source.flightBooking?.tips ||
            source.flightBookingTips
          )
      },
      hotelBooking: {
        bestLeadDays:
          number(
            source.hotelBooking?.bestLeadDays ||
            source.bestHotelBookingLeadDays,
            60
          ),
        bestWindow:
          text(
            source.hotelBooking?.bestWindow ||
            source.bestHotelBookingTime
          ),
        tips:
          normalizeTextList(
            source.hotelBooking?.tips ||
            source.hotelBookingTips
          )
      },
      tips: normalizeTextList(
        source.tips ||
        source.travelTips ||
        source.importantTips
      ),
      warnings: normalizeTextList(
        source.warnings ||
        source.travelWarnings ||
        source.alerts
      ),
      packing: normalizeTextList(
        source.packing ||
        source.packingList ||
        source.essentials
      ),
      family: normalizeEntityList(
        source.family ||
        source.familyPlaces ||
        source.suitableForFamilies
      ),
      couples: normalizeEntityList(
        source.couples ||
        source.couplePlaces ||
        source.romanticPlaces
      ),
      children: normalizeEntityList(
        source.children ||
        source.kids ||
        source.suitableForChildren
      ),
      nature: normalizeEntityList(
        source.nature ||
        source.naturePlaces ||
        source.naturalAttractions
      ),
      sea: normalizeEntityList(
        source.sea ||
        source.seaPlaces ||
        source.beaches
      ),
      shopping: normalizeEntityList(
        source.shopping ||
        source.shoppingPlaces ||
        source.malls
      )
    };
  };

  const buildCountryGuide = (
    countryCode,
    options = {}
  ) => {
    const code = normalizeCode(countryCode);
    const key = cacheKey(
      "country-guide",
      code,
      options.language || "ar",
      options.month || "",
      options.durationDays || ""
    );

    const cached = readCache(key);
    if (cached) return cached;

    const country = getCountryByCode(code);
    const profile = getKnowledgeProfile(code);

    if (!country && !profile) {
      return null;
    }

    const sections = deriveGuideSections(country, profile);
    const dna = options.includeTravelDNA === false
      ? null
      : getTravelDNAProfile();

    const guide = {
      id: createId("country_guide"),
      countryCode: code,
      country: {
        ...clone(country || {}),
        ...clone(profile?.identity || {})
      },
      titleAr:
        sections.overview.titleAr ||
        text(country?.nameAr || profile?.nameAr || code),
      titleEn:
        sections.overview.titleEn ||
        text(country?.nameEn || profile?.nameEn),
      sections,
      personalization: buildPersonalization(
        code,
        country,
        profile,
        dna
      ),
      completeness: calculateCompleteness(sections),
      metadata: {
        source: MODULE_ID,
        version: MODULE_VERSION,
        generatedAt: nowISO(),
        language: text(options.language || "ar")
      }
    };

    return writeCache(key, guide);
  };

  const calculateCompleteness = (sections) => {
    const filled = SECTION_KEYS.filter((key) => {
      const value = sections[key];

      if (Array.isArray(value)) {
        return value.length > 0;
      }

      if (isObject(value)) {
        return Object.values(value).some((item) => {
          if (Array.isArray(item)) return item.length > 0;
          if (isObject(item)) return Object.keys(item).length > 0;
          return item !== null && item !== undefined && text(item) !== "";
        });
      }

      return text(value) !== "";
    });

    return {
      totalSections: SECTION_KEYS.length,
      completedSections: filled.length,
      percent: Math.round(
        (filled.length / SECTION_KEYS.length) * 100
      ),
      missingSections: SECTION_KEYS.filter(
        (key) => !filled.includes(key)
      )
    };
  };

  const buildPersonalization = (
    countryCode,
    country,
    profile,
    dna
  ) => {
    if (!dna) {
      return {
        score: 0,
        reasons: [],
        warnings: [],
        match: "unknown"
      };
    }

    const recommendationEngine = getRecommendationEngine();

    try {
      const result =
        recommendationEngine?.scoreCountry?.({
          countryCode,
          travelDNA: dna
        }) ||
        recommendationEngine?.evaluate?.({
          countryCode,
          travelDNA: dna
        }) ||
        null;

      if (result) {
        return {
          score: number(result.score, 0),
          reasons: normalizeTextList(
            result.reasons ||
            result.explanations
          ),
          warnings: normalizeTextList(
            result.warnings
          ),
          match:
            text(
              result.match ||
              result.matchLevel
            ) || "recommended",
          raw: clone(result)
        };
      }
    } catch (error) {
      console.error(
        "Guide Intelligence personalization error:",
        error
      );
    }

    const reasons = [];
    const scores =
      dna.scores ||
      dna.profile?.scores ||
      {};

    const tags = unique([
      ...array(country?.tags),
      ...array(profile?.tags)
    ]).map((item) =>
      text(item).toLowerCase()
    );

    let score = 50;

    if (
      number(scores.nature) >= 60 &&
      tags.some((tag) =>
        tag.includes("nature") ||
        tag.includes("طبيعة")
      )
    ) {
      score += 15;
      reasons.push(
        "تتناسب مع اهتمامك بالطبيعة والمناظر الهادئة."
      );
    }

    if (
      number(scores.beach) >= 60 &&
      tags.some((tag) =>
        tag.includes("beach") ||
        tag.includes("sea") ||
        tag.includes("شاط")
      )
    ) {
      score += 15;
      reasons.push(
        "توفر تجارب بحرية وشواطئ تناسب أسلوب سفرك."
      );
    }

    if (
      number(scores.family) >= 60 &&
      tags.some((tag) =>
        tag.includes("family") ||
        tag.includes("عائل")
      )
    ) {
      score += 12;
      reasons.push(
        "تحتوي على خيارات مناسبة للعائلات."
      );
    }

    if (
      number(scores.luxury) >= 60 &&
      tags.some((tag) =>
        tag.includes("luxury") ||
        tag.includes("فخم")
      )
    ) {
      score += 10;
      reasons.push(
        "تتوفر فيها خيارات إقامة وتجارب راقية."
      );
    }

    return {
      score: Math.min(100, score),
      reasons,
      warnings: [],
      match:
        score >= 80
          ? "excellent"
          : score >= 65
            ? "good"
            : "moderate"
    };
  };

  const searchCountries = (input = {}) => {
    const filters = normalizeFilters(
      typeof input === "string"
        ? { query: input }
        : input
    );

    const engine = getSearchEngine();

    if (engine) {
      try {
        const result =
          engine.search?.(filters) ||
          engine.find?.(filters) ||
          engine.query?.(filters) ||
          [];

        const items = Array.isArray(result)
          ? result
          : array(result?.items || result?.results);

        if (items.length) {
          return {
            filters,
            items: items.slice(0, filters.limit),
            total:
              number(result?.total, items.length),
            source: "search-engine"
          };
        }
      } catch (error) {
        console.error(
          "Guide Intelligence search engine error:",
          error
        );
      }
    }

    let items = getAllCountries();

    if (filters.query) {
      const query = filters.query.toLowerCase();

      items = items.filter((country) => {
        const haystack = [
          country.nameAr,
          country.arabicName,
          country.nameEn,
          country.englishName,
          country.code,
          country.iso2,
          country.iso3
        ]
          .map((item) => text(item).toLowerCase())
          .join(" ");

        return haystack.includes(query);
      });
    }

    if (filters.region) {
      items = items.filter(
        (country) =>
          text(
            country.region ||
            country.continent
          ).toLowerCase() ===
          filters.region.toLowerCase()
      );
    }

    items = items.sort((a, b) => {
      const first =
        text(a.nameAr || a.nameEn || a.code);
      const second =
        text(b.nameAr || b.nameEn || b.code);

      return first.localeCompare(
        second,
        "ar"
      );
    });

    if (filters.sortDirection === "desc") {
      items.reverse();
    }

    return {
      filters,
      items: items.slice(0, filters.limit),
      total: items.length,
      source: "catalog-fallback"
    };
  };

  const getRecommendations = (input = {}) => {
    const options = {
      limit: 12,
      includeVisited: true,
      includeWishlist: true,
      persist: false,
      ...clone(isObject(input) ? input : {})
    };

    const dna =
      options.travelDNA ||
      getTravelDNAProfile({
        persist: options.persist === true
      });

    const engine = getRecommendationEngine();

    if (!engine) {
      return {
        items: getAllCountries()
          .slice(0, options.limit)
          .map((country, index) => ({
            countryCode: normalizeCode(
              country.iso2 ||
              country.countryCode ||
              country.code
            ),
            countryNameAr:
              text(
                country.nameAr ||
                country.arabicName
              ),
            countryNameEn:
              text(
                country.nameEn ||
                country.englishName
              ),
            score: 80 - index,
            reasons: [
              "وجهة مناسبة للاستكشاف ضمن دليل السفر."
            ]
          })),
        travelDNA: dna,
        source: "catalog-fallback"
      };
    }

    try {
      const result =
        engine.recommend?.({
          ...options,
          travelDNA: dna
        }) ||
        engine.getRecommendations?.({
          ...options,
          travelDNA: dna
        }) ||
        engine.rank?.({
          ...options,
          travelDNA: dna
        }) ||
        [];

      const items = Array.isArray(result)
        ? result
        : array(
            result?.items ||
            result?.recommendations
          );

      return {
        items: items
          .slice(0, options.limit)
          .map((item) => ({
            ...clone(item),
            countryCode: normalizeCode(
              item.countryCode ||
              item.iso2 ||
              item.code
            ),
            score: number(item.score, 0),
            reasons: normalizeTextList(
              item.reasons ||
              item.explanations
            )
          })),
        travelDNA: dna,
        source: "recommendation-engine"
      };
    } catch (error) {
      console.error(
        "Guide Intelligence recommendation error:",
        error
      );

      return {
        items: [],
        travelDNA: dna,
        source: "recommendation-error",
        error: error.message
      };
    }
  };

  const compareCountries = (
    countryCodes,
    options = {}
  ) => {
    const codes = unique(
      array(countryCodes)
        .map(normalizeCode)
        .filter(Boolean)
    ).slice(0, 5);

    const guides = codes
      .map((code) =>
        buildCountryGuide(code, options)
      )
      .filter(Boolean);

    return {
      id: createId("country_comparison"),
      countryCodes: codes,
      guides,
      comparison: {
        budget: guides.map((guide) => ({
          countryCode: guide.countryCode,
          value: clone(guide.sections.budget)
        })),
        bestMonths: guides.map((guide) => ({
          countryCode: guide.countryCode,
          value: clone(guide.sections.bestMonths)
        })),
        idealDuration: guides.map((guide) => ({
          countryCode: guide.countryCode,
          value: clone(
            guide.sections.idealDuration
          )
        })),
        visa: guides.map((guide) => ({
          countryCode: guide.countryCode,
          value: clone(guide.sections.visa)
        })),
        family: guides.map((guide) => ({
          countryCode: guide.countryCode,
          count: guide.sections.family.length
        })),
        halalRestaurants: guides.map((guide) => ({
          countryCode: guide.countryCode,
          count:
            guide.sections.halalRestaurants.length
        })),
        shattafHotels: guides.map((guide) => ({
          countryCode: guide.countryCode,
          count:
            guide.sections.shattafHotels.length
        })),
        matchScore: guides.map((guide) => ({
          countryCode: guide.countryCode,
          score:
            number(
              guide.personalization?.score,
              0
            )
        }))
      },
      generatedAt: nowISO()
    };
  };

  const createAITripPlan = (
    input = {}
  ) => {
    const planner = getAIPlanner();

    if (!planner) {
      throw new Error(
        "Guide Intelligence: Guide AI Planner is not available."
      );
    }

    const request = {
      countryCode: normalizeCode(
        input.countryCode ||
        input.code
      ),
      days: Math.max(
        1,
        Math.round(
          number(
            input.days ||
            input.durationDays,
            7
          )
        )
      ),
      travelers: Math.max(
        1,
        Math.round(
          number(input.travelers, 2)
        )
      ),
      month:
        input.month === undefined ||
        input.month === null
          ? null
          : Math.min(
              12,
              Math.max(
                1,
                Math.round(
                  number(input.month)
                )
              )
            ),
      budget:
        input.budget === undefined ||
        input.budget === null
          ? null
          : Math.max(
              0,
              number(input.budget)
            ),
      budgetLevel:
        text(
          input.budgetLevel ||
          "balanced"
        ),
      tripType:
        text(
          input.tripType ||
          "family"
        ),
      pace:
        text(
          input.pace ||
          "balanced"
        ),
      requiresHalal:
        input.requiresHalal !== false,
      requiresShattaf:
        input.requiresShattaf === true,
      wantsBeach:
        input.wantsBeach !== false,
      wantsNature:
        input.wantsNature !== false,
      wantsShopping:
        input.wantsShopping === true,
      wantsCulture:
        input.wantsCulture !== false,
      wantsLuxury:
        input.wantsLuxury === true,
      persist:
        input.persist === true
    };

    const result =
      planner.createPlan?.(request) ||
      planner.build?.(request) ||
      planner.generate?.(request);

    emit("ai-plan-created", {
      countryCode: request.countryCode,
      days: request.days
    });

    return clone(result);
  };

  const createYearPlan = (
    input = {}
  ) => {
    const planner = getYearPlanner();

    if (!planner) {
      throw new Error(
        "Guide Intelligence: Travel Year Planner is not available."
      );
    }

    const result =
      planner.generate?.(input) ||
      planner.createPlan?.(input) ||
      planner.build?.(input);

    emit("year-plan-created", {
      year: result?.year,
      slotsCount:
        array(result?.slots).length
    });

    return clone(result);
  };

  const addToWishlist = (
    countryCode,
    metadata = {}
  ) => {
    const code = normalizeCode(countryCode);
    const store = getStore();

    if (!code || !store) return false;

    const snapshot = getStateSnapshot();
    const wishlist = array(snapshot.wishlist);
    const existing = wishlist.find(
      (item) =>
        normalizeCode(
          item.countryCode ||
          item.iso2 ||
          item.code
        ) === code
    );

    if (existing) return clone(existing);

    const country = getCountryByCode(code);

    const item = {
      id: createId("wishlist_country"),
      type: "country",
      countryCode: code,
      countryNameAr:
        text(
          country?.nameAr ||
          country?.arabicName ||
          code
        ),
      countryNameEn:
        text(
          country?.nameEn ||
          country?.englishName
        ),
      source: MODULE_ID,
      notes: text(metadata.notes),
      priority:
        text(metadata.priority || "medium"),
      createdAt: nowISO()
    };

    wishlist.unshift(item);

    if (typeof store.set === "function") {
      store.set("wishlist", wishlist);
    } else if (
      typeof store.patch === "function"
    ) {
      store.patch({ wishlist });
    }

    emit("wishlist-added", {
      countryCode: code,
      itemId: item.id
    });

    return clone(item);
  };

  const removeFromWishlist = (
    countryCode
  ) => {
    const code = normalizeCode(countryCode);
    const store = getStore();

    if (!code || !store) return false;

    const snapshot = getStateSnapshot();
    const wishlist = array(snapshot.wishlist);
    const filtered = wishlist.filter(
      (item) =>
        normalizeCode(
          item.countryCode ||
          item.iso2 ||
          item.code
        ) !== code
    );

    if (filtered.length === wishlist.length) {
      return false;
    }

    if (typeof store.set === "function") {
      store.set("wishlist", filtered);
    } else if (
      typeof store.patch === "function"
    ) {
      store.patch({
        wishlist: filtered
      });
    }

    emit("wishlist-removed", {
      countryCode: code
    });

    return true;
  };

  const isInWishlist = (
    countryCode
  ) => {
    const code = normalizeCode(countryCode);
    const snapshot = getStateSnapshot();

    return array(snapshot.wishlist)
      .some(
        (item) =>
          normalizeCode(
            item.countryCode ||
            item.iso2 ||
            item.code
          ) === code
      );
  };

  const saveRecentCountry = (
    countryCode
  ) => {
    const code = normalizeCode(countryCode);
    const store = getStore();

    if (!code || !store) return false;

    const current =
      clone(
        store.get?.(
          STORE_PATH,
          {}
        )
      ) || {};

    const recents = unique([
      code,
      ...array(current.recentCountries)
        .map(normalizeCode)
    ]).slice(0, 12);

    const payload = {
      ...current,
      recentCountries: recents,
      lastCountryCode: code,
      updatedAt: nowISO()
    };

    if (typeof store.set === "function") {
      store.set(
        STORE_PATH,
        payload
      );
    } else if (
      typeof store.patch === "function"
    ) {
      store.patch({
        guides: {
          intelligence: payload
        }
      });
    }

    emit("recent-country-saved", {
      countryCode: code
    });

    return true;
  };

  const getRecentCountries = () => {
    const store = getStore();
    const current =
      store?.get?.(
        STORE_PATH,
        {}
      ) ||
      getStateSnapshot()
        ?.guides
        ?.intelligence ||
      {};

    return array(
      current.recentCountries
    )
      .map((code) =>
        getCountryByCode(code)
      )
      .filter(Boolean);
  };

  const getDashboardData = (
    options = {}
  ) => {
    const snapshot = getStateSnapshot();
    const recommendations =
      getRecommendations({
        limit:
          number(
            options.recommendationsLimit,
            8
          ),
        persist: false
      });

    const activeYearPlan =
      getYearPlanner()
        ?.getActivePlan?.() ||
      null;

    return {
      user: {
        name:
          text(
            snapshot.profile?.name ||
            snapshot.profile?.displayName ||
            "يوسف"
          ),
        currency:
          text(
            snapshot.profile?.currency ||
            getConfig()?.currency ||
            "AED"
          ),
        homeAirport:
          text(
            snapshot.profile?.homeAirport ||
            "AUH"
          )
      },
      statistics: {
        totalCountries:
          getAllCountries().length,
        visitedCountries:
          unique(
            array(snapshot.trips)
              .filter(
                (trip) =>
                  trip.status === "completed" ||
                  trip.isMemory === true
              )
              .map((trip) =>
                normalizeCode(
                  trip.countryCode ||
                  trip.iso2
                )
              )
              .filter(Boolean)
          ).length,
        wishlistCountries:
          unique(
            array(snapshot.wishlist)
              .map((item) =>
                normalizeCode(
                  item.countryCode ||
                  item.iso2
                )
              )
              .filter(Boolean)
          ).length,
        savedPlans:
          array(
            snapshot.guides
              ?.aiPlans
          ).length,
        yearPlans:
          getYearPlanner()
            ?.getSavedPlans?.()
            ?.length || 0
      },
      recommendations,
      recentCountries:
        getRecentCountries(),
      activeYearPlan,
      travelDNA:
        recommendations.travelDNA ||
        getTravelDNAProfile(),
      generatedAt: nowISO()
    };
  };

  const navigateToCountry = (
    countryCode,
    options = {}
  ) => {
    const code = normalizeCode(countryCode);
    const router = getRouter();

    if (!code || !router) return false;

    saveRecentCountry(code);

    const query = {
      country: code,
      source:
        text(
          options.source ||
          MODULE_ID
        )
    };

    if (options.month) {
      query.month = options.month;
    }

    if (options.days) {
      query.days = options.days;
    }

    if (
      typeof router.go === "function"
    ) {
      router.go("guide", { query });
      return true;
    }

    if (
      typeof router.navigate === "function"
    ) {
      router.navigate("guide", {
        query
      });
      return true;
    }

    return false;
  };

  const notify = (
    message,
    tone = "success"
  ) => {
    const ui = getUI();

    if (
      typeof ui?.toast === "function"
    ) {
      ui.toast(message, { tone });
      return true;
    }

    if (
      typeof ui?.notify === "function"
    ) {
      ui.notify({
        message,
        tone
      });
      return true;
    }

    return false;
  };

  const emit = (
    type,
    detail = {}
  ) => {
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
      new CustomEvent(
        "tic:guide-intelligence",
        { detail: payload }
      )
    );

    return payload;
  };

  const diagnostics = () => ({
    id: MODULE_ID,
    version: MODULE_VERSION,
    ready: true,
    dependencies: {
      config:
        Boolean(getConfig()),
      store:
        Boolean(getStore()),
      router:
        Boolean(getRouter()),
      ui:
        Boolean(getUI()),
      countriesCatalog:
        Boolean(getCountriesCatalog()),
      travelKnowledge:
        Boolean(getTravelKnowledge()),
      recommendationEngine:
        Boolean(getRecommendationEngine()),
      searchEngine:
        Boolean(getSearchEngine()),
      aiPlanner:
        Boolean(getAIPlanner()),
      travelDNA:
        Boolean(getTravelDNA()),
      yearPlanner:
        Boolean(getYearPlanner())
    },
    countriesCount:
      getAllCountries().length,
    cacheSize:
      cache.size,
    recentCountriesCount:
      getRecentCountries().length,
    timestamp:
      nowISO()
  });

  const init = () => {
    window.TIC =
      window.TIC || {};

    window.TIC.Features =
      window.TIC.Features || {};

    emit(
      "ready",
      diagnostics()
    );

    return API;
  };

  const API = Object.freeze({
    id:
      MODULE_ID,
    version:
      MODULE_VERSION,
    sectionKeys:
      [...SECTION_KEYS],
    defaultFilters:
      clone(DEFAULT_FILTERS),
    normalizeFilters,
    searchCountries,
    search:
      searchCountries,
    getCountryGuide:
      buildCountryGuide,
    buildCountryGuide,
    getRecommendations,
    compareCountries,
    createAITripPlan,
    createYearPlan,
    getDashboardData,
    getTravelDNAProfile,
    addToWishlist,
    removeFromWishlist,
    isInWishlist,
    saveRecentCountry,
    getRecentCountries,
    navigateToCountry,
    calculateCompleteness,
    clearCache,
    notify,
    diagnostics,
    init
  });

  window.TIC =
    window.TIC || {};

  window.TIC.Features =
    window.TIC.Features || {};

  window.TIC.Features.GuideIntelligence =
    API;

  window.TICGuideIntelligence =
    API;

  init();
})(window);
