import type { Bot } from "../types/bot";
import InventorySlot from "./InventorySlot";

const SLOTS: { key: keyof Bot["equipment"]; label: string }[] = [
  { key: "helmet", label: "Helmet" },
  { key: "chestplate", label: "Chest" },
  { key: "leggings", label: "Legs" },
  { key: "boots", label: "Boots" },
  { key: "offhand", label: "Offhand" },
];

export default function Equipment({ bot }: { bot: Bot }) {
  return (
    <div>
      <span className="text-xs font-semibold text-slate-400">Equipment</span>
      <div className="grid grid-cols-5 gap-2 mt-2">
        {SLOTS.map((s) => (
          <div key={s.key} className="text-center">
            <InventorySlot item={bot.equipment[s.key]} />
            <div className="text-[9px] text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
