import mysql from "mysql2/promise";

export default async function handler(req, res) {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ error: "No code provided" });
    }

    // Fetch Strava token (exactly like your original script)
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

    // Return the token JSON immediately (preserves I/O)
    res.status(200).json(data);

    // Insert tokens into MySQL asynchronously (won’t block response)
    (async () => {
      try {
        const connection = await mysql.createConnection({
          host: process.env.MYSQL_HOST,
          port: parseInt(process.env.MYSQL_PORT, 10),
          user: process.env.MYSQL_USER,
          password: process.env.MYSQL_PASSWORD,
          database: process.env.MYSQL_DATABASE,
          ssl: { rejectUnauthorized: true },
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
          data.expires_at,
        ]);

        await connection.end();
      } catch (dbErr) {
        console.error("Failed to insert Strava tokens into MySQL:", dbErr);
      }
    })();

  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.toString() });
  }
}
