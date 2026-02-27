import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorization.js";
import { ensureUserCabinet } from "../lib/cabinet.js";
import { loadCabinetPrestations } from "../lib/settings.js";

const updateConsultationSchema = z.object({
  notes: z.string().optional().nullable(),
  motifLabel: z.string().optional().nullable(),
  startTime: z.string().datetime({ offset: true }).optional(),
  endTime: z.string().datetime({ offset: true }).optional(),
  durationMinutes: z.number().int().nonnegative().optional(),
});

const addActSchema = z.object({
  prestation_id: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
});

interface ConsultationRow {
  id: string;
  cabinet_id: string;
  appointment_id: string;
  patient_id: string;
  motif_id: string | null;
  motif_label: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number | null;
  notes: string | null;
  status: "draft" | "completed" | "cancelled" | "no_show";
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface ConsultationActRow {
  id: string;
  consultation_id: string;
  prestation_id: string;
  label: string;
  quantity: number;
  unit_price: string;
  total: string;
  invoice_line_id: string | null;
  created_at: string;
}

function normalizeNullable(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function toClientConsultation(row: ConsultationRow) {
  return {
    id: row.id,
    cabinetId: row.cabinet_id,
    appointmentId: row.appointment_id,
    patientId: row.patient_id,
    motifId: row.motif_id,
    motifLabel: row.motif_label,
    startTime: row.start_time,
    endTime: row.end_time,
    durationMinutes: row.duration_minutes,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function toClientAct(row: ConsultationActRow) {
  return {
    id: row.id,
    consultationId: row.consultation_id,
    prestationId: row.prestation_id,
    label: row.label,
    quantity: row.quantity,
    unitPrice: Number(row.unit_price),
    total: Number(row.total),
    invoiceLineId: row.invoice_line_id,
    createdAt: row.created_at,
  };
}

export const consultationsRouter = Router();

consultationsRouter.use(requireAuth);
consultationsRouter.use(requireRole("admin", "praticien", "assistant"));

consultationsRouter.get("/by-appointment/:appointmentId", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);
  const consultationResult = await pool.query<ConsultationRow>(
    "SELECT * FROM consultations WHERE appointment_id = $1 AND cabinet_id = $2",
    [req.params.appointmentId, cabinetId],
  );
  if (!consultationResult.rowCount) {
    return res.status(404).json({ message: "Consultation not found" });
  }
  return res.json({ consultation: toClientConsultation(consultationResult.rows[0]) });
});

consultationsRouter.get("/:id", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);
  const consultationResult = await pool.query<ConsultationRow>(
    "SELECT * FROM consultations WHERE id = $1 AND cabinet_id = $2",
    [req.params.id, cabinetId],
  );
  if (!consultationResult.rowCount) {
    return res.status(404).json({ message: "Consultation not found" });
  }

  const actsResult = await pool.query<ConsultationActRow>(
    "SELECT * FROM consultation_acts WHERE consultation_id = $1 ORDER BY created_at ASC",
    [req.params.id],
  );

  return res.json({
    consultation: toClientConsultation(consultationResult.rows[0]),
    acts: actsResult.rows.map(toClientAct),
  });
});

consultationsRouter.patch("/:id", async (req: AuthenticatedRequest, res) => {
  const parsed = updateConsultationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }
  const cabinetId = await ensureUserCabinet(req.user!.id);
  const existing = await pool.query<ConsultationRow>(
    "SELECT * FROM consultations WHERE id = $1 AND cabinet_id = $2",
    [req.params.id, cabinetId],
  );
  if (!existing.rowCount) {
    return res.status(404).json({ message: "Consultation not found" });
  }
  if (existing.rows[0].status !== "draft") {
    return res.status(403).json({ message: "Only draft consultations can be edited." });
  }

  const data = parsed.data;
  const startTime = data.startTime ?? existing.rows[0].start_time;
  const endTime = data.endTime ?? existing.rows[0].end_time;
  const durationMinutes =
    data.durationMinutes ??
    Math.max(0, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / (1000 * 60)));

  const updated = await pool.query<ConsultationRow>(
    `UPDATE consultations
     SET notes = COALESCE($1, notes),
         motif_label = COALESCE($2, motif_label),
         start_time = $3,
         end_time = $4,
         duration_minutes = $5,
         updated_at = now()
     WHERE id = $6
       AND cabinet_id = $7
     RETURNING *`,
    [
      normalizeNullable(data.notes),
      normalizeNullable(data.motifLabel),
      startTime,
      endTime,
      durationMinutes,
      req.params.id,
      cabinetId,
    ],
  );

  return res.json({ consultation: toClientConsultation(updated.rows[0]) });
});

consultationsRouter.post("/:id/acts", async (req: AuthenticatedRequest, res) => {
  const parsed = addActSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const cabinetId = await ensureUserCabinet(req.user!.id);
  const consultationResult = await pool.query<ConsultationRow>(
    "SELECT * FROM consultations WHERE id = $1 AND cabinet_id = $2",
    [req.params.id, cabinetId],
  );
  if (!consultationResult.rowCount) {
    return res.status(404).json({ message: "Consultation not found" });
  }
  if (consultationResult.rows[0].status !== "draft") {
    return res.status(403).json({ message: "Acts cannot be modified when consultation is not draft." });
  }

  const prestations = await loadCabinetPrestations(cabinetId);
  const prestation = prestations.find((item) => item.id === parsed.data.prestation_id);
  if (!prestation) {
    return res.status(404).json({ message: "Prestation not found in cabinet settings." });
  }

  const total = Number((parsed.data.quantity * prestation.price).toFixed(2));
  const inserted = await pool.query<ConsultationActRow>(
    `INSERT INTO consultation_acts (consultation_id, prestation_id, label, quantity, unit_price, total)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [req.params.id, prestation.id, prestation.name, parsed.data.quantity, prestation.price, total],
  );

  return res.status(201).json({ act: toClientAct(inserted.rows[0]) });
});

consultationsRouter.delete("/:id/acts/:actId", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);
  const consultationResult = await pool.query<ConsultationRow>(
    "SELECT * FROM consultations WHERE id = $1 AND cabinet_id = $2",
    [req.params.id, cabinetId],
  );
  if (!consultationResult.rowCount) {
    return res.status(404).json({ message: "Consultation not found" });
  }
  if (consultationResult.rows[0].status !== "draft") {
    return res.status(403).json({ message: "Acts cannot be modified when consultation is not draft." });
  }

  const deleted = await pool.query(
    "DELETE FROM consultation_acts WHERE id = $1 AND consultation_id = $2 RETURNING id",
    [req.params.actId, req.params.id],
  );
  if (!deleted.rowCount) {
    return res.status(404).json({ message: "Act not found" });
  }

  return res.status(204).send();
});

consultationsRouter.post("/:id/complete", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const consultation = await client.query<ConsultationRow>(
      "SELECT * FROM consultations WHERE id = $1 AND cabinet_id = $2 FOR UPDATE",
      [req.params.id, cabinetId],
    );
    if (!consultation.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Consultation not found" });
    }
    if (consultation.rows[0].status !== "draft") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Consultation must be in draft status to complete." });
    }

    const updatedConsultation = await client.query<ConsultationRow>(
      `UPDATE consultations
       SET status = 'completed',
           completed_at = now(),
           updated_at = now()
       WHERE id = $1
         AND cabinet_id = $2
       RETURNING *`,
      [req.params.id, cabinetId],
    );

    await client.query(
      `UPDATE appointments
       SET status = 'completed',
           updated_at = now()
       WHERE id = $1
         AND cabinet_id = $2`,
      [consultation.rows[0].appointment_id, cabinetId],
    );

    await client.query(
      `UPDATE patients
       SET sessions_count = (
             SELECT COUNT(*)::int
             FROM appointments
             WHERE cabinet_id = $1
               AND patient_id = $2
               AND status = 'completed'
           ),
           last_session_date = (
             SELECT MAX(starts_at::date)
             FROM appointments
             WHERE cabinet_id = $1
               AND patient_id = $2
               AND status = 'completed'
           ),
           updated_at = now()
       WHERE id = $2
         AND cabinet_id = $1`,
      [cabinetId, consultation.rows[0].patient_id],
    );

    await client.query("COMMIT");
    return res.json({ consultation: toClientConsultation(updatedConsultation.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ message: "Unable to complete consultation" });
  } finally {
    client.release();
  }
});
