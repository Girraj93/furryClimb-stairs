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
  generateFireballs,
  getLastMultiplier,
  getMultiplier,
} from "../../utilities/helper-function.js";
import { appConfig } from "../../utilities/app-config.js";

export const gameState = {};
export let betObj = {};

export const startMatch = async (io, socket, betAmount, fireball) => {
  console.log(betAmount, fireball);
  const userId = socket.data.userInfo.userId;
  gameState[userId] = {
    level: fireball,
    stairs: [],
    bombs: {},
    alive: true,
    payout: 0,
    multiplier: 0,
    currentTime: Date.now(),
    inactivityTimer: null,
  };
  if (!betObj[userId]) {
    await handleBet(io, socket, betAmount);
  }
};

//handle bets and Debit transation---------------------------------------
export const handleBet = async (io, socket, betAmount) => {
  console.log("had,ebet", betAmount);
  const user_id = socket.data?.userInfo.user_id;
  let playerDetails = await getCache(
    `PL:${user_id}:${socket.data.userInfo.operatorId}`
  );
  if (!playerDetails) return socket.emit("error", "Invalid Player Details");
  const parsedPlayerDetails = JSON.parse(playerDetails);
  const { userId, operatorId, token, game_id, balance } = parsedPlayerDetails;
  const matchId = generateUUIDv7();
  const bet_id = `BT:${matchId}:${userId}:${operatorId}`;
  betObj[userId] = betObj[userId] || {};
  Object.assign(betObj[userId], {
    betAmount,
    bet_id,
    token,
    socket_id: parsedPlayerDetails.socketId,
    game_id,
    matchId,
  });

  if (Number(betAmount) < appConfig.minBetAmount) {
    return socket.emit("message", {
      action: "betError",
      msg: "Bet Amount cannot be less than Rs.10",
    });
  }

  if (Number(betAmount) > appConfig.maxBetAmount) {
    return socket.emit("message", {
      action: "betError",
      msg: "Bet Amount cannot be grater than Rs.5000",
    });
  }

  if (Number(betAmount) > Number(balance)) {
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
    JSON.stringify({ req: bet_id, res: "bets cancelled by upstream" });
    delete betObj[userId];
    delete gameState[userId];
    return socket.emit("error", "Bet Cancelled by Upstream Server");
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

  socket.emit("message", {
    action: "info",
    msg: {
      userId: userId,
      userName: parsedPlayerDetails.name,
      operator_id: operatorId,
      balance: Number(parsedPlayerDetails.balance).toFixed(2),
      avatarIndex: parsedPlayerDetails.image,
    },
  });
  socket.emit("message", {
    action: "bet",
    msg: "Bet placed Successfully",
  });
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
  if (row > appConfig.finalRow) {
    return socket.emit("message", {
      action: "gameError",
      msg: "Row cannot be greater than finalRow",
    });
  }

  gameState[user_id].currentTime = Date.now();
  const fireball = gameState[user_id].level;
  const multiplier = await getMultiplier(fireball, row);
  gameState[user_id].multiplier = multiplier;

  const balls = await generateFireballs(row, fireball);
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

  if (gameState[user_id].payout > appConfig.maxWinAmount) {
    gameState[user_id].payout = appConfig.maxWinAmount;
  }

  if (gameState[user_id].bombs[row].includes(Number(currentIndex))) {
    gameState[user_id].alive = false;
    gameState[user_id].payout = 0;
    const restFireBalls = await allFireBalls(fireball, row);
    console.log(restFireBalls, "fifi");

    socket.emit("message", {
      action: "gameState",
      msg: gameState[user_id],
    });
    gameState[user_id].restFireBalls = restFireBalls;
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
      restfireball: restFireBalls,
    });
  }

  if (Number(row) === appConfig.finalRow) {
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
  const settlements = [];
  const userBetData = betObj[user_id];
  if (!userBetData) {
    return io.to(parsedPlayerDetails.socketId).emit("message", {
      action: "betError",
      msg: "no bet data found",
    });
  }
  let final_amount = gameState[user_id].payout;
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

    await insertMatchRound({
      user_id,
      operator_id: socket.data?.userInfo.operatorId,
      matchId: betObj[user_id].matchId,
      gameData: gameState[user_id],
      isWinner: true,
    });

    delete betObj[user_id];
    delete gameState[user_id];

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
  }
};
