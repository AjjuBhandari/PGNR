export type BotState = "CONNECTING" | "LOGGED_IN" | "SPAWNED" | "IN_LOBBY" | "AT_AFK" | "OFFLINE";

export interface ItemView {
  name: string;
  displayName: string;
  count: number;
  slot?: number;
  enchanted?: boolean;
  nbt?: unknown;
}

export interface Inventory {
  hotbar: (ItemView | null)[];
  main: (ItemView | null)[];
  armor: (ItemView | null)[];
  offhand: ItemView | null;
}

export interface Equipment {
  helmet: ItemView | null;
  chestplate: ItemView | null;
  leggings: ItemView | null;
  boots: ItemView | null;
  offhand: ItemView | null;
}

export interface AiState {
  enabled: boolean;
  provider: "openai" | "groq" | "deepseek" | "keyless";
  model: string | null;
  goal: string;
  intervalMs: number;
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface Bot {
  id: string;
  username: string;
  host: string;
  version: string;
  state: BotState;
  task: string;
  health: number;
  maxHealth: number;
  food: number;
  xpLevel: number;
  xpProgress: number;
  position: Position;
  heldItem: ItemView | null;
  target: string | null;
  inventory: Inventory;
  equipment: Equipment;
  ai: AiState;
  autoEatEnabled: boolean;
  autoKillEnabled: boolean;
  connectedAt: number | null;
  lastSeen: number | null;
}

export interface ChatMessage {
  botId: string;
  type: "chat" | "join" | "death" | "order" | "system";
  text: string;
  from?: string;
  ts: number;
}

export interface Notification {
  botId?: string;
  level: "info" | "warning" | "danger";
  text: string;
  ts: number;
}

export interface CommandRecord {
  id: string;
  bot_id: string;
  command: string;
  status: "sent" | "executed" | "failed";
  is_favorite: number;
  created_at: string;
}
