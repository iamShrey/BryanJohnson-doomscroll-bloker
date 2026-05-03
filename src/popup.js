const DEFAULT_SETTINGS = {
  enabled: true,
  minBlockMinutes: 1,
  maxBlockMinutes: 5,
  rapidScrollPxPerSecond: 650,
  contentInsightsEnabled: true,
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
  domains: document.getElementById("domains"),
  avgSpeed: document.getElementById("avgSpeed"),
  resetAnalytics: document.getElementById("resetAnalytics"),
  save: document.getElementById("save"),
  status: document.getElementById("status"),
  timeInterrupted: document.getElementById("timeInterrupted"),
  topCategory: document.getElementById("topCategory"),
  topDomain: document.getElementById("topDomain"),
  totalBlocks: document.getElementById("totalBlocks")
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

    fields.totalBlocks.textContent = String(totalBlocks);
    fields.timeInterrupted.textContent = formatDuration(analytics.totalInterruptedMs || 0);
    fields.avgSpeed.textContent = String(Math.round(totalBlocks ? (analytics.totalPxPerSecond || 0) / totalBlocks : 0));
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

function clampNumber(value, min, max, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(number)));
}
