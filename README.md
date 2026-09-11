# SuaraSiswa

A real full-stack starter for a student voice/reporting platform.

## Features
- Student and Admin/Counsellor login
- Only admins can create student accounts
- Student reports are private from other students
- Admin-only report dashboard
- Report status and admin response
- Student activation/deactivation
- SQLite database
- Password hashing with bcrypt
- Basic security headers with Helmet

## Run locally
1. Install Node.js 20+.
2. Open a terminal in this folder.
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000`
6. On the first run, create the first admin account from the login page.

## Important before public deployment
This starter is functional, but for a school-wide production deployment you should:
- use PostgreSQL (or a managed database) instead of local SQLite if multiple server instances are used;
- use a persistent session store such as Redis;
- set a long random SESSION_SECRET in the hosting environment;
- enable HTTPS;
- add CSRF protection and rate limiting;
- define a school data-retention policy and access/audit policy;
- restrict admin accounts to authorised staff;
- add backups and monitoring;
- consider anonymous-report mode only if the school's safeguarding process supports it.

Do not put real student information into a development installation exposed to the public internet.
