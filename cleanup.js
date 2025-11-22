import fs from 'fs';
import path from 'path';

// UI components you're using
const usedComponents = ['avatar', 'separator', 'scroll-area', 'toaster'];

// Remove unused UI components
const uiDir = 'client/src/components/ui';
const files = fs.readdirSync(uiDir);
files.forEach(file => {
  const baseName = file.replace('.jsx', '').toLowerCase();
  if (!usedComponents.includes(baseName)) {
    fs.unlinkSync(path.join(uiDir, file));
    console.log(`✅ Removed: ${file}`);
  }
});

console.log('\n✅ Cleanup complete!');
console.log('Kept components: avatar, separator, scroll-area, toaster');
