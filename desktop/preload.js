const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("secureExam", {
  examStarted: () => ipcRenderer.send("lockdown:exam-started"),
  examFinished: () => ipcRenderer.send("lockdown:exam-finished"),
  exitWithPin: (pin) => ipcRenderer.send("lockdown:exit-with-pin", pin),
  onFocusForced: (cb) => ipcRenderer.on("lockdown:focus-forced", cb),
  isDesktopClient: true,
});
