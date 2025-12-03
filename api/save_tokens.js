export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { code, user_name } = req.body;
  if (!code || !user_name) {
    return res.status(400).json({ error: "Missing code or user_name" });
  }

  const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
  const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;

  try {
    const response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: "authorization_code"
      })
    });

    const token_data = await response.json();

    if (!token_data.access_token) {
      return res.status(400).json({ error: "Bad Strava response", token_data });
    }

    // Instead of CSV, return the tokens (you choose where to store)
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      user_name,
      access_token: token_data.access_token,
      refresh_token: token_data.refresh_token,
      expires_at: token_data.expires_at
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
