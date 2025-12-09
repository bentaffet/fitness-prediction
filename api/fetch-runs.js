import mysql from "mysql2/promise";

export default async function handler(req, res) {
  console.log("🚀 /api/exchange-token HIT");

  try {
    const { code } = req.query;
    console.log("Incoming code:", code);

    if (!code) {
      console.error("❌ No code provided");
      return res.status(400).json({ error: "No code provided" });
    }

    // ------------------------------------------
    // 1. Request Strava tokens
    // ------------------------------------------
    console.log("🔁 Requesting tokens from Strava...");

    const tokenResponse = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code"
      })
    });

    console.log("Strava response status:", tokenResponse.status);

    const data = await tokenResponse.json();
    console.log("Strava response body:", JSON.stringify(data, null, 2));

    if (!tokenResponse.ok) {
      console.error("❌ OAuth exchange failed:", data);
      return res.status(400).json({ error: "OAuth error", details: data });
    }

    const accessToken = data.access_token;
    const refreshToken = data.refresh_token;
    const expiresAt = data.expires_at;
    const athleteId = "test_user";

    console.log("Tokens received:");
    console.log("  access_token:  ", accessToken?.slice(0, 6) + "...");
    console.log("  refresh_token: ", refreshToken?.slice(0, 6) + "...");
    console.log("  expires_at:    ", expiresAt);

    // ------------------------------------------
    // 2. Connect to MySQL
    // ------------------------------------------
    console.log("🛢 Connecting to MySQL with env vars:");
    console.log({
      MYSQL_HOST: process.env.MYSQL_HOST,
      MYSQL_PORT: process.env.MYSQL_PORT,
      MYSQL_USER: process.env.MYSQL_USER,
      MYSQL_DATABASE: process.env.MYSQL_DATABASE,
      MYSQL_SSL: process.env.MYSQL_SSL
    });

    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      ssl: process.env.MYSQL_SSL === "true" ? { rejectUnauthorized: true } : false
    });

    console.log("✅ MySQL connected");

    // ------------------------------------------
    // 3. Insert/update token row
    // ------------------------------------------
    console.log("📝 Inserting/updating token row...");

    const sql = `
      INSERT INTO strava_tokens (athlete_id, access_token, refresh_token, expires_at)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        access_token = VALUES(access_token),
        refresh_token = VALUES(refresh_token),
        expires_at = VALUES(expires_at);
    `;

    const params = [athleteId, accessToken, refreshToken, expiresAt];

    console.log("SQL Params:", { athleteId, expiresAt });

    const [result] = await connection.execute(sql, params);
    console.log("MySQL result:", result);

    await connection.end();
    console.log("🔌 MySQL connection closed");

    // ------------------------------------------
    // 4. Return access token
    // ------------------------------------------
    console.log("✅ Returning access token to client");
    return res.status(200).json({ access_token: accessToken });

  } catch (err) {
    console.error("💥 SERVER ERROR:", err);
    return res.status(500).json({
      error: "Server error",
      details: err.toString()
    });
  }
}
