import { useEffect, useState } from "react";
import clsx from "clsx";
import { useStore } from "../store/useStore";
import type { Notification } from "../types/bot";

export default function Toaster() {
  const notifications = useStore((s) => s.notifications);
  const [visible, setVisible] = useState<Notification[]>([]);

  useEffect(() => {
    if (!notifications.length) return;

    const newest = notifications[notifications.length - 1];
    const next = { ...newest, ts: newest.ts ?? Date.now() };
    setVisible((v) => [...v.slice(-2), next]);

    const t = setTimeout(() => {
      setVisible((v) => v.filter((n) => n.ts !== next.ts || n.text !== next.text));
    }, 5000);

    return () => clearTimeout(t);
  }, [notifications]);

  return (
    <div className="fixed bottom-3 right-3 z-50 flex max-w-[22rem] flex-col gap-2 pointer-events-none">
      {visible.map((n) => (
        <div
          key={`${n.ts ?? "toast"}-${n.text}`}
          className={clsx(
            "pointer-events-auto rounded-md border px-2.5 py-1.5 text-[11px] leading-snug shadow-lg backdrop-blur-sm",
            "max-w-[18rem] w-auto break-words",
            n.level === "danger" && "border-red-500/40 bg-red-500/10 text-red-100",
            n.level === "warning" && "border-amber-400/40 bg-amber-500/10 text-amber-100",
            n.level === "info" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
          )}
        >
          {n.text.length > 140 ? `${n.text.slice(0, 137)}...` : n.text}
        </div>
      ))}
    </div>
  );
}
