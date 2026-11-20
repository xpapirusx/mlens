/**
 * NetworkPolicy presentation helpers: the effective policy types (Kubernetes
 * defaults Ingress when `policyTypes` is omitted) and the port/selector
 * formatting shared by the details sections and the flow diagram.
 */

export interface EffectivePolicyTypes {
  ingress: boolean;
  egress: boolean;
  /** False when spec.policyTypes was omitted and Kubernetes' defaulting decides. */
  explicit: boolean;
}

export function effectivePolicyTypes(spec: any): EffectivePolicyTypes {
  const declared: unknown = spec?.policyTypes;
  if (Array.isArray(declared) && declared.length > 0) {
    return { ingress: declared.includes("Ingress"), egress: declared.includes("Egress"), explicit: true };
  }
  const egressRules: unknown = spec?.egress;
  return { ingress: true, egress: Array.isArray(egressRules) && egressRules.length > 0, explicit: false };
}

export function effectivePolicyTypeNames(spec: any): string[] {
  const types = effectivePolicyTypes(spec);
  const names: string[] = [];
  if (types.ingress) names.push("Ingress");
  if (types.egress) names.push("Egress");
  return names;
}

/** `PROTO/port`, `PROTO/start-end`, or `PROTO/*` for a protocol with no port. */
export function formatNetworkPolicyPort(port: any): string {
  const protocol = port?.protocol || "TCP";
  const start = port?.port ?? "*";
  const end = port?.endPort;
  const isRange = end != null && typeof start === "number";
  return isRange ? `${protocol}/${start}-${end}` : `${protocol}/${start}`;
}

/** A LabelSelector (`matchLabels` + `matchExpressions`); empty means "all". */
export function formatLabelSelector(selector: any): string {
  if (!selector || typeof selector !== "object") return "all";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(selector.matchLabels ?? {})) {
    parts.push(`${key}=${String(value)}`);
  }
  const expressions = Array.isArray(selector.matchExpressions) ? selector.matchExpressions : [];
  for (const expression of expressions) {
    if (!expression || typeof expression !== "object") continue;
    const values = Array.isArray(expression.values) ? expression.values.map(String).join(",") : "";
    parts.push(values ? `${expression.key} ${expression.operator} (${values})` : `${expression.key} ${expression.operator}`);
  }
  return parts.length > 0 ? parts.join(", ") : "all";
}

export function hasLabelSelector(selector: any): boolean {
  return Boolean(selector) && Object.keys(selector.matchLabels ?? {}).length + (selector.matchExpressions ?? []).length > 0;
}
