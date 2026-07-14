/* =========================================================
   Travel Intelligence Center
   Document Reader Service V1.0.0

   File Path:
   js/features/document-reader.js

   Purpose:
   - Unified document-reading layer for travel tickets and hotel bookings.
   - Accepts image and PDF files.
   - Extracts text using any available OCR/PDF provider.
   - Provides a stable API for ticket and hotel import modules.
   - Includes safe fallbacks when no OCR engine is installed.
   - Does not block manual trip entry if smart reading is unavailable.

   Optional Providers:
   - window.Tesseract
   - window.pdfjsLib
   - window.TIC.DocumentAI
   - window.TICDocumentAI
   - Browser text extraction adapters registered through registerProvider()

   Dependencies:
   - None required.
   - Optional OCR/PDF libraries may be connected later.

   Global APIs:
   - window.TIC.Features.DocumentReader
   - window.TICDocumentReader
========================================================= */

(function (window) {
  "use strict";

  const FEATURE_ID = "document-reader";
  const FEATURE_VERSION = "1.0.0";

  const SUPPORTED_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif"
  ]);

  const SUPPORTED_PDF_TYPES = new Set([
    "application/pdf"
  ]);

  const MAX_FILE_SIZE = 20 * 1024 * 1024;

  const state = {
    initialized: false,
    providers: new Map(),
    subscribers: new Set(),
    lastResult: null
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

  const text = (value) =>
    String(value ?? "").trim();

  const normalizeWhitespace = (value) =>
    text(value)
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const emit = (type, detail = {}) => {
    const payload = {
      type,
      feature: FEATURE_ID,
      timestamp: new Date().toISOString(),
      ...clone(detail)
    };

    state.subscribers.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error(
          "TIC Document Reader subscriber error:",
          error
        );
      }
    });

    window.dispatchEvent(
      new CustomEvent(`tic:document-reader:${type}`, {
        detail: payload
      })
    );

    return payload;
  };

  const getFileType = (file) => {
    const mimeType = text(file?.type).toLowerCase();
    const fileName = text(file?.name).toLowerCase();

    if (
      SUPPORTED_PDF_TYPES.has(mimeType) ||
      fileName.endsWith(".pdf")
    ) {
      return "pdf";
    }

    if (
      SUPPORTED_IMAGE_TYPES.has(mimeType) ||
      /\.(jpe?g|png|webp|heic|heif)$/i.test(fileName)
    ) {
      return "image";
    }

    return "unknown";
  };

  const validateFile = (file) => {
    const errors = [];

    if (!(file instanceof Blob)) {
      errors.push("الملف غير صالح.");
    }

    if (file?.size > MAX_FILE_SIZE) {
      errors.push("حجم الملف أكبر من 20 MB.");
    }

    const fileType = getFileType(file);

    if (fileType === "unknown") {
      errors.push(
        "نوع الملف غير مدعوم. استخدم صورة أو PDF."
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      fileType,
      maxFileSize: MAX_FILE_SIZE
    };
  };

  const fileToDataURL = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);

      reader.onerror = () =>
        reject(
          reader.error ||
          new Error("تعذر قراءة الملف.")
        );

      reader.readAsDataURL(file);
    });

  const fileToArrayBuffer = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);

      reader.onerror = () =>
        reject(
          reader.error ||
          new Error("تعذر قراءة الملف.")
        );

      reader.readAsArrayBuffer(file);
    });

  const createFileMetadata = (file, fileType) => ({
    name: text(file?.name),
    type: text(file?.type),
    size: Number(file?.size || 0),
    lastModified:
      Number(file?.lastModified || 0),
    fileType,
    readAt: new Date().toISOString()
  });

  const resolveDocumentAI = () =>
    window.TIC?.DocumentAI ||
    window.TICDocumentAI ||
    null;

  const readWithDocumentAI = async (
    file,
    context = {}
  ) => {
    const provider = resolveDocumentAI();

    if (!provider) {
      throw new Error(
        "Document AI provider is unavailable."
      );
    }

    if (typeof provider.read === "function") {
      return provider.read(file, context);
    }

    if (typeof provider.extractText === "function") {
      return provider.extractText(file, context);
    }

    throw new Error(
      "Document AI provider does not expose a supported read method."
    );
  };

  const readImageWithTesseract = async (
    file,
    context = {}
  ) => {
    const Tesseract = window.Tesseract;

    if (
      !Tesseract ||
      typeof Tesseract.recognize !== "function"
    ) {
      throw new Error(
        "Tesseract OCR is unavailable."
      );
    }

    const language =
      context.language ||
      context.languages ||
      "eng+ara";

    const result = await Tesseract.recognize(
      file,
      language,
      {
        logger(message) {
          emit("progress", {
            provider: "tesseract",
            message
          });
        }
      }
    );

    return {
      text:
        result?.data?.text ||
        result?.text ||
        "",
      confidence:
        result?.data?.confidence ??
        null,
      raw: result
    };
  };

  const readPDFWithPDFJS = async (
    file,
    context = {}
  ) => {
    const pdfjsLib = window.pdfjsLib;

    if (
      !pdfjsLib ||
      typeof pdfjsLib.getDocument !== "function"
    ) {
      throw new Error(
        "PDF.js is unavailable."
      );
    }

    const arrayBuffer =
      await fileToArrayBuffer(file);

    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer
    });

    const pdf = await loadingTask.promise;
    const pages = [];
    const maxPages = Math.min(
      Number(context.maxPages || pdf.numPages),
      pdf.numPages
    );

    for (
      let pageNumber = 1;
      pageNumber <= maxPages;
      pageNumber += 1
    ) {
      const page =
        await pdf.getPage(pageNumber);

      const content =
        await page.getTextContent();

      const pageText = content.items
        .map((item) => text(item.str))
        .filter(Boolean)
        .join(" ");

      pages.push(pageText);

      emit("progress", {
        provider: "pdfjs",
        page: pageNumber,
        totalPages: maxPages
      });
    }

    return {
      text: pages.join("\n\n"),
      pageCount: pdf.numPages,
      pages
    };
  };

  const registerBuiltInProviders = () => {
    if (
      resolveDocumentAI() &&
      !state.providers.has("document-ai")
    ) {
      state.providers.set("document-ai", {
        id: "document-ai",
        priority: 100,
        supports: () => true,
        read: readWithDocumentAI
      });
    }

    if (
      window.pdfjsLib &&
      !state.providers.has("pdfjs")
    ) {
      state.providers.set("pdfjs", {
        id: "pdfjs",
        priority: 80,
        supports: ({ fileType }) =>
          fileType === "pdf",
        read: readPDFWithPDFJS
      });
    }

    if (
      window.Tesseract &&
      !state.providers.has("tesseract")
    ) {
      state.providers.set("tesseract", {
        id: "tesseract",
        priority: 70,
        supports: ({ fileType }) =>
          fileType === "image",
        read: readImageWithTesseract
      });
    }
  };

  const getProviders = (fileType, context = {}) => {
    registerBuiltInProviders();

    return Array.from(state.providers.values())
      .filter((provider) => {
        try {
          return (
            typeof provider.read === "function" &&
            (
              typeof provider.supports !== "function" ||
              provider.supports({
                fileType,
                context
              }) !== false
            )
          );
        } catch (error) {
          return false;
        }
      })
      .sort(
        (a, b) =>
          Number(b.priority || 0) -
          Number(a.priority || 0)
      );
  };

  const normalizeProviderResult = (
    result,
    providerId,
    metadata
  ) => {
    if (typeof result === "string") {
      return {
        success: Boolean(text(result)),
        text: normalizeWhitespace(result),
        confidence: null,
        provider: providerId,
        metadata,
        raw: null
      };
    }

    const source = isObject(result)
      ? result
      : {};

    const extractedText = normalizeWhitespace(
      source.text ||
      source.content ||
      source.extractedText ||
      source.rawText ||
      ""
    );

    return {
      success:
        source.success !== false &&
        Boolean(extractedText),
      text: extractedText,
      confidence:
        source.confidence ??
        source.score ??
        null,
      provider:
        source.provider ||
        providerId,
      metadata: {
        ...metadata,
        ...(isObject(source.metadata)
          ? source.metadata
          : {})
      },
      pages:
        Array.isArray(source.pages)
          ? clone(source.pages)
          : undefined,
      pageCount:
        source.pageCount ??
        undefined,
      raw:
        source.raw ??
        source
    };
  };

  const createUnavailableResult = (
    metadata,
    attempts = []
  ) => ({
    success: false,
    text: "",
    confidence: null,
    provider: null,
    metadata,
    attempts,
    reason: "reader-unavailable",
    message:
      "لا يوجد محرك OCR أو قارئ PDF متصل حالياً. يمكنك إدخال البيانات يدوياً."
  });

  const DocumentReader = {
    id: FEATURE_ID,
    version: FEATURE_VERSION,

    init() {
      if (state.initialized) {
        registerBuiltInProviders();
        return this.diagnostics();
      }

      registerBuiltInProviders();

      state.initialized = true;

      emit("initialized", {
        version: FEATURE_VERSION,
        providers: this.listProviders()
      });

      return this.diagnostics();
    },

    registerProvider(provider) {
      if (
        !isObject(provider) ||
        !text(provider.id) ||
        typeof provider.read !== "function"
      ) {
        throw new TypeError(
          "TIC Document Reader provider must include id and read()."
        );
      }

      const normalized = {
        id: text(provider.id),
        priority: Number(provider.priority || 0),
        supports:
          typeof provider.supports === "function"
            ? provider.supports
            : () => true,
        read: provider.read
      };

      state.providers.set(
        normalized.id,
        normalized
      );

      emit("provider-registered", {
        providerId: normalized.id
      });

      return () =>
        this.unregisterProvider(
          normalized.id
        );
    },

    unregisterProvider(providerId) {
      const removed = state.providers.delete(
        text(providerId)
      );

      if (removed) {
        emit("provider-unregistered", {
          providerId: text(providerId)
        });
      }

      return removed;
    },

    listProviders() {
      registerBuiltInProviders();

      return Array.from(
        state.providers.values()
      )
        .sort(
          (a, b) =>
            Number(b.priority || 0) -
            Number(a.priority || 0)
        )
        .map((provider) => ({
          id: provider.id,
          priority:
            Number(provider.priority || 0)
        }));
    },

    supports(file) {
      const validation =
        validateFile(file);

      if (!validation.valid) {
        return false;
      }

      return (
        getProviders(
          validation.fileType
        ).length > 0
      );
    },

    validateFile,

    async read(file, context = {}) {
      this.init();

      const validation =
        validateFile(file);

      if (!validation.valid) {
        const error = new Error(
          validation.errors.join(" ")
        );

        error.code =
          "INVALID_DOCUMENT_FILE";

        error.details =
          validation;

        throw error;
      }

      const metadata =
        createFileMetadata(
          file,
          validation.fileType
        );

      const providers = getProviders(
        validation.fileType,
        context
      );

      const attempts = [];

      emit("read-started", {
        metadata,
        providerCount:
          providers.length
      });

      for (const provider of providers) {
        try {
          emit("provider-started", {
            providerId: provider.id,
            metadata
          });

          const result =
            await provider.read(
              file,
              {
                ...context,
                fileType:
                  validation.fileType,
                metadata
              }
            );

          const normalized =
            normalizeProviderResult(
              result,
              provider.id,
              metadata
            );

          attempts.push({
            provider: provider.id,
            success:
              normalized.success
          });

          if (
            normalized.success ||
            normalized.text
          ) {
            state.lastResult =
              normalized;

            emit("read-completed", {
              provider:
                normalized.provider,
              metadata,
              confidence:
                normalized.confidence,
              textLength:
                normalized.text.length
            });

            return clone(normalized);
          }
        } catch (error) {
          attempts.push({
            provider: provider.id,
            success: false,
            error:
              error?.message ||
              String(error)
          });

          emit("provider-failed", {
            providerId: provider.id,
            message:
              error?.message ||
              String(error)
          });
        }
      }

      const unavailable =
        createUnavailableResult(
          metadata,
          attempts
        );

      state.lastResult =
        unavailable;

      emit("read-unavailable", {
        metadata,
        attempts
      });

      return clone(unavailable);
    },

    async extractText(file, context = {}) {
      const result =
        await this.read(
          file,
          context
        );

      return result.text || "";
    },

    async createPreview(file) {
      const validation =
        validateFile(file);

      if (!validation.valid) {
        throw new Error(
          validation.errors.join(" ")
        );
      }

      if (
        validation.fileType === "image"
      ) {
        return {
          type: "image",
          url:
            await fileToDataURL(file),
          metadata:
            createFileMetadata(
              file,
              validation.fileType
            )
        };
      }

      return {
        type: "pdf",
        url:
          URL.createObjectURL(file),
        metadata:
          createFileMetadata(
            file,
            validation.fileType
          ),
        revoke() {
          URL.revokeObjectURL(this.url);
        }
      };
    },

    getLastResult() {
      return clone(
        state.lastResult
      );
    },

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError(
          "TIC Document Reader subscriber must be a function."
        );
      }

      state.subscribers.add(listener);

      return () =>
        state.subscribers.delete(listener);
    },

    destroy() {
      state.providers.clear();
      state.subscribers.clear();
      state.lastResult = null;
      state.initialized = false;

      emit("destroyed");

      return true;
    },

    diagnostics() {
      registerBuiltInProviders();

      return {
        id: this.id,
        version: this.version,
        initialized:
          state.initialized,
        providerCount:
          state.providers.size,
        providers:
          this.listProviders(),
        tesseractAvailable:
          Boolean(window.Tesseract),
        pdfjsAvailable:
          Boolean(window.pdfjsLib),
        documentAIAvailable:
          Boolean(resolveDocumentAI()),
        maxFileSize:
          MAX_FILE_SIZE,
        supportedImageTypes:
          Array.from(
            SUPPORTED_IMAGE_TYPES
          ),
        supportedPDFTypes:
          Array.from(
            SUPPORTED_PDF_TYPES
          ),
        hasLastResult:
          Boolean(state.lastResult),
        subscriberCount:
          state.subscribers.size
      };
    }
  };

  window.TIC = window.TIC || {};
  window.TIC.Features =
    window.TIC.Features || {};

  window.TIC.Features.DocumentReader =
    DocumentReader;

  window.TICDocumentReader =
    DocumentReader;

  DocumentReader.init();
})(window);
