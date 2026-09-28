import clsx from "clsx";
import type { ItemView } from "../types/bot";

export default function InventorySlot({
  item,
  onClick,
}: {
  item: ItemView | null;
  onClick?: (e: React.MouseEvent) => void;
}) {
  if (!item) {
    return <div className="slot slot-empty" onClick={onClick} />;
  }
  return (
    <div
      className={clsx("slot bg-[#25282f]", item.enchanted && "slot-enchanted")}
      onClick={onClick}
      title={`${item.displayName}${item.nbt ? " (has NBT)" : ""}`}
    >
      <span className="text-slate-100 leading-tight text-center px-0.5">
        {abbreviate(item.displayName)}
      </span>
      {item.count > 1 && (
        <span className="absolute bottom-0 right-0.5 text-[10px] font-bold text-white drop-shadow">
          {item.count}
        </span>
      )}
    </div>
  );
}

function abbreviate(name: string) {
  const words = name.split(" ");
  if (words.length === 1) return name.slice(0, 3);
  return words.map((w) => w[0]).join("").slice(0, 3);
}
