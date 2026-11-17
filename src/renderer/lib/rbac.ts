import type { RbacBindingRules, RbacPolicyRule, RbacSubjectResponse } from "@shared/types";
import { toneClass, type Tone } from "./status";

/**
 * Pure helpers behind the "Permissions via ServiceAccount" section — ported
 * from Radar's `rbac-blast-radius.ts`. The rule that resource-only wildcards
 * do NOT trigger is load-bearing: `view` covers every CRD via wildcards, so
 * alarm-on-resource-wildcard would fire on every authenticated ServiceAccount.
 */

const READ_VERBS = new Set(["get", "list", "watch"]);
const WRITE_VERBS = new Set(["create", "update", "patch"]);
const DELETE_VERBS = new Set(["delete", "deletecollection"]);
const ESCALATION_VERBS = new Set(["escalate", "bind", "impersonate"]);

/** Higher is scarier — orders the rule preview so dangerous rules surface first. */
export function rulePermissivenessScore(rule: RbacPolicyRule): number {
  let score = 0;
  const verbs = rule.verbs ?? [];
  const resources = rule.resources ?? [];
  const groups = rule.apiGroups ?? [];
  if (verbs.includes("*")) score += 100;
  if (resources.includes("*")) score += 100;
  if (groups.includes("*")) score += 100;
  for (const verb of verbs) {
    if (ESCALATION_VERBS.has(verb)) score += 80;
    else if (DELETE_VERBS.has(verb)) score += 40;
    else if (WRITE_VERBS.has(verb)) score += 20;
    else if (READ_VERBS.has(verb)) score += 5;
    else score += 10;
  }
  if (verbs.includes("create") && resources.includes("pods")) score += 50;
  return score;
}

export interface BlastRadiusReason {
  binding: RbacBindingRules;
  reason: string;
}

/**
 * Bindings that genuinely make a compromise a cluster takeover: cluster-admin,
 * a verb wildcard granted cluster-wide, escalation verbs, or cluster-wide
 * `create pods`. Namespace-scoped RoleBindings never trigger — a RoleBinding
 * is namespace-scoped by apiserver construction no matter how broad.
 */
export function detectBlastRadius(data: RbacSubjectResponse): BlastRadiusReason[] {
  const all = [...data.direct, ...data.inheritedFromGroups.flatMap((group) => group.bindings)];
  const reasons: BlastRadiusReason[] = [];
  for (const entry of all) {
    if (entry.role.name === "cluster-admin" && entry.role.kind === "ClusterRole") {
      reasons.push({ binding: entry, reason: "bound to cluster-admin (full god-mode access)" });
      continue;
    }
    for (const rule of entry.rules ?? []) {
      const verbs = rule.verbs ?? [];
      const resources = rule.resources ?? [];
      if (verbs.includes("*") && entry.binding.kind === "ClusterRoleBinding") {
        reasons.push({ binding: entry, reason: "grants verb wildcard (*) — every action on the listed resources" });
        break;
      }
      const escalations = verbs.filter((verb) => ESCALATION_VERBS.has(verb));
      if (escalations.length > 0) {
        reasons.push({ binding: entry, reason: `grants privilege-escalation verbs: ${escalations.join(", ")}` });
        break;
      }
      if (verbs.includes("create") && resources.includes("pods") && entry.binding.kind === "ClusterRoleBinding") {
        reasons.push({ binding: entry, reason: 'grants cluster-wide "create pods" — a lateral-movement vector' });
        break;
      }
    }
  }
  const seen = new Set<string>();
  return reasons.filter((reason) => {
    const key = `${reason.binding.binding.kind}/${reason.binding.binding.namespace ?? ""}/${reason.binding.binding.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Theme-aware chip colour for an RBAC verb. */
export function rbacVerbClass(verb: string): string {
  let tone: Tone;
  if (verb === "*" || ESCALATION_VERBS.has(verb) || DELETE_VERBS.has(verb)) tone = "error";
  else if (WRITE_VERBS.has(verb)) tone = "warning";
  else if (READ_VERBS.has(verb)) tone = "success";
  else tone = "info";
  return toneClass(tone);
}

/** Deduplicated rule count shown in the one-line summary. */
export function distinctRuleCount(data: RbacSubjectResponse): number {
  return data.flat?.length ?? 0;
}

export function inheritedBindingCount(data: RbacSubjectResponse): number {
  return (data.inheritedFromGroups ?? []).reduce((total, group) => total + group.bindings.length, 0);
}
