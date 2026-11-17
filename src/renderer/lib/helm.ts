import type { HelmReleaseDetail, HelmReleaseSummary, KubeObject } from "@shared/types";

/**
 * Helm releases are not API resources — they are parsed out of the
 * `owner=helm` secrets. Shaping them as ordinary rows lets the whole table
 * stack (search, sort, column filters, columns, selection) work unchanged.
 */
export function helmRow(release: HelmReleaseSummary): KubeObject {
  return {
    apiVersion: "helm.sh/v1",
    kind: "HelmRelease",
    metadata: {
      name: release.name,
      namespace: release.namespace,
      uid: `${release.namespace}/${release.name}`,
      creationTimestamp: release.deployedAt,
      labels: { "helm.sh/chart": release.chart },
    },
    spec: {
      revision: release.revision,
      chart: release.chart,
      chartName: release.chartName,
      chartVersion: release.chartVersion,
      appVersion: release.appVersion ?? "",
    },
    status: {
      phase: release.status,
      description: release.description ?? "",
      deployedAt: release.deployedAt ?? "",
      secretName: release.secretName,
    },
  } as KubeObject;
}

/** Detail row: the summary plus the two large text payloads for the drawer. */
export function helmDetailRow(detail: HelmReleaseDetail): KubeObject {
  return {
    ...helmRow(detail),
    values: detail.values,
    manifest: detail.manifest,
    ...(detail.truncated ? { truncated: true } : {}),
  } as KubeObject;
}
