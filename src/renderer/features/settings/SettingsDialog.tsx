import { useEffect, useState } from "react";
import {
  Blocks,
  FileCode,
  Moon,
  Palette,
  PanelBottom,
  PanelLeft,
  Plug,
  Plus,
  RefreshCw,
  Settings,
  SquareTerminal,
  Star,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import type { ClusterColorRule } from "@shared/types";
import { Modal } from "../../design-system/components/Modal";
import { Button } from "../../design-system/components/Button";
import { useCatalogStore } from "../../stores/catalog-store";
import { useChromeSessions, useSessionStore } from "../../stores/session-store";
import { useAppInfo } from "../../lib/use-app-info";
import { basename } from "../../lib/format";
import { TERMINAL_FONTS, UI_FONTS } from "../../lib/fonts";
import { CLUSTER_COLOR_PALETTE } from "../../lib/cluster-color";
import { cn } from "../../lib/cn";
import { openCluster, disconnectCluster } from "../../lib/cluster-actions";

export function SettingsDialog() {
  const open = useCatalogStore((state) => state.settingsOpen);
  const openSettings = useCatalogStore((state) => state.openSettings);
  const settings = useCatalogStore((state) => state.settings);
  const updateSettings = useCatalogStore((state) => state.updateSettings);
  const sources = useCatalogStore((state) => state.sources);
  const importViaDialog = useCatalogStore((state) => state.importViaDialog);
  const removeKubeconfig = useCatalogStore((state) => state.removeKubeconfig);
  const loadCatalog = useCatalogStore((state) => state.loadCatalog);
  const clusters = useCatalogStore((state) => state.clusters);
  const sessions = useChromeSessions();
  const info = useAppInfo();
  // Rules are edited as a local draft: an empty row must survive until the
  // user types a pattern (main sanitisation drops empty patterns).
  const [colorRules, setColorRules] = useState<ClusterColorRule[]>(
    settings?.clusterColorRules ?? [],
  );

  useEffect(() => {
    if (settings) setColorRules(settings.clusterColorRules);
  }, [settings?.clusterColorRules]);

  useEffect(() => {
    if (open) void loadCatalog();
  }, [open, loadCatalog]);

  const persistColorRules = (rules: ClusterColorRule[]) => {
    void updateSettings({
      clusterColorRules: rules
        .map((rule) => ({ pattern: rule.pattern.trim(), color: rule.color }))
        .filter((rule) => rule.pattern.length > 0),
    });
  };

  if (!settings) return null;

  return (
    <Modal
      open={open}
      onClose={() => openSettings(false)}
      width={720}
      title="Settings"
      subtitle="Preferences are stored locally in the mLens data directory."
      footer={
        <Button variant="secondary" onClick={() => openSettings(false)}>
          Close
        </Button>
      }
    >
      <div className="space-y-6">
        <Section title="Appearance" icon={<Sun />}>
          <Field label="Color theme" hint="Radar follows the mode below; all other themes are dark.">
            <div className="grid w-full max-w-xl grid-cols-4 gap-2">
              {(
                [
                  { value: "radar", label: "Radar" },
                  { value: "dracula", label: "Dracula" },
                  { value: "freelens", label: "Teal" },
                  { value: "proton", label: "Proton" },
                  { value: "synthwave", label: "Synthwave '84" },
                  { value: "islands", label: "Dark Islands" },
                  { value: "github", label: "GitHub" },
                  { value: "night-owl", label: "Night Owl" },
                  { value: "material", label: "Material" },
                  { value: "one-dark-pro", label: "One Dark Pro" },
                  { value: "one-dark", label: "One Dark" },
                  { value: "catppuccin", label: "Catppuccin" },
                  { value: "jellybeans", label: "Jellybeans" },
                  { value: "adwaita", label: "Adwaita" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  title={option.label}
                  onClick={() =>
                    void updateSettings({
                      colorTheme: option.value,
                      ...(option.value === "radar" ? {} : { theme: "dark" as const }),
                    })
                  }
                  className={cn(
                    "flex h-8 w-full min-w-0 items-center justify-center rounded-lg border px-2 text-xs transition-colors",
                    (settings.colorTheme ?? "radar") === option.value
                      ? "border-skyhook-500/60 bg-skyhook-500/10 text-accent-text"
                      : "border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-hover",
                  )}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              ))}
            </div>
          </Field>
          <div className="flex items-center gap-2">
            {(
              [
                { value: "light", label: "Light", icon: Sun },
                { value: "dark", label: "Dark", icon: Moon },
                { value: "system", label: "System", icon: Settings },
              ] as const
            ).map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => void updateSettings({ theme: option.value, colorTheme: "radar" })}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors",
                    settings.theme === option.value
                      ? "border-skyhook-500/60 bg-skyhook-500/10 text-accent-text"
                      : "border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-hover",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {option.label}
                </button>
              );
            })}
          </div>
          <Field label="Font size" hint="Scales every font (interface, terminal, YAML editor) without changing layout density.">
            <input
              type="number"
              min={0.5}
              max={2}
              step={0.05}
              value={settings.fontScale}
              onChange={(event) =>
                void updateSettings({ fontScale: Math.min(2, Math.max(0.5, Number(event.target.value) || 1)) })
              }
              className="h-8 w-20 rounded-md border border-theme-border bg-theme-elevated px-2 font-mono text-xs text-theme-text-primary focus:outline-none"
            />
          </Field>
          <Field label="UI font" hint="Ubuntu and DM Sans are bundled; System UI uses the operating system font.">
            <select
              value={settings.uiFontFamily ?? "DM Sans"}
              onChange={(event) => void updateSettings({ uiFontFamily: event.target.value })}
              className="h-8 rounded-md border border-theme-border bg-theme-elevated px-2 text-xs text-theme-text-primary focus:outline-none"
            >
              {UI_FONTS.map((font) => (
                <option key={font.value} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Timezone" hint="Timestamps and Age tooltips use local time or UTC.">
            <select
              value={settings.timeZone ?? "local"}
              onChange={(event) => void updateSettings({ timeZone: event.target.value as "local" | "utc" })}
              className="h-8 rounded-md border border-theme-border bg-theme-elevated px-2 text-xs text-theme-text-primary focus:outline-none"
            >
              <option value="local">Local time</option>
              <option value="utc">UTC</option>
            </select>
          </Field>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void updateSettings({ sidebarWidth: 236, showSystemNamespaces: false });
                const store = useSessionStore.getState();
                for (const id of Object.keys(store.sessions)) store.setSidebarWidth(id, 236);
              }}
            >
              <PanelLeft className="h-3.5 w-3.5" />
              Reset sidebar width
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void updateSettings({ dockHeight: 340 });
                const store = useSessionStore.getState();
                for (const id of Object.keys(store.sessions)) store.setDock(id, { height: 340, open: false });
              }}
            >
              <PanelBottom className="h-3.5 w-3.5" />
              Reset dock height
            </Button>
          </div>
        </Section>

        <Section title="Editor" icon={<FileCode />}>
          <Field label="Font family">
            <select
              value={settings.editorFontFamily ?? "DM Mono"}
              onChange={(event) => void updateSettings({ editorFontFamily: event.target.value })}
              className="h-8 rounded-md border border-theme-border bg-theme-elevated px-2 text-xs text-theme-text-primary focus:outline-none"
            >
              {TERMINAL_FONTS.map((font) => (
                <option key={font.value} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Font size" hint="Base size for YAML/Monaco; the global Font size multiplier still applies.">
            <input
              type="number"
              min={8}
              max={24}
              value={settings.editorFontSize ?? 12}
              onChange={(event) =>
                void updateSettings({
                  editorFontSize: Math.min(24, Math.max(8, Number(event.target.value) || 12)),
                })
              }
              className="h-8 w-20 rounded-md border border-theme-border bg-theme-elevated px-2 font-mono text-xs text-theme-text-primary focus:outline-none"
            />
          </Field>
          <Field label="Tab size">
            <select
              value={settings.editorTabSize ?? 2}
              onChange={(event) => void updateSettings({ editorTabSize: Number(event.target.value) })}
              className="h-8 rounded-md border border-theme-border bg-theme-elevated px-2 text-xs text-theme-text-primary focus:outline-none"
            >
              {[1, 2, 4, 8].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Line numbers">
            <Switch
              checked={settings.editorLineNumbers ?? true}
              onChange={(checked) => void updateSettings({ editorLineNumbers: checked })}
            />
          </Field>
          <Field label="Minimap">
            <Switch
              checked={settings.editorMinimap ?? false}
              onChange={(checked) => void updateSettings({ editorMinimap: checked })}
            />
          </Field>
        </Section>

        <Section title="Data refresh" icon={<RefreshCw />}>
          <Field label="Auto-refresh interval" hint="Lists, counts and the details drawer poll at this cadence. Watch streams keep rows live between polls.">
            <select
              value={settings.refreshIntervalSeconds}
              onChange={(event) => void updateSettings({ refreshIntervalSeconds: Number(event.target.value) })}
              className="h-8 rounded-md border border-theme-border bg-theme-elevated px-2 text-xs text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-skyhook-500/60"
            >
              <option value={0}>Manual only</option>
              <option value={10}>Every 10 seconds</option>
              <option value={30}>Every 30 seconds</option>
              <option value={60}>Every minute</option>
              <option value={120}>Every 2 minutes</option>
            </select>
          </Field>
          <Field label="Show system namespaces" hint="Include kube-* namespaces in the namespace picker.">
            <Switch
              checked={settings.showSystemNamespaces}
              onChange={(checked) => void updateSettings({ showSystemNamespaces: checked })}
            />
          </Field>
          <Field label="Table row height" hint="Compact fits more rows; comfortable matches Radar's default density.">
            <select
              value={settings.tableRowHeight}
              onChange={(event) => void updateSettings({ tableRowHeight: Number(event.target.value) })}
              className="h-8 rounded-md border border-theme-border bg-theme-elevated px-2 text-xs text-theme-text-primary focus:outline-none"
            >
              <option value={24}>Ultra compact · 24px</option>
              <option value={28}>Dense · 28px</option>
              <option value={32}>Compact · 32px</option>
              <option value={36}>Normal · 36px</option>
              <option value={40}>Relaxed · 40px</option>
              <option value={44}>Comfortable · 44px</option>
              <option value={48}>Roomy · 48px</option>
              <option value={52}>Large · 52px</option>
            </select>
          </Field>
          <Field
            label="Collapse catalog groups by default"
            hint="Start with groups folded, and remember what you expand."
          >
            <Switch
              checked={settings.collapseCatalogGroups}
              onChange={(checked) => void updateSettings({ collapseCatalogGroups: checked })}
            />
          </Field>
        </Section>

        <Section title="Sidebar favorites" icon={<Star />}>
          {settings.favoriteKinds.length === 0 ? (
            <p className="text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
              Pin resource kinds from the sidebar (pin icon on hover) to keep them at the top of every cluster.
            </p>
          ) : (
            <div className="space-y-1">
              {settings.favoriteKinds.map((key) => {
                const [apiVersion, kind] = key.split("|");
                return (
                  <div
                    key={key}
                    className="flex items-center gap-2 rounded-md border border-theme-border-subtle px-2 py-1.5 text-xs"
                  >
                    <Star className="h-3.5 w-3.5 text-amber-500" />
                    <span className="min-w-0 flex-1 truncate font-mono">
                      {kind} <span className="text-[calc(10px*var(--font-scale))] text-theme-text-disabled">{apiVersion}</span>
                    </span>
                    <button
                      type="button"
                      className="rounded p-1 text-theme-text-tertiary hover:bg-theme-hover hover:text-red-500"
                      title="Remove favorite"
                      onClick={() =>
                        void updateSettings({
                          favoriteKinds: settings.favoriteKinds.filter((entry) => entry !== key),
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Terminal" icon={<SquareTerminal />}>
          <Field label="Font size">
            <input
              type="number"
              min={9}
              max={22}
              value={settings.terminalFontSize}
              onChange={(event) =>
                void updateSettings({ terminalFontSize: Math.min(22, Math.max(9, Number(event.target.value) || 13)) })
              }
              className="h-8 w-20 rounded-md border border-theme-border bg-theme-elevated px-2 font-mono text-xs text-theme-text-primary focus:outline-none"
            />
          </Field>
          <Field label="Font family">
            <select
              value={settings.terminalFontFamily}
              onChange={(event) => void updateSettings({ terminalFontFamily: event.target.value })}
              className="h-8 rounded-md border border-theme-border bg-theme-elevated px-2 text-xs text-theme-text-primary focus:outline-none"
            >
              {TERMINAL_FONTS.map((font) => (
                <option key={font.value} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Shell path" hint="Local terminal binary. Empty uses $SHELL (zsh/bash/sh on macOS and Linux).">
            <input
              type="text"
              value={settings.defaultShell ?? ""}
              placeholder="/bin/zsh"
              spellCheck={false}
              onChange={(event) => void updateSettings({ defaultShell: event.target.value })}
              className="h-8 w-48 rounded-md border border-theme-border bg-theme-elevated px-2 font-mono text-xs text-theme-text-primary focus:outline-none"
            />
          </Field>
          <Field label="Copy on select" hint="Copy a terminal selection to the clipboard as soon as it is made.">
            <Switch
              checked={settings.terminalCopyOnSelect ?? false}
              onChange={(checked) => void updateSettings({ terminalCopyOnSelect: checked })}
            />
          </Field>
          <p className="mt-1 text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
            Terminals open in the bottom dock. Local shells use node-pty; pod shells use the Kubernetes exec
            WebSocket (no kubectl required).
          </p>
        </Section>

        <Section title="Kubeconfig sources" icon={<Plug />}>
          <div className="space-y-1">
            {sources.map((source) => (
              <div key={source.path} className="flex items-center gap-2 rounded-md border border-theme-border-subtle px-2 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-theme-text-primary">{basename(source.path)}</span>
                  <span className="block truncate font-mono text-[calc(10px*var(--font-scale))] text-theme-text-tertiary" title={source.path}>
                    {source.path}
                  </span>
                </span>
                <span className={cn("badge-sm", source.error ? "status-unhealthy" : "status-unknown")}>
                  {source.error ? "invalid" : `${source.contextCount} contexts`}
                </span>
                <button
                  type="button"
                  className="rounded p-1 text-theme-text-tertiary hover:bg-theme-hover hover:text-red-500"
                  title="Remove source"
                  onClick={() => void removeKubeconfig(source.path)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {sources.length === 0 ? (
              <div className="text-xs text-theme-text-tertiary">No kubeconfig sources configured.</div>
            ) : null}
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => void importViaDialog()}>
              <Upload className="h-3.5 w-3.5" />
              Import kubeconfig
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void loadCatalog()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Rescan
            </Button>
          </div>
        </Section>

        <Section title="Cluster colors" icon={<Palette />}>
          <p className="text-[calc(11px*var(--font-scale))] leading-relaxed text-theme-text-tertiary">
            Rules are checked top to bottom against the cluster name and context.
            Patterns are regular expressions; a bare <span className="font-mono">*prod*</span>{" "}
            also works as a wildcard. A colour picked in the hotbar context menu
            overrides every rule; without a match the seeded colour is kept.
          </p>
          <div className="mt-2 space-y-1.5">
            {colorRules.map((rule, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={rule.pattern}
                  placeholder="e.g. *prod* or ^msk-"
                  spellCheck={false}
                  onChange={(event) => {
                    const next = colorRules.map((entry, position) =>
                      position === index ? { ...entry, pattern: event.target.value } : entry,
                    );
                    setColorRules(next);
                  }}
                  onBlur={() => persistColorRules(colorRules)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  className="h-7 min-w-0 flex-1 rounded-md border border-theme-border bg-theme-elevated px-2 font-mono text-xs text-theme-text-primary placeholder:text-theme-text-disabled focus:outline-none focus:ring-2 focus:ring-skyhook-500/60"
                />
                <input
                  type="color"
                  value={rule.color}
                  title="Rule colour"
                  onChange={(event) => {
                    const next = colorRules.map((entry, position) =>
                      position === index ? { ...entry, color: event.target.value } : entry,
                    );
                    setColorRules(next);
                    persistColorRules(next);
                  }}
                  className="h-7 w-9 shrink-0 cursor-pointer rounded border border-theme-border bg-theme-elevated p-0.5"
                />
                <button
                  type="button"
                  className="shrink-0 rounded p-1 text-theme-text-tertiary hover:bg-theme-hover hover:text-red-500"
                  title="Remove rule"
                  onClick={() => {
                    const next = colorRules.filter((_, position) => position !== index);
                    setColorRules(next);
                    persistColorRules(next);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {colorRules.length === 0 ? (
              <div className="text-[calc(11px*var(--font-scale))] text-theme-text-disabled">
                No rules yet.
              </div>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setColorRules((current) => [
                  ...current,
                  { pattern: "", color: CLUSTER_COLOR_PALETTE[0] },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add rule
            </Button>
            {Object.keys(settings.clusterColors).length > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void updateSettings({ clusterColors: {} })}
                title="Clear colours assigned from the hotbar context menu"
              >
                Reset manual colors ({Object.keys(settings.clusterColors).length})
              </Button>
            ) : null}
          </div>
        </Section>

        <Section title="Clusters" icon={<Blocks />}>
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {clusters.map((cluster) => {
              const connected = sessions[cluster.id]?.status === "connected";
              return (
                <div key={cluster.id} className="flex items-center gap-2 rounded-md border border-theme-border-subtle px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-theme-text-primary">{cluster.name}</span>
                  <span className={cn("badge-sm", connected ? "status-healthy" : "status-unknown")}>
                    {connected ? "connected" : "idle"}
                  </span>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      if (connected) void disconnectCluster(cluster.id);
                      else void openCluster(cluster.id);
                    }}
                  >
                    {connected ? "Disconnect" : "Connect"}
                  </Button>
                </div>
              );
            })}
            {clusters.length === 0 ? (
              <div className="text-xs text-theme-text-tertiary">No contexts discovered yet.</div>
            ) : null}
          </div>
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={() => void importViaDialog()}>
              <Plus className="h-3.5 w-3.5" />
              Add cluster
            </Button>
          </div>
        </Section>

        <Section title="About" icon={<Star />}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <span className="text-theme-text-tertiary">mLens</span>
            <span className="font-mono text-theme-text-primary">{info?.version ?? "0.1.0"}</span>
            <span className="text-theme-text-tertiary">Electron / Chromium</span>
            <span className="font-mono text-theme-text-primary">
              {info?.electron ?? "—"} / {info?.chrome ?? "—"}
            </span>
            <span className="text-theme-text-tertiary">Node</span>
            <span className="font-mono text-theme-text-primary">{info?.node ?? "—"}</span>
            <span className="text-theme-text-tertiary">Platform</span>
            <span className="font-mono text-theme-text-primary">
              {info?.platform ?? "—"} {info?.arch ?? ""}
            </span>
          </div>
          <p className="mt-2 text-[calc(10px*var(--font-scale))] leading-relaxed text-theme-text-tertiary">
            Shell and window mechanics follow the classic Kubernetes IDE layout. Resource browser, table
            density, details and design tokens inspired by Skyhook Radar (Apache-2.0). mLens contains no Go
            backend and ships as a standalone Electron app.
          </p>
        </Section>
      </div>
    </Modal>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 border-b border-theme-border pb-1.5">
        <span className="flex h-4 w-4 items-center justify-center text-theme-text-tertiary [&>svg]:h-3.5 [&>svg]:w-3.5">
          {icon}
        </span>
        <h3 className="text-[calc(12px*var(--font-scale))] font-semibold uppercase tracking-wide text-theme-text-secondary">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-xs font-medium text-theme-text-primary">{label}</div>
        {hint ? <div className="mt-0.5 max-w-sm text-[calc(10px*var(--font-scale))] leading-relaxed text-theme-text-tertiary">{hint}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 rounded-full transition-colors",
        checked ? "bg-skyhook-500" : "bg-theme-active",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all",
          checked ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}
