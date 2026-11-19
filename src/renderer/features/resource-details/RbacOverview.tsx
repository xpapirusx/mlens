import { useEffect, useState, type ReactNode } from "react";
import { Box, Cloud, Eye, Key, Shield, Users } from "lucide-react";
import type { KubeObject, RbacPolicyRule, RbacRoleResponse } from "@shared/types";
import { api, call, errorText } from "../../lib/api";
import { detectBlastRadius, rbacVerbClass } from "../../lib/rbac";
import { cn } from "../../lib/cn";
import { DetailSection, Property, PropertyList } from "./DetailSections";
import { RulePreviewLine } from "./PermissionsSection";
import { useRbacSubject } from "./useRbac";

/**
 * Radar's Access Control overview sections: what a ServiceAccount can do, who
 * is bound to a Role, and what a binding actually grants. All of it comes from
 * the same RBAC snapshot the Permissions section uses, so the three views can
 * never disagree about a grant.
 */

type AnyObject = any;

function useRbacRole(
  clusterId: string,
  kind: "Role" | "ClusterRole",
  namespace: string | undefined,
  name: string | undefined,
  enabled: boolean,
): { data: RbacRoleResponse | null; loading: boolean; error: string | null; forbidden: boolean } {
  const [state, setState] = useState<{
    data: RbacRoleResponse | null;
    loading: boolean;
    error: string | null;
    forbidden: boolean;
  }>({ data: null, loading: false, error: null, forbidden: false });

  useEffect(() => {
    if (!enabled || !name || (kind === "Role" && !namespace)) {
      setState({ data: null, loading: false, error: null, forbidden: false });
      return;
    }
    let disposed = false;
    const load = async () => {
      setState((current) => ({ ...current, loading: true }));
      try {
        const data = await call(api.rbac.role({ clusterId, kind, namespace, name }));
        if (disposed) return;
        setState({ data, loading: false, error: null, forbidden: false });
      } catch (fetchError) {
        if (disposed) return;
        const message = errorText(fetchError);
        setState({
          data: null,
          loading: false,
          error: message,
          forbidden: /access denied by rbac|forbidden|403/i.test(message),
        });
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, [clusterId, kind, namespace, name, enabled]);

  return state;
}

/** Pods currently running as a ServiceAccount. */
function usePodsForServiceAccount(clusterId: string, namespace: string | undefined, name: string, enabled: boolean) {
  const [pods, setPods] = useState<KubeObject[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !namespace || !name) {
      setPods([]);
      return;
    }
    let disposed = false;
    const load = async () => {
      try {
        const result = await call(
          api.resources.list({
            clusterId,
            apiVersion: "v1",
            kind: "Pod",
            namespace,
            fieldSelector: `spec.serviceAccountName=${name}`,
            limit: 500,
          }),
        );
        if (!disposed) {
          setPods(result.items);
          setError(null);
        }
      } catch (fetchError) {
        if (!disposed) setError(errorText(fetchError));
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, [clusterId, namespace, name, enabled]);

  return { pods, error };
}

function ResourceChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("badge-sm font-mono", className ?? "status-violet")} title={String(children)}>
      {children}
    </span>
  );
}

function RuleCard({ rule }: { rule: RbacPolicyRule }) {
  const groups = rule.apiGroups ?? [];
  const resources = rule.resources ?? [];
  const urls = rule.nonResourceURLs ?? [];
  const names = rule.resourceNames ?? [];
  const isNonResource = resources.length === 0 && urls.length > 0;
  return (
    <div className="space-y-1.5 rounded-md border border-theme-border-subtle bg-theme-base px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-24 shrink-0 text-[calc(10px*var(--font-scale))] uppercase tracking-wide text-theme-text-tertiary">Verbs</span>
        {(rule.verbs ?? []).map((verb) => (
          <span key={verb} className={cn("badge-sm", rbacVerbClass(verb))}>
            {verb}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-24 shrink-0 text-[calc(10px*var(--font-scale))] uppercase tracking-wide text-theme-text-tertiary">
          {isNonResource ? "URLs" : "Resources"}
        </span>
        {(isNonResource ? urls : resources).map((entry) => (
          <ResourceChip key={entry} className={isNonResource ? "status-orange" : "status-violet"}>
            {entry}
          </ResourceChip>
        ))}
        {!isNonResource && resources.length === 0 ? <span className="text-xs text-theme-text-tertiary">–</span> : null}
      </div>
      {!isNonResource && groups.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-24 shrink-0 text-[calc(10px*var(--font-scale))] uppercase tracking-wide text-theme-text-tertiary">API groups</span>
          {groups.map((group) => (
            <ResourceChip key={group} className="status-unknown">
              {group === "" ? "core" : group}
            </ResourceChip>
          ))}
        </div>
      ) : null}
      {names.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-24 shrink-0 text-[calc(10px*var(--font-scale))] uppercase tracking-wide text-theme-text-tertiary">Names</span>
          {names.map((entry) => (
            <ResourceChip key={entry} className="status-neutral">
              {entry}
            </ResourceChip>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BindingRow({
  binding,
  subjects,
  inherited,
  onNavigate,
}: {
  binding: { kind: string; namespace?: string; name: string; roleRef: { kind: string; namespace?: string; name: string } };
  subjects: Array<{ kind: string; namespace?: string; name: string }>;
  inherited?: boolean;
  onNavigate: OverviewNavigate;
}) {
  const clusterScoped = binding.kind === "ClusterRoleBinding";
  return (
    <div className="rounded-md border border-theme-border-subtle bg-theme-base px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[calc(12px*var(--font-scale))]">
        <span className={cn("badge-sm", clusterScoped ? "status-violet" : "status-neutral")}>
          {binding.kind === "ClusterRoleBinding" ? "CRB" : "RB"}
        </span>
        <button
          type="button"
          className="truncate font-medium text-accent-text hover:underline"
          title={`Open ${binding.kind}/${binding.name}`}
          onClick={() => onNavigate(binding.kind, binding.name, binding.namespace)}
        >
          {binding.name}
        </button>
        <span className="text-theme-text-tertiary">→</span>
        <span className={cn("badge-sm", binding.roleRef.kind === "ClusterRole" ? "status-violet" : "status-neutral")}>
          {binding.roleRef.kind === "ClusterRole" ? "CR" : "R"}
        </span>
        <button
          type="button"
          className="truncate text-accent-text hover:underline"
          title={`Open ${binding.roleRef.kind}/${binding.roleRef.name}`}
          onClick={() =>
            onNavigate(binding.roleRef.kind, binding.roleRef.name, binding.roleRef.namespace ?? binding.namespace)
          }
        >
          {binding.roleRef.name}
        </button>
        {binding.roleRef.kind === "ClusterRole" && binding.kind === "RoleBinding" && binding.namespace ? (
          <span className="badge-sm status-unknown">scoped to {binding.namespace}</span>
        ) : null}
        {inherited ? <span className="text-[calc(11px*var(--font-scale))] italic text-theme-text-tertiary">inherited</span> : null}
      </div>
      {subjects.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {subjects.slice(0, 6).map((subject, index) =>
            subject.kind === "ServiceAccount" ? (
              <button
                key={`${subject.kind}-${subject.namespace}-${subject.name}-${index}`}
                type="button"
                className="badge-sm status-healthy hover:underline"
                title={`Open ServiceAccount ${subject.namespace}/${subject.name}`}
                onClick={() => onNavigate("ServiceAccount", subject.name, subject.namespace ?? binding.namespace)}
              >
                sa:{subject.name}
              </button>
            ) : (
              <span
                key={`${subject.kind}-${subject.name}-${index}`}
                className="badge-sm status-neutral"
                title={`${subject.kind}: ${subject.name}`}
              >
                {subject.kind === "Group" ? "grp:" : "usr:"}
                {subject.name}
              </span>
            ),
          )}
          {subjects.length > 6 ? (
            <span className="text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">+{subjects.length - 6} more</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type OverviewNavigate = (kind: string, name: string, namespace?: string) => void;

// ── ServiceAccount ────────────────────────────────────────────────────────────

export function ServiceAccountRbacSections({
  clusterId,
  namespace,
  name,
  onNavigate,
}: {
  clusterId: string;
  namespace: string | undefined;
  name: string;
  onNavigate: OverviewNavigate;
}) {
  const { data, loading, error, forbidden } = useRbacSubject(clusterId, namespace, name);
  const { pods, error: podsError } = usePodsForServiceAccount(clusterId, namespace, name, !loading);

  if (loading) {
    return (
      <DetailSection title="Permissions" icon={<Shield />} defaultOpen={false}>
        <div className="text-xs text-theme-text-tertiary">Loading RBAC graph…</div>
      </DetailSection>
    );
  }
  if (error) {
    return (
      <DetailSection title="Permissions" icon={<Shield />} defaultOpen={false}>
        <div className={forbidden ? "text-xs text-theme-text-tertiary" : "text-xs text-red-600 dark:text-red-400"}>
          {forbidden ? "You don't have permission to view RBAC bindings here." : `Could not load RBAC data: ${error}`}
        </div>
      </DetailSection>
    );
  }
  if (!data) return null;

  const blast = detectBlastRadius({ ...data, inheritedFromGroups: [] });
  const inheritedGroups = data.inheritedFromGroups ?? [];

  return (
    <>
      {blast.length > 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[calc(12px*var(--font-scale))] text-amber-700 dark:text-amber-300">
          <div className="font-medium">Permissive grant detected</div>
          <ul className="mt-1.5 space-y-1 text-xs">
            {blast.map((reason, index) => (
              <li key={index}>
                <span className="text-theme-text-secondary">
                  {reason.binding.binding.kind} <span className="font-medium">{reason.binding.binding.name}</span>
                </span>{" "}
                <span className="text-theme-text-tertiary">{reason.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <DetailSection title="Direct bindings" icon={<Shield />} count={data.direct.length}>
        {data.direct.length === 0 ? (
          <div className="text-xs text-theme-text-tertiary">
            No bindings reference this ServiceAccount directly. Its permissions, if any, come from group membership.
          </div>
        ) : (
          <div className="space-y-1.5">
            {data.direct.map((entry, index) => (
              <BindingRow
                key={`${entry.binding.kind}/${entry.binding.name}/${index}`}
                binding={entry.binding}
                subjects={[]}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </DetailSection>

      {inheritedGroups.map((group) => (
        <DetailSection
          key={group.groupName}
          title={`Inherited via ${group.groupName}`}
          icon={<Users />}
          defaultOpen={false}
          count={group.bindings.length}
        >
          <div className="space-y-1.5">
            {group.bindings.map((entry, index) => (
              <BindingRow
                key={`${entry.binding.kind}/${entry.binding.name}/${index}`}
                binding={entry.binding}
                subjects={[]}
                inherited
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </DetailSection>
      ))}

      <DetailSection
        title={`Effective permissions${data.truncated ? " (truncated)" : ""}`}
        icon={<Eye />}
        defaultOpen={false}
        count={data.flat.length}
      >
        {data.truncated ? (
          <div className="mb-2 text-[calc(11px*var(--font-scale))] text-orange-600 dark:text-orange-400">
            The rule list is capped; this is a partial view of the grant.
          </div>
        ) : null}
        <div className="space-y-1.5">
          {data.flat.slice(0, 50).map((rule, index) => (
            <RulePreviewLine key={index} rule={rule} />
          ))}
          {data.flat.length > 50 ? (
            <div className="text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">+{data.flat.length - 50} more rules</div>
          ) : null}
        </div>
      </DetailSection>

      <DetailSection title="Used by Pods" icon={<Box />} count={pods.length} defaultOpen={pods.length > 0}>
        {podsError ? (
          <div className="text-xs text-theme-text-tertiary">Pod list unavailable: {podsError}</div>
        ) : pods.length === 0 ? (
          <div className="text-xs text-theme-text-tertiary">
            No Pods are currently running as this ServiceAccount.
          </div>
        ) : (
          <div className="space-y-0.5">
            {pods.slice(0, 50).map((pod) => (
              <button
                key={`${pod.metadata?.namespace}/${pod.metadata?.name}`}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-theme-hover"
                onClick={() => onNavigate("Pod", pod.metadata?.name ?? "", pod.metadata?.namespace)}
                title={`Open Pod ${pod.metadata?.namespace}/${pod.metadata?.name}`}
              >
                <span className="min-w-0 flex-1 truncate font-mono text-[calc(11px*var(--font-scale))] text-theme-text-primary">
                  {pod.metadata?.name}
                </span>
                <span className="shrink-0 text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">{pod.metadata?.namespace}</span>
              </button>
            ))}
          </div>
        )}
      </DetailSection>
    </>
  );
}

// ── Role / ClusterRole ────────────────────────────────────────────────────────

const WIDE_GROUPS: Record<string, string> = {
  "system:authenticated": "every authenticated user",
  "system:unauthenticated": "every unauthenticated request",
  "system:masters": "anyone able to authenticate as a master",
};

export function RoleRbacSections({ object }: { object: AnyObject }) {
  const rules = (object.rules ?? []) as RbacPolicyRule[];
  const hasWildcard = rules.some(
    (rule) =>
      (rule.verbs ?? []).includes("*") ||
      (rule.resources ?? []).includes("*") ||
      (rule.apiGroups ?? []).includes("*"),
  );
  const aggregation = object.spec?.aggregationRule?.clusterRoleSelectors ?? [];

  return (
    <>
      {hasWildcard ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[calc(12px*var(--font-scale))] text-amber-700 dark:text-amber-300">
          <div className="font-medium">Wildcard permissions</div>
          <div className="mt-1 text-xs">
            This role grants at least one <span className="inline-code">*</span> — anything bound to it can act on
            every listed resource.
          </div>
        </div>
      ) : null}

      <DetailSection title="Rules" icon={<Shield />} count={rules.length}>
        {rules.length === 0 ? (
          <div className="text-xs text-theme-text-tertiary">No rules defined.</div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule, index) => (
              <RuleCard key={index} rule={rule} />
            ))}
          </div>
        )}
      </DetailSection>

      {aggregation.length > 0 ? (
        <DetailSection title="Aggregation rule" icon={<Users />} defaultOpen={false} count={aggregation.length}>
          <div className="space-y-2">
            {aggregation.map((selector: any, index: number) => (
              <div key={index} className="flex flex-wrap items-center gap-1 text-xs">
                <span className="text-theme-text-tertiary">Match labels:</span>
                {Object.entries((selector?.matchLabels ?? {}) as Record<string, string>).map(([key, value]) => (
                  <span key={key} className="badge-sm status-unknown font-mono">
                    {key}={value}
                  </span>
                ))}
                {Object.keys(selector?.matchLabels ?? {}).length === 0 ? (
                  <span className="text-theme-text-tertiary">No labels specified</span>
                ) : null}
              </div>
            ))}
          </div>
        </DetailSection>
      ) : null}
    </>
  );
}

/** Bindings that reference this Role/ClusterRole (reverse lookup). */
export function RoleBindingsSection({
  clusterId,
  object,
  onNavigate,
}: {
  clusterId: string;
  object: AnyObject;
  onNavigate: OverviewNavigate;
}) {
  const kind = (object.kind === "ClusterRole" ? "ClusterRole" : "Role") as "Role" | "ClusterRole";
  const namespace = object.metadata?.namespace as string | undefined;
  const name = object.metadata?.name as string;
  const { data, loading, error, forbidden } = useRbacRole(clusterId, kind, namespace, name, true);

  if (loading) {
    return (
      <DetailSection title="Bindings" icon={<Users />} defaultOpen={false}>
        <div className="text-xs text-theme-text-tertiary">Loading bindings…</div>
      </DetailSection>
    );
  }
  if (error) {
    return (
      <DetailSection title="Bindings" icon={<Users />} defaultOpen={false}>
        <div className={forbidden ? "text-xs text-theme-text-tertiary" : "text-xs text-red-600 dark:text-red-400"}>
          {forbidden ? "You don't have permission to view bindings." : `Could not load bindings: ${error}`}
        </div>
      </DetailSection>
    );
  }
  if (!data) return null;

  return (
    <DetailSection title="Bindings" icon={<Users />} count={data.bindings.length}>
      {data.bindings.length === 0 ? (
        <div className="text-xs text-theme-text-tertiary">
          No bindings reference this role. It grants no effective permissions.
        </div>
      ) : (
        <div className="space-y-1.5">
          {data.bindings.map((entry, index) => (
            <BindingRow
              key={`${entry.binding.kind}/${entry.binding.name}/${index}`}
              binding={entry.binding}
              subjects={entry.subjects}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </DetailSection>
  );
}

// ── RoleBinding / ClusterRoleBinding ─────────────────────────────────────────

export function RoleBindingRbacSections({
  clusterId,
  object,
  onNavigate,
}: {
  clusterId: string;
  object: AnyObject;
  onNavigate: OverviewNavigate;
}) {
  const subjects = (object.subjects ?? []) as Array<{ kind?: string; namespace?: string; name?: string }>;
  const roleRef = (object.roleRef ?? {}) as { kind?: string; name?: string; apiGroup?: string };
  const roleKind = (roleRef.kind === "ClusterRole" ? "ClusterRole" : "Role") as "Role" | "ClusterRole";
  const namespace = object.metadata?.namespace as string | undefined;
  const { data, loading, error, forbidden } = useRbacRole(
    clusterId,
    roleKind,
    roleKind === "Role" ? namespace : undefined,
    roleRef.name,
    Boolean(roleRef.name),
  );

  const wideGroup = subjects.find((subject) => subject.kind === "Group" && WIDE_GROUPS[subject.name ?? ""]);
  const isClusterScoped = object.kind === "ClusterRoleBinding";

  return (
    <>
      {subjects.length === 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[calc(12px*var(--font-scale))] text-amber-700 dark:text-amber-300">
          <div className="font-medium">No subjects</div>
          <div className="mt-1 text-xs">
            This binding has no subjects — it has no effect until subjects are added.
          </div>
        </div>
      ) : null}

      {wideGroup ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[calc(12px*var(--font-scale))] text-amber-700 dark:text-amber-300">
          <div className="font-medium">Wide grant: {wideGroup.name}</div>
          <div className="mt-1 text-xs">
            This binding grants {roleRef.kind} “{roleRef.name}” to {WIDE_GROUPS[wideGroup.name ?? ""]}.
          </div>
        </div>
      ) : null}

      {isClusterScoped ? (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[calc(12px*var(--font-scale))] text-sky-700 dark:text-sky-300">
          A ClusterRoleBinding grants permissions across all namespaces.
        </div>
      ) : null}

      <DetailSection title="Role reference" icon={<Shield />}>
        <PropertyList>
          <Property
            label="Kind"
            value={
              <span className={cn("badge-sm", roleKind === "ClusterRole" ? "status-violet" : "status-neutral")}>
                {roleRef.kind ?? "–"}
              </span>
            }
          />
          <Property
            label="Name"
            value={
              roleRef.name ? (
                <button
                  type="button"
                  className="truncate text-left text-accent-text hover:underline"
                  onClick={() =>
                    onNavigate(
                      roleRef.kind ?? "Role",
                      roleRef.name!,
                      roleKind === "Role" ? namespace : undefined,
                    )
                  }
                  title={`Open ${roleRef.kind}/${roleRef.name}`}
                >
                  {roleRef.name}
                </button>
              ) : (
                "–"
              )
            }
          />
          <Property label="API group" value={roleRef.apiGroup ?? "rbac.authorization.k8s.io"} mono />
        </PropertyList>
      </DetailSection>

      <DetailSection title="Rules granted" icon={<Eye />} defaultOpen={false}>
        {loading ? (
          <div className="text-xs text-theme-text-tertiary">Loading rules…</div>
        ) : forbidden ? (
          <div className="text-xs text-theme-text-tertiary">
            Access denied reading referenced role “{roleRef.name}”.
          </div>
        ) : error ? (
          <div className="text-xs text-red-600 dark:text-red-400">Could not resolve referenced role: {error}</div>
        ) : data?.roleMissing ? (
          <div className="text-xs text-theme-text-tertiary">
            Could not resolve referenced role “{roleRef.name}” — it may not exist (orphan binding) or be unavailable.
          </div>
        ) : (data?.rules ?? []).length === 0 ? (
          <div className="text-xs text-theme-text-tertiary">The referenced role has no rules.</div>
        ) : (
          <div className="space-y-1.5">
            {(data?.rules ?? []).map((rule, index) => (
              <RulePreviewLine key={index} rule={rule} />
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Subjects" icon={<Users />} count={subjects.length}>
        {subjects.length === 0 ? (
          <div className="text-xs text-theme-text-tertiary">No subjects.</div>
        ) : (
          <div className="space-y-1.5">
            {subjects.map((subject, index) => {
              const isServiceAccount = subject.kind === "ServiceAccount";
              const wide = subject.kind === "Group" && WIDE_GROUPS[subject.name ?? ""];
              return (
                <div
                  key={`${subject.kind}-${subject.namespace}-${subject.name}-${index}`}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-theme-border-subtle bg-theme-base px-2.5 py-1.5 text-[calc(12px*var(--font-scale))]"
                >
                  <span
                    className={cn(
                      "badge-sm",
                      isServiceAccount ? "status-healthy" : subject.kind === "User" ? "status-neutral" : "status-violet",
                    )}
                  >
                    {subject.kind}
                  </span>
                  {isServiceAccount ? (
                    <button
                      type="button"
                      className="truncate font-medium text-accent-text hover:underline"
                      onClick={() => onNavigate("ServiceAccount", subject.name!, subject.namespace ?? namespace)}
                      title={`Open ServiceAccount ${subject.namespace}/${subject.name}`}
                    >
                      {subject.name}
                    </button>
                  ) : (
                    <span className="truncate font-medium text-theme-text-primary">{subject.name}</span>
                  )}
                  {wide ? <span className="badge-sm status-degraded">wide</span> : null}
                  <span className="ml-auto font-mono text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
                    Namespace: {subject.namespace ?? "–"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </DetailSection>
    </>
  );
}

/** Sections a ServiceAccount detail shows beyond the RBAC graph. */
export function ServiceAccountExtras({ object }: { object: AnyObject }) {
  const secrets = (object.secrets ?? []) as Array<{ name?: string }>;
  const pullSecrets = (object.imagePullSecrets ?? []) as Array<{ name?: string }>;
  const annotations = (object.metadata?.annotations ?? {}) as Record<string, string>;
  const workloadIdentity = [
    { label: "GCP Service Account", key: "iam.gke.io/gcp-service-account" },
    { label: "AWS Role ARN", key: "eks.amazonaws.com/role-arn" },
    { label: "Azure Client ID", key: "azure.workload.identity/client-id" },
  ].filter((entry) => annotations[entry.key]);

  return (
    <>
      <DetailSection title="Configuration" icon={<Cloud />} defaultOpen={false}>
        <PropertyList>
          <Property
            label="Automount token"
            value={
              object.automountServiceAccountToken === false ? (
                <span className="badge-sm status-healthy">No</span>
              ) : (
                <span className="badge-sm status-degraded">Yes</span>
              )
            }
          />
          <Property label="Age" value={object.metadata?.creationTimestamp ?? "–"} />
        </PropertyList>
      </DetailSection>

      {workloadIdentity.length > 0 ? (
        <DetailSection title="Workload identity" icon={<Cloud />} defaultOpen={false} count={workloadIdentity.length}>
          <PropertyList>
            {workloadIdentity.map((entry) => (
              <Property key={entry.key} label={entry.label} value={annotations[entry.key]} mono />
            ))}
          </PropertyList>
        </DetailSection>
      ) : null}

      {secrets.length > 0 ? (
        <DetailSection title="Secrets" icon={<Key />} defaultOpen={false} count={secrets.length}>
          <PropertyList>
            {secrets.map((secret) => (
              <Property key={secret.name} label="Secret" value={secret.name ?? "–"} mono />
            ))}
          </PropertyList>
        </DetailSection>
      ) : null}

      {pullSecrets.length > 0 ? (
        <DetailSection
          title="Image pull secrets"
          icon={<Key />}
          defaultOpen={false}
          count={pullSecrets.length}
        >
          <div className="flex flex-wrap gap-1.5">
            {pullSecrets.map((secret) => (
              <span key={secret.name} className="badge-sm status-unknown font-mono">
                {secret.name}
              </span>
            ))}
          </div>
        </DetailSection>
      ) : null}
    </>
  );
}
