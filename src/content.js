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

const STORAGE_KEY = "doomscrollBlockerSettings";
const ANIMATIONS = ["orbit", "rain", "pulse", "scan", "stack"];

let settings = DEFAULT_SETTINGS;
let scrollEvents = [];
let lastY = window.scrollY;
let isBlocked = false;
let countdownId = null;
let lastActivityAt = 0;
let usageIntervalId = null;
let strictUnlockShown = false;
let currentBlockAnimation = "orbit";
let currentBlockReason = "Doomscroll interrupted";

init();

async function init() {
  settings = await loadSettings();

  const activeBlock = await getActiveBlock();
  if (activeBlock && activeBlock.endTime > Date.now()) {
    blockPage(activeBlock.endTime, activeBlock.animation, {
      persist: false,
      reason: activeBlock.reason || "Doomscroll interrupted"
    });
  }

  if (!settings.enabled || !isDoomscrollHost(location.hostname, settings.domains)) {
    return;
  }

  window.addEventListener("scroll", trackScroll, { passive: true });
  window.addEventListener("keydown", trackKeyboardScroll, true);
  window.addEventListener("mousemove", markActivity, { passive: true });
  usageIntervalId = window.setInterval(recordActiveUsage, 15000);
}

function loadSettings() {
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome.storage?.sync) {
      resolve(DEFAULT_SETTINGS);
      return;
    }

    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      resolve(normalizeSettings(result[STORAGE_KEY] || {}));
    });
  });
}

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
  settings.dailyBudgetMinutes = Math.max(1, Number(settings.dailyBudgetMinutes) || DEFAULT_SETTINGS.dailyBudgetMinutes);
  settings.strictUnlockPhrase = normalizeUnlockPhrase(settings.strictUnlockPhrase);

  return settings;
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      resolve(null);
      return;
    }

    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(response || null);
    });
  });
}

async function getActiveBlock() {
  const response = await sendRuntimeMessage({ type: "DSB_GET_ACTIVE_BLOCK" });
  return response?.block || null;
}

function isDoomscrollHost(hostname, domains) {
  return domains.some((domain) => {
    const cleanDomain = domain.trim().replace(/^https?:\/\//, "").replace(/^www\./, "");
    const cleanHost = hostname.replace(/^www\./, "");
    return cleanHost === cleanDomain || cleanHost.endsWith(`.${cleanDomain}`);
  });
}

function trackKeyboardScroll(event) {
  const scrollKeys = new Set(["ArrowDown", "PageDown", "Space", "End"]);

  if (scrollKeys.has(event.code) || scrollKeys.has(event.key)) {
    markActivity();
    recordScroll(Math.max(window.innerHeight * 0.65, 420));
  }
}

function trackScroll() {
  const currentY = window.scrollY;
  const delta = Math.abs(currentY - lastY);
  lastY = currentY;

  if (delta > 8) {
    markActivity();
    recordScroll(delta);
  }
}

function recordScroll(distance) {
  if (isBlocked) return;

  const now = Date.now();
  const windowMs = settings.scrollWindowSeconds * 1000;
  scrollEvents.push({ time: now, distance });
  scrollEvents = scrollEvents.filter((event) => now - event.time <= windowMs);

  const totalDistance = scrollEvents.reduce((sum, event) => sum + event.distance, 0);

  if (totalDistance >= getScrollDistanceLimit()) {
    const scrollStats = getScrollStats(totalDistance, now);
    const durationMs = getBlockDurationMs(scrollStats.pxPerSecond);
    const endTime = Date.now() + durationMs;
    const animation = ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)];
    const contentInsight = settings.contentInsightsEnabled ? analyzeVisiblePageContent() : { category: "unknown" };

    blockPage(endTime, animation, {
      analyticsEvent: {
        category: contentInsight.category,
        durationMs,
        host: location.hostname,
        pxPerSecond: scrollStats.pxPerSecond,
        totalDistance,
        trigger: getFocusHoursActive() ? "focus-hours-scroll" : "scroll"
      },
      reason: getFocusHoursActive() ? "Focus hours scroll limit reached" : "Scroll limit reached"
    });
  }
}

async function recordActiveUsage() {
  if (isBlocked || document.visibilityState !== "visible" || Date.now() - lastActivityAt > 60000) {
    return;
  }

  const response = await sendRuntimeMessage({
    type: "DSB_RECORD_USAGE",
    usageEvent: {
      durationMs: 15000,
      host: location.hostname
    }
  });

  if (!settings.dailyBudgetEnabled) {
    return;
  }

  const todayUsageMs = response?.analytics?.usageByDay?.[getTodayKey()] || 0;
  const budgetMs = settings.dailyBudgetMinutes * 60 * 1000;

  if (todayUsageMs >= budgetMs) {
    const durationMs = Math.max(settings.maxBlockMinutes, settings.minBlockMinutes) * 60 * 1000;
    const endTime = Date.now() + durationMs;
    const animation = ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)];

    blockPage(endTime, animation, {
      analyticsEvent: {
        category: "budget",
        durationMs,
        host: location.hostname,
        pxPerSecond: 0,
        totalDistance: 0,
        trigger: "daily-budget"
      },
      reason: "Daily scroll budget reached"
    });
  }
}

function markActivity() {
  lastActivityAt = Date.now();
}

function getScrollStats(totalDistance, now) {
  const firstScrollTime = scrollEvents[0]?.time || now;
  const elapsedSeconds = Math.max(1, (now - firstScrollTime) / 1000);
  const pxPerSecond = totalDistance / elapsedSeconds;

  return { elapsedSeconds, pxPerSecond };
}

function getBlockDurationMs(pxPerSecond) {
  const slowSpeed = getScrollDistanceLimit() / settings.scrollWindowSeconds;
  const fastSpeed = Math.max(settings.rapidScrollPxPerSecond, slowSpeed + 1);
  const speedRatio = Math.min(1, Math.max(0, (pxPerSecond - slowSpeed) / (fastSpeed - slowSpeed)));
  const minutes = settings.maxBlockMinutes - speedRatio * (settings.maxBlockMinutes - settings.minBlockMinutes);
  const focusMultiplier = getFocusHoursActive() ? 1.25 : 1;

  return Math.max(1, minutes * focusMultiplier) * 60 * 1000;
}

function getScrollDistanceLimit() {
  return settings.scrollDistancePx * (getFocusHoursActive() ? 0.75 : 1);
}

function blockPage(endTime, animation, options = {}) {
  const { analyticsEvent = null, persist = true, reason = "Doomscroll interrupted" } = options;

  isBlocked = true;
  scrollEvents = [];
  strictUnlockShown = false;
  currentBlockAnimation = animation;
  currentBlockReason = reason;

  if (persist) {
    sendRuntimeMessage({
      type: "DSB_START_BLOCK",
      analyticsEvent,
      block: { endTime, animation, reason }
    });
  }

  document.documentElement.classList.add("dsb-locked");
  document.getElementById("doomscroll-blocker-overlay")?.remove();
  document.body.appendChild(createOverlay(animation, reason));

  const updateTimer = () => {
    const remaining = Math.max(0, endTime - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    const timer = document.getElementById("dsb-timer");

    if (timer) {
      timer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    if (remaining <= 0) {
      if (settings.strictModeEnabled && !strictUnlockShown) {
        showStrictUnlock();
        return;
      }

      unblockPage();
    }
  };

  updateTimer();
  countdownId = window.setInterval(updateTimer, 250);
}

function unblockPage() {
  window.clearInterval(countdownId);
  countdownId = null;
  isBlocked = false;
  sendRuntimeMessage({ type: "DSB_CLEAR_BLOCK" });
  document.documentElement.classList.remove("dsb-locked");
  document.getElementById("doomscroll-blocker-overlay")?.remove();
  lastY = window.scrollY;
}

function showStrictUnlock() {
  strictUnlockShown = true;
  window.clearInterval(countdownId);
  countdownId = null;
  sendRuntimeMessage({
    type: "DSB_START_BLOCK",
    block: {
      animation: currentBlockAnimation,
      endTime: Date.now(),
      reason: currentBlockReason,
      unlockRequired: true
    }
  });

  const timer = document.getElementById("dsb-timer");
  const strictPanel = document.getElementById("dsb-strict");
  const strictInput = document.getElementById("dsb-strict-input");
  const phrase = normalizeUnlockPhrase(settings.strictUnlockPhrase);

  if (timer) {
    timer.textContent = "Ready";
  }

  if (strictPanel) {
    strictPanel.hidden = false;
  }

  strictInput?.addEventListener("input", () => {
    if (normalizeUnlockPhrase(strictInput.value) === phrase) {
      unblockPage();
    }
  });

  strictInput?.focus();
}

function analyzeVisiblePageContent() {
  if (!document.body) {
    return { category: "unknown" };
  }

  const categoryScores = createCategoryScores();
  let wordsSeen = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = normalizeText(node.textContent || "");
      const element = node.parentElement;

      if (!element || text.length < 18 || element.closest("#doomscroll-blocker-overlay")) {
        return NodeFilter.FILTER_REJECT;
      }

      if (isIgnoredTextElement(element) || !isElementVisible(element)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while (walker.nextNode() && wordsSeen < 800) {
    const text = normalizeText(walker.currentNode.textContent || "");
    wordsSeen += text.split(" ").length;
    scoreText(text, categoryScores);
  }

  return { category: getTopCategory(categoryScores) };
}

function isIgnoredTextElement(element) {
  return Boolean(
    element.closest(
      "script, style, noscript, svg, canvas, video, audio, input, textarea, select, option, button, nav, header, footer"
    )
  );
}

function isElementVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom >= 0 &&
    rect.right >= 0 &&
    rect.top <= window.innerHeight &&
    rect.left <= window.innerWidth &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity) > 0.05
  );
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function createCategoryScores() {
  return {
    entertainment: 0,
    news: 0,
    outrage: 0,
    shopping: 0,
    social: 0,
    sports: 0,
    wellness: 0
  };
}

function scoreText(text, scores) {
  const lowerText = text.toLowerCase();
  const keywords = {
    entertainment: ["celebrity", "movie", "music", "trailer", "streaming", "show", "episode"],
    news: ["breaking", "election", "policy", "government", "market", "economy", "world"],
    outrage: ["shocking", "exposed", "destroyed", "furious", "scandal", "controversy", "rage"],
    shopping: ["sale", "deal", "discount", "buy", "cart", "shipping", "limited offer"],
    social: ["follow", "reply", "comment", "liked", "share", "thread", "posted"],
    sports: ["score", "match", "season", "league", "team", "player", "highlights"],
    wellness: ["sleep", "focus", "workout", "meditation", "health", "habit", "nutrition"]
  };

  for (const [category, terms] of Object.entries(keywords)) {
    for (const term of terms) {
      if (lowerText.includes(term)) {
        scores[category] += 1;
      }
    }
  }
}

function getTopCategory(scores) {
  const [category, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];

  return score > 0 ? category : "uncategorized";
}

function getFocusHoursActive() {
  if (!settings.scheduleEnabled) {
    return false;
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTime(settings.scheduleStart);
  const endMinutes = parseTime(settings.scheduleEnd);

  if (startMinutes === endMinutes) {
    return true;
  }

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function parseTime(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return 0;
  }

  const hours = Math.min(23, Math.max(0, Number(match[1]) || 0));
  const minutes = Math.min(59, Math.max(0, Number(match[2]) || 0));
  return hours * 60 + minutes;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeUnlockPhrase(value) {
  return String(value || DEFAULT_SETTINGS.strictUnlockPhrase).trim().toLowerCase() || DEFAULT_SETTINGS.strictUnlockPhrase;
}

function createOverlay(animation, reason) {
  const overlay = document.createElement("section");
  overlay.id = "doomscroll-blocker-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Doomscrolling pause");

  overlay.innerHTML = `
    <div class="dsb-shell">
      <div class="dsb-animation dsb-${animation}" aria-hidden="true">
        ${createAnimationMarkup(animation)}
      </div>
      <p class="dsb-kicker">${escapeHtml(reason)}</p>
      <h1>Pause the feed. Let your brain catch up.</h1>
      <div id="dsb-timer" class="dsb-timer">05:00</div>
      <p class="dsb-copy">This pause belongs only to this tab. Close the tab and the timer is gone.</p>
      <div id="dsb-strict" class="dsb-strict" hidden>
        <label for="dsb-strict-input">Type "${escapeHtml(settings.strictUnlockPhrase)}" to unlock</label>
        <input id="dsb-strict-input" type="text" autocomplete="off" spellcheck="false">
      </div>
    </div>
  `;

  return overlay;
}

function createAnimationMarkup(animation) {
  if (animation === "rain") {
    return Array.from({ length: 18 }, (_, index) => `<span style="--i:${index}"></span>`).join("");
  }

  if (animation === "stack") {
    return Array.from({ length: 7 }, (_, index) => `<span style="--i:${index}"></span>`).join("");
  }

  if (animation === "scan") {
    return "<span></span><span></span><span></span>";
  }

  if (animation === "pulse") {
    return "<span></span><span></span><span></span>";
  }

  return "<span></span><span></span><span></span><span></span>";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
