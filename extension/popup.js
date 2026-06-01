/**
 * popup.js
 * Renders points overview, checks local daemon connectivity,
 */

document.addEventListener("DOMContentLoaded", () => {
  renderData();
  checkDaemonStatus();

  // Listen for real-time background storage updates to refresh UI instantly
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "POINTS_UPDATED") {
      renderData();
    }
  });

  // Poll daemon connectivity status periodically
  setInterval(checkDaemonStatus, 5000);
});

/**
 * Renders the points dashboard using saved data in chrome.storage.local.
 */
function renderData() {
  chrome.storage.local.get(["latestBalances"], (result) => {
    const latestBalances = result.latestBalances || {};
    const accounts = Object.values(latestBalances);

    const accountsListContainer = document.getElementById("accounts-list");

    if (accounts.length === 0) {
      accountsListContainer.innerHTML = `
        <div class="empty-state">
          <p>No accounts tracked yet.</p>
        </div>
      `;
      return;
    }

    // Sort accounts: largest points first
    accounts.sort((a, b) => b.points - a.points);

    // Populate UI
    accountsListContainer.innerHTML = "";
    accounts.forEach((account) => {
      const card = document.createElement("div");
      card.className = "account-card";

      const updatedTime = new Date(account.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      card.innerHTML = `
        <div class="account-info">
          <span class="account-bank">${account.bank} — ${account.programName}</span>
          <span class="account-name">${account.accountName}</span>
        </div>
        <div class="account-pts">
          <span class="pts-amount">${formatNumber(account.points)}</span>
          <div class="pts-updated">Updated ${updatedTime}</div>
        </div>
      `;
      accountsListContainer.appendChild(card);
    });
  });
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
