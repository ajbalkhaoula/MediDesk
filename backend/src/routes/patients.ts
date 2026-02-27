import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorization.js";
import { ensureUserCabinet } from "../lib/cabinet.js";

const genderSchema = z.enum(["M", "F", "autre"]);
const schoolTypeSchema = z.enum(["bilingue", "mission", "autre"]);
const districtSchema = z.enum([
  "Anfa",
  "Aïn Diab",
  "Maârif",
  "Gauthier",
  "Bourgogne",
  "Sidi Maarouf",
  "Hay Hassani",
  "Ben M'Sik",
  "Sidi Moumen",
  "Aïn Sebaâ",
  "Derb Sultan",
  "Mers Sultan",
  "Roches Noires",
  "Sbata",
  "Lissasfa",
  "Oulfa",
  "autre",
]);

const patientMedicalSchema = z.object({
  reason: z.string().optional(),
  medicalHistory: z.string().optional(),
  familyHistory: z.string().optional(),
  currentTreatments: z.string().optional(),
  allergies: z.string().optional(),
  notes: z.string().optional(),
});

const basePatientSchema = z.object({
  photoUrl: z.string().optional().nullable(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  gender: genderSchema.optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  doctor: z.string().optional().nullable(),
  insurance: z.string().optional().nullable(),
  schoolType: schoolTypeSchema.optional().nullable(),
  schoolLevel: z.string().optional().nullable(),
  diagnosis: z.string().optional().nullable(),
  parentFirstName: z.string().optional().nullable(),
  parentLastName: z.string().optional().nullable(),
  parentEmail: z.string().email().optional().nullable(),
  district: districtSchema.optional().nullable(),
  parentPhone1: z.string().optional().nullable(),
  parentPhone2: z.string().optional().nullable(),
  status: z.enum(["active", "archived"]).optional(),
  medicalData: patientMedicalSchema.optional(),
});

const createPatientSchema = basePatientSchema;
const updatePatientSchema = basePatientSchema;

interface PatientListRow {
  id: string;
  photo_url: string | null;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  status: "active" | "archived";
  address: string | null;
  diagnosis: string | null;
  reason: string | null;
  school_type: "bilingue" | "mission" | "autre" | null;
  school_level: string | null;
  parent_first_name: string | null;
  parent_last_name: string | null;
  parent_email: string | null;
  district: string | null;
  parent_phone_1: string | null;
  parent_phone_2: string | null;
  sessions_count: number | null;
  last_session_date: string | null;
  created_at: string;
}

function normalizeNullable(value?: string | null): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export const patientsRouter = Router();

patientsRouter.use(requireAuth);
patientsRouter.use(requireRole("admin", "praticien", "assistant"));

patientsRouter.get("/", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status : "active";
  const statusFilter = status === "all" ? null : status;

  const result = await pool.query(
    `SELECT p.id, p.photo_url, p.first_name, p.last_name, p.birth_date, p.status, p.address,
            p.school_type, p.school_level, p.diagnosis,
            p.parent_first_name, p.parent_last_name, p.parent_email,
            p.district, p.parent_phone_1, p.parent_phone_2,
            p.sessions_count, p.last_session_date, p.created_at,
            md.reason
     FROM patients p
     LEFT JOIN patient_medical_data md ON md.patient_id = p.id
     WHERE p.cabinet_id = $1
       AND ($2::text IS NULL OR p.status = $2)
       AND (
         $3::text = ''
         OR p.first_name ILIKE '%' || $3 || '%'
         OR p.last_name ILIKE '%' || $3 || '%'
         OR COALESCE(p.parent_first_name, '') ILIKE '%' || $3 || '%'
         OR COALESCE(p.parent_last_name, '') ILIKE '%' || $3 || '%'
         OR COALESCE(p.parent_email, '') ILIKE '%' || $3 || '%'
         OR COALESCE(p.parent_phone_1, '') ILIKE '%' || $3 || '%'
         OR COALESCE(p.parent_phone_2, '') ILIKE '%' || $3 || '%'
         OR COALESCE(p.diagnosis, '') ILIKE '%' || $3 || '%'
         OR COALESCE(md.reason, '') ILIKE '%' || $3 || '%'
       )
     ORDER BY p.last_name ASC, p.first_name ASC`,
    [cabinetId, statusFilter, search],
  );

  return res.json({
    patients: result.rows.map((row) => {
      const typedRow = row as PatientListRow;
      return {
        id: typedRow.id,
        photoUrl: typedRow.photo_url,
        firstName: typedRow.first_name,
        lastName: typedRow.last_name,
        birthDate: typedRow.birth_date,
        status: typedRow.status,
        address: typedRow.address,
        diagnosis: typedRow.diagnosis ?? typedRow.reason ?? null,
        schoolType: typedRow.school_type,
        schoolLevel: typedRow.school_level,
        parentFirstName: typedRow.parent_first_name,
        parentLastName: typedRow.parent_last_name,
        parentEmail: typedRow.parent_email,
        district: typedRow.district,
        parentPhone1: typedRow.parent_phone_1,
        parentPhone2: typedRow.parent_phone_2,
        sessionsCount: typedRow.sessions_count ?? 0,
        lastSessionDate: typedRow.last_session_date,
        createdAt: typedRow.created_at,
      };
    }),
  });
});

patientsRouter.get("/:id", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);

  const result = await pool.query(
    `SELECT p.id, p.photo_url, p.first_name, p.last_name, p.birth_date, p.gender, p.address,
            p.phone, p.email, p.doctor, p.insurance, p.status,
            p.school_type, p.school_level, p.diagnosis,
            p.parent_first_name, p.parent_last_name, p.parent_email,
            p.district, p.parent_phone_1, p.parent_phone_2,
            p.sessions_count, p.last_session_date,
            p.created_at, p.updated_at,
            md.reason, md.medical_history, md.family_history, md.current_treatments, md.allergies, md.notes
     FROM patients p
     LEFT JOIN patient_medical_data md ON md.patient_id = p.id
     WHERE p.id = $1 AND p.cabinet_id = $2`,
    [req.params.id, cabinetId],
  );

  if (!result.rowCount) {
    return res.status(404).json({ message: "Patient not found" });
  }

  const row = result.rows[0];
  return res.json({
    patient: {
      id: row.id,
      photoUrl: row.photo_url,
      firstName: row.first_name,
      lastName: row.last_name,
      birthDate: row.birth_date,
      gender: row.gender,
      address: row.address,
      phone: row.phone,
      email: row.email,
      doctor: row.doctor,
      insurance: row.insurance,
      status: row.status,
      schoolType: row.school_type,
      schoolLevel: row.school_level,
      diagnosis: row.diagnosis,
      parentFirstName: row.parent_first_name,
      parentLastName: row.parent_last_name,
      parentEmail: row.parent_email,
      district: row.district,
      parentPhone1: row.parent_phone_1,
      parentPhone2: row.parent_phone_2,
      sessionsCount: row.sessions_count ?? 0,
      lastSessionDate: row.last_session_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      medicalData: {
        reason: row.reason,
        medicalHistory: row.medical_history,
        familyHistory: row.family_history,
        currentTreatments: row.current_treatments,
        allergies: row.allergies,
        notes: row.notes,
      },
    },
  });
});

patientsRouter.post("/", async (req: AuthenticatedRequest, res) => {
  const parsed = createPatientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const cabinetId = await ensureUserCabinet(req.user!.id);
  const data = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const diagnosis = normalizeNullable(data.diagnosis) ?? normalizeNullable(data.medicalData?.reason);

    const inserted = await client.query(
      `INSERT INTO patients (
         cabinet_id, photo_url, first_name, last_name, birth_date, gender, address, phone, email,
         doctor, insurance, school_type, school_level, diagnosis,
         parent_first_name, parent_last_name, parent_email, district, parent_phone_1, parent_phone_2,
         status, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, COALESCE($21, 'active'), $22)
       RETURNING id, photo_url, first_name, last_name, birth_date, status, diagnosis, school_level, parent_phone_1, sessions_count, last_session_date, created_at`,
      [
        cabinetId,
        normalizeNullable(data.photoUrl),
        data.firstName.trim(),
        data.lastName.trim(),
        data.birthDate ?? null,
        data.gender ?? null,
        normalizeNullable(data.address),
        normalizeNullable(data.phone),
        normalizeNullable(data.email),
        normalizeNullable(data.doctor),
        normalizeNullable(data.insurance),
        data.schoolType ?? null,
        normalizeNullable(data.schoolLevel),
        diagnosis,
        normalizeNullable(data.parentFirstName),
        normalizeNullable(data.parentLastName),
        normalizeNullable(data.parentEmail),
        data.district ?? null,
        normalizeNullable(data.parentPhone1),
        normalizeNullable(data.parentPhone2),
        data.status ?? null,
        req.user!.id,
      ],
    );

    const patient = inserted.rows[0];

    if (data.medicalData || diagnosis) {
      await client.query(
        `INSERT INTO patient_medical_data (
           patient_id, reason, medical_history, family_history, current_treatments, allergies, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (patient_id)
         DO UPDATE SET
           reason = EXCLUDED.reason,
           medical_history = EXCLUDED.medical_history,
           family_history = EXCLUDED.family_history,
           current_treatments = EXCLUDED.current_treatments,
           allergies = EXCLUDED.allergies,
           notes = EXCLUDED.notes,
           updated_at = now()`,
        [
          patient.id,
          diagnosis,
          normalizeNullable(data.medicalData?.medicalHistory),
          normalizeNullable(data.medicalData?.familyHistory),
          normalizeNullable(data.medicalData?.currentTreatments),
          normalizeNullable(data.medicalData?.allergies),
          normalizeNullable(data.medicalData?.notes),
        ],
      );
    }

    await client.query("COMMIT");

    return res.status(201).json({
      patient: {
        id: patient.id,
        photoUrl: patient.photo_url,
        firstName: patient.first_name,
        lastName: patient.last_name,
        birthDate: patient.birth_date,
        status: patient.status,
        diagnosis: patient.diagnosis,
        schoolLevel: patient.school_level,
        parentPhone1: patient.parent_phone_1,
        sessionsCount: patient.sessions_count,
        lastSessionDate: patient.last_session_date,
        createdAt: patient.created_at,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ message: "Unable to create patient" });
  } finally {
    client.release();
  }
});

patientsRouter.put("/:id", async (req: AuthenticatedRequest, res) => {
  const parsed = updatePatientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const cabinetId = await ensureUserCabinet(req.user!.id);
  const data = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT id FROM patients WHERE id = $1 AND cabinet_id = $2",
      [req.params.id, cabinetId],
    );

    if (!existing.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Patient not found" });
    }

    const diagnosis = normalizeNullable(data.diagnosis) ?? normalizeNullable(data.medicalData?.reason);

    const updated = await client.query(
      `UPDATE patients
       SET photo_url = $1,
           first_name = $2,
           last_name = $3,
           birth_date = $4,
           gender = $5,
           address = $6,
           phone = $7,
           email = $8,
           doctor = $9,
           insurance = $10,
           school_type = $11,
           school_level = $12,
           diagnosis = $13,
           parent_first_name = $14,
           parent_last_name = $15,
           parent_email = $16,
           district = $17,
           parent_phone_1 = $18,
           parent_phone_2 = $19,
           status = COALESCE($20, status),
           archived_at = CASE WHEN $20 = 'archived' THEN now() ELSE archived_at END,
           updated_at = now()
       WHERE id = $21
       RETURNING id, photo_url, first_name, last_name, birth_date, status, diagnosis, school_level, parent_phone_1, sessions_count, last_session_date, updated_at`,
      [
        normalizeNullable(data.photoUrl),
        data.firstName.trim(),
        data.lastName.trim(),
        data.birthDate ?? null,
        data.gender ?? null,
        normalizeNullable(data.address),
        normalizeNullable(data.phone),
        normalizeNullable(data.email),
        normalizeNullable(data.doctor),
        normalizeNullable(data.insurance),
        data.schoolType ?? null,
        normalizeNullable(data.schoolLevel),
        diagnosis,
        normalizeNullable(data.parentFirstName),
        normalizeNullable(data.parentLastName),
        normalizeNullable(data.parentEmail),
        data.district ?? null,
        normalizeNullable(data.parentPhone1),
        normalizeNullable(data.parentPhone2),
        data.status ?? null,
        req.params.id,
      ],
    );

    if (data.medicalData || diagnosis) {
      await client.query(
        `INSERT INTO patient_medical_data (
           patient_id, reason, medical_history, family_history, current_treatments, allergies, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (patient_id)
         DO UPDATE SET
           reason = EXCLUDED.reason,
           medical_history = EXCLUDED.medical_history,
           family_history = EXCLUDED.family_history,
           current_treatments = EXCLUDED.current_treatments,
           allergies = EXCLUDED.allergies,
           notes = EXCLUDED.notes,
           updated_at = now()`,
        [
          req.params.id,
          diagnosis,
          normalizeNullable(data.medicalData?.medicalHistory),
          normalizeNullable(data.medicalData?.familyHistory),
          normalizeNullable(data.medicalData?.currentTreatments),
          normalizeNullable(data.medicalData?.allergies),
          normalizeNullable(data.medicalData?.notes),
        ],
      );
    }

    await client.query("COMMIT");

    const patient = updated.rows[0];
    return res.json({
      patient: {
        id: patient.id,
        photoUrl: patient.photo_url,
        firstName: patient.first_name,
        lastName: patient.last_name,
        birthDate: patient.birth_date,
        status: patient.status,
        diagnosis: patient.diagnosis,
        schoolLevel: patient.school_level,
        parentPhone1: patient.parent_phone_1,
        sessionsCount: patient.sessions_count,
        lastSessionDate: patient.last_session_date,
        updatedAt: patient.updated_at,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ message: "Unable to update patient" });
  } finally {
    client.release();
  }
});

patientsRouter.delete("/:id", async (req: AuthenticatedRequest, res) => {
  const cabinetId = await ensureUserCabinet(req.user!.id);

  const deleted = await pool.query(
    `DELETE FROM patients
     WHERE id = $1 AND cabinet_id = $2
     RETURNING id`,
    [req.params.id, cabinetId],
  );

  if (!deleted.rowCount) {
    return res.status(404).json({ message: "Patient not found" });
  }

  return res.status(204).send();
});
