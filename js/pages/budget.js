/* =========================================================
   Travel Intelligence Center
   Simple Travel Budget Advisor V5.5.0

   File Path:
   js/pages/budget.js

   Based on:
   - Simple Travel Budget Advisor V5.1.0

   Integration:
   - TravelBrain
   - TravelAssistant
   - TravelImport
   - TravelSync
   - Store V2.5.0
   - App V4.2.0

   Stability:
   - Preserves all existing CSS hooks and visual structure.
   - Preserves iPhone-first and RTL behavior.
   - Preserves horizontal destination suggestions.
   - Preserves scroll and swipe position during refresh.
   - Defers refresh while scrolling, swiping or using dialogs.
   - Prevents duplicate events, subscriptions and refresh loops.
   - Preserves legacy wallet, expense and planned-trip APIs.
========================================================= */

(function budgetPageFactory(window, document) {
  "use strict";

  const PAGE_ID = "budget";
  const PAGE_VERSION = "5.5.0";
  const BASE_VERSION = "5.1.0";
  const STORAGE_KEY = "tic_simple_travel_budget_v4";
  const REFRESH_DELAY = 220;
  const STORE_REFRESH_DELAY = 520;
  const INTEGRATION_REFRESH_DELAY = 320;
  const SCROLL_IDLE_DELAY = 420;
  const SWIPE_IDLE_DELAY = 360;

  const TRANSACTION_TYPES = Object.freeze({
    DEPOSIT: "deposit",
    WITHDRAWAL: "withdrawal",
    EXPENSE: "expense"
  });

  const DIALOGS = Object.freeze({
    DEPOSIT: "deposit",
    WITHDRAWAL: "withdrawal",
    HISTORY: "history",
    DESTINATION: "destination"
  });

  const DESTINATIONS = Object.freeze([
    {
      id: "baku",
      country: "أذربيجان",
      countryCode: "AZ",
      city: "باكو",
      title: "رحلة باكو",
      days: 5,
      cost: 5000,
      level: "اقتصادية",
      style: "مدينة هادئة",
      summary: "رحلة خفيفة ومرتبة مع مطاعم حلال وطبيعة قريبة.",
      tags: ["مطاعم حلال", "رحلة قصيرة", "مدينة هادئة"],
      bestFor: "خيار اقتصادي قريب"
    },
    {
      id: "sarajevo",
      country: "البوسنة والهرسك",
      countryCode: "BA",
      city: "سراييفو",
      title: "رحلة البوسنة",
      days: 6,
      cost: 6500,
      level: "متوازنة",
      style: "طبيعة وهدوء",
      summary: "طبيعة جميلة وأجواء هادئة وتكلفة مناسبة للعائلة.",
      tags: ["طبيعة", "أكل حلال", "هدوء"],
      bestFor: "أفضل قيمة مقابل الميزانية"
    },
    {
      id: "tbilisi",
      country: "جورجيا",
      countryCode: "GE",
      city: "تبليسي",
      title: "رحلة تبليسي",
      days: 6,
      cost: 7500,
      level: "متوسطة",
      style: "طبيعة ورحلات يومية",
      summary: "مدينة مناسبة كنقطة انطلاق للطبيعة والجبال والرحلات اليومية.",
      tags: ["طبيعة", "أجواء معتدلة", "رحلات يومية"],
      bestFor: "طبيعة بميزانية متوسطة"
    },
    {
      id: "istanbul",
      country: "تركيا",
      countryCode: "TR",
      city: "إسطنبول",
      title: "رحلة إسطنبول",
      days: 6,
      cost: 9000,
      level: "متوسطة",
      style: "مدينة وتسوق",
      summary: "خيارات واسعة للسكن والمطاعم والتسوق والأنشطة.",
      tags: ["مطاعم حلال", "تسوق", "أنشطة متنوعة"],
      bestFor: "رحلة مدينة متكاملة"
    },
    {
      id: "budapest",
      country: "المجر",
      countryCode: "HU",
      city: "بودابست",
      title: "رحلة بودابست",
      days: 7,
      cost: 10000,
      level: "مريحة",
      style: "مدينة أوروبية",
      summary: "مدينة منظمة بإطلالات نهرية وفنادق جميلة وتجربة أوروبية هادئة.",
      tags: ["إطلالات نهرية", "مدينة منظمة", "فنادق راقية"],
      bestFor: "تجربة أوروبية مريحة"
    },
    {
      id: "vienna",
      country: "النمسا",
      countryCode: "AT",
      city: "فيينا",
      title: "رحلة النمسا",
      days: 7,
      cost: 12500,
      level: "راقية",
      style: "مدينة وطبيعة",
      summary: "خيار راقٍ يجمع المدينة المنظمة والطبيعة والقرى القريبة.",
      tags: ["طبيعة", "هدوء", "مدينة راقية"],
      bestFor: "ترقية أوروبية واضحة"
    },
    {
      id: "interlaken",
      country: "سويسرا",
      countryCode: "CH",
      city: "إنترلاكن",
      title: "رحلة سويسرا",
      days: 7,
      cost: 15000,
      level: "فاخرة",
      style: "جبال وهدوء",
      summary: "طبيعة فاخرة وقطارات ومناظر جبلية وإقامة هادئة.",
      tags: ["مناظر جبلية", "قطارات", "طبيعة فاخرة"],
      bestFor: "رحلة فاخرة"
    },
    {
      id: "maldives",
      country: "المالديف",
      countryCode: "MV",
      city: "منتجع جزيرة",
      title: "رحلة المالديف",
      days: 5,
      cost: 18000,
      level: "فاخرة",
      style: "بحر وخصوصية",
      summary: "استجمام وخصوصية ومنتجع هادئ وتجربة بحرية فاخرة.",
      tags: ["خصوصية", "بحر", "استجمام"],
      bestFor: "استجمام فاخر"
    }
  ]);

  const state = {
    initialized: false,
    initializing: null,
    mounted: false,
    destroyed: false,
    container: null,

    unsubscribeStore: null,
    actionUnsubscribers: [],
    eventBindings: [],
    integrationUnsubscribers: [],
    subscribers: new Set(),

    activeDialog: null,
    selectedDestinationId: null,
    snapshot: null,
    lastSignature: "",

    refreshing: false,
    refreshQueued: false,
    pendingForceRefresh: false,
    refreshGeneration: 0,

    isUserScrolling: false,
    isSuggestionSwiping: false,
    pendingRefresh: false,

    lastKnownScrollY: 0,
    suggestionScrollLeft: 0,

    refreshTimer: null,
    storeRefreshTimer: null,
    integrationRefreshTimer: null,
    scrollIdleTimer: null,
    swipeIdleTimer: null,

    lastIntegrationEventKey: "",
    lastIntegrationEventAt: 0
  };

  /* =========================================================
     Utilities and service resolution
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

  const text = (value, fallback = "") =>
    String(value === undefined || value === null ? fallback : value).trim();

  const number = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const nonNegative = (value, fallback = 0) =>
    Math.max(0, number(value, fallback));

  const asArray = (value) =>
    Array.isArray(value)
      ? value
      : value && typeof value === "object"
        ? Object.values(value)
        : [];

  const escapeHTML = (value) =>
    text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const createId = (prefix = "item") =>
    `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const nowISO = () => new Date().toISOString();
  const todayISO = () => nowISO().slice(0, 10);

  const getStore = () =>
    window.TIC?.Store ||
    window.TICStore ||
    window.Store ||
    window.TravelStore ||
    null;

  const getRouter = () =>
    window.TIC?.Router ||
    window.TICRouter ||
    null;

  const getUI = () =>
    window.TIC?.UI ||
    window.TICUI ||
    null;

  const getApp = () =>
    window.TIC?.App ||
    window.TICApp ||
    window.TravelApp ||
    null;

  const getTravelBrain = () =>
    window.TIC?.TravelBrain ||
    window.TravelBrain ||
    window.TICTravelBrain ||
    null;

  const getTravelAssistant = () =>
    window.TIC?.TravelAssistant ||
    window.TravelAssistant ||
    window.TICTravelAssistant ||
    null;

  const getTravelImport = () =>
    window.TIC?.TravelImport ||
    window.TravelImport ||
    window.TICTravelImport ||
    null;

  const getTravelSync = () =>
    window.TIC?.TravelSync ||
    window.TravelSync ||
    window.TICTravelSync ||
    null;

  const resolveContainer = (container) => {
    if (container instanceof window.Element) return container;
    if (typeof container === "string") return document.querySelector(container);

    return (
      document.querySelector("[data-router-view]") ||
      document.querySelector("#app-view") ||
      document.querySelector("#tic-page") ||
      document.querySelector("#app-content")
    );
  };

  const callFirst = async (service, methods, ...args) => {
    if (!service) return undefined;

    for (const method of methods) {
      if (typeof service?.[method] !== "function") continue;

      try {
        return await service[method](...args);
      } catch (error) {
        console.error(`TIC Budget integration method ${method} failed:`, error);
      }
    }

    return undefined;
  };

  const notify = (message, tone = "info") => {
    const ui = getUI();

    try {
      if (typeof ui?.toast === "function") {
        ui.toast(message, { tone });
        return true;
      }
    } catch (_) {
      try {
        ui.toast(message, tone);
        return true;
      } catch (_) {}
    }

    if (typeof ui?.showToast === "function") {
      ui.showToast(message, tone);
      return true;
    }

    console.log(`[Budget:${tone}] ${message}`);
    return false;
  };

  const emit = (type, detail = {}) => {
    const payload = {
      type,
      page: PAGE_ID,
      version: PAGE_VERSION,
      baseVersion: BASE_VERSION,
      timestamp: nowISO(),
      ...clone(detail)
    };

    state.subscribers.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error("TIC Budget subscriber error:", error);
      }
    });

    try {
      window.dispatchEvent(
        new CustomEvent(`tic:page:${PAGE_ID}:${type}`, { detail: payload })
      );

      window.dispatchEvent(
        new CustomEvent("tic:budget:event", { detail: payload })
      );
    } catch (_) {}

    return payload;
  };

  const buildIntegrationContext = (extra = {}) => ({
    source: "budget-page",
    page: PAGE_ID,
    pageVersion: PAGE_VERSION,
    balance: state.snapshot?.balance || 0,
    currency: state.snapshot?.currency || "AED",
    activeDialog: state.activeDialog,
    ...clone(extra)
  });

  const notifyIntegrations = async (eventName, detail = {}) => {
    const payload = buildIntegrationContext({
      eventName,
      ...detail
    });

    await Promise.allSettled(
      [
        getTravelBrain(),
        getTravelAssistant(),
        getTravelImport(),
        getTravelSync(),
        getApp()
      ].map((service) =>
        callFirst(
          service,
          [
            "handleBudgetEvent",
            "handlePageEvent",
            "handleEvent",
            "notify",
            "emit"
          ],
          eventName,
          payload
        )
      )
    );

    return payload;
  };

  const formatCurrency = (value, currencyCode = "AED") => {
    const ui = getUI();

    if (typeof ui?.currency === "function") {
      try {
        return ui.currency(number(value), currencyCode);
      } catch (_) {}
    }

    try {
      return new Intl.NumberFormat("ar-AE", {
        style: "currency",
        currency: currencyCode || "AED",
        maximumFractionDigits: 0
      }).format(number(value));
    } catch (_) {
      return `${Math.round(number(value)).toLocaleString("ar-AE")} ${
        currencyCode || "AED"
      }`;
    }
  };

  const formatDate = (value) => {
    if (!value) return "";

    try {
      return new Intl.DateTimeFormat("ar-AE", {
        day: "numeric",
        month: "short",
        year: "numeric"
      }).format(new Date(value));
    } catch (_) {
      return text(value).slice(0, 10);
    }
  };

  const button = ({
    label,
    action,
    tone = "secondary",
    icon = "",
    block = false,
    small = false,
    attrs = ""
  }) => `
    <button
      type="button"
      class="tic-btn ${
        tone === "primary"
          ? "tic-btn-primary"
          : tone === "danger"
            ? "tic-btn-danger"
            : tone === "ghost"
              ? "tic-btn-ghost"
              : "tic-btn-secondary"
      } ${block ? "tic-btn-block" : ""} ${small ? "tic-btn-small" : ""}"
      data-budget-action="${escapeHTML(action)}"
      ${attrs}
    >
      ${icon ? `<span aria-hidden="true">${escapeHTML(icon)}</span>` : ""}
      <span>${escapeHTML(label)}</span>
    </button>
  `;

  /* =========================================================
     Store and persistence adapter
  ========================================================= */

  const readStoreState = () => {
    const store = getStore();
    if (!store) return {};

    try {
      if (typeof store.getState === "function") {
        return clone(store.getState()) || {};
      }

      if (typeof store.get === "function") {
        const full = store.get();

        if (full && typeof full === "object") return clone(full);

        return {
          profile: store.get("profile"),
          budgetWallet: store.get("budgetWallet"),
          savings: store.get("savings"),
          budgets: store.get("budgets"),
          expenses: store.get("expenses"),
          plannedTrips: store.get("plannedTrips")
        };
      }

      if (store.state) return clone(store.state);
      if (store.data) return clone(store.data);
    } catch (error) {
      console.warn("TIC Budget Store read failed:", error);
    }

    return {};
  };

  const readLocalWallet = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (error) {
      console.warn("TIC Budget local wallet read failed:", error);
      return null;
    }
  };

  const normalizeTransaction = (item, index = 0) => {
    const requestedType = text(item?.type, TRANSACTION_TYPES.DEPOSIT);
    const type = Object.values(TRANSACTION_TYPES).includes(requestedType)
      ? requestedType
      : TRANSACTION_TYPES.DEPOSIT;

    return {
      id: text(item?.id, `budget_tx_${index}`),
      type,
      amount: nonNegative(item?.amount),
      title: text(
        item?.title,
        type === TRANSACTION_TYPES.DEPOSIT
          ? "إضافة رصيد"
          : type === TRANSACTION_TYPES.WITHDRAWAL
            ? "سحب من الرصيد"
            : "مصروف سفر"
      ),
      category: text(
        item?.category,
        type === TRANSACTION_TYPES.EXPENSE ? "other" : ""
      ),
      notes: text(item?.notes),
      date: text(item?.date, todayISO()),
      createdAt: text(item?.createdAt, nowISO()),
      source: text(item?.source, "budget-page")
    };
  };

  const calculateBalance = (transactions, openingBalance = 0) =>
    asArray(transactions).reduce((total, item) => {
      const amount = nonNegative(item.amount);
      return item.type === TRANSACTION_TYPES.DEPOSIT
        ? total + amount
        : total - amount;
    }, nonNegative(openingBalance));

  const normalizeWallet = (wallet, currencyCode = "AED") => {
    const source = wallet && typeof wallet === "object" ? wallet : {};

    const transactions = asArray(source.transactions)
      .map(normalizeTransaction)
      .filter((item) => item.amount > 0)
      .sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt))
      );

    const openingBalance = nonNegative(source.openingBalance);

    return {
      version: PAGE_VERSION,
      currency: text(source.currency, currencyCode || "AED"),
      openingBalance,
      balance: Math.max(
        0,
        calculateBalance(transactions, openingBalance)
      ),
      transactions,
      createdAt: text(source.createdAt, nowISO()),
      updatedAt: text(source.updatedAt, nowISO())
    };
  };

  const getWallet = () => {
    const raw = readStoreState();
    const currencyCode = text(raw.profile?.currency, "AED");

    if (raw.budgetWallet && typeof raw.budgetWallet === "object") {
      return normalizeWallet(raw.budgetWallet, currencyCode);
    }

    const localWallet = readLocalWallet();
    if (localWallet) return normalizeWallet(localWallet, currencyCode);

    const oldSavingsBalance = nonNegative(
      raw.savings?.balance ??
      raw.savings?.currentBalance ??
      raw.budgets?.savingsBalance ??
      0
    );

    return normalizeWallet(
      {
        openingBalance: oldSavingsBalance,
        currency: currencyCode,
        transactions: [],
        createdAt: nowISO(),
        updatedAt: nowISO()
      },
      currencyCode
    );
  };

  const writeLocalWallet = (wallet) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet));
      return true;
    } catch (error) {
      console.warn("TIC Budget local wallet write failed:", error);
      return false;
    }
  };

  const saveWallet = (wallet) => {
    const store = getStore();
    const normalized = normalizeWallet(
      { ...wallet, updatedAt: nowISO() },
      wallet?.currency || "AED"
    );

    let savedToStore = false;

    try {
      if (typeof store?.setBudgetWallet === "function") {
        store.setBudgetWallet(clone(normalized));
        savedToStore = true;
      } else if (typeof store?.saveBudgetWallet === "function") {
        store.saveBudgetWallet(clone(normalized));
        savedToStore = true;
      } else if (typeof store?.set === "function") {
        store.set("budgetWallet", clone(normalized), {
          immediate: true,
          source: "budget-page"
        });
        savedToStore = true;
      } else if (typeof store?.dispatch === "function") {
        const result =
          store.dispatch("budgetWallet/set", clone(normalized)) ??
          store.dispatch("SET_BUDGET_WALLET", clone(normalized));

        savedToStore = result !== false;
      }
    } catch (error) {
      console.warn("TIC Budget Store wallet save failed:", error);
    }

    const savedLocally = writeLocalWallet(normalized);

    try {
      window.dispatchEvent(
        new CustomEvent("tic:budget-wallet-changed", {
          detail: {
            wallet: clone(normalized),
            savedToStore,
            savedLocally,
            source: "budget-page"
          }
        })
      );
    } catch (_) {}

    callFirst(
      getTravelSync(),
      ["syncBudgetWallet", "queueSync", "syncNow"],
      clone(normalized),
      buildIntegrationContext({ reason: "wallet-changed" })
    );

    return savedToStore || savedLocally;
  };

  const addTransaction = ({
    type,
    amount,
    title,
    category = "",
    notes = "",
    date = todayISO()
  }) => {
    const wallet = getWallet();
    const normalizedAmount = nonNegative(amount);

    if (normalizedAmount <= 0) {
      return { ok: false, reason: "invalid-amount" };
    }

    if (
      [TRANSACTION_TYPES.WITHDRAWAL, TRANSACTION_TYPES.EXPENSE].includes(type) &&
      normalizedAmount > wallet.balance
    ) {
      return {
        ok: false,
        reason: "insufficient-balance",
        balance: wallet.balance
      };
    }

    const transaction = normalizeTransaction({
      id: createId("budget_tx"),
      type,
      amount: normalizedAmount,
      title,
      category,
      notes,
      date,
      createdAt: nowISO(),
      source: "simple-budget-page"
    });

    const nextWallet = normalizeWallet(
      {
        ...wallet,
        transactions: [transaction, ...wallet.transactions],
        updatedAt: nowISO()
      },
      wallet.currency
    );

    const saved = saveWallet(nextWallet);

    if (saved) {
      notifyIntegrations("transaction-created", {
        transaction,
        wallet: nextWallet
      });
    }

    return {
      ok: saved,
      wallet: nextWallet,
      transaction
    };
  };

  /* =========================================================
     Smart travel analysis
  ========================================================= */

  const getDestination = (id) =>
    DESTINATIONS.find((item) => String(item.id) === String(id)) || null;

  const buildAffordable = (balance) =>
    DESTINATIONS.filter((item) => item.cost <= balance)
      .sort((a, b) => b.cost - a.cost);

  const buildUpcoming = (balance) =>
    DESTINATIONS.filter((item) => item.cost > balance)
      .sort((a, b) => a.cost - b.cost);

  const buildMultiTripOptions = (balance) => {
    const pairs = [];

    for (let firstIndex = 0; firstIndex < DESTINATIONS.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < DESTINATIONS.length;
        secondIndex += 1
      ) {
        const first = DESTINATIONS[firstIndex];
        const second = DESTINATIONS[secondIndex];
        const total = first.cost + second.cost;

        if (total <= balance) {
          pairs.push({
            id: `${first.id}_${second.id}`,
            trips: [first, second],
            total,
            remaining: balance - total,
            score: total - Math.abs(first.cost - second.cost) * 0.08
          });
        }
      }
    }

    return pairs.sort((a, b) => b.score - a.score).slice(0, 2);
  };

  const buildFallbackTravelAdvice = (balance) => {
    const affordable = buildAffordable(balance);
    const upcoming = buildUpcoming(balance);
    const bestNow = affordable[0] || null;
    const nextUpgrade = upcoming[0] || null;
    const multiTripOptions = buildMultiTripOptions(balance);

    if (balance <= 0) {
      return {
        tone: "empty",
        eyebrow: "ابدأ من الصفر",
        title: "أضف أول مبلغ لصندوق السفر",
        message:
          "كل مبلغ تضيفه سيغيّر الاقتراحات تلقائياً ويقرّبك من وجهة مناسبة.",
        bestNow: null,
        nextUpgrade: DESTINATIONS[0],
        affordable: [],
        multiTripOptions: []
      };
    }

    if (!bestNow) {
      return {
        tone: "building",
        eyebrow: "صندوقك بدأ يكبر",
        title: `باقي لك ${formatCurrency(
          DESTINATIONS[0].cost - balance
        )} لرحلة باكو`,
        message:
          "استمر في إضافة الرصيد، وأول خيار مناسب سيفتح لك تلقائياً.",
        bestNow: null,
        nextUpgrade: DESTINATIONS[0],
        affordable: [],
        multiTripOptions: []
      };
    }

    if (multiTripOptions.length) {
      const bestPair = multiTripOptions[0];

      return {
        tone: "multi",
        eyebrow: "رصيدك يفتح أكثر من خيار",
        title: "تقدر ترتب سفرتين بدل سفرة واحدة",
        message:
          `${bestPair.trips[0].title} و${bestPair.trips[1].title} ضمن رصيدك الحالي.`,
        bestNow,
        nextUpgrade,
        affordable,
        multiTripOptions
      };
    }

    if (nextUpgrade) {
      return {
        tone: "ready",
        eyebrow: "تقدر تسافر الحين",
        title: `تقدر ترتب ${bestNow.title} لمدة ${bestNow.days} أيام`,
        message: `ولو زدت ${formatCurrency(
          nextUpgrade.cost - balance
        )} تقدر تنتقل إلى ${nextUpgrade.title}.`,
        bestNow,
        nextUpgrade,
        affordable,
        multiTripOptions: []
      };
    }

    return {
      tone: "premium",
      eyebrow: "ميزانيتك ممتازة",
      title: `تقدر ترتب ${bestNow.title} براحة`,
      message:
        "رصيدك الحالي يغطي أعلى خيار موجود، وتقدر تختار بين رحلة فاخرة أو أكثر من سفرة.",
      bestNow,
      nextUpgrade: null,
      affordable,
      multiTripOptions
    };
  };

  const buildTravelAdvice = async (balance, raw, wallet) => {
    const fallback = buildFallbackTravelAdvice(balance);

    const brainResult = await callFirst(
      getTravelBrain(),
      [
        "analyzeTravelBudget",
        "buildBudgetAdvice",
        "getBudgetRecommendations"
      ],
      {
        balance,
        currency: wallet.currency,
        wallet,
        destinations: clone(DESTINATIONS),
        profile: raw.profile || {},
        plannedTrips: asArray(raw.plannedTrips)
      }
    );

    if (!brainResult || typeof brainResult !== "object") {
      return fallback;
    }

    return {
      ...fallback,
      ...brainResult,
      affordable: asArray(brainResult.affordable).length
        ? asArray(brainResult.affordable)
        : fallback.affordable,
      multiTripOptions: asArray(brainResult.multiTripOptions).length
        ? asArray(brainResult.multiTripOptions)
        : fallback.multiTripOptions,
      bestNow: brainResult.bestNow || fallback.bestNow,
      nextUpgrade: brainResult.nextUpgrade || fallback.nextUpgrade
    };
  };

  const buildSnapshot = async () => {
    const raw = readStoreState();
    const wallet = getWallet();
    const analysis = await buildTravelAdvice(wallet.balance, raw, wallet);

    const deposits = wallet.transactions
      .filter((item) => item.type === TRANSACTION_TYPES.DEPOSIT)
      .reduce((total, item) => total + item.amount, wallet.openingBalance);

    const withdrawals = wallet.transactions
      .filter((item) => item.type === TRANSACTION_TYPES.WITHDRAWAL)
      .reduce((total, item) => total + item.amount, 0);

    const expenses = wallet.transactions
      .filter((item) => item.type === TRANSACTION_TYPES.EXPENSE)
      .reduce((total, item) => total + item.amount, 0);

    const snapshot = {
      raw,
      wallet,
      analysis,
      currency: wallet.currency || raw.profile?.currency || "AED",
      balance: wallet.balance,
      totals: { deposits, withdrawals, expenses },
      recentTransactions: wallet.transactions.slice(0, 5),
      plannedTrips: asArray(raw.plannedTrips),
      integrations: {
        travelBrain: Boolean(getTravelBrain()),
        travelAssistant: Boolean(getTravelAssistant()),
        travelImport: Boolean(getTravelImport()),
        travelSync: Boolean(getTravelSync()),
        store: Boolean(getStore()),
        app: Boolean(getApp())
      }
    };

    state.snapshot = snapshot;
    return snapshot;
  };

  /* =========================================================
     Rendering — existing CSS hooks preserved
  ========================================================= */

  const renderHero = (snapshot) => `
    <section class="tic-budget-simple-hero tic-budget-wallet-hero">
      <article class="tic-budget-balance-card tic-budget-balance-card-featured">
        <div class="tic-budget-hero-main">
          <div class="tic-budget-hero-copy">
            <span class="tic-budget-simple-eyebrow">BUDGET CENTER</span>
            <h1>ميزانية سفرك</h1>
            <p>أضف رصيدك، وخلك تعرف مباشرة وين تقدر تسافر.</p>
          </div>

          <div class="tic-budget-hero-icon" aria-hidden="true">◈</div>
        </div>

        <div class="tic-budget-wallet-summary">
          <div class="tic-budget-wallet-balance">
            <small>رصيد السفر الحالي</small>
            <strong>${escapeHTML(
              formatCurrency(snapshot.balance, snapshot.currency)
            )}</strong>
          </div>

          <div class="tic-budget-wallet-status">
            <span>
              ${snapshot.balance > 0 ? "رصيدك جاهز للتخطيط" : "ابدأ من الصفر"}
            </span>
            <small>
              ${
                snapshot.balance > 0
                  ? "اقتراحاتك تتحدث تلقائياً"
                  : "أضف أول مبلغ لصندوق السفر"
              }
            </small>
          </div>
        </div>

        <div class="tic-budget-primary-actions">
          ${button({
            label: "إضافة رصيد",
            action: "open-deposit",
            tone: "primary",
            icon: "+"
          })}

          <button type="button" class="tic-budget-withdraw-link"
            data-budget-action="open-withdrawal">
            سحب من الرصيد
          </button>
        </div>
      </article>
    </section>
  `;

  const renderAdvice = (snapshot) => {
    const analysis = snapshot.analysis;

    return `
      <section class="tic-budget-simple-section">
        <div class="tic-budget-simple-heading">
          <div>
            <small>SMART TRAVEL ADVICE</small>
            <h2>شو تقدر تسافر؟</h2>
          </div>
        </div>

        <article class="tic-budget-main-advice tic-budget-main-advice-${escapeHTML(
          analysis.tone
        )}">
          <span class="tic-budget-advice-eyebrow">
            ${escapeHTML(analysis.eyebrow)}
          </span>
          <h3>${escapeHTML(analysis.title)}</h3>
          <p>${escapeHTML(analysis.message)}</p>

          <div class="tic-budget-advice-actions">
            ${
              analysis.bestNow
                ? `
                  ${button({
                    label: "رتب الرحلة",
                    action: "add-planned-trip",
                    tone: "primary",
                    attrs: `data-destination-id="${escapeHTML(
                      analysis.bestNow.id
                    )}"`
                  })}
                  ${button({
                    label: "عرض التفاصيل",
                    action: "open-destination",
                    attrs: `data-destination-id="${escapeHTML(
                      analysis.bestNow.id
                    )}"`
                  })}
                `
                : button({
                    label: "أضف أول مبلغ",
                    action: "open-deposit",
                    tone: "primary"
                  })
            }
          </div>
        </article>
      </section>
    `;
  };

  const renderDestinationCard = (
    destination,
    snapshot,
    mode = "available"
  ) => {
    const missing = Math.max(0, destination.cost - snapshot.balance);
    const available = mode === "available";

    return `
      <article class="tic-budget-destination-card"
        data-destination-card="${escapeHTML(destination.id)}">
        <div class="tic-budget-destination-head">
          <div>
            <span class="tic-budget-destination-label">
              ${
                available
                  ? "مناسبة الآن"
                  : `زد ${escapeHTML(
                      formatCurrency(missing, snapshot.currency)
                    )}`
              }
            </span>
            <h3>${escapeHTML(destination.title)}</h3>
            <p>${escapeHTML(
              `${destination.country} • ${destination.days} أيام`
            )}</p>
          </div>

          <strong>${escapeHTML(
            formatCurrency(destination.cost, snapshot.currency)
          )}</strong>
        </div>

        <div class="tic-budget-destination-tags">
          ${asArray(destination.tags)
            .slice(0, 3)
            .map((tag) => `<span>${escapeHTML(tag)}</span>`)
            .join("")}
        </div>

        <div class="tic-budget-destination-actions">
          ${
            available
              ? button({
                  label: "أضف الرحلة",
                  action: "add-planned-trip",
                  tone: "primary",
                  attrs: `data-destination-id="${escapeHTML(destination.id)}"`
                })
              : button({
                  label: "أضف الفرق",
                  action: "quick-add-difference",
                  tone: "primary",
                  attrs: `data-destination-id="${escapeHTML(destination.id)}"`
                })
          }

          ${button({
            label: "التفاصيل",
            action: "open-destination",
            attrs: `data-destination-id="${escapeHTML(destination.id)}"`
          })}
        </div>
      </article>
    `;
  };

  const renderSuggestions = (snapshot) => {
    const available = asArray(snapshot.analysis.affordable).slice(0, 2);
    const upcoming = buildUpcoming(snapshot.balance).slice(0, 2);
    const suggestions = [];

    available.forEach((destination) =>
      suggestions.push({ destination, mode: "available" })
    );

    upcoming.forEach((destination) => {
      if (
        !suggestions.some(
          (entry) => entry.destination.id === destination.id
        )
      ) {
        suggestions.push({ destination, mode: "upcoming" });
      }
    });

    return `
      <section class="tic-budget-simple-section">
        <div class="tic-budget-simple-heading">
          <div>
            <small>BEST OPTIONS</small>
            <h2>أفضل الخيارات لك</h2>
            <p>اسحب بين الخيارات للمقارنة بشكل أسرع.</p>
          </div>
        </div>

        <div class="tic-budget-destination-list"
          data-budget-suggestion-track role="region"
          aria-label="أفضل خيارات السفر" tabindex="0">
          ${suggestions
            .slice(0, 3)
            .map((entry) =>
              renderDestinationCard(
                entry.destination,
                snapshot,
                entry.mode
              )
            )
            .join("")}
        </div>
      </section>
    `;
  };

  const renderMultiTripPlan = (snapshot) => {
    const option = asArray(snapshot.analysis.multiTripOptions)[0];
    if (!option) return "";

    return `
      <section class="tic-budget-simple-section">
        <div class="tic-budget-simple-heading">
          <div>
            <small>MULTI TRIP OPTION</small>
            <h2>تقدر ترتب سفرتين</h2>
            <p>خيار ذكي لتقسيم الرصيد بدل صرفه كله على رحلة واحدة.</p>
          </div>
        </div>

        <article class="tic-budget-multi-card">
          <div class="tic-budget-multi-trips">
            ${asArray(option.trips)
              .map(
                (trip) => `
                  <div>
                    <small>${escapeHTML(trip.level)}</small>
                    <strong>${escapeHTML(trip.title)}</strong>
                    <span>${escapeHTML(
                      formatCurrency(trip.cost, snapshot.currency)
                    )}</span>
                  </div>
                `
              )
              .join("")}
          </div>

          <div class="tic-budget-multi-summary">
            <span>الإجمالي</span>
            <strong>${escapeHTML(
              formatCurrency(option.total, snapshot.currency)
            )}</strong>
            <small>
              المتبقي بعد الرحلتين:
              ${escapeHTML(
                formatCurrency(option.remaining, snapshot.currency)
              )}
            </small>
          </div>

          <div class="tic-budget-multi-actions">
            ${button({
              label: "إضافة الرحلتين",
              action: "add-multi-trip",
              tone: "primary",
              attrs: `data-multi-trip-id="${escapeHTML(option.id)}"`
            })}
          </div>
        </article>
      </section>
    `;
  };

  const transactionIcon = (type) => {
    if (type === TRANSACTION_TYPES.DEPOSIT) return "+";
    if (type === TRANSACTION_TYPES.WITHDRAWAL) return "↘";
    return "−";
  };

  const transactionTone = (type) =>
    type === TRANSACTION_TYPES.DEPOSIT
      ? "positive"
      : type === TRANSACTION_TYPES.WITHDRAWAL
        ? "neutral"
        : "expense";

  const renderTransaction = (item, snapshot) => `
    <article class="tic-budget-transaction">
      <span class="tic-budget-transaction-icon tic-budget-transaction-${escapeHTML(
        transactionTone(item.type)
      )}">
        ${escapeHTML(transactionIcon(item.type))}
      </span>

      <div>
        <strong>${escapeHTML(item.title)}</strong>
        <small>${escapeHTML(
          [formatDate(item.date), item.notes].filter(Boolean).join(" • ")
        )}</small>
      </div>

      <b>
        ${item.type === TRANSACTION_TYPES.DEPOSIT ? "+" : "−"}${escapeHTML(
          formatCurrency(item.amount, snapshot.currency)
        )}
      </b>
    </article>
  `;

  const renderRecentActivity = (snapshot) => `
    <section class="tic-budget-simple-section">
      <div class="tic-budget-simple-heading tic-budget-heading-row">
        <div>
          <small>RECENT ACTIVITY</small>
          <h2>آخر الحركات</h2>
        </div>

        ${
          snapshot.wallet.transactions.length > 5
            ? button({
                label: "عرض الكل",
                action: "open-history",
                small: true
              })
            : ""
        }
      </div>

      ${
        snapshot.recentTransactions.length
          ? `
            <div class="tic-budget-transactions">
              ${snapshot.recentTransactions
                .map((item) => renderTransaction(item, snapshot))
                .join("")}
            </div>
          `
          : `
            <article class="tic-budget-empty-card">
              <h3>ما عندك حركات للحين</h3>
              <p>
                أول مبلغ تضيفه بيظهر هنا، وبعدها تتحدث اقتراحات السفر تلقائياً.
              </p>
            </article>
          `
      }
    </section>
  `;

  const renderMiniSummary = (snapshot) => `
    <section class="tic-budget-mini-summary">
      <article>
        <small>إجمالي الإضافات</small>
        <strong>${escapeHTML(
          formatCurrency(snapshot.totals.deposits, snapshot.currency)
        )}</strong>
      </article>

      <article>
        <small>إجمالي السحب</small>
        <strong>${escapeHTML(
          formatCurrency(snapshot.totals.withdrawals, snapshot.currency)
        )}</strong>
      </article>

      <article>
        <small>مصروفات السفر</small>
        <strong>${escapeHTML(
          formatCurrency(snapshot.totals.expenses, snapshot.currency)
        )}</strong>
      </article>
    </section>
  `;

  const renderPage = (snapshot) => `
    <div class="tic-module tic-budget-simple"
      data-page="${PAGE_ID}" data-page-version="${PAGE_VERSION}">
      ${renderHero(snapshot)}
      ${renderAdvice(snapshot)}
      ${renderSuggestions(snapshot)}
      ${renderMultiTripPlan(snapshot)}
      ${renderRecentActivity(snapshot)}
      ${renderMiniSummary(snapshot)}
      <div data-budget-dialog-root></div>
    </div>
  `;

  /* =========================================================
     Dialogs
  ========================================================= */

  const renderDialogShell = ({
    title,
    subtitle = "",
    body = "",
    submitLabel = "حفظ",
    submitAction = ""
  }) => `
    <div class="tic-budget-dialog-backdrop" data-budget-dialog-backdrop>
      <section class="tic-budget-dialog" role="dialog" aria-modal="true"
        aria-label="${escapeHTML(title)}">
        <header class="tic-budget-dialog-head">
          <div>
            <h2>${escapeHTML(title)}</h2>
            ${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ""}
          </div>

          <button type="button" class="tic-budget-dialog-close"
            data-budget-action="close-dialog" aria-label="إغلاق">×</button>
        </header>

        <div class="tic-budget-dialog-body">${body}</div>

        <footer class="tic-budget-dialog-footer">
          ${button({ label: "إلغاء", action: "close-dialog" })}
          ${
            submitAction
              ? button({
                  label: submitLabel,
                  action: submitAction,
                  tone: "primary"
                })
              : ""
          }
        </footer>
      </section>
    </div>
  `;

  const formField = ({
    label,
    name,
    type = "text",
    value = "",
    placeholder = "",
    required = false,
    min = "",
    step = ""
  }) => `
    <label class="tic-budget-field">
      <span>${escapeHTML(label)}</span>
      <input type="${escapeHTML(type)}" name="${escapeHTML(name)}"
        value="${escapeHTML(value)}" placeholder="${escapeHTML(placeholder)}"
        ${required ? "required" : ""}
        ${min !== "" ? `min="${escapeHTML(min)}"` : ""}
        ${step !== "" ? `step="${escapeHTML(step)}"` : ""}>
    </label>
  `;

  const openDialog = (name, payload = {}) => {
    if (!state.container) return false;

    const root = state.container.querySelector("[data-budget-dialog-root]");
    const snapshot = state.snapshot;
    if (!root || !snapshot) return false;

    let html = "";

    if (name === DIALOGS.DEPOSIT) {
      html = renderDialogShell({
        title: "إضافة رصيد للسفر",
        subtitle: "أضف أي مبلغ خصصته للسفر.",
        submitLabel: "إضافة الرصيد",
        submitAction: "submit-deposit",
        body: `
          <form class="tic-budget-form" data-budget-form="deposit">
            ${formField({
              label: "المبلغ",
              name: "amount",
              type: "number",
              min: "1",
              step: "1",
              value: payload.amount || "",
              placeholder: "مثال: 2000",
              required: true
            })}
            ${formField({
              label: "المصدر",
              name: "title",
              value: payload.title || "إضافة رصيد",
              placeholder: "مثال: ادخار شهر يوليو"
            })}
            ${formField({
              label: "التاريخ",
              name: "date",
              type: "date",
              value: todayISO(),
              required: true
            })}
            ${formField({
              label: "ملاحظة اختيارية",
              name: "notes",
              placeholder: "مثال: من الراتب"
            })}
          </form>
        `
      });
    } else if (name === DIALOGS.WITHDRAWAL) {
      html = renderDialogShell({
        title: "سحب من رصيد السفر",
        subtitle: `رصيدك الحالي ${formatCurrency(
          snapshot.balance,
          snapshot.currency
        )}.`,
        submitLabel: "تأكيد السحب",
        submitAction: "submit-withdrawal",
        body: `
          <form class="tic-budget-form" data-budget-form="withdrawal">
            ${formField({
              label: "المبلغ",
              name: "amount",
              type: "number",
              min: "1",
              step: "1",
              placeholder: "مثال: 500",
              required: true
            })}
            ${formField({
              label: "سبب السحب",
              name: "title",
              value: "سحب من صندوق السفر",
              placeholder: "مثال: حجز تذكرة أو فندق"
            })}
            ${formField({
              label: "التاريخ",
              name: "date",
              type: "date",
              value: todayISO(),
              required: true
            })}
            ${formField({
              label: "ملاحظة اختيارية",
              name: "notes",
              placeholder: "تفاصيل السحب"
            })}
          </form>
        `
      });
    } else if (name === DIALOGS.HISTORY) {
      html = renderDialogShell({
        title: "سجل الحركات",
        subtitle: "جميع إضافات وسحوبات صندوق السفر والحركات السابقة.",
        body: `
          <div class="tic-budget-history-list">
            ${
              snapshot.wallet.transactions.length
                ? snapshot.wallet.transactions
                    .map((item) => renderTransaction(item, snapshot))
                    .join("")
                : `
                  <article class="tic-budget-empty-card">
                    <h3>لا توجد حركات</h3>
                    <p>أضف أول مبلغ حتى يبدأ السجل.</p>
                  </article>
                `
            }
          </div>
        `
      });
    } else if (name === DIALOGS.DESTINATION) {
      const destination = getDestination(payload.destinationId);
      if (!destination) return false;

      const missing = Math.max(0, destination.cost - snapshot.balance);
      state.selectedDestinationId = destination.id;

      html = renderDialogShell({
        title: destination.title,
        subtitle: `${destination.country} • ${destination.days} أيام`,
        submitLabel: missing > 0 ? "أضف الفرق" : "إضافة إلى رحلاتي",
        submitAction:
          missing > 0
            ? "submit-destination-difference"
            : "submit-destination-trip",
        body: `
          <article class="tic-budget-destination-detail"
            data-dialog-destination-id="${escapeHTML(destination.id)}">
            <span>${escapeHTML(destination.bestFor)}</span>
            <h3>${escapeHTML(
              formatCurrency(destination.cost, snapshot.currency)
            )}</h3>
            <p>${escapeHTML(destination.summary)}</p>

            <div class="tic-budget-destination-tags">
              ${destination.tags
                .map((tag) => `<span>${escapeHTML(tag)}</span>`)
                .join("")}
            </div>

            ${
              missing > 0
                ? `
                  <div class="tic-budget-difference-box">
                    <small>تحتاج زيادة</small>
                    <strong>${escapeHTML(
                      formatCurrency(missing, snapshot.currency)
                    )}</strong>
                  </div>
                `
                : `
                  <div class="tic-budget-ready-box">
                    مناسبة لرصيدك الحالي
                  </div>
                `
            }
          </article>
        `
      });
    }

    if (!html) return false;

    root.innerHTML = html;
    state.activeDialog = name;
    document.body.classList.add("tic-budget-dialog-open");

    window.requestAnimationFrame(() => {
      root.querySelector("input, select, textarea")?.focus?.();
    });

    emit("dialog-opened", { dialog: name });
    return true;
  };

  const closeDialog = () => {
    const root = state.container?.querySelector("[data-budget-dialog-root]");
    if (root) root.innerHTML = "";

    state.activeDialog = null;
    state.selectedDestinationId = null;
    document.body.classList.remove("tic-budget-dialog-open");

    if (state.pendingRefresh) {
      state.pendingRefresh = false;
      scheduleRefresh({ force: true, delay: 80 });
    }

    return true;
  };

  const getFormData = (name) => {
    const form = state.container?.querySelector(
      `[data-budget-form="${name}"]`
    );

    if (!form || !form.reportValidity()) return null;

    return {
      form,
      values: Object.fromEntries(new FormData(form).entries())
    };
  };

  /* =========================================================
     Planned trips integration
  ========================================================= */

  const isDestinationPlanned = (destination) =>
    asArray(readStoreState().plannedTrips).some(
      (trip) =>
        String(
          trip.sourceRecommendationId ||
          trip.destinationId ||
          ""
        ) === String(destination.id) &&
        !["archived", "cancelled"].includes(trip.status)
    );

  const createPlannedTripPayload = (destination) => ({
    id: createId("planned_trip"),
    title: destination.title,
    destination: destination.city,
    destinationId: destination.id,
    country: destination.country,
    countryCode: destination.countryCode,
    city: destination.city,
    durationDays: destination.days,
    estimatedBudget: destination.cost,
    budget: destination.cost,
    currency: state.snapshot?.currency || "AED",
    planningStatus: "planned",
    status: "planned",
    sourceRecommendationId: destination.id,
    source: "simple-budget-advisor",
    notes: destination.summary,
    highlights: clone(destination.tags),
    checklist: {
      destinationApproved: true,
      budgetApproved: true,
      flightBooked: false,
      hotelBooked: false,
      insuranceReady: false,
      visaReady: false,
      documentsReady: false,
      activitiesPlanned: false,
      packingReady: false
    },
    createdAt: nowISO(),
    updatedAt: nowISO()
  });

  const addPlannedTrip = async (destinationId, silent = false) => {
    const destination = getDestination(destinationId);
    const store = getStore();

    if (!destination || !store) {
      if (!silent) notify("تعذر إضافة الرحلة حالياً.", "danger");
      return false;
    }

    if (isDestinationPlanned(destination)) {
      if (!silent) {
        notify(
          "هذه الرحلة موجودة بالفعل ضمن الرحلات المخطط لها.",
          "info"
        );
      }
      return true;
    }

    const payload = createPlannedTripPayload(destination);
    let result = null;

    try {
      if (typeof store.createPlannedTripFromRecommendation === "function") {
        result = await store.createPlannedTripFromRecommendation(payload);
      } else if (typeof store.createPlannedTrip === "function") {
        result = await store.createPlannedTrip(payload);
      } else if (typeof store.addPlannedTrip === "function") {
        result = await store.addPlannedTrip(payload);
      } else if (typeof store.dispatch === "function") {
        result =
          (await store.dispatch("plannedTrips/add", payload)) ??
          (await store.dispatch("ADD_PLANNED_TRIP", payload));
      } else if (typeof store.set === "function") {
        const next = [...asArray(readStoreState().plannedTrips), payload];
        store.set("plannedTrips", next, {
          immediate: true,
          source: "budget-page"
        });
        result = payload;
      }
    } catch (error) {
      console.error("TIC Budget planned trip creation failed:", error);
    }

    if (!result) {
      if (!silent) {
        notify(
          "تعذر إضافة الرحلة إلى الرحلات المخطط لها.",
          "danger"
        );
      }
      return false;
    }

    await Promise.allSettled([
      callFirst(
        getTravelAssistant(),
        ["onPlannedTripCreated", "analyzeTrip", "prepareTripAssistant"],
        result,
        buildIntegrationContext({ destination })
      ),
      callFirst(
        getTravelImport(),
        ["registerTripDraft", "attachPendingImports", "linkTrip"],
        result,
        buildIntegrationContext({ destination })
      ),
      callFirst(
        getTravelSync(),
        ["syncTrip", "queueSync", "syncNow"],
        result,
        buildIntegrationContext({ destination })
      )
    ]);

    if (!silent) {
      notify(
        "تمت إضافة الرحلة إلى الرحلات المخطط لها.",
        "success"
      );
    }

    emit("planned-trip-created", {
      destinationId,
      plannedTrip: clone(result)
    });

    notifyIntegrations("planned-trip-created", {
      destinationId,
      plannedTrip: clone(result)
    });

    return true;
  };

  /* =========================================================
     Actions and DOM events
  ========================================================= */

  const handleAction = async (action, target) => {
    const snapshot = state.snapshot;
    if (!snapshot) return;

    if (action === "close-dialog") {
      closeDialog();
      return;
    }

    if (action === "open-deposit") {
      openDialog(DIALOGS.DEPOSIT);
      return;
    }

    if (action === "open-withdrawal") {
      openDialog(DIALOGS.WITHDRAWAL);
      return;
    }

    if (action === "open-history") {
      openDialog(DIALOGS.HISTORY);
      return;
    }

    if (action === "open-destination") {
      openDialog(DIALOGS.DESTINATION, {
        destinationId: target.dataset.destinationId
      });
      return;
    }

    if (action === "submit-deposit") {
      const formData = getFormData("deposit");
      if (!formData) return;

      const saved = addTransaction({
        type: TRANSACTION_TYPES.DEPOSIT,
        amount: formData.values.amount,
        title: formData.values.title || "إضافة رصيد",
        notes: formData.values.notes,
        date: formData.values.date
      });

      if (!saved.ok) {
        notify("تعذر إضافة الرصيد.", "danger");
        return;
      }

      closeDialog();
      notify("تمت إضافة الرصيد وتحديث اقتراحات السفر.", "success");
      await refresh({ force: true, preserveScroll: true });
      return;
    }

    if (action === "submit-withdrawal") {
      const formData = getFormData("withdrawal");
      if (!formData) return;

      const saved = addTransaction({
        type: TRANSACTION_TYPES.WITHDRAWAL,
        amount: formData.values.amount,
        title: formData.values.title || "سحب من الرصيد",
        notes: formData.values.notes,
        date: formData.values.date
      });

      if (!saved.ok && saved.reason === "insufficient-balance") {
        notify(
          `المبلغ أكبر من رصيدك الحالي ${formatCurrency(
            saved.balance,
            snapshot.currency
          )}.`,
          "danger"
        );
        return;
      }

      if (!saved.ok) {
        notify("تعذر سحب المبلغ.", "danger");
        return;
      }

      closeDialog();
      notify("تم سحب المبلغ وتحديث الرصيد.", "success");
      await refresh({ force: true, preserveScroll: true });
      return;
    }

    if (action === "quick-add-difference") {
      const destination = getDestination(target.dataset.destinationId);
      if (!destination) return;

      openDialog(DIALOGS.DEPOSIT, {
        amount: Math.max(0, destination.cost - snapshot.balance),
        title: `إكمال ميزانية ${destination.title}`
      });
      return;
    }

    if (action === "add-planned-trip") {
      await addPlannedTrip(target.dataset.destinationId);
      await refresh({ force: true, preserveScroll: true });
      return;
    }

    if (action === "add-multi-trip") {
      const option = asArray(snapshot.analysis.multiTripOptions).find(
        (item) => item.id === target.dataset.multiTripId
      );

      if (!option) return;

      const results = await Promise.all(
        asArray(option.trips).map((trip) =>
          addPlannedTrip(trip.id, true)
        )
      );

      notify(
        results.every(Boolean)
          ? "تمت إضافة الرحلتين إلى الرحلات المخطط لها."
          : "تمت إضافة الرحلات المتاحة، وتعذر إضافة بعضها.",
        results.every(Boolean) ? "success" : "info"
      );

      await refresh({ force: true, preserveScroll: true });
      return;
    }

    if (action === "submit-destination-difference") {
      const destination = getDestination(state.selectedDestinationId);
      if (!destination) return;

      const difference = Math.max(
        0,
        destination.cost - snapshot.balance
      );

      closeDialog();
      openDialog(DIALOGS.DEPOSIT, {
        amount: difference,
        title: `إكمال ميزانية ${destination.title}`
      });
      return;
    }

    if (action === "submit-destination-trip") {
      const destinationId = state.selectedDestinationId;
      closeDialog();
      await addPlannedTrip(destinationId);
      await refresh({ force: true, preserveScroll: true });
    }
  };

  const onContainerClick = (event) => {
    const target = event.target.closest("[data-budget-action]");

    if (!target) {
      if (event.target.matches("[data-budget-dialog-backdrop]")) {
        closeDialog();
      }
      return;
    }

    event.preventDefault();

    handleAction(target.dataset.budgetAction, target).catch((error) => {
      console.error("TIC Budget action failed:", error);
      notify("حدث خطأ أثناء تنفيذ العملية.", "danger");
    });
  };

  const finishSuggestionSwipe = (track) => {
    window.clearTimeout(state.swipeIdleTimer);

    state.swipeIdleTimer = window.setTimeout(() => {
      state.isSuggestionSwiping = false;
      state.suggestionScrollLeft = track?.scrollLeft || 0;

      if (state.pendingRefresh && !state.isUserScrolling) {
        state.pendingRefresh = false;
        scheduleRefresh({ delay: 180 });
      }
    }, SWIPE_IDLE_DELAY);
  };

  const markSuggestionActivity = (track) => {
    if (!track || !state.mounted || state.activeDialog) return;

    state.isSuggestionSwiping = true;
    state.suggestionScrollLeft = track.scrollLeft;
    finishSuggestionSwipe(track);
  };

  const onContainerScroll = (event) => {
    const track = event.target.closest?.("[data-budget-suggestion-track]");
    if (track) markSuggestionActivity(track);
  };

  const onContainerTouchStart = (event) => {
    const track = event.target.closest?.("[data-budget-suggestion-track]");
    if (!track) return;

    state.isSuggestionSwiping = true;
    state.suggestionScrollLeft = track.scrollLeft;
    window.clearTimeout(state.swipeIdleTimer);
  };

  const onContainerTouchEnd = (event) => {
    const track = event.target.closest?.("[data-budget-suggestion-track]");
    if (track) finishSuggestionSwipe(track);
  };

  const unbindContainerEvents = () => {
    if (!state.container) return;

    state.container.removeEventListener("click", onContainerClick);
    state.container.removeEventListener("scroll", onContainerScroll, true);
    state.container.removeEventListener("touchstart", onContainerTouchStart);
    state.container.removeEventListener("touchend", onContainerTouchEnd);
    state.container.removeEventListener("touchcancel", onContainerTouchEnd);
  };

  const bindContainerEvents = () => {
    if (!state.container) return;

    unbindContainerEvents();

    state.container.addEventListener("click", onContainerClick);
    state.container.addEventListener("scroll", onContainerScroll, true);
    state.container.addEventListener("touchstart", onContainerTouchStart, {
      passive: true
    });
    state.container.addEventListener("touchend", onContainerTouchEnd, {
      passive: true
    });
    state.container.addEventListener("touchcancel", onContainerTouchEnd, {
      passive: true
    });
  };

  const restoreSuggestionPosition = () => {
    const track = state.container?.querySelector(
      "[data-budget-suggestion-track]"
    );

    if (track) track.scrollLeft = state.suggestionScrollLeft || 0;
  };

  /* =========================================================
     Scroll stability and refresh
  ========================================================= */

  const signature = (snapshot) => {
    try {
      return JSON.stringify({
        balance: snapshot.balance,
        currency: snapshot.currency,
        totals: snapshot.totals,
        transactions: snapshot.wallet.transactions.map((item) => [
          item.id,
          item.type,
          item.amount,
          item.createdAt
        ]),
        plannedTrips: snapshot.plannedTrips.map((trip) => [
          trip.id,
          trip.status,
          trip.updatedAt
        ]),
        advice: {
          tone: snapshot.analysis.tone,
          bestNow: snapshot.analysis.bestNow?.id || null,
          nextUpgrade: snapshot.analysis.nextUpgrade?.id || null,
          multi: asArray(snapshot.analysis.multiTripOptions).map(
            (item) => item.id
          )
        }
      });
    } catch (_) {
      return String(Date.now());
    }
  };

  const markScrollActivity = () => {
    if (!state.mounted || state.activeDialog) return;

    state.isUserScrolling = true;
    state.lastKnownScrollY = window.scrollY;
    window.clearTimeout(state.scrollIdleTimer);

    state.scrollIdleTimer = window.setTimeout(() => {
      state.isUserScrolling = false;
      state.lastKnownScrollY = window.scrollY;

      if (state.pendingRefresh && !state.isSuggestionSwiping) {
        state.pendingRefresh = false;
        scheduleRefresh({ delay: 180 });
      }
    }, SCROLL_IDLE_DELAY);
  };

  const bindGlobalEvent = (name, eventName, handler, target = window, options) => {
    if (state.eventBindings.some((binding) => binding.name === name)) return;

    target.addEventListener(eventName, handler, options);
    state.eventBindings.push({
      name,
      eventName,
      handler,
      target,
      options
    });
  };

  const bindScrollStability = () => {
    bindGlobalEvent(
      "budget-scroll",
      "scroll",
      markScrollActivity,
      window,
      { passive: true }
    );

    bindGlobalEvent(
      "budget-touchstart",
      "touchstart",
      () => {
        if (!state.mounted || state.activeDialog) return;
        state.isUserScrolling = true;
        state.lastKnownScrollY = window.scrollY;
      },
      window,
      { passive: true }
    );

    bindGlobalEvent(
      "budget-touchmove",
      "touchmove",
      markScrollActivity,
      window,
      { passive: true }
    );

    bindGlobalEvent(
      "budget-touchend",
      "touchend",
      markScrollActivity,
      window,
      { passive: true }
    );
  };

  const refresh = async ({
    preserveScroll = true,
    force = false
  } = {}) => {
    if (!state.container || !state.mounted || state.destroyed) return false;

    if (state.refreshing) {
      state.refreshQueued = true;
      state.pendingForceRefresh = state.pendingForceRefresh || force;
      return false;
    }

    if (
      !force &&
      (state.isUserScrolling ||
        state.isSuggestionSwiping ||
        state.activeDialog)
    ) {
      state.pendingRefresh = true;
      return false;
    }

    state.refreshing = true;
    const generation = ++state.refreshGeneration;
    const previousScrollY = window.scrollY;
    const previousSuggestionScroll =
      state.container.querySelector("[data-budget-suggestion-track]")
        ?.scrollLeft || state.suggestionScrollLeft;

    try {
      const snapshot = await buildSnapshot();

      if (
        generation !== state.refreshGeneration ||
        !state.mounted ||
        !state.container
      ) {
        return false;
      }

      const nextSignature = signature(snapshot);

      if (!force && nextSignature === state.lastSignature) {
        return false;
      }

      state.suggestionScrollLeft = previousSuggestionScroll;
      state.container.innerHTML = renderPage(snapshot);
      state.lastSignature = nextSignature;

      bindContainerEvents();

      window.requestAnimationFrame(() => {
        restoreSuggestionPosition();

        window.scrollTo({
          top: preserveScroll ? previousScrollY : 0,
          behavior: "auto"
        });
      });

      emit("refreshed", {
        balance: snapshot.balance,
        transactionCount: snapshot.wallet.transactions.length,
        bestDestination: snapshot.analysis.bestNow?.id || null
      });

      return true;
    } finally {
      if (generation === state.refreshGeneration) {
        state.refreshing = false;
      }

      if (
        state.refreshQueued &&
        !state.isUserScrolling &&
        !state.isSuggestionSwiping &&
        !state.activeDialog
      ) {
        const queuedForce = state.pendingForceRefresh;
        state.refreshQueued = false;
        state.pendingForceRefresh = false;

        window.setTimeout(() => {
          refresh({
            preserveScroll: true,
            force: queuedForce
          });
        }, 90);
      }
    }
  };

  const scheduleRefresh = ({
    force = false,
    delay = REFRESH_DELAY
  } = {}) => {
    if (!state.mounted || state.destroyed) return false;

    if (
      !force &&
      (state.isUserScrolling ||
        state.isSuggestionSwiping ||
        state.activeDialog)
    ) {
      state.pendingRefresh = true;
      return false;
    }

    window.clearTimeout(state.refreshTimer);

    state.refreshTimer = window.setTimeout(() => {
      state.refreshTimer = null;

      refresh({
        preserveScroll: true,
        force
      });
    }, delay);

    return true;
  };

  /* =========================================================
     Registration and integration subscriptions
  ========================================================= */

  const registerActions = () => {
    const ui = getUI();
    if (!ui || typeof ui.registerAction !== "function") return;

    const register = (name, handler) => {
      if (ui.hasAction?.(name)) return;

      const unsubscribe = ui.registerAction(name, handler);
      if (typeof unsubscribe === "function") {
        state.actionUnsubscribers.push(unsubscribe);
      }
    };

    register("budget-add-balance", () => openDialog(DIALOGS.DEPOSIT));
    register("budget-withdraw-balance", () =>
      openDialog(DIALOGS.WITHDRAWAL)
    );
    register("budget-add-expense", () =>
      openDialog(DIALOGS.WITHDRAWAL)
    );
  };

  const subscribeToStore = () => {
    const store = getStore();

    if (
      !store ||
      typeof store.subscribe !== "function" ||
      state.unsubscribeStore
    ) {
      return;
    }

    state.unsubscribeStore = store.subscribe(() => {
      if (!state.mounted || state.destroyed) return;

      window.clearTimeout(state.storeRefreshTimer);

      state.storeRefreshTimer = window.setTimeout(() => {
        if (
          state.refreshing ||
          state.isUserScrolling ||
          state.isSuggestionSwiping ||
          state.activeDialog
        ) {
          state.pendingRefresh = true;
          state.pendingForceRefresh = true;
          return;
        }

        scheduleRefresh({ force: true, delay: 80 });
      }, STORE_REFRESH_DELAY);
    });
  };

  const subscribeSafely = (service, callback, eventNames = []) => {
    if (!service) return [];

    const unsubscribers = [];

    if (typeof service.subscribe === "function") {
      try {
        const unsubscribe = service.subscribe(callback);
        if (typeof unsubscribe === "function") {
          unsubscribers.push(unsubscribe);
        }
      } catch (error) {
        console.error("TIC Budget service subscription error:", error);
      }
    }

    if (typeof service.on === "function") {
      eventNames.forEach((eventName) => {
        try {
          const unsubscribe = service.on(eventName, callback);

          if (typeof unsubscribe === "function") {
            unsubscribers.push(unsubscribe);
          } else if (typeof service.off === "function") {
            unsubscribers.push(() => service.off(eventName, callback));
          }
        } catch (error) {
          console.error(
            `TIC Budget ${eventName} subscription error:`,
            error
          );
        }
      });
    }

    return unsubscribers;
  };

  const unsubscribeIntegrations = () => {
    state.integrationUnsubscribers.forEach((unsubscribe) => {
      try {
        unsubscribe?.();
      } catch (_) {}
    });

    state.integrationUnsubscribers = [];
  };

  const scheduleIntegrationRefresh = (eventName, detail = {}) => {
    if (!state.mounted || state.destroyed) return;

    const eventKey = `${eventName}|${text(
      detail.transactionId ||
      detail.tripId ||
      detail.destinationId ||
      ""
    )}`;

    const now = Date.now();

    if (
      eventKey === state.lastIntegrationEventKey &&
      now - state.lastIntegrationEventAt < 250
    ) {
      return;
    }

    state.lastIntegrationEventKey = eventKey;
    state.lastIntegrationEventAt = now;

    window.clearTimeout(state.integrationRefreshTimer);

    state.integrationRefreshTimer = window.setTimeout(() => {
      scheduleRefresh({
        force: true,
        delay: 80
      });
    }, INTEGRATION_REFRESH_DELAY);
  };

  const subscribeToIntegrations = () => {
    if (state.integrationUnsubscribers.length) return;

    const callback = (event = {}) => {
      const detail = event.detail || event || {};
      const eventName = text(
        detail.type || detail.eventName || detail.action || "integration"
      );

      scheduleIntegrationRefresh(eventName, detail);
    };

    [
      {
        service: getTravelBrain(),
        events: ["updated", "budget-updated", "recommendations-updated"]
      },
      {
        service: getTravelAssistant(),
        events: ["updated", "trip-updated", "budget-updated"]
      },
      {
        service: getTravelImport(),
        events: ["imported", "expense-imported", "trip-imported"]
      },
      {
        service: getTravelSync(),
        events: ["synced", "sync-complete", "remote-update"]
      },
      {
        service: getApp(),
        events: ["state-changed", "page-data-updated"]
      }
    ].forEach(({ service, events }) => {
      state.integrationUnsubscribers.push(
        ...subscribeSafely(service, callback, events)
      );
    });

    [
      "tic:travel-brain:updated",
      "tic:travel-assistant:updated",
      "tic:travel-import:completed",
      "tic:travel-sync:completed",
      "tic:app:data-updated"
    ].forEach((eventName) => {
      window.addEventListener(eventName, callback);

      state.integrationUnsubscribers.push(() =>
        window.removeEventListener(eventName, callback)
      );
    });
  };

  const bindGlobalEvents = () => {
    [
      "tic:budget-wallet-changed",
      "tic:store-change",
      "store:changed",
      "tic:planned-trips-changed",
      "tic:page:trips:refreshed"
    ].forEach((eventName) => {
      bindGlobalEvent(
        eventName,
        eventName,
        () => {
          if (state.mounted) scheduleRefresh();
        }
      );
    });
  };

  const initializeIntegrations = async () => {
    const context = buildIntegrationContext({ phase: "init" });

    await Promise.allSettled([
      callFirst(getTravelBrain(), ["init", "initialize"], context),
      callFirst(getTravelAssistant(), ["init", "initialize"], context),
      callFirst(getTravelImport(), ["init", "initialize"], context),
      callFirst(getTravelSync(), ["init", "initialize"], context)
    ]);

    subscribeToIntegrations();
  };

  /* =========================================================
     Public page module
  ========================================================= */

  const BudgetPage = {
    id: PAGE_ID,
    title: "الميزانية",
    icon: "◈",
    version: PAGE_VERSION,
    baseVersion: BASE_VERSION,

    async init() {
      if (state.initialized) return this.diagnostics();
      if (state.initializing) return state.initializing;

      state.destroyed = false;

      state.initializing = (async () => {
        registerActions();
        subscribeToStore();
        bindGlobalEvents();
        bindScrollStability();
        await initializeIntegrations();

        state.initialized = true;
        state.initializing = null;

        emit("initialized", {
          version: PAGE_VERSION,
          storeAvailable: Boolean(getStore()),
          routerAvailable: Boolean(getRouter()),
          uiAvailable: Boolean(getUI())
        });

        notifyIntegrations("page-initialized");
        return this.diagnostics();
      })();

      return state.initializing;
    },

    async render() {
      await this.init();
      return renderPage(await buildSnapshot());
    },

    async mount(context = {}) {
      await this.init();

      const container = resolveContainer(context.container);

      if (!container) {
        throw new Error(
          "TIC Budget Error: route container not found."
        );
      }

      if (state.mounted && state.container && state.container !== container) {
        this.unmount();
      }

      state.container = container;
      state.mounted = true;
      state.destroyed = false;

      const snapshot = await buildSnapshot();

      container.innerHTML = renderPage(snapshot);
      state.lastSignature = signature(snapshot);
      state.lastKnownScrollY = window.scrollY;
      state.suggestionScrollLeft = 0;

      bindContainerEvents();
      bindScrollStability();

      emit("mounted", {
        balance: snapshot.balance,
        transactionCount: snapshot.wallet.transactions.length,
        bestDestination: snapshot.analysis.bestNow?.id || null
      });

      notifyIntegrations("page-mounted");
      return container;
    },

    async afterEnter(context = {}) {
      const container = resolveContainer(context.container);

      if (container) {
        state.container = container;
        state.mounted = true;
        state.destroyed = false;
      }

      bindContainerEvents();
      bindScrollStability();

      await refresh({
        preserveScroll: false,
        force: true
      });

      notifyIntegrations("page-entered");
      return true;
    },

    beforeLeave() {
      closeDialog();
      return true;
    },

    unmount() {
      closeDialog();
      unbindContainerEvents();

      state.mounted = false;
      state.container = null;
      state.refreshGeneration += 1;
      state.refreshing = false;
      state.refreshQueued = false;
      state.pendingForceRefresh = false;
      state.pendingRefresh = false;
      state.isUserScrolling = false;
      state.isSuggestionSwiping = false;

      window.clearTimeout(state.refreshTimer);
      window.clearTimeout(state.storeRefreshTimer);
      window.clearTimeout(state.integrationRefreshTimer);
      window.clearTimeout(state.scrollIdleTimer);
      window.clearTimeout(state.swipeIdleTimer);

      emit("unmounted");
      notifyIntegrations("page-unmounted");
      return true;
    },

    refresh,

    getSnapshot() {
      return clone(state.snapshot);
    },

    getWallet() {
      return clone(getWallet());
    },

    getBalance() {
      return getWallet().balance;
    },

    addBalance(payload = {}) {
      const result = addTransaction({
        type: TRANSACTION_TYPES.DEPOSIT,
        amount: payload.amount,
        title: payload.title || "إضافة رصيد",
        notes: payload.notes,
        date: payload.date || todayISO()
      });

      if (result.ok && state.mounted) {
        refresh({ force: true, preserveScroll: true });
      }

      return clone(result);
    },

    withdrawBalance(payload = {}) {
      const result = addTransaction({
        type: TRANSACTION_TYPES.WITHDRAWAL,
        amount: payload.amount,
        title: payload.title || "سحب من الرصيد",
        notes: payload.notes,
        date: payload.date || todayISO()
      });

      if (result.ok && state.mounted) {
        refresh({ force: true, preserveScroll: true });
      }

      return clone(result);
    },

    addExpense(payload = {}) {
      const result = addTransaction({
        type: TRANSACTION_TYPES.EXPENSE,
        amount: payload.amount,
        title: payload.title || "مصروف سفر",
        category: payload.category || "other",
        notes: payload.notes,
        date: payload.date || todayISO()
      });

      if (result.ok && state.mounted) {
        refresh({ force: true, preserveScroll: true });
      }

      return clone(result);
    },

    getSuggestions() {
      const snapshot = state.snapshot;

      return clone({
        advice: snapshot?.analysis || buildFallbackTravelAdvice(getWallet().balance),
        destinations: DESTINATIONS
      });
    },

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError(
          "TIC Budget subscriber must be a function."
        );
      }

      state.subscribers.add(listener);
      return () => state.subscribers.delete(listener);
    },

    destroy() {
      this.unmount();
      state.destroyed = true;

      if (typeof state.unsubscribeStore === "function") {
        state.unsubscribeStore();
      }

      state.actionUnsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch (_) {}
      });

      unsubscribeIntegrations();

      state.eventBindings.forEach(
        ({ eventName, handler, target = window, options }) => {
          target.removeEventListener(eventName, handler, options);
        }
      );

      state.unsubscribeStore = null;
      state.actionUnsubscribers = [];
      state.eventBindings = [];
      state.subscribers.clear();
      state.snapshot = null;
      state.lastSignature = "";
      state.activeDialog = null;
      state.selectedDestinationId = null;
      state.initialized = false;
      state.initializing = null;

      return true;
    },

    diagnostics() {
      const wallet = getWallet();

      return {
        id: this.id,
        title: this.title,
        version: this.version,
        baseVersion: this.baseVersion,
        initialized: state.initialized,
        mounted: state.mounted,
        destroyed: state.destroyed,
        activeDialog: state.activeDialog,
        hasContainer: Boolean(state.container),
        storeAvailable: Boolean(getStore()),
        routerAvailable: Boolean(getRouter()),
        uiAvailable: Boolean(getUI()),
        appAvailable: Boolean(getApp()),
        travelBrainAvailable: Boolean(getTravelBrain()),
        travelAssistantAvailable: Boolean(getTravelAssistant()),
        travelImportAvailable: Boolean(getTravelImport()),
        travelSyncAvailable: Boolean(getTravelSync()),
        balance: wallet.balance,
        transactionCount: wallet.transactions.length,
        destinationCount: DESTINATIONS.length,
        subscriberCount: state.subscribers.size,
        eventBindingCount: state.eventBindings.length,
        integrationSubscriptionCount:
          state.integrationUnsubscribers.length,
        suggestionSwiping: state.isSuggestionSwiping,
        userScrolling: state.isUserScrolling,
        refreshQueued: state.refreshQueued,
        pendingRefresh: state.pendingRefresh
      };
    }
  };

  /* =========================================================
     Global registration
  ========================================================= */

  window.TIC = window.TIC || {};
  window.TIC.Pages = window.TIC.Pages || {};
  window.TIC.Pages.budget = BudgetPage;
  window.TICBudgetPage = BudgetPage;

  const router = getRouter();

  if (router && typeof router.register === "function") {
    if (!router.has?.("budget")) {
      router.register("budget", {
        id: "budget",
        title: "الميزانية",
        module: "budget",
        icon: "◈",
        visible: true,
        order: 4
      });
    }

    router.registerPage?.("budget", BudgetPage);
  }

  BudgetPage.init().catch((error) => {
    console.error("TIC Budget initialization error:", error);
  });
})(window, document);
