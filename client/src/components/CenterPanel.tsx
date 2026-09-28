import { useState } from "react";
import clsx from "clsx";
import LiveChat from "./tabs/LiveChat";
import Console from "./tabs/Console";
import Commands from "./tabs/Commands";
import AIControl from "./tabs/AIControl";
import Analytics from "./tabs/Analytics";

const TABS = [
  { id: "chat", label: "Live Chat", el: LiveChat },
  { id: "console", label: "Console", el: Console },
  { id: "commands", label: "Commands", el: Commands },
  { id: "ai", label: "AI Control", el: AIControl },
  { id: "analytics", label: "Analytics", el: Analytics },
] as const;

export default function CenterPanel() {
  const [active, setActive] = useState<(typeof TABS)[number]["id"]>("chat");
  const Active = TABS.find((t) => t.id === active)!.el;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 border-r border-mc-border bg-mc-panel">
      <div className="flex shrink-0 overflow-x-auto border-b border-mc-border px-2">
        {TABS.map((t) => (
          <div
            key={t.id}
            onClick={() => setActive(t.id)}
            className={clsx("tab", active === t.id && "tab-active")}
          >
            {t.label}
          </div>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        <Active />
      </div>
    </div>
  );
}
