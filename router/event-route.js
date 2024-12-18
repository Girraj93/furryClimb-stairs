import { handleBet } from "../module/game/gamePlay.js";
export const registerEvents = async (io, socket) => {
  socket.on("action", (data) => {
    const event = data.split(":");
    switch (event[0]) {
      case "PB":
        return handleBet(io,socket,event[1])
      }
  });
};
