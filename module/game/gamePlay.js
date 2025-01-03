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
import { addSettleBet, insertBets, insertMatchData } from "../bet/bet-db.js";
import { sendToQueue } from "../../utilities/amqp.js";
import {
  allFireBalls,
  generateFireballs,
  getLastMultiplier,
  getMultiplier,
  multipliers,
} from "../../utilities/helper-function.js";
import { appConfig } from "../../utilities/app-config.js";

const gameState = {};
let betObj = {};

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
  };

  await handleBet(io, socket, betAmount, betObj);
};

//handle bets and Debit transation---------------------------------------
export const handleBet = async (io, socket, betAmount, betObj) => {
  const user_id = socket.data?.userInfo.user_id;
  let playerDetails = await getCache(`PL:${user_id}`);
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
  await setCache(`PL:${userId}`, JSON.stringify(parsedPlayerDetails));

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
  if (row > appConfig.finalRow) {
    return socket.emit("message", {
      action: "gameError",
      msg: "Row cannot be greater than finalRow",
    });
  }
  const fireball = gameState[user_id].level;
  const multiplier = getMultiplier(fireball, row);
  gameState[user_id].multiplier = multiplier;

  const balls = generateFireballs(row, fireball);
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

  gameState[user_id].payout =
    Number(betObj[user_id]?.betAmount) * Number(multiplier);
  console.log(gameState[user_id]);

  if (gameState[user_id].bombs[row].includes(Number(currentIndex))) {
    gameState[user_id].alive = false;
    gameState[user_id].payout = 0;
    const restFireBalls = allFireBalls(fireball, row);
    console.log(restFireBalls, "fifi");

    socket.emit("message", {
      action: "gameState",
      msg: gameState[user_id],
    });

    delete gameState[user_id];
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
  let playerDetails = await getCache(`PL:${user_id}`);
  if (!playerDetails)
    return socket.emit("message", {
      action: "cashoutError",
      msg: "Invalid player details",
    });
  const parsedPlayerDetails = JSON.parse(playerDetails);
  const multiplier = gameState[user_id]?.multiplier;
  const settlements = [];
  const userBetData = betObj[parsedPlayerDetails.userId];
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
  insertMatchData({
    bet_id: userBetData.bet_id,
    user_id,
    operator_id: parsedPlayerDetails.operatorId,
    match_id: userBetData.matchId,
    bet_amount: userBetData.betAmount,
    win_amount: final_amount,
    multiplier: multiplier,
  });
  const cachedPlayerDetails = await getCache(`PL:${user_id}`);
  if (cachedPlayerDetails) {
    const parsedPlayerDetails = JSON.parse(cachedPlayerDetails);
    console.log(parsedPlayerDetails.balance, "before update");
    parsedPlayerDetails.balance = Number(
      Number(parsedPlayerDetails.balance) + Number(final_amount)
    ).toFixed(2);
    console.log(parsedPlayerDetails.balance, "after update");
    await setCache(`PL:${user_id}`, JSON.stringify(parsedPlayerDetails));

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
