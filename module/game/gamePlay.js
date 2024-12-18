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

export const handleBet = async(io,socket,event)=>{
    const user_id = socket.data?.userInfo.user_id;
    console.log(user_id);
if (!user_id) {
  return socket.emit("message", {
    action: "betError",
    msg: "Invalid Player Details",
  });
}
    let playerDetails = await getCache(`PL:${user_id}`);
    if (!playerDetails)
      return socket.emit("message", {
        action: "betError",
        msg: "Invalid Player Details",
      });
    const parsedPlayerDetails = JSON.parse(playerDetails);
    const { userId, operatorId, token, game_id, balance } = parsedPlayerDetails;
    console.log(event, "event");
    const bet_id = `BT:${userId}:${operatorId}`;
    const identifier = `${operatorId}:${userId}`;
    const betamt = event;
    const betObj = {
        bet_id,
        token,
        socket_id: parsedPlayerDetails.socketId,
        game_id,
        identifier,
      };
    if (Number(betamt) > Number(balance)) {
        return socket.emit("message", {
          action: "betError",
          msg: `insufficient balance`,
        });
      }
      const webhookData = await prepareDataForWebhook(
        {
          betAmount: betamt,
          game_id,
          user_id: userId,
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
        failedBetsLogger.error(
          JSON.stringify({ req: bet_id, res: "bets cancelled by upstream" })
        );
        return socket.emit("message", {
          action: "betError",
          msg: `Bet Cancelled by Upstream Server`,
        });
      }
    parsedPlayerDetails.balance = Number(balance - Number(betamt)).toFixed(2);
    await setCache(`PL:${socket.id}`, JSON.stringify(parsedPlayerDetails));
    socket.emit("message", {
      action: "infoResponse",
      msg: JSON.stringify({
        urId: userId,
        urNm: parsedPlayerDetails.name,
        operator_id: operatorId,
        bl: Number(parsedPlayerDetails.balance).toFixed(2),
        avIn: parsedPlayerDetails.image,
      }),
    });
    return socket.emit("message", {
      action: "bet",
      msg: `Bet Placed successfully`,
    });
}

