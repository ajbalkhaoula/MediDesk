import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownAZ, ArrowUpAZ, CalendarDays, ChevronLeft, ChevronRight, List, Pencil, Plus, Search, UserX, XCircle } from "lucide-react";
import NewAppointmentDialog, { type AppointmentFormInput } from "@/components/dialogs/NewAppointmentDialog";
import { apiRequest } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { getAppointmentReasonSettings, type AppointmentReasonSetting } from "@/lib/scheduling";

interface CalendarPatient {
  id: string;
  firstName: string;
  lastName: string;
}

interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "completed" | "canceled" | "no_show";
  tag: string | null;
  notes: string | null;
}

interface CalendarPatientsResponse {
  patients: CalendarPatient[];
}

interface AppointmentsResponse {
  appointments: Appointment[];
}

const hours = Array.from({ length: 10 }, (_, i) => i + 8);

function startOfWeekMonday(value: Date): Date {
  const d = new Date(value);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toTimeInput(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function combineLocalDateTimeToIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

function formatWeekLabel(start: Date): string {
  const end = addDays(start, 4);
  const from = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(start);
  const to = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(end);
  return `${from} - ${to}`;
}

function getDayIndexInWeek(startsAt: string, weekStart: Date): number {
  const start = new Date(startsAt);
  return Math.floor((start.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
}

function getStatusBadgeClass(status: Appointment["status"]): string {
  if (status === "completed") return "bg-success/20 border-success/30 text-success";
  if (status === "canceled") return "bg-destructive/20 border-destructive/30 text-destructive";
  if (status === "no_show") return "bg-warning/20 border-warning/30 text-warning";
  return "bg-info/20 border-info/30 text-info";
}

function getStatusLabel(status: Appointment["status"]): string {
  if (status === "completed") return "Effectué";
  if (status === "canceled") return "Annulé";
  if (status === "no_show") return "Absent";
  return "Planifié";
}

const Calendar = () => {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()));
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [patients, setPatients] = useState<CalendarPatient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [createSeed, setCreateSeed] = useState<Partial<AppointmentFormInput> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reasonOptions, setReasonOptions] = useState<AppointmentReasonSetting[]>(() => getAppointmentReasonSettings());
  const [listSearch, setListSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "patient">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const loadRequestIdRef = useRef(0);

  const days = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => {
        const date = addDays(weekStart, i);
        const label = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "2-digit" }).format(date);
        return { date, label };
      }),
    [weekStart],
  );

  const loadData = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    setLoading(true);
    try {
      const from = weekStart.toISOString();
      const to = addDays(weekStart, 5).toISOString();
      const [patientsData, apptsData] = await Promise.all([
        apiRequest<CalendarPatientsResponse>("/api/patients?status=all", { auth: true }),
        apiRequest<AppointmentsResponse>(`/api/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&status=all`, { auth: true }),
      ]);
      if (requestId !== loadRequestIdRef.current) return;
      setPatients(patientsData.patients);
      setAppointments(apptsData.appointments);
    } catch (err) {
      if (requestId !== loadRequestIdRef.current) return;
      const message = err instanceof Error ? err.message : "Chargement agenda impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      if (requestId === loadRequestIdRef.current) setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === "cabortho.settings.reasons") {
        setReasonOptions(getAppointmentReasonSettings());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const openCreateDialog = (seed?: Partial<AppointmentFormInput>) => {
    setEditingAppointment(null);
    setCreateSeed(seed ?? null);
    setShowDialog(true);
  };

  const openEditDialog = (appt: Appointment) => {
    setEditingAppointment(appt);
    setShowDialog(true);
  };

  const handleSubmitAppointment = async (form: AppointmentFormInput) => {
    setSaving(true);
    try {
      const payload = {
        patientId: form.patientId,
        startsAt: combineLocalDateTimeToIso(form.date, form.startTime),
        endsAt: combineLocalDateTimeToIso(form.date, form.endTime),
        status: editingAppointment
          ? form.status === "completed"
            ? undefined
            : form.status
          : "scheduled",
        tag: form.tag || null,
        notes: form.notes || null,
      };

      if (editingAppointment) {
        await apiRequest(`/api/appointments/${editingAppointment.id}`, {
          method: "PUT",
          auth: true,
          body: JSON.stringify(payload),
        });
        toast({ title: "RDV modifié" });
      } else {
        await apiRequest("/api/appointments", {
          method: "POST",
          auth: true,
          body: JSON.stringify(payload),
        });
        toast({ title: "RDV créé" });
      }
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Enregistrement RDV impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAppointment = async () => {
    if (!editingAppointment) return;
    const ok = window.confirm("Supprimer ce rendez-vous ?");
    if (!ok) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/appointments/${editingAppointment.id}`, { method: "DELETE", auth: true });
      toast({ title: "RDV supprimé" });
      setShowDialog(false);
      setEditingAppointment(null);
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Suppression RDV impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleQuickStatusChange = async (appt: Appointment, status: "canceled" | "no_show") => {
    if (appt.status === status) return;
    try {
      await apiRequest(`/api/appointments/${appt.id}`, {
        method: "PUT",
        auth: true,
        body: JSON.stringify({
          patientId: appt.patientId,
          startsAt: appt.startsAt,
          endsAt: appt.endsAt,
          status,
          tag: appt.tag,
          notes: appt.notes,
        }),
      });
      toast({ title: `Statut RDV: ${status === "canceled" ? "annulé" : "absent"}` });
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Changement de statut impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  const dialogInitialValues: AppointmentFormInput | undefined = editingAppointment
    ? {
        patientId: editingAppointment.patientId,
        date: toDateInput(new Date(editingAppointment.startsAt)),
        startTime: toTimeInput(new Date(editingAppointment.startsAt)),
        endTime: toTimeInput(new Date(editingAppointment.endsAt)),
        status: editingAppointment.status,
        tag: editingAppointment.tag ?? "",
        notes: editingAppointment.notes ?? "",
      }
    : createSeed
      ? {
          patientId: createSeed.patientId ?? "",
          date: createSeed.date ?? toDateInput(new Date()),
          startTime: createSeed.startTime ?? "09:00",
          endTime: createSeed.endTime ?? "09:45",
          status: "scheduled",
          tag: createSeed.tag ?? (reasonOptions[0]?.name ?? ""),
          notes: createSeed.notes ?? "",
        }
      : undefined;

  const listAppointments = useMemo(() => {
    const term = listSearch.trim().toLowerCase();
    const filtered = term
      ? appointments.filter((appt) => {
          const dateText = new Intl.DateTimeFormat("fr-FR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
            .format(new Date(appt.startsAt))
            .toLowerCase();
          return [appt.patientName, appt.tag ?? "", getStatusLabel(appt.status), dateText]
            .join(" ")
            .toLowerCase()
            .includes(term);
        })
      : appointments;

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "date") return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
      if (sortBy === "patient") return a.patientName.localeCompare(b.patientName, "fr");
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [appointments, listSearch, sortBy, sortDir]);

  const toggleSort = (key: "date" | "patient") => {
    if (sortBy === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(key);
    setSortDir("asc");
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={() => setWeekStart((prev) => addDays(prev, -7))} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><ChevronLeft className="h-5 w-5" /></button>
          <h3 className="text-sm sm:text-base font-semibold text-foreground">{formatWeekLabel(weekStart)}</h3>
          <button onClick={() => setWeekStart((prev) => addDays(prev, 7))} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><ChevronRight className="h-5 w-5" /></button>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-input bg-card p-0.5">
            <button type="button" onClick={() => setViewMode("calendar")} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${viewMode === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}><CalendarDays className="h-3.5 w-3.5" />Calendrier</button>
            <button type="button" onClick={() => setViewMode("list")} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}><List className="h-3.5 w-3.5" />Liste</button>
          </div>
          <button onClick={() => openCreateDialog()} className="flex h-9 items-center gap-2 rounded-lg gradient-primary px-4 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" />Nouveau RDV</button>
        </div>
      </div>

      {viewMode === "calendar" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="grid grid-cols-[60px_repeat(5,minmax(140px,1fr))] border-b border-border bg-muted/40">
            <div className="p-3" />
            {days.map((day) => (
              <div key={day.date.toISOString()} className="border-l border-border p-3 text-center">
                <p className="text-xs font-medium text-muted-foreground uppercase">{day.label.split(" ")[0]}</p>
                <p className="text-lg font-bold text-foreground">{day.label.split(" ")[1]}</p>
              </div>
            ))}
          </div>
          <div className="relative overflow-x-auto">
            {hours.map((hour) => (
              <div key={hour} className="grid grid-cols-[60px_repeat(5,minmax(140px,1fr))]" style={{ height: 72 }}>
                <div className="flex items-start justify-end pr-3 pt-1 text-xs text-muted-foreground">{hour}:00</div>
                {days.map((day) => (
                  <button key={`${day.date.toISOString()}-${hour}`} type="button" onClick={() => openCreateDialog({ date: toDateInput(day.date), startTime: `${String(hour).padStart(2, "0")}:00`, status: "scheduled", tag: reasonOptions[0]?.name ?? "" })} className="border-l border-t border-border/60 hover:bg-muted/30" title="Créer un rendez-vous sur ce créneau" />
                ))}
              </div>
            ))}

            {!loading && appointments.map((appt) => {
              const start = new Date(appt.startsAt);
              const end = new Date(appt.endsAt);
              const dayIndex = getDayIndexInWeek(appt.startsAt, weekStart);
              if (dayIndex < 0 || dayIndex > 4) return null;
              const startHour = start.getHours() + start.getMinutes() / 60;
              const endHour = end.getHours() + end.getMinutes() / 60;
              const top = (startHour - 8) * 72;
              const duration = Math.max(endHour - startHour, 0.25);
              const height = duration * 72 - 4;
              const left = `calc(60px + ${dayIndex} * ((100% - 60px) / 5) + 4px)`;
              const width = "calc((100% - 60px) / 5 - 8px)";

              return (
                <button key={appt.id} onClick={() => openEditDialog(appt)} className={`absolute rounded-lg border px-2.5 py-1.5 text-left transition-all hover:scale-[1.01] hover:shadow-md ${getStatusBadgeClass(appt.status)}`} style={{ top: top + 2, height, left, width }} title={`${appt.patientName} - ${getStatusLabel(appt.status)}`}>
                  <p className="text-xs font-semibold truncate">{appt.patientName}</p>
                  <p className="text-[10px] opacity-80 truncate">{appt.tag || getStatusLabel(appt.status)}</p>
                  <p className="text-[10px] opacity-70 truncate">{toTimeInput(start)} - {toTimeInput(end)}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === "list" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="relative border-b border-border px-4 py-3">
            <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Rechercher dans les rendez-vous..."
              className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <button type="button" onClick={() => toggleSort("date")} className="inline-flex items-center gap-1 hover:text-foreground">
                      Date/Heure {sortBy === "date" && (sortDir === "asc" ? <ArrowUpAZ className="h-3.5 w-3.5" /> : <ArrowDownAZ className="h-3.5 w-3.5" />)}
                    </button>
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <button type="button" onClick={() => toggleSort("patient")} className="inline-flex items-center gap-1 hover:text-foreground">
                      Patient {sortBy === "patient" && (sortDir === "asc" ? <ArrowUpAZ className="h-3.5 w-3.5" /> : <ArrowDownAZ className="h-3.5 w-3.5" />)}
                    </button>
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Motif</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statut</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {listAppointments.map((appt) => {
                  const start = new Date(appt.startsAt);
                  const end = new Date(appt.endsAt);
                  return (
                    <tr key={appt.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-5 py-3 text-sm text-foreground">
                        {new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(start)}
                        <span className="ml-2 text-muted-foreground">{toTimeInput(start)} - {toTimeInput(end)}</span>
                      </td>
                      <td className="px-5 py-3 text-sm text-foreground">{appt.patientName}</td>
                      <td className="px-5 py-3 text-sm text-foreground">{appt.tag || "-"}</td>
                      <td className="px-5 py-3"><span className={`rounded-full border px-2 py-0.5 text-xs ${getStatusBadgeClass(appt.status)}`}>{getStatusLabel(appt.status)}</span></td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button type="button" onClick={() => void handleQuickStatusChange(appt, "canceled")} className="rounded-md p-1 text-destructive hover:bg-destructive/10" title="Annuler RDV"><XCircle className="h-4 w-4" /></button>
                          <button type="button" onClick={() => void handleQuickStatusChange(appt, "no_show")} className="rounded-md p-1 text-warning hover:bg-warning/10" title="Marquer absent"><UserX className="h-4 w-4" /></button>
                          <button type="button" onClick={() => openEditDialog(appt)} className="rounded-md p-1 text-muted-foreground hover:bg-muted" title="Modifier"><Pencil className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loading && !listAppointments.length && (
                  <tr><td colSpan={5} className="px-5 py-6 text-sm text-muted-foreground">Aucun rendez-vous cette semaine.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <NewAppointmentDialog
        open={showDialog}
        onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) {
            setEditingAppointment(null);
            setCreateSeed(null);
          }
        }}
        patients={patients.map((p) => ({ id: p.id, label: `${p.firstName} ${p.lastName}` }))}
        reasonOptions={reasonOptions}
        isEditMode={Boolean(editingAppointment)}
        onSubmit={handleSubmitAppointment}
        onDelete={editingAppointment ? handleDeleteAppointment : undefined}
        isSubmitting={saving}
        isDeleting={deleting}
        initialValues={dialogInitialValues}
        title={editingAppointment ? "Modifier le rendez-vous" : "Nouveau rendez-vous"}
        submitLabel={editingAppointment ? "Enregistrer" : "Créer le RDV"}
      />
    </motion.div>
  );
};

export default Calendar;

