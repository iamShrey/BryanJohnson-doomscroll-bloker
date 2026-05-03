const BLOCKS_KEY = "doomscrollBlockerActiveBlocks";
const ANALYTICS_KEY = "doomscrollBlockerAnalytics";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "DSB_GET_ANALYTICS") {
    getAnalytics().then((analytics) => sendResponse({ analytics }));
    return true;
  }

  if (message.type === "DSB_RESET_ANALYTICS") {
    saveAnalytics(createEmptyAnalytics()).then(() => sendResponse({ ok: true }));
    return true;
  }

  const tabId = sender.tab?.id;

  if (!tabId) {
    sendResponse({});
    return false;
  }

  if (message.type === "DSB_GET_ACTIVE_BLOCK") {
    getBlocks().then((blocks) => {
      const block = blocks[String(tabId)];

      if (!block || block.endTime <= Date.now()) {
        delete blocks[String(tabId)];
        saveBlocks(blocks).then(() => sendResponse({ block: null }));
        return;
      }

      sendResponse({ block });
    });
    return true;
  }

  if (message.type === "DSB_START_BLOCK") {
    getBlocks().then((blocks) => {
      blocks[String(tabId)] = message.block;
      Promise.all([saveBlocks(blocks), recordAnalyticsEvent(message.analyticsEvent)]).then(() => {
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (message.type === "DSB_CLEAR_BLOCK") {
    getBlocks().then((blocks) => {
      delete blocks[String(tabId)];
      saveBlocks(blocks).then(() => sendResponse({ ok: true }));
    });
    return true;
  }

  sendResponse({});
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  getBlocks().then((blocks) => {
    delete blocks[String(tabId)];
    saveBlocks(blocks);
  });
});

function getBlocks() {
  return chrome.storage.session.get(BLOCKS_KEY).then((result) => {
    return result[BLOCKS_KEY] || {};
  });
}

function saveBlocks(blocks) {
  return chrome.storage.session.set({ [BLOCKS_KEY]: blocks });
}

function createEmptyAnalytics() {
  return {
    byCategory: {},
    byHost: {},
    maxPxPerSecond: 0,
    recent: [],
    totalBlocks: 0,
    totalInterruptedMs: 0,
    totalPxPerSecond: 0,
    totalScrollPx: 0,
    updatedAt: null
  };
}

function getAnalytics() {
  return chrome.storage.local.get(ANALYTICS_KEY).then((result) => {
    return { ...createEmptyAnalytics(), ...(result[ANALYTICS_KEY] || {}) };
  });
}

function saveAnalytics(analytics) {
  return chrome.storage.local.set({ [ANALYTICS_KEY]: analytics });
}

function recordAnalyticsEvent(event) {
  if (!event) {
    return Promise.resolve();
  }

  return getAnalytics().then((analytics) => {
    const host = sanitizeKey(event.host || "unknown");
    const category = sanitizeKey(event.category || "unknown");
    const durationMs = Math.max(0, Number(event.durationMs) || 0);
    const pxPerSecond = Math.max(0, Number(event.pxPerSecond) || 0);
    const totalDistance = Math.max(0, Number(event.totalDistance) || 0);
    const time = Date.now();

    analytics.totalBlocks += 1;
    analytics.totalInterruptedMs += durationMs;
    analytics.totalPxPerSecond += pxPerSecond;
    analytics.totalScrollPx += totalDistance;
    analytics.maxPxPerSecond = Math.max(analytics.maxPxPerSecond, pxPerSecond);
    analytics.byHost[host] = (analytics.byHost[host] || 0) + 1;
    analytics.byCategory[category] = (analytics.byCategory[category] || 0) + 1;
    analytics.recent = [
      { category, durationMs, host, pxPerSecond, time },
      ...analytics.recent
    ].slice(0, 12);
    analytics.updatedAt = time;

    return saveAnalytics(analytics);
  });
}

function sanitizeKey(value) {
  return String(value).trim().slice(0, 80) || "unknown";
}
