import mysql from "mysql2/promise";

export default async function handler(req, res) {
  const { code, username = "test_user" } = req.query;

  if (!code) {
    return res.status(400).json({ error: "No code provided" });
  }

  try {
    // 1. Exchange code for access & refresh tokens
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
      return res.status(400).json({ error: "Failed to get access token", details: tokenData });
    }

    const { access_token, refresh_token, expires_at, athlete } = tokenData;

    // 2. Connect to MySQL
    const conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: parseInt(process.env.MYSQL_PORT),
      ssl: { rejectUnauthorized: true },
    });

    // 3. Insert or update the tokens for this athlete
    // We'll use athlete.id as the unique identifier
    await conn.execute(
      `INSERT INTO strava_tokens (athlete_id, access_token, refresh_token, expires_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         access_token = VALUES(access_token),
         refresh_token = VALUES(refresh_token),
         expires_at = VALUES(expires_at)`,
      [athlete.id, access_token, refresh_token, expires_at.toString()]
    );

    await conn.end();

    res.status(200).json({
      message: `Tokens stored for ${username}`,
      athlete: { id: athlete.id, firstname: athlete.firstname, lastname: athlete.lastname },
      access_token,
      refresh_token,
      expires_at
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error", details: err.toString() });
  }
}
