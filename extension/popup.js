/**
 * popup.js
 * Renders points overview, checks local daemon connectivity,
 */

document.addEventListener("DOMContentLoaded", () => {
  renderData();
  checkDaemonStatus();

  // Listen for storage changes to refresh UI instantly
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.latestBalances) {
      renderData();
    }
    if (changes.daemonConnected || changes.daemonError) {
      checkDaemonStatus();
    }
  });
});

/**
 * Renders the points dashboard using saved data in chrome.storage.sync.
 */
function renderData() {
  chrome.storage.sync.get(["latestBalances"], (result) => {
    const latestBalances = result.latestBalances || {};
    const accounts = Object.values(latestBalances);

    // Calculate and display overall points total next to the app title
    const overallTotal = accounts.reduce((sum, account) => sum + account.points, 0);
    const appTitleEl = document.querySelector(".app-title");
    appTitleEl.innerHTML = `Points Tracker <span class="title-total">(${formatNumber(overallTotal)} pts)</span>`;

    const accountsListContainer = document.getElementById("accounts-list");

    if (accounts.length === 0) {
      document.body.classList.remove("two-column");
      accountsListContainer.innerHTML = `
        <div class="empty-state">
          <p>No accounts tracked yet.</p>
        </div>
      `;
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

    accountsListContainer.innerHTML = "";
    if (sortedCategories.length === 1) {
      // Single column layout
      document.body.classList.remove("two-column");
      const colDiv = document.createElement("div");
      colDiv.className = "accounts-column";
      colDiv.appendChild(createCategoryGroup(sortedCategories[0], grouped[sortedCategories[0]]));
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
        colADiv.appendChild(createCategoryGroup(cat, grouped[cat]));
      });
      const colBDiv = document.createElement("div");
      colBDiv.className = "accounts-column";
      colB.forEach((cat) => {
        colBDiv.appendChild(createCategoryGroup(cat, grouped[cat]));
      });
      accountsListContainer.appendChild(colADiv);
      accountsListContainer.appendChild(colBDiv);
    }
  });
}

/**
 * Creates and returns a styled category group element.
 */
function createCategoryGroup(cat, items) {
  const groupDiv = document.createElement("div");
  groupDiv.className = "category-group";

  const titleDiv = document.createElement("div");
  titleDiv.className = "category-title";
  const totalPoints = items.reduce((sum, item) => sum + item.points, 0);
  titleDiv.textContent = `${cat} (${formatNumber(totalPoints)} pts)`;
  groupDiv.appendChild(titleDiv);

  items.forEach((account) => {
    const card = document.createElement("div");
    card.className = "account-card";

    const updatedTime = getRelativeTime(account.timestamp);
    const displayName = account.accountId
      ? `${account.accountName} (${account.accountId})`
      : account.accountName;

    card.innerHTML = `
      <div class="account-info">
        <span class="account-provider">${account.provider} — ${account.programName}</span>
        <span class="account-name">${displayName}</span>
      </div>
      <div class="account-pts">
        <span class="pts-amount">${formatNumber(account.points)}</span>
        <div class="pts-updated">Updated ${updatedTime}</div>
      </div>
    `;
    groupDiv.appendChild(card);
  });

  return groupDiv;
}

/**
 * Checks local daemon server connectivity by checking background variables
 */
function checkDaemonStatus() {
  chrome.storage.local.get(["daemonConnected", "daemonError"], (result) => {
    const badge = document.getElementById("daemon-status");
    const badgeText = badge.querySelector(".status-text");

    if (result.daemonConnected) {
      badge.className = "status-badge online";
      badgeText.textContent = "Daemon Online";
    } else {
      badge.className = "status-badge offline";
      badgeText.textContent = "Daemon Offline";
      if (result.daemonError) {
        console.warn("[Points Tracker] Daemon connection issue:", result.daemonError);
      }
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
