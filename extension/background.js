/**
 * background.js
 * Chrome Extension background service worker.
 * Listens for scraped points and forwards them to the local companion server.
 */

let reportUrl = null;

// Load shared constants dynamically from the symlinked shared directory
fetch(chrome.runtime.getURL("constants.json"))
  .then((res) => res.json())
  .then((constants) => {
    reportUrl = `http://localhost:${constants.PORT}${constants.API_PATH}`;
    console.log("[Points Tracker] Loaded shared server constants:", reportUrl);
  })
  .catch((err) => {
    console.err("[Points Tracker] Failed to load shared/constants.json:", err);
  });

// Listen for messages from content.js
chrome.runtime.onMessage.addListener((message, _, _) => {
  if (message.type === "POINTS_UPDATED") {
    const pointsData = message.payload;
    console.log("[Points Tracker] Received points update in background:", pointsData);
    saveToChromeStorage(pointsData);
    forwardToLocalServer(pointsData);
    // Keep the message port open for asynchronous execution
    return true;
  }
});

// Listen for URL/navigation changes natively and notify content.js
chrome.tabs.onUpdated.addListener((tabId, changeInfo, _) => {
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
  chrome.storage.local.get(["latestBalances"], (result) => {
    const latestBalances = result.latestBalances || {};
    const key = data.accountName;
    latestBalances[key] = data;
    chrome.storage.local.set({ latestBalances }, () => {
      console.log("[Points Tracker] Points saved locally to extension storage.");
    });
  });
}

/**
 * Posts the points update to the local companion daemon.
 */
function forwardToLocalServer(data) {
  fetch(reportUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then((responseData) => {
      console.log(
        "[Points Tracker] Successfully sent points to local companion daemon:",
        responseData,
      );
      // Save daemon connection status
      chrome.storage.local.set({ daemonConnected: true, daemonError: null });
    })
    .catch((error) => {
      console.warn(
        "[Points Tracker] Local companion daemon is offline or unreachable:",
        error.message,
      );
      // Save daemon connection status
      chrome.storage.local.set({
        daemonConnected: false,
        daemonError: "Local companion daemon offline.",
      });
    });
}

console.log("[Points Tracker] Background service worker loaded.");
