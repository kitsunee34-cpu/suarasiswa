const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(48).toString("hex");

const db = new Database(path.join(__dirname, "suarasiswa.db"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  class_name TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student','admin')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK(status IN ('Pending','In Review','Resolved','Closed')),
  admin_response TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_reports_student ON reports(student_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
`);

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
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
function clean(v, max=5000) {
  return String(v ?? "").trim().slice(0, max);
}

app.get("/api/setup/status", (req, res) => {
  const admin = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin'").get();
  res.json({ needsSetup: admin.count === 0 });
});

app.post("/api/setup/admin", async (req, res) => {
  const adminCount = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin'").get().count;
  if (adminCount > 0) return res.status(409).json({ error: "Admin setup is already completed." });

  const username = clean(req.body.username, 80);
  const name = clean(req.body.name, 120);
  const password = String(req.body.password || "");
  if (!username || !name || password.length < 10) {
    return res.status(400).json({ error: "Name, username and a password of at least 10 characters are required." });
  }

  const hash = await bcrypt.hash(password, 12);
  const result = db.prepare(
    "INSERT INTO users (username,name,password_hash,role) VALUES (?,?,?,'admin')"
  ).run(username, name, hash);

  req.session.user = { id: result.lastInsertRowid, username, name, role: "admin" };
  res.json({ user: req.session.user });
});

app.post("/api/auth/login", async (req, res) => {
  const username = clean(req.body.username, 80);
  const password = String(req.body.password || "");
  const role = req.body.role === "admin" ? "admin" : "student";

  const user = db.prepare(
    "SELECT id,username,name,class_name,password_hash,role,active FROM users WHERE username=? AND role=?"
  ).get(username, role);

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
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post("/api/reports", requireRole("student"), (req, res) => {
  const category = clean(req.body.category, 80);
  const title = clean(req.body.title, 160);
  const description = clean(req.body.description, 5000);
  const allowed = ["Dewan Makan", "Luahan Perasaan", "Cadangan", "Laporan Pelajar", "Isu Sekolah"];

  if (!allowed.includes(category) || !title || description.length < 5) {
    return res.status(400).json({ error: "Please complete the report correctly." });
  }

  const result = db.prepare(
    "INSERT INTO reports (student_id,category,title,description) VALUES (?,?,?,?)"
  ).run(req.session.user.id, category, title, description);

  res.status(201).json({ id: result.lastInsertRowid });
});

app.get("/api/reports/my", requireRole("student"), (req, res) => {
  const rows = db.prepare(`
    SELECT id, category, title, description, status, admin_response, created_at, updated_at
    FROM reports WHERE student_id=? ORDER BY id DESC
  `).all(req.session.user.id);
  res.json({ reports: rows });
});

app.get("/api/admin/reports", requireRole("admin"), (req, res) => {
  const rows = db.prepare(`
    SELECT r.id, r.category, r.title, r.description, r.status, r.admin_response,
           r.created_at, r.updated_at,
           u.id AS student_id, u.username AS student_username, u.name AS student_name,
           u.class_name
    FROM reports r
    JOIN users u ON u.id=r.student_id
    ORDER BY r.id DESC
  `).all();
  res.json({ reports: rows });
});

app.patch("/api/admin/reports/:id", requireRole("admin"), (req, res) => {
  const status = clean(req.body.status, 30);
  const response = clean(req.body.adminResponse, 5000);
  const allowed = ["Pending", "In Review", "Resolved", "Closed"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status." });

  const result = db.prepare(`
    UPDATE reports SET status=?, admin_response=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(status, response, req.params.id);

  if (!result.changes) return res.status(404).json({ error: "Report not found." });
  res.json({ ok: true });
});

app.get("/api/admin/students", requireRole("admin"), (req, res) => {
  const rows = db.prepare(`
    SELECT id, username, name, class_name, active, created_at
    FROM users WHERE role='student' ORDER BY name COLLATE NOCASE
  `).all();
  res.json({ students: rows });
});

app.post("/api/admin/students", requireRole("admin"), async (req, res) => {
  const username = clean(req.body.username, 80);
  const name = clean(req.body.name, 120);
  const className = clean(req.body.className, 80);
  const password = String(req.body.password || "");

  if (!username || !name || password.length < 10) {
    return res.status(400).json({ error: "Name, username and a password of at least 10 characters are required." });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare(`
      INSERT INTO users (username,name,class_name,password_hash,role)
      VALUES (?,?,?,?, 'student')
    `).run(username, name, className, hash);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch {
    res.status(409).json({ error: "That student username already exists." });
  }
});

app.patch("/api/admin/students/:id/status", requireRole("admin"), (req, res) => {
  const active = req.body.active ? 1 : 0;
  const result = db.prepare("UPDATE users SET active=? WHERE id=? AND role='student'")
    .run(active, req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Student not found." });
  res.json({ ok: true });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`SuaraSiswa running at http://localhost:${PORT}`);
});
