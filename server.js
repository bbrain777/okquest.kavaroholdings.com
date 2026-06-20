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
let rewards = readJson("rewards.json", []);
const badges = readJson("badges.json", []);
const rooms = new Map();
const generatedCategories = ["Maths", "Science", "Technology", "Life Skills", "Moral Lessons"];

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, app: "OK Quest" });
});

app.get("/api/rewards", (req, res) => {
  res.json(rewards);
});

app.post("/api/rewards", (req, res) => {
  const nextRewards = normalizeRewards(req.body?.rewards || []);
  rewards = nextRewards;
  writeJson("rewards.json", rewards);
  io.emit("rewards:update", rewards);
  res.json({ ok: true, rewards });
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
  const question = available.length
    ? available[Math.floor(Math.random() * available.length)]
    : generateQuestion(room);

  if (question.id) {
    room.usedQuestionIds.add(question.id);
  }

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
    rewards,
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

function normalizeRewards(items) {
  const defaults = [
    { position: 1, reward: "Champion prize" },
    { position: 2, reward: "Second place prize" },
    { position: 3, reward: "Third place prize" }
  ];

  return defaults.map((fallback, index) => {
    const item = items[index] || {};
    return {
      position: fallback.position,
      reward: clean(item.reward) || fallback.reward
    };
  });
}

function generateQuestion(room) {
  const category = room.questionIndex % 2 === 0
    ? "Maths"
    : generatedCategories[Math.floor(Math.random() * generatedCategories.length)];

  if (category === "Maths") {
    return generateMathQuestion(room.questionIndex);
  }

  return generateKnowledgeQuestion(category, room.questionIndex);
}

function generateMathQuestion(questionIndex) {
  const level = questionIndex < 5 ? "easy" : questionIndex < 12 ? "medium" : "hard";
  const makers = {
    easy: [makeAdditionQuestion, makeSubtractionQuestion, makeTimesTableQuestion],
    medium: [makeTwoDigitMultiplicationQuestion, makeExactDivisionQuestion, makePercentageQuestion],
    hard: [makeAlgebraQuestion, makeOrderOfOperationsQuestion, makeRatioQuestion, makePercentageIncreaseQuestion]
  };
  const maker = makers[level][Math.floor(Math.random() * makers[level].length)];
  return maker(level);
}

function makeAdditionQuestion(level) {
  const a = randomInt(18, 95);
  const b = randomInt(17, 88);
  const answer = a + b;
  return mathQuestion(level, `What is ${a} + ${b}?`, answer, `${a} + ${b} equals ${answer}.`);
}

function makeSubtractionQuestion(level) {
  const answer = randomInt(12, 85);
  const b = randomInt(12, 75);
  const a = answer + b;
  return mathQuestion(level, `What is ${a} - ${b}?`, answer, `${a} - ${b} equals ${answer}.`);
}

function makeTimesTableQuestion(level) {
  const a = randomInt(6, 12);
  const b = randomInt(6, 12);
  const answer = a * b;
  return mathQuestion(level, `What is ${a} x ${b}?`, answer, `${a} groups of ${b} makes ${answer}.`);
}

function makeTwoDigitMultiplicationQuestion(level) {
  const a = randomInt(13, 29);
  const b = randomInt(11, 24);
  const answer = a * b;
  return mathQuestion(level, `What is ${a} x ${b}?`, answer, `Break it down: ${a} x ${b} equals ${answer}.`);
}

function makeExactDivisionQuestion(level) {
  const answer = randomInt(8, 25);
  const divisor = randomInt(3, 12);
  const dividend = answer * divisor;
  return mathQuestion(level, `What is ${dividend} / ${divisor}?`, answer, `${dividend} shared into ${divisor} equal groups gives ${answer}.`);
}

function makePercentageQuestion(level) {
  const base = randomInt(8, 24) * 10;
  const percent = [10, 15, 20, 25, 30, 40, 50][Math.floor(Math.random() * 7)];
  const answer = (base * percent) / 100;
  return mathQuestion(level, `What is ${percent}% of ${base}?`, answer, `${percent}% means ${percent} out of 100, so the answer is ${answer}.`);
}

function makeAlgebraQuestion(level) {
  const x = randomInt(4, 18);
  const a = randomInt(2, 9);
  const b = randomInt(5, 25);
  const total = a * x + b;
  return mathQuestion(level, `Solve for x: ${a}x + ${b} = ${total}`, x, `Subtract ${b} to get ${a}x = ${a * x}, then divide by ${a}. x = ${x}.`);
}

function makeOrderOfOperationsQuestion(level) {
  const a = randomInt(4, 12);
  const b = randomInt(3, 10);
  const c = randomInt(2, 8);
  const d = randomInt(6, 18);
  const answer = a + b * c - d;
  return mathQuestion(level, `What is ${a} + ${b} x ${c} - ${d}?`, answer, `Multiply first: ${b} x ${c} = ${b * c}. Then ${a} + ${b * c} - ${d} = ${answer}.`);
}

function makeRatioQuestion(level) {
  const blue = randomInt(2, 6);
  const red = randomInt(3, 8);
  const multiplier = randomInt(3, 9);
  const answer = red * multiplier;
  return mathQuestion(level, `The ratio of blue to red bricks is ${blue}:${red}. If there are ${blue * multiplier} blue bricks, how many red bricks are there?`, answer, `The blue side was multiplied by ${multiplier}, so multiply the red side by ${multiplier} too: ${red} x ${multiplier} = ${answer}.`);
}

function makePercentageIncreaseQuestion(level) {
  const start = randomInt(8, 20) * 10;
  const percent = [10, 20, 25, 50][Math.floor(Math.random() * 4)];
  const answer = start + (start * percent) / 100;
  return mathQuestion(level, `A score of ${start} increases by ${percent}%. What is the new score?`, answer, `${percent}% of ${start} is ${(start * percent) / 100}. Add it to ${start} to get ${answer}.`);
}

function mathQuestion(level, text, answer, explanation) {
  const numericAnswer = Number(answer);
  return {
    id: `generated-maths-${Date.now()}-${Math.random()}`,
    category: "Maths",
    difficulty: level,
    ageRange: level === "hard" ? "12+" : level === "medium" ? "9-14" : "6-10",
    question: text,
    options: makeNumberOptions(numericAnswer),
    answer: String(numericAnswer),
    explanation,
    interestingFact: "Maths is used in coding, engineering, medicine, business, cooking, building, and game design.",
    careerLink: ["Engineer", "Software Developer", "Doctor", "Architect", "Data Analyst"],
    lifeLesson: "Careful thinking helps you solve bigger problems one step at a time.",
    points: level === "hard" ? 20 : level === "medium" ? 15 : 10
  };
}

function generateKnowledgeQuestion(category, questionIndex) {
  const bank = {
    Science: [
      ["What gas do humans need to breathe in to live?", "Oxygen", ["Oxygen", "Helium", "Smoke", "Steam"], "Oxygen helps the body release energy from food."],
      ["Which planet is known as the Red Planet?", "Mars", ["Venus", "Mars", "Jupiter", "Neptune"], "Mars looks red because of iron-rich dust on its surface."],
      ["What force pulls objects toward Earth?", "Gravity", ["Magnetism", "Gravity", "Electricity", "Friction"], "Gravity pulls objects with mass toward each other."]
    ],
    Technology: [
      ["What should you do before clicking a strange link?", "Check if it is safe", ["Share it", "Check if it is safe", "Type your password", "Ignore warnings"], "Safe internet habits protect your information."],
      ["What does AI stand for?", "Artificial Intelligence", ["Automatic Internet", "Artificial Intelligence", "Active Input", "App Installer"], "AI helps computers find patterns and make predictions."],
      ["Which one is a strong password?", "River!72Moon", ["password", "123456", "River!72Moon", "qwerty"], "Strong passwords mix words, symbols, and numbers."]
    ],
    "Life Skills": [
      ["What should you do first in an emergency?", "Stay calm and get help", ["Run anywhere", "Stay calm and get help", "Hide your phone", "Laugh"], "Staying calm helps you make safer choices."],
      ["Why is saving money useful?", "It helps prepare for future needs", ["It makes you forget maths", "It helps prepare for future needs", "It means never sharing", "It wastes time"], "Savings can help families plan and handle surprises."]
    ],
    "Moral Lessons": [
      ["You broke something by accident. What should you do?", "Tell the truth", ["Blame someone", "Hide it", "Tell the truth", "Run away"], "Honesty builds trust, even when the truth is difficult."],
      ["A friend is left out of a game. What is a kind choice?", "Invite them to join", ["Ignore them", "Invite them to join", "Laugh at them", "Take their turn"], "Kindness helps people feel valued."]
    ]
  };
  const items = bank[category] || bank.Science;
  const [question, answer, options, explanation] = items[questionIndex % items.length];
  return {
    id: `generated-${category.toLowerCase().replace(/[^a-z]/g, "-")}-${Date.now()}-${Math.random()}`,
    category,
    difficulty: "medium",
    ageRange: "8-14",
    question,
    options,
    answer,
    explanation,
    interestingFact: "Learning connects school knowledge to real family, community, and career choices.",
    careerLink: ["Teacher", "Researcher", "Leader", "Problem Solver"],
    lifeLesson: "A wise answer is useful when it helps you make a better choice.",
    points: 15
  };
}

function makeNumberOptions(answer) {
  const options = new Set([String(answer)]);
  const distance = Math.max(3, Math.round(Math.abs(answer) * 0.12));
  while (options.size < 4) {
    const offset = randomInt(-distance * 2, distance * 2);
    const option = answer + (offset || distance);
    if (option >= 0) {
      options.add(String(option));
    }
  }
  return shuffle([...options]);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(items) {
  return items
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}

if (process.env.VERCEL) {
  module.exports = app;
} else {
  server.listen(PORT, () => {
    console.log(`OK Quest is running at http://localhost:${PORT}`);
  });
}
