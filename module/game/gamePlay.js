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
import { addSettleBet, insertBets } from "../bet/bet-db.js";
import { sendToQueue } from "../../utilities/amqp.js";
import {
  allFireBalls,
  generateFireballs,
  getLastMultiplier,
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
    bombs: [],
    alive: true,
  };

  await handleBet(io, socket, betAmount, betObj, fireball);
  // const selectedMultipliers = multipliers[Number(fireball)];

  // socket.emit("message", {
  //   action: "multiplier",
  //   msg: selectedMultipliers,
  // });
};

//handle bets and Debit transation---------------------------------------
export const handleBet = async (io, socket, betAmount, betObj, fireball) => {
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
    fireball,
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
  const fireball = gameState[user_id].level;
  const balls = generateFireballs(row, fireball);
  console.log(balls, "balls");
  gameState[user_id].bombs.push(...balls);
  gameState[user_id].stairs.push({ row: row, index: currentIndex });

  if (gameState[user_id].bombs.includes(Number(currentIndex))) {
    gameState[user_id].alive = false;
    const restFireBalls = allFireBalls(fireball, row);
    console.log(restFireBalls, "fifi");

    socket.emit("message", {
      action: "gameState",
      msg: gameState[user_id],
    });

    socket.emit("message", {
      action: "restFireBalls",
      msg: restFireBalls,
    });
    delete gameState[user_id];
    return socket.emit("message", {
      action: "gameOver",
      msg: "You lose! You hit a fireball!",
    });
  }

  if (Number(row) === Number(appConfig.totalRows)) {
    let multiplier = getLastMultiplier(fireball);
    socket.emit("message", {
      action: "gameState",
      msg: gameState[user_id],
    });
    await cashout(io, socket, multiplier);
  }

  socket.emit("message", {
    action: "gameState",
    msg: gameState[user_id],
  });
};

export const cashout = async (io, socket, multiplier) => {
  const user_id = socket.data?.userInfo.user_id;
  let playerDetails = await getCache(`PL:${user_id}`);
  if (!playerDetails)
    return socket.emit("message", {
      action: "cashoutError",
      msg: "Invalid player details",
    });
  const parsedPlayerDetails = JSON.parse(playerDetails);
  const settlements = [];
  const userBetData = betObj[parsedPlayerDetails.userId];
  if (!userBetData) {
    return io.to(parsedPlayerDetails.socketId).emit("message", {
      action: "betError",
      msg: "no bet data found",
    });
  }
  let final_amount = Number(userBetData.betAmount) * Number(multiplier);
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
        balance: parsedPlayerDetails.balance,
      },
    });

    io.to(parsedPlayerDetails.socketId).emit("message", {
      action: "wins",
      msg: { final_amount, multiplier },
    });
    await addSettleBet(settlements);
  }
};
