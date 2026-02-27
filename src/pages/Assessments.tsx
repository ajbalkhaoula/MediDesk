import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Clock, FileText, Plus } from "lucide-react";
import NewAssessmentDialog from "@/components/dialogs/NewAssessmentDialog";
import { apiRequest } from "@/lib/api";

interface Appointment {
  id: string;
  patientName: string;
  startsAt: string;
  status: "scheduled" | "completed" | "canceled" | "no_show";
  tag: string | null;
}

const Assessments = () => {
  const [showNewAssessment, setShowNewAssessment] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  useEffect(() => {
    const load = async () => {
      const from = new Date(2025, 0, 1).toISOString();
      const to = new Date(2030, 0, 1).toISOString();
      const data = await apiRequest<{ appointments: Appointment[] }>(
        `/api/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&status=all`,
        { auth: true },
      );
      setAppointments(data.appointments);
    };
    void load();
  }, []);

  const assessments = useMemo(
    () =>
      appointments
        .filter((appt) => (appt.tag ?? "").toLowerCase().includes("bilan"))
        .slice(0, 24)
        .map((appt) => {
          const done = appt.status === "completed";
          const inProgress = appt.status === "scheduled";
          return {
            id: appt.id,
            patient: appt.patientName,
            type: appt.tag ?? "Bilan",
            date: new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(appt.startsAt)),
            status: done ? "Réalisé" : inProgress ? "En cours" : "Brouillon",
            statusIcon: done ? CheckCircle2 : inProgress ? Clock : AlertCircle,
            statusColor: done ? "text-success bg-success/10" : inProgress ? "text-warning bg-warning/10" : "text-muted-foreground bg-muted",
          };
        }),
    [appointments],
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{assessments.length} bilans</p>
        <button onClick={() => setShowNewAssessment(true)} className="flex h-10 items-center gap-2 rounded-lg gradient-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">
          <Plus className="h-4 w-4" />
          Nouveau bilan
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assessments.map((assessment) => (
          <div key={assessment.id} className="stat-card cursor-pointer group">
            <div className="flex items-start justify-between mb-3">
              <div className={`rounded-lg p-2 ${assessment.statusColor}`}>
                <assessment.statusIcon className="h-4 w-4" />
              </div>
              <span className="text-xs text-muted-foreground">{assessment.date}</span>
            </div>
            <h4 className="text-sm font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">{assessment.type}</h4>
            <p className="text-xs text-muted-foreground mb-3">{assessment.patient}</p>
            <div className="flex items-center justify-between">
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${assessment.statusColor}`}>
                {assessment.status}
              </span>
              <FileText className="h-4 w-4 text-muted-foreground/50" />
            </div>
          </div>
        ))}
      </div>

      <NewAssessmentDialog open={showNewAssessment} onOpenChange={setShowNewAssessment} />
    </motion.div>
  );
};

export default Assessments;
