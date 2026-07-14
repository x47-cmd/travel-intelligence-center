/* =========================================================
   Travel Intelligence Center
   User Interface Engine V2.0.0

   File Path:
   js/ui.js

   Purpose:
   - Shared premium UI layer for the full application.
   - iPhone-first components aligned with css/style.css V2.
   - Cards, sections, statistics, buttons, forms, lists,
     dialogs, loaders, toasts, empty states and actions.

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
  const VERSION = "2.0.0";

  const LOCALE =
    Config.locale ||
    Config.language ||
    Config.app?.locale ||
    "ar-AE";

  const CURRENCY =
    Config.currency ||
    Config.profile?.currency ||
    Config.app?.currency ||
    "AED";

  const TOAST_DURATION =
    Number(Config.ui?.toastDuration) || 3200;

  const state = {
    initialized: false,
    loadingCount: 0,
    toastCounter: 0,
    dialogCounter: 0,
    actions: new Map(),
    subscribers: new Set(),
    toasts: new Map(),
    dialogs: new Map(),
    roots: {
      toast: null,
      dialog: null,
      loader: null
    }
  };

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

  const escapeAttribute = (value) =>
    escapeHTML(value).replace(/`/g, "&#096;");

  const normalizeText = (value) =>
    String(value ?? "").trim();

  const normalizeAction = (value) =>
    normalizeText(value)
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]/g, "");

  const toArray = (value) => {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null) return [];
    return [value];
  };

  const clamp = (value, min = 0, max = 100) =>
    Math.min(max, Math.max(min, Number(value) || 0));

  const createId = (prefix = "tic") =>
    `${prefix}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;

  const classNames = (...values) =>
    values
      .flatMap((value) => {
        if (Array.isArray(value)) return value;

        if (isObject(value)) {
          return Object.entries(value)
            .filter(([, enabled]) => Boolean(enabled))
            .map(([name]) => name);
        }

        return value;
      })
      .filter(Boolean)
      .join(" ");

  const attributes = (items = {}) =>
    Object.entries(items)
      .filter(([, value]) =>
        value !== undefined &&
        value !== null &&
        value !== false
      )
      .map(([key, value]) => {
        if (value === true) {
          return escapeAttribute(key);
        }

        return `${escapeAttribute(key)}="${escapeAttribute(value)}"`;
      })
      .join(" ");

  const icon = (value, className = "") => {
    if (!value) return "";

    if (
      typeof value === "string" &&
      value.trim().startsWith("<")
    ) {
      return `
        <span
          class="${escapeAttribute(
            classNames("tic-icon", className)
          )}"
          aria-hidden="true"
        >${value}</span>
      `;
    }

    return `
      <span
        class="${escapeAttribute(
          classNames("tic-icon", className)
        )}"
        aria-hidden="true"
      >${escapeHTML(value)}</span>
    `;
  };

  const getRouter = () =>
    window.TIC?.Router ||
    window.TICRouter ||
    null;

  const getStore = () =>
    window.TIC?.Store ||
    window.TICStore ||
    null;

  const actionAttributes = (options = {}) => {
    const result = {};

    if (options.action) {
      result["data-action"] = normalizeAction(options.action);
    }

    if (options.route) {
      result["data-route"] = normalizeText(options.route);
    }

    if (options.view) {
      result["data-view"] = normalizeText(options.view);
    }

    if (options.id) result.id = options.id;

    if (options.disabled) {
      result.disabled = true;
      result["aria-disabled"] = "true";
    }

    if (options.ariaLabel) {
      result["aria-label"] = options.ariaLabel;
    }

    if (isObject(options.params)) {
      Object.entries(options.params).forEach(([key, value]) => {
        result[`data-param-${key}`] = String(value);
      });
    }

    if (isObject(options.attributes)) {
      Object.assign(result, options.attributes);
    }

    return attributes(result);
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
    const current = state.roots[type];

    if (current && document.contains(current)) {
      return current;
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

  const focusFirst = (container) => {
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
    const entry = state.dialogs.get(dialogId);
    if (!entry) return false;

    const { element, resolve } = entry;

    element.classList.add("is-closing");

    window.setTimeout(() => {
      element.remove();
      state.dialogs.delete(dialogId);

      if (state.dialogs.size === 0) {
        document.body.classList.remove("tic-modal-open");
      }

      resolve(result);
      emit("dialog-closed", { dialogId, result });
    }, 160);

    return true;
  };

  const normalizeField = (field = {}) => {
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
      options: Array.isArray(field.options)
        ? field.options
        : [],
      min: field.min,
      max: field.max,
      step: field.step,
      rows: field.rows || 4,
      hint: field.hint || "",
      error: field.error || "",
      autocomplete: field.autocomplete || "off",
      inputMode: field.inputMode || "",
      className: field.className || "",
      attributes: field.attributes || {}
    };
  };

  const UI = {
    id: "ui",
    version: VERSION,

    init() {
      if (state.initialized) {
        return this.diagnostics();
      }

      ensureRoot("toast");
      ensureRoot("dialog");
      ensureRoot("loader");

      document.addEventListener(
        "click",
        this.handleDelegatedClick
      );

      document.addEventListener(
        "keydown",
        this.handleKeydown
      );

      state.initialized = true;

      emit("initialized", {
        version: VERSION
      });

      return this.diagnostics();
    },

    destroy() {
      document.removeEventListener(
        "click",
        this.handleDelegatedClick
      );

      document.removeEventListener(
        "keydown",
        this.handleKeydown
      );

      state.toasts.forEach((entry) => {
        window.clearTimeout(entry.timeoutId);
        entry.element.remove();
      });

      Array.from(state.dialogs.keys()).forEach((dialogId) => {
        closeDialog(dialogId, null);
      });

      Object.values(state.roots).forEach((root) => {
        root?.remove();
      });

      state.actions.clear();
      state.subscribers.clear();
      state.toasts.clear();
      state.dialogs.clear();

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
      const dismissToast =
        event.target.closest("[data-toast-dismiss]");

      if (dismissToast) {
        UI.dismissToast(
          dismissToast.getAttribute("data-toast-dismiss")
        );
        return;
      }

      const dialogClose =
        event.target.closest("[data-dialog-close]");

      if (dialogClose) {
        closeDialog(
          dialogClose.getAttribute("data-dialog-close"),
          dialogClose.getAttribute("data-result")
        );
        return;
      }

      const backdrop =
        event.target.closest("[data-dialog-backdrop]");

      if (
        backdrop &&
        event.target === backdrop &&
        backdrop.getAttribute("data-close-on-backdrop") !==
          "false"
      ) {
        closeDialog(
          backdrop.getAttribute("data-dialog-backdrop"),
          null
        );
        return;
      }

      const actionElement =
        event.target.closest("[data-action]");

      if (!actionElement) return;

      const action = normalizeAction(
        actionElement.getAttribute("data-action")
      );

      const handler = state.actions.get(action);
      if (!handler) return;

      event.preventDefault();

      const params = {};

      Array.from(actionElement.attributes).forEach(
        (attribute) => {
          if (
            attribute.name.startsWith("data-param-")
          ) {
            const key = attribute.name.replace(
              "data-param-",
              ""
            );

            params[key] = attribute.value;
          }
        }
      );

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

        if (
          result &&
          typeof result.catch === "function"
        ) {
          result.catch((error) => {
            console.error(
              `TIC UI action "${action}" failed:`,
              error
            );

            UI.toast(
              "تعذر تنفيذ الإجراء المطلوب.",
              "error"
            );
          });
        }
      } catch (error) {
        console.error(
          `TIC UI action "${action}" failed:`,
          error
        );

        UI.toast(
          "تعذر تنفيذ الإجراء المطلوب.",
          "error"
        );
      }
    },

    handleKeydown(event) {
      if (event.key !== "Escape") return;

      const ids = Array.from(state.dialogs.keys());
      const latestId = ids[ids.length - 1];

      if (latestId) {
        closeDialog(latestId, null);
      }
    },

    registerAction(name, handler) {
      const action = normalizeAction(name);

      if (!action) {
        throw new Error(
          "TIC UI Error: valid action name required."
        );
      }

      if (typeof handler !== "function") {
        throw new TypeError(
          `TIC UI Error: handler for "${action}" must be a function.`
        );
      }

      state.actions.set(action, handler);

      emit("action-registered", { action });

      return () => state.actions.delete(action);
    },

    unregisterAction(name) {
      const action = normalizeAction(name);
      if (!action) return false;

      const removed = state.actions.delete(action);

      if (removed) {
        emit("action-unregistered", { action });
      }

      return removed;
    },

    hasAction(name) {
      return state.actions.has(normalizeAction(name));
    },

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError(
          "TIC UI subscriber must be a function."
        );
      }

      state.subscribers.add(listener);

      return () => state.subscribers.delete(listener);
    },

    render(target, content, options = {}) {
      const element =
        typeof target === "string"
          ? document.querySelector(target)
          : target;

      if (!element) return null;

      if (content instanceof window.Node) {
        element.replaceChildren(content);
      } else if (
        Array.isArray(content) &&
        content.every(
          (item) => item instanceof window.Node
        )
      ) {
        element.replaceChildren(...content);
      } else if (options.mode === "text") {
        element.textContent = String(content ?? "");
      } else {
        element.innerHTML = String(content ?? "");
      }

      if (options.focus === true) {
        focusFirst(element);
      }

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

    hero(options = {}) {
      const actions = toArray(options.actions);

      return `
        <section
          class="${escapeAttribute(
            classNames(
              "tic-hero",
              options.className
            )
          )}"
          ${attributes(options.attributes || {})}
        >
          ${
            options.badge
              ? `<span class="tic-hero-badge">
                  ${icon(options.badgeIcon)}
                  ${escapeHTML(options.badge)}
                </span>`
              : ""
          }

          ${
            options.eyebrow
              ? `<p class="tic-eyebrow">${escapeHTML(
                  options.eyebrow
                )}</p>`
              : ""
          }

          <h1 class="${escapeAttribute(
            classNames(
              options.greeting
                ? "tic-home-greeting"
                : ""
            )
          )}">
            ${escapeHTML(options.title || "")}
          </h1>

          ${
            options.subtitle
              ? `<p>${escapeHTML(options.subtitle)}</p>`
              : ""
          }

          ${
            options.meta
              ? `<div class="tic-hero-meta">
                  ${toArray(options.meta)
                    .map(
                      (item) =>
                        `<span>${escapeHTML(item)}</span>`
                    )
                    .join("")}
                </div>`
              : ""
          }

          ${
            actions.length
              ? `<div class="tic-hero-meta">
                  ${actions
                    .map((action) => this.button(action))
                    .join("")}
                </div>`
              : ""
          }

          ${
            options.aside
              ? `<div class="tic-hero-aside">
                  ${options.aside}
                </div>`
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
            classNames(
              "tic-page-section",
              options.className
            )
          )}"
          ${attributes(options.attributes || {})}
        >
          ${
            options.title ||
            options.subtitle ||
            options.eyebrow ||
            actions.length
              ? `<header class="tic-section-heading">
                  <div class="tic-section-heading-copy">
                    ${
                      options.eyebrow
                        ? `<p class="tic-eyebrow">${escapeHTML(
                            options.eyebrow
                          )}</p>`
                        : ""
                    }

                    ${
                      options.title
                        ? `<h2 class="tic-title">${escapeHTML(
                            options.title
                          )}</h2>`
                        : ""
                    }

                    ${
                      options.subtitle
                        ? `<p class="tic-subtitle">${escapeHTML(
                            options.subtitle
                          )}</p>`
                        : ""
                    }
                  </div>

                  ${
                    actions.length
                      ? `<div class="tic-section-actions">
                          ${actions
                            .map((action) =>
                              this.button({
                                ...action,
                                small: true
                              })
                            )
                            .join("")}
                        </div>`
                      : ""
                  }
                </header>`
              : ""
          }

          <div class="tic-section-body">
            ${options.content || ""}
          </div>
        </section>
      `;
    },

    grid(content = "", options = {}) {
      const columns = Number(options.columns) || 2;

      return `
        <div
          class="${escapeAttribute(
            classNames(
              "tic-grid",
              `tic-grid-${columns}`,
              options.className
            )
          )}"
          ${attributes(options.attributes || {})}
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

      const extraAttributes = {
        ...(options.attributes || {})
      };

      if (tag === "a") {
        extraAttributes.href =
          options.href ||
          `#${options.route || ""}`;
      }

      if (tag === "button") {
        extraAttributes.type = "button";
      }

      return `
        <${tag}
          class="${escapeAttribute(
            classNames(
              "tic-card",
              options.interactive
                ? "tic-card-interactive"
                : "",
              options.className
            )
          )}"
          ${actionAttributes(options)}
          ${attributes(extraAttributes)}
        >
          ${
            options.media
              ? `<div class="tic-card-media">
                  ${options.media}
                </div>`
              : ""
          }

          <div class="tic-card-body">
            ${
              options.icon ||
              options.badge ||
              options.meta
                ? `<div class="tic-feature-row">
                    ${
                      options.icon
                        ? `<div class="tic-feature-icon">
                            ${icon(options.icon)}
                          </div>`
                        : ""
                    }

                    <div>
                      ${
                        options.badge
                          ? this.badge(
                              options.badge,
                              options.badgeTone ||
                                "neutral"
                            )
                          : ""
                      }

                      ${
                        options.meta
                          ? `<span class="tic-card-meta">
                              ${escapeHTML(
                                options.meta
                              )}
                            </span>`
                          : ""
                      }
                    </div>
                  </div>`
                : ""
            }

            ${
              options.title
                ? `<h3 class="tic-card-title">
                    ${escapeHTML(options.title)}
                  </h3>`
                : ""
            }

            ${
              options.description
                ? `<p class="tic-card-text">
                    ${escapeHTML(
                      options.description
                    )}
                  </p>`
                : ""
            }

            ${
              options.body
                ? `<div class="tic-card-content">
                    ${options.body}
                  </div>`
                : ""
            }

            ${
              options.footer ||
              options.trailing
                ? `<footer class="tic-card-footer">
                    <div>
                      ${options.footer || ""}
                    </div>

                    ${
                      options.trailing
                        ? `<div>
                            ${options.trailing}
                          </div>`
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
      return `
        <article class="${escapeAttribute(
          classNames(
            "tic-stat-card",
            options.className
          )
        )}">
          ${
            options.icon
              ? `<div class="tic-stat-icon">
                  ${icon(options.icon)}
                </div>`
              : ""
          }

          <strong class="tic-stat-value">
            ${escapeHTML(options.value ?? "—")}
          </strong>

          <span class="tic-stat-label">
            ${escapeHTML(options.label || "")}
          </span>

          ${
            options.subtitle
              ? `<small class="tic-card-text">
                  ${escapeHTML(options.subtitle)}
                </small>`
              : ""
          }
        </article>
      `;
    },

    button(options = {}) {
      if (typeof options === "string") {
        options = { label: options };
      }

      const tag = options.href ? "a" : "button";
      const extraAttributes = {
        ...(options.attributes || {})
      };

      if (tag === "button") {
        extraAttributes.type =
          options.type || "button";
      } else {
        extraAttributes.href = options.href;
      }

      if (options.name) {
        extraAttributes.name = options.name;
      }

      if (options.value !== undefined) {
        extraAttributes.value = options.value;
      }

      return `
        <${tag}
          class="${escapeAttribute(
            classNames(
              "tic-btn",
              options.primary
                ? "tic-btn-primary"
                : options.danger
                  ? "tic-btn-danger"
                  : options.soft
                    ? "tic-btn-soft"
                    : "tic-btn-secondary",
              options.block
                ? "tic-btn-block"
                : "",
              options.className
            )
          )}"
          ${actionAttributes(options)}
          ${attributes(extraAttributes)}
        >
          ${icon(options.icon)}
          <span>${escapeHTML(options.label || "")}</span>
          ${icon(options.trailingIcon)}
        </${tag}>
      `;
    },

    iconButton(options = {}) {
      return `
        <button
          type="button"
          class="${escapeAttribute(
            classNames(
              "tic-icon-btn",
              options.className
            )
          )}"
          ${actionAttributes(options)}
          aria-label="${escapeAttribute(
            options.ariaLabel ||
            options.label ||
            "إجراء"
          )}"
        >
          ${icon(options.icon || "•")}
        </button>
      `;
    },

    badge(label, tone = "neutral", options = {}) {
      const toneClass = {
        success: "tic-chip-success",
        warning: "tic-chip-warning",
        danger: "tic-chip-danger",
        error: "tic-chip-danger",
        info: "tic-chip-info"
      }[tone] || "";

      return `
        <span
          class="${escapeAttribute(
            classNames(
              "tic-chip",
              toneClass,
              options.className
            )
          )}"
          ${attributes(options.attributes || {})}
        >
          ${icon(options.icon)}
          <span>${escapeHTML(label)}</span>
        </span>
      `;
    },

    status(label, options = {}) {
      const value = normalizeText(
        options.value || label
      ).toLowerCase();

      let tone = options.tone || "neutral";

      if (
        [
          "success",
          "approved",
          "ready",
          "completed",
          "active"
        ].includes(value)
      ) {
        tone = "success";
      } else if (
        [
          "warning",
          "pending",
          "review",
          "attention"
        ].includes(value)
      ) {
        tone = "warning";
      } else if (
        [
          "danger",
          "error",
          "rejected",
          "overdue"
        ].includes(value)
      ) {
        tone = "danger";
      } else if (value === "info") {
        tone = "info";
      }

      return this.badge(label, tone, {
        icon: options.icon,
        className: options.className
      });
    },

    progress(value = 0, options = {}) {
      const percentage = clamp(value);

      return `
        <div
          class="${escapeAttribute(
            classNames(
              "tic-progress-wrap",
              options.className
            )
          )}"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${percentage}"
        >
          ${
            options.label ||
            options.showValue !== false
              ? `<div class="tic-feature-row">
                  <span class="tic-card-text">
                    ${escapeHTML(
                      options.label || "التقدم"
                    )}
                  </span>

                  ${
                    options.showValue === false
                      ? ""
                      : `<strong>
                          ${percentage}%
                        </strong>`
                  }
                </div>`
              : ""
          }

          <div class="tic-progress">
            <span
              class="tic-progress-bar"
              style="width:${percentage}%"
            ></span>
          </div>

          ${
            options.hint
              ? `<small class="tic-card-text">
                  ${escapeHTML(options.hint)}
                </small>`
              : ""
          }
        </div>
      `;
    },

    info(label, value, options = {}) {
      return `
        <div class="${escapeAttribute(
          classNames(
            "tic-info-box",
            options.className
          )
        )}">
          <small>
            ${icon(options.icon)}
            ${escapeHTML(label)}
          </small>

          <strong>
            ${escapeHTML(value ?? "—")}
          </strong>
        </div>
      `;
    },

    divider(options = {}) {
      return `
        <hr
          class="${escapeAttribute(
            classNames(
              "tic-divider",
              options.className
            )
          )}"
          ${attributes(options.attributes || {})}
        >
      `;
    },

    empty(options = {}) {
      return `
        <section class="${escapeAttribute(
          classNames(
            "tic-empty-state",
            options.className
          )
        )}">
          <div class="tic-empty-icon" aria-hidden="true">
            ${escapeHTML(options.icon || "✦")}
          </div>

          <h3>
            ${escapeHTML(
              options.title || "لا توجد بيانات"
            )}
          </h3>

          ${
            options.message
              ? `<p>
                  ${escapeHTML(options.message)}
                </p>`
              : ""
          }

          ${
            options.action
              ? this.button({
                  ...options.action,
                  primary:
                    options.action.primary !== false
                })
              : ""
          }
        </section>
      `;
    },

    list(items = [], options = {}) {
      if (!Array.isArray(items) || !items.length) {
        return options.empty
          ? this.empty(options.empty)
          : "";
      }

      return `
        <div class="${escapeAttribute(
          classNames(
            "tic-settings-list",
            options.className
          )
        )}">
          ${items
            .map((item, index) => {
              if (typeof item === "string") {
                item = { title: item };
              }

              const interactive =
                item.action ||
                item.route ||
                item.href;

              const tag = interactive
                ? item.href
                  ? "a"
                  : "button"
                : "div";

              const extraAttributes =
                tag === "button"
                  ? { type: "button" }
                  : tag === "a"
                    ? {
                        href:
                          item.href ||
                          `#${item.route || ""}`
                      }
                    : {};

              return `
                <${tag}
                  class="${escapeAttribute(
                    classNames(
                      "tic-settings-item",
                      item.className
                    )
                  )}"
                  ${actionAttributes(item)}
                  ${attributes(extraAttributes)}
                  data-index="${index}"
                >
                  <div class="tic-settings-item-main">
                    ${
                      item.icon
                        ? `<div class="tic-settings-icon">
                            ${icon(item.icon)}
                          </div>`
                        : ""
                    }

                    <div class="tic-settings-copy">
                      <strong>
                        ${escapeHTML(
                          item.title || ""
                        )}
                      </strong>

                      ${
                        item.subtitle
                          ? `<small>
                              ${escapeHTML(
                                item.subtitle
                              )}
                            </small>`
                          : ""
                      }
                    </div>
                  </div>

                  ${
                    item.trailing
                      ? item.trailing
                      : item.badge
                        ? this.badge(
                            item.badge,
                            item.badgeTone ||
                              "neutral"
                          )
                        : interactive
                          ? `<span aria-hidden="true">‹</span>`
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
      return `
        <div class="${escapeAttribute(
          classNames(
            "tic-quick-actions",
            options.className
          )
        )}">
          ${items
            .map(
              (item) => `
                <button
                  type="button"
                  class="tic-action-card"
                  ${actionAttributes(item)}
                >
                  <div class="tic-action-card-icon">
                    ${icon(item.icon || "✦")}
                  </div>

                  <h3>
                    ${escapeHTML(item.title || "")}
                  </h3>

                  ${
                    item.description
                      ? `<p>
                          ${escapeHTML(
                            item.description
                          )}
                        </p>`
                      : ""
                  }
                </button>
              `
            )
            .join("")}
        </div>
      `;
    },

    timeline(items = [], options = {}) {
      if (!Array.isArray(items) || !items.length) {
        return this.empty(
          options.empty || {
            title: "لا يوجد تسلسل زمني",
            message:
              "ستظهر التحديثات هنا عند توفرها."
          }
        );
      }

      return `
        <div class="${escapeAttribute(
          classNames(
            "tic-timeline",
            options.className
          )
        )}">
          ${items
            .map(
              (item, index) => `
                <article class="tic-card tic-card-body">
                  <div class="tic-feature-row">
                    <div class="tic-feature-icon">
                      ${escapeHTML(
                        item.icon ||
                        (item.completed
                          ? "✓"
                          : index + 1)
                      )}
                    </div>

                    <div>
                      <h3 class="tic-card-title">
                        ${escapeHTML(
                          item.title || ""
                        )}
                      </h3>

                      ${
                        item.date
                          ? `<small class="tic-card-text">
                              ${escapeHTML(
                                item.date
                              )}
                            </small>`
                          : ""
                      }
                    </div>
                  </div>

                  ${
                    item.description
                      ? `<p class="tic-card-text">
                          ${escapeHTML(
                            item.description
                          )}
                        </p>`
                      : ""
                  }
                </article>
              `
            )
            .join("")}
        </div>
      `;
    },

    field(fieldDefinition = {}) {
      const field = normalizeField(fieldDefinition);
      const fieldId =
        field.attributes.id ||
        `field-${field.name}`;

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
        inputmode:
          field.inputMode || undefined,
        ...field.attributes
      };

      let control = "";

      if (field.type === "textarea") {
        control = `
          <textarea
            class="tic-textarea"
            rows="${escapeAttribute(field.rows)}"
            ${attributes(commonAttributes)}
          >${escapeHTML(field.value)}</textarea>
        `;
      } else if (field.type === "select") {
        control = `
          <select
            class="tic-select"
            ${attributes(commonAttributes)}
          >
            ${
              field.placeholder
                ? `<option value="">
                    ${escapeHTML(
                      field.placeholder
                    )}
                  </option>`
                : ""
            }

            ${field.options
              .map((option) => {
                const normalized = isObject(option)
                  ? option
                  : {
                      label: option,
                      value: option
                    };

                const selected =
                  String(normalized.value) ===
                  String(field.value);

                return `
                  <option
                    value="${escapeAttribute(
                      normalized.value
                    )}"
                    ${selected ? "selected" : ""}
                  >
                    ${escapeHTML(
                      normalized.label
                    )}
                  </option>
                `;
              })
              .join("")}
          </select>
        `;
      } else if (
        field.type === "checkbox" ||
        field.type === "radio"
      ) {
        control = `
          <label class="tic-choice">
            <input
              type="${escapeAttribute(field.type)}"
              value="${escapeAttribute(
                field.value || "1"
              )}"
              ${attributes(commonAttributes)}
              ${field.checked ? "checked" : ""}
            >
            <span>${escapeHTML(field.label)}</span>
          </label>
        `;
      } else {
        control = `
          <input
            class="tic-input"
            type="${escapeAttribute(field.type)}"
            value="${escapeAttribute(field.value)}"
            ${attributes(commonAttributes)}
          >
        `;
      }

      if (
        field.type === "checkbox" ||
        field.type === "radio"
      ) {
        return `
          <div class="${escapeAttribute(
            classNames(
              "tic-field",
              field.error ? "has-error" : "",
              field.className
            )
          )}">
            ${control}

            ${
              field.hint
                ? `<small class="tic-field-hint">
                    ${escapeHTML(field.hint)}
                  </small>`
                : ""
            }

            ${
              field.error
                ? `<small class="tic-form-message" data-type="error">
                    ${escapeHTML(field.error)}
                  </small>`
                : ""
            }
          </div>
        `;
      }

      return `
        <div class="${escapeAttribute(
          classNames(
            "tic-field",
            field.error ? "has-error" : "",
            field.className
          )
        )}">
          <label for="${escapeAttribute(fieldId)}">
            ${escapeHTML(field.label)}
            ${
              field.required
                ? `<span>*</span>`
                : ""
            }
          </label>

          ${control}

          ${
            field.hint
              ? `<small class="tic-field-hint">
                  ${escapeHTML(field.hint)}
                </small>`
              : ""
          }

          ${
            field.error
              ? `<small class="tic-form-message" data-type="error">
                  ${escapeHTML(field.error)}
                </small>`
              : ""
          }
        </div>
      `;
    },

    form(options = {}) {
      const fields = Array.isArray(options.fields)
        ? options.fields
        : [];

      const actions =
        Array.isArray(options.actions) &&
        options.actions.length
          ? options.actions
          : [
              {
                label:
                  options.submitLabel || "حفظ",
                type: "submit",
                primary: true
              }
            ];

      return `
        <form
          class="${escapeAttribute(
            classNames(
              "tic-form",
              options.className
            )
          )}"
          ${attributes({
            id: options.id,
            "data-form": options.name,
            novalidate:
              options.noValidate === true
          })}
        >
          ${
            options.title ||
            options.subtitle
              ? `<header>
                  ${
                    options.title
                      ? `<h2 class="tic-title">
                          ${escapeHTML(
                            options.title
                          )}
                        </h2>`
                      : ""
                  }

                  ${
                    options.subtitle
                      ? `<p class="tic-subtitle">
                          ${escapeHTML(
                            options.subtitle
                          )}
                        </p>`
                      : ""
                  }
                </header>`
              : ""
          }

          <div class="tic-form-grid">
            ${fields
              .map((field) => this.field(field))
              .join("")}
          </div>

          <footer class="tic-modal-footer">
            ${actions
              .map((action) =>
                this.button(action)
              )
              .join("")}
          </footer>
        </form>
      `;
    },

    serializeForm(form) {
      const element =
        typeof form === "string"
          ? document.querySelector(form)
          : form;

      if (
        !element ||
        !(
          element instanceof
          window.HTMLFormElement
        )
      ) {
        return {};
      }

      const formData =
        new window.FormData(element);

      const result = {};

      for (const [key, value] of formData.entries()) {
        if (
          Object.prototype.hasOwnProperty.call(
            result,
            key
          )
        ) {
          result[key] = toArray(result[key]);
          result[key].push(value);
        } else {
          result[key] = value;
        }
      }

      element
        .querySelectorAll(
          'input[type="checkbox"][name]'
        )
        .forEach((input) => {
          if (!formData.has(input.name)) {
            result[input.name] = false;
          } else if (
            ["1", "true", "on"].includes(
              input.value
            )
          ) {
            result[input.name] = true;
          }
        });

      return result;
    },

    setFieldError(field, message = "") {
      const element =
        typeof field === "string"
          ? document.querySelector(field)
          : field;

      if (!element) return false;

      const wrapper =
        element.closest(".tic-field");

      if (!wrapper) return false;

      let errorElement =
        wrapper.querySelector(
          ".tic-form-message[data-type='error']"
        );

      if (!message) {
        wrapper.classList.remove("has-error");
        errorElement?.remove();
        element.removeAttribute("aria-invalid");
        return true;
      }

      wrapper.classList.add("has-error");
      element.setAttribute(
        "aria-invalid",
        "true"
      );

      if (!errorElement) {
        errorElement =
          document.createElement("small");

        errorElement.className =
          "tic-form-message";

        errorElement.setAttribute(
          "data-type",
          "error"
        );

        wrapper.appendChild(errorElement);
      }

      errorElement.textContent = message;

      return true;
    },

    clearFormErrors(form) {
      const element =
        typeof form === "string"
          ? document.querySelector(form)
          : form;

      if (!element) return false;

      element
        .querySelectorAll(".tic-field.has-error")
        .forEach((field) => {
          field.classList.remove("has-error");
        });

      element
        .querySelectorAll(
          ".tic-form-message[data-type='error']"
        )
        .forEach((error) => error.remove());

      element
        .querySelectorAll(
          "[aria-invalid='true']"
        )
        .forEach((control) => {
          control.removeAttribute(
            "aria-invalid"
          );
        });

      return true;
    },

    toast(message, type = "info", options = {}) {
      this.init();

      const toastId =
        options.id ||
        `toast-${++state.toastCounter}`;

      const root = ensureRoot("toast");

      const tone = [
        "success",
        "error",
        "warning",
        "info"
      ].includes(type)
        ? type
        : "info";

      const duration =
        options.persistent === true
          ? 0
          : Number(options.duration) ||
            TOAST_DURATION;

      const iconMap = {
        success: "✓",
        error: "!",
        warning: "!",
        info: "i"
      };

      const element =
        document.createElement("div");

      element.className = classNames(
        "tic-toast",
        options.className
      );

      element.setAttribute(
        "data-toast-id",
        toastId
      );

      element.setAttribute(
        "role",
        tone === "error" ? "alert" : "status"
      );

      element.innerHTML = `
        <div class="tic-feature-row">
          <span aria-hidden="true">
            ${escapeHTML(iconMap[tone])}
          </span>

          <div>
            ${
              options.title
                ? `<strong>
                    ${escapeHTML(
                      options.title
                    )}
                  </strong>`
                : ""
            }

            <p>
              ${escapeHTML(message)}
            </p>
          </div>

          ${
            options.dismissible === false
              ? ""
              : `<button
                  type="button"
                  data-toast-dismiss="${escapeAttribute(
                    toastId
                  )}"
                  aria-label="إغلاق التنبيه"
                >×</button>`
          }
        </div>
      `;

      root.appendChild(element);

      let timeoutId = null;

      if (duration > 0) {
        timeoutId = window.setTimeout(() => {
          this.dismissToast(toastId);
        }, duration);
      }

      state.toasts.set(toastId, {
        element,
        timeoutId
      });

      emit("toast-opened", {
        toastId,
        type: tone,
        message
      });

      return toastId;
    },

    dismissToast(toastId) {
      const entry = state.toasts.get(toastId);
      if (!entry) return false;

      window.clearTimeout(entry.timeoutId);

      entry.element.classList.add(
        "is-closing"
      );

      window.setTimeout(() => {
        entry.element.remove();
        state.toasts.delete(toastId);

        emit("toast-closed", {
          toastId
        });
      }, 180);

      return true;
    },

    dismissAllToasts() {
      Array.from(state.toasts.keys()).forEach(
        (toastId) => {
          this.dismissToast(toastId);
        }
      );
    },

    alert(options = {}) {
      const normalized =
        typeof options === "string"
          ? { message: options }
          : options;

      return this.dialog({
        title:
          normalized.title || "تنبيه",
        message:
          normalized.message || "",
        icon:
          normalized.icon || "i",
        actions: [
          {
            label:
              normalized.confirmLabel ||
              "حسناً",
            result: true,
            primary: true
          }
        ],
        closeOnBackdrop:
          normalized.closeOnBackdrop !== false
      });
    },

    confirm(options = {}) {
      const normalized =
        typeof options === "string"
          ? { message: options }
          : options;

      return this.dialog({
        title:
          normalized.title ||
          "تأكيد الإجراء",
        message:
          normalized.message ||
          "هل تريد المتابعة؟",
        icon:
          normalized.icon || "؟",
        actions: [
          {
            label:
              normalized.cancelLabel ||
              "إلغاء",
            result: false
          },
          {
            label:
              normalized.confirmLabel ||
              "تأكيد",
            result: true,
            primary: true,
            danger:
              normalized.danger === true
          }
        ],
        closeOnBackdrop:
          normalized.closeOnBackdrop !== false
      });
    },

    dialog(options = {}) {
      this.init();

      const dialogId =
        options.id ||
        `dialog-${++state.dialogCounter}`;

      const root = ensureRoot("dialog");
      const element =
        document.createElement("div");

      const actions =
        Array.isArray(options.actions) &&
        options.actions.length
          ? options.actions
          : [
              {
                label: "إغلاق",
                result: true,
                primary: true
              }
            ];

      element.className = "tic-modal";

      element.setAttribute(
        "data-dialog-backdrop",
        dialogId
      );

      element.setAttribute(
        "data-close-on-backdrop",
        options.closeOnBackdrop === false
          ? "false"
          : "true"
      );

      element.innerHTML = `
        <section
          class="tic-modal-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="${escapeAttribute(
            `${dialogId}-title`
          )}"
        >
          <header class="tic-modal-header">
            <div class="tic-feature-row">
              ${
                options.icon
                  ? `<div class="tic-feature-icon">
                      ${escapeHTML(
                        options.icon
                      )}
                    </div>`
                  : ""
              }

              <div>
                <h2 id="${escapeAttribute(
                  `${dialogId}-title`
                )}">
                  ${escapeHTML(
                    options.title || "تنبيه"
                  )}
                </h2>

                ${
                  options.subtitle
                    ? `<p class="tic-card-text">
                        ${escapeHTML(
                          options.subtitle
                        )}
                      </p>`
                    : ""
                }
              </div>
            </div>

            ${
              options.showClose === false
                ? ""
                : `<button
                    type="button"
                    class="tic-modal-close"
                    data-dialog-close="${escapeAttribute(
                      dialogId
                    )}"
                    aria-label="إغلاق النافذة"
                  >×</button>`
            }
          </header>

          <div class="tic-modal-body">
            ${
              options.content !== undefined
                ? String(options.content)
                : `<p class="tic-card-text">
                    ${escapeHTML(
                      options.message || ""
                    )}
                  </p>`
            }
          </div>

          <footer class="tic-modal-footer">
            ${actions
              .map((action) =>
                this.button({
                  label:
                    action.label || "إغلاق",
                  icon: action.icon,
                  primary: action.primary,
                  danger: action.danger,
                  disabled: action.disabled,
                  attributes: {
                    "data-dialog-close":
                      dialogId,
                    "data-result": String(
                      action.result
                    )
                  }
                })
              )
              .join("")}
          </footer>
        </section>
      `;

      root.appendChild(element);
      document.body.classList.add(
        "tic-modal-open"
      );

      return new Promise((resolve) => {
        state.dialogs.set(dialogId, {
          element,
          resolve
        });

        window.requestAnimationFrame(() => {
          focusFirst(element);
        });

        emit("dialog-opened", {
          dialogId,
          title:
            options.title || "تنبيه"
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

    showLoader(
      message = "جاري التحميل...",
      options = {}
    ) {
      this.init();

      state.loadingCount += 1;

      const root = ensureRoot("loader");

      root.innerHTML = `
        <div class="tic-modal" role="status">
          <div class="tic-modal-panel">
            <div class="tic-loading">
              <div class="tic-spinner"></div>

              <strong>
                ${escapeHTML(
                  options.title || "لحظات..."
                )}
              </strong>

              <p class="tic-card-text">
                ${escapeHTML(message)}
              </p>
            </div>
          </div>
        </div>
      `;

      emit("loader-shown", {
        message,
        count: state.loadingCount
      });

      return state.loadingCount;
    },

    hideLoader(force = false) {
      state.loadingCount = force
        ? 0
        : Math.max(
            0,
            state.loadingCount - 1
          );

      if (state.loadingCount === 0) {
        const root = ensureRoot("loader");
        root.innerHTML = "";
      }

      emit("loader-hidden", {
        count: state.loadingCount
      });

      return state.loadingCount;
    },

    async withLoader(
      task,
      message = "جاري التحميل...",
      options = {}
    ) {
      if (typeof task !== "function") {
        throw new TypeError(
          "TIC UI Error: withLoader requires a function."
        );
      }

      this.showLoader(message, options);

      try {
        return await task();
      } finally {
        this.hideLoader();
      }
    },

    skeleton(options = {}) {
      const lines =
        Number(options.lines) || 3;

      return `
        <div class="${escapeAttribute(
          classNames(
            "tic-card tic-card-body",
            options.className
          )
        )}" aria-hidden="true">
          ${Array.from(
            { length: lines },
            (_, index) => `
              <span
                style="
                  display:block;
                  width:${
                    index === lines - 1
                      ? "62"
                      : "100"
                  }%;
                  height:14px;
                  margin-top:${
                    index ? "10px" : "0"
                  };
                  border-radius:999px;
                  background:#e8edf3;
                "
              ></span>
            `
          ).join("")}
        </div>
      `;
    },

    currency(value, options = {}) {
      const amount = Number(value) || 0;

      try {
        return new Intl.NumberFormat(
          options.locale || LOCALE,
          {
            style: "currency",
            currency:
              options.currency || CURRENCY,
            minimumFractionDigits:
              options.minimumFractionDigits ??
              0,
            maximumFractionDigits:
              options.maximumFractionDigits ??
              2
          }
        ).format(amount);
      } catch (error) {
        return `${amount.toLocaleString()} ${
          options.currency || CURRENCY
        }`;
      }
    },

    number(value, options = {}) {
      const amount = Number(value) || 0;

      try {
        return new Intl.NumberFormat(
          options.locale || LOCALE,
          options
        ).format(amount);
      } catch (error) {
        return String(amount);
      }
    },

    date(value, options = {}) {
      if (!value) return "—";

      const date =
        value instanceof Date
          ? value
          : new Date(value);

      if (Number.isNaN(date.getTime())) {
        return String(value);
      }

      try {
        return new Intl.DateTimeFormat(
          options.locale || LOCALE,
          {
            day: "numeric",
            month: "short",
            year: "numeric",
            ...options
          }
        ).format(date);
      } catch (error) {
        return date.toLocaleDateString();
      }
    },

    relativeTime(value, options = {}) {
      if (!value) return "—";

      const date =
        value instanceof Date
          ? value
          : new Date(value);

      if (Number.isNaN(date.getTime())) {
        return String(value);
      }

      const diff =
        date.getTime() - Date.now();

      const units = [
        ["year", 31536000000],
        ["month", 2592000000],
        ["week", 604800000],
        ["day", 86400000],
        ["hour", 3600000],
        ["minute", 60000],
        ["second", 1000]
      ];

      const formatter =
        new Intl.RelativeTimeFormat(
          options.locale || LOCALE,
          { numeric: "auto" }
        );

      for (const [unit, milliseconds] of units) {
        if (
          Math.abs(diff) >= milliseconds ||
          unit === "second"
        ) {
          return formatter.format(
            Math.round(diff / milliseconds),
            unit
          );
        }
      }

      return "الآن";
    },

    truncate(value, length = 120) {
      const text = String(value ?? "");

      if (text.length <= length) {
        return text;
      }

      return `${text
        .slice(0, length)
        .trim()}…`;
    },

    route(routeName, options = {}) {
      const router = getRouter();

      if (
        !router ||
        typeof router.go !== "function"
      ) {
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
        actionCount: state.actions.size,
        subscriberCount:
          state.subscribers.size,
        activeToastCount:
          state.toasts.size,
        activeDialogCount:
          state.dialogs.size,
        locale: LOCALE,
        currency: CURRENCY
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
