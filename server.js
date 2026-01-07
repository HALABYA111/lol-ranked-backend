const Database = require("better-sqlite3");

// Create / open database file
const db = new Database("database.db");

// Create table if it does not exist
db.prepare(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player TEXT,
    riotId TEXT,
    server TEXT,
    peakRank TEXT,
    peakDivision TEXT,
    peakLP INTEGER
  )
`).run();

require("dotenv").config();

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

/* ===============================
   MIDDLEWARE (IMPORTANT ORDER)
================================ */

app.use(cors());
app.use(express.json());

/* ===============================
   DATABASE API
================================ */

// GET all accounts
app.get("/accounts", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM accounts").all();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ADD new account
app.post("/accounts", (req, res) => {
  const {
    player,
    riotId,
    server,
    peakRank,
    peakDivision,
    peakLP
  } = req.body;

  if (!player || !riotId || !server) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields"
    });
  }

  try {
    db.prepare(`
      INSERT INTO accounts
      (player, riotId, server, peakRank, peakDivision, peakLP)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      player,
      riotId,
      server,
      peakRank,
      peakDivision,
      peakLP
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===============================
   RIOT API CONFIG
================================ */

const RIOT_API_KEY = process.env.RIOT_API_KEY;
console.log("API KEY LOADED:", RIOT_API_KEY ? "YES" : "NO");

const REGION = "europe";

/* ===============================
   HEALTH CHECK
================================ */

app.get("/", (req, res) => {
  res.json({ status: "Backend running" });
});

/* ===============================
   TEST: Riot ID → PUUID
================================ */

app.get("/test-account", async (req, res) => {
  try {
    const riotId = "HALABYA111#111";
    const [name, tag] = riotId.split("#");

    const response = await axios.get(
      `https://${REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
      { headers: { "X-Riot-Token": RIOT_API_KEY } }
    );

    res.json({ success: true, data: response.data });
  } catch (err) {
    res.status(500).json({
      step: "ACCOUNT",
      status: err.response?.status,
      data: err.response?.data
    });
  }
});

/* ===============================
   FINAL RANK ENDPOINT
================================ */

app.get("/rank", async (req, res) => {
  try {
    const { riotId, server } = req.query;

    if (!riotId || !server) {
      return res.status(400).json({ error: "Missing riotId or server" });
    }

    const platform =
      server === "euw" ? "euw1" :
      server === "eune" ? "eun1" :
      null;

    if (!platform) {
      return res.status(400).json({ error: "Invalid server" });
    }

    // 1️⃣ Riot ID → PUUID
    const [rawName, rawTag] = riotId.split("#");

    const accountRes = await axios.get(
      `https://${REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(rawName)}/${encodeURIComponent(rawTag)}`,
      { headers: { "X-Riot-Token": RIOT_API_KEY } }
    );

    const puuid = accountRes.data.puuid;

    // 2️⃣ Ranked data by PUUID
    const rankedRes = await axios.get(
      `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`,
      { headers: { "X-Riot-Token": RIOT_API_KEY } }
    );

    const soloQ = rankedRes.data.find(
      q => q.queueType === "RANKED_SOLO_5x5"
    );

    if (!soloQ) {
      return res.json({ ranked: false });
    }

    res.json({
      ranked: true,
      tier: soloQ.tier,
      rank: soloQ.rank,
      lp: soloQ.leaguePoints
    });

  } catch (err) {
    console.error("===== RIOT API ERROR =====");
    console.error("Status:", err.response?.status);
    console.error("Data:", err.response?.data);
    console.error("==========================");

    res.status(500).json({
      error: "Failed to fetch rank",
      status: err.response?.status,
      data: err.response?.data
    });
  }
});

/* ===============================
   START SERVER
================================ */

const PORT = 3000;
app.listen(PORT, () =>
  console.log(`Backend running on http://localhost:${PORT}`)
);
