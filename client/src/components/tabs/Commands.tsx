import { useEffect, useState } from "react";
import { RotateCcw, Star } from "lucide-react";
import { useStore } from "../../store/useStore";
import { api } from "../../lib/api";
import type { CommandRecord } from "../../types/bot";

export default function Commands() {
  const { selectedBotId } = useStore();
  const [history, setHistory] = useState<CommandRecord[]>([]);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedBotId) return;
    api.commandHistory(selectedBotId).then(setHistory).catch(() => setHistory([]));
  }, [selectedBotId]);

  const send = async () => {
    if (!selectedBotId || !raw.trim()) return;
    try {
      const result = await api.sendCommand(selectedBotId, "chat", { message: raw }, raw);
      if (!result?.ok) throw new Error(result?.error || "Command failed");
      setRaw("");
      setError("");
      api.commandHistory(selectedBotId).then(setHistory).catch(() => {});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Command failed");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-mc-border flex gap-2">
        <input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="/command or chat message…"
          className="flex-1 bg-black/30 border border-mc-border rounded px-2 py-1.5 text-xs font-mono outline-none focus:border-mc-green"
        />
        <button className="btn btn-primary" onClick={send}>
          Send
        </button>
      </div>
      {error && <div role="alert" className="px-3 py-2 text-xs text-red-300">{error}</div>}

      <div className="flex-1 overflow-y-auto divide-y divide-mc-border">
        {history.map((c) => (
          <div key={c.id} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5">
            <StatusDot status={c.status} />
            <span className="font-mono flex-1 truncate">{c.command}</span>
            <span className="text-slate-500">{new Date(c.created_at).toLocaleTimeString()}</span>
            <button
              className="p-1 hover:text-mc-gold text-slate-500"
              title="Favorite"
              onClick={() => {}}
            >
              <Star size={12} />
            </button>
            <button
              className="p-1 hover:text-mc-green text-slate-500"
              title="Replay"
              onClick={() => selectedBotId && api.sendCommand(selectedBotId, "chat", { message: c.command }, c.command)}
            >
              <RotateCcw size={12} />
            </button>
          </div>
        ))}
        {history.length === 0 && <div className="p-6 text-center text-xs text-slate-500">No commands sent yet.</div>}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === "executed" ? "bg-mc-green" : status === "failed" ? "bg-mc-red" : "bg-mc-gold";
  return <span className={`w-1.5 h-1.5 rounded-full ${color}`} />;
}

