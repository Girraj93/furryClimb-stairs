import { read } from "../../utilities/db-connection.js";

export const leaderboard = async (req, res) => {
  try {
    const settlements = await read(
      `SELECT user_id,win_amount,bet_amount,multiplier,unix_timestamp(created_at)*1000 as Time
       FROM settlement ORDER BY created_at DESC`
    );
    if (!settlements.length) {
      return res.status(404).json({ message: "No leaderboard history found" });
    }
    return res.json({
      message: "users history fetched successfully",
      history: settlements,
    });
  } catch (error) {
    console.error("Error fetching users match history:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const userMatchHistory = async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ message: "User ID is required" });
    }
    const settlements = await read(
      `SELECT win_amount,bet_amount,multiplier,unix_timestamp(created_at)*1000 as Time
       FROM settlement WHERE user_id=? ORDER BY created_at DESC`,
      [user_id]
    );
    if (!settlements.length) {
      return res
        .status(404)
        .json({ message: "No match history found for this user" });
    }
    return res.json({
      message: "user history fetched successfully",
      history: settlements,
    });
  } catch (error) {
    console.error("Error fetching user match history:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const singleMatchHistory = async (req, res) => {
  try {
    const { user_id, operator_id, match_id } = req.query;
    if (!user_id || !operator_id || !match_id) {
      return res
        .status(400)
        .json({ message: "user_id, Match ID, and operator_id are required" });
    }
    const [settlement] = await read(
      `SELECT match_id AS Round_ID, user_id AS User_ID,operator_id AS OperatorId,
       bet_amount AS Total_BetAmount,win_amount AS Total_WinAmount,
       multiplier,NOW() AS Time FROM settlement
       WHERE user_id = ? AND operator_id = ? AND match_id = ?`,
      [user_id, operator_id, match_id]
    );
    if (!settlement) {
      return res.status(404).json({ message: "No single match history found for this user" });
    }
    const status = Number(settlement.Total_WinAmount) > 0 ? "WIN" : "LOSS";
    return res.json({
      message: "User single match history fetched successfully",
      data: { ...settlement, status },
    });
  } catch (error) {
    console.error("Error fetching user single match history:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
