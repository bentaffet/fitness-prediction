import mysql from "mysql2/promise";
import fetch from "node-fetch";

export default async function handler(req, res) {
  const { code, username = "test_user" } = req.query;

  if (!code && !username) {
    return res.status(400).json({ error: "No code or username provided" });
  }

  // MySQL connection helper
  async function getConnection() {
    return mysql.createConnection({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: parseInt(process.env.MYSQL_PORT),
      ssl: { rejectUnauthorized: true },
    });
  }

  try {
    const conn = await getConnection();

    // 1️⃣ Check if user already has tokens in DB
    let [rows] = await conn.execute(
      `SELECT * FROM strava_tokens WHERE athlete_id = ?`,
      [username]
    );

    let access_token, refresh_token, expires_at, athlete_id, athlete_info;

    // 2️⃣ If code is provided, exchange it for new tokens
    if (code) {
      const tokenResponse = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          code: code,
          grant_type: "authorization_code"
        })
      });

      const tokenData = await tokenResponse.json();

      if (!tokenData.access_token) {
        await conn.end();
        return res.status(400).json({ error: "Failed to get access token", details: tokenData });
      }

      ({ access_token, refresh_token, expires_at, athlete: athlete_info } = tokenData);
      athlete_id = athlete_info.id.toString();

      // Insert or update DB
      await conn.execute(
        `INSERT INTO strava_tokens (athlete_id, access_token, refresh_token, expires_at)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           access_token = VALUES(access_token),
           refresh_token = VALUES(refresh_token),
           expires_at = VALUES(expires_at)`,
        [athlete_id, access_token, refresh_token, expires_at.toString()]
      );

    } else if (rows.length > 0) {
      // 3️⃣ Load tokens from DB if no code is provided
      ({ access_token, refresh_token, expires_at } = rows[0]);
      athlete_id = rows[0].athlete_id;
      athlete_info = { id: athlete_id };
    } else {
      await conn.end();
      return res.status(400).json({ error: `No tokens found for '${username}' and no code provided` });
    }

    // 4️⃣ Refresh token if expired
    const now = Math.floor(Date.now() / 1000);
    if (expires_at <= now) {
      const refreshResponse = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token
        })
      });
      const refreshed = await refreshResponse.json();
      access_token = refreshed.access_token;
      refresh_token = refreshed.refresh_token;
      expires_at = refreshed.expires_at;
      athlete_info = refreshed.athlete || athlete_info;

      // Update DB
      await conn.execute(
        `UPDATE strava_tokens SET access_token = ?, refresh_token = ?, expires_at = ? WHERE athlete_id = ?`,
        [access_token, refresh_token, expires_at.toString(), athlete_id]
      );
    }

    await conn.end();

    // 5️⃣ Return validated tokens
    res.status(200).json({
      message: `Tokens ready for ${username}`,
      athlete: athlete_info,
      access_token,
      refresh_token,
      expires_at
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error", details: err.toString() });
  }
}
