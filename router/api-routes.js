import express from "express";
import {
  leaderboard,
  singleMatchHistory,
  userMatchHistory,
} from "../module/api-controller/controller.js";
const router = express.Router();

router.get("/leaderboard", (req, res) => {
  leaderboard(req, res);
});
router.get("/match-history", (req, res) => {
  userMatchHistory(req, res);
});

router.get("/single-match", (req, res) => {
  singleMatchHistory(req, res);
});

export default router;
