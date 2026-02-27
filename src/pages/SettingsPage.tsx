import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Bell, Building2, ClipboardList, Pencil, Plus, Shield, Trash2, User } from "lucide-react";
import {
  generateSettingId,
  getAppointmentReasonSettings,
  getPrestationSettings,
  setAppointmentReasonSettings,
  setPrestationSettings,
  type AppointmentReasonSetting,
  type PrestationSetting,
} from "@/lib/scheduling";
import { toast } from "@/hooks/use-toast";

type PanelId = "cabinet" | "profil" | "notifications" | "securite" | "prestations" | "motifs";

const cards: Array<{ id: PanelId; title: string; desc: string; icon: typeof Building2 }> = [
  { id: "cabinet", title: "Cabinet", desc: "Nom, adresse, fuseau horaire, logo", icon: Building2 },
  { id: "profil", title: "Profil", desc: "Informations personnelles, mot de passe", icon: User },
  { id: "notifications", title: "Notifications", desc: "Préférences de notification", icon: Bell },
  { id: "securite", title: "Sécurité", desc: "Sessions actives, authentification", icon: Shield },
  { id: "prestations", title: "Prestations", desc: "Actes: durée par défaut et prix", icon: ClipboardList },
  { id: "motifs", title: "Motifs de RDV", desc: "Motifs et durées par type de rendez-vous", icon: ClipboardList },
];

const SettingsPage = () => {
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);

  const [prestations, setPrestations] = useState<PrestationSetting[]>(() => getPrestationSettings());
  const [reasons, setReasons] = useState<AppointmentReasonSetting[]>(() => getAppointmentReasonSettings());

  const [prestationName, setPrestationName] = useState("");
  const [prestationDuration, setPrestationDuration] = useState("45");
  const [prestationPrice, setPrestationPrice] = useState("0");
  const [editingPrestationId, setEditingPrestationId] = useState<string | null>(null);

  const [reasonName, setReasonName] = useState("");
  const [reasonDuration, setReasonDuration] = useState("45");
  const [editingReasonId, setEditingReasonId] = useState<string | null>(null);

  const hasPrestations = useMemo(() => prestations.length > 0, [prestations]);
  const hasReasons = useMemo(() => reasons.length > 0, [reasons]);

  const savePrestations = (next: PrestationSetting[]) => {
    setPrestations(next);
    setPrestationSettings(next);
  };

  const saveReasons = (next: AppointmentReasonSetting[]) => {
    setReasons(next);
    setAppointmentReasonSettings(next);
  };

  const resetPrestationForm = () => {
    setPrestationName("");
    setPrestationDuration("45");
    setPrestationPrice("0");
    setEditingPrestationId(null);
  };

  const resetReasonForm = () => {
    setReasonName("");
    setReasonDuration("45");
    setEditingReasonId(null);
  };

  const addOrUpdatePrestation = () => {
    const name = prestationName.trim();
    const duration = Number(prestationDuration);
    const price = Number(prestationPrice);

    if (!name || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(price) || price < 0) {
      toast({ title: "Champs invalides", description: "Vérifie le nom, la durée et le prix.", variant: "destructive" });
      return;
    }

    if (editingPrestationId) {
      savePrestations(prestations.map((item) => item.id === editingPrestationId ? { ...item, name, defaultDurationMinutes: Math.round(duration), price: Number(price.toFixed(2)) } : item));
      toast({ title: "Prestation modifiée" });
    } else {
      savePrestations([
        ...prestations,
        { id: generateSettingId(name), name, defaultDurationMinutes: Math.round(duration), price: Number(price.toFixed(2)) },
      ]);
      toast({ title: "Prestation ajoutée" });
    }
    resetPrestationForm();
  };

  const addOrUpdateReason = () => {
    const name = reasonName.trim();
    const duration = Number(reasonDuration);

    if (!name || !Number.isFinite(duration) || duration <= 0) {
      toast({ title: "Champs invalides", description: "Vérifie le nom et la durée.", variant: "destructive" });
      return;
    }

    if (editingReasonId) {
      saveReasons(reasons.map((item) => item.id === editingReasonId ? { ...item, name, durationMinutes: Math.round(duration) } : item));
      toast({ title: "Motif modifié" });
    } else {
      saveReasons([...reasons, { id: generateSettingId(name), name, durationMinutes: Math.round(duration) }]);
      toast({ title: "Motif ajouté" });
    }
    resetReasonForm();
  };

  if (!activePanel) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="max-w-6xl">
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => setActivePanel(card.id)}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-7 text-left transition-all hover:shadow-md"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="rounded-2xl bg-muted p-4">
                <card.icon className="h-7 w-7 text-foreground" />
              </div>
              <div>
                <p className="text-3 leading-7 text-xl font-semibold text-foreground">{card.title}</p>
                <p className="text-sm text-muted-foreground">{card.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    );
  }

  const activeMeta = cards.find((item) => item.id === activePanel)!;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4 max-w-6xl">
      <button type="button" onClick={() => setActivePanel(null)} className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm text-foreground hover:bg-muted">
        <ArrowLeft className="h-4 w-4" />
        Retour aux rubriques
      </button>

      {(activePanel === "cabinet" || activePanel === "profil" || activePanel === "notifications" || activePanel === "securite") && (
        <div className="rounded-xl border border-border bg-card p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <h3 className="text-base font-semibold text-foreground">{activeMeta.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">Cette section est prête pour le paramétrage détaillé.</p>
        </div>
      )}

      {activePanel === "prestations" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
          <h3 className="text-base font-semibold text-foreground">Prestations</h3>
          <p className="text-xs text-muted-foreground">CRUD complet: nom de l'acte, durée par défaut, prix.</p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input value={prestationName} onChange={(e) => setPrestationName(e.target.value)} placeholder="Nom de l'acte" className="h-10 rounded-lg border border-input bg-background px-3 text-sm md:col-span-2 focus:outline-none focus:ring-2 focus:ring-ring/30" />
            <input type="number" min={1} value={prestationDuration} onChange={(e) => setPrestationDuration(e.target.value)} placeholder="Durée (min)" className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30" />
            <input type="number" min={0} step="0.01" value={prestationPrice} onChange={(e) => setPrestationPrice(e.target.value)} placeholder="Prix" className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30" />
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={addOrUpdatePrestation} className="inline-flex h-10 items-center gap-2 rounded-lg gradient-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" />
              {editingPrestationId ? "Mettre à jour" : "Ajouter"}
            </button>
            {editingPrestationId && (
              <button type="button" onClick={resetPrestationForm} className="h-10 rounded-lg border border-input px-4 text-sm font-medium text-foreground hover:bg-muted">
                Annuler
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Acte</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Durée</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prix</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!hasPrestations && (
                  <tr><td colSpan={4} className="px-4 py-4 text-sm text-muted-foreground">Aucune prestation.</td></tr>
                )}
                {prestations.map((item) => (
                  <tr key={item.id} className="border-b border-border/50">
                    <td className="px-4 py-3 text-sm text-foreground">{item.name}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{item.defaultDurationMinutes} min</td>
                    <td className="px-4 py-3 text-sm text-foreground">{item.price.toFixed(2)} MAD</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button type="button" onClick={() => { setEditingPrestationId(item.id); setPrestationName(item.name); setPrestationDuration(String(item.defaultDurationMinutes)); setPrestationPrice(String(item.price)); }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Modifier">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => { savePrestations(prestations.filter((row) => row.id !== item.id)); if (editingPrestationId === item.id) resetPrestationForm(); }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive" title="Supprimer">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activePanel === "motifs" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
          <h3 className="text-base font-semibold text-foreground">Motifs de RDV</h3>
          <p className="text-xs text-muted-foreground">CRUD complet: nom et durée.</p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input value={reasonName} onChange={(e) => setReasonName(e.target.value)} placeholder="Nom du motif" className="h-10 rounded-lg border border-input bg-background px-3 text-sm md:col-span-3 focus:outline-none focus:ring-2 focus:ring-ring/30" />
            <input type="number" min={1} value={reasonDuration} onChange={(e) => setReasonDuration(e.target.value)} placeholder="Durée (min)" className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30" />
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={addOrUpdateReason} className="inline-flex h-10 items-center gap-2 rounded-lg gradient-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" />
              {editingReasonId ? "Mettre à jour" : "Ajouter"}
            </button>
            {editingReasonId && (
              <button type="button" onClick={resetReasonForm} className="h-10 rounded-lg border border-input px-4 text-sm font-medium text-foreground hover:bg-muted">
                Annuler
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Motif</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Durée</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!hasReasons && (
                  <tr><td colSpan={3} className="px-4 py-4 text-sm text-muted-foreground">Aucun motif.</td></tr>
                )}
                {reasons.map((item) => (
                  <tr key={item.id} className="border-b border-border/50">
                    <td className="px-4 py-3 text-sm text-foreground">{item.name}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{item.durationMinutes} min</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button type="button" onClick={() => { setEditingReasonId(item.id); setReasonName(item.name); setReasonDuration(String(item.durationMinutes)); }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Modifier">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => { saveReasons(reasons.filter((row) => row.id !== item.id)); if (editingReasonId === item.id) resetReasonForm(); }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive" title="Supprimer">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default SettingsPage;
