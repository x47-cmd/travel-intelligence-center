/* =========================================================
   Travel Intelligence Center
   Countries Catalog V1.0.0

   File Path:
   js/data/countries-catalog.js

   Purpose:
   - Single authoritative country catalog for the Smart Travel Guide.
   - Includes 195 sovereign states (193 UN members + Palestine + Holy See).
   - Provides Arabic/English names, flags, ISO codes, continents,
     currencies, official language codes, aliases and normalized search.
   - Keeps page modules independent from country data structure.
   - Supports future guide enrichment without changing guide.js.

   Architecture Rule:
   - UI reads this file only through the public API below.
   - Future country metadata can be merged through register()/registerMany().
   - Do not hard-code countries inside page files.

   Dependencies:
   - None

   Global APIs:
   - window.TIC.Data.Countries
   - window.TICCountriesCatalog
========================================================= */

(function (window) {
  "use strict";

  const MODULE_ID = "countries-catalog";
  const MODULE_VERSION = "1.0.0";
  const EXPECTED_COUNTRY_COUNT = 195;

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

  const normalizeSearch = (value) =>
    text(value)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[إأآٱ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const uniqueStrings = (values) =>
    Array.from(
      new Set(
        (Array.isArray(values) ? values : [])
          .map(text)
          .filter(Boolean)
      )
    );

  const COUNTRY_SEED = [
  {
    "id": "country_is",
    "iso2": "IS",
    "iso3": "ISL",
    "numeric": "352",
    "nameAr": "آيسلندا",
    "nameEn": "Iceland",
    "flag": "🇮🇸",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "ISK",
    "languages": [
      "is"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "ايسلندا",
      "iceland",
      "is",
      "isl"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_az",
    "iso2": "AZ",
    "iso3": "AZE",
    "numeric": "031",
    "nameAr": "أذربيجان",
    "nameEn": "Azerbaijan",
    "flag": "🇦🇿",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "AZN",
    "languages": [
      "az",
      "az_Cyrl"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "اذربيجان",
      "azerbaijan",
      "az",
      "aze"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_am",
    "iso2": "AM",
    "iso3": "ARM",
    "numeric": "051",
    "nameAr": "أرمينيا",
    "nameEn": "Armenia",
    "flag": "🇦🇲",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "AMD",
    "languages": [
      "hy"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "ارمينيا",
      "armenia",
      "am",
      "arm"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_au",
    "iso2": "AU",
    "iso3": "AUS",
    "numeric": "036",
    "nameAr": "أستراليا",
    "nameEn": "Australia",
    "flag": "🇦🇺",
    "continent": "oceania",
    "continentAr": "أوقيانوسيا",
    "continentEn": "Oceania",
    "currency": "AUD",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "استراليا",
      "australia",
      "au",
      "aus"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_af",
    "iso2": "AF",
    "iso3": "AFG",
    "numeric": "004",
    "nameAr": "أفغانستان",
    "nameEn": "Afghanistan",
    "flag": "🇦🇫",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "AFN",
    "languages": [
      "fa",
      "ps",
      "uz_Arab",
      "tk"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "افغانستان",
      "afghanistan",
      "af",
      "afg"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_al",
    "iso2": "AL",
    "iso3": "ALB",
    "numeric": "008",
    "nameAr": "ألبانيا",
    "nameEn": "Albania",
    "flag": "🇦🇱",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "ALL",
    "languages": [
      "sq"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "البانيا",
      "albania",
      "al",
      "alb"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_de",
    "iso2": "DE",
    "iso3": "DEU",
    "numeric": "276",
    "nameAr": "ألمانيا",
    "nameEn": "Germany",
    "flag": "🇩🇪",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "de",
      "frr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "المانيا",
      "germany",
      "de",
      "deu"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ag",
    "iso2": "AG",
    "iso3": "ATG",
    "numeric": "028",
    "nameAr": "أنتيغوا وبربودا",
    "nameEn": "Antigua & Barbuda",
    "flag": "🇦🇬",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "XCD",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "انتيغوا وبربودا",
      "antigua barbuda",
      "ag",
      "atg"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ad",
    "iso2": "AD",
    "iso3": "AND",
    "numeric": "020",
    "nameAr": "أندورا",
    "nameEn": "Andorra",
    "flag": "🇦🇩",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "ca"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "اندورا",
      "andorra",
      "ad",
      "and"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ao",
    "iso2": "AO",
    "iso3": "AGO",
    "numeric": "024",
    "nameAr": "أنغولا",
    "nameEn": "Angola",
    "flag": "🇦🇴",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "AOA",
    "languages": [
      "pt"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "انغولا",
      "angola",
      "ao",
      "ago"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_uy",
    "iso2": "UY",
    "iso3": "URY",
    "numeric": "858",
    "nameAr": "أورغواي",
    "nameEn": "Uruguay",
    "flag": "🇺🇾",
    "continent": "south-america",
    "continentAr": "أمريكا الجنوبية",
    "continentEn": "South America",
    "currency": "UYU",
    "languages": [
      "es"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "اورغواي",
      "uruguay",
      "uy",
      "ury"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_uz",
    "iso2": "UZ",
    "iso3": "UZB",
    "numeric": "860",
    "nameAr": "أوزبكستان",
    "nameEn": "Uzbekistan",
    "flag": "🇺🇿",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "UZS",
    "languages": [
      "uz",
      "uz_Cyrl"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "اوزبكستان",
      "uzbekistan",
      "uz",
      "uzb"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ug",
    "iso2": "UG",
    "iso3": "UGA",
    "numeric": "800",
    "nameAr": "أوغندا",
    "nameEn": "Uganda",
    "flag": "🇺🇬",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "UGX",
    "languages": [
      "sw",
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "اوغندا",
      "uganda",
      "ug",
      "uga"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ua",
    "iso2": "UA",
    "iso3": "UKR",
    "numeric": "804",
    "nameAr": "أوكرانيا",
    "nameEn": "Ukraine",
    "flag": "🇺🇦",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "UAH",
    "languages": [
      "uk",
      "ru"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "اوكرانيا",
      "ukraine",
      "ua",
      "ukr"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ie",
    "iso2": "IE",
    "iso3": "IRL",
    "numeric": "372",
    "nameAr": "أيرلندا",
    "nameEn": "Ireland",
    "flag": "🇮🇪",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "en",
      "ga"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "ايرلندا",
      "ireland",
      "ie",
      "irl"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_et",
    "iso2": "ET",
    "iso3": "ETH",
    "numeric": "231",
    "nameAr": "إثيوبيا",
    "nameEn": "Ethiopia",
    "flag": "🇪🇹",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "ETB",
    "languages": [
      "am"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "اثيوبيا",
      "ethiopia",
      "et",
      "eth"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_er",
    "iso2": "ER",
    "iso3": "ERI",
    "numeric": "232",
    "nameAr": "إريتريا",
    "nameEn": "Eritrea",
    "flag": "🇪🇷",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "ERN",
    "languages": [
      "ti",
      "en",
      "ar"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "اريتريا",
      "eritrea",
      "er",
      "eri"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_es",
    "iso2": "ES",
    "iso3": "ESP",
    "numeric": "724",
    "nameAr": "إسبانيا",
    "nameEn": "Spain",
    "flag": "🇪🇸",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "es",
      "ca",
      "gl",
      "eu"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "اسبانيا",
      "spain",
      "es",
      "esp"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ee",
    "iso2": "EE",
    "iso3": "EST",
    "numeric": "233",
    "nameAr": "إستونيا",
    "nameEn": "Estonia",
    "flag": "🇪🇪",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "et"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "استونيا",
      "estonia",
      "ee",
      "est"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_il",
    "iso2": "IL",
    "iso3": "ISR",
    "numeric": "376",
    "nameAr": "إسرائيل",
    "nameEn": "Israel",
    "flag": "🇮🇱",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "ILS",
    "languages": [
      "he",
      "ar"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "اسراييل",
      "israel",
      "il",
      "isr"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_sz",
    "iso2": "SZ",
    "iso3": "SWZ",
    "numeric": "748",
    "nameAr": "إسواتيني",
    "nameEn": "Eswatini",
    "flag": "🇸🇿",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "SZL",
    "languages": [
      "en",
      "ss"
    ],
    "aliasesAr": [
      "إسواتيني",
      "سوازيلاند"
    ],
    "aliasesEn": [
      "Swaziland",
      "Eswatini"
    ],
    "searchTerms": [
      "اسواتيني",
      "eswatini",
      "sz",
      "swz",
      "سوازيلاند",
      "swaziland"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_id",
    "iso2": "ID",
    "iso3": "IDN",
    "numeric": "360",
    "nameAr": "إندونيسيا",
    "nameEn": "Indonesia",
    "flag": "🇮🇩",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "IDR",
    "languages": [
      "id"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "اندونيسيا",
      "indonesia",
      "id",
      "idn"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ir",
    "iso2": "IR",
    "iso3": "IRN",
    "numeric": "364",
    "nameAr": "إيران",
    "nameEn": "Iran",
    "flag": "🇮🇷",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "IRR",
    "languages": [
      "fa"
    ],
    "aliasesAr": [
      "إيران"
    ],
    "aliasesEn": [],
    "searchTerms": [
      "ايران",
      "iran",
      "ir",
      "irn"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_it",
    "iso2": "IT",
    "iso3": "ITA",
    "numeric": "380",
    "nameAr": "إيطاليا",
    "nameEn": "Italy",
    "flag": "🇮🇹",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "it",
      "fr",
      "vec"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "ايطاليا",
      "italy",
      "it",
      "ita"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ps",
    "iso2": "PS",
    "iso3": "PSE",
    "numeric": "275",
    "nameAr": "الأراضي الفلسطينية",
    "nameEn": "Palestinian Territories",
    "flag": "🇵🇸",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "JOD",
    "languages": [
      "ar"
    ],
    "aliasesAr": [
      "فلسطين",
      "الأراضي الفلسطينية"
    ],
    "aliasesEn": [
      "Palestine",
      "Palestinian Territories"
    ],
    "searchTerms": [
      "الاراضي الفلسطينيه",
      "palestinian territories",
      "ps",
      "pse",
      "فلسطين",
      "palestine"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ar",
    "iso2": "AR",
    "iso3": "ARG",
    "numeric": "032",
    "nameAr": "الأرجنتين",
    "nameEn": "Argentina",
    "flag": "🇦🇷",
    "continent": "south-america",
    "continentAr": "أمريكا الجنوبية",
    "continentEn": "South America",
    "currency": "ARS",
    "languages": [
      "es"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "الارجنتين",
      "argentina",
      "ar",
      "arg"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_jo",
    "iso2": "JO",
    "iso3": "JOR",
    "numeric": "400",
    "nameAr": "الأردن",
    "nameEn": "Jordan",
    "flag": "🇯🇴",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "JOD",
    "languages": [
      "ar"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "الاردن",
      "jordan",
      "jo",
      "jor"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ec",
    "iso2": "EC",
    "iso3": "ECU",
    "numeric": "218",
    "nameAr": "الإكوادور",
    "nameEn": "Ecuador",
    "flag": "🇪🇨",
    "continent": "south-america",
    "continentAr": "أمريكا الجنوبية",
    "continentEn": "South America",
    "currency": "USD",
    "languages": [
      "es",
      "qu"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "الاكوادور",
      "ecuador",
      "ec",
      "ecu"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ae",
    "iso2": "AE",
    "iso3": "ARE",
    "numeric": "784",
    "nameAr": "الإمارات العربية المتحدة",
    "nameEn": "United Arab Emirates",
    "flag": "🇦🇪",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "AED",
    "languages": [
      "ar"
    ],
    "aliasesAr": [
      "الامارات",
      "الإمارات العربية المتحدة"
    ],
    "aliasesEn": [
      "UAE",
      "Emirates"
    ],
    "searchTerms": [
      "الامارات العربيه المتحده",
      "united arab emirates",
      "ae",
      "are",
      "الامارات",
      "uae",
      "emirates"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_bh",
    "iso2": "BH",
    "iso3": "BHR",
    "numeric": "048",
    "nameAr": "البحرين",
    "nameEn": "Bahrain",
    "flag": "🇧🇭",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "BHD",
    "languages": [
      "ar"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "البحرين",
      "bahrain",
      "bh",
      "bhr"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_br",
    "iso2": "BR",
    "iso3": "BRA",
    "numeric": "076",
    "nameAr": "البرازيل",
    "nameEn": "Brazil",
    "flag": "🇧🇷",
    "continent": "south-america",
    "continentAr": "أمريكا الجنوبية",
    "continentEn": "South America",
    "currency": "BRL",
    "languages": [
      "pt",
      "vec"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "البرازيل",
      "brazil",
      "br",
      "bra"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_pt",
    "iso2": "PT",
    "iso3": "PRT",
    "numeric": "620",
    "nameAr": "البرتغال",
    "nameEn": "Portugal",
    "flag": "🇵🇹",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "pt"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "البرتغال",
      "portugal",
      "pt",
      "prt"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ba",
    "iso2": "BA",
    "iso3": "BIH",
    "numeric": "070",
    "nameAr": "البوسنة والهرسك",
    "nameEn": "Bosnia & Herzegovina",
    "flag": "🇧🇦",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "BAM",
    "languages": [
      "bs",
      "bs_Cyrl",
      "hr",
      "sr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "البوسنه والهرسك",
      "bosnia herzegovina",
      "ba",
      "bih"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_cz",
    "iso2": "CZ",
    "iso3": "CZE",
    "numeric": "203",
    "nameAr": "التشيك",
    "nameEn": "Czechia",
    "flag": "🇨🇿",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "CZK",
    "languages": [
      "cs"
    ],
    "aliasesAr": [
      "التشيك",
      "تشيكيا"
    ],
    "aliasesEn": [
      "Czech Republic",
      "Czechia"
    ],
    "searchTerms": [
      "التشيك",
      "czechia",
      "cz",
      "cze",
      "تشيكيا",
      "czech republic"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_me",
    "iso2": "ME",
    "iso3": "MNE",
    "numeric": "499",
    "nameAr": "الجبل الأسود",
    "nameEn": "Montenegro",
    "flag": "🇲🇪",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "sr_Latn"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "الجبل الاسود",
      "montenegro",
      "me",
      "mne"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_dz",
    "iso2": "DZ",
    "iso3": "DZA",
    "numeric": "012",
    "nameAr": "الجزائر",
    "nameEn": "Algeria",
    "flag": "🇩🇿",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "DZD",
    "languages": [
      "ar",
      "fr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "الجزاير",
      "algeria",
      "dz",
      "dza"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_dk",
    "iso2": "DK",
    "iso3": "DNK",
    "numeric": "208",
    "nameAr": "الدانمرك",
    "nameEn": "Denmark",
    "flag": "🇩🇰",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "DKK",
    "languages": [
      "da",
      "de",
      "kl"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "الدانمرك",
      "denmark",
      "dk",
      "dnk"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_cv",
    "iso2": "CV",
    "iso3": "CPV",
    "numeric": "132",
    "nameAr": "الرأس الأخضر",
    "nameEn": "Cape Verde",
    "flag": "🇨🇻",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "CVE",
    "languages": [
      "pt"
    ],
    "aliasesAr": [
      "الرأس الأخضر",
      "كاب فيردي"
    ],
    "aliasesEn": [
      "Cape Verde",
      "Cabo Verde"
    ],
    "searchTerms": [
      "الراس الاخضر",
      "cape verde",
      "cv",
      "cpv",
      "كاب فيردي",
      "cabo verde"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_sv",
    "iso2": "SV",
    "iso3": "SLV",
    "numeric": "222",
    "nameAr": "السلفادور",
    "nameEn": "El Salvador",
    "flag": "🇸🇻",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "USD",
    "languages": [
      "es"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "السلفادور",
      "el salvador",
      "sv",
      "slv"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_sn",
    "iso2": "SN",
    "iso3": "SEN",
    "numeric": "686",
    "nameAr": "السنغال",
    "nameEn": "Senegal",
    "flag": "🇸🇳",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "XOF",
    "languages": [
      "wo",
      "fr",
      "ff",
      "srr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "السنغال",
      "senegal",
      "sn",
      "sen"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_sd",
    "iso2": "SD",
    "iso3": "SDN",
    "numeric": "729",
    "nameAr": "السودان",
    "nameEn": "Sudan",
    "flag": "🇸🇩",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "SDG",
    "languages": [
      "ar",
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "السودان",
      "sudan",
      "sd",
      "sdn"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_se",
    "iso2": "SE",
    "iso3": "SWE",
    "numeric": "752",
    "nameAr": "السويد",
    "nameEn": "Sweden",
    "flag": "🇸🇪",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "SEK",
    "languages": [
      "sv",
      "fi"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "السويد",
      "sweden",
      "se",
      "swe"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_so",
    "iso2": "SO",
    "iso3": "SOM",
    "numeric": "706",
    "nameAr": "الصومال",
    "nameEn": "Somalia",
    "flag": "🇸🇴",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "SOS",
    "languages": [
      "so",
      "ar"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "الصومال",
      "somalia",
      "so",
      "som"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_cn",
    "iso2": "CN",
    "iso3": "CHN",
    "numeric": "156",
    "nameAr": "الصين",
    "nameEn": "China",
    "flag": "🇨🇳",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "CNY",
    "languages": [
      "zh",
      "ug",
      "za",
      "mn_Mong"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "الصين",
      "china",
      "cn",
      "chn"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_iq",
    "iso2": "IQ",
    "iso3": "IRQ",
    "numeric": "368",
    "nameAr": "العراق",
    "nameEn": "Iraq",
    "flag": "🇮🇶",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "IQD",
    "languages": [
      "ar",
      "ckb",
      "az_Arab"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "العراق",
      "iraq",
      "iq",
      "irq"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ga",
    "iso2": "GA",
    "iso3": "GAB",
    "numeric": "266",
    "nameAr": "الغابون",
    "nameEn": "Gabon",
    "flag": "🇬🇦",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "XAF",
    "languages": [
      "fr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "الغابون",
      "gabon",
      "ga",
      "gab"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_va",
    "iso2": "VA",
    "iso3": "VAT",
    "numeric": "336",
    "nameAr": "الفاتيكان",
    "nameEn": "Vatican City",
    "flag": "🇻🇦",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "it"
    ],
    "aliasesAr": [
      "الفاتيكان",
      "الكرسي الرسولي"
    ],
    "aliasesEn": [
      "Vatican",
      "Vatican City",
      "Holy See"
    ],
    "searchTerms": [
      "الفاتيكان",
      "vatican city",
      "va",
      "vat",
      "الكرسي الرسولي",
      "vatican",
      "holy see"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ph",
    "iso2": "PH",
    "iso3": "PHL",
    "numeric": "608",
    "nameAr": "الفلبين",
    "nameEn": "Philippines",
    "flag": "🇵🇭",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "PHP",
    "languages": [
      "en",
      "fil",
      "ceb",
      "ilo"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "الفلبين",
      "philippines",
      "ph",
      "phl"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_cm",
    "iso2": "CM",
    "iso3": "CMR",
    "numeric": "120",
    "nameAr": "الكاميرون",
    "nameEn": "Cameroon",
    "flag": "🇨🇲",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "XAF",
    "languages": [
      "fr",
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "الكاميرون",
      "cameroon",
      "cm",
      "cmr"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_cg",
    "iso2": "CG",
    "iso3": "COG",
    "numeric": "178",
    "nameAr": "الكونغو - برازافيل",
    "nameEn": "Congo - Brazzaville",
    "flag": "🇨🇬",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "XAF",
    "languages": [
      "fr"
    ],
    "aliasesAr": [
      "الكونغو"
    ],
    "aliasesEn": [
      "Republic of Congo",
      "Congo Brazzaville"
    ],
    "searchTerms": [
      "الكونغو برازافيل",
      "congo brazzaville",
      "cg",
      "cog",
      "الكونغو",
      "republic of congo"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_cd",
    "iso2": "CD",
    "iso3": "COD",
    "numeric": "180",
    "nameAr": "الكونغو - كينشاسا",
    "nameEn": "Congo - Kinshasa",
    "flag": "🇨🇩",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "CDF",
    "languages": [
      "fr",
      "sw",
      "lua",
      "ln"
    ],
    "aliasesAr": [
      "الكونغو الديمقراطية"
    ],
    "aliasesEn": [
      "DR Congo",
      "Congo Kinshasa"
    ],
    "searchTerms": [
      "الكونغو كينشاسا",
      "congo kinshasa",
      "cd",
      "cod",
      "الكونغو الديمقراطيه",
      "dr congo"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_kw",
    "iso2": "KW",
    "iso3": "KWT",
    "numeric": "414",
    "nameAr": "الكويت",
    "nameEn": "Kuwait",
    "flag": "🇰🇼",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "KWD",
    "languages": [
      "ar"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "الكويت",
      "kuwait",
      "kw",
      "kwt"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ma",
    "iso2": "MA",
    "iso3": "MAR",
    "numeric": "504",
    "nameAr": "المغرب",
    "nameEn": "Morocco",
    "flag": "🇲🇦",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "MAD",
    "languages": [
      "ar",
      "fr",
      "tzm"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "المغرب",
      "morocco",
      "ma",
      "mar"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_mx",
    "iso2": "MX",
    "iso3": "MEX",
    "numeric": "484",
    "nameAr": "المكسيك",
    "nameEn": "Mexico",
    "flag": "🇲🇽",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "MXN",
    "languages": [
      "es"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "المكسيك",
      "mexico",
      "mx",
      "mex"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_sa",
    "iso2": "SA",
    "iso3": "SAU",
    "numeric": "682",
    "nameAr": "المملكة العربية السعودية",
    "nameEn": "Saudi Arabia",
    "flag": "🇸🇦",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "SAR",
    "languages": [
      "ar"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "المملكه العربيه السعوديه",
      "saudi arabia",
      "sa",
      "sau"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_gb",
    "iso2": "GB",
    "iso3": "GBR",
    "numeric": "826",
    "nameAr": "المملكة المتحدة",
    "nameEn": "United Kingdom",
    "flag": "🇬🇧",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "GBP",
    "languages": [
      "en",
      "cy",
      "ga",
      "gd"
    ],
    "aliasesAr": [
      "بريطانيا",
      "المملكة المتحدة",
      "انجلترا",
      "إنجلترا"
    ],
    "aliasesEn": [
      "UK",
      "Britain",
      "Great Britain",
      "England"
    ],
    "searchTerms": [
      "المملكه المتحده",
      "united kingdom",
      "gb",
      "gbr",
      "بريطانيا",
      "انجلترا",
      "uk",
      "britain",
      "great britain",
      "england"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_no",
    "iso2": "NO",
    "iso3": "NOR",
    "numeric": "578",
    "nameAr": "النرويج",
    "nameEn": "Norway",
    "flag": "🇳🇴",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "NOK",
    "languages": [
      "nb",
      "no",
      "nn",
      "se"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "النرويج",
      "norway",
      "no",
      "nor"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_at",
    "iso2": "AT",
    "iso3": "AUT",
    "numeric": "040",
    "nameAr": "النمسا",
    "nameEn": "Austria",
    "flag": "🇦🇹",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "de",
      "hr",
      "sl",
      "hu"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "النمسا",
      "austria",
      "at",
      "aut"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ne",
    "iso2": "NE",
    "iso3": "NER",
    "numeric": "562",
    "nameAr": "النيجر",
    "nameEn": "Niger",
    "flag": "🇳🇪",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "XOF",
    "languages": [
      "fr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "النيجر",
      "niger",
      "ne",
      "ner"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_in",
    "iso2": "IN",
    "iso3": "IND",
    "numeric": "356",
    "nameAr": "الهند",
    "nameEn": "India",
    "flag": "🇮🇳",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "INR",
    "languages": [
      "hi",
      "en",
      "bn",
      "te"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "الهند",
      "india",
      "in",
      "ind"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_us",
    "iso2": "US",
    "iso3": "USA",
    "numeric": "840",
    "nameAr": "الولايات المتحدة",
    "nameEn": "United States",
    "flag": "🇺🇸",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "USD",
    "languages": [
      "en",
      "es",
      "haw"
    ],
    "aliasesAr": [
      "امريكا",
      "أمريكا",
      "الولايات المتحدة"
    ],
    "aliasesEn": [
      "USA",
      "United States",
      "America"
    ],
    "searchTerms": [
      "الولايات المتحده",
      "united states",
      "us",
      "usa",
      "امريكا",
      "america"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_jp",
    "iso2": "JP",
    "iso3": "JPN",
    "numeric": "392",
    "nameAr": "اليابان",
    "nameEn": "Japan",
    "flag": "🇯🇵",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "JPY",
    "languages": [
      "ja"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "اليابان",
      "japan",
      "jp",
      "jpn"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ye",
    "iso2": "YE",
    "iso3": "YEM",
    "numeric": "887",
    "nameAr": "اليمن",
    "nameEn": "Yemen",
    "flag": "🇾🇪",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "YER",
    "languages": [
      "ar"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "اليمن",
      "yemen",
      "ye",
      "yem"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_gr",
    "iso2": "GR",
    "iso3": "GRC",
    "numeric": "300",
    "nameAr": "اليونان",
    "nameEn": "Greece",
    "flag": "🇬🇷",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "el"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "اليونان",
      "greece",
      "gr",
      "grc"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_pg",
    "iso2": "PG",
    "iso3": "PNG",
    "numeric": "598",
    "nameAr": "بابوا غينيا الجديدة",
    "nameEn": "Papua New Guinea",
    "flag": "🇵🇬",
    "continent": "oceania",
    "continentAr": "أوقيانوسيا",
    "continentEn": "Oceania",
    "currency": "PGK",
    "languages": [
      "tpi",
      "en",
      "ho"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "بابوا غينيا الجديده",
      "papua new guinea",
      "pg",
      "png"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_py",
    "iso2": "PY",
    "iso3": "PRY",
    "numeric": "600",
    "nameAr": "باراغواي",
    "nameEn": "Paraguay",
    "flag": "🇵🇾",
    "continent": "south-america",
    "continentAr": "أمريكا الجنوبية",
    "continentEn": "South America",
    "currency": "PYG",
    "languages": [
      "gn",
      "es"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "باراغواي",
      "paraguay",
      "py",
      "pry"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_pk",
    "iso2": "PK",
    "iso3": "PAK",
    "numeric": "586",
    "nameAr": "باكستان",
    "nameEn": "Pakistan",
    "flag": "🇵🇰",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "PKR",
    "languages": [
      "ur",
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "باكستان",
      "pakistan",
      "pk",
      "pak"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_pw",
    "iso2": "PW",
    "iso3": "PLW",
    "numeric": "585",
    "nameAr": "بالاو",
    "nameEn": "Palau",
    "flag": "🇵🇼",
    "continent": "oceania",
    "continentAr": "أوقيانوسيا",
    "continentEn": "Oceania",
    "currency": "USD",
    "languages": [
      "pau",
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "بالاو",
      "palau",
      "pw",
      "plw"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_bb",
    "iso2": "BB",
    "iso3": "BRB",
    "numeric": "052",
    "nameAr": "بربادوس",
    "nameEn": "Barbados",
    "flag": "🇧🇧",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "BBD",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "بربادوس",
      "barbados",
      "bb",
      "brb"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_bn",
    "iso2": "BN",
    "iso3": "BRN",
    "numeric": "096",
    "nameAr": "بروناي",
    "nameEn": "Brunei",
    "flag": "🇧🇳",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "BND",
    "languages": [
      "ms",
      "ms_Arab"
    ],
    "aliasesAr": [
      "بروناي"
    ],
    "aliasesEn": [],
    "searchTerms": [
      "بروناي",
      "brunei",
      "bn",
      "brn"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_be",
    "iso2": "BE",
    "iso3": "BEL",
    "numeric": "056",
    "nameAr": "بلجيكا",
    "nameEn": "Belgium",
    "flag": "🇧🇪",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "nl",
      "fr",
      "de"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "بلجيكا",
      "belgium",
      "be",
      "bel"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_bg",
    "iso2": "BG",
    "iso3": "BGR",
    "numeric": "100",
    "nameAr": "بلغاريا",
    "nameEn": "Bulgaria",
    "flag": "🇧🇬",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "BGN",
    "languages": [
      "bg"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "بلغاريا",
      "bulgaria",
      "bg",
      "bgr"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_bz",
    "iso2": "BZ",
    "iso3": "BLZ",
    "numeric": "084",
    "nameAr": "بليز",
    "nameEn": "Belize",
    "flag": "🇧🇿",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "BZD",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "بليز",
      "belize",
      "bz",
      "blz"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_bd",
    "iso2": "BD",
    "iso3": "BGD",
    "numeric": "050",
    "nameAr": "بنغلاديش",
    "nameEn": "Bangladesh",
    "flag": "🇧🇩",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "BDT",
    "languages": [
      "bn"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "بنغلاديش",
      "bangladesh",
      "bd",
      "bgd"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_pa",
    "iso2": "PA",
    "iso3": "PAN",
    "numeric": "591",
    "nameAr": "بنما",
    "nameEn": "Panama",
    "flag": "🇵🇦",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "USD",
    "languages": [
      "es"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "بنما",
      "panama",
      "pa",
      "pan"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_bj",
    "iso2": "BJ",
    "iso3": "BEN",
    "numeric": "204",
    "nameAr": "بنين",
    "nameEn": "Benin",
    "flag": "🇧🇯",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "XOF",
    "languages": [
      "fr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "بنين",
      "benin",
      "bj",
      "ben"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_bt",
    "iso2": "BT",
    "iso3": "BTN",
    "numeric": "064",
    "nameAr": "بوتان",
    "nameEn": "Bhutan",
    "flag": "🇧🇹",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "BTN",
    "languages": [
      "dz"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "بوتان",
      "bhutan",
      "bt",
      "btn"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_bw",
    "iso2": "BW",
    "iso3": "BWA",
    "numeric": "072",
    "nameAr": "بوتسوانا",
    "nameEn": "Botswana",
    "flag": "🇧🇼",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "BWP",
    "languages": [
      "en",
      "tn"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "بوتسوانا",
      "botswana",
      "bw",
      "bwa"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_bf",
    "iso2": "BF",
    "iso3": "BFA",
    "numeric": "854",
    "nameAr": "بوركينا فاسو",
    "nameEn": "Burkina Faso",
    "flag": "🇧🇫",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "XOF",
    "languages": [
      "fr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "بوركينا فاسو",
      "burkina faso",
      "bf",
      "bfa"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_bi",
    "iso2": "BI",
    "iso3": "BDI",
    "numeric": "108",
    "nameAr": "بوروندي",
    "nameEn": "Burundi",
    "flag": "🇧🇮",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "BIF",
    "languages": [
      "rn",
      "fr",
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "بوروندي",
      "burundi",
      "bi",
      "bdi"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_pl",
    "iso2": "PL",
    "iso3": "POL",
    "numeric": "616",
    "nameAr": "بولندا",
    "nameEn": "Poland",
    "flag": "🇵🇱",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "PLN",
    "languages": [
      "pl",
      "de",
      "csb",
      "lt"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "بولندا",
      "poland",
      "pl",
      "pol"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_bo",
    "iso2": "BO",
    "iso3": "BOL",
    "numeric": "068",
    "nameAr": "بوليفيا",
    "nameEn": "Bolivia",
    "flag": "🇧🇴",
    "continent": "south-america",
    "continentAr": "أمريكا الجنوبية",
    "continentEn": "South America",
    "currency": "BOB",
    "languages": [
      "es",
      "qu",
      "ay"
    ],
    "aliasesAr": [
      "بوليفيا"
    ],
    "aliasesEn": [],
    "searchTerms": [
      "بوليفيا",
      "bolivia",
      "bo",
      "bol"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_pe",
    "iso2": "PE",
    "iso3": "PER",
    "numeric": "604",
    "nameAr": "بيرو",
    "nameEn": "Peru",
    "flag": "🇵🇪",
    "continent": "south-america",
    "continentAr": "أمريكا الجنوبية",
    "continentEn": "South America",
    "currency": "PEN",
    "languages": [
      "es",
      "qu"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "بيرو",
      "peru",
      "pe",
      "per"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_by",
    "iso2": "BY",
    "iso3": "BLR",
    "numeric": "112",
    "nameAr": "بيلاروس",
    "nameEn": "Belarus",
    "flag": "🇧🇾",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "BYN",
    "languages": [
      "be",
      "ru"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "بيلاروس",
      "belarus",
      "by",
      "blr"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_th",
    "iso2": "TH",
    "iso3": "THA",
    "numeric": "764",
    "nameAr": "تايلاند",
    "nameEn": "Thailand",
    "flag": "🇹🇭",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "THB",
    "languages": [
      "th"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "تايلاند",
      "thailand",
      "th",
      "tha"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_tm",
    "iso2": "TM",
    "iso3": "TKM",
    "numeric": "795",
    "nameAr": "تركمانستان",
    "nameEn": "Turkmenistan",
    "flag": "🇹🇲",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "TMT",
    "languages": [
      "tk"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "تركمانستان",
      "turkmenistan",
      "tm",
      "tkm"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_tr",
    "iso2": "TR",
    "iso3": "TUR",
    "numeric": "792",
    "nameAr": "تركيا",
    "nameEn": "Türkiye",
    "flag": "🇹🇷",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "TRY",
    "languages": [
      "tr"
    ],
    "aliasesAr": [
      "تركيا",
      "تركيه"
    ],
    "aliasesEn": [
      "Turkey",
      "Türkiye"
    ],
    "searchTerms": [
      "تركيا",
      "turkiye",
      "tr",
      "tur",
      "تركيه",
      "turkey"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_tt",
    "iso2": "TT",
    "iso3": "TTO",
    "numeric": "780",
    "nameAr": "ترينيداد وتوباغو",
    "nameEn": "Trinidad & Tobago",
    "flag": "🇹🇹",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "TTD",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "ترينيداد وتوباغو",
      "trinidad tobago",
      "tt",
      "tto"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_td",
    "iso2": "TD",
    "iso3": "TCD",
    "numeric": "148",
    "nameAr": "تشاد",
    "nameEn": "Chad",
    "flag": "🇹🇩",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "XAF",
    "languages": [
      "ar",
      "fr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "تشاد",
      "chad",
      "td",
      "tcd"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_cl",
    "iso2": "CL",
    "iso3": "CHL",
    "numeric": "152",
    "nameAr": "تشيلي",
    "nameEn": "Chile",
    "flag": "🇨🇱",
    "continent": "south-america",
    "continentAr": "أمريكا الجنوبية",
    "continentEn": "South America",
    "currency": "CLP",
    "languages": [
      "es"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "تشيلي",
      "chile",
      "cl",
      "chl"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_tz",
    "iso2": "TZ",
    "iso3": "TZA",
    "numeric": "834",
    "nameAr": "تنزانيا",
    "nameEn": "Tanzania",
    "flag": "🇹🇿",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "TZS",
    "languages": [
      "sw",
      "en"
    ],
    "aliasesAr": [
      "تنزانيا"
    ],
    "aliasesEn": [],
    "searchTerms": [
      "تنزانيا",
      "tanzania",
      "tz",
      "tza"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_tg",
    "iso2": "TG",
    "iso3": "TGO",
    "numeric": "768",
    "nameAr": "توغو",
    "nameEn": "Togo",
    "flag": "🇹🇬",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "XOF",
    "languages": [
      "fr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "توغو",
      "togo",
      "tg",
      "tgo"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_tv",
    "iso2": "TV",
    "iso3": "TUV",
    "numeric": "798",
    "nameAr": "توفالو",
    "nameEn": "Tuvalu",
    "flag": "🇹🇻",
    "continent": "oceania",
    "continentAr": "أوقيانوسيا",
    "continentEn": "Oceania",
    "currency": "AUD",
    "languages": [
      "tvl",
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "توفالو",
      "tuvalu",
      "tv",
      "tuv"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_tn",
    "iso2": "TN",
    "iso3": "TUN",
    "numeric": "788",
    "nameAr": "تونس",
    "nameEn": "Tunisia",
    "flag": "🇹🇳",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "TND",
    "languages": [
      "ar",
      "fr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "تونس",
      "tunisia",
      "tn",
      "tun"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_to",
    "iso2": "TO",
    "iso3": "TON",
    "numeric": "776",
    "nameAr": "تونغا",
    "nameEn": "Tonga",
    "flag": "🇹🇴",
    "continent": "oceania",
    "continentAr": "أوقيانوسيا",
    "continentEn": "Oceania",
    "currency": "TOP",
    "languages": [
      "to",
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "تونغا",
      "tonga",
      "to",
      "ton"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_tl",
    "iso2": "TL",
    "iso3": "TLS",
    "numeric": "626",
    "nameAr": "تيمور - ليشتي",
    "nameEn": "Timor-Leste",
    "flag": "🇹🇱",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "USD",
    "languages": [
      "pt",
      "tet"
    ],
    "aliasesAr": [
      "تيمور الشرقية"
    ],
    "aliasesEn": [
      "East Timor",
      "Timor-Leste"
    ],
    "searchTerms": [
      "تيمور ليشتي",
      "timor leste",
      "tl",
      "tls",
      "تيمور الشرقيه",
      "east timor"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_jm",
    "iso2": "JM",
    "iso3": "JAM",
    "numeric": "388",
    "nameAr": "جامايكا",
    "nameEn": "Jamaica",
    "flag": "🇯🇲",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "JMD",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "جامايكا",
      "jamaica",
      "jm",
      "jam"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_bs",
    "iso2": "BS",
    "iso3": "BHS",
    "numeric": "044",
    "nameAr": "جزر البهاما",
    "nameEn": "Bahamas",
    "flag": "🇧🇸",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "BSD",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "جزر البهاما",
      "bahamas",
      "bs",
      "bhs"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_km",
    "iso2": "KM",
    "iso3": "COM",
    "numeric": "174",
    "nameAr": "جزر القمر",
    "nameEn": "Comoros",
    "flag": "🇰🇲",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "KMF",
    "languages": [
      "ar",
      "zdj",
      "wni",
      "fr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "جزر القمر",
      "comoros",
      "km",
      "com"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_mv",
    "iso2": "MV",
    "iso3": "MDV",
    "numeric": "462",
    "nameAr": "جزر المالديف",
    "nameEn": "Maldives",
    "flag": "🇲🇻",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "MVR",
    "languages": [
      "dv"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "جزر المالديف",
      "maldives",
      "mv",
      "mdv"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_sb",
    "iso2": "SB",
    "iso3": "SLB",
    "numeric": "090",
    "nameAr": "جزر سليمان",
    "nameEn": "Solomon Islands",
    "flag": "🇸🇧",
    "continent": "oceania",
    "continentAr": "أوقيانوسيا",
    "continentEn": "Oceania",
    "currency": "SBD",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "جزر سليمان",
      "solomon islands",
      "sb",
      "slb"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_mh",
    "iso2": "MH",
    "iso3": "MHL",
    "numeric": "584",
    "nameAr": "جزر مارشال",
    "nameEn": "Marshall Islands",
    "flag": "🇲🇭",
    "continent": "oceania",
    "continentAr": "أوقيانوسيا",
    "continentEn": "Oceania",
    "currency": "USD",
    "languages": [
      "en",
      "mh"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "جزر مارشال",
      "marshall islands",
      "mh",
      "mhl"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_cf",
    "iso2": "CF",
    "iso3": "CAF",
    "numeric": "140",
    "nameAr": "جمهورية أفريقيا الوسطى",
    "nameEn": "Central African Republic",
    "flag": "🇨🇫",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "XAF",
    "languages": [
      "sg",
      "fr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "جمهوريه افريقيا الوسطي",
      "central african republic",
      "cf",
      "caf"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_do",
    "iso2": "DO",
    "iso3": "DOM",
    "numeric": "214",
    "nameAr": "جمهورية الدومينيكان",
    "nameEn": "Dominican Republic",
    "flag": "🇩🇴",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "DOP",
    "languages": [
      "es"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "جمهوريه الدومينيكان",
      "dominican republic",
      "do",
      "dom"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_za",
    "iso2": "ZA",
    "iso3": "ZAF",
    "numeric": "710",
    "nameAr": "جنوب أفريقيا",
    "nameEn": "South Africa",
    "flag": "🇿🇦",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "ZAR",
    "languages": [
      "en",
      "zu",
      "xh",
      "af"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "جنوب افريقيا",
      "south africa",
      "za",
      "zaf"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ss",
    "iso2": "SS",
    "iso3": "SSD",
    "numeric": "728",
    "nameAr": "جنوب السودان",
    "nameEn": "South Sudan",
    "flag": "🇸🇸",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "SSP",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "جنوب السودان",
      "south sudan",
      "ss",
      "ssd"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ge",
    "iso2": "GE",
    "iso3": "GEO",
    "numeric": "268",
    "nameAr": "جورجيا",
    "nameEn": "Georgia",
    "flag": "🇬🇪",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "GEL",
    "languages": [
      "ka",
      "ab",
      "os"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "جورجيا",
      "georgia",
      "ge",
      "geo"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_dj",
    "iso2": "DJ",
    "iso3": "DJI",
    "numeric": "262",
    "nameAr": "جيبوتي",
    "nameEn": "Djibouti",
    "flag": "🇩🇯",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "DJF",
    "languages": [
      "fr",
      "ar"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "جيبوتي",
      "djibouti",
      "dj",
      "dji"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_dm",
    "iso2": "DM",
    "iso3": "DMA",
    "numeric": "212",
    "nameAr": "دومينيكا",
    "nameEn": "Dominica",
    "flag": "🇩🇲",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "XCD",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "دومينيكا",
      "dominica",
      "dm",
      "dma"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_rw",
    "iso2": "RW",
    "iso3": "RWA",
    "numeric": "646",
    "nameAr": "رواندا",
    "nameEn": "Rwanda",
    "flag": "🇷🇼",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "RWF",
    "languages": [
      "rw",
      "en",
      "fr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "رواندا",
      "rwanda",
      "rw",
      "rwa"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ru",
    "iso2": "RU",
    "iso3": "RUS",
    "numeric": "643",
    "nameAr": "روسيا",
    "nameEn": "Russia",
    "flag": "🇷🇺",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "RUB",
    "languages": [
      "ru",
      "tt",
      "ba",
      "ce"
    ],
    "aliasesAr": [
      "روسيا"
    ],
    "aliasesEn": [],
    "searchTerms": [
      "روسيا",
      "russia",
      "ru",
      "rus"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ro",
    "iso2": "RO",
    "iso3": "ROU",
    "numeric": "642",
    "nameAr": "رومانيا",
    "nameEn": "Romania",
    "flag": "🇷🇴",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "RON",
    "languages": [
      "ro"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "رومانيا",
      "romania",
      "ro",
      "rou"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_zm",
    "iso2": "ZM",
    "iso3": "ZMB",
    "numeric": "894",
    "nameAr": "زامبيا",
    "nameEn": "Zambia",
    "flag": "🇿🇲",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "ZMW",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "زامبيا",
      "zambia",
      "zm",
      "zmb"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_zw",
    "iso2": "ZW",
    "iso3": "ZWE",
    "numeric": "716",
    "nameAr": "زيمبابوي",
    "nameEn": "Zimbabwe",
    "flag": "🇿🇼",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "ZWG",
    "languages": [
      "sn",
      "en",
      "nd"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "زيمبابوي",
      "zimbabwe",
      "zw",
      "zwe"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ci",
    "iso2": "CI",
    "iso3": "CIV",
    "numeric": "384",
    "nameAr": "ساحل العاج",
    "nameEn": "Côte d’Ivoire",
    "flag": "🇨🇮",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "XOF",
    "languages": [
      "fr"
    ],
    "aliasesAr": [
      "ساحل العاج",
      "كوت ديفوار"
    ],
    "aliasesEn": [
      "Ivory Coast",
      "Cote d'Ivoire"
    ],
    "searchTerms": [
      "ساحل العاج",
      "cote d ivoire",
      "ci",
      "civ",
      "كوت ديفوار",
      "ivory coast"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ws",
    "iso2": "WS",
    "iso3": "WSM",
    "numeric": "882",
    "nameAr": "ساموا",
    "nameEn": "Samoa",
    "flag": "🇼🇸",
    "continent": "oceania",
    "continentAr": "أوقيانوسيا",
    "continentEn": "Oceania",
    "currency": "WST",
    "languages": [
      "sm",
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "ساموا",
      "samoa",
      "ws",
      "wsm"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_sm",
    "iso2": "SM",
    "iso3": "SMR",
    "numeric": "674",
    "nameAr": "سان مارينو",
    "nameEn": "San Marino",
    "flag": "🇸🇲",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "it"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "سان مارينو",
      "san marino",
      "sm",
      "smr"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_vc",
    "iso2": "VC",
    "iso3": "VCT",
    "numeric": "670",
    "nameAr": "سانت فنسنت وجزر غرينادين",
    "nameEn": "St. Vincent & Grenadines",
    "flag": "🇻🇨",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "XCD",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "سانت فنسنت وجزر غرينادين",
      "st vincent grenadines",
      "vc",
      "vct"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_kn",
    "iso2": "KN",
    "iso3": "KNA",
    "numeric": "659",
    "nameAr": "سانت كيتس ونيفيس",
    "nameEn": "St. Kitts & Nevis",
    "flag": "🇰🇳",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "XCD",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "سانت كيتس ونيفيس",
      "st kitts nevis",
      "kn",
      "kna"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_lc",
    "iso2": "LC",
    "iso3": "LCA",
    "numeric": "662",
    "nameAr": "سانت لوسيا",
    "nameEn": "St. Lucia",
    "flag": "🇱🇨",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "XCD",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "سانت لوسيا",
      "st lucia",
      "lc",
      "lca"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_st",
    "iso2": "ST",
    "iso3": "STP",
    "numeric": "678",
    "nameAr": "ساو تومي وبرينسيبي",
    "nameEn": "São Tomé & Príncipe",
    "flag": "🇸🇹",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "STN",
    "languages": [
      "pt"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "ساو تومي وبرينسيبي",
      "sao tome principe",
      "st",
      "stp"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_lk",
    "iso2": "LK",
    "iso3": "LKA",
    "numeric": "144",
    "nameAr": "سريلانكا",
    "nameEn": "Sri Lanka",
    "flag": "🇱🇰",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "LKR",
    "languages": [
      "si",
      "ta"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "سريلانكا",
      "sri lanka",
      "lk",
      "lka"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_sk",
    "iso2": "SK",
    "iso3": "SVK",
    "numeric": "703",
    "nameAr": "سلوفاكيا",
    "nameEn": "Slovakia",
    "flag": "🇸🇰",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "sk"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "سلوفاكيا",
      "slovakia",
      "sk",
      "svk"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_si",
    "iso2": "SI",
    "iso3": "SVN",
    "numeric": "705",
    "nameAr": "سلوفينيا",
    "nameEn": "Slovenia",
    "flag": "🇸🇮",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "sl",
      "vec"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "سلوفينيا",
      "slovenia",
      "si",
      "svn"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_sg",
    "iso2": "SG",
    "iso3": "SGP",
    "numeric": "702",
    "nameAr": "سنغافورة",
    "nameEn": "Singapore",
    "flag": "🇸🇬",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "SGD",
    "languages": [
      "en",
      "zh",
      "ms",
      "ta"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "سنغافوره",
      "singapore",
      "sg",
      "sgp"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_sy",
    "iso2": "SY",
    "iso3": "SYR",
    "numeric": "760",
    "nameAr": "سوريا",
    "nameEn": "Syria",
    "flag": "🇸🇾",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "SYP",
    "languages": [
      "ar"
    ],
    "aliasesAr": [
      "سوريا"
    ],
    "aliasesEn": [],
    "searchTerms": [
      "سوريا",
      "syria",
      "sy",
      "syr"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_sr",
    "iso2": "SR",
    "iso3": "SUR",
    "numeric": "740",
    "nameAr": "سورينام",
    "nameEn": "Suriname",
    "flag": "🇸🇷",
    "continent": "south-america",
    "continentAr": "أمريكا الجنوبية",
    "continentEn": "South America",
    "currency": "SRD",
    "languages": [
      "nl"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "سورينام",
      "suriname",
      "sr",
      "sur"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ch",
    "iso2": "CH",
    "iso3": "CHE",
    "numeric": "756",
    "nameAr": "سويسرا",
    "nameEn": "Switzerland",
    "flag": "🇨🇭",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "CHF",
    "languages": [
      "de",
      "gsw",
      "fr",
      "it"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "سويسرا",
      "switzerland",
      "ch",
      "che"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_sl",
    "iso2": "SL",
    "iso3": "SLE",
    "numeric": "694",
    "nameAr": "سيراليون",
    "nameEn": "Sierra Leone",
    "flag": "🇸🇱",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "SLE",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "سيراليون",
      "sierra leone",
      "sl",
      "sle"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_sc",
    "iso2": "SC",
    "iso3": "SYC",
    "numeric": "690",
    "nameAr": "سيشل",
    "nameEn": "Seychelles",
    "flag": "🇸🇨",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "SCR",
    "languages": [
      "fr",
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "سيشل",
      "seychelles",
      "sc",
      "syc"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_rs",
    "iso2": "RS",
    "iso3": "SRB",
    "numeric": "688",
    "nameAr": "صربيا",
    "nameEn": "Serbia",
    "flag": "🇷🇸",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "RSD",
    "languages": [
      "sr",
      "sr_Latn",
      "hu",
      "ro"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "صربيا",
      "serbia",
      "rs",
      "srb"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_tj",
    "iso2": "TJ",
    "iso3": "TJK",
    "numeric": "762",
    "nameAr": "طاجيكستان",
    "nameEn": "Tajikistan",
    "flag": "🇹🇯",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "TJS",
    "languages": [
      "tg"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "طاجيكستان",
      "tajikistan",
      "tj",
      "tjk"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_om",
    "iso2": "OM",
    "iso3": "OMN",
    "numeric": "512",
    "nameAr": "عُمان",
    "nameEn": "Oman",
    "flag": "🇴🇲",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "OMR",
    "languages": [
      "ar"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "عمان",
      "oman",
      "om",
      "omn"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_gm",
    "iso2": "GM",
    "iso3": "GMB",
    "numeric": "270",
    "nameAr": "غامبيا",
    "nameEn": "Gambia",
    "flag": "🇬🇲",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "GMD",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "غامبيا",
      "gambia",
      "gm",
      "gmb"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_gh",
    "iso2": "GH",
    "iso3": "GHA",
    "numeric": "288",
    "nameAr": "غانا",
    "nameEn": "Ghana",
    "flag": "🇬🇭",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "GHS",
    "languages": [
      "ak",
      "en",
      "ee",
      "gaa"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "غانا",
      "ghana",
      "gh",
      "gha"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_gd",
    "iso2": "GD",
    "iso3": "GRD",
    "numeric": "308",
    "nameAr": "غرينادا",
    "nameEn": "Grenada",
    "flag": "🇬🇩",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "XCD",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "غرينادا",
      "grenada",
      "gd",
      "grd"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_gt",
    "iso2": "GT",
    "iso3": "GTM",
    "numeric": "320",
    "nameAr": "غواتيمالا",
    "nameEn": "Guatemala",
    "flag": "🇬🇹",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "GTQ",
    "languages": [
      "es",
      "quc"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "غواتيمالا",
      "guatemala",
      "gt",
      "gtm"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_gy",
    "iso2": "GY",
    "iso3": "GUY",
    "numeric": "328",
    "nameAr": "غيانا",
    "nameEn": "Guyana",
    "flag": "🇬🇾",
    "continent": "south-america",
    "continentAr": "أمريكا الجنوبية",
    "continentEn": "South America",
    "currency": "GYD",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "غيانا",
      "guyana",
      "gy",
      "guy"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_gn",
    "iso2": "GN",
    "iso3": "GIN",
    "numeric": "324",
    "nameAr": "غينيا",
    "nameEn": "Guinea",
    "flag": "🇬🇳",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "GNF",
    "languages": [
      "fr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "غينيا",
      "guinea",
      "gn",
      "gin"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_gq",
    "iso2": "GQ",
    "iso3": "GNQ",
    "numeric": "226",
    "nameAr": "غينيا الاستوائية",
    "nameEn": "Equatorial Guinea",
    "flag": "🇬🇶",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "XAF",
    "languages": [
      "es",
      "fr",
      "pt"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "غينيا الاستواييه",
      "equatorial guinea",
      "gq",
      "gnq"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_gw",
    "iso2": "GW",
    "iso3": "GNB",
    "numeric": "624",
    "nameAr": "غينيا بيساو",
    "nameEn": "Guinea-Bissau",
    "flag": "🇬🇼",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "XOF",
    "languages": [
      "pt"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "غينيا بيساو",
      "guinea bissau",
      "gw",
      "gnb"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_vu",
    "iso2": "VU",
    "iso3": "VUT",
    "numeric": "548",
    "nameAr": "فانواتو",
    "nameEn": "Vanuatu",
    "flag": "🇻🇺",
    "continent": "oceania",
    "continentAr": "أوقيانوسيا",
    "continentEn": "Oceania",
    "currency": "VUV",
    "languages": [
      "bi",
      "en",
      "fr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "فانواتو",
      "vanuatu",
      "vu",
      "vut"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_fr",
    "iso2": "FR",
    "iso3": "FRA",
    "numeric": "250",
    "nameAr": "فرنسا",
    "nameEn": "France",
    "flag": "🇫🇷",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "fr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "فرنسا",
      "france",
      "fr",
      "fra"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ve",
    "iso2": "VE",
    "iso3": "VEN",
    "numeric": "862",
    "nameAr": "فنزويلا",
    "nameEn": "Venezuela",
    "flag": "🇻🇪",
    "continent": "south-america",
    "continentAr": "أمريكا الجنوبية",
    "continentEn": "South America",
    "currency": "VES",
    "languages": [
      "es"
    ],
    "aliasesAr": [
      "فنزويلا"
    ],
    "aliasesEn": [],
    "searchTerms": [
      "فنزويلا",
      "venezuela",
      "ve",
      "ven"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_fi",
    "iso2": "FI",
    "iso3": "FIN",
    "numeric": "246",
    "nameAr": "فنلندا",
    "nameEn": "Finland",
    "flag": "🇫🇮",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "fi",
      "sv",
      "sms"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "فنلندا",
      "finland",
      "fi",
      "fin"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_vn",
    "iso2": "VN",
    "iso3": "VNM",
    "numeric": "704",
    "nameAr": "فيتنام",
    "nameEn": "Vietnam",
    "flag": "🇻🇳",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "VND",
    "languages": [
      "vi"
    ],
    "aliasesAr": [
      "فيتنام"
    ],
    "aliasesEn": [],
    "searchTerms": [
      "فيتنام",
      "vietnam",
      "vn",
      "vnm"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_fj",
    "iso2": "FJ",
    "iso3": "FJI",
    "numeric": "242",
    "nameAr": "فيجي",
    "nameEn": "Fiji",
    "flag": "🇫🇯",
    "continent": "oceania",
    "continentAr": "أوقيانوسيا",
    "continentEn": "Oceania",
    "currency": "FJD",
    "languages": [
      "en",
      "hif",
      "fj"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "فيجي",
      "fiji",
      "fj",
      "fji"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_cy",
    "iso2": "CY",
    "iso3": "CYP",
    "numeric": "196",
    "nameAr": "قبرص",
    "nameEn": "Cyprus",
    "flag": "🇨🇾",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "EUR",
    "languages": [
      "el",
      "tr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "قبرص",
      "cyprus",
      "cy",
      "cyp"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_qa",
    "iso2": "QA",
    "iso3": "QAT",
    "numeric": "634",
    "nameAr": "قطر",
    "nameEn": "Qatar",
    "flag": "🇶🇦",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "QAR",
    "languages": [
      "ar"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "قطر",
      "qatar",
      "qa",
      "qat"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_kg",
    "iso2": "KG",
    "iso3": "KGZ",
    "numeric": "417",
    "nameAr": "قيرغيزستان",
    "nameEn": "Kyrgyzstan",
    "flag": "🇰🇬",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "KGS",
    "languages": [
      "ky",
      "ru"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "قيرغيزستان",
      "kyrgyzstan",
      "kg",
      "kgz"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_kz",
    "iso2": "KZ",
    "iso3": "KAZ",
    "numeric": "398",
    "nameAr": "كازاخستان",
    "nameEn": "Kazakhstan",
    "flag": "🇰🇿",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "KZT",
    "languages": [
      "ru",
      "kk"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "كازاخستان",
      "kazakhstan",
      "kz",
      "kaz"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_hr",
    "iso2": "HR",
    "iso3": "HRV",
    "numeric": "191",
    "nameAr": "كرواتيا",
    "nameEn": "Croatia",
    "flag": "🇭🇷",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "hr",
      "it",
      "vec"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "كرواتيا",
      "croatia",
      "hr",
      "hrv"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_kh",
    "iso2": "KH",
    "iso3": "KHM",
    "numeric": "116",
    "nameAr": "كمبوديا",
    "nameEn": "Cambodia",
    "flag": "🇰🇭",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "KHR",
    "languages": [
      "km"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "كمبوديا",
      "cambodia",
      "kh",
      "khm"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ca",
    "iso2": "CA",
    "iso3": "CAN",
    "numeric": "124",
    "nameAr": "كندا",
    "nameEn": "Canada",
    "flag": "🇨🇦",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "CAD",
    "languages": [
      "en",
      "fr",
      "iu",
      "iu_Latn"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "كندا",
      "canada",
      "ca",
      "can"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_cu",
    "iso2": "CU",
    "iso3": "CUB",
    "numeric": "192",
    "nameAr": "كوبا",
    "nameEn": "Cuba",
    "flag": "🇨🇺",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "CUP",
    "languages": [
      "es"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "كوبا",
      "cuba",
      "cu",
      "cub"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_kr",
    "iso2": "KR",
    "iso3": "KOR",
    "numeric": "410",
    "nameAr": "كوريا الجنوبية",
    "nameEn": "South Korea",
    "flag": "🇰🇷",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "KRW",
    "languages": [
      "ko"
    ],
    "aliasesAr": [
      "كوريا الجنوبية"
    ],
    "aliasesEn": [
      "South Korea"
    ],
    "searchTerms": [
      "كوريا الجنوبيه",
      "south korea",
      "kr",
      "kor"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_kp",
    "iso2": "KP",
    "iso3": "PRK",
    "numeric": "408",
    "nameAr": "كوريا الشمالية",
    "nameEn": "North Korea",
    "flag": "🇰🇵",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "KPW",
    "languages": [
      "ko"
    ],
    "aliasesAr": [
      "كوريا الشمالية"
    ],
    "aliasesEn": [
      "North Korea"
    ],
    "searchTerms": [
      "كوريا الشماليه",
      "north korea",
      "kp",
      "prk"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_cr",
    "iso2": "CR",
    "iso3": "CRI",
    "numeric": "188",
    "nameAr": "كوستاريكا",
    "nameEn": "Costa Rica",
    "flag": "🇨🇷",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "CRC",
    "languages": [
      "es"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "كوستاريكا",
      "costa rica",
      "cr",
      "cri"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_co",
    "iso2": "CO",
    "iso3": "COL",
    "numeric": "170",
    "nameAr": "كولومبيا",
    "nameEn": "Colombia",
    "flag": "🇨🇴",
    "continent": "south-america",
    "continentAr": "أمريكا الجنوبية",
    "continentEn": "South America",
    "currency": "COP",
    "languages": [
      "es"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "كولومبيا",
      "colombia",
      "co",
      "col"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ki",
    "iso2": "KI",
    "iso3": "KIR",
    "numeric": "296",
    "nameAr": "كيريباتي",
    "nameEn": "Kiribati",
    "flag": "🇰🇮",
    "continent": "oceania",
    "continentAr": "أوقيانوسيا",
    "continentEn": "Oceania",
    "currency": "AUD",
    "languages": [
      "en",
      "gil"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "كيريباتي",
      "kiribati",
      "ki",
      "kir"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ke",
    "iso2": "KE",
    "iso3": "KEN",
    "numeric": "404",
    "nameAr": "كينيا",
    "nameEn": "Kenya",
    "flag": "🇰🇪",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "KES",
    "languages": [
      "sw",
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "كينيا",
      "kenya",
      "ke",
      "ken"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_lv",
    "iso2": "LV",
    "iso3": "LVA",
    "numeric": "428",
    "nameAr": "لاتفيا",
    "nameEn": "Latvia",
    "flag": "🇱🇻",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "lv"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "لاتفيا",
      "latvia",
      "lv",
      "lva"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_la",
    "iso2": "LA",
    "iso3": "LAO",
    "numeric": "418",
    "nameAr": "لاوس",
    "nameEn": "Laos",
    "flag": "🇱🇦",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "LAK",
    "languages": [
      "lo"
    ],
    "aliasesAr": [
      "لاوس"
    ],
    "aliasesEn": [],
    "searchTerms": [
      "لاوس",
      "laos",
      "la",
      "lao"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_lb",
    "iso2": "LB",
    "iso3": "LBN",
    "numeric": "422",
    "nameAr": "لبنان",
    "nameEn": "Lebanon",
    "flag": "🇱🇧",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "LBP",
    "languages": [
      "ar"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "لبنان",
      "lebanon",
      "lb",
      "lbn"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_lu",
    "iso2": "LU",
    "iso3": "LUX",
    "numeric": "442",
    "nameAr": "لوكسمبورغ",
    "nameEn": "Luxembourg",
    "flag": "🇱🇺",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "fr",
      "lb",
      "de"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "لوكسمبورغ",
      "luxembourg",
      "lu",
      "lux"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ly",
    "iso2": "LY",
    "iso3": "LBY",
    "numeric": "434",
    "nameAr": "ليبيا",
    "nameEn": "Libya",
    "flag": "🇱🇾",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "LYD",
    "languages": [
      "ar"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "ليبيا",
      "libya",
      "ly",
      "lby"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_lr",
    "iso2": "LR",
    "iso3": "LBR",
    "numeric": "430",
    "nameAr": "ليبيريا",
    "nameEn": "Liberia",
    "flag": "🇱🇷",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "LRD",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "ليبيريا",
      "liberia",
      "lr",
      "lbr"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_lt",
    "iso2": "LT",
    "iso3": "LTU",
    "numeric": "440",
    "nameAr": "ليتوانيا",
    "nameEn": "Lithuania",
    "flag": "🇱🇹",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "lt"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "ليتوانيا",
      "lithuania",
      "lt",
      "ltu"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_li",
    "iso2": "LI",
    "iso3": "LIE",
    "numeric": "438",
    "nameAr": "ليختنشتاين",
    "nameEn": "Liechtenstein",
    "flag": "🇱🇮",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "CHF",
    "languages": [
      "de",
      "gsw"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "ليختنشتاين",
      "liechtenstein",
      "li",
      "lie"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ls",
    "iso2": "LS",
    "iso3": "LSO",
    "numeric": "426",
    "nameAr": "ليسوتو",
    "nameEn": "Lesotho",
    "flag": "🇱🇸",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "LSL",
    "languages": [
      "st",
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "ليسوتو",
      "lesotho",
      "ls",
      "lso"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_mt",
    "iso2": "MT",
    "iso3": "MLT",
    "numeric": "470",
    "nameAr": "مالطا",
    "nameEn": "Malta",
    "flag": "🇲🇹",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "mt",
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "مالطا",
      "malta",
      "mt",
      "mlt"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ml",
    "iso2": "ML",
    "iso3": "MLI",
    "numeric": "466",
    "nameAr": "مالي",
    "nameEn": "Mali",
    "flag": "🇲🇱",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "XOF",
    "languages": [
      "fr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "مالي",
      "mali",
      "ml",
      "mli"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_my",
    "iso2": "MY",
    "iso3": "MYS",
    "numeric": "458",
    "nameAr": "ماليزيا",
    "nameEn": "Malaysia",
    "flag": "🇲🇾",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "MYR",
    "languages": [
      "ms"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "ماليزيا",
      "malaysia",
      "my",
      "mys"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_mg",
    "iso2": "MG",
    "iso3": "MDG",
    "numeric": "450",
    "nameAr": "مدغشقر",
    "nameEn": "Madagascar",
    "flag": "🇲🇬",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "MGA",
    "languages": [
      "mg",
      "fr",
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "مدغشقر",
      "madagascar",
      "mg",
      "mdg"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_eg",
    "iso2": "EG",
    "iso3": "EGY",
    "numeric": "818",
    "nameAr": "مصر",
    "nameEn": "Egypt",
    "flag": "🇪🇬",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "EGP",
    "languages": [
      "ar"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "مصر",
      "egypt",
      "eg",
      "egy"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_mk",
    "iso2": "MK",
    "iso3": "MKD",
    "numeric": "807",
    "nameAr": "مقدونيا الشمالية",
    "nameEn": "North Macedonia",
    "flag": "🇲🇰",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "MKD",
    "languages": [
      "mk",
      "sq"
    ],
    "aliasesAr": [
      "مقدونيا الشمالية"
    ],
    "aliasesEn": [
      "North Macedonia"
    ],
    "searchTerms": [
      "مقدونيا الشماليه",
      "north macedonia",
      "mk",
      "mkd"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_mw",
    "iso2": "MW",
    "iso3": "MWI",
    "numeric": "454",
    "nameAr": "ملاوي",
    "nameEn": "Malawi",
    "flag": "🇲🇼",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "MWK",
    "languages": [
      "en",
      "ny"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "ملاوي",
      "malawi",
      "mw",
      "mwi"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_mn",
    "iso2": "MN",
    "iso3": "MNG",
    "numeric": "496",
    "nameAr": "منغوليا",
    "nameEn": "Mongolia",
    "flag": "🇲🇳",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "MNT",
    "languages": [
      "mn"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "منغوليا",
      "mongolia",
      "mn",
      "mng"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_mr",
    "iso2": "MR",
    "iso3": "MRT",
    "numeric": "478",
    "nameAr": "موريتانيا",
    "nameEn": "Mauritania",
    "flag": "🇲🇷",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "MRU",
    "languages": [
      "ar"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "موريتانيا",
      "mauritania",
      "mr",
      "mrt"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_mu",
    "iso2": "MU",
    "iso3": "MUS",
    "numeric": "480",
    "nameAr": "موريشيوس",
    "nameEn": "Mauritius",
    "flag": "🇲🇺",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "MUR",
    "languages": [
      "fr",
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "موريشيوس",
      "mauritius",
      "mu",
      "mus"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_mz",
    "iso2": "MZ",
    "iso3": "MOZ",
    "numeric": "508",
    "nameAr": "موزمبيق",
    "nameEn": "Mozambique",
    "flag": "🇲🇿",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "MZN",
    "languages": [
      "pt"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "موزمبيق",
      "mozambique",
      "mz",
      "moz"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_md",
    "iso2": "MD",
    "iso3": "MDA",
    "numeric": "498",
    "nameAr": "مولدوفا",
    "nameEn": "Moldova",
    "flag": "🇲🇩",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "MDL",
    "languages": [
      "ro"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "مولدوفا",
      "moldova",
      "md",
      "mda"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_mc",
    "iso2": "MC",
    "iso3": "MCO",
    "numeric": "492",
    "nameAr": "موناكو",
    "nameEn": "Monaco",
    "flag": "🇲🇨",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "fr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "موناكو",
      "monaco",
      "mc",
      "mco"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_mm",
    "iso2": "MM",
    "iso3": "MMR",
    "numeric": "104",
    "nameAr": "ميانمار (بورما)",
    "nameEn": "Myanmar (Burma)",
    "flag": "🇲🇲",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "MMK",
    "languages": [
      "my"
    ],
    "aliasesAr": [
      "ميانمار",
      "بورما"
    ],
    "aliasesEn": [
      "Myanmar",
      "Burma"
    ],
    "searchTerms": [
      "ميانمار بورما",
      "myanmar burma",
      "mm",
      "mmr",
      "ميانمار",
      "بورما",
      "myanmar",
      "burma"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_fm",
    "iso2": "FM",
    "iso3": "FSM",
    "numeric": "583",
    "nameAr": "ميكرونيزيا",
    "nameEn": "Micronesia",
    "flag": "🇫🇲",
    "continent": "oceania",
    "continentAr": "أوقيانوسيا",
    "continentEn": "Oceania",
    "currency": "USD",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "ميكرونيزيا",
      "micronesia",
      "fm",
      "fsm"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_na",
    "iso2": "NA",
    "iso3": "NAM",
    "numeric": "516",
    "nameAr": "ناميبيا",
    "nameEn": "Namibia",
    "flag": "🇳🇦",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "NAD",
    "languages": [
      "en"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "ناميبيا",
      "namibia",
      "na",
      "nam"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_nr",
    "iso2": "NR",
    "iso3": "NRU",
    "numeric": "520",
    "nameAr": "ناورو",
    "nameEn": "Nauru",
    "flag": "🇳🇷",
    "continent": "oceania",
    "continentAr": "أوقيانوسيا",
    "continentEn": "Oceania",
    "currency": "AUD",
    "languages": [
      "en",
      "na"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "ناورو",
      "nauru",
      "nr",
      "nru"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_np",
    "iso2": "NP",
    "iso3": "NPL",
    "numeric": "524",
    "nameAr": "نيبال",
    "nameEn": "Nepal",
    "flag": "🇳🇵",
    "continent": "asia",
    "continentAr": "آسيا",
    "continentEn": "Asia",
    "currency": "NPR",
    "languages": [
      "ne"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "نيبال",
      "nepal",
      "np",
      "npl"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ng",
    "iso2": "NG",
    "iso3": "NGA",
    "numeric": "566",
    "nameAr": "نيجيريا",
    "nameEn": "Nigeria",
    "flag": "🇳🇬",
    "continent": "africa",
    "continentAr": "أفريقيا",
    "continentEn": "Africa",
    "currency": "NGN",
    "languages": [
      "en",
      "yo"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "نيجيريا",
      "nigeria",
      "ng",
      "nga"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ni",
    "iso2": "NI",
    "iso3": "NIC",
    "numeric": "558",
    "nameAr": "نيكاراغوا",
    "nameEn": "Nicaragua",
    "flag": "🇳🇮",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "NIO",
    "languages": [
      "es"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "نيكاراغوا",
      "nicaragua",
      "ni",
      "nic"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_nz",
    "iso2": "NZ",
    "iso3": "NZL",
    "numeric": "554",
    "nameAr": "نيوزيلندا",
    "nameEn": "New Zealand",
    "flag": "🇳🇿",
    "continent": "oceania",
    "continentAr": "أوقيانوسيا",
    "continentEn": "Oceania",
    "currency": "NZD",
    "languages": [
      "en",
      "mi"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "نيوزيلندا",
      "new zealand",
      "nz",
      "nzl"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_ht",
    "iso2": "HT",
    "iso3": "HTI",
    "numeric": "332",
    "nameAr": "هايتي",
    "nameEn": "Haiti",
    "flag": "🇭🇹",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "USD",
    "languages": [
      "ht",
      "fr"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "هايتي",
      "haiti",
      "ht",
      "hti"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_hn",
    "iso2": "HN",
    "iso3": "HND",
    "numeric": "340",
    "nameAr": "هندوراس",
    "nameEn": "Honduras",
    "flag": "🇭🇳",
    "continent": "north-america",
    "continentAr": "أمريكا الشمالية",
    "continentEn": "North America",
    "currency": "HNL",
    "languages": [
      "es"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "هندوراس",
      "honduras",
      "hn",
      "hnd"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_hu",
    "iso2": "HU",
    "iso3": "HUN",
    "numeric": "348",
    "nameAr": "هنغاريا",
    "nameEn": "Hungary",
    "flag": "🇭🇺",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "HUF",
    "languages": [
      "hu"
    ],
    "aliasesAr": [],
    "aliasesEn": [],
    "searchTerms": [
      "هنغاريا",
      "hungary",
      "hu",
      "hun"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  },
  {
    "id": "country_nl",
    "iso2": "NL",
    "iso3": "NLD",
    "numeric": "528",
    "nameAr": "هولندا",
    "nameEn": "Netherlands",
    "flag": "🇳🇱",
    "continent": "europe",
    "continentAr": "أوروبا",
    "continentEn": "Europe",
    "currency": "EUR",
    "languages": [
      "nl",
      "fy"
    ],
    "aliasesAr": [
      "هولندا",
      "مملكة هولندا"
    ],
    "aliasesEn": [],
    "searchTerms": [
      "هولندا",
      "netherlands",
      "nl",
      "nld",
      "مملكه هولندا"
    ],
    "enabled": true,
    "guideAvailable": false,
    "priority": 0
  }
];

  const records = new Map();

  const normalizeCountry = (input = {}) => {
    const source = isObject(input)
      ? clone(input)
      : {};

    const iso2 = text(source.iso2).toUpperCase();
    const iso3 = text(source.iso3).toUpperCase();

    if (!/^[A-Z]{2}$/.test(iso2)) {
      throw new Error(
        "TIC Countries Catalog: a valid ISO alpha-2 code is required."
      );
    }

    const nameAr = text(source.nameAr);
    const nameEn = text(source.nameEn);

    if (!nameAr || !nameEn) {
      throw new Error(
        `TIC Countries Catalog: Arabic and English names are required for ${iso2}.`
      );
    }

    const aliasesAr = uniqueStrings(source.aliasesAr);
    const aliasesEn = uniqueStrings(source.aliasesEn);

    const generatedSearchTerms = [
      nameAr,
      nameEn,
      iso2,
      iso3,
      ...aliasesAr,
      ...aliasesEn
    ]
      .map(normalizeSearch)
      .filter(Boolean);

    return {
      ...source,
      id: text(source.id) || `country_${iso2.toLowerCase()}`,
      iso2,
      iso3,
      numeric: text(source.numeric),
      nameAr,
      nameEn,
      flag: text(source.flag),
      continent: text(source.continent),
      continentAr: text(source.continentAr),
      continentEn: text(source.continentEn),
      currency: text(source.currency).toUpperCase(),
      languages: uniqueStrings(source.languages),
      aliasesAr,
      aliasesEn,
      searchTerms: uniqueStrings([
        ...(Array.isArray(source.searchTerms)
          ? source.searchTerms.map(normalizeSearch)
          : []),
        ...generatedSearchTerms
      ]),
      enabled: source.enabled !== false,
      guideAvailable: source.guideAvailable === true,
      priority: Number.isFinite(Number(source.priority))
        ? Number(source.priority)
        : 0
    };
  };

  const register = (country, options = {}) => {
    const normalized = normalizeCountry(country);
    const current = records.get(normalized.iso2);

    if (current && options.replace !== true) {
      records.set(
        normalized.iso2,
        normalizeCountry({
          ...current,
          ...normalized,
          aliasesAr: uniqueStrings([
            ...current.aliasesAr,
            ...normalized.aliasesAr
          ]),
          aliasesEn: uniqueStrings([
            ...current.aliasesEn,
            ...normalized.aliasesEn
          ]),
          searchTerms: uniqueStrings([
            ...current.searchTerms,
            ...normalized.searchTerms
          ])
        })
      );
    } else {
      records.set(normalized.iso2, normalized);
    }

    return clone(records.get(normalized.iso2));
  };

  const registerMany = (countries, options = {}) => {
    if (!Array.isArray(countries)) return [];

    return countries.map((country) =>
      register(country, options)
    );
  };

  registerMany(COUNTRY_SEED, {
    replace: true
  });

  const getAll = (options = {}) => {
    const locale = options.locale === "en"
      ? "en"
      : "ar";

    const includeDisabled =
      options.includeDisabled === true;

    const continent =
      text(options.continent).toLowerCase();

    const guideOnly =
      options.guideOnly === true;

    const result = Array.from(records.values())
      .filter((country) =>
        includeDisabled || country.enabled
      )
      .filter((country) =>
        !continent ||
        country.continent === continent
      )
      .filter((country) =>
        !guideOnly ||
        country.guideAvailable
      );

    const nameKey =
      locale === "en"
        ? "nameEn"
        : "nameAr";

    result.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }

      return a[nameKey].localeCompare(
        b[nameKey],
        locale === "en" ? "en" : "ar",
        {
          sensitivity: "base"
        }
      );
    });

    return clone(result);
  };

  const getByCode = (code) => {
    const normalized =
      text(code).toUpperCase();

    if (!normalized) return null;

    if (/^[A-Z]{2}$/.test(normalized)) {
      return clone(
        records.get(normalized) ||
        null
      );
    }

    const country = Array.from(records.values()).find(
      (item) =>
        item.iso3 === normalized ||
        item.numeric === normalized
    );

    return country
      ? clone(country)
      : null;
  };

  const search = (query, options = {}) => {
    const normalizedQuery =
      normalizeSearch(query);

    if (!normalizedQuery) {
      return getAll(options);
    }

    const limit = Math.max(
      1,
      Math.min(
        195,
        Number(options.limit) || 30
      )
    );

    return getAll(options)
      .map((country) => {
        const exactCode =
          country.iso2.toLowerCase() ===
            normalizedQuery ||
          country.iso3.toLowerCase() ===
            normalizedQuery;

        const exactName =
          normalizeSearch(country.nameAr) ===
            normalizedQuery ||
          normalizeSearch(country.nameEn) ===
            normalizedQuery;

        const beginsWith =
          country.searchTerms.some((term) =>
            term.startsWith(normalizedQuery)
          );

        const contains =
          country.searchTerms.some((term) =>
            term.includes(normalizedQuery)
          );

        const score =
          exactCode
            ? 100
            : exactName
              ? 90
              : beginsWith
                ? 70
                : contains
                  ? 40
                  : 0;

        return {
          country,
          score
        };
      })
      .filter((item) =>
        item.score > 0
      )
      .sort((a, b) =>
        b.score - a.score ||
        b.country.priority -
          a.country.priority
      )
      .slice(0, limit)
      .map((item) =>
        item.country
      );
  };

  const groupAlphabetically = (options = {}) => {
    const locale =
      options.locale === "en"
        ? "en"
        : "ar";

    const nameKey =
      locale === "en"
        ? "nameEn"
        : "nameAr";

    return getAll(options).reduce(
      (groups, country) => {
        const firstCharacter =
          text(country[nameKey])
            .charAt(0)
            .toUpperCase() || "#";

        if (!groups[firstCharacter]) {
          groups[firstCharacter] = [];
        }

        groups[firstCharacter].push(country);
        return groups;
      },
      {}
    );
  };

  const getContinents = (locale = "ar") => {
    const key =
      locale === "en"
        ? "continentEn"
        : "continentAr";

    const map = new Map();

    Array.from(records.values()).forEach((country) => {
      if (!map.has(country.continent)) {
        map.set(country.continent, {
          id: country.continent,
          label: country[key],
          count: 0
        });
      }

      map.get(country.continent).count += 1;
    });

    return clone(
      Array.from(map.values()).sort((a, b) =>
        a.label.localeCompare(
          b.label,
          locale === "en" ? "en" : "ar"
        )
      )
    );
  };

  const markGuideAvailable = (
    code,
    available = true
  ) => {
    const country = getByCode(code);

    if (!country) return false;

    register(
      {
        ...country,
        guideAvailable:
          available === true
      },
      {
        replace: true
      }
    );

    return true;
  };

  const Catalog = {
    id: MODULE_ID,
    version: MODULE_VERSION,
    expectedCount: EXPECTED_COUNTRY_COUNT,

    getAll,
    getByCode,
    search,
    groupAlphabetically,
    getContinents,
    register,
    registerMany,
    markGuideAvailable,
    normalizeSearch,

    has(code) {
      return Boolean(getByCode(code));
    },

    count(options = {}) {
      return getAll(options).length;
    },

    toSelectOptions(options = {}) {
      const locale =
        options.locale === "en"
          ? "en"
          : "ar";

      return getAll(options).map((country) => ({
        value: country.iso2,
        label:
          locale === "en"
            ? country.nameEn
            : country.nameAr,
        flag: country.flag,
        country
      }));
    },

    diagnostics() {
      const all = getAll({
        includeDisabled: true
      });

      const duplicateIso2 = all
        .map((country) => country.iso2)
        .filter(
          (code, index, source) =>
            source.indexOf(code) !== index
        );

      const missingCoreFields = all
        .filter(
          (country) =>
            !country.iso2 ||
            !country.iso3 ||
            !country.nameAr ||
            !country.nameEn ||
            !country.continent
        )
        .map((country) =>
          country.iso2 || country.id
        );

      return {
        id: MODULE_ID,
        version: MODULE_VERSION,
        expectedCount:
          EXPECTED_COUNTRY_COUNT,
        actualCount: all.length,
        validCount:
          all.length ===
            EXPECTED_COUNTRY_COUNT &&
          duplicateIso2.length === 0 &&
          missingCoreFields.length === 0,
        enabledCount:
          all.filter((country) =>
            country.enabled
          ).length,
        guideAvailableCount:
          all.filter((country) =>
            country.guideAvailable
          ).length,
        duplicateIso2,
        missingCoreFields,
        continentCount:
          getContinents().length
      };
    }
  };

  const diagnostics =
    Catalog.diagnostics();

  if (!diagnostics.validCount) {
    console.warn(
      "TIC Countries Catalog validation warning:",
      diagnostics
    );
  }

  window.TIC = window.TIC || {};
  window.TIC.Data = window.TIC.Data || {};
  window.TIC.Data.Countries = Catalog;
  window.TICCountriesCatalog = Catalog;

  window.dispatchEvent(
    new CustomEvent(
      "tic:data:countries-ready",
      {
        detail: diagnostics
      }
    )
  );
})(window);
