import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Pencil, RotateCcw, UserX, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AppointmentReasonSetting } from "@/lib/scheduling";

export interface AppointmentFormInput {
  patientId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "scheduled" | "completed" | "canceled" | "no_show";
  tag: string;
  notes: string;
}

interface PatientOption {
  id: string;
  label: string;
}

interface NewAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patients: PatientOption[];
  reasonOptions: AppointmentReasonSetting[];
  isEditMode?: boolean;
  onSubmit: (payload: AppointmentFormInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  isSubmitting?: boolean;
  isDeleting?: boolean;
  initialValues?: AppointmentFormInput;
  title?: string;
  submitLabel?: string;
}

const emptyForm: AppointmentFormInput = {
  patientId: "",
  date: "",
  startTime: "09:00",
  endTime: "09:45",
  status: "scheduled",
  tag: "",
  notes: "",
};

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map((v) => Number(v));
  return h * 60 + m;
}

function toTime(minutes: number): string {
  const safe = Math.max(0, Math.min(23 * 60 + 59, minutes));
  const h = String(Math.floor(safe / 60)).padStart(2, "0");
  const m = String(safe % 60).padStart(2, "0");
  return `${h}:${m}`;
}

const NewAppointmentDialog = ({
  open,
  onOpenChange,
  patients,
  reasonOptions,
  isEditMode = false,
  onSubmit,
  onDelete,
  isSubmitting = false,
  isDeleting = false,
  initialValues,
  title = "Nouveau rendez-vous",
  submitLabel = "Créer le RDV",
}: NewAppointmentDialogProps) => {
  const [form, setForm] = useState<AppointmentFormInput>(emptyForm);

  const selectedReason = useMemo(
    () => reasonOptions.find((reason) => reason.name === form.tag),
    [reasonOptions, form.tag],
  );

  useEffect(() => {
    if (!open) return;
    const today = new Date().toISOString().slice(0, 10);
    const fallbackReason = reasonOptions[0];
    const tag = initialValues?.tag?.trim() || fallbackReason?.name || "";
    const base = initialValues ?? {
      ...emptyForm,
      date: today,
      tag,
    };

    setForm({
      ...base,
      status: base.status || "scheduled",
      tag,
    });
  }, [open, initialValues, reasonOptions]);

  useEffect(() => {
    if (!form.startTime || !selectedReason) return;
    const duration = selectedReason.durationMinutes;
    setForm((prev) => {
      const computedEnd = toTime(toMinutes(prev.startTime) + duration);
      if (computedEnd === prev.endTime) return prev;
      return { ...prev, endTime: computedEnd };
    });
  }, [form.startTime, selectedReason]);

  const update = (field: keyof AppointmentFormInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const timeError = useMemo(() => {
    if (!form.startTime || !form.endTime) return "";
    return form.endTime > form.startTime ? "" : "L'heure de fin doit être après l'heure de début.";
  }, [form.startTime, form.endTime]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (timeError || !form.tag) return;
    await onSubmit({ ...form, status: isEditMode ? form.status : "scheduled" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-foreground">Patient</label>
              {isEditMode && (
                <div className="inline-flex items-center gap-1">
                  <button type="button" onClick={() => update("status", "scheduled")} className={`rounded-md p-1.5 ${form.status === "scheduled" ? "bg-info/20 text-info" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`} title="Replanifier" aria-label="Replanifier">
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => update("status", "canceled")} className={`rounded-md p-1.5 ${form.status === "canceled" ? "bg-destructive/20 text-destructive" : "text-destructive hover:bg-destructive/10"}`} title="Annulé" aria-label="Annuler">
                    <XCircle className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => update("status", "no_show")} className={`rounded-md p-1.5 ${form.status === "no_show" ? "bg-warning/20 text-warning" : "text-warning hover:bg-warning/10"}`} title="Absent" aria-label="Marquer absent">
                    <UserX className="h-4 w-4" />
                  </button>
                  <span className="rounded-md p-1.5 text-muted-foreground" title="Mode modification" aria-hidden>
                    <Pencil className="h-4 w-4" />
                  </span>
                </div>
              )}
            </div>
            <select required value={form.patientId} onChange={(e) => update("patientId", e.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30">
              <option value="">Sélectionner un patient...</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>{patient.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Date</label>
            <input type="date" required value={form.date} onChange={(e) => update("date", e.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30" />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Motif</label>
            <select required value={form.tag} onChange={(e) => update("tag", e.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30">
              {reasonOptions.map((reason) => (
                <option key={reason.id} value={reason.name}>{reason.name} ({reason.durationMinutes} min)</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Début</label>
              <input type="time" required value={form.startTime} onChange={(e) => update("startTime", e.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Fin</label>
              <input type="time" value={form.endTime} readOnly className="h-10 w-full rounded-lg border border-input bg-muted px-3 text-sm text-muted-foreground" />
            </div>
          </div>

          {timeError && <p className="text-xs text-destructive">{timeError}</p>}

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={2} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none" placeholder="Notes optionnelles..." />
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            <div>
              {isEditMode && onDelete && (
                <button type="button" onClick={() => void onDelete()} disabled={isDeleting || isSubmitting} className="h-10 rounded-lg border border-destructive/50 px-4 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-60">
                  {isDeleting ? "Suppression..." : "Supprimer"}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-lg border border-input px-4 text-sm font-medium text-foreground hover:bg-muted transition-colors">
                Annuler
              </button>
              <button type="submit" disabled={isSubmitting || Boolean(timeError)} className="h-10 rounded-lg gradient-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60">
                {isSubmitting ? "Enregistrement..." : submitLabel}
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewAppointmentDialog;
