import { motion } from "framer-motion";
import { Download, Eye, FileText } from "lucide-react";

const reports = [
  { id: 1, patient: "Lucas Moreau", title: "Rapport - Bilan langage écrit", date: "12 fév. 2026", version: "v1" },
  { id: 2, patient: "Noah Bernard", title: "Rapport - Bilan langage oral", date: "9 fév. 2026", version: "v2" },
  { id: 3, patient: "Clara Fontaine", title: "Rapport - Bilan langage oral", date: "7 fév. 2026", version: "v1" },
];

const Reports = () => {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-5">
      <p className="text-sm text-muted-foreground">{reports.length} rapports générés</p>

      <div className="space-y-3">
        {reports.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-all hover:shadow-md cursor-pointer"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="rounded-lg bg-primary/10 p-3">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{r.title}</p>
              <p className="text-xs text-muted-foreground">{r.patient} · {r.date} · {r.version}</p>
            </div>
            <div className="flex items-center gap-1">
              <button className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <Eye className="h-4 w-4" />
              </button>
              <button className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                <Download className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default Reports;
