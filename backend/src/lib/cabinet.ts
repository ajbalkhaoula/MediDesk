import { pool } from "../db/pool.js";

export class AuthUserNotFoundError extends Error {
  statusCode: number;

  constructor(message = "Invalid token") {
    super(message);
    this.name = "AuthUserNotFoundError";
    this.statusCode = 401;
  }
}

export async function ensureUserCabinet(userId: string): Promise<string> {
  const current = await pool.query<{ cabinet_id: string | null }>(
    "SELECT cabinet_id FROM users WHERE id = $1",
    [userId],
  );

  if (!current.rowCount) {
    throw new AuthUserNotFoundError();
  }

  const cabinetId = current.rows[0].cabinet_id;
  if (cabinetId) {
    return cabinetId;
  }

  const insertedCabinet = await pool.query<{ id: string }>(
    "INSERT INTO cabinets (name) VALUES ($1) RETURNING id",
    ["Cabinet"],
  );

  const newCabinetId = insertedCabinet.rows[0].id;

  await pool.query("UPDATE users SET cabinet_id = $1 WHERE id = $2", [newCabinetId, userId]);

  return newCabinetId;
}
