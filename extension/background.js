/**
 * background.js
 * Chrome Extension background service worker.
 */

// Listen for messages from content.js
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "POINTS_UPDATED") {
    const pointsData = message.payload;
    console.log("[Points Tracker] Received points update in background:", pointsData);
    saveToChromeStorage(pointsData);
    // Keep the message port open for asynchronous execution
    return true;
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

function saveToChromeStorage(data) {
  chrome.storage.sync.get(["latestBalances"], (result) => {
    const latestBalances = result.latestBalances || {};
    const key = `${data.provider}_${data.accountName}_${data.accountId}`;
    latestBalances[key] = data;
    chrome.storage.sync.set({ latestBalances }, () => {
      console.log("[Points Tracker] Points synced to Chrome storage across devices.");
    });
  });
}

console.log("[Points Tracker] Background service worker loaded.");
