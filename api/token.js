import mysql from "mysql2/promise";

export default async function handler(req, res) {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ error: "No code provided" });
    }

    // 1️⃣ Exchange code for Strava tokens
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

    // 2️⃣ Ensure token fields exist
    if (!data.access_token || !data.refresh_token || !data.expires_at) {
      return res.status(400).json({ error: "Invalid token response", details: data });
    }

    // 3️⃣ Insert or update tokens in MySQL
    try {
      const connection = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        port: parseInt(process.env.MYSQL_PORT, 10),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        ssl: { rejectUnauthorized: true }, // works with Aiven
      });

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
        data.expires_at.toString(), // store as string
      ]);

      await connection.end();
    } catch (dbErr) {
      console.error("DB insert/update failed:", dbErr);
      // Do not block the response — token validation still works
    }

    // 4️⃣ Return Strava token JSON (same as original script)
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.toString() });
  }
}
