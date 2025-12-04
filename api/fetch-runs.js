import mysql from "mysql2/promise";
import axios from "axios";

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"POST only"});
  const { user_name, max_runs=20 } = req.body;

  const connection = await mysql.createConnection({
    host:process.env.MYSQL_HOST,
    port:process.env.MYSQL_PORT,
    user:process.env.MYSQL_USER,
    password:process.env.MYSQL_PASSWORD,
    database:process.env.MYSQL_DATABASE,
    ssl:{rejectUnauthorized:false}
  });

  let usernameToUse = user_name;
  if(!usernameToUse){
    const [rowsUser] = await connection.execute("SELECT user_name FROM strava_tokens ORDER BY id DESC LIMIT 1");
    if(!rowsUser.length){ await connection.end(); return res.status(404).json({error:"No user found"}); }
    usernameToUse = rowsUser[0].user_name;
  }

  const [rows] = await connection.execute(
    "SELECT code FROM strava_tokens WHERE user_name=? ORDER BY id DESC LIMIT 1",
    [usernameToUse]
  );
  await connection.end();
  if(!rows.length) return res.status(404).json({error:"No code found"});
  const code = rows[0].code;

  // Exchange code for access token
  const tokenRes = await axios.post("https://www.strava.com/oauth/token", null,{
    params:{
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type:"authorization_code"
    }
  });
  const access_token = tokenRes.data.access_token;

  // Fetch activities
  const stravaRes = await axios.get(
    `https://www.strava.com/api/v3/athlete/activities?per_page=${max_runs}`,
    { headers:{ Authorization:`Bearer ${access_token}` } }
  );

  const activities = stravaRes.data.map(act=>({
    id:act.id,
    name:act.name,
    type:act.type.toLowerCase(),
    distance_m:act.distance,
    moving_time_s:act.moving_time,
    elapsed_time_s:act.elapsed_time,
    start_date:act.start_date,
    average_heartrate: act.hasOwnProperty("average_heartrate") ? act.average_heartrate : null,
    max_heartrate: act.hasOwnProperty("max_heartrate") ? act.max_heartrate : null
  }));

  res.status(200).json({user_name:usernameToUse, activities});
}
