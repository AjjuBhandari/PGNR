import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { api } from "../../lib/api";

interface AnalyticsData {
  totalBots: number;
  onlineBots: number;
  blocksMined: number;
  distanceWalked: number;
  commands: { total: number; executed: number; failed: number };
  vitalsHistory: { t: string; health: number; food: number }[];
  commandsPerMinute: { t: string; cmds: number }[];
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = () => api.analytics()
      .then((result: AnalyticsData) => {
        if (active) {
          setData(result);
          setError("");
        }
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Analytics unavailable");
      });
    load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (!data) return <div className="p-4 text-xs text-slate-400">{error || "Loading live analytics…"}</div>;

  return (
    <div className="p-4 space-y-6 overflow-y-auto h-full">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Accounts / online" value={`${data.totalBots} / ${data.onlineBots}`} />
        <Stat label="Blocks collected this session" value={data.blocksMined.toLocaleString()} />
        <Stat label="Distance this session" value={`${data.distanceWalked.toFixed(1)} blocks`} />
      </div>

      <div className="text-xs text-slate-500">Command history: {data.commands.total} total, {data.commands.executed} executed, {data.commands.failed} failed.</div>

      <div>
        <div className="text-xs font-semibold text-slate-400 mb-2">Live health / hunger samples</div>
        {data.vitalsHistory.length ? <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data.vitalsHistory}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2c3038" />
            <XAxis dataKey="t" stroke="#64748b" fontSize={10} />
            <YAxis domain={[0, 20]} stroke="#64748b" fontSize={10} />
            <Tooltip contentStyle={{ background: "#1e2126", border: "1px solid #2c3038", fontSize: 12 }} />
            <Line type="monotone" dataKey="health" stroke="#FF5555" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="food" stroke="#FFAA00" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer> : <div className="py-8 text-center text-xs text-slate-500">Waiting for connected bots; samples refresh every five seconds.</div>}
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-400 mb-2">Commands per minute</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data.commandsPerMinute}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2c3038" />
            <XAxis dataKey="t" stroke="#64748b" fontSize={10} />
            <YAxis stroke="#64748b" fontSize={10} />
            <Tooltip contentStyle={{ background: "#1e2126", border: "1px solid #2c3038", fontSize: 12 }} />
            <Bar dataKey="cmds" fill="#5EBB52" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-mc-panel border border-mc-border rounded-lg p-3">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
