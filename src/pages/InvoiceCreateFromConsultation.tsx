import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

const InvoiceCreateFromConsultation = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      const patientId = params.get("patientId");
      const consultationId = params.get("consultationId");
      if (!patientId || !consultationId) {
        navigate("/invoices", { replace: true });
        return;
      }

      try {
        const acts = await apiRequest<{ acts: Array<{ id: string; consultationId: string }> }>(
          `/api/patients/${patientId}/unbilled-acts`,
          { auth: true },
        );
        const targetActIds = acts.acts.filter((act) => act.consultationId === consultationId).map((act) => act.id);
        if (!targetActIds.length) {
          toast({ title: "Aucun acte non facturé sur cette consultation", variant: "destructive" });
          navigate("/invoices", { replace: true });
          return;
        }

        const created = await apiRequest<{ invoice: { id: string } }>("/api/invoices", {
          method: "POST",
          auth: true,
          body: JSON.stringify({
            patient_id: patientId,
            consultation_act_ids: targetActIds,
          }),
        });
        navigate(`/invoices/${created.invoice.id}`, { replace: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Création facture impossible";
        toast({ title: "Erreur", description: message, variant: "destructive" });
        navigate("/invoices", { replace: true });
      }
    };
    void run();
  }, [navigate, params]);

  return <p className="text-sm text-muted-foreground">Création de la facture en cours...</p>;
};

export default InvoiceCreateFromConsultation;
