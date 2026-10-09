/**
 * background.js
 * Chrome Extension background service worker.
 */

importScripts("storage.js");

let cachedBalances = null;
let isCacheLoaded = false;
const pendingQueue = [];

// Load from storage initially
chrome.storage.sync.get(["latestBalances"], (result) => {
  cachedBalances = result.latestBalances || {};
  isCacheLoaded = true;
  console.log("[Points Nest] Background cachedBalances loaded from storage sync:", cachedBalances);
  // Process any queued scrapes that came in before the cache was loaded
  while (pendingQueue.length > 0) {
    const data = pendingQueue.shift();
    processScrapedData(data);
  }
});

// Also keep cache in sync with storage updates from elsewhere (e.g. popup clearing/updating storage, or other devices syncing)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.latestBalances) {
    cachedBalances = changes.latestBalances.newValue || {};
    console.log(
      "[Points Nest] Background cachedBalances updated from storage change listener:",
      cachedBalances,
    );
  }
});

// Listen for messages from content.js and popup.js
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "POINTS_SCRAPED") {
    const data = message.payload;
    console.log("[Points Nest] Received scraped points in background:", data);
    if (isCacheLoaded) {
      processScrapedData(data);
    } else {
      pendingQueue.push(data);
    }
  } else if (message.type === "POPUP_OPENED") {
    // Update icon to clear "update" state (with red dot)
    updateIconForActiveTab();
  }
});

// Listen for URL/navigation changes natively and notify content.js
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    updateIconForActiveTab();
    chrome.tabs
      .sendMessage(tabId, {
        type: "URL_CHANGED",
        url: changeInfo.url,
      })
      .catch(() => {});
  }
});

// Listen for tab activation (switching tabs)
chrome.tabs.onActivated.addListener(() => {
  updateIconForActiveTab();
});

// Listen for window focus changes
chrome.windows.onFocusChanged.addListener(() => {
  updateIconForActiveTab();
});

let scraperConfigs = [];

fetch(chrome.runtime.getURL("site-config.json"))
  .then((res) => res.json())
  .then((data) => {
    scraperConfigs = data;
    updateIconForActiveTab();
  });

function matchesSiteConfig(url) {
  if (!scraperConfigs || !url) return false;
  return scraperConfigs.some((site) => {
    try {
      const patterns = Array.isArray(site.urlRegex) ? site.urlRegex : [site.urlRegex];
      return patterns.some((pattern) => {
        const regex = new RegExp(pattern, "i");
        return regex.test(url);
      });
    } catch (e) {
      return false;
    }
  });
}

function setIconState(state) {
  const details = {
    path: {
      16: `icon16-${state}.png`,
      32: `icon32-${state}.png`,
      48: `icon48-${state}.png`,
      128: `icon128-${state}.png`,
    },
  };
  chrome.action.setIcon(details);
}

function updateIconForActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) {
      if (tabs[0].url && matchesSiteConfig(tabs[0].url)) {
        setIconState("active");
      } else {
        setIconState("inactive");
      }
    }
  });
}

function processScrapedData(data) {
  if (!cachedBalances) return;

  const key = getAccountKey(data);
  const existingData = cachedBalances[key];

  if (!existingData || existingData.points !== data.points) {
    // New account or account balance changed
    data.lastChanged = data.lastUpdated;
    data.change = existingData ? data.points - existingData.points : null;
    cachedBalances[key] = data;
    setIconState("update");
    updateLatestBalances(cachedBalances);
    updatePointsHistory(data);
  } else {
    // Balance has not changed, but we successfully checked it.
    // Throttle storage writes (updates to lastUpdated) to once per minute to avoid sync write quota limits.
    const prevUpdated = existingData.lastUpdated;
    const elapsed = Date.now() - new Date(prevUpdated).getTime();
    if (elapsed > 60000) {
      // Update the lastUpdated timestamp only
      existingData.lastUpdated = data.lastUpdated;
      cachedBalances[key] = existingData;
      updateLatestBalances(cachedBalances);
    }
  }
}

function updateLatestBalances(balances) {
  chrome.storage.sync.set({ latestBalances: balances }, () => {
    console.log("[Points Nest] Points updated and synced to Chrome storage.");
  });
}

console.log("[Points Nest] Background service worker loaded.");
