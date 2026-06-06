# Points Nest 🪺 (Secure & Local)

**Points Nest** is a lightweight, local-first Chrome Extension that securely aggregates your credit card rewards, hotel points, and frequent flyer airline miles into a beautiful unified dashboard.

Unlike traditional reward trackers, **Points Nest does not require your credentials, store data on external servers, or use any third-party databases.** It parses point balances directly within your active browser tab when you log into your accounts and stores them completely locally in your browser's encrypted sync storage.

---

## Features

- 🔒 **Zero Credentials Stored:** Works passively on top of your existing browser sessions. No usernames or passwords ever leave your machine.
- 💻 **100% Local-first:** Uses `chrome.storage.sync` to sync points across your devices securely using Chrome's built-in mechanism.
- 🎨 **Beautiful Dashboard:** Groups your balances into clear categories (**Bank**, **Hotel**, **Airline**) with auto-calculated total balances and positive/negative change highlights.
- ⚡ **Dynamic Scraper Engine:** Decoupled config-driven architecture using declarative JSON selectors, prioritizations, and regex normalization rules.
- 🔄 **Stabilized Scraping:** Smart poll retries designed to wait for deferred elements and UI counter animations (e.g. Marriott's counter animation).

---

## Supported Portals

- **Banks:** Chase, American Express (Amex)
- **Hotels:** World of Hyatt, IHG, Hilton Honors, Marriott Bonvoy
- **Airlines:** Alaska Airlines, Delta Skymiles, United MileagePlus

---

## Installation

1. Clone or download this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click the **Load unpacked** button in the top-left corner.
5. Select the `extension` directory from this project folder.
6. Pin **Points Nest** to your extensions toolbar for easy access.

---

## How to Use

1. Click on the extension icon in your browser toolbar to open the dashboard.
2. Log in to any supported rewards portal (e.g. Marriott, Chase, Hyatt).
3. Navigate to the portal's main account overview or dashboard page.
4. The extension automatically scrapes your rewards points.
   - A **red dot indicator** will appear on the extension icon to let you know a new balance has been successfully captured.
5. Open the extension popup to view your updated and synchronized point balances!

---

## Codebase Architecture

```
points-scraper/
├── extension/
│   ├── manifest.json       # Extension configuration (Manifest V3)
│   ├── site-config.json    # Declarative selector rules for supported sites
│   ├── background.js       # Listens for scraping events & syncs with storage
│   ├── content.js          # Scrapes points dynamically based on site-config.json
│   ├── popup.html          # Pop-up dashboard UI
│   ├── popup.js            # Renders lists and totals on the popup UI
│   └── styles.css          # Beautiful CSS styling with modern layout
└── README.md
```

---

## Contributing & Adding New Sites

We welcome contributions to add support for new credit card, hotel, or airline portals! Supported sites are defined declaratively in `extension/site-config.json`.

### Understanding the Config Schema

Each site configuration object in `site-config.json` uses the following structure:

```json
{
  "siteName": "Chase",
  "category": "Bank",
  "icon": "https://www.chase.com/favicon.ico",
  "urlRegex": "https://secure\\.chase\\.com/web/auth/dashboard#/dashboard/summary/[0-9]+/CARD/BAC",
  "selectors": {
    "accountName": ".nav-bar__print-header",
    "accountId": ".nav-bar__print-header",
    "programName": [
      "[id$=\"Rewards-dataItem\"] [data-testid=\"dataItem-label\"] mds-definition-link::attr(definition-text)",
      "[id$=\"Rewards-dataItem\"] [data-testid=\"dataItem-label\"]"
    ],
    "rewardsValue": "[id$=\"Rewards-dataItem\"] [data-testid=\"dataItem-value\"]"
  },
  "normalizations": {
    "accountName": {
      "pattern": "\\s*\\(\\.\\.\\.\\d+\\)",
      "replace": ""
    },
    "accountId": {
      "pattern": ".*\\(\\.\\.\\.(\\d+)\\)",
      "replace": "$1"
    },
    "programName": {
      "pattern": "®? [pP]oints",
      "replace": ""
    }
  }
}
```

#### Fields Breakdown:

- **`siteName`** _(string, Required)_: The display name of the provider (e.g. `"Chase"`, `"Marriott Bonvoy"`).
- **`category`** _(string, Required)_: Categorizes the reward portal. Must be one of: `"Bank"`, `"Hotel"`, or `"Airline"`.
- **`icon`** _(string, Required)_: URL of the favicon or small brand logo to display on the cards.
- **`urlRegex`** _(string | string[], Required)_: Regular expression pattern(s) that match the URL of the dashboard page where the scraping should occur.
- **`selectors`** _(Object, Required)_: Contains CSS selectors to parse values from the page:
  - **`accountName`** _(string | string[])_: Selector for the cardholder or account nickname.
  - **`accountId`** _(string | string[])_: Selector for the account number or membership ID (often the last 4 digits).
  - **`programName`** _(string | string[])_: Selector for the rewards tier or point program name (e.g., "Sapphire Preferred", "Gold Elite").
  - **`rewardsValue`** _(string | string[])_: Selector for the numerical rewards point/mile balance.
- **`normalizations`** _(Object, Optional)_: Optional text post-processing rules applied to the parsed strings:
  - **`pattern`** _(string)_: Regex pattern to search for.
  - **`replace`** _(string)_: Text to replace the pattern match with (supports backreferences like `$1`).
  - **`transform`** _(string)_: Modifies case sensitivity. Can be `"titlecase"`, `"uppercase"`, or `"lowercase"`.

### Advanced Selector Syntax

1. **Priority Arrays**:
   If a portal's DOM changes frequently or displays differently depending on the logged-in status, you can provide an array of selectors. The engine will evaluate each one in order and return the first match:

   ```json
   "programName": [
     ".premium-selector",
     ".fallback-selector"
   ]
   ```

2. **Attribute Extractors (`::attr`)**:
   By default, the scraper extracts text using `element.textContent`. If the desired value is stored in an attribute (e.g. `aria-label`, `alt`, `title`), append `::attr(attributeName)` to your selector:
   ```json
   "programName": ".membership-badge::attr(aria-label)"
   ```

---

## Development & Debugging

To test your new selectors locally:

1. Add your new site config object to `extension/site-config.json`.
2. Reload the extension inside `chrome://extensions/`.
3. Open your browser console (DevTools) on the target rewards portal page.
4. Watch for debug console logs prefixed with `[Points Nest]`.
5. If the selectors fail to fetch elements, verify them in the console using:
   ```javascript
   document.querySelector("YOUR_SELECTOR");
   ```
6. Make sure the points balance scraper successfully stabilizes past any animated counters before final storage sync.
