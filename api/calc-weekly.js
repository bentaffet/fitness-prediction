export default async function handler(req, res) {
  try {
    // Expect POST with JSON body containing weekly summary
    const weeklyData = req.body;

    if (!weeklyData || !Array.isArray(weeklyData)) {
      return res.status(400).json({ error: "Invalid weekly summary data" });
    }

    // Map through weeklyData and add new computed column
    const result = weeklyData.map(week => ({
      ...week,
      time_double: week.time * 2
    }));

    res.status(200).json(result);

  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.toString() });
  }
}
