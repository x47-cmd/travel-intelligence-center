/* =========================================================
Travel Intelligence Center
More Page Module V3.0.0

File Path:
js/pages/more.js

Purpose:
- Lightweight premium settings and travel utilities center.
- Keeps the page simple and secondary to the main platform pages.
- Provides quick access to documents, packing, notifications and memories.
- Allows profile preferences to be updated and persisted through TIC Store.
- Preserves stable Router/UI/Store integration.
- Prevents unnecessary re-rendering while the user is actively scrolling.

Registers:
window.TIC.Pages.more
window.TICMorePage
========================================================= */

(function (window, document) {
  "use strict";

  window.TIC = window.TIC || {};
  window.TIC.Pages = window.TIC.Pages || {};

  const PAGE_ID = "more";
  const PAGE_VERSION = "3.0.0";
  const SCROLL_IDLE_DELAY = 180;

  const UI = () => window.TIC?.UI || window.TICUI;
  const Store = () => window.TIC?.Store || window.TICStore;
  const Router = () => window.TIC?.Router || window.TICRouter;

  let activeContainer = null;
  let unsubscribeStore = null;
  let scrollTimer = null;
  let isScrolling = false;
  let pendingRefresh = false;

  const escapeHTML = (value = "") =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const normalizeList = (value) => {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.items)) return value.items;
    return [];
  };

  const getState = () => {
    const store = Store();
    return store?.getState?.() || {};
  };

  const snapshot = () => {
    const state = getState();
    const profile = state.profile || {};
    const notifications = normalizeList(state.notifications);

    return {
      profile: {
        name: profile.name || "يوسف",
        language: profile.language || state.settings?.language || "ar",
        currency: profile.currency || state.settings?.currency || "AED",
        homeAirport:
          profile.homeAirport ||
          state.settings?.homeAirport ||
          "Abu Dhabi",
        travelStyle:
          profile.travelStyle ||
          state.settings?.travelStyle ||
          "Premium Family"
      },
      documents: normalizeList(state.documents),
      packing: normalizeList(state.packing),
      notifications,
      unreadNotifications: notifications.filter(
        (notification) => !notification?.read
      ).length,
      memories: normalizeList(state.memories)
    };
  };

  const toolCard = ({
    icon,
    title,
    description,
    view
  }) => {
    const ui = UI();

    return ui.card({
      icon,
      title,
      description,
      footer: `
        <button
          class="tic-button tic-button--secondary tic-button--block"
          type="button"
          data-more-action="open-tool"
          data-view="${escapeHTML(view)}"
        >
          فتح
        </button>
      `
    });
  };

  const preferenceCard = ({
    icon,
    title,
    value,
    field
  }) => {
    const ui = UI();

    return ui.card({
      icon,
      title,
      description: escapeHTML(value),
      footer: `
        <button
          class="tic-button tic-button--secondary tic-button--block"
          type="button"
          data-more-action="edit-preference"
          data-field="${escapeHTML(field)}"
        >
          تعديل
        </button>
      `
    });
  };

  const render = () => {
    const ui = UI();
    const data = snapshot();

    if (!ui?.hero || !ui?.section || !ui?.card || !ui?.grid) {
      return `
        <div class="tic-module" data-page="${PAGE_ID}">
          <section class="tic-card">
            <h1>المزيد</h1>
            <p>تعذر تحميل واجهة الصفحة حالياً.</p>
          </section>
        </div>
      `;
    }

    return `
      <div class="tic-module tic-more-page" data-page="${PAGE_ID}">

        ${ui.hero({
          badge: "More Center",
          title: "المزيد",
          subtitle: "أدوات السفر الأساسية وإعدادات التطبيق في مكان بسيط وواضح."
        })}

        ${ui.section({
          eyebrow: "TRAVEL TOOLS",
          title: "أدوات السفر",
          subtitle: "وصول سريع إلى الأدوات التي تحتاجها أثناء تجهيز الرحلات.",
          content: ui.grid(
            `
              ${toolCard({
                icon: "📄",
                title: "الوثائق",
                description: `${data.documents.length} مستند`,
                view: "documents"
              })}

              ${toolCard({
                icon: "🧳",
                title: "قائمة التجهيز",
                description: `${data.packing.length} عنصر`,
                view: "packing"
              })}

              ${toolCard({
                icon: "🔔",
                title: "الإشعارات",
                description: `${data.unreadNotifications} غير مقروء`,
                view: "notifications"
              })}

              ${toolCard({
                icon: "📸",
                title: "ذكريات السفر",
                description: `${data.memories.length} ذكرى`,
                view: "memories"
              })}
            `,
            { columns: 2 }
          )
        })}

        ${ui.section({
          eyebrow: "PREFERENCES",
          title: "الإعدادات",
          subtitle: "تخصيص بسيط لبيانات السفر الأساسية.",
          content: ui.grid(
            `
              ${preferenceCard({
                icon: "🌐",
                title: "اللغة",
                value: data.profile.language === "ar" ? "العربية" : data.profile.language,
                field: "language"
              })}

              ${preferenceCard({
                icon: "💱",
                title: "العملة",
                value: data.profile.currency,
                field: "currency"
              })}

              ${preferenceCard({
                icon: "🏠",
                title: "المطار الرئيسي",
                value: data.profile.homeAirport,
                field: "homeAirport"
              })}

              ${preferenceCard({
                icon: "✈️",
                title: "أسلوب السفر",
                value: data.profile.travelStyle,
                field: "travelStyle"
              })}
            `,
            { columns: 2 }
          )
        })}

        ${ui.section({
          eyebrow: "ABOUT",
          title: "حول التطبيق",
          subtitle: "Travel Intelligence Center",
          content: ui.card({
            icon: "ℹ️",
            title: `الإصدار V${PAGE_VERSION}`,
            description:
              "منصة شخصية ذكية لتنظيم الرحلات والوجهات والميزانيات والتجهيز والذكريات في مكان واحد."
          })
        })}

      </div>
    `;
  };

  const showMessage = (message, type = "success") => {
    const ui = UI();

    if (typeof ui?.toast === "function") {
      ui.toast(message, type);
      return;
    }

    if (typeof ui?.showToast === "function") {
      ui.showToast(message, type);
      return;
    }

    window.alert(message);
  };

  const commitProfilePatch = (patch) => {
    const store = Store();

    if (!store || !patch || typeof patch !== "object") {
      return false;
    }

    if (typeof store.updateProfile === "function") {
      store.updateProfile(patch);
      return true;
    }

    if (typeof store.setProfile === "function") {
      store.setProfile({
        ...(getState().profile || {}),
        ...patch
      });
      return true;
    }

    if (typeof store.patch === "function") {
      store.patch({
        profile: {
          ...(getState().profile || {}),
          ...patch
        }
      });
      return true;
    }

    if (typeof store.setState === "function") {
      const currentState = getState();

      store.setState({
        ...currentState,
        profile: {
          ...(currentState.profile || {}),
          ...patch
        }
      });

      return true;
    }

    return false;
  };

  const askPreferenceValue = (field, currentValue) => {
    const prompts = {
      language: {
        label: "أدخل رمز اللغة، مثال: ar أو en",
        fallback: "ar"
      },
      currency: {
        label: "أدخل رمز العملة، مثال: AED أو USD",
        fallback: "AED"
      },
      homeAirport: {
        label: "أدخل اسم المطار الرئيسي",
        fallback: "Abu Dhabi"
      },
      travelStyle: {
        label: "أدخل أسلوب السفر المفضل",
        fallback: "Premium Family"
      }
    };

    const config = prompts[field];

    if (!config) return null;

    const value = window.prompt(
      config.label,
      currentValue || config.fallback
    );

    if (value === null) return null;

    return value.trim();
  };

  const editPreference = (field) => {
    const data = snapshot();
    const currentValue = data.profile[field] || "";
    const nextValue = askPreferenceValue(field, currentValue);

    if (!nextValue || nextValue === currentValue) return;

    const saved = commitProfilePatch({
      [field]: nextValue
    });

    if (!saved) {
      showMessage("تعذر حفظ الإعداد في المخزن الحالي.", "error");
      return;
    }

    refresh({ force: true });
    showMessage("تم حفظ الإعداد بنجاح.");
  };

  const openTool = (view) => {
    const router = Router();

    if (typeof router?.go === "function") {
      router.go(PAGE_ID, { view });
      return;
    }

    if (typeof router?.navigate === "function") {
      router.navigate(PAGE_ID, { view });
      return;
    }

    window.dispatchEvent(
      new CustomEvent("tic:more:view", {
        detail: { view }
      })
    );
  };

  const handleClick = (event) => {
    const actionElement = event.target.closest("[data-more-action]");

    if (!actionElement) return;

    const action = actionElement.dataset.moreAction;

    if (action === "open-tool") {
      openTool(actionElement.dataset.view || "");
      return;
    }

    if (action === "edit-preference") {
      editPreference(actionElement.dataset.field || "");
    }
  };

  const handleScroll = () => {
    isScrolling = true;

    window.clearTimeout(scrollTimer);

    scrollTimer = window.setTimeout(() => {
      isScrolling = false;

      if (pendingRefresh) {
        pendingRefresh = false;
        refresh({ force: true });
      }
    }, SCROLL_IDLE_DELAY);
  };

  const refresh = ({ force = false } = {}) => {
    if (!activeContainer) return;

    if (isScrolling && !force) {
      pendingRefresh = true;
      return;
    }

    const scrollY = window.scrollY;
    activeContainer.innerHTML = render();

    window.requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
    });
  };

  const subscribeToStore = () => {
    const store = Store();

    if (typeof unsubscribeStore === "function") {
      unsubscribeStore();
      unsubscribeStore = null;
    }

    if (typeof store?.subscribe === "function") {
      unsubscribeStore = store.subscribe(() => {
        refresh();
      });
    }
  };

  const mount = (ctx = {}) => {
    activeContainer =
      ctx.container ||
      document.querySelector("[data-router-view]");

    if (!activeContainer) return;

    activeContainer.innerHTML = render();
    activeContainer.removeEventListener("click", handleClick);
    activeContainer.addEventListener("click", handleClick);

    window.removeEventListener("scroll", handleScroll);
    window.addEventListener("scroll", handleScroll, { passive: true });

    subscribeToStore();
  };

  const unmount = () => {
    if (activeContainer) {
      activeContainer.removeEventListener("click", handleClick);
    }

    window.removeEventListener("scroll", handleScroll);
    window.clearTimeout(scrollTimer);

    if (typeof unsubscribeStore === "function") {
      unsubscribeStore();
    }

    unsubscribeStore = null;
    activeContainer = null;
    isScrolling = false;
    pendingRefresh = false;
  };

  const MorePage = {
    id: PAGE_ID,
    title: "المزيد",
    version: PAGE_VERSION,
    render,
    mount,
    unmount,
    refresh
  };

  window.TIC.Pages.more = MorePage;
  window.TICMorePage = MorePage;

  if (typeof window.TIC.Router?.registerPage === "function") {
    window.TIC.Router.registerPage(PAGE_ID, MorePage);
  }
})(window, document);
