import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface NewPatientInput {
  photoUrl: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  address: string;
  schoolType: "bilingue" | "mission" | "autre" | "";
  schoolLevel: string;
  diagnosis: string;
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  district:
    | "Anfa"
    | "Aïn Diab"
    | "Maârif"
    | "Gauthier"
    | "Bourgogne"
    | "Sidi Maarouf"
    | "Hay Hassani"
    | "Ben M'Sik"
    | "Sidi Moumen"
    | "Aïn Sebaâ"
    | "Derb Sultan"
    | "Mers Sultan"
    | "Roches Noires"
    | "Sbata"
    | "Lissasfa"
    | "Oulfa"
    | "autre"
    | "";
  parentPhone1: string;
  parentPhone2: string;
  status: "active" | "archived";
}

interface NewPatientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSubmitting?: boolean;
  onSubmit: (payload: NewPatientInput) => Promise<void>;
  title?: string;
  submitLabel?: string;
  initialValues?: Partial<NewPatientInput>;
  readOnly?: boolean;
  onRequestEdit?: () => void;
}

const schoolLevelsByType: Record<"bilingue" | "mission" | "autre", string[]> = {
  bilingue: ["Maternelle", "CP", "CE1", "CE2", "CM1", "CM2", "6e", "5e", "4e", "3e", "2nde", "1ère", "Terminale"],
  mission: ["PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2", "6e", "5e", "4e", "3e", "2nde", "1ère", "Terminale"],
  autre: ["Crèche", "Préscolaire", "Primaire", "Collège", "Lycée", "Supérieur", "Autre"],
};

const districts = [
  "Anfa",
  "Aïn Diab",
  "Maârif",
  "Gauthier",
  "Bourgogne",
  "Sidi Maarouf",
  "Hay Hassani",
  "Ben M'Sik",
  "Sidi Moumen",
  "Aïn Sebaâ",
  "Derb Sultan",
  "Mers Sultan",
  "Roches Noires",
  "Sbata",
  "Lissasfa",
  "Oulfa",
  "autre",
] as const;

const initialForm: NewPatientInput = {
  photoUrl: "",
  firstName: "",
  lastName: "",
  birthDate: "",
  address: "",
  schoolType: "",
  schoolLevel: "",
  diagnosis: "",
  parentFirstName: "",
  parentLastName: "",
  parentEmail: "",
  district: "",
  parentPhone1: "",
  parentPhone2: "",
  status: "active",
};

function computeAge(birthDate: string): string {
  if (!birthDate) return "";
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return "";

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age >= 0 ? `${age} ans` : "";
}

const NewPatientDialog = ({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
  title = "Nouveau patient",
  submitLabel = "Créer le patient",
  initialValues,
  readOnly = false,
  onRequestEdit,
}: NewPatientDialogProps) => {
  const [form, setForm] = useState<NewPatientInput>(initialForm);
  const [photoFileName, setPhotoFileName] = useState("");
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;

    setForm({
      photoUrl: initialValues?.photoUrl ?? "",
      firstName: initialValues?.firstName ?? "",
      lastName: initialValues?.lastName ?? "",
      birthDate: initialValues?.birthDate ?? "",
      address: initialValues?.address ?? "",
      schoolType: initialValues?.schoolType ?? "",
      schoolLevel: initialValues?.schoolLevel ?? "",
      diagnosis: initialValues?.diagnosis ?? "",
      parentFirstName: initialValues?.parentFirstName ?? "",
      parentLastName: initialValues?.parentLastName ?? "",
      parentEmail: initialValues?.parentEmail ?? "",
      district: initialValues?.district ?? "",
      parentPhone1: initialValues?.parentPhone1 ?? "",
      parentPhone2: initialValues?.parentPhone2 ?? "",
      status: initialValues?.status ?? "active",
    });
    setPhotoFileName("");
  }, [open, initialValues]);

  const levelOptions = useMemo(() => {
    if (!form.schoolType) return [];
    return schoolLevelsByType[form.schoolType as "bilingue" | "mission" | "autre"];
  }, [form.schoolType]);

  useEffect(() => {
    if (!form.schoolType) {
      if (form.schoolLevel) setForm((prev) => ({ ...prev, schoolLevel: "" }));
      return;
    }
    if (form.schoolLevel && !levelOptions.includes(form.schoolLevel)) {
      setForm((prev) => ({ ...prev, schoolLevel: "" }));
    }
  }, [form.schoolType, form.schoolLevel, levelOptions]);

  const update = (field: keyof NewPatientInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const onPhotoSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setPhotoFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setForm((prev) => ({ ...prev, photoUrl: result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    await onSubmit(form);
    setForm(initialForm);
    onOpenChange(false);
  };

  const age = computeAge(form.birthDate);
  const photoStatus = readOnly ? "" : (photoFileName || "Aucun fichier choisi");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{title}</DialogTitle>
            {readOnly && onRequestEdit && (
              <button
                type="button"
                onClick={onRequestEdit}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Modifier"
                title="Modifier"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div className="rounded-lg border border-border p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Prénom</label>
                  <input required value={form.firstName} onChange={(e) => update("firstName", e.target.value)} readOnly={readOnly} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 read-only:bg-muted read-only:text-muted-foreground" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Nom</label>
                  <input required value={form.lastName} onChange={(e) => update("lastName", e.target.value)} readOnly={readOnly} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 read-only:bg-muted read-only:text-muted-foreground" />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Âge (fixe)</label>
                  <input value={age || "-"} readOnly className="h-10 w-full rounded-lg border border-input bg-muted px-3 text-sm text-muted-foreground" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Niveau scolaire (fixe)</label>
                  <input value={form.schoolLevel || "-"} readOnly className="h-10 w-full rounded-lg border border-input bg-muted px-3 text-sm text-muted-foreground" />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border p-3">
              <div className="space-y-2">
                <div className="flex h-28 w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/60">
                  {form.photoUrl ? (
                    <img src={form.photoUrl} alt="Aperçu" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Aucune</span>
                  )}
                </div>
                <div className="min-w-0">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    onChange={onPhotoSelected}
                    disabled={readOnly}
                    className="hidden"
                  />
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="h-9 rounded-lg border border-input px-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      Choisir un fichier
                    </button>
                  )}
                  {!readOnly && (
                    <p className="mt-1 max-w-[180px] truncate text-xs text-muted-foreground" title={photoStatus}>
                      {photoStatus}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Date de naissance</label>
            <input type="date" value={form.birthDate} onChange={(e) => update("birthDate", e.target.value)} disabled={readOnly} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60" />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Adresse complète</label>
            <input value={form.address} onChange={(e) => update("address", e.target.value)} readOnly={readOnly} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 read-only:bg-muted read-only:text-muted-foreground" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Type d'école</label>
              <select value={form.schoolType} onChange={(e) => update("schoolType", e.target.value)} disabled={readOnly} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60">
                <option value="">Sélectionner...</option>
                <option value="bilingue">Bilingue</option>
                <option value="mission">Mission</option>
                <option value="autre">Autre</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Niveau scolaire</label>
              <select value={form.schoolLevel} onChange={(e) => update("schoolLevel", e.target.value)} disabled={readOnly || !form.schoolType} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60">
                <option value="">Sélectionner...</option>
                {levelOptions.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Diagnostic initial</label>
            <input value={form.diagnosis} onChange={(e) => update("diagnosis", e.target.value)} readOnly={readOnly} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 read-only:bg-muted read-only:text-muted-foreground" />
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-sm font-semibold text-foreground">Parent</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Nom</label>
                <input value={form.parentLastName} onChange={(e) => update("parentLastName", e.target.value)} readOnly={readOnly} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 read-only:bg-muted read-only:text-muted-foreground" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Prénom</label>
                <input value={form.parentFirstName} onChange={(e) => update("parentFirstName", e.target.value)} readOnly={readOnly} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 read-only:bg-muted read-only:text-muted-foreground" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Email</label>
              <input type="email" value={form.parentEmail} onChange={(e) => update("parentEmail", e.target.value)} readOnly={readOnly} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 read-only:bg-muted read-only:text-muted-foreground" />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Quartier</label>
              <select value={form.district} onChange={(e) => update("district", e.target.value)} disabled={readOnly} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60">
                <option value="">Sélectionner...</option>
                {districts.map((district) => (
                  <option key={district} value={district}>{district}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Numéro de téléphone 1</label>
                <input value={form.parentPhone1} onChange={(e) => update("parentPhone1", e.target.value)} readOnly={readOnly} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 read-only:bg-muted read-only:text-muted-foreground" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Numéro de téléphone 2</label>
                <input value={form.parentPhone2} onChange={(e) => update("parentPhone2", e.target.value)} readOnly={readOnly} placeholder="accompagnateur" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 read-only:bg-muted read-only:text-muted-foreground" />
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Statut</label>
            <select value={form.status} onChange={(e) => update("status", e.target.value as "active" | "archived")} disabled={readOnly} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60">
              <option value="active">Actif</option>
              <option value="archived">Archivé</option>
            </select>
          </div>

          {!readOnly && (
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-10 rounded-lg border border-input px-4 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-10 rounded-lg gradient-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {isSubmitting ? "Enregistrement..." : submitLabel}
              </button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewPatientDialog;
