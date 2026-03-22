import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorization.js";
import { ensureUserCabinet } from "../lib/cabinet.js";

const cabinetSchema = z.object({
  name: z.string().trim().min(1),
  address: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().or(z.literal("")).nullable(),
  siret: z.string().trim().optional().nullable(),
  adeli: z.string().trim().optional().nullable(),
  logoUrl: z.string().trim().url().optional().or(z.literal("")).nullable(),
  timezone: z.string().trim().min(1).optional(),
});

function normalizeNullable(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export const cabinetRouter = Router();

cabinetRouter.use(requireAuth);
cabinetRouter.use(requireRole("admin", "praticien", "assistant"));

cabinetRouter.get("/cabinet", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);
  const result = await pool.query<{
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    siret: string | null;
    adeli: string | null;
    logo_url: string | null;
    timezone: string;
  }>(
    `SELECT id, name, address, phone, email, siret, adeli, logo_url, timezone
     FROM cabinets
     WHERE id = $1`,
    [cabinetId],
  );

  if (!result.rowCount) {
    return res.status(404).json({ message: "Cabinet not found" });
  }

  const cabinet = result.rows[0];
  return res.json({
    cabinet: {
      id: cabinet.id,
      name: cabinet.name,
      address: cabinet.address,
      phone: cabinet.phone,
      email: cabinet.email,
      siret: cabinet.siret,
      adeli: cabinet.adeli,
      logoUrl: cabinet.logo_url,
      timezone: cabinet.timezone,
    },
  });
});

cabinetRouter.put("/cabinet", async (req: AuthenticatedRequest, res) => {
  const parsed = cabinetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const cabinetId = await ensureUserCabinet(req.user!.id);
  const data = parsed.data;

  const updated = await pool.query<{
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    siret: string | null;
    adeli: string | null;
    logo_url: string | null;
    timezone: string;
  }>(
    `UPDATE cabinets
     SET name = $1,
         address = $2,
         phone = $3,
         email = $4,
         siret = $5,
         adeli = $6,
         logo_url = $7,
         timezone = COALESCE($8, timezone)
     WHERE id = $9
     RETURNING id, name, address, phone, email, siret, adeli, logo_url, timezone`,
    [
      data.name,
      normalizeNullable(data.address),
      normalizeNullable(data.phone),
      normalizeNullable(data.email),
      normalizeNullable(data.siret),
      normalizeNullable(data.adeli),
      normalizeNullable(data.logoUrl),
      data.timezone?.trim() || null,
      cabinetId,
    ],
  );

  return res.json({
    cabinet: {
      id: updated.rows[0].id,
      name: updated.rows[0].name,
      address: updated.rows[0].address,
      phone: updated.rows[0].phone,
      email: updated.rows[0].email,
      siret: updated.rows[0].siret,
      adeli: updated.rows[0].adeli,
      logoUrl: updated.rows[0].logo_url,
      timezone: updated.rows[0].timezone,
    },
  });
});
