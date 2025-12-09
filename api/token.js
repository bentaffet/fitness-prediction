export default async function handler(req, res) {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ error: "No code provided" });
    }

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

    const data = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return res.status(400).json({ error: "OAuth error", details: data });
    }

    // Keep these in variables (you can save them in MySQL later)
    const accessToken = data.access_token;
    const refreshToken = data.refresh_token;
    const expiresAt = data.expires_at;
    const expiresIn = data.expires_in;

    // Return ONLY the access token
    return res.status(200).json({ access_token: accessToken });

  } catch (err) {
    return res.status(500).json({ error: "Server error", details: err.toString() });
  }
}
