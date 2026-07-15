/* =========================================================
   Travel Intelligence Center
   Budget Intelligence Platform
   Budget Export Engine V1.0.0

   File Path:
   js/features/budget-export-engine.js

   Purpose:
   - Production-ready export layer for the Budget platform.
   - Exports budget, expenses, savings, analytics, payments,
     AI recommendations and alerts in structured formats.
   - Supports JSON, CSV, Markdown, HTML and printable reports.
   - Generates trip reports, category reports, annual reports,
     payment reports, savings reports and executive summaries.
   - Works entirely in the browser without external libraries.
   - Reads live data from the central Store and finance engines.
   - Produces downloadable Blob objects and browser downloads.

   Dependencies:
   - window.TICBudgetEngine
   - window.TICExpenseEngine
   - window.TICSavingsEngine
   - window.TICBudgetAnalytics
   - window.TICBudgetAI
   - window.TICPaymentTracker
   - window.TICExpenseAlertEngine
   - window.TICStore / window.Store

   Global:
   - window.TICBudgetExportEngine
   ========================================================= */

(function budgetExportEngineFactory(global) {
  "use strict";

  const VERSION = "1.0.0";
  const ENGINE_NAME = "TICBudgetExportEngine";

  const EVENTS = Object.freeze({
    READY: "tic:budget-export-engine-ready",
    EXPORT_STARTED: "tic:budget-export-started",
    EXPORT_COMPLETED: "tic:budget-export-completed",
    EXPORT_FAILED: "tic:budget-export-failed",
    ERROR: "tic:budget-export-error"
  });

  const FORMAT = Object.freeze({
    JSON: "json",
    CSV: "csv",
    MARKDOWN: "md",
    HTML: "html",
    TEXT: "txt"
  });

  const REPORT = Object.freeze({
    FULL: "full",
    EXECUTIVE: "executive",
    ANNUAL: "annual",
    MONTHLY: "monthly",
    EXPENSES: "expenses",
    SAVINGS: "savings",
    PAYMENTS: "payments",
    ALERTS: "alerts",
    AI: "ai",
    TRIP: "trip",
    CATEGORY: "category"
  });

  const DEFAULTS = Object.freeze({
    language: "ar",
    currency: "AED",
    includeRawData: false,
    includeCharts: true,
    includeInsights: true,
    includeRecommendations: true,
    includeAlerts: true,
    includePayments: true,
    includeSavings: true,
    includeExpenses: true,
    includeTrips: true,
    prettyJSON: true,
    autoDownload: false
  });

  const state = {
    initialized: false
  };

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (isObject(value)) return Object.values(value);
    return [];
  }

  function clone(value) {
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
  }

  function firstDefined() {
    for (let index = 0; index < arguments.length; index += 1) {
      const value = arguments[index];

      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }

    return undefined;
  }

  function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (fallback ?? 0);
  }

  function toNonNegative(value, fallback) {
    return Math.max(0, toNumber(value, fallback));
  }

  function round(value, decimals) {
    const precision = Number.isInteger(decimals) ? decimals : 2;
    const factor = Math.pow(10, precision);

    return Math.round(
      (toNumber(value, 0) + Number.EPSILON) * factor
    ) / factor;
  }

  function safeDate(value) {
    if (!value) return null;

    const date = value instanceof Date
      ? new Date(value.getTime())
      : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function normalizeLanguage(value) {
    return String(value || "ar").toLowerCase() === "en"
      ? "en"
      : "ar";
  }

  function normalizeCurrency(value) {
    return String(value || "AED").trim().toUpperCase() || "AED";
  }

  function normalizeFormat(value) {
    const raw = String(value || FORMAT.JSON)
      .trim()
      .toLowerCase()
      .replace(/^\./, "");

    const aliases = {
      markdown: FORMAT.MARKDOWN,
      md: FORMAT.MARKDOWN,
      text: FORMAT.TEXT,
      txt: FORMAT.TEXT,
      html5: FORMAT.HTML,
      comma: FORMAT.CSV
    };

    const normalized = aliases[raw] || raw;

    return Object.values(FORMAT).includes(normalized)
      ? normalized
      : FORMAT.JSON;
  }

  function normalizeReport(value) {
    const raw = String(value || REPORT.FULL)
      .trim()
      .toLowerCase();

    return Object.values(REPORT).includes(raw)
      ? raw
      : REPORT.FULL;
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeCSV(value) {
    const text = String(value ?? "");

    if (
      text.includes(",") ||
      text.includes('"') ||
      text.includes("\n") ||
      text.includes("\r")
    ) {
      return '"' + text.replace(/"/g, '""') + '"';
    }

    return text;
  }

  function formatMoney(value, currency, language) {
    const locale = normalizeLanguage(language) === "en"
      ? "en-AE"
      : "ar-AE";

    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: normalizeCurrency(currency),
        maximumFractionDigits: 0
      }).format(round(value, 2));
    } catch (error) {
      return round(value, 2).toLocaleString(locale) +
        " " + normalizeCurrency(currency);
    }
  }

  function formatDate(value, language) {
    const date = safeDate(value);

    if (!date) return "";

    const locale = normalizeLanguage(language) === "en"
      ? "en-AE"
      : "ar-AE";

    try {
      return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "numeric"
      }).format(date);
    } catch (error) {
      return date.toISOString().slice(0, 10);
    }
  }

  function createFilename(input) {
    const data = isObject(input) ? input : {};
    const report = normalizeReport(data.report);
    const format = normalizeFormat(data.format);
    const date = new Date().toISOString().slice(0, 10);
    const suffix = String(firstDefined(
      data.suffix,
      ""
    ))
      .trim()
      .replace(/[^\w\u0600-\u06FF-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return [
      "travel-budget",
      report,
      suffix || null,
      date
    ]
      .filter(Boolean)
      .join("-") + "." + format;
  }

  function resolveStore(store) {
    return store ||
      global.TICStore ||
      global.Store ||
      global.store ||
      null;
  }

  function readState(store) {
    const source = resolveStore(store);

    if (!source) return {};

    try {
      if (typeof source.getState === "function") {
        return source.getState() || {};
      }

      if (typeof source.get === "function") {
        const result = source.get();
        if (isObject(result)) return result;
      }

      if (isObject(source.state)) return source.state;
      if (isObject(source.data)) return source.data;
      if (isObject(source)) return source;
    } catch (error) {
      reportError(
        "STORE_READ_FAILED",
        "تعذر قراءة بيانات التصدير من المخزن.",
        "Unable to read export data from the Store.",
        { cause: error.message }
      );
    }

    return {};
  }

  function callFirst(engine, methods, options) {
    if (!engine) return null;

    for (let index = 0; index < methods.length; index += 1) {
      const method = methods[index];

      if (typeof engine[method] === "function") {
        try {
          const result = engine[method](options || {});
          if (result !== undefined && result !== null) {
            return result;
          }
        } catch (error) {
          // Continue to next compatible method.
        }
      }
    }

    return null;
  }

  function getAnalytics(options) {
    return callFirst(
      global.TICBudgetAnalytics,
      ["getSnapshot", "getDashboard", "generate"],
      options
    ) || {};
  }

  function getAI(options) {
    return callFirst(
      global.TICBudgetAI,
      ["getDashboard", "generateDashboard"],
      options
    ) || {
      recommendations: [],
      summary: {}
    };
  }

  function getPayments(options) {
    return callFirst(
      global.TICPaymentTracker,
      ["getDashboard", "buildDashboard"],
      options
    ) || {
      payments: [],
      summary: {},
      alerts: []
    };
  }

  function getAlerts(options) {
    return callFirst(
      global.TICExpenseAlertEngine,
      ["getDashboard", "buildDashboard"],
      options
    ) || {
      alerts: [],
      summary: {}
    };
  }

  function getExpenses(options, storeState) {
    const result = callFirst(
      global.TICExpenseEngine,
      ["listExpenses", "getExpenses", "getAll", "list"],
      options
    );

    if (Array.isArray(result)) {
      return result;
    }

    if (isObject(result)) {
      const items = asArray(
        result.items || result.expenses || result.data
      );

      if (items.length) return items;
    }

    return asArray(firstDefined(
      storeState && storeState.expenses,
      storeState &&
        storeState.budget &&
        storeState.budget.expenses,
      storeState &&
        storeState.finance &&
        storeState.finance.expenses,
      []
    ));
  }

  function getSavings(options, storeState) {
    const result = callFirst(
      global.TICSavingsEngine,
      ["getDashboard", "getSummary", "analyze"],
      options
    );

    if (isObject(result)) return result;

    const root = firstDefined(
      storeState && storeState.savings,
      storeState &&
        storeState.finance &&
        storeState.finance.savings,
      {}
    );

    return isObject(root)
      ? root
      : { entries: asArray(root) };
  }

  function resolveOptions(options) {
    const input = isObject(options) ? options : {};

    return Object.assign({}, DEFAULTS, input, {
      language: normalizeLanguage(
        firstDefined(input.language, DEFAULTS.language)
      ),
      currency: normalizeCurrency(
        firstDefined(input.currency, DEFAULTS.currency)
      ),
      format: normalizeFormat(
        firstDefined(input.format, FORMAT.JSON)
      ),
      report: normalizeReport(
        firstDefined(input.report, REPORT.FULL)
      )
    });
  }

  function sanitizeExpense(expense, index) {
    return {
      id: String(firstDefined(
        expense && expense.id,
        expense && expense._id,
        "expense_" + index
      )),
      title: String(firstDefined(
        expense && expense.title,
        expense && expense.name,
        expense && expense.description,
        "Expense"
      )),
      category: String(firstDefined(
        expense && expense.category,
        expense && expense.type,
        "other"
      )),
      amount: round(toNonNegative(firstDefined(
        expense && expense.amount,
        expense && expense.total,
        expense && expense.value,
        0
      )), 2),
      currency: normalizeCurrency(firstDefined(
        expense && expense.currency,
        "AED"
      )),
      date: firstDefined(
        expense && expense.paidAt,
        expense && expense.date,
        expense && expense.expenseDate,
        expense && expense.createdAt,
        null
      ),
      status: String(firstDefined(
        expense && expense.status,
        "paid"
      )),
      tripId: firstDefined(
        expense && expense.tripId,
        expense && expense.travelId,
        null
      ),
      paymentMethod: firstDefined(
        expense && expense.paymentMethod,
        expense && expense.method,
        null
      ),
      reference: firstDefined(
        expense && expense.reference,
        expense && expense.transactionReference,
        null
      ),
      notes: String(firstDefined(
        expense && expense.notes,
        ""
      ))
    };
  }

  function buildDataset(options) {
    const input = resolveOptions(options);
    const storeState = readState(input.store);
    const analytics = getAnalytics(input);
    const ai = getAI(input);
    const payments = getPayments(input);
    const alerts = getAlerts(input);
    const expenses = getExpenses(input, storeState)
      .filter(function active(expense) {
        return expense &&
          expense.deletedAt == null &&
          expense.isDeleted !== true;
      })
      .map(sanitizeExpense);
    const savings = getSavings(input, storeState);

    const currency = normalizeCurrency(firstDefined(
      input.currency,
      analytics.currency,
      storeState &&
        storeState.settings &&
        storeState.settings.currency,
      storeState &&
        storeState.profile &&
        storeState.profile.currency,
      "AED"
    ));

    const dataset = {
      metadata: {
        app: "Travel Intelligence Center",
        module: "Budget Intelligence Platform",
        engine: ENGINE_NAME,
        version: VERSION,
        report: input.report,
        format: input.format,
        language: input.language,
        currency: currency,
        generatedAt: new Date().toISOString()
      },
      executive: {
        annualBudget: round(toNonNegative(
          analytics.annualBudget
        ), 2),
        totalSpent: round(toNonNegative(
          analytics.totalSpent
        ), 2),
        remaining: round(toNumber(
          analytics.remaining,
          toNonNegative(analytics.annualBudget) -
            toNonNegative(analytics.totalSpent)
        ), 2),
        usagePercent: round(toNonNegative(
          analytics.usagePercent
        ), 1),
        expenseCount: toNonNegative(
          analytics.expenseCount
        ),
        averageExpense: round(toNonNegative(
          analytics.averageExpense
        ), 2),
        healthScore: toNumber(
          analytics.health && analytics.health.score,
          0
        ),
        healthStatus: firstDefined(
          analytics.health && analytics.health.status,
          "unknown"
        ),
        projectedSpend: round(toNonNegative(
          analytics.forecast &&
          analytics.forecast.projectedSpend
        ), 2),
        expectedOverrun: round(toNonNegative(
          analytics.forecast &&
          analytics.forecast.expectedOverrun
        ), 2),
        likelyToExceed: Boolean(
          analytics.forecast &&
          analytics.forecast.likelyToExceed
        ),
        savingsBalance: round(toNonNegative(
          analytics.savings &&
          analytics.savings.balance
        ), 2),
        savingsCoveragePercent: round(toNonNegative(
          analytics.savings &&
          analytics.savings.coveragePercent
        ), 1),
        paymentsRemaining: round(toNonNegative(
          payments.summary &&
          payments.summary.remainingAmount
        ), 2),
        overduePayments: toNonNegative(
          payments.summary &&
          payments.summary.overdueCount
        ),
        activeAlerts: toNonNegative(
          alerts.summary &&
          alerts.summary.active
        ),
        criticalAlerts: toNonNegative(
          alerts.summary &&
          alerts.summary.critical
        ),
        recommendationCount: asArray(
          ai.recommendations
        ).length
      }
    };

    if (input.includeExpenses) {
      dataset.expenses = expenses;
    }

    if (input.includeSavings) {
      dataset.savings = clone(
        analytics.savings || savings || {}
      );
    }

    if (input.includePayments) {
      dataset.payments = clone(
        payments.payments || []
      );
      dataset.paymentSummary = clone(
        payments.summary || {}
      );
    }

    if (input.includeAlerts) {
      dataset.alerts = clone(
        alerts.alerts || []
      );
      dataset.alertSummary = clone(
        alerts.summary || {}
      );
    }

    if (input.includeRecommendations) {
      dataset.recommendations = clone(
        ai.recommendations || []
      );
      dataset.aiSummary = clone(
        ai.summary || {}
      );
    }

    if (input.includeInsights) {
      dataset.insights = clone(
        analytics.insights || []
      );
    }

    if (input.includeTrips) {
      dataset.trips = clone(
        analytics.trips || {}
      );
    }

    dataset.categories = clone(
      analytics.categories || {}
    );

    dataset.monthly = clone(
      analytics.monthly || {}
    );

    dataset.daily = clone(
      analytics.daily || {}
    );

    dataset.forecast = clone(
      analytics.forecast || {}
    );

    dataset.health = clone(
      analytics.health || {}
    );

    if (input.includeCharts) {
      dataset.charts = clone(
        analytics.charts || {}
      );
    }

    if (input.includeRawData) {
      dataset.rawStore = clone(storeState);
    }

    if (input.report === REPORT.TRIP && input.tripId != null) {
      const tripReport = callFirst(
        global.TICBudgetAnalytics,
        ["getTripReport"],
        Object.assign({}, input, {
          tripId: input.tripId
        })
      );

      if (
        global.TICBudgetAnalytics &&
        typeof global.TICBudgetAnalytics.getTripReport === "function"
      ) {
        try {
          dataset.tripReport =
            global.TICBudgetAnalytics.getTripReport(
              input.tripId,
              input
            );
        } catch (error) {
          dataset.tripReport = tripReport || null;
        }
      }
    }

    if (
      input.report === REPORT.CATEGORY &&
      input.category
    ) {
      if (
        global.TICBudgetAnalytics &&
        typeof global.TICBudgetAnalytics.getCategoryReport === "function"
      ) {
        try {
          dataset.categoryReport =
            global.TICBudgetAnalytics.getCategoryReport(
              input.category,
              input
            );
        } catch (error) {
          dataset.categoryReport = null;
        }
      }
    }

    return dataset;
  }

  function selectReportData(dataset, report) {
    const type = normalizeReport(report);

    if (type === REPORT.EXECUTIVE) {
      return {
        metadata: dataset.metadata,
        executive: dataset.executive,
        insights: dataset.insights,
        recommendations: dataset.recommendations,
        alerts: dataset.alerts
      };
    }

    if (type === REPORT.ANNUAL) {
      return {
        metadata: dataset.metadata,
        executive: dataset.executive,
        monthly: dataset.monthly,
        categories: dataset.categories,
        trips: dataset.trips,
        forecast: dataset.forecast,
        health: dataset.health
      };
    }

    if (type === REPORT.MONTHLY) {
      return {
        metadata: dataset.metadata,
        executive: dataset.executive,
        monthly: dataset.monthly,
        daily: dataset.daily,
        categories: dataset.categories,
        expenses: dataset.expenses
      };
    }

    if (type === REPORT.EXPENSES) {
      return {
        metadata: dataset.metadata,
        executive: dataset.executive,
        expenses: dataset.expenses,
        categories: dataset.categories,
        monthly: dataset.monthly
      };
    }

    if (type === REPORT.SAVINGS) {
      return {
        metadata: dataset.metadata,
        executive: dataset.executive,
        savings: dataset.savings
      };
    }

    if (type === REPORT.PAYMENTS) {
      return {
        metadata: dataset.metadata,
        executive: dataset.executive,
        paymentSummary: dataset.paymentSummary,
        payments: dataset.payments
      };
    }

    if (type === REPORT.ALERTS) {
      return {
        metadata: dataset.metadata,
        executive: dataset.executive,
        alertSummary: dataset.alertSummary,
        alerts: dataset.alerts
      };
    }

    if (type === REPORT.AI) {
      return {
        metadata: dataset.metadata,
        executive: dataset.executive,
        aiSummary: dataset.aiSummary,
        recommendations: dataset.recommendations,
        insights: dataset.insights
      };
    }

    if (type === REPORT.TRIP) {
      return {
        metadata: dataset.metadata,
        executive: dataset.executive,
        tripReport: dataset.tripReport,
        trips: dataset.trips
      };
    }

    if (type === REPORT.CATEGORY) {
      return {
        metadata: dataset.metadata,
        executive: dataset.executive,
        categoryReport: dataset.categoryReport,
        categories: dataset.categories
      };
    }

    return dataset;
  }

  function toJSON(data, pretty) {
    return JSON.stringify(
      data,
      null,
      pretty === false ? 0 : 2
    );
  }

  function flattenObject(value, prefix, output) {
    const target = output || {};
    const currentPrefix = prefix || "";

    if (Array.isArray(value)) {
      if (!value.length) {
        target[currentPrefix] = "";
        return target;
      }

      value.forEach(function flattenItem(item, index) {
        const key = currentPrefix
          ? currentPrefix + "." + index
          : String(index);

        flattenObject(item, key, target);
      });

      return target;
    }

    if (isObject(value)) {
      const keys = Object.keys(value);

      if (!keys.length) {
        target[currentPrefix] = "";
        return target;
      }

      keys.forEach(function flattenKey(key) {
        const nextPrefix = currentPrefix
          ? currentPrefix + "." + key
          : key;

        flattenObject(
          value[key],
          nextPrefix,
          target
        );
      });

      return target;
    }

    target[currentPrefix] = value;
    return target;
  }

  function arrayToCSV(rows) {
    const items = asArray(rows);

    if (!items.length) return "";

    const flattened = items.map(function flatten(item) {
      return flattenObject(item);
    });

    const headers = Array.from(
      flattened.reduce(function collect(set, item) {
        Object.keys(item).forEach(function add(key) {
          set.add(key);
        });

        return set;
      }, new Set())
    );

    const lines = [
      headers.map(escapeCSV).join(",")
    ];

    flattened.forEach(function row(item) {
      lines.push(
        headers.map(function cell(header) {
          return escapeCSV(
            Object.prototype.hasOwnProperty.call(
              item,
              header
            )
              ? item[header]
              : ""
          );
        }).join(",")
      );
    });

    return lines.join("\n");
  }

  function toCSV(data, report) {
    const type = normalizeReport(report);

    if (type === REPORT.EXPENSES) {
      return arrayToCSV(data.expenses || []);
    }

    if (type === REPORT.PAYMENTS) {
      return arrayToCSV(data.payments || []);
    }

    if (type === REPORT.ALERTS) {
      return arrayToCSV(data.alerts || []);
    }

    if (type === REPORT.AI) {
      return arrayToCSV(
        data.recommendations || []
      );
    }

    if (type === REPORT.TRIP) {
      return arrayToCSV(
        data.tripReport &&
        data.tripReport.expenses
          ? data.tripReport.expenses
          : []
      );
    }

    if (type === REPORT.CATEGORY) {
      return arrayToCSV(
        data.categoryReport &&
        data.categoryReport.expenses
          ? data.categoryReport.expenses
          : []
      );
    }

    const sections = [];

    sections.push(
      ["section", "key", "value"].join(",")
    );

    function addSection(name, object) {
      const flat = flattenObject(object);

      Object.keys(flat).forEach(function line(key) {
        sections.push([
          escapeCSV(name),
          escapeCSV(key),
          escapeCSV(flat[key])
        ].join(","));
      });
    }

    addSection("metadata", data.metadata || {});
    addSection("executive", data.executive || {});
    addSection("monthly", data.monthly || {});
    addSection("categories", data.categories || {});
    addSection("savings", data.savings || {});
    addSection("paymentSummary", data.paymentSummary || {});
    addSection("alertSummary", data.alertSummary || {});

    return sections.join("\n");
  }

  function getLabels(language) {
    const isEnglish = normalizeLanguage(language) === "en";

    return isEnglish
      ? {
          title: "Travel Budget Report",
          generated: "Generated",
          summary: "Executive Summary",
          annualBudget: "Annual Budget",
          spent: "Total Spent",
          remaining: "Remaining",
          usage: "Budget Usage",
          health: "Financial Health",
          forecast: "Projected Spending",
          savings: "Savings",
          payments: "Payments",
          alerts: "Alerts",
          recommendations: "AI Recommendations",
          expenses: "Expenses",
          trips: "Trips",
          categories: "Categories",
          monthly: "Monthly Spending",
          noData: "No data available"
        }
      : {
          title: "تقرير ميزانية السفر",
          generated: "تاريخ الإنشاء",
          summary: "الملخص التنفيذي",
          annualBudget: "الميزانية السنوية",
          spent: "إجمالي الإنفاق",
          remaining: "المتبقي",
          usage: "استخدام الميزانية",
          health: "الصحة المالية",
          forecast: "الإنفاق المتوقع",
          savings: "الادخار",
          payments: "الدفعات",
          alerts: "التنبيهات",
          recommendations: "التوصيات الذكية",
          expenses: "المصروفات",
          trips: "الرحلات",
          categories: "الفئات",
          monthly: "الإنفاق الشهري",
          noData: "لا توجد بيانات"
        };
  }

  function renderMarkdownTable(headers, rows) {
    if (!rows.length) return "";

    const headerLine = "| " +
      headers.join(" | ") +
      " |";

    const separator = "| " +
      headers.map(function separatorCell() {
        return "---";
      }).join(" | ") +
      " |";

    const body = rows.map(function row(items) {
      return "| " +
        items.map(function cell(value) {
          return String(value ?? "")
            .replace(/\|/g, "\\|")
            .replace(/\n/g, " ");
        }).join(" | ") +
        " |";
    }).join("\n");

    return [
      headerLine,
      separator,
      body
    ].join("\n");
  }

  function toMarkdown(data, options) {
    const input = resolveOptions(options);
    const labels = getLabels(input.language);
    const currency = data.metadata.currency;
    const executive = data.executive || {};
    const sections = [];

    sections.push("# " + labels.title);
    sections.push("");
    sections.push(
      "**" + labels.generated + ":** " +
      formatDate(
        data.metadata.generatedAt,
        input.language
      )
    );
    sections.push("");
    sections.push("## " + labels.summary);
    sections.push("");
    sections.push(
      renderMarkdownTable(
        [
          input.language === "en"
            ? "Metric"
            : "المؤشر",
          input.language === "en"
            ? "Value"
            : "القيمة"
        ],
        [
          [
            labels.annualBudget,
            formatMoney(
              executive.annualBudget,
              currency,
              input.language
            )
          ],
          [
            labels.spent,
            formatMoney(
              executive.totalSpent,
              currency,
              input.language
            )
          ],
          [
            labels.remaining,
            formatMoney(
              executive.remaining,
              currency,
              input.language
            )
          ],
          [
            labels.usage,
            String(executive.usagePercent || 0) + "%"
          ],
          [
            labels.health,
            String(executive.healthScore || 0) +
            " / 100"
          ],
          [
            labels.forecast,
            formatMoney(
              executive.projectedSpend,
              currency,
              input.language
            )
          ],
          [
            labels.savings,
            formatMoney(
              executive.savingsBalance,
              currency,
              input.language
            )
          ]
        ]
      )
    );

    if (Array.isArray(data.expenses)) {
      sections.push("");
      sections.push("## " + labels.expenses);
      sections.push("");
      sections.push(
        data.expenses.length
          ? renderMarkdownTable(
              [
                input.language === "en"
                  ? "Date"
                  : "التاريخ",
                input.language === "en"
                  ? "Title"
                  : "العنوان",
                input.language === "en"
                  ? "Category"
                  : "الفئة",
                input.language === "en"
                  ? "Amount"
                  : "القيمة",
                input.language === "en"
                  ? "Status"
                  : "الحالة"
              ],
              data.expenses.map(function row(expense) {
                return [
                  formatDate(
                    expense.date,
                    input.language
                  ),
                  expense.title,
                  expense.category,
                  formatMoney(
                    expense.amount,
                    expense.currency || currency,
                    input.language
                  ),
                  expense.status
                ];
              })
            )
          : labels.noData
      );
    }

    if (
      data.paymentSummary ||
      Array.isArray(data.payments)
    ) {
      sections.push("");
      sections.push("## " + labels.payments);
      sections.push("");

      sections.push(
        renderMarkdownTable(
          [
            input.language === "en"
              ? "Metric"
              : "المؤشر",
            input.language === "en"
              ? "Value"
              : "القيمة"
          ],
          [
            [
              input.language === "en"
                ? "Total"
                : "الإجمالي",
              formatMoney(
                data.paymentSummary &&
                data.paymentSummary.totalAmount,
                currency,
                input.language
              )
            ],
            [
              input.language === "en"
                ? "Paid"
                : "المدفوع",
              formatMoney(
                data.paymentSummary &&
                data.paymentSummary.paidAmount,
                currency,
                input.language
              )
            ],
            [
              input.language === "en"
                ? "Remaining"
                : "المتبقي",
              formatMoney(
                data.paymentSummary &&
                data.paymentSummary.remainingAmount,
                currency,
                input.language
              )
            ],
            [
              input.language === "en"
                ? "Overdue"
                : "المتأخر",
              String(
                data.paymentSummary &&
                data.paymentSummary.overdueCount || 0
              )
            ]
          ]
        )
      );
    }

    if (Array.isArray(data.recommendations)) {
      sections.push("");
      sections.push(
        "## " + labels.recommendations
      );
      sections.push("");

      if (!data.recommendations.length) {
        sections.push(labels.noData);
      } else {
        data.recommendations.forEach(
          function recommendation(item, index) {
            sections.push(
              "### " + (index + 1) + ". " +
              (
                input.language === "en"
                  ? item.titleEn
                  : item.titleAr
              )
            );

            sections.push("");
            sections.push(
              input.language === "en"
                ? item.messageEn
                : item.messageAr
            );
            sections.push("");
          }
        );
      }
    }

    if (Array.isArray(data.alerts)) {
      sections.push("");
      sections.push("## " + labels.alerts);
      sections.push("");

      if (!data.alerts.length) {
        sections.push(labels.noData);
      } else {
        sections.push(
          renderMarkdownTable(
            [
              input.language === "en"
                ? "Severity"
                : "الخطورة",
              input.language === "en"
                ? "Title"
                : "العنوان",
              input.language === "en"
                ? "Message"
                : "الرسالة"
            ],
            data.alerts.map(function alertRow(item) {
              return [
                item.severity,
                input.language === "en"
                  ? item.titleEn
                  : item.titleAr,
                input.language === "en"
                  ? item.messageEn
                  : item.messageAr
              ];
            })
          )
        );
      }
    }

    return sections.join("\n");
  }

  function htmlTable(headers, rows) {
    if (!rows.length) return "";

    return [
      "<div class=\"table-wrap\">",
      "<table>",
      "<thead><tr>",
      headers.map(function header(value) {
        return "<th>" + escapeHTML(value) + "</th>";
      }).join(""),
      "</tr></thead>",
      "<tbody>",
      rows.map(function row(cells) {
        return "<tr>" +
          cells.map(function cell(value) {
            return "<td>" +
              escapeHTML(value) +
              "</td>";
          }).join("") +
          "</tr>";
      }).join(""),
      "</tbody>",
      "</table>",
      "</div>"
    ].join("");
  }

  function toHTML(data, options) {
    const input = resolveOptions(options);
    const labels = getLabels(input.language);
    const direction = input.language === "en"
      ? "ltr"
      : "rtl";
    const currency = data.metadata.currency;
    const executive = data.executive || {};

    const summaryCards = [
      {
        label: labels.annualBudget,
        value: formatMoney(
          executive.annualBudget,
          currency,
          input.language
        )
      },
      {
        label: labels.spent,
        value: formatMoney(
          executive.totalSpent,
          currency,
          input.language
        )
      },
      {
        label: labels.remaining,
        value: formatMoney(
          executive.remaining,
          currency,
          input.language
        )
      },
      {
        label: labels.usage,
        value:
          String(executive.usagePercent || 0) + "%"
      },
      {
        label: labels.health,
        value:
          String(executive.healthScore || 0) +
          " / 100"
      },
      {
        label: labels.savings,
        value: formatMoney(
          executive.savingsBalance,
          currency,
          input.language
        )
      }
    ];

    const sections = [];

    sections.push(
      "<section>",
      "<h2>" + escapeHTML(labels.summary) + "</h2>",
      "<div class=\"summary-grid\">",
      summaryCards.map(function card(item) {
        return [
          "<article class=\"summary-card\">",
          "<span>" +
            escapeHTML(item.label) +
          "</span>",
          "<strong>" +
            escapeHTML(item.value) +
          "</strong>",
          "</article>"
        ].join("");
      }).join(""),
      "</div>",
      "</section>"
    );

    if (Array.isArray(data.expenses)) {
      sections.push(
        "<section>",
        "<h2>" + escapeHTML(labels.expenses) + "</h2>",
        data.expenses.length
          ? htmlTable(
              [
                input.language === "en"
                  ? "Date"
                  : "التاريخ",
                input.language === "en"
                  ? "Title"
                  : "العنوان",
                input.language === "en"
                  ? "Category"
                  : "الفئة",
                input.language === "en"
                  ? "Amount"
                  : "القيمة",
                input.language === "en"
                  ? "Status"
                  : "الحالة"
              ],
              data.expenses.map(function row(expense) {
                return [
                  formatDate(
                    expense.date,
                    input.language
                  ),
                  expense.title,
                  expense.category,
                  formatMoney(
                    expense.amount,
                    expense.currency || currency,
                    input.language
                  ),
                  expense.status
                ];
              })
            )
          : "<p>" +
              escapeHTML(labels.noData) +
            "</p>",
        "</section>"
      );
    }

    if (Array.isArray(data.recommendations)) {
      sections.push(
        "<section>",
        "<h2>" +
          escapeHTML(labels.recommendations) +
        "</h2>",
        data.recommendations.length
          ? "<div class=\"list\">" +
              data.recommendations.map(
                function recommendation(item) {
                  return [
                    "<article class=\"list-card\">",
                    "<h3>" +
                      escapeHTML(
                        input.language === "en"
                          ? item.titleEn
                          : item.titleAr
                      ) +
                    "</h3>",
                    "<p>" +
                      escapeHTML(
                        input.language === "en"
                          ? item.messageEn
                          : item.messageAr
                      ) +
                    "</p>",
                    "</article>"
                  ].join("");
                }
              ).join("") +
            "</div>"
          : "<p>" +
              escapeHTML(labels.noData) +
            "</p>",
        "</section>"
      );
    }

    if (Array.isArray(data.alerts)) {
      sections.push(
        "<section>",
        "<h2>" + escapeHTML(labels.alerts) + "</h2>",
        data.alerts.length
          ? "<div class=\"list\">" +
              data.alerts.map(function alert(item) {
                return [
                  "<article class=\"list-card alert-card\">",
                  "<small>" +
                    escapeHTML(item.severity) +
                  "</small>",
                  "<h3>" +
                    escapeHTML(
                      input.language === "en"
                        ? item.titleEn
                        : item.titleAr
                    ) +
                  "</h3>",
                  "<p>" +
                    escapeHTML(
                      input.language === "en"
                        ? item.messageEn
                        : item.messageAr
                    ) +
                  "</p>",
                  "</article>"
                ].join("");
              }).join("") +
            "</div>"
          : "<p>" +
              escapeHTML(labels.noData) +
            "</p>",
        "</section>"
      );
    }

    return [
      "<!DOCTYPE html>",
      "<html lang=\"" +
        escapeHTML(input.language) +
        "\" dir=\"" +
        direction +
        "\">",
      "<head>",
      "<meta charset=\"UTF-8\">",
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">",
      "<title>" +
        escapeHTML(labels.title) +
      "</title>",
      "<style>",
      "body{font-family:Arial,sans-serif;margin:0;background:#f5f7fb;color:#172033;line-height:1.6}",
      ".container{max-width:1100px;margin:0 auto;padding:32px}",
      ".hero{background:#0f2747;color:#fff;padding:32px;border-radius:24px;margin-bottom:24px}",
      ".hero h1{margin:0 0 8px;font-size:30px}",
      ".hero p{margin:0;opacity:.8}",
      "section{background:#fff;border-radius:20px;padding:24px;margin-bottom:20px;box-shadow:0 10px 30px rgba(15,39,71,.08)}",
      "h2{margin-top:0}",
      ".summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}",
      ".summary-card{background:#f7f9fc;padding:18px;border-radius:16px}",
      ".summary-card span{display:block;font-size:13px;color:#60708a;margin-bottom:8px}",
      ".summary-card strong{font-size:21px}",
      ".table-wrap{overflow:auto}",
      "table{width:100%;border-collapse:collapse}",
      "th,td{padding:12px;border-bottom:1px solid #e7ebf2;text-align:start;white-space:nowrap}",
      "th{background:#f7f9fc}",
      ".list{display:grid;gap:14px}",
      ".list-card{border:1px solid #e7ebf2;padding:16px;border-radius:14px}",
      ".list-card h3{margin:0 0 8px}",
      ".list-card p{margin:0}",
      ".alert-card small{text-transform:uppercase;font-weight:bold;color:#b44}",
      "@media print{body{background:#fff}.container{max-width:none;padding:0}section,.hero{box-shadow:none;break-inside:avoid}}",
      "</style>",
      "</head>",
      "<body>",
      "<main class=\"container\">",
      "<header class=\"hero\">",
      "<h1>" +
        escapeHTML(labels.title) +
      "</h1>",
      "<p>" +
        escapeHTML(labels.generated) +
        ": " +
        escapeHTML(
          formatDate(
            data.metadata.generatedAt,
            input.language
          )
        ) +
      "</p>",
      "</header>",
      sections.join(""),
      "</main>",
      "</body>",
      "</html>"
    ].join("");
  }

  function toText(data, options) {
    const markdown = toMarkdown(data, options);

    return markdown
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*/g, "")
      .replace(/\|/g, " ")
      .replace(/---/g, "")
      .replace(/\n{3,}/g, "\n\n");
  }

  function getMimeType(format) {
    const types = {
      json: "application/json;charset=utf-8",
      csv: "text/csv;charset=utf-8",
      md: "text/markdown;charset=utf-8",
      html: "text/html;charset=utf-8",
      txt: "text/plain;charset=utf-8"
    };

    return types[normalizeFormat(format)] ||
      "text/plain;charset=utf-8";
  }

  function render(data, options) {
    const input = resolveOptions(options);
    const selected = selectReportData(
      data,
      input.report
    );

    if (input.format === FORMAT.JSON) {
      return toJSON(
        selected,
        input.prettyJSON
      );
    }

    if (input.format === FORMAT.CSV) {
      return toCSV(
        selected,
        input.report
      );
    }

    if (input.format === FORMAT.MARKDOWN) {
      return toMarkdown(selected, input);
    }

    if (input.format === FORMAT.HTML) {
      return toHTML(selected, input);
    }

    return toText(selected, input);
  }

  function createBlob(content, format) {
    return new Blob(
      [content],
      { type: getMimeType(format) }
    );
  }

  function downloadBlob(blob, filename) {
    if (
      !global.document ||
      !global.URL ||
      typeof global.URL.createObjectURL !== "function"
    ) {
      return false;
    }

    const url = global.URL.createObjectURL(blob);
    const anchor = global.document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";

    global.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    global.setTimeout(function revoke() {
      global.URL.revokeObjectURL(url);
    }, 1000);

    return true;
  }

  function exportReport(options) {
    const input = resolveOptions(options);
    const exportId = createId("budget_export");

    dispatch(EVENTS.EXPORT_STARTED, {
      id: exportId,
      report: input.report,
      format: input.format,
      generatedAt: new Date().toISOString()
    });

    try {
      const dataset = buildDataset(input);
      const content = render(dataset, input);
      const filename = firstDefined(
        input.filename,
        createFilename(input)
      );

      const blob = createBlob(
        content,
        input.format
      );

      const result = {
        id: exportId,
        report: input.report,
        format: input.format,
        filename: filename,
        mimeType: getMimeType(input.format),
        content: content,
        blob: blob,
        size: blob.size,
        dataset: dataset,
        downloaded: false,
        generatedAt: new Date().toISOString()
      };

      if (input.autoDownload) {
        result.downloaded = downloadBlob(
          blob,
          filename
        );
      }

      dispatch(EVENTS.EXPORT_COMPLETED, {
        id: result.id,
        report: result.report,
        format: result.format,
        filename: result.filename,
        size: result.size,
        downloaded: result.downloaded,
        generatedAt: result.generatedAt
      });

      return result;
    } catch (error) {
      dispatch(EVENTS.EXPORT_FAILED, {
        id: exportId,
        report: input.report,
        format: input.format,
        message: error.message,
        generatedAt: new Date().toISOString()
      });

      reportError(
        "EXPORT_FAILED",
        "تعذر تصدير تقرير الميزانية.",
        "Unable to export the budget report.",
        { cause: error.message }
      );

      throw error;
    }
  }

  function exportJSON(options) {
    return exportReport(
      Object.assign({}, options || {}, {
        format: FORMAT.JSON
      })
    );
  }

  function exportCSV(options) {
    return exportReport(
      Object.assign({}, options || {}, {
        format: FORMAT.CSV
      })
    );
  }

  function exportMarkdown(options) {
    return exportReport(
      Object.assign({}, options || {}, {
        format: FORMAT.MARKDOWN
      })
    );
  }

  function exportHTML(options) {
    return exportReport(
      Object.assign({}, options || {}, {
        format: FORMAT.HTML
      })
    );
  }

  function exportText(options) {
    return exportReport(
      Object.assign({}, options || {}, {
        format: FORMAT.TEXT
      })
    );
  }

  function downloadReport(options) {
    const result = exportReport(
      Object.assign({}, options || {}, {
        autoDownload: false
      })
    );

    result.downloaded = downloadBlob(
      result.blob,
      result.filename
    );

    return result;
  }

  function printReport(options) {
    const result = exportHTML(
      Object.assign({}, options || {}, {
        autoDownload: false
      })
    );

    if (
      !global.document ||
      typeof global.open !== "function"
    ) {
      return false;
    }

    const printWindow = global.open(
      "",
      "_blank",
      "noopener,noreferrer"
    );

    if (!printWindow) return false;

    printWindow.document.open();
    printWindow.document.write(
      result.content
    );
    printWindow.document.close();

    global.setTimeout(function printSoon() {
      try {
        printWindow.focus();
        printWindow.print();
      } catch (error) {
        // Ignore browser print restrictions.
      }
    }, 250);

    return true;
  }

  function dispatch(name, detail) {
    try {
      global.dispatchEvent(
        new CustomEvent(name, {
          detail: clone(detail)
        })
      );
    } catch (error) {
      console.warn(
        "[" + ENGINE_NAME + "] Unable to dispatch event:",
        name,
        error
      );
    }
  }

  function reportError(code, messageAr, messageEn, details) {
    const payload = {
      code: code,
      messageAr: messageAr || "",
      messageEn: messageEn || "",
      details: details || null,
      generatedAt: new Date().toISOString()
    };

    dispatch(EVENTS.ERROR, payload);
    return payload;
  }

  function initialize() {
    if (state.initialized) {
      return {
        initialized: true,
        version: VERSION
      };
    }

    state.initialized = true;

    const result = {
      initialized: true,
      engine: ENGINE_NAME,
      version: VERSION,
      generatedAt: new Date().toISOString()
    };

    dispatch(EVENTS.READY, result);
    return result;
  }

  const API = Object.freeze({
    version: VERSION,
    name: ENGINE_NAME,
    events: EVENTS,
    constants: Object.freeze({
      FORMAT: FORMAT,
      REPORT: REPORT,
      DEFAULTS: DEFAULTS
    }),

    initialize: initialize,
    init: initialize,
    buildDataset: buildDataset,
    selectReportData: selectReportData,
    render: render,
    exportReport: exportReport,
    exportJSON: exportJSON,
    exportCSV: exportCSV,
    exportMarkdown: exportMarkdown,
    exportHTML: exportHTML,
    exportText: exportText,
    downloadReport: downloadReport,
    printReport: printReport,
    createBlob: createBlob,
    downloadBlob: downloadBlob,
    createFilename: createFilename,

    utils: Object.freeze({
      isObject: isObject,
      asArray: asArray,
      clone: clone,
      firstDefined: firstDefined,
      toNumber: toNumber,
      toNonNegative: toNonNegative,
      round: round,
      safeDate: safeDate,
      normalizeLanguage: normalizeLanguage,
      normalizeCurrency: normalizeCurrency,
      normalizeFormat: normalizeFormat,
      normalizeReport: normalizeReport,
      escapeHTML: escapeHTML,
      escapeCSV: escapeCSV,
      formatMoney: formatMoney,
      formatDate: formatDate,
      flattenObject: flattenObject,
      arrayToCSV: arrayToCSV,
      toJSON: toJSON,
      toCSV: toCSV,
      toMarkdown: toMarkdown,
      toHTML: toHTML,
      toText: toText,
      getMimeType: getMimeType
    })
  });

  global.TIC = global.TIC || {};
  global.TIC.Features = global.TIC.Features || {};
  global.TIC.Features.budgetExportEngine = API;
  global.TICBudgetExportEngine = API;

  if (
    global.document &&
    global.document.readyState === "loading"
  ) {
    global.document.addEventListener(
      "DOMContentLoaded",
      function initializeOnReady() {
        try {
          initialize();
        } catch (error) {
          console.error(
            "[" + ENGINE_NAME + "] Initialization failed.",
            error
          );
        }
      },
      { once: true }
    );
  } else {
    global.setTimeout(function initializeSoon() {
      try {
        initialize();
      } catch (error) {
        console.error(
          "[" + ENGINE_NAME + "] Initialization failed.",
          error
        );
      }
    }, 0);
  }
})(window);
