/* =========================================================
   Travel Intelligence Center
   User Interface Engine V1.0.0

   File Path:
   js/ui.js

   Purpose:
   - Provides the shared UI layer for the full application.
   - Renders reusable premium interface components.
   - Manages notifications, dialogs, loading states, forms,
     empty states, progress indicators, cards, sections,
     statistics, lists, badges, and delegated actions.
   - Works with the current configuration, store, and router.

   Dependencies:
   - js/config.js
   - js/store.js
   - js/router.js

   Global APIs:
   - window.TIC.UI
   - window.TICUI
========================================================= */

(function (window, document) {
  "use strict";

  const Config = window.TICConfig || window.TIC?.Config || {};
  const UI_VERSION = "1.0.0";

  const DEFAULT_DURATION = Number(Config.ui?.toastDuration) || 3200;
  const DEFAULT_LOCALE =
    Config.locale || Config.language || Config.app?.locale || "ar-AE";
  const DEFAULT_CURRENCY =
    Config.currency || Config.profile?.currency || Config.app?.currency || "AED";

  const state = {
    initialized: false,
    loadingCount: 0,
    toastCounter: 0,
    dialogCounter: 0,
    actionHandlers: new Map(),
    subscribers: new Set(),
    activeToasts: new Map(),
    activeDialogs: new Map(),
    roots: {
      toast: null,
      dialog: null,
      loader: null
    }
  };

  const isObject = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);

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

  const escapeHTML = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const escapeAttribute = (value) =>
    escapeHTML(value).replace(/`/g, "&#096;");

  const normalizeText = (value) => String(value ?? "").trim();

  const normalizeActionName = (value) =>
    normalizeText(value)
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]/g, "");

  const createId = (prefix = "tic") =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const toArray = (value) => {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null) return [];
    return [value];
  };

  const clamp = (value, min = 0, max = 100) =>
    Math.min(max, Math.max(min, Number(value) || 0));

  const getRouter = () => window.TIC?.Router || window.TICRouter || null;
  const getStore = () => window.TIC?.Store || window.TICStore || null;

  const renderClassNames = (...values) =>
    values
      .flatMap((value) => {
        if (Array.isArray(value)) return value;

        if (isObject(value)) {
          return Object.entries(value)
            .filter(([, enabled]) => Boolean(enabled))
            .map(([className]) => className);
        }

        return value;
      })
      .filter(Boolean)
      .join(" ");

  const renderAttributes = (attributes = {}) =>
    Object.entries(attributes)
      .filter(([, value]) =>
        value !== undefined && value !== null && value !== false
      )
      .map(([key, value]) => {
        if (value === true) return escapeAttribute(key);
        return `${escapeAttribute(key)}="${escapeAttribute(value)}"`;
      })
      .join(" ");

  const renderIcon = (icon, options = {}) => {
    if (!icon) return "";

    const className = renderClassNames("tic-icon", options.className);

    if (typeof icon === "string" && icon.trim().startsWith("<")) {
      return `<span class="${escapeAttribute(className)}" aria-hidden="true">${icon}</span>`;
    }

    return `<span class="${escapeAttribute(className)}" aria-hidden="true">${escapeHTML(icon)}</span>`;
  };

  const renderActionAttributes = (options = {}) => {
    const attributes = {};

    if (options.action) {
      attributes["data-action"] = normalizeActionName(options.action);
    }

    if (options.route) attributes["data-route"] = normalizeText(options.route);
    if (options.view) attributes["data-view"] = normalizeText(options.view);
    if (options.id) attributes.id = options.id;

    if (options.disabled) {
      attributes.disabled = true;
      attributes["aria-disabled"] = "true";
    }

    if (options.ariaLabel) attributes["aria-label"] = options.ariaLabel;

    if (isObject(options.params)) {
      Object.entries(options.params).forEach(([key, value]) => {
        attributes[`data-param-${key}`] = String(value);
      });
    }

    if (isObject(options.attributes)) {
      Object.assign(attributes, options.attributes);
    }

    return renderAttributes(attributes);
  };

  const emit = (type, detail = {}) => {
    const payload = {
      type,
      timestamp: new Date().toISOString(),
      ...clone(detail)
    };

    state.subscribers.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error("TIC UI subscriber error:", error);
      }
    });

    window.dispatchEvent(
      new CustomEvent(`tic:ui:${type}`, {
        detail: payload
      })
    );

    return payload;
  };

  const ensureRoot = (type) => {
    if (state.roots[type] && document.contains(state.roots[type])) {
      return state.roots[type];
    }

    const root = document.createElement("div");
    root.className = `tic-ui-root tic-ui-root--${type}`;
    root.setAttribute("data-ui-root", type);

    if (type === "toast") {
      root.setAttribute("aria-live", "polite");
      root.setAttribute("aria-atomic", "false");
    }

    document.body.appendChild(root);
    state.roots[type] = root;

    return root;
  };

  const setElementContent = (element, content, mode = "html") => {
    if (!element) return null;

    if (content instanceof window.Node) {
      element.replaceChildren(content);
      return element;
    }

    if (
      Array.isArray(content) &&
      content.every((item) => item instanceof window.Node)
    ) {
      element.replaceChildren(...content);
      return element;
    }

    if (mode === "text") {
      element.textContent = String(content ?? "");
    } else {
      element.innerHTML = String(content ?? "");
    }

    return element;
  };

  const focusFirstInteractive = (container) => {
    if (!container) return;

    const element = container.querySelector(
      [
        "[autofocus]",
        "button:not([disabled])",
        "a[href]",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "[tabindex]:not([tabindex='-1'])"
      ].join(",")
    );

    if (element) {
      window.requestAnimationFrame(() => element.focus());
    }
  };

  const closeDialog = (dialogId, result = null) => {
    const entry = state.activeDialogs.get(dialogId);
    if (!entry) return false;

    const { element, resolve } = entry;
    element.classList.add("is-closing");

    window.setTimeout(() => {
      if (element.parentNode) element.parentNode.removeChild(element);

      state.activeDialogs.delete(dialogId);

      if (state.activeDialogs.size === 0) {
        document.documentElement.classList.remove("has-open-dialog");
      }

      resolve(result);
      emit("dialog-closed", { dialogId, result });
    }, 160);

    return true;
  };

  const normalizeField = (field) => {
    if (typeof field === "string") {
      return {
        name: field,
        label: field,
        type: "text"
      };
    }

    return {
      name: field.name || createId("field"),
      label: field.label || field.name || "",
      type: field.type || "text",
      value: field.value ?? "",
      placeholder: field.placeholder || "",
      required: field.required === true,
      disabled: field.disabled === true,
      readonly: field.readonly === true,
      checked: field.checked === true,
      options: Array.isArray(field.options) ? field.options : [],
      min: field.min,
      max: field.max,
      step: field.step,
      rows: field.rows || 4,
      hint: field.hint || "",
      error: field.error || "",
      autocomplete: field.autocomplete || "off",
      inputMode: field.inputMode || "",
      attributes: field.attributes || {},
      className: field.className || ""
    };
  };

  const statusMap = {
    success: "success",
    approved: "success",
    ready: "success",
    completed: "success",
    active: "success",
    warning: "warning",
    pending: "warning",
    review: "warning",
    attention: "warning",
    danger: "danger",
    error: "danger",
    rejected: "danger",
    overdue: "danger",
    info: "info",
    neutral: "neutral",
    draft: "neutral",
    inactive: "neutral"
  };

  const getStatusTone = (status) =>
    statusMap[normalizeText(status).toLowerCase()] || "neutral";

  const UI = {
    id: "ui",
    version: UI_VERSION,

    init() {
      if (state.initialized) return this.diagnostics();

      ensureRoot("toast");
      ensureRoot("dialog");
      ensureRoot("loader");

      document.addEventListener("click", this.handleDelegatedClick);
      document.addEventListener("keydown", this.handleKeydown);

      state.initialized = true;
      emit("initialized", { version: UI_VERSION });

      return this.diagnostics();
    },

    destroy() {
      document.removeEventListener("click", this.handleDelegatedClick);
      document.removeEventListener("keydown", this.handleKeydown);

      state.activeToasts.forEach((entry) => {
        window.clearTimeout(entry.timeoutId);
        entry.element.remove();
      });

      Array.from(state.activeDialogs.keys()).forEach((dialogId) => {
        closeDialog(dialogId, null);
      });

      Object.values(state.roots).forEach((root) => {
        if (root?.parentNode) root.parentNode.removeChild(root);
      });

      state.actionHandlers.clear();
      state.subscribers.clear();
      state.activeToasts.clear();
      state.activeDialogs.clear();

      state.roots = {
        toast: null,
        dialog: null,
        loader: null
      };

      state.initialized = false;
      state.loadingCount = 0;

      return true;
    },

    handleDelegatedClick(event) {
      const dismissToast = event.target.closest("[data-toast-dismiss]");

      if (dismissToast) {
        UI.dismissToast(dismissToast.getAttribute("data-toast-dismiss"));
        return;
      }

      const dialogClose = event.target.closest("[data-dialog-close]");

      if (dialogClose) {
        closeDialog(
          dialogClose.getAttribute("data-dialog-close"),
          dialogClose.getAttribute("data-result")
        );
        return;
      }

      const dialogBackdrop = event.target.closest("[data-dialog-backdrop]");

      if (
        dialogBackdrop &&
        event.target === dialogBackdrop &&
        dialogBackdrop.getAttribute("data-close-on-backdrop") !== "false"
      ) {
        closeDialog(dialogBackdrop.getAttribute("data-dialog-backdrop"), null);
        return;
      }

      const actionElement = event.target.closest("[data-action]");
      if (!actionElement) return;

      const action = normalizeActionName(
        actionElement.getAttribute("data-action")
      );

      if (!action) return;

      const handler = state.actionHandlers.get(action);
      if (!handler) return;

      event.preventDefault();

      const params = {};

      Array.from(actionElement.attributes).forEach((attribute) => {
        if (attribute.name.startsWith("data-param-")) {
          const key = attribute.name.replace("data-param-", "");
          params[key] = attribute.value;
        }
      });

      const context = {
        action,
        element: actionElement,
        event,
        params,
        route: actionElement.getAttribute("data-route"),
        view: actionElement.getAttribute("data-view"),
        ui: UI,
        router: getRouter(),
        store: getStore()
      };

      try {
        const result = handler(context);

        if (result && typeof result.catch === "function") {
          result.catch((error) => {
            console.error(`TIC UI action "${action}" failed:`, error);
            UI.toast("تعذر تنفيذ الإجراء المطلوب.", "error");
          });
        }
      } catch (error) {
        console.error(`TIC UI action "${action}" failed:`, error);
        UI.toast("تعذر تنفيذ الإجراء المطلوب.", "error");
      }
    },

    handleKeydown(event) {
      if (event.key !== "Escape") return;

      const dialogs = Array.from(state.activeDialogs.keys());
      const latestDialogId = dialogs[dialogs.length - 1];

      if (latestDialogId) closeDialog(latestDialogId, null);
    },

    registerAction(actionName, handler) {
      const action = normalizeActionName(actionName);

      if (!action) {
        throw new Error("TIC UI Error: a valid action name is required.");
      }

      if (typeof handler !== "function") {
        throw new TypeError(
          `TIC UI Error: action "${action}" handler must be a function.`
        );
      }

      state.actionHandlers.set(action, handler);
      emit("action-registered", { action });

      return () => state.actionHandlers.delete(action);
    },

    unregisterAction(actionName) {
      const action = normalizeActionName(actionName);
      if (!action) return false;

      const removed = state.actionHandlers.delete(action);
      if (removed) emit("action-unregistered", { action });

      return removed;
    },

    hasAction(actionName) {
      return state.actionHandlers.has(normalizeActionName(actionName));
    },

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError("TIC UI subscriber must be a function.");
      }

      state.subscribers.add(listener);
      return () => state.subscribers.delete(listener);
    },

    render(target, content, options = {}) {
      const element =
        typeof target === "string" ? document.querySelector(target) : target;

      if (!element) return null;

      setElementContent(element, content, options.mode || "html");

      if (options.focus === true) focusFirstInteractive(element);

      emit("rendered", {
        target:
          element.id ||
          element.getAttribute("data-ui-target") ||
          element.tagName.toLowerCase()
      });

      return element;
    },

    clear(target) {
      return this.render(target, "");
    },

    toast(message, type = "info", options = {}) {
      this.init();

      const toastId = options.id || `toast-${++state.toastCounter}`;
      const root = ensureRoot("toast");
      const tone = ["success", "error", "warning", "info"].includes(type)
        ? type
        : "info";
      const duration =
        options.persistent === true
          ? 0
          : Number(options.duration) || DEFAULT_DURATION;

      const iconMap = {
        success: "✓",
        error: "!",
        warning: "!",
        info: "i"
      };

      const element = document.createElement("div");
      element.className = renderClassNames(
        "tic-toast",
        `tic-toast--${tone}`,
        options.className
      );
      element.setAttribute("data-toast-id", toastId);
      element.setAttribute("role", tone === "error" ? "alert" : "status");

      element.innerHTML = `
        <div class="tic-toast__icon" aria-hidden="true">
          ${escapeHTML(iconMap[tone] || iconMap.info)}
        </div>

        <div class="tic-toast__content">
          ${
            options.title
              ? `<strong class="tic-toast__title">${escapeHTML(
                  options.title
                )}</strong>`
              : ""
          }

          <p class="tic-toast__message">${escapeHTML(message)}</p>
        </div>

        ${
          options.dismissible === false
            ? ""
            : `<button
                type="button"
                class="tic-toast__close"
                data-toast-dismiss="${escapeAttribute(toastId)}"
                aria-label="إغلاق التنبيه"
              >×</button>`
        }
      `;

      root.appendChild(element);
      window.requestAnimationFrame(() => element.classList.add("is-visible"));

      let timeoutId = null;

      if (duration > 0) {
        timeoutId = window.setTimeout(() => {
          this.dismissToast(toastId);
        }, duration);
      }

      state.activeToasts.set(toastId, { element, timeoutId });
      emit("toast-opened", { toastId, type: tone, message });

      return toastId;
    },

    dismissToast(toastId) {
      const entry = state.activeToasts.get(toastId);
      if (!entry) return false;

      window.clearTimeout(entry.timeoutId);
      entry.element.classList.remove("is-visible");
      entry.element.classList.add("is-closing");

      window.setTimeout(() => {
        if (entry.element.parentNode) {
          entry.element.parentNode.removeChild(entry.element);
        }

        state.activeToasts.delete(toastId);
        emit("toast-closed", { toastId });
      }, 180);

      return true;
    },

    dismissAllToasts() {
      Array.from(state.activeToasts.keys()).forEach((toastId) => {
        this.dismissToast(toastId);
      });
    },

    alert(options = {}) {
      const normalized =
        typeof options === "string" ? { message: options } : options;

      return this.dialog({
        title: normalized.title || "تنبيه",
        message: normalized.message || "",
        icon: normalized.icon || "i",
        tone: normalized.tone || "info",
        actions: [
          {
            label: normalized.confirmLabel || "حسناً",
            result: true,
            primary: true
          }
        ],
        closeOnBackdrop: normalized.closeOnBackdrop !== false
      });
    },

    confirm(options = {}) {
      const normalized =
        typeof options === "string" ? { message: options } : options;

      return this.dialog({
        title: normalized.title || "تأكيد الإجراء",
        message: normalized.message || "هل تريد المتابعة؟",
        icon: normalized.icon || "؟",
        tone: normalized.tone || "warning",
        actions: [
          {
            label: normalized.cancelLabel || "إلغاء",
            result: false
          },
          {
            label: normalized.confirmLabel || "تأكيد",
            result: true,
            primary: true,
            danger: normalized.danger === true
          }
        ],
        closeOnBackdrop: normalized.closeOnBackdrop !== false
      });
    },

    dialog(options = {}) {
      this.init();

      const dialogId = options.id || `dialog-${++state.dialogCounter}`;
      const root = ensureRoot("dialog");
      const element = document.createElement("div");
      const actions =
        Array.isArray(options.actions) && options.actions.length
          ? options.actions
          : [{ label: "إغلاق", result: true, primary: true }];

      element.className = renderClassNames(
        "tic-dialog-backdrop",
        options.className
      );
      element.setAttribute("data-dialog-backdrop", dialogId);
      element.setAttribute(
        "data-close-on-backdrop",
        options.closeOnBackdrop === false ? "false" : "true"
      );

      element.innerHTML = `
        <section
          class="${escapeAttribute(
            renderClassNames(
              "tic-dialog",
              options.tone ? `tic-dialog--${options.tone}` : ""
            )
          )}"
          role="dialog"
          aria-modal="true"
          aria-labelledby="${escapeAttribute(`${dialogId}-title`)}"
        >
          <header class="tic-dialog__header">
            ${
              options.icon
                ? `<div class="tic-dialog__icon" aria-hidden="true">${escapeHTML(
                    options.icon
                  )}</div>`
                : ""
            }

            <div class="tic-dialog__heading">
              <h2 class="tic-dialog__title" id="${escapeAttribute(
                `${dialogId}-title`
              )}">${escapeHTML(options.title || "تنبيه")}</h2>

              ${
                options.subtitle
                  ? `<p class="tic-dialog__subtitle">${escapeHTML(
                      options.subtitle
                    )}</p>`
                  : ""
              }
            </div>

            ${
              options.showClose === false
                ? ""
                : `<button
                    type="button"
                    class="tic-dialog__close"
                    data-dialog-close="${escapeAttribute(dialogId)}"
                    aria-label="إغلاق النافذة"
                  >×</button>`
            }
          </header>

          <div class="tic-dialog__body">
            ${
              options.content !== undefined
                ? String(options.content)
                : `<p class="tic-dialog__message">${escapeHTML(
                    options.message || ""
                  )}</p>`
            }
          </div>

          <footer class="tic-dialog__footer">
            ${actions
              .map(
                (action) => `
                  <button
                    type="button"
                    class="${escapeAttribute(
                      renderClassNames(
                        "button",
                        action.primary
                          ? "button--primary"
                          : "button--secondary",
                        action.danger ? "button--danger" : "",
                        action.className
                      )
                    )}"
                    data-dialog-close="${escapeAttribute(dialogId)}"
                    data-result="${escapeAttribute(String(action.result))}"
                    ${action.disabled ? "disabled" : ""}
                  >
                    ${renderIcon(action.icon)}
                    <span>${escapeHTML(action.label || "إغلاق")}</span>
                  </button>
                `
              )
              .join("")}
          </footer>
        </section>
      `;

      root.appendChild(element);
      document.documentElement.classList.add("has-open-dialog");

      return new Promise((resolve) => {
        state.activeDialogs.set(dialogId, { element, resolve });

        window.requestAnimationFrame(() => {
          element.classList.add("is-visible");
          focusFirstInteractive(element);
        });

        emit("dialog-opened", {
          dialogId,
          title: options.title || "تنبيه"
        });
      }).then((result) => {
        if (result === "true") return true;
        if (result === "false") return false;
        return result;
      });
    },

    closeDialog(dialogId, result = null) {
      return closeDialog(dialogId, result);
    },

    showLoader(message = "جاري التحميل...", options = {}) {
      this.init();
      state.loadingCount += 1;

      const root = ensureRoot("loader");
      root.classList.add("is-visible");
      root.innerHTML = `
        <div
          class="tic-loader-overlay"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div class="tic-loader">
            <span class="tic-loader__spinner" aria-hidden="true"></span>

            <div class="tic-loader__content">
              <strong class="tic-loader__title">${escapeHTML(
                options.title || "لحظات..."
              )}</strong>
              <p class="tic-loader__message">${escapeHTML(message)}</p>
            </div>
          </div>
        </div>
      `;

      document.documentElement.classList.add("is-ui-loading");
      emit("loader-shown", { message, count: state.loadingCount });

      return state.loadingCount;
    },

    hideLoader(force = false) {
      state.loadingCount = force
        ? 0
        : Math.max(0, state.loadingCount - 1);

      if (state.loadingCount === 0) {
        const root = ensureRoot("loader");
        root.classList.remove("is-visible");
        root.innerHTML = "";
        document.documentElement.classList.remove("is-ui-loading");
      }

      emit("loader-hidden", { count: state.loadingCount });
      return state.loadingCount;
    },

    async withLoader(task, message = "جاري التحميل...", options = {}) {
      if (typeof task !== "function") {
        throw new TypeError("TIC UI Error: withLoader requires a function.");
      }

      this.showLoader(message, options);

      try {
        return await task();
      } finally {
        this.hideLoader();
      }
    },

    hero(options = {}) {
      const actions = toArray(options.actions);

      return `
        <section
          class="${escapeAttribute(
            renderClassNames(
              "tic-hero",
              options.compact ? "tic-hero--compact" : "",
              options.className
            )
          )}"
          ${renderAttributes(options.attributes || {})}
        >
          <div class="tic-hero__content">
            ${
              options.badge
                ? `<span class="tic-hero__badge">
                    ${renderIcon(options.badgeIcon)}
                    ${escapeHTML(options.badge)}
                  </span>`
                : ""
            }

            <div class="tic-hero__heading">
              ${
                options.eyebrow
                  ? `<p class="tic-hero__eyebrow">${escapeHTML(
                      options.eyebrow
                    )}</p>`
                  : ""
              }

              <h1 class="tic-hero__title">${escapeHTML(
                options.title || ""
              )}</h1>

              ${
                options.subtitle
                  ? `<p class="tic-hero__subtitle">${escapeHTML(
                      options.subtitle
                    )}</p>`
                  : ""
              }
            </div>

            ${
              actions.length
                ? `<div class="tic-hero__actions">
                    ${actions.map((action) => this.button(action)).join("")}
                  </div>`
                : ""
            }
          </div>

          ${
            options.aside
              ? `<div class="tic-hero__aside">${options.aside}</div>`
              : ""
          }
        </section>
      `;
    },

    section(options = {}) {
      const actions = toArray(options.actions);

      return `
        <section
          class="${escapeAttribute(
            renderClassNames("tic-section", options.className)
          )}"
          ${renderAttributes(options.attributes || {})}
        >
          ${
            options.title || options.subtitle || actions.length
              ? `<header class="tic-section__header">
                  <div class="tic-section__heading">
                    ${
                      options.eyebrow
                        ? `<p class="tic-section__eyebrow">${escapeHTML(
                            options.eyebrow
                          )}</p>`
                        : ""
                    }

                    ${
                      options.title
                        ? `<h2 class="tic-section__title">${escapeHTML(
                            options.title
                          )}</h2>`
                        : ""
                    }

                    ${
                      options.subtitle
                        ? `<p class="tic-section__subtitle">${escapeHTML(
                            options.subtitle
                          )}</p>`
                        : ""
                    }
                  </div>

                  ${
                    actions.length
                      ? `<div class="tic-section__actions">
                          ${actions
                            .map((action) => this.button(action))
                            .join("")}
                        </div>`
                      : ""
                  }
                </header>`
              : ""
          }

          <div class="tic-section__body">${options.content || ""}</div>
        </section>
      `;
    },

    grid(content = "", options = {}) {
      const columns = Number(options.columns) || 2;

      return `
        <div
          class="${escapeAttribute(
            renderClassNames(
              "tic-grid",
              `tic-grid--${columns}`,
              options.className
            )
          )}"
          ${renderAttributes(options.attributes || {})}
        >
          ${content}
        </div>
      `;
    },

    card(options = {}) {
      const tag =
        options.href || options.route
          ? "a"
          : options.action
            ? "button"
            : options.tag || "article";

      const attributes = { ...(options.attributes || {}) };

      if (tag === "a") {
        attributes.href = options.href || `#${options.route || ""}`;
      }

      if (tag === "button") attributes.type = "button";

      return `
        <${tag}
          class="${escapeAttribute(
            renderClassNames(
              "tic-card",
              options.interactive ? "tic-card--interactive" : "",
              options.compact ? "tic-card--compact" : "",
              options.tone ? `tic-card--${options.tone}` : "",
              options.className
            )
          )}"
          ${renderActionAttributes(options)}
          ${renderAttributes(attributes)}
        >
          ${
            options.media
              ? `<div class="tic-card__media">${options.media}</div>`
              : ""
          }

          <div class="tic-card__content">
            ${
              options.icon || options.badge || options.meta
                ? `<div class="tic-card__top">
                    ${renderIcon(options.icon, {
                      className: "tic-card__icon"
                    })}

                    <div class="tic-card__top-meta">
                      ${
                        options.badge
                          ? this.badge(
                              options.badge,
                              options.badgeTone || "neutral"
                            )
                          : ""
                      }

                      ${
                        options.meta
                          ? `<span class="tic-card__meta">${escapeHTML(
                              options.meta
                            )}</span>`
                          : ""
                      }
                    </div>
                  </div>`
                : ""
            }

            ${
              options.title
                ? `<h3 class="tic-card__title">${escapeHTML(
                    options.title
                  )}</h3>`
                : ""
            }

            ${
              options.description
                ? `<p class="tic-card__description">${escapeHTML(
                    options.description
                  )}</p>`
                : ""
            }

            ${
              options.body
                ? `<div class="tic-card__body">${options.body}</div>`
                : ""
            }

            ${
              options.footer || options.trailing
                ? `<footer class="tic-card__footer">
                    <div class="tic-card__footer-content">${
                      options.footer || ""
                    }</div>
                    ${
                      options.trailing
                        ? `<div class="tic-card__trailing">${options.trailing}</div>`
                        : ""
                    }
                  </footer>`
                : ""
            }
          </div>
        </${tag}>
      `;
    },

    stat(options = {}) {
      const trend = Number(options.trend) || 0;
      const trendTone =
        trend > 0 ? "positive" : trend < 0 ? "negative" : "neutral";

      return `
        <article class="${escapeAttribute(
          renderClassNames(
            "tic-stat",
            options.tone ? `tic-stat--${options.tone}` : "",
            options.className
          )
        )}">
          <div class="tic-stat__header">
            ${renderIcon(options.icon, { className: "tic-stat__icon" })}
            ${
              options.badge
                ? this.badge(options.badge, options.badgeTone || "neutral")
                : ""
            }
          </div>

          <div class="tic-stat__body">
            <strong class="tic-stat__value">${escapeHTML(
              options.value ?? "—"
            )}</strong>
            <span class="tic-stat__label">${escapeHTML(
              options.label || ""
            )}</span>
          </div>

          ${
            options.subtitle || options.trend !== undefined
              ? `<footer class="tic-stat__footer">
                  ${
                    options.subtitle
                      ? `<span class="tic-stat__subtitle">${escapeHTML(
                          options.subtitle
                        )}</span>`
                      : ""
                  }

                  ${
                    options.trend !== undefined
                      ? `<span class="tic-stat__trend tic-stat__trend--${trendTone}">
                          ${trend > 0 ? "↑" : trend < 0 ? "↓" : "•"}
                          ${escapeHTML(Math.abs(trend))}%
                        </span>`
                      : ""
                  }
                </footer>`
              : ""
          }
        </article>
      `;
    },

    badge(label, tone = "neutral", options = {}) {
      return `
        <span
          class="${escapeAttribute(
            renderClassNames(
              "tic-badge",
              `tic-badge--${tone}`,
              options.className
            )
          )}"
          ${renderAttributes(options.attributes || {})}
        >
          ${renderIcon(options.icon)}
          <span>${escapeHTML(label)}</span>
        </span>
      `;
    },

    status(label, options = {}) {
      const tone = options.tone || getStatusTone(options.value || label);

      return this.badge(label, tone, {
        icon: options.icon,
        className: renderClassNames("tic-status", options.className)
      });
    },

    button(options = {}) {
      if (typeof options === "string") options = { label: options };

      const tag = options.href ? "a" : "button";
      const attributes = { ...(options.attributes || {}) };

      if (tag === "button") {
        attributes.type = options.type || "button";
      } else {
        attributes.href = options.href;
      }

      if (options.name) attributes.name = options.name;
      if (options.value !== undefined) attributes.value = options.value;

      return `
        <${tag}
          class="${escapeAttribute(
            renderClassNames(
              "button",
              options.primary ? "button--primary" : "button--secondary",
              options.danger ? "button--danger" : "",
              options.ghost ? "button--ghost" : "",
              options.small ? "button--small" : "",
              options.block ? "button--block" : "",
              options.className
            )
          )}"
          ${renderActionAttributes(options)}
          ${renderAttributes(attributes)}
        >
          ${renderIcon(options.icon, { className: "button__icon" })}
          <span class="button__label">${escapeHTML(
            options.label || ""
          )}</span>
          ${
            options.trailingIcon
              ? renderIcon(options.trailingIcon, {
                  className: "button__icon button__icon--trailing"
                })
              : ""
          }
        </${tag}>
      `;
    },

    iconButton(options = {}) {
      return `
        <button
          type="button"
          class="${escapeAttribute(
            renderClassNames(
              "tic-icon-button",
              options.tone ? `tic-icon-button--${options.tone}` : "",
              options.className
            )
          )}"
          ${renderActionAttributes(options)}
          aria-label="${escapeAttribute(
            options.ariaLabel || options.label || "إجراء"
          )}"
        >
          ${renderIcon(options.icon || "•")}
        </button>
      `;
    },

    progress(value = 0, options = {}) {
      const percentage = clamp(value);

      return `
        <div
          class="${escapeAttribute(
            renderClassNames(
              "tic-progress",
              options.compact ? "tic-progress--compact" : "",
              options.className
            )
          )}"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${percentage}"
        >
          ${
            options.label || options.showValue !== false
              ? `<div class="tic-progress__header">
                  <span class="tic-progress__label">${escapeHTML(
                    options.label || "التقدم"
                  )}</span>
                  ${
                    options.showValue === false
                      ? ""
                      : `<strong class="tic-progress__value">${percentage}%</strong>`
                  }
                </div>`
              : ""
          }

          <div class="tic-progress__track">
            <span class="tic-progress__bar" style="width:${percentage}%"></span>
          </div>

          ${
            options.hint
              ? `<p class="tic-progress__hint">${escapeHTML(
                  options.hint
                )}</p>`
              : ""
          }
        </div>
      `;
    },

    info(label, value, options = {}) {
      return `
        <div class="${escapeAttribute(
          renderClassNames("tic-info", options.className)
        )}">
          <div class="tic-info__label">
            ${renderIcon(options.icon)}
            <span>${escapeHTML(label)}</span>
          </div>
          <strong class="tic-info__value">${escapeHTML(
            value ?? "—"
          )}</strong>
        </div>
      `;
    },

    divider(options = {}) {
      return `<hr class="${escapeAttribute(
        renderClassNames("tic-divider", options.className)
      )}" ${renderAttributes(options.attributes || {})}>`;
    },

    empty(options = {}) {
      return `
        <section class="${escapeAttribute(
          renderClassNames("tic-empty", options.className)
        )}">
          <div class="tic-empty__icon" aria-hidden="true">${escapeHTML(
            options.icon || "✦"
          )}</div>
          <h3 class="tic-empty__title">${escapeHTML(
            options.title || "لا توجد بيانات"
          )}</h3>

          ${
            options.message
              ? `<p class="tic-empty__message">${escapeHTML(
                  options.message
                )}</p>`
              : ""
          }

          ${
            options.action
              ? `<div class="tic-empty__action">${this.button(
                  options.action
                )}</div>`
              : ""
          }
        </section>
      `;
    },

    list(items = [], options = {}) {
      if (!Array.isArray(items) || items.length === 0) {
        return options.empty ? this.empty(options.empty) : "";
      }

      return `
        <div class="${escapeAttribute(
          renderClassNames(
            "tic-list",
            options.divided ? "tic-list--divided" : "",
            options.className
          )
        )}">
          ${items
            .map((item, index) => {
              if (typeof item === "string") item = { title: item };

              const tag =
                item.action || item.route || item.href
                  ? item.href
                    ? "a"
                    : "button"
                  : "div";

              const attributes =
                tag === "button"
                  ? { type: "button" }
                  : tag === "a"
                    ? { href: item.href || `#${item.route || ""}` }
                    : {};

              return `
                <${tag}
                  class="${escapeAttribute(
                    renderClassNames(
                      "tic-list-item",
                      item.interactive !== false && tag !== "div"
                        ? "tic-list-item--interactive"
                        : "",
                      item.className
                    )
                  )}"
                  ${renderActionAttributes(item)}
                  ${renderAttributes(attributes)}
                  data-index="${index}"
                >
                  ${
                    item.icon
                      ? `<div class="tic-list-item__icon">${renderIcon(
                          item.icon
                        )}</div>`
                      : ""
                  }

                  <div class="tic-list-item__content">
                    <div class="tic-list-item__heading">
                      <strong class="tic-list-item__title">${escapeHTML(
                        item.title || ""
                      )}</strong>
                      ${
                        item.badge
                          ? this.badge(
                              item.badge,
                              item.badgeTone || "neutral"
                            )
                          : ""
                      }
                    </div>

                    ${
                      item.subtitle
                        ? `<p class="tic-list-item__subtitle">${escapeHTML(
                            item.subtitle
                          )}</p>`
                        : ""
                    }

                    ${
                      item.meta
                        ? `<span class="tic-list-item__meta">${escapeHTML(
                            item.meta
                          )}</span>`
                        : ""
                    }
                  </div>

                  ${
                    item.trailing
                      ? `<div class="tic-list-item__trailing">${item.trailing}</div>`
                      : tag !== "div"
                        ? `<span class="tic-list-item__arrow" aria-hidden="true">‹</span>`
                        : ""
                  }
                </${tag}>
              `;
            })
            .join("")}
        </div>
      `;
    },

    quickActions(items = [], options = {}) {
      const content = items
        .map((item) =>
          this.card({
            ...item,
            compact: true,
            interactive: true,
            className: renderClassNames("tic-quick-action", item.className)
          })
        )
        .join("");

      return this.grid(content, {
        columns: options.columns || 2,
        className: renderClassNames("tic-quick-actions", options.className)
      });
    },

    timeline(items = [], options = {}) {
      if (!Array.isArray(items) || items.length === 0) {
        return this.empty(
          options.empty || {
            title: "لا يوجد تسلسل زمني",
            message: "ستظهر التحديثات هنا عند توفرها."
          }
        );
      }

      return `
        <div class="${escapeAttribute(
          renderClassNames("tic-timeline", options.className)
        )}">
          ${items
            .map(
              (item, index) => `
                <article class="${escapeAttribute(
                  renderClassNames(
                    "tic-timeline__item",
                    item.completed ? "is-completed" : "",
                    item.active ? "is-active" : ""
                  )
                )}">
                  <div class="tic-timeline__marker">
                    <span>${escapeHTML(
                      item.icon || (item.completed ? "✓" : index + 1)
                    )}</span>
                  </div>

                  <div class="tic-timeline__content">
                    <div class="tic-timeline__heading">
                      <h3 class="tic-timeline__title">${escapeHTML(
                        item.title || ""
                      )}</h3>
                      ${
                        item.date
                          ? `<time class="tic-timeline__date">${escapeHTML(
                              item.date
                            )}</time>`
                          : ""
                      }
                    </div>

                    ${
                      item.description
                        ? `<p class="tic-timeline__description">${escapeHTML(
                            item.description
                          )}</p>`
                        : ""
                    }
                  </div>
                </article>
              `
            )
            .join("")}
        </div>
      `;
    },

    field(fieldDefinition = {}) {
      const field = normalizeField(fieldDefinition);
      const fieldId = field.attributes.id || `field-${field.name}`;

      const commonAttributes = {
        id: fieldId,
        name: field.name,
        required: field.required,
        disabled: field.disabled,
        readonly: field.readonly,
        autocomplete: field.autocomplete,
        placeholder: field.placeholder,
        min: field.min,
        max: field.max,
        step: field.step,
        inputmode: field.inputMode || undefined,
        ...field.attributes
      };

      let control = "";

      if (field.type === "textarea") {
        control = `
          <textarea
            class="tic-field__control"
            rows="${escapeAttribute(field.rows)}"
            ${renderAttributes(commonAttributes)}
          >${escapeHTML(field.value)}</textarea>
        `;
      } else if (field.type === "select") {
        control = `
          <select class="tic-field__control" ${renderAttributes(
            commonAttributes
          )}>
            ${
              field.placeholder
                ? `<option value="">${escapeHTML(field.placeholder)}</option>`
                : ""
            }

            ${field.options
              .map((option) => {
                const normalized = isObject(option)
                  ? option
                  : { label: option, value: option };
                const selected =
                  String(normalized.value) === String(field.value);

                return `
                  <option
                    value="${escapeAttribute(normalized.value)}"
                    ${selected ? "selected" : ""}
                  >
                    ${escapeHTML(normalized.label)}
                  </option>
                `;
              })
              .join("")}
          </select>
        `;
      } else if (field.type === "checkbox" || field.type === "radio") {
        control = `
          <label class="tic-choice">
            <input
              class="tic-choice__input"
              type="${escapeAttribute(field.type)}"
              value="${escapeAttribute(field.value || "1")}"
              ${renderAttributes(commonAttributes)}
              ${field.checked ? "checked" : ""}
            >
            <span class="tic-choice__control"></span>
            <span class="tic-choice__label">${escapeHTML(
              field.label
            )}</span>
          </label>
        `;
      } else {
        control = `
          <input
            class="tic-field__control"
            type="${escapeAttribute(field.type)}"
            value="${escapeAttribute(field.value)}"
            ${renderAttributes(commonAttributes)}
          >
        `;
      }

      if (field.type === "checkbox" || field.type === "radio") {
        return `
          <div class="${escapeAttribute(
            renderClassNames(
              "tic-field",
              "tic-field--choice",
              field.error ? "has-error" : "",
              field.className
            )
          )}">
            ${control}
            ${
              field.hint
                ? `<small class="tic-field__hint">${escapeHTML(
                    field.hint
                  )}</small>`
                : ""
            }
            ${
              field.error
                ? `<small class="tic-field__error">${escapeHTML(
                    field.error
                  )}</small>`
                : ""
            }
          </div>
        `;
      }

      return `
        <div class="${escapeAttribute(
          renderClassNames(
            "tic-field",
            field.error ? "has-error" : "",
            field.className
          )
        )}">
          <label class="tic-field__label" for="${escapeAttribute(fieldId)}">
            <span>${escapeHTML(field.label)}</span>
            ${
              field.required
                ? `<span class="tic-field__required" aria-hidden="true">*</span>`
                : ""
            }
          </label>

          ${control}

          ${
            field.hint
              ? `<small class="tic-field__hint">${escapeHTML(
                  field.hint
                )}</small>`
              : ""
          }

          ${
            field.error
              ? `<small class="tic-field__error">${escapeHTML(
                  field.error
                )}</small>`
              : ""
          }
        </div>
      `;
    },

    form(options = {}) {
      const fields = Array.isArray(options.fields) ? options.fields : [];
      const actions =
        Array.isArray(options.actions) && options.actions.length
          ? options.actions
          : [
              {
                label: options.submitLabel || "حفظ",
                type: "submit",
                primary: true
              }
            ];

      return `
        <form
          class="${escapeAttribute(
            renderClassNames("tic-form", options.className)
          )}"
          ${renderAttributes({
            id: options.id,
            "data-form": options.name,
            novalidate: options.noValidate === true
          })}
        >
          ${
            options.title || options.subtitle
              ? `<header class="tic-form__header">
                  ${
                    options.title
                      ? `<h2 class="tic-form__title">${escapeHTML(
                          options.title
                        )}</h2>`
                      : ""
                  }
                  ${
                    options.subtitle
                      ? `<p class="tic-form__subtitle">${escapeHTML(
                          options.subtitle
                        )}</p>`
                      : ""
                  }
                </header>`
              : ""
          }

          <div class="tic-form__fields">
            ${fields.map((field) => this.field(field)).join("")}
          </div>

          <footer class="tic-form__actions">
            ${actions.map((action) => this.button(action)).join("")}
          </footer>
        </form>
      `;
    },

    serializeForm(form) {
      const element =
        typeof form === "string" ? document.querySelector(form) : form;

      if (!element || !(element instanceof window.HTMLFormElement)) {
        return {};
      }

      const formData = new window.FormData(element);
      const result = {};

      for (const [key, value] of formData.entries()) {
        if (Object.prototype.hasOwnProperty.call(result, key)) {
          result[key] = toArray(result[key]);
          result[key].push(value);
        } else {
          result[key] = value;
        }
      }

      element
        .querySelectorAll('input[type="checkbox"][name]')
        .forEach((input) => {
          if (!formData.has(input.name)) {
            result[input.name] = false;
          } else if (
            input.value === "1" ||
            input.value === "true" ||
            input.value === "on"
          ) {
            result[input.name] = true;
          }
        });

      return result;
    },

    setFieldError(field, message = "") {
      const element =
        typeof field === "string" ? document.querySelector(field) : field;

      if (!element) return false;

      const wrapper = element.closest(".tic-field");
      if (!wrapper) return false;

      let errorElement = wrapper.querySelector(".tic-field__error");

      if (!message) {
        wrapper.classList.remove("has-error");
        if (errorElement) errorElement.remove();
        element.removeAttribute("aria-invalid");
        return true;
      }

      wrapper.classList.add("has-error");
      element.setAttribute("aria-invalid", "true");

      if (!errorElement) {
        errorElement = document.createElement("small");
        errorElement.className = "tic-field__error";
        wrapper.appendChild(errorElement);
      }

      errorElement.textContent = message;
      return true;
    },

    clearFormErrors(form) {
      const element =
        typeof form === "string" ? document.querySelector(form) : form;

      if (!element) return false;

      element.querySelectorAll(".tic-field.has-error").forEach((field) => {
        field.classList.remove("has-error");
      });

      element.querySelectorAll(".tic-field__error").forEach((error) => {
        error.remove();
      });

      element.querySelectorAll("[aria-invalid='true']").forEach((control) => {
        control.removeAttribute("aria-invalid");
      });

      return true;
    },

    skeleton(options = {}) {
      const lines = Number(options.lines) || 3;

      return `
        <div class="${escapeAttribute(
          renderClassNames("tic-skeleton", options.className)
        )}" aria-hidden="true">
          ${
            options.media
              ? `<span class="tic-skeleton__media"></span>`
              : ""
          }

          <div class="tic-skeleton__content">
            ${Array.from(
              { length: lines },
              (_, index) => `
                <span
                  class="tic-skeleton__line"
                  style="width:${index === lines - 1 ? "62" : "100"}%"
                ></span>
              `
            ).join("")}
          </div>
        </div>
      `;
    },

    currency(value, options = {}) {
      const amount = Number(value) || 0;

      try {
        return new Intl.NumberFormat(options.locale || DEFAULT_LOCALE, {
          style: "currency",
          currency: options.currency || DEFAULT_CURRENCY,
          minimumFractionDigits: options.minimumFractionDigits ?? 0,
          maximumFractionDigits: options.maximumFractionDigits ?? 2
        }).format(amount);
      } catch (error) {
        return `${amount.toLocaleString()} ${
          options.currency || DEFAULT_CURRENCY
        }`;
      }
    },

    number(value, options = {}) {
      const amount = Number(value) || 0;

      try {
        return new Intl.NumberFormat(
          options.locale || DEFAULT_LOCALE,
          options
        ).format(amount);
      } catch (error) {
        return String(amount);
      }
    },

    date(value, options = {}) {
      if (!value) return "—";

      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);

      try {
        return new Intl.DateTimeFormat(options.locale || DEFAULT_LOCALE, {
          day: "numeric",
          month: "short",
          year: "numeric",
          ...options
        }).format(date);
      } catch (error) {
        return date.toLocaleDateString();
      }
    },

    relativeTime(value, options = {}) {
      if (!value) return "—";

      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);

      const diffMilliseconds = date.getTime() - Date.now();
      const units = [
        ["year", 31536000000],
        ["month", 2592000000],
        ["week", 604800000],
        ["day", 86400000],
        ["hour", 3600000],
        ["minute", 60000],
        ["second", 1000]
      ];

      const formatter = new Intl.RelativeTimeFormat(
        options.locale || DEFAULT_LOCALE,
        { numeric: "auto" }
      );

      for (const [unit, milliseconds] of units) {
        if (
          Math.abs(diffMilliseconds) >= milliseconds ||
          unit === "second"
        ) {
          return formatter.format(
            Math.round(diffMilliseconds / milliseconds),
            unit
          );
        }
      }

      return "الآن";
    },

    truncate(value, length = 120) {
      const text = String(value ?? "");
      if (text.length <= length) return text;
      return `${text.slice(0, length).trim()}…`;
    },

    route(routeName, options = {}) {
      const router = getRouter();

      if (!router || typeof router.go !== "function") {
        return false;
      }

      return router.go(routeName, options);
    },

    diagnostics() {
      return {
        id: this.id,
        version: this.version,
        initialized: state.initialized,
        loadingCount: state.loadingCount,
        actionCount: state.actionHandlers.size,
        subscriberCount: state.subscribers.size,
        activeToastCount: state.activeToasts.size,
        activeDialogCount: state.activeDialogs.size,
        roots: {
          toast: Boolean(state.roots.toast),
          dialog: Boolean(state.roots.dialog),
          loader: Boolean(state.roots.loader)
        },
        locale: DEFAULT_LOCALE,
        currency: DEFAULT_CURRENCY
      };
    }
  };

  Object.defineProperties(UI, {
    isInitialized: {
      enumerable: true,
      get() {
        return state.initialized;
      }
    },

    isLoading: {
      enumerable: true,
      get() {
        return state.loadingCount > 0;
      }
    },

    loadingCount: {
      enumerable: true,
      get() {
        return state.loadingCount;
      }
    }
  });

  window.TIC = window.TIC || {};
  window.TIC.UI = UI;
  window.TICUI = UI;

  UI.init();
})(window, document);
