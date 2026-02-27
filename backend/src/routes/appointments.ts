import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorization.js";
import { ensureUserCabinet } from "../lib/cabinet.js";

const appointmentStatusSchema = z.enum(["scheduled", "completed", "canceled", "no_show"]);

const appointmentSchema = z.object({
  patientId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  status: appointmentStatusSchema.optional(),
  tag: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

interface AppointmentListRow {
  id: string;
  patient_id: string;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "completed" | "canceled" | "no_show";
  tag: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
}

function normalizeNullable(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};

async function refreshPatientSessionMetrics(client: DbClient, cabinetId: string, patientId: string) {
  const metrics = await client.query(
    `SELECT COUNT(*)::int AS sessions_count, MAX(starts_at::date) AS last_session_date
     FROM appointments
     WHERE cabinet_id = $1 AND patient_id = $2 AND status = 'completed'`,
    [cabinetId, patientId],
  );

  const { sessions_count, last_session_date } = metrics.rows[0] as {
    sessions_count: number;
    last_session_date: string | null;
  };

  await client.query(
    `UPDATE patients
     SET sessions_count = $1,
         last_session_date = $2,
         updated_at = now()
     WHERE id = $3 AND cabinet_id = $4`,
    [sessions_count ?? 0, last_session_date, patientId, cabinetId],
  );
}

export const appointmentsRouter = Router();

appointmentsRouter.use(requireAuth);
appointmentsRouter.use(requireRole("admin", "praticien", "assistant"));

appointmentsRouter.get("/", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);
  const from = typeof req.query.from === "string" ? req.query.from : null;
  const to = typeof req.query.to === "string" ? req.query.to : null;
  const status = typeof req.query.status === "string" ? req.query.status : "all";
  const statusFilter = status === "all" ? null : status;

  const result = await pool.query(
    `SELECT a.id, a.patient_id, a.starts_at, a.ends_at, a.status, a.tag, a.notes, a.created_at, a.updated_at,
            p.first_name, p.last_name, p.photo_url
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     WHERE a.cabinet_id = $1
       AND ($2::timestamptz IS NULL OR a.starts_at >= $2)
       AND ($3::timestamptz IS NULL OR a.starts_at < $3)
       AND ($4::text IS NULL OR a.status = $4)
     ORDER BY a.starts_at ASC`,
    [cabinetId, from, to, statusFilter],
  );

  return res.json({
    appointments: result.rows.map((row) => {
      const typedRow = row as AppointmentListRow;
      return {
        id: typedRow.id,
        patientId: typedRow.patient_id,
        patientName: `${typedRow.first_name} ${typedRow.last_name}`,
        patientPhotoUrl: typedRow.photo_url,
        startsAt: typedRow.starts_at,
        endsAt: typedRow.ends_at,
        status: typedRow.status,
        tag: typedRow.tag,
        notes: typedRow.notes,
        createdAt: typedRow.created_at,
        updatedAt: typedRow.updated_at,
      };
    }),
  });
});

appointmentsRouter.post("/", async (req: AuthenticatedRequest, res) => {
  const parsed = appointmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const cabinetId = await ensureUserCabinet(req.user!.id);
  const data = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const patient = await client.query(
      "SELECT id FROM patients WHERE id = $1 AND cabinet_id = $2",
      [data.patientId, cabinetId],
    );
    if (!patient.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Patient not found" });
    }

    const inserted = await client.query(
      `INSERT INTO appointments (cabinet_id, patient_id, starts_at, ends_at, status, tag, notes, created_by)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'scheduled'), $6, $7, $8)
       RETURNING id, patient_id, starts_at, ends_at, status, tag, notes, created_at, updated_at`,
      [
        cabinetId,
        data.patientId,
        data.startsAt,
        data.endsAt,
        data.status ?? null,
        normalizeNullable(data.tag),
        normalizeNullable(data.notes),
        req.user!.id,
      ],
    );

    await refreshPatientSessionMetrics(client, cabinetId, data.patientId);
    await client.query("COMMIT");

    return res.status(201).json({ appointment: inserted.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ message: "Unable to create appointment" });
  } finally {
    client.release();
  }
});

appointmentsRouter.put("/:id", async (req: AuthenticatedRequest, res) => {
  const parsed = appointmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const cabinetId = await ensureUserCabinet(req.user!.id);
  const data = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT id, patient_id FROM appointments WHERE id = $1 AND cabinet_id = $2",
      [req.params.id, cabinetId],
    );
    if (!existing.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Appointment not found" });
    }
    const previousPatientId = existing.rows[0].patient_id as string;

    const patient = await client.query(
      "SELECT id FROM patients WHERE id = $1 AND cabinet_id = $2",
      [data.patientId, cabinetId],
    );
    if (!patient.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Patient not found" });
    }

    const updated = await client.query(
      `UPDATE appointments
       SET patient_id = $1,
           starts_at = $2,
           ends_at = $3,
           status = COALESCE($4, status),
           tag = $5,
           notes = $6,
           updated_at = now()
       WHERE id = $7 AND cabinet_id = $8
       RETURNING id, patient_id, starts_at, ends_at, status, tag, notes, created_at, updated_at`,
      [
        data.patientId,
        data.startsAt,
        data.endsAt,
        data.status ?? null,
        normalizeNullable(data.tag),
        normalizeNullable(data.notes),
        req.params.id,
        cabinetId,
      ],
    );

    await refreshPatientSessionMetrics(client, cabinetId, previousPatientId);
    if (previousPatientId !== data.patientId) {
      await refreshPatientSessionMetrics(client, cabinetId, data.patientId);
    }

    await client.query("COMMIT");
    return res.json({ appointment: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ message: "Unable to update appointment" });
  } finally {
    client.release();
  }
});

appointmentsRouter.delete("/:id", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const deleted = await client.query(
      `DELETE FROM appointments
       WHERE id = $1 AND cabinet_id = $2
       RETURNING id, patient_id`,
      [req.params.id, cabinetId],
    );
    if (!deleted.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Appointment not found" });
    }

    const patientId = deleted.rows[0].patient_id as string;
    await refreshPatientSessionMetrics(client, cabinetId, patientId);
    await client.query("COMMIT");
    return res.status(204).send();
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ message: "Unable to delete appointment" });
  } finally {
    client.release();
  }
});
