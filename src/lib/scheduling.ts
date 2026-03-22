export interface PrestationSetting {
  id: string;
  name: string;
  defaultDurationMinutes: number;
  price: number;
}

export interface AppointmentReasonSetting {
  id: string;
  name: string;
  durationMinutes: number;
}

const PRESTATIONS_KEY = "medidesk.settings.prestations";
const LEGACY_PRESTATIONS_KEY = "cabortho.settings.prestations";
const REASONS_KEY = "medidesk.settings.reasons";
const LEGACY_REASONS_KEY = "cabortho.settings.reasons";

const defaultPrestations: PrestationSetting[] = [
  { id: "consultation", name: "Consultation", defaultDurationMinutes: 45, price: 300 },
  { id: "bilan", name: "Bilan", defaultDurationMinutes: 60, price: 500 },
  { id: "restitution", name: "Restitution", defaultDurationMinutes: 45, price: 350 },
  { id: "seance-reeducation", name: "Séance rééducation", defaultDurationMinutes: 45, price: 250 },
  { id: "reunion-ecole", name: "Réunion école", defaultDurationMinutes: 60, price: 0 },
];

const defaultReasons: AppointmentReasonSetting[] = [
  { id: "consultation", name: "Consultation", durationMinutes: 45 },
  { id: "bilan", name: "Bilan", durationMinutes: 60 },
  { id: "restitution", name: "Restitution", durationMinutes: 45 },
  { id: "seance-reeducation", name: "Séance rééducation", durationMinutes: 45 },
  { id: "reunion-ecole", name: "Réunion école", durationMinutes: 60 },
];

function safeParseArray<T>(value: string | null, fallback: T[]): T[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.length ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeStoredLabel(value: string): string {
  return value
    .replace(/R[�Ã]union\s+[�Ã]cole/g, "Réunion école")
    .replace(/S[�Ã]ance r[�Ã][�Ã]ducation/g, "Séance rééducation")
    .replace(/Param[�Ã]tres/g, "Paramètres");
}

export function getPrestationSettings(): PrestationSetting[] {
  if (typeof window === "undefined") return defaultPrestations;
  const values = safeParseArray<PrestationSetting>(
    window.localStorage.getItem(PRESTATIONS_KEY) ?? window.localStorage.getItem(LEGACY_PRESTATIONS_KEY),
    defaultPrestations,
  );
  return values.map((item) => ({ ...item, name: sanitizeStoredLabel(item.name) }));
}

export function setPrestationSettings(values: PrestationSetting[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PRESTATIONS_KEY, JSON.stringify(values));
  window.localStorage.removeItem(LEGACY_PRESTATIONS_KEY);
}

export function getAppointmentReasonSettings(): AppointmentReasonSetting[] {
  if (typeof window === "undefined") return defaultReasons;
  const values = safeParseArray<AppointmentReasonSetting>(
    window.localStorage.getItem(REASONS_KEY) ?? window.localStorage.getItem(LEGACY_REASONS_KEY),
    defaultReasons,
  );
  return values.map((item) => ({ ...item, name: sanitizeStoredLabel(item.name) }));
}

export function setAppointmentReasonSettings(values: AppointmentReasonSetting[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REASONS_KEY, JSON.stringify(values));
  window.localStorage.removeItem(LEGACY_REASONS_KEY);
}

export function generateSettingId(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 24);
  return `${base || "item"}-${Math.random().toString(36).slice(2, 8)}`;
}
