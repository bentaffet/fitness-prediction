import mysql from "mysql2/promise";
import axios from "axios";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "POST only" });
    }

    const { user_name, max_runs } = req.body;

    // 1️⃣ Connect to MySQL
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: process.env.MYSQL_PORT,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      ssl: { rejectUnauthorized: false },
    });

    let usernameToUse = user_name;

    // If no username provided, get the latest from DB
    if (!usernameToUse) {
      const [rowsUser] = await connection.execute(
        "SELECT user_name FROM strava_tokens ORDER BY id DESC LIMIT 1"
      );
      if (!rowsUser.length) {
        await connection.end();
        return res.status(404).json({ error: "No user found in database" });
      }
      usernameToUse = rowsUser[0].user_name;
    }

    // 2️⃣ Fetch the latest Strava code for this user
    const [rows] = await connection.execute(
      "SELECT code FROM strava_tokens WHERE user_name = ? ORDER BY id DESC LIMIT 1",
      [usernameToUse]
    );
    await connection.end();

    if (!rows.length) {
      return res.status(404).json({ error: "No Strava code found for user" });
    }

    const code = rows[0].code;
    const limit = max_runs || 5;

    // 3️⃣ Exchange code for access token
    const tokenRes = await axios.post(
      "https://www.strava.com/oauth/token",
      null,
      {
        params: {
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
        },
      }
    );

    const access_token = tokenRes.data.access_token;

    // 4️⃣ Fetch activities from Strava
    const stravaRes = await axios.get(
      `https://www.strava.com/api/v3/athlete/activities?per_page=${limit}`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    // 5️⃣ Map only the fields we want
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

    // 6️⃣ Compute total moving time for runs
    const total_moving_time_s = activities
      .filter(act => act.type === "run")
      .reduce((sum, act) => sum + (act.moving_time_s || 0), 0);

    return res.status(200).json({
      user_name: usernameToUse,
      total_moving_time_s,
      activities
    });

  } catch (err) {
    console.error("Error in fetch-runs:", err.response?.data || err.message || err);
    return res.status(500).json({
      error: "Server error",
      details: err.response?.data || err.message || String(err),
    });
  }
}
