"use strict";

import { db, ref, set, onValue, update, onDisconnect } from "./firebase.js";

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
const diceOne = document.querySelector(".one");

// Local state
let playerNumber = null; 
let scores = [0, 0];
let currentScore = 0;
let activePlayer = 0;
let playing = true;

const gameRef = ref(db, "pigGame/state");
const playersRef = ref(db, "pigGame/players");

// --- 1. THE SYNC & AUTO-REFRESH LOGIC ---
// This listens for the game state. If it vanishes, the other player reset the game.
onValue(gameRef, (snapshot) => {
  const state = snapshot.val();
  
  // If state is null but we have a player ID, someone clicked "Reset All"
  if (!state && sessionStorage.getItem("playerAssigned") !== null) {
    console.log("Game state cleared. Re-syncing session...");
    sessionStorage.removeItem("playerAssigned");
    window.location.reload();
    return;
  }

  if (!state) {
    if (playerNumber === 0) syncState();
    return;
  }

  // Update Local Variables
  scores = state.scores || [0, 0];
  currentScore = state.currentScore || 0;
  activePlayer = state.activePlayer ?? 0;
  playing = state.playing ?? true;

  // Update UI Scores
  score0El.textContent = scores[0];
  score1El.textContent = scores[1];
  current0El.textContent = activePlayer === 0 ? currentScore : 0;
  current1El.textContent = activePlayer === 1 ? currentScore : 0;

  // Dice Logic
  if (state.dice && playing) {
    diceEl.classList.remove("hidden");
    diceEl.src = `dice-${state.dice}.png`;
    diceOne.classList.toggle("hidden", state.dice !== 1);
  } else {
    diceEl.classList.add("hidden");
    diceOne.classList.add("hidden");
  }

  // Active Player Styling
  player0El.classList.toggle("player--active", activePlayer === 0);
  player1El.classList.toggle("player--active", activePlayer === 1);

  // TURN ENFORCEMENT
  const isMyTurn = (playerNumber === activePlayer) && playing;
  btnRoll.disabled = !isMyTurn;
  btnHold.disabled = !isMyTurn;
  btnRoll.style.opacity = isMyTurn ? "1" : "0.3";
  btnHold.style.opacity = isMyTurn ? "1" : "0.3";

  if (!playing) {
    const winner = scores[0] >= 100 ? 0 : 1;
    document.querySelector(`.player--${winner}`).classList.add("player--winner");
  } else {
    player0El.classList.remove("player--winner");
    player1El.classList.remove("player--winner");
  }
});

// --- 2. PLAYER ASSIGNMENT & PRESENCE ---
onValue(playersRef, (snapshot) => {
  const players = snapshot
