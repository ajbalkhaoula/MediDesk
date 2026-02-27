import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { getAuthToken } from "@/lib/auth";

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: "draft" | "sent" | "paid";
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

function statusLabel(status: Invoice["status"]): string {
  if (status === "draft") return "Brouillon";
  if (status === "sent") return "Envoyée";
  return "Payée";
}

const InvoiceDetailPage = () => {
  const { invoiceId = "" } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [notes, setNotes] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [status, setStatus] = useState<Invoice["status"]>("draft");

  const isPaid = invoice?.status === "paid";
  const computedTotal = useMemo(() => lines.reduce((sum, line) => sum + line.total, 0), [lines]);

  const loadDetail = async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const data = await apiRequest<InvoiceDetailResponse>(`/api/invoices/${invoiceId}`, { auth: true });
      setInvoice(data.invoice);
      setLines(data.lines);
      setNotes(data.invoice.notes ?? "");
      setInvoiceDate(data.invoice.invoiceDate);
      setStatus(data.invoice.status);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Chargement facture impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDetail();
  }, [invoiceId]);

  const saveHeader = async () => {
    if (!invoice) return;
    try {
      await apiRequest(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ invoice_date: invoiceDate, notes, status }),
      });
      toast({ title: "Facture mise à jour" });
      await loadDetail();
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
      await loadDetail();
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
      await loadDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Suppression ligne impossible";
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

  const downloadPdf = async () => {
    if (!invoice) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000"}/api/invoices/${invoice.id}/pdf`, {
        headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
      });
      if (!response.ok) throw new Error("Téléchargement PDF impossible");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Téléchargement PDF impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 invoice-print-area">
      <div className="print:hidden">
        <button type="button" onClick={() => navigate("/invoices")} className="h-9 rounded-lg border border-input px-3 text-sm hover:bg-muted">
          Retour
        </button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Chargement...</p>}
      {!loading && invoice && (
        <>
          <div className="rounded-xl border border-border bg-card p-5 space-y-3" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-foreground">{invoice.invoiceNumber}</h2>
              <span className="rounded-full border px-3 py-1 text-xs font-medium">{statusLabel(invoice.status)}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} disabled={isPaid} className="h-10 rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-60" />
              <select value={status} onChange={(e) => setStatus(e.target.value as Invoice["status"])} disabled={isPaid} className="h-10 rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-60">
                <option value="draft">Brouillon</option>
                <option value="sent">Envoyée</option>
                <option value="paid">Payée</option>
              </select>
              <div className="text-sm text-foreground self-center">Total TTC: {invoice.totalTtc.toFixed(2)} MAD</div>
            </div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isPaid} rows={2} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-60" placeholder="Notes facture..." />

            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <button type="button" onClick={() => void saveHeader()} disabled={isPaid} className="h-10 rounded-lg gradient-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">Enregistrer</button>
              <button type="button" onClick={() => { setStatus("sent"); void saveHeader(); }} disabled={isPaid} className="h-10 rounded-lg border border-input px-4 text-sm disabled:opacity-60">Marquer envoyée</button>
              <button type="button" onClick={() => { setStatus("paid"); void saveHeader(); }} disabled={isPaid} className="h-10 rounded-lg border border-input px-4 text-sm disabled:opacity-60">Marquer payée</button>
              <button type="button" onClick={() => void downloadPdf()} className="h-10 rounded-lg border border-input px-4 text-sm">Télécharger PDF</button>
              <button type="button" onClick={() => window.print()} className="h-10 rounded-lg border border-input px-4 text-sm">Imprimer</button>
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
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground print:hidden">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const priceChanged = line.unitPrice !== line.originalUnitPrice;
                    return (
                      <tr key={line.id} className="border-b border-border/50">
                        <td className="px-4 py-3"><input value={line.label} onChange={(e) => updateLine(line.id, "label", e.target.value)} disabled={isPaid} className="h-9 w-full rounded border border-input bg-background px-2 text-sm disabled:opacity-60" /></td>
                        <td className="px-4 py-3"><input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(line.id, "quantity", Number(e.target.value))} disabled={isPaid} className="h-9 w-20 rounded border border-input bg-background px-2 text-sm disabled:opacity-60" /></td>
                        <td className="px-4 py-3"><input type="number" min={0} step="0.01" value={line.unitPrice} onChange={(e) => updateLine(line.id, "unitPrice", Number(e.target.value))} disabled={isPaid} className="h-9 w-28 rounded border border-input bg-background px-2 text-sm disabled:opacity-60" /></td>
                        <td className="px-4 py-3"><input type="number" min={0} step="0.01" value={line.total} onChange={(e) => updateLine(line.id, "total", Number(e.target.value))} disabled={isPaid} className="h-9 w-28 rounded border border-input bg-background px-2 text-sm disabled:opacity-60" /></td>
                        <td className="px-4 py-3"><input value={line.remark ?? ""} onChange={(e) => updateLine(line.id, "remark", e.target.value)} disabled={isPaid} placeholder={priceChanged ? "Obligatoire si le prix change" : "Optionnel"} className={`h-9 w-full rounded border px-2 text-sm disabled:opacity-60 ${priceChanged ? "border-warning" : "border-input"} bg-background`} /></td>
                        <td className="px-4 py-3 text-right print:hidden">
                          <div className="inline-flex items-center gap-2">
                            <button type="button" onClick={() => void saveLine(line)} disabled={isPaid} className="rounded border border-input px-2 py-1 text-xs disabled:opacity-60">Enregistrer ligne</button>
                            <button type="button" onClick={() => void deleteLine(line)} disabled={isPaid} className="rounded border border-input px-2 py-1 text-xs disabled:opacity-60">Supprimer</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr><td colSpan={6} className="px-4 py-3 text-right text-sm font-semibold text-foreground">Total calculé: {computedTotal.toFixed(2)} MAD</td></tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default InvoiceDetailPage;
