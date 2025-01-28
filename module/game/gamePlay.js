import {
  deleteCache,
  getCache,
  setCache,
} from "../../utilities/redis-connection.js";
import {
  generateUUIDv7,
  postDataToSourceForBet,
  prepareDataForWebhook,
} from "../../utilities/common-function.js";
import { addSettleBet, insertBets, insertMatchRound } from "../bet/bet-db.js";
import { sendToQueue } from "../../utilities/amqp.js";
import {
  allFireBalls,
  getMultiplier,
  logEventAndEmitResponse,
} from "../../utilities/helper-function.js";
import { appConfig } from "../../utilities/app-config.js";
import { createLogger } from "../../utilities/logger.js";
const betLogger = createLogger("Bets", "jsonl");
const cashoutLogger = createLogger("Cashout", "jsonl");
const failedBetLogger = createLogger("failedBets", "jsonl");

export const gameState = {};
export let betObj = {};
export let fireBallObj = {};

export const startMatch = async (io, socket, betAmount, fireball) => {
  const userId = socket.data.userInfo.userId;
  if (!betObj[userId]) {
    await handleBet(io, socket, betAmount, fireball);
  }
};

//handle bets and Debit transation---------------------------------------
export const handleBet = async (io, socket, betAmount, fireball) => {
  const user_id = socket.data?.userInfo.user_id;
  let playerDetails = await getCache(
    `PL:${user_id}:${socket.data.userInfo.operatorId}`
  );
  if (!playerDetails) return socket.emit("error", "Invalid Player Details");
  const parsedPlayerDetails = JSON.parse(playerDetails);
  const { userId, operatorId, token, game_id, balance } = parsedPlayerDetails;
  const matchId = generateUUIDv7();
  const bet_id = `BT:${matchId}:${userId}:${operatorId}`;
  const gameLog = { logId: generateUUIDv7(), player: playerDetails };
  betObj[userId] = betObj[userId] || {};
  Object.assign(betObj[userId], {
    betAmount,
    bet_id,
    token,
    socket_id: parsedPlayerDetails.socketId,
    game_id,
    matchId,
  });
  console.log(
    parsedPlayerDetails.socketId,
    user_id,
    "socketid and userid in henadle bet"
  );
  gameLog.betObj = betObj[user_id];

  if (Number(betAmount) < appConfig.minBetAmount) {
    logEventAndEmitResponse(gameLog, "Invalid Bet", "bet", socket);
    return socket.emit("message", {
      action: "betError",
      msg: "Bet Amount cannot be less than Rs.10",
    });
  }

  if (Number(betAmount) > appConfig.maxBetAmount) {
    logEventAndEmitResponse(gameLog, "Invalid Bet", "bet", socket);
    return socket.emit("message", {
      action: "betError",
      msg: "Bet Amount cannot be grater than Rs.5000",
    });
  }

  if (Number(betAmount) > Number(balance)) {
    logEventAndEmitResponse(gameLog, "Invalid Bet", "bet", socket);
    return socket.emit("message", {
      action: "betError",
      msg: `insufficient balance`,
    });
  }
  const webhookData = await prepareDataForWebhook(
    {
      matchId,
      betAmount: betAmount,
      game_id,
      user_id: userId,
      bet_id,
    },
    "DEBIT",
    socket
  );
  betObj[userId].txn_id = webhookData.txn_id;
  try {
    await postDataToSourceForBet({
      webhookData,
      token,
      socketId: socket.id,
    });
  } catch (err) {
    failedBetLogger.error(
      JSON.stringify({ req: bet_id, res: "bets cancelled by upstream" })
    );
    logEventAndEmitResponse(gameLog, "Upstream Cancelled", "bet", socket);
    delete betObj[userId];
    delete gameState[userId];
    return io.to(parsedPlayerDetails.socketId).emit("message", {
      action: "betFailError",
      msg: "Bet cancelled by upstream",
    });
  }
  await insertBets({
    bet_id,
    user_id,
    operator_id: operatorId,
    matchId,
    betAmount,
  });
  parsedPlayerDetails.balance = Number(balance - Number(betAmount)).toFixed(2);
  await setCache(
    `PL:${userId}:${operatorId}`,
    JSON.stringify(parsedPlayerDetails)
  );

  console.log(
    user_id,
    parsedPlayerDetails.socketId,
    "userid and socket id in hadnle bet"
  );

  io.to(parsedPlayerDetails.socketId).emit("message", {
    action: "info",
    msg: {
      userId: userId,
      userName: parsedPlayerDetails.name,
      operator_id: operatorId,
      balance: Number(parsedPlayerDetails.balance).toFixed(2),
      avatarIndex: parsedPlayerDetails.image,
    },
  });
  betLogger.info(JSON.stringify({ ...gameLog }));

  io.to(parsedPlayerDetails.socketId).emit("message", {
    action: "bet",
    msg: "Bet placed Successfully",
  });

  gameState[user_id] = {
    level: fireball,
    stairs: [],
    bombs: {},
    alive: true,
    payout: 0,
    multiplier: 0,
  };
};

export const gamePlay = async (io, socket, currentIndex, row) => {
  const user_id = socket.data?.userInfo.user_id;
  if (!gameState[user_id]) {
    return socket.emit("message", {
      action: "gameError",
      msg: "User not found in game state",
    });
  }
  if (!row) {
    return socket.emit("message", {
      action: "gameError",
      msg: "Undefined Row",
    });
  }
  if (Number(row) > Number(appConfig.finalRow)) {
    return socket.emit("message", {
      action: "gameError",
      msg: "Row cannot be greater than finalRow",
    });
  }
  //condition for last row
  if (
    Number(row) <=
    gameState[user_id]?.stairs?.[gameState[user_id].stairs.length - 1]?.row
  ) {
    return socket.emit("message", {
      action: "gameError",
      msg: "Current row cannot equal or less than last row",
    });
  }

  const fireball = gameState[user_id].level;
  const multiplier = await getMultiplier(fireball, row);
  gameState[user_id].multiplier = multiplier;

  if (Number(row) == Number(appConfig.firstIndex)) {
    console.log("enter");
    const allBombs = await allFireBalls(fireball, row);
    fireBallObj[user_id] = allBombs;
    console.log(user_id, fireBallObj[user_id], "fireballj");
  }

  const balls = fireBallObj[user_id][row];
  if (!gameState[user_id].bombs) {
    gameState[user_id].bombs = {};
  }
  if (!gameState[user_id].bombs[row]) {
    gameState[user_id].bombs[row] = [];
  }
  gameState[user_id].bombs[row].push(...balls);

  gameState[user_id].stairs.push({
    row: Number(row),
    index: Number(currentIndex),
  });

  gameState[user_id].payout = (
    Number(betObj[user_id]?.betAmount) * Number(multiplier)
  ).toFixed(2);

  if (gameState[user_id].bombs[row].includes(Number(currentIndex))) {
    gameState[user_id].alive = false;
    gameState[user_id].payout = 0;
    gameState[user_id].bombs = fireBallObj[user_id];

    socket.emit("message", {
      action: "gameState",
      msg: gameState[user_id],
    });

    await insertMatchRound({
      user_id,
      operator_id: socket.data?.userInfo.operatorId,
      matchId: betObj[user_id].matchId,
      gameData: gameState[user_id],
      isWinner: false,
    });

    delete gameState[user_id];
    delete betObj[user_id];
    return socket.emit("message", {
      action: "gameOver",
      msg: "You lose! You hit a fireball!",
    });
  }

  if (Number(row) === Number(appConfig.finalRow)) {
    // let multiplier = getLastMultiplier(fireball);
    socket.emit("message", {
      action: "gameState",
      msg: gameState[user_id],
    });
    await cashout(io, socket);
    return;
  }

  socket.emit("message", {
    action: "gameState",
    msg: gameState[user_id],
  });
};

export const cashout = async (io, socket) => {
  const user_id = socket.data?.userInfo.user_id;
  let playerDetails = await getCache(
    `PL:${user_id}:${socket.data.userInfo.operatorId}`
  );
  if (!playerDetails)
    return socket.emit("message", {
      action: "cashoutError",
      msg: "Invalid player details",
    });
  const parsedPlayerDetails = JSON.parse(playerDetails);
  const multiplier = gameState[user_id]?.multiplier;
  console.log(
    user_id,
    parsedPlayerDetails.socketId,
    "userid and socket id in cashout"
  );
  const settlements = [];
  const userBetData = betObj[user_id];
  if (!userBetData) {
    return io.to(parsedPlayerDetails.socketId).emit("message", {
      action: "cashoutError",
      msg: "no bet data found",
    });
  }
  let final_amount = gameState[user_id].payout;

  if (Number(final_amount) > appConfig.maxWinAmount) {
    final_amount = appConfig.maxWinAmount;
  }

  const webhookData = await prepareDataForWebhook(
    {
      user_id,
      final_amount,
      game_id: userBetData.game_id,
      txnId: userBetData.txn_id,
      matchId: userBetData.matchId,
    },
    "CREDIT",
    socket
  );
  await sendToQueue(
    "",
    "games_cashout",
    JSON.stringify({
      ...webhookData,
      operatorId: parsedPlayerDetails.operatorId,
      token: userBetData.token,
    })
  );
  settlements.push({
    bet_id: userBetData.bet_id,
    totalBetAmount: userBetData.betAmount,
    winAmount: final_amount,
    multiplier: multiplier,
  });

  const cachedPlayerDetails = await getCache(
    `PL:${user_id}:${socket.data.userInfo.operatorId}`
  );
  if (cachedPlayerDetails) {
    const parsedPlayerDetails = JSON.parse(cachedPlayerDetails);
    console.log(parsedPlayerDetails.balance, "before update");
    parsedPlayerDetails.balance = Number(
      Number(parsedPlayerDetails.balance) + Number(final_amount)
    ).toFixed(2);
    console.log(parsedPlayerDetails.balance, "after update");
    await setCache(
      `PL:${user_id}:${socket.data.userInfo.operatorId}`,
      JSON.stringify(parsedPlayerDetails)
    );
    // const fireball = gameState[user_id].level;
    // const stair = gameState[user_id].stairs;

    // if (gameState[user_id].stairs[stair.length - 1].row < appConfig.finalRow) {
    //   const row = gameState[user_id].stairs[stair.length - 1].row;
    //   const restFireBalls = await allFireBalls(fireball, row);
    //   gameState[user_id].restFireBalls = restFireBalls;
    // }

    gameState[user_id].bombs = fireBallObj[user_id];

    await insertMatchRound({
      user_id,
      operator_id: socket.data?.userInfo.operatorId,
      matchId: betObj[user_id].matchId,
      gameData: gameState[user_id],
      isWinner: true,
    });
    console.log(
      user_id,
      parsedPlayerDetails.socketId,
      "userid and socket id in cashout"
    );

    io.to(parsedPlayerDetails.socketId).emit("message", {
      action: "info",
      msg: {
        userId: user_id,
        userName: parsedPlayerDetails.name,
        operator_id: parsedPlayerDetails.operatorId,
        balance: parsedPlayerDetails.balance,
        avatarIndex: parsedPlayerDetails.image,
      },
    });

    io.to(parsedPlayerDetails.socketId).emit("message", {
      action: "wins",
      msg: { final_amount, multiplier },
    });
    await addSettleBet(settlements);

    delete betObj[user_id];
    delete gameState[user_id];
  }
};

export const disconnection = async (io, socket) => {
  console.log("cashout on disconnect");
  socket.emit("message", {
    action: "disconnection",
    msg: "player disconnected",
  });
  await cashout(io, socket);
};
