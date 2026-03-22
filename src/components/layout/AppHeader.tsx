import { Bell, Menu, Search } from "lucide-react";
import { useLocation } from "react-router-dom";

const pageTitles: Record<string, string> = {
  "/": "Tableau de bord",
  "/patients": "Patients",
  "/calendar": "Rendez-vous",
  "/consultations": "Consultations",
  "/invoices": "Factures",
  "/assessments": "Bilans",
  "/reports": "Rapports",
  "/settings": "Paramètres",
};

interface AppHeaderProps {
  onMenuClick: () => void;
}

const AppHeader = ({ onMenuClick }: AppHeaderProps) => {
  const location = useLocation();
  const title = pageTitles[location.pathname] || "MediDesk";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 backdrop-blur-md px-3 sm:px-4 lg:px-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors lg:hidden"
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h2 className="text-lg sm:text-xl font-bold text-foreground">{title}</h2>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher..."
            className="h-9 w-44 lg:w-64 rounded-lg border border-input bg-muted/50 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all"
          />
        </div>
        <button className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
        </button>
      </div>
    </header>
  );
};

export default AppHeader;
