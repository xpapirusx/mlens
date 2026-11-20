import { useId } from "react";
import { ArrowDownToLine, ArrowUpFromLine, GitFork, Shield } from "lucide-react";
import { DetailSection } from "./DetailSections";
import { effectivePolicyTypeNames, effectivePolicyTypes, formatLabelSelector, formatNetworkPolicyPort } from "../../lib/network-policy";

type PeerInfo = { label: string; sublabel?: string; type: "pod" | "namespace" | "cidr" | "all" | "deny" | "combined" };

const PEER_STYLES: Record<PeerInfo["type"], string> = {
  pod: "border-emerald-500/30 bg-emerald-500/10",
  namespace: "border-sky-500/30 bg-sky-500/10",
  cidr: "border-amber-500/30 bg-amber-500/10",
  combined: "border-emerald-500/30 bg-emerald-500/10",
  all: "border-theme-border bg-theme-elevated/60",
  deny: "border-red-500/30 bg-red-500/10",
};

const PEER_DOTS: Record<PeerInfo["type"], string> = {
  pod: "bg-emerald-500",
  namespace: "bg-sky-500",
  cidr: "bg-amber-500",
  combined: "bg-emerald-500",
  all: "bg-theme-text-tertiary",
  deny: "bg-red-500",
};

export function NetworkPolicyOverview({
  object,
}: {
  object: any;
}) {
  const spec = object.spec ?? {};
  const types = effectivePolicyTypes(spec);
  const policyTypes = effectivePolicyTypeNames(spec);
  const ingress: any[] | undefined = spec.ingress;
  const egress: any[] | undefined = spec.egress;
  const podSelector = spec.podSelector ?? {};

  return (
    <div className="space-y-4">
      {types.ingress || types.egress ? (
        <DetailSection title="Policy flow" icon={<GitFork />}>
          <PolicyFlow spec={spec} />
        </DetailSection>
      ) : null}

      <DetailSection title="Target" icon={<Shield />}>
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-[calc(10px*var(--font-scale))] uppercase tracking-wide text-theme-text-tertiary">
              Pod selector
            </div>
            <SelectorBadges selector={podSelector} emptyText="All pods in namespace" />
          </div>
          <div>
            <div className="mb-1 text-[calc(10px*var(--font-scale))] uppercase tracking-wide text-theme-text-tertiary">
              Policy types
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {policyTypes.map((type) => (
                <span key={type} className={cnBadge(type === "Ingress" ? "status-blue" : "status-purple")}>
                  {type}
                </span>
              ))}
              {!types.explicit ? (
                <span className="text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
                  by default — policyTypes not set
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </DetailSection>

      {types.ingress ? (
        <DetailSection title="Ingress rules" icon={<ArrowDownToLine />} count={ingress?.length ?? 0}>
          {ingress && ingress.length > 0 ? (
            <div className="space-y-2">
              {ingress.map((rule, index) => (
                <RuleCard key={index} rule={rule} direction="from" />
              ))}
            </div>
          ) : (
            <div className="text-[calc(12px*var(--font-scale))] text-red-600 dark:text-red-400">Deny all ingress</div>
          )}
        </DetailSection>
      ) : null}

      {types.egress ? (
        <DetailSection title="Egress rules" icon={<ArrowUpFromLine />} count={egress?.length ?? 0}>
          {egress && egress.length > 0 ? (
            <div className="space-y-2">
              {egress.map((rule, index) => (
                <RuleCard key={index} rule={rule} direction="to" />
              ))}
            </div>
          ) : (
            <div className="text-[calc(12px*var(--font-scale))] text-red-600 dark:text-red-400">Deny all egress</div>
          )}
        </DetailSection>
      ) : null}
    </div>
  );
}

function RuleCard({ rule, direction }: { rule: any; direction: "from" | "to" }) {
  const peers: any[] = rule?.[direction] ?? [];
  const ports: any[] = rule?.ports ?? [];
  return (
    <div className="card-inner space-y-2">
      <div>
        <div className="mb-1 text-[calc(10px*var(--font-scale))] uppercase tracking-wide text-theme-text-tertiary">
          {direction === "from" ? "From" : "To"}
        </div>
        {peers.length > 0 ? (
          <div className="space-y-1">
            {peers.map((peer, index) => (
              <PeerRow key={index} peer={peer} />
            ))}
          </div>
        ) : (
          <span className="text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
            {direction === "from" ? "All sources" : "All destinations"}
          </span>
        )}
      </div>
      {ports.length > 0 ? (
        <div>
          <div className="mb-1 text-[calc(10px*var(--font-scale))] uppercase tracking-wide text-theme-text-tertiary">Ports</div>
          <div className="flex flex-wrap gap-1">
            {ports.map((port, index) => (
              <span key={index} className="badge-sm status-neutral font-mono">
                {formatNetworkPolicyPort(port)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PeerRow({ peer }: { peer: any }) {
  const hasPod = peer?.podSelector !== undefined;
  const hasNs = peer?.namespaceSelector !== undefined;
  if (hasPod || hasNs) {
    return (
      <div className="flex flex-wrap items-center gap-1 text-[calc(11px*var(--font-scale))]">
        {hasPod ? (
          <>
            <span className="text-theme-text-tertiary">pods</span>
            <SelectorBadges selector={peer.podSelector} emptyText="all pods" />
          </>
        ) : null}
        {hasNs ? (
          <>
            <span className="text-theme-text-tertiary">{hasPod ? "in" : "namespaces"}</span>
            <SelectorBadges selector={peer.namespaceSelector} emptyText="all namespaces" />
          </>
        ) : null}
      </div>
    );
  }
  if (peer?.ipBlock) {
    return (
      <div className="text-[calc(11px*var(--font-scale))] text-theme-text-secondary">
        <span className="text-theme-text-tertiary">ipBlock </span>
        <span className="font-mono text-theme-text-primary">{peer.ipBlock.cidr}</span>
        {peer.ipBlock.except?.length ? <span className="text-theme-text-tertiary"> except {peer.ipBlock.except.join(", ")}</span> : null}
      </div>
    );
  }
  return <span className="text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">All sources</span>;
}

function SelectorBadges({ selector, emptyText }: { selector: any; emptyText: string }) {
  const text = formatLabelSelector(selector);
  if (text === "all") {
    return <span className="badge-sm status-neutral">{emptyText}</span>;
  }
  return (
    <span className="badge-sm status-neutral font-mono" title={text}>
      {text}
    </span>
  );
}

function PolicyFlow({ spec }: { spec: any }) {
  const types = effectivePolicyTypes(spec);
  const ingress: any[] | undefined = spec.ingress;
  const egress: any[] | undefined = spec.egress;
  const targetText = formatLabelSelector(spec.podSelector ?? {});
  const target = targetText === "all" ? "All pods" : targetText;
  const ingressDenied = types.ingress && (!ingress || ingress.length === 0);
  const egressDenied = types.egress && (!egress || egress.length === 0);

  return (
    <div className="space-y-4">
      {types.ingress ? (
        <div className="space-y-2">
          <FlowHeading label="Ingress" tone="text-blue-600 dark:text-blue-400" dot="bg-blue-500" />
          {ingressDenied ? (
            <FlowRow sources={[{ label: "All traffic", type: "deny" }]} target={target} ports={[]} direction="ingress" denied />
          ) : (
            ingress?.map((rule, index) => (
              <FlowRow
                key={index}
                sources={extractPeers(rule?.from, "Any source")}
                target={target}
                ports={extractPorts(rule?.ports)}
                direction="ingress"
              />
            ))
          )}
        </div>
      ) : null}

      {types.egress ? (
        <div className="space-y-2">
          <FlowHeading label="Egress" tone="text-purple-600 dark:text-purple-400" dot="bg-purple-500" />
          {egressDenied ? (
            <FlowRow sources={[{ label: "All traffic", type: "deny" }]} target={target} ports={[]} direction="egress" denied />
          ) : (
            egress?.map((rule, index) => (
              <FlowRow
                key={index}
                sources={extractPeers(rule?.to, "Any destination")}
                target={target}
                ports={extractPorts(rule?.ports)}
                direction="egress"
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function FlowHeading({ label, tone, dot }: { label: string; tone: string; dot: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className={`text-[calc(10px*var(--font-scale))] font-semibold uppercase tracking-wider ${tone}`}>{label}</span>
    </div>
  );
}

function extractPeers(peers: any[] | undefined, emptyLabel: string): PeerInfo[] {
  if (!peers || peers.length === 0) return [{ label: emptyLabel, type: "all" }];
  return peers.map((peer) => {
    const hasPod = peer?.podSelector !== undefined;
    const hasNs = peer?.namespaceSelector !== undefined;
    if (hasPod && hasNs) {
      const podText = formatLabelSelector(peer.podSelector);
      const nsText = formatLabelSelector(peer.namespaceSelector);
      return {
        label: podText === "all" ? "All pods" : podText,
        sublabel: `in ${nsText === "all" ? "any namespace" : nsText}`,
        type: "combined",
      };
    }
    if (hasPod) {
      const podText = formatLabelSelector(peer.podSelector);
      return { label: podText === "all" ? "All pods" : podText, type: "pod" };
    }
    if (hasNs) {
      const nsText = formatLabelSelector(peer.namespaceSelector);
      return { label: nsText === "all" ? "All namespaces" : nsText, type: "namespace" };
    }
    if (peer?.ipBlock) {
      return {
        label: peer.ipBlock.cidr || "?",
        sublabel: peer.ipBlock.except?.length ? `except ${peer.ipBlock.except.join(", ")}` : undefined,
        type: "cidr",
      };
    }
    return { label: "All sources", type: "all" };
  });
}

function extractPorts(ports: any[] | undefined): string[] {
  return (ports ?? []).map(formatNetworkPolicyPort);
}

function FlowRow({
  sources,
  target,
  ports,
  direction,
  denied = false,
}: {
  sources: PeerInfo[];
  target: string;
  ports: string[];
  direction: "ingress" | "egress";
  denied?: boolean;
}) {
  const color = denied ? "#ef4444" : direction === "ingress" ? "#3b82f6" : "#a855f7";
  const sourceNodes = (
    <div className="min-w-0 max-w-full shrink space-y-1">
      {sources.map((peer, index) => (
        <div key={index}>
          {index > 0 ? (
            <div className="my-0.5 text-center text-[9px] uppercase tracking-widest text-theme-text-tertiary">or</div>
          ) : null}
          <div
            className={`min-w-0 overflow-hidden rounded-md border px-2 py-1.5 ${PEER_STYLES[peer.type]}`}
            title={peer.sublabel ? `${peer.label}\n${peer.sublabel}` : peer.label}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PEER_DOTS[peer.type]}`} />
              <span
                className={`min-w-0 truncate text-[calc(11px*var(--font-scale))] font-medium ${
                  denied ? "text-red-600 line-through dark:text-red-400" : "text-theme-text-primary"
                }`}
              >
                {peer.label}
              </span>
            </div>
            {peer.sublabel ? (
              <div className="ml-3 truncate text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">{peer.sublabel}</div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );

  const targetNode = (
    <div className="min-w-0 max-w-full shrink-[1000]">
      <div
        className="min-w-0 max-w-full overflow-hidden rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-1.5"
        title={target}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
          <span className="min-w-0 truncate text-[calc(11px*var(--font-scale))] font-medium text-theme-text-primary">{target}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex items-center gap-1">
      {direction === "ingress" ? (
        <>
          {sourceNodes}
          <Arrow color={color} ports={ports} denied={denied} />
          {targetNode}
        </>
      ) : (
        <>
          {targetNode}
          <Arrow color={color} ports={ports} denied={denied} />
          {sourceNodes}
        </>
      )}
    </div>
  );
}

function Arrow({ color, ports, denied }: { color: string; ports: string[]; denied: boolean }) {
  const rawId = useId();
  const markerId = `np-arrow-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <div className="flex w-10 shrink-0 flex-col items-center justify-center">
      <svg width="40" height="20" viewBox="0 0 40 20" className="overflow-visible">
        <defs>
          <marker id={markerId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6" fill="none" stroke={color} strokeWidth="1.5" />
          </marker>
        </defs>
        <line
          x1="2"
          y1="10"
          x2="32"
          y2="10"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray={denied ? "3 2" : undefined}
          markerEnd={`url(#${markerId})`}
        />
      </svg>
      {ports.length > 0 ? (
        <div className="mt-0.5 flex flex-col items-center gap-0.5">
          {ports.map((port, index) => (
            <span key={index} className="whitespace-nowrap font-mono text-[8px] leading-none text-theme-text-tertiary">
              {port}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function cnBadge(tone: string): string {
  return `badge-sm ${tone}`;
}
