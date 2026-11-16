import { useEffect, useState, useRef } from "react";
import {
  ref,
  onValue,
  query,
  orderByKey,
  limitToLast,
  get,
} from "firebase/database";
import { db } from "../firebase";
import {
  Droplet,
  Power,
  Sun,
  Camera,
  CameraOff,
  SwitchCamera,
  Thermometer,
  Wind,
  Sliders,
  AlertTriangle,
} from "lucide-react";
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
} from "recharts";

const OFFLINE_THRESHOLD_MS = 12000;
const DRY_RAW = 1023;
const WET_RAW = 200;

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
    second: "2-digit",
    hour12: false,
  });

const TOOLTIP_STYLE = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "10px",
  fontSize: "13px",
};

export default function Dashboard() {
  const [data, setData] = useState({
    soilPercent: 0,
    temp: 0,
    humidity: 0,
    pump: 0,
    light: 0,
    timestamp: "",
  });
  const [targetPercent, setTargetPercent] = useState(46);
  const [cloudConnected, setCloudConnected] = useState(false);
  const [espOnline, setEspOnline] = useState(false);
  const [lastSeen, setLastSeen] = useState(null);
  const [chartData, setChartData] = useState([]);

  // Camera state: ON/OFF + Camera Switch (device list & facingMode fallback)
  const [cameraActive, setCameraActive] = useState(true);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceIndex, setSelectedDeviceIndex] = useState(0);
  const [facingMode, setFacingMode] = useState("environment"); // Default rear cam on mobile
  const [activeCamLabel, setActiveCamLabel] = useState("CAM-01");

  const [waterRule, setWaterRule] = useState({
    enabled: true,
    startPct: 47,
    stopPct: 80,
  });

  const lastEspTimestampMsRef = useRef(0);
  const videoRef = useRef(null);

  useEffect(() => {
    const seedRecentHistory = async () => {
      try {
        const recentQuery = query(
          ref(db, "history"),
          orderByKey(),
          limitToLast(15),
        );
        const snap = await get(recentQuery);
        if (!snap.exists()) return;

        const initialPoints = [];
        snap.forEach((child) => {
          const item = child.val();
          const ms = new Date(item.timestamp).getTime();
          if (!Number.isNaN(ms) && ms > 0) {
            initialPoints.push({
              tsMs: ms,
              time: formatDateTime(ms),
              moisture: rawToMoisturePercent(item.soil),
              temp: item.temp ?? 0,
              humidity: item.humidity ?? 0,
              pump: item.pump ?? 0,
              light: item.light ?? 0,
            });
          }
        });

        initialPoints.sort((a, b) => a.tsMs - b.tsMs);
        if (initialPoints.length > 0) {
          lastEspTimestampMsRef.current =
            initialPoints[initialPoints.length - 1].tsMs;
          setChartData(initialPoints.slice(-15));
        }
      } catch (err) {
        console.error("Failed to seed initial chart points:", err);
      }
    };

    seedRecentHistory();

    const connectedRef = ref(db, ".info/connected");
    const unsubscribeConn = onValue(connectedRef, (snap) => {
      setCloudConnected(Boolean(snap.val()));
    });

    const settingsRef = ref(db, "settings");
    const unsubscribeSettings = onValue(settingsRef, (snap) => {
      if (!snap.exists()) return;
      const s = snap.val();
      setWaterRule({
        enabled: s.autoWater !== undefined ? s.autoWater === 1 : true,
        startPct:
          s.threshold !== undefined ? rawToMoisturePercent(s.threshold) : 47,
        stopPct:
          s.stopThreshold !== undefined
            ? rawToMoisturePercent(s.stopThreshold)
            : 80,
      });
    });

    const liveRef = ref(db, "live");
    const unsubscribeLive = onValue(liveRef, (snapshot) => {
      const incomingData = snapshot.val();
      if (!incomingData) return;

      const parsedMs = incomingData.timestamp
        ? new Date(incomingData.timestamp).getTime()
        : 0;

      const isValidTime = !Number.isNaN(parsedMs) && parsedMs > 0;
      const fullDateTime = isValidTime ? formatDateTime(parsedMs) : null;
      const moisturePct = rawToMoisturePercent(incomingData.soil);

      setData({
        soilPercent: moisturePct,
        temp: incomingData.temp ?? 0,
        humidity: incomingData.humidity ?? 0,
        pump: incomingData.pump ?? 0,
        light: incomingData.light ?? 0,
        timestamp: incomingData.timestamp ?? "",
      });

      if (isValidTime) {
        setLastSeen(fullDateTime);
        const ageMs = Date.now() - parsedMs;
        setEspOnline(ageMs <= OFFLINE_THRESHOLD_MS);

        if (parsedMs > lastEspTimestampMsRef.current) {
          lastEspTimestampMsRef.current = parsedMs;
          setChartData((prev) => {
            const newArray = [
              ...prev,
              {
                tsMs: parsedMs,
                time: fullDateTime,
                moisture: moisturePct,
                temp: incomingData.temp ?? 0,
                humidity: incomingData.humidity ?? 0,
                pump: incomingData.pump ?? 0,
                light: incomingData.light ?? 0,
              },
            ];
            return newArray.slice(-15);
          });
        }
      } else {
        setEspOnline(false);
      }
    });

    const watchdog = setInterval(() => {
      if (lastEspTimestampMsRef.current > 0) {
        const ageMs = Date.now() - lastEspTimestampMsRef.current;
        setEspOnline(ageMs <= OFFLINE_THRESHOLD_MS);
      }
    }, 2000);

    return () => {
      unsubscribeConn();
      unsubscribeSettings();
      unsubscribeLive();
      clearInterval(watchdog);
    };
  }, []);

  // Webcam lifecycle with multi-camera / front-back switching
  useEffect(() => {
    let activeStream = null;
    let cancelled = false;

    const startCamera = async () => {
      if (
        !cameraActive ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        if (videoRef.current) videoRef.current.srcObject = null;
        return;
      }

      try {
        const targetDevice = videoDevices[selectedDeviceIndex];
        const videoConstraints = targetDevice?.deviceId
          ? { deviceId: { exact: targetDevice.deviceId } }
          : { facingMode };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        activeStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Refresh available cameras once permission is granted
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const cams = allDevices.filter((d) => d.kind === "videoinput");
        if (!cancelled) {
          setVideoDevices(cams);
          const trackLabel = stream.getVideoTracks()[0]?.label;
          setActiveCamLabel(
            trackLabel
              ? trackLabel.slice(0, 18)
              : `CAM-0${selectedDeviceIndex + 1}`,
          );
        }
      } catch {
        // Fallback to any default camera if exact device/facingMode fails
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: true,
          });
          if (cancelled) {
            fallbackStream.getTracks().forEach((track) => track.stop());
            return;
          }
          activeStream = fallbackStream;
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
          }
        } catch {
          if (!cancelled) setCameraActive(false);
        }
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraActive, selectedDeviceIndex, facingMode]);

  const handleSwitchCamera = () => {
    if (videoDevices.length > 1) {
      setSelectedDeviceIndex((prev) => (prev + 1) % videoDevices.length);
    } else {
      setFacingMode((prev) =>
        prev === "environment" ? "user" : "environment",
      );
    }
  };

  const isLive = cloudConnected && espOnline;

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-5 flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-2xl sm:text-3xl font-bold">System Status</h2>
        <div className="flex items-center gap-2.5 bg-gray-900 px-3.5 py-2 rounded-full border border-gray-800">
          <div
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              isLive ? "bg-green-500" : "bg-red-500 animate-pulse"
            }`}
          ></div>
          <span className="text-xs sm:text-sm text-gray-300 font-medium">
            {!cloudConnected
              ? "Cloud Disconnected"
              : espOnline
                ? `ESP32 Online (${lastSeen})`
                : `ESP32 Offline${lastSeen ? ` (Last: ${lastSeen})` : ""}`}
          </span>
        </div>
      </header>

      {/* Offline Stale-Data Notice */}
      {cloudConnected && !espOnline && lastSeen && (
        <div className="mb-5 flex items-start sm:items-center gap-3 bg-amber-950/40 border border-amber-800/60 text-amber-200 px-4 py-3 rounded-xl text-xs sm:text-sm">
          <AlertTriangle
            size={18}
            className="text-amber-400 shrink-0 mt-0.5 sm:mt-0"
          />
          <span>
            Hardware is currently offline. Displaying last recorded sensor
            values from <strong>{lastSeen}</strong> and recent history trends.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-6">
          {/* 3x2 Balanced Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-gray-900 p-4 sm:p-5 rounded-2xl border border-gray-800 shadow-xl flex flex-col items-center text-center">
              <Droplet className="w-8 h-8 sm:w-9 sm:h-9 text-blue-400 mb-2" />
              <h3 className="text-gray-400 text-xs sm:text-sm font-medium">
                Soil Moisture
              </h3>
              <p className="text-2xl sm:text-3xl font-bold mt-1">
                {data.soilPercent}%
              </p>
              <span className="text-xs text-gray-500 mt-1">
                {data.soilPercent < targetPercent
                  ? "Needs Water"
                  : data.soilPercent > 75
                    ? "Well Watered"
                    : "Optimal"}
              </span>
            </div>

            <div className="bg-gray-900 p-4 sm:p-5 rounded-2xl border border-gray-800 shadow-xl flex flex-col items-center text-center">
              <Thermometer className="w-8 h-8 sm:w-9 sm:h-9 text-rose-400 mb-2" />
              <h3 className="text-gray-400 text-xs sm:text-sm font-medium">
                Air Temp
              </h3>
              <p className="text-2xl sm:text-3xl font-bold mt-1">
                {data.temp}°C
              </p>
              <span className="text-xs text-gray-500 mt-1">Ambient</span>
            </div>

            <div className="bg-gray-900 p-4 sm:p-5 rounded-2xl border border-gray-800 shadow-xl flex flex-col items-center text-center">
              <Wind className="w-8 h-8 sm:w-9 sm:h-9 text-cyan-400 mb-2" />
              <h3 className="text-gray-400 text-xs sm:text-sm font-medium">
                Humidity
              </h3>
              <p className="text-2xl sm:text-3xl font-bold mt-1">
                {data.humidity}%
              </p>
              <span className="text-xs text-gray-500 mt-1">Relative</span>
            </div>

            <div className="bg-gray-900 p-4 sm:p-5 rounded-2xl border border-gray-800 shadow-xl flex flex-col items-center text-center">
              <Power
                className={`w-8 h-8 sm:w-9 sm:h-9 mb-2 ${
                  data.pump === 1 ? "text-green-400" : "text-gray-600"
                }`}
              />
              <h3 className="text-gray-400 text-xs sm:text-sm font-medium">
                Water Pump
              </h3>
              <p className="text-lg sm:text-xl font-bold mt-2">
                {data.pump === 1 ? "WATERING" : "OFF"}
              </p>
            </div>

            <div className="bg-gray-900 p-4 sm:p-5 rounded-2xl border border-gray-800 shadow-xl flex flex-col items-center text-center">
              <Sun
                className={`w-8 h-8 sm:w-9 sm:h-9 mb-2 ${
                  data.light === 1 ? "text-yellow-400" : "text-gray-600"
                }`}
              />
              <h3 className="text-gray-400 text-xs sm:text-sm font-medium">
                Grow Lights
              </h3>
              <p className="text-lg sm:text-xl font-bold mt-2">
                {data.light === 1 ? "ON" : "OFF"}
              </p>
            </div>

            <div className="bg-gray-900 p-4 sm:p-5 rounded-2xl border border-gray-800 shadow-xl flex flex-col items-center text-center">
              <Sliders
                className={`w-8 h-8 sm:w-9 sm:h-9 mb-2 ${
                  waterRule.enabled ? "text-emerald-400" : "text-gray-600"
                }`}
              />
              <h3 className="text-gray-400 text-xs sm:text-sm font-medium">
                Auto-Water Rule
              </h3>
              <p className="text-lg sm:text-xl font-bold mt-2">
                {waterRule.enabled
                  ? `${waterRule.startPct}% → ${waterRule.stopPct}%`
                  : "DISABLED"}
              </p>
              <span className="text-xs text-gray-500 mt-1">
                {waterRule.enabled ? "Start → Stop Target" : "Manual Only"}
              </span>
            </div>
          </div>

          {/* LIVE CHART 1: Soil Moisture % & Actuators */}
          <div className="bg-gray-900 p-4 sm:p-6 rounded-2xl border border-gray-800 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm sm:text-base font-semibold flex items-center gap-2 text-gray-200">
                <Droplet size={18} className="text-blue-400" /> Soil Moisture &
                Irrigation
              </h3>
              <span className="text-xs text-gray-400">
                Last {chartData.length} readings
              </span>
            </div>
            <div className="h-52 sm:h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient
                      id="liveSoilGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
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
                    dataKey="time"
                    stroke="#9CA3AF"
                    tick={{ fontSize: 11 }}
                    minTickGap={25}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="#60A5FA"
                    domain={[0, 100]}
                    unit="%"
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 1]}
                    ticks={[0, 1]}
                    stroke="#9CA3AF"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => (v === 1 ? "ON" : "OFF")}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="moisture"
                    name="Soil Moisture (%)"
                    stroke="#60A5FA"
                    strokeWidth={2.5}
                    fill="url(#liveSoilGrad)"
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="right"
                    type="stepAfter"
                    dataKey="pump"
                    name="Water Pump"
                    stroke="#34D399"
                    strokeWidth={3}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="right"
                    type="stepAfter"
                    dataKey="light"
                    name="Grow Lights"
                    stroke="#FBBF24"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* LIVE CHART 2: Air Climate */}
          <div className="bg-gray-900 p-4 sm:p-6 rounded-2xl border border-gray-800 shadow-xl">
            <h3 className="text-sm sm:text-base font-semibold mb-4 flex items-center gap-2 text-gray-200">
              <Thermometer size={18} className="text-rose-400" /> Air
              Temperature & Humidity
            </h3>
            <div className="h-52 sm:h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                  <XAxis
                    dataKey="time"
                    stroke="#9CA3AF"
                    tick={{ fontSize: 11 }}
                    minTickGap={25}
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
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Line
                    yAxisId="temp"
                    type="monotone"
                    dataKey="temp"
                    name="Temp (°C)"
                    stroke="#FB7185"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="hum"
                    type="monotone"
                    dataKey="humidity"
                    name="Humidity (%)"
                    stroke="#22D3EE"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN - Field Vision with Camera Switch */}
        <div className="lg:col-span-1 lg:sticky lg:top-0">
          <div className="bg-gray-900 p-4 rounded-2xl border border-gray-800 shadow-xl">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">
                <Camera size={18} className="text-green-400" /> Field Vision
              </h3>
              <div className="flex items-center gap-2">
                {cameraActive && (
                  <button
                    onClick={handleSwitchCamera}
                    title="Switch Camera"
                    className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-green-400 px-2.5 py-1.5 rounded-lg border border-gray-700 transition"
                  >
                    <SwitchCamera size={15} />
                    <span>Switch</span>
                  </button>
                )}
                <button
                  onClick={() => setCameraActive((prev) => !prev)}
                  className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-1.5 rounded-lg border border-gray-700 transition"
                >
                  {cameraActive ? "Turn Off" : "Enable Cam"}
                </button>
              </div>
            </div>

            <div className="w-full aspect-video bg-black rounded-lg overflow-hidden border border-gray-700 relative flex items-center justify-center">
              {cameraActive ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2 flex gap-2">
                    <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded animate-pulse">
                      REC
                    </span>
                    <span className="bg-black/60 text-white text-[10px] px-2 py-1 rounded border border-gray-600">
                      {activeCamLabel}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center text-gray-500 text-xs gap-2">
                  <CameraOff size={28} />
                  <span>Camera Paused</span>
                </div>
              )}
            </div>

            <div className="mt-4 text-sm text-gray-400 space-y-2">
              <p>
                Resolution: <span className="text-gray-200">1080p</span>
              </p>
              <p>
                Framerate: <span className="text-gray-200">30fps</span>
              </p>
              <p>
                Active Lens:{" "}
                <span className="text-gray-200">
                  {videoDevices.length > 0
                    ? `${selectedDeviceIndex + 1} of ${videoDevices.length}`
                    : facingMode === "environment"
                      ? "Rear"
                      : "Front"}
                </span>
              </p>
              <p>
                Connection:{" "}
                <span
                  className={cameraActive ? "text-green-400" : "text-gray-500"}
                >
                  {cameraActive ? "Direct WebRTC" : "Standby"}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
