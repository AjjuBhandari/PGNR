import clsx from "clsx";
import { Play, Square, RotateCcw, Focus, Copy, Pencil } from "lucide-react";
import type { Bot } from "../types/bot";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";

const STATE_COLOR: Record<string, string> = {
  SPAWNED: "bg-mc-green",
  LOGGED_IN: "bg-mc-gold",
  IN_LOBBY: "bg-mc-gold",
  AT_AFK: "bg-mc-purple",
  CONNECTING: "bg-mc-gold animate-pulse",
  OFFLINE: "bg-mc-red",
};

export default function BotCard({ bot, selected, onSelect, onEdit }: { bot: Bot; selected: boolean; onSelect: () => void; onEdit: () => void }) {
  const pushNotification = useStore((state) => state.pushNotification);
  const copyPos = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(`${bot.position.x}, ${bot.position.y}, ${bot.position.z}`);
  };

  const runAccountAction = async (action: "start" | "stop" | "restart") => {
    try {
      if (action === "start") await api.startBot(bot.id);
      else if (action === "stop") await api.stopBot(bot.id);
      else await api.restartBot(bot.id);
    } catch (error) {
      pushNotification({
        botId: bot.id,
        level: "danger",
        text: error instanceof Error ? error.message : `Could not ${action} ${bot.username}.`,
        ts: Date.now(),
      });
    }
  };

  return (
    <div
      onClick={onSelect}
      className={clsx(
        "rounded-lg border p-3 cursor-pointer transition-colors",
        selected ? "border-mc-green bg-mc-green/5" : "border-mc-border bg-mc-panel hover:bg-[#23262c]"
      )}
    >
      <div className="flex items-center gap-2">
        <img
          src={`https://mc-heads.net/avatar/${bot.username}/24`}
          onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
          className="w-6 h-6 rounded-sm bg-black/30"
          alt=""
        />
        <span className="text-sm font-medium truncate flex-1">{bot.username}</span>
        <span className={clsx("w-2 h-2 rounded-full", STATE_COLOR[bot.state])} />
      </div>

      <div className="mt-1.5 text-[10px] uppercase tracking-wide text-slate-400">{bot.state.replace("_", " ")}</div>
      <div className="text-[11px] text-slate-300 mt-0.5">Task: {bot.task}</div>

      <div className="mt-2 space-y-1">
        <Bar label="HP" value={bot.health} max={bot.maxHealth} color="bg-mc-red" />
        <Bar label="Food" value={bot.food} max={20} color="bg-mc-gold" />
      </div>

      <button
        onClick={copyPos}
        className="mt-2 flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200"
      >
        <Copy size={10} />
        {bot.position.x.toFixed(0)}, {bot.position.y.toFixed(0)}, {bot.position.z.toFixed(0)}
      </button>

      <div className="mt-2 flex gap-1">
        <IconBtn icon={<Play size={12} />} onClick={() => runAccountAction("start")} title="Start" />
        <IconBtn icon={<Square size={12} />} onClick={() => runAccountAction("stop")} title="Stop" />
        <IconBtn icon={<RotateCcw size={12} />} onClick={() => runAccountAction("restart")} title="Restart" />
        <IconBtn icon={<Focus size={12} />} onClick={onSelect} title="Focus" />
        <IconBtn icon={<Pencil size={12} />} onClick={onEdit} title="Edit account" />
      </div>
    </div>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] w-7 text-slate-500">{label}</span>
      <div className="flex-1 h-1.5 bg-black/30 rounded-full overflow-hidden">
        <div className={clsx("h-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-slate-500 w-6 text-right">{value}</span>
    </div>
  );
}

function IconBtn({ icon, onClick, title }: { icon: React.ReactNode; onClick: (e: React.MouseEvent) => void; title: string }) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className="flex-1 flex items-center justify-center py-1 rounded bg-black/20 hover:bg-black/40 text-slate-300"
    >
      {icon}
    </button>
  );
}
