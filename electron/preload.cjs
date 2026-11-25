// Logiciel Windows : les seules choses que l'appli peut demander à l'ordinateur :
// la sauvegarde automatique (écrire le fichier chiffré, ouvrir le dossier des sauvegardes)
// et « Envoyer par Quick Share » (enregistrer le fichier et le montrer dans l'Explorateur).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lecturesPC', {
  saveBackup: (name, text) => ipcRenderer.invoke('backup:save', name, text),
  backupFolder: () => ipcRenderer.invoke('backup:folder'),
  openBackupFolder: () => ipcRenderer.invoke('backup:open'),
  saveAndShow: (name, text) => ipcRenderer.invoke('file:saveAndShow', name, text),
});
