/**
 * content.js
 * Scans portal DOMs dynamically using site-config.json to find points/rewards balances.
 * Operates safely, passively, and does not capture sensitive user credentials.
 * Robust selector-driven engine supporting prioritized array fallback selectors
 * and inlined attribute extractors (e.g. selector::attr(name)).
 */

let scraperConfigs = null;
let isConfigInitialized = false;
let latestBalanceMap = new Map();

/**
 * Updates the in-memory latestBalanceMap from a plain object of values.
 */
function updateLatestBalanceMap(latestBalances) {
  if (!latestBalances) return;
  for (const [key, value] of Object.entries(latestBalances)) {
    latestBalanceMap.set(key, value);
  }
}

/**
 * Loads the site-config.json file and populates the in-memory latestBalanceMap from sync storage.
 */
async function initialize() {
  try {
    const url = chrome.runtime.getURL("site-config.json");
    const response = await fetch(url);
    scraperConfigs = await response.json();
    console.log("[Points Tracker] Loaded scraper configuration successfully:", scraperConfigs);

    // Initialize latestBalanceMap from Chrome sync storage
    const result = await chrome.storage.sync.get(["latestBalances"]);
    updateLatestBalanceMap(result.latestBalances);
    console.log(
      "[Points Tracker] Initialized latestBalanceMap from storage sync:",
      latestBalanceMap,
    );
  } catch (error) {
    console.error("[Points Tracker] Failed to load site-config.json or storage sync:", error);
  }
}

/**
 * Matches the current window URL against the urlRegex of configured sites.
 */
function getActiveConfig() {
  if (!scraperConfigs) return null;
  const currentUrl = window.location.href;
  return scraperConfigs.find((site) => {
    try {
      const regex = new RegExp(site.urlRegex, "i");
      return regex.test(currentUrl);
    } catch (e) {
      return false;
    }
  });
}

function isValidConfig(config) {
  return (
    config.siteName &&
    config.urlRegex &&
    config.selectors &&
    config.selectors.accountName &&
    config.selectors.accountId &&
    config.selectors.rewardsValue &&
    config.selectors.rewardsValue
  );
}

/**
 * Extracts text from a parent element using a CSS selector or selector array.
 * Iterates through the array and evaluates each selector in strict priority order.
 * Supports inlined Scrapy-style attribute extraction syntax: "selector::attr(attributeName)".
 */
function extractText(selectorInput) {
  if (!selectorInput) return null;

  // Standardize single strings into arrays
  const selectors = Array.isArray(selectorInput) ? selectorInput : [selectorInput];

  for (let selector of selectors) {
    // Check if the selector includes an inlined attribute extractor ::attr(...)
    const attrRegex = /^(.*)::attr\(([^)]+)\)$/;
    const match = selector.match(attrRegex);
    let attrName = "";
    if (match) {
      selector = match[1].trim();
      attrName = match[2].trim();
    }

    const el = document.querySelector(selector);
    if (el) {
      let value = null;
      if (attrName) {
        value = el.getAttribute(attrName);
      } else {
        value = el.textContent ? el.textContent.trim() : "";
      }
      if (value && value.trim()) {
        return value.trim();
      }
    }
  }

  console.warn(
    `[Points Tracker] Selector "${JSON.stringify(selectorInput)}" did not match any element on the page.`,
  );
  return null;
}

/**
 * Normalizes a string value using an array of regex replacement rules.
 * Handled gracefully and optionally.
 */
function normalizeString(value, rule) {
  if (!rule) return value;

  let result = value;

  try {
    // Apply optional regex replacement
    if (rule.pattern && rule.replace !== undefined) {
      const regex = new RegExp(rule.pattern, "i");
      result = result.replace(regex, rule.replace);
    }

    // Apply optional case transformation
    if (rule.transform) {
      const transform = rule.transform.toLowerCase();
      if (transform === "titlecase") {
        result = result.replace(/\b\w/g, (char) => char.toUpperCase());
      } else if (transform === "uppercase") {
        result = result.toUpperCase();
      } else if (transform === "lowercase") {
        result = result.toLowerCase();
      }
    }
  } catch (e) {
    console.warn("[Points Tracker] Normalization rule error:", e);
  }

  return result;
}

/**
 * Executes the scraper and forwards any found data to the background script.
 * Returns true if scraping succeeded or if active config is null (no need to retry).
 * Returns false if elements are not loaded yet or if an extraction error occurs, indicating a retry is needed.
 */
async function runScraper(config) {
  let accountName = extractText(config.selectors.accountName);
  let accountId = extractText(config.selectors.accountId);
  let programName = extractText(config.selectors.programName);
  if (!accountName || !programName) {
    return false;
  }
  if (config.normalizations) {
    accountName = normalizeString(accountName, config.normalizations.accountName);
    accountId = normalizeString(accountId, config.normalizations.accountId);
    programName = normalizeString(programName, config.normalizations.programName);
  }

  const rewardsValue = extractText(config.selectors.rewardsValue).replace(/,/g, "").trim();
  if (!rewardsValue.match(/^(\d+)$/)) {
    console.error(
      `[Points Tracker] Rewards value text "${valueText}" was malformatted and did not contain a valid number.`,
    );
    return false;
  }
  const rewardsPoints = parseInt(rewardsValue, 10);

  const data = {
    provider: config.siteName,
    category: config.category,
    accountName: accountName,
    accountId: accountId,
    programName: programName,
    points: rewardsPoints,
    timestamp: new Date().toISOString(),
  };
  console.log("[Points Tracker] Scraped rewards data successfully:", data);

  const primaryKey = `${config.siteName}_${accountName}_${accountId}`;
  const lastCaptured = latestBalanceMap.get(primaryKey);
  // Only send if the balance has changed to prevent infinite loops / spam
  if (!lastCaptured || lastCaptured.points !== data.points) {
    latestBalanceMap.set(primaryKey, data);
    chrome.runtime.sendMessage({
      type: "POINTS_UPDATED",
      payload: data,
    });
  }
  return true;
}

let scrapeAttemptsInterval = null;

/**
 * Initiates a temporary rapid polling loop to robustly extract balances.
 * Retries every 500ms and immediately terminates once successful or after 10 seconds.
 */
async function scheduleScraperWithRetry() {
  if (scrapeAttemptsInterval) {
    clearInterval(scrapeAttemptsInterval);
  }

  if (!isConfigInitialized) {
    await initialize();
    isConfigInitialized = true;
  }
  // Verify if the current domain matches a configured target site
  const activeConfig = getActiveConfig();
  if (!activeConfig) return;
  if (!isValidConfig(activeConfig)) {
    console.log("[Points Tracker] Invalid config: ", activeConfig);
    return;
  }
  console.log("[Points Tracker] Start scraping on matched URL with config: ", activeConfig);

  let attempts = 0;
  const interval = 1000;
  const maxAttempts = 20;

  scrapeAttemptsInterval = setInterval(async () => {
    attempts++;
    const success = await runScraper(activeConfig);

    if (success || attempts >= maxAttempts) {
      clearInterval(scrapeAttemptsInterval);
      scrapeAttemptsInterval = null;
    }
    if (attempts >= maxAttempts) {
      console.error(
        `[Points Tracker] failed to scrape rewards information after ${maxAttempts} attemps.`,
      );
    }
  }, interval);
}

// Sync latestBalanceMap in real-time when storage updates from other tabs/devices
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.latestBalances) {
    updateLatestBalanceMap(changes.latestBalances.newValue);
  }
});

// Trigger scraper on URL changes
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "URL_CHANGED") {
    scheduleScraperWithRetry();
  }
});

// Trigger scraper on initial page load
scheduleScraperWithRetry();
