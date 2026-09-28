import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useStore } from "../../store/useStore";

export default function Console() {
  const { chat, notifications, bots } = useStore();
  const [query, setQuery] = useState("");

  const lines = useMemo(() => {
    const chatLines = chat.map((m) => `[${new Date(m.ts).toISOString()}] [${bots[m.botId]?.username ?? m.botId}] ${m.type.toUpperCase()} ${m.from ? m.from + ": " : ""}${m.text}`);
    const notifLines = notifications.map((n) => `[${new Date(n.ts).toISOString()}] [${n.level.toUpperCase()}] ${n.text}`);
    return [...chatLines, ...notifLines]
      .sort()
      .filter((l) => !query || l.toLowerCase().includes(query.toLowerCase()));
  }, [chat, notifications, bots, query]);

  const download = () => {
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bot-console-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-2 border-b border-mc-border">
        <input
          placeholder="Search log…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="bg-black/30 border border-mc-border rounded px-2 py-1 text-xs flex-1 outline-none focus:border-mc-green"
        />
        <button onClick={download} className="btn">
          <Download size={12} /> Download .log
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] text-slate-300 space-y-0.5 bg-black/20">
        {lines.map((l, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
