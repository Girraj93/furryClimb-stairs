import { gameState } from "./module/game/gamePlay.js";
import { getUserDataFromSource } from "./module/players/player-data.js";
import { registerEvents } from "./router/event-route.js";
import {
  hiddenColumnsPerRow,
  multipliers,
} from "./utilities/helper-function.js";
import {
  deleteCache,
  getCache,
  setCache,
} from "./utilities/redis-connection.js";

export const initSocket = (io) => {
  const onConnection = async (socket) => {
    console.log("socket connected");
    const token = socket.handshake.query.token;
    const game_id = socket.handshake.query.game_id;
    if (!token) {
      socket.disconnect(true);
      return console.log("No Token Provided", token);
    }
    const userData = await getUserDataFromSource(token, game_id);
    socket.data["userInfo"] = userData;
    if (!userData) {
      console.log("Invalid token", token);
      return socket.disconnect(true);
    }
    socket.emit("message", {
      action: "info",
      msg: {
        userId: userData.userId,
        userName: userData.name,
        operator_id: userData.operatorId,
        balance: Number(userData.balance).toFixed(2),
        avatarIndex: userData.image,
      },
    });
    await setCache(
      `PL:${userData.userId}`,
      JSON.stringify({ ...userData, socketId: socket.id }),
      3600
    );
    socket.emit("message", {
      action: "gameSettings",
      msg: { hiddenColumnsPerRow, multipliers },
    });

    if (gameState[userData.userId]) {
      socket.emit("message", {
        action: "reconnection",
        msg: gameState[userData.userId],
      });
    }
    registerEvents(io, socket);
    socket.on("disconnect", async () => {
      await deleteCache(`PL:${userData.userId}`);
    });
    socket.on("error", (error) => {
      console.error(`Socket error: ${socket.id}. Error: ${error.message}`);
    });
  };
  io.on("connection", onConnection);
};
