import PDFDocument from "pdfkit";
import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorization.js";
import { ensureUserCabinet } from "../lib/cabinet.js";
import { loadCabinetPrestations } from "../lib/settings.js";

const createConsultationSchema = z.object({
  patientId: z.string().uuid(),
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
  motifLabel: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

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
  appointment_id: string | null;
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

function cabinetLogoBuffer(logoUrl: string | null): Buffer | null {
  if (!logoUrl || !logoUrl.startsWith("data:image/")) return null;
  const parts = logoUrl.split(",", 2);
  if (parts.length !== 2) return null;
  try {
    return Buffer.from(parts[1], "base64");
  } catch {
    return null;
  }
}

function slugifyFilenamePart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function exportDatePart(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date-inconnue";
  return date.toISOString().slice(0, 10);
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

consultationsRouter.post("/", async (req: AuthenticatedRequest, res) => {
  const parsed = createConsultationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const cabinetId = await ensureUserCabinet(req.user!.id);
  const data = parsed.data;

  const patient = await pool.query("SELECT id FROM patients WHERE id = $1 AND cabinet_id = $2", [data.patientId, cabinetId]);
  if (!patient.rowCount) {
    return res.status(404).json({ message: "Patient not found" });
  }

  const durationMinutes = Math.max(0, Math.round((new Date(data.endTime).getTime() - new Date(data.startTime).getTime()) / (1000 * 60)));
  const baseNote = normalizeNullable(data.notes);
  const notes = baseNote ? `${baseNote}\nConsultation sans RDV` : "Consultation sans RDV";

  const inserted = await pool.query<ConsultationRow>(
    `INSERT INTO consultations (
       cabinet_id, appointment_id, patient_id, motif_id, motif_label,
       start_time, end_time, duration_minutes, notes, status, created_by
     )
     VALUES ($1, NULL, $2, NULL, $3, $4, $5, $6, $7, 'draft', $8)
     RETURNING *`,
    [
      cabinetId,
      data.patientId,
      normalizeNullable(data.motifLabel),
      data.startTime,
      data.endTime,
      durationMinutes,
      notes,
      req.user!.id,
    ],
  );

  return res.status(201).json({ consultation: toClientConsultation(inserted.rows[0]) });
});

consultationsRouter.get("/", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);
  const status = typeof req.query.status === "string" && req.query.status !== "all" ? req.query.status : null;
  const patientId = typeof req.query.patient_id === "string" ? req.query.patient_id : null;
  const dateFrom = typeof req.query.date_from === "string" ? req.query.date_from : null;
  const dateTo = typeof req.query.date_to === "string" ? req.query.date_to : null;
  const actType = typeof req.query.act_type === "string" ? req.query.act_type : null;

  const params: unknown[] = [cabinetId];
  const where: string[] = ["c.cabinet_id = $1"];

  if (status) {
    params.push(status);
    where.push(`c.status = $${params.length}`);
  }
  if (patientId) {
    params.push(patientId);
    where.push(`c.patient_id = $${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    where.push(`c.start_time::date >= $${params.length}::date`);
  }
  if (dateTo) {
    params.push(dateTo);
    where.push(`c.start_time::date <= $${params.length}::date`);
  }
  if (actType) {
    params.push(actType);
    where.push(
      `EXISTS (
         SELECT 1
         FROM consultation_acts ca
         WHERE ca.consultation_id = c.id
           AND ca.prestation_id = $${params.length}
       )`,
    );
  }

  type ConsultationListRow = ConsultationRow & { patient_first_name: string; patient_last_name: string };
  const list = await pool.query<ConsultationListRow>(
    `SELECT c.*, p.first_name AS patient_first_name, p.last_name AS patient_last_name
     FROM consultations c
     JOIN patients p ON p.id = c.patient_id
     WHERE ${where.join(" AND ")}
     ORDER BY c.start_time DESC`,
    params,
  );

  const consultationIds = list.rows.map((row) => row.id);
  const actsByConsultation = new Map<string, Array<{ id: string; prestationId: string; label: string; quantity: number; total: number }>>();
  if (consultationIds.length > 0) {
    const acts = await pool.query<ConsultationActRow>(
      `SELECT *
       FROM consultation_acts
       WHERE consultation_id = ANY($1::uuid[])
       ORDER BY created_at ASC`,
      [consultationIds],
    );
    for (const row of acts.rows) {
      const current = actsByConsultation.get(row.consultation_id) ?? [];
      current.push({
        id: row.id,
        prestationId: row.prestation_id,
        label: row.label,
        quantity: row.quantity,
        total: Number(row.total),
      });
      actsByConsultation.set(row.consultation_id, current);
    }
  }

  return res.json({
    consultations: list.rows.map((row) => ({
      ...toClientConsultation(row),
      patientName: `${row.patient_first_name} ${row.patient_last_name}`,
      acts: actsByConsultation.get(row.id) ?? [],
    })),
  });
});

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

consultationsRouter.delete("/:id", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);
  const consultationResult = await pool.query<ConsultationRow>(
    "SELECT * FROM consultations WHERE id = $1 AND cabinet_id = $2",
    [req.params.id, cabinetId],
  );
  if (!consultationResult.rowCount) {
    return res.status(404).json({ message: "Consultation not found" });
  }

  const consultation = consultationResult.rows[0];
  if (consultation.status !== "draft") {
    return res.status(403).json({ message: "Only draft consultations can be deleted." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM consultation_acts WHERE consultation_id = $1", [req.params.id]);
    await client.query("DELETE FROM consultations WHERE id = $1 AND cabinet_id = $2", [req.params.id, cabinetId]);

    if (consultation.appointment_id) {
      await client.query(
        `UPDATE appointments
         SET status = 'scheduled',
             updated_at = now()
         WHERE id = $1
           AND cabinet_id = $2`,
        [consultation.appointment_id, cabinetId],
      );
    }

    await client.query("COMMIT");
    return res.status(204).send();
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ message: "Unable to delete consultation" });
  } finally {
    client.release();
  }
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

    if (consultation.rows[0].appointment_id) {
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
               FROM consultations
               WHERE cabinet_id = $1
                 AND patient_id = $2
                 AND status = 'completed'
             ),
             last_session_date = (
               SELECT MAX(start_time::date)
               FROM consultations
               WHERE cabinet_id = $1
                 AND patient_id = $2
                 AND status = 'completed'
             ),
             updated_at = now()
         WHERE id = $2
           AND cabinet_id = $1`,
        [cabinetId, consultation.rows[0].patient_id],
      );
    }

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

consultationsRouter.get("/:id/pdf", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);

  const data = await pool.query<
    ConsultationRow & {
      patient_first_name: string;
      patient_last_name: string;
      patient_birth_date: string | null;
      cabinet_name: string;
      cabinet_address: string | null;
      cabinet_phone: string | null;
      cabinet_email: string | null;
      cabinet_ICE: string | null;
      cabinet_IF: string | null;
      cabinet_logo_url: string | null;
    }
  >(
    `SELECT c.*, p.first_name AS patient_first_name, p.last_name AS patient_last_name, p.birth_date AS patient_birth_date,
            cab.name AS cabinet_name, cab.address AS cabinet_address, cab.phone AS cabinet_phone, cab.email AS cabinet_email, cab.siret AS cabinet_ICE, cab.adeli AS cabinet_IF, cab.logo_url AS cabinet_logo_url
     FROM consultations c
     JOIN patients p ON p.id = c.patient_id
     JOIN cabinets cab ON cab.id = c.cabinet_id
     WHERE c.id = $1 AND c.cabinet_id = $2`,
    [req.params.id, cabinetId],
  );

  if (!data.rowCount) {
    return res.status(404).json({ message: "Consultation not found" });
  }

  const item = data.rows[0];
  const acts = await pool.query<ConsultationActRow>(
    "SELECT * FROM consultation_acts WHERE consultation_id = $1 ORDER BY created_at ASC",
    [req.params.id],
  );

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const buffers: Buffer[] = [];
  doc.on("data", (chunk) => buffers.push(chunk));

  const primary = "#1f8aa3";
  const primaryDark = "#155e75";
  const accent = "#e8f6f8";
  const border = "#d7e7ec";
  const text = "#163042";
  const muted = "#5f7785";
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.roundedRect(40, 34, pageWidth, 96, 18).fill(primary);

  const logoBuffer = cabinetLogoBuffer(item.cabinet_logo_url);
  if (logoBuffer) {
    doc.roundedRect(56, 50, 64, 64, 14).fill("#ffffff");
    doc.image(logoBuffer, 60, 54, { fit: [56, 56] });
  }

  const headerX = logoBuffer ? 136 : 56;
  doc.fillColor("#ffffff").fontSize(22).text(item.cabinet_name, headerX, 54, { width: 280 });
  doc.fontSize(10);
  let headerLineY = 84;
  const headerLines = [
    item.cabinet_address,
    item.cabinet_phone ? `Téléphone: ${item.cabinet_phone}` : null,
    item.cabinet_email ? `E-mail: ${item.cabinet_email}` : null,
    item.cabinet_ICE ? `ICE: ${item.cabinet_ICE}` : null,
    item.cabinet_IF ? `IF: ${item.cabinet_IF}` : null,
  ].filter(Boolean);
  for (const line of headerLines) {
    doc.text(line as string, headerX, headerLineY, { width: pageWidth - (headerX - 40) - 20 });
    headerLineY += 13;
  }

  doc.fillColor(text);
  doc.roundedRect(40, 148, pageWidth, 56, 16).fill(accent);
  doc.fillColor(primaryDark).fontSize(18).text("Compte rendu de consultation", 56, 166);

  const infoTop = 224;
  const cardGap = 14;
  const cardWidth = (pageWidth - cardGap) / 2;
  doc.roundedRect(40, infoTop, cardWidth, 94, 14).fill("#ffffff").strokeColor(border).lineWidth(1).stroke();
  doc.roundedRect(40 + cardWidth + cardGap, infoTop, cardWidth, 94, 14).fill("#ffffff").strokeColor(border).lineWidth(1).stroke();

  doc.fillColor(primaryDark).fontSize(11).text("Patient", 56, infoTop + 16);
  doc.fillColor(text).fontSize(16).text(`${item.patient_first_name} ${item.patient_last_name}`, 56, infoTop + 34);
  doc.fillColor(muted).fontSize(10);
  if (item.patient_birth_date) {
    doc.text(`Né(e) le ${new Date(item.patient_birth_date).toLocaleDateString("fr-FR")}`, 56, infoTop + 58);
  }

  doc.fillColor(primaryDark).fontSize(11).text("Consultation", 56 + cardWidth + cardGap, infoTop + 16);
  doc.fillColor(text).fontSize(10);
  doc.text(`Date: ${new Date(item.start_time).toLocaleString("fr-FR")}`, 56 + cardWidth + cardGap, infoTop + 36);
  doc.text(`Statut: ${item.status}`, 56 + cardWidth + cardGap, infoTop + 52);
  doc.text(`Motif: ${item.motif_label ?? "-"}`, 56 + cardWidth + cardGap, infoTop + 68, { width: cardWidth - 32 });

  const notesTop = 338;
  doc.roundedRect(40, notesTop, pageWidth, 146, 14).fill("#ffffff").strokeColor(border).lineWidth(1).stroke();
  doc.fillColor(primaryDark).fontSize(12).text("Compte rendu", 56, notesTop + 16);
  doc.fillColor(text).fontSize(10).text(item.notes ?? "-", 56, notesTop + 40, {
    width: pageWidth - 32,
    lineGap: 3,
  });

  const actsTop = 504;
  doc.fillColor(primaryDark).fontSize(12).text("Actes effectués", 56, actsTop);

  const actsBoxTop = actsTop + 20;
  const actsBoxHeight = Math.max(48, 22 + acts.rows.length * 24);
  doc.roundedRect(40, actsBoxTop, pageWidth, actsBoxHeight, 14).fill("#ffffff").strokeColor(border).lineWidth(1).stroke();

  if (!acts.rowCount) {
    doc.fillColor(muted).fontSize(10).text("Aucun acte renseigné.", 56, actsBoxTop + 18);
  } else {
    acts.rows.forEach((act, index) => {
      doc.fillColor(text).fontSize(10).text(`• ${act.label}${act.quantity > 1 ? ` x${act.quantity}` : ""}`, 56, actsBoxTop + 18 + index * 24, {
        width: pageWidth - 32,
      });
    });
  }

  doc.end();
  await new Promise<void>((resolve) => doc.on("end", () => resolve()));
  const pdfBuffer = Buffer.concat(buffers);
  const patientPart = slugifyFilenamePart(`${item.patient_first_name}-${item.patient_last_name}`) || "patient";
  const datePart = exportDatePart(item.start_time);
  const fileName = `CR-${patientPart}-${datePart}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  return res.send(pdfBuffer);
});

consultationsRouter.get("/:id/word", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);

  const data = await pool.query<
    ConsultationRow & {
      patient_first_name: string;
      patient_last_name: string;
      patient_birth_date: string | null;
      cabinet_name: string;
      cabinet_address: string | null;
      cabinet_phone: string | null;
      cabinet_email: string | null;
      cabinet_ICE: string | null;
      cabinet_IF: string | null;
      cabinet_logo_url: string | null;
    }
  >(
    `SELECT c.*, p.first_name AS patient_first_name, p.last_name AS patient_last_name, p.birth_date AS patient_birth_date,
            cab.name AS cabinet_name, cab.address AS cabinet_address, cab.phone AS cabinet_phone, cab.email AS cabinet_email, cab.siret AS cabinet_ICE, cab.adeli AS cabinet_IF, cab.logo_url AS cabinet_logo_url
     FROM consultations c
     JOIN patients p ON p.id = c.patient_id
     JOIN cabinets cab ON cab.id = c.cabinet_id
     WHERE c.id = $1 AND c.cabinet_id = $2`,
    [req.params.id, cabinetId],
  );

  if (!data.rowCount) {
    return res.status(404).json({ message: "Consultation not found" });
  }

  const item = data.rows[0];
  const acts = await pool.query<ConsultationActRow>(
    "SELECT * FROM consultation_acts WHERE consultation_id = $1 ORDER BY created_at ASC",
    [req.params.id],
  );

  const actsHtml = acts.rows.length
    ? acts.rows
        .map(
          (act) => `
            <tr>
              <td style="padding: 0 0 8px 0; font-size: 13px; color: #163042;">
                ${act.label}${act.quantity > 1 ? ` x${act.quantity}` : ""}
              </td>
            </tr>`,
        )
        .join("")
    : `
      <tr>
        <td style="font-size: 13px; color: #5f7785;">Aucun acte renseigné.</td>
      </tr>`;

  const logoMarkup = item.cabinet_logo_url
    ? `<td style="width: 84px; vertical-align: top;">
         <div style="width: 64px; height: 64px; padding: 4px; background: #ffffff; border: 1px solid #d7e7ec;">
           <img src="${item.cabinet_logo_url}" alt="Logo du cabinet" style="width: 56px; height: 56px; object-fit: contain;" />
         </div>
       </td>`
    : "";

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>CR Consultation</title>
        <style>
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #163042;
            margin: 0;
            padding: 24px;
            background: #ffffff;
          }
          .notes {
            white-space: pre-wrap;
            font-size: 13px;
            line-height: 1.55;
          }
        </style>
      </head>
      <body>
        <table role="presentation" style="width: 100%; border-collapse: collapse; background: #1f8aa3; color: #ffffff;">
          <tr>
            <td style="padding: 20px 18px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  ${logoMarkup}
                  <td style="vertical-align: top; padding-left: ${item.cabinet_logo_url ? "8px" : "0"};">
                    <div style="font-size: 26px; font-weight: 700; margin: 0 0 10px 0;">${item.cabinet_name}</div>
                    ${item.cabinet_address ? `<div style="font-size: 13px; margin-bottom: 4px;">${item.cabinet_address}</div>` : ""}
                    ${item.cabinet_phone ? `<div style="font-size: 13px; margin-bottom: 4px;">Téléphone: ${item.cabinet_phone}</div>` : ""}
                    ${item.cabinet_email ? `<div style="font-size: 13px; margin-bottom: 4px;">E-mail: ${item.cabinet_email}</div>` : ""}
                    ${item.cabinet_ICE ? `<div style="font-size: 13px; margin-bottom: 4px;">ICE: ${item.cabinet_ICE}</div>` : ""}
                    ${item.cabinet_IF ? `<div style="font-size: 13px;">IF: ${item.cabinet_IF}</div>` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <table role="presentation" style="width: 100%; border-collapse: collapse; margin-top: 16px;">
          <tr>
            <td style="background: #e8f6f8; color: #155e75; font-size: 20px; font-weight: 700; padding: 14px 16px;">
              Compte rendu de consultation
            </td>
          </tr>
        </table>

        <table role="presentation" style="width: 100%; border-collapse: collapse; margin-top: 16px;">
          <tr>
            <td style="width: 50%; border: 1px solid #d7e7ec; padding: 16px; vertical-align: top;">
              <div style="color: #155e75; font-size: 14px; font-weight: 700; margin-bottom: 10px;">Patient</div>
              <div style="font-size: 20px; font-weight: 700; margin-bottom: 10px;">${item.patient_first_name} ${item.patient_last_name}</div>
              ${item.patient_birth_date ? `<div style="font-size: 13px;">Né(e) le ${new Date(item.patient_birth_date).toLocaleDateString("fr-FR")}</div>` : ""}
            </td>
            <td style="width: 16px;"></td>
            <td style="width: 50%; border: 1px solid #d7e7ec; padding: 16px; vertical-align: top;">
              <div style="color: #155e75; font-size: 14px; font-weight: 700; margin-bottom: 10px;">Consultation</div>
              <div style="font-size: 13px; margin-bottom: 6px;">Date: ${new Date(item.start_time).toLocaleString("fr-FR")}</div>
              <div style="font-size: 13px; margin-bottom: 6px;">Statut: ${item.status}</div>
              <div style="font-size: 13px;">Motif: ${item.motif_label ?? "-"}</div>
            </td>
          </tr>
        </table>

        <table role="presentation" style="width: 100%; border-collapse: collapse; margin-top: 18px; border: 1px solid #d7e7ec;">
          <tr>
            <td style="padding: 16px;">
              <div style="color: #155e75; font-size: 16px; font-weight: 700; margin-bottom: 12px;">Compte rendu</div>
              <div class="notes">${(item.notes ?? "-").replace(/\n/g, "<br/>")}</div>
            </td>
          </tr>
        </table>

        <table role="presentation" style="width: 100%; border-collapse: collapse; margin-top: 18px; border: 1px solid #d7e7ec;">
          <tr>
            <td style="padding: 16px;">
              <div style="color: #155e75; font-size: 16px; font-weight: 700; margin-bottom: 12px;">Actes effectués</div>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                ${actsHtml}
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const patientPart = slugifyFilenamePart(`${item.patient_first_name}-${item.patient_last_name}`) || "patient";
  const datePart = exportDatePart(item.start_time);
  const fileName = `CR-${patientPart}-${datePart}.doc`;

  res.setHeader("Content-Type", "application/msword; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  return res.send(html);
});

