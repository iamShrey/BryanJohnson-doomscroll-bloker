const DEFAULT_SETTINGS = {
  enabled: true,
  minBlockMinutes: 1,
  maxBlockMinutes: 5,
  rapidScrollPxPerSecond: 650,
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

const STORAGE_KEY = "doomscrollBlockerSettings";

const fields = {
  enabled: document.getElementById("enabled"),
  minBlockMinutes: document.getElementById("minBlockMinutes"),
  maxBlockMinutes: document.getElementById("maxBlockMinutes"),
  scrollWindowSeconds: document.getElementById("scrollWindowSeconds"),
  scrollDistancePx: document.getElementById("scrollDistancePx"),
  rapidScrollPxPerSecond: document.getElementById("rapidScrollPxPerSecond"),
  domains: document.getElementById("domains"),
  save: document.getElementById("save"),
  status: document.getElementById("status")
};

chrome.storage.sync.get(STORAGE_KEY, (result) => {
  const settings = normalizeSettings(result[STORAGE_KEY] || {});

  fields.enabled.checked = settings.enabled;
  fields.minBlockMinutes.value = settings.minBlockMinutes;
  fields.maxBlockMinutes.value = settings.maxBlockMinutes;
  fields.scrollWindowSeconds.value = settings.scrollWindowSeconds;
  fields.scrollDistancePx.value = settings.scrollDistancePx;
  fields.rapidScrollPxPerSecond.value = settings.rapidScrollPxPerSecond;
  fields.domains.value = settings.domains.join("\n");
});

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
    domains: fields.domains.value
      .split(/\n|,/)
      .map((domain) => domain.trim())
      .filter(Boolean)
  };

  chrome.storage.sync.set({ [STORAGE_KEY]: settings }, () => {
    fields.status.textContent = "Saved. Reload open tabs to apply changes.";
    window.setTimeout(() => {
      fields.status.textContent = "";
    }, 2500);
  });
});

function normalizeSettings(savedSettings) {
  const settings = { ...DEFAULT_SETTINGS, ...savedSettings };

  if (typeof savedSettings.blockMinutes === "number" && typeof savedSettings.maxBlockMinutes !== "number") {
    settings.maxBlockMinutes = savedSettings.blockMinutes;
  }

  settings.minBlockMinutes = Math.min(settings.minBlockMinutes, settings.maxBlockMinutes);

  return settings;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(number)));
}
