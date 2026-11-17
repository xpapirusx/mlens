import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { PolicyResourceResponse } from "@shared/types";
import { api, call, errorText } from "../../lib/api";
import { DetailSection } from "./DetailSections";

/**
 * Radar's Policy section: what the cluster's policy engine (Kyverno, Gatekeeper
 * and friends, through their PolicyReport / ClusterPolicyReport CRDs) decided
 * about this one resource.
 *
 * The unhappy paths carry the weight. An empty finding list means several
 * unrelated things — nothing violated, no engine installed, the caller may not
 * read the reports, the index is still warming — and rendering them all as
 * blank space would tell an operator they are compliant in the cases where
 * nothing was checked.
 */

interface PolicyState {
  data: PolicyResourceResponse | null;
  loading: boolean;
  error: string | null;
  forbidden: boolean;
}

function usePolicyResource(
  clusterId: string,
  kind: string,
  namespace: string | undefined,
  name: string | undefined,
  enabled: boolean,
): PolicyState {
  const [state, setState] = useState<PolicyState>({ data: null, loading: false, error: null, forbidden: false });

  useEffect(() => {
    if (!enabled || !kind || !name) {
      setState({ data: null, loading: false, error: null, forbidden: false });
      return;
    }
    let disposed = false;
    const load = async () => {
      setState((current) => ({ ...current, loading: true }));
      try {
        const data = await call(api.policy.resource({ clusterId, kind, namespace, name }));
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

function resultTone(result: string): { cls: string; label: string } {
  switch (result.toLowerCase()) {
    case "fail":
      return { cls: "status-unhealthy", label: "Fail" };
    case "warn":
      return { cls: "status-degraded", label: "Warn" };
    case "error":
      return { cls: "status-alert", label: "Error" };
    case "skip":
      return { cls: "status-unknown", label: "Skipped" };
    default:
      return { cls: "status-neutral", label: result };
  }
}

const PASSING = new Set(["pass", "ok", "success"]);

export function PolicySection({
  clusterId,
  kind,
  namespace,
  name,
  enabled = true,
}: {
  clusterId: string;
  kind: string;
  namespace: string | undefined;
  name: string;
  enabled?: boolean;
}) {
  const { data, loading, error, forbidden } = usePolicyResource(clusterId, kind, namespace, name, enabled);

  if (loading) {
    return (
      <DetailSection title="Policy" icon={<ShieldQuestion />} defaultOpen={false}>
        <div className="text-xs text-theme-text-tertiary">Loading policy results…</div>
      </DetailSection>
    );
  }

  if (error) {
    return (
      <DetailSection title="Policy" icon={<ShieldQuestion />} defaultOpen={false}>
        <div className={forbidden ? "text-xs text-theme-text-tertiary" : "text-xs text-red-600 dark:text-red-400"}>
          {forbidden
            ? "You don't have permission to view policy results in this namespace."
            : `Could not load policy results: ${error}`}
        </div>
      </DetailSection>
    );
  }

  // No engine installed — the section is genuinely not applicable, so it is
  // absent rather than showing a reassuring "nothing to report".
  if (!data || data.status === "not_installed") return null;

  if (!data.evaluated) {
    return (
      <DetailSection title="Policy" icon={<ShieldQuestion />} defaultOpen={false}>
        <div className="text-xs text-theme-text-tertiary">
          {(data.status === "warmup"
            ? "Policy results are still loading from the cluster."
            : "Policy results are unavailable, so this resource has not been checked.") +
            (data.reasonCode ? ` (${data.reasonCode})` : "")}
        </div>
      </DetailSection>
    );
  }

  const counts = data.counts;
  const checked = counts.pass + counts.fail + counts.warn + counts.error + counts.skip;
  const notable = data.findings.filter((finding) => !PASSING.has(finding.result.toLowerCase()));
  const denied = data.deniedGroups ?? [];

  if (checked === 0) {
    return (
      <DetailSection title="Policy" icon={<ShieldQuestion />} defaultOpen={false}>
        <div className="text-xs text-theme-text-tertiary">No policy applies to this resource.</div>
        {denied.length > 0 ? <PartialCoverageNote denied={denied} /> : null}
      </DetailSection>
    );
  }

  return (
    <DetailSection
      title="Policy"
      icon={notable.length > 0 ? <ShieldAlert /> : <ShieldCheck />}
      defaultOpen={notable.length > 0}
    >
      {notable.length === 0 ? (
        <div className="text-sm text-theme-text-secondary">
          {/* "All" is a claim about coverage; with a family we could not read it
              would be an all-clear on a question that was never fully asked. */}
          {denied.length > 0
            ? `${counts.pass} ${counts.pass === 1 ? "check" : "checks"} passing.`
            : `All ${counts.pass} ${counts.pass === 1 ? "check" : "checks"} passing.`}
        </div>
      ) : (
        <div className="space-y-2">
          {notable.map((finding, index) => {
            const tone = resultTone(finding.result);
            return (
              <div key={`${finding.policy}/${finding.rule ?? ""}/${index}`} className="flex min-w-0 items-start gap-2">
                <span className={`badge-sm shrink-0 ${tone.cls}`}>{tone.label}</span>
                <div className="min-w-0">
                  <div className="truncate text-sm text-theme-text-primary" title={finding.policy}>
                    {finding.policy}
                    {finding.rule && finding.rule !== finding.policy ? (
                      <span className="text-theme-text-tertiary"> · {finding.rule}</span>
                    ) : null}
                  </div>
                  {finding.message ? (
                    <div className="text-xs text-theme-text-secondary">{finding.message}</div>
                  ) : null}
                  {finding.severity ? (
                    <div className="text-[10px] text-theme-text-tertiary">severity: {finding.severity}</div>
                  ) : null}
                </div>
              </div>
            );
          })}
          {counts.pass > 0 ? (
            <div className="pt-1 text-[11px] text-theme-text-tertiary">
              {counts.pass} other {counts.pass === 1 ? "check" : "checks"} passing
            </div>
          ) : null}
        </div>
      )}
      {denied.length > 0 ? <PartialCoverageNote denied={denied} /> : null}
      <div className="mt-3 text-[11px] text-theme-text-tertiary">
        Read from the cluster's PolicyReport resources.
      </div>
    </DetailSection>
  );
}

function PartialCoverageNote({ denied }: { denied: string[] }) {
  return (
    <div className="mt-2 border-t border-theme-border pt-2 text-[11px] text-theme-text-tertiary">
      {`Some policy results could not be read (${denied.join(", ")}), so this list may be incomplete.`}
    </div>
  );
}
