import type { PolicyResourceRequest, PolicyResourceResponse, PolicyResourceFinding } from "@shared/types";
import { buildApiPath, KubeApiError, kubeRequest } from "./http";
import type { ClusterConnection } from "./session";

/**
 * Per-resource policy results — the TypeScript counterpart of Radar's
 * `/api/policy/resource/...`. mLens reads the policy-report families the
 * cluster actually serves (wgpolicyk8s.io and the newer reports.k8s.io, both
 * `PolicyReport` and `ClusterPolicyReport`) through discovery, so a cluster
 * without a policy engine simply reports `not_installed` instead of showing a
 * reassuring empty section.
 */

const REPORT_KINDS = new Set(["PolicyReport", "ClusterPolicyReport"]);
/** A heavily-policed pod can carry hundreds of outcomes; the UI only previews. */
const MAX_FINDINGS = 100;
const LIST_LIMIT = 500;

interface RawSubject {
  apiVersion?: string;
  kind?: string;
  namespace?: string;
  name?: string;
}

interface RawResult {
  policy?: string;
  rule?: string;
  result?: string;
  severity?: string;
  category?: string;
  message?: string;
  source?: string;
  subject?: RawSubject;
}

interface RawReport {
  metadata?: { name?: string; namespace?: string };
  results?: RawResult[];
}

interface RawList<T> {
  items?: T[];
  metadata?: { continue?: string };
}

function matchesSubject(subject: RawSubject | undefined, request: PolicyResourceRequest): boolean {
  if (!subject?.name || !subject.kind) return false;
  if (subject.kind.toLowerCase() !== request.kind.toLowerCase()) return false;
  if (subject.name !== request.name) return false;
  // Cluster-scoped subjects carry no namespace; namespaced ones must agree.
  if (subject.namespace && request.namespace && subject.namespace !== request.namespace) return false;
  return true;
}

function toFinding(result: RawResult): PolicyResourceFinding {
  const finding: PolicyResourceFinding = {
    policy: result.policy ?? result.rule ?? "policy",
    result: result.result ?? "unknown",
  };
  if (result.rule && result.rule !== finding.policy) finding.rule = result.rule;
  if (result.severity) finding.severity = result.severity;
  if (result.category) finding.category = result.category;
  if (result.message) finding.message = result.message;
  if (result.source) finding.engine = result.source;
  return finding;
}

function isForbidden(error: unknown): boolean {
  return error instanceof KubeApiError && error.statusCode === 403;
}

export async function policyResource(
  connection: ClusterConnection,
  request: PolicyResourceRequest,
): Promise<PolicyResourceResponse> {
  const emptyCounts = { pass: 0, fail: 0, warn: 0, error: 0, skip: 0 };

  const discovery = await connection.discovery.get();
  const reports = discovery.filter((entry) => REPORT_KINDS.has(entry.kind));
  if (reports.length === 0) {
    return { evaluated: false, status: "not_installed", liveUpdates: true, counts: emptyCounts, findings: [] };
  }

  const findings: PolicyResourceFinding[] = [];
  const deniedGroups: string[] = [];
  const counts = { ...emptyCounts };
  let matched = 0;
  let listError: unknown = null;

  for (const report of reports) {
    const apiPath = buildApiPath(report.apiVersion, report.plural, report.namespaced ? request.namespace : undefined);
    try {
      const list = await kubeRequest<RawList<RawReport>>(connection.kc, apiPath, {
        query: { limit: LIST_LIMIT },
        timeoutMs: 20_000,
      });
      for (const item of list.items ?? []) {
        for (const result of item.results ?? []) {
          if (!matchesSubject(result.subject, request)) continue;
          matched += 1;
          const value = (result.result ?? "unknown").toLowerCase();
          if (value in counts) counts[value as keyof typeof counts] += 1;
          if (findings.length < MAX_FINDINGS) findings.push(toFinding(result));
        }
      }
    } catch (error) {
      // A denied family is an expected state on a namespace-scoped account;
      // every family denied means the caller simply may not read reports.
      if (isForbidden(error)) {
        deniedGroups.push(`${report.apiVersion}/${report.kind}`);
        continue;
      }
      listError = error;
    }
  }

  if (deniedGroups.length === reports.length) {
    return {
      evaluated: false,
      status: "deferred",
      reasonCode: "rbac_denied",
      liveUpdates: true,
      counts: emptyCounts,
      findings: [],
    };
  }

  // Nothing readable at all and a real fault: let the section show the error
  // rather than claim the resource was never checked.
  if (listError && matched === 0 && deniedGroups.length === 0) throw listError;

  return {
    evaluated: true,
    status: "ready",
    liveUpdates: true,
    counts,
    findings,
    ...(deniedGroups.length > 0 ? { deniedGroups } : {}),
  };
}
