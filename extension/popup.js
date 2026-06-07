/**
 * popup.js
 * Renders points overview.
 */

let currentDisplayMode = "pts";
let scraperConfigs = null;
let programValuations = null;

document.addEventListener("DOMContentLoaded", () => {
  // Reset toolbar icon to normal state when popup is opened
  chrome.action.setIcon({
    path: {
      16: "icon16.png",
      32: "icon32.png",
      48: "icon48.png",
      128: "icon128.png",
    },
  });

  // Load preferred display mode and bind click listener
  chrome.storage.sync.get(["displayMode"], (result) => {
    currentDisplayMode = result.displayMode || "pts";
    updateToggleUI();
    renderData();
  });

  const toggleBtn = document.getElementById("toggle-display");
  toggleBtn.addEventListener("click", () => {
    currentDisplayMode = currentDisplayMode === "pts" ? "usd" : "pts";
    chrome.storage.sync.set({ displayMode: currentDisplayMode }, () => {
      updateToggleUI();
      renderData();
    });
  });

  // Listen for storage changes to refresh UI instantly
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.displayMode) {
      currentDisplayMode = changes.displayMode.newValue;
      updateToggleUI();
      renderData();
    } else if (changes.latestBalances) {
      renderData();
    }
  });
});

function updateToggleUI() {
  const toggleBtn = document.getElementById("toggle-display");
  const ptsLabel = toggleBtn.querySelector(".points-label");
  const usdLabel = toggleBtn.querySelector(".usd-label");

  if (currentDisplayMode === "usd") {
    toggleBtn.classList.add("usd-active");
    ptsLabel.classList.remove("active");
    usdLabel.classList.add("active");
  } else {
    toggleBtn.classList.remove("usd-active");
    ptsLabel.classList.add("active");
    usdLabel.classList.remove("active");
  }
}

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

async function loadValuations() {
  if (programValuations) return programValuations;
  try {
    const url = chrome.runtime.getURL("constants.json");
    const response = await fetch(url);
    programValuations = await response.json();
    return programValuations;
  } catch (error) {
    console.error("[Points Nest] Failed to load constants.json:", error);
    return {};
  }
}

function getValuationCpp(account, valuations) {
  // 1. Try exact match on programName
  if (account.programName && valuations[account.programName] !== undefined) {
    return valuations[account.programName];
  }

  // 2. Try substring match on programName keys
  if (account.programName) {
    for (const [key, cpp] of Object.entries(valuations)) {
      if (account.programName.toLowerCase().includes(key.toLowerCase())) {
        return cpp;
      }
    }
  }

  // 3. Try match/substring match on provider/siteName
  if (account.provider && valuations[account.provider] !== undefined) {
    return valuations[account.provider];
  }
  if (account.provider) {
    for (const [key, cpp] of Object.entries(valuations)) {
      if (account.provider.toLowerCase().includes(key.toLowerCase())) {
        return cpp;
      }
    }
  }

  // Default fallback (1.0 cent per point)
  return 1.0;
}

async function renderData() {
  const configs = await loadConfig();
  const valuations = await loadValuations();

  chrome.storage.sync.get(["latestBalances"], (result) => {
    const latestBalances = result.latestBalances || {};
    const accounts = Object.values(latestBalances);
    const overallTotal = accounts.reduce((sum, account) => sum + account.points, 0);

    const titleTotalEl = document.getElementById("title-total");
    if (currentDisplayMode === "usd") {
      const overallUsdTotal = accounts.reduce((sum, account) => {
        const cpp = getValuationCpp(account, valuations);
        return sum + account.points * (cpp / 100);
      }, 0);
      titleTotalEl.textContent = `($${formatCurrency(overallUsdTotal)})`;
    } else {
      titleTotalEl.textContent = `(${formatNumber(overallTotal)} pts)`;
    }

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
      .sort((a, b) => b[1] - a[1])
      .map((entry) => entry[0]);

    accountsListContainer.replaceChildren();

    if (sortedCategories.length === 1) {
      // Single column layout
      document.body.classList.remove("two-column");
      const colDiv = document.createElement("div");
      colDiv.className = "accounts-column";
      colDiv.appendChild(
        createCategoryGroup(sortedCategories[0], grouped[sortedCategories[0]], configs, valuations),
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
        colADiv.appendChild(createCategoryGroup(cat, grouped[cat], configs, valuations));
      });
      const colBDiv = document.createElement("div");
      colBDiv.className = "accounts-column";
      colB.forEach((cat) => {
        colBDiv.appendChild(createCategoryGroup(cat, grouped[cat], configs, valuations));
      });
      accountsListContainer.appendChild(colADiv);
      accountsListContainer.appendChild(colBDiv);
    }
  });
}

/**
 * Creates and returns a styled category group element.
 */
function createCategoryGroup(cat, items, configs, valuations) {
  const groupDiv = document.createElement("div");
  groupDiv.className = "category-group";

  const titleDiv = document.createElement("div");
  titleDiv.className = "category-title";

  const totalPoints = items.reduce((sum, item) => sum + item.points, 0);

  if (currentDisplayMode === "usd") {
    const totalUsd = items.reduce((sum, item) => {
      const cpp = getValuationCpp(item, valuations);
      return sum + item.points * (cpp / 100);
    }, 0);
    titleDiv.textContent = `${cat} ($${formatCurrency(totalUsd)})`;
  } else {
    titleDiv.textContent = `${cat} (${formatNumber(totalPoints)} pts)`;
  }
  groupDiv.appendChild(titleDiv);

  const cardTemplate = document.getElementById("account-card-template");

  items.forEach((account) => {
    const clone = cardTemplate.content.cloneNode(true);
    const updatedTime = getRelativeTime(account.lastUpdated);
    const displayName = `${account.accountName} (${account.accountId})`;
    const siteConfig = configs.find((c) => c.siteName === account.provider);
    const iconUrl = siteConfig ? siteConfig.icon : "";

    const cpp = getValuationCpp(account, valuations);
    const pointsDisplay =
      currentDisplayMode === "usd"
        ? `$${formatCurrency(account.points * (cpp / 100))}`
        : formatNumber(account.points);

    bindData(clone, {
      title: `${account.provider} — ${account.programName}`,
      account: displayName,
      points: pointsDisplay,
      updated: `Updated ${updatedTime}`,
      icon: iconUrl,
    });

    // Add change indicators if changed recently (e.g. within last 24 hours)
    const cardEl = clone.querySelector(".account-card");
    const isRecentlyChanged = Date.now() - new Date(account.lastChanged).getTime() < 86400000;
    if (isRecentlyChanged) {
      cardEl.classList.add("highlighted");
      const ptsChangeEl = clone.querySelector(".pts-change");
      if (account.change > 0) {
        cardEl.classList.add("change-up");
        if (ptsChangeEl) {
          if (currentDisplayMode === "usd") {
            ptsChangeEl.textContent = `+$${formatCurrency(account.change * (cpp / 100))}`;
          } else {
            ptsChangeEl.textContent = `+${formatNumber(account.change)}`;
          }
        }
      } else if (account.change < 0) {
        cardEl.classList.add("change-down");
        if (ptsChangeEl) {
          if (currentDisplayMode === "usd") {
            ptsChangeEl.textContent = `-$${formatCurrency(Math.abs(account.change) * (cpp / 100))}`;
          } else {
            ptsChangeEl.textContent = `-$${formatNumber(Math.abs(account.change))}`;
          }
        }
      } else if (account.change === null || account.change === undefined) {
        cardEl.classList.add("change-new");
        if (ptsChangeEl) {
          ptsChangeEl.textContent = "new";
        }
      }
    }

    // Set the status indicator based on data freshness/age
    const statusDotEl = clone.querySelector(".status-dot");
    const elapsedSinceLastUpdate = Date.now() - new Date(account.lastUpdated).getTime();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const oneMonth = 30 * 24 * 60 * 60 * 1000;
    if (elapsedSinceLastUpdate < oneWeek) {
      statusDotEl.classList.add("status-green");
    } else if (elapsedSinceLastUpdate < oneMonth) {
      statusDotEl.classList.add("status-yellow");
    } else {
      statusDotEl.classList.add("status-red");
    }

    // Click on the card opens the scraped url
    if (cardEl && account.scrapedUrl) {
      cardEl.classList.add("clickable");
      cardEl.setAttribute("title", `Open ${account.accountName} (${account.accountId})`);
      cardEl.addEventListener("click", () => {
        chrome.tabs.create({ url: account.scrapedUrl });
      });
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
 * Helper to display currency cleanly (e.g. 1234.56 -> "1,234.56")
 */
function formatCurrency(val) {
  return val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
