import { cashout, gamePlay, startMatch } from "../module/game/gamePlay.js";
export const registerEvents = async (io, socket) => {
  socket.on("action", (data) => {
    const event = data.split(":");
    switch (event[0]) {
      //start:betAmount:fireball
      case "start":
        return startMatch(io, socket, event[1], event[2]);
      //CO:multiplier
      case "CO":
        return cashout(io, socket, event[1]);
      case "GP":
        //GP:currentindex:row:multiplier
        return gamePlay(io, socket, event[1], event[2], event[3]);
    }
  });
};
