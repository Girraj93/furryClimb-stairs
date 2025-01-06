import { write } from "../../utilities/db-connection.js";
export const addSettleBet = async (settlements) => {
  try {
    const finalData = [];
    for (let settlement of settlements) {
      const { bet_id, totalBetAmount, winAmount, multiplier, username } =
        settlement;
      const [initial, matchId, user_id, operator_id] = bet_id.split(":");
      finalData.push([
        bet_id,
        decodeURIComponent(user_id),
        operator_id,
        matchId,
        totalBetAmount,
        winAmount,
        multiplier,
      ]);
    }
    const placeholders = finalData.map(() => "(?,?,?,?,?,?,?)").join(",");
    const SQL_SETTLEMENT = `INSERT INTO settlement (bet_id,user_id, operator_id, match_id, bet_amount,win_amount,multiplier) VALUES ${placeholders}`;
    const flattenedData = finalData.flat();
    await write(SQL_SETTLEMENT, flattenedData);
  } catch (err) {
    console.error(err);
  }
};

export const insertBets = async (betData) => {
  try {
    const SQL_INSERT_BETS =
      "INSERT INTO bets (bet_id, user_id, operator_id,match_id,bet_amount) VALUES(?,?,?,?,?)";
    const { bet_id, user_id, operator_id, betAmount, matchId } = betData;
    await write(SQL_INSERT_BETS, [
      bet_id,
      decodeURIComponent(user_id),
      operator_id,
      matchId,
      betAmount,
    ]);
  } catch (err) {
    console.error(err);
  }
};
