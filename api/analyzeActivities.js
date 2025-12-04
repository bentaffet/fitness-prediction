export function analyzeActivities(activities) {
  const totalRuns = activities.length;
  const totalDistance = activities.reduce((sum, a) => sum + (a.distance || 0), 0);
  const avgDistance = totalDistance / totalRuns || 0;

  return {
    totalRuns,
    totalDistanceMeters: totalDistance,
    avgDistanceMeters: avgDistance.toFixed(2),
    runs: activities.map((a, i) => ({
      name: `Run ${i+1}`,
      distanceMeters: a.distance,
      movingTime: a.moving_time,
      startDate: a.start_date
    }))
  };
}
