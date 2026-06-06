/**
 * popup.js
 * Renders points overview.
 */

document.addEventListener("DOMContentLoaded", () => {
  // Reset toolbar icon to normal state when popup is opened
  try {
    chrome.action.setIcon({
      path: {
        16: "icon16.png",
        32: "icon32.png",
        48: "icon48.png",
        128: "icon128.png",
      },
    });
  } catch (e) {
    console.warn("[Points Nest] Failed to reset action icon:", e);
  }

  renderData();

  // Listen for storage changes to refresh UI instantly
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.latestBalances) {
      renderData();
    }
  });
});

/**
 * Renders the points dashboard using saved data in chrome.storage.sync.
 */
let scraperConfigs = null;

async function loadConfig() {
  if (scraperConfigs) return scraperConfigs;
  try {
    const url = chrome.runtime.getURL("site-config.json");
    const response = await fetch(url);
    scraperConfigs = await response.json();
    return scraperConfigs;
  } catch (error) {
    console.error("[Points Nest] Failed to load site-config.json:", error);
    return [];
  }
}

async function renderData() {
  const configs = await loadConfig();
  chrome.storage.sync.get(["latestBalances"], (result) => {
    const latestBalances = result.latestBalances || {};
    const accounts = Object.values(latestBalances);

    // Calculate and display overall points total next to the app title
    const overallTotal = accounts.reduce((sum, account) => sum + account.points, 0);
    const titleTotalEl = document.getElementById("title-total");
    titleTotalEl.textContent = `(${formatNumber(overallTotal)} pts)`;
    const accountsListContainer = document.getElementById("accounts-list");

    if (accounts.length === 0) {
      document.body.classList.remove("two-column");
      accountsListContainer.replaceChildren();
      const emptyTemplate = document.getElementById("empty-state-template");
      accountsListContainer.appendChild(emptyTemplate.content.cloneNode(true));
      return;
    }

    // Group accounts by category
    const grouped = {};
    const groupSize = {};
    accounts.forEach((account) => {
      let cat = account.category;
      if (!grouped[cat]) {
        grouped[cat] = [];
        groupSize[cat] = 0;
      }
      grouped[cat].push(account);
      groupSize[cat]++;
    });

    // Sort accounts within each category by points descending
    Object.keys(grouped).forEach((cat) => {
      grouped[cat].sort((a, b) => b.points - a.points);
    });
    // Sort categories by number of accounts
    const sortedCategories = Object.entries(groupSize)
      .sort((a, b) => b[1] - a[1]) // Reverse sort by value (index 1)
      .map((entry) => entry[0]); // Get key (category)

    accountsListContainer.replaceChildren();

    if (sortedCategories.length === 1) {
      // Single column layout
      document.body.classList.remove("two-column");
      const colDiv = document.createElement("div");
      colDiv.className = "accounts-column";
      colDiv.appendChild(
        createCategoryGroup(sortedCategories[0], grouped[sortedCategories[0]], configs),
      );
      accountsListContainer.appendChild(colDiv);
    } else {
      // 2-column balanced layout
      const colA = [];
      const colB = [];
      let colARows = 0;
      let colBRows = 0;
      for (let i = 0; i < sortedCategories.length; i++) {
        if (colARows <= colBRows) {
          colA.push(sortedCategories[i]);
          colARows += grouped[sortedCategories[i]].length;
        } else {
          colB.push(sortedCategories[i]);
          colBRows += grouped[sortedCategories[i]].length;
        }
      }

      document.body.classList.add("two-column");
      const colADiv = document.createElement("div");
      colADiv.className = "accounts-column";
      colA.forEach((cat) => {
        colADiv.appendChild(createCategoryGroup(cat, grouped[cat], configs));
      });
      const colBDiv = document.createElement("div");
      colBDiv.className = "accounts-column";
      colB.forEach((cat) => {
        colBDiv.appendChild(createCategoryGroup(cat, grouped[cat], configs));
      });
      accountsListContainer.appendChild(colADiv);
      accountsListContainer.appendChild(colBDiv);
    }
  });
}

/**
 * Creates and returns a styled category group element.
 */
function createCategoryGroup(cat, items, configs) {
  const groupDiv = document.createElement("div");
  groupDiv.className = "category-group";

  const titleDiv = document.createElement("div");
  titleDiv.className = "category-title";
  const totalPoints = items.reduce((sum, item) => sum + item.points, 0);
  titleDiv.textContent = `${cat} (${formatNumber(totalPoints)} pts)`;
  groupDiv.appendChild(titleDiv);

  const cardTemplate = document.getElementById("account-card-template");

  items.forEach((account) => {
    const clone = cardTemplate.content.cloneNode(true);
    const updatedTime = getRelativeTime(account.timestamp);
    const displayName = `${account.accountName} (${account.accountId})`;
    const siteConfig = configs.find((c) => c.siteName === account.provider);
    const iconUrl = siteConfig ? siteConfig.icon : "";

    bindData(clone, {
      title: `${account.provider} — ${account.programName}`,
      account: displayName,
      points: formatNumber(account.points),
      updated: `Updated ${updatedTime}`,
      icon: iconUrl,
    });

    // Highlight the card and add change arrow classes if updated recently (e.g. within last 24 hours)
    const cardEl = clone.querySelector(".account-card");
    if (cardEl && account.timestamp) {
      const elapsedMs = Date.now() - new Date(account.timestamp).getTime();
      if (elapsedMs < 86400000) {
        cardEl.classList.add("highlighted");
        if (account.change > 0) {
          cardEl.classList.add("change-up");
        } else if (account.change < 0) {
          cardEl.classList.add("change-down");
        } else if (account.change === null || account.change === undefined) {
          cardEl.classList.add("change-new");
        }
      }
    }
    // Configure the refresh button
    const refreshBtn = clone.querySelector(".refresh-btn");
    if (refreshBtn) {
      if (account.scrapedUrl) {
        refreshBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          chrome.tabs.create({ url: account.scrapedUrl });
        });
      } else {
        refreshBtn.style.display = "none";
      }
    }

    groupDiv.appendChild(clone);
  });

  return groupDiv;
}

/**
 * Binds values to matching data-text and data-src elements inside a container.
 */
function bindData(element, data) {
  element.querySelectorAll("[data-text]").forEach((el) => {
    const key = el.getAttribute("data-text");
    if (data[key] !== undefined) {
      el.textContent = data[key];
    }
  });
  element.querySelectorAll("[data-src]").forEach((el) => {
    const key = el.getAttribute("data-src");
    if (data[key] !== undefined) {
      el.src = data[key];
    }
  });
}

/**
 * Helper to display values cleanly (e.g. 123456 -> "123,456")
 */
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Converts an ISO timestamp into a human-readable relative time string.
 * Supports "just now", minutes, hours, days, months, and years ago.
 */
function getRelativeTime(timestamp) {
  if (!timestamp) return "";
  const now = new Date();
  const past = new Date(timestamp);
  const diffMs = now - past;

  // If time is in the future or under 60 seconds, display "just now"
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffMs < 0 || diffSeconds < 60) {
    return "Just now";
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return diffMinutes === 1 ? "1 minute ago" : `${diffMinutes} minutes ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return diffMonths === 1 ? "1 month ago" : `${diffMonths} months ago`;
  }

  const diffYears = Math.floor(diffMonths / 12);
  const remainingMonths = diffMonths % 12;
  const yearText = diffYears === 1 ? "1 year" : `${diffYears} years`;
  if (remainingMonths > 0) {
    const monthText = remainingMonths === 1 ? "1 month" : `${remainingMonths} months`;
    return `${yearText} ${monthText} ago`;
  } else {
    return `${yearText} ago`;
  }
}
