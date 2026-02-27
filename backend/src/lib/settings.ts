import { pool } from "../db/pool.js";

export interface CabinetPrestation {
  id: string;
  name: string;
  price: number;
}

const defaultPrestations: CabinetPrestation[] = [
  { id: "consultation", name: "Consultation", price: 300 },
  { id: "bilan", name: "Bilan", price: 500 },
  { id: "restitution", name: "Restitution", price: 350 },
  { id: "seance-reeducation", name: "S\u00e9ance r\u00e9\u00e9ducation", price: 250 },
  { id: "reunion-ecole", name: "R\u00e9union \u00e9cole", price: 0 },
];

function parsePrestations(settings: unknown): CabinetPrestation[] {
  if (!settings || typeof settings !== "object") return [];
  const record = settings as Record<string, unknown>;
  const rawPrestations = record.prestations;
  if (!Array.isArray(rawPrestations)) return [];

  return rawPrestations
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : "";
      const name = typeof row.name === "string" ? row.name : "";
      const numericPrice = Number(row.price);
      if (!id || !name || !Number.isFinite(numericPrice)) return null;
      return { id, name, price: numericPrice };
    })
    .filter((item): item is CabinetPrestation => item !== null);
}

export async function loadCabinetPrestations(cabinetId: string): Promise<CabinetPrestation[]> {
  const result = await pool.query<{ settings: unknown }>(
    "SELECT settings FROM cabinets WHERE id = $1",
    [cabinetId],
  );
  if (!result.rowCount) return defaultPrestations;
  const parsed = parsePrestations(result.rows[0].settings);
  return parsed.length ? parsed : defaultPrestations;
}
