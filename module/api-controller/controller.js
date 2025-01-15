import { read } from "../../utilities/db-connection.js";

export const topBets = async (req, res) => {
  try {
    const data = await read(
      `SELECT user_id,win_amount,bet_amount,multiplier,unix_timestamp(created_at)*1000 as Time
       FROM settlement ORDER BY win_amount DESC LIMIT 30`
    );
    if (!data.length) {
      return res.status(404).json({ message: "No topBets history found" });
    }
    return res.json({
      message: "users history fetched successfully",
      topBets: data,
    });
  } catch (error) {
    console.error("Error fetching users topBets:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
export const myBets = async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ message: "User ID is required" });
    }
    const data = await read(
      `SELECT
    b.bet_amount,
    COALESCE(s.win_amount, 0) AS win_amount,
    COALESCE(s.multiplier, 0) AS multiplier,
    UNIX_TIMESTAMP(b.created_at) * 1000 AS Time,
      (CASE
          WHEN win_amount > 0 THEN 'WIN'
          ELSE 'LOOSE'
      END) AS status FROM bets b
      LEFT JOIN
    settlement s
ON
    b.user_id = s.user_id AND b.bet_id = s.bet_id
WHERE
    b.user_id =?
ORDER BY
    b.created_at DESC LIMIT 30
`,
      [user_id]
    );
    return res.json({
      message: "user history fetched successfully",
      myBets: data,
    });
  } catch (error) {
    console.error("Error fetching user bets:", error);
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
      ` SELECT
            match_id AS Round_ID,
            user_id AS User_ID,
            operator_id AS OperatorId,
            bet_amount AS Total_BetAmount,
            win_amount AS Total_WinAmount,
            multiplier,
            NOW() AS Time,
            (CASE
                WHEN win_amount > 0 THEN 'WIN'
                ELSE 'LOOSE'
            END) AS status
        FROM
            settlement
        WHERE
            user_id = ? AND operator_id = ?
                AND match_id = ?`,
      [user_id, operator_id, match_id]
    );
    return res.json({
      message: "User single match history fetched successfully",
      data: settlement,
    });
  } catch (error) {
    console.error("Error fetching user single match history:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
