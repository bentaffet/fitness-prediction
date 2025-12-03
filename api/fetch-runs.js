import mysql from "mysql2/promise";
import axios from "axios";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET only" });
  }

  const { user, limit = 10 } = req.query;
  if (!user) return res.status(400).json({ error: "Missing user parameter" });

  try {
    // Connect to MySQL
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: process.env.MYSQL_PORT,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      ssl: { rejectUnauthorized: false },
    });

    // Get access token for this user
    const [rows] = await connection.execute(
      "SELECT access_token FROM strava_tokens WHERE user_name = ? ORDER BY id DESC LIMIT 1",
      [user]
    );

    await connection.end();

    if (!rows.length) return res.status(404).json({ error: "User not found" });

    const accessToken = rows[0].access_token;

    // Call Strava API to get recent activities
    const stravaRes = await axios.get(
      `https://www.strava.com/api/v3/athlete/activities?per_page=${limit}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    // Filter for runs only (optional)
    const runs = stravaRes.data
      .filter(act => act.type.toLowerCase() === "run")
      .map(act => ({
        id: act.id,
        name: act.name,
        distance_m: act.distance,
        moving_time_s: act.moving_time,
        elapsed_time_s: act.elapsed_time,
        start_date: act.start_date,
        average_heartrate: act.average_heartrate,
        max_heartrate: act.max_heartrate,
      }));

    return res.status(200).json({ username: user, count: runs.length, runs });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
