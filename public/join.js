const socket = io();
const params = new URLSearchParams(window.location.search);
const roomInput = document.querySelector("#roomCode");
const message = document.querySelector("#message");

roomInput.value = params.get("room") || "";

document.querySelector("#joinForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const profile = {
    fullName: value("#fullName"),
    nickname: value("#nickname"),
    age: value("#age"),
    role: value("#role"),
    team: value("#team"),
    favouriteSubject: value("#favouriteSubject"),
    difficulty: value("#difficulty"),
    avatar: value("#avatar")
  };

  socket.emit("player:join", {
    roomCode: roomInput.value,
    profile
  });
});

socket.on("player:joined", ({ roomCode, player }) => {
  sessionStorage.setItem("okQuestRoomCode", roomCode);
  sessionStorage.setItem("okQuestPlayer", JSON.stringify(player));
  window.location.href = "/player.html";
});

socket.on("player:error", (text) => {
  message.textContent = text;
});

function value(selector) {
  return document.querySelector(selector).value.trim();
}
