import mysql from "mysql2/promise";
import axios from "axios";

function zscore(arr) {
  const mean = arr.reduce((sum, v) => sum + v, 0) / arr.length;
  const std = Math.sqrt(arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length);
  return arr.map(v => (v - mean) / std);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const { user_name, max_runs } = req.body;

    // --- 1️⃣ Connect to DB ---
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: process.env.MYSQL_PORT,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      ssl: { rejectUnauthorized: false },
    });

    // --- 2️⃣ Get latest code if username not provided ---
    let usernameToUse = user_name;
    if (!usernameToUse) {
      const [rowsUser] = await connection.execute(
        "SELECT user_name FROM strava_tokens ORDER BY id DESC LIMIT 1"
      );
      if (!rowsUser.length) {
        await connection.end();
        return res.status(404).json({ error: "No user found in DB" });
      }
      usernameToUse = rowsUser[0].user_name;
    }

    // --- 3️⃣ Get Strava code ---
    const [rowsCode] = await connection.execute(
      "SELECT code FROM strava_tokens WHERE user_name = ? ORDER BY id DESC LIMIT 1",
      [usernameToUse]
    );
    await connection.end();

    if (!rowsCode.length) return res.status(404).json({ error: "No Strava code found" });
    const code = rowsCode[0].code;
    const limit = max_runs || 50;

    // --- 4️⃣ Get access token ---
    const tokenRes = await axios.post(
      "https://www.strava.com/oauth/token",
      null,
      {
        params: {
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
        },
      }
    );
    const access_token = tokenRes.data.access_token;

    // --- 5️⃣ Fetch activities ---
    const stravaRes = await axios.get(
      `https://www.strava.com/api/v3/athlete/activities?per_page=${limit}`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    let runs = stravaRes.data.filter(act => act.type.toLowerCase() === "run");

    if (!runs.length) return res.status(404).json({ error: "No runs found" });

    // --- 6️⃣ Compute derived fields ---
    runs = runs.map(run => {
      const distance_miles = run.distance * 0.000621371;
      const average_pace = run.moving_time / 60 / distance_miles; // min/mile
      const average_heartrate = run.average_heartrate || 100; // fallback
      return { ...run, distance_miles, average_pace, average_heartrate };
    });

    const z_pace = zscore(runs.map(r => r.average_pace));
    const z_hr = zscore(runs.map(r => r.average_heartrate));
    const S_FF = runs.map((r, i) => -(z_pace[i] + z_hr[i]) / 2);

    const z_TMM = zscore(runs.map(r => r.distance_miles));
    const trainingload = z_TMM.map((tmm, i) => tmm * (1 - S_FF[i]));

    // --- 7️⃣ Grid search ---
    const fitlist = [0.70,0.71,0.72,0.73,0.74,0.75,0.76,0.77,0.78,0.79,0.80];
    const fatlist = [0.30,0.31,0.32,0.33,0.34,0.35,0.36,0.37,0.38,0.39,0.40];
    let best_R2 = -Infinity;
    let best_fit = null;
    let best_fat = null;

    function regress(y, x1, x2) {
      // simple linear regression: y ~ x1 + x2
      const n = y.length;
      let sumY=0,sumX1=0,sumX2=0,sumX1X1=0,sumX2X2=0,sumX1X2=0,sumY_X1=0,sumY_X2=0;
      for(let i=0;i<n;i++){
        sumY+=y[i]; sumX1+=x1[i]; sumX2+=x2[i];
        sumX1X1+=x1[i]*x1[i]; sumX2X2+=x2[i]*x2[i]; sumX1X2+=x1[i]*x2[i];
        sumY_X1+=y[i]*x1[i]; sumY_X2+=y[i]*x2[i];
      }
      const denom = (sumX1X1*sumX2X2 - sumX1X2*sumX1X2);
      if(denom===0) return 0;
      const b1 = (sumY_X1*sumX2X2 - sumY_X2*sumX1X2)/denom;
      const b2 = (sumY_X2*sumX1X1 - sumY_X1*sumX1X2)/denom;
      const yhat = y.map((v,i)=>b1*x1[i]+b2*x2[i]);
      const ssr = yhat.reduce((s,v,i)=>s+(v-y[i])**2,0);
      const sst = y.reduce((s,v)=>s+(v-(y.reduce((a,b)=>a+b,0)/y.length))**2,0);
      return 1 - ssr/sst; // R2
    }

    let fit_tmp=[], fat_tmp=[];
    for (let df of fitlist){
      for (let da of fatlist){
        fit_tmp[0] = trainingload[0]; fat_tmp[0] = trainingload[0];
        for (let i=1;i<trainingload.length;i++){
          fit_tmp[i] = trainingload[i] + df*fit_tmp[i-1];
          fat_tmp[i] = trainingload[i] + da*fat_tmp[i-1];
        }
        const R2val = regress(S_FF, fit_tmp, fat_tmp);
        if(R2val>best_R2){
          best_R2=R2val;
          best_fit=df;
          best_fat=da;
        }
      }
    }

    // --- 8️⃣ Compute modeledfitness ---
    const modeledfitness = [];
    fit_tmp[0] = trainingload[0]; fat_tmp[0] = trainingload[0];
    for(let i=1;i<trainingload.length;i++){
      fit_tmp[i] = trainingload[i] + best_fit*fit_tmp[i-1];
      fat_tmp[i] = trainingload[i] + best_fat*fat_tmp[i-1];
    }
    const n = trainingload.length;
    for(let i=0;i<n;i++){
      modeledfitness[i] = fit_tmp[i]+fat_tmp[i]; // simplified sum
    }

    return res.status(200).json({
      user_name: usernameToUse,
      best_fit,
      best_fat,
      R2: best_R2,
      modeledfitness,
      S_FF,
      trainingload,
      runs
    });

  } catch(err){
    console.error(err.response?.data||err.message||err);
    return res.status(500).json({ error: "Server error", details: err.message||String(err) });
  }
}
