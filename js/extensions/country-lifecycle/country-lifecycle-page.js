/* =========================================================
   Travel Intelligence Center
   Country Lifecycle Page V1.0.0
   Country Lifecycle System - Guide Page UI Module

   File Path:
   js/extensions/country-lifecycle/country-lifecycle-page.js

   Purpose:
   - Renders the Country Lifecycle interface as a separate module.
   - Preserves frozen legacy Guide files without direct modification.
   - Connects to CountryLifecycleController and Engine.
   - Supports Wishlist, Upcoming, Active and Passport views.
   - Provides lightweight mobile-first RTL rendering.
   - Handles delegated actions with duplicate-listener guards.
   - Avoids refresh while scrolling, dragging or typing.
   - Exposes mount, refresh and unmount APIs.
   ========================================================= */

(function countryLifecyclePageBootstrap(global) {
  'use strict';

  if (!global || global.CountryLifecyclePage?.__initialized) {
    return;
  }

  const VERSION = '1.0.0';

  const SELECTOR = Object.freeze({
    ROOT: '[data-country-lifecycle-root]',
    VIEW_BUTTON: '[data-cl-view]',
    SEARCH: '[data-cl-search]',
    COUNTRY_CARD: '[data-cl-country-id]',
    ACTION: '[data-cl-action]',
    MODAL: '[data-cl-modal]',
    MODAL_CLOSE: '[data-cl-modal-close]',
    FORM: '[data-cl-form]',
    ITINERARY_INPUT: '[data-cl-itinerary-input]'
  });

  const VIEW_META = Object.freeze({
    wishlist: {
      label: 'الأمنيات',
      icon: '❤️',
      emptyTitle: 'لا توجد دول في الأمنيات',
      emptyText: 'أضف دولة ترغب في زيارتها لاحقًا.'
    },
    upcoming: {
      label: 'الرحلات القادمة',
      icon: '✈️',
      emptyTitle: 'لا توجد رحلة قادمة',
      emptyText: 'حوّل دولة من الأمنيات إلى رحلة قادمة.'
    },
    active: {
      label: 'الرحلة النشطة',
      icon: '🚀',
      emptyTitle: 'لا توجد رحلة نشطة',
      emptyText: 'تظهر الرحلة هنا تلقائيًا عند بدء تاريخها.'
    },
    completed: {
      label: 'جواز السفر',
      icon: '📚',
      emptyTitle: 'جواز السفر فارغ',
      emptyText: 'الرحلات المكتملة ستظهر هنا تلقائيًا.'
    },
    all: {
      label: 'كل الدول',
      icon: '🌍',
      emptyTitle: 'لا توجد دول محفوظة',
      emptyText: 'ابدأ بإضافة أول دولة إلى مركز السفر.'
    }
  });

  const runtime = {
    mounted: false,
    destroyed: false,
    root: null,
    controller: null,
    state: null,
    listeners: [],
    renderTimer: 0,
    interactionTimer: 0,
    deferredReason: '',
    isScrolling: false,
    isTyping: false,
    isPointerDown: false,
    lastRenderAt: 0,
    renderRevision: 0
  };

  function asString(value, fallback = '') {
    if (value === undefined || value === null) {
      return fallback;
    }

    return String(value).trim();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function escapeHTML(value) {
    return asString(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(value) {
    return escapeHTML(value).replace(/`/g, '&#096;');
  }

  function formatCurrency(amount, currency = 'AED') {
    const number = Number(amount) || 0;

    try {
      return new Intl.NumberFormat('ar-AE', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0
      }).format(number);
    } catch (_) {
      return `${Math.round(number).toLocaleString('ar-AE')} ${currency}`;
    }
  }

  function formatDate(value) {
    if (!value) {
      return 'غير محدد';
    }

    const date = new Date(`${value}T12:00:00`);

    if (Number.isNaN(date.getTime())) {
      return escapeHTML(value);
    }

    try {
      return new Intl.DateTimeFormat('ar-AE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }).format(date);
    } catch (_) {
      return value;
    }
  }

  function pluralDays(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return '';
    }

    if (number === 0) {
      return 'اليوم';
    }

    if (number === 1) {
      return 'باقي يوم واحد';
    }

    if (number === 2) {
      return 'باقي يومان';
    }

    if (number > 2 && number <= 10) {
      return `باقي ${number} أيام`;
    }

    return `باقي ${number} يومًا`;
  }

  function getController() {
    return global.CountryLifecycleController || null;
  }

  function getModel() {
    return global.CountryLifecycleModel || null;
  }

  function canRenderNow() {
    return !runtime.isScrolling &&
      !runtime.isTyping &&
      !runtime.isPointerDown;
  }

  function scheduleRender(reason = 'update', delay = 40) {
    runtime.deferredReason = reason;

    global.clearTimeout(runtime.renderTimer);

    runtime.renderTimer = global.setTimeout(() => {
      runtime.renderTimer = 0;

      if (!runtime.mounted || runtime.destroyed) {
        return;
      }

      if (!canRenderNow()) {
        scheduleRender(reason, 120);
        return;
      }

      render(reason);
    }, delay);
  }

  function iconForStatus(status) {
    return VIEW_META[status]?.icon || '🌍';
  }

  function statusLabel(status) {
    return VIEW_META[status]?.label || 'الدولة';
  }

  function getCountryImage(country) {
    return asString(
      country?.cover?.image ||
      country?.image ||
      ''
    );
  }

  function renderHeader(state) {
    const current = VIEW_META[state.selectedView] || VIEW_META.wishlist;

    return `
      <section class="cl-hero" aria-labelledby="cl-page-title">
        <div class="cl-hero__content">
          <span class="cl-hero__eyebrow">مركز دورة حياة الدولة</span>
          <h1 class="cl-hero__title" id="cl-page-title">
            ${current.icon} ${current.label}
          </h1>
          <p class="cl-hero__subtitle">
            دولة واحدة تنتقل من الأمنية إلى الرحلة ثم جواز السفر دون تكرار البيانات.
          </p>
        </div>

        <button
          class="cl-button cl-button--primary"
          type="button"
          data-cl-action="open-create"
          aria-label="إضافة دولة"
        >
          <span aria-hidden="true">＋</span>
          <span>إضافة دولة</span>
        </button>
      </section>
    `;
  }

  function renderTabs(state) {
    const views = ['wishlist', 'upcoming', 'active', 'completed'];

    return `
      <nav class="cl-tabs" aria-label="أقسام الدول">
        ${views.map((view) => {
          const meta = VIEW_META[view];
          const active = state.selectedView === view;

          return `
            <button
              class="cl-tab${active ? ' is-active' : ''}"
              type="button"
              data-cl-view="${view}"
              aria-selected="${active ? 'true' : 'false'}"
            >
              <span class="cl-tab__icon" aria-hidden="true">${meta.icon}</span>
              <span>${meta.label}</span>
            </button>
          `;
        }).join('')}
      </nav>
    `;
  }

  function renderSearch(state) {
    return `
      <section class="cl-toolbar" aria-label="أدوات البحث">
        <label class="cl-search">
          <span class="cl-search__icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            inputmode="search"
            autocomplete="off"
            placeholder="ابحث عن دولة..."
            value="${escapeAttr(state.query || '')}"
            data-cl-search
            aria-label="البحث عن دولة"
          />
        </label>

        <button
          class="cl-button cl-button--ghost"
          type="button"
          data-cl-view="all"
        >
          كل الدول
        </button>
      </section>
    `;
  }

  function renderCountryMeta(country, summary) {
    const pieces = [];

    if (country.city) {
      pieces.push(`<span>📍 ${escapeHTML(country.city)}</span>`);
    }

    if (country.dates?.startDate) {
      pieces.push(
        `<span>🗓️ ${formatDate(country.dates.startDate)}</span>`
      );
    }

    if (country.travelers) {
      pieces.push(
        `<span>👥 ${Number(country.travelers)} مسافر</span>`
      );
    }

    if (country.budget?.planned || country.estimatedBudget) {
      pieces.push(
        `<span>💳 ${formatCurrency(
          country.budget?.planned || country.estimatedBudget,
          country.budget?.currency || country.currency
        )}</span>`
      );
    }

    if (
      summary?.countdown !== null &&
      summary?.countdown !== undefined &&
      summary.countdown >= 0
    ) {
      pieces.push(
        `<span>⏳ ${pluralDays(summary.countdown)}</span>`
      );
    }

    return pieces.join('');
  }

  function renderProgress(summary, status) {
    if (!summary) {
      return '';
    }

    if (status === 'upcoming') {
      const readiness = Number(summary.checklistReadiness) || 0;

      return `
        <div class="cl-progress">
          <div class="cl-progress__head">
            <span>الجاهزية</span>
            <strong>${readiness}%</strong>
          </div>
          <div class="cl-progress__track" aria-hidden="true">
            <span style="width:${Math.min(100, Math.max(0, readiness))}%"></span>
          </div>
        </div>
      `;
    }

    if (status === 'active') {
      const progress = summary.tripProgress || {};
      const percentage = Number(progress.percentage) || 0;

      return `
        <div class="cl-progress">
          <div class="cl-progress__head">
            <span>تقدم الرحلة</span>
            <strong>
              ${Number(progress.handled) || 0}
              من
              ${Number(progress.total) || 0}
            </strong>
          </div>
          <div class="cl-progress__track" aria-hidden="true">
            <span style="width:${Math.min(100, Math.max(0, percentage))}%"></span>
          </div>
        </div>
      `;
    }

    return '';
  }

  function renderCardActions(country) {
    const actions = [];

    actions.push(`
      <button
        type="button"
        class="cl-card-action"
        data-cl-action="open-country"
        data-cl-country-id="${escapeAttr(country.id)}"
      >
        فتح
      </button>
    `);

    if (country.status === 'wishlist') {
      actions.push(`
        <button
          type="button"
          class="cl-card-action cl-card-action--accent"
          data-cl-action="open-convert"
          data-cl-country-id="${escapeAttr(country.id)}"
        >
          تحويل إلى رحلة
        </button>
      `);
    }

    if (country.status === 'upcoming') {
      actions.push(`
        <button
          type="button"
          class="cl-card-action cl-card-action--accent"
          data-cl-action="activate"
          data-cl-country-id="${escapeAttr(country.id)}"
        >
          بدء الرحلة
        </button>
      `);
    }

    if (country.status === 'active') {
      actions.push(`
        <button
          type="button"
          class="cl-card-action cl-card-action--accent"
          data-cl-action="complete"
          data-cl-country-id="${escapeAttr(country.id)}"
        >
          إنهاء الرحلة
        </button>
      `);
    }

    return actions.join('');
  }

  function renderCountryCard(country) {
    const controller = runtime.controller;
    const summary = controller?.getCountrySummary?.(country.id);
    const image = getCountryImage(country);
    const title = country.localizedName || country.name || 'دولة';
    const status = country.status || 'wishlist';

    return `
      <article
        class="cl-country-card"
        data-cl-country-id="${escapeAttr(country.id)}"
      >
        <div class="cl-country-card__cover">
          ${
            image
              ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(title)}" loading="lazy" />`
              : `<div class="cl-country-card__placeholder" aria-hidden="true">
                  ${iconForStatus(status)}
                </div>`
          }

          <span class="cl-country-card__status">
            ${iconForStatus(status)} ${statusLabel(status)}
          </span>
        </div>

        <div class="cl-country-card__body">
          <div class="cl-country-card__heading">
            <div>
              <h2>${escapeHTML(title)}</h2>
              ${
                country.summary
                  ? `<p>${escapeHTML(country.summary)}</p>`
                  : ''
              }
            </div>

            ${
              country.countryCode
                ? `<span class="cl-country-card__code">${escapeHTML(country.countryCode)}</span>`
                : ''
            }
          </div>

          <div class="cl-country-card__meta">
            ${renderCountryMeta(country, summary)}
          </div>

          ${renderProgress(summary, status)}

          <div class="cl-country-card__actions">
            ${renderCardActions(country)}
          </div>
        </div>
      </article>
    `;
  }

  function renderEmpty(state) {
    const meta = VIEW_META[state.selectedView] || VIEW_META.wishlist;

    return `
      <section class="cl-empty" role="status">
        <div class="cl-empty__icon" aria-hidden="true">${meta.icon}</div>
        <h2>${meta.emptyTitle}</h2>
        <p>${meta.emptyText}</p>
        <button
          type="button"
          class="cl-button cl-button--primary"
          data-cl-action="open-create"
        >
          إضافة دولة
        </button>
      </section>
    `;
  }

  function renderCards(state) {
    const records = asArray(state.records);

    if (!records.length) {
      return renderEmpty(state);
    }

    return `
      <section class="cl-grid" aria-live="polite">
        ${records.map(renderCountryCard).join('')}
      </section>
    `;
  }

  function renderCreateModal() {
    return `
      <div class="cl-modal" data-cl-modal role="dialog" aria-modal="true">
        <button
          class="cl-modal__backdrop"
          type="button"
          data-cl-modal-close
          aria-label="إغلاق"
        ></button>

        <section class="cl-sheet">
          <header class="cl-sheet__header">
            <div>
              <span class="cl-sheet__eyebrow">دولة جديدة</span>
              <h2>إضافة إلى الأمنيات</h2>
            </div>

            <button
              type="button"
              class="cl-icon-button"
              data-cl-modal-close
              aria-label="إغلاق"
            >
              ×
            </button>
          </header>

          <form class="cl-form" data-cl-form="create-country">
            <label>
              <span>اسم الدولة</span>
              <input name="name" required autocomplete="country-name" />
            </label>

            <label>
              <span>رمز الدولة</span>
              <input
                name="countryCode"
                maxlength="3"
                autocapitalize="characters"
                placeholder="DK"
              />
            </label>

            <label>
              <span>المدينة الرئيسية</span>
              <input name="city" />
            </label>

            <label class="cl-form__wide">
              <span>وصف مختصر</span>
              <textarea name="summary" rows="3"></textarea>
            </label>

            <label class="cl-form__wide">
              <span>رابط صورة الغلاف</span>
              <input name="coverImage" type="url" inputmode="url" />
            </label>

            <label>
              <span>الميزانية التقديرية</span>
              <input name="estimatedBudget" type="number" min="0" inputmode="decimal" />
            </label>

            <label>
              <span>العملة</span>
              <input name="currency" value="AED" maxlength="3" />
            </label>

            <div class="cl-form__actions cl-form__wide">
              <button
                type="button"
                class="cl-button cl-button--ghost"
                data-cl-modal-close
              >
                إلغاء
              </button>

              <button type="submit" class="cl-button cl-button--primary">
                حفظ الدولة
              </button>
            </div>
          </form>
        </section>
      </div>
    `;
  }

  function renderConvertModal(country) {
    const title = country?.localizedName || country?.name || 'الدولة';

    return `
      <div class="cl-modal" data-cl-modal role="dialog" aria-modal="true">
        <button
          class="cl-modal__backdrop"
          type="button"
          data-cl-modal-close
          aria-label="إغلاق"
        ></button>

        <section class="cl-sheet">
          <header class="cl-sheet__header">
            <div>
              <span class="cl-sheet__eyebrow">تحويل إلى رحلة قادمة</span>
              <h2>${escapeHTML(title)}</h2>
            </div>

            <button
              type="button"
              class="cl-icon-button"
              data-cl-modal-close
              aria-label="إغلاق"
            >
              ×
            </button>
          </header>

          <form
            class="cl-form"
            data-cl-form="convert-country"
            data-cl-country-id="${escapeAttr(country.id)}"
          >
            <label>
              <span>تاريخ البداية</span>
              <input name="startDate" type="date" required />
            </label>

            <label>
              <span>تاريخ النهاية</span>
              <input name="endDate" type="date" required />
            </label>

            <label>
              <span>شركة الطيران</span>
              <input name="airline" />
            </label>

            <label>
              <span>رقم الرحلة</span>
              <input name="flightNumber" />
            </label>

            <label>
              <span>عدد المسافرين</span>
              <input name="travelers" type="number" min="1" value="1" />
            </label>

            <label>
              <span>الميزانية المخططة</span>
              <input name="plannedBudget" type="number" min="0" />
            </label>

            <label class="cl-form__wide">
              <span>الصق جدول الرحلة من ChatGPT</span>
              <textarea
                name="itinerary"
                rows="10"
                data-cl-itinerary-input
                placeholder="اليوم 1&#10;• المكان الأول&#10;• المطعم..."
              ></textarea>
            </label>

            <div class="cl-form__actions cl-form__wide">
              <button
                type="button"
                class="cl-button cl-button--ghost"
                data-cl-modal-close
              >
                إلغاء
              </button>

              <button type="submit" class="cl-button cl-button--primary">
                إنشاء الرحلة
              </button>
            </div>
          </form>
        </section>
      </div>
    `;
  }

  function renderCountryModal(country) {
    const controller = runtime.controller;
    const summary = controller?.getCountrySummary?.(country.id);
    const currentDay = summary?.currentDay;
    const nextPlace = summary?.nextPlace;
    const days = asArray(country.itinerary?.days);

    return `
      <div class="cl-modal" data-cl-modal role="dialog" aria-modal="true">
        <button
          class="cl-modal__backdrop"
          type="button"
          data-cl-modal-close
          aria-label="إغلاق"
        ></button>

        <section class="cl-sheet cl-sheet--detail">
          <header class="cl-sheet__header">
            <div>
              <span class="cl-sheet__eyebrow">
                ${iconForStatus(country.status)} ${statusLabel(country.status)}
              </span>
              <h2>${escapeHTML(country.localizedName || country.name)}</h2>
            </div>

            <button
              type="button"
              class="cl-icon-button"
              data-cl-modal-close
              aria-label="إغلاق"
            >
              ×
            </button>
          </header>

          <div class="cl-detail">
            <section class="cl-detail__summary">
              <div>
                <span>الفترة</span>
                <strong>
                  ${formatDate(country.dates?.startDate)}
                  –
                  ${formatDate(country.dates?.endDate)}
                </strong>
              </div>

              <div>
                <span>الميزانية</span>
                <strong>
                  ${formatCurrency(
                    country.budget?.planned || country.estimatedBudget,
                    country.budget?.currency || country.currency
                  )}
                </strong>
              </div>

              <div>
                <span>الأيام</span>
                <strong>${days.length}</strong>
              </div>

              <div>
                <span>المصروف</span>
                <strong>
                  ${formatCurrency(
                    summary?.spent || 0,
                    country.budget?.currency || country.currency
                  )}
                </strong>
              </div>
            </section>

            ${
              country.summary
                ? `<p class="cl-detail__description">${escapeHTML(country.summary)}</p>`
                : ''
            }

            ${
              currentDay
                ? `
                  <section class="cl-day">
                    <header class="cl-day__header">
                      <div>
                        <span>اليوم الحالي</span>
                        <h3>${escapeHTML(currentDay.title)}</h3>
                      </div>

                      ${
                        nextPlace
                          ? `<span class="cl-day__next">التالي: ${escapeHTML(nextPlace.name)}</span>`
                          : `<span class="cl-day__done">اكتمل اليوم</span>`
                      }
                    </header>

                    <div class="cl-place-list">
                      ${asArray(currentDay.places).map((place) => `
                        <article class="cl-place cl-place--${escapeAttr(place.status)}">
                          <div>
                            <span class="cl-place__time">
                              ${escapeHTML(place.plannedTime || '—')}
                            </span>
                            <h4>${escapeHTML(place.name)}</h4>
                            ${
                              place.notes
                                ? `<p>${escapeHTML(place.notes)}</p>`
                                : ''
                            }
                          </div>

                          <div class="cl-place__actions">
                            ${
                              place.mapsUrl
                                ? `<a
                                    class="cl-icon-button"
                                    href="${escapeAttr(place.mapsUrl)}"
                                    target="_blank"
                                    rel="noopener"
                                    aria-label="فتح الخرائط"
                                  >🗺️</a>`
                                : ''
                            }

                            ${
                              country.status === 'active'
                                ? `
                                  <button
                                    type="button"
                                    class="cl-icon-button"
                                    data-cl-action="visit-place"
                                    data-cl-country-id="${escapeAttr(country.id)}"
                                    data-cl-day-id="${escapeAttr(currentDay.id)}"
                                    data-cl-place-id="${escapeAttr(place.id)}"
                                    aria-label="تمت الزيارة"
                                  >✓</button>

                                  <button
                                    type="button"
                                    class="cl-icon-button"
                                    data-cl-action="skip-place"
                                    data-cl-country-id="${escapeAttr(country.id)}"
                                    data-cl-day-id="${escapeAttr(currentDay.id)}"
                                    data-cl-place-id="${escapeAttr(place.id)}"
                                    aria-label="تخطي"
                                  >↷</button>
                                `
                                : ''
                            }
                          </div>
                        </article>
                      `).join('')}
                    </div>
                  </section>
                `
                : ''
            }

            <section class="cl-itinerary">
              <header>
                <h3>الجدول الكامل</h3>
                <span>${days.length} أيام</span>
              </header>

              ${days.map((day) => `
                <details class="cl-itinerary-day">
                  <summary>
                    <span>${escapeHTML(day.title)}</span>
                    <strong>${asArray(day.places).length} أماكن</strong>
                  </summary>

                  <ol>
                    ${asArray(day.places).map((place) => `
                      <li>
                        <span>${escapeHTML(place.plannedTime || '')}</span>
                        <strong>${escapeHTML(place.name)}</strong>
                      </li>
                    `).join('')}
                  </ol>
                </details>
              `).join('')}
            </section>
          </div>
        </section>
      </div>
    `;
  }

  function renderModal(state) {
    if (!state.modal) {
      return '';
    }

    if (state.modal.type === 'create-country') {
      return renderCreateModal();
    }

    const countryId =
      state.modal.payload?.countryId ||
      state.selectedCountryId;

    const country = runtime.controller
      ?.getCountrySummary?.(countryId)
      ?.country;

    if (!country) {
      return '';
    }

    if (state.modal.type === 'convert-country') {
      return renderConvertModal(country);
    }

    if (state.modal.type === 'country-detail') {
      return renderCountryModal(country);
    }

    return '';
  }

  function render(reason = 'update') {
    if (!runtime.root || !runtime.controller) {
      return;
    }

    const state = runtime.controller.getState();
    runtime.state = state;
    runtime.renderRevision += 1;
    runtime.lastRenderAt = Date.now();

    runtime.root.innerHTML = `
      <div
        class="country-lifecycle"
        data-cl-revision="${runtime.renderRevision}"
        data-cl-reason="${escapeAttr(reason)}"
      >
        ${renderHeader(state)}
        ${renderTabs(state)}
        ${renderSearch(state)}
        ${renderCards(state)}
        ${renderModal(state)}
      </div>
    `;
  }

  function formToObject(form) {
    const data = new FormData(form);
    return Object.fromEntries(data.entries());
  }

  async function handleFormSubmit(event) {
    const form = event.target.closest(SELECTOR.FORM);

    if (!form) {
      return;
    }

    event.preventDefault();

    const type = form.dataset.clForm;
    const values = formToObject(form);

    try {
      if (type === 'create-country') {
        await runtime.controller.createCountry({
          name: values.name,
          countryCode: values.countryCode,
          city: values.city,
          summary: values.summary,
          estimatedBudget: Number(values.estimatedBudget) || 0,
          currency: values.currency || 'AED',
          cover: {
            image: values.coverImage
          }
        });

        runtime.controller.closeModal();
        return;
      }

      if (type === 'convert-country') {
        const countryId = form.dataset.clCountryId;

        await runtime.controller.convertToUpcoming(countryId, {
          startDate: values.startDate,
          endDate: values.endDate,
          travelers: Number(values.travelers) || 1,
          transport: {
            airline: values.airline,
            flightNumber: values.flightNumber
          },
          trip: {},
          budget: {
            planned: Number(values.plannedBudget) || 0
          }
        });

        if (asString(values.itinerary)) {
          await runtime.controller.importItinerary(
            countryId,
            values.itinerary,
            {
              addMapLinks: true
            }
          );
        }

        runtime.controller.closeModal();
      }
    } catch (error) {
      global.console?.error?.('[CountryLifecyclePage]', error);
    }
  }

  async function handleAction(button) {
    const action = button.dataset.clAction;
    const countryId = button.dataset.clCountryId;
    const dayId = button.dataset.clDayId;
    const placeId = button.dataset.clPlaceId;

    switch (action) {
      case 'open-create':
        runtime.controller.openModal('create-country');
        break;

      case 'open-country':
        runtime.controller.selectCountry(countryId);
        runtime.controller.openModal('country-detail', {
          countryId
        });
        break;

      case 'open-convert':
        runtime.controller.selectCountry(countryId);
        runtime.controller.openModal('convert-country', {
          countryId
        });
        break;

      case 'activate':
        await runtime.controller.activateTrip(countryId);
        break;

      case 'complete':
        await runtime.controller.completeTrip(countryId);
        break;

      case 'visit-place':
        await runtime.controller.markPlaceVisited(
          countryId,
          dayId,
          placeId
        );
        break;

      case 'skip-place':
        await runtime.controller.skipPlace(
          countryId,
          dayId,
          placeId
        );
        break;

      default:
        break;
    }
  }

  function handleClick(event) {
    const modalClose = event.target.closest(SELECTOR.MODAL_CLOSE);

    if (modalClose) {
      runtime.controller.closeModal();
      return;
    }

    const viewButton = event.target.closest(SELECTOR.VIEW_BUTTON);

    if (viewButton) {
      runtime.controller.selectView(viewButton.dataset.clView);
      return;
    }

    const actionButton = event.target.closest(SELECTOR.ACTION);

    if (actionButton) {
      event.preventDefault();

      Promise.resolve(handleAction(actionButton)).catch((error) => {
        global.console?.error?.('[CountryLifecyclePage]', error);
      });
    }
  }

  function handleInput(event) {
    if (!event.target.matches(SELECTOR.SEARCH)) {
      return;
    }

    runtime.isTyping = true;

    global.clearTimeout(runtime.interactionTimer);

    runtime.interactionTimer = global.setTimeout(() => {
      runtime.isTyping = false;
      runtime.controller.setSearchQuery(event.target.value);
    }, 220);
  }

  function handlePointerDown() {
    runtime.isPointerDown = true;
  }

  function handlePointerUp() {
    runtime.isPointerDown = false;
    scheduleRender('pointer-up', 30);
  }

  function handleScroll() {
    runtime.isScrolling = true;

    global.clearTimeout(runtime.interactionTimer);

    runtime.interactionTimer = global.setTimeout(() => {
      runtime.isScrolling = false;
      scheduleRender('scroll-end', 40);
    }, 140);
  }

  function bind(target, name, handler, options) {
    target.addEventListener(name, handler, options);

    runtime.listeners.push(() => {
      target.removeEventListener(name, handler, options);
    });
  }

  function bindEvents() {
    bind(runtime.root, 'click', handleClick);
    bind(runtime.root, 'input', handleInput);
    bind(runtime.root, 'submit', handleFormSubmit);
    bind(runtime.root, 'pointerdown', handlePointerDown, {
      passive: true
    });
    bind(global, 'pointerup', handlePointerUp, {
      passive: true
    });
    bind(global, 'pointercancel', handlePointerUp, {
      passive: true
    });
    bind(global, 'scroll', handleScroll, {
      passive: true
    });

    const stateHandler = (event) => {
      runtime.state = event.detail?.state || null;
      scheduleRender(event.detail?.reason || 'controller-state');
    };

    bind(
      global,
      'tic:country-lifecycle-controller:state',
      stateHandler,
      { passive: true }
    );
  }

  function mount(target) {
    if (runtime.mounted && !runtime.destroyed) {
      return api;
    }

    const root =
      typeof target === 'string'
        ? global.document?.querySelector(target)
        : target ||
          global.document?.querySelector(SELECTOR.ROOT);

    if (!root) {
      throw new Error(
        'Country Lifecycle root element was not found.'
      );
    }

    const controller = getController();

    if (!controller) {
      throw new Error(
        'CountryLifecycleController is not available.'
      );
    }

    runtime.root = root;
    runtime.controller = controller;
    runtime.mounted = true;
    runtime.destroyed = false;

    controller.init?.();
    bindEvents();
    render('mount');

    return api;
  }

  function refresh(reason = 'manual') {
    if (!runtime.mounted) {
      return null;
    }

    scheduleRender(reason, 0);
    return runtime.controller?.getState?.() || null;
  }

  function unmount() {
    if (!runtime.mounted) {
      return;
    }

    runtime.destroyed = true;
    runtime.mounted = false;

    global.clearTimeout(runtime.renderTimer);
    global.clearTimeout(runtime.interactionTimer);

    for (const cleanup of runtime.listeners.splice(0)) {
      try {
        cleanup();
      } catch (_) {
        // Continue cleanup.
      }
    }

    if (runtime.root) {
      runtime.root.innerHTML = '';
    }

    runtime.root = null;
    runtime.controller = null;
    runtime.state = null;
  }

  const api = Object.freeze({
    __initialized: true,
    version: VERSION,

    SELECTOR,
    VIEW_META,

    mount,
    refresh,
    unmount,

    getState() {
      return runtime.controller?.getState?.() || null;
    },

    isMounted() {
      return runtime.mounted && !runtime.destroyed;
    }
  });

  global.CountryLifecyclePage = api;
})(typeof window !== 'undefined' ? window : globalThis);
