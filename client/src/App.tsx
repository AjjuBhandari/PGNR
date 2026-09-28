import { useEffect, useState } from "react";
import { Boxes, MessagesSquare, Users } from "lucide-react";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import CenterPanel from "./components/CenterPanel";
import RightPanel from "./components/RightPanel";
import Toaster from "./components/Toaster";
import Login from "./components/Login";
import { useStore } from "./store/useStore";
import { reconnectSocket } from "./lib/socket";
import { api } from "./lib/api";
import type { Bot, ChatMessage, Notification } from "./types/bot";

export default function App() {
  const [authed, setAuthed] = useState(!!localStorage.getItem("token"));
  const [mobilePanel, setMobilePanel] = useState<"bots" | "chat" | "details">("chat");
  const { upsertBot, pushChat, pushNotification, setWsConnected, setBots, setChat } = useStore();

  useEffect(() => {
    if (!authed) return;

    api
      .listBots()
      .then((list: Bot[]) => setBots(list))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Could not load saved bots.";
        if (/missing token|invalid or expired token/i.test(message)) {
          localStorage.removeItem("token");
          setAuthed(false);
          return;
        }
        pushNotification({ level: "danger", text: `Could not load saved bots: ${message}`, ts: Date.now() });
      });

    const socket = reconnectSocket();
    socket.on("connect", () => setWsConnected(true));
    socket.on("disconnect", () => setWsConnected(false));
    socket.on("bot:state", (bot: Bot) => upsertBot(bot));
    socket.on("bot:inventory", (payload: { botId: string } & Partial<Bot>) =>
      upsertBot({ id: payload.botId, ...payload } as Bot)
    );
    socket.on("bot:chat", (msg: ChatMessage) => pushChat(msg));
    socket.on("bot:chat-history", (messages: ChatMessage[]) => setChat(messages));
    socket.on("system:notification", (n: Notification) => pushNotification(n));

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("bot:state");
      socket.off("bot:inventory");
      socket.off("bot:chat");
      socket.off("bot:chat-history");
      socket.off("system:notification");
    };
  }, [authed]);

  if (!authed) return <Login onLoggedIn={() => setAuthed(true)} />;

  return (
    <div className="h-dvh min-h-0 flex flex-col overflow-hidden">
      <TopBar />
      <main className="flex-1 flex min-h-0 min-w-0">
        <section className={`${mobilePanel === "bots" ? "flex" : "hidden"} md:flex w-full md:w-72 shrink-0 min-h-0`}>
          <Sidebar />
        </section>
        <section className={`${mobilePanel === "chat" ? "flex" : "hidden"} md:flex flex-1 min-w-0 min-h-0`}>
          <CenterPanel />
        </section>
        <section className={`${mobilePanel === "details" ? "flex" : "hidden"} md:flex w-full md:w-96 shrink-0 min-h-0`}>
          <RightPanel />
        </section>
      </main>
      <nav className="md:hidden shrink-0 grid grid-cols-3 border-t border-mc-border bg-mc-panel pb-[env(safe-area-inset-bottom)]" aria-label="Dashboard sections">
        {[
          { id: "bots" as const, label: "Bots", Icon: Users },
          { id: "chat" as const, label: "Control", Icon: MessagesSquare },
          { id: "details" as const, label: "Details", Icon: Boxes },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={mobilePanel === id ? "page" : undefined}
            onClick={() => setMobilePanel(id)}
            className={`min-h-14 flex flex-col items-center justify-center gap-1 text-[10px] ${mobilePanel === id ? "text-mc-green" : "text-slate-400"}`}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>
      <Toaster />
    </div>
  );
}
