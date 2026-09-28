import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Bot, ItemView } from "../types/bot";
import InventorySlot from "./InventorySlot";
import { api } from "../lib/api";

export default function InventoryViewer({ bot }: { bot: Bot }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"none" | "name" | "count">("none");
  const [menu, setMenu] = useState<{ item: ItemView; x: number; y: number } | null>(null);
  const [error, setError] = useState("");

  const filterSort = (items: (ItemView | null)[]) => {
    let list = items;
    if (query) {
      list = items.map((it) => (it && it.displayName.toLowerCase().includes(query.toLowerCase()) ? it : null));
    }
    if (sort === "none") return list;
    const nonNull = list.filter(Boolean) as ItemView[];
    nonNull.sort((a, b) => (sort === "name" ? a.displayName.localeCompare(b.displayName) : b.count - a.count));
    const padded = [...nonNull];
    while (padded.length < list.length) padded.push(null as any);
    return padded;
  };

  const hotbar = useMemo(() => filterSort(bot.inventory.hotbar), [bot.inventory.hotbar, query, sort]);
  const main = useMemo(() => filterSort(bot.inventory.main), [bot.inventory.main, query, sort]);

  const openMenu = (item: ItemView | null, e: React.MouseEvent) => {
    if (!item) return setMenu(null);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({
      item,
      x: Math.max(8, Math.min(rect.left, window.innerWidth - 176)),
      y: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 220)),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400">Inventory</span>
        <button
          className="btn"
          onClick={() => {
            api.sendCommand(bot.id, "sync_inventory").then((result) => {
              if (!result?.ok) setError(result?.error || "Inventory refresh failed");
              else setError("");
            }).catch((cause) => setError(cause instanceof Error ? cause.message : "Inventory refresh failed"));
          }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
      {error && <div role="alert" className="text-xs text-red-300">{error}</div>}

      <div className="flex gap-2">
        <input
          placeholder="Search item…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-black/30 border border-mc-border rounded px-2 py-1 text-xs outline-none focus:border-mc-green"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
          className="bg-black/30 border border-mc-border rounded px-2 py-1 text-xs"
        >
          <option value="none">Slot order</option>
          <option value="name">Name</option>
          <option value="count">Count</option>
        </select>
      </div>

      <div>
        <div className="text-[10px] uppercase text-slate-500 mb-1">Main (27)</div>
        <div className="grid grid-cols-9 gap-1">
          {main.map((item, i) => (
            <InventorySlot key={i} item={item} onClick={(e: any) => openMenu(item, e)} />
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase text-slate-500 mb-1">Hotbar (9)</div>
        <div className="grid grid-cols-9 gap-1">
          {hotbar.map((item, i) => (
            <InventorySlot key={i} item={item} onClick={(e: any) => openMenu(item, e)} />
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        <div>
          <div className="text-[10px] uppercase text-slate-500 mb-1">Armor</div>
          <div className="grid grid-cols-4 gap-1">
            {bot.inventory.armor.map((item, i) => (
              <InventorySlot key={i} item={item} onClick={(e: any) => openMenu(item, e)} />
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-slate-500 mb-1">Offhand</div>
          <InventorySlot item={bot.inventory.offhand} onClick={(e: any) => openMenu(bot.inventory.offhand, e)} />
        </div>
      </div>

      {menu && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-label="Close inventory actions" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 bg-mc-panel border border-mc-border rounded shadow-xl text-xs py-1 w-44 max-h-[min(70vh,18rem)] overflow-y-auto"
            style={{ left: menu.x, top: menu.y }}
          >
            <div className="px-3 py-1.5 font-semibold border-b border-mc-border">{menu.item.displayName}</div>
            {["Equip to hand", "Equip to armor", "Drop stack", "Drop one", "Move to hotbar…"].map((label) => (
              <button
                key={label}
                className="w-full text-left px-3 py-2 hover:bg-white/5"
                onClick={() => {
                  api.sendCommand(bot.id, "inventory_action", { action: label, item: menu.item.name, slot: menu.item.slot })
                    .then((result) => {
                      if (!result?.ok) setError(result?.error || "Inventory action failed");
                      else setError("");
                    })
                    .catch((cause) => setError(cause instanceof Error ? cause.message : "Inventory action failed"));
                  setMenu(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
