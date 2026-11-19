import {
  useSessionStore,
  type EditorPaneState,
} from "../../stores/session-store";
import { cn } from "../../lib/cn";
import { ResourceDetails } from "../resource-details/ResourceDetails";
import { EditorTabs } from "./EditorTabs";

/** One split of the editor area: a tab strip plus the active resource details. */
export function EditorPane({
  clusterId,
  pane,
  active,
  focused,
  expanded,
  onToggleExpanded,
}: {
  clusterId: string;
  pane: EditorPaneState;
  active: boolean;
  focused: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const setActivePane = useSessionStore((state) => state.setActivePane);

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-theme-surface",
        focused && "ring-1 ring-inset ring-skyhook-500/25",
      )}
      onPointerDownCapture={() => setActivePane(clusterId, pane.id)}
    >
      <EditorTabs clusterId={clusterId} pane={pane} />
      {pane.active ? (
        <ResourceDetails
          clusterId={clusterId}
          active={active}
          paneId={pane.id}
          refKey={pane.active}
          tab={pane.tab}
          expanded={expanded}
          onToggleExpanded={onToggleExpanded}
        />
      ) : null}
    </div>
  );
}
