// Logiciel Windows : les deux seules choses que l'appli peut demander à l'ordinateur,
// pour la sauvegarde automatique (écrire le fichier chiffré, ouvrir le dossier des sauvegardes).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lecturesPC', {
  saveBackup: (name, text) => ipcRenderer.invoke('backup:save', name, text),
  backupFolder: () => ipcRenderer.invoke('backup:folder'),
  openBackupFolder: () => ipcRenderer.invoke('backup:open'),
});
