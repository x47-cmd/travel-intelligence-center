/* =========================================================
   Travel Intelligence Center
   Application Configuration V1.0.0

   File Path:
   js/config/config.js

   Purpose:
   - Central configuration for the entire application.
   - Defines application identity, navigation, defaults,
     storage keys, trip statuses, currencies, and page metadata.
   - Contains configuration only.
   - Does not render UI or store user data.
========================================================= */

(function (window) {
  "use strict";

  const CONFIG_VERSION = "1.0.0";
  const APP_VERSION = "1.0.0";
  const BUILD_ID = "tic-rebuild-1.0.0";

  const deepFreeze = (value) => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) {
      return value;
    }

    Object.getOwnPropertyNames(value).forEach((key) => {
      deepFreeze(value[key]);
    });

    return Object.freeze(value);
  };

  const TICConfig = {
    id: "travel-intelligence-center",
    name: "Travel Intelligence Center",
    nameArabic: "مركز السفر الذكي",
    shortName: "Travel Center",

    configVersion: CONFIG_VERSION,
    appVersion: APP_VERSION,
    buildId: BUILD_ID,

    environment: "production",
    direction: "rtl",
    locale: "ar-AE",
    fallbackLocale: "en",
    timezone: "Asia/Dubai",

    author: {
      name: "يوسف الحوسني",
      creditArabic: "تصميم وتطوير يوسف الحوسني",
      creditEnglish: "Designed & Developed by يوسف الحوسني"
    },

    app: {
      title: "مركز السفر الذكي | Travel Intelligence Center",
      description:
        "منصة شخصية ذكية لإدارة الرحلات والوجهات والميزانيات والتجهيز والذكريات في مكان واحد.",
      themeColor: "#0f766e",
      backgroundColor: "#f4f8fb",
      startRoute: "home",
      fallbackRoute: "home",
      pageContainerId: "tic-page",
      toastContainerId: "tic-toast",
      modalContainerId: "tic-modal",
      enableDebug: false,
      enableAnimations: true,
      enablePWA: false
    },

    navigation: [
      {
        id: "home",
        label: "الرئيسية",
        title: "الرئيسية",
        icon: "🏠",
        order: 1,
        visible: true
      },
      {
        id: "trips",
        label: "رحلاتي",
        title: "مركز الرحلات",
        icon: "✈️",
        order: 2,
        visible: true
      },
      {
        id: "guide",
        label: "الدليل",
        title: "دليل السفر",
        icon: "🌍",
        order: 3,
        visible: true
      },
      {
        id: "budget",
        label: "الميزانية",
        title: "مركز الميزانية",
        icon: "💰",
        order: 4,
        visible: true
      },
      {
        id: "more",
        label: "المزيد",
        title: "المزيد والأدوات",
        icon: "☰",
        order: 5,
        visible: true
      }
    ],

    routes: {
      home: {
        id: "home",
        title: "الرئيسية",
        module: "home"
      },
      trips: {
        id: "trips",
        title: "رحلاتي",
        module: "trips"
      },
      guide: {
        id: "guide",
        title: "الدليل",
        module: "guide"
      },
      budget: {
        id: "budget",
        title: "الميزانية",
        module: "budget"
      },
      more: {
        id: "more",
        title: "المزيد",
        module: "more"
      }
    },

    storage: {
      namespace: "tic",
      schemaVersion: 1,
      stateKey: "tic.state.v1",
      backupKey: "tic.backup.v1",
      currentRouteKey: "tic.current-route.v1",
      settingsKey: "tic.settings.v1",
      lastMigrationKey: "tic.last-migration.v1",
      autoSaveDelay: 120,
      maxBackups: 3
    },

    defaults: {
      currency: "AED",
      country: "United Arab Emirates",
      city: "Abu Dhabi",
      language: "ar",
      dateFormat: "DD/MM/YYYY",
      firstDayOfWeek: 6,
      tripStatus: "planned",
      travelers: 1,
      budget: 0,
      theme: "light",
      profileName: "يوسف"
    },

    currencies: [
      {
        code: "AED",
        label: "درهم إماراتي",
        symbol: "د.إ"
      },
      {
        code: "USD",
        label: "دولار أمريكي",
        symbol: "$"
      },
      {
        code: "EUR",
        label: "يورو",
        symbol: "€"
      },
      {
        code: "GBP",
        label: "جنيه إسترليني",
        symbol: "£"
      },
      {
        code: "SAR",
        label: "ريال سعودي",
        symbol: "ر.س"
      },
      {
        code: "KWD",
        label: "دينار كويتي",
        symbol: "د.ك"
      },
      {
        code: "QAR",
        label: "ريال قطري",
        symbol: "ر.ق"
      },
      {
        code: "BHD",
        label: "دينار بحريني",
        symbol: "د.ب"
      },
      {
        code: "OMR",
        label: "ريال عماني",
        symbol: "ر.ع"
      }
    ],

    tripStatuses: {
      draft: {
        id: "draft",
        label: "مسودة",
        color: "muted",
        final: false
      },
      planned: {
        id: "planned",
        label: "مخططة",
        color: "info",
        final: false
      },
      confirmed: {
        id: "confirmed",
        label: "مؤكدة",
        color: "success",
        final: false
      },
      active: {
        id: "active",
        label: "حالية",
        color: "success",
        final: false
      },
      completed: {
        id: "completed",
        label: "مكتملة",
        color: "muted",
        final: true
      },
      cancelled: {
        id: "cancelled",
        label: "ملغاة",
        color: "danger",
        final: true
      },
      archived: {
        id: "archived",
        label: "مؤرشفة",
        color: "muted",
        final: true
      }
    },

    tripPurposes: [
      {
        id: "leisure",
        label: "سياحة واستجمام",
        icon: "🏖️"
      },
      {
        id: "family",
        label: "رحلة عائلية",
        icon: "👨‍👩‍👧‍👦"
      },
      {
        id: "honeymoon",
        label: "شهر عسل",
        icon: "💍"
      },
      {
        id: "business",
        label: "عمل",
        icon: "💼"
      },
      {
        id: "medical",
        label: "علاج",
        icon: "🏥"
      },
      {
        id: "religious",
        label: "رحلة دينية",
        icon: "🕌"
      },
      {
        id: "adventure",
        label: "مغامرة",
        icon: "⛰️"
      },
      {
        id: "other",
        label: "أخرى",
        icon: "✈️"
      }
    ],

    budgetCategories: [
      {
        id: "flights",
        label: "الطيران",
        icon: "✈️"
      },
      {
        id: "hotel",
        label: "السكن",
        icon: "🏨"
      },
      {
        id: "transport",
        label: "المواصلات",
        icon: "🚗"
      },
      {
        id: "food",
        label: "الأكل",
        icon: "🍽️"
      },
      {
        id: "activities",
        label: "الأنشطة",
        icon: "🎟️"
      },
      {
        id: "shopping",
        label: "التسوق",
        icon: "🛍️"
      },
      {
        id: "documents",
        label: "التأشيرات والمستندات",
        icon: "🛂"
      },
      {
        id: "insurance",
        label: "التأمين",
        icon: "🛡️"
      },
      {
        id: "other",
        label: "أخرى",
        icon: "•••"
      }
    ],

    guideCategories: [
      {
        id: "recommended",
        label: "مقترحة لك",
        icon: "✨"
      },
      {
        id: "beach",
        label: "شواطئ",
        icon: "🏝️"
      },
      {
        id: "nature",
        label: "طبيعة",
        icon: "🌿"
      },
      {
        id: "cities",
        label: "مدن",
        icon: "🏙️"
      },
      {
        id: "family",
        label: "عائلية",
        icon: "👨‍👩‍👧‍👦"
      },
      {
        id: "luxury",
        label: "فاخرة",
        icon: "💎"
      },
      {
        id: "adventure",
        label: "مغامرات",
        icon: "⛰️"
      },
      {
        id: "halal",
        label: "مناسبة للمسلمين",
        icon: "🕌"
      }
    ],

    moreTools: [
      {
        id: "profile",
        label: "الملف الشخصي",
        description: "الاسم وتفضيلات السفر",
        icon: "👤"
      },
      {
        id: "documents",
        label: "مستندات السفر",
        description: "الجواز والتأشيرات والتأمين",
        icon: "🛂"
      },
      {
        id: "packing",
        label: "قائمة التجهيز",
        description: "تجهيز الشنطة قبل السفر",
        icon: "🧳"
      },
      {
        id: "wishlist",
        label: "قائمة الأمنيات",
        description: "الوجهات التي تريد زيارتها",
        icon: "♡"
      },
      {
        id: "memories",
        label: "ذكريات السفر",
        description: "الدول والصور والتجارب",
        icon: "📷"
      },
      {
        id: "settings",
        label: "الإعدادات",
        description: "العملة والتفضيلات والبيانات",
        icon: "⚙️"
      }
    ],

    validation: {
      trip: {
        titleMinLength: 2,
        titleMaxLength: 80,
        notesMaxLength: 1000,
        maxTravelers: 50,
        maxBudget: 100000000
      },
      profile: {
        nameMaxLength: 80
      }
    },

    ui: {
      toastDuration: 2800,
      modalCloseOnBackdrop: true,
      modalCloseOnEscape: true,
      scrollBehavior: "smooth",
      animationDuration: 220,
      mobileBreakpoint: 760,
      tabletBreakpoint: 1020
    },

    diagnostics() {
      return {
        id: this.id,
        configVersion: this.configVersion,
        appVersion: this.appVersion,
        buildId: this.buildId,
        environment: this.environment,
        locale: this.locale,
        timezone: this.timezone,
        routeCount: Object.keys(this.routes).length,
        navigationCount: this.navigation.length,
        storageSchemaVersion: this.storage.schemaVersion
      };
    }
  };

  deepFreeze(TICConfig);

  window.TICConfig = TICConfig;

  window.TIC = window.TIC || {};
  window.TIC.Config = TICConfig;
})(window);
