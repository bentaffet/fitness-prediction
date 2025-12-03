import mysql from "mysql2/promise";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { code, user_name } = req.body;
  if (!code || !user_name) {
    return res.status(400).json({ error: "Missing code or user_name" });
  }

  try {
    // Create MySQL connection (Aiven requires SSL)
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: process.env.MYSQL_PORT,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      ssl: { rejectUnauthorized: false },
    });

    // Create table if not exists
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS strava_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_name VARCHAR(255) NOT NULL,
        code VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert authorization code + username
    await connection.execute(
      "INSERT INTO strava_tokens (user_name, code) VALUES (?, ?)",
      [user_name, code]
    );

    await connection.end();

    return res.status(200).json({ success: true, user_name, code });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
