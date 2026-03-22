import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Search, Plus, Filter, Trash2, Phone, Pencil, Eye, Archive, ArchiveRestore } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import NewPatientDialog, { type NewPatientInput } from "@/components/dialogs/NewPatientDialog";
import ListPagination from "@/components/ui/list-pagination";
import { apiRequest } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

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
  sessionsCount: number;
  lastSessionDate: string | null;
}

interface PatientsResponse {
  patients: Patient[];
}

type PatientDialogMode = "create" | "view" | "edit";
type PatientStatusFilter = "active" | "archived" | "all";

const statusStyles: Record<string, string> = {
  active: "bg-success/15 text-success",
  archived: "bg-muted text-muted-foreground",
};

function computeAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

function formatAge(birthDate: string | null): string {
  const age = computeAge(birthDate);
  if (age === null) return "Âge inconnu";
  return `${age} ans`;
}

function formatDateFR(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

function toDateInputValue(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function toPatientInput(patient: Patient): NewPatientInput {
  return {
    photoUrl: patient.photoUrl ?? "",
    firstName: patient.firstName,
    lastName: patient.lastName,
    birthDate: toDateInputValue(patient.birthDate),
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

function isSamePatientPayload(a: NewPatientInput, b: NewPatientInput): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const Patients = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPatientDialog, setShowPatientDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [dialogMode, setDialogMode] = useState<PatientDialogMode>("create");
  const [statusFilter, setStatusFilter] = useState<PatientStatusFilter>("active");
  const loadRequestIdRef = useRef(0);

  const loadPatients = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());

      const data = await apiRequest<PatientsResponse>(`/api/patients?${params.toString()}`, { auth: true });
      if (requestId !== loadRequestIdRef.current) return;
      setPatients(data.patients);
      setError(null);
    } catch (err) {
      if (requestId !== loadRequestIdRef.current) return;
      const message = err instanceof Error ? err.message : "Impossible de charger les patients";
      setError(message);
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadPatients();
    }, 200);
    return () => clearTimeout(timer);
  }, [loadPatients]);

  const openCreateDialog = () => {
    setEditingPatient(null);
    setDialogMode("create");
    setShowPatientDialog(true);
  };

  useEffect(() => {
    if ((location.state as { openCreate?: boolean } | null)?.openCreate) {
      openCreateDialog();
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const openViewDialog = (patient: Patient) => {
    setEditingPatient(patient);
    setDialogMode("view");
    setShowPatientDialog(true);
  };

  const openEditDialog = (patient: Patient) => {
    setEditingPatient(patient);
    setDialogMode("edit");
    setShowPatientDialog(true);
  };

  const handleCreatePatient = async (payload: NewPatientInput) => {
    await apiRequest<{ patient: Patient }>("/api/patients", {
      method: "POST",
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

    toast({ title: "Patient créé", description: `${payload.firstName} ${payload.lastName} a été ajouté.` });
  };

  const handleUpdatePatient = async (payload: NewPatientInput, patientId: string) => {
    await apiRequest<{ patient: Patient }>(`/api/patients/${patientId}`, {
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

    toast({ title: "Patient modifié", description: `${payload.firstName} ${payload.lastName} a été mis à jour.` });
  };

  const handleSubmitPatient = async (payload: NewPatientInput) => {
    setSaving(true);
    try {
      if (editingPatient && dialogMode !== "create") {
        const initialPayload = toPatientInput(editingPatient);
        if (isSamePatientPayload(payload, initialPayload)) {
          toast({ title: "Aucune modification", description: "Le dossier patient n'a pas changé." });
          return;
        }
        await handleUpdatePatient(payload, editingPatient.id);
      } else {
        await handleCreatePatient(payload);
      }
      await loadPatients();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Enregistrement impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePatient = async (patient: Patient) => {
    const ok = window.confirm(`Supprimer ${patient.firstName} ${patient.lastName} ?`);
    if (!ok) return;

    setDeletingId(patient.id);
    try {
      await apiRequest<void>(`/api/patients/${patient.id}`, { method: "DELETE", auth: true });
      toast({ title: "Patient supprimé", description: `${patient.firstName} ${patient.lastName} a été supprimé.` });
      await loadPatients();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Suppression impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSetPatientStatus = async (patient: Patient, nextStatus: "active" | "archived") => {
    if (patient.status === nextStatus) return;

    setStatusUpdatingId(patient.id);
    try {
      const payload = toPatientInput(patient);
      await handleUpdatePatient({ ...payload, status: nextStatus }, patient.id);
      await loadPatients();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mise à jour du statut impossible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const rows = useMemo(() => patients, [patients]);
  const pageSize = 12;
  const maxPage = Math.max(1, Math.ceil(rows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [page, rows]);
  const isReadOnly = dialogMode === "view";
  const dialogTitle = dialogMode === "create" ? "Nouveau patient" : dialogMode === "view" ? "Fiche patient" : "Modifier le patient";
  const submitLabel = dialogMode === "create" ? "Créer le patient" : "Enregistrer";

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [page, maxPage]);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher un patient..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all"
          />
        </div>
        <div className="flex w-full gap-2 sm:w-auto sm:self-auto">
          <label className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm text-foreground sm:flex-none">
            <Filter className="h-4 w-4" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as PatientStatusFilter)}
              className="w-full bg-transparent text-sm outline-none"
            >
              <option value="active">Actifs</option>
              <option value="archived">Archivés</option>
              <option value="all">Tous</option>
            </select>
          </label>
          <button
            onClick={openCreateDialog}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg gradient-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity sm:flex-none"
          >
            <Plus className="h-4 w-4" />
            Nouveau patient
          </button>
        </div>
      </div>

      <div className="md:hidden space-y-3">
        {!loading && paginatedRows.map((patient) => (
          <div
            key={patient.id}
            onClick={() => openViewDialog(patient)}
            className="cursor-pointer rounded-xl border border-border bg-card p-4 space-y-3"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {patient.photoUrl ? (
                  <img src={patient.photoUrl} alt={`${patient.firstName} ${patient.lastName}`} className="h-full w-full object-cover" />
                ) : (
                  <span>{(patient.firstName[0] ?? "") + (patient.lastName[0] ?? "")}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{patient.firstName} {patient.lastName}</p>
                <p className="text-xs text-muted-foreground">{patient.schoolLevel ?? "Niveau non renseigné"} • {formatAge(patient.birthDate)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Diagnostic</p>
                <p className="text-foreground">{patient.diagnosis ?? "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Téléphone parent</p>
                <p className="text-foreground">{patient.parentPhone1 ?? "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Séances</p>
                <p className="text-foreground">{patient.sessionsCount ?? 0}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Dernière séance</p>
                <p className="text-foreground">{formatDateFR(patient.lastSessionDate)}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[patient.status]}`}>
                {patient.status === "active" ? "Actif" : "Archivé"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openViewDialog(patient);
                  }}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Consulter"
                  title="Consulter la fiche patient"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditDialog(patient);
                  }}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Modifier"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleSetPatientStatus(patient, patient.status === "archived" ? "active" : "archived");
                  }}
                  disabled={statusUpdatingId === patient.id}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                  aria-label={patient.status === "archived" ? "Désarchiver" : "Archiver"}
                  title={patient.status === "archived" ? "Désarchiver le patient" : "Archiver le patient"}
                >
                  {patient.status === "archived" ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDeletePatient(patient);
                  }}
                  disabled={deletingId === patient.id}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive transition-colors disabled:opacity-50"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">Chargement...</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-12 text-destructive">
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Search className="h-8 w-8 mb-2" />
            <p className="text-sm">Aucun patient trouvé</p>
          </div>
        )}
      </div>

      <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Patient</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Niveau</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Diagnostic initial</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Statut</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Séances</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dernière séance</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Téléphone parent</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && paginatedRows.map((patient) => (
                <tr
                  key={patient.id}
                  onClick={() => openViewDialog(patient)}
                  className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/30"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {patient.photoUrl ? (
                          <img src={patient.photoUrl} alt={`${patient.firstName} ${patient.lastName}`} className="h-full w-full object-cover" />
                        ) : (
                          <span>{(patient.firstName[0] ?? "") + (patient.lastName[0] ?? "")}</span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{patient.firstName} {patient.lastName}</p>
                        <p className="text-xs text-muted-foreground">{formatAge(patient.birthDate)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-foreground">{patient.schoolLevel ?? "-"}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-foreground">{patient.diagnosis ?? "-"}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[patient.status]}`}>
                      {patient.status === "active" ? "Actif" : "Archivé"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-foreground">{patient.sessionsCount ?? 0}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-foreground">{formatDateFR(patient.lastSessionDate)}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{patient.parentPhone1 ?? "-"}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2 whitespace-nowrap">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openViewDialog(patient);
                      }}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      aria-label="Consulter"
                      title="Consulter la fiche patient"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditDialog(patient);
                      }}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      aria-label="Modifier"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleSetPatientStatus(patient, patient.status === "archived" ? "active" : "archived");
                      }}
                      disabled={statusUpdatingId === patient.id}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                      aria-label={patient.status === "archived" ? "Désarchiver" : "Archiver"}
                      title={patient.status === "archived" ? "Désarchiver le patient" : "Archiver le patient"}
                    >
                      {patient.status === "archived" ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeletePatient(patient);
                      }}
                      disabled={deletingId === patient.id}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive transition-colors disabled:opacity-50"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">Chargement...</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-12 text-destructive">
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Search className="h-8 w-8 mb-2" />
            <p className="text-sm">Aucun patient trouvé</p>
          </div>
        )}
      </div>

      {!loading && !error && rows.length > 0 && (
        <ListPagination
          page={page}
          maxPage={maxPage}
          onPrevious={() => setPage((prev) => Math.max(1, prev - 1))}
          onNext={() => setPage((prev) => Math.min(maxPage, prev + 1))}
        />
      )}

      <NewPatientDialog
        open={showPatientDialog}
        onOpenChange={(open) => {
          setShowPatientDialog(open);
          if (!open) {
            setEditingPatient(null);
            setDialogMode("create");
          }
        }}
        onSubmit={handleSubmitPatient}
        isSubmitting={saving}
        readOnly={isReadOnly}
        onRequestEdit={() => setDialogMode("edit")}
        title={dialogTitle}
        submitLabel={submitLabel}
        initialValues={editingPatient ? toPatientInput(editingPatient) : undefined}
      />
    </motion.div>
  );
};

export default Patients;
