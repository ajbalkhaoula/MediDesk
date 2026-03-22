import { Router } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorization.js";
import { ensureUserCabinet } from "../lib/cabinet.js";

const updateInvoiceSchema = z.object({
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional().nullable(),
  status: z.enum(["draft", "paid"]).optional(),
});

const updateInvoiceLineSchema = z.object({
  quantity: z.number().int().min(1).optional(),
  unit_price: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(),
  label: z.string().min(1).optional(),
  remark: z.string().optional().nullable(),
});

const createInvoiceSchema = z.union([
  z.object({
    patient_id: z.string().uuid(),
    consultation_act_ids: z.array(z.string().uuid()).min(1),
    notes: z.string().optional().nullable(),
  }),
  z.object({
    patient_id: z.string().uuid(),
    date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().optional().nullable(),
  }),
]);

const createInvoiceFromConsultationSchema = z.object({
  consultation_id: z.string().uuid(),
});

interface UnbilledActRow {
  id: string;
  consultation_id: string;
  prestation_id: string;
  label: string;
  quantity: number;
  unit_price: string;
  total: string;
  start_time: string;
  motif_label: string | null;
}

interface InvoiceRow {
  id: string;
  cabinet_id: string;
  patient_id: string;
  invoice_number: string;
  status: "draft" | "sent" | "paid";
  invoice_date: string;
  total_ht: string;
  total_ttc: string;
  notes: string | null;
  pdf_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  patient_first_name?: string;
  patient_last_name?: string;
}

interface InvoiceLineRow {
  id: string;
  invoice_id: string;
  consultation_id: string | null;
  consultation_act_id: string | null;
  prestation_id: string | null;
  label: string;
  quantity: number;
  unit_price: string;
  original_unit_price: string;
  total: string;
  remark: string | null;
  line_order: number;
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

function toInvoice(row: InvoiceRow) {
  return {
    id: row.id,
    cabinetId: row.cabinet_id,
    patientId: row.patient_id,
    invoiceNumber: row.invoice_number,
    status: row.status === "sent" ? "draft" : row.status,
    invoiceDate: row.invoice_date,
    totalHt: Number(row.total_ht),
    totalTtc: Number(row.total_ttc),
    notes: row.notes,
    pdfUrl: row.pdf_url,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    paidAt: row.paid_at,
    patientName:
      row.patient_first_name && row.patient_last_name
        ? `${row.patient_first_name} ${row.patient_last_name}`
        : undefined,
  };
}

function toInvoiceLine(row: InvoiceLineRow) {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    consultationId: row.consultation_id,
    consultationActId: row.consultation_act_id,
    prestationId: row.prestation_id,
    label: row.label,
    quantity: row.quantity,
    unitPrice: Number(row.unit_price),
    originalUnitPrice: Number(row.original_unit_price),
    total: Number(row.total),
    remark: row.remark,
    lineOrder: row.line_order,
    createdAt: row.created_at,
  };
}

async function recalculateInvoiceTotals(client: { query: typeof pool.query }, invoiceId: string) {
  const totals = await client.query<{ total_ht: string }>(
    `SELECT COALESCE(SUM(total), 0)::numeric(10,2) AS total_ht
     FROM invoice_lines
     WHERE invoice_id = $1`,
    [invoiceId],
  );
  const totalHt = Number(totals.rows[0].total_ht);
  await client.query(
    `UPDATE invoices
     SET total_ht = $1,
         total_ttc = $1,
         updated_at = now()
     WHERE id = $2`,
    [totalHt, invoiceId],
  );
}

async function generateInvoiceNumber(client: { query: typeof pool.query }, cabinetId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`invoice-number-${cabinetId}-${year}`]);

  const result = await client.query<{ last_number: string | null }>(
    `SELECT MAX(invoice_number) AS last_number
     FROM invoices
     WHERE cabinet_id = $1
       AND invoice_number LIKE $2`,
    [cabinetId, `FACT-${year}-%`],
  );
  const last = result.rows[0].last_number;
  const lastSeq = last ? Number(last.split("-")[2]) : 0;
  const nextSeq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return `FACT-${year}-${String(nextSeq).padStart(3, "0")}`;
}

export const billingRouter = Router();

billingRouter.use(requireAuth);
billingRouter.use(requireRole("admin", "praticien", "assistant"));

billingRouter.get("/patients/:id/unbilled-acts", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);
  const rows = await pool.query<UnbilledActRow>(
    `SELECT ca.id, ca.consultation_id, ca.prestation_id, ca.label, ca.quantity, ca.unit_price, ca.total,
            c.start_time, c.motif_label
     FROM consultation_acts ca
     JOIN consultations c ON c.id = ca.consultation_id
     WHERE c.cabinet_id = $1
       AND c.patient_id = $2
       AND c.status = 'completed'
       AND ca.invoice_line_id IS NULL
     ORDER BY c.start_time DESC, ca.created_at ASC`,
    [cabinetId, req.params.id],
  );

  return res.json({
    acts: rows.rows.map((row) => ({
      id: row.id,
      consultationId: row.consultation_id,
      prestationId: row.prestation_id,
      label: row.label,
      quantity: row.quantity,
      unitPrice: Number(row.unit_price),
      total: Number(row.total),
      consultationDate: row.start_time,
      motifLabel: row.motif_label,
    })),
  });
});

billingRouter.get("/invoices/by-consultation/:consultationId", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);
  const invoice = await pool.query<InvoiceRow>(
    `SELECT DISTINCT i.*, p.first_name AS patient_first_name, p.last_name AS patient_last_name
     FROM invoices i
     JOIN invoice_lines il ON il.invoice_id = i.id
     JOIN patients p ON p.id = i.patient_id
     WHERE i.cabinet_id = $1
       AND il.consultation_id = $2
     ORDER BY i.created_at DESC
     LIMIT 1`,
    [cabinetId, req.params.consultationId],
  );

  if (!invoice.rowCount) {
    return res.status(404).json({ message: "Invoice not found for consultation" });
  }

  return res.json({ invoice: toInvoice(invoice.rows[0]) });
});

billingRouter.post("/invoices/from-consultation", async (req: AuthenticatedRequest, res) => {
  const parsed = createInvoiceFromConsultationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const cabinetId = await ensureUserCabinet(req.user!.id);
  const consultationId = parsed.data.consultation_id;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existingInvoice = await client.query<InvoiceRow>(
      `SELECT DISTINCT i.*, p.first_name AS patient_first_name, p.last_name AS patient_last_name
       FROM invoices i
       JOIN invoice_lines il ON il.invoice_id = i.id
       JOIN patients p ON p.id = i.patient_id
       WHERE i.cabinet_id = $1
         AND il.consultation_id = $2
       ORDER BY i.created_at DESC
       LIMIT 1`,
      [cabinetId, consultationId],
    );

    if (existingInvoice.rowCount) {
      await client.query("COMMIT");
      return res.json({ invoice: toInvoice(existingInvoice.rows[0]), created: false });
    }

    const consultation = await client.query<{ id: string; patient_id: string; status: string }>(
      `SELECT id, patient_id, status
       FROM consultations
       WHERE id = $1
         AND cabinet_id = $2
       FOR UPDATE`,
      [consultationId, cabinetId],
    );

    if (!consultation.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Consultation not found" });
    }

    if (consultation.rows[0].status !== "completed") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Only completed consultations can be invoiced." });
    }

    const actsRows = (
      await client.query<UnbilledActRow>(
        `SELECT ca.id, ca.consultation_id, ca.prestation_id, ca.label, ca.quantity, ca.unit_price, ca.total,
                c.start_time, c.motif_label
         FROM consultation_acts ca
         JOIN consultations c ON c.id = ca.consultation_id
         WHERE c.cabinet_id = $1
           AND c.id = $2
           AND ca.invoice_line_id IS NULL
         ORDER BY ca.created_at ASC`,
        [cabinetId, consultationId],
      )
    ).rows;

    if (!actsRows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "No billable acts found for this consultation." });
    }

    const invoiceNumber = await generateInvoiceNumber(client, cabinetId);
    const createdInvoice = await client.query<InvoiceRow>(
      `INSERT INTO invoices (cabinet_id, patient_id, invoice_number, status, invoice_date, created_by)
       VALUES ($1, $2, $3, 'draft', CURRENT_DATE, $4)
       RETURNING *`,
      [cabinetId, consultation.rows[0].patient_id, invoiceNumber, req.user!.id],
    );
    const invoice = createdInvoice.rows[0];

    for (let index = 0; index < actsRows.length; index += 1) {
      const act = actsRows[index];
      const lineInserted = await client.query<InvoiceLineRow>(
        `INSERT INTO invoice_lines (
           invoice_id, consultation_id, consultation_act_id, prestation_id, label,
           quantity, unit_price, original_unit_price, total, line_order
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9)
         RETURNING *`,
        [
          invoice.id,
          consultationId,
          act.id,
          act.prestation_id,
          act.label,
          act.quantity,
          Number(act.unit_price),
          Number(act.total),
          index,
        ],
      );
      await client.query("UPDATE consultation_acts SET invoice_line_id = $1 WHERE id = $2", [lineInserted.rows[0].id, act.id]);
    }

    await recalculateInvoiceTotals(client, invoice.id);
    const finalInvoice = await client.query<InvoiceRow>(
      `SELECT i.*, p.first_name AS patient_first_name, p.last_name AS patient_last_name
       FROM invoices i
       JOIN patients p ON p.id = i.patient_id
       WHERE i.id = $1`,
      [invoice.id],
    );

    await client.query("COMMIT");
    return res.status(201).json({ invoice: toInvoice(finalInvoice.rows[0]), created: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ message: "Unable to create invoice from consultation" });
  } finally {
    client.release();
  }
});

billingRouter.post("/invoices", async (req: AuthenticatedRequest, res) => {
  const parsed = createInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const cabinetId = await ensureUserCabinet(req.user!.id);
  const data = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const patient = await client.query("SELECT id FROM patients WHERE id = $1 AND cabinet_id = $2", [
      data.patient_id,
      cabinetId,
    ]);
    if (!patient.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Patient not found" });
    }

    let actsRows: UnbilledActRow[] = [];
    if ("consultation_act_ids" in data) {
      actsRows = (
        await client.query<UnbilledActRow>(
          `SELECT ca.id, ca.consultation_id, ca.prestation_id, ca.label, ca.quantity, ca.unit_price, ca.total,
                  c.start_time, c.motif_label
           FROM consultation_acts ca
           JOIN consultations c ON c.id = ca.consultation_id
           WHERE c.cabinet_id = $1
             AND c.patient_id = $2
             AND c.status = 'completed'
             AND ca.invoice_line_id IS NULL
             AND ca.id = ANY($3::uuid[])`,
          [cabinetId, data.patient_id, data.consultation_act_ids],
        )
      ).rows;
    } else {
      actsRows = (
        await client.query<UnbilledActRow>(
          `SELECT ca.id, ca.consultation_id, ca.prestation_id, ca.label, ca.quantity, ca.unit_price, ca.total,
                  c.start_time, c.motif_label
           FROM consultation_acts ca
           JOIN consultations c ON c.id = ca.consultation_id
           WHERE c.cabinet_id = $1
             AND c.patient_id = $2
             AND c.status = 'completed'
             AND ca.invoice_line_id IS NULL
             AND c.start_time::date >= $3::date
             AND c.start_time::date <= $4::date`,
          [cabinetId, data.patient_id, data.date_from, data.date_to],
        )
      ).rows;
    }

    if (!actsRows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "No unbilled acts found for invoice creation." });
    }

    const invoiceNumber = await generateInvoiceNumber(client, cabinetId);
    const createdInvoice = await client.query<InvoiceRow>(
      `INSERT INTO invoices (cabinet_id, patient_id, invoice_number, status, invoice_date, notes, created_by)
       VALUES ($1, $2, $3, 'draft', CURRENT_DATE, $4, $5)
       RETURNING *`,
      [cabinetId, data.patient_id, invoiceNumber, normalizeNullable(data.notes), req.user!.id],
    );
    const invoice = createdInvoice.rows[0];

    for (let index = 0; index < actsRows.length; index += 1) {
      const act = actsRows[index];
      const lineInserted = await client.query<InvoiceLineRow>(
        `INSERT INTO invoice_lines (
           invoice_id, consultation_id, consultation_act_id, prestation_id, label,
           quantity, unit_price, original_unit_price, total, line_order
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9)
         RETURNING *`,
        [
          invoice.id,
          act.consultation_id,
          act.id,
          act.prestation_id,
          act.label,
          act.quantity,
          Number(act.unit_price),
          Number(act.total),
          index,
        ],
      );
      await client.query(
        "UPDATE consultation_acts SET invoice_line_id = $1 WHERE id = $2",
        [lineInserted.rows[0].id, act.id],
      );
    }

    await recalculateInvoiceTotals(client, invoice.id);
    const lines = await client.query<InvoiceLineRow>(
      "SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY line_order ASC, created_at ASC",
      [invoice.id],
    );
    const invoiceFinal = await client.query<InvoiceRow>("SELECT * FROM invoices WHERE id = $1", [invoice.id]);

    await client.query("COMMIT");
    return res.status(201).json({
      invoice: toInvoice(invoiceFinal.rows[0]),
      lines: lines.rows.map(toInvoiceLine),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ message: "Unable to create invoice" });
  } finally {
    client.release();
  }
});

billingRouter.get("/invoices", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);
  const patientId = typeof req.query.patient_id === "string" ? req.query.patient_id : null;
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const dateFrom = typeof req.query.date_from === "string" ? req.query.date_from : null;
  const dateTo = typeof req.query.date_to === "string" ? req.query.date_to : null;
  const prestationId = typeof req.query.prestation_id === "string" ? req.query.prestation_id : null;
  const minAmount = typeof req.query.min_amount === "string" ? Number(req.query.min_amount) : null;
  const maxAmount = typeof req.query.max_amount === "string" ? Number(req.query.max_amount) : null;
  const page = typeof req.query.page === "string" ? Math.max(1, Number(req.query.page)) : 1;
  const pageSize = typeof req.query.page_size === "string" ? Math.max(1, Math.min(100, Number(req.query.page_size))) : 20;
  const offset = (page - 1) * pageSize;

  const params: unknown[] = [cabinetId];
  const filters: string[] = ["i.cabinet_id = $1"];

  if (patientId) {
    params.push(patientId);
    filters.push(`i.patient_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    filters.push(`i.status = $${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    filters.push(`i.invoice_date >= $${params.length}::date`);
  }
  if (dateTo) {
    params.push(dateTo);
    filters.push(`i.invoice_date <= $${params.length}::date`);
  }
  if (prestationId) {
    params.push(prestationId);
    filters.push(`EXISTS (SELECT 1 FROM invoice_lines il WHERE il.invoice_id = i.id AND il.prestation_id = $${params.length})`);
  }
  if (minAmount !== null && Number.isFinite(minAmount)) {
    params.push(minAmount);
    filters.push(`i.total_ttc >= $${params.length}`);
  }
  if (maxAmount !== null && Number.isFinite(maxAmount)) {
    params.push(maxAmount);
    filters.push(`i.total_ttc <= $${params.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const countQuery = `SELECT COUNT(*)::int AS count FROM invoices i ${whereClause}`;
  const countResult = await pool.query<{ count: number }>(countQuery, params);
  const total = countResult.rows[0]?.count ?? 0;

  params.push(pageSize);
  params.push(offset);
  const query = `
    SELECT i.*, p.first_name AS patient_first_name, p.last_name AS patient_last_name
    FROM invoices i
    JOIN patients p ON p.id = i.patient_id
    ${whereClause}
    ORDER BY i.invoice_date DESC, i.created_at DESC
    LIMIT $${params.length - 1}
    OFFSET $${params.length}
  `;
  const rows = await pool.query<InvoiceRow>(query, params);

  return res.json({
    invoices: rows.rows.map(toInvoice),
    page,
    pageSize,
    total,
  });
});

billingRouter.get("/invoices/:id", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);
  const invoice = await pool.query<InvoiceRow>(
    "SELECT * FROM invoices WHERE id = $1 AND cabinet_id = $2",
    [req.params.id, cabinetId],
  );
  if (!invoice.rowCount) {
    return res.status(404).json({ message: "Invoice not found" });
  }
  const lines = await pool.query<InvoiceLineRow>(
    "SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY line_order ASC, created_at ASC",
    [req.params.id],
  );

  return res.json({
    invoice: toInvoice(invoice.rows[0]),
    lines: lines.rows.map(toInvoiceLine),
  });
});

billingRouter.patch("/invoices/:id", async (req: AuthenticatedRequest, res) => {
  const parsed = updateInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }
  const cabinetId = await ensureUserCabinet(req.user!.id);
  const existing = await pool.query<InvoiceRow>(
    "SELECT * FROM invoices WHERE id = $1 AND cabinet_id = $2",
    [req.params.id, cabinetId],
  );
  if (!existing.rowCount) {
    return res.status(404).json({ message: "Invoice not found" });
  }
  if (existing.rows[0].status === "paid") {
    return res.status(403).json({ message: "Paid invoices are locked." });
  }

  const data = parsed.data;
  const updated = await pool.query<InvoiceRow>(
    `UPDATE invoices
     SET invoice_date = COALESCE($1::date, invoice_date),
         notes = COALESCE($2, notes),
         status = COALESCE($3, status),
         paid_at = CASE
           WHEN COALESCE($3, status) = 'paid' THEN now()
           ELSE paid_at
         END,
         updated_at = now()
     WHERE id = $4
       AND cabinet_id = $5
     RETURNING *`,
    [data.invoice_date ?? null, normalizeNullable(data.notes), data.status ?? null, req.params.id, cabinetId],
  );
  return res.json({ invoice: toInvoice(updated.rows[0]) });
});

billingRouter.patch("/invoices/:id/lines/:lineId", async (req: AuthenticatedRequest, res) => {
  const parsed = updateInvoiceLineSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }
  const cabinetId = await ensureUserCabinet(req.user!.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const invoice = await client.query<InvoiceRow>(
      "SELECT * FROM invoices WHERE id = $1 AND cabinet_id = $2 FOR UPDATE",
      [req.params.id, cabinetId],
    );
    if (!invoice.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Invoice not found" });
    }
    if (invoice.rows[0].status === "paid") {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Paid invoices are locked." });
    }

    const line = await client.query<InvoiceLineRow>(
      "SELECT * FROM invoice_lines WHERE id = $1 AND invoice_id = $2 FOR UPDATE",
      [req.params.lineId, req.params.id],
    );
    if (!line.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Invoice line not found" });
    }

    const current = line.rows[0];
    const data = parsed.data;
    const nextQuantity = data.quantity ?? current.quantity;
    const nextUnitPrice = data.unit_price ?? Number(current.unit_price);
    const nextTotal = data.total ?? Number((nextQuantity * nextUnitPrice).toFixed(2));
    const nextLabel = data.label ?? current.label;
    const nextRemark = normalizeNullable(data.remark ?? current.remark);
    const originalUnitPrice = Number(current.original_unit_price);
    const originalTotalWithCurrentQty = Number((nextQuantity * originalUnitPrice).toFixed(2));
    if ((nextUnitPrice !== originalUnitPrice || nextTotal !== originalTotalWithCurrentQty) && !nextRemark) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "A remark is required when editing a price." });
    }

    const updatedLine = await client.query<InvoiceLineRow>(
      `UPDATE invoice_lines
       SET quantity = $1,
           unit_price = $2,
           total = $3,
           label = $4,
           remark = $5
       WHERE id = $6
         AND invoice_id = $7
       RETURNING *`,
      [nextQuantity, nextUnitPrice, nextTotal, nextLabel, nextRemark, req.params.lineId, req.params.id],
    );

    await recalculateInvoiceTotals(client, req.params.id);
    const invoiceUpdated = await client.query<InvoiceRow>("SELECT * FROM invoices WHERE id = $1", [req.params.id]);

    await client.query("COMMIT");
    return res.json({
      invoice: toInvoice(invoiceUpdated.rows[0]),
      line: toInvoiceLine(updatedLine.rows[0]),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ message: "Unable to update invoice line" });
  } finally {
    client.release();
  }
});

billingRouter.delete("/invoices/:id/lines/:lineId", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invoice = await client.query<InvoiceRow>(
      "SELECT * FROM invoices WHERE id = $1 AND cabinet_id = $2 FOR UPDATE",
      [req.params.id, cabinetId],
    );
    if (!invoice.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Invoice not found" });
    }
    if (invoice.rows[0].status === "paid") {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Paid invoices are locked." });
    }

    const line = await client.query<InvoiceLineRow>(
      "SELECT * FROM invoice_lines WHERE id = $1 AND invoice_id = $2 FOR UPDATE",
      [req.params.lineId, req.params.id],
    );
    if (!line.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Invoice line not found" });
    }

    await client.query(
      "UPDATE consultation_acts SET invoice_line_id = NULL WHERE invoice_line_id = $1",
      [req.params.lineId],
    );
    await client.query(
      "DELETE FROM invoice_lines WHERE id = $1 AND invoice_id = $2",
      [req.params.lineId, req.params.id],
    );
    await recalculateInvoiceTotals(client, req.params.id);
    await client.query("COMMIT");
    return res.status(204).send();
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ message: "Unable to delete invoice line" });
  } finally {
    client.release();
  }
});

billingRouter.delete("/invoices/:id", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invoice = await client.query<InvoiceRow>(
      "SELECT * FROM invoices WHERE id = $1 AND cabinet_id = $2 FOR UPDATE",
      [req.params.id, cabinetId],
    );
    if (!invoice.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Invoice not found" });
    }
    if (invoice.rows[0].status !== "draft") {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Only draft invoices can be deleted." });
    }

    await client.query(
      `UPDATE consultation_acts
       SET invoice_line_id = NULL
       WHERE invoice_line_id IN (
         SELECT id
         FROM invoice_lines
         WHERE invoice_id = $1
       )`,
      [req.params.id],
    );

    await client.query("DELETE FROM invoices WHERE id = $1 AND cabinet_id = $2", [req.params.id, cabinetId]);
    await client.query("COMMIT");
    return res.status(204).send();
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ message: "Unable to delete invoice" });
  } finally {
    client.release();
  }
});

billingRouter.get("/invoices/:id/pdf", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);

  const invoice = await pool.query<InvoiceRow & { patient_first_name: string; patient_last_name: string; cabinet_name: string; cabinet_address: string | null; cabinet_phone: string | null; cabinet_email: string | null; cabinet_ICE: string | null; cabinet_IF: string | null; cabinet_logo_url: string | null }>(
    `SELECT i.*, p.first_name AS patient_first_name, p.last_name AS patient_last_name,
            c.name AS cabinet_name, c.address AS cabinet_address, c.phone AS cabinet_phone, c.email AS cabinet_email, c.siret AS cabinet_ICE, c.adeli AS cabinet_IF, c.logo_url AS cabinet_logo_url
     FROM invoices i
     JOIN patients p ON p.id = i.patient_id
     JOIN cabinets c ON c.id = i.cabinet_id
     WHERE i.id = $1
       AND i.cabinet_id = $2`,
    [req.params.id, cabinetId],
  );
  if (!invoice.rowCount) {
    return res.status(404).json({ message: "Invoice not found" });
  }
  const lines = await pool.query<InvoiceLineRow>(
    "SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY line_order ASC, created_at ASC",
    [req.params.id],
  );

  const inv = invoice.rows[0];
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const buffers: Buffer[] = [];
  doc.on("data", (chunk) => buffers.push(chunk));
  doc.on("error", (err) => {
    throw err;
  });

  const primary = "#1f8aa3";
  const primaryDark = "#155e75";
  const accent = "#e8f6f8";
  const border = "#d7e7ec";
  const text = "#163042";
  const muted = "#5f7785";
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.roundedRect(40, 34, pageWidth, 96, 18).fill(primary);

  const logoBuffer = cabinetLogoBuffer(inv.cabinet_logo_url);
  if (logoBuffer) {
    doc.roundedRect(56, 50, 64, 64, 14).fill("#ffffff");
    doc.image(logoBuffer, 60, 54, { fit: [56, 56] });
  }

  const headerX = logoBuffer ? 136 : 56;
  doc.fillColor("#ffffff").fontSize(22).text(inv.cabinet_name, headerX, 54, { width: 280 });
  doc.fontSize(10);
  let headerLineY = 84;
  const headerLines = [
    inv.cabinet_address,
    inv.cabinet_phone ? `Téléphone: ${inv.cabinet_phone}` : null,
    inv.cabinet_email ? `E-mail: ${inv.cabinet_email}` : null,
    inv.cabinet_ICE ? `ICE: ${inv.cabinet_ICE}` : null,
    inv.cabinet_IF ? `IF: ${inv.cabinet_IF}` : null,
  ].filter(Boolean);
  for (const line of headerLines) {
    doc.text(line as string, headerX, headerLineY, { width: pageWidth - (headerX - 40) - 20 });
    headerLineY += 13;
  }

  doc.fillColor(text);
  doc.roundedRect(40, 148, pageWidth, 56, 16).fill(accent);
  doc.fillColor(primaryDark).fontSize(18).text(`Facture ${inv.invoice_number}`, 56, 166);

  const infoTop = 224;
  const cardGap = 14;
  const cardWidth = (pageWidth - cardGap) / 2;
  doc.roundedRect(40, infoTop, cardWidth, 94, 14).fill("#ffffff").strokeColor(border).lineWidth(1).stroke();
  doc.roundedRect(40 + cardWidth + cardGap, infoTop, cardWidth, 94, 14).fill("#ffffff").strokeColor(border).lineWidth(1).stroke();

  doc.fillColor(primaryDark).fontSize(11).text("Patient", 56, infoTop + 16);
  doc.fillColor(text).fontSize(16).text(`${inv.patient_first_name} ${inv.patient_last_name}`, 56, infoTop + 34);

  doc.fillColor(primaryDark).fontSize(11).text("Facturation", 56 + cardWidth + cardGap, infoTop + 16);
  doc.fillColor(text).fontSize(10);
  doc.text(`Date: ${new Date(inv.invoice_date).toLocaleDateString("fr-FR")}`, 56 + cardWidth + cardGap, infoTop + 36);
  doc.text(`Statut: ${inv.status}`, 56 + cardWidth + cardGap, infoTop + 52);
  doc.text(`Référence: ${inv.invoice_number}`, 56 + cardWidth + cardGap, infoTop + 68);

  const tableTop = 344;
  const columns = { label: 56, qty: 315, unit: 382, total: 462 };
  doc.fillColor(primaryDark).fontSize(12).text("Lignes de facture", 40, tableTop - 20);
  doc.roundedRect(40, tableTop, pageWidth, 28, 10).fill(primaryDark);
  doc.fillColor("#ffffff").fontSize(10);
  doc.text("Libellé", columns.label, tableTop + 9);
  doc.text("Qté", columns.qty, tableTop + 9);
  doc.text("PU", columns.unit, tableTop + 9);
  doc.text("Total", columns.total, tableTop + 9);

  let rowY = tableTop + 28;
  lines.rows.forEach((line, index) => {
    const rowHeight = line.remark ? 42 : 32;
    doc.roundedRect(40, rowY, pageWidth, rowHeight, 0).fill(index % 2 === 0 ? "#ffffff" : "#f7fbfc").strokeColor(border).lineWidth(1).stroke();
    doc.fillColor(text).fontSize(10);
    doc.text(line.label, columns.label, rowY + 10, { width: 230 });
    doc.text(String(line.quantity), columns.qty, rowY + 10);
    doc.text(String(line.unit_price), columns.unit, rowY + 10);
    doc.text(String(line.total), columns.total, rowY + 10);
    if (line.remark) {
      doc.fillColor(muted).fontSize(9).text(`Remarque: ${line.remark}`, columns.label, rowY + 24, { width: pageWidth - 32 });
    }
    rowY += rowHeight;
  });

  doc.roundedRect(326, rowY + 14, 210, 70, 12).fill(accent);
  doc.fillColor(primaryDark).fontSize(11).text("Total HT", 342, rowY + 28);
  doc.fillColor(text).fontSize(14).text(`${Number(inv.total_ht).toFixed(2)} MAD`, 420, rowY + 24, { width: 100, align: "right" });
  doc.fillColor(primaryDark).fontSize(11).text("Total TTC", 342, rowY + 54);
  doc.fillColor(text).fontSize(16).text(`${Number(inv.total_ttc).toFixed(2)} MAD`, 410, rowY + 48, { width: 110, align: "right" });

  if (inv.notes) {
    const notesTop = rowY + 104;
    doc.roundedRect(40, notesTop, pageWidth, 84, 14).fill("#ffffff").strokeColor(border).lineWidth(1).stroke();
    doc.fillColor(primaryDark).fontSize(12).text("Notes", 56, notesTop + 16);
    doc.fillColor(text).fontSize(10).text(inv.notes, 56, notesTop + 38, { width: pageWidth - 32, lineGap: 3 });
  }

  doc.end();
  await new Promise<void>((resolve) => doc.on("end", () => resolve()));
  const pdfBuffer = Buffer.concat(buffers);
  const patientPart = slugifyFilenamePart(`${inv.patient_first_name}-${inv.patient_last_name}`) || "patient";
  const datePart = exportDatePart(inv.invoice_date);
  const fileName = `FAC-${patientPart}-${datePart}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  return res.send(pdfBuffer);
});

