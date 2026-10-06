// Usage (PowerShell, from the project folder):
//   $env:DATABASE_URL = "your Supabase connection string"
//   node add-counselor.js <username> "<Full Name>" <password>
//
// Example:
//   node add-counselor.js kaunselor1 "Cikgu Aisyah" "KataLaluan#2026"
//
// The counselor gets the 'admin' role, because all counselor features in
// server.js (reports, UBK visits, students, NFC cards) are behind requireRole("admin").

const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const [username, name, password] = process.argv.slice(2);

if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}
if (!username || !name || !password || password.length < 10) {
  console.error('Usage: node add-counselor.js <username> "<Full Name>" <password (min 10 chars)>');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  try {
    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query(
      "INSERT INTO users (username, name, password_hash, role) VALUES ($1, $2, $3, 'admin') RETURNING id",
      [username.trim(), name.trim(), hash]
    );
    console.log(`Counselor account created (id ${r.rows[0].id}). Log in with role "admin" and username "${username.trim()}".`);
  } catch (e) {
    if (e.code === "23505") console.error("That username already exists.");
    else console.error("Failed:", e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
