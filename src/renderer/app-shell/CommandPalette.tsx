import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Blocks,
  Command,
  Download,
  Keyboard,
  Loader2,
  Moon,
  Search,
  Server,
  Settings,
  SquareTerminal,
  Star,
  Sun,
  X,
} from "lucide-react";
import { useCatalogStore } from "../stores/catalog-store";
import { useSessionStore } from "../stores/session-store";
import { getKindIcon, kindLabel } from "../lib/icons";
import { openCluster, disconnectCluster } from "../lib/cluster-actions";
import { api, call } from "../lib/api";
import { cn } from "../lib/cn";
import type { ApiResourceInfo } from "@shared/types";

// Stable fallback: selector results must keep their identity (React #185).
const EMPTY_RESOURCES: ApiResourceInfo[] = [];

interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  icon: ReactNode;
  hint?: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  activeClusterId,
  onOpenShortcuts,
}: {
  open: boolean;
  onClose: () => void;
  activeClusterId: string | null;
  onOpenShortcuts: () => void;
}) {
  const clusters = useCatalogStore((state) => state.clusters);
  const settings = useCatalogStore((state) => state.settings);
  const updateSettings = useCatalogStore((state) => state.updateSettings);
  const openSettings = useCatalogStore((state) => state.openSettings);
  const importViaDialog = useCatalogStore((state) => state.importViaDialog);
  const loadCatalog = useCatalogStore((state) => state.loadCatalog);
  const setActiveCluster = useCatalogStore((state) => state.setActiveCluster);
  // A14: only the kind list — palette opens don't need the whole session.
  const resources =
    useSessionStore((state) => (activeClusterId ? state.sessions[activeClusterId]?.resources : undefined)) ??
    EMPTY_RESOURCES;
  const selectKind = useSessionStore((state) => state.selectKind);
  const openTerminal = useSessionStore((state) => state.openTerminal);
  const closeDetails = useSessionStore((state) => state.closeDetails);
  const openDetails = useSessionStore((state) => state.openDetails);

  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [resourceHits, setResourceHits] = useState<PaletteCommand[]>([]);
  const [searchingResources, setSearchingResources] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
  }, [open]);

  const commands = useMemo<PaletteCommand[]>(() => {
    const output: PaletteCommand[] = [];

    for (const cluster of clusters) {
      const connected = useSessionStore.getState().sessions[cluster.id]?.status === "connected";
      output.push({
        id: `cluster-open-${cluster.id}`,
        label: `${connected ? "Open" : "Connect"} cluster: ${cluster.name}`,
        group: "Clusters",
        hint: cluster.context,
        icon: <Server className="h-3.5 w-3.5" />,
        run: () => void openCluster(cluster.id),
      });
      if (connected) {
        output.push({
          id: `cluster-disconnect-${cluster.id}`,
          label: `Disconnect cluster: ${cluster.name}`,
          group: "Clusters",
          icon: <Server className="h-3.5 w-3.5" />,
          run: () => void disconnectCluster(cluster.id),
        });
      }
    }

    if (activeClusterId) {
      for (const resource of resources) {
        const Icon = getKindIcon(resource.kind, resource.group);
        output.push({
          id: `kind-${resource.apiVersion}-${resource.kind}`,
          label: `Go to ${kindLabel(resource.kind, resource.plural)}`,
          group: "Resources",
          hint: resource.apiVersion,
          icon: <Icon className="h-3.5 w-3.5" />,
          run: () => selectKind(activeClusterId, { apiVersion: resource.apiVersion, kind: resource.kind }),
        });
      }

      output.push({
        id: "open-terminal",
        label: "New local terminal",
        group: "Actions",
        icon: <SquareTerminal className="h-3.5 w-3.5" />,
        run: () => openTerminal(activeClusterId, { type: "local" }),
      });
      output.push({
        id: "close-details",
        label: "Close active resource tab",
        group: "Actions",
        icon: <X className="h-3.5 w-3.5" />,
        run: () => closeDetails(activeClusterId),
      });
    }

    output.push(
      {
        id: "catalog",
        label: "Open cluster catalog",
        group: "Navigation",
        hint: "⌘N",
        icon: <Blocks className="h-3.5 w-3.5" />,
        run: () => setActiveCluster(null),
      },
      {
        id: "shortcuts",
        label: "Keyboard shortcuts",
        group: "Navigation",
        hint: "?",
        icon: <Keyboard className="h-3.5 w-3.5" />,
        run: () => onOpenShortcuts(),
      },
      {
        id: "settings",
        label: "Open settings",
        group: "Navigation",
        icon: <Settings className="h-3.5 w-3.5" />,
        run: () => openSettings(true),
      },
      {
        id: "import",
        label: "Import kubeconfig",
        group: "Actions",
        icon: <Download className="h-3.5 w-3.5" />,
        run: () => void importViaDialog(),
      },
      {
        id: "refresh-catalog",
        label: "Refresh cluster catalog",
        group: "Actions",
        icon: <Star className="h-3.5 w-3.5" />,
        run: () => void loadCatalog(),
      },
      {
        id: "toggle-theme",
        label: settings?.theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        group: "Appearance",
        icon: settings?.theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />,
        run: () => {
          if (!settings) return;
          void updateSettings({ theme: settings.theme === "dark" ? "light" : "dark" });
        },
      },
    );

    return output;
  }, [
    clusters,
    activeClusterId,
    resources,
    selectKind,
    openTerminal,
    closeDetails,
    setActiveCluster,
    openSettings,
    importViaDialog,
    loadCatalog,
    settings,
    updateSettings,
    onOpenShortcuts,
  ]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return commands.slice(0, 200);
    const matches = commands
      .filter((command) => `${command.label} ${command.group} ${command.hint ?? ""}`.toLowerCase().includes(term))
      .slice(0, 200);
    return [...resourceHits, ...matches].slice(0, 200);
  }, [commands, query, resourceHits]);

  // Global resource search: fan out to a curated set of kinds while the query
  // is being typed. Results are capped and debounced so this never becomes a
  // background poll.
  useEffect(() => {
    if (!open || !activeClusterId || !resources.length) {
      setResourceHits([]);
      setSearchingResources(false);
      return;
    }
    const term = query.trim().toLowerCase();
    if (term.length < 2) {
      setResourceHits([]);
      setSearchingResources(false);
      return;
    }
    let disposed = false;
    const wanted = [
      "Pod",
      "Deployment",
      "StatefulSet",
      "DaemonSet",
      "Job",
      "CronJob",
      "Service",
      "Ingress",
      "ConfigMap",
      "PersistentVolumeClaim",
      "Node",
    ];
    const kinds = wanted
      .map((kind) => resources.find((entry) => entry.kind === kind && entry.verbs.includes("list")))
      .filter((entry): entry is (typeof resources)[number] => Boolean(entry));
    setSearchingResources(true);
    const timer = window.setTimeout(async () => {
      const settled = await Promise.allSettled(
        kinds.map((entry) =>
          call(
            api.resources.list({
              clusterId: activeClusterId,
              apiVersion: entry.apiVersion,
              kind: entry.kind,
              limit: 200,
            }),
          ),
        ),
      );
      if (disposed) return;
      const hits: PaletteCommand[] = [];
      settled.forEach((result, kindIndex) => {
        if (result.status !== "fulfilled") return;
        const entry = kinds[kindIndex];
        const Icon = getKindIcon(entry.kind, entry.group);
        for (const object of result.value.items) {
          const name = object.metadata?.name ?? "";
          if (!name.toLowerCase().includes(term)) continue;
          hits.push({
            id: `object-${entry.apiVersion}-${entry.kind}-${object.metadata?.namespace ?? ""}-${object.metadata?.uid ?? name}`,
            label: name,
            group: `Resources · ${kindLabel(entry.kind, entry.plural)}`,
            hint: object.metadata?.namespace ?? entry.apiVersion,
            icon: <Icon className="h-3.5 w-3.5" />,
            run: () =>
              openDetails(activeClusterId, {
                clusterId: activeClusterId,
                apiVersion: entry.apiVersion,
                kind: entry.kind,
                namespace: object.metadata?.namespace,
                name,
              }),
          });
          if (hits.length >= 60) break;
        }
      });
      setResourceHits(hits.slice(0, 60));
      setSearchingResources(false);
    }, 300);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [open, query, activeClusterId, resources, openDetails]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    const element = listRef.current?.querySelector<HTMLElement>(`[data-command-index="${index}"]`);
    element?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open) return null;

  const run = (command: PaletteCommand) => {
    onClose();
    window.setTimeout(() => command.run(), 0);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[96] flex items-start justify-center bg-black/35 px-6 pt-[12vh] backdrop-blur-[1px]"
      onPointerDown={onClose}
    >
      <div
        className="dialog flex max-h-[62vh] w-full max-w-xl flex-col overflow-hidden"
        onPointerDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center gap-2 border-b border-theme-border px-3">
          <Search className="h-4 w-4 shrink-0 text-theme-text-tertiary" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setIndex((value) => Math.min(filtered.length - 1, value + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setIndex((value) => Math.max(0, value - 1));
              } else if (event.key === "Enter") {
                const command = filtered[index];
                if (command) run(command);
              } else if (event.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Search clusters, resources and actions…"
            className="h-11 flex-1 bg-transparent text-sm text-theme-text-primary placeholder:text-theme-text-tertiary focus:outline-none"
          />
          <span className="kbd">Esc</span>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-theme-text-tertiary">No matching commands.</div>
          ) : (
            filtered.map((command, commandIndex) => {
              const showGroup = commandIndex === 0 || filtered[commandIndex - 1].group !== command.group;
              return (
                <div key={command.id}>
                  {showGroup ? (
                    <div className="px-2 pb-0.5 pt-2 text-[calc(9px*var(--font-scale))] font-semibold uppercase tracking-wider text-theme-text-disabled">
                      {command.group}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    data-command-index={commandIndex}
                    onMouseEnter={() => setIndex(commandIndex)}
                    onClick={() => run(command)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[calc(12px*var(--font-scale))]",
                      commandIndex === index
                        ? "selection-strong text-theme-text-primary"
                        : "text-theme-text-secondary",
                    )}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center text-theme-text-tertiary [&>svg]:h-3.5 [&>svg]:w-3.5">
                      {command.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{command.label}</span>
                    {command.hint ? (
                      <span className="max-w-[12rem] truncate font-mono text-[calc(10px*var(--font-scale))] text-theme-text-disabled">
                        {command.hint}
                      </span>
                    ) : null}
                    {commandIndex === index ? <span className="kbd">↵</span> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex h-7 shrink-0 items-center gap-2 border-t border-theme-border px-3 text-[calc(10px*var(--font-scale))] text-theme-text-disabled">
          <Command className="h-2.5 w-2.5" />
          <span>{filtered.length} results</span>
          {searchingResources ? (
            <span className="flex items-center gap-1 text-theme-text-tertiary">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              searching resources…
            </span>
          ) : query.trim().length >= 2 ? (
            <span>{resourceHits.length} live resources</span>
          ) : (
            <span>type 2+ letters to search live resources</span>
          )}
          <span className="ml-auto">↑ ↓ navigate · ↵ run · Esc close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
