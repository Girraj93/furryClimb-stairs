import { parse } from "dotenv";
import { createLogger } from "./logger.js";
import { appConfig } from "./app-config.js";
import { read } from "./db-connection.js";

const failedBetLogger = createLogger("failedBets", "jsonl");
const failedPartialCashoutLogger = createLogger(
  "failedPartialCashout",
  "jsonl"
);
const failedCashoutLogger = createLogger("failedCashout", "jsonl");
const failedGameLogger = createLogger("failedGame", "jsonl");
export const logEventAndEmitResponse = (req, res, event, socket) => {
  let logData = JSON.stringify({ req, res });
  if (event === "bet") {
    failedBetLogger.error(logData);
  }
  if (event === "game") {
    failedGameLogger.error(logData);
  }
  if (event === "cashout") {
    failedCashoutLogger.error(logData);
  }
  if (event === "partialCashout") {
    failedPartialCashoutLogger.error(logData);
  }
  return socket.emit("betError", res);
};

export async function allFireBalls(fireball, currentRow) {
  let firstIndex = appConfig.firstIndex;
  let lastIndex = appConfig.lastIndex;
  fireball = Number(fireball);
  currentRow = Number(currentRow);
  const totalRows = appConfig.finalRow;

  if (fireball > lastIndex - firstIndex + 1) {
    throw new Error("Fireball count exceeds the available range.");
  }

  const fireballsByRow = {};
  let hiddenColumnsPerRow = await hiddenTiles();

  for (let row = currentRow + 1; row <= totalRows; row++) {
    const hiddenColumns = new Set(hiddenColumnsPerRow[row] || []);
    const validColumns = [];

    for (let col = firstIndex; col <= lastIndex; col++) {
      if (!hiddenColumns.has(col)) {
        validColumns.push(col);
      }
    }

    if (fireball > validColumns.length) {
      throw new Error(
        `Fireball count exceeds the available valid columns for row ${row}.`
      );
    }

    // Generate fireballs for this row
    const totalFireballs = new Set();
    while (totalFireballs.size < fireball) {
      const randomIndex =
        validColumns[Math.floor(Math.random() * validColumns.length)];
      totalFireballs.add(randomIndex);
    }

    fireballsByRow[row] = Array.from(totalFireballs);
  }

  return fireballsByRow;
}

export function getLastMultiplier(fireball) {
  fireball = Number(fireball);
  const selectedMultipliers = multipliers[fireball];
  if (!selectedMultipliers) {
    throw new Error(`Invalid fireball level: ${fireball}`);
  }
  return selectedMultipliers[selectedMultipliers.length - 1];
}

export async function generateFireballs(currentRow, fireball) {
  const firstIndex = appConfig.firstIndex;
  const lastIndex = appConfig.lastIndex;
  currentRow = Number(currentRow);
  fireball = Number(fireball);

  if (fireball > lastIndex - firstIndex + 1) {
    throw new Error("Fireball count exceeds the available range.");
  }
  let hiddenColumnsPerRow = await hiddenTiles();
  const hiddenColumns = hiddenColumnsPerRow[currentRow] || [];

  const validColumns = [];
  for (let i = firstIndex; i <= lastIndex; i++) {
    if (!hiddenColumns.includes(i)) {
      validColumns.push(i);
    }
  }

  if (fireball > validColumns.length) {
    throw new Error("Not enough valid columns to generate fireballs.");
  }

  const totalFireballs = new Set();
  while (totalFireballs.size < fireball) {
    const randomIndex = Math.floor(Math.random() * validColumns.length);
    totalFireballs.add(validColumns[randomIndex]);
  }
  return Array.from(totalFireballs);
}

export const getMultiplier = async (fireball, row) => {
  row = Number(row);
  const multipliers = await gameData();
  let multiplier = multipliers[fireball];
  multiplier = multiplier[row];
  return multiplier;
};
export const gameData = async () => {
  try {
    const result = await read(`SELECT multipliers FROM game_templates`);
    if (result.length > 0) {
      const { multipliers } = result[0];
      // const fixedmultipliers = multipliers
      //   .replace(/([{,])\s*(\d+)\s*:/g, '$1"$2":')
      //   .replace(/,(\s*[\]}])/g, "$1");
      const parsedData = multipliers;
      return parsedData;
    }
    return {};
  } catch (error) {
    console.error("Error fetching game data:", error);
    throw error;
  }
};

export const hiddenTiles = async () => {
  try {
    const result = await read(`SELECT hidden_tiles FROM game_templates`);
    if (result.length > 0) {
      const { hidden_tiles } = result[0];
      const parsedData = hidden_tiles;
      return parsedData;
    }
    return {};
  } catch (error) {
    console.error("Error fetching game data:", error);
    throw error;
  }
};
