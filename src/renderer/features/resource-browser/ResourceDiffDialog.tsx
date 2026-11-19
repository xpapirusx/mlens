import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, LoaderCircle } from "lucide-react";
import type { ClusterId, KubeObject, ResourceKey } from "@shared/types";
import { Modal } from "../../design-system/components/Modal";
import { Button } from "../../design-system/components/Button";
import { InlineError } from "../../design-system/components/EmptyState";
import { YamlDiffEditor } from "../../design-system/components/YamlDiffEditor";
import { api, call, errorText } from "../../lib/api";
import { objectYaml } from "../../lib/object-yaml";
import { useCatalogStore } from "../../stores/catalog-store";

function qualified(target: ResourceKey): string {
  return `${target.kind}/${target.namespace ? `${target.namespace}/` : ""}${target.name}`;
}

/** Cluster name for a target; the context half of the id is a decent fallback. */
function useClusterName(): (clusterId: ClusterId) => string {
  const allClusters = useCatalogStore((state) => state.allClusters);
  return (clusterId) =>
    allClusters.find((cluster) => cluster.id === clusterId)?.name ??
    clusterId.split("::").pop() ??
    clusterId;
}

/**
 * Side-by-side YAML diff of exactly two resources (selection bar → Diff, or the
 * row menu's "Select for comparison" / "Compare with selected"). The two sides
 * are full `ResourceKey`s, so they may live in different clusters and be of
 * different kinds; both are re-read from the API rather than taken from a table.
 */
export function ResourceDiffDialog({
  open,
  onClose,
  left,
  right,
}: {
  open: boolean;
  onClose: () => void;
  left: ResourceKey | null;
  right: ResourceKey | null;
}) {
  const [leftObject, setLeftObject] = useState<KubeObject | null>(null);
  const [rightObject, setRightObject] = useState<KubeObject | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ignoreMetadata, setIgnoreMetadata] = useState(true);
  const [swapped, setSwapped] = useState(false);
  const clusterName = useClusterName();

  useEffect(() => {
    if (!open || !left || !right) return;
    let disposed = false;
    setLoading(true);
    setError(null);
    setSwapped(false);
    Promise.all([call(api.resources.get(left)), call(api.resources.get(right))])
      .then(([nextLeft, nextRight]) => {
        if (disposed) return;
        setLeftObject(nextLeft);
        setRightObject(nextRight);
      })
      .catch((fetchError: unknown) => {
        if (!disposed) setError(errorText(fetchError));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [open, left, right]);

  const leftYaml = useMemo(
    () => objectYaml(leftObject, { ignoreServerMetadata: ignoreMetadata }),
    [leftObject, ignoreMetadata],
  );
  const rightYaml = useMemo(
    () => objectYaml(rightObject, { ignoreServerMetadata: ignoreMetadata }),
    [rightObject, ignoreMetadata],
  );

  const first = swapped ? right : left;
  const second = swapped ? left : right;
  const crossCluster = Boolean(left && right && left.clusterId !== right.clusterId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={1180}
      title="Diff resources"
      subtitle={`YAML of two resources, A is the left (original) side and B the right (modified) side.${
        crossCluster ? " The sides come from different clusters." : ""
      }`}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex h-[calc(100vh-17rem)] min-h-[320px] flex-col gap-2">
        <div className="flex shrink-0 flex-wrap items-center gap-2 text-[calc(11px*var(--font-scale))]">
          <SideTag label="A" target={first} clusterName={first ? clusterName(first.clusterId) : ""} />
          <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-theme-text-tertiary" />
          <SideTag label="B" target={second} clusterName={second ? clusterName(second.clusterId) : ""} />
          <div className="ml-auto flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-theme-text-secondary">
              <input
                type="checkbox"
                checked={ignoreMetadata}
                onChange={(event) => setIgnoreMetadata(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-theme-border accent-skyhook-500"
              />
              Ignore server-managed metadata
            </label>
            <Button
              size="xs"
              variant="ghost"
              title="Swap the left and right sides"
              onClick={() => setSwapped((value) => !value)}
              disabled={!left || !right}
            >
              <ArrowLeftRight className="h-3 w-3" />
              Swap
            </Button>
          </div>
        </div>

        {error ? (
          <InlineError title="Cannot load the resources for comparison" message={error} />
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-xs text-theme-text-tertiary">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Reading both resources…
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-theme-border">
            <YamlDiffEditor original={leftYaml} modified={rightYaml} />
          </div>
        )}
      </div>
    </Modal>
  );
}

function SideTag({
  label,
  target,
  clusterName,
}: {
  label: string;
  target: ResourceKey | null;
  clusterName: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 rounded-md border border-theme-border bg-theme-elevated px-1.5 py-1">
      <span className="font-semibold text-theme-text-tertiary">{label}</span>
      <span className="min-w-0">
        <span className="block truncate font-mono text-[calc(11px*var(--font-scale))] text-theme-text-primary">
          {target ? qualified(target) : "—"}
        </span>
        {target ? (
          <span className="block truncate text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">{clusterName}</span>
        ) : null}
      </span>
    </span>
  );
}
