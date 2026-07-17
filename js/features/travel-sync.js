/* =========================================================
   Travel Intelligence Center
   Travel Sync Engine V1.0.0

   File Path:
   js/features/travel-sync.js

   Purpose:
   - Central synchronization layer for Travel Intelligence Center.
   - Keeps local Store data synchronized across browser tabs and sessions.
   - Supports offline-first operation, change queues, conflict detection,
     snapshots, revisions, backup transport hooks, and future cloud adapters.
   - Integrates safely with Store, Storage, Events, UI, TravelBrain,
     TravelAssistant, and TravelImport without modifying stable modules.
   - Uses BroadcastChannel when available and localStorage events as fallback.
   - Does not require an external server or third-party library.
   - Cloud synchronization remains adapter-based and disabled by default.

   Recommended Load Order:
   1) js/config.js
   2) js/storage.js
   3) js/store.js
   4) js/events.js
   5) js/analytics.js
   6) js/features/travel-brain.js
   7) js/features/travel-assistant.js
   8) js/features/travel-import.js
   9) js/features/travel-sync.js

   Public Global:
   - window.TravelSync

   Main APIs:
   - TravelSync.init(options)
   - TravelSync.sync(options)
   - TravelSync.push(options)
   - TravelSync.pull(options)
   - TravelSync.queueChange(change)
   - TravelSync.registerAdapter(name, adapter)
   - TravelSync.setActiveAdapter(name)
   - TravelSync.createSnapshot()
   - TravelSync.restoreSnapshot(snapshot, options)
   - TravelSync.getStatus()
   - TravelSync.getQueue()
   - TravelSync.subscribe(listener)
   - TravelSync.destroy()
   ========================================================= */

(function travelSyncFactory(global) {
  "use strict";

  if (!global || global.TravelSync) {
    return;
  }

  var VERSION = "1.0.0";
  var MODULE_NAME = "TravelSync";

  var STORAGE_KEYS = Object.freeze({
    META: "tic_travel_sync_meta_v1",
    QUEUE: "tic_travel_sync_queue_v1",
    SNAPSHOT: "tic_travel_sync_snapshot_v1",
    BROADCAST: "tic_travel_sync_broadcast_v1"
  });

  var CHANNEL_NAME = "tic_travel_sync_channel_v1";
  var DEFAULT_ADAPTER = "local";
  var MAX_QUEUE_SIZE = 500;
  var MAX_HISTORY_SIZE = 100;
  var DEFAULT_DEBOUNCE_MS = 500;
  var DEFAULT_SYNC_INTERVAL_MS = 60000;
  var DEFAULT_CONFLICT_STRATEGY = "latest";
  var SNAPSHOT_SCHEMA_VERSION = 1;

  var runtime = {
    initialized: false,
    destroyed: false,
    syncing: false,
    online: typeof global.navigator !== "undefined"
      ? global.navigator.onLine !== false
      : true,
    deviceId: "",
    sessionId: "",
    revision: 0,
    lastSyncAt: null,
    lastPushAt: null,
    lastPullAt: null,
    lastLocalChangeAt: null,
    lastRemoteChangeAt: null,
    lastError: null,
    activeAdapter: DEFAULT_ADAPTER,
    adapters: new Map(),
    queue: [],
    history: [],
    listeners: new Set(),
    eventUnsubscribers: [],
    storeUnsubscribe: null,
    channel: null,
    syncTimer: null,
    debounceTimer: null,
    applyingRemoteState: false,
    sequence: 0,
    options: {}
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function asObject(value) {
    return isObject(value) ? value : {};
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asString(value, fallback) {
    if (value === null || value === undefined) {
      return fallback || "";
    }

    var text = String(value).trim();
    return text || fallback || "";
  }

  function asNumber(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number)
      ? number
      : (Number.isFinite(fallback) ? fallback : 0);
  }

  function asBoolean(value, fallback) {
    if (typeof value === "boolean") {
      return value;
    }

    if (value === "true" || value === "1" || value === 1) {
      return true;
    }

    if (value === "false" || value === "0" || value === 0) {
      return false;
    }

    return Boolean(fallback);
  }

  function safeClone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  function safeCall(fn, fallback, context, args) {
    if (typeof fn !== "function") {
      return fallback;
    }

    try {
      var result = fn.apply(context || null, asArray(args));
      return result === undefined ? fallback : result;
    } catch (error) {
      runtime.lastError = error;
      return fallback;
    }
  }

  function createId(prefix) {
    runtime.sequence += 1;

    return [
      prefix || "sync",
      Date.now().toString(36),
      runtime.sequence.toString(36),
      Math.random().toString(36).slice(2, 8)
    ].join("_");
  }

  function hashString(value) {
    var text = asString(value);
    var hash = 2166136261;

    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash +=
        (hash << 1) +
        (hash << 4) +
        (hash << 7) +
        (hash << 8) +
        (hash << 24);
    }

    return (hash >>> 0).toString(16);
  }

  function stableSortObject(value) {
    if (Array.isArray(value)) {
      return value.map(stableSortObject);
    }

    if (!isObject(value)) {
      return value;
    }

    var sorted = {};

    Object.keys(value)
      .sort()
      .forEach(function assign(key) {
        sorted[key] = stableSortObject(value[key]);
      });

    return sorted;
  }

  function checksum(value) {
    try {
      return hashString(JSON.stringify(stableSortObject(value)));
    } catch (error) {
      return hashString(String(value));
    }
  }

  function getStore() {
    return global.Store || global.TravelStore || global.AppStore || null;
  }

  function getStorage() {
    return global.Storage || global.TravelStorage || global.AppStorage || null;
  }

  function getEvents() {
    return global.Events || global.EventBus || global.TravelEvents || null;
  }

  function getUI() {
    return global.UI || global.TravelUI || global.AppUI || null;
  }

  function getBrain() {
    return global.TravelBrain || null;
  }

  function getAssistant() {
    return global.TravelAssistant || null;
  }

  function readStoreState() {
    var store = getStore();
    var value = null;

    if (store) {
      value =
        safeCall(store.getState, null, store) ||
        safeCall(store.getSnapshot, null, store) ||
        safeCall(store.getData, null, store) ||
        safeCall(store.read, null, store);

      if (!value && isObject(store.state)) {
        value = store.state;
      }

      if (!value && isObject(store.data)) {
        value = store.data;
      }
    }

    return safeClone(asObject(value));
  }

  function writeStoreState(nextState, options) {
    var settings = asObject(options);
    var store = getStore();
    var success = false;
    var method = "none";

    if (!store) {
      return {
        success: false,
        method: method,
        error: new Error("Store integration is unavailable.")
      };
    }

    runtime.applyingRemoteState = true;

    try {
      if (typeof store.replaceState === "function") {
        success = Boolean(
          safeCall(store.replaceState, false, store, [
            safeClone(nextState),
            {
              source: asString(settings.source, "travel-sync"),
              silent: settings.silent === true
            }
          ])
        );
        method = "replaceState";
      }

      if (!success && typeof store.setState === "function") {
        success = Boolean(
          safeCall(store.setState, false, store, [
            safeClone(nextState),
            {
              source: asString(settings.source, "travel-sync"),
              silent: settings.silent === true
            }
          ])
        );
        method = "setState";
      }

      if (!success && typeof store.restore === "function") {
        success = Boolean(
          safeCall(store.restore, false, store, [
            safeClone(nextState),
            {
              source: asString(settings.source, "travel-sync")
            }
          ])
        );
        method = "restore";
      }

      if (!success && typeof store.importData === "function") {
        success = Boolean(
          safeCall(store.importData, false, store, [
            safeClone(nextState),
            {
              source: asString(settings.source, "travel-sync")
            }
          ])
        );
        method = "importData";
      }

      if (!success && typeof store.dispatch === "function") {
        success = Boolean(
          safeCall(store.dispatch, false, store, [{
            type: "SYNC_REPLACE_STATE",
            payload: safeClone(nextState),
            meta: {
              source: asString(settings.source, "travel-sync"),
              remote: settings.remote === true
            }
          }])
        );
        method = "dispatch";
      }

      if (!success && settings.allowDirectState === true) {
        if (isObject(store.state)) {
          Object.keys(store.state).forEach(function remove(key) {
            delete store.state[key];
          });

          Object.assign(store.state, safeClone(nextState));
          success = true;
          method = "direct-state";
        } else if (isObject(store.data)) {
          Object.keys(store.data).forEach(function remove(key) {
            delete store.data[key];
          });

          Object.assign(store.data, safeClone(nextState));
          success = true;
          method = "direct-data";
        }
      }
    } finally {
      runtime.applyingRemoteState = false;
    }

    return {
      success: success,
      method: method,
      error: success
        ? null
        : new Error("No compatible Store write method accepted sync state.")
    };
  }

  function storageGet(key, fallback) {
    var storage = getStorage();

    if (storage) {
      var value =
        safeCall(storage.get, undefined, storage, [key]) ||
        safeCall(storage.read, undefined, storage, [key]) ||
        safeCall(storage.load, undefined, storage, [key]);

      if (value !== undefined && value !== null) {
        return value;
      }
    }

    try {
      if (global.localStorage) {
        var raw = global.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      }
    } catch (error) {
      runtime.lastError = error;
    }

    return fallback;
  }

  function storageSet(key, value) {
    var storage = getStorage();

    if (storage) {
      var stored =
        safeCall(storage.set, false, storage, [key, value]) ||
        safeCall(storage.write, false, storage, [key, value]) ||
        safeCall(storage.save, false, storage, [key, value]);

      if (stored) {
        return true;
      }
    }

    try {
      if (global.localStorage) {
        global.localStorage.setItem(key, JSON.stringify(value));
        return true;
      }
    } catch (error) {
      runtime.lastError = error;
    }

    return false;
  }

  function storageRemove(key) {
    var storage = getStorage();

    if (storage) {
      var removed =
        safeCall(storage.remove, false, storage, [key]) ||
        safeCall(storage.delete, false, storage, [key]);

      if (removed) {
        return true;
      }
    }

    try {
      if (global.localStorage) {
        global.localStorage.removeItem(key);
        return true;
      }
    } catch (error) {
      runtime.lastError = error;
    }

    return false;
  }

  function emit(name, payload) {
    var events = getEvents();

    if (!events) {
      return false;
    }

    return Boolean(
      safeCall(events.emit, false, events, [name, payload]) ||
      safeCall(events.publish, false, events, [name, payload]) ||
      safeCall(events.dispatch, false, events, [name, payload])
    );
  }

  function notify(reason, payload) {
    var status = getStatus();

    runtime.listeners.forEach(function notifyListener(listener) {
      try {
        listener(status, {
          reason: reason,
          payload: safeClone(payload),
          generatedAt: nowIso()
        });
      } catch (error) {
        runtime.lastError = error;
      }
    });

    emit("travel-sync:updated", {
      reason: reason,
      payload: safeClone(payload),
      status: {
        syncing: runtime.syncing,
        online: runtime.online,
        revision: runtime.revision,
        queueSize: runtime.queue.length,
        activeAdapter: runtime.activeAdapter
      },
      generatedAt: nowIso()
    });
  }

  function addHistory(type, details) {
    runtime.history.push({
      id: createId("history"),
      type: type,
      details: safeClone(details),
      createdAt: nowIso()
    });

    if (runtime.history.length > MAX_HISTORY_SIZE) {
      runtime.history = runtime.history.slice(-MAX_HISTORY_SIZE);
    }
  }

  function persistMeta() {
    return storageSet(STORAGE_KEYS.META, {
      version: VERSION,
      deviceId: runtime.deviceId,
      sessionId: runtime.sessionId,
      revision: runtime.revision,
      activeAdapter: runtime.activeAdapter,
      lastSyncAt: runtime.lastSyncAt,
      lastPushAt: runtime.lastPushAt,
      lastPullAt: runtime.lastPullAt,
      lastLocalChangeAt: runtime.lastLocalChangeAt,
      lastRemoteChangeAt: runtime.lastRemoteChangeAt,
      history: runtime.history.slice(-MAX_HISTORY_SIZE),
      updatedAt: nowIso()
    });
  }

  function restoreMeta() {
    var meta = asObject(storageGet(STORAGE_KEYS.META, {}));

    runtime.deviceId = asString(meta.deviceId, createId("device"));
    runtime.sessionId = createId("session");
    runtime.revision = asNumber(meta.revision, 0);
    runtime.activeAdapter = asString(
      meta.activeAdapter,
      DEFAULT_ADAPTER
    );
    runtime.lastSyncAt = meta.lastSyncAt || null;
    runtime.lastPushAt = meta.lastPushAt || null;
    runtime.lastPullAt = meta.lastPullAt || null;
    runtime.lastLocalChangeAt = meta.lastLocalChangeAt || null;
    runtime.lastRemoteChangeAt = meta.lastRemoteChangeAt || null;
    runtime.history = asArray(meta.history).slice(-MAX_HISTORY_SIZE);

    return meta;
  }

  function persistQueue() {
    return storageSet(STORAGE_KEYS.QUEUE, {
      version: VERSION,
      savedAt: nowIso(),
      queue: runtime.queue.slice(-MAX_QUEUE_SIZE)
    });
  }

  function restoreQueue() {
    var saved = asObject(storageGet(STORAGE_KEYS.QUEUE, {}));
    runtime.queue = asArray(saved.queue).slice(-MAX_QUEUE_SIZE);
    return runtime.queue;
  }

  function createSnapshot(options) {
    var settings = asObject(options);
    var data = settings.state
      ? safeClone(settings.state)
      : readStoreState();

    var snapshot = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      app: "Travel Intelligence Center",
      module: MODULE_NAME,
      moduleVersion: VERSION,
      id: createId("snapshot"),
      deviceId: runtime.deviceId,
      sessionId: runtime.sessionId,
      revision: asNumber(settings.revision, runtime.revision),
      generatedAt: nowIso(),
      checksum: checksum(data),
      data: data,
      metadata: Object.assign({
        source: asString(settings.source, "local"),
        reason: asString(settings.reason, "manual"),
        queueSize: runtime.queue.length
      }, asObject(settings.metadata))
    };

    if (settings.persist !== false) {
      storageSet(STORAGE_KEYS.SNAPSHOT, snapshot);
    }

    return safeClone(snapshot);
  }

  function getStoredSnapshot() {
    var snapshot = storageGet(STORAGE_KEYS.SNAPSHOT, null);
    return snapshot ? safeClone(snapshot) : null;
  }

  function validateSnapshot(snapshot) {
    var source = asObject(snapshot);
    var errors = [];
    var warnings = [];

    if (!source.data || !isObject(source.data)) {
      errors.push({
        code: "INVALID_DATA",
        message: "Snapshot data is missing or invalid."
      });
    }

    if (
      source.schemaVersion &&
      asNumber(source.schemaVersion, 0) > SNAPSHOT_SCHEMA_VERSION
    ) {
      warnings.push({
        code: "NEWER_SCHEMA",
        message: "Snapshot was created with a newer schema version."
      });
    }

    if (source.checksum && source.data) {
      var actualChecksum = checksum(source.data);

      if (actualChecksum !== source.checksum) {
        errors.push({
          code: "CHECKSUM_MISMATCH",
          expected: source.checksum,
          actual: actualChecksum,
          message: "Snapshot checksum validation failed."
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings,
      checkedAt: nowIso()
    };
  }

  function restoreSnapshot(snapshot, options) {
    var settings = asObject(options);
    var source = asObject(snapshot);
    var validation = validateSnapshot(source);

    if (!validation.valid) {
      return Promise.resolve({
        success: false,
        validation: validation,
        error: {
          name: "SnapshotValidationError",
          message: "Snapshot is not valid."
        }
      });
    }

    var result = writeStoreState(source.data, {
      source: asString(settings.source, "travel-sync-restore"),
      remote: settings.remote === true,
      silent: settings.silent === true,
      allowDirectState: settings.allowDirectState === true
    });

    if (!result.success) {
      return Promise.resolve({
        success: false,
        validation: validation,
        error: {
          name: "SnapshotRestoreError",
          message: result.error.message
        }
      });
    }

    runtime.revision = Math.max(
      runtime.revision,
      asNumber(source.revision, runtime.revision)
    );

    if (settings.remote === true) {
      runtime.lastRemoteChangeAt = nowIso();
    } else {
      runtime.lastLocalChangeAt = nowIso();
    }

    persistMeta();
    refreshIntelligence("snapshot-restored");

    addHistory("snapshot-restored", {
      snapshotId: source.id,
      method: result.method,
      remote: settings.remote === true
    });

    notify("snapshot-restored", {
      snapshotId: source.id,
      method: result.method,
      revision: runtime.revision
    });

    return Promise.resolve({
      success: true,
      validation: validation,
      method: result.method,
      revision: runtime.revision,
      snapshotId: source.id
    });
  }

  function normalizeChange(change) {
    var source = asObject(change);

    return {
      id: asString(source.id, createId("change")),
      type: asString(source.type, "state-change"),
      branch: asString(source.branch, ""),
      entityId: asString(source.entityId, ""),
      operation: asString(source.operation, "update"),
      payload: source.payload === undefined
        ? null
        : safeClone(source.payload),
      revision: asNumber(source.revision, runtime.revision + 1),
      deviceId: asString(source.deviceId, runtime.deviceId),
      sessionId: asString(source.sessionId, runtime.sessionId),
      createdAt: asString(source.createdAt, nowIso()),
      checksum: asString(
        source.checksum,
        checksum(source.payload === undefined ? source : source.payload)
      ),
      metadata: safeClone(asObject(source.metadata)),
      attempts: asNumber(source.attempts, 0),
      status: asString(source.status, "pending")
    };
  }

  function queueChange(change, options) {
    var settings = asObject(options);
    var normalized = normalizeChange(change);

    var duplicate = runtime.queue.some(function find(item) {
      return item.id === normalized.id ||
        (
          item.checksum === normalized.checksum &&
          item.branch === normalized.branch &&
          item.entityId === normalized.entityId &&
          item.operation === normalized.operation
        );
    });

    if (duplicate && settings.allowDuplicate !== true) {
      return {
        success: false,
        duplicate: true,
        change: safeClone(normalized),
        queueSize: runtime.queue.length
      };
    }

    runtime.revision = Math.max(
      runtime.revision + 1,
      normalized.revision
    );

    normalized.revision = runtime.revision;
    runtime.queue.push(normalized);

    if (runtime.queue.length > MAX_QUEUE_SIZE) {
      runtime.queue = runtime.queue.slice(-MAX_QUEUE_SIZE);
    }

    runtime.lastLocalChangeAt = nowIso();

    persistQueue();
    persistMeta();

    addHistory("change-queued", {
      changeId: normalized.id,
      type: normalized.type,
      branch: normalized.branch,
      operation: normalized.operation,
      revision: normalized.revision
    });

    notify("change-queued", normalized);

    broadcast({
      type: "change-announcement",
      change: normalized
    });

    scheduleSync("queue-change");

    return {
      success: true,
      duplicate: false,
      change: safeClone(normalized),
      queueSize: runtime.queue.length
    };
  }

  function clearQueue(options) {
    var settings = asObject(options);
    var removed = runtime.queue.length;

    if (settings.status) {
      runtime.queue = runtime.queue.filter(function retain(change) {
        return change.status !== settings.status;
      });
      removed -= runtime.queue.length;
    } else {
      runtime.queue = [];
    }

    persistQueue();

    addHistory("queue-cleared", {
      removed: removed,
      filterStatus: settings.status || null
    });

    notify("queue-cleared", {
      removed: removed,
      queueSize: runtime.queue.length
    });

    return removed;
  }

  function getQueue(options) {
    var settings = asObject(options);
    var queue = runtime.queue.slice();

    if (settings.status) {
      queue = queue.filter(function byStatus(change) {
        return change.status === settings.status;
      });
    }

    if (settings.branch) {
      queue = queue.filter(function byBranch(change) {
        return change.branch === settings.branch;
      });
    }

    if (settings.limit) {
      queue = queue.slice(
        -Math.max(0, asNumber(settings.limit, queue.length))
      );
    }

    return safeClone(queue);
  }

  function localAdapter() {
    return {
      name: DEFAULT_ADAPTER,
      type: "local",
      isAvailable: function isAvailable() {
        return true;
      },
      push: function pushLocal(payload) {
        var snapshot = payload.snapshot || payload;
        storageSet(STORAGE_KEYS.SNAPSHOT, snapshot);

        return Promise.resolve({
          success: true,
          revision: snapshot.revision,
          snapshotId: snapshot.id,
          storedAt: nowIso()
        });
      },
      pull: function pullLocal() {
        var snapshot = getStoredSnapshot();

        return Promise.resolve({
          success: true,
          empty: !snapshot,
          snapshot: snapshot,
          pulledAt: nowIso()
        });
      },
      clear: function clearLocal() {
        storageRemove(STORAGE_KEYS.SNAPSHOT);

        return Promise.resolve({
          success: true
        });
      }
    };
  }

  function registerAdapter(name, adapter) {
    var adapterName = asString(name);

    if (!adapterName) {
      throw new TypeError("TravelSync.registerAdapter requires a name.");
    }

    if (!isObject(adapter)) {
      throw new TypeError("TravelSync.registerAdapter requires an adapter object.");
    }

    if (
      typeof adapter.push !== "function" &&
      typeof adapter.pull !== "function"
    ) {
      throw new TypeError(
        "Sync adapter must provide push() or pull()."
      );
    }

    runtime.adapters.set(adapterName, Object.assign({
      name: adapterName,
      type: "custom",
      isAvailable: function isAvailable() {
        return true;
      }
    }, adapter));

    notify("adapter-registered", {
      name: adapterName,
      type: runtime.adapters.get(adapterName).type
    });

    return true;
  }

  function unregisterAdapter(name) {
    var adapterName = asString(name);

    if (adapterName === DEFAULT_ADAPTER) {
      return false;
    }

    var removed = runtime.adapters.delete(adapterName);

    if (
      removed &&
      runtime.activeAdapter === adapterName
    ) {
      runtime.activeAdapter = DEFAULT_ADAPTER;
      persistMeta();
    }

    notify("adapter-unregistered", {
      name: adapterName,
      removed: removed
    });

    return removed;
  }

  function getAdapter(name) {
    return runtime.adapters.get(
      asString(name, runtime.activeAdapter)
    ) || runtime.adapters.get(DEFAULT_ADAPTER) || null;
  }

  function setActiveAdapter(name) {
    var adapterName = asString(name);

    if (!runtime.adapters.has(adapterName)) {
      return false;
    }

    runtime.activeAdapter = adapterName;
    persistMeta();

    notify("adapter-changed", {
      name: adapterName
    });

    return true;
  }

  function listAdapters() {
    return Array.from(runtime.adapters.entries()).map(function map(entry) {
      var name = entry[0];
      var adapter = entry[1];

      return {
        name: name,
        type: asString(adapter.type, "custom"),
        active: name === runtime.activeAdapter,
        canPush: typeof adapter.push === "function",
        canPull: typeof adapter.pull === "function",
        available: Boolean(
          safeCall(adapter.isAvailable, true, adapter)
        )
      };
    });
  }

  function compareSnapshots(localSnapshot, remoteSnapshot) {
    var local = asObject(localSnapshot);
    var remote = asObject(remoteSnapshot);

    if (!local.data && !remote.data) {
      return {
        relation: "empty",
        localRevision: 0,
        remoteRevision: 0,
        sameChecksum: true
      };
    }

    if (!remote.data) {
      return {
        relation: "local-only",
        localRevision: asNumber(local.revision, 0),
        remoteRevision: 0,
        sameChecksum: false
      };
    }

    if (!local.data) {
      return {
        relation: "remote-only",
        localRevision: 0,
        remoteRevision: asNumber(remote.revision, 0),
        sameChecksum: false
      };
    }

    var localRevision = asNumber(local.revision, 0);
    var remoteRevision = asNumber(remote.revision, 0);
    var sameChecksum =
      asString(local.checksum) === asString(remote.checksum);

    if (sameChecksum) {
      return {
        relation: "same",
        localRevision: localRevision,
        remoteRevision: remoteRevision,
        sameChecksum: true
      };
    }

    if (localRevision > remoteRevision) {
      return {
        relation: "local-newer",
        localRevision: localRevision,
        remoteRevision: remoteRevision,
        sameChecksum: false
      };
    }

    if (remoteRevision > localRevision) {
      return {
        relation: "remote-newer",
        localRevision: localRevision,
        remoteRevision: remoteRevision,
        sameChecksum: false
      };
    }

    return {
      relation: "conflict",
      localRevision: localRevision,
      remoteRevision: remoteRevision,
      sameChecksum: false
    };
  }

  function mergeArrays(existing, incoming) {
    var result = asArray(existing).map(safeClone);
    var index = new Map();

    result.forEach(function indexItem(item, position) {
      var record = asObject(item);
      var key = asString(record.id, checksum(record));
      index.set(key, position);
    });

    asArray(incoming).forEach(function mergeItem(item) {
      var record = asObject(item);
      var key = asString(record.id, checksum(record));

      if (!index.has(key)) {
        result.push(safeClone(record));
        index.set(key, result.length - 1);
        return;
      }

      var position = index.get(key);
      var existingRecord = asObject(result[position]);
      var existingUpdated = new Date(
        existingRecord.updatedAt ||
        existingRecord.createdAt ||
        0
      ).getTime();
      var incomingUpdated = new Date(
        record.updatedAt ||
        record.createdAt ||
        0
      ).getTime();

      result[position] = incomingUpdated >= existingUpdated
        ? Object.assign({}, existingRecord, safeClone(record))
        : Object.assign({}, safeClone(record), existingRecord);
    });

    return result;
  }

  function mergeStates(localState, remoteState) {
    var local = asObject(localState);
    var remote = asObject(remoteState);
    var merged = {};
    var keys = new Set(
      Object.keys(local).concat(Object.keys(remote))
    );

    keys.forEach(function mergeKey(key) {
      var localValue = local[key];
      var remoteValue = remote[key];

      if (Array.isArray(localValue) || Array.isArray(remoteValue)) {
        merged[key] = mergeArrays(localValue, remoteValue);
      } else if (isObject(localValue) || isObject(remoteValue)) {
        merged[key] = Object.assign(
          {},
          asObject(localValue),
          asObject(remoteValue)
        );
      } else if (remoteValue !== undefined) {
        merged[key] = safeClone(remoteValue);
      } else {
        merged[key] = safeClone(localValue);
      }
    });

    return merged;
  }

  function resolveConflict(localSnapshot, remoteSnapshot, strategy) {
    var mode = asString(
      strategy,
      DEFAULT_CONFLICT_STRATEGY
    );

    if (mode === "local") {
      return {
        strategy: mode,
        snapshot: localSnapshot
      };
    }

    if (mode === "remote") {
      return {
        strategy: mode,
        snapshot: remoteSnapshot
      };
    }

    if (mode === "merge") {
      var mergedState = mergeStates(
        asObject(localSnapshot).data,
        asObject(remoteSnapshot).data
      );

      return {
        strategy: mode,
        snapshot: createSnapshot({
          state: mergedState,
          revision: Math.max(
            asNumber(asObject(localSnapshot).revision, 0),
            asNumber(asObject(remoteSnapshot).revision, 0)
          ) + 1,
          source: "conflict-merge",
          reason: "conflict-resolution",
          persist: false
        })
      };
    }

    var localTime = new Date(
      asObject(localSnapshot).generatedAt || 0
    ).getTime();
    var remoteTime = new Date(
      asObject(remoteSnapshot).generatedAt || 0
    ).getTime();

    return {
      strategy: "latest",
      snapshot: remoteTime >= localTime
        ? remoteSnapshot
        : localSnapshot
    };
  }

  function markQueueSynced(revision) {
    var synced = 0;

    runtime.queue.forEach(function mark(change) {
      if (
        change.status === "pending" &&
        asNumber(change.revision, 0) <= revision
      ) {
        change.status = "synced";
        change.syncedAt = nowIso();
        synced += 1;
      }
    });

    runtime.queue = runtime.queue.filter(function keep(change) {
      return change.status !== "synced";
    });

    persistQueue();
    return synced;
  }

  function push(options) {
    var settings = asObject(options);
    var adapter = getAdapter(settings.adapter);

    if (!adapter || typeof adapter.push !== "function") {
      return Promise.resolve({
        success: false,
        error: {
          name: "SyncAdapterError",
          message: "Active adapter does not support push."
        }
      });
    }

    if (
      typeof adapter.isAvailable === "function" &&
      !safeCall(adapter.isAvailable, false, adapter)
    ) {
      return Promise.resolve({
        success: false,
        offline: true,
        error: {
          name: "SyncUnavailableError",
          message: "Sync adapter is unavailable."
        }
      });
    }

    var snapshot = createSnapshot({
      reason: asString(settings.reason, "push"),
      source: "local",
      persist: settings.persistSnapshot !== false,
      metadata: {
        adapter: asString(settings.adapter, runtime.activeAdapter)
      }
    });

    var payload = {
      snapshot: snapshot,
      queue: getQueue({ status: "pending" }),
      device: {
        id: runtime.deviceId,
        sessionId: runtime.sessionId
      },
      moduleVersion: VERSION
    };

    return Promise.resolve()
      .then(function executePush() {
        return adapter.push(payload, settings);
      })
      .then(function handlePushResponse(response) {
        var result = asObject(response);

        if (result.success === false) {
          throw new Error(
            asString(result.message, "Sync push failed.")
          );
        }

        runtime.lastPushAt = nowIso();
        runtime.lastSyncAt = runtime.lastPushAt;
        runtime.revision = Math.max(
          runtime.revision,
          asNumber(result.revision, snapshot.revision)
        );

        var syncedChanges = markQueueSynced(runtime.revision);

        persistMeta();

        addHistory("push-completed", {
          adapter: runtime.activeAdapter,
          revision: runtime.revision,
          syncedChanges: syncedChanges,
          snapshotId: snapshot.id
        });

        emit("travel-sync:pushed", {
          adapter: runtime.activeAdapter,
          revision: runtime.revision,
          syncedChanges: syncedChanges,
          snapshotId: snapshot.id,
          generatedAt: nowIso()
        });

        notify("push-completed", {
          revision: runtime.revision,
          syncedChanges: syncedChanges
        });

        return {
          success: true,
          adapter: runtime.activeAdapter,
          revision: runtime.revision,
          syncedChanges: syncedChanges,
          snapshot: snapshot,
          response: safeClone(result)
        };
      })
      .catch(function handlePushError(error) {
        runtime.lastError = error;

        runtime.queue.forEach(function markAttempt(change) {
          if (change.status === "pending") {
            change.attempts = asNumber(change.attempts, 0) + 1;
            change.lastAttemptAt = nowIso();
          }
        });

        persistQueue();

        addHistory("push-failed", {
          adapter: runtime.activeAdapter,
          message: error.message
        });

        notify("push-failed", {
          message: error.message
        });

        return {
          success: false,
          adapter: runtime.activeAdapter,
          error: {
            name: error.name,
            message: error.message
          }
        };
      });
  }

  function pull(options) {
    var settings = asObject(options);
    var adapter = getAdapter(settings.adapter);

    if (!adapter || typeof adapter.pull !== "function") {
      return Promise.resolve({
        success: false,
        error: {
          name: "SyncAdapterError",
          message: "Active adapter does not support pull."
        }
      });
    }

    if (
      typeof adapter.isAvailable === "function" &&
      !safeCall(adapter.isAvailable, false, adapter)
    ) {
      return Promise.resolve({
        success: false,
        offline: true,
        error: {
          name: "SyncUnavailableError",
          message: "Sync adapter is unavailable."
        }
      });
    }

    return Promise.resolve()
      .then(function executePull() {
        return adapter.pull({
          deviceId: runtime.deviceId,
          sessionId: runtime.sessionId,
          revision: runtime.revision
        }, settings);
      })
      .then(function handlePullResponse(response) {
        var result = asObject(response);
        var remoteSnapshot = result.snapshot;

        runtime.lastPullAt = nowIso();

        if (!remoteSnapshot) {
          runtime.lastSyncAt = runtime.lastPullAt;
          persistMeta();

          return {
            success: true,
            empty: true,
            adapter: runtime.activeAdapter
          };
        }

        var validation = validateSnapshot(remoteSnapshot);

        if (!validation.valid) {
          throw new Error("Remote snapshot validation failed.");
        }

        var localSnapshot = createSnapshot({
          reason: "pull-compare",
          source: "local",
          persist: false
        });

        var comparison = compareSnapshots(
          localSnapshot,
          remoteSnapshot
        );

        var selectedSnapshot = null;
        var conflictResolution = null;

        if (
          comparison.relation === "remote-only" ||
          comparison.relation === "remote-newer"
        ) {
          selectedSnapshot = remoteSnapshot;
        } else if (
          comparison.relation === "conflict"
        ) {
          conflictResolution = resolveConflict(
            localSnapshot,
            remoteSnapshot,
            settings.conflictStrategy ||
              runtime.options.conflictStrategy
          );
          selectedSnapshot = conflictResolution.snapshot;
        } else if (
          comparison.relation === "same"
        ) {
          runtime.lastSyncAt = runtime.lastPullAt;
          runtime.revision = Math.max(
            runtime.revision,
            asNumber(remoteSnapshot.revision, 0)
          );
          persistMeta();

          return {
            success: true,
            empty: false,
            unchanged: true,
            comparison: comparison,
            adapter: runtime.activeAdapter
          };
        } else {
          return {
            success: true,
            empty: false,
            localNewer: true,
            comparison: comparison,
            adapter: runtime.activeAdapter
          };
        }

        return restoreSnapshot(selectedSnapshot, {
          remote: true,
          source: "travel-sync-pull",
          silent: settings.silent === true,
          allowDirectState: settings.allowDirectState === true
        }).then(function afterRestore(restored) {
          if (!restored.success) {
            throw new Error(restored.error.message);
          }

          runtime.lastRemoteChangeAt = nowIso();
          runtime.lastSyncAt = runtime.lastPullAt;
          runtime.revision = Math.max(
            runtime.revision,
            asNumber(selectedSnapshot.revision, 0)
          );

          storageSet(STORAGE_KEYS.SNAPSHOT, selectedSnapshot);
          persistMeta();

          addHistory("pull-completed", {
            adapter: runtime.activeAdapter,
            revision: runtime.revision,
            snapshotId: selectedSnapshot.id,
            relation: comparison.relation,
            conflictStrategy: conflictResolution
              ? conflictResolution.strategy
              : null
          });

          broadcast({
            type: "snapshot-applied",
            snapshot: selectedSnapshot
          });

          emit("travel-sync:pulled", {
            adapter: runtime.activeAdapter,
            revision: runtime.revision,
            snapshotId: selectedSnapshot.id,
            comparison: comparison,
            generatedAt: nowIso()
          });

          notify("pull-completed", {
            revision: runtime.revision,
            comparison: comparison
          });

          return {
            success: true,
            empty: false,
            applied: true,
            adapter: runtime.activeAdapter,
            snapshot: safeClone(selectedSnapshot),
            comparison: comparison,
            conflictResolution: conflictResolution
              ? conflictResolution.strategy
              : null
          };
        });
      })
      .catch(function handlePullError(error) {
        runtime.lastError = error;

        addHistory("pull-failed", {
          adapter: runtime.activeAdapter,
          message: error.message
        });

        notify("pull-failed", {
          message: error.message
        });

        return {
          success: false,
          adapter: runtime.activeAdapter,
          error: {
            name: error.name,
            message: error.message
          }
        };
      });
  }

  function sync(options) {
    var settings = asObject(options);

    if (runtime.syncing) {
      return Promise.resolve({
        success: false,
        busy: true,
        message: "Sync is already running."
      });
    }

    runtime.syncing = true;
    notify("sync-started", {
      adapter: asString(settings.adapter, runtime.activeAdapter)
    });

    var direction = asString(settings.direction, "both");
    var pullResult = null;
    var pushResult = null;

    var chain = Promise.resolve();

    if (direction === "pull" || direction === "both") {
      chain = chain.then(function runPull() {
        return pull(settings).then(function savePull(result) {
          pullResult = result;
          return result;
        });
      });
    }

    if (direction === "push" || direction === "both") {
      chain = chain.then(function runPush() {
        if (
          pullResult &&
          pullResult.success === false &&
          settings.pushAfterPullFailure !== true
        ) {
          return {
            success: false,
            skipped: true,
            message: "Push skipped because pull failed."
          };
        }

        return push(settings).then(function savePush(result) {
          pushResult = result;
          return result;
        });
      });
    }

    return chain
      .then(function completeSync() {
        runtime.lastSyncAt = nowIso();
        persistMeta();

        var success =
          (!pullResult || pullResult.success !== false) &&
          (!pushResult || pushResult.success !== false);

        addHistory("sync-completed", {
          success: success,
          direction: direction,
          pull: pullResult,
          push: pushResult
        });

        notify("sync-completed", {
          success: success,
          direction: direction
        });

        var interfaceApi = getUI();

        if (
          interfaceApi &&
          settings.showToast === true
        ) {
          safeCall(interfaceApi.toast, null, interfaceApi, [
            success
              ? "تمت مزامنة بيانات السفر."
              : "تعذر إكمال مزامنة بيانات السفر.",
            success ? "success" : "warning"
          ]);
        }

        return {
          success: success,
          direction: direction,
          pull: pullResult,
          push: pushResult,
          syncedAt: runtime.lastSyncAt
        };
      })
      .catch(function handleSyncError(error) {
        runtime.lastError = error;

        addHistory("sync-failed", {
          direction: direction,
          message: error.message
        });

        notify("sync-failed", {
          message: error.message
        });

        return {
          success: false,
          direction: direction,
          error: {
            name: error.name,
            message: error.message
          }
        };
      })
      .finally(function releaseSync() {
        runtime.syncing = false;
      });
  }

  function scheduleSync(reason) {
    if (
      runtime.options.autoSync === false ||
      runtime.destroyed
    ) {
      return false;
    }

    if (runtime.debounceTimer) {
      global.clearTimeout(runtime.debounceTimer);
    }

    runtime.debounceTimer = global.setTimeout(function runScheduledSync() {
      runtime.debounceTimer = null;

      if (
        runtime.online ||
        runtime.activeAdapter === DEFAULT_ADAPTER
      ) {
        sync({
          reason: reason || "scheduled",
          showToast: false
        });
      }
    }, asNumber(
      runtime.options.debounceMs,
      DEFAULT_DEBOUNCE_MS
    ));

    return true;
  }

  function startInterval() {
    stopInterval();

    if (runtime.options.autoSync === false) {
      return;
    }

    var interval = asNumber(
      runtime.options.syncIntervalMs,
      DEFAULT_SYNC_INTERVAL_MS
    );

    if (interval <= 0) {
      return;
    }

    runtime.syncTimer = global.setInterval(function periodicSync() {
      if (
        !runtime.syncing &&
        (
          runtime.online ||
          runtime.activeAdapter === DEFAULT_ADAPTER
        )
      ) {
        sync({
          reason: "interval",
          showToast: false
        });
      }
    }, interval);
  }

  function stopInterval() {
    if (runtime.syncTimer) {
      global.clearInterval(runtime.syncTimer);
      runtime.syncTimer = null;
    }
  }

  function broadcast(payload) {
    var message = Object.assign({
      id: createId("broadcast"),
      deviceId: runtime.deviceId,
      sessionId: runtime.sessionId,
      revision: runtime.revision,
      sentAt: nowIso()
    }, asObject(payload));

    if (runtime.channel) {
      safeCall(runtime.channel.postMessage, null, runtime.channel, [message]);
    }

    storageSet(STORAGE_KEYS.BROADCAST, message);
    return message;
  }

  function handleBroadcast(message) {
    var payload = asObject(message);

    if (
      payload.sessionId === runtime.sessionId ||
      payload.deviceId === runtime.deviceId &&
      payload.sessionId === runtime.sessionId
    ) {
      return;
    }

    if (payload.type === "change-announcement") {
      runtime.lastRemoteChangeAt = nowIso();

      notify("remote-change-announced", {
        change: payload.change,
        deviceId: payload.deviceId
      });

      if (runtime.options.pullOnRemoteChange !== false) {
        scheduleSync("remote-change");
      }
    }

    if (
      payload.type === "snapshot-applied" &&
      payload.snapshot
    ) {
      var remoteSnapshot = payload.snapshot;
      var localSnapshot = createSnapshot({
        source: "broadcast-compare",
        persist: false
      });

      var comparison = compareSnapshots(
        localSnapshot,
        remoteSnapshot
      );

      if (
        comparison.relation === "remote-newer" ||
        comparison.relation === "remote-only"
      ) {
        restoreSnapshot(remoteSnapshot, {
          remote: true,
          source: "broadcast-channel",
          silent: true,
          allowDirectState:
            runtime.options.allowDirectState === true
        });
      }
    }

    if (payload.type === "sync-request") {
      scheduleSync("remote-request");
    }
  }

  function setupBroadcastChannel() {
    if (typeof global.BroadcastChannel !== "function") {
      return false;
    }

    try {
      runtime.channel = new global.BroadcastChannel(CHANNEL_NAME);

      runtime.channel.onmessage = function onChannelMessage(event) {
        handleBroadcast(event.data);
      };

      return true;
    } catch (error) {
      runtime.lastError = error;
      runtime.channel = null;
      return false;
    }
  }

  function closeBroadcastChannel() {
    if (runtime.channel) {
      safeCall(runtime.channel.close, null, runtime.channel);
      runtime.channel = null;
    }
  }

  function handleStorageEvent(event) {
    if (!event || event.key !== STORAGE_KEYS.BROADCAST || !event.newValue) {
      return;
    }

    try {
      handleBroadcast(JSON.parse(event.newValue));
    } catch (error) {
      runtime.lastError = error;
    }
  }

  function handleOnline() {
    runtime.online = true;
    notify("online", null);
    scheduleSync("online");
  }

  function handleOffline() {
    runtime.online = false;
    notify("offline", null);
  }

  function refreshIntelligence(reason) {
    var brain = getBrain();

    if (brain && typeof brain.refresh === "function") {
      safeCall(brain.refresh, null, brain, [reason || "travel-sync"]);
    }

    emit("store:updated", {
      source: "travel-sync",
      reason: reason || "refresh",
      generatedAt: nowIso()
    });
  }

  function handleStoreChange(payload, sourceName) {
    if (
      runtime.applyingRemoteState ||
      runtime.destroyed
    ) {
      return;
    }

    var source = asObject(payload);
    var change = {
      type: asString(source.type, "store-change"),
      branch: asString(
        source.branch,
        asString(source.collection, "")
      ),
      entityId: asString(
        source.entityId,
        asString(source.id, "")
      ),
      operation: asString(source.operation, "update"),
      payload: source.payload !== undefined
        ? source.payload
        : source,
      metadata: {
        event: sourceName || "store",
        source: asString(source.source, "store")
      }
    };

    queueChange(change);
  }

  function bindStore() {
    var store = getStore();

    if (store && typeof store.subscribe === "function") {
      runtime.storeUnsubscribe = safeCall(
        store.subscribe,
        null,
        store,
        [function onStoreUpdate(nextState, meta) {
          if (
            runtime.applyingRemoteState ||
            asObject(meta).source === "travel-sync"
          ) {
            return;
          }

          queueChange({
            type: "store-snapshot-change",
            branch: "",
            operation: "replace",
            payload: nextState,
            metadata: {
              source: asString(
                asObject(meta).source,
                "store-subscription"
              )
            }
          });
        }]
      );
    }
  }

  function bindEvents() {
    var events = getEvents();

    if (!events) {
      return;
    }

    [
      "store:updated",
      "trip:created",
      "trip:updated",
      "trip:deleted",
      "planned-trip:created",
      "planned-trip:updated",
      "planned-trip:deleted",
      "budget:updated",
      "expense:created",
      "expense:updated",
      "expense:deleted",
      "saving:updated",
      "documents:updated",
      "packing:updated",
      "wishlist:updated",
      "annual-plan:updated",
      "travel-import:completed"
    ].forEach(function bindEvent(name) {
      var handler = function eventHandler(payload) {
        if (
          asObject(payload).source === "travel-sync"
        ) {
          return;
        }

        handleStoreChange(payload, name);
      };

      var unsubscribe =
        safeCall(events.on, null, events, [name, handler]) ||
        safeCall(events.subscribe, null, events, [name, handler]);

      if (typeof unsubscribe === "function") {
        runtime.eventUnsubscribers.push(unsubscribe);
      }
    });

    var syncRequestHandler = function syncRequest(payload) {
      sync(asObject(payload));
    };

    var syncRequestUnsubscribe =
      safeCall(events.on, null, events, [
        "travel-sync:request",
        syncRequestHandler
      ]) ||
      safeCall(events.subscribe, null, events, [
        "travel-sync:request",
        syncRequestHandler
      ]);

    if (typeof syncRequestUnsubscribe === "function") {
      runtime.eventUnsubscribers.push(syncRequestUnsubscribe);
    }
  }

  function requestSyncAcrossTabs() {
    return broadcast({
      type: "sync-request"
    });
  }

  function exportSyncPackage(options) {
    var settings = asObject(options);
    var snapshot = createSnapshot({
      reason: "export-package",
      source: "manual-export",
      persist: settings.persistSnapshot !== false
    });

    return {
      type: "travel-sync-package",
      version: VERSION,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      exportedAt: nowIso(),
      deviceId: runtime.deviceId,
      snapshot: snapshot,
      queue: settings.includeQueue === true
        ? getQueue()
        : [],
      metadata: safeClone(asObject(settings.metadata))
    };
  }

  function importSyncPackage(input, options) {
    var source = typeof input === "string"
      ? safeCall(JSON.parse, null, JSON, [input])
      : input;

    var packageData = asObject(source);
    var snapshot = packageData.snapshot || packageData;

    return restoreSnapshot(snapshot, Object.assign({
      source: "sync-package-import",
      remote: true
    }, asObject(options)));
  }

  function getHistory(options) {
    var settings = asObject(options);
    var history = runtime.history.slice();

    if (settings.type) {
      history = history.filter(function byType(item) {
        return item.type === settings.type;
      });
    }

    if (settings.limit) {
      history = history.slice(
        -Math.max(0, asNumber(settings.limit, history.length))
      );
    }

    return safeClone(history);
  }

  function clearHistory() {
    var removed = runtime.history.length;
    runtime.history = [];
    persistMeta();
    notify("history-cleared", { removed: removed });
    return removed;
  }

  function subscribe(listener, options) {
    if (typeof listener !== "function") {
      throw new TypeError("TravelSync.subscribe requires a function.");
    }

    runtime.listeners.add(listener);

    if (asObject(options).immediate !== false) {
      listener(getStatus(), {
        reason: "subscribe",
        generatedAt: nowIso()
      });
    }

    return function unsubscribe() {
      runtime.listeners.delete(listener);
    };
  }

  function getStatus() {
    return {
      module: MODULE_NAME,
      version: VERSION,
      initialized: runtime.initialized,
      destroyed: runtime.destroyed,
      syncing: runtime.syncing,
      online: runtime.online,
      deviceId: runtime.deviceId,
      sessionId: runtime.sessionId,
      revision: runtime.revision,
      activeAdapter: runtime.activeAdapter,
      adapters: listAdapters(),
      queueSize: runtime.queue.length,
      pendingChanges: runtime.queue.filter(function pending(change) {
        return change.status === "pending";
      }).length,
      lastSyncAt: runtime.lastSyncAt,
      lastPushAt: runtime.lastPushAt,
      lastPullAt: runtime.lastPullAt,
      lastLocalChangeAt: runtime.lastLocalChangeAt,
      lastRemoteChangeAt: runtime.lastRemoteChangeAt,
      options: safeClone(runtime.options),
      generatedAt: nowIso()
    };
  }

  function getHealth() {
    var store = getStore();
    var local = getAdapter(DEFAULT_ADAPTER);

    return {
      module: MODULE_NAME,
      version: VERSION,
      initialized: runtime.initialized,
      destroyed: runtime.destroyed,
      syncing: runtime.syncing,
      online: runtime.online,
      integrations: {
        store: Boolean(store),
        storeRead: Boolean(
          store && (
            typeof store.getState === "function" ||
            typeof store.getSnapshot === "function" ||
            typeof store.getData === "function" ||
            isObject(store.state) ||
            isObject(store.data)
          )
        ),
        storeWrite: Boolean(
          store && (
            typeof store.replaceState === "function" ||
            typeof store.setState === "function" ||
            typeof store.restore === "function" ||
            typeof store.importData === "function" ||
            typeof store.dispatch === "function"
          )
        ),
        storage: Boolean(
          getStorage() || global.localStorage
        ),
        events: Boolean(getEvents()),
        ui: Boolean(getUI()),
        brain: Boolean(getBrain()),
        assistant: Boolean(getAssistant()),
        broadcastChannel: Boolean(runtime.channel),
        localAdapter: Boolean(local)
      },
      queueSize: runtime.queue.length,
      adapterCount: runtime.adapters.size,
      lastError: runtime.lastError
        ? {
          name: runtime.lastError.name,
          message: runtime.lastError.message
        }
        : null,
      generatedAt: nowIso()
    };
  }

  function updateOptions(options) {
    runtime.options = Object.assign(
      {},
      runtime.options,
      asObject(options)
    );

    if (runtime.initialized) {
      startInterval();
    }

    notify("options-updated", {
      options: runtime.options
    });

    return safeClone(runtime.options);
  }

  function init(options) {
    if (runtime.initialized && !runtime.destroyed) {
      updateOptions(options);
      return getStatus();
    }

    runtime.destroyed = false;
    runtime.initialized = true;
    runtime.options = Object.assign({
      autoSync: true,
      debounceMs: DEFAULT_DEBOUNCE_MS,
      syncIntervalMs: DEFAULT_SYNC_INTERVAL_MS,
      pullOnRemoteChange: true,
      conflictStrategy: DEFAULT_CONFLICT_STRATEGY,
      allowDirectState: false,
      initialSync: false
    }, asObject(options));

    restoreMeta();
    restoreQueue();

    runtime.adapters.set(DEFAULT_ADAPTER, localAdapter());

    if (
      runtime.activeAdapter !== DEFAULT_ADAPTER &&
      !runtime.adapters.has(runtime.activeAdapter)
    ) {
      runtime.activeAdapter = DEFAULT_ADAPTER;
    }

    setupBroadcastChannel();
    bindStore();
    bindEvents();

    if (global.addEventListener) {
      global.addEventListener("storage", handleStorageEvent);
      global.addEventListener("online", handleOnline);
      global.addEventListener("offline", handleOffline);
    }

    startInterval();
    persistMeta();

    emit("travel-sync:ready", {
      version: VERSION,
      deviceId: runtime.deviceId,
      sessionId: runtime.sessionId,
      revision: runtime.revision,
      activeAdapter: runtime.activeAdapter,
      generatedAt: nowIso()
    });

    notify("init", null);

    if (runtime.options.initialSync === true) {
      global.setTimeout(function initialSync() {
        sync({
          reason: "initial",
          showToast: false
        });
      }, 0);
    }

    return getStatus();
  }

  function destroy() {
    stopInterval();

    if (runtime.debounceTimer) {
      global.clearTimeout(runtime.debounceTimer);
      runtime.debounceTimer = null;
    }

    if (typeof runtime.storeUnsubscribe === "function") {
      safeCall(runtime.storeUnsubscribe, null);
    }

    runtime.eventUnsubscribers.forEach(function unsubscribe(fn) {
      safeCall(fn, null);
    });

    runtime.storeUnsubscribe = null;
    runtime.eventUnsubscribers = [];

    if (global.removeEventListener) {
      global.removeEventListener("storage", handleStorageEvent);
      global.removeEventListener("online", handleOnline);
      global.removeEventListener("offline", handleOffline);
    }

    closeBroadcastChannel();

    runtime.listeners.clear();
    runtime.syncing = false;
    runtime.initialized = false;
    runtime.destroyed = true;

    persistMeta();
    persistQueue();

    return true;
  }

  var api = {
    version: VERSION,
    name: MODULE_NAME,

    init: init,
    destroy: destroy,

    sync: sync,
    push: push,
    pull: pull,
    scheduleSync: scheduleSync,
    requestSyncAcrossTabs: requestSyncAcrossTabs,

    queueChange: queueChange,
    clearQueue: clearQueue,
    getQueue: getQueue,

    createSnapshot: createSnapshot,
    getStoredSnapshot: getStoredSnapshot,
    validateSnapshot: validateSnapshot,
    restoreSnapshot: restoreSnapshot,
    compareSnapshots: compareSnapshots,
    mergeStates: mergeStates,
    resolveConflict: resolveConflict,

    registerAdapter: registerAdapter,
    unregisterAdapter: unregisterAdapter,
    setActiveAdapter: setActiveAdapter,
    listAdapters: listAdapters,

    exportSyncPackage: exportSyncPackage,
    importSyncPackage: importSyncPackage,

    getHistory: getHistory,
    clearHistory: clearHistory,

    getStatus: getStatus,
    getState: getStatus,
    getHealth: getHealth,
    updateOptions: updateOptions,
    subscribe: subscribe
  };

  global.TravelSync = Object.freeze(api);

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener(
        "DOMContentLoaded",
        function autoInitOnReady() {
          if (!runtime.initialized && !runtime.destroyed) {
            init();
          }
        },
        { once: true }
      );
    } else {
      global.setTimeout(function autoInit() {
        if (!runtime.initialized && !runtime.destroyed) {
          init();
        }
      }, 0);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
