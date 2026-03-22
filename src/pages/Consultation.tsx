
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, FileDown, FileText, Mic, MicOff, Pencil, SquarePen, Trash2, UserRound } from "lucide-react";
import NewPatientDialog, { type NewPatientInput } from "@/components/dialogs/NewPatientDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, API_BASE_URL, getDownloadFilename } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { getPrestationSettings, type PrestationSetting } from "@/lib/scheduling";

interface Consultation {
  id: string;
  patientId: string;
  appointmentId: string | null;
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
  unitPrice?: number;
  total: number;
}

interface ConsultationResponse {
  consultation: Consultation;
  acts: ConsultationAct[];
}

interface AddActResponse {
  act: ConsultationAct;
}

interface ConsultationHistoryItem extends Consultation {
  patientName: string;
  acts: ConsultationAct[];
}

interface ConsultationsResponse {
  consultations: ConsultationHistoryItem[];
}

interface Patient {
  id: string;
  photoUrl: string | null;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  address: string | null;
  status: "active" | "archived";
  diagnosis: string | null;
  schoolType: "bilingue" | "mission" | "autre" | null;
  schoolLevel: string | null;
  parentFirstName: string | null;
  parentLastName: string | null;
  parentEmail: string | null;
  district: string | null;
  parentPhone1: string | null;
  parentPhone2: string | null;
}

interface PatientsResponse {
  patients: Patient[];
}

interface SpeechRecognitionResultLike {
  transcript: string;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function statusLabel(status: Consultation["status"]): string {
  if (status === "draft") return "Brouillon";
  if (status === "completed") return "Valid\u00e9e";
  if (status === "cancelled") return "Annul\u00e9e";
  return "Absent";
}

function statusBadgeClass(status: Consultation["status"]): string {
  if (status === "draft") return "border-warning/30 bg-warning/15 text-warning";
  if (status === "completed") return "border-success/30 bg-success/15 text-success";
  if (status === "cancelled") return "border-destructive/30 bg-destructive/15 text-destructive";
  return "border-muted bg-muted text-muted-foreground";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatAge(birthDate: string | null): string {
  if (!birthDate) return "Age inconnu";
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return "Age inconnu";
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return `${age} ans`;
}

function toPatientInput(patient: Patient): NewPatientInput {
  return {
    photoUrl: patient.photoUrl ?? "",
    firstName: patient.firstName,
    lastName: patient.lastName,
    birthDate: patient.birthDate ? patient.birthDate.slice(0, 10) : "",
    address: patient.address ?? "",
    schoolType: patient.schoolType ?? "",
    schoolLevel: patient.schoolLevel ?? "",
    diagnosis: patient.diagnosis ?? "",
    parentFirstName: patient.parentFirstName ?? "",
    parentLastName: patient.parentLastName ?? "",
    parentEmail: patient.parentEmail ?? "",
    district: (patient.district as NewPatientInput["district"] | null) ?? "",
    parentPhone1: patient.parentPhone1 ?? "",
    parentPhone2: patient.parentPhone2 ?? "",
    status: patient.status,
  };
}

function actsSummary(acts: ConsultationAct[]): string {
  if (!acts.length) return "-";
  return acts.map((act) => act.label).join(", ");
}

const ConsultationPage = () => {
  const { consultationId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [acts, setActs] = useState<ConsultationAct[]>([]);
  const [history, setHistory] = useState<ConsultationHistoryItem[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [notes, setNotes] = useState("");
  const [prestations, setPrestations] = useState<PrestationSetting[]>(() => getPrestationSettings());
  const [selectedPrestationId, setSelectedPrestationId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [saving, setSaving] = useState(false);
  const [reportFormat, setReportFormat] = useState<"pdf" | "word">("pdf");
  const [detailOpen, setDetailOpen] = useState(false);
  const [patientDialogMode, setPatientDialogMode] = useState<"closed" | "view" | "edit">("closed");
  const [patientSaving, setPatientSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const isDraft = consultation?.status === "draft";
  const speechSupported = typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const total = useMemo(() => acts.reduce((sum, act) => sum + act.total, 0), [acts]);

  const loadData = useCallback(async () => {
    if (!consultationId) return;
    setLoading(true);
    try {
      const detail = await apiRequest<ConsultationResponse>(`/api/consultations/${consultationId}`, { auth: true });
      const [patientsResponse, historyResponse] = await Promise.all([
        apiRequest<PatientsResponse>("/api/patients?status=all", { auth: true }),
        apiRequest<ConsultationsResponse>(`/api/consultations?patient_id=${encodeURIComponent(detail.consultation.patientId)}`, { auth: true }),
      ]);

      setConsultation(detail.consultation);
      setActs(detail.acts);
      setNotes(detail.consultation.notes ?? "");
      setHistory(
        [...historyResponse.consultations].sort(
          (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
        ),
      );
      setPatient(patientsResponse.patients.find((item) => item.id === detail.consultation.patientId) ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Chargement consultation impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [consultationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if ((location.state as { openDetail?: boolean } | null)?.openDetail) {
      setDetailOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === "medidesk.settings.prestations" || event.key === "cabortho.settings.prestations") {
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

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const downloadReport = async (consultationTargetId: string, kind: "pdf" | "word") => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/consultations/${consultationTargetId}/${kind}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getDownloadFilename(response) ?? (kind === "pdf" ? `CR-${consultationTargetId}.pdf` : `CR-${consultationTargetId}.doc`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "T\u00e9l\u00e9chargement impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  const openPatientDialog = (mode: "view" | "edit") => {
    if (!patient) return;
    setPatientDialogMode(mode);
  };

  const handlePatientUpdate = async (payload: NewPatientInput) => {
    if (!patient) return;
    setPatientSaving(true);
    try {
      await apiRequest(`/api/patients/${patient.id}`, {
        method: "PUT",
        auth: true,
        body: JSON.stringify({
          photoUrl: payload.photoUrl || null,
          firstName: payload.firstName,
          lastName: payload.lastName,
          birthDate: payload.birthDate || null,
          address: payload.address || null,
          schoolType: payload.schoolType || null,
          schoolLevel: payload.schoolLevel || null,
          diagnosis: payload.diagnosis || null,
          parentFirstName: payload.parentFirstName || null,
          parentLastName: payload.parentLastName || null,
          parentEmail: payload.parentEmail || null,
          district: payload.district || null,
          parentPhone1: payload.parentPhone1 || null,
          parentPhone2: payload.parentPhone2 || null,
          status: payload.status,
        }),
      });
      toast({ title: "Patient mis \u00e0 jour" });
      setPatientDialogMode("closed");
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mise \u00e0 jour patient impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
      throw err;
    } finally {
      setPatientSaving(false);
    }
  };

  const saveNotes = async () => {
    if (!consultation || !isDraft) return;
    setSaving(true);
    try {
      await apiRequest(`/api/consultations/${consultation.id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ notes }),
      });
      setConsultation((prev) => (prev ? { ...prev, notes } : prev));
      setHistory((prev) =>
        prev.map((item) => (item.id === consultation.id ? { ...item, notes } : item)),
      );
      toast({ title: "Compte rendu mis \u00e0 jour" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mise \u00e0 jour impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addAct = async () => {
    if (!consultation || !isDraft || !selectedPrestationId) return;
    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) {
      toast({ title: "Quantit\u00e9 invalide", variant: "destructive" });
      return;
    }
    try {
      const data = await apiRequest<AddActResponse>(`/api/consultations/${consultation.id}/acts`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ prestation_id: selectedPrestationId, quantity: q }),
      });
      setActs((prev) => [...prev, data.act]);
      setHistory((prev) =>
        prev.map((item) =>
          item.id === consultation.id ? { ...item, acts: [...item.acts, data.act] } : item,
        ),
      );
      setQuantity("1");
      toast({ title: "Prestation ajout\u00e9e" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ajout prestation impossible";
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
      setActs((prev) => prev.filter((act) => act.id !== actId));
      setHistory((prev) =>
        prev.map((item) =>
          item.id === consultation.id
            ? { ...item, acts: item.acts.filter((act) => act.id !== actId) }
            : item,
        ),
      );
      toast({ title: "Prestation supprim\u00e9e" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Suppression prestation impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  const completeConsultation = async (targetId?: string) => {
    const consultationTargetId = targetId ?? consultation?.id;
    if (!consultationTargetId) return;
    try {
      await apiRequest(`/api/consultations/${consultationTargetId}/complete`, {
        method: "POST",
        auth: true,
      });
      toast({ title: "Consultation valid\u00e9e" });
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Finalisation impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  const deleteConsultation = async (targetId?: string) => {
    const consultationTargetId = targetId ?? consultation?.id;
    if (!consultationTargetId) return;
    const ok = window.confirm("Supprimer cette consultation brouillon ?");
    if (!ok) return;
    try {
      await apiRequest(`/api/consultations/${consultationTargetId}`, {
        method: "DELETE",
        auth: true,
      });
      toast({ title: "Consultation supprim\u00e9e" });
      const remainingHistory = history.filter((item) => item.id !== consultationTargetId);
      if (consultationTargetId === consultationId) {
        if (remainingHistory.length) {
          navigate(`/consultations/${remainingHistory[0].id}`);
        } else {
          navigate("/consultations");
        }
      } else {
        await loadData();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Suppression impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  const openConsultation = (id: string) => {
    setDetailOpen(true);
    if (id === consultationId) return;
    navigate(`/consultations/${id}`);
  };

  const openOrCreateInvoice = async (consultationTarget: ConsultationHistoryItem) => {
    if (consultationTarget.status !== "completed") {
      toast({ title: "Facturation indisponible", description: "La facture n'est disponible que pour une consultation valid\u00e9e.", variant: "destructive" });
      return;
    }

    if (!consultationTarget.acts.length) {
      toast({ title: "Aucune prestation", description: "Cette consultation ne contient aucune prestation \u00e0 facturer.", variant: "destructive" });
      return;
    }

    try {
      const data = await apiRequest<{ invoice: { id: string }; created: boolean }>("/api/invoices/from-consultation", {
        method: "POST",
        auth: true,
        body: JSON.stringify({ consultation_id: consultationTarget.id }),
      });
      navigate(`/invoices/${data.invoice.id}`, { state: { openDetail: true } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ouverture facture impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  const toggleSpeechToText = () => {
    if (!speechSupported || !isDraft) return;
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (!transcript) return;
      setNotes((prev) => {
        const base = prev.trim();
        return base ? `${base}\n${transcript}` : transcript;
      });
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      toast({ title: "Dict\u00e9e vocale", description: `Erreur micro: ${event.error}`, variant: "destructive" });
    };
    recognition.onend = () => {
      setIsListening(false);
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Chargement...</p>;
  }

  if (!consultation) {
    return <p className="text-sm text-muted-foreground">Consultation introuvable.</p>;
  }

  return (
    <>
      <div className="max-w-full space-y-4 overflow-x-hidden">
        <div>
          <button
            type="button"
            onClick={() => navigate("/consultations")}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour aux consultations
          </button>
        </div>

        <div className="rounded-xl border border-border bg-card p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-muted-foreground">
                {patient?.photoUrl ? (
                  <img src={patient.photoUrl} alt={`${patient.firstName} ${patient.lastName}`} className="h-full w-full object-cover" />
                ) : (
                  <UserRound className="h-7 w-7" />
                )}
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => openPatientDialog("view")} className="text-left text-lg font-semibold text-foreground hover:underline">
                    {patient ? `${patient.firstName} ${patient.lastName}` : "Patient"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openPatientDialog("edit")}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Modifier la fiche patient"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm text-muted-foreground">{formatAge(patient?.birthDate ?? null)}</p>
                <p className="text-sm text-muted-foreground">{patient?.schoolLevel ?? "Niveau scolaire non renseign\u00e9"}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="border-b border-border bg-muted/30 px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Historique des consultations</h3>
          </div>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Motif</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actes</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statut</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => openConsultation(item.id)}
                    className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/30 ${item.id === consultation.id ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-4 py-3 text-sm text-foreground">
                      {formatDate(item.startTime)}
                      <span className="ml-2 text-muted-foreground">{formatTime(item.startTime)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{item.motifLabel ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{actsSummary(item.acts)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClass(item.status)}`}>
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void completeConsultation(item.id);
                          }}
                          disabled={item.status !== "draft"}
                          className="rounded-md border border-input p-2 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                          title="Valider"
                          aria-label="Valider"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void deleteConsultation(item.id);
                          }}
                          disabled={item.status !== "draft"}
                          className="rounded-md border border-input p-2 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                          title="Supprimer"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openConsultation(item.id);
                          }}
                          className="rounded-md border border-input p-2 hover:bg-muted"
                          title="Modifier"
                          aria-label="Modifier"
                        >
                          <SquarePen className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void downloadReport(item.id, "pdf");
                          }}
                          className="rounded-md border border-input p-2 hover:bg-muted"
                          title="Imprimer le compte rendu"
                          aria-label="Imprimer le compte rendu"
                        >
                          <FileDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void openOrCreateInvoice(item);
                          }}
                          disabled={item.status !== "completed" || item.acts.length === 0}
                          className="rounded-md border border-dashed border-input p-2 text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                          title="Ouvrir la facture"
                          aria-label="Ouvrir la facture"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!history.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-sm text-muted-foreground">
                      Aucune consultation pour ce patient.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <DialogTitle>Consultation du {formatDate(consultation.startTime)}</DialogTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {consultation.motifLabel ?? "-"}  -  {formatTime(consultation.startTime)} - {formatTime(consultation.endTime)}
                </p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadgeClass(consultation.status)}`}>
                {statusLabel(consultation.status)}
              </span>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="text-sm font-medium text-foreground">Compte rendu</label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSpeechToText}
                    disabled={!speechSupported || !isDraft}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-input px-3 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    title={speechSupported ? "Dict\u00e9e vocale FR" : "Speech-to-text non support\u00e9 par ce navigateur"}
                  >
                    {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    {isListening ? "Arr\u00eater la dict\u00e9e" : "Speech to text"}
                  </button>
                  <select value={reportFormat} onChange={(e) => setReportFormat(e.target.value as "pdf" | "word")} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                    <option value="pdf">PDF</option>
                    <option value="word">Word</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void downloadReport(consultation.id, reportFormat)}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-input px-3 text-sm hover:bg-muted"
                  >
                    <FileDown className="h-4 w-4" />
                    Imprimer le CR
                  </button>
                </div>
              </div>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!isDraft}
                rows={7}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
                placeholder="Saisir le compte rendu..."
              />

              <div className="flex flex-wrap items-center gap-2">
                {isDraft && (
                  <button type="button" onClick={() => void saveNotes()} disabled={saving} className="h-10 rounded-lg border border-input px-4 text-sm font-medium hover:bg-muted">
                    {saving ? "Enregistrement..." : "Enregistrer le CR"}
                  </button>
                )}
                <span className="text-xs text-muted-foreground">Langue par défaut de la dictée : français.</span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground">Prestations</h3>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <p className="mr-2 text-sm font-medium text-foreground">Total: {total.toFixed(2)} MAD</p>
                  <button
                    type="button"
                    onClick={() => void openOrCreateInvoice({ ...consultation, patientName: patient ? `${patient.firstName} ${patient.lastName}` : "", acts })}
                    disabled={consultation.status !== "completed" || acts.length === 0}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-input px-3 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FileText className="h-4 w-4" />
                    Ouvrir la facture
                  </button>
                </div>
              </div>

              {isDraft && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <select value={selectedPrestationId} onChange={(e) => setSelectedPrestationId(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm sm:col-span-2">
                    {prestations.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
                  <button type="button" onClick={() => void addAct()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg gradient-primary px-4 text-sm font-medium text-primary-foreground">
                    Ajouter
                  </button>
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
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
                        <td className="px-4 py-3 text-sm text-foreground">{(act.unitPrice ?? act.total / Math.max(act.quantity, 1)).toFixed(2)}</td>
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
                      <tr>
                        <td colSpan={5} className="px-4 py-4 text-sm text-muted-foreground">
                          Aucune prestation.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
              {isDraft && (
                <button type="button" onClick={() => void deleteConsultation()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-input px-4 text-sm font-medium hover:bg-muted">
                  <Trash2 className="h-4 w-4" />
                  Supprimer
                </button>
              )}
              {isDraft && (
                <button type="button" onClick={() => void completeConsultation()} className="inline-flex h-10 items-center gap-2 rounded-lg gradient-primary px-4 text-sm font-medium text-primary-foreground">
                  <Check className="h-4 w-4" />
                  Compléter la consultation
                </button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <NewPatientDialog
        open={patientDialogMode !== "closed"}
        onOpenChange={(open) => {
          if (!open) setPatientDialogMode("closed");
        }}
        onSubmit={handlePatientUpdate}
        isSubmitting={patientSaving}
        readOnly={patientDialogMode === "view"}
        onRequestEdit={() => setPatientDialogMode("edit")}
        title={patientDialogMode === "edit" ? "Modifier le patient" : "Fiche patient"}
        submitLabel="Enregistrer"
        initialValues={patient ? toPatientInput(patient) : undefined}
      />
    </>
  );
};

export default ConsultationPage;





