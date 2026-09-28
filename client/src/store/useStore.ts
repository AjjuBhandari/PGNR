import { create } from "zustand";
import type { Bot, ChatMessage, Notification } from "../types/bot";

interface StoreState {
  bots: Record<string, Bot>;
  order: string[];
  selectedBotId: string | null;
  chat: ChatMessage[];
  notifications: Notification[];
  wsConnected: boolean;
  totalCommandsSent: number;
  theme: "dark" | "light";

  setBots: (bots: Bot[]) => void;
  setChat: (messages: ChatMessage[]) => void;
  upsertBot: (bot: Bot) => void;
  selectBot: (id: string) => void;
  pushChat: (msg: ChatMessage) => void;
  pushNotification: (n: Notification) => void;
  setWsConnected: (v: boolean) => void;
  incrementCommands: () => void;
  toggleTheme: () => void;
  reorder: (order: string[]) => void;
}

export const useStore = create<StoreState>((set, get) => ({
  bots: {},
  order: [],
  selectedBotId: null,
  chat: [],
  notifications: [],
  wsConnected: false,
  totalCommandsSent: 0,
  theme: "dark",

  setBots: (bots) =>
    set((state) => ({
      bots: Object.fromEntries(bots.map((b) => [b.id, b])),
      order: bots.map((b) => b.id),
      selectedBotId: bots.some((bot) => bot.id === state.selectedBotId) ? state.selectedBotId : bots[0]?.id ?? null,
    })),

  setChat: (messages) => set({ chat: messages.slice(-500) }),

  upsertBot: (bot) =>
    set((s) => ({
      bots: { ...s.bots, [bot.id]: { ...s.bots[bot.id], ...bot } },
      order: s.order.includes(bot.id) ? s.order : [...s.order, bot.id],
    })),

  selectBot: (id) => set({ selectedBotId: id }),

  pushChat: (msg) => set((s) => ({ chat: [...s.chat.slice(-499), msg] })),

  pushNotification: (n) => set((s) => ({ notifications: [...s.notifications.slice(-49), n] })),

  setWsConnected: (v) => set({ wsConnected: v }),

  incrementCommands: () => set((s) => ({ totalCommandsSent: s.totalCommandsSent + 1 })),

  toggleTheme: () =>
    set((s) => {
      const next = s.theme === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      return { theme: next };
    }),

  reorder: (order) => set({ order }),
}));
