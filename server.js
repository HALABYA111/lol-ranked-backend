require("dotenv").config();

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const { createClient } = require("@supabase/supabase-js");

const app = express();

/* ===============================
   MIDDLEWARE
================================ */
app.use(cors());
app.use(express.json());

/* ===============================
   SUPABASE
================================ */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("SUPABASE URL LOADED:", SUPABASE_URL ? "YES" : "NO");

/* ===============================
   RIOT CONFIG
================================ */
const RIOT_API_KEY = process.env.RIOT_API_KEY;
console.log("RIOT API KEY LOADED:", RIOT_API_KEY ? "YES" : "NO");

const REGION = "europe";

/* ===============================
   HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.json({ status: "Backend running" });
});

/* ===============================
   ACCOUNTS API (SUPABASE)
================================ */

// GET all accounts
app.get("/accounts", async (req, res) => {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  res.json({ success: true, data });
});

// ADD new account
app.post("/accounts", async (req, res) => {
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

  const { error } = await supabase.from("accounts").insert([
    {
      player,
      riotId,
      server,
      peakRank,
      peakDivision,
      peakLP
    }
  ]);

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  res.json({ success: true });
});

/* ===============================
   RANK ENDPOINT (RIOT API)
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

    const [name, tag] = riotId.split("#");

    // Riot ID → PUUID
    const accountRes = await axios.get(
      `https://${REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
      { headers: { "X-Riot-Token": RIOT_API_KEY } }
    );

    const puuid = accountRes.data.puuid;

    // Ranked data
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
    res.status(500).json({
      error: "Failed to fetch rank",
      status: err.response?.status,
      data: err.response?.data
    });
  }
});

/* ===============================
   START SERVER (IMPORTANT)
================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
