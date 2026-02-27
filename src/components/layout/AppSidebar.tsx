import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ClipboardList,
  FileText,
  Settings,
  LogOut,
} from "lucide-react";
import { clearAuthToken } from "@/lib/auth";

const navItems = [
  { icon: LayoutDashboard, label: "Tableau de bord", path: "/" },
  { icon: Users, label: "Patients", path: "/patients" },
  { icon: CalendarDays, label: "Rendez-vous", path: "/calendar" },
  { icon: ClipboardList, label: "Bilans", path: "/assessments" },
  { icon: FileText, label: "Rapports", path: "/reports" },
  { icon: Settings, label: "Parametres", path: "/settings" },
];

interface AppSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const AppSidebar = ({ mobileOpen, onMobileClose }: AppSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    clearAuthToken();
    navigate("/login", { replace: true });
    onMobileClose();
  };

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={onMobileClose}
          className="fixed inset-0 z-30 bg-black/35 lg:hidden"
        />
      )}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="flex items-stretch border-b border-sidebar-border/60">
          <div className="w-20 shrink-0 overflow-hidden bg-white">
            <img src="/logo.png" alt="Le Mot Magique" className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-col justify-center px-4 py-5">
            <h1 className="text-base font-bold text-sidebar-accent-foreground">Le Mot Magique</h1>
            <p className="text-xs text-accent font-semibold">Cabinet d'orthophonie</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onMobileClose}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-sidebar-primary/20 text-white"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className="h-[18px] w-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border px-3 py-4">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-primary/25 text-xs font-semibold text-white">
              LA
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-sidebar-accent-foreground">Dr. Laila Ajbal</p>
              <p className="truncate text-xs text-sidebar-foreground/70">Orthophoniste</p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-md p-1.5 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              aria-label="Se deconnecter"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default AppSidebar;
