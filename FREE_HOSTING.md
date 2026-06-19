# Free Hosting Plan for OK Quest

## Important Render Note

The current Render workspace is suspended because of unpaid invoices. A suspended Render workspace cannot create or run new services, including free services.

That means the no-payment choice is:

1. Do not use this suspended Render workspace.
2. Keep the current Vercel deployment for the public demo.
3. Use local Wi-Fi for the full multiplayer version while learning.
4. Later, use a free persistent Node host from a clean account if you want public multiplayer.

## Free Option 1: Current Vercel Demo

Current URL:

```text
https://okquestkavaroholdingscom.vercel.app
```

This is useful for showing the homepage and app screens publicly.

Limitation: Vercel is not the best place for the current Socket.io server because live multiplayer needs a persistent Node process.

## Free Option 2: Local Wi-Fi Multiplayer

This is the best zero-cost option for actual family game night right now.

Run on the laptop:

```bash
npm install
npm start
```

Open on the TV/laptop:

```text
http://localhost:3000
```

Open on phones connected to the same Wi-Fi:

```text
http://YOUR-LAPTOP-IP:3000/join.html
```

This gives the real TV plus phones multiplayer experience without paying for hosting.

## Free Option 3: Free Persistent Node Host

For public multiplayer, use a host that runs a normal long-lived Node server and supports WebSockets.

Good candidates to check:

- Koyeb free web service
- Railway free/trial service, if available for your account
- Fly.io free allowance, if available for your account

Expected app settings:

```text
Build command: npm install
Start command: npm start
Health check path: /api/health
Port: use the platform-provided PORT environment variable
```

OK Quest already supports `process.env.PORT`, so it is ready for this kind of host.

## Why Not Pay Render?

For a learning project, paying old invoices just to test a family prototype is not necessary. Build and test locally first, keep the free Vercel demo online, and move to a persistent free host only when you need public multiplayer outside your home Wi-Fi.
