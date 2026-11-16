import { app, BrowserWindow, Menu, nativeTheme, shell, type BrowserWindow as BrowserWindowType } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SettingsStore } from "./settings/store";
import { KubeconfigManager } from "./kubernetes/kubeconfig";
import { ClusterManager } from "./kubernetes/cluster-manager";
import { PtyManager } from "./terminal/pty-manager";
import { registerIpc } from "./ipc/register";
import { IPC } from "@shared/ipc";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

let mainWindow: BrowserWindowType | null = null;
let settings: SettingsStore;
let clusters: ClusterManager;
let terminals: PtyManager;

function buildMenu(): void {
  const isMac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        isMac ? { role: "close" as const } : { role: "quit" as const },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        { role: "selectAll" as const },
      ],
    },
    {
      label: "View",
      submenu: [
        ...(isDev
          ? [
              { role: "reload" as const },
              { role: "toggleDevTools" as const },
              { type: "separator" as const },
            ]
          : []),
        { role: "resetZoom" as const },
        { role: "zoomIn" as const },
        { role: "zoomOut" as const },
        { type: "separator" as const },
        { role: "togglefullscreen" as const },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" as const },
        ...(isMac ? [{ role: "zoom" as const }, { type: "separator" as const }, { role: "front" as const }] : []),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
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
    trafficLightPosition: process.platform === "darwin" ? { x: 14, y: 15 } : undefined,
    frame: process.platform !== "darwin" ? false : true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(currentDir, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  const notifyWindowState = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(IPC.appWindowState, mainWindow.isMaximized());
  };
  mainWindow.on("maximize", notifyWindowState);
  mainWindow.on("unmaximize", notifyWindowState);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (devUrl && url.startsWith(devUrl)) return;
    if (url.startsWith("file://")) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(currentDir, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(() => {
    settings = new SettingsStore();
    const kubeconfigs = new KubeconfigManager(settings);
    clusters = new ClusterManager(kubeconfigs, settings);
    terminals = new PtyManager();

    registerIpc({
      settings,
      kubeconfigs,
      clusters,
      terminals,
      getWindow: () => mainWindow,
    });

    settings.onChange((next) => {
      if (next.theme === "light" || next.theme === "dark" || next.theme === "system") {
        nativeTheme.themeSource = next.theme;
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.settingsChanged, next);
      }
    });

    buildMenu();
    createWindow();

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
