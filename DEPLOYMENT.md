# OK Quest Deployment Notes

## Current GitHub Repo

https://github.com/bbrain777/okquest.kavaroholdings.com

## Current Vercel Preview/Static Deployment

https://okquestkavaroholdingscom.vercel.app

Vercel can serve the pages and API endpoint, but this app uses Socket.io for live rooms, phones, and TV updates. That needs a persistent Node process for reliable production play.

## Recommended Multiplayer Host: Persistent Node Web Service

This repo includes `render.yaml`, a Render Blueprint file. Render web services support inbound WebSocket connections, which is what Socket.io needs for the live multiplayer game.

However, if your Render workspace is suspended for unpaid invoices, Render will not let you use even free services in that workspace. In that case, do not pay just for this learning prototype. Use the free paths in `FREE_HOSTING.md`.

### Why Render Fits This Version

- It runs `npm install` to install dependencies.
- It runs `npm start`, which starts `server.js`.
- It keeps one normal Node web service alive.
- It checks `/api/health` to confirm the app is running.
- It can auto-deploy when `main` receives new commits.

### Render Setup

1. Go to Render and create a new Blueprint.
2. Connect the GitHub repository:

   ```text
   https://github.com/bbrain777/okquest.kavaroholdings.com
   ```

3. Render will read `render.yaml`.
4. Confirm the service.
5. Deploy.

### Expected Settings

```text
Name: okquest-kavaroholdings
Runtime: Node
Build command: npm install
Start command: npm start
Health check path: /api/health
```

## Local Run

```bash
npm install
npm start
```

Then open:

```text
http://localhost:3000
```
