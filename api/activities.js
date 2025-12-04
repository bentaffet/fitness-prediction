// /api/activities.js
import axios from "axios";

export default async function handler(req, res) {
  try {
    const { refresh_token } = req.query;
    if (!refresh_token) return res.status(400).json({ error: "Missing refresh_token" });

    // Refresh the access token
    const refresh = await axios.post("https://www.strava.com/oauth/token", {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token
    });

    const access = refresh.data.access_token;

    // Fetch activities
    const actsRes = await axios.get(
      "https://www.strava.com/api/v3/athlete/activities?per_page=30",
      { headers: { Authorization: `Bearer ${access}` } }
    );

    const activities = actsRes.data;

    // Compute total distance
    let total_distance = 0;
    for (const act of activities) {
      if (act.type === "Run") {
        total_distance += act.distance; // meters
      }
    }

    return res.status(200).json({
      total_distance,  // meters
      activities       // raw array
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
