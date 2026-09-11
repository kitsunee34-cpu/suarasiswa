# Turning SuaraSiswa into a mobile app

This project is now set up so you can wrap it with **Capacitor** and build a
real installable Android (and optionally iOS) app. Because SuaraSiswa is a
server + database app (Express + SQLite, login sessions), the mobile app
works by loading your **live, deployed** server inside a native shell — it
does not run the Node server on the phone itself.

## 1. Deploy the backend first

Pick a host that runs Node.js and gives you a persistent disk for the
`suarasiswa.db` SQLite file:

- **Render.com** — easiest, has a free web service tier + paid persistent disks
- **Railway.app** — simple, usage-based pricing
- **Fly.io** — free small VM + volumes

General steps (Render example):
1. Push this folder to a GitHub repo.
2. On Render, create a new "Web Service" from that repo.
3. Build command: `npm install` — Start command: `npm start`
4. Add an environment variable `SESSION_SECRET` set to a long random string.
5. Add a persistent disk mounted so `suarasiswa.db` survives restarts.
6. Deploy — you'll get a URL like `https://suarasiswa.onrender.com`.

Visit that URL and create your first admin account to confirm it works
before moving on.

## 2. Point the app at your live server

Open `capacitor.config.ts` in this folder and replace the placeholder:

```ts
server: {
  url: 'https://suarasiswa.onrender.com', // <-- your real URL here
  cleartext: false,
  androidScheme: 'https'
}
```

## 3. Install dependencies and add platforms

On your own computer (with Node.js 20+ and internet access):

```bash
npm install
npx cap init   # only if it asks — appId/appName are already set in capacitor.config.ts
npx cap add android
npx cap add ios      # optional, needs a Mac + Xcode
npx cap sync
```

## 4. Build and test

**Android** (needs Android Studio):
```bash
npx cap open android
```
This opens the project in Android Studio, where you can run it on an
emulator/device, and later build a signed `.apk`/`.aab` for the Play Store.

**iOS** (needs a Mac + Xcode + Apple Developer account):
```bash
npx cap open ios
```

## 5. Icon, splash screen, app name

- App name and package ID are set in `capacitor.config.ts` (`appName`,
  `appId`) — change `com.yourschool.suarasiswa` to your own reverse-domain ID.
- For icons/splash screens, install `@capacitor/assets` and run its
  generator against your own logo, or replace the images directly under
  `android/app/src/main/res` once the Android platform is added.

## Notes

- Because the app loads your real HTTPS site in a WebView, logins, sessions,
  and all existing server behavior work with no extra code changes.
- Before school-wide rollout, revisit the production checklist in the
  original `README.md` (PostgreSQL, Redis sessions, HTTPS, rate limiting,
  CSRF, backups, data-retention policy).
