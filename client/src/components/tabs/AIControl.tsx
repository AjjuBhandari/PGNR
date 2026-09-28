import { useEffect, useState } from "react";
import { useStore } from "../../store/useStore";
import { api } from "../../lib/api";

interface AIDecision {
  action: string;
  reason: string;
  ts: number;
}

interface AIConfig {
  provider: string;
  model: string | null;
  configured: boolean;
}

export default function AIControl() {
  const { selectedBotId, bots, upsertBot } = useStore();
  const bot = selectedBotId ? bots[selectedBotId] : null;
  const [goal, setGoal] = useState("");
  const [interval, setIntervalSeconds] = useState(5);
  const [decisions, setDecisions] = useState<AIDecision[]>([]);
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setGoal(bot?.ai.goal || "");
    setIntervalSeconds(Math.round((bot?.ai.intervalMs || 5000) / 1000));
  }, [selectedBotId, bot?.ai.goal, bot?.ai.intervalMs]);

  useEffect(() => {
    if (!selectedBotId) return;
    let active = true;
    const loadDecisions = () => api.aiDecisions(selectedBotId)
      .then((history: AIDecision[]) => { if (active) setDecisions(history); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "AI decisions unavailable"); });
    loadDecisions();
    api.aiConfig().then((value: AIConfig) => { if (active) setConfig(value); }).catch(() => {});
    const timer = setInterval(loadDecisions, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selectedBotId]);

  if (!bot) return <div className="p-6 text-xs text-slate-500">Select a bot.</div>;

  const toggle = async () => {
    const enabled = !bot.ai.enabled;
    upsertBot({ ...bot, ai: { ...bot.ai, enabled } });
    setError("");
    try {
      await api.toggleAi(bot.id, enabled);
    } catch (cause) {
      upsertBot({ ...bot, ai: { ...bot.ai, enabled: !enabled } });
      setError(cause instanceof Error ? cause.message : "Could not update AI state");
    }
  };

  const saveGoal = async () => {
    try {
      await api.setAiGoal(bot.id, goal);
      upsertBot({ ...bot, ai: { ...bot.ai, goal } });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save AI goal");
    }
  };

  const saveInterval = async () => {
    try {
      const result = await api.setAiInterval(bot.id, interval * 1000);
      upsertBot({ ...bot, ai: result.ai });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save AI interval");
    }
  };

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">AI Mind — {bot.username}</div>
          <div className="text-xs text-slate-500">Autonomous decision loop</div>
        </div>
        <button onClick={toggle} className={bot.ai.enabled ? "btn btn-primary" : "btn"}>
          {bot.ai.enabled ? "AI: ON" : "AI: OFF"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="text-xs text-slate-400">
          Configured provider
          <div className="mt-1 text-sm text-slate-200">{config?.configured ? `${config.provider} · ${config.model}` : "Not configured"}</div>
        </div>
        <label className="text-xs text-slate-400">
          Decision interval: {interval}s
          <div className="flex items-center gap-2 mt-1">
            <input type="range" min={1} max={30} value={interval} onChange={(event) => setIntervalSeconds(Number(event.target.value))} className="w-full" />
            <button className="btn" onClick={saveInterval}>Save</button>
          </div>
        </label>
      </div>

      <label className="block text-xs text-slate-400">
        Current goal
        <div className="flex gap-2 mt-1">
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="chop wood, mine stone, collect items, explore, or follow username"
            className="flex-1 bg-black/30 border border-mc-border rounded px-2 py-1.5 text-sm outline-none focus:border-mc-green"
          />
          <button className="btn btn-primary" onClick={saveGoal}>
            Save
          </button>
        </div>
      </label>

      <div>
        <div className="text-xs font-semibold text-slate-400 mb-2">Decision log (last 50)</div>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {decisions.length === 0 && <div className="text-xs text-slate-500">No live AI decisions recorded for this server session.</div>}
          {decisions.map((d, i) => (
            <div key={`${d.ts}-${i}`} className="text-xs bg-black/20 border border-mc-border rounded px-2 py-1.5">
              <span className="text-slate-500">{new Date(d.ts).toLocaleTimeString()}</span>{" "}
              <span className="text-mc-purple">{d.action}</span>{" "}
              <span className="text-slate-400">— {d.reason}</span>
            </div>
          ))}
        </div>
      </div>

      {error && <div role="alert" className="text-xs text-red-300">{error}</div>}
      <div className="text-xs text-slate-500 border-t border-mc-border pt-3">
        Provider token usage is not exposed by the configured AI API.
      </div>
    </div>
  );
}
