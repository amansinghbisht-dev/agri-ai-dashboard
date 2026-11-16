import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import Settings from "./pages/Settings";
import {
  LayoutDashboard,
  LineChart,
  Settings as SettingsIcon,
  Sprout,
} from "lucide-react";

const NAV_ITEMS = [
  {
    path: "/",
    label: "Live Dashboard",
    mobileLabel: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    path: "/history",
    label: "Data History",
    mobileLabel: "History",
    icon: LineChart,
  },
  {
    path: "/settings",
    label: "System Controls",
    mobileLabel: "Controls",
    icon: SettingsIcon,
  },
];

function DesktopSidebar() {
  const { pathname } = useLocation();

  return (
    <nav className="hidden md:flex w-64 shrink-0 h-screen bg-gray-900 border-r border-gray-800 p-6 flex-col gap-3">
      <div className="flex items-center gap-2.5 mb-6">
        <Sprout className="text-green-400" size={24} />
        <h1 className="text-xl font-bold text-green-400">Agri-AI Kit</h1>
      </div>

      {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
        const active = pathname === path;
        return (
          <Link
            key={path}
            to={path}
            className={`flex items-center gap-3 p-3 rounded-lg transition ${
              active
                ? "bg-gray-800 text-green-400 font-medium"
                : "text-gray-300 hover:bg-gray-800/60"
            }`}
          >
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function MobileHeader() {
  return (
    <header className="md:hidden shrink-0 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-3 flex items-center gap-2">
      <Sprout className="text-green-400" size={20} />
      <h1 className="text-lg font-bold text-green-400">Agri-AI Kit</h1>
    </header>
  );
}

function MobileBottomNav() {
  const { pathname } = useLocation();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-gray-900/95 backdrop-blur border-t border-gray-800 flex justify-around items-center py-2 px-2">
      {NAV_ITEMS.map(({ path, mobileLabel, icon: Icon }) => {
        const active = pathname === path;
        return (
          <Link
            key={path}
            to={path}
            className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-lg text-xs transition ${
              active
                ? "text-green-400 font-semibold bg-gray-800/80"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <Icon size={20} />
            <span>{mobileLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function App() {
  return (
    <Router>
      <div className="h-dvh overflow-hidden bg-gray-950 text-white flex flex-col md:flex-row">
        <DesktopSidebar />
        <MobileHeader />

        {/* Main scrollable content area */}
        <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>

        <MobileBottomNav />
      </div>
    </Router>
  );
}

export default App;
