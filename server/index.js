/**
 * index.js
 * A zero-dependency local daemon server.
 * Listens on localhost:5586 and writes points history safely to local files.
 */

import http from "http";
import fs from "fs";
import path from "path";
import { styleText } from "node:util";
import { fileURLToPath } from "url";

// Recreate __dirname natively in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load shared constants synchronously from the shared folder
const sharedConfigPath = path.join(__dirname, "../shared/constants.json");
const sharedConstants = JSON.parse(fs.readFileSync(sharedConfigPath, "utf8"));

const PORT = sharedConstants.PORT || 5586;
const API_PATH = sharedConstants.API_PATH || "/api/report";
const CSV_FILE = path.join(__dirname, "../output/points_history.csv");
const JSON_FILE = path.join(__dirname, "../output/latest_points.json");

/**
 * Ensures data files are initialized correctly.
 */
function initializeFiles() {
  const outputDir = path.dirname(CSV_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(styleText("cyan", `Created output directory at: ${outputDir}`));
  }

  // Initialize CSV with headers if it doesn't exist
  if (!fs.existsSync(CSV_FILE)) {
    fs.writeFileSync(
      CSV_FILE,
      "Timestamp,Provider,AccountName,AccountID,ProgramName,Points\n",
      "utf8",
    );
    console.log(styleText("cyan", `Created new points history CSV at: ${CSV_FILE}`));
  }

  // Initialize JSON if it doesn't exist
  if (!fs.existsSync(JSON_FILE)) {
    fs.writeFileSync(JSON_FILE, JSON.stringify({}, null, 2), "utf8");
    console.log(styleText("cyan", `Created new latest points JSON at: ${JSON_FILE}`));
  }
}

/**
 * Adds a row to the local CSV points log.
 */
function appendToCSV(timestamp, provider, accountName, accountId, programName, points) {
  const row = `${timestamp},${provider},${accountName},${accountId},${programName},${points}\n`;
  fs.appendFileSync(CSV_FILE, row, "utf8");
}

/**
 * Updates the latest points JSON cache.
 */
function updateLatestJSON(timestamp, provider, accountName, accountId, programName, points) {
  let data = {};
  try {
    if (fs.existsSync(JSON_FILE)) {
      const content = fs.readFileSync(JSON_FILE, "utf8");
      data = JSON.parse(content);
    }
  } catch (err) {
    console.error(
      styleText("red", `Error reading JSON cache, resetting file. Error: ${err.message}`),
    );
  }

  // Keyed by Provider + Account Name + Account ID to support multiple accounts and loyalty programs
  const key = `${provider}_${accountName}_${accountId}`;
  data[key] = {
    provider,
    accountName,
    accountId,
    programName,
    points: parseInt(points, 10),
    timestamp,
  };

  fs.writeFileSync(JSON_FILE, JSON.stringify(data, null, 2), "utf8");
}

// Start building HTTP Server
const server = http.createServer((req, res) => {
  // Set CORS headers for Extension safety
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle CORS preflight options request
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Route: POST [API_PATH]
  if (req.url === API_PATH && req.method === "POST") {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        const { provider, accountName, accountId, programName, points, timestamp } = payload;
        const resolvedAccountId = accountId || accountName;

        if (!provider || !accountName || !programName || points === undefined || !timestamp) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error:
                "Invalid payload schema. Require provider, accountName, points, and timestamp.",
            }),
          );
          return;
        }

        console.log(
          "\n" + styleText(["green", "bold"], "➔ Received points update from Extension:"),
        );
        console.log(`  Provider: ${styleText("yellow", provider)}`);
        console.log(`  Account:  ${styleText("yellow", accountName)} (${resolvedAccountId})`);
        console.log(`  Program:  ${styleText("yellow", programName)}`);
        console.log(`  Points:   ${styleText("yellow", points.toLocaleString())}`);
        console.log(`  At:       ${styleText("yellow", new Date(timestamp).toLocaleTimeString())}`);

        // Write to local files
        appendToCSV(timestamp, provider, accountName, resolvedAccountId, programName, points);
        updateLatestJSON(timestamp, provider, accountName, resolvedAccountId, programName, points);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error(styleText("red", `Failed to process payload: ${err.message}`));
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to parse or write update payload." }));
      }
    });
  } else {
    // 404 Route
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Endpoint not found." }));
  }
});

// Initialize files and boot the server
initializeFiles();
server.listen(PORT, "127.0.0.1", () => {
  const border = "====================================================";
  console.log("\n" + styleText(["green", "bold"], border));
  console.log(styleText(["green", "bold"], "🔒 Points Tracker Daemon successfully started!"));
  console.log(`📍 Listening on: ${styleText(["yellow", "underline"], `http://127.0.0.1:${PORT}`)}`);
  console.log(styleText(["green", "bold"], border) + "\n");
});
