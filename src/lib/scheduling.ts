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

const PRESTATIONS_KEY = "cabortho.settings.prestations";
const REASONS_KEY = "cabortho.settings.reasons";

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

export function getPrestationSettings(): PrestationSetting[] {
  if (typeof window === "undefined") return defaultPrestations;
  return safeParseArray<PrestationSetting>(window.localStorage.getItem(PRESTATIONS_KEY), defaultPrestations);
}

export function setPrestationSettings(values: PrestationSetting[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PRESTATIONS_KEY, JSON.stringify(values));
}

export function getAppointmentReasonSettings(): AppointmentReasonSetting[] {
  if (typeof window === "undefined") return defaultReasons;
  return safeParseArray<AppointmentReasonSetting>(window.localStorage.getItem(REASONS_KEY), defaultReasons);
}

export function setAppointmentReasonSettings(values: AppointmentReasonSetting[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REASONS_KEY, JSON.stringify(values));
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
