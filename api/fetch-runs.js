export default async function handler(req, res) {
  const { access_token } = req.query;

  if (!access_token) {
    return res.status(400).json({ error: "Missing access token" });
  }

  try {
    let page = 1;
    const perPage = 100; // max allowed
    let allActivities = [];

    while (allActivities.length < 1500) {
      const r = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?access_token=${access_token}&page=${page}&per_page=${perPage}`
      );
      const batch = await r.json();

      if (!Array.isArray(batch) || batch.length === 0) break;

      allActivities = allActivities.concat(batch);
      page += 1;
    }

    // Filter only runs + required fields
    const runs = allActivities
      .filter(act => act.type === "Run")
      .map(act => ({
        distance_m: act.distance,
        moving_time_s: act.moving_time,
        start_date: act.start_date,
        average_heartrate: act.hasOwnProperty("average_heartrate")
          ? act.average_heartrate
          : null
      }));

    res.status(200).json({ count: runs.length, runs });

  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.toString() });
  }
}
