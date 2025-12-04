import fetch from "node-fetch";

export default async function handler(req, res) {
  const { refresh_token } = req.query;
  if (!refresh_token) return res.status(400).json({ error: "Missing refresh_token" });

  const client_id = "185647";
  const client_secret = process.env.STRAVA_CLIENT_SECRET;
  const tokenUrl = "https://www.strava.com/oauth/token";

  try {
    // Refresh access token
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id,
        client_secret,
        grant_type: "refresh_token",
        refresh_token
      })
    });
    const tokenData = await tokenRes.json();
    if (tokenData.errors) return res.status(400).json({ error: tokenData.errors });

    const access_token = tokenData.access_token;

    // Fetch last 50 activities
    const activitiesRes = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=50", {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const activities = await activitiesRes.json();

    const total_distance = activities.reduce((sum, a) => sum + (a.distance || 0), 0);

    return res.status(200).json({ activities, total_distance });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}
