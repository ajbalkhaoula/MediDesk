import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

interface NewAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NewAssessmentDialog = ({ open, onOpenChange }: NewAssessmentDialogProps) => {
  const [form, setForm] = useState({ patient: "", type: "", notes: "" });

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({ title: "Bilan créé", description: `${form.type} pour ${form.patient}` });
    setForm({ patient: "", type: "", notes: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau bilan</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Patient</label>
            <select required value={form.patient} onChange={(e) => update("patient", e.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30">
              <option value="">Sélectionner un patient...</option>
              <option value="Lucas Moreau">Lucas Moreau</option>
              <option value="Emma Dubois">Emma Dubois</option>
              <option value="Noah Bernard">Noah Bernard</option>
              <option value="Léa Petit">Léa Petit</option>
              <option value="Hugo Martin">Hugo Martin</option>
              <option value="Clara Fontaine">Clara Fontaine</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Type de bilan</label>
            <select required value={form.type} onChange={(e) => update("type", e.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30">
              <option value="">Sélectionner...</option>
              <option value="Bilan initial">Bilan initial</option>
              <option value="Bilan de langage oral">Bilan de langage oral</option>
              <option value="Bilan de langage écrit">Bilan de langage écrit</option>
              <option value="Bilan de fluence">Bilan de fluence</option>
              <option value="Bilan articulatoire">Bilan articulatoire</option>
              <option value="Bilan de déglutition">Bilan de déglutition</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={3} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none" placeholder="Notes optionnelles..." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-lg border border-input px-4 text-sm font-medium text-foreground hover:bg-muted transition-colors">
              Annuler
            </button>
            <button type="submit" className="h-10 rounded-lg gradient-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">
              Créer le bilan
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewAssessmentDialog;
