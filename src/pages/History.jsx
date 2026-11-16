import { useEffect, useState } from "react";
import { ref, query, orderByKey, get } from "firebase/database";
import { db } from "../firebase";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceArea,
} from "recharts";
import {
  Database,
  Search,
  RotateCcw,
  Droplet,
  Thermometer,
  Power,
} from "lucide-react";

const DRY_RAW = 1023;
const WET_RAW = 200;
const GAP_THRESHOLD_MS = 20 * 60 * 1000; // Flag gap if > 20 mins between logs
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const rawToMoisturePercent = (raw) => {
  const clamped = Math.min(DRY_RAW, Math.max(WET_RAW, Number(raw) || DRY_RAW));
  return Math.round(((DRY_RAW - clamped) / (DRY_RAW - WET_RAW)) * 100);
};

const formatDateTime = (ms) =>
  new Date(ms).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const formatDuration = (ms) => {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
};

const TOOLTIP_STYLE = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "10px",
  fontSize: "13px",
};

export default function History() {
  const [historyData, setHistoryData] = useState([]);
  const [offlineGaps, setOfflineGaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isCustomRange, setIsCustomRange] = useState(false);

  const fetchHistory = async (customStart = startDate, customEnd = endDate) => {
    setLoading(true);
    try {
      const historyRef = query(ref(db, "history"), orderByKey());
      const snapshot = await get(historyRef);

      if (!snapshot.exists()) {
        setHistoryData([]);
        setOfflineGaps([]);
        setLoading(false);
        return;
      }

      const rawRecords = [];
      snapshot.forEach((childSnap) => {
        rawRecords.push({ id: childSnap.key, ...childSnap.val() });
      });

      const hasCustomRange = Boolean(customStart && customEnd);
      const nowMs = Date.now();
      const startMs = hasCustomRange
        ? new Date(customStart).getTime()
        : nowMs - TWENTY_FOUR_HOURS_MS;
      const endMs = hasCustomRange
        ? new Date(customEnd).getTime() + 59999
        : nowMs;

      setIsCustomRange(hasCustomRange);

      const sorted = rawRecords
        .map((item) => ({
          ...item,
          tsMs: new Date(item.timestamp).getTime(),
        }))
        .filter((item) => {
          if (Number.isNaN(item.tsMs)) return false;
          return item.tsMs >= startMs && item.tsMs <= endMs;
        })
        .sort((a, b) => a.tsMs - b.tsMs);

      const chartPoints = [];
      const detectedGaps = [];

      sorted.forEach((item, idx) => {
        if (idx > 0) {
          const prevMs = sorted[idx - 1].tsMs;
          const diff = item.tsMs - prevMs;
          if (diff > GAP_THRESHOLD_MS) {
            detectedGaps.push({
              start: prevMs,
              end: item.tsMs,
              duration: formatDuration(diff),
            });
            chartPoints.push({
              tsMs: prevMs + 1000,
              moisture: null,
              temp: null,
              humidity: null,
              pump: null,
              light: null,
            });
          }
        }

        chartPoints.push({
          tsMs: item.tsMs,
          moisture: rawToMoisturePercent(item.soil),
          temp: item.temp ?? 0,
          humidity: item.humidity ?? 0,
          pump: item.pump ?? 0,
          light: item.light ?? 0,
        });
      });

      setHistoryData(chartPoints);
      setOfflineGaps(detectedGaps);
    } catch (err) {
      console.error("Failed to fetch history from Firebase:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory("", "");
  }, []);

  const handleReset24h = () => {
    setStartDate("");
    setEndDate("");
    fetchHistory("", "");
  };

  const renderGapOverlays = (yAxisId) =>
    offlineGaps.map((gap, index) => (
      <ReferenceArea
        key={index}
        yAxisId={yAxisId}
        x1={gap.start}
        x2={gap.end}
        fill="#EF4444"
        fillOpacity={0.16}
        stroke="#EF4444"
        strokeOpacity={0.45}
        strokeDasharray="4 4"
        label={{
          value: `OFFLINE (${gap.duration})`,
          position: "insideTop",
          fill: "#F87171",
          fontSize: 11,
          fontWeight: 600,
        }}
      />
    ));

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
            <Database className="text-blue-400" /> Data History
          </h2>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            {isCustomRange ? "Custom range" : "Last 24 hours"} •{" "}
            {offlineGaps.length > 0
              ? `${offlineGaps.length} offline outage${
                  offlineGaps.length > 1 ? "s" : ""
                } highlighted in red`
              : "Continuous telemetry log (no outages detected)"}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 bg-gray-900 p-2.5 rounded-xl border border-gray-800">
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-gray-800 text-xs sm:text-sm text-gray-200 px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500"
          />
          <span className="text-gray-500 text-xs text-center">to</span>
          <input
            type="datetime-local"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-gray-800 text-xs sm:text-sm text-gray-200 px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => fetchHistory(startDate, endDate)}
              className="flex-1 sm:flex-initial bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition"
            >
              <Search size={15} /> Filter
            </button>
            {isCustomRange && (
              <button
                onClick={handleReset24h}
                title="Reset to Last 24 Hours"
                className="bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs sm:text-sm px-3 py-2 rounded-lg border border-gray-700 flex items-center justify-center gap-1.5 transition"
              >
                <RotateCcw size={14} /> 24h
              </button>
            )}
          </div>
        </div>
      </header>

      {loading ? (
        <div className="bg-gray-900 h-80 sm:h-96 rounded-2xl border border-gray-800 flex items-center justify-center text-gray-400">
          Fetching records...
        </div>
      ) : historyData.length === 0 ? (
        <div className="bg-gray-900 h-80 sm:h-96 rounded-2xl border border-gray-800 flex items-center justify-center text-gray-400 text-sm px-4 text-center">
          No data found for{" "}
          {isCustomRange ? "this time range" : "the last 24 hours"}.
        </div>
      ) : (
        <div className="space-y-6">
          {/* CHART 1: Soil Moisture % & Irrigation Response */}
          <div className="bg-gray-900 p-4 sm:p-6 rounded-2xl border border-gray-800 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2 text-gray-200">
                <Droplet size={18} className="text-blue-400" /> Soil Moisture &
                Irrigation Response
              </h3>
              <span className="text-xs text-gray-400">
                Soil Moisture (0% Dry – 100% Wet) vs. Water Pump
              </span>
            </div>
            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyData}>
                  <defs>
                    <linearGradient id="soilGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="#3B82F6"
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="95%"
                        stopColor="#3B82F6"
                        stopOpacity={0.0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                  <XAxis
                    dataKey="tsMs"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    stroke="#9CA3AF"
                    tick={{ fontSize: 11 }}
                    tickFormatter={formatDateTime}
                    minTickGap={45}
                  />
                  <YAxis
                    yAxisId="soil"
                    stroke="#60A5FA"
                    domain={[0, 100]}
                    unit="%"
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="pump"
                    orientation="right"
                    domain={[0, 1]}
                    ticks={[0, 1]}
                    stroke="#34D399"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => (v === 1 ? "ON" : "OFF")}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={formatDateTime}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  {renderGapOverlays("soil")}
                  <Area
                    yAxisId="soil"
                    type="monotone"
                    dataKey="moisture"
                    name="Soil Moisture (%)"
                    stroke="#60A5FA"
                    strokeWidth={2.5}
                    fill="url(#soilGrad)"
                    connectNulls={false}
                  />
                  <Area
                    yAxisId="pump"
                    type="stepAfter"
                    dataKey="pump"
                    name="Water Pump"
                    stroke="#34D399"
                    fill="#34D399"
                    fillOpacity={0.22}
                    strokeWidth={3}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* BOTTOM ROW: Two Side-by-Side Specialized Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CHART 2: Air Temperature & Humidity */}
            <div className="bg-gray-900 p-4 sm:p-6 rounded-2xl border border-gray-800 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2 text-gray-200">
                  <Thermometer size={18} className="text-rose-400" /> Air
                  Temperature & Humidity
                </h3>
                <span className="text-xs text-gray-400">Dual Scale</span>
              </div>
              <div className="h-60 sm:h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                    <XAxis
                      dataKey="tsMs"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      stroke="#9CA3AF"
                      tick={{ fontSize: 11 }}
                      tickFormatter={formatDateTime}
                      minTickGap={55}
                    />
                    <YAxis
                      yAxisId="temp"
                      stroke="#FB7185"
                      domain={["dataMin - 2", "dataMax + 2"]}
                      tick={{ fontSize: 11 }}
                      unit="°"
                    />
                    <YAxis
                      yAxisId="hum"
                      orientation="right"
                      stroke="#22D3EE"
                      domain={["dataMin - 5", "dataMax + 5"]}
                      tick={{ fontSize: 11 }}
                      unit="%"
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelFormatter={formatDateTime}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    {renderGapOverlays("temp")}
                    <Line
                      yAxisId="temp"
                      type="monotone"
                      dataKey="temp"
                      name="Air Temp (°C)"
                      stroke="#FB7185"
                      strokeWidth={2.5}
                      dot={false}
                      connectNulls={false}
                    />
                    <Line
                      yAxisId="hum"
                      type="monotone"
                      dataKey="humidity"
                      name="Humidity (%)"
                      stroke="#22D3EE"
                      strokeWidth={2.5}
                      dot={false}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* CHART 3: Actuator States */}
            <div className="bg-gray-900 p-4 sm:p-6 rounded-2xl border border-gray-800 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2 text-gray-200">
                  <Power size={18} className="text-yellow-400" /> Pump & Light
                  Schedule
                </h3>
                <span className="text-xs text-gray-400">ON / OFF Cycles</span>
              </div>
              <div className="h-60 sm:h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                    <XAxis
                      dataKey="tsMs"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      stroke="#9CA3AF"
                      tick={{ fontSize: 11 }}
                      tickFormatter={formatDateTime}
                      minTickGap={55}
                    />
                    <YAxis
                      yAxisId="state"
                      domain={[0, 1]}
                      ticks={[0, 1]}
                      stroke="#9CA3AF"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => (v === 1 ? "ON" : "OFF")}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelFormatter={formatDateTime}
                      formatter={(val) => (val === 1 ? "ON" : "OFF")}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    {renderGapOverlays("state")}
                    <Area
                      yAxisId="state"
                      type="stepAfter"
                      dataKey="light"
                      name="Grow Lights"
                      stroke="#FBBF24"
                      fill="#FBBF24"
                      fillOpacity={0.18}
                      strokeWidth={2.5}
                      connectNulls={false}
                    />
                    <Area
                      yAxisId="state"
                      type="stepAfter"
                      dataKey="pump"
                      name="Water Pump"
                      stroke="#34D399"
                      fill="#34D399"
                      fillOpacity={0.25}
                      strokeWidth={3}
                      connectNulls={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
