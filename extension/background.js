/**
 * background.js
 * Chrome Extension background service worker.
 */

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

// Listen for messages from content.js
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "POINTS_SCRAPED") {
    const data = message.payload;
    console.log("[Points Nest] Received scraped points in background:", data);
    if (isCacheLoaded) {
      processScrapedData(data);
    } else {
      pendingQueue.push(data);
    }
  }
});

// Listen for URL/navigation changes natively and notify content.js
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    chrome.tabs
      .sendMessage(tabId, {
        type: "URL_CHANGED",
        url: changeInfo.url,
      })
      .catch(() => {
        // Safely ignore errors for tabs that don't have our content script loaded
      });
  }
});

function processScrapedData(data) {
  if (!cachedBalances) return;

  const key = `${data.provider}_${data.accountName}_${data.accountId}`;
  const existingData = cachedBalances[key];

  if (!existingData || existingData.points !== data.points) {
    // New account or account balance changed
    data.lastChanged = data.lastUpdated;
    data.change = existingData ? data.points - existingData.points : null;
    cachedBalances[key] = data;
    chrome.action.setIcon({
      path: {
        16: "icon16-active.png",
        32: "icon32-active.png",
        48: "icon48-active.png",
        128: "icon128-active.png",
      },
    });
  } else {
    // Balance has not changed, but we successfully checked it.
    // Throttle storage writes (updates to lastUpdated) to once per minute to avoid sync write quota limits.
    const prevUpdated = existingData.lastUpdated;
    const elapsed = Date.now() - new Date(prevUpdated).getTime();
    if (elapsed <= 60000) {
      return;
    } else {
      // Update the lastUpdated timestamp only
      existingData.lastUpdated = data.lastUpdated;
      cachedBalances[key] = existingData;
    }
  }

  chrome.storage.sync.set({ latestBalances: cachedBalances }, () => {
    console.log("[Points Nest] Points updated and synced to Chrome storage.");
  });
}

console.log("[Points Nest] Background service worker loaded.");
