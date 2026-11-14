import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import Settings from "./pages/Settings";
import { LayoutDashboard, LineChart, Settings as SettingsIcon } from "lucide-react";

function Sidebar() {
  const { pathname } = useLocation();
  const linkClass = (path) =>
    `flex items-center gap-3 p-3 rounded-lg transition ${
      pathname === path
        ? "bg-gray-800 text-green-400 font-medium"
        : "text-gray-300 hover:bg-gray-800/60"
    }`;

  return (
    <nav className="w-64 shrink-0 h-screen bg-gray-900 border-r border-gray-800 p-6 flex flex-col gap-3">
      <h1 className="text-xl font-bold mb-6 text-green-400">Agri-AI Kit</h1>
      <Link to="/" className={linkClass("/")}>
        <LayoutDashboard size={20} /> Live Dashboard
      </Link>
      <Link to="/history" className={linkClass("/history")}>
        <LineChart size={20} /> Data History
      </Link>
      <Link to="/settings" className={linkClass("/settings")}>
        <SettingsIcon size={20} /> System Controls
      </Link>
    </nav>
  );
}

function App() {
  return (
    <Router>
      <div className="h-screen overflow-hidden bg-gray-950 text-white flex">
        <Sidebar />

        {/* Only this main pane scrolls */}
        <main className="flex-1 h-screen overflow-y-auto p-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;