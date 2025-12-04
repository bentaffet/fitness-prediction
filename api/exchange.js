// api/exchange.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: "Missing code" });
  }

  const client_id = "185647";  // your Strava client ID
  const client_secret = process.env.STRAVA_CLIENT_SECRET; // store secret in environment
  const tokenUrl = "https://www.strava.com/oauth/token";

  try {
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id,
        client_secret,
        code,
        grant_type: "authorization_code"
      })
    });

    const tokenData = await tokenRes.json();
    if (tokenData.errors) {
      return res.status(400).json({ error: "Invalid code", details: tokenData.errors });
    }

    // Return refresh token to frontend
    return res.status(200).json({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_at
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}
