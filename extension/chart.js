/**
 * chart.js
 * SVG line chart rendering engine and tooltip interactions for Points Nest.
 */

/**
 * Resolves valuation cents-per-point (CPP) for an account.
 */
function resolveValuationCpp(account, valuations) {
  if (typeof getValuationCpp === "function") {
    return getValuationCpp(account, valuations);
  }
  if (!account || !valuations) return 1.0;
  if (account.programName && valuations[account.programName] !== undefined) {
    return valuations[account.programName];
  }
  if (account.programName) {
    for (const [key, cpp] of Object.entries(valuations)) {
      if (account.programName.toLowerCase().includes(key.toLowerCase())) {
        return cpp;
      }
    }
  }
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
  return 1.0;
}

/**
 * Helper to format points number.
 */
function formatChartNumber(num) {
  if (typeof formatNumber === "function") {
    return formatNumber(num);
  }
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Helper to format currency value.
 */
function formatChartCurrency(val) {
  if (typeof formatCurrency === "function") {
    return formatCurrency(val);
  }
  return val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formats timestamp to short date string (e.g., "Jun 6").
 */
function formatDateShort(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Formats timestamp to full date-time string (e.g., "Jun 6, 2:30 PM").
 */
function formatDateTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Formats Y-axis tick numbers neatly based on current display mode.
 */
function formatYAxisLabel(points, account, valuations, displayMode = "pts") {
  if (displayMode === "usd") {
    const cpp = resolveValuationCpp(account, valuations);
    const usd = points * (cpp / 100);
    if (usd >= 1000) {
      return `$${(usd / 1000).toFixed(usd >= 10000 ? 0 : 1)}k`;
    }
    return `$${Math.round(usd)}`;
  } else {
    if (points >= 1000000) {
      return `${(points / 1000000).toFixed(1)}M`;
    }
    if (points >= 1000) {
      return `${(points / 1000).toFixed(points >= 10000 ? 0 : 1)}k`;
    }
    return Math.round(points).toString();
  }
}

/**
 * Calculates metrics and renders the history chart SVG and stats grid.
 */
function renderHistoryChart(historyPoints, account, valuations, displayMode = "pts") {
  const chartContainer = document.getElementById("chart-container");
  if (!chartContainer) return;

  const cpp = resolveValuationCpp(account, valuations);
  const firstPoint = historyPoints[0];
  const latestPoint = historyPoints[historyPoints.length - 1];

  const pointsValues = historyPoints.map((p) => p.points);
  const minPoints = Math.min(...pointsValues);
  const maxPoints = Math.max(...pointsValues);
  const netChange = latestPoint.points - firstPoint.points;

  // 1. Update Balance Summary Row
  const ptsAmountEl = document.getElementById("modal-current-points");
  const ptsChangeEl = document.getElementById("modal-pts-change");

  if (ptsAmountEl && ptsChangeEl) {
    if (displayMode === "usd") {
      ptsAmountEl.textContent = `$${formatChartCurrency(latestPoint.points * (cpp / 100))}`;
      if (netChange !== 0) {
        const sign = netChange > 0 ? "+" : "-";
        const usdChange = Math.abs(netChange) * (cpp / 100);
        ptsChangeEl.textContent = `${sign}$${formatChartCurrency(usdChange)}`;
        ptsChangeEl.className = `modal-pts-change ${netChange > 0 ? "change-up" : "change-down"}`;
      } else {
        ptsChangeEl.textContent = "";
        ptsChangeEl.className = "modal-pts-change";
      }
    } else {
      ptsAmountEl.textContent = `${formatChartNumber(latestPoint.points)} pts`;
      if (netChange !== 0) {
        const sign = netChange > 0 ? "+" : "";
        ptsChangeEl.textContent = `${sign}${formatChartNumber(netChange)}`;
        ptsChangeEl.className = `modal-pts-change ${netChange > 0 ? "change-up" : "change-down"}`;
      } else {
        ptsChangeEl.textContent = "";
        ptsChangeEl.className = "modal-pts-change";
      }
    }
  }

  // 2. Update Stats Grid
  const statNetChangeEl = document.getElementById("stat-net-change");
  const statHighestEl = document.getElementById("stat-highest");
  const statLowestEl = document.getElementById("stat-lowest");

  if (statNetChangeEl) {
    let pctStr = "";
    if (firstPoint.points > 0 && netChange !== 0) {
      const pct = ((netChange / firstPoint.points) * 100).toFixed(1);
      pctStr = ` (${netChange > 0 ? "+" : ""}${pct}%)`;
    }
    if (netChange > 0) {
      statNetChangeEl.textContent =
        displayMode === "usd"
          ? `+$${formatChartCurrency(netChange * (cpp / 100))}${pctStr}`
          : `+${formatChartNumber(netChange)}${pctStr}`;
      statNetChangeEl.className = "stat-value change-up";
    } else if (netChange < 0) {
      statNetChangeEl.textContent =
        displayMode === "usd"
          ? `-$${formatChartCurrency(Math.abs(netChange) * (cpp / 100))}${pctStr}`
          : `-${formatChartNumber(Math.abs(netChange))}${pctStr}`;
      statNetChangeEl.className = "stat-value change-down";
    } else {
      statNetChangeEl.textContent = displayMode === "usd" ? "$0.00" : "0 pts";
      statNetChangeEl.className = "stat-value";
    }
  }

  if (statHighestEl) {
    statHighestEl.textContent =
      displayMode === "usd"
        ? `$${formatChartCurrency(maxPoints * (cpp / 100))}`
        : `${formatChartNumber(maxPoints)} pts`;
  }

  if (statLowestEl) {
    statLowestEl.textContent =
      displayMode === "usd"
        ? `$${formatChartCurrency(minPoints * (cpp / 100))}`
        : `${formatChartNumber(minPoints)} pts`;
  }

  // 3. Render Chart SVG
  chartContainer.replaceChildren();

  const timeMin = firstPoint.timestamp;
  const timeMax = latestPoint.timestamp;
  const timeSpan = timeMax - timeMin;

  // Single Point / Zero time span state
  if (historyPoints.length === 1 || timeSpan <= 0) {
    const svg = createSinglePointSvg(latestPoint, account, valuations, displayMode);
    chartContainer.appendChild(svg);
    const msg = document.createElement("div");
    msg.className = "chart-single-point-message";
    msg.textContent = "Initial balance recorded. Balance history will chart trends as points update.";
    chartContainer.appendChild(msg);
    return;
  }

  // Multiple points line chart
  const svg = createLineChartSvg(
    historyPoints,
    account,
    valuations,
    cpp,
    minPoints,
    maxPoints,
    timeMin,
    timeMax,
    displayMode,
  );
  chartContainer.appendChild(svg);
}

/**
 * Creates SVG for a single balance record.
 */
function createSinglePointSvg(point, account, valuations, displayMode = "pts") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 460 160");
  svg.setAttribute("class", "chart-svg");

  const paddingLeft = 52;
  const plotWidth = 388;
  const centerY = 75;

  const yLabel = formatYAxisLabel(point.points, account, valuations, displayMode);

  svg.innerHTML = `
    <!-- Center Grid Line -->
    <line x1="${paddingLeft}" y1="${centerY}" x2="${paddingLeft + plotWidth}" y2="${centerY}" stroke="var(--border-color)" stroke-dasharray="3,3" stroke-width="1" />
    <text x="${paddingLeft - 8}" y="${centerY + 3.5}" text-anchor="end" fill="var(--text-secondary)" font-size="10" font-family="'Plus Jakarta Sans', sans-serif" font-weight="500">${yLabel}</text>

    <!-- Point Indicator -->
    <circle cx="${paddingLeft + plotWidth / 2}" cy="${centerY}" r="9" fill="rgba(37, 99, 235, 0.2)" />
    <circle cx="${paddingLeft + plotWidth / 2}" cy="${centerY}" r="4.5" fill="#2563eb" stroke="#ffffff" stroke-width="2" />

    <!-- Date Label -->
    <text x="${paddingLeft + plotWidth / 2}" y="145" text-anchor="middle" fill="var(--text-secondary)" font-size="10" font-family="'Plus Jakarta Sans', sans-serif" font-weight="500">${formatDateShort(point.timestamp)}</text>
  `;

  return svg;
}

/**
 * Creates SVG for multiple history records with smooth line chart, area fill, and hover scrubbing.
 */
function createLineChartSvg(
  historyPoints,
  account,
  valuations,
  cpp,
  minPoints,
  maxPoints,
  timeMin,
  timeMax,
  displayMode = "pts",
) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 460 180");
  svg.setAttribute("class", "chart-svg");

  const paddingLeft = 52;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 26;
  const plotWidth = 460 - paddingLeft - paddingRight; // 388
  const plotHeight = 180 - paddingTop - paddingBottom; // 134

  // Y Scale
  const range = maxPoints - minPoints;
  const margin = range === 0 ? Math.max(minPoints * 0.1, 100) : Math.max(range * 0.15, 10);
  const yMin = Math.max(0, Math.floor(minPoints - margin));
  const yMax = Math.ceil(maxPoints + margin);

  // Time Scale
  const timeSpan = timeMax - timeMin || 1;

  // Compute point coordinates
  const coords = historyPoints.map((p) => {
    const x = paddingLeft + ((p.timestamp - timeMin) / timeSpan) * plotWidth;
    const y = paddingTop + plotHeight - ((p.points - yMin) / (yMax - yMin)) * plotHeight;
    return {
      x,
      y,
      points: p.points,
      timestamp: p.timestamp,
    };
  });

  // Smooth line path using cubic Bézier with horizontal tangents
  let lineD = "";
  if (coords.length === 2) {
    lineD = `M ${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)} L ${coords[1].x.toFixed(1)},${coords[1].y.toFixed(1)}`;
  } else {
    lineD = `M ${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const c1x = (p1.x + p2.x) / 2;
      const c1y = p1.y;
      const c2x = (p1.x + p2.x) / 2;
      const c2y = p2.y;
      lineD += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
  }

  // Area path
  const bottomY = paddingTop + plotHeight;
  const areaD = `${lineD} L ${coords[coords.length - 1].x.toFixed(1)},${bottomY} L ${coords[0].x.toFixed(1)},${bottomY} Z`;

  // Gridlines: 3 horizontal lines (0%, 50%, 100%)
  const gridSteps = [0, 0.5, 1];
  let gridLinesSvg = "";
  gridSteps.forEach((step) => {
    const val = yMin + (yMax - yMin) * step;
    const gy = paddingTop + plotHeight - ((val - yMin) / (yMax - yMin)) * plotHeight;
    const label = formatYAxisLabel(val, account, valuations, displayMode);
    gridLinesSvg += `
      <line x1="${paddingLeft}" y1="${gy.toFixed(1)}" x2="${paddingLeft + plotWidth}" y2="${gy.toFixed(1)}" stroke="var(--border-color)" stroke-dasharray="3,3" stroke-width="1" />
      <text x="${paddingLeft - 8}" y="${(gy + 3.5).toFixed(1)}" text-anchor="end" fill="var(--text-secondary)" font-size="10" font-family="'Plus Jakarta Sans', sans-serif" font-weight="500">${label}</text>
    `;
  });

  // Date labels on X axis
  const startStr = formatDateShort(timeMin);
  const endStr = formatDateShort(timeMax);
  let xLabelsSvg = `
    <text x="${paddingLeft}" y="${(bottomY + 18).toFixed(1)}" text-anchor="start" fill="var(--text-secondary)" font-size="10" font-family="'Plus Jakarta Sans', sans-serif" font-weight="500">${startStr}</text>
    <text x="${paddingLeft + plotWidth}" y="${(bottomY + 18).toFixed(1)}" text-anchor="end" fill="var(--text-secondary)" font-size="10" font-family="'Plus Jakarta Sans', sans-serif" font-weight="500">${endStr}</text>
  `;
  if (timeSpan > 86400000 * 3) {
    const midTime = timeMin + timeSpan / 2;
    const midStr = formatDateShort(midTime);
    xLabelsSvg += `
      <text x="${(paddingLeft + plotWidth / 2).toFixed(1)}" y="${(bottomY + 18).toFixed(1)}" text-anchor="middle" fill="var(--text-secondary)" font-size="10" font-family="'Plus Jakarta Sans', sans-serif" font-weight="500">${midStr}</text>
    `;
  }

  // Dots for data points (show if <= 30 points to keep clean)
  let dotsSvg = "";
  if (coords.length <= 30) {
    coords.forEach((c) => {
      dotsSvg += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3" fill="#ffffff" stroke="#2563eb" stroke-width="2" />`;
    });
  }

  svg.innerHTML = `
    <defs>
      <linearGradient id="balanceChartGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2563eb" stop-opacity="0.25" />
        <stop offset="80%" stop-color="#2563eb" stop-opacity="0.04" />
        <stop offset="100%" stop-color="#2563eb" stop-opacity="0.0" />
      </linearGradient>
    </defs>

    <!-- Grid lines & Y Labels -->
    ${gridLinesSvg}

    <!-- Area Fill -->
    <path d="${areaD}" fill="url(#balanceChartGradient)" />

    <!-- Line Stroke -->
    <path d="${lineD}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

    <!-- Data Circles -->
    ${dotsSvg}

    <!-- X Axis Labels -->
    ${xLabelsSvg}

    <!-- Interactive elements -->
    <line id="svg-crosshair" x1="0" y1="${paddingTop}" x2="0" y2="${bottomY}" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="3,3" opacity="0" pointer-events="none" />
    <circle id="svg-pulse-ring" cx="0" cy="0" r="9" fill="rgba(37, 99, 235, 0.2)" opacity="0" pointer-events="none" />
    <circle id="svg-active-dot" cx="0" cy="0" r="4.5" fill="#2563eb" stroke="#ffffff" stroke-width="2" opacity="0" pointer-events="none" />

    <!-- Mouse interaction capture layer -->
    <rect id="svg-interactive-overlay" x="${paddingLeft}" y="${paddingTop}" width="${plotWidth}" height="${plotHeight}" fill="transparent" style="cursor: crosshair;" />
  `;

  // Attach hover interaction listeners
  const overlay = svg.querySelector("#svg-interactive-overlay");
  const crosshair = svg.querySelector("#svg-crosshair");
  const pulseRing = svg.querySelector("#svg-pulse-ring");
  const activeDot = svg.querySelector("#svg-active-dot");

  const readoutWrap = document.getElementById("chart-hover-readout");
  const hoverDateEl = document.getElementById("hover-date");
  const hoverValueEl = document.getElementById("hover-value");
  const hoverChangeEl = document.getElementById("hover-change");

  if (overlay) {
    overlay.addEventListener("pointermove", (e) => {
      const svgRect = svg.getBoundingClientRect();
      const scaleX = 460 / (svgRect.width || 460);
      const mouseSvgX = (e.clientX - svgRect.left) * scaleX;

      // Find closest point by x coordinate
      let closestIdx = 0;
      let closestDist = Infinity;
      for (let i = 0; i < coords.length; i++) {
        const dist = Math.abs(coords[i].x - mouseSvgX);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      }

      const pt = coords[closestIdx];

      // Update crosshair & active dot
      crosshair.setAttribute("x1", pt.x.toFixed(1));
      crosshair.setAttribute("x2", pt.x.toFixed(1));
      crosshair.setAttribute("opacity", "0.8");

      pulseRing.setAttribute("cx", pt.x.toFixed(1));
      pulseRing.setAttribute("cy", pt.y.toFixed(1));
      pulseRing.setAttribute("opacity", "1");

      activeDot.setAttribute("cx", pt.x.toFixed(1));
      activeDot.setAttribute("cy", pt.y.toFixed(1));
      activeDot.setAttribute("opacity", "1");

      // Update hover readout
      if (readoutWrap && hoverDateEl && hoverValueEl && hoverChangeEl) {
        readoutWrap.classList.remove("hidden");
        hoverDateEl.textContent = formatDateTime(pt.timestamp);
        if (displayMode === "usd") {
          hoverValueEl.textContent = `$${formatChartCurrency(pt.points * (cpp / 100))}`;
        } else {
          hoverValueEl.textContent = `${formatChartNumber(pt.points)} pts`;
        }

        if (closestIdx > 0) {
          const delta = pt.points - coords[closestIdx - 1].points;
          if (delta > 0) {
            hoverChangeEl.textContent =
              displayMode === "usd"
                ? `+$${formatChartCurrency(delta * (cpp / 100))}`
                : `+${formatChartNumber(delta)}`;
            hoverChangeEl.className = "hover-change change-up";
          } else if (delta < 0) {
            hoverChangeEl.textContent =
              displayMode === "usd"
                ? `-$${formatChartCurrency(Math.abs(delta) * (cpp / 100))}`
                : `-${formatChartNumber(Math.abs(delta))}`;
            hoverChangeEl.className = "hover-change change-down";
          } else {
            hoverChangeEl.textContent = "0";
            hoverChangeEl.className = "hover-change";
          }
        } else {
          hoverChangeEl.textContent = "Start";
          hoverChangeEl.className = "hover-change";
        }
      }
    });

    overlay.addEventListener("pointerleave", () => {
      crosshair.setAttribute("opacity", "0");
      pulseRing.setAttribute("opacity", "0");
      activeDot.setAttribute("opacity", "0");
      if (readoutWrap) {
        readoutWrap.classList.add("hidden");
      }
    });
  }

  return svg;
}

// Export for Node.js / testing environments
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    resolveValuationCpp,
    formatChartNumber,
    formatChartCurrency,
    formatDateShort,
    formatDateTime,
    formatYAxisLabel,
    renderHistoryChart,
    createSinglePointSvg,
    createLineChartSvg,
  };
}
