import mysql from "mysql2/promise";
import axios from "axios";

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;

// Utility: fetch tokens for a user from MySQL
async function getTokens(username) {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: { rejectUnauthorized: false }
  });

  const [rows] = await conn.execute(
    "SELECT * FROM strava_tokens WHERE user_name = ? ORDER BY created_at DESC LIMIT 1",
    [username]
  );

  await conn.end();

  if (!rows.length) throw new Error(`No tokens found for ${username}`);
  return rows[0];
}

// Utility: refresh access token if expired
async function refreshToken(refresh_token) {
  const url = "https://www.strava.com/oauth/token";
  const resp = await axios.post(url, null, {
    params: {
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token
    }
  });

  return resp.data; // contains access_token, refresh_token, expires_at
}

// Utility: fetch last X runs from Strava
async function fetchLastRuns(access_token, maxRuns = 10) {
  const runs = [];
  let page = 1;
  const perPage = 50;

  while (runs.length < maxRuns) {
    const resp = await axios.get("https://www.strava.com/api/v3/athlete/activities", {
      headers: { Authorization: `Bearer ${access_token}` },
      params: { per_page: perPage, page }
    });

    if (!resp.data.length) break;

    // Filter for runs only, distance > 3200m (~2 miles)
    const filtered = resp.data.filter(
      act => act.type.toLowerCase() === "run" && act.distance >= 3200
    );

    runs.push(...filtered);
    if (resp.data.length < perPage) break;
    page += 1;
  }

  return runs.slice(0, maxRuns);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const username = req.query.user;
  if (!username) return res.status(400).json({ error: "Missing user parameter" });

  try {
    // 1️⃣ Get tokens from DB
    let tokenRow = await getTokens(username);
    let { access_token, refresh_token, expires_at } = tokenRow;

    // 2️⃣ Refresh if expired
    if (expires_at < Math.floor(Date.now() / 1000)) {
      console.log("Refreshing token for", username);
      const newTokens = await refreshToken(refresh_token);

      access_token = newTokens.access_token;
      refresh_token = newTokens.refresh_token;
      expires_at = newTokens.expires_at;

      // Save new tokens in DB
      const conn = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        port: process.env.MYSQL_PORT,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        ssl: { rejectUnauthorized: false }
      });

      await conn.execute(
        `INSERT INTO strava_tokens (user_name, access_token, refresh_token, expires_at)
         VALUES (?, ?, ?, ?)`,
        [username, access_token, refresh_token, expires_at]
      );

      await conn.end();
    }

    // 3️⃣ Fetch runs
    const runs = await fetchLastRuns(access_token, 10); // fetch last 10 runs

    return res.status(200).json({ username, count: runs.length, runs });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
