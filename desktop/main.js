/**
 * نسخة سطح المكتب الآمنة — منصة اختبارات الزمالات المهنية
 * Secure Lockdown Exam Client
 *
 * - وضع Kiosk: ملء الشاشة دائمًا، بلا شريط عنوان
 * - قفل كامل: حظر Alt+Tab و Alt+F4 و F11 و F12 و Ctrl+Q ومفاتيح النظام قدر الإمكان
 * - مرتبط بالموقع فقط: يمنع أي تنقل خارج نطاق المنصة
 * - نسخة واحدة فقط من التطبيق
 * - لا يمكن الإغلاق أثناء الاختبار إلا بكلمة سر المراقب
 */

const { app, BrowserWindow, globalShortcut, dialog, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs");

// رابط المنصة — يُقرأ من config.json بجانب التطبيق
let PLATFORM_URL = "http://localhost:3000";
const PROCTOR_EXIT_PIN = "778899"; // يُغيَّر من الإدارة لكل قاعة اختبار

try {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
  if (cfg.platformUrl) PLATFORM_URL = cfg.platformUrl;
  if (cfg.proctorExitPin) PROCTOR_EXIT_PIN = cfg.proctorExitPin;
} catch { /* defaults */ }

let mainWindow = null;
let examActive = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    frame: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: "#2F5D68",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
      webSecurity: true,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.loadURL(PLATFORM_URL + "/exam");

  // منع أي تنقل خارج المنصة
  const allowed = new URL(PLATFORM_URL).origin;
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(allowed)) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  // حظر الاختصارات داخل النافذة
  mainWindow.webContents.on("before-input-event", (event, input) => {
    const key = input.key.toLowerCase();
    const blocked =
      input.key === "F11" ||
      input.key === "F12" ||
      input.key === "Escape" ||
      (input.alt && input.key === "Tab") ||
      (input.alt && input.key === "F4") ||
      (input.control && ["q", "w", "r", "t", "n", "p", "u", "j", "i"].includes(key)) ||
      (input.meta && ["q", "w", "r", "t", "n", "tab"].includes(key)) ||
      input.key === "PrintScreen";
    if (blocked && examActive) {
      event.preventDefault();
    }
  });

  // منع فقدان التركيز أثناء الاختبار
  mainWindow.on("blur", () => {
    if (examActive && mainWindow) {
      mainWindow.focus();
      mainWindow.webContents.send("lockdown:focus-forced");
    }
  });

  // منع الإغلاق أثناء الاختبار
  mainWindow.on("close", (e) => {
    if (examActive) {
      e.preventDefault();
      promptExitPin();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function promptExitPin() {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (!win) return;
  dialog
    .showMessageBox(win, {
      type: "warning",
      title: "الاختبار جارٍ",
      message: "لا يمكن إغلاق التطبيق أثناء الاختبار",
      detail: "يُسمح بالإغلاق فقط من المراقب بعد إنهاء الجلسة من لوحة التحكم.",
      buttons: ["حسنًا"],
    });
}

// أوامر من صفحة الاختبار
ipcMain.on("lockdown:exam-started", () => { examActive = true; });
ipcMain.on("lockdown:exam-finished", () => {
  examActive = false;
  if (mainWindow) {
    mainWindow.setKiosk(false);
    mainWindow.setFullScreen(false);
  }
});
ipcMain.on("lockdown:exit-with-pin", (_e, pin) => {
  if (pin === PROCTOR_EXIT_PIN && !examActive) {
    app.exit(0);
  }
});

app.whenReady().then(() => {
  // تعطيل الاختصارات العامة على مستوى النظام (قد يتطلب صلاحيات)
  const shortcuts = ["Alt+Tab", "Alt+F4", "Super", "Meta", "CommandOrControl+Shift+Escape"];
  for (const s of shortcuts) {
    try { globalShortcut.register(s, () => {}); } catch { /* unsupported on this OS */ }
  }

  // حظر الوصول لأي محتوى خارج المنصة على مستوى الشبكة
  const allowed = new URL(PLATFORM_URL).origin;
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const ok =
      details.url.startsWith(allowed) ||
      details.url.startsWith("data:") ||
      details.url.startsWith("blob:") ||
      details.url.startsWith("https://fonts.googleapis.com") ||
      details.url.startsWith("https://fonts.gstatic.com");
    callback({ cancel: !ok });
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  app.quit();
});
