import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, CalendarDays, Clock, ClipboardList, TrendingUp, UserPlus, Users } from "lucide-react";
import { apiRequest } from "@/lib/api";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  createdAt: string;
}

interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  startsAt: string;
  status: "scheduled" | "completed" | "canceled" | "no_show";
  tag: string | null;
}

const Dashboard = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  useEffect(() => {
    const load = async () => {
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      const nextMonday = new Date(monday);
      nextMonday.setDate(monday.getDate() + 7);

      const [patientsData, weekAppointments, dayAppointments] = await Promise.all([
        apiRequest<{ patients: Patient[] }>("/api/patients?status=all", { auth: true }),
        apiRequest<{ appointments: Appointment[] }>(
          `/api/appointments?from=${encodeURIComponent(monday.toISOString())}&to=${encodeURIComponent(nextMonday.toISOString())}&status=all`,
          { auth: true },
        ),
        apiRequest<{ appointments: Appointment[] }>(
          `/api/appointments?from=${encodeURIComponent(new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString())}&to=${encodeURIComponent(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString())}&status=all`,
          { auth: true },
        ),
      ]);

      setPatients(patientsData.patients);
      setAppointments([...weekAppointments.appointments, ...dayAppointments.appointments]);
    };

    void load();
  }, []);

  const today = useMemo(() => new Date(), []);
  const upcomingToday = useMemo(() => {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime();
    return appointments
      .filter((appt) => {
        const t = new Date(appt.startsAt).getTime();
        return t >= start && t < end;
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      .slice(0, 6);
  }, [appointments, today]);

  const recentPatients = useMemo(
    () =>
      [...patients]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 4),
    [patients],
  );

  const weeklyAppointmentsCount = useMemo(
    () => appointments.filter((appt) => appt.status !== "canceled").length,
    [appointments],
  );
  const completedCount = useMemo(
    () => appointments.filter((appt) => appt.status === "completed").length,
    [appointments],
  );
  const occupation = weeklyAppointmentsCount ? Math.round((completedCount / weeklyAppointmentsCount) * 100) : 0;
  const bilansCount = useMemo(
    () => appointments.filter((appt) => (appt.tag ?? "").toLowerCase().includes("bilan")).length,
    [appointments],
  );

  const stats = [
    { label: "Total patients", value: String(patients.length), change: "Live", icon: Users, color: "text-primary bg-primary/10" },
    { label: "RDV cette semaine", value: String(weeklyAppointmentsCount), change: "Live", icon: CalendarDays, color: "text-info bg-info/10" },
    { label: "Bilans en cours", value: String(bilansCount), change: "Live", icon: ClipboardList, color: "text-warning bg-warning/10" },
    { label: "Taux occupation", value: `${occupation}%`, change: "Live", icon: TrendingUp, color: "text-success bg-success/10" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="flex items-start justify-between">
              <div className={`rounded-lg p-2.5 ${stat.color}`}>
                <stat.icon className="h-5 w-5" />
              </div>
              <span className="flex items-center gap-0.5 text-xs font-medium text-success">
                {stat.change}
                <ArrowUpRight className="h-3 w-3" />
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 rounded-xl border border-border bg-card p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">Rendez-vous du jour</h3>
            <span className="text-xs font-medium text-muted-foreground">{new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(today)}</span>
          </div>
          <div className="space-y-3">
            {upcomingToday.map((appt) => (
              <div key={appt.id} className="flex items-center gap-4 rounded-lg border border-border/50 p-3 hover:bg-muted/50">
                <div className="flex h-10 w-14 flex-col items-center justify-center rounded-lg bg-muted">
                  <Clock className="h-3 w-3 text-muted-foreground mb-0.5" />
                  <span className="text-xs font-semibold text-foreground">{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(appt.startsAt))}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{appt.patientName}</p>
                  <p className="text-xs text-muted-foreground">{appt.tag || "-"}</p>
                </div>
                <span className="rounded-full px-2.5 py-1 text-xs font-medium bg-info/15 text-info">{appt.status}</span>
              </div>
            ))}
            {!upcomingToday.length && <p className="text-sm text-muted-foreground">Aucun rendez-vous aujourd'hui.</p>}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">Patients récents</h3>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="space-y-3">
            {recentPatients.map((patient) => (
              <div key={patient.id} className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-muted/50">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {(patient.firstName[0] ?? "") + (patient.lastName[0] ?? "")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{patient.firstName} {patient.lastName}</p>
                  <p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(patient.createdAt))}</p>
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-success/15 text-success">Actif</span>
              </div>
            ))}
            {!recentPatients.length && <p className="text-sm text-muted-foreground">Aucun patient.</p>}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default Dashboard;
