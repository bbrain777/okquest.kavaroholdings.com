const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");
const QRCode = require("qrcode");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const questions = readJson("questions.json", []);
const rewards = readJson("rewards.json", []);
const badges = readJson("badges.json", []);
const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, app: "OK Quest" });
});

io.on("connection", (socket) => {
  socket.on("host:createRoom", async (settings = {}) => {
    const roomCode = createRoomCode();
    const joinUrl = `${settings.baseUrl || "http://localhost:3000"}/join.html?room=${roomCode}`;
    const qrCode = await QRCode.toDataURL(joinUrl);

    const room = {
      code: roomCode,
      hostSocketId: socket.id,
      settings,
      players: [],
      currentQuestion: null,
      questionIndex: 0,
      usedQuestionIds: new Set(),
      state: "lobby",
      createdAt: new Date().toISOString()
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.emit("host:roomCreated", publicRoom(room, qrCode, joinUrl));
  });

  socket.on("player:join", ({ roomCode, profile }) => {
    const room = rooms.get(String(roomCode || "").trim());

    if (!room) {
      socket.emit("player:error", "That room code was not found.");
      return;
    }

    const player = {
      id: socket.id,
      roomCode: room.code,
      fullName: clean(profile.fullName),
      nickname: clean(profile.nickname) || clean(profile.fullName) || "Player",
      age: Number(profile.age) || 0,
      role: clean(profile.role),
      team: clean(profile.team) || "Solo",
      favouriteSubject: clean(profile.favouriteSubject),
      difficulty: clean(profile.difficulty) || "Auto",
      avatar: clean(profile.avatar) || "⭐",
      score: 0,
      lifetimePoints: 0,
      badges: [],
      answeredCurrent: false
    };

    room.players.push(player);
    socket.join(room.code);
    socket.emit("player:joined", { roomCode: room.code, player });
    io.to(room.code).emit("room:update", publicRoom(room));
    savePlayersSnapshot();
  });

  socket.on("player:rejoin", ({ roomCode, playerId }) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return;

    const player = room.players.find((item) => item.id === playerId);
    if (!player) return;

    player.id = socket.id;
    player.disconnected = false;
    socket.join(room.code);
    socket.emit("player:rejoined", { roomCode: room.code, player });
    io.to(room.code).emit("room:update", publicRoom(room));
  });

  socket.on("host:startGame", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.players.length < 2) return;

    room.state = "playing";
    room.questionIndex = 0;
    room.usedQuestionIds = new Set();
    sendNextQuestion(room);
  });

  socket.on("player:answer", ({ roomCode, answer }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.currentQuestion) return;

    const player = room.players.find((item) => item.id === socket.id);
    if (!player || player.answeredCurrent) return;

    player.answeredCurrent = true;
    const correct = answer === room.currentQuestion.answer;
    const points = correct ? Number(room.currentQuestion.points || 10) : 0;
    player.score += points;
    player.lifetimePoints += points;

    socket.emit("player:answerResult", { correct, points, answer });
    io.to(room.code).emit("room:update", publicRoom(room));
  });

  socket.on("host:revealAnswer", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.currentQuestion) return;

    room.state = "revealing";
    io.to(room.code).emit("game:reveal", {
      question: safeQuestion(room.currentQuestion, true),
      leaderboard: leaderboard(room),
      teamScores: teamScores(room)
    });
    savePlayersSnapshot();
  });

  socket.on("host:nextQuestion", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    sendNextQuestion(room);
  });

  socket.on("host:endGame", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.state = "finished";
    io.to(room.code).emit("game:finished", {
      leaderboard: leaderboard(room),
      teamScores: teamScores(room),
      rewards,
      badges
    });
    savePlayersSnapshot();
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      const player = room.players.find((item) => item.id === socket.id);
      if (player) {
        player.disconnected = true;
        io.to(room.code).emit("room:update", publicRoom(room));
      }
    }
  });
});

function readJson(fileName, fallback) {
  try {
    const filePath = path.join(DATA_DIR, fileName);
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(fileName, value) {
  const filePath = path.join(DATA_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function savePlayersSnapshot() {
  const players = [];
  for (const room of rooms.values()) {
    players.push(...room.players);
  }
  writeJson("players.json", players);
}

function createRoomCode() {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

function sendNextQuestion(room) {
  room.questionIndex += 1;
  room.state = "playing";
  room.players.forEach((player) => {
    player.answeredCurrent = false;
  });

  const available = questions.filter((question) => !room.usedQuestionIds.has(question.id));
  if (!available.length) {
    room.state = "finished";
    io.to(room.code).emit("game:finished", {
      leaderboard: leaderboard(room),
      teamScores: teamScores(room),
      rewards,
      badges
    });
    return;
  }

  const question = available[Math.floor(Math.random() * available.length)];
  room.usedQuestionIds.add(question.id);
  room.currentQuestion = question;

  io.to(room.code).emit("game:question", {
    questionNumber: room.questionIndex,
    question: safeQuestion(question, false),
    leaderboard: leaderboard(room),
    teamScores: teamScores(room)
  });
}

function safeQuestion(question, includeAnswer) {
  const publicQuestion = { ...question };
  if (!includeAnswer) {
    delete publicQuestion.answer;
    delete publicQuestion.explanation;
    delete publicQuestion.interestingFact;
    delete publicQuestion.careerLink;
    delete publicQuestion.lifeLesson;
  }
  return publicQuestion;
}

function publicRoom(room, qrCode, joinUrl) {
  return {
    code: room.code,
    state: room.state,
    players: room.players,
    leaderboard: leaderboard(room),
    teamScores: teamScores(room),
    qrCode,
    joinUrl
  };
}

function leaderboard(room) {
  return [...room.players].sort((a, b) => b.score - a.score);
}

function teamScores(room) {
  return room.players.reduce((scores, player) => {
    scores[player.team] = (scores[player.team] || 0) + player.score;
    return scores;
  }, {});
}

function clean(value) {
  return String(value || "").trim();
}

server.listen(PORT, () => {
  console.log(`OK Quest is running at http://localhost:${PORT}`);
});
