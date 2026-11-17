import { Shield } from "lucide-react";
import type { RbacPolicyRule } from "@shared/types";
import { DetailSection } from "./DetailSections";
import { useRbacSubject } from "./useRbac";
import {
  detectBlastRadius,
  inheritedBindingCount,
  rbacVerbClass,
  rulePermissivenessScore,
} from "../../lib/rbac";

interface PermissionsSectionProps {
  clusterId: string;
  namespace: string | undefined;
  saName: string;
  /** "pod" and "workload" differ only in the blast-radius wording. */
  variant: "pod" | "workload";
  onNavigate: (kind: string, name: string, namespace?: string) => void;
}

export function RulePreviewLine({ rule }: { rule: RbacPolicyRule }) {
  const verbs = rule.verbs ?? [];
  const resources = rule.resources ?? [];
  const groups = rule.apiGroups ?? [];
  const nonResourceURLs = rule.nonResourceURLs ?? [];
  const isNonResource = resources.length === 0 && nonResourceURLs.length > 0;
  const showGroups = !isNonResource && groups.length > 0 && groups.some((group) => group !== "");

  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px]">
      {verbs.map((verb) => (
        <span key={verb} className={`badge-sm ${rbacVerbClass(verb)}`}>
          {verb}
        </span>
      ))}
      <span className="text-theme-text-secondary">on</span>
      {isNonResource ? (
        nonResourceURLs.map((url) => (
          <span key={url} className="badge-sm status-orange font-mono">
            {url}
          </span>
        ))
      ) : (
        resources.map((resource) => (
          <span key={resource} className="badge-sm status-violet font-mono">
            {resource}
          </span>
        ))
      )}
      {showGroups ? (
        <>
          <span className="text-theme-text-secondary">in</span>
          {groups.map((group) => (
            <span key={group} className="badge-sm status-unknown font-mono">
              {group === "" ? "core" : group}
            </span>
          ))}
        </>
      ) : null}
    </div>
  );
}

/**
 * Radar's "Permissions via ServiceAccount" section: what an attacker gets by
 * compromising this Pod / one replica of this workload. Collapsed unless the
 * ServiceAccount is genuinely risky, because daily browsing asks "is it
 * healthy", not "what could it do".
 */
export function PermissionsSection({ clusterId, namespace, saName, variant, onNavigate }: PermissionsSectionProps) {
  const { data, loading, error, forbidden } = useRbacSubject(clusterId, namespace, saName);
  const title = `Permissions via ServiceAccount: ${saName}`;

  if (loading) {
    return (
      <DetailSection title={title} icon={<Shield />} defaultOpen={false}>
        <div className="text-xs text-theme-text-tertiary">Loading RBAC graph…</div>
      </DetailSection>
    );
  }

  if (error) {
    // Reading RBAC bindings is a bonus: a denied read is an expected state and
    // gets a calm note; genuine faults stay visible in red.
    return (
      <DetailSection title={title} icon={<Shield />} defaultOpen={false}>
        <div
          className={
            forbidden
              ? "text-xs text-theme-text-tertiary"
              : "text-xs text-red-600 dark:text-red-400"
          }
        >
          {forbidden
            ? "You don't have permission to view RBAC bindings here."
            : `Could not load permissions: ${error}`}
        </div>
      </DetailSection>
    );
  }

  if (!data) return null;

  const blast = detectBlastRadius(data);
  const directCount = data.direct?.length ?? 0;
  const inheritedCount = inheritedBindingCount(data);
  const ruleCount = data.flat?.length ?? 0;
  const sorted = [...(data.flat ?? [])].sort(
    (a, b) => rulePermissivenessScore(b) - rulePermissivenessScore(a),
  );
  const preview = sorted.slice(0, 5);
  const more = Math.max(0, sorted.length - preview.length);

  return (
    <DetailSection title={title} icon={<Shield />} defaultOpen={blast.length > 0}>
      {blast.length > 0 ? (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
          <div className="font-medium">Blast radius</div>
          <div className="mt-1 text-xs">
            {variant === "pod"
              ? "If this Pod is compromised, the attacker inherits the ServiceAccount's permissions, which include:"
              : "Every Pod this workload spawns inherits the ServiceAccount's permissions. Compromising any replica gives an attacker:"}
          </div>
          <ul className="mt-1.5 space-y-1 text-xs">
            {blast.map((reason, index) => (
              <li key={index}>
                <span className="text-theme-text-secondary">
                  {reason.binding.binding.kind}{" "}
                  <span className="font-medium">{reason.binding.binding.name}</span>
                </span>{" "}
                <span className="text-theme-text-tertiary">{reason.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mb-3 text-[11px] text-theme-text-tertiary">
        {directCount} direct binding{directCount === 1 ? "" : "s"} · {inheritedCount} inherited via group
        {inheritedCount === 1 ? "" : "s"} · {ruleCount} distinct rule{ruleCount === 1 ? "" : "s"}
        {data.truncated ? <span className="text-orange-600 dark:text-orange-400"> (truncated)</span> : null}
      </div>

      {preview.length === 0 ? (
        <div className="text-xs text-theme-text-tertiary">
          This ServiceAccount has no effective permissions in the cluster.
        </div>
      ) : (
        <div className="space-y-1.5">
          {preview.map((rule, index) => (
            <RulePreviewLine key={index} rule={rule} />
          ))}
          {more > 0 ? (
            <div className="text-[11px] text-theme-text-tertiary">
              +{more} more rule{more === 1 ? "" : "s"} — open the ServiceAccount to see the full grant.
            </div>
          ) : null}
        </div>
      )}

      <div className="mt-3 text-xs">
        <button
          type="button"
          className="text-accent-text hover:underline"
          onClick={() => onNavigate("ServiceAccount", saName, namespace)}
          title={`Open ServiceAccount ${namespace}/${saName}`}
        >
          View full permissions →
        </button>
      </div>
    </DetailSection>
  );
}
