import express from "express";
import {
  topBets,
  singleMatchHistory,
  myBets,
  allBets,
} from "../module/api-controller/controller.js";
const router = express.Router();

router.get("/top-bets", (req, res) => {
  topBets(req, res);
});
router.get("/all-bets", (req, res) => {
  allBets(req, res);
});
router.get("/my-bets", (req, res) => {
  myBets(req, res);
});

router.get("/single-match", (req, res) => {
  singleMatchHistory(req, res);
});

export default router;
