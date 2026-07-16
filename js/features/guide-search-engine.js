/* =========================================================
   Travel Intelligence Center
   Guide Search Engine V2.0.0

   File Path:
   js/features/guide-search-engine.js

   Purpose:
   - Reliable country search for the Guide page.
   - Supports Arabic and English names, country codes, capitals and cities.
   - Normalizes Arabic letters, diacritics and common spelling variations.
   - Provides fast indexed search with result limits and ranking.
   - Supports alphabetical grouping without rebuilding data each time.
   - Opens complete country guide context through TravelKnowledge.
   - Uses lightweight caching for improved mobile performance.
   - Keeps the engine independent from the Guide UI.

   Dependencies:
   - js/data/countries-catalog.js or compatible Countries API
   - js/data/travel-knowledge.js or compatible TravelKnowledge API

   Global APIs:
   - window.TIC.Features.GuideSearch
   - window.TICGuideSearch
========================================================= */

(function guideSearchEngineFactory(window) {
  "use strict";

  const ENGINE_ID = "guide-search-engine";
  const ENGINE_VERSION = "2.0.0";

  const DEFAULT_LIMIT = 30;
  const MAX_LIMIT = 300;

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

  const state = {
    initialized: false,
    countries: [],
    index: [],
    byCode: new Map(),
    grouped: null,
    searchCache: new Map()
  };

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

  const normalizeArabic = (value) =>
    text(value)
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
      .replace(/[إأآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/ـ/g, "");

  const normalize = (value) =>
    normalizeArabic(value)
      .toLocaleLowerCase("ar")
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  const unique = (items) =>
    [...new Set(safeArray(items).filter(Boolean))];

  const normalizeCode = (value) =>
    text(value).toUpperCase();

  const getRawCountries = () => {
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
      console.error("TIC Guide Search countries error:", error);
    }

    return [];
  };

  const normalizeCountry = (country) => {
    const code = normalizeCode(
      country.iso2 ||
      country.code ||
      country.countryCode
    );

    const cities = safeArray(
      country.cities ||
      country.bestCities
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
      capital:
        country.capital ||
        country.capitalAr ||
        "",
      flag:
        country.flag ||
        "🌍",
      cities
    };
  };

  const getKnowledgeCountry = (code) => {
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
      console.error("TIC Guide Search knowledge error:", error);
    }

    return null;
  };

  /* =========================================================
     Index
  ========================================================= */

  const buildIndexEntry = (country) => {
    const knowledge = getKnowledgeCountry(country.code);

    const knowledgeCities = safeArray(
      knowledge?.bestCities ||
      knowledge?.cities
    );

    const aliases = unique([
      country.nameAr,
      country.nameEn,
      country.code,
      country.iso3,
      country.capital,
      country.capitalAr,
      country.capitalEn,
      ...safeArray(country.aliases),
      ...safeArray(knowledge?.aliases),
      ...country.cities.map((city) =>
        typeof city === "string"
          ? city
          : city.nameAr || city.nameEn || city.name
      ),
      ...knowledgeCities.map((city) =>
        typeof city === "string"
          ? city
          : city.nameAr || city.nameEn || city.name
      )
    ]);

    return {
      code: country.code,
      country,
      aliases,
      normalizedNameAr: normalize(country.nameAr),
      normalizedNameEn: normalize(country.nameEn),
      normalizedCode: normalize(country.code),
      normalizedCapital: normalize(country.capital),
      normalizedAliases: aliases.map(normalize).filter(Boolean),
      searchText: normalize(aliases.join(" "))
    };
  };

  const init = ({ force = false } = {}) => {
    if (state.initialized && !force) {
      return diagnostics();
    }

    const countries = getRawCountries()
      .map(normalizeCountry)
      .filter((country) => country.code);

    state.countries = countries;
    state.index = countries.map(buildIndexEntry);
    state.byCode = new Map(
      countries.map((country) => [country.code, country])
    );
    state.grouped = null;
    state.searchCache.clear();
    state.initialized = true;

    return diagnostics();
  };

  const ensureInitialized = () => {
    if (!state.initialized) {
      init();
    }
  };

  /* =========================================================
     Search ranking
  ========================================================= */

  const scoreEntry = (entry, query) => {
    if (!query) return 1;

    let score = 0;

    if (entry.normalizedCode === query) {
      score += 100;
    }

    if (entry.normalizedNameAr === query) {
      score += 95;
    }

    if (entry.normalizedNameEn === query) {
      score += 90;
    }

    if (entry.normalizedCapital === query) {
      score += 80;
    }

    if (entry.normalizedNameAr.startsWith(query)) {
      score += 70;
    }

    if (entry.normalizedNameEn.startsWith(query)) {
      score += 65;
    }

    if (entry.normalizedCapital.startsWith(query)) {
      score += 55;
    }

    if (entry.normalizedAliases.some((alias) => alias === query)) {
      score += 50;
    }

    if (entry.normalizedNameAr.includes(query)) {
      score += 40;
    }

    if (entry.normalizedNameEn.includes(query)) {
      score += 35;
    }

    if (entry.normalizedCapital.includes(query)) {
      score += 25;
    }

    if (entry.searchText.includes(query)) {
      score += 20;
    }

    const queryTokens = query.split(" ").filter(Boolean);

    if (
      queryTokens.length > 1 &&
      queryTokens.every((token) =>
        entry.searchText.includes(token)
      )
    ) {
      score += 15;
    }

    return score;
  };

  const search = (query = "", options = {}) => {
    ensureInitialized();

    const normalizedQuery = normalize(query);
    const limit = clamp(
      number(options.limit, DEFAULT_LIMIT),
      1,
      MAX_LIMIT
    );

    const cacheKey = `${normalizedQuery}|${limit}`;

    if (
      options.forceRefresh !== true &&
      state.searchCache.has(cacheKey)
    ) {
      return clone(state.searchCache.get(cacheKey));
    }

    let results;

    if (!normalizedQuery) {
      results = state.countries
        .slice()
        .sort((a, b) =>
          text(a.nameAr).localeCompare(
            text(b.nameAr),
            "ar",
            { sensitivity: "base" }
          )
        )
        .slice(0, limit);
    } else {
      results = state.index
        .map((entry) => ({
          entry,
          score: scoreEntry(entry, normalizedQuery)
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }

          return text(a.entry.country.nameAr).localeCompare(
            text(b.entry.country.nameAr),
            "ar",
            { sensitivity: "base" }
          );
        })
        .slice(0, limit)
        .map((item) => ({
          ...item.entry.country,
          searchScore: item.score
        }));
    }

    state.searchCache.set(cacheKey, clone(results));

    return results;
  };

  /* =========================================================
     Grouping
  ========================================================= */

  const group = (list) => {
    const groups = new Map();

    safeArray(list).forEach((country) => {
      const firstLetter =
        normalizeArabic(country.nameAr || "#")
          .charAt(0) || "#";

      if (!groups.has(firstLetter)) {
        groups.set(firstLetter, []);
      }

      groups.get(firstLetter).push(country);
    });

    return [...groups.entries()]
      .sort(([a], [b]) =>
        a.localeCompare(b, "ar", {
          sensitivity: "base"
        })
      )
      .map(([letter, countries]) => ({
        letter,
        countries: countries
          .slice()
          .sort((a, b) =>
            text(a.nameAr).localeCompare(
              text(b.nameAr),
              "ar",
              { sensitivity: "base" }
            )
          )
      }));
  };

  const grouped = () => {
    ensureInitialized();

    if (!state.grouped) {
      state.grouped = group(state.countries);
    }

    return clone(state.grouped);
  };

  const groupedSearch = (query = "", options = {}) =>
    group(
      search(query, {
        ...options,
        limit: options.limit || MAX_LIMIT
      })
    );

  /* =========================================================
     Country access
  ========================================================= */

  const all = (options = {}) => {
    ensureInitialized();

    const list = state.countries.slice();

    if (options.sorted === false) {
      return clone(list);
    }

    return clone(
      list.sort((a, b) =>
        text(a.nameAr).localeCompare(
          text(b.nameAr),
          "ar",
          { sensitivity: "base" }
        )
      )
    );
  };

  const getCountry = (code) => {
    ensureInitialized();

    return clone(
      state.byCode.get(normalizeCode(code)) || null
    );
  };

  const hasCountry = (code) => {
    ensureInitialized();

    return state.byCode.has(normalizeCode(code));
  };

  const openCountry = (code, options = {}) => {
    ensureInitialized();

    const normalizedCode = normalizeCode(code);

    if (!normalizedCode || !state.byCode.has(normalizedCode)) {
      return null;
    }

    try {
      if (typeof Knowledge?.buildGuideContext === "function") {
        return (
          Knowledge.buildGuideContext(
            normalizedCode,
            options
          ) || null
        );
      }

      const country = getCountry(normalizedCode);
      const knowledge = getKnowledgeCountry(normalizedCode);

      return {
        country,
        knowledge,
        options: clone(options)
      };
    } catch (error) {
      console.error("TIC Guide Search open country error:", error);
      return null;
    }
  };

  const suggest = (query = "", limit = 8) =>
    search(query, {
      limit: clamp(number(limit, 8), 1, 20)
    }).map((country) => ({
      code: country.code,
      nameAr: country.nameAr,
      nameEn: country.nameEn,
      flag: country.flag,
      capital: country.capital,
      label: `${country.flag || "🌍"} ${country.nameAr}`,
      value: country.code
    }));

  const clearCache = () => {
    state.searchCache.clear();
    state.grouped = null;
    return true;
  };

  /* =========================================================
     Public API
  ========================================================= */

  const Engine = {
    id: ENGINE_ID,
    version: ENGINE_VERSION,

    init,
    all,
    search,
    suggest,
    grouped,
    groupedSearch,
    group,
    getCountry,
    hasCountry,
    openCountry,
    clearCache,

    diagnostics() {
      ensureInitialized();

      return {
        id: ENGINE_ID,
        version: ENGINE_VERSION,
        initialized: state.initialized,
        countries: state.countries.length,
        indexedCountries: state.index.length,
        searchable: search("", {
          limit: MAX_LIMIT
        }).length,
        groups: grouped().length,
        cacheEntries: state.searchCache.size,
        countriesDataAvailable: Boolean(Countries),
        travelKnowledgeAvailable: Boolean(Knowledge)
      };
    }
  };

  window.TIC = window.TIC || {};
  window.TIC.Features = window.TIC.Features || {};
  window.TIC.Features.GuideSearch = Engine;
  window.TICGuideSearch = Engine;

  init();
})(window);
