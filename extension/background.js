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

  const key = getAccountKey(data);
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

function updatePointsHistory(data) {
  const key = getAccountKey(data);

  chrome.storage.sync.get([key], (result) => {
    const history = result[key] || [];

    // Check if the latest entry in history is already the same points to avoid duplicates
    if (history.length > 0) {
      const lastEntry = history[history.length - 1];
      const lastPoints = parseInt(lastEntry.p, 36);
      if (lastPoints === data.points) {
        // Points didn't actually change compared to the last recorded entry, no need to add duplicate
        return;
      }
    }

    // Convert current state to Base-36 compressed entry
    const epochSec = Math.floor(new Date(data.lastUpdated).getTime() / 1000);
    const newEntry = {
      t: epochSec.toString(36),
      p: data.points.toString(36),
    };
    history.push(newEntry);

    // Cap at 100 entries
    if (history.length > 100) {
      history.shift(); // Remove oldest entry
    }

    chrome.storage.sync.set({ [key]: history }, () => {
      console.log(`[Points Nest] History updated for key ${key}. Length: ${history.length}`);
    });
  });
}

function getAccountKey(accountData) {
  return `${accountData.provider}_${accountData.programName}_${accountData.accountId}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_");
}

console.log("[Points Nest] Background service worker loaded.");
