import type {
  RbacBindingRules,
  RbacInheritedGroup,
  RbacPolicyRule,
  RbacSubjectRequest,
  RbacSubjectResponse,
} from "@shared/types";
import { kubeRequest } from "./http";
import type { ClusterConnection } from "./session";

/**
 * Reverse lookup over the four RBAC kinds — the TypeScript counterpart of
 * Radar's `pkg/rbac` index. The four cluster lists are fetched through a short
 * per-cluster snapshot cache, so flipping through Pods costs one fetch burst
 * rather than one per drawer.
 */

const RBAC_GROUP = "rbac.authorization.k8s.io/v1";
/** Caps the flattened rule set; the per-binding view stays uncapped. */
const MAX_FLAT_RULES = 500;
const LIST_PAGE_SIZE = 500;
const MAX_PAGES = 20;

interface RawList<T> {
  items?: T[];
  metadata?: { continue?: string };
}

interface RawRole {
  metadata?: { name?: string; namespace?: string };
  rules?: unknown[];
}

interface RawClusterRole {
  metadata?: { name?: string };
  rules?: unknown[];
}

interface RawSubject {
  kind?: string;
  namespace?: string;
  name?: string;
}

interface RawRoleBinding {
  metadata?: { name?: string; namespace?: string };
  roleRef?: { kind?: string; name?: string };
  subjects?: RawSubject[];
}

interface RawClusterRoleBinding {
  metadata?: { name?: string; namespace?: string };
  roleRef?: { kind?: string; name?: string };
  subjects?: RawSubject[];
}

interface BindingRef {
  kind: "RoleBinding" | "ClusterRoleBinding";
  namespace?: string;
  name: string;
  roleRef: { kind: string; namespace?: string; name: string };
}

async function listAll<T>(connection: ClusterConnection, path: string): Promise<T[]> {
  const items: T[] = [];
  let continueToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await kubeRequest<RawList<T>>(connection.kc, path, {
      query: { limit: LIST_PAGE_SIZE, continue: continueToken },
      timeoutMs: 30_000,
    });
    items.push(...(result.items ?? []));
    continueToken = result.metadata?.continue;
    if (!continueToken) break;
  }
  return items;
}

function roleKey(kind: string, namespace: string | undefined, name: string): string {
  return `${kind}/${namespace ?? ""}/${name}`;
}

function bindingRef(raw: RawRoleBinding | RawClusterRoleBinding, clusterScoped: boolean): BindingRef {
  const namespace = clusterScoped ? undefined : raw.metadata?.namespace;
  const roleKind = raw.roleRef?.kind ?? "";
  return {
    kind: clusterScoped ? "ClusterRoleBinding" : "RoleBinding",
    namespace,
    name: raw.metadata?.name ?? "",
    roleRef: {
      kind: roleKind,
      namespace: roleKind === "Role" ? namespace : undefined,
      name: raw.roleRef?.name ?? "",
    },
  };
}

/** Every authenticated ServiceAccount is implicitly in these groups. */
function implicitGroupsForSA(namespace: string): string[] {
  return ["system:authenticated", "system:serviceaccounts", `system:serviceaccounts:${namespace}`];
}

function ruleSignature(rule: RbacPolicyRule): string {
  const part = (values?: string[]) => [...(values ?? [])].sort().join(",");
  return [
    part(rule.verbs),
    part(rule.apiGroups),
    part(rule.resources),
    part(rule.resourceNames),
    part(rule.nonResourceURLs),
  ].join("|");
}

interface RbacSnapshot {
  rulesByRole: Map<string, RbacPolicyRule[]>;
  refs: Array<{ ref: BindingRef; raw: RawRoleBinding | RawClusterRoleBinding }>;
}

/**
 * The four RBAC lists are cluster-wide and identical for every ServiceAccount
 * asked about in the same drawer session, so they are fetched at most once per
 * cluster per TTL (Radar memoizes its index the same way). Failures are not
 * cached: the next request retries.
 */
const SNAPSHOT_TTL_MS = 10_000;
const snapshots = new Map<string, { at: number; promise: Promise<RbacSnapshot> }>();

async function loadSnapshot(connection: ClusterConnection): Promise<RbacSnapshot> {
  const cached = snapshots.get(connection.id);
  if (cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) return cached.promise;

  const promise = (async (): Promise<RbacSnapshot> => {
    const [roles, clusterRoles, roleBindings, clusterRoleBindings] = await Promise.all([
      listAll<RawRole>(connection, `/apis/${RBAC_GROUP}/roles`),
      listAll<RawClusterRole>(connection, `/apis/${RBAC_GROUP}/clusterroles`),
      listAll<RawRoleBinding>(connection, `/apis/${RBAC_GROUP}/rolebindings`),
      listAll<RawClusterRoleBinding>(connection, `/apis/${RBAC_GROUP}/clusterrolebindings`),
    ]);

    const rulesByRole = new Map<string, RbacPolicyRule[]>();
    for (const role of roles) {
      if (!role.metadata?.name || !role.metadata.namespace) continue;
      rulesByRole.set(
        roleKey("Role", role.metadata.namespace, role.metadata.name),
        (role.rules ?? []) as RbacPolicyRule[],
      );
    }
    for (const clusterRole of clusterRoles) {
      if (!clusterRole.metadata?.name) continue;
      rulesByRole.set(
        roleKey("ClusterRole", undefined, clusterRole.metadata.name),
        (clusterRole.rules ?? []) as RbacPolicyRule[],
      );
    }

    const refs: Array<{ ref: BindingRef; raw: RawRoleBinding | RawClusterRoleBinding }> = [
      ...roleBindings.map((raw) => ({ ref: bindingRef(raw, false), raw })),
      ...clusterRoleBindings.map((raw) => ({ ref: bindingRef(raw, true), raw })),
    ];

    return { rulesByRole, refs };
  })();

  snapshots.set(connection.id, { at: Date.now(), promise });
  try {
    return await promise;
  } catch (error) {
    snapshots.delete(connection.id);
    throw error;
  }
}

export async function rbacSubject(
  connection: ClusterConnection,
  request: RbacSubjectRequest,
): Promise<RbacSubjectResponse> {
  const kind = request.kind ?? "ServiceAccount";
  if (kind !== "ServiceAccount") {
    throw new Error("Only ServiceAccount subjects are supported.");
  }
  const namespace = request.namespace ?? "";
  if (!namespace) throw new Error("A ServiceAccount namespace is required.");
  const name = request.name;

  const { rulesByRole, refs } = await loadSnapshot(connection);

  const matchesSubject = (raw: { subjects?: RawSubject[] }): boolean =>
    (raw.subjects ?? []).some(
      (subject) =>
        subject.kind === "ServiceAccount" &&
        (subject.namespace ?? "") === namespace &&
        (subject.name ?? "") === name,
    );

  const expand = (ref: BindingRef, inheritedFromGroup?: string): RbacBindingRules => {
    const rules = rulesByRole.get(roleKey(ref.roleRef.kind, ref.roleRef.namespace, ref.roleRef.name)) ?? [];
    const entry: RbacBindingRules = {
      binding: {
        kind: ref.kind,
        namespace: ref.namespace,
        name: ref.name,
        roleRef: ref.roleRef,
      },
      role: ref.roleRef,
      rules,
    };
    // A RoleBinding that points at a ClusterRole only grants inside its own
    // namespace, whatever the ClusterRole says in isolation.
    if (ref.kind === "RoleBinding" && ref.roleRef.kind === "ClusterRole") {
      entry.scopeNamespace = ref.namespace;
    }
    if (inheritedFromGroup) entry.inheritedFromGroup = inheritedFromGroup;
    return entry;
  };

  const direct: RbacBindingRules[] = [];
  for (const { ref, raw } of refs) {
    if (matchesSubject(raw)) direct.push(expand(ref));
  }

  const inheritedFromGroups: RbacInheritedGroup[] = [];
  for (const group of implicitGroupsForSA(namespace)) {
    const bindings: RbacBindingRules[] = [];
    for (const { ref, raw } of refs) {
      const hit = (raw.subjects ?? []).some(
        (subject) => subject.kind === "Group" && (subject.name ?? "") === group,
      );
      if (hit) bindings.push(expand(ref, group));
    }
    if (bindings.length > 0) inheritedFromGroups.push({ groupName: group, bindings });
  }

  // Flatten with a structural dedupe so semantically identical rules from
  // different bindings count once — that is what "distinct rules" means.
  const seen = new Set<string>();
  const flat: RbacPolicyRule[] = [];
  let truncated = false;
  for (const entry of [...direct, ...inheritedFromGroups.flatMap((group) => group.bindings)]) {
    for (const rule of entry.rules) {
      const signature = ruleSignature(rule);
      if (seen.has(signature)) continue;
      seen.add(signature);
      flat.push(rule);
      if (flat.length >= MAX_FLAT_RULES) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }

  return {
    subject: { kind, namespace, name },
    direct,
    inheritedFromGroups,
    flat,
    truncated,
  };
}
