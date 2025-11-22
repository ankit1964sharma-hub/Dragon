import * as fs from 'fs';
import * as path from 'path';

function convertTypeScriptToJavaScript(content, filename) {
  // Remove TypeScript-specific syntax
  let js = content;
  
  // Remove 'as const' assertions
  js = js.replace(/\s+as\s+const\b/g, '');
  
  // Remove type imports
  js = js.replace(/import\s+type\s+{[^}]*}\s+from\s+["'][^"']*["'];?/g, '');
  
  // Convert interface to comment
  js = js.replace(/export\s+interface\s+(\w+)[^{]*{[^}]*}/gs, (match) => {
    return `// ${match}`;
  });
  
  // Remove generic type parameters from component definitions
  js = js.replace(/<[A-Z]\w*(?:\s*,\s*[A-Z]\w*)*>/g, (match) => {
    // Keep React.FC<Props> style but remove the <Props> part
    return '';
  });
  
  // Remove type annotations from function parameters
  js = js.replace(/:\s*(?:React\.)?(?:FC|ReactNode|ReactElement|PropsWithChildren)<[^>]*>/g, '');
  js = js.replace(/:\s*(?:string|number|boolean|any|void|unknown|never|object|Function|Object|Array<[^>]*>|[A-Z]\w*(?:\[[^\]]*\])?)/g, '');
  
  // Remove type declarations in variable assignments
  js = js.replace(/:\s*typeof\s+\w+/g, '');
  
  // Clean up import statement TypeScript remnants
  js = js.replace(/import\s*{\s*type\s+/g, 'import { ');
  
  // Remove readonly keyword
  js = js.replace(/\breadonly\s+/g, '');
  
  // Remove generic type parameters on function calls
  js = js.replace(/(\w+)<[A-Z]\w*>/g, '$1');
  
  // Clean up double spaces that might have been created
  js = js.replace(/\s{2,}/g, ' ');
  
  return js;
}

async function convertFile(filePath) {
  const ext = path.extname(filePath);
  if (ext !== '.ts' && ext !== '.tsx') return;
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const newExt = ext === '.tsx' ? '.jsx' : '.js';
  const newPath = filePath.replace(/\.(tsx?|ts)$/, newExt);
  
  const converted = convertTypeScriptToJavaScript(content, path.basename(filePath));
  fs.writeFileSync(newPath, converted, 'utf-8');
  fs.unlinkSync(filePath);
  
  return { from: filePath, to: newPath };
}

async function convertAllFiles() {
  const files = [
    'client/src/App.tsx',
    'client/src/main.tsx',
    'client/src/pages/chat-interface.tsx',
    'client/src/pages/not-found.tsx',
    'client/src/lib/utils.ts',
    'client/src/lib/queryClient.ts',
    'client/src/hooks/use-toast.ts',
    'client/src/hooks/use-mobile.tsx',
  ];
  
  for (const file of files) {
    try {
      const result = await convertFile(file);
      if (result) {
        console.log(`✅ ${path.basename(result.from)} → ${path.basename(result.to)}`);
      }
    } catch (err) {
      console.error(`❌ ${file}: ${err.message}`);
    }
  }
  
  // Convert all UI components
  const uiDir = 'client/src/components/ui';
  if (fs.existsSync(uiDir)) {
    const uiFiles = fs.readdirSync(uiDir).filter(f => f.endsWith('.tsx'));
    for (const file of uiFiles) {
      const fullPath = path.join(uiDir, file);
      try {
        const result = await convertFile(fullPath);
        if (result) {
          console.log(`✅ ${path.basename(result.from)} → ${path.basename(result.to)}`);
        }
      } catch (err) {
        console.error(`❌ ${fullPath}: ${err.message}`);
      }
    }
  }
  
  console.log('\n✨ Conversion complete!');
}

convertAllFiles().catch(console.error);
