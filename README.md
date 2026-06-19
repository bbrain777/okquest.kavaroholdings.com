# OBADEMI KINGDOM QUEST

OK Quest is a family game-show web app. One screen acts as the TV host, and players use their phones as controllers.

## Why These Files Exist

- `package.json` tells Node.js the project name, dependencies, and run commands.
- `server.js` runs the backend. It creates rooms, handles players joining, sends questions, receives answers, and updates scores live.
- `public/` contains files sent to browsers and phones.
- `data/` contains simple JSON files that act like a starter database.

## Folder Guide

- `public/index.html`: home screen with Create Game and Join Game buttons.
- `public/host.html`: TV/host screen for room creation, lobby, questions, scoreboard, and winners.
- `public/join.html`: phone registration form.
- `public/player.html`: phone controller for answering questions.
- `public/admin.html`: placeholder parent admin screen for a later phase.
- `public/styles.css`: visual design for TV and phone screens.
- `public/host.js`: browser logic for the host screen.
- `public/join.js`: browser logic for joining a room.
- `public/player.js`: browser logic for answering questions.
- `data/questions.json`: quiz questions and explanations.
- `data/rewards.json`: editable reward examples.
- `data/badges.json`: badge examples.
- `data/players.json`: saved player snapshot from live rooms.

## Install

```bash
npm install
```

## Run

```bash
npm start
```

Open the TV/host screen:

```text
http://localhost:3000
```

For phones on the same Wi-Fi, open the laptop IP address:

```text
http://YOUR-LAPTOP-IP:3000/join.html
```

## First Version Checklist

- Host can create a room.
- TV shows a room code and QR code.
- Players can join from phones.
- TV lobby updates live.
- Host can start the game after at least 2 players join.
- Players answer questions from phones.
- Scores update live.
- TV reveals explanation, fact, career link, and life lesson.
- Final winner and rewards display.
