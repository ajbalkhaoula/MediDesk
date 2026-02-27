import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownAZ, ArrowUpAZ, Plus, Search } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { getPrestationSettings } from "@/lib/scheduling";

interface PatientItem {
  id: string;
  firstName: string;
  lastName: string;
}

interface InvoiceItem {
  id: string;
  patientId: string;
  patientName?: string;
  invoiceNumber: string;
  status: "draft" | "sent" | "paid";
  invoiceDate: string;
  totalTtc: number;
}

interface InvoicesResponse {
  invoices: InvoiceItem[];
  page: number;
  pageSize: number;
  total: number;
}

function statusLabel(status: InvoiceItem["status"]): string {
  if (status === "draft") return "Brouillon";
  if (status === "sent") return "Envoyée";
  return "Payée";
}

const InvoicesPage = () => {
  const navigate = useNavigate();
  const prestations = useMemo(() => getPrestationSettings(), []);
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const [patientId, setPatientId] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [prestationId, setPrestationId] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"patient" | "date">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [showCreate, setShowCreate] = useState(false);
  const [createPatientId, setCreatePatientId] = useState("");
  const [createMode, setCreateMode] = useState<"acts" | "range">("acts");
  const [createRangeFrom, setCreateRangeFrom] = useState("");
  const [createRangeTo, setCreateRangeTo] = useState("");
  const [unbilledActs, setUnbilledActs] = useState<Array<{ id: string; label: string; total: number; consultationDate: string }>>([]);
  const [selectedActIds, setSelectedActIds] = useState<string[]>([]);

  const maxPage = Math.max(1, Math.ceil(total / pageSize));

  const loadPatients = async () => {
    try {
      const response = await apiRequest<{ patients: PatientItem[] }>("/api/patients?status=all", { auth: true });
      setPatients(response.patients);
      if (!createPatientId && response.patients.length) setCreatePatientId(response.patients[0].id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Chargement patients impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (patientId) params.set("patient_id", patientId);
      if (status) params.set("status", status);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (prestationId) params.set("prestation_id", prestationId);
      if (minAmount) params.set("min_amount", minAmount);
      if (maxAmount) params.set("max_amount", maxAmount);
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      const data = await apiRequest<InvoicesResponse>(`/api/invoices?${params.toString()}`, { auth: true });
      setInvoices(data.invoices);
      setTotal(data.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Chargement factures impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadUnbilledActs = async (pid: string) => {
    if (!pid) return;
    try {
      const data = await apiRequest<{ acts: Array<{ id: string; label: string; total: number; consultationDate: string }> }>(
        `/api/patients/${pid}/unbilled-acts`,
        { auth: true },
      );
      setUnbilledActs(data.acts);
      setSelectedActIds(data.acts.map((item) => item.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Chargement actes impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  useEffect(() => {
    void loadPatients();
  }, []);

  useEffect(() => {
    void loadInvoices();
  }, [patientId, status, dateFrom, dateTo, prestationId, minAmount, maxAmount, page]);

  useEffect(() => {
    if (showCreate && createMode === "acts" && createPatientId) {
      void loadUnbilledActs(createPatientId);
    }
  }, [showCreate, createMode, createPatientId]);

  const sortedInvoices = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? invoices.filter((invoice) => {
          return [
            invoice.invoiceNumber,
            invoice.patientName ?? "",
            invoice.invoiceDate,
            statusLabel(invoice.status),
            invoice.totalTtc.toFixed(2),
          ]
            .join(" ")
            .toLowerCase()
            .includes(term);
        })
      : invoices;

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "patient") return (a.patientName ?? "").localeCompare(b.patientName ?? "", "fr");
      return new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime();
    });

    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [invoices, search, sortBy, sortDir]);

  const toggleSort = (key: "patient" | "date") => {
    if (sortBy === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(key);
    setSortDir("asc");
  };

  const createInvoice = async () => {
    try {
      if (createMode === "acts") {
        if (!selectedActIds.length) {
          toast({ title: "Aucun acte sélectionné", variant: "destructive" });
          return;
        }
        const data = await apiRequest<{ invoice: { id: string } }>("/api/invoices", {
          method: "POST",
          auth: true,
          body: JSON.stringify({ patient_id: createPatientId, consultation_act_ids: selectedActIds }),
        });
        setShowCreate(false);
        void loadInvoices();
        navigate(`/invoices/${data.invoice.id}`);
        return;
      }

      if (!createRangeFrom || !createRangeTo) {
        toast({ title: "Dates requises", variant: "destructive" });
        return;
      }

      const data = await apiRequest<{ invoice: { id: string } }>("/api/invoices", {
        method: "POST",
        auth: true,
        body: JSON.stringify({ patient_id: createPatientId, date_from: createRangeFrom, date_to: createRangeTo }),
      });
      setShowCreate(false);
      void loadInvoices();
      navigate(`/invoices/${data.invoice.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Création facture impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  const deleteInvoice = async (invoice: InvoiceItem) => {
    if (invoice.status !== "draft") return;
    if (!window.confirm(`Supprimer ${invoice.invoiceNumber} ?`)) return;
    try {
      await apiRequest(`/api/invoices/${invoice.id}`, { method: "DELETE", auth: true });
      toast({ title: "Facture supprimée" });
      void loadInvoices();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Suppression impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-foreground">Factures</h2>
        <button type="button" onClick={() => setShowCreate((prev) => !prev)} className="inline-flex h-10 items-center gap-2 rounded-lg gradient-primary px-4 text-sm font-medium text-primary-foreground">
          <Plus className="h-4 w-4" />
          Nouvelle facture
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3" style={{ boxShadow: "var(--shadow-card)" }}>
          <h3 className="text-base font-semibold text-foreground">Créer une facture</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <select value={createPatientId} onChange={(e) => setCreatePatientId(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm md:col-span-2">
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>{patient.firstName} {patient.lastName}</option>
              ))}
            </select>
            <select value={createMode} onChange={(e) => setCreateMode(e.target.value as "acts" | "range")} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
              <option value="acts">Par actes non facturés</option>
              <option value="range">Par plage de dates</option>
            </select>
            <button type="button" onClick={() => void createInvoice()} className="h-10 rounded-lg border border-input px-4 text-sm font-medium hover:bg-muted">
              Créer
            </button>
          </div>

          {createMode === "range" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input type="date" value={createRangeFrom} onChange={(e) => setCreateRangeFrom(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
              <input type="date" value={createRangeTo} onChange={(e) => setCreateRangeTo(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
            </div>
          )}

          {createMode === "acts" && (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
              {unbilledActs.map((act) => {
                const checked = selectedActIds.includes(act.id);
                return (
                  <label key={act.id} className="flex items-center gap-2 border-b border-border/50 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedActIds((prev) => [...prev, act.id]);
                        } else {
                          setSelectedActIds((prev) => prev.filter((id) => id !== act.id));
                        }
                      }}
                    />
                    <span className="flex-1">{act.label}</span>
                    <span className="text-muted-foreground">{new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(new Date(act.consultationDate))}</span>
                    <span>{act.total.toFixed(2)} MAD</span>
                  </label>
                );
              })}
              {!unbilledActs.length && <p className="px-3 py-3 text-sm text-muted-foreground">Aucun acte non facturé.</p>}
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4 space-y-3" style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
          <select value={patientId} onChange={(e) => { setPage(1); setPatientId(e.target.value); }} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
            <option value="">Tous les patients</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>{patient.firstName} {patient.lastName}</option>
            ))}
          </select>
          <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
            <option value="">Tous statuts</option>
            <option value="draft">Brouillon</option>
            <option value="sent">Envoyée</option>
            <option value="paid">Payée</option>
          </select>
          <input type="date" value={dateFrom} onChange={(e) => { setPage(1); setDateFrom(e.target.value); }} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
          <input type="date" value={dateTo} onChange={(e) => { setPage(1); setDateTo(e.target.value); }} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
          <select value={prestationId} onChange={(e) => { setPage(1); setPrestationId(e.target.value); }} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
            <option value="">Tous actes</option>
            {prestations.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <input type="number" min={0} value={minAmount} onChange={(e) => { setPage(1); setMinAmount(e.target.value); }} placeholder="Min" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
          <input type="number" min={0} value={maxAmount} onChange={(e) => { setPage(1); setMaxAmount(e.target.value); }} placeholder="Max" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher dans les factures..."
            className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm"
          />
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Facture #</th>
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
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total TTC</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statut</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="px-4 py-4 text-sm text-muted-foreground">Chargement...</td></tr>}
              {!loading && !sortedInvoices.length && <tr><td colSpan={6} className="px-4 py-4 text-sm text-muted-foreground">Aucune facture.</td></tr>}
              {!loading && sortedInvoices.map((invoice) => (
                <tr key={invoice.id} className="border-b border-border/50">
                  <td className="px-4 py-3 text-sm text-foreground">{invoice.invoiceNumber}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{invoice.patientName ?? "-"}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{invoice.invoiceDate}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{invoice.totalTtc.toFixed(2)} MAD</td>
                  <td className="px-4 py-3 text-sm text-foreground">{statusLabel(invoice.status)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button type="button" onClick={() => navigate(`/invoices/${invoice.id}`)} className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted">Voir</button>
                      <button type="button" onClick={() => navigate(`/invoices/${invoice.id}`)} className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted">Modifier</button>
                      <button type="button" disabled={invoice.status !== "draft"} onClick={() => void deleteInvoice(invoice)} className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted disabled:opacity-50">Supprimer</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1} className="h-9 rounded-lg border border-input px-3 text-sm disabled:opacity-50">Précédent</button>
        <span className="text-sm text-muted-foreground">Page {page} / {maxPage}</span>
        <button type="button" onClick={() => setPage((prev) => Math.min(maxPage, prev + 1))} disabled={page >= maxPage} className="h-9 rounded-lg border border-input px-3 text-sm disabled:opacity-50">Suivant</button>
      </div>
    </div>
  );
};

export default InvoicesPage;

