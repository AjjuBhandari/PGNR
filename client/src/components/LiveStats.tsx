import type { Bot } from "../types/bot";

export default function LiveStats({ bot }: { bot: Bot }) {
  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold text-slate-400">Live Stats</span>

      <StatRow label="❤ Health" value={`${bot.health}/${bot.maxHealth}`} color="text-mc-red" pct={(bot.health / bot.maxHealth) * 100} />
      <StatRow label="🍖 Food" value={`${bot.food}/20`} color="text-mc-gold" pct={(bot.food / 20) * 100} />
      <StatRow label="⭐ XP" value={`Lvl ${bot.xpLevel}`} color="text-mc-green" pct={bot.xpProgress * 100} />

      <div className="grid grid-cols-2 gap-2 text-xs pt-1">
        <Info label="Position" value={`${bot.position.x.toFixed(1)}, ${bot.position.y.toFixed(1)}, ${bot.position.z.toFixed(1)}`} />
        <Info label="Held item" value={bot.heldItem?.displayName ?? "—"} />
        <Info label="Target" value={bot.target ?? "—"} />
        <Info label="Task" value={bot.task} />
      </div>
    </div>
  );
}

function StatRow({ label, value, color, pct }: { label: string; value: string; color: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className={color}>{label}</span>
        <span className="text-slate-400">{value}</span>
      </div>
      <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
        <div className={`h-full ${color.replace("text-", "bg-")}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-black/20 border border-mc-border rounded px-2 py-1.5">
      <div className="text-[9px] uppercase text-slate-500">{label}</div>
      <div className="text-slate-200 truncate">{value}</div>
    </div>
  );
}
