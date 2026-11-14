import { useEffect, useState } from "react";
import { ref, onValue, update } from "firebase/database";
import { db } from "../firebase";
import {
  Settings as SettingsIcon,
  Power,
  Sun,
  Droplet,
  Clock,
  Save,
  ToggleLeft,
  ToggleRight,
  CheckCircle2,
} from "lucide-react";

const DRY_RAW = 1023;
const WET_RAW = 200;

const rawToPercent = (raw) => {
  const clamped = Math.min(DRY_RAW, Math.max(WET_RAW, Number(raw) || DRY_RAW));
  return Math.round(((DRY_RAW - clamped) / (DRY_RAW - WET_RAW)) * 100);
};

const percentToRaw = (pct) =>
  Math.round(DRY_RAW - (Number(pct) / 100) * (DRY_RAW - WET_RAW));

export default function Settings() {
  // Automation rules
  const [autoWater, setAutoWater] = useState(true);
  const [startMoisturePct, setStartMoisturePct] = useState(40);
  const [stopMoisturePct, setStopMoisturePct] = useState(80);

  const [autoLight, setAutoLight] = useState(true);
  const [ledStart, setLedStart] = useState("18:00");
  const [ledEnd, setLedEnd] = useState("06:00");

  // Manual overrides
  const [manualPump, setManualPump] = useState(false);
  const [manualLight, setManualLight] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    const settingsRef = ref(db, "settings");
    const unsubscribe = onValue(settingsRef, (snapshot) => {
      const val = snapshot.val();
      if (!val) return;

      if (val.autoWater !== undefined) setAutoWater(val.autoWater === 1);
      if (val.threshold !== undefined) {
        setStartMoisturePct(rawToPercent(val.threshold));
      }
      if (val.stopThreshold !== undefined) {
        setStopMoisturePct(rawToPercent(val.stopThreshold));
      }

      if (val.autoLight !== undefined) setAutoLight(val.autoLight === 1);
      if (val.ledStart !== undefined) setLedStart(val.ledStart);
      if (val.ledEnd !== undefined) setLedEnd(val.ledEnd);

      if (val.manualPump !== undefined) setManualPump(val.manualPump === 1);
      if (val.manualLight !== undefined) setManualLight(val.manualLight === 1);
    });

    return () => unsubscribe();
  }, []);

  const handleStartSlider = (val) => {
    const nextStart = Number(val);
    setStartMoisturePct(nextStart);
    if (stopMoisturePct <= nextStart + 5) {
      setStopMoisturePct(Math.min(95, nextStart + 10));
    }
  };

  const handleStopSlider = (val) => {
    const nextStop = Number(val);
    setStopMoisturePct(nextStop);
    if (startMoisturePct >= nextStop - 5) {
      setStartMoisturePct(Math.max(10, nextStop - 10));
    }
  };

  const saveAutomation = async () => {
    setSaving(true);
    setSavedNotice(false);
    try {
      await update(ref(db, "settings"), {
        autoWater: autoWater ? 1 : 0,
        threshold: percentToRaw(startMoisturePct),
        stopThreshold: percentToRaw(stopMoisturePct),
        autoLight: autoLight ? 1 : 0,
        ledStart,
        ledEnd,
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } catch (err) {
      console.error("Failed to save automation settings:", err);
    } finally {
      setSaving(false);
    }
  };

  const togglePump = async () => {
    const newState = !manualPump;
    setManualPump(newState);
    try {
      await update(ref(db, "settings"), { manualPump: newState ? 1 : 0 });
    } catch (err) {
      console.error("Failed to toggle pump:", err);
    }
  };

  const toggleLight = async () => {
    const newState = !manualLight;
    setManualLight(newState);
    try {
      await update(ref(db, "settings"), { manualLight: newState ? 1 : 0 });
    } catch (err) {
      console.error("Failed to toggle light:", err);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-8 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <SettingsIcon className="text-gray-400" /> System Controls
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Configure automatic irrigation thresholds, lighting schedules, and
            manual overrides
          </p>
        </div>

        {savedNotice && (
          <div className="flex items-center gap-2 bg-emerald-950/60 border border-emerald-700/60 text-emerald-300 px-4 py-2 rounded-full text-sm">
            <CheckCircle2 size={16} /> Synced to Firebase
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* COLUMN 1: MANUAL OVERRIDES */}
        <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800 shadow-xl space-y-6">
          <div className="border-b border-gray-800 pb-4">
            <h3 className="text-lg font-semibold text-gray-200">
              Manual Overrides
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Overrides take priority over automatic schedules
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center bg-gray-800/80 p-4 rounded-xl border border-gray-700">
              <div className="flex items-center gap-3">
                <Power
                  className={manualPump ? "text-green-400" : "text-gray-500"}
                />
                <div>
                  <h4 className="font-medium text-sm">Force Water Pump</h4>
                  <p className="text-xs text-gray-400">
                    {manualPump ? "Forced ON" : "Following rules"}
                  </p>
                </div>
              </div>
              <button onClick={togglePump}>
                {manualPump ? (
                  <ToggleRight className="text-green-500 w-10 h-10" />
                ) : (
                  <ToggleLeft className="text-gray-500 w-10 h-10" />
                )}
              </button>
            </div>

            <div className="flex justify-between items-center bg-gray-800/80 p-4 rounded-xl border border-gray-700">
              <div className="flex items-center gap-3">
                <Sun
                  className={manualLight ? "text-yellow-400" : "text-gray-500"}
                />
                <div>
                  <h4 className="font-medium text-sm">Force Grow Lights</h4>
                  <p className="text-xs text-gray-400">
                    {manualLight ? "Forced ON" : "Following schedule"}
                  </p>
                </div>
              </div>
              <button onClick={toggleLight}>
                {manualLight ? (
                  <ToggleRight className="text-yellow-500 w-10 h-10" />
                ) : (
                  <ToggleLeft className="text-gray-500 w-10 h-10" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* COLUMN 2 & 3: AUTOMATION RULES */}
        <div className="lg:col-span-2 bg-gray-900 p-6 rounded-2xl border border-gray-800 shadow-xl space-y-6">
          <div className="border-b border-gray-800 pb-4">
            <h3 className="text-lg font-semibold text-gray-200">
              Automation Rules
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Saved to Firebase and cached locally on the ESP32 for offline use
            </p>
          </div>

          {/* IRRIGATION AUTOMATION BLOCK */}
          <div className="bg-gray-800/50 p-5 rounded-xl border border-gray-800 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Droplet size={18} className="text-blue-400" />
                <div>
                  <h4 className="font-medium text-gray-200">
                    Automatic Irrigation
                  </h4>
                  <p className="text-xs text-gray-400">
                    Waters between dry trigger and wet stop target
                  </p>
                </div>
              </div>
              <button onClick={() => setAutoWater((prev) => !prev)}>
                {autoWater ? (
                  <ToggleRight className="text-blue-500 w-10 h-10" />
                ) : (
                  <ToggleLeft className="text-gray-500 w-10 h-10" />
                )}
              </button>
            </div>

            <div
              className={`space-y-4 transition-opacity ${
                autoWater ? "opacity-100" : "opacity-40 pointer-events-none"
              }`}
            >
              {/* Start Threshold */}
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-gray-300">
                    Turn Pump ON when moisture drops below:
                  </span>
                  <span className="font-semibold text-blue-400">
                    {startMoisturePct}%
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="80"
                  step="5"
                  value={startMoisturePct}
                  onChange={(e) => handleStartSlider(e.target.value)}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              {/* Stop Threshold */}
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-gray-300">
                    Turn Pump OFF when moisture reaches:
                  </span>
                  <span className="font-semibold text-emerald-400">
                    {stopMoisturePct}%
                  </span>
                </div>
                <input
                  type="range"
                  min="25"
                  max="95"
                  step="5"
                  value={stopMoisturePct}
                  onChange={(e) => handleStopSlider(e.target.value)}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* LIGHTING AUTOMATION BLOCK */}
          <div className="bg-gray-800/50 p-5 rounded-xl border border-gray-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Sun size={18} className="text-yellow-400" />
                <div>
                  <h4 className="font-medium text-gray-200">
                    Automatic Grow Light Schedule
                  </h4>
                  <p className="text-xs text-gray-400">
                    Uses ESP32 RTC module to toggle LEDs on schedule
                  </p>
                </div>
              </div>
              <button onClick={() => setAutoLight((prev) => !prev)}>
                {autoLight ? (
                  <ToggleRight className="text-yellow-500 w-10 h-10" />
                ) : (
                  <ToggleLeft className="text-gray-500 w-10 h-10" />
                )}
              </button>
            </div>

            <div
              className={`grid grid-cols-1 sm:grid-cols-2 gap-4 transition-opacity ${
                autoLight ? "opacity-100" : "opacity-40 pointer-events-none"
              }`}
            >
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-300 mb-1.5">
                  <Clock size={14} className="text-yellow-400" /> Lights ON Time
                </label>
                <input
                  type="time"
                  value={ledStart}
                  onChange={(e) => setLedStart(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-sm text-white focus:border-yellow-500 outline-none"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-300 mb-1.5">
                  <Clock size={14} className="text-gray-400" /> Lights OFF Time
                </label>
                <input
                  type="time"
                  value={ledEnd}
                  onChange={(e) => setLedEnd(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-sm text-white focus:border-yellow-500 outline-none"
                />
              </div>
            </div>
          </div>

          <button
            onClick={saveAutomation}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 transition"
          >
            <Save size={18} />
            {saving ? "Saving Rules..." : "Update Cloud Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}