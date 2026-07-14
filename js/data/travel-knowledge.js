/* =========================================================
   Travel Intelligence Center
   Travel Knowledge Registry V1.0.0

   File Path:
   js/data/travel-knowledge.js

   Purpose:
   - Central travel knowledge registry for every country.
   - Keeps guide content separate from guide page rendering.
   - Supports best cities, beaches, attractions, hotel areas,
     family needs, halal food and shattaf availability guidance.
   - Provides one stable API for future research enrichment.
   - Generates a safe base profile for all countries automatically.

   Architecture Rule:
   - guide.js must never contain country-specific tourism data.
   - New research is added here or through registerCountryPack().
   - The public API remains stable even when the data grows.

   Dependencies:
   - js/data/countries-catalog.js

   Global APIs:
   - window.TIC.Data.TravelKnowledge
   - window.TICTravelKnowledge
========================================================= */

(function (window) {
  "use strict";

  const MODULE_ID = "travel-knowledge";
  const MODULE_VERSION = "1.0.0";

  const getCountriesCatalog = () =>
    window.TIC?.Data?.Countries ||
    window.TICCountriesCatalog ||
    null;

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

  const deepMerge = (target, source) => {
    const output = isObject(target)
      ? clone(target)
      : {};

    if (!isObject(source)) {
      return output;
    }

    Object.entries(source).forEach(([key, value]) => {
      if (
        isObject(value) &&
        isObject(output[key])
      ) {
        output[key] = deepMerge(
          output[key],
          value
        );
      } else {
        output[key] = clone(value);
      }
    });

    return output;
  };

  const createBaseProfile = (country) => ({
    countryCode: country.iso2,
    countryNameAr: country.nameAr,
    countryNameEn: country.nameEn,
    flag: country.flag,
    continent: country.continent,
    currency: country.currency,
    languages: array(country.languages),

    summaryAr:
      `دليل ${country.nameAr} قيد الإثراء بالمعلومات السياحية التفصيلية.`,

    guideStatus: "base",
    researchStatus: "pending",
    sourceUpdatedAt: null,
    verifiedAt: null,

    bestCities: [],
    beaches: [],
    attractions: [],
    hotelAreas: [],
    hotels: [],

    hotelRequirements: {
      shattaf:
        "يجب التأكد مباشرة من الفندق أو من صور الحمام قبل إتمام الحجز.",
      familyRooms:
        "تحقق من الغرف العائلية والغرف المتصلة وسياسة الأطفال.",
      halalFood:
        "تحقق من المطاعم الحلال والقريبة من منطقة الإقامة."
    },

    travelStyles: [
      "family",
      "couple",
      "solo",
      "friends",
      "business",
      "luxury",
      "budget",
      "adventure"
    ],

    seasons: {
      bestMonths: [],
      avoidMonths: [],
      notesAr: ""
    },

    transport: {
      airports: [],
      cityTransport: [],
      drivingNotesAr: ""
    },

    entry: {
      visaNotesAr:
        "متطلبات الدخول تختلف حسب الجنسية وقد تتغير؛ يجب التحقق من المصدر الرسمي قبل الحجز.",
      passportValidityNotesAr: "",
      insuranceNotesAr: ""
    },

    safety: {
      generalNotesAr: "",
      emergencyNumbers: [],
      localRules: []
    },

    connectivity: {
      simOptions: [],
      usefulApps: [],
      internetNotesAr: ""
    },

    money: {
      currency: country.currency,
      cashNotesAr: "",
      cardNotesAr: "",
      tippingNotesAr: ""
    },

    food: {
      halalNotesAr:
        "تحقق من توفر الطعام الحلال حسب المدينة والمنطقة.",
      popularFood: [],
      familyRestaurants: []
    },

    itineraryTemplates: {
      days3: [],
      days5: [],
      days7: [],
      days10: []
    },

    packingHints: [],
    culturalTips: [],
    shopping: [],
    familyActivities: [],
    coupleActivities: [],
    natureActivities: [],
    luxuryExperiences: [],

    metadata: {
      version: 1,
      createdAt: nowISO(),
      updatedAt: nowISO()
    }
  });

  const normalizeNamedItem = (item = {}) => {
    if (typeof item === "string") {
      return {
        nameAr: text(item),
        nameEn: "",
        tags: []
      };
    }

    return {
      ...clone(item),
      nameAr: text(
        item.nameAr ||
        item.titleAr ||
        item.name
      ),
      nameEn: text(
        item.nameEn ||
        item.titleEn
      ),
      tags: unique(item.tags)
    };
  };

  const normalizeProfile = (input = {}) => {
    if (!isObject(input)) {
      throw new TypeError(
        "TIC Travel Knowledge: country profile must be an object."
      );
    }

    const catalog = getCountriesCatalog();
    const countryCode =
      text(input.countryCode).toUpperCase();

    const country =
      catalog?.getByCode?.(countryCode);

    if (!country) {
      throw new Error(
        `TIC Travel Knowledge: unknown country code "${countryCode}".`
      );
    }

    const merged = deepMerge(
      createBaseProfile(country),
      input
    );

    merged.countryCode = country.iso2;
    merged.countryNameAr = country.nameAr;
    merged.countryNameEn = country.nameEn;
    merged.flag = country.flag;
    merged.continent = country.continent;
    merged.currency =
      text(merged.currency || country.currency)
        .toUpperCase();

    [
      "bestCities",
      "beaches",
      "attractions",
      "hotelAreas",
      "hotels",
      "shopping",
      "familyActivities",
      "coupleActivities",
      "natureActivities",
      "luxuryExperiences"
    ].forEach((key) => {
      merged[key] = array(merged[key])
        .map(normalizeNamedItem)
        .filter((item) => item.nameAr);
    });

    merged.travelStyles =
      unique(merged.travelStyles);

    merged.packingHints =
      unique(merged.packingHints);

    merged.culturalTips =
      unique(merged.culturalTips);

    merged.metadata = {
      ...merged.metadata,
      version:
        Number(merged.metadata?.version) || 1,
      createdAt:
        merged.metadata?.createdAt ||
        nowISO(),
      updatedAt: nowISO()
    };

    return merged;
  };

  const records = new Map();

  const registerCountryPack = (
    profile,
    options = {}
  ) => {
    const normalized =
      normalizeProfile(profile);

    const current =
      records.get(normalized.countryCode);

    if (
      current &&
      options.replace !== true
    ) {
      records.set(
        normalized.countryCode,
        normalizeProfile(
          deepMerge(
            current,
            normalized
          )
        )
      );
    } else {
      records.set(
        normalized.countryCode,
        normalized
      );
    }

    const catalog =
      getCountriesCatalog();

    if (
      normalized.researchStatus !== "pending" ||
      normalized.guideStatus !== "base"
    ) {
      catalog?.markGuideAvailable?.(
        normalized.countryCode,
        true
      );
    }

    return clone(
      records.get(normalized.countryCode)
    );
  };

  const registerMany = (
    profiles,
    options = {}
  ) =>
    array(profiles).map((profile) =>
      registerCountryPack(
        profile,
        options
      )
    );

  const initializeBaseProfiles = () => {
    const catalog =
      getCountriesCatalog();

    if (!catalog) {
      throw new Error(
        "TIC Travel Knowledge Error: countries catalog is unavailable."
      );
    }

    catalog.getAll({
      includeDisabled: true
    }).forEach((country) => {
      if (!records.has(country.iso2)) {
        records.set(
          country.iso2,
          createBaseProfile(country)
        );
      }
    });
  };

  initializeBaseProfiles();

  const STARTER_PACKS = [
  {
    "countryCode": "AE",
    "summaryAr": "وجهة خليجية متطورة تجمع المدن الحديثة والشواطئ والتسوق والأنشطة العائلية.",
    "bestCities": [
      {
        "nameAr": "أبوظبي",
        "nameEn": "Abu Dhabi",
        "tags": [
          "عائلية",
          "ثقافة",
          "بحر",
          "فاخرة"
        ]
      },
      {
        "nameAr": "دبي",
        "nameEn": "Dubai",
        "tags": [
          "مدن",
          "تسوق",
          "عائلية",
          "فاخرة"
        ]
      },
      {
        "nameAr": "رأس الخيمة",
        "nameEn": "Ras Al Khaimah",
        "tags": [
          "منتجعات",
          "جبال",
          "بحر",
          "استرخاء"
        ]
      }
    ],
    "beaches": [
      {
        "nameAr": "شاطئ السعديات",
        "cityAr": "أبوظبي",
        "tags": [
          "هادئ",
          "عائلي",
          "منتجعات"
        ]
      },
      {
        "nameAr": "شاطئ جميرا",
        "cityAr": "دبي",
        "tags": [
          "مدينة",
          "عائلي",
          "مطاعم"
        ]
      }
    ],
    "attractions": [
      {
        "nameAr": "جامع الشيخ زايد الكبير",
        "cityAr": "أبوظبي",
        "category": "ثقافة"
      },
      {
        "nameAr": "متحف اللوفر أبوظبي",
        "cityAr": "أبوظبي",
        "category": "متاحف"
      },
      {
        "nameAr": "برج خليفة",
        "cityAr": "دبي",
        "category": "معالم"
      },
      {
        "nameAr": "جبل جيس",
        "cityAr": "رأس الخيمة",
        "category": "طبيعة"
      }
    ],
    "hotelAreas": [
      {
        "cityAr": "أبوظبي",
        "areaAr": "جزيرة السعديات",
        "bestFor": [
          "بحر",
          "منتجعات",
          "هدوء"
        ]
      },
      {
        "cityAr": "دبي",
        "areaAr": "نخلة جميرا",
        "bestFor": [
          "فاخرة",
          "بحر",
          "خصوصية"
        ]
      }
    ],
    "hotelRequirements": {
      "shattaf": "شائع جداً في الفنادق داخل الدولة، ومع ذلك يجب تأكيده من وصف الغرفة أو الفندق قبل الدفع.",
      "familyRooms": "متوفرة بكثرة في المنتجعات والفنادق العائلية.",
      "halalFood": "متوفر على نطاق واسع."
    }
  },
  {
    "countryCode": "KZ",
    "summaryAr": "وجهة طبيعية مناسبة للعائلات ومحبي الجبال والبحيرات والطقس المعتدل صيفاً.",
    "bestCities": [
      {
        "nameAr": "ألماتي",
        "nameEn": "Almaty",
        "tags": [
          "طبيعة",
          "جبال",
          "عائلية",
          "مدن"
        ]
      },
      {
        "nameAr": "أستانا",
        "nameEn": "Astana",
        "tags": [
          "مدن",
          "عمارة",
          "شتاء"
        ]
      }
    ],
    "beaches": [],
    "attractions": [
      {
        "nameAr": "ميديو وشيمبولاك",
        "cityAr": "ألماتي",
        "category": "جبال"
      },
      {
        "nameAr": "كوك توبي",
        "cityAr": "ألماتي",
        "category": "إطلالات"
      },
      {
        "nameAr": "بحيرة كولساي",
        "cityAr": "ألماتي",
        "category": "طبيعة"
      },
      {
        "nameAr": "شارين كانيون",
        "cityAr": "ألماتي",
        "category": "طبيعة"
      }
    ],
    "hotelAreas": [
      {
        "cityAr": "ألماتي",
        "areaAr": "وسط المدينة",
        "bestFor": [
          "مطاعم",
          "تنقل",
          "عائلة"
        ]
      }
    ],
    "hotelRequirements": {
      "shattaf": "ليس معياراً ثابتاً في جميع الفنادق؛ يجب التأكد مباشرة من الفندق أو صور الحمام.",
      "familyRooms": "تتوفر شقق فندقية مناسبة للعائلات والمجموعات.",
      "halalFood": "متوفر في المدن الكبرى، خصوصاً ألماتي."
    }
  },
  {
    "countryCode": "ES",
    "summaryAr": "وجهة متنوعة تجمع المدن التاريخية والسواحل والمطاعم والتسوق والقطارات السريعة.",
    "bestCities": [
      {
        "nameAr": "مدريد",
        "nameEn": "Madrid",
        "tags": [
          "مدن",
          "ثقافة",
          "تسوق"
        ]
      },
      {
        "nameAr": "مالقة",
        "nameEn": "Malaga",
        "tags": [
          "بحر",
          "عائلية",
          "مناخ معتدل"
        ]
      },
      {
        "nameAr": "ماربيا",
        "nameEn": "Marbella",
        "tags": [
          "فاخرة",
          "بحر",
          "استرخاء"
        ]
      },
      {
        "nameAr": "إشبيلية",
        "nameEn": "Seville",
        "tags": [
          "تاريخ",
          "ثقافة"
        ]
      },
      {
        "nameAr": "غرناطة",
        "nameEn": "Granada",
        "tags": [
          "تاريخ",
          "معالم"
        ]
      },
      {
        "nameAr": "فالنسيا",
        "nameEn": "Valencia",
        "tags": [
          "بحر",
          "مدن",
          "عائلية"
        ]
      }
    ],
    "beaches": [
      {
        "nameAr": "ساحل كوستا ديل سول",
        "cityAr": "مالقة",
        "tags": [
          "منتجعات",
          "عائلي",
          "مطاعم"
        ]
      },
      {
        "nameAr": "شاطئ مالڤاروسا",
        "cityAr": "فالنسيا",
        "tags": [
          "مدينة",
          "عائلي"
        ]
      }
    ],
    "attractions": [
      {
        "nameAr": "القصر الملكي",
        "cityAr": "مدريد",
        "category": "تاريخ"
      },
      {
        "nameAr": "قصر الحمراء",
        "cityAr": "غرناطة",
        "category": "تاريخ"
      },
      {
        "nameAr": "ساحة إسبانيا",
        "cityAr": "إشبيلية",
        "category": "معالم"
      },
      {
        "nameAr": "مدينة الفنون والعلوم",
        "cityAr": "فالنسيا",
        "category": "عائلية"
      }
    ],
    "hotelAreas": [
      {
        "cityAr": "مدريد",
        "areaAr": "غران فيا",
        "bestFor": [
          "تسوق",
          "موقع مركزي"
        ]
      },
      {
        "cityAr": "ماربيا",
        "areaAr": "غولدن مايل",
        "bestFor": [
          "فاخرة",
          "بحر"
        ]
      }
    ],
    "hotelRequirements": {
      "shattaf": "غير شائع كمعيار أوروبي؛ ابحث في صور الحمام واسأل الفندق عن handheld bidet أو bidet spray.",
      "familyRooms": "تتوفر غرف عائلية وشقق فندقية في المدن والسواحل.",
      "halalFood": "متوفر أكثر في مدريد ومالقة وغرناطة والمدن الكبرى."
    }
  },
  {
    "countryCode": "TH",
    "summaryAr": "وجهة آسيوية مناسبة للبحر والمنتجعات والطبيعة والتسوق، مع خيارات واسعة للعائلات.",
    "bestCities": [
      {
        "nameAr": "بوكيت",
        "nameEn": "Phuket",
        "tags": [
          "بحر",
          "منتجعات",
          "عائلية"
        ]
      },
      {
        "nameAr": "بانكوك",
        "nameEn": "Bangkok",
        "tags": [
          "تسوق",
          "مدن",
          "مطاعم"
        ]
      },
      {
        "nameAr": "كرابي",
        "nameEn": "Krabi",
        "tags": [
          "طبيعة",
          "بحر",
          "هدوء"
        ]
      },
      {
        "nameAr": "شيانغ ماي",
        "nameEn": "Chiang Mai",
        "tags": [
          "طبيعة",
          "ثقافة",
          "جبال"
        ]
      }
    ],
    "beaches": [
      {
        "nameAr": "شاطئ كاتا",
        "cityAr": "بوكيت",
        "tags": [
          "عائلي",
          "هادئ"
        ]
      },
      {
        "nameAr": "شاطئ بانوا",
        "cityAr": "بوكيت",
        "tags": [
          "هدوء",
          "منتجعات"
        ]
      },
      {
        "nameAr": "رايلاي",
        "cityAr": "كرابي",
        "tags": [
          "طبيعة",
          "قوارب"
        ]
      }
    ],
    "attractions": [
      {
        "nameAr": "المدينة القديمة",
        "cityAr": "بوكيت",
        "category": "ثقافة"
      },
      {
        "nameAr": "القصر الكبير",
        "cityAr": "بانكوك",
        "category": "معالم"
      },
      {
        "nameAr": "الأسواق الليلية",
        "cityAr": "بانكوك",
        "category": "تسوق"
      }
    ],
    "hotelAreas": [
      {
        "cityAr": "بوكيت",
        "areaAr": "كيب بانوا",
        "bestFor": [
          "هدوء",
          "خصوصية",
          "منتجعات"
        ]
      },
      {
        "cityAr": "بوكيت",
        "areaAr": "كاتا",
        "bestFor": [
          "عائلة",
          "شاطئ"
        ]
      }
    ],
    "hotelRequirements": {
      "shattaf": "متوفر في عدد جيد من الفنادق لكن ليس مضموناً؛ يجب التأكد من الفندق قبل الحجز.",
      "familyRooms": "متوفرة في المنتجعات الكبيرة والشقق الفندقية.",
      "halalFood": "متوفر خصوصاً في بوكيت وبانكوك والمناطق السياحية."
    }
  },
  {
    "countryCode": "MV",
    "summaryAr": "وجهة جزر خاصة مناسبة للاسترخاء والخصوصية وشهر العسل والمنتجعات البحرية.",
    "bestCities": [
      {
        "nameAr": "ماليه",
        "nameEn": "Male",
        "tags": [
          "وصول",
          "مدينة"
        ]
      },
      {
        "nameAr": "الجزر والمنتجعات الخاصة",
        "nameEn": "Private Resort Islands",
        "tags": [
          "بحر",
          "خصوصية",
          "فاخرة"
        ]
      }
    ],
    "beaches": [
      {
        "nameAr": "شواطئ الجزر الخاصة",
        "cityAr": "المنتجعات",
        "tags": [
          "رمال بيضاء",
          "خصوصية",
          "سنوركلينغ"
        ]
      }
    ],
    "attractions": [
      {
        "nameAr": "السنوركلينغ والغوص",
        "cityAr": "الجزر",
        "category": "بحر"
      },
      {
        "nameAr": "رحلات الدلافين",
        "cityAr": "الجزر",
        "category": "أنشطة"
      },
      {
        "nameAr": "عشاء خاص على الشاطئ",
        "cityAr": "الجزر",
        "category": "رومانسية"
      }
    ],
    "hotelAreas": [
      {
        "cityAr": "الجزر",
        "areaAr": "منتجع جزيرة خاصة",
        "bestFor": [
          "خصوصية",
          "بحر",
          "فلل مائية"
        ]
      }
    ],
    "hotelRequirements": {
      "shattaf": "يختلف من منتجع لآخر؛ راجع صور الحمام واسأل المنتجع كتابةً قبل الدفع.",
      "familyRooms": "تتوفر فلل عائلية وغرف متصلة في بعض المنتجعات.",
      "halalFood": "متوفر غالباً بحكم طبيعة الدولة، مع ضرورة التأكد من خيارات المطعم داخل المنتجع."
    }
  },
  {
    "countryCode": "DK",
    "summaryAr": "وجهة أوروبية هادئة ومنظمة مناسبة للمدن والتصميم والمشي والأنشطة العائلية.",
    "bestCities": [
      {
        "nameAr": "كوبنهاغن",
        "nameEn": "Copenhagen",
        "tags": [
          "مدن",
          "عائلية",
          "تصميم",
          "تسوق"
        ]
      },
      {
        "nameAr": "آرهوس",
        "nameEn": "Aarhus",
        "tags": [
          "ثقافة",
          "متاحف",
          "هدوء"
        ]
      }
    ],
    "beaches": [
      {
        "nameAr": "شاطئ أماجر",
        "cityAr": "كوبنهاغن",
        "tags": [
          "مدينة",
          "مشي",
          "صيف"
        ]
      }
    ],
    "attractions": [
      {
        "nameAr": "نيهافن",
        "cityAr": "كوبنهاغن",
        "category": "معالم"
      },
      {
        "nameAr": "حدائق تيفولي",
        "cityAr": "كوبنهاغن",
        "category": "عائلية"
      },
      {
        "nameAr": "قصر أمالينبورغ",
        "cityAr": "كوبنهاغن",
        "category": "تاريخ"
      }
    ],
    "hotelAreas": [
      {
        "cityAr": "كوبنهاغن",
        "areaAr": "وسط المدينة",
        "bestFor": [
          "مشي",
          "مطاعم",
          "معالم"
        ]
      }
    ],
    "hotelRequirements": {
      "shattaf": "غير شائع؛ يجب البحث عن bidet spray أو handheld bidet والتأكيد مباشرة مع الفندق.",
      "familyRooms": "متوفرة لكن قد تكون محدودة المساحة مقارنة بالوجهات الآسيوية والخليجية.",
      "halalFood": "متوفر في كوبنهاغن والمدن الكبرى."
    }
  }
].map((profile) => ({
    ...profile,
    guideStatus: "starter",
    researchStatus: "starter",
    sourceUpdatedAt: nowISO()
  }));

  registerMany(STARTER_PACKS);

  const getCountry = (countryCode) => {
    const code =
      text(countryCode).toUpperCase();

    const profile =
      records.get(code);

    return profile
      ? clone(profile)
      : null;
  };

  const getAll = (options = {}) => {
    const status =
      text(options.status);

    return Array.from(records.values())
      .filter((profile) =>
        !status ||
        profile.guideStatus === status ||
        profile.researchStatus === status
      )
      .sort((a, b) =>
        a.countryNameAr.localeCompare(
          b.countryNameAr,
          "ar",
          {
            sensitivity: "base"
          }
        )
      )
      .map(clone);
  };

  const findCities = (
    countryCode,
    query = ""
  ) => {
    const profile =
      getCountry(countryCode);

    if (!profile) return [];

    const catalog =
      getCountriesCatalog();

    const normalizedQuery =
      catalog?.normalizeSearch?.(query) ||
      text(query).toLowerCase();

    return profile.bestCities.filter((city) => {
      if (!normalizedQuery) return true;

      const haystack = [
        city.nameAr,
        city.nameEn,
        ...array(city.tags)
      ]
        .map((item) =>
          catalog?.normalizeSearch?.(item) ||
          text(item).toLowerCase()
        )
        .join(" ");

      return haystack.includes(
        normalizedQuery
      );
    });
  };

  const findHotels = (
    countryCode,
    options = {}
  ) => {
    const profile =
      getCountry(countryCode);

    if (!profile) return [];

    const city =
      text(options.city);

    const requireShattaf =
      options.shattaf === true;

    const familyOnly =
      options.family === true;

    return profile.hotels.filter((hotel) => {
      const cityMatches =
        !city ||
        text(hotel.cityAr) === city ||
        text(hotel.cityEn).toLowerCase() ===
          city.toLowerCase();

      const shattafMatches =
        !requireShattaf ||
        hotel.shattafConfirmed === true;

      const familyMatches =
        !familyOnly ||
        hotel.familyFriendly === true;

      return (
        cityMatches &&
        shattafMatches &&
        familyMatches
      );
    });
  };

  const buildGuideContext = (
    countryCode,
    preferences = {}
  ) => {
    const profile =
      getCountry(countryCode);

    if (!profile) return null;

    const days = Math.max(
      1,
      Number(preferences.days) || 5
    );

    const itineraryKey =
      days <= 3
        ? "days3"
        : days <= 5
          ? "days5"
          : days <= 7
            ? "days7"
            : "days10";

    return {
      country: profile,
      preferences: {
        city: text(preferences.city),
        days,
        month: Math.max(
          0,
          Math.min(
            12,
            Number(preferences.month) || 0
          )
        ),
        tripType:
          text(preferences.tripType) ||
          "family",
        budgetLevel:
          text(preferences.budgetLevel) ||
          "balanced",
        wantsBeach:
          preferences.wantsBeach === true,
        requiresHalal:
          preferences.requiresHalal !== false,
        requiresShattaf:
          preferences.requiresShattaf === true,
        travelers: Math.max(
          1,
          Number(preferences.travelers) || 1
        )
      },
      bestCities:
        preferences.city
          ? findCities(
              countryCode,
              preferences.city
            )
          : clone(profile.bestCities),
      beaches:
        preferences.wantsBeach === false
          ? []
          : clone(profile.beaches),
      attractions:
        clone(profile.attractions),
      hotelAreas:
        clone(profile.hotelAreas),
      hotels:
        findHotels(countryCode, {
          city: preferences.city,
          shattaf:
            preferences.requiresShattaf,
          family:
            preferences.tripType ===
            "family"
        }),
      hotelRequirements:
        clone(profile.hotelRequirements),
      itinerary:
        clone(
          profile.itineraryTemplates[
            itineraryKey
          ] || []
        ),
      entry:
        clone(profile.entry),
      transport:
        clone(profile.transport),
      safety:
        clone(profile.safety),
      food:
        clone(profile.food),
      money:
        clone(profile.money),
      connectivity:
        clone(profile.connectivity),
      packingHints:
        clone(profile.packingHints),
      culturalTips:
        clone(profile.culturalTips)
    };
  };

  const searchKnowledge = (
    query,
    options = {}
  ) => {
    const catalog =
      getCountriesCatalog();

    const countries =
      catalog?.search?.(query, {
        limit:
          Number(options.limit) || 20
      }) || [];

    return countries
      .map((country) =>
        getCountry(country.iso2)
      )
      .filter(Boolean);
  };

  const Knowledge = {
    id: MODULE_ID,
    version: MODULE_VERSION,

    getCountry,
    getAll,
    findCities,
    findHotels,
    buildGuideContext,
    search: searchKnowledge,
    registerCountryPack,
    registerMany,

    has(countryCode) {
      return Boolean(
        getCountry(countryCode)
      );
    },

    count() {
      return records.size;
    },

    diagnostics() {
      const profiles =
        Array.from(records.values());

      const catalogCount =
        getCountriesCatalog()?.count?.({
          includeDisabled: true
        }) || 0;

      return {
        id: MODULE_ID,
        version: MODULE_VERSION,
        profileCount: profiles.length,
        catalogCount,
        coversFullCatalog:
          profiles.length === catalogCount,
        researchedCount:
          profiles.filter(
            (profile) =>
              profile.researchStatus !==
              "pending"
          ).length,
        starterCount:
          profiles.filter(
            (profile) =>
              profile.researchStatus ===
              "starter"
          ).length,
        hotelCount:
          profiles.reduce(
            (total, profile) =>
              total +
              profile.hotels.length,
            0
          ),
        cityCount:
          profiles.reduce(
            (total, profile) =>
              total +
              profile.bestCities.length,
            0
          ),
        attractionCount:
          profiles.reduce(
            (total, profile) =>
              total +
              profile.attractions.length,
            0
          )
      };
    }
  };

  window.TIC = window.TIC || {};
  window.TIC.Data = window.TIC.Data || {};
  window.TIC.Data.TravelKnowledge =
    Knowledge;
  window.TICTravelKnowledge =
    Knowledge;

  window.dispatchEvent(
    new CustomEvent(
      "tic:data:travel-knowledge-ready",
      {
        detail:
          Knowledge.diagnostics()
      }
    )
  );
})(window);
