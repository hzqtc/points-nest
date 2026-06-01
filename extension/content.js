/**
 * content.js
 * Scans portal DOMs dynamically using config.json to find points/rewards balances.
 * Operates safely, passively, and does not capture sensitive user credentials.
 * Robust selector-driven engine supporting prioritized array fallback selectors
 * and inlined attribute extractors (e.g. selector::attr(name)).
 */

let scraperConfigs = null;
let isConfigInitialized = false;
let lastCapturedDataMap = new Map();

/**
 * Loads the config.json file from the extension bundle.
 */
async function loadScraperConfig() {
  try {
    const url = chrome.runtime.getURL("config.json");
    const response = await fetch(url);
    scraperConfigs = await response.json();
    console.log("[Points Tracker] Loaded scraper configuration successfully:", scraperConfigs);
  } catch (error) {
    console.error("[Points Tracker] Failed to load config.json:", error);
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

/**
 * Extracts text from a parent element using a CSS selector or selector array.
 * Iterates through the array and evaluates each selector in strict priority order.
 * Supports inlined Scrapy-style attribute extraction syntax: "selector::attr(attributeName)".
 */
function extractText(container, selectorInput) {
  if (!container || !selectorInput) return null;

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

    const el = container.querySelector(selector);
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

  return null;
}

/**
 * Resolves the active Account Name using the selector from config.json.
 * Throws explicit errors if the selector fails to match or returns an empty value.
 */
function getAccountName(config) {
  if (!config.selectors || !config.selectors.accountName) return null;

  const selector = config.selectors.accountName;
  const text = extractText(document, selector);
  if (!text) {
    throw new Error(
      `Account name selector "${JSON.stringify(selector)}" did not match any element on the page.`,
    );
  }
  return text;
}

/**
 * Scans the DOM for a single points balance using config.json selectors.
 * Pure extraction method: returns only { programName, points }.
 */
function scrapeReward(config) {
  if (!config.selectors) return null;

  const selectors = config.selectors;
  if (!selectors.rewardsContainer || !selectors.rewardsLabel || !selectors.rewardsValue)
    return null;

  // Find the first matched container element
  const containerSelectors = Array.isArray(selectors.rewardsContainer)
    ? selectors.rewardsContainer
    : [selectors.rewardsContainer];
  let item = null;
  for (const cSel of containerSelectors) {
    item = document.querySelector(cSel);
    if (item) break;
  }

  if (!item) {
    throw new Error(
      `Rewards container selector "${JSON.stringify(selectors.rewardsContainer)}" matched zero elements on the page.`,
    );
  }

  const labelText = extractText(item, selectors.rewardsLabel);
  if (!labelText) {
    throw new Error(
      `Rewards label selector "${JSON.stringify(selectors.rewardsLabel)}" matched no element or attribute inside container.`,
    );
  }

  const valueText = extractText(item, selectors.rewardsValue);
  if (!valueText) {
    throw new Error(
      `Rewards value selector "${JSON.stringify(selectors.rewardsValue)}" matched no element or attribute inside container.`,
    );
  }

  // Strip non-digits and commas to parse clean numeric value
  const cleanedValueText = valueText.replace(/,/g, "").trim();
  const numberMatch = cleanedValueText.match(/(\d+)/);

  if (!numberMatch) {
    throw new Error(
      `Rewards value text "${valueText}" was malformatted and did not contain a valid number.`,
    );
  }

  const points = parseInt(numberMatch[1], 10);
  return {
    programName: labelText,
    points: points,
  };
}

/**
 * Executes the scraper and forwards any found data to the background script.
 * Returns true if scraping succeeded or if active config is null (no need to retry).
 * Returns false if elements are not loaded yet or if an extraction error occurs, indicating a retry is needed.
 */
async function runScraper(config) {
  try {
    const accountName = getAccountName(config);
    const reward = scrapeReward(config);

    if (accountName && reward) {
      const data = {
        bank: config.siteName,
        accountName: accountName,
        programName: reward.programName,
        points: reward.points,
        timestamp: new Date().toISOString(),
      };
      console.log("[Points Tracker] Scraped rewards data successfully:", data);

      const lastCaptured = lastCapturedDataMap.get(accountName);
      // Only send if the balance has changed to prevent infinite loops / spam
      if (!lastCaptured || lastCaptured.points !== data.points) {
        lastCapturedDataMap.set(accountName, data);
        chrome.runtime.sendMessage({
          type: "POINTS_UPDATED",
          payload: data,
        });
      }
      return true;
    }
  } catch (error) {
    console.warn(`[Points Tracker] ${error.message}`);
  }
  return false;
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
    await loadScraperConfig();
    isConfigInitialized = true;
  }
  // Verify if the current domain matches a configured target site
  const activeConfig = getActiveConfig();
  if (!activeConfig) return;

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
      console.err(
        `[Points Tracker] failed to scrape rewards information after ${maxAttempts} attemps.`,
      );
    }
  }, interval);
}

// Trigger scraper on URL changes
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "URL_CHANGED") {
    console.log("[Points Tracker] URL change detected, scheduling scraping retry loop...");
    scheduleScraperWithRetry();
  }
});

// Trigger scraper on initial page load
scheduleScraperWithRetry();
