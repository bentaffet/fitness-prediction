import mysql from "mysql2/promise";
import axios from "axios";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "POST only" });
    }

    const { user_name, max_runs = 5 } = req.body;
    if (!user_name) return res.status(400).json({ error: "Missing user_name" });

    // Connect to MySQL
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: process.env.MYSQL_PORT,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      ssl: { rejectUnauthorized: false },
    });

    // Get latest code for user
    const [rows] = await connection.execute(
      "SELECT code FROM strava_tokens WHERE user_name = ? ORDER BY created_at DESC LIMIT 1",
      [user_name]
    );
    await connection.end();

    if (!rows.length) {
      return res.status(404).json({ error: "No authorization code found for this user" });
    }

    const code = rows[0].code;

    // Exchange code for access token
    let access_token;
    try {
      const tokenRes = await axios.post("https://www.strava.com/oauth/token", null, {
        params: {
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
        },
      });
      access_token = tokenRes.data.access_token;
    } catch (err) {
      return res.status(500).json({ error: "Failed to exchange code for access token", details: err.message });
    }

    // Fetch last activities
    let activities;
    try {
      const activitiesRes = await axios.get("https://www.strava.com/api/v3/athlete/activities", {
        headers: { Authorization: `Bearer ${access_token}` },
        params: { per_page: max_runs },
      });
      activities = activitiesRes.data;
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch activities from Strava", details: err.message });
    }

    // Only return requested fields
    const filtered = activities.map(act => ({
      id: act.id,
      name: act.name,
      type: act.type.toLowerCase(),
      distance_m: act.distance,
      moving_time_s: act.moving_time,
      elapsed_time_s: act.elapsed_time,
      start_date: act.start_date,
      average_heartrate: act.average_heartrate || null,
      max_heartrate: act.max_heartrate || null,
    }));

    return res.status(200).json({ activities: filtered });
  } catch (err) {
    console.error("Unhandled error:", err);
    return res.status(500).json({ error: "Server error", details: err.message || String(err) });
  }
}
