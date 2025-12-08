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

    // Connect to MySQL using environment variables
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: parseInt(process.env.MYSQL_PORT, 10),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      ssl: { rejectUnauthorized: true },
    });

    // Insert tokens using fixed username "test_user"
    const query = `
      INSERT INTO strava_tokens (athlete_id, access_token, refresh_token, expires_at)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        access_token = VALUES(access_token),
        refresh_token = VALUES(refresh_token),
        expires_at = VALUES(expires_at)
    `;

    await connection.execute(query, [
      "test_user",
      data.access_token,
      data.refresh_token,
      data.expires_at,
    ]);

    await connection.end();

    // Return Strava token JSON (same as original behavior)
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.toString() });
  }
}
