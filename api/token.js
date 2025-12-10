import mysql from "mysql2/promise";

export default async function handler(req, res) {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ error: "No code provided" });
    }

    // --- Exchange code for Strava tokens ---
    const tokenResponse = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      }),
    });

    const data = await tokenResponse.json();
    console.log("Strava token response:", data);

    // ---- Create athlete_id = firstname.lastname ----
    const firstname = data?.athlete?.firstname || "";
    const lastname = data?.athlete?.lastname || "";

    const athleteId = `${firstname}.${lastname}`
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ""); // remove spaces

    if (!firstname || !lastname) {
      console.warn("⚠️ Missing firstname/lastname in Strava response.");
    }

    const accessToken = data?.access_token;
    const refreshToken = data?.refresh_token;
    const expiresAt = data?.expires_at?.toString();

    if (!accessToken || !refreshToken || !expiresAt) {
      return res.status(400).json({
        error: "Missing required fields from Strava token response",
      });
    }

    // --- Connect to Aiven MySQL ---
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: process.env.MYSQL_PORT,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      ssl: { rejectUnauthorized: false },
    });

    // --- UPSERT into strava_tokens ---
    const query = `
      INSERT INTO strava_tokens (athlete_id, access_token, refresh_token, expires_at)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        access_token = VALUES(access_token),
        refresh_token = VALUES(refresh_token),
        expires_at = VALUES(expires_at)
    `;

    await connection.execute(query, [
      athleteId,
      accessToken,
      refreshToken,
      expiresAt,
    ]);

    console.log(`Stored tokens for athlete: ${athleteId}`);

    res.status(200).json(data);
  } catch (err) {
    console.error("Strava OAuth error:", err);
    res.status(500).json({ error: "Server error", details: err.toString() });
  }
}
