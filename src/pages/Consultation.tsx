import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { getPrestationSettings, type PrestationSetting } from "@/lib/scheduling";

interface Consultation {
  id: string;
  patientId: string;
  appointmentId: string;
  motifLabel: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number | null;
  notes: string | null;
  status: "draft" | "completed" | "cancelled" | "no_show";
}

interface ConsultationAct {
  id: string;
  prestationId: string;
  label: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface ConsultationResponse {
  consultation: Consultation;
  acts: ConsultationAct[];
}

interface PatientsResponse {
  patients: Array<{ id: string; firstName: string; lastName: string }>;
}

const ConsultationPage = () => {
  const { consultationId = "" } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [acts, setActs] = useState<ConsultationAct[]>([]);
  const [patientName, setPatientName] = useState("-");
  const [notes, setNotes] = useState("");
  const [prestations, setPrestations] = useState<PrestationSetting[]>(() => getPrestationSettings());
  const [selectedPrestationId, setSelectedPrestationId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [saving, setSaving] = useState(false);

  const isDraft = consultation?.status === "draft";
  const isCompleted = consultation?.status === "completed";

  const total = useMemo(() => acts.reduce((sum, act) => sum + act.total, 0), [acts]);

  const loadData = async () => {
    if (!consultationId) return;
    setLoading(true);
    try {
      const data = await apiRequest<ConsultationResponse>(`/api/consultations/${consultationId}`, { auth: true });
      setConsultation(data.consultation);
      setActs(data.acts);
      setNotes(data.consultation.notes ?? "");

      const patients = await apiRequest<PatientsResponse>("/api/patients?status=all", { auth: true });
      const patient = patients.patients.find((item) => item.id === data.consultation.patientId);
      setPatientName(patient ? `${patient.firstName} ${patient.lastName}` : "-");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Chargement consultation impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [consultationId]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === "cabortho.settings.prestations") {
        setPrestations(getPrestationSettings());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (prestations.length && !selectedPrestationId) {
      setSelectedPrestationId(prestations[0].id);
    }
  }, [prestations, selectedPrestationId]);

  const saveNotes = async () => {
    if (!consultation || !isDraft) return;
    setSaving(true);
    try {
      await apiRequest(`/api/consultations/${consultation.id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ notes }),
      });
      toast({ title: "Consultation mise à jour" });
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mise à jour impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addAct = async () => {
    if (!consultation || !isDraft || !selectedPrestationId) return;
    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) return;
    try {
      await apiRequest(`/api/consultations/${consultation.id}/acts`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ prestation_id: selectedPrestationId, quantity: q }),
      });
      toast({ title: "Acte ajouté" });
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ajout acte impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  const removeAct = async (actId: string) => {
    if (!consultation || !isDraft) return;
    try {
      await apiRequest(`/api/consultations/${consultation.id}/acts/${actId}`, {
        method: "DELETE",
        auth: true,
      });
      toast({ title: "Acte supprimé" });
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Suppression acte impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  const completeConsultation = async () => {
    if (!consultation || !isDraft) return;
    try {
      await apiRequest(`/api/consultations/${consultation.id}/complete`, {
        method: "POST",
        auth: true,
      });
      toast({ title: "Consultation complétée" });
      navigate("/calendar");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Finalisation impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  const startInvoicing = () => {
    if (!consultation) return;
    navigate(`/invoices/new?consultationId=${consultation.id}&patientId=${consultation.patientId}`);
  };

  return (
    <div className="space-y-4">
      {loading && <p className="text-sm text-muted-foreground">Chargement...</p>}
      {!loading && consultation && (
        <>
          <div className="rounded-xl border border-border bg-card p-5" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{patientName}</h2>
                <p className="text-sm text-muted-foreground">
                  {new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(consultation.startTime))}
                  {" • "}
                  {new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(consultation.startTime))}
                  {" - "}
                  {new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(consultation.endTime))}
                </p>
                <p className="text-xs text-muted-foreground">{consultation.motifLabel ?? "-"}</p>
              </div>
              <span className="rounded-full border px-3 py-1 text-xs font-medium">
                {consultation.status}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-3" style={{ boxShadow: "var(--shadow-card)" }}>
            <label className="text-sm font-medium text-foreground block">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!isDraft}
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
            />
            {isDraft && (
              <button
                type="button"
                onClick={() => void saveNotes()}
                disabled={saving}
                className="h-10 rounded-lg border border-input px-4 text-sm font-medium text-foreground hover:bg-muted"
              >
                Enregistrer les notes
              </button>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-3" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Prestations</h3>
              <p className="text-sm font-medium text-foreground">Total: {total.toFixed(2)} MAD</p>
            </div>

            {isDraft && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <select value={selectedPrestationId} onChange={(e) => setSelectedPrestationId(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm sm:col-span-2">
                  {prestations.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
                <button type="button" onClick={() => void addAct()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg gradient-primary px-4 text-sm font-medium text-primary-foreground">
                  <Plus className="h-4 w-4" />
                  Ajouter
                </button>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Acte</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Qté</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">PU</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {acts.map((act) => (
                    <tr key={act.id} className="border-b border-border/50">
                      <td className="px-4 py-3 text-sm text-foreground">{act.label}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{act.quantity}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{act.unitPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{act.total.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">
                        {isDraft && (
                          <button type="button" onClick={() => void removeAct(act.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!acts.length && (
                    <tr><td colSpan={5} className="px-4 py-4 text-sm text-muted-foreground">Aucune prestation.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isDraft && (
              <button type="button" onClick={() => void completeConsultation()} className="h-10 rounded-lg gradient-primary px-4 text-sm font-medium text-primary-foreground">
                Compléter la consultation
              </button>
            )}
            {isCompleted && (
              <button type="button" onClick={startInvoicing} className="h-10 rounded-lg border border-input px-4 text-sm font-medium text-foreground hover:bg-muted">
                Générer facture
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ConsultationPage;
