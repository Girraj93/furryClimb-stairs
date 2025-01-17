import { cashout, gamePlay, startMatch } from "../module/game/gamePlay.js";
export const registerEvents = async (io, socket) => {
  socket.on("action", (data) => {
    const event = data.split(":");
    switch (event[0]) {
      //start:betAmount:fireball
      case "start":
        return startMatch(io, socket, event[1], event[2]);
      //CO
      case "CO":
        return cashout(io, socket);
      case "GP":
        //GP:stairindex:row
        return gamePlay(io, socket, event[1], event[2]);
    }
  });
};
