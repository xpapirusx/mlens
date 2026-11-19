import { useEffect, useMemo, useState } from "react";
import { Box, Loader2 } from "lucide-react";
import type { KubeObject } from "@shared/types";
import { api, call, errorText } from "../../lib/api";
import { Modal } from "../../design-system/components/Modal";
import { Button } from "../../design-system/components/Button";
import { toast } from "../../design-system/components/Toast";

interface ContainerSpec {
  name: string;
  image?: string;
  [key: string]: unknown;
}

function templateSpec(object: KubeObject): { spec?: Record<string, unknown>; path: string } {
  if (object.kind === "CronJob") {
    const jobTemplate = (object.spec?.jobTemplate as Record<string, unknown> | undefined) ?? {};
    const jobSpec = (jobTemplate.spec as Record<string, unknown> | undefined) ?? {};
    const template = (jobSpec.template as Record<string, unknown> | undefined) ?? {};
    return { spec: template.spec as Record<string, unknown> | undefined, path: "spec.jobTemplate.spec.template" };
  }
  const template = (object.spec?.template as Record<string, unknown> | undefined) ?? {};
  return { spec: template.spec as Record<string, unknown> | undefined, path: "spec.template" };
}

export function SetImageDialog({
  open,
  onClose,
  clusterId,
  object,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  clusterId: string;
  object: KubeObject | null;
  onSaved?: () => void;
}) {
  const { spec, path } = useMemo(
    () => templateSpec(object ?? ({ kind: "", metadata: {} } as KubeObject)),
    [object],
  );
  const containers = (spec?.containers ?? []) as ContainerSpec[];
  const initContainers = (spec?.initContainers ?? []) as ContainerSpec[];

  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const container of [...containers, ...initContainers]) {
      next[container.name] = container.image ?? "";
    }
    setValues(next);
    // Containers/initContainers are derived from the currently opened object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, object?.metadata?.uid]);

  const changed = useMemo(
    () =>
      [...containers, ...initContainers].some(
        (container) => (values[container.name] ?? "") !== (container.image ?? ""),
      ),
    [values, containers, initContainers],
  );

  const apply = async () => {
    if (!object) return;
    setBusy(true);
    try {
      const update = (list: ContainerSpec[]) =>
        list.map((container) => ({ ...container, image: values[container.name] ?? container.image }));
      const payload =
        object.kind === "CronJob"
          ? {
              spec: {
                jobTemplate: {
                  spec: {
                    template: {
                      spec: {
                        containers: update(containers),
                        ...(initContainers.length ? { initContainers: update(initContainers) } : {}),
                      },
                    },
                  },
                },
              },
            }
          : {
              spec: {
                template: {
                  spec: {
                    containers: update(containers),
                    ...(initContainers.length ? { initContainers: update(initContainers) } : {}),
                  },
                },
              },
            };
      await call(
        api.resources.patch({
          clusterId,
          apiVersion: object.apiVersion,
          kind: object.kind,
          namespace: object.metadata?.namespace,
          name: object.metadata?.name,
          patch: payload,
        }),
      );
      toast.success("Image updated", `${object.kind}/${object.metadata?.name}`);
      onSaved?.();
      onClose();
    } catch (error) {
      toast.error("Set image failed", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={640}
      title="Set container images"
      subtitle={object ? `${object.kind}/${object.metadata?.name} · ${path}` : ""}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void apply()} disabled={busy || !changed}>
            {busy ? "Applying…" : "Apply images"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {[...containers, ...initContainers].length === 0 ? (
          <div className="text-[calc(12px*var(--font-scale))] text-theme-text-tertiary">This resource has no container template.</div>
        ) : null}
        {[
          { title: "Containers", list: containers },
          { title: "Init containers", list: initContainers },
        ].map((group) =>
          group.list.length === 0 ? null : (
            <div key={group.title}>
              <div className="mb-1 flex items-center gap-1.5 text-[calc(10px*var(--font-scale))] font-semibold uppercase tracking-wide text-theme-text-tertiary">
                <Box className="h-3 w-3" />
                {group.title}
                <span className="font-mono text-theme-text-disabled">{group.list.length}</span>
              </div>
              <div className="space-y-2">
                {group.list.map((container) => (
                  <label key={container.name} className="block">
                    <span className="mb-0.5 block font-mono text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
                      {container.name}
                    </span>
                    <input
                      value={values[container.name] ?? ""}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [container.name]: event.target.value }))
                      }
                      spellCheck={false}
                      className="h-8 w-full rounded-md border border-theme-border bg-theme-base px-2 font-mono text-[calc(11px*var(--font-scale))] text-theme-text-primary outline-none focus:border-skyhook-500"
                    />
                  </label>
                ))}
              </div>
            </div>
          ),
        )}
        {busy ? (
          <div className="flex items-center gap-1.5 text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
            <Loader2 className="h-3 w-3 animate-spin" /> Patching pod template…
          </div>
        ) : null}
        <div className="text-[calc(10px*var(--font-scale))] text-theme-text-disabled">
          Patches the full container list of the pod template, so other fields stay intact. A rollout is triggered by
          the workload controller.
        </div>
      </div>
    </Modal>
  );
}
