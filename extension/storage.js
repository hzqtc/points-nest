/**
 * storage.js
 * Centralized data manipulation and storage utilities for Points Nest.
 * Shared between background service worker and popup dashboard.
 */

const MAX_HISTORY_ENTRIES = 100;

/**
 * Returns a consistent storage key for an account.
 * Format: {provider}_{programName}_{accountId} in lowercase alphanumeric.
 */
function getAccountKey(accountData) {
  if (!accountData) return "";
  return `${accountData.provider}_${accountData.programName}_${accountData.accountId}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_");
}

/**
 * Encodes timestamp and points into a Base-36 compressed entry.
 */
function encodeHistoryEntry(timestamp, points) {
  const epochSec = Math.floor(new Date(timestamp).getTime() / 1000);
  return {
    t: epochSec.toString(36),
    p: Number(points).toString(36),
  };
}

/**
 * Decodes a Base-36 entry back into standard epoch ms timestamp and number points.
 */
function decodeHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") return null;

  let timestamp = 0;
  let points = 0;

  if (entry.t !== undefined) {
    timestamp = parseInt(entry.t, 36) * 1000;
  } else if (entry.timestamp) {
    timestamp = new Date(entry.timestamp).getTime();
  }

  if (entry.p !== undefined) {
    points = parseInt(entry.p, 36);
  } else if (entry.points !== undefined) {
    points = Number(entry.points);
  }

  if (!timestamp || isNaN(points)) return null;

  return { timestamp, points };
}

/**
 * Parses and sorts an array of raw storage history entries ascending by timestamp.
 */
function parseHistoryEntries(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];

  const points = [];
  rawHistory.forEach((entry) => {
    const decoded = decodeHistoryEntry(entry);
    if (decoded) {
      points.push(decoded);
    }
  });

  points.sort((a, b) => a.timestamp - b.timestamp);
  return points;
}

/**
 * Fetches points history for an account from chrome.storage.sync,
 * synthesizes a starting entry if empty, and anchors the latest check timestamp.
 */
function getAccountHistory(account, callback) {
  const key = getAccountKey(account);
  chrome.storage.sync.get([key], (result) => {
    const rawHistory = result[key] || [];
    const historyPoints = parseHistoryEntries(rawHistory);

    // If history is empty, synthesize a starting entry from current state
    if (historyPoints.length === 0) {
      historyPoints.push({
        timestamp: new Date(account.lastUpdated || Date.now()).getTime(),
        points: account.points,
      });
    }

    // Anchor latest check timestamp if newer than last recorded history entry
    const lastPoint = historyPoints[historyPoints.length - 1];
    const currentUpdatedMs = new Date(account.lastUpdated || Date.now()).getTime();
    if (currentUpdatedMs > lastPoint.timestamp) {
      historyPoints.push({
        timestamp: currentUpdatedMs,
        points: account.points,
      });
    } else if (lastPoint.points !== account.points) {
      historyPoints.push({
        timestamp: Math.max(currentUpdatedMs, lastPoint.timestamp + 1000),
        points: account.points,
      });
    }

    if (callback) {
      callback(historyPoints);
    }
  });
}

/**
 * Appends a new balance entry to the account's history in Chrome sync storage
 * if the points balance has changed.
 */
function updatePointsHistory(data, callback) {
  const key = getAccountKey(data);

  chrome.storage.sync.get([key], (result) => {
    const history = result[key] || [];

    // Avoid duplicate entry if latest recorded entry already has the same balance
    if (history.length > 0) {
      const lastEntry = history[history.length - 1];
      const decoded = decodeHistoryEntry(lastEntry);
      if (decoded && decoded.points === data.points) {
        if (callback) callback(history);
        return;
      }
    }

    // Convert current state to Base-36 compressed entry
    const newEntry = encodeHistoryEntry(data.lastUpdated, data.points);
    history.push(newEntry);

    // Cap at MAX_HISTORY_ENTRIES
    if (history.length > MAX_HISTORY_ENTRIES) {
      history.shift();
    }

    chrome.storage.sync.set({ [key]: history }, () => {
      console.log(`[Points Nest] History updated for key ${key}. Length: ${history.length}`);
      if (callback) callback(history);
    });
  });
}

// Export for Node.js / testing environments
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getAccountKey,
    encodeHistoryEntry,
    decodeHistoryEntry,
    parseHistoryEntries,
    getAccountHistory,
    updatePointsHistory,
    MAX_HISTORY_ENTRIES,
  };
}
