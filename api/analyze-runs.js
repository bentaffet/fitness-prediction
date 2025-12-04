import axios from "axios";

export default async function handler(req, res) {
  if(req.method!=="POST") return res.status(405).json({error:"POST only"});
  try {
    const { user_name } = req.body;
    if(!user_name) return res.status(400).json({error:"Missing username"});

    // For simplicity, store/retrieve code from memory or DB (optional)
    const code = process.env.TEST_STRAVA_CODE; // or fetch from DB if needed
    if(!code) return res.status(400).json({error:"No Strava code"});

    const tokenRes = await axios.post("https://www.strava.com/oauth/token", null, {
      params:{ client_id:process.env.STRAVA_CLIENT_ID, client_secret:process.env.STRAVA_CLIENT_SECRET, code, grant_type:"authorization_code" }
    });
    const access_token = tokenRes.data.access_token;

    const stravaRes = await axios.get("https://www.strava.com/api/v3/athlete/activities?per_page=10",
      { headers:{ Authorization:`Bearer ${access_token}` } });

    let runs = stravaRes.data.filter(a=>a.type.toLowerCase()==="run");
    if(!runs.length) runs = [{distance:5},{distance:6}]; // fallback example

    const modeledfitness = runs.map((r,i)=>i*10 + (r.distance||5)); // simplified metric
    return res.status(200).json({ user_name, runs, modeledfitness });

  } catch(err){
    console.error(err.response?.data||err.message||err);
    return res.status(500).json({error:"Server error", details:err.message||String(err)});
  }
}
