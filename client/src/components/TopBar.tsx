import { useState } from "react";
import { Play, Square, RotateCcw, Wifi, WifiOff, Moon, Sun } from "lucide-react";
import { useStore } from "../store/useStore";
import { api } from "../lib/api";

export default function TopBar() {
  const [actionStatus, setActionStatus] = useState("");
  const { bots, order, wsConnected, totalCommandsSent, theme, toggleTheme } = useStore();
  const list = order.map((id) => bots[id]);
  const online = list.filter((b) => ["SPAWNED", "IN_LOBBY", "AT_AFK"].includes(b.state)).length;
  const avgHealth = list.length ? Math.round(list.reduce((a, b) => a + b.health, 0) / list.length) : 0;
  const avgFood = list.length ? Math.round(list.reduce((a, b) => a + b.food, 0) / list.length) : 0;

  const runAll = async (action: "start" | "stop" | "restart") => {
    try {
      if (action === "start") {
        const result = await api.startAll();
        setActionStatus(result.scheduled ? `Scheduled ${result.scheduled} account(s), ${Math.round(result.spacingMs / 1000)}s apart` : "No saved accounts");
        return;
      }
      await Promise.all(list.map((bot) => action === "stop" ? api.stopBot(bot.id) : api.restartBot(bot.id)));
      setActionStatus(`${action === "stop" ? "Stopped" : "Restarted"} ${list.length} account(s)`);
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Bot operation failed");
    }
  };

  return (
    <header className="min-h-14 shrink-0 border-b border-mc-border bg-mc-panel flex flex-wrap sm:flex-nowrap items-center px-2 sm:px-4 py-1 gap-x-3 gap-y-1 sm:gap-6">
      <div className="font-semibold text-sm whitespace-nowrap">
        Bot Manager <span className="text-mc-green">●</span>
      </div>

      <div className="hidden lg:flex items-center gap-4 text-xs text-slate-300">
        <span>
          Players online: <b className="text-mc-green">{online}</b>/{list.length}
        </span>
        <span>Avg HP: <b>{avgHealth}</b>/20</span>
        <span>Avg Food: <b>{avgFood}</b>/20</span>
        <span>Commands sent: <b>{totalCommandsSent}</b></span>
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <button onClick={() => runAll("start")} className="btn" title="Start all (⌘S)">
          <Play size={14} /> <span className="hidden sm:inline">Start All</span>
        </button>
        <button onClick={() => runAll("stop")} className="btn" title="Stop all (⌘X)">
          <Square size={14} /> <span className="hidden sm:inline">Stop All</span>
        </button>
        <button onClick={() => runAll("restart")} className="btn" title="Restart all bots" aria-label="Restart all bots">
          <RotateCcw size={14} /> <span className="hidden sm:inline">Restart All</span>
        </button>

        <div className="hidden sm:block w-px h-6 bg-mc-border mx-1 sm:mx-2" />

        <div className="flex items-center gap-1 text-xs" title="WebSocket status">
          {wsConnected ? <Wifi size={14} className="text-mc-green" /> : <WifiOff size={14} className="text-mc-red" />}
          <span className="hidden sm:inline">{wsConnected ? "Live" : "Offline"}</span>
        </div>

        <button onClick={toggleTheme} className="btn" title="Toggle theme">
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
      {actionStatus && <span role="status" className="absolute top-14 right-4 z-20 max-w-80 bg-mc-panel border border-mc-border px-2 py-1 text-xs text-slate-300">{actionStatus}</span>}
    </header>
  );
}
