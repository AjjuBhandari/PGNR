import { useState } from "react";
import { Plus } from "lucide-react";
import { useStore } from "../store/useStore";
import BotCard from "./BotCard";
import { api } from "../lib/api";
import type { Bot } from "../types/bot";

export default function Sidebar() {
  const { bots, order, selectedBotId, selectBot } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [editingBot, setEditingBot] = useState<Bot | null>(null);

  return (
    <aside className="w-full md:w-72 h-full min-h-0 shrink-0 border-r border-mc-border bg-mc-bg flex flex-col">
      <div className="p-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Bots ({order.length})
        </span>
        <button onClick={() => setShowAdd(true)} className="btn btn-primary">
          <Plus size={14} /> Add Bot
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {order.length === 0 ? <p className="px-1 py-3 text-xs text-slate-500">No saved accounts.</p> : order.map((id) => (
          <BotCard key={id} bot={bots[id]} selected={id === selectedBotId} onSelect={() => selectBot(id)} onEdit={() => setEditingBot(bots[id])} />
        ))}
      </div>

      {showAdd && <AddBotModal onClose={() => setShowAdd(false)} />}
      {editingBot && <AddBotModal key={editingBot.id} bot={editingBot} onClose={() => setEditingBot(null)} />}
    </aside>
  );
}

function AddBotModal({ onClose, bot }: { onClose: () => void; bot?: Bot }) {
  const setBots = useStore((state) => state.setBots);
  const [username, setUsername] = useState(bot?.username || "");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState(bot?.host || "");
  const [version, setVersion] = useState(bot?.version || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!username.trim()) {
      setError("Enter a real Minecraft account name.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const values = { username: username.trim(), password: password || undefined, host: host.trim() || undefined, version: version.trim() || undefined };
      if (bot) await api.updateBot(bot.id, values);
      else await api.addBot(values);
      setBots(await api.listBots());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add account");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-mc-panel border border-mc-border rounded-lg p-5 w-80 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold">{bot ? "Edit Account" : "Add Bot"}</h3>
        <Field label="Minecraft username" value={username} onChange={setUsername} placeholder="Your account name" />
        <Field label={bot ? "New password (leave blank to keep current)" : "Password (optional)"} value={password} onChange={setPassword} type="password" />
        <Field label="Server host (optional)" value={host} onChange={setHost} placeholder="Uses configured server" />
        <Field label="Minecraft version (optional)" value={version} onChange={setVersion} placeholder="Uses configured version" />
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button className="btn flex-1 justify-center" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary flex-1 justify-center" disabled={submitting} onClick={submit}>
            {submitting ? "Saving…" : bot ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full bg-black/30 border border-mc-border rounded px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-mc-green"
      />
    </label>
  );
}
