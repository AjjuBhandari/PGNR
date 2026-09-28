import { useEffect, useRef, useState } from "react";
import type { Bot } from "../types/bot";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";

export default function ActionsPanel({ bot }: { bot: Bot }) {
  const incrementCommands = useStore((s) => s.incrementCommands);
  const [count, setCount] = useState(16);
  const [coords, setCoords] = useState(() => ({
    x: Math.floor(bot.position.x),
    y: Math.floor(bot.position.y),
    z: Math.floor(bot.position.z),
  }));
  const coordsTouched = useRef(false);
  const [chatMsg, setChatMsg] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [targetPlayer, setTargetPlayer] = useState("");
  const [blockName, setBlockName] = useState("stone");
  const [itemName, setItemName] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    coordsTouched.current = false;
    setCoords({ x: Math.floor(bot.position.x), y: Math.floor(bot.position.y), z: Math.floor(bot.position.z) });
  }, [bot.id]);

  useEffect(() => {
    if (!coordsTouched.current && bot.lastSeen) {
      setCoords({ x: Math.floor(bot.position.x), y: Math.floor(bot.position.y), z: Math.floor(bot.position.z) });
    }
  }, [bot.position.x, bot.position.y, bot.position.z, bot.lastSeen]);

  const run = async (action: string, params?: Record<string, unknown>) => {
    try {
      const result = await api.sendCommand(bot.id, action, params);
      if (!result?.ok) throw new Error(result?.error || "Action failed");
      const detail = result.players ? `Players: ${result.players.join(", ") || "none visible"}`
        : result.position ? `Position: ${result.position.x}, ${result.position.y}, ${result.position.z}`
        : result.path ? `Path contains ${result.path.length} nodes`
        : Number.isFinite(result.movedBlocks) ? `Moved ${result.movedBlocks.toFixed(1)} blocks`
        : `${action.replace(/_/g, " ")} sent`;
      setFeedback({ text: detail, error: false });
      incrementCommands();
      return true;
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : "Action failed", error: true });
      return false;
    }
  };

  const sendChat = async () => {
    const message = chatMsg.trim();
    if (!message || sendingChat) return;
    setSendingChat(true);
    if (await run("chat", { message })) setChatMsg("");
    setSendingChat(false);
  };

  return (
    <div className="space-y-4">
      <span className="text-xs font-semibold text-slate-400">Actions</span>

      <Section title="Movement">
        <div className="grid grid-cols-2 gap-1.5">
          <button className="btn justify-center" onClick={() => run("walk", { dir: "forward" })}>Forward</button>
          <button className="btn justify-center" onClick={() => run("walk", { dir: "back" })}>Back</button>
          <button className="btn justify-center" onClick={() => run("walk", { dir: "left" })}>Left</button>
          <button className="btn justify-center" onClick={() => run("walk", { dir: "right" })}>Right</button>
          <button className="btn justify-center" onClick={() => run("jump")}>Jump</button>
          <button className="btn justify-center" onClick={() => run("jump_forward")}>Jump Forward</button>
          <button className="btn justify-center" onClick={() => run("wave")}>Wave</button>
          <button className="btn justify-center" onClick={() => run("stop")}>Stop</button>
        </div>
        <div className="flex gap-1 mt-1.5">
          {(["x", "y", "z"] as const).map((axis) => (
            <input
              key={axis}
              type="number"
              value={coords[axis]}
              onChange={(e) => {
                coordsTouched.current = true;
                setCoords({ ...coords, [axis]: Number(e.target.value) });
              }}
              className="w-full bg-black/30 border border-mc-border rounded px-1.5 py-1 text-xs"
              placeholder={axis.toUpperCase()}
            />
          ))}
          <button className="btn shrink-0" onClick={() => run("goto", coords)}>Go To</button>
        </div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          <input
            value={targetPlayer}
            onChange={(e) => setTargetPlayer(e.target.value)}
            placeholder="Player name"
            className="w-full sm:flex-1 min-w-0 bg-black/30 border border-mc-border rounded px-1.5 py-1 text-xs"
          />
          <button className="btn" onClick={() => run("come", { target: targetPlayer })}>Come</button>
          <button className="btn" onClick={() => run("follow", { target: targetPlayer })}>Follow</button>
          <button className="btn" onClick={() => run("look", { target: targetPlayer })}>Look</button>
          <button className="btn" onClick={() => run("attack", { target: targetPlayer })}>Attack</button>
        </div>
      </Section>

      <Section title="Mining">
        <div className="flex gap-1.5">
          <input
            type="number"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-16 bg-black/30 border border-mc-border rounded px-1.5 py-1 text-xs"
          />
          <button className="btn flex-1 justify-center" onClick={() => run("chop_wood", { count })}>Chop Wood</button>
        </div>
        <div className="grid grid-cols-2 gap-1.5 mt-1.5">
          <button className="btn justify-center" onClick={() => run("dig_down")}>Dig Down</button>
          <button className="btn justify-center" onClick={() => run("collect_nearby")}>Collect Nearby</button>
        </div>
        <div className="flex gap-1.5 mt-1.5">
          <input value={blockName} onChange={(e) => setBlockName(e.target.value)} className="min-w-0 flex-1 bg-black/30 border border-mc-border rounded px-1.5 py-1 text-xs" aria-label="Block name" />
          <button className="btn" onClick={() => run("mine", { block: blockName, count })}>Mine Block</button>
        </div>
      </Section>

      <Section title="Combat">
        <div className="grid grid-cols-2 gap-1.5">
          <button className="btn justify-center" onClick={() => run("attack_nearest")}>Attack Nearest</button>
          <button className="btn justify-center" onClick={() => run("stop_attack")}>Stop Attack</button>
          <button className="btn justify-center col-span-2" onClick={() => run("toggle_auto_kill")}>
            Auto-Kill {bot.autoKillEnabled ? "On" : "Off"}
          </button>
          <button className="btn justify-center btn-danger col-span-2" onClick={() => run("flee")}>Flee</button>
        </div>
      </Section>

      <Section title="Interaction">
        <div className="flex gap-1.5">
          <input
            value={chatMsg}
            onChange={(e) => setChatMsg(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                sendChat();
              }
            }}
            placeholder="Say something…"
            className="flex-1 bg-black/30 border border-mc-border rounded px-2 py-1 text-xs"
          />
          <button className="btn" disabled={sendingChat || !chatMsg.trim()} onClick={sendChat}>{sendingChat ? "Sending…" : "Send"}</button>
        </div>
        <div className="grid grid-cols-2 gap-1.5 mt-1.5">
          <button className="btn justify-center" onClick={() => run("drop_all")}>Drop All</button>
          <button className="btn justify-center" onClick={() => run("eat")}>Eat</button>
          <button className="btn justify-center" onClick={() => run("reply")}>Reply OK</button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Item name" className="w-full sm:flex-1 min-w-0 bg-black/30 border border-mc-border rounded px-1.5 py-1 text-xs" />
          <button className="btn" onClick={() => run("equip", { item: itemName })}>Equip</button>
        </div>
      </Section>

      <Section title="Utility">
        <div className="grid grid-cols-2 gap-1.5">
          <button className="btn justify-center" onClick={() => run("show_path")}>Show Path</button>
          <button className="btn justify-center" onClick={() => run("players")}>Players</button>
          <button className="btn justify-center" onClick={() => run("pos")}>Position</button>
          <button className="btn justify-center" onClick={() => run("toggle_auto_eat")}>
            Auto-Eat {bot.autoEatEnabled ? "On" : "Off"}
          </button>
          <button className="btn justify-center" onClick={() => run("toggle_auto_armor")}>Auto-Armor</button>
        </div>
      </Section>

      <Section title="Server">
        <div className="grid grid-cols-2 gap-1.5">
          <button className="btn justify-center" onClick={() => run("warp", { target: "hub-1" })}>hub-1</button>
          <button className="btn justify-center" onClick={() => run("warp", { target: "AFK" })}>AFK</button>
          <button className="btn justify-center" onClick={() => run("home")}>Home</button>
          <button className="btn justify-center col-span-2" onClick={() => run("spawn")}>Spawn</button>
        </div>
      </Section>

      {feedback && <div role="status" className={`text-xs break-words ${feedback.error ? "text-red-300" : "text-slate-300"}`}>{feedback.text}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-slate-500 mb-1">{title}</div>
      {children}
    </div>
  );
}
