"use strict";

import { db, ref, set, onValue, update } from "./firebase.js";

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

// --- 1. ROBUST PLAYER ASSIGNMENT ---
onValue(playersRef, (snapshot) => {
  const players = snapshot.val() || {};
  
  // Force grab from session storage to ensure we don't lose our identity
  const savedID = sessionStorage.getItem("playerAssigned");

  if (savedID === null) {
    if (!players.player0) {
      update(playersRef, { player0: true });
      playerNumber = 0;
      sessionStorage.setItem("playerAssigned", "0");
    } else if (!players.player1) {
      update(playersRef, { player1: true });
      playerNumber = 1;
      sessionStorage.setItem("playerAssigned", "1");
    }
  } else {
    playerNumber = Number(savedID);
  }

  // UI labels - this confirms who YOU are
  document.getElementById("name--0").textContent = playerNumber === 0 ? "P1 (YOU)" : "Player 1";
  document.getElementById("name--1").textContent = playerNumber === 1 ? "P2 (YOU)" : "Player 2";

  if (players.player0 && players.player1) {
    waitingScreen.classList.add("hidden");
  } else {
    waitingScreen.classList.remove("hidden");
  }
});

// --- 2. THE SYNC & TURN LOCK FIX ---
onValue(gameRef, (snapshot) => {
  const state = snapshot.val();
  if (!state) {
    if (playerNumber === 0) syncState();
    return;
  }

  scores = state.scores || [0, 0];
  currentScore = state.currentScore || 0;
  activePlayer = state.activePlayer;
  playing = state.playing;

  // Update UI
  score0El.textContent = scores[0];
  score1El.textContent = scores[1];
  current0El.textContent = activePlayer === 0 ? currentScore : 0;
  current1El.textContent = activePlayer === 1 ? currentScore : 0;

  // Dice
  if (state.dice && playing) {
    diceEl.classList.remove("hidden");
    diceEl.src = `dice-${state.dice}.png`;
    diceOne.classList.toggle("hidden", state.dice !== 1);
  } else {
    diceEl.classList.add("hidden");
  }

  // Active Player Background
  player0El.classList.toggle("player--active", activePlayer === 0);
  player1El.classList.toggle("player--active", activePlayer === 1);

  // --- THE CRITICAL TURN LOCK FIX ---
  // We explicitly check:
