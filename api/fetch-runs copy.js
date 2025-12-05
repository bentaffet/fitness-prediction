import mysql from "mysql2/promise";
import axios from "axios";

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"POST only"});
  const { user_name, max_runs=20 } = req.body;

  // Require username
  if(!user_name) return res.status(400).json({error:"Username required"});

  const connection = await mysql.createConnection({
    host:process.env.MYSQL_HOST,
    port:process.env.MYSQL_PORT,
    user:process.env.MYSQL_USER,
    password:process.env.MYSQL_PASSWORD,
    database:process.env.MYSQL_DATABASE,
    ssl:{rejectUnauthorized:false}
  });

  // Fetch Strava code for this user
  const [rows] = await connection.execute(
    "SELECT code FROM strava_tokens WHERE user_name=? ORDER BY id DESC LIMIT 1",
    [user_name]
  );
  await connection.end();
  if(!rows.length) return res.status(404).json({error:`No Strava code found for user ${user_name}`});
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

  // Fetch only required fields
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

  res.status(200).json({user_name, activities});
}
