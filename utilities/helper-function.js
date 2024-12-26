import { parse } from "dotenv";
import { createLogger } from "./logger.js";
import { appConfig } from "./app-config.js";

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

export function getMultiplier(fireballNumber, betIndex) {
  if (fireballNumber < 1 || fireballNumber > fireballMatrix.length) {
    socket.emit(
      "error",
      "Invalid fireball number. It must be between 1 and 13"
    );
  }
  const row = fireballMatrix[fireballNumber - 1];
  if (betIndex < 0 || betIndex >= row.length) {
    socket.emit("error", "Invalid bet index. It must be between 0 and 20.");
  }
  return row[betIndex];
}

// export function allFireBalls(firstIndex, lastIndex, fireball, currentRow) {
//   firstIndex = Number(firstIndex);
//   lastIndex = Number(lastIndex);
//   fireball = Number(fireball);
//   currentRow = Number(currentRow);
//   totalRows = appConfig.totalRows;

//   if (fireball > lastIndex - firstIndex + 1) {
//     throw new Error("Fireball count exceeds the available range.");
//   }

//   const fireballsByRow = {};

//   for (let row = currentRow + 1; row <= totalRows; row++) {
//     const totalFireballs = new Set();
//     while (totalFireballs.size < fireball) {
//       const randomIndex =
//         Math.floor(Math.random() * (lastIndex - firstIndex + 1)) + firstIndex;
//       totalFireballs.add(randomIndex);
//     }
//     fireballsByRow[row] = Array.from(totalFireballs);
//   }

//   return fireballsByRow;
// }

export function allFireBalls(fireball, currentRow) {
  let firstIndex = 0;
  let lastIndex = 19;
  fireball = Number(fireball);
  currentRow = Number(currentRow);
  const totalRows = appConfig.totalRows;

  if (fireball > lastIndex - firstIndex + 1) {
    throw new Error("Fireball count exceeds the available range.");
  }

  const fireballsByRow = {};

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

export const hiddenColumnsPerRow = [
  [],
  [0],
  [19],
  [17, 18, 19],
  [0],
  [0, 1, 2, 18, 19],
  [17, 18, 19],
  [13, 14, 15, 16, 17, 18, 19],
  [12, 13, 14, 15, 16, 17, 18, 19],
  [0],
  [0, 1, 2, 3, 14, 15, 16, 17, 18, 19],
  [0, 1, 2, 3, 4, 14, 15, 16, 17, 18, 19],
  [0, 1, 2, 3, 4, 13, 14, 15, 16, 17, 18, 19],
];

export const multipliers = {
  1: [
    1.02, 1.08, 1.14, 1.21, 1.29, 1.39, 1.49, 1.62, 1.76, 1.94, 2.16, 2.42,
    2.77,
  ],
  2: [
    1.08, 1.2, 1.36, 1.54, 1.76, 2.03, 2.36, 2.8, 3.35, 4.1, 5.13, 6.58, 8.76,
  ],
  3: [
    1.14, 1.36, 1.63, 1.97, 2.43, 3.03, 3.86, 5.03, 6.7, 9.21, 13.16, 19.77,
    31.71,
  ],
  4: [
    1.21, 1.53, 1.97, 2.58, 3.44, 4.69, 6.57, 9.46, 14.25, 22.37, 37.33, 67.06,
    134.85,
  ],
  5: [
    1.29, 1.76, 2.43, 3.44, 5.02, 7.51, 11.66, 18.97, 32.64, 59.91, 120.15,
    271.03, 717.27,
  ],
};

export function getLastMultiplier(fireball) {
  fireball = Number(fireball);
  const selectedMultipliers = multipliers[fireball];
  if (!selectedMultipliers) {
    throw new Error(`Invalid fireball level: ${fireball}`);
  }
  return selectedMultipliers[selectedMultipliers.length - 1];
}

// export function generateFireballs(firstIndex, lastIndex, fireball) {
//   firstIndex = Number(firstIndex);
//   lastIndex = Number(lastIndex);
//   fireball = Number(fireball);
//   if (fireball > lastIndex - firstIndex + 1) {
//     throw new Error("Fireball count exceeds the available range.");
//   }

//   const totalFireballs = new Set();
//   while (totalFireballs.size < fireball) {
//     const randomIndex =
//       Math.floor(Math.random() * (lastIndex - firstIndex + 1)) + firstIndex;
//     totalFireballs.add(randomIndex); // Ensures no duplicates
//   }

//   return Array.from(totalFireballs);
// }

export function generateFireballs(currentRow, fireball) {
  const firstIndex = 0;
  const lastIndex = 19;
  currentRow = Number(currentRow);
  fireball = Number(fireball);

  if (fireball > lastIndex - firstIndex + 1) {
    throw new Error("Fireball count exceeds the available range.");
  }

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
