import { useMemo, useState } from "react";
import clsx from "clsx";
import { useStore } from "../../store/useStore";
import { api } from "../../lib/api";

const TYPES = ["all", "chat", "join", "death", "order", "system"] as const;

export default function LiveChat() {
  const { chat, bots, selectedBotId } = useStore();
  const [filter, setFilter] = useState<(typeof TYPES)[number]>("all");
  const [query, setQuery] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendNotice, setSendNotice] = useState("");
  const selectedBot = selectedBotId ? bots[selectedBotId] : null;
  const canSend = Boolean(selectedBot && ["SPAWNED", "IN_LOBBY", "AT_AFK"].includes(selectedBot.state));
  const onlineBots = Object.values(bots).filter((bot) => ["SPAWNED", "IN_LOBBY", "AT_AFK"].includes(bot.state)).length;

  const filtered = useMemo(() => {
    return chat.filter((m) => {
      if (filter !== "all" && m.type !== filter) return false;
      if (onlySelected && m.botId !== selectedBotId) return false;
      if (query && !m.text.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [chat, filter, query, onlySelected, selectedBotId]);

  const send = async () => {
    const message = draft.trim();
    if (!message || !selectedBotId || !canSend || sending) return;
    setSending(true);
    setSendError("");
    setSendNotice("");
    try {
      const result = await api.sendCommand(selectedBotId, "chat", { message }, message);
      if (!result?.ok) throw new Error(result?.error || "Message could not be sent");
      setDraft("");
      setSendNotice(`Sent through ${selectedBot?.username}`);
    } catch (cause) {
      setSendError(cause instanceof Error ? cause.message : "Message could not be sent");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-2 border-b border-mc-border">
        <input
          placeholder="Search chat…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="bg-black/30 border border-mc-border rounded px-2 py-1 text-xs flex-1 outline-none focus:border-mc-green"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="bg-black/30 border border-mc-border rounded px-2 py-1 text-xs"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-[11px] text-slate-400">
          <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} />
          Selected bot only
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-xs">
        {filtered.length === 0 && (
          <div className="text-slate-500 p-4 text-center">
            {chat.length > 0
              ? "No messages match the current search or filters."
              : onlineBots > 0
                ? "Bot connected. Waiting for Minecraft server messages…"
                : "No bots are connected. Start a bot to receive Minecraft messages."}
          </div>
        )}
        {filtered.map((m, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-slate-500 shrink-0">{new Date(m.ts).toLocaleTimeString()}</span>
            <span className={clsx("shrink-0", typeColor(m.type))}>[{bots[m.botId]?.username ?? m.botId}]</span>
            {m.from && <span className="text-slate-300 shrink-0">{m.from}:</span>}
            <span className="text-slate-200 break-all">{m.text}</span>
          </div>
        ))}
      </div>
      <form
        className="border-t border-mc-border p-2"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <div className="flex items-center gap-2 mb-1.5 text-[11px] text-slate-500">
          <span className="truncate">{selectedBot ? `Send as ${selectedBot.username}` : "Select a bot to send chat"}</span>
          {selectedBot && <span className={canSend ? "text-mc-green" : "text-mc-red"}>{selectedBot.state}</span>}
        </div>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={canSend ? "Message the server…" : "Selected bot must be online to chat"}
            disabled={!canSend || sending}
            className="flex-1 min-w-0 bg-black/30 border border-mc-border rounded px-2 py-1.5 text-xs outline-none focus:border-mc-green disabled:opacity-50"
          />
          <button type="submit" className="btn btn-primary" disabled={!canSend || sending || !draft.trim()}>
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
        {sendError && <div role="alert" className="mt-1.5 text-xs text-red-300">{sendError}</div>}
        {sendNotice && <div role="status" className="mt-1.5 text-xs text-slate-400">{sendNotice}</div>}
      </form>
    </div>
  );
}

function typeColor(type: string) {
  switch (type) {
    case "death":
      return "text-mc-red";
    case "join":
      return "text-mc-green";
    case "order":
      return "text-mc-purple";
    case "system":
      return "text-mc-gold";
    default:
      return "text-slate-400";
  }
}
