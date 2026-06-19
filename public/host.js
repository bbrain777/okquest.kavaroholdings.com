const socket = io();
let roomCode = "";

const createRoomButton = document.querySelector("#createRoomButton");
const startButton = document.querySelector("#startButton");
const revealButton = document.querySelector("#revealButton");
const nextButton = document.querySelector("#nextButton");
const endButton = document.querySelector("#endButton");

createRoomButton.addEventListener("click", () => {
  socket.emit("host:createRoom", {
    mode: document.querySelector("#mode").value,
    theme: document.querySelector("#theme").value,
    baseUrl: window.location.origin
  });
});

startButton.addEventListener("click", () => socket.emit("host:startGame", { roomCode }));
revealButton.addEventListener("click", () => socket.emit("host:revealAnswer", { roomCode }));
nextButton.addEventListener("click", () => socket.emit("host:nextQuestion", { roomCode }));
endButton.addEventListener("click", () => socket.emit("host:endGame", { roomCode }));

socket.on("host:roomCreated", (room) => {
  roomCode = room.code;
  document.querySelector("#roomPanel").classList.remove("hidden");
  document.querySelector("#roomCode").textContent = room.code;
  document.querySelector("#qrCode").src = room.qrCode;
  document.querySelector("#joinUrl").textContent = room.joinUrl;
  renderRoom(room);
});

socket.on("room:update", renderRoom);

socket.on("game:question", ({ questionNumber, question, leaderboard, teamScores }) => {
  revealButton.disabled = false;
  nextButton.disabled = true;
  endButton.disabled = false;
  document.querySelector("#questionArea").innerHTML = `
    <p class="eyebrow">Question ${questionNumber} · ${question.category}</p>
    <h2>${question.question}</h2>
    <div class="options-preview">${question.options.map((option) => `<span>${option}</span>`).join("")}</div>
  `;
  renderLeaderboard(leaderboard);
  renderTeamScores(teamScores);
});

socket.on("game:reveal", ({ question, leaderboard, teamScores }) => {
  revealButton.disabled = true;
  nextButton.disabled = false;
  document.querySelector("#questionArea").innerHTML = `
    <p class="eyebrow">Answer Reveal</p>
    <h2>${question.answer}</h2>
    <p>${question.explanation}</p>
    <p><strong>Interesting fact:</strong> ${question.interestingFact}</p>
    <p><strong>Career link:</strong> ${question.careerLink.join(", ")}</p>
    <p><strong>Life lesson:</strong> ${question.lifeLesson}</p>
  `;
  renderLeaderboard(leaderboard);
  renderTeamScores(teamScores);
});

socket.on("game:finished", ({ leaderboard, teamScores, rewards }) => {
  revealButton.disabled = true;
  nextButton.disabled = true;
  endButton.disabled = true;
  const topThree = leaderboard.slice(0, 3);
  document.querySelector("#questionArea").innerHTML = `
    <p class="eyebrow">Final Results</p>
    <h2>${topThree[0]?.avatar || "🏆"} Champion: ${topThree[0]?.nickname || "No winner yet"}</h2>
    <div class="winner-list">
      ${topThree.map((player, index) => `<p><strong>${index + 1}. ${player.nickname}</strong> - ${player.score} points - ${rewards[index]?.reward || "Family applause"}</p>`).join("")}
    </div>
  `;
  renderLeaderboard(leaderboard);
  renderTeamScores(teamScores);
});

function renderRoom(room) {
  renderPlayers(room.players || []);
  renderLeaderboard(room.leaderboard || []);
  renderTeamScores(room.teamScores || {});
  startButton.disabled = !room.players || room.players.length < 2;
}

function renderPlayers(players) {
  document.querySelector("#players").innerHTML = players.length
    ? players.map((player) => `
      <article class="player-card">
        <span class="avatar">${player.avatar}</span>
        <strong>${player.nickname}</strong>
        <small>${player.role || "Player"} · ${player.team}</small>
      </article>
    `).join("")
    : "<p>No players yet. Share the QR code or room code.</p>";
}

function renderLeaderboard(players) {
  document.querySelector("#leaderboard").innerHTML = players.map((player) => (
    `<li>${player.avatar} ${player.nickname} <strong>${player.score}</strong></li>`
  )).join("");
}

function renderTeamScores(scores) {
  document.querySelector("#teamScores").innerHTML = Object.entries(scores).map(([team, score]) => (
    `<li>${team}: <strong>${score}</strong></li>`
  )).join("");
}
