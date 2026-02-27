import { Router } from "express";
import { pool } from "../db/pool.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
});
