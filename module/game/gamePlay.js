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
import { insertBets } from "../bet/bet-db.js";

export const startMatch = async (io, socket, event) => {
  let betObj = {};
  await handleBet(io, socket, event, betObj);
  const [betAmt,fireball] = event;
  const generateFireballs =  randomFireballsGenerator(fireball)
  console.log(generateFireballs,"generate rndom fireballs");
}

const randomFireballsGenerator = (fireball) => {
  const generatedFireballs = [];
  for (let value in fireball) {
    const randomIndex = Math.floor(Math.random() * fireball.length);
    generatedFireballs.push(fireball[randomIndex]);
  }
  return generatedFireballs;
};

//handle bets and Debit transation---------------------------------------
export const handleBet = async (io, socket, event, betObj) => {
  const user_id = socket.data?.userInfo.user_id;
  let playerDetails = await getCache(`PL:${user_id}`);
  if (!playerDetails)
    return socket.emit("error", "Invalid Player Details");
  const parsedPlayerDetails = JSON.parse(playerDetails);
  const { userId,operatorId,token,game_id,balance} = parsedPlayerDetails;
  const matchId = generateUUIDv7()
  const bet_id = `BT:${matchId}:${userId}:${operatorId}`;
  const [betAmt,fireball] = event;
  Object.assign(betObj, {
    betAmt,
    bet_id,
    token,
    socket_id: parsedPlayerDetails.socketId,
    game_id,
    matchId
  })
  if (Number(betAmt) > Number(balance)) {
    return socket.emit("error", "insufficient balance");
  }
  const webhookData = await prepareDataForWebhook(
    {
      betAmount: betAmt,
      game_id,
      user_id: userId,
      matchId,
      bet_id,
    },
    "DEBIT",
    socket
  );
  betObj.txn_id = webhookData.txn_id;
  try {
    await postDataToSourceForBet({
      webhookData,
      token,
      socketId: socket.id,
    });
  } catch (err) {
    JSON.stringify({ req: bet_id, res: "bets cancelled by upstream" })
    return socket.emit("error", "Bet Cancelled by Upstream Server")
  }
  await insertBets({
    bet_id,
    user_id,
    operator_id: operatorId,
    matchId,
    betAmt,
    fireball
  })
  parsedPlayerDetails.balance = Number(balance - Number(betAmt)).toFixed(2);
  await setCache(`PL:${socket.id}`, JSON.stringify(parsedPlayerDetails));
  socket.emit("message", "Bet Placed successfully")
}
