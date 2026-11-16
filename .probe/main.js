const { app } = require('electron');
console.log('BOOT');
app.whenReady().then(() => {
  console.log('READY');
  setTimeout(() => { console.log('DONE'); app.quit(); }, 3000);
});
app.on('window-all-closed', () => {});
