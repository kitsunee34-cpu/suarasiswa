const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(48).toString("hex");

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL environment variable. Set it to your Supabase connection string.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      class_name TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student','admin')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id),
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending'
        CHECK(status IN ('Pending','In Review','Resolved','Closed')),
      admin_response TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_reports_student ON reports(student_id);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id),
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Hadir','Tidak Hadir','Lewat','Cuti')),
      marked_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(student_id, date)
    );
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
    CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
  `);
}

app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  store: new pgSession({ pool, tableName: "session", createTableIfMissing: true }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 4
  }
}));
app.use(express.static(path.join(__dirname, "public")));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });
  next();
}
function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user || req.session.user.role !== role) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
}
function clean(v, max = 5000) {
  return String(v ?? "").trim().slice(0, max);
}
function asyncRoute(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ATTENDANCE_STATUSES = ["Hadir", "Tidak Hadir", "Lewat", "Cuti"];

app.get("/api/setup/status", asyncRoute(async (req, res) => {
  const r = await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE role='admin'");
  res.json({ needsSetup: r.rows[0].count === 0 });
}));

app.post("/api/setup/admin", asyncRoute(async (req, res) => {
  const adminCount = (await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE role='admin'")).rows[0].count;
  if (adminCount > 0) return res.status(409).json({ error: "Admin setup is already completed." });

  const username = clean(req.body.username, 80);
  const name = clean(req.body.name, 120);
  const password = String(req.body.password || "");
  if (!username || !name || password.length < 10) {
    return res.status(400).json({ error: "Name, username and a password of at least 10 characters are required." });
  }

  const hash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    "INSERT INTO users (username,name,password_hash,role) VALUES ($1,$2,$3,'admin') RETURNING id",
    [username, name, hash]
  );

  req.session.user = { id: result.rows[0].id, username, name, role: "admin" };
  res.json({ user: req.session.user });
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const username = clean(req.body.username, 80);
  const password = String(req.body.password || "");
  const role = req.body.role === "admin" ? "admin" : "student";

  const r = await pool.query(
    "SELECT id,username,name,class_name,password_hash,role,active FROM users WHERE username=$1 AND role=$2",
    [username, role]
  );
  const user = r.rows[0];

  if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Invalid login details." });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    name: user.name,
    className: user.class_name,
    role: user.role
  };
  res.json({ user: req.session.user });
}));

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post("/api/reports", requireRole("student"), asyncRoute(async (req, res) => {
  const category = clean(req.body.category, 80);
  const title = clean(req.body.title, 160);
  const description = clean(req.body.description, 5000);
  const allowed = ["Dewan Makan", "Luahan Perasaan", "Cadangan", "Laporan Pelajar", "Isu Sekolah"];

  if (!allowed.includes(category) || !title || description.length < 5) {
    return res.status(400).json({ error: "Please complete the report correctly." });
  }

  const result = await pool.query(
    "INSERT INTO reports (student_id,category,title,description) VALUES ($1,$2,$3,$4) RETURNING id",
    [req.session.user.id, category, title, description]
  );

  res.status(201).json({ id: result.rows[0].id });
}));

app.get("/api/reports/my", requireRole("student"), asyncRoute(async (req, res) => {
  const r = await pool.query(`
    SELECT id, category, title, description, status, admin_response, created_at, updated_at
    FROM reports WHERE student_id=$1 ORDER BY id DESC
  `, [req.session.user.id]);
  res.json({ reports: r.rows });
}));

app.get("/api/admin/reports", requireRole("admin"), asyncRoute(async (req, res) => {
  const r = await pool.query(`
    SELECT r.id, r.category, r.title, r.description, r.status, r.admin_response,
           r.created_at, r.updated_at,
           u.id AS student_id, u.username AS student_username, u.name AS student_name,
           u.class_name
    FROM reports r
    JOIN users u ON u.id=r.student_id
    ORDER BY r.id DESC
  `);
  res.json({ reports: r.rows });
}));

app.patch("/api/admin/reports/:id", requireRole("admin"), asyncRoute(async (req, res) => {
  const status = clean(req.body.status, 30);
  const response = clean(req.body.adminResponse, 5000);
  const allowed = ["Pending", "In Review", "Resolved", "Closed"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status." });

  const result = await pool.query(`
    UPDATE reports SET status=$1, admin_response=$2, updated_at=NOW() WHERE id=$3
  `, [status, response, req.params.id]);

  if (!result.rowCount) return res.status(404).json({ error: "Report not found." });
  res.json({ ok: true });
}));

app.get("/api/admin/students", requireRole("admin"), asyncRoute(async (req, res) => {
  const r = await pool.query(`
    SELECT id, username, name, class_name, active, created_at
    FROM users WHERE role='student' ORDER BY name COLLATE "C"
  `);
  res.json({ students: r.rows });
}));

app.post("/api/admin/students", requireRole("admin"), asyncRoute(async (req, res) => {
  const username = clean(req.body.username, 80);
  const name = clean(req.body.name, 120);
  const className = clean(req.body.className, 80);
  const password = String(req.body.password || "");

  if (!username || !name || password.length < 10) {
    return res.status(400).json({ error: "Name, username and a password of at least 10 characters are required." });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(`
      INSERT INTO users (username,name,class_name,password_hash,role)
      VALUES ($1,$2,$3,$4,'student') RETURNING id
    `, [username, name, className, hash]);
    res.status(201).json({ id: result.rows[0].id });
  } catch {
    res.status(409).json({ error: "That student username already exists." });
  }
}));

app.patch("/api/admin/students/:id/status", requireRole("admin"), asyncRoute(async (req, res) => {
  const active = req.body.active ? 1 : 0;
  const result = await pool.query(
    "UPDATE users SET active=$1 WHERE id=$2 AND role='student'",
    [active, req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Student not found." });
  res.json({ ok: true });
}));

app.get("/api/admin/attendance/:date", requireRole("admin"), asyncRoute(async (req, res) => {
  const date = clean(req.params.date, 10);
  if (!DATE_RE.test(date)) return res.status(400).json({ error: "Invalid date." });

  const r = await pool.query(`
    SELECT u.id, u.username, u.name, u.class_name, a.status
    FROM users u
    LEFT JOIN attendance a ON a.student_id = u.id AND a.date = $1
    WHERE u.role='student' AND u.active=1
    ORDER BY u.class_name COLLATE "C", u.name COLLATE "C"
  `, [date]);

  res.json({ date, students: r.rows });
}));

app.post("/api/admin/attendance", requireRole("admin"), asyncRoute(async (req, res) => {
  const date = clean(req.body.date, 10);
  const records = Array.isArray(req.body.records) ? req.body.records : [];
  if (!DATE_RE.test(date)) return res.status(400).json({ error: "Invalid date." });
  if (!records.length) return res.status(400).json({ error: "No attendance records provided." });

  for (const rec of records) {
    if (!Number.isInteger(rec.studentId) || !ATTENDANCE_STATUSES.includes(rec.status)) {
      return res.status(400).json({ error: "Invalid attendance record." });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const rec of records) {
      await client.query(`
        INSERT INTO attendance (student_id, date, status, marked_by)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (student_id, date) DO UPDATE SET
          status=EXCLUDED.status, marked_by=EXCLUDED.marked_by, updated_at=NOW()
      `, [rec.studentId, date, rec.status, req.session.user.id]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  res.json({ ok: true, count: records.length });
}));

app.get("/api/attendance/my", requireRole("student"), asyncRoute(async (req, res) => {
  const r = await pool.query(`
    SELECT date, status FROM attendance WHERE student_id=$1 ORDER BY date DESC LIMIT 90
  `, [req.session.user.id]);
  const records = r.rows;

  const counts = { Hadir: 0, "Tidak Hadir": 0, Lewat: 0, Cuti: 0 };
  for (const row of records) counts[row.status] = (counts[row.status] || 0) + 1;
  const marked = records.length;
  const percent = marked ? Math.round((counts.Hadir / marked) * 100) : 0;

  res.json({
    records,
    summary: { percent, hadir: counts.Hadir, takHadir: counts["Tidak Hadir"], lewat: counts.Lewat, cuti: counts.Cuti }
  });
}));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Server error." });
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`SuaraSiswa running at http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error("Failed to initialize database:", e);
    process.exit(1);
  });
