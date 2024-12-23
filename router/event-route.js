import { startMatch } from "../module/game/gamePlay.js";
export const registerEvents = async (io, socket) => {
  socket.on("action", (data) => {
    const event = data.split(":");
    switch (event[0]) {
      //PB:betAmount:fireball:
      case "PB":
        return startMatch(io,socket,event.slice(1,event.length));
      }
  });
};
