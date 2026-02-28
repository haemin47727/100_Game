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

// --- 1. THE ONLY JOIN FUNCTION YOU NEED ---
const startApp = async () => {
  const savedID = sessionStorage.getItem("playerAssigned");

  if (savedID !== null) {
    playerNumber = Number(savedID);
    startMultiplayer();
  } else {
    try {
      // Use a transaction to claim a seat safely
      const result = await runTransaction(playersRef, (currentData) => {
        if (currentData === null) currentData = {};
        if (!currentData.player0) {
          currentData.player0 = true;
          return currentData;
        } else if (!currentData.player1) {
          currentData.player1 = true;
          return currentData;
        } else {
          return; // Game full
        }
      });

      if (result.committed) {
        const players = result.snapshot.val();
        // Determine player number based on what exists now
        playerNumber = players.player1 && players.player0 ? 1 : 0;
        sessionStorage.setItem("playerAssigned", playerNumber.toString());

        // IF we are Player 0, we create the initial game state
        if (playerNumber === 0) {
          await set(gameRef, {
            scores: [0, 0],
            currentScore: 0,
            activePlayer: 0,
            playing: true,
          });
        }
        startMultiplayer();
      } else {
        waitingText.textContent = "Game is Full! Use Reset All.";
      }
    } catch (e) {
      console.error("Connection Error:", e);
      waitingText.textContent = "Error connecting to Firebase.";
    }
  }
};

function startMultiplayer() {
  // Cleanup on exit
  onDisconnect(ref(db, `pigGame/players/player${playerNumber}`)).remove();

  // MONITOR PLAYERS
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

  // MONITOR GAME STATE
  onValue(gameRef, (snapshot) => {
    const state = snapshot.val();

    // Auto-reload if game is reset
    if (!state && sessionStorage.getItem("playerAssigned")) {
      sessionStorage.clear();
      window.location.reload();
      return;
    }

    if (!state) return;

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
      const winner = scores[0] >= 100 ? 0 : 1;
      document
        .querySelector(`.player--${winner}`)
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

// EVENTS
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

btnNew.addEventListener("click", () => {
  set(gameRef, {
    scores: [0, 0],
    currentScore: 0,
    activePlayer: 0,
    playing: true,
    dice: null,
  });
});

btnReset.addEventListener("click", () => {
  set(ref(db, "pigGame"), null);
  sessionStorage.clear();
  window.location.reload();
});

// INITIALIZE
startApp();
