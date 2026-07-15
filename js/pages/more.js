/* =========================================================
Travel Intelligence Center
More Page Module V3.1.0

File Path:
js/pages/more.js

Purpose:
- Lightweight premium settings and travel utilities center.
- Keeps the page simple and secondary to the main platform pages.
- Provides working views for documents, packing, notifications and memories.
- Provides in-app preference editing without browser prompt dialogs.
- Saves all changes through TIC Store and localStorage.
- Preserves stable Router/UI/Store integration.
- Prevents disruptive re-rendering while the user is actively scrolling.

Registers:
window.TIC.Pages.more
window.TICMorePage
========================================================= */

(function (window, document) {
  "use strict";

  window.TIC = window.TIC || {};
  window.TIC.Pages = window.TIC.Pages || {};

  const PAGE_ID = "more";
  const PAGE_VERSION = "3.1.0";
  const SCROLL_IDLE_DELAY = 180;

  const UI = () => window.TIC?.UI || window.TICUI;
  const Store = () => window.TIC?.Store || window.TICStore;

  let activeContainer = null;
  let unsubscribeStore = null;
  let scrollTimer = null;
  let isScrolling = false;
  let pendingRefresh = false;

  let activeToolView = "";
  let activePreference = "";

  const escapeHTML = (value = "") =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const clone = (value) => {
    try {
      return typeof structuredClone === "function"
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  };

  const createId = (prefix = "item") =>
    `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const getState = () => Store()?.getState?.() || {};

  const asArray = (value) => (Array.isArray(value) ? value : []);

  const getPackingItems = (packing) => {
    if (Array.isArray(packing)) return packing;
    if (Array.isArray(packing?.items)) return packing.items;

    return asArray(packing?.lists).flatMap((list) =>
      asArray(list?.items).map((item) => ({
        ...item,
        listId: list.id,
        listTitle: list.title || list.name || "قائمة التجهيز"
      }))
    );
  };

  const snapshot = () => {
    const state = getState();
    const profile = state.profile || {};
    const settings = state.settings || {};
    const notifications = asArray(state.notifications);
    const packing = state.packing || { templates: [], lists: [] };

    return {
      profile: {
        name: profile.name || "يوسف",
        language: profile.language || settings.language || "ar",
        currency: profile.currency || settings.currency || "AED",
        homeAirport:
          profile.homeAirport || settings.homeAirport || "Abu Dhabi",
        travelStyle:
          profile.travelStyle || settings.travelStyle || "Premium Family"
      },
      documents: asArray(state.documents),
      packing,
      packingItems: getPackingItems(packing),
      notifications,
      unreadNotifications: notifications.filter((item) => item?.read !== true)
        .length,
      memories: asArray(state.memories)
    };
  };

  const storeSet = (path, value, eventType = "more-updated") => {
    const store = Store();

    if (typeof store?.set === "function") {
      return store.set(path, value, {
        immediate: true,
        eventType
      });
    }

    if (typeof store?.update === "function") {
      store.update(
        (draft) => {
          const parts = String(path).split(".");
          let cursor = draft;

          for (let index = 0; index < parts.length - 1; index += 1) {
            const key = parts[index];
            cursor[key] = cursor[key] || {};
            cursor = cursor[key];
          }

          cursor[parts[parts.length - 1]] = clone(value);
        },
        {
          immediate: true,
          eventType
        }
      );

      return true;
    }

    return false;
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

  const uiButton = ({
    label,
    action,
    view = "",
    field = "",
    itemId = "",
    variant = "secondary",
    block = true
  }) => {
    const ui = UI();

    if (typeof ui?.button === "function") {
      const html = ui.button({
        label,
        variant,
        block
      });

      return String(html).replace(
        /<button\b/i,
        `<button data-more-action="${escapeHTML(action)}" data-view="${escapeHTML(
          view
        )}" data-field="${escapeHTML(field)}" data-item-id="${escapeHTML(
          itemId
        )}"`
      );
    }

    return `
      <button
        type="button"
        class="tic-button tic-button--${escapeHTML(
          variant
        )}${block ? " tic-button--block" : ""}"
        data-more-action="${escapeHTML(action)}"
        data-view="${escapeHTML(view)}"
        data-field="${escapeHTML(field)}"
        data-item-id="${escapeHTML(itemId)}"
      >
        ${escapeHTML(label)}
      </button>
    `;
  };

  const toolCard = ({ icon, title, description, view }) =>
    UI().card({
      icon,
      title,
      description,
      footer: uiButton({
        label: "فتح",
        action: "open-tool",
        view
      })
    });

  const preferenceCard = ({ icon, title, value, field }) =>
    UI().card({
      icon,
      title,
      description: escapeHTML(value),
      footer: uiButton({
        label: "تعديل",
        action: "open-preference",
        field
      })
    });

  const renderEmptyState = (text) => `
    <div class="tic-card">
      <p>${escapeHTML(text)}</p>
    </div>
  `;

  const renderDocumentsView = (data) => {
    const items = data.documents.length
      ? data.documents
          .map(
            (item) => `
              <div class="tic-card">
                <strong>${escapeHTML(
                  item.title || item.name || "مستند سفر"
                )}</strong>
                <p>${escapeHTML(item.type || item.note || "مستند محفوظ")}</p>
                ${uiButton({
                  label: "حذف",
                  action: "delete-document",
                  itemId: item.id,
                  variant: "secondary"
                })}
              </div>
            `
          )
          .join("")
      : renderEmptyState("لا توجد مستندات محفوظة حالياً.");

    return renderToolModal({
      icon: "📄",
      title: "الوثائق",
      subtitle: `${data.documents.length} مستند`,
      content: items,
      primaryAction: uiButton({
        label: "إضافة مستند",
        action: "add-document",
        variant: "primary"
      })
    });
  };

  const renderPackingView = (data) => {
    const items = data.packingItems.length
      ? data.packingItems
          .map(
            (item) => `
              <div class="tic-card">
                <strong>${item.completed ? "✅" : "⬜️"} ${escapeHTML(
                  item.title || item.name || "عنصر تجهيز"
                )}</strong>
                <p>${escapeHTML(item.listTitle || "قائمة التجهيز")}</p>
                <div class="tic-grid">
                  ${uiButton({
                    label: item.completed ? "إعادة فتح" : "تم التجهيز",
                    action: "toggle-packing",
                    itemId: item.id
                  })}
                  ${uiButton({
                    label: "حذف",
                    action: "delete-packing",
                    itemId: item.id
                  })}
                </div>
              </div>
            `
          )
          .join("")
      : renderEmptyState("قائمة التجهيز فارغة حالياً.");

    return renderToolModal({
      icon: "🧳",
      title: "قائمة التجهيز",
      subtitle: `${data.packingItems.length} عنصر`,
      content: items,
      primaryAction: uiButton({
        label: "إضافة عنصر",
        action: "add-packing",
        variant: "primary"
      })
    });
  };

  const renderNotificationsView = (data) => {
    const items = data.notifications.length
      ? data.notifications
          .map(
            (item) => `
              <div class="tic-card">
                <strong>${item.read === true ? "🔕" : "🔔"} ${escapeHTML(
                  item.title || "إشعار"
                )}</strong>
                <p>${escapeHTML(item.message || item.description || "")}</p>
                ${uiButton({
                  label: item.read === true ? "مقروء" : "تحديد كمقروء",
                  action: "read-notification",
                  itemId: item.id
                })}
              </div>
            `
          )
          .join("")
      : renderEmptyState("لا توجد إشعارات حالياً.");

    return renderToolModal({
      icon: "🔔",
      title: "الإشعارات",
      subtitle: `${data.unreadNotifications} غير مقروء`,
      content: items,
      primaryAction:
        data.unreadNotifications > 0
          ? uiButton({
              label: "تحديد الكل كمقروء",
              action: "read-all-notifications",
              variant: "primary"
            })
          : ""
    });
  };

  const renderMemoriesView = (data) => {
    const items = data.memories.length
      ? data.memories
          .map(
            (item) => `
              <div class="tic-card">
                <strong>${escapeHTML(
                  item.title || item.name || "ذكرى سفر"
                )}</strong>
                <p>${escapeHTML(
                  item.description || item.note || item.date || ""
                )}</p>
                ${uiButton({
                  label: "حذف",
                  action: "delete-memory",
                  itemId: item.id
                })}
              </div>
            `
          )
          .join("")
      : renderEmptyState("لا توجد ذكريات محفوظة حالياً.");

    return renderToolModal({
      icon: "📸",
      title: "ذكريات السفر",
      subtitle: `${data.memories.length} ذكرى`,
      content: items,
      primaryAction: uiButton({
        label: "إضافة ذكرى",
        action: "add-memory",
        variant: "primary"
      })
    });
  };

  const renderToolModal = ({
    icon,
    title,
    subtitle,
    content,
    primaryAction = ""
  }) => `
    <div class="tic-more-overlay" data-more-overlay>
      <section class="tic-more-panel" role="dialog" aria-modal="true">
        <div class="tic-card">
          <button
            type="button"
            class="tic-more-close"
            data-more-action="close-overlay"
            aria-label="إغلاق"
          >✕</button>
          <div class="tic-more-panel__heading">
            <span>${icon}</span>
            <div>
              <h2>${escapeHTML(title)}</h2>
              <p>${escapeHTML(subtitle)}</p>
            </div>
          </div>
          ${primaryAction}
        </div>

        <div class="tic-more-panel__content">
          ${content}
        </div>
      </section>
    </div>
  `;

  const renderPreferenceModal = (data) => {
    const field = activePreference;
    const configs = {
      language: {
        icon: "🌐",
        title: "اللغة",
        control: `
          <select class="tic-input" data-more-input="preference-value">
            <option value="ar" ${
              data.profile.language === "ar" ? "selected" : ""
            }>العربية</option>
            <option value="en" ${
              data.profile.language === "en" ? "selected" : ""
            }>English</option>
          </select>
        `
      },
      currency: {
        icon: "💱",
        title: "العملة",
        control: `
          <select class="tic-input" data-more-input="preference-value">
            ${["AED", "USD", "EUR", "GBP"]
              .map(
                (currency) => `
                  <option value="${currency}" ${
                  data.profile.currency === currency ? "selected" : ""
                }>${currency}</option>
                `
              )
              .join("")}
          </select>
        `
      },
      homeAirport: {
        icon: "🏠",
        title: "المطار الرئيسي",
        control: `
          <input
            class="tic-input"
            type="text"
            value="${escapeHTML(data.profile.homeAirport)}"
            data-more-input="preference-value"
            maxlength="80"
          />
        `
      },
      travelStyle: {
        icon: "✈️",
        title: "أسلوب السفر",
        control: `
          <select class="tic-input" data-more-input="preference-value">
            ${[
              "Premium Family",
              "Luxury",
              "Family",
              "Relaxed",
              "Adventure",
              "Budget"
            ]
              .map(
                (style) => `
                  <option value="${escapeHTML(style)}" ${
                  data.profile.travelStyle === style ? "selected" : ""
                }>${escapeHTML(style)}</option>
                `
              )
              .join("")}
          </select>
        `
      }
    };

    const config = configs[field];
    if (!config) return "";

    return `
      <div class="tic-more-overlay" data-more-overlay>
        <section class="tic-more-panel tic-more-panel--compact" role="dialog" aria-modal="true">
          <div class="tic-card">
            <button
              type="button"
              class="tic-more-close"
              data-more-action="close-overlay"
              aria-label="إغلاق"
            >✕</button>

            <div class="tic-more-panel__heading">
              <span>${config.icon}</span>
              <div>
                <h2>تعديل ${escapeHTML(config.title)}</h2>
                <p>سيتم حفظ التغيير تلقائياً في بيانات التطبيق.</p>
              </div>
            </div>

            <label class="tic-field">
              <span>${escapeHTML(config.title)}</span>
              ${config.control}
            </label>

            <div class="tic-grid">
              ${uiButton({
                label: "حفظ",
                action: "save-preference",
                field,
                variant: "primary"
              })}
              ${uiButton({
                label: "إلغاء",
                action: "close-overlay"
              })}
            </div>
          </div>
        </section>
      </div>
    `;
  };

  const renderActiveOverlay = (data) => {
    if (activePreference) return renderPreferenceModal(data);

    switch (activeToolView) {
      case "documents":
        return renderDocumentsView(data);
      case "packing":
        return renderPackingView(data);
      case "notifications":
        return renderNotificationsView(data);
      case "memories":
        return renderMemoriesView(data);
      default:
        return "";
    }
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
                description: `${data.packingItems.length} عنصر`,
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
                value:
                  data.profile.language === "ar"
                    ? "العربية"
                    : data.profile.language === "en"
                      ? "English"
                      : data.profile.language,
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

        ${renderActiveOverlay(data)}
      </div>
    `;
  };

  const updateProfile = (field, value) => {
    const state = getState();
    const profile = {
      ...(state.profile || {}),
      [field]: value,
      updatedAt: new Date().toISOString()
    };

    const settings = {
      ...(state.settings || {}),
      [field]: value
    };

    if (!storeSet("profile", profile, "profile-preference-updated")) {
      return false;
    }

    if (["language", "currency"].includes(field)) {
      storeSet("settings", settings, "settings-preference-updated");
    }

    return true;
  };

  const addDocument = () => {
    const title = window.prompt("اسم المستند");
    if (!title?.trim()) return;

    const data = snapshot();
    const documents = [
      {
        id: createId("document"),
        title: title.trim(),
        type: "مستند سفر",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      ...data.documents
    ];

    storeSet("documents", documents, "document-created");
  };

  const deleteDocument = (itemId) => {
    const data = snapshot();
    storeSet(
      "documents",
      data.documents.filter((item) => String(item.id) !== String(itemId)),
      "document-deleted"
    );
  };

  const ensurePackingStructure = (packing) => {
    if (Array.isArray(packing)) {
      return {
        templates: [],
        lists: [
          {
            id: "packing_main",
            title: "قائمة التجهيز",
            items: packing
          }
        ]
      };
    }

    return {
      templates: asArray(packing?.templates),
      lists: asArray(packing?.lists)
    };
  };

  const addPackingItem = () => {
    const title = window.prompt("اسم عنصر التجهيز");
    if (!title?.trim()) return;

    const data = snapshot();
    const packing = ensurePackingStructure(data.packing);
    const lists = clone(packing.lists);

    if (!lists.length) {
      lists.push({
        id: "packing_main",
        title: "قائمة التجهيز",
        items: []
      });
    }

    lists[0].items = [
      {
        id: createId("packing"),
        title: title.trim(),
        completed: false,
        createdAt: new Date().toISOString()
      },
      ...asArray(lists[0].items)
    ];

    storeSet("packing", { ...packing, lists }, "packing-item-created");
  };

  const mutatePackingItem = (itemId, mutator) => {
    const data = snapshot();
    const packing = ensurePackingStructure(data.packing);

    const lists = packing.lists.map((list) => ({
      ...list,
      items: asArray(list.items)
        .map((item) =>
          String(item.id) === String(itemId) ? mutator(clone(item)) : item
        )
        .filter(Boolean)
    }));

    storeSet("packing", { ...packing, lists }, "packing-item-updated");
  };

  const addMemory = () => {
    const title = window.prompt("عنوان الذكرى");
    if (!title?.trim()) return;

    const note = window.prompt("وصف مختصر للذكرى") || "";
    const data = snapshot();

    storeSet(
      "memories",
      [
        {
          id: createId("memory"),
          title: title.trim(),
          description: note.trim(),
          date: new Date().toISOString().slice(0, 10),
          createdAt: new Date().toISOString()
        },
        ...data.memories
      ],
      "memory-created"
    );
  };

  const deleteMemory = (itemId) => {
    const data = snapshot();

    storeSet(
      "memories",
      data.memories.filter((item) => String(item.id) !== String(itemId)),
      "memory-deleted"
    );
  };

  const markNotificationRead = (itemId) => {
    const data = snapshot();

    storeSet(
      "notifications",
      data.notifications.map((item) =>
        String(item.id) === String(itemId)
          ? {
              ...item,
              read: true,
              updatedAt: new Date().toISOString()
            }
          : item
      ),
      "notification-read"
    );
  };

  const markAllNotificationsRead = () => {
    const data = snapshot();

    storeSet(
      "notifications",
      data.notifications.map((item) => ({
        ...item,
        read: true,
        updatedAt: new Date().toISOString()
      })),
      "notifications-read-all"
    );
  };

  const closeOverlay = () => {
    activeToolView = "";
    activePreference = "";
    refresh({ force: true });
  };

  const handleClick = (event) => {
    const actionElement = event.target.closest("[data-more-action]");
    if (!actionElement) return;

    const action = actionElement.dataset.moreAction;
    const view = actionElement.dataset.view || "";
    const field = actionElement.dataset.field || "";
    const itemId = actionElement.dataset.itemId || "";

    switch (action) {
      case "open-tool":
        activeToolView = view;
        activePreference = "";
        refresh({ force: true });
        break;

      case "open-preference":
        activePreference = field;
        activeToolView = "";
        refresh({ force: true });
        break;

      case "close-overlay":
        closeOverlay();
        break;

      case "save-preference": {
        const input = activeContainer?.querySelector(
          '[data-more-input="preference-value"]'
        );
        const value = input?.value?.trim();

        if (!value) {
          showMessage("يرجى إدخال قيمة صحيحة.", "error");
          return;
        }

        if (updateProfile(field || activePreference, value)) {
          showMessage("تم حفظ الإعداد بنجاح.");
          closeOverlay();
        } else {
          showMessage("تعذر حفظ الإعداد.", "error");
        }
        break;
      }

      case "add-document":
        addDocument();
        break;

      case "delete-document":
        deleteDocument(itemId);
        break;

      case "add-packing":
        addPackingItem();
        break;

      case "toggle-packing":
        mutatePackingItem(itemId, (item) => ({
          ...item,
          completed: !item.completed,
          updatedAt: new Date().toISOString()
        }));
        break;

      case "delete-packing":
        mutatePackingItem(itemId, () => null);
        break;

      case "read-notification":
        markNotificationRead(itemId);
        break;

      case "read-all-notifications":
        markAllNotificationsRead();
        break;

      case "add-memory":
        addMemory();
        break;

      case "delete-memory":
        deleteMemory(itemId);
        break;

      default:
        break;
    }
  };

  const handleOverlayClick = (event) => {
    if (
      event.target.matches("[data-more-overlay]") &&
      !event.target.closest(".tic-more-panel")
    ) {
      closeOverlay();
    }
  };

  const handleKeydown = (event) => {
    if (event.key === "Escape" && (activeToolView || activePreference)) {
      closeOverlay();
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
      if (!activeToolView && !activePreference) {
        window.scrollTo(0, scrollY);
      }
    });
  };

  const subscribeToStore = () => {
    const store = Store();

    if (typeof unsubscribeStore === "function") {
      unsubscribeStore();
      unsubscribeStore = null;
    }

    if (typeof store?.subscribe === "function") {
      unsubscribeStore = store.subscribe(() => refresh());
    }
  };

  const mount = (ctx = {}) => {
    activeContainer =
      ctx.container || document.querySelector("[data-router-view]");

    if (!activeContainer) return;

    activeToolView = ctx.view || ctx.params?.view || "";
    activePreference = "";

    activeContainer.innerHTML = render();

    activeContainer.removeEventListener("click", handleClick);
    activeContainer.removeEventListener("click", handleOverlayClick);

    activeContainer.addEventListener("click", handleClick);
    activeContainer.addEventListener("click", handleOverlayClick);

    window.removeEventListener("scroll", handleScroll);
    window.addEventListener("scroll", handleScroll, { passive: true });

    document.removeEventListener("keydown", handleKeydown);
    document.addEventListener("keydown", handleKeydown);

    subscribeToStore();
  };

  const unmount = () => {
    if (activeContainer) {
      activeContainer.removeEventListener("click", handleClick);
      activeContainer.removeEventListener("click", handleOverlayClick);
    }

    window.removeEventListener("scroll", handleScroll);
    document.removeEventListener("keydown", handleKeydown);
    window.clearTimeout(scrollTimer);

    if (typeof unsubscribeStore === "function") {
      unsubscribeStore();
    }

    unsubscribeStore = null;
    activeContainer = null;
    activeToolView = "";
    activePreference = "";
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
