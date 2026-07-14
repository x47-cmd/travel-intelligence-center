/* =========================================================
   Travel Intelligence Center
   Guide Page Module V2.0.0

   File Path:
   js/pages/guide.js

   Purpose:
   - Premium iPhone-first destination guide center.
   - Browse countries, cities and travel essentials.
   - Search, filter and favorite destinations.
   - Uses TIC Store, TIC Router and TIC UI.

   Dependencies:
   - js/config.js
   - js/store.js
   - js/router.js
   - js/ui.js

   Global APIs:
   - window.TIC.Pages.guide
   - window.TICGuidePage
========================================================= */

(function (window, document) {
  "use strict";

  const PAGE_ID = "guide";
  const PAGE_VERSION = "2.0.0";

  const state = {
    initialized: false,
    mounted: false,
    container: null,
    search: "",
    activeCategory: "all",
    subscribers: new Set(),
    actionUnsubscribers: [],
    unsubscribeStore: null,
    lastSnapshot: null
  };

  const DEFAULT_DESTINATIONS = [
    {
      id: "kazakhstan-almaty",
      country: "كازاخستان",
      city: "ألماتي",
      emoji: "🏔️",
      region: "asia",
      type: "nature",
      currency: "KZT",
      visa: "تحقق من متطلبات الدخول قبل السفر.",
      weather: "صيف معتدل وشتاء بارد",
      featured: true
    },
    {
      id: "spain-madrid",
      country: "إسبانيا",
      city: "مدريد",
      emoji: "🏛️",
      region: "europe",
      type: "city",
      currency: "EUR",
      visa: "تأشيرة شنغن مطلوبة حسب الجنسية.",
      weather: "صيف حار وشتاء معتدل",
      featured: true
    },
    {
      id: "spain-marbella",
      country: "إسبانيا",
      city: "ماربيا",
      emoji: "🌊",
      region: "europe",
      type: "beach",
      currency: "EUR",
      visa: "تأشيرة شنغن مطلوبة حسب الجنسية.",
      weather: "مناخ ساحلي دافئ",
      featured: true
    },
    {
      id: "thailand-phuket",
      country: "تايلاند",
      city: "بوكيت",
      emoji: "🏝️",
      region: "asia",
      type: "beach",
      currency: "THB",
      visa: "راجع متطلبات الدخول المحدثة.",
      weather: "استوائي ورطب",
      featured: true
    },
    {
      id: "maldives-male",
      country: "المالديف",
      city: "ماليه",
      emoji: "🐚",
      region: "asia",
      type: "luxury",
      currency: "MVR",
      visa: "تأشيرة عند الوصول وفق الشروط.",
      weather: "استوائي طوال العام",
      featured: true
    },
    {
      id: "uae-dubai",
      country: "الإمارات",
      city: "دبي",
      emoji: "🌆",
      region: "middle-east",
      type: "city",
      currency: "AED",
      visa: "لا توجد متطلبات للمواطنين والمقيمين داخل الدولة.",
      weather: "حار صيفاً ومعتدل شتاءً",
      featured: false
    }
  ];

  const CATEGORIES = [
    { id: "all", label: "الكل" },
    { id: "city", label: "مدن" },
    { id: "beach", label: "بحر" },
    { id: "nature", label: "طبيعة" },
    { id: "luxury", label: "فاخرة" }
  ];

  const clone = (value) => {
    if (value === undefined) return undefined;

    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch (error) {
        // Continue to fallback.
      }
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  };

  const escapeHTML = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const text = (value) =>
    String(value ?? "").trim();

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

  const resolveContainer = (container) => {
    if (container instanceof window.Element) {
      return container;
    }

    if (typeof container === "string") {
      return document.querySelector(container);
    }

    return (
      document.querySelector("[data-router-view]") ||
      document.querySelector("#app-view") ||
      document.querySelector("#tic-page") ||
      document.querySelector("#app-content")
    );
  };

  const emit = (type, detail = {}) => {
    const payload = {
      type,
      page: PAGE_ID,
      timestamp: new Date().toISOString(),
      ...clone(detail)
    };

    state.subscribers.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error("TIC Guide subscriber error:", error);
      }
    });

    window.dispatchEvent(
      new CustomEvent(`tic:page:${PAGE_ID}:${type}`, {
        detail: payload
      })
    );

    return payload;
  };

  const getStoreState = () => {
    const store = getStore();

    if (!store) return {};

    if (typeof store.getState === "function") {
      return clone(store.getState()) || {};
    }

    if (typeof store.get === "function") {
      return {
        destinations: store.get("destinations"),
        wishlist: store.get("wishlist"),
        profile: store.get("profile")
      };
    }

    return {};
  };

  const saveWishlist = (wishlist) => {
    const store = getStore();

    if (!store) return false;

    if (typeof store.set === "function") {
      store.set("wishlist", wishlist);
      return true;
    }

    if (typeof store.patch === "function") {
      store.patch({ wishlist });
      return true;
    }

    return false;
  };

  const normalizeDestinations = (snapshot) => {
    const source = Array.isArray(snapshot.destinations)
      ? snapshot.destinations
      : [];

    const combined = [...DEFAULT_DESTINATIONS];

    source.forEach((item) => {
      if (!item) return;

      const id =
        item.id ||
        `${text(item.country)}-${text(item.city)}`
          .toLowerCase()
          .replace(/\s+/g, "-");

      const index = combined.findIndex(
        (destination) =>
          String(destination.id) === String(id)
      );

      const normalized = {
        id,
        country: item.country || "وجهة",
        city: item.city || item.name || "",
        emoji: item.emoji || item.icon || "🌍",
        region: item.region || "other",
        type: item.type || "city",
        currency: item.currency || "—",
        visa:
          item.visa ||
          item.visaNote ||
          "تحقق من متطلبات الدخول قبل السفر.",
        weather:
          item.weather ||
          item.weatherSummary ||
          "تختلف حسب الموسم",
        featured: item.featured === true
      };

      if (index >= 0) {
        combined[index] = {
          ...combined[index],
          ...normalized
        };
      } else {
        combined.push(normalized);
      }
    });

    return combined;
  };

  const buildSnapshot = () => {
    const raw = getStoreState();
    const destinations = normalizeDestinations(raw);
    const wishlist = Array.isArray(raw.wishlist)
      ? raw.wishlist
      : [];

    const favoriteIds = new Set(
      wishlist.map((item) =>
        typeof item === "string"
          ? item
          : item.destinationId || item.id
      )
    );

    const search = text(state.search).toLowerCase();

    const filtered = destinations.filter((item) => {
      const matchesSearch =
        !search ||
        [
          item.country,
          item.city,
          item.currency,
          item.region,
          item.type
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search);

      const matchesCategory =
        state.activeCategory === "all" ||
        item.type === state.activeCategory;

      return matchesSearch && matchesCategory;
    });

    const snapshot = {
      raw,
      destinations,
      filtered,
      wishlist,
      favoriteIds,
      statistics: {
        destinations: destinations.length,
        countries: new Set(
          destinations.map((item) =>
            text(item.country).toLowerCase()
          )
        ).size,
        favorites: favoriteIds.size,
        featured: destinations.filter(
          (item) => item.featured
        ).length
      }
    };

    state.lastSnapshot = snapshot;

    return snapshot;
  };

  const renderStatistics = (snapshot) => {
    const ui = getUI();

    return ui.grid(
      [
        {
          icon: "🌍",
          value: snapshot.statistics.destinations,
          label: "الوجهات",
          subtitle: "دول ومدن"
        },
        {
          icon: "◎",
          value: snapshot.statistics.countries,
          label: "الدول",
          subtitle: "حول العالم"
        },
        {
          icon: "☆",
          value: snapshot.statistics.favorites,
          label: "المفضلة",
          subtitle: "وجهات محفوظة"
        },
        {
          icon: "✦",
          value: snapshot.statistics.featured,
          label: "مختارة",
          subtitle: "اقتراحات مميزة"
        }
      ]
        .map((item) => ui.stat(item))
        .join(""),
      {
        columns: 4
      }
    );
  };

  const renderSearch = () => {
    const ui = getUI();

    return `
      <div class="tic-toolbar">
        <input
          type="search"
          class="tic-input"
          data-guide-search
          value="${escapeHTML(state.search)}"
          placeholder="ابحث عن دولة أو مدينة..."
          aria-label="البحث عن وجهة"
        >

        <div class="tic-filter-row">
          ${CATEGORIES.map(
            (category) => `
              <button
                type="button"
                class="tic-filter-chip ${
                  state.activeCategory === category.id
                    ? "is-active"
                    : ""
                }"
                data-action="guide-filter"
                data-param-category="${escapeHTML(
                  category.id
                )}"
              >
                ${escapeHTML(category.label)}
              </button>
            `
          ).join("")}
        </div>

        ${ui.button({
          label: "مسح البحث",
          action: "guide-clear",
          block: true
        })}
      </div>
    `;
  };

  const renderDestinationCard = (
    destination,
    snapshot
  ) => {
    const ui = getUI();

    const isFavorite = snapshot.favoriteIds.has(
      destination.id
    );

    return `
      <article class="tic-card tic-destination-card">
        <div class="tic-destination-visual">
          ${escapeHTML(destination.emoji)}
        </div>

        <div class="tic-card-body">
          <div class="tic-feature-row">
            <div>
              <span class="tic-chip">
                ${escapeHTML(destination.country)}
              </span>

              <h3
                class="tic-card-title"
                style="margin-top:10px"
              >
                ${escapeHTML(destination.city)}
              </h3>
            </div>

            ${ui.iconButton({
              icon: isFavorite ? "★" : "☆",
              action: "guide-toggle-favorite",
              params: {
                destinationId: destination.id
              },
              ariaLabel:
                isFavorite
                  ? "إزالة من المفضلة"
                  : "إضافة إلى المفضلة"
            })}
          </div>

          <div class="tic-settings-list" style="margin-top:14px">
            <div class="tic-settings-item">
              <div class="tic-settings-item-main">
                <div class="tic-settings-icon">◈</div>

                <div class="tic-settings-copy">
                  <strong>العملة</strong>
                  <small>
                    ${escapeHTML(destination.currency)}
                  </small>
                </div>
              </div>
            </div>

            <div class="tic-settings-item">
              <div class="tic-settings-item-main">
                <div class="tic-settings-icon">☀</div>

                <div class="tic-settings-copy">
                  <strong>الطقس</strong>
                  <small>
                    ${escapeHTML(destination.weather)}
                  </small>
                </div>
              </div>
            </div>
          </div>

          <div style="margin-top:14px">
            ${ui.button({
              label: "عرض التفاصيل",
              action: "guide-view-destination",
              params: {
                destinationId: destination.id
              },
              primary: true,
              block: true
            })}
          </div>
        </div>
      </article>
    `;
  };

  const renderDestinations = (snapshot) => {
    const ui = getUI();

    if (!snapshot.filtered.length) {
      return ui.empty({
        icon: "⌕",
        title: "لا توجد نتائج",
        message:
          "غيّر البحث أو الفئة لعرض وجهات أخرى.",
        action: {
          label: "مسح البحث",
          action: "guide-clear"
        }
      });
    }

    return `
      <p class="tic-subtitle" style="margin-bottom:12px">
        عرض ${snapshot.filtered.length}
        من ${snapshot.destinations.length} وجهة
      </p>

      <div class="tic-destination-grid">
        ${snapshot.filtered
          .map((item) =>
            renderDestinationCard(
              item,
              snapshot
            )
          )
          .join("")}
      </div>
    `;
  };

  const renderEssentials = () => {
    const ui = getUI();

    return ui.grid(
      `
        ${ui.card({
          icon: "▣",
          title: "التأشيرات",
          description:
            "راجع متطلبات الدخول قبل حجز الرحلة.",
          footer: ui.button({
            label: "عرض الملاحظات",
            action: "guide-open-visa",
            block: true
          })
        })}

        ${ui.card({
          icon: "◈",
          title: "العملات",
          description:
            "تعرف على العملة المستخدمة لكل وجهة.",
          footer: ui.button({
            label: "استعراض العملات",
            action: "guide-open-currency",
            block: true
          })
        })}

        ${ui.card({
          icon: "☀",
          title: "الطقس",
          description:
            "ملخص موسمي يساعدك على اختيار الوقت المناسب.",
          footer: ui.button({
            label: "عرض الطقس",
            action: "guide-open-weather",
            block: true
          })
        })}

        ${ui.card({
          icon: "☆",
          title: "المفضلة",
          description:
            "كل الوجهات التي حفظتها للعودة إليها لاحقاً.",
          footer: ui.button({
            label: "عرض المفضلة",
            action: "guide-show-favorites",
            block: true
          })
        })}
      `,
      {
        columns: 2
      }
    );
  };

  const renderPage = (snapshot) => {
    const ui = getUI();

    return `
      <div
        class="tic-module"
        data-page="guide"
        data-page-version="${PAGE_VERSION}"
      >
        ${ui.hero({
          badge: "Travel Guide",
          title: "دليل السفر",
          subtitle:
            "استكشف الدول والمدن واحفظ وجهاتك المفضلة في مكان واحد.",
          actions: [
            {
              label: "عرض المفضلة",
              action: "guide-show-favorites",
              primary: true,
              icon: "☆"
            }
          ]
        })}

        ${ui.section({
          eyebrow: "DISCOVER",
          title: "استكشف العالم",
          subtitle:
            "ابحث عن الوجهة المناسبة حسب أسلوب سفرك.",
          content: renderStatistics(snapshot)
        })}

        ${ui.section({
          eyebrow: "SEARCH",
          title: "البحث والتصفية",
          subtitle:
            "ابحث باسم الدولة أو المدينة وحدد نوع الوجهة.",
          content: renderSearch()
        })}

        ${ui.section({
          eyebrow: "DESTINATIONS",
          title: "الوجهات",
          subtitle:
            "وجهات مقترحة ومعلومات سفر أساسية.",
          content: renderDestinations(snapshot)
        })}

        ${ui.section({
          eyebrow: "TRAVEL ESSENTIALS",
          title: "أساسيات السفر",
          subtitle:
            "معلومات مهمة قبل اختيار الوجهة.",
          content: renderEssentials()
        })}
      </div>
    `;
  };

  const refresh = (options = {}) => {
    if (!state.container || !state.mounted) {
      return false;
    }

    const activeElement = document.activeElement;

    const preserveSearch =
      options.preserveFocus === true &&
      activeElement?.matches?.(
        "[data-guide-search]"
      );

    const cursor =
      preserveSearch &&
      typeof activeElement.selectionStart ===
        "number"
        ? activeElement.selectionStart
        : null;

    const snapshot = buildSnapshot();

    state.container.innerHTML =
      renderPage(snapshot);

    applyListeners();

    if (preserveSearch) {
      const input =
        state.container.querySelector(
          "[data-guide-search]"
        );

      if (input) {
        input.focus();

        if (cursor !== null) {
          input.setSelectionRange(
            cursor,
            cursor
          );
        }
      }
    }

    emit("refreshed", {
      resultCount: snapshot.filtered.length,
      category: state.activeCategory
    });

    return true;
  };

  const applyListeners = () => {
    if (!state.container) return;

    const searchInput =
      state.container.querySelector(
        "[data-guide-search]"
      );

    searchInput?.addEventListener(
      "input",
      (event) => {
        state.search = event.target.value;

        refresh({
          preserveFocus: true
        });
      }
    );
  };

  const registerActions = () => {
    const ui = getUI();

    if (
      !ui ||
      typeof ui.registerAction !== "function"
    ) {
      return;
    }

    const register = (name, handler) => {
      if (ui.hasAction?.(name)) return;

      state.actionUnsubscribers.push(
        ui.registerAction(name, handler)
      );
    };

    register("guide-filter", ({ params }) => {
      state.activeCategory =
        params.category || "all";

      refresh();

      return true;
    });

    register("guide-clear", () => {
      state.search = "";
      state.activeCategory = "all";

      refresh();

      return true;
    });

    register(
      "guide-toggle-favorite",
      ({ params }) => {
        const destinationId =
          params.destinationId;

        if (!destinationId) return false;

        const snapshot = buildSnapshot();
        const destination =
          snapshot.destinations.find(
            (item) =>
              String(item.id) ===
              String(destinationId)
          );

        if (!destination) return false;

        const exists =
          snapshot.favoriteIds.has(
            destinationId
          );

        const nextWishlist = exists
          ? snapshot.wishlist.filter((item) => {
              const id =
                typeof item === "string"
                  ? item
                  : item.destinationId ||
                    item.id;

              return (
                String(id) !==
                String(destinationId)
              );
            })
          : [
              ...snapshot.wishlist,
              {
                id: destinationId,
                destinationId,
                country:
                  destination.country,
                city: destination.city,
                createdAt:
                  new Date().toISOString()
              }
            ];

        saveWishlist(nextWishlist);

        ui.toast(
          exists
            ? "تمت إزالة الوجهة من المفضلة."
            : "تمت إضافة الوجهة إلى المفضلة.",
          "success"
        );

        refresh();

        return true;
      }
    );

    register(
      "guide-view-destination",
      async ({ params }) => {
        const snapshot = buildSnapshot();

        const destination =
          snapshot.destinations.find(
            (item) =>
              String(item.id) ===
              String(params.destinationId)
          );

        if (!destination) return false;

        await ui.dialog({
          title:
            `${destination.city}، ${destination.country}`,
          icon: destination.emoji,
          content: `
            <div class="tic-settings-list">
              <div class="tic-settings-item">
                <div class="tic-settings-item-main">
                  <div class="tic-settings-icon">◈</div>
                  <div class="tic-settings-copy">
                    <strong>العملة</strong>
                    <small>
                      ${escapeHTML(
                        destination.currency
                      )}
                    </small>
                  </div>
                </div>
              </div>

              <div class="tic-settings-item">
                <div class="tic-settings-item-main">
                  <div class="tic-settings-icon">☀</div>
                  <div class="tic-settings-copy">
                    <strong>الطقس</strong>
                    <small>
                      ${escapeHTML(
                        destination.weather
                      )}
                    </small>
                  </div>
                </div>
              </div>

              <div class="tic-settings-item">
                <div class="tic-settings-item-main">
                  <div class="tic-settings-icon">▣</div>
                  <div class="tic-settings-copy">
                    <strong>التأشيرة</strong>
                    <small>
                      ${escapeHTML(
                        destination.visa
                      )}
                    </small>
                  </div>
                </div>
              </div>
            </div>
          `,
          actions: [
            {
              label: "إغلاق",
              result: true,
              primary: true
            }
          ]
        });

        return true;
      }
    );

    register("guide-show-favorites", () => {
      state.search = "";

      const snapshot = buildSnapshot();

      if (!snapshot.favoriteIds.size) {
        ui.toast(
          "لا توجد وجهات محفوظة بعد.",
          "info"
        );

        return false;
      }

      const favoriteDestinations =
        snapshot.destinations.filter(
          (item) =>
            snapshot.favoriteIds.has(item.id)
        );

      ui.dialog({
        title: "الوجهات المفضلة",
        icon: "☆",
        content: `
          <div class="tic-settings-list">
            ${favoriteDestinations
              .map(
                (item) => `
                  <div class="tic-settings-item">
                    <div class="tic-settings-item-main">
                      <div class="tic-settings-icon">
                        ${escapeHTML(item.emoji)}
                      </div>

                      <div class="tic-settings-copy">
                        <strong>
                          ${escapeHTML(item.city)}
                        </strong>

                        <small>
                          ${escapeHTML(
                            item.country
                          )}
                        </small>
                      </div>
                    </div>
                  </div>
                `
              )
              .join("")}
          </div>
        `,
        actions: [
          {
            label: "إغلاق",
            result: true,
            primary: true
          }
        ]
      });

      return true;
    });

    register("guide-open-visa", () => {
      ui.alert({
        title: "ملاحظات التأشيرات",
        message:
          "متطلبات التأشيرات تتغير، لذلك يجب التحقق من المصدر الرسمي قبل الحجز."
      });

      return true;
    });

    register("guide-open-currency", () => {
      ui.alert({
        title: "العملات",
        message:
          "تعرض البطاقات العملة الأساسية لكل وجهة، وسيتم إضافة محول العملات لاحقاً."
      });

      return true;
    });

    register("guide-open-weather", () => {
      ui.alert({
        title: "الطقس",
        message:
          "المعلومات الحالية موسمية، وسيتم ربط الطقس المباشر في مرحلة لاحقة."
      });

      return true;
    });
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

    state.unsubscribeStore =
      store.subscribe(() => {
        if (state.mounted) {
          refresh();
        }
      });
  };

  const GuidePage = {
    id: PAGE_ID,
    title: "دليل السفر",
    icon: "⌕",
    version: PAGE_VERSION,

    init() {
      if (state.initialized) {
        return this.diagnostics();
      }

      registerActions();
      subscribeToStore();

      state.initialized = true;

      emit("initialized", {
        version: PAGE_VERSION
      });

      return this.diagnostics();
    },

    render() {
      this.init();
      return renderPage(buildSnapshot());
    },

    mount(context = {}) {
      this.init();

      const container = resolveContainer(
        context.container
      );

      if (!container) {
        throw new Error(
          "TIC Guide Error: route container not found."
        );
      }

      state.container = container;
      state.mounted = true;

      const snapshot = buildSnapshot();

      container.innerHTML =
        renderPage(snapshot);

      applyListeners();

      emit("mounted", {
        destinationCount:
          snapshot.destinations.length
      });

      return container;
    },

    afterEnter(context = {}) {
      const container = resolveContainer(
        context.container
      );

      if (container) {
        state.container = container;
        state.mounted = true;
      }

      applyListeners();

      return true;
    },

    unmount() {
      state.mounted = false;
      state.container = null;

      emit("unmounted");

      return true;
    },

    refresh,

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError(
          "TIC Guide subscriber must be a function."
        );
      }

      state.subscribers.add(listener);

      return () =>
        state.subscribers.delete(listener);
    },

    getSnapshot() {
      return clone(
        state.lastSnapshot ||
        buildSnapshot()
      );
    },

    destroy() {
      this.unmount();

      if (
        typeof state.unsubscribeStore === "function"
      ) {
        state.unsubscribeStore();
      }

      state.actionUnsubscribers.forEach(
        (unsubscribe) => {
          if (
            typeof unsubscribe === "function"
          ) {
            unsubscribe();
          }
        }
      );

      state.unsubscribeStore = null;
      state.actionUnsubscribers = [];
      state.subscribers.clear();
      state.lastSnapshot = null;
      state.initialized = false;

      return true;
    },

    diagnostics() {
      return {
        id: this.id,
        title: this.title,
        version: this.version,
        initialized: state.initialized,
        mounted: state.mounted,
        search: state.search,
        activeCategory:
          state.activeCategory,
        hasContainer: Boolean(
          state.container
        ),
        storeAvailable: Boolean(getStore()),
        routerAvailable: Boolean(
          getRouter()
        ),
        uiAvailable: Boolean(getUI()),
        actionCount:
          state.actionUnsubscribers.length,
        subscriberCount:
          state.subscribers.size,
        hasSnapshot: Boolean(
          state.lastSnapshot
        )
      };
    }
  };

  window.TIC = window.TIC || {};
  window.TIC.Pages = window.TIC.Pages || {};
  window.TIC.Pages.guide = GuidePage;
  window.TICGuidePage = GuidePage;

  const router = getRouter();

  if (
    router &&
    typeof router.register === "function"
  ) {
    if (!router.has?.("guide")) {
      router.register("guide", {
        id: "guide",
        title: "الدليل",
        module: "guide",
        icon: "⌕",
        visible: true,
        order: 3
      });
    }

    if (
      typeof router.registerPage === "function"
    ) {
      router.registerPage(
        "guide",
        GuidePage
      );
    }
  }

  GuidePage.init();
})(window, document);
