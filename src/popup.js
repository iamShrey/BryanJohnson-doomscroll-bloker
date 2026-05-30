const DEFAULT_SETTINGS = {
  enabled: true,
  minBlockMinutes: 1,
  maxBlockMinutes: 5,
  rapidScrollPxPerSecond: 650,
  contentInsightsEnabled: true,
  dailyBudgetEnabled: false,
  dailyBudgetMinutes: 30,
  strictModeEnabled: false,
  strictUnlockPhrase: "reset",
  scheduleEnabled: false,
  scheduleStart: "09:00",
  scheduleEnd: "17:00",
  scrollWindowSeconds: 90,
  scrollDistancePx: 7200,
  domains: [
    "facebook.com",
    "instagram.com",
    "reddit.com",
    "tiktok.com",
    "x.com",
    "twitter.com",
    "youtube.com"
  ]
};

const SUPPORTED_DOMAINS = new Set(DEFAULT_SETTINGS.domains);
const STORAGE_KEY = "doomscrollBlockerSettings";

const fields = {
  enabled: document.getElementById("enabled"),
  minBlockMinutes: document.getElementById("minBlockMinutes"),
  maxBlockMinutes: document.getElementById("maxBlockMinutes"),
  scrollWindowSeconds: document.getElementById("scrollWindowSeconds"),
  scrollDistancePx: document.getElementById("scrollDistancePx"),
  rapidScrollPxPerSecond: document.getElementById("rapidScrollPxPerSecond"),
  contentInsightsEnabled: document.getElementById("contentInsightsEnabled"),
  dailyBudgetEnabled: document.getElementById("dailyBudgetEnabled"),
  dailyBudgetMinutes: document.getElementById("dailyBudgetMinutes"),
  exportAnalytics: document.getElementById("exportAnalytics"),
  maxSpeed: document.getElementById("maxSpeed"),
  scheduleEnabled: document.getElementById("scheduleEnabled"),
  scheduleStart: document.getElementById("scheduleStart"),
  scheduleEnd: document.getElementById("scheduleEnd"),
  strictModeEnabled: document.getElementById("strictModeEnabled"),
  strictUnlockPhrase: document.getElementById("strictUnlockPhrase"),
  domains: document.getElementById("domains"),
  avgSpeed: document.getElementById("avgSpeed"),
  resetAnalytics: document.getElementById("resetAnalytics"),
  save: document.getElementById("save"),
  status: document.getElementById("status"),
  timeInterrupted: document.getElementById("timeInterrupted"),
  todayUsage: document.getElementById("todayUsage"),
  topCategory: document.getElementById("topCategory"),
  topDomain: document.getElementById("topDomain"),
  totalBlocks: document.getElementById("totalBlocks"),
  weeklyBlocks: document.getElementById("weeklyBlocks")
};

chrome.storage.sync.get(STORAGE_KEY, (result) => {
  const settings = normalizeSettings(result[STORAGE_KEY] || {});

  fields.enabled.checked = settings.enabled;
  fields.minBlockMinutes.value = settings.minBlockMinutes;
  fields.maxBlockMinutes.value = settings.maxBlockMinutes;
  fields.scrollWindowSeconds.value = settings.scrollWindowSeconds;
  fields.scrollDistancePx.value = settings.scrollDistancePx;
  fields.rapidScrollPxPerSecond.value = settings.rapidScrollPxPerSecond;
  fields.contentInsightsEnabled.checked = settings.contentInsightsEnabled;
  fields.dailyBudgetEnabled.checked = settings.dailyBudgetEnabled;
  fields.dailyBudgetMinutes.value = settings.dailyBudgetMinutes;
  fields.scheduleEnabled.checked = settings.scheduleEnabled;
  fields.scheduleStart.value = settings.scheduleStart;
  fields.scheduleEnd.value = settings.scheduleEnd;
  fields.strictModeEnabled.checked = settings.strictModeEnabled;
  fields.strictUnlockPhrase.value = settings.strictUnlockPhrase;
  fields.domains.value = settings.domains.join("\n");
});

renderAnalytics();

fields.save.addEventListener("click", () => {
  const minBlockMinutes = clampNumber(fields.minBlockMinutes.value, 1, 60, DEFAULT_SETTINGS.minBlockMinutes);
  const maxBlockMinutes = clampNumber(fields.maxBlockMinutes.value, 1, 60, DEFAULT_SETTINGS.maxBlockMinutes);

  const settings = {
    enabled: fields.enabled.checked,
    minBlockMinutes: Math.min(minBlockMinutes, maxBlockMinutes),
    maxBlockMinutes: Math.max(minBlockMinutes, maxBlockMinutes),
    scrollWindowSeconds: clampNumber(fields.scrollWindowSeconds.value, 10, 600, DEFAULT_SETTINGS.scrollWindowSeconds),
    scrollDistancePx: clampNumber(fields.scrollDistancePx.value, 800, 50000, DEFAULT_SETTINGS.scrollDistancePx),
    rapidScrollPxPerSecond: clampNumber(
      fields.rapidScrollPxPerSecond.value,
      100,
      5000,
      DEFAULT_SETTINGS.rapidScrollPxPerSecond
    ),
    contentInsightsEnabled: fields.contentInsightsEnabled.checked,
    dailyBudgetEnabled: fields.dailyBudgetEnabled.checked,
    dailyBudgetMinutes: clampNumber(fields.dailyBudgetMinutes.value, 1, 600, DEFAULT_SETTINGS.dailyBudgetMinutes),
    scheduleEnabled: fields.scheduleEnabled.checked,
    scheduleStart: normalizeTime(fields.scheduleStart.value, DEFAULT_SETTINGS.scheduleStart),
    scheduleEnd: normalizeTime(fields.scheduleEnd.value, DEFAULT_SETTINGS.scheduleEnd),
    strictModeEnabled: fields.strictModeEnabled.checked,
    strictUnlockPhrase: normalizeUnlockPhrase(fields.strictUnlockPhrase.value),
    domains: getSupportedDomainsFromInput(fields.domains.value)
  };

  chrome.storage.sync.set({ [STORAGE_KEY]: settings }, () => {
    fields.domains.value = settings.domains.join("\n");
    fields.status.textContent = "Saved. Reload open watched tabs to apply changes.";
    window.setTimeout(() => {
      fields.status.textContent = "";
    }, 2500);
  });
});

fields.resetAnalytics.addEventListener("click", () => {
  sendRuntimeMessage({ type: "DSB_RESET_ANALYTICS" }).then(() => renderAnalytics());
});

fields.exportAnalytics.addEventListener("click", () => {
  sendRuntimeMessage({ type: "DSB_GET_ANALYTICS" }).then((response) => {
    downloadJson("doomscroll-analytics.json", {
      exportedAt: new Date().toISOString(),
      analytics: response.analytics || {}
    });
  });
});

function normalizeSettings(savedSettings) {
  const settings = { ...DEFAULT_SETTINGS, ...savedSettings };

  if (typeof savedSettings.blockMinutes === "number" && typeof savedSettings.maxBlockMinutes !== "number") {
    settings.maxBlockMinutes = savedSettings.blockMinutes;
  }

  if (
    typeof savedSettings.screenReadingEnabled === "boolean" &&
    typeof savedSettings.contentInsightsEnabled !== "boolean"
  ) {
    settings.contentInsightsEnabled = savedSettings.screenReadingEnabled;
  }

  settings.minBlockMinutes = Math.min(settings.minBlockMinutes, settings.maxBlockMinutes);
  settings.dailyBudgetMinutes = clampNumber(settings.dailyBudgetMinutes, 1, 600, DEFAULT_SETTINGS.dailyBudgetMinutes);
  settings.scheduleStart = normalizeTime(settings.scheduleStart, DEFAULT_SETTINGS.scheduleStart);
  settings.scheduleEnd = normalizeTime(settings.scheduleEnd, DEFAULT_SETTINGS.scheduleEnd);
  settings.strictUnlockPhrase = normalizeUnlockPhrase(settings.strictUnlockPhrase);
  settings.domains = Array.isArray(settings.domains) ? filterSupportedDomains(settings.domains) : DEFAULT_SETTINGS.domains;

  return settings;
}

function getSupportedDomainsFromInput(value) {
  const domains = value
    .split(/\n|,/)
    .map(normalizeDomain)
    .filter(Boolean);

  return filterSupportedDomains(domains);
}

function filterSupportedDomains(domains) {
  const supportedDomains = domains.map(normalizeDomain).filter((domain) => SUPPORTED_DOMAINS.has(domain));
  return [...new Set(supportedDomains)];
}

function normalizeDomain(domain) {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || {});
    });
  });
}

function renderAnalytics() {
  sendRuntimeMessage({ type: "DSB_GET_ANALYTICS" }).then((response) => {
    const analytics = response.analytics || {};
    const totalBlocks = analytics.totalBlocks || 0;
    const todayKey = new Date().toISOString().slice(0, 10);

    fields.totalBlocks.textContent = String(totalBlocks);
    fields.timeInterrupted.textContent = formatDuration(analytics.totalInterruptedMs || 0);
    fields.avgSpeed.textContent = String(Math.round(totalBlocks ? (analytics.totalPxPerSecond || 0) / totalBlocks : 0));
    fields.todayUsage.textContent = formatDuration(analytics.usageByDay?.[todayKey] || 0);
    fields.weeklyBlocks.textContent = String(getRecentBlockCount(analytics.byDay));
    fields.maxSpeed.textContent = String(Math.round(analytics.maxPxPerSecond || 0));
    fields.topDomain.textContent = getTopEntry(analytics.byHost) || "None yet";
    fields.topCategory.textContent = titleCase(getTopEntry(analytics.byCategory) || "None yet");
  });
}

function formatDuration(ms) {
  const minutes = Math.round(ms / 60000);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  return `${Math.round(minutes / 60)}h`;
}

function getTopEntry(entries = {}) {
  const sortedEntries = Object.entries(entries).sort((a, b) => b[1] - a[1]);
  return sortedEntries[0]?.[0] || "";
}

function titleCase(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getRecentBlockCount(byDay = {}) {
  const today = new Date();
  let total = 0;

  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - offset);
    total += byDay[day.toISOString().slice(0, 10)] || 0;
  }

  return total;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeTime(value, fallback) {
  return /^\d{2}:\d{2}$/.test(String(value)) ? value : fallback;
}

function normalizeUnlockPhrase(value) {
  return String(value || DEFAULT_SETTINGS.strictUnlockPhrase).trim().toLowerCase() || DEFAULT_SETTINGS.strictUnlockPhrase;
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
