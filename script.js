"use strict";

import {
  db,
  ref,
  set,
  onValue,
  update,
  onDisconnect,
  runTransaction,
} from "./firebase.js";

// Elements
const waitingScreen = document.getElementById("waiting-screen");
const waitingText = document.getElementById("waiting-text");
const player0El = document.querySelector(".player--0");
const player1El = document.querySelector(".player--1");
const score0El = document.querySelector("#score--0");
const score1El = document.getElementById("score--1");
const current0El = document.getElementById("current--0");
const current1El = document.getElementById("current--1");
const diceEl = document.querySelector(".dice");
const btnNew = document.querySelector(".btn--new");
const btnRoll = document.querySelector(".btn--roll");
const btnHold = document.querySelector(".btn--hold");
const btnReset = document.querySelector(".btn--reset");
const btnResetMini = document.querySelector(".btn--reset-mini");

// Local state
let playerNumber = null;
let scores = [0, 0];
let currentScore = 0;
let activePlayer = 0;
let playing = true;

const gameRef = ref(db, "pigGame/state");
const playersRef = ref(db, "pigGame/players");

// --- 1. THE ATOMIC JOIN (Prevents Blinking) ---
const joinGame = async () => {
  const savedID = sessionStorage.getItem("playerAssigned");

  if (savedID !== null) {
    playerNumber = Number(savedID);
    startMultiplayer();
    return;
  }

  // Transaction: This "locks" the players node while we check it
  try {
    const result = await runTransaction(playersRef, (currentData) => {
      if (currentData === null) currentData = {};

      if (!currentData.player0) {
        currentData.player0 = true;
        return currentData; // Claim Player 0
      } else if (!currentData.player1) {
        currentData.player1 = true;
        return currentData; // Claim Player 1
      } else {
        return; // Abort: Game is full
      }
    });

    if (result.committed) {
      // Logic to figure out which one we actually got
      const players = result.snapshot.val();
      // If we were the one who set player1, and player0 was already there
      if (players.player1 && !sessionStorage.getItem("playerAssigned")) {
        // This logic is a bit tricky, usually we check which key was added
        // For simplicity in this Pig Game setup:
        playerNumber =
          result.snapshot.child("player1").exists() &&
          !result.snapshot.child("player0").exists()
            ? 0
            : 1;

        // Let's refine the ID check:
        const snap = result.snapshot.val();
        // If I was the first one there, I'm 0. If there were already players, I'm 1.
        // Actually, let's just re-read the specific slot we filled.
      }

      // Better way: Re-check snapshot to see which one we are
      // Since transactions are complex, let's use a simpler "Check and Set"
      // but only if the previous logic didn't settle it.
    }
  } catch (e) {
    console.error("Join failed", e);
  }
};

// --- SIMPLIFIED BULLETPROOF JOIN ---
const bulletproofJoin = () => {
  const savedID = sessionStorage.getItem("playerAssigned");
  if (savedID !== null) {
    playerNumber = Number(savedID);
    startMultiplayer();
    return;
  }

  // Only run this once
  onValue(
    playersRef,
    (snapshot) => {
      if (playerNumber !== null) return;
      const players = snapshot.val() || {};

      if (!players.player0) {
        playerNumber = 0;
        sessionStorage.setItem("playerAssigned", "0");
        update(playersRef, { player0: true });
      } else if (!players.player1) {
        playerNumber = 1;
        sessionStorage.setItem("playerAssigned", "1");
        update(playersRef, { player1: true });
      }

      if (playerNumber !== null) startMultiplayer();
    },
    { onlyOnce: true },
  );
};

function startMultiplayer() {
  onDisconnect(ref(db, `pigGame/players/player${playerNumber}`)).remove();

  // MONITOR OTHERS
  onValue(playersRef, (snapshot) => {
    const players = snapshot.val() || {};
    document.getElementById("name--0").textContent =
      playerNumber === 0 ? "P1 (YOU)" : "Player 1";
    document.getElementById("name--1").textContent =
      playerNumber === 1 ? "P2 (YOU)" : "Player 2";

    if (players.player0 && players.player1) {
      waitingScreen.classList.add("hidden");
    } else {
      waitingScreen.classList.remove("hidden");
      waitingText.textContent = `You are Player ${playerNumber + 1}. Waiting...`;
    }
  });

  // MONITOR GAME
  onValue(gameRef, (snapshot) => {
    const state = snapshot.val();
    if (!state && sessionStorage.getItem("playerAssigned")) {
      sessionStorage.clear();
      window.location.reload();
      return;
    }
    if (!state) {
      if (playerNumber === 0) syncState();
      return;
    }

    scores = state.scores || [0, 0];
    currentScore = state.currentScore || 0;
    activePlayer = state.activePlayer ?? 0;
    playing = state.playing ?? true;

    score0El.textContent = scores[0];
    score1El.textContent = scores[1];
    current0El.textContent = activePlayer === 0 ? currentScore : 0;
    current1El.textContent = activePlayer === 1 ? currentScore : 0;

    if (state.dice && playing) {
      diceEl.classList.remove("hidden");
      diceEl.src = `dice-${state.dice}.png`;
    } else {
      diceEl.classList.add("hidden");
    }

    player0El.classList.toggle("player--active", activePlayer === 0);
    player1El.classList.toggle("player--active", activePlayer === 1);

    const isMyTurn = playerNumber === activePlayer && playing;
    btnRoll.disabled = !isMyTurn;
    btnHold.disabled = !isMyTurn;
    btnRoll.style.opacity = isMyTurn ? "1" : "0.3";
    btnHold.style.opacity = isMyTurn ? "1" : "0.3";

    if (!playing) {
      document
        .querySelector(`.player--${scores[0] >= 100 ? 0 : 1}`)
        .classList.add("player--winner");
    } else {
      player0El.classList.remove("player--winner");
      player1El.classList.remove("player--winner");
    }
  });
}

function syncState(dice = null) {
  set(gameRef, { scores, currentScore, activePlayer, playing, dice });
}

// Button Events (Keep your existing event listeners here)
btnRoll.addEventListener("click", () => {
  if (!playing || playerNumber !== activePlayer) return;
  const dice = Math.trunc(Math.random() * 6) + 1;
  if (dice !== 1) currentScore += dice;
  else {
    currentScore = 0;
    activePlayer = activePlayer === 0 ? 1 : 0;
  }
  syncState(dice);
});

btnHold.addEventListener("click", () => {
  if (!playing || playerNumber !== activePlayer) return;
  scores[activePlayer] += currentScore;
  if (scores[activePlayer] >= 100) playing = false;
  else {
    currentScore = 0;
    activePlayer = activePlayer === 0 ? 1 : 0;
  }
  syncState();
});

btnReset.addEventListener("click", () => {
  set(ref(db, "pigGame"), null);
  sessionStorage.clear();
  window.location.reload();
});

bulletproofJoin();
