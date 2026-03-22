import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileDown, Pencil, SquarePen, Trash2, UserRound } from "lucide-react";
import NewPatientDialog, { type NewPatientInput } from "@/components/dialogs/NewPatientDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, getDownloadFilename } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { getAuthToken } from "@/lib/auth";

interface Invoice {
  id: string;
  patientId: string;
  patientName?: string;
  invoiceNumber: string;
  status: "draft" | "paid";
  invoiceDate: string;
  totalHt: number;
  totalTtc: number;
  notes: string | null;
}

interface InvoiceLine {
  id: string;
  label: string;
  quantity: number;
  unitPrice: number;
  originalUnitPrice: number;
  total: number;
  remark: string | null;
}

interface InvoiceDetailResponse {
  invoice: Invoice;
  lines: InvoiceLine[];
}

interface InvoiceItem {
  id: string;
  patientId: string;
  patientName?: string;
  invoiceNumber: string;
  status: "draft" | "paid";
  invoiceDate: string;
  totalTtc: number;
}

interface InvoicesResponse {
  invoices: InvoiceItem[];
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

function statusLabel(status: Invoice["status"]): string {
  if (status === "draft") return "Brouillon";
  return "Payée";
}

function statusBadgeClass(status: Invoice["status"]): string {
  if (status === "draft") return "border-warning/30 bg-warning/15 text-warning";
  return "border-success/30 bg-success/15 text-success";
}

function todayDateInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDateInput(value: string | null | undefined): string {
  if (!value) return todayDateInput();
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : todayDateInput();
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
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

const InvoiceDetailPage = () => {
  const { invoiceId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [history, setHistory] = useState<InvoiceItem[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [notes, setNotes] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [status, setStatus] = useState<Invoice["status"]>("draft");
  const [detailOpen, setDetailOpen] = useState(false);
  const [patientDialogMode, setPatientDialogMode] = useState<"closed" | "view" | "edit">("closed");
  const [patientSaving, setPatientSaving] = useState(false);

  const isPaid = invoice?.status === "paid";
  const computedTotal = useMemo(() => lines.reduce((sum, line) => sum + line.total, 0), [lines]);

  const loadData = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const detail = await apiRequest<InvoiceDetailResponse>(`/api/invoices/${invoiceId}`, { auth: true });
      const [patientsResponse, historyResponse] = await Promise.all([
        apiRequest<PatientsResponse>("/api/patients?status=all", { auth: true }),
        apiRequest<InvoicesResponse>(`/api/invoices?patient_id=${encodeURIComponent(detail.invoice.patientId)}&page_size=100`, { auth: true }),
      ]);

      setInvoice(detail.invoice);
      setLines(detail.lines);
      setNotes(detail.invoice.notes ?? "");
      setInvoiceDate(normalizeDateInput(detail.invoice.invoiceDate));
      setStatus(detail.invoice.status);
      setHistory(
        [...historyResponse.invoices].sort(
          (a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime(),
        ),
      );
      setPatient(patientsResponse.patients.find((item) => item.id === detail.invoice.patientId) ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Chargement facture impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if ((location.state as { openDetail?: boolean } | null)?.openDetail) {
      setDetailOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

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
      toast({ title: "Patient mis à jour" });
      setPatientDialogMode("closed");
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mise à jour patient impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
      throw err;
    } finally {
      setPatientSaving(false);
    }
  };

  const saveHeader = async (nextStatus?: Invoice["status"]) => {
    if (!invoice) return;
    const statusToSave = nextStatus ?? status;
    try {
      await apiRequest(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ invoice_date: normalizeDateInput(invoiceDate), notes, status: statusToSave }),
      });
      setStatus(statusToSave);
      toast({ title: "Facture mise à jour" });
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mise à jour impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  const saveLine = async (line: InvoiceLine) => {
    if (!invoice) return;
    if (line.unitPrice !== line.originalUnitPrice && !(line.remark ?? "").trim()) {
      toast({ title: "Remarque obligatoire", description: "Ajoute une remarque si le prix est modifié.", variant: "destructive" });
      return;
    }
    try {
      await apiRequest(`/api/invoices/${invoice.id}/lines/${line.id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({
          label: line.label,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          total: line.total,
          remark: line.remark,
        }),
      });
      toast({ title: "Ligne mise à jour" });
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mise à jour ligne impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  const deleteLine = async (line: InvoiceLine) => {
    if (!invoice || isPaid) return;
    try {
      await apiRequest(`/api/invoices/${invoice.id}/lines/${line.id}`, { method: "DELETE", auth: true });
      toast({ title: "Ligne supprimée" });
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Suppression ligne impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  const deleteInvoice = async (target?: InvoiceItem) => {
    const targetInvoiceId = target?.id ?? invoice?.id;
    const targetStatus = target?.status ?? invoice?.status;
    const targetNumber = target?.invoiceNumber ?? invoice?.invoiceNumber;
    if (!targetInvoiceId || targetStatus !== "draft") return;
    if (!window.confirm(`Supprimer ${targetNumber} ?`)) return;
    try {
      await apiRequest(`/api/invoices/${targetInvoiceId}`, { method: "DELETE", auth: true });
      toast({ title: "Facture supprimée" });
      const remaining = history.filter((item) => item.id !== targetInvoiceId);
      if (targetInvoiceId === invoiceId) {
        if (remaining.length) {
          navigate(`/invoices/${remaining[0].id}`);
        } else {
          navigate("/invoices");
        }
      } else {
        await loadData();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Suppression impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  const updateLine = (lineId: string, field: keyof InvoiceLine, value: string | number) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const next = { ...line, [field]: value } as InvoiceLine;
        if (field === "quantity" || field === "unitPrice") {
          next.total = Number((next.quantity * next.unitPrice).toFixed(2));
        }
        return next;
      }),
    );
  };

  const openInvoice = (id: string) => {
    setDetailOpen(true);
    if (id === invoiceId) return;
    navigate(`/invoices/${id}`);
  };

  const downloadPdf = async (targetId?: string, targetNumber?: string) => {
    const invoiceTargetId = targetId ?? invoice?.id;
    const invoiceTargetNumber = targetNumber ?? invoice?.invoiceNumber ?? "facture";
    if (!invoiceTargetId) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000"}/api/invoices/${invoiceTargetId}/pdf`, {
        headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
      });
      if (!response.ok) throw new Error("Téléchargement PDF impossible");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getDownloadFilename(response) ?? `${invoiceTargetNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Téléchargement PDF impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Chargement...</p>;
  }

  if (!invoice) {
    return <p className="text-sm text-muted-foreground">Facture introuvable.</p>;
  }

  return (
    <>
      <div className="max-w-full space-y-4 overflow-x-hidden">
        <div>
          <button
            type="button"
            onClick={() => navigate("/invoices")}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour aux factures
          </button>
        </div>

        <div className="rounded-xl border border-border bg-card p-5" style={{ boxShadow: "var(--shadow-card)" }}>
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
              <p className="text-sm text-muted-foreground">{patient?.schoolLevel ?? "Niveau scolaire non renseigné"}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="border-b border-border bg-muted/30 px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Historique des factures</h3>
          </div>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Facture</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statut</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => openInvoice(item.id)}
                    className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/30 ${item.id === invoice.id ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-4 py-3 text-sm text-foreground">{formatDate(item.invoiceDate)}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{item.invoiceNumber}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{item.totalTtc.toFixed(2)} MAD</td>
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
                            openInvoice(item.id);
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
                            void downloadPdf(item.id, item.invoiceNumber);
                          }}
                          className="rounded-md border border-input p-2 hover:bg-muted"
                          title="Télécharger la facture"
                          aria-label="Télécharger la facture"
                        >
                          <FileDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void deleteInvoice(item);
                          }}
                          disabled={item.status !== "draft"}
                          className="rounded-md border border-input p-2 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                          title="Supprimer"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!history.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-sm text-muted-foreground">
                      Aucune facture pour ce patient.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <DialogTitle>{invoice.invoiceNumber}</DialogTitle>
                <p className="mt-1 text-sm text-muted-foreground">Date de facture: {formatDate(normalizeDateInput(invoiceDate || invoice.invoiceDate))}</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadgeClass(invoice.status)}`}>
                {statusLabel(invoice.status)}
              </span>
            </div>
          </DialogHeader>

          <div className="space-y-4 invoice-print-area">
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <input
                  type="date"
                  value={normalizeDateInput(invoiceDate)}
                  onChange={(e) => setInvoiceDate(normalizeDateInput(e.target.value))}
                  disabled={isPaid}
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-60"
                />
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Invoice["status"])}
                  disabled={isPaid}
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-60"
                >
                  <option value="draft">Brouillon</option>
                  <option value="paid">Payée</option>
                </select>
                <div className="self-center text-sm text-foreground">Total TTC: {invoice.totalTtc.toFixed(2)} MAD</div>
              </div>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isPaid}
                rows={2}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                placeholder="Notes facture..."
              />

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void saveHeader()} disabled={isPaid} className="h-10 rounded-lg gradient-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
                  Enregistrer
                </button>
                <button type="button" onClick={() => void saveHeader("paid")} disabled={isPaid} className="h-10 rounded-lg border border-input px-4 text-sm disabled:opacity-60">
                  Marquer payée
                </button>
                <button type="button" onClick={() => void downloadPdf()} className="h-10 rounded-lg border border-input px-4 text-sm">
                  Télécharger PDF
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Libellé</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Qté</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prix unitaire</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Remarque</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const priceChanged = line.unitPrice !== line.originalUnitPrice;
                      return (
                        <tr key={line.id} className="border-b border-border/50">
                          <td className="px-4 py-3">
                            <input value={line.label} onChange={(e) => updateLine(line.id, "label", e.target.value)} disabled={isPaid} className="h-9 w-full rounded border border-input bg-background px-2 text-sm disabled:opacity-60" />
                          </td>
                          <td className="px-4 py-3">
                            <input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(line.id, "quantity", Number(e.target.value))} disabled={isPaid} className="h-9 w-20 rounded border border-input bg-background px-2 text-sm disabled:opacity-60" />
                          </td>
                          <td className="px-4 py-3">
                            <input type="number" min={0} step="0.01" value={line.unitPrice} onChange={(e) => updateLine(line.id, "unitPrice", Number(e.target.value))} disabled={isPaid} className="h-9 w-28 rounded border border-input bg-background px-2 text-sm disabled:opacity-60" />
                          </td>
                          <td className="px-4 py-3">
                            <input type="number" min={0} step="0.01" value={line.total} onChange={(e) => updateLine(line.id, "total", Number(e.target.value))} disabled={isPaid} className="h-9 w-28 rounded border border-input bg-background px-2 text-sm disabled:opacity-60" />
                          </td>
                          <td className="px-4 py-3">
                            <input value={line.remark ?? ""} onChange={(e) => updateLine(line.id, "remark", e.target.value)} disabled={isPaid} placeholder={priceChanged ? "Obligatoire si le prix change" : "Optionnel"} className={`h-9 w-full rounded border px-2 text-sm disabled:opacity-60 ${priceChanged ? "border-warning" : "border-input"} bg-background`} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button type="button" onClick={() => void saveLine(line)} disabled={isPaid} className="rounded border border-input px-2 py-1 text-xs disabled:opacity-60">
                                Enregistrer ligne
                              </button>
                              <button type="button" onClick={() => void deleteLine(line)} disabled={isPaid} className="rounded border border-input px-2 py-1 text-xs disabled:opacity-60">
                                Supprimer
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={6} className="px-4 py-3 text-right text-sm font-semibold text-foreground">
                        Total calculé: {computedTotal.toFixed(2)} MAD
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
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

export default InvoiceDetailPage;



