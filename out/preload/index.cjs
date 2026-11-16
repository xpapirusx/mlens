let electron = require("electron");
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
// src/preload/index.ts
function on(channel, callback) {
	const listener = (_event, payload) => callback(payload);
	electron.ipcRenderer.on(channel, listener);
	return () => {
		electron.ipcRenderer.removeListener(channel, listener);
	};
}
electron.contextBridge.exposeInMainWorld("mlens", {
	app: {
		info: () => electron.ipcRenderer.invoke(IPC.appInfo),
		openExternal: (url) => electron.ipcRenderer.invoke(IPC.appOpenExternal, url),
		minimize: () => electron.ipcRenderer.invoke(IPC.appMinimize),
		maximize: () => electron.ipcRenderer.invoke(IPC.appMaximize),
		close: () => electron.ipcRenderer.invoke(IPC.appClose),
		isMaximized: () => electron.ipcRenderer.invoke(IPC.appIsMaximized),
		onWindowState: (callback) => on(IPC.appWindowState, callback)
	},
	clusters: {
		listKubeconfigs: () => electron.ipcRenderer.invoke(IPC.kubeconfigList),
		addKubeconfigDialog: () => electron.ipcRenderer.invoke(IPC.kubeconfigAddDialog),
		addKubeconfigPath: (path) => electron.ipcRenderer.invoke(IPC.kubeconfigAddPath, path),
		addKubeconfigContent: (content, fileName) => electron.ipcRenderer.invoke(IPC.kubeconfigAddContent, content, fileName),
		removeKubeconfig: (path) => electron.ipcRenderer.invoke(IPC.kubeconfigRemove, path),
		connect: (id) => electron.ipcRenderer.invoke(IPC.clusterConnect, id),
		disconnect: (id) => electron.ipcRenderer.invoke(IPC.clusterDisconnect, id),
		health: (id) => electron.ipcRenderer.invoke(IPC.clusterHealth, id),
		namespaces: (id) => electron.ipcRenderer.invoke(IPC.clusterNamespaces, id)
	},
	resources: {
		discover: (clusterId) => electron.ipcRenderer.invoke(IPC.resourcesDiscover, clusterId),
		list: (request) => electron.ipcRenderer.invoke(IPC.resourcesList, request),
		get: (request) => electron.ipcRenderer.invoke(IPC.resourcesGet, request),
		watch: (request) => electron.ipcRenderer.invoke(IPC.resourcesWatch, request),
		unwatch: (subscriptionId) => electron.ipcRenderer.invoke(IPC.resourcesUnwatch, subscriptionId),
		counts: (request) => electron.ipcRenderer.invoke(IPC.resourcesCounts, request),
		delete: (request) => electron.ipcRenderer.invoke(IPC.resourcesDelete, request),
		apply: (request) => electron.ipcRenderer.invoke(IPC.resourcesApply, request),
		scale: (request) => electron.ipcRenderer.invoke(IPC.resourcesScale, request),
		restart: (request) => electron.ipcRenderer.invoke(IPC.resourcesRestart, request),
		onWatchEvent: (callback) => on(IPC.resourcesWatchEvent, callback)
	},
	pods: { containers: (clusterId, namespace, name) => electron.ipcRenderer.invoke(IPC.podContainers, clusterId, namespace, name) },
	logs: {
		start: (request) => electron.ipcRenderer.invoke(IPC.logsStart, request),
		stop: (streamId) => electron.ipcRenderer.invoke(IPC.logsStop, streamId),
		onChunk: (callback) => on(IPC.logsChunk, callback),
		onEnd: (callback) => on(IPC.logsEnd, callback)
	},
	exec: {
		start: (request) => electron.ipcRenderer.invoke(IPC.execStart, request),
		input: (sessionId, data) => electron.ipcRenderer.invoke(IPC.execInput, sessionId, data),
		resize: (sessionId, cols, rows) => electron.ipcRenderer.invoke(IPC.execResize, sessionId, cols, rows),
		close: (sessionId) => electron.ipcRenderer.invoke(IPC.execClose, sessionId),
		onData: (callback) => on(IPC.execData, callback),
		onExit: (callback) => on(IPC.execExit, callback)
	},
	terminal: {
		create: (request) => electron.ipcRenderer.invoke(IPC.terminalCreate, request),
		input: (sessionId, data) => electron.ipcRenderer.invoke(IPC.terminalInput, sessionId, data),
		resize: (sessionId, cols, rows) => electron.ipcRenderer.invoke(IPC.terminalResize, sessionId, cols, rows),
		close: (sessionId) => electron.ipcRenderer.invoke(IPC.terminalClose, sessionId),
		onData: (callback) => on(IPC.terminalData, callback),
		onExit: (callback) => on(IPC.terminalExit, callback)
	},
	settings: {
		get: () => electron.ipcRenderer.invoke(IPC.settingsGet),
		update: (patch) => electron.ipcRenderer.invoke(IPC.settingsUpdate, patch),
		onChanged: (callback) => on(IPC.settingsChanged, callback)
	}
});

//# sourceMappingURL=index.cjs.map