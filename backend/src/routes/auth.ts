import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { config } from "../config.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { ensureUserCabinet } from "../lib/cabinet.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function buildToken(user: { id: string; role: string; email: string; cabinetId: string }) {
  return jwt.sign(
    { role: user.role, cabinetId: user.cabinetId, email: user.email },
    config.jwtSecret,
    { subject: user.id, expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"] },
  );
}

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const { email, password, firstName, lastName } = parsed.data;

  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rowCount) {
    return res.status(409).json({ message: "Email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const inserted = await pool.query(
    `INSERT INTO users (email, password_hash, role, first_name, last_name)
     VALUES ($1, $2, 'praticien', $3, $4)
     RETURNING id, email, role`,
    [email, passwordHash, firstName, lastName],
  );

  const user = inserted.rows[0];
  const cabinetId = await ensureUserCabinet(user.id);

  const token = buildToken({
    id: user.id,
    email: user.email,
    role: user.role,
    cabinetId,
  });

  return res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role, cabinetId } });
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;

  const result = await pool.query(
    `SELECT id, email, role, password_hash
     FROM users
     WHERE email = $1`,
    [email],
  );

  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  await pool.query("UPDATE users SET last_login = now() WHERE id = $1", [user.id]);
  const cabinetId = await ensureUserCabinet(user.id);

  const token = buildToken({
    id: user.id,
    email: user.email,
    role: user.role,
    cabinetId,
  });

  return res.json({ token, user: { id: user.id, email: user.email, role: user.role, cabinetId } });
});

authRouter.get("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  const result = await pool.query(
    `SELECT id, email, role, first_name, last_name
     FROM users
     WHERE id = $1`,
    [req.user?.id],
  );

  if (!result.rowCount) {
    return res.status(404).json({ message: "User not found" });
  }

  const user = result.rows[0];
  const cabinetId = await ensureUserCabinet(user.id);

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      cabinetId,
      firstName: user.first_name,
      lastName: user.last_name,
    },
  });
});
