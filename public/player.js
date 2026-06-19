const socket = io();
const roomCode = sessionStorage.getItem("okQuestRoomCode");
const player = JSON.parse(sessionStorage.getItem("okQuestPlayer") || "{}");
const controller = document.querySelector("#controller");
const result = document.querySelector("#result");

document.querySelector("#welcome").textContent = `${player.avatar || "⭐"} ${player.nickname || "Player"}`;

if (!roomCode) {
  controller.innerHTML = '<p>Please join a room first.</p><a class="button primary" href="/join.html">Join Game</a>';
}

socket.on("connect", () => {
  if (roomCode && player.id) {
    socket.emit("player:rejoin", { roomCode, playerId: player.id });
  }
});

socket.on("player:rejoined", ({ player: updatedPlayer }) => {
  sessionStorage.setItem("okQuestPlayer", JSON.stringify(updatedPlayer));
});

socket.on("game:question", ({ question }) => {
  result.textContent = "";
  controller.classList.remove("empty");
  controller.innerHTML = `
    <p class="eyebrow">${question.category}</p>
    <h2>${question.question}</h2>
    <div class="answer-buttons">
      ${question.options.map((option) => `<button class="button answer" data-answer="${option}">${option}</button>`).join("")}
    </div>
  `;

  document.querySelectorAll(".answer").forEach((button) => {
    button.addEventListener("click", () => {
      socket.emit("player:answer", { roomCode, answer: button.dataset.answer });
      document.querySelectorAll(".answer").forEach((item) => {
        item.disabled = true;
      });
    });
  });
});

socket.on("player:answerResult", ({ correct, points }) => {
  result.textContent = correct ? `Correct! You earned ${points} points.` : "Good try. Wait for the explanation.";
});

socket.on("game:reveal", ({ question }) => {
  controller.innerHTML = `
    <p class="eyebrow">Lesson Time</p>
    <h2>${question.answer}</h2>
    <p>${question.explanation}</p>
    <p><strong>Fact:</strong> ${question.interestingFact}</p>
    <p><strong>Life lesson:</strong> ${question.lifeLesson}</p>
  `;
});

socket.on("game:finished", ({ leaderboard }) => {
  const position = leaderboard.findIndex((item) => item.fullName === player.fullName) + 1;
  controller.innerHTML = `
    <p class="eyebrow">Quest Complete</p>
    <h2>You finished in position ${position || "?"}</h2>
    <p>Look at the TV for winners, rewards, and badges.</p>
  `;
});
