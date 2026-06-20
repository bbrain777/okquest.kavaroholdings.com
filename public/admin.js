const form = document.querySelector("#rewardsForm");
const message = document.querySelector("#adminMessage");
const inputs = [
  document.querySelector("#reward1"),
  document.querySelector("#reward2"),
  document.querySelector("#reward3")
];

loadRewards();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const rewards = inputs.map((input, index) => ({
    position: index + 1,
    reward: input.value.trim()
  }));

  const response = await fetch("/api/rewards", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ rewards })
  });

  if (!response.ok) {
    message.textContent = "Could not save prizes. Please try again.";
    return;
  }

  const result = await response.json();
  fillRewards(result.rewards);
  message.textContent = "Prizes saved. The host screen will use these rewards.";
});

async function loadRewards() {
  try {
    const response = await fetch("/api/rewards");
    const rewards = await response.json();
    fillRewards(rewards);
  } catch {
    message.textContent = "Could not load saved prizes.";
  }
}

function fillRewards(rewards) {
  rewards.slice(0, 3).forEach((reward, index) => {
    inputs[index].value = reward.reward;
  });
}
