const DEFAULT_SETTINGS = {
  enabled: true,
  minBlockMinutes: 1,
  maxBlockMinutes: 5,
  rapidScrollPxPerSecond: 650,
  screenReadingEnabled: true,
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

init();

async function init() {
  settings = await loadSettings();

  const activeBlock = await getActiveBlock();
  if (activeBlock && activeBlock.endTime > Date.now()) {
    blockPage(activeBlock.endTime, activeBlock.animation, {
      pageSnapshot: activeBlock.pageSnapshot,
      persist: false
    });
    return;
  }

  if (!settings.enabled || !isDoomscrollHost(location.hostname, settings.domains)) {
    return;
  }

  window.addEventListener("scroll", trackScroll, { passive: true });
  window.addEventListener("keydown", trackKeyboardScroll, true);
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

  settings.minBlockMinutes = Math.min(settings.minBlockMinutes, settings.maxBlockMinutes);

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
    recordScroll(Math.max(window.innerHeight * 0.65, 420));
  }
}

function trackScroll() {
  const currentY = window.scrollY;
  const delta = Math.abs(currentY - lastY);
  lastY = currentY;

  if (delta > 8) {
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

  if (totalDistance >= settings.scrollDistancePx) {
    const durationMs = getBlockDurationMs(totalDistance, now);
    const endTime = Date.now() + durationMs;
    const animation = ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)];
    const pageSnapshot = settings.screenReadingEnabled ? readVisiblePageText() : null;
    blockPage(endTime, animation, { pageSnapshot });
  }
}

function getBlockDurationMs(totalDistance, now) {
  const firstScrollTime = scrollEvents[0]?.time || now;
  const elapsedSeconds = Math.max(1, (now - firstScrollTime) / 1000);
  const pxPerSecond = totalDistance / elapsedSeconds;
  const slowSpeed = settings.scrollDistancePx / settings.scrollWindowSeconds;
  const fastSpeed = Math.max(settings.rapidScrollPxPerSecond, slowSpeed + 1);
  const speedRatio = Math.min(1, Math.max(0, (pxPerSecond - slowSpeed) / (fastSpeed - slowSpeed)));
  const minutes = settings.maxBlockMinutes - speedRatio * (settings.maxBlockMinutes - settings.minBlockMinutes);

  return Math.max(1, minutes) * 60 * 1000;
}

function blockPage(endTime, animation, options = {}) {
  const { pageSnapshot = null, persist = true } = options;

  isBlocked = true;
  scrollEvents = [];

  if (persist) {
    sendRuntimeMessage({ type: "DSB_START_BLOCK", block: { endTime, animation, pageSnapshot } });
  }

  document.documentElement.classList.add("dsb-locked");
  document.getElementById("doomscroll-blocker-overlay")?.remove();
  document.body.appendChild(createOverlay(animation, pageSnapshot));

  const updateTimer = () => {
    const remaining = Math.max(0, endTime - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    const timer = document.getElementById("dsb-timer");

    if (timer) {
      timer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    if (remaining <= 0) {
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

function readVisiblePageText() {
  if (!document.body) {
    return null;
  }

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

  const snippets = [];
  const seen = new Set();

  while (walker.nextNode() && snippets.length < 6) {
    const text = normalizeText(walker.currentNode.textContent || "");
    const dedupeKey = text.toLowerCase().slice(0, 80);

    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      snippets.push(text.slice(0, 220));
    }
  }

  if (!snippets.length) {
    return null;
  }

  return {
    capturedAt: Date.now(),
    host: location.hostname,
    title: document.title ? normalizeText(document.title).slice(0, 120) : location.hostname,
    snippets
  };
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

function createOverlay(animation, pageSnapshot) {
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
      <p class="dsb-kicker">Doomscroll interrupted</p>
      <h1>Pause the feed. Let your brain catch up.</h1>
      <div id="dsb-timer" class="dsb-timer">05:00</div>
      <p class="dsb-copy">This pause belongs only to this tab. Close the tab and the timer is gone.</p>
      ${createPageSnapshotMarkup(pageSnapshot)}
    </div>
  `;

  return overlay;
}

function createPageSnapshotMarkup(pageSnapshot) {
  if (!pageSnapshot?.snippets?.length) {
    return "";
  }

  const snippets = pageSnapshot.snippets
    .map((snippet) => `<li>${escapeHtml(snippet)}</li>`)
    .join("");

  return `
    <aside class="dsb-page-snapshot" aria-label="Visible page text detected before the pause">
      <p>Visible page text detected locally</p>
      <strong>${escapeHtml(pageSnapshot.title || pageSnapshot.host || "Current page")}</strong>
      <ul>${snippets}</ul>
    </aside>
  `;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    };

    return entities[character];
  });
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
