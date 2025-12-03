export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "POST only" });
    }

    const { activities } = req.body;
    if (!activities || !activities.length) {
      return res.status(400).json({ error: "No activities provided" });
    }

    // --- Filter only runs ---
    const runs = activities.filter(a => a.type === "run");

    // --- Compute derived metrics ---
    const average_pace = runs.map(r => r.moving_time_s / r.distance_m); // sec/m
    const average_hr = runs.map(r => r.average_heartrate || 0);
    const total_distance_miles = runs.map(r => r.distance_m * 0.000621371);

    const mean = arr => arr.reduce((a,b)=>a+b,0)/arr.length;
    const std = arr => Math.sqrt(arr.reduce((sum,x)=>sum+(x-mean(arr))**2,0)/arr.length);

    const z_pace = average_pace.map(x => (x - mean(average_pace))/std(average_pace));
    const z_hr = average_hr.map(x => (x - mean(average_hr))/std(average_hr));
    const z_TMM = total_distance_miles.map(x => (x - mean(total_distance_miles))/std(total_distance_miles));

    const S_FF = z_pace.map((z,i) => -(z + z_hr[i])/2);
    const trainingload = z_TMM.map((z,i) => z * (1 - S_FF[i]));
    const N = runs.length;

    // --- Grid search for best decay parameters ---
    const fitlist = [0.70,0.71,0.72,0.73,0.74,0.75,0.76,0.77,0.78,0.79,0.80];
    const fatlist = [0.30,0.31,0.32,0.33,0.34,0.35,0.36,0.37,0.38,0.39,0.40];

    let best_R2 = -Infinity;
    let best_fit = null;
    let best_fat = null;

    // Approx R² regression (simplified)
    const regressionR2 = (y, X1, X2) => {
      const y_mean = mean(y);
      const ss_tot = y.reduce((sum, yi) => sum + (yi - y_mean)**2,0);
      const y_pred = X1.map((x,i) => X1[i]*0.5 + X2[i]*0.5); // approximate
      const ss_res = y.reduce((sum, yi,i) => sum + (yi - y_pred[i])**2,0);
      return 1 - ss_res/ss_tot;
    };

    for (const df of fitlist) {
      for (const da of fatlist) {
        const fit_tmp = Array(N).fill(0);
        const fat_tmp = Array(N).fill(0);
        fit_tmp[0] = trainingload[0];
        fat_tmp[0] = trainingload[0];
        for (let i=1;i<N;i++){
          fit_tmp[i] = trainingload[i] + df * fit_tmp[i-1];
          fat_tmp[i] = trainingload[i] + da * fat_tmp[i-1];
        }
        const R2val = regressionR2(S_FF, fit_tmp, fat_tmp);
        if (R2val > best_R2) {
          best_R2 = R2val;
          best_fit = df;
          best_fat = da;
        }
      }
    }

    // --- Rebuild fit/fat with best decay ---
    const fit = Array(N).fill(0);
    const fat = Array(N).fill(0);
    fit[0] = trainingload[0];
    fat[0] = trainingload[0];
    for (let i=1;i<N;i++){
      fit[i] = trainingload[i] + best_fit*fit[i-1];
      fat[i] = trainingload[i] + best_fat*fat[i-1];
    }

    const modeledfitness = fit.map((f,i) => f + fat[i]); // simplified sum

    return res.status(200).json({
      best_fit,
      best_fat,
      R2: best_R2,
      modeledfitness,
      S_FF,
      trainingload
    });

  } catch (err) {
    return res.status(500).json({ error: "Server error", details: err.message || String(err) });
  }
}
