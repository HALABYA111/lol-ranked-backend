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

/* ===============================
   HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.json({ status: "Backend running" });
});

/* ===============================
   ACCOUNTS API
================================ */

// GET all accounts
app.get("/accounts", async (req, res) => {
  const { data, error } = await supabase
    .from("accounts")
    .select("*");

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  res.json({ success: true, data });
});

// ADD account
app.post("/accounts", async (req, res) => {
  try {
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

    const { data, error } = await supabase
      .from("accounts")
      .insert([
        {
          player,
          riotid: riotId,
          server,
          peakrank: peakRank,
          peakdivision: peakDivision,
          peaklp: peakLP
        }
      ])
      .select();

    if (error) {
      console.error("SUPABASE INSERT ERROR:", error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.status(500).json({ success: false, error: "Server crashed" });
  }
});

/* ===============================
   DELETE ROUTES (🔥 FIX)
================================ */

// DELETE single account by ID
app.delete("/accounts/:id", async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from("accounts")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("SUPABASE DELETE ERROR:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }

  res.sendStatus(204);
});

// DELETE all accounts for a player
app.delete("/accounts/player/:player", async (req, res) => {
  const { player } = req.params;

  const { error } = await supabase
    .from("accounts")
    .delete()
    .eq("player", player);

  if (error) {
    console.error("SUPABASE DELETE PLAYER ERROR:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }

  res.sendStatus(204);
});

/* ===============================
   RIOT API CONFIG
================================ */
const RIOT_API_KEY = process.env.RIOT_API_KEY;
const REGION = "europe";

/* ===============================
   RANK ENDPOINT
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

    const accountRes = await axios.get(
      `https://${REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
      { headers: { "X-Riot-Token": RIOT_API_KEY } }
    );

    const puuid = accountRes.data.puuid;

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
    console.error("RIOT API ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch rank" });
  }
});

/* ===============================
   START SERVER (RAILWAY SAFE)
================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
