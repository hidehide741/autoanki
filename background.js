import StorageManager from './storage.js';

// インストール時に初期データをセットアップする
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await StorageManager.initDemoData();
    console.log("AutoAnki: Initial data loaded.");
  }
});
