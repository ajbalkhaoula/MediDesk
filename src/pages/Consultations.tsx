import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowDownAZ, ArrowUpAZ, Search } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface PatientItem {
  id: string;
  firstName: string;
  lastName: string;
}

interface ConsultationAct {
  id: string;
  prestationId: string;
  label: string;
  quantity: number;
  total: number;
}

interface ConsultationItem {
  id: string;
  patientId: string;
  patientName: string;
  motifLabel: string | null;
  startTime: string;
  endTime: string;
  status: "draft" | "completed" | "cancelled" | "no_show";
  acts: ConsultationAct[];
}

interface ConsultationsResponse {
  consultations: ConsultationItem[];
}

const statusOptions = [
  { value: "all", label: "Tous" },
  { value: "draft", label: "Brouillon" },
  { value: "completed", label: "Effectué" },
  { value: "cancelled", label: "Annulé" },
  { value: "no_show", label: "Absent" },
] as const;

const groupOptions = [
  { value: "none", label: "Sans regroupement" },
  { value: "patient", label: "Par patient" },
  { value: "date", label: "Par date" },
  { value: "act", label: "Par type d'acte" },
] as const;

function formatStatus(status: ConsultationItem["status"]): string {
  if (status === "draft") return "Brouillon";
  if (status === "completed") return "Effectué";
  if (status === "cancelled") return "Annulé";
  return "Absent";
}

function groupKey(item: ConsultationItem, groupBy: "none" | "patient" | "date" | "act"): string {
  if (groupBy === "patient") return item.patientName;
  if (groupBy === "date") return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(item.startTime));
  if (groupBy === "act") return item.acts[0]?.label ?? "Sans acte";
  return "Toutes les consultations";
}

function combineLocalDateTimeToIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

const Consultations = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [consultations, setConsultations] = useState<ConsultationItem[]>([]);

  const [status, setStatus] = useState<string>("all");
  const [patientId, setPatientId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [actType, setActType] = useState<string>("");
  const [groupBy, setGroupBy] = useState<"none" | "patient" | "date" | "act">("none");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"patient" | "date">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [showCreate, setShowCreate] = useState(false);
  const [createPatientId, setCreatePatientId] = useState("");
  const [createDate, setCreateDate] = useState("");
  const [createStartTime, setCreateStartTime] = useState("09:00");
  const [createEndTime, setCreateEndTime] = useState("09:45");
  const [createMotif, setCreateMotif] = useState("Consultation");
  const [createNotes, setCreateNotes] = useState("");

  const actTypeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of consultations) {
      for (const act of c.acts) {
        if (!map.has(act.prestationId)) map.set(act.prestationId, act.label);
      }
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [consultations]);

  const filteredConsultations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return consultations;
    return consultations.filter((item) => {
      const dateText = new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(item.startTime)).toLowerCase();
      const actsText = item.acts.map((act) => act.label).join(" ").toLowerCase();
      return [
        item.patientName.toLowerCase(),
        (item.motifLabel ?? "").toLowerCase(),
        formatStatus(item.status).toLowerCase(),
        actsText,
        dateText,
      ].some((part) => part.includes(term));
    });
  }, [consultations, search]);

  const sortedConsultations = useMemo(() => {
    const sorted = [...filteredConsultations].sort((a, b) => {
      if (sortBy === "date") {
        return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      }
      if (sortBy === "patient") {
        return a.patientName.localeCompare(b.patientName, "fr");
      }
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [filteredConsultations, sortBy, sortDir]);

  const groupedConsultations = useMemo(() => {
    const groups = new Map<string, ConsultationItem[]>();
    for (const item of sortedConsultations) {
      const key = groupKey(item, groupBy);
      const current = groups.get(key) ?? [];
      current.push(item);
      groups.set(key, current);
    }
    return Array.from(groups.entries());
  }, [sortedConsultations, groupBy]);

  const loadPatients = async () => {
    const data = await apiRequest<{ patients: PatientItem[] }>("/api/patients?status=all", { auth: true });
    setPatients(data.patients);
    if (!createPatientId && data.patients.length) setCreatePatientId(data.patients[0].id);
  };

  const loadConsultations = async () => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (patientId) params.set("patient_id", patientId);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (actType) params.set("act_type", actType);
    const query = params.toString() ? `?${params.toString()}` : "";
    const data = await apiRequest<ConsultationsResponse>(`/api/consultations${query}`, { auth: true });
    setConsultations(data.consultations);
  };

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        await Promise.all([loadPatients(), loadConsultations()]);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Chargement consultations impossible";
        toast({ title: "Erreur", description: message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  useEffect(() => {
    void loadConsultations();
  }, [status, patientId, dateFrom, dateTo, actType]);

  const toggleSort = (key: "patient" | "date") => {
    if (sortBy === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(key);
    setSortDir("asc");
  };

  const createManualConsultation = async () => {
    if (!createPatientId || !createDate) {
      toast({ title: "Champs requis", description: "Patient et date sont obligatoires", variant: "destructive" });
      return;
    }
    try {
      const created = await apiRequest<{ consultation: { id: string } }>("/api/consultations", {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          patientId: createPatientId,
          startTime: combineLocalDateTimeToIso(createDate, createStartTime),
          endTime: combineLocalDateTimeToIso(createDate, createEndTime),
          motifLabel: createMotif,
          notes: createNotes,
        }),
      });
      toast({ title: "Consultation brouillon créée" });
      setShowCreate(false);
      setCreateNotes("");
      await loadConsultations();
      navigate(`/consultations/${created.consultation.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Création consultation impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Consultations</h2>
        <button type="button" onClick={() => setShowCreate((v) => !v)} className="h-10 rounded-lg gradient-primary px-4 text-sm font-medium text-primary-foreground">
          Nouvelle consultation sans RDV
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <select value={createPatientId} onChange={(e) => setCreatePatientId(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm md:col-span-2">
              <option value="">Sélectionner un patient</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>{patient.firstName} {patient.lastName}</option>
              ))}
            </select>
            <input type="date" value={createDate} onChange={(e) => setCreateDate(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
            <input type="time" value={createStartTime} onChange={(e) => setCreateStartTime(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
            <input type="time" value={createEndTime} onChange={(e) => setCreateEndTime(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
            <input value={createMotif} onChange={(e) => setCreateMotif(e.target.value)} placeholder="Motif" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
          </div>
          <textarea value={createNotes} onChange={(e) => setCreateNotes(e.target.value)} rows={2} className="mt-3 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" placeholder="Notes (optionnel)" />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="h-10 rounded-lg border border-input px-4 text-sm font-medium hover:bg-muted">Annuler</button>
            <button type="button" onClick={() => void createManualConsultation()} className="h-10 rounded-lg gradient-primary px-4 text-sm font-medium text-primary-foreground">Créer brouillon</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select value={patientId} onChange={(e) => setPatientId(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
            <option value="">Tous les patients</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>{patient.firstName} {patient.lastName}</option>
            ))}
          </select>

          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />

          <select value={actType} onChange={(e) => setActType(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
            <option value="">Tous les types d'acte</option>
            {actTypeOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>

          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as "none" | "patient" | "date" | "act")} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
            {groupOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher dans les consultations..."
            className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm"
          />
        </div>
      </div>

      <div className="space-y-4">
        {!loading && groupedConsultations.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Aucune consultation.</div>
        )}

        {groupedConsultations.map(([group, items]) => (
          <div key={group} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border bg-muted/40 px-4 py-2 text-sm font-semibold text-foreground">{group}</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <button type="button" onClick={() => toggleSort("patient")} className="inline-flex items-center gap-1 hover:text-foreground">
                        Patient {sortBy === "patient" && (sortDir === "asc" ? <ArrowUpAZ className="h-3.5 w-3.5" /> : <ArrowDownAZ className="h-3.5 w-3.5" />)}
                      </button>
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <button type="button" onClick={() => toggleSort("date")} className="inline-flex items-center gap-1 hover:text-foreground">
                        Date {sortBy === "date" && (sortDir === "asc" ? <ArrowUpAZ className="h-3.5 w-3.5" /> : <ArrowDownAZ className="h-3.5 w-3.5" />)}
                      </button>
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Motif</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actes</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statut</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-border/50">
                      <td className="px-4 py-3 text-sm text-foreground">{item.patientName}</td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(item.startTime))}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{item.motifLabel ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <div className="flex flex-wrap gap-1">
                          {item.acts.length === 0 && <span className="text-muted-foreground">-</span>}
                          {item.acts.map((act) => (
                            <span key={act.id} className="rounded-md border border-border px-2 py-0.5 text-xs">
                              {act.label} x{act.quantity}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{formatStatus(item.status)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => navigate(`/consultations/${item.id}`)}
                          className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-muted"
                        >
                          Ouvrir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default Consultations;

