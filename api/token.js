import mysql from "mysql2/promise";

export default async function handler(req, res) {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ error: "No code provided" });
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code: code,
        grant_type: "authorization_code",
      }),
    });

    const data = await tokenResponse.json();

    if (!data.access_token || !data.athlete) {
      return res.status(400).json({ error: "Invalid token response", details: data });
    }

    // Connect to MySQL
    const connection = await mysql.createConnection({
      host: "userdata-userdata.b.aivencloud.com",
      port: 17176,
      user: "avnadmin",
      password: "AVNS_Xew9uCMjTJl4eS80bmC",
      database: "defaultdb",
      ssl: { rejectUnauthorized: true },
    });

    // Insert tokens into database
    const query = `
      INSERT INTO strava_tokens (athlete_id, access_token, refresh_token, expires_at)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        access_token = VALUES(access_token),
        refresh_token = VALUES(refresh_token),
        expires_at = VALUES(expires_at)
    `;

    await connection.execute(query, [
      data.athlete.id,
      data.access_token,
      data.refresh_token,
      data.expires_at,
    ]);

    await connection.end();

    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.toString() });
  }
}
