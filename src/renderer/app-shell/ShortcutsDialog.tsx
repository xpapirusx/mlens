import { Modal } from "../design-system/components/Modal";
import { Button } from "../design-system/components/Button";

interface ShortcutRow {
  keys: string[];
  label: string;
}

const GROUPS: Array<{ title: string; rows: ShortcutRow[] }> = [
  {
    title: "Navigation",
    rows: [
      { keys: ["⌘", "K"], label: "Command palette / global resource search" },
      { keys: ["G", "P"], label: "Go to Pods" },
      { keys: ["G", "D"], label: "Go to Deployments" },
      { keys: ["G", "S"], label: "Go to Services" },
      { keys: ["G", "J"], label: "Go to Jobs" },
      { keys: ["G", "C"], label: "Go to ConfigMaps" },
      { keys: ["G", "N"], label: "Go to Nodes" },
      { keys: ["G", "O"], label: "Go to cluster Overview" },
      { keys: ["/"], label: "Focus the table search" },
      { keys: ["?"], label: "This shortcut overlay" },
    ],
  },
  {
    title: "Resources",
    rows: [
      { keys: ["↑", "↓"], label: "Move the row highlight" },
      { keys: ["↵"], label: "Open the highlighted resource" },
      { keys: ["Esc"], label: "Close active tab / menu" },
      { keys: ["⌘", "W"], label: "Close the details drawer" },
    ],
  },
  {
    title: "Terminal",
    rows: [
      { keys: ["⌘", "T"], label: "New local terminal" },
      { keys: ["⌘", "⇧", "T"], label: "New terminal in a chosen context" },
      { keys: ["⌘", "F"], label: "Terminal search" },
      { keys: ["⌘", "C"], label: "Copy terminal selection" },
      { keys: ["⌘", "V"], label: "Paste into terminal" },
    ],
  },
  {
    title: "Application",
    rows: [
      { keys: ["⌘", ","], label: "Settings" },
      { keys: ["Esc"], label: "Close dialog / palette" },
    ],
  },
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={620}
      title="Keyboard shortcuts"
      subtitle="The same sheet is available with ?"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <div className="mb-1.5 text-[calc(10px*var(--font-scale))] font-semibold uppercase tracking-wider text-theme-text-tertiary">
              {group.title}
            </div>
            <div className="overflow-hidden rounded-md border border-theme-border">
              {group.rows.map((row) => (
                <div
                  key={`${group.title}-${row.label}`}
                  className="flex items-center gap-2 border-b border-theme-border-subtle px-2.5 py-1.5 last:border-0"
                >
                  <span className="flex shrink-0 items-center gap-1">
                    {row.keys.map((key) => (
                      <kbd key={key} className="kbd">
                        {key}
                      </kbd>
                    ))}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[calc(11px*var(--font-scale))] text-theme-text-secondary">{row.label}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
