import mysql from "mysql2/promise";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: "Missing code" });
  }

  try {
    // Create MySQL connection (Aiven requires SSL)
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: process.env.MYSQL_PORT,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      ssl: { rejectUnauthorized: false }
    });

    // Create table if not exists
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS strava_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert authorization code
    await connection.execute(
      "INSERT INTO strava_tokens (code) VALUES (?)",
      [code]
    );

    await connection.end();

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
