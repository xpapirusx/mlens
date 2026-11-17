import { useEffect, useState } from "react";
import type { RbacSubjectResponse } from "@shared/types";
import { api, call, errorText } from "../../lib/api";

export interface RbacSubjectState {
  data: RbacSubjectResponse | null;
  loading: boolean;
  error: string | null;
  /** True when the identity simply may not read RBAC bindings (403). */
  forbidden: boolean;
}

/**
 * Effective permissions of one ServiceAccount, fetched on demand when a Pod or
 * workload Overview opens. RBAC is a bonus section: a cluster that refuses the
 * read is reported as "forbidden", not as a broken feature.
 */
export function useRbacSubject(
  clusterId: string,
  namespace: string | undefined,
  name: string | undefined,
  enabled = true,
): RbacSubjectState {
  const [state, setState] = useState<RbacSubjectState>({
    data: null,
    loading: false,
    error: null,
    forbidden: false,
  });

  useEffect(() => {
    if (!enabled || !namespace || !name) {
      setState({ data: null, loading: false, error: null, forbidden: false });
      return;
    }
    let disposed = false;
    const load = async () => {
      setState((current) => ({ ...current, loading: true }));
      try {
        const data = await call(api.rbac.subject({ clusterId, kind: "ServiceAccount", namespace, name }));
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
  }, [clusterId, namespace, name, enabled]);

  return state;
}
