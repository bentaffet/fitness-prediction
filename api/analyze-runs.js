// analyzeActivities.js
export function analyzeActivities(activities) {
  const runs = activities.filter(a => a.type === "Run");

  if (runs.length === 0) {
    return { message: "No runs found" };
  }

  let totalDistance = 0;
  let totalTime = 0;

  for (const run of runs) {
    totalDistance += run.distance;        // meters
    totalTime += run.moving_time;         // seconds
  }

  // Convert meters to miles
  const miles = totalDistance * 0.000621371;

  // Pace (min/mile)
  const avgPaceMin = (totalTime / 60) / miles;
  const paceMin = Math.floor(avgPaceMin);
  const paceSec = Math.round((avgPaceMin - paceMin) * 60);

  return {
    numRuns: runs.length,
    miles,
    totalSeconds: totalTime,
    pace: `${paceMin}:${paceSec.toString().padStart(2, "0")} /mi`
  };
}
