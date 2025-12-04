// /api/activities.js
import axios from "axios";

export default async function handler(req, res) {
  try {
    const { refresh_token } = req.query;
    if (!refresh_token) return res.status(400).json({ error: "Missing refresh_token" });

    // Get a new access token
    const refresh = await axios.post("https://www.strava.com/oauth/token", {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token
    });

    const access = refresh.data.access_token;

    // Fetch activities
    const acts = await axios.get(
      "https://www.strava.com/api/v3/athlete/activities?per_page=20",
      { headers: { Authorization: `Bearer ${access}` } }
    );

    return res.status(200).json(acts.data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
