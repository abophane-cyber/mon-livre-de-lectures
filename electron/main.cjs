// Logiciel Windows (.exe) : une fenêtre qui affiche l'appli, entièrement en local.
// Les fichiers de l'appli (dossier dist-native) sont servis à l'adresse app://lectures/,
// les fiches restent dans le dossier de données de l'appli sur ce PC.

const { app, BrowserWindow, Menu, protocol, net, shell, session, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', 'dist-native');
const ORIGIN = 'app://lectures';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// Une seule fenêtre à la fois : relancer le logiciel ramène la fenêtre déjà ouverte.
if (!app.requestSingleInstanceLock()) app.quit();

let win;

function uniquePath(dir, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = path.join(dir, filename);
  for (let n = 1; fs.existsSync(candidate); n++) candidate = path.join(dir, `${base} (${n})${ext}`);
  return candidate;
}

// Sauvegarde automatique : fichiers chiffrés dans Téléchargements\Mon livre de lectures - sauvegardes.
// (Pas dans Documents : Windows peut y bloquer les logiciels, « Accès contrôlé aux dossiers ».)
// On garde les 10 plus récents.
const BACKUP_KEEP = 10;
const BACKUP_PREFIX = 'Sauvegarde automatique_';
const backupDir = () => path.join(app.getPath('downloads'), 'Mon livre de lectures - sauvegardes');

async function saveBackup(name, text) {
  if (typeof name !== 'string' || !name.startsWith(BACKUP_PREFIX) || !/^[^\\/:*?"<>|]+\.json$/.test(name)) throw new Error('Nom refusé');
  if (typeof text !== 'string' || text.length > 200 * 1024 * 1024) throw new Error('Contenu refusé');
  const fsp = fs.promises;
  const dir = backupDir();
  await fsp.mkdir(dir, { recursive: true });
  // Écrire d'abord dans un fichier temporaire : une coupure ne laisse jamais de fichier à moitié écrit.
  const tmp = path.join(dir, `.${name}.tmp`);
  await fsp.writeFile(tmp, text, 'utf8');
  await fsp.rename(tmp, path.join(dir, name));
  const files = (await fsp.readdir(dir)).filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith('.json'));
  const dated = await Promise.all(files.map(async (f) => ({ f, t: (await fsp.stat(path.join(dir, f))).mtimeMs })));
  for (const { f } of dated.sort((a, b) => b.t - a.t).slice(BACKUP_KEEP)) await fsp.rm(path.join(dir, f), { force: true });
  return dir;
}

ipcMain.handle('backup:save', (_e, name, text) => saveBackup(name, text));
ipcMain.handle('backup:folder', () => backupDir());
ipcMain.handle('backup:open', async () => {
  await fs.promises.mkdir(backupDir(), { recursive: true });
  return shell.openPath(backupDir());
});

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 380,
    title: 'Mon livre de lectures',
    backgroundColor: '#f7f3ea',
    icon: path.join(ROOT, 'pwa-512x512.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  win.webContents.session.setSpellCheckerLanguages(['fr']);

  // « Ouvrir ChatGPT / Claude » : dans le navigateur habituel, jamais dans le logiciel.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) {
      e.preventDefault();
      if (/^https:\/\//.test(url)) shell.openExternal(url);
    }
  });

  // Clic droit : Couper, Copier, Coller…
  win.webContents.on('context-menu', (_e, p) => {
    const items = [];
    if (p.misspelledWord && p.dictionarySuggestions.length) {
      for (const s of p.dictionarySuggestions.slice(0, 5)) items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) });
      items.push({ type: 'separator' });
    }
    if (p.isEditable) items.push({ label: 'Couper', role: 'cut' });
    if (p.isEditable || p.selectionText) items.push({ label: 'Copier', role: 'copy' });
    if (p.isEditable) items.push({ label: 'Coller', role: 'paste' }, { type: 'separator' });
    items.push({ label: 'Tout sélectionner', role: 'selectAll' });
    Menu.buildFromTemplate(items).popup({ window: win });
  });

  win.loadURL(`${ORIGIN}/index.html`);
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  // Fichiers de l'appli, sans jamais sortir du dossier dist-native.
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
    if (!file.startsWith(ROOT)) return new Response('Interdit', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

  // Les fichiers créés (sauvegardes, PDF) vont directement dans Téléchargements, comme dans un navigateur.
  session.defaultSession.on('will-download', (_e, item) => {
    item.setSavePath(uniquePath(app.getPath('downloads'), item.getFilename()));
  });

  // Aucune autorisation spéciale, sauf lire/écrire le presse-papiers (boutons Copier et Coller).
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'clipboard-read' || permission === 'clipboard-sanitized-write');
  });

  Menu.setApplicationMenu(null);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
