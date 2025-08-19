const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

let mainWindow;

// Simple storage for recent vaults
const configPath = path.join(os.homedir(), ".aivcms-config.json");

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
  } catch (error) {
    console.error("Error loading config:", error);
  }
  return { recentVaults: [] };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Error saving config:", error);
  }
}

function addRecentVault(vaultPath) {
  const config = loadConfig();
  const vaultName = path.basename(vaultPath, ".vcms");

  // Remove existing entry if it exists
  config.recentVaults = config.recentVaults.filter((v) => v.path !== vaultPath);

  // Add to beginning
  config.recentVaults.unshift({
    name: vaultName,
    path: vaultPath,
    lastOpened: new Date().toISOString(),
  });

  // Keep only 10 most recent
  config.recentVaults = config.recentVaults.slice(0, 10);

  saveConfig(config);
  return config.recentVaults;
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
    show: true,
  });

  mainWindow.loadFile("index.html");

  // Open dev tools for debugging
  mainWindow.webContents.openDevTools();
};

// IPC Handlers
ipcMain.handle("get-recent-vaults", () => {
  console.log("Getting recent vaults...");
  const config = loadConfig();
  console.log("Recent vaults:", config.recentVaults);
  return config.recentVaults;
});

ipcMain.handle("create-new-vault", async () => {
  console.log("Creating new vault...");

  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Create New Vault",
      defaultPath: "My Vault",
      buttonLabel: "Create",
    });

    console.log("Save dialog result:", result);

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    let vaultPath = result.filePath;
    if (!vaultPath.endsWith(".vcms")) {
      vaultPath += ".vcms";
    }

    // Create directory
    fs.mkdirSync(vaultPath, { recursive: true });

    // Create vault config
    const vaultConfig = {
      name: path.basename(vaultPath, ".vcms"),
      created: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(vaultPath, "vault.json"),
      JSON.stringify(vaultConfig, null, 2)
    );

    // Create notes folder
    fs.mkdirSync(path.join(vaultPath, "notes"), { recursive: true });

    // Add to recent vaults
    addRecentVault(vaultPath);

    console.log("Vault created successfully:", vaultPath);
    return { success: true, path: vaultPath };
  } catch (error) {
    console.error("Error creating vault:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("open-folder-as-vault", async () => {
  console.log("Opening folder as vault...");

  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select Folder",
      properties: ["openDirectory"],
      buttonLabel: "Select",
    });

    console.log("Open dialog result:", result);

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    const selectedPath = result.filePaths[0];
    let vaultPath = selectedPath;

    if (!selectedPath.endsWith(".vcms")) {
      const parentDir = path.dirname(selectedPath);
      const folderName = path.basename(selectedPath);
      vaultPath = path.join(parentDir, folderName + ".vcms");
      fs.renameSync(selectedPath, vaultPath);
    }

    // Create vault config if it doesn't exist
    const configPath = path.join(vaultPath, "vault.json");
    if (!fs.existsSync(configPath)) {
      const vaultConfig = {
        name: path.basename(vaultPath, ".vcms"),
        created: new Date().toISOString(),
      };
      fs.writeFileSync(configPath, JSON.stringify(vaultConfig, null, 2));
    }

    // Create notes folder if it doesn't exist
    const notesPath = path.join(vaultPath, "notes");
    if (!fs.existsSync(notesPath)) {
      fs.mkdirSync(notesPath, { recursive: true });
    }

    // Add to recent vaults
    addRecentVault(vaultPath);

    console.log("Folder converted to vault:", vaultPath);
    return { success: true, path: vaultPath };
  } catch (error) {
    console.error("Error opening folder as vault:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("open-existing-vault", async () => {
  console.log("Opening existing vault...");

  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select Vault Folder",
      properties: ["openDirectory"],
      buttonLabel: "Open",
    });

    console.log("Open dialog result:", result);

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    const vaultPath = result.filePaths[0];

    // Verify it's a vault or can be made into one
    const configPath = path.join(vaultPath, "vault.json");
    if (!fs.existsSync(configPath)) {
      // Try to create vault config
      const vaultConfig = {
        name: path.basename(vaultPath, ".vcms"),
        created: new Date().toISOString(),
      };
      fs.writeFileSync(configPath, JSON.stringify(vaultConfig, null, 2));
    }

    // Add to recent vaults
    addRecentVault(vaultPath);

    console.log("Existing vault opened:", vaultPath);
    return { success: true, path: vaultPath };
  } catch (error) {
    console.error("Error opening existing vault:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("open-vault", (event, vaultPath) => {
  console.log("Opening vault:", vaultPath);

  try {
    if (!fs.existsSync(vaultPath)) {
      return { success: false, error: "Vault not found" };
    }

    // Store current vault globally
    global.currentVault = {
      path: vaultPath,
      name: path.basename(vaultPath, ".vcms"),
    };

    // Load vault page
    mainWindow.loadFile("vault.html");

    return { success: true };
  } catch (error) {
    console.error("Error opening vault:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("get-current-vault", () => {
  return global.currentVault || null;
});

ipcMain.handle("go-back-to-vault-selection", () => {
  mainWindow.loadFile("index.html");
});

ipcMain.handle("get-vault-contents", (event, vaultPath) => {
  try {
    const notesPath = path.join(vaultPath, "notes");
    const files = [];

    if (fs.existsSync(notesPath)) {
      const items = fs.readdirSync(notesPath);
      for (const item of items) {
        const itemPath = path.join(notesPath, item);
        const stats = fs.statSync(itemPath);
        files.push({
          name: item,
          path: itemPath,
          isDirectory: stats.isDirectory(),
          modified: stats.mtime.toISOString(),
        });
      }
    }

    return { success: true, files };
  } catch (error) {
    console.error("Error getting vault contents:", error);
    return { success: false, error: error.message };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
