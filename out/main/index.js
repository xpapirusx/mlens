import electron from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import { Exec, KubeConfig, Log, RequestContext, Watch, dumpYaml, loadAllYaml } from "@kubernetes/client-node";
import http from "node:http";
import https from "node:https";
import { PassThrough, Writable } from "node:stream";
import { TextDecoder as TextDecoder$1 } from "node:util";
import { spawn } from "node-pty";
// src/shared/ipc.ts
/** Every IPC channel used by mLens, in one place. */
var IPC = {
	appInfo: "app:info",
	appOpenExternal: "app:open-external",
	appMinimize: "app:window-minimize",
	appMaximize: "app:window-maximize",
	appClose: "app:window-close",
	appIsMaximized: "app:window-is-maximized",
	appWindowState: "app:window-state",
	kubeconfigList: "kube:config-list",
	kubeconfigAddDialog: "kube:config-add-dialog",
	kubeconfigAddPath: "kube:config-add-path",
	kubeconfigAddContent: "kube:config-add-content",
	kubeconfigRemove: "kube:config-remove",
	clusterConnect: "kube:cluster-connect",
	clusterDisconnect: "kube:cluster-disconnect",
	clusterHealth: "kube:cluster-health",
	clusterNamespaces: "kube:cluster-namespaces",
	resourcesDiscover: "kube:resources-discover",
	resourcesList: "kube:resources-list",
	resourcesGet: "kube:resources-get",
	resourcesWatch: "kube:resources-watch",
	resourcesUnwatch: "kube:resources-unwatch",
	resourcesCounts: "kube:resources-counts",
	resourcesDelete: "kube:resources-delete",
	resourcesApply: "kube:resources-apply",
	resourcesScale: "kube:resources-scale",
	resourcesRestart: "kube:resources-restart",
	resourcesWatchEvent: "kube:resources-watch-event",
	podContainers: "kube:pod-containers",
	logsStart: "kube:logs-start",
	logsStop: "kube:logs-stop",
	logsChunk: "kube:logs-chunk",
	logsEnd: "kube:logs-end",
	execStart: "kube:exec-start",
	execInput: "kube:exec-input",
	execResize: "kube:exec-resize",
	execClose: "kube:exec-close",
	execData: "kube:exec-data",
	execExit: "kube:exec-exit",
	terminalCreate: "terminal:create",
	terminalInput: "terminal:input",
	terminalResize: "terminal:resize",
	terminalClose: "terminal:close",
	terminalData: "terminal:data",
	terminalExit: "terminal:exit",
	settingsGet: "settings:get",
	settingsUpdate: "settings:update",
	settingsChanged: "settings:changed"
};
// src/main/settings/store.ts
var { app: app$2 } = electron;
var DEFAULT_KUBECONFIG = path.join(os.homedir(), ".kube", "config");
function envKubeconfigPaths() {
	const raw = process.env.KUBECONFIG;
	if (!raw) return [];
	return raw.split(path.delimiter).map((entry) => entry.trim()).filter(Boolean);
}
function defaultSettings() {
	const candidates = [DEFAULT_KUBECONFIG, ...envKubeconfigPaths()];
	return {
		theme: "dark",
		kubeconfigPaths: [...new Set(candidates)].filter((candidate) => {
			try {
				return fs.statSync(candidate).isFile();
			} catch {
				return false;
			}
		}),
		favorites: [],
		recentClusters: [],
		refreshIntervalSeconds: 30,
		terminalFontSize: 13,
		terminalFontFamily: "DM Mono",
		confirmBeforeDelete: true,
		showSystemNamespaces: false,
		sidebarWidth: 236,
		dockHeight: 340
	};
}
function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}
function sanitize(input) {
	const out = { ...input };
	if (out.theme && ![
		"light",
		"dark",
		"system"
	].includes(out.theme)) delete out.theme;
	if (out.kubeconfigPaths) out.kubeconfigPaths = [...new Set(out.kubeconfigPaths.filter((entry) => typeof entry === "string"))];
	if (out.favorites) out.favorites = [...new Set(out.favorites)];
	if (out.recentClusters) out.recentClusters = out.recentClusters.filter((entry) => entry && typeof entry.id === "string" && typeof entry.openedAt === "number").slice(0, 20);
	if (typeof out.refreshIntervalSeconds === "number") out.refreshIntervalSeconds = clamp(Math.round(out.refreshIntervalSeconds), 0, 300);
	if (typeof out.terminalFontSize === "number") out.terminalFontSize = clamp(Math.round(out.terminalFontSize), 9, 22);
	if (typeof out.sidebarWidth === "number") out.sidebarWidth = clamp(Math.round(out.sidebarWidth), 170, 420);
	if (typeof out.dockHeight === "number") out.dockHeight = clamp(Math.round(out.dockHeight), 160, 900);
	return out;
}
var SettingsStore = class {
	file;
	state;
	listeners = /* @__PURE__ */ new Set();
	constructor() {
		this.file = path.join(app$2.getPath("userData"), "settings.json");
		this.state = this.load();
	}
	load() {
		const defaults = defaultSettings();
		try {
			const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
			return {
				...defaults,
				...sanitize(raw)
			};
		} catch {
			return defaults;
		}
	}
	persist() {
		try {
			fs.mkdirSync(path.dirname(this.file), { recursive: true });
			fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2), { mode: 384 });
		} catch (error) {
			console.error("[settings] failed to persist", error);
		}
	}
	get() {
		return {
			...this.state,
			favorites: [...this.state.favorites],
			recentClusters: [...this.state.recentClusters]
		};
	}
	update(patch) {
		this.state = {
			...this.state,
			...sanitize(patch)
		};
		this.persist();
		const next = this.get();
		for (const listener of this.listeners) listener(next);
		return next;
	}
	onChange(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	addRecentCluster(id) {
		const recent = this.state.recentClusters.filter((entry) => entry.id !== id);
		recent.unshift({
			id,
			openedAt: Date.now()
		});
		this.update({ recentClusters: recent.slice(0, 12) });
	}
};
// src/main/kubernetes/kubeconfig.ts
var ID_SEPARATOR = "::";
function makeClusterId(kubeconfigPath, contextName) {
	return `${kubeconfigPath}${ID_SEPARATOR}${contextName}`;
}
function splitClusterId(id) {
	const index = id.lastIndexOf(ID_SEPARATOR);
	if (index <= 0) throw new Error(`Invalid cluster id: ${id}`);
	return {
		kubeconfigPath: id.slice(0, index),
		contextName: id.slice(index + 2)
	};
}
var KubeconfigManager = class {
	settings;
	constructor(settings) {
		this.settings = settings;
	}
	homeConfig = path.join(process.env.HOME ?? "", ".kube", "config");
	paths() {
		return this.settings.get().kubeconfigPaths;
	}
	listSources() {
		return this.paths().map((kubeconfigPath) => {
			let exists = false;
			try {
				exists = fs.statSync(kubeconfigPath).isFile();
			} catch {
				exists = false;
			}
			if (!exists) return {
				path: kubeconfigPath,
				exists,
				contextCount: 0,
				isDefault: kubeconfigPath === this.homeConfig
			};
			try {
				const kc = new KubeConfig();
				kc.loadFromFile(kubeconfigPath);
				return {
					path: kubeconfigPath,
					exists,
					contextCount: kc.getContexts().length,
					isDefault: kubeconfigPath === this.homeConfig
				};
			} catch (error) {
				return {
					path: kubeconfigPath,
					exists,
					contextCount: 0,
					isDefault: kubeconfigPath === this.homeConfig,
					error: error instanceof Error ? error.message : String(error)
				};
			}
		});
	}
	listClusters() {
		const clusters = [];
		for (const kubeconfigPath of this.paths()) {
			let kc;
			try {
				kc = new KubeConfig();
				kc.loadFromFile(kubeconfigPath);
			} catch (error) {
				clusters.push({
					id: makeClusterId(kubeconfigPath, "<unreadable>"),
					name: path.basename(kubeconfigPath),
					context: "<unreadable>",
					kubeconfigPath,
					server: "",
					user: "",
					defaultNamespace: "default",
					isCurrentContext: false,
					error: error instanceof Error ? error.message : String(error)
				});
				continue;
			}
			const current = kc.getCurrentContext();
			for (const context of kc.getContexts()) {
				const cluster = kc.getCluster(context.cluster);
				clusters.push({
					id: makeClusterId(kubeconfigPath, context.name),
					name: context.name,
					context: context.name,
					kubeconfigPath,
					server: cluster?.server ?? "",
					user: context.user ?? "",
					defaultNamespace: context.namespace ?? "default",
					isCurrentContext: context.name === current
				});
			}
		}
		return clusters.sort((a, b) => {
			if (a.isCurrentContext !== b.isCurrentContext) return a.isCurrentContext ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
	}
	resolve(id) {
		const { kubeconfigPath, contextName } = splitClusterId(id);
		if (!this.paths().includes(kubeconfigPath)) throw new Error("This kubeconfig is no longer part of the mLens catalog.");
		if (!fs.existsSync(kubeconfigPath)) throw new Error(`Kubeconfig not found: ${kubeconfigPath}`);
		const kubeConfig = new KubeConfig();
		kubeConfig.loadFromFile(kubeconfigPath);
		if (!kubeConfig.getContextObject(contextName)) throw new Error(`Context "${contextName}" was not found in ${kubeconfigPath}`);
		kubeConfig.setCurrentContext(contextName);
		return {
			id,
			kubeconfigPath,
			contextName,
			kubeConfig
		};
	}
	addContent(content, directory, fileName) {
		if (!content.trim()) throw new Error("Kubeconfig content is empty.");
		const probe = new KubeConfig();
		probe.loadFromString(content, { onInvalidEntry: "throw" });
		if (probe.getContexts().length === 0) throw new Error("The pasted kubeconfig does not define any contexts.");
		fs.mkdirSync(directory, { recursive: true });
		const safeName = (fileName ?? "imported").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "imported";
		const target = path.join(directory, `${safeName}-${Date.now()}.yaml`);
		fs.writeFileSync(target, content, { mode: 384 });
		return this.addPath(target);
	}
	addPath(kubeconfigPath) {
		const resolved = path.resolve(kubeconfigPath.replace(/^~(?=$|\/|\\)/, process.env.HOME ?? "~"));
		if (!fs.existsSync(resolved)) throw new Error(`File not found: ${resolved}`);
		const probe = new KubeConfig();
		probe.loadFromFile(resolved);
		const paths = this.paths();
		if (!paths.includes(resolved)) this.settings.update({ kubeconfigPaths: [...paths, resolved] });
		return this.listSources().find((source) => source.path === resolved) ?? {
			path: resolved,
			exists: true,
			contextCount: probe.getContexts().length,
			isDefault: resolved === this.homeConfig
		};
	}
	removePath(kubeconfigPath) {
		const paths = this.paths().filter((entry) => entry !== kubeconfigPath);
		this.settings.update({ kubeconfigPaths: paths });
	}
};
// src/main/kubernetes/http.ts
var KubeApiError = class extends Error {
	statusCode;
	reason;
	constructor(message, statusCode, reason) {
		super(message);
		this.statusCode = statusCode;
		this.reason = reason;
		this.name = "KubeApiError";
	}
};
function buildApiPath(apiVersion, plural, namespace) {
	return `${apiVersion.includes("/") ? `/apis/${apiVersion}` : `/api/${apiVersion}`}${namespace ? `/namespaces/${encodeURIComponent(namespace)}` : ""}/${plural}`;
}
async function kubeRequest(kc, apiPath, options = {}) {
	const cluster = kc.getCurrentCluster();
	if (!cluster) throw new KubeApiError("No cluster is selected in this kubeconfig.");
	let url;
	try {
		url = new URL(`${cluster.server.replace(/\/$/, "")}${apiPath}`);
	} catch {
		throw new KubeApiError(`Invalid Kubernetes API server URL: ${cluster.server}`);
	}
	for (const [key, value] of Object.entries(options.query ?? {})) if (value !== void 0 && value !== "") url.searchParams.set(key, String(value));
	const requestOptions = {
		method: options.method ?? "GET",
		headers: {
			Accept: "application/json, */*",
			...options.body !== void 0 || options.rawBody !== void 0 ? { "Content-Type": "application/json" } : {},
			...options.headers
		},
		timeout: options.timeoutMs ?? 3e4
	};
	const method = options.method ?? "GET";
	const context = new RequestContext(url.toString(), method);
	await kc.applySecurityAuthentication(context);
	for (const [key, value] of Object.entries(context.getHeaders())) requestOptions.headers[key] = value;
	const agent = context.getAgent();
	if (agent) requestOptions.agent = agent;
	const body = options.rawBody !== void 0 ? options.rawBody : options.body !== void 0 ? JSON.stringify(options.body) : void 0;
	if (body !== void 0) requestOptions.headers = {
		...requestOptions.headers,
		"Content-Length": Buffer.byteLength(body)
	};
	const transport = url.protocol === "https:" ? https : http;
	return await new Promise((resolve, reject) => {
		const request = transport.request(url, requestOptions, (response) => {
			const chunks = [];
			response.on("data", (chunk) => chunks.push(chunk));
			response.on("error", reject);
			response.on("end", () => {
				const text = Buffer.concat(chunks).toString("utf8");
				const status = response.statusCode ?? 0;
				if (status >= 200 && status < 300) {
					if (!text) {
						resolve(void 0);
						return;
					}
					try {
						resolve(JSON.parse(text));
					} catch {
						resolve(text);
					}
					return;
				}
				let message = text;
				let reason;
				try {
					const parsed = JSON.parse(text);
					message = parsed.message ?? text;
					reason = parsed.reason;
				} catch {}
				if (status === 401) message = `Authentication failed: ${message}`;
				else if (status === 403) message = `Access denied by RBAC: ${message}`;
				else if (status === 404) message = `Not found: ${message}`;
				reject(new KubeApiError(message || `Kubernetes API responded with ${status}`, status, reason));
			});
		});
		request.on("timeout", () => {
			request.destroy(new KubeApiError("Kubernetes API request timed out."));
		});
		request.on("error", (error) => {
			reject(error instanceof KubeApiError ? error : new KubeApiError(`Cannot reach the Kubernetes API: ${error.message}. Check the server address, VPN and certificates.`));
		});
		if (body !== void 0) request.write(body);
		request.end();
	});
}
function errorMessage(error) {
	if (error instanceof KubeApiError) return error.message;
	if (error instanceof Error) return error.message;
	return String(error);
}
// src/main/kubernetes/discovery.ts
var BUILTIN_GROUPS = /* @__PURE__ */ new Set([
	"",
	"apps",
	"batch",
	"autoscaling",
	"policy",
	"networking.k8s.io",
	"rbac.authorization.k8s.io",
	"storage.k8s.io",
	"apiextensions.k8s.io",
	"apiregistration.k8s.io",
	"coordination.k8s.io",
	"discovery.k8s.io",
	"events.k8s.io",
	"flowcontrol.apiserver.k8s.io",
	"node.k8s.io",
	"scheduling.k8s.io",
	"certificates.k8s.io",
	"admissionregistration.k8s.io",
	"authentication.k8s.io",
	"authorization.k8s.io",
	"resource.k8s.io",
	"internal.apiserver.k8s.io",
	"storagemigration.k8s.io",
	"metrics.k8s.io",
	"custom.metrics.k8s.io",
	"external.metrics.k8s.io"
]);
var WORKLOAD_KINDS = /* @__PURE__ */ new Set([
	"Pod",
	"Deployment",
	"StatefulSet",
	"DaemonSet",
	"ReplicaSet",
	"ReplicationController",
	"Job",
	"CronJob"
]);
var NETWORK_KINDS = /* @__PURE__ */ new Set([
	"Service",
	"Ingress",
	"IngressClass",
	"NetworkPolicy",
	"Endpoints",
	"EndpointSlice",
	"Gateway",
	"HTTPRoute",
	"GRPCRoute",
	"TCPRoute",
	"UDPRoute",
	"TLSRoute"
]);
var CONFIG_KINDS = /* @__PURE__ */ new Set([
	"ConfigMap",
	"Secret",
	"LimitRange",
	"ResourceQuota",
	"PodTemplate"
]);
var STORAGE_KINDS = /* @__PURE__ */ new Set([
	"PersistentVolume",
	"PersistentVolumeClaim",
	"StorageClass",
	"CSIDriver",
	"CSINode",
	"VolumeAttachment"
]);
var ACCESS_KINDS = /* @__PURE__ */ new Set([
	"ServiceAccount",
	"Role",
	"RoleBinding",
	"ClusterRole",
	"ClusterRoleBinding"
]);
var CLUSTER_KINDS = /* @__PURE__ */ new Set([
	"Node",
	"Namespace",
	"Event",
	"ComponentStatus",
	"CustomResourceDefinition",
	"APIService",
	"Lease",
	"RuntimeClass",
	"PriorityClass",
	"MutatingWebhookConfiguration",
	"ValidatingWebhookConfiguration"
]);
var SCALING_KINDS = /* @__PURE__ */ new Set([
	"HorizontalPodAutoscaler",
	"PodDisruptionBudget",
	"VerticalPodAutoscaler"
]);
function categorize(kind, isCrd, group) {
	if (isCrd) return `custom:${group || "core"}`;
	if (WORKLOAD_KINDS.has(kind)) return "workloads";
	if (NETWORK_KINDS.has(kind)) return "networking";
	if (CONFIG_KINDS.has(kind)) return "config";
	if (STORAGE_KINDS.has(kind)) return "storage";
	if (ACCESS_KINDS.has(kind)) return "access-control";
	if (CLUSTER_KINDS.has(kind)) return "cluster";
	if (SCALING_KINDS.has(kind)) return "scaling";
	return "other";
}
var DiscoveryService = class {
	kc;
	ttlMs;
	cache = null;
	cachedAt = 0;
	inflight = null;
	constructor(kc, ttlMs = 3e5) {
		this.kc = kc;
		this.ttlMs = ttlMs;
	}
	async get(force = false) {
		if (!force && this.cache && Date.now() - this.cachedAt < this.ttlMs) return this.cache;
		if (this.inflight) return this.inflight;
		this.inflight = this.discover().then((resources) => {
			this.cache = resources;
			this.cachedAt = Date.now();
			return resources;
		}).finally(() => {
			this.inflight = null;
		});
		return this.inflight;
	}
	invalidate() {
		this.cache = null;
		this.cachedAt = 0;
	}
	async discover() {
		const resources = [];
		const seen = /* @__PURE__ */ new Set();
		const [core, groups, crds] = await Promise.all([
			kubeRequest(this.kc, "/api/v1"),
			kubeRequest(this.kc, "/apis").catch((error) => {
				console.warn("[discovery] /apis failed", error);
				return { groups: [] };
			}),
			kubeRequest(this.kc, "/apis/apiextensions.k8s.io/v1/customresourcedefinitions").catch(() => ({ items: [] }))
		]);
		const crdIndex = /* @__PURE__ */ new Map();
		for (const crd of crds.items ?? []) crdIndex.set(`${crd.spec.group}/${crd.spec.names.plural}`, crd);
		const add = (groupVersion, entry) => {
			if (entry.name.includes("/")) return;
			if (!entry.verbs?.includes("list")) return;
			if (entry.kind.endsWith("List")) return;
			const group = groupVersion.includes("/") ? groupVersion.split("/")[0] : "";
			const version = groupVersion.includes("/") ? groupVersion.split("/")[1] : groupVersion;
			const key = `${group}/${entry.kind}`;
			if (seen.has(key)) return;
			seen.add(key);
			const crd = crdIndex.get(`${group}/${entry.name}`);
			const isCrd = crd !== void 0 || !BUILTIN_GROUPS.has(group);
			const printerColumns = ((crd?.spec.versions.find((candidate) => candidate.name === version))?.additionalPrinterColumns ?? []).filter((column) => (column.priority ?? 0) === 0 || Boolean(column.jsonPath)).map((column) => ({
				name: column.name,
				type: column.type,
				jsonPath: column.jsonPath,
				description: column.description,
				priority: column.priority,
				format: column.format
			}));
			resources.push({
				group,
				version,
				apiVersion: groupVersion,
				kind: entry.kind,
				plural: entry.name,
				singular: entry.singularName || entry.kind.toLowerCase(),
				namespaced: entry.namespaced,
				verbs: entry.verbs,
				shortNames: entry.shortNames ?? crd?.spec.names.shortNames ?? [],
				categories: entry.categories ?? [],
				isCrd,
				crdName: crd?.metadata.name,
				printerColumns,
				iconKey: entry.kind.toLowerCase(),
				catalogGroup: categorize(entry.kind, isCrd, group)
			});
		};
		for (const entry of core.resources ?? []) add(core.groupVersion || "v1", entry);
		const groupResults = await Promise.allSettled((groups.groups ?? []).map(async (group) => {
			const preferred = group.preferredVersion ?? group.versions?.[0];
			if (!preferred) return null;
			return await kubeRequest(this.kc, `/apis/${preferred.groupVersion}`);
		}));
		for (const result of groupResults) {
			if (result.status !== "fulfilled" || !result.value) continue;
			const list = result.value;
			for (const entry of list.resources ?? []) add(list.groupVersion, entry);
		}
		return resources.sort((a, b) => {
			if (a.catalogGroup !== b.catalogGroup) return a.catalogGroup.localeCompare(b.catalogGroup);
			return a.kind.localeCompare(b.kind);
		});
	}
};
// src/main/kubernetes/session.ts
var ResourceCatalog = class {
	discovery;
	byKind = /* @__PURE__ */ new Map();
	constructor(discovery) {
		this.discovery = discovery;
	}
	async refresh(force = false) {
		const resources = await this.discovery.get(force);
		this.byKind.clear();
		for (const resource of resources) {
			this.byKind.set(`${resource.apiVersion}|${resource.kind}`, resource);
			this.byKind.set(`${resource.apiVersion}|${resource.kind.toLowerCase()}`, resource);
		}
		return resources;
	}
	async get(apiVersion, kind) {
		if (this.byKind.size === 0) await this.refresh();
		const found = this.byKind.get(`${apiVersion}|${kind}`) ?? this.byKind.get(`${apiVersion}|${kind.toLowerCase()}`);
		if (!found) {
			await this.refresh(true);
			const retried = this.byKind.get(`${apiVersion}|${kind}`) ?? this.byKind.get(`${apiVersion}|${kind.toLowerCase()}`);
			if (retried) return retried;
			throw new Error(`Resource ${apiVersion}/${kind} is not served by this cluster.`);
		}
		return found;
	}
};
var ClusterConnection = class {
	id;
	kc;
	discovery;
	catalog;
	version = "unknown";
	gitVersion = "";
	latencyMs = 0;
	constructor(id, kc) {
		this.id = id;
		this.kc = kc;
		this.discovery = new DiscoveryService(kc);
		this.catalog = new ResourceCatalog(this.discovery);
	}
};
// src/main/kubernetes/resource-watcher.ts
var ResourceWatcher = class {
	getConnection;
	subscriptions = /* @__PURE__ */ new Map();
	constructor(getConnection) {
		this.getConnection = getConnection;
	}
	async start(request, emit) {
		this.stop(request.subscriptionId);
		const connection = this.getConnection(request.clusterId);
		const info = await connection.catalog.get(request.apiVersion, request.kind);
		const path = buildApiPath(info.apiVersion, info.plural, info.namespaced ? request.namespace : void 0);
		const state = {
			closed: false,
			resourceVersion: request.resourceVersion
		};
		const stop = () => {
			state.closed = true;
			state.abort?.abort();
			this.subscriptions.delete(request.subscriptionId);
		};
		this.subscriptions.set(request.subscriptionId, {
			clusterId: request.clusterId,
			stop
		});
		const loop = () => {
			if (state.closed) return;
			new Watch(connection.kc).watch(path, {
				watch: true,
				allowWatchBookmarks: true,
				resourceVersion: state.resourceVersion,
				labelSelector: request.labelSelector,
				fieldSelector: request.fieldSelector,
				timeoutSeconds: 300
			}, (phase, apiObj) => {
				if (state.closed) return;
				const object = apiObj;
				if (object?.metadata?.resourceVersion) state.resourceVersion = object.metadata.resourceVersion;
				emit({
					subscriptionId: request.subscriptionId,
					type: phase,
					object
				});
			}, () => {
				if (state.closed) return;
				setTimeout(loop, 500);
			}).then((abort) => {
				state.abort = abort;
				if (state.closed) abort.abort();
			}).catch((error) => {
				if (state.closed) return;
				emit({
					subscriptionId: request.subscriptionId,
					type: "ERROR",
					error: error instanceof Error ? error.message : String(error)
				});
				setTimeout(loop, 5e3);
			});
		};
		loop();
	}
	stop(subscriptionId) {
		this.subscriptions.get(subscriptionId)?.stop();
		this.subscriptions.delete(subscriptionId);
	}
	stopCluster(clusterId) {
		for (const [id, entry] of this.subscriptions) {
			if (entry.clusterId !== clusterId) continue;
			entry.stop();
			this.subscriptions.delete(id);
		}
	}
	stopAll() {
		for (const entry of this.subscriptions.values()) entry.stop();
		this.subscriptions.clear();
	}
};
// src/main/kubernetes/log-streams.ts
var LogStreams = class {
	getConnection;
	streams = /* @__PURE__ */ new Map();
	constructor(getConnection) {
		this.getConnection = getConnection;
	}
	async start(request, emitChunk, emitEnd) {
		this.stop(request.streamId);
		const connection = this.getConnection(request.clusterId);
		const decoder = new TextDecoder("utf-8");
		let sink;
		const handle = {
			closed: false,
			clusterId: request.clusterId,
			sink: null
		};
		sink = new Writable({ write: (chunk, _encoding, callback) => {
			if (!handle.closed) emitChunk({
				streamId: request.streamId,
				chunk: decoder.decode(chunk, { stream: true })
			});
			callback();
		} });
		handle.sink = sink;
		this.streams.set(request.streamId, handle);
		const finish = (error) => {
			if (handle.closed) return;
			handle.closed = true;
			const tail = decoder.decode();
			if (tail) emitChunk({
				streamId: request.streamId,
				chunk: tail
			});
			this.streams.delete(request.streamId);
			emitEnd({
				streamId: request.streamId,
				error
			});
		};
		sink.on("error", (error) => finish(error.message));
		sink.on("finish", () => finish());
		try {
			handle.abort = await new Log(connection.kc).log(request.namespace, request.pod, request.container, sink, {
				follow: request.follow ?? true,
				previous: request.previous ?? false,
				tailLines: request.tailLines ?? 500,
				timestamps: request.timestamps ?? false
			});
		} catch (error) {
			finish(error instanceof Error ? error.message : String(error));
		}
	}
	stop(streamId) {
		const handle = this.streams.get(streamId);
		if (!handle) return;
		handle.closed = true;
		handle.abort?.abort();
		handle.sink.end();
		this.streams.delete(streamId);
	}
	stopAll() {
		for (const id of [...this.streams.keys()]) this.stop(id);
	}
	stopCluster(clusterId) {
		for (const [id, handle] of this.streams) {
			if (handle.clusterId !== clusterId) continue;
			this.stop(id);
		}
	}
};
// src/main/kubernetes/exec-sessions.ts
/** Writable stdout that also exposes the terminal size Exec() reads for resize frames. */
var ResizableOutput = class extends Writable {
	onChunk;
	rows = 24;
	columns = 80;
	constructor(onChunk) {
		super();
		this.onChunk = onChunk;
	}
	_write(chunk, _encoding, callback) {
		this.onChunk(chunk);
		callback();
	}
	resize(cols, rows) {
		this.columns = cols;
		this.rows = rows;
		this.emit("resize");
	}
};
var ExecSessions = class {
	getConnection;
	sessions = /* @__PURE__ */ new Map();
	constructor(getConnection) {
		this.getConnection = getConnection;
	}
	async start(request, emitData, emitExit) {
		this.close(request.sessionId);
		const connection = this.getConnection(request.clusterId);
		const decoder = new TextDecoder$1("utf-8");
		let handle;
		const onChunk = (chunk) => {
			if (!handle || handle.closed) return;
			const text = decoder.decode(chunk, { stream: true });
			if (text) emitData({
				sessionId: request.sessionId,
				data: text
			});
		};
		const output = new ResizableOutput(onChunk);
		output.columns = request.cols;
		output.rows = request.rows;
		const stdin = new PassThrough();
		handle = {
			closed: false,
			clusterId: request.clusterId,
			stdin,
			output,
			decoder
		};
		this.sessions.set(request.sessionId, handle);
		const finish = (code, error) => {
			if (handle.closed) return;
			handle.closed = true;
			const tail = decoder.decode();
			if (tail) emitData({
				sessionId: request.sessionId,
				data: tail
			});
			this.sessions.delete(request.sessionId);
			emitExit({
				sessionId: request.sessionId,
				exitCode: code,
				error
			});
		};
		const exec = new Exec(connection.kc);
		try {
			handle.socket = await exec.exec(request.namespace, request.pod, request.container, request.command.length ? request.command : ["/bin/sh"], output, output, stdin, request.tty, (status) => {
				finish(status?.code ?? 0, status?.message);
			});
			handle.socket.on?.("close", (code) => finish(code ?? 0));
		} catch (error) {
			finish(null, error instanceof Error ? error.message : String(error));
		}
	}
	input(sessionId, data) {
		this.sessions.get(sessionId)?.stdin.write(data);
	}
	resize(sessionId, cols, rows) {
		this.sessions.get(sessionId)?.output.resize(cols, rows);
	}
	close(sessionId) {
		const handle = this.sessions.get(sessionId);
		if (!handle) return;
		handle.closed = true;
		handle.stdin.end();
		handle.socket?.close();
		this.sessions.delete(sessionId);
	}
	closeAll() {
		for (const id of [...this.sessions.keys()]) this.close(id);
	}
	closeCluster(clusterId) {
		for (const [id, handle] of this.sessions) {
			if (handle.clusterId !== clusterId) continue;
			this.close(id);
		}
	}
};
// src/shared/keys.ts
/** Key format shared by the renderer and the main-process count API. */
function resourceCountKey(clusterId, apiVersion, kind, namespace) {
	return `${clusterId}|${apiVersion}|${kind}|${namespace ?? "*"}`;
}
// src/main/kubernetes/cluster-manager.ts
async function mapWithConcurrency(items, limit, worker) {
	const results = new Array(items.length);
	let cursor = 0;
	const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (cursor < items.length) {
			const index = cursor++;
			results[index] = await worker(items[index]);
		}
	});
	await Promise.all(runners);
	return results;
}
var ClusterManager = class {
	kubeconfigs;
	settings;
	sessions = /* @__PURE__ */ new Map();
	watcher = new ResourceWatcher((id) => this.connection(id));
	logs = new LogStreams((id) => this.connection(id));
	exec = new ExecSessions((id) => this.connection(id));
	constructor(kubeconfigs, settings) {
		this.kubeconfigs = kubeconfigs;
		this.settings = settings;
	}
	isConnected(id) {
		return this.sessions.has(id);
	}
	connection(id) {
		const session = this.sessions.get(id);
		if (!session) throw new Error("Cluster is not connected. Reconnect it from the catalog.");
		return session.connection;
	}
	async connect(id) {
		const existing = this.sessions.get(id);
		if (existing) return existing.info;
		const resolved = this.kubeconfigs.resolve(id);
		const connection = new ClusterConnection(id, resolved.kubeConfig);
		const startedAt = Date.now();
		const version = await kubeRequest(resolved.kubeConfig, "/version", { timeoutMs: 15e3 });
		connection.latencyMs = Date.now() - startedAt;
		connection.version = [version.major, version.minor].filter(Boolean).join(".") || version.gitVersion || "unknown";
		connection.gitVersion = version.gitVersion ?? "";
		const [namespaces] = await Promise.all([this.fetchNamespaces(connection).catch((error) => {
			console.warn("[cluster] namespace list failed", errorMessage(error));
			return [];
		}), connection.catalog.refresh().catch((error) => {
			console.warn("[cluster] discovery failed", errorMessage(error));
			return [];
		})]);
		const info = {
			id,
			name: resolved.contextName,
			context: resolved.contextName,
			server: resolved.kubeConfig.getCurrentCluster()?.server ?? "",
			version: connection.version,
			gitVersion: connection.gitVersion,
			namespaces: namespaces.map((namespace) => namespace.name),
			defaultNamespace: resolved.kubeConfig.getContextObject(resolved.contextName)?.namespace ?? "default",
			user: resolved.kubeConfig.getCurrentUser()?.name,
			connectedAt: Date.now()
		};
		this.sessions.set(id, {
			connection,
			info
		});
		this.settings.addRecentCluster(id);
		return info;
	}
	async disconnect(id) {
		if (!this.sessions.get(id)) return;
		this.watcher.stopCluster(id);
		this.logs.stopCluster(id);
		this.exec.closeCluster(id);
		this.sessions.delete(id);
	}
	async health(id) {
		const session = this.sessions.get(id);
		if (!session) return {
			id,
			status: "disconnected"
		};
		const startedAt = Date.now();
		try {
			await kubeRequest(session.connection.kc, "/version", { timeoutMs: 8e3 });
			session.connection.latencyMs = Date.now() - startedAt;
			return {
				id,
				status: "connected",
				latencyMs: session.connection.latencyMs,
				checkedAt: Date.now()
			};
		} catch (error) {
			return {
				id,
				status: "error",
				error: errorMessage(error),
				latencyMs: Date.now() - startedAt,
				checkedAt: Date.now()
			};
		}
	}
	async namespaces(id) {
		return this.fetchNamespaces(this.connection(id));
	}
	async fetchNamespaces(connection) {
		return ((await kubeRequest(connection.kc, "/api/v1/namespaces", { query: { limit: 1e3 } })).items ?? []).map((item) => ({
			name: item.metadata.name,
			status: item.status?.phase ?? "Active"
		})).sort((a, b) => a.name.localeCompare(b.name));
	}
	async list(request) {
		const connection = this.connection(request.clusterId);
		const info = await connection.catalog.get(request.apiVersion, request.kind);
		const apiPath = buildApiPath(info.apiVersion, info.plural, info.namespaced ? request.namespace : void 0);
		const result = await kubeRequest(connection.kc, apiPath, {
			query: {
				limit: request.limit ?? 2e3,
				continue: request.continueToken,
				labelSelector: request.labelSelector,
				fieldSelector: request.fieldSelector
			},
			timeoutMs: 45e3
		});
		return {
			items: result.items ?? [],
			resourceVersion: result.metadata?.resourceVersion,
			continueToken: result.metadata?.continue,
			remainingItemCount: result.metadata?.remainingItemCount
		};
	}
	async get(request) {
		const connection = this.connection(request.clusterId);
		const info = await connection.catalog.get(request.apiVersion, request.kind);
		const apiPath = `${buildApiPath(info.apiVersion, info.plural, info.namespaced ? request.namespace : void 0)}/${encodeURIComponent(request.name)}`;
		return await kubeRequest(connection.kc, apiPath);
	}
	async counts(request) {
		const connection = this.connection(request.clusterId);
		return await mapWithConcurrency(request.resources, 6, async (resource) => {
			const key = resourceCountKey(request.clusterId, resource.apiVersion, resource.kind, resource.namespace);
			try {
				const info = await connection.catalog.get(resource.apiVersion, resource.kind);
				const result = await kubeRequest(connection.kc, buildApiPath(info.apiVersion, info.plural, info.namespaced ? resource.namespace : void 0), {
					query: { limit: 1 },
					timeoutMs: 2e4
				});
				const remaining = result.metadata?.remainingItemCount;
				return {
					key,
					count: (result.items?.length ?? 0) + (remaining ?? 0),
					atLeast: remaining !== void 0
				};
			} catch (error) {
				return {
					key,
					count: 0,
					error: errorMessage(error)
				};
			}
		});
	}
	async remove(request) {
		const connection = this.connection(request.clusterId);
		const info = await connection.catalog.get(request.apiVersion, request.kind);
		const apiPath = `${buildApiPath(info.apiVersion, info.plural, info.namespaced ? request.namespace : void 0)}/${encodeURIComponent(request.name)}`;
		await kubeRequest(connection.kc, apiPath, {
			method: "DELETE",
			body: {
				apiVersion: "v1",
				kind: "DeleteOptions",
				propagationPolicy: request.propagationPolicy ?? "Background"
			}
		});
	}
	async apply(request) {
		const connection = this.connection(request.clusterId);
		let documents;
		try {
			documents = loadAllYaml(request.yaml).filter(Boolean);
		} catch (error) {
			throw new Error(`Invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
		}
		const results = [];
		for (const raw of documents) {
			const object = raw;
			if (object?.kind === "List" && Array.isArray(object.items)) {
				for (const item of object.items) results.push(await this.applyObject(connection, item, Boolean(request.dryRun)));
				continue;
			}
			results.push(await this.applyObject(connection, object, Boolean(request.dryRun)));
		}
		return results;
	}
	async applyObject(connection, object, dryRun) {
		if (!object?.kind || !object?.apiVersion) throw new Error("Every YAML document needs apiVersion and kind.");
		const name = object.metadata?.name;
		if (!name) throw new Error(`${object.kind} is missing metadata.name.`);
		const info = await connection.catalog.get(object.apiVersion, object.kind);
		const namespace = info.namespaced ? object.metadata.namespace ?? "default" : void 0;
		const collection = buildApiPath(info.apiVersion, info.plural, namespace);
		const itemPath = `${collection}/${encodeURIComponent(name)}`;
		const payload = {
			...object,
			metadata: {
				...object.metadata,
				namespace
			}
		};
		delete payload.status;
		if (payload.metadata) delete payload.metadata.managedFields;
		let action = "created";
		try {
			const existing = await kubeRequest(connection.kc, itemPath);
			action = "updated";
			payload.metadata = {
				...existing.metadata,
				...payload.metadata,
				resourceVersion: existing.metadata.resourceVersion
			};
		} catch (error) {
			if (!(error instanceof KubeApiError && error.statusCode === 404)) throw error;
		}
		const query = dryRun ? { dryRun: "All" } : void 0;
		const result = action === "updated" ? await kubeRequest(connection.kc, itemPath, {
			method: "PUT",
			body: payload,
			query
		}) : await kubeRequest(connection.kc, collection, {
			method: "POST",
			body: payload,
			query
		});
		return {
			kind: result?.kind ?? info.kind,
			name: result?.metadata?.name ?? name,
			namespace,
			action: dryRun ? "updated" : action
		};
	}
	async scale(request) {
		const connection = this.connection(request.clusterId);
		const info = await connection.catalog.get(request.apiVersion, request.kind);
		const apiPath = `${buildApiPath(info.apiVersion, info.plural, request.namespace)}/${encodeURIComponent(request.name)}`;
		await kubeRequest(connection.kc, apiPath, {
			method: "PATCH",
			headers: { "Content-Type": "application/merge-patch+json" },
			body: { spec: { replicas: request.replicas } }
		});
	}
	async restart(request) {
		const connection = this.connection(request.clusterId);
		const info = await connection.catalog.get(request.apiVersion, request.kind);
		const apiPath = `${buildApiPath(info.apiVersion, info.plural, request.namespace)}/${encodeURIComponent(request.name)}`;
		await kubeRequest(connection.kc, apiPath, {
			method: "PATCH",
			headers: { "Content-Type": "application/merge-patch+json" },
			body: { spec: { template: { metadata: { annotations: {
				"kubectl.kubernetes.io/restartedAt": (/* @__PURE__ */ new Date()).toISOString(),
				"mlens.io/restartedAt": (/* @__PURE__ */ new Date()).toISOString()
			} } } } }
		});
	}
	async podContainers(clusterId, namespace, name) {
		const pod = await this.get({
			clusterId,
			apiVersion: "v1",
			kind: "Pod",
			namespace,
			name
		});
		const specContainers = (pod.spec?.containers ?? []).concat(pod.spec?.initContainers ?? []);
		const statuses = (pod.status?.containerStatuses ?? []).concat(pod.status?.initContainerStatuses ?? []);
		return specContainers.map((container) => {
			const status = statuses.find((candidate) => candidate.name === container.name);
			const state = status?.state ?? {};
			const stateKey = Object.keys(state)[0] ?? "waiting";
			return {
				name: container.name,
				image: container.image,
				ready: Boolean(status?.ready),
				restartCount: Number(status?.restartCount ?? 0),
				state: stateKey,
				startedAt: state.running?.startedAt ?? state.terminated?.startedAt
			};
		});
	}
	/** Serialize an object for the YAML tab (server JSON -> YAML). */
	toYaml(object) {
		return dumpYaml(object);
	}
	disposeAll() {
		this.watcher.stopAll();
		this.logs.stopAll();
		this.exec.closeAll();
	}
};
// src/main/terminal/pty-manager.ts
function resolveShell(requested) {
	const candidates = requested ? [requested] : process.platform === "win32" ? [process.env.COMSPEC || "powershell.exe"] : [
		process.env.SHELL,
		"/bin/zsh",
		"/bin/bash",
		"/bin/sh"
	];
	for (const candidate of candidates) if (candidate && fs.existsSync(candidate)) return candidate;
	return process.platform === "win32" ? "powershell.exe" : "/bin/sh";
}
var PtyManager = class {
	sessions = /* @__PURE__ */ new Map();
	create(request, emitData, emitExit) {
		this.close(request.sessionId);
		const shell = resolveShell(request.shell);
		const cwd = request.cwd && fs.existsSync(request.cwd) ? request.cwd : os.homedir();
		const args = process.platform === "win32" ? [] : ["-l"];
		const terminal = spawn(shell, args, {
			name: "xterm-256color",
			cols: Math.max(2, request.cols),
			rows: Math.max(2, request.rows),
			cwd,
			env: {
				...process.env,
				TERM: "xterm-256color",
				COLORTERM: "truecolor",
				TERM_PROGRAM: "mLens",
				...request.env
			}
		});
		const handle = {
			pty: terminal,
			closed: false
		};
		this.sessions.set(request.sessionId, handle);
		terminal.onData((data) => {
			if (handle.closed) return;
			emitData({
				sessionId: request.sessionId,
				data
			});
		});
		terminal.onExit(({ exitCode, signal }) => {
			if (handle.closed) return;
			handle.closed = true;
			this.sessions.delete(request.sessionId);
			emitExit({
				sessionId: request.sessionId,
				exitCode,
				error: signal ? `Process exited with signal ${signal}` : void 0
			});
		});
		return { shell };
	}
	input(sessionId, data) {
		this.sessions.get(sessionId)?.pty.write(data);
	}
	resize(sessionId, cols, rows) {
		const handle = this.sessions.get(sessionId);
		if (!handle) return;
		try {
			handle.pty.resize(Math.max(2, cols), Math.max(2, rows));
		} catch {}
	}
	close(sessionId) {
		const handle = this.sessions.get(sessionId);
		if (!handle) return;
		handle.closed = true;
		try {
			handle.pty.kill();
		} catch {}
		this.sessions.delete(sessionId);
	}
	closeAll() {
		for (const id of [...this.sessions.keys()]) this.close(id);
	}
};
// src/main/ipc/register.ts
var { app: app$1, BrowserWindow: BrowserWindow$1, dialog, ipcMain, shell: shell$1 } = electron;
function assertString(value, name) {
	if (typeof value !== "string" || value.length === 0) throw new Error(`${name} must be a non-empty string`);
	return value;
}
function assertObject(value, name) {
	if (!value || typeof value !== "object") throw new Error(`${name} must be an object`);
	return value;
}
function registerIpc({ settings, kubeconfigs, clusters, terminals, getWindow }) {
	const send = (channel, payload) => {
		const window = getWindow();
		if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
	};
	const windowFor = (event) => BrowserWindow$1.fromWebContents(event.sender) ?? getWindow();
	ipcMain.handle(IPC.appInfo, () => ({
		version: app$1.getVersion(),
		electron: process.versions.electron,
		chrome: process.versions.chrome,
		node: process.versions.node,
		platform: process.platform,
		arch: process.arch
	}));
	ipcMain.handle(IPC.appOpenExternal, async (_event, url) => {
		const target = assertString(url, "url");
		if (!/^https?:\/\//i.test(target)) throw new Error("Only http(s) links can be opened externally");
		await shell$1.openExternal(target);
	});
	ipcMain.handle(IPC.appMinimize, (event) => windowFor(event)?.minimize());
	ipcMain.handle(IPC.appMaximize, (event) => {
		const window = windowFor(event);
		if (!window) return;
		if (window.isMaximized()) window.unmaximize();
		else window.maximize();
	});
	ipcMain.handle(IPC.appClose, (event) => windowFor(event)?.close());
	ipcMain.handle(IPC.appIsMaximized, (event) => windowFor(event)?.isMaximized() ?? false);
	ipcMain.handle(IPC.kubeconfigList, () => ({
		sources: kubeconfigs.listSources(),
		clusters: kubeconfigs.listClusters()
	}));
	ipcMain.handle(IPC.kubeconfigAddDialog, async () => {
		const window = getWindow();
		const options = {
			title: "Import kubeconfig",
			properties: ["openFile", "multiSelections"],
			filters: [{
				name: "Kubeconfig",
				extensions: [
					"yaml",
					"yml",
					"conf",
					"kubeconfig"
				]
			}, {
				name: "All files",
				extensions: ["*"]
			}]
		};
		const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
		if (result.canceled) return {
			canceled: true,
			paths: []
		};
		const added = [];
		for (const file of result.filePaths) {
			const source = kubeconfigs.addPath(file);
			added.push(source.path);
		}
		return {
			canceled: false,
			paths: added
		};
	});
	ipcMain.handle(IPC.kubeconfigAddPath, (_event, path) => kubeconfigs.addPath(assertString(path, "path")));
	ipcMain.handle(IPC.kubeconfigAddContent, (_event, content, fileName) => kubeconfigs.addContent(assertString(content, "kubeconfig content"), path.join(app$1.getPath("userData"), "kubeconfigs"), typeof fileName === "string" ? fileName : void 0));
	ipcMain.handle(IPC.kubeconfigRemove, async (_event, path) => {
		const target = assertString(path, "path");
		for (const cluster of kubeconfigs.listClusters()) if (cluster.kubeconfigPath === target && clusters.isConnected(cluster.id)) await clusters.disconnect(cluster.id);
		kubeconfigs.removePath(target);
	});
	ipcMain.handle(IPC.clusterConnect, (_event, id) => clusters.connect(assertString(id, "cluster id")));
	ipcMain.handle(IPC.clusterDisconnect, (_event, id) => clusters.disconnect(assertString(id, "cluster id")));
	ipcMain.handle(IPC.clusterHealth, (_event, id) => clusters.health(assertString(id, "cluster id")));
	ipcMain.handle(IPC.clusterNamespaces, (_event, id) => clusters.namespaces(assertString(id, "cluster id")));
	ipcMain.handle(IPC.resourcesDiscover, (_event, clusterId) => clusters.connection(assertString(clusterId, "cluster id")).catalog.refresh(true));
	ipcMain.handle(IPC.resourcesList, (_event, raw) => clusters.list(assertObject(raw, "request")));
	ipcMain.handle(IPC.resourcesGet, (_event, raw) => clusters.get(assertObject(raw, "request")));
	ipcMain.handle(IPC.resourcesWatch, (_event, raw) => clusters.watcher.start(assertObject(raw, "request"), (payload) => send(IPC.resourcesWatchEvent, payload)));
	ipcMain.handle(IPC.resourcesUnwatch, (_event, id) => {
		clusters.watcher.stop(assertString(id, "subscription id"));
	});
	ipcMain.handle(IPC.resourcesCounts, (_event, raw) => clusters.counts(assertObject(raw, "request")));
	ipcMain.handle(IPC.resourcesDelete, (_event, raw) => clusters.remove(assertObject(raw, "request")));
	ipcMain.handle(IPC.resourcesApply, (_event, raw) => clusters.apply(assertObject(raw, "request")));
	ipcMain.handle(IPC.resourcesScale, (_event, raw) => clusters.scale(assertObject(raw, "request")));
	ipcMain.handle(IPC.resourcesRestart, (_event, raw) => clusters.restart(assertObject(raw, "request")));
	ipcMain.handle(IPC.podContainers, (_event, clusterId, namespace, name) => clusters.podContainers(assertString(clusterId, "cluster id"), assertString(namespace, "namespace"), assertString(name, "name")));
	ipcMain.handle(IPC.logsStart, (_event, raw) => clusters.logs.start(assertObject(raw, "request"), (payload) => send(IPC.logsChunk, payload), (payload) => send(IPC.logsEnd, payload)));
	ipcMain.handle(IPC.logsStop, (_event, id) => clusters.logs.stop(assertString(id, "stream id")));
	ipcMain.handle(IPC.execStart, (_event, raw) => clusters.exec.start(assertObject(raw, "request"), (payload) => send(IPC.execData, payload), (payload) => send(IPC.execExit, payload)));
	ipcMain.handle(IPC.execInput, (_event, id, data) => clusters.exec.input(assertString(id, "session id"), String(data ?? "")));
	ipcMain.handle(IPC.execResize, (_event, id, cols, rows) => clusters.exec.resize(assertString(id, "session id"), Number(cols) || 80, Number(rows) || 24));
	ipcMain.handle(IPC.execClose, (_event, id) => clusters.exec.close(String(id)));
	ipcMain.handle(IPC.terminalCreate, (_event, raw) => terminals.create(assertObject(raw, "request"), (payload) => send(IPC.terminalData, payload), (payload) => send(IPC.terminalExit, payload)));
	ipcMain.handle(IPC.terminalInput, (_event, id, data) => terminals.input(assertString(id, "session id"), String(data ?? "")));
	ipcMain.handle(IPC.terminalResize, (_event, id, cols, rows) => terminals.resize(assertString(id, "session id"), Number(cols) || 80, Number(rows) || 24));
	ipcMain.handle(IPC.terminalClose, (_event, id) => terminals.close(String(id)));
	ipcMain.handle(IPC.settingsGet, () => settings.get());
	ipcMain.handle(IPC.settingsUpdate, (_event, raw) => settings.update(assertObject(raw, "settings")));
}
// src/main/index.ts
var { app, BrowserWindow, Menu, nativeTheme, shell } = electron;
console.log("[mlens] module body");
var currentDir = path.dirname(fileURLToPath(import.meta.url));
var isDev = !app.isPackaged;
var mainWindow = null;
var settings;
var clusters;
var terminals;
function buildMenu() {
	const isMac = process.platform === "darwin";
	const template = [
		...isMac ? [{
			label: app.name,
			submenu: [
				{ role: "about" },
				{ type: "separator" },
				{ role: "services" },
				{ type: "separator" },
				{ role: "hide" },
				{ role: "hideOthers" },
				{ role: "unhide" },
				{ type: "separator" },
				{ role: "quit" }
			]
		}] : [],
		{
			label: "File",
			submenu: [isMac ? { role: "close" } : { role: "quit" }]
		},
		{
			label: "Edit",
			submenu: [
				{ role: "undo" },
				{ role: "redo" },
				{ type: "separator" },
				{ role: "cut" },
				{ role: "copy" },
				{ role: "paste" },
				{ role: "selectAll" }
			]
		},
		{
			label: "View",
			submenu: [
				...isDev ? [
					{ role: "reload" },
					{ role: "toggleDevTools" },
					{ type: "separator" }
				] : [],
				{ role: "resetZoom" },
				{ role: "zoomIn" },
				{ role: "zoomOut" },
				{ type: "separator" },
				{ role: "togglefullscreen" }
			]
		},
		{
			label: "Window",
			submenu: [{ role: "minimize" }, ...isMac ? [
				{ role: "zoom" },
				{ type: "separator" },
				{ role: "front" }
			] : []]
		}
	];
	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
function createWindow() {
	const theme = settings.get().theme;
	nativeTheme.themeSource = theme;
	mainWindow = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 980,
		minHeight: 620,
		show: false,
		backgroundColor: theme === "light" ? "#f0f3f9" : "#0b0f1e",
		title: "mLens",
		titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
		trafficLightPosition: process.platform === "darwin" ? {
			x: 14,
			y: 15
		} : void 0,
		frame: process.platform !== "darwin" ? false : true,
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(currentDir, "../preload/index.cjs"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			spellcheck: false,
			webSecurity: true
		}
	});
	console.log("[mlens] creating BrowserWindow");
	mainWindow.once("ready-to-show", () => {
		console.log("[mlens] ready-to-show");
		mainWindow?.show();
	});
	mainWindow.webContents.on("render-process-gone", (_e, d) => console.log("[mlens] renderer gone", d));
	mainWindow.webContents.on("did-fail-load", (_e, code, desc) => console.log("[mlens] load fail", code, desc));
	mainWindow.webContents.on("console-message", (_e, level, message) => console.log("[renderer]", level, message));
	const notifyWindowState = () => {
		if (!mainWindow || mainWindow.isDestroyed()) return;
		mainWindow.webContents.send(IPC.appWindowState, mainWindow.isMaximized());
	};
	mainWindow.on("maximize", notifyWindowState);
	mainWindow.on("unmaximize", notifyWindowState);
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:\/\//i.test(url)) shell.openExternal(url);
		return { action: "deny" };
	});
	mainWindow.webContents.on("will-navigate", (event, url) => {
		const devUrl = process.env.ELECTRON_RENDERER_URL;
		if (devUrl && url.startsWith(devUrl)) return;
		if (url.startsWith("file://")) return;
		event.preventDefault();
		if (/^https?:\/\//i.test(url)) shell.openExternal(url);
	});
	if (isDev && process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
	else mainWindow.loadFile(path.join(currentDir, "../renderer/index.html"));
	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}
console.log("[mlens] before lock");
var singleInstance = app.requestSingleInstanceLock();
console.log("[mlens] lock", singleInstance);
if (!singleInstance) app.quit();
else {
	app.on("second-instance", () => {
		if (!mainWindow) return;
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	});
	app.whenReady().then(() => {
		console.log("[mlens] ready");
		settings = new SettingsStore();
		console.log("[mlens] settings ok");
		const kubeconfigs = new KubeconfigManager(settings);
		clusters = new ClusterManager(kubeconfigs, settings);
		terminals = new PtyManager();
		console.log("[mlens] managers ok");
		registerIpc({
			settings,
			kubeconfigs,
			clusters,
			terminals,
			getWindow: () => mainWindow
		});
		settings.onChange((next) => {
			if (next.theme === "light" || next.theme === "dark" || next.theme === "system") nativeTheme.themeSource = next.theme;
			if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC.settingsChanged, next);
		});
		console.log("[mlens] ipc ok");
		buildMenu();
		console.log("[mlens] menu ok");
		createWindow();
		console.log("[mlens] window created");
		app.on("activate", () => {
			if (BrowserWindow.getAllWindows().length === 0) createWindow();
		});
	});
	app.on("window-all-closed", () => {
		if (process.platform !== "darwin") app.quit();
	});
	app.on("before-quit", () => {
		clusters?.disposeAll();
		terminals?.closeAll();
	});
}
export {};

//# sourceMappingURL=index.js.map