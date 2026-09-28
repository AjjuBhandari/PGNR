import { useStore } from "../store/useStore";
import InventoryViewer from "./InventoryViewer";
import Equipment from "./Equipment";
import LiveStats from "./LiveStats";
import ActionsPanel from "./ActionsPanel";

export default function RightPanel() {
  const { bots, selectedBotId } = useStore();
  const bot = selectedBotId ? bots[selectedBotId] : null;

  if (!bot) {
    return (
      <aside className="w-full md:w-96 h-full shrink-0 bg-mc-bg p-4 text-xs text-slate-500">Select a bot to see details.</aside>
    );
  }

  return (
    <aside className="w-full md:w-96 h-full shrink-0 bg-mc-bg overflow-y-auto p-4 space-y-5">
      <LiveStats bot={bot} />
      <Equipment bot={bot} />
      <InventoryViewer bot={bot} />
      <ActionsPanel bot={bot} />
    </aside>
  );
}
