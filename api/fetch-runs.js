import mysql from "mysql2/promise";
import axios from "axios";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "POST only" });
    }

    const { user_name, max_runs } = req.body;
    if (!user_name) {
      return res.status(400).json({ error: "Missing user_name" });
    }

    const limit = max_runs || 5;

    // 1️⃣ Connect to MySQL
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: process.env.MYSQL_PORT,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      ssl: { rejectUnauthorized: false },
    });

    // 2️⃣ Fetch Strava tokens for this user
    const [rows] = await connection.execute(
      "SELECT access_token FROM strava_tokens WHERE user_name = ? ORDER BY id DESC LIMIT 1",
      [user_name]
    );
    await connection.end();

    if (!rows.length) {
      return res.status(404).json({ error: "No tokens found for user" });
    }

    const access_token = rows[0].access_token;

    // 3️⃣ Fetch activities from Strava
    const stravaRes = await axios.get(
      `https://www.strava.com/api/v3/athlete/activities?per_page=${limit}`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    // 4️⃣ Map only the fields we want
    const activities = stravaRes.data.map(act => ({
      id: act.id,
      name: act.name,
      type: act.type.toLowerCase(),
      distance_m: act.distance,
      moving_time_s: act.moving_time,
      elapsed_time_s: act.elapsed_time,
      start_date: act.start_date,
      average_heartrate: act.hasOwnProperty("average_heartrate") ? act.average_heartrate : null,
      max_heartrate: act.hasOwnProperty("max_heartrate") ? act.max_heartrate : null,
    }));

    return res.status(200).json({ activities });

  } catch (err) {
    console.error("Error in fetch-runs:", err);
    return res.status(500).json({ error: "Server error", details: err.message || String(err) });
  }
}
