import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

async function getAccessToken() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  const res = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    { headers: { 'Accept': 'application/json', 'X_REPLIT_TOKEN': xReplitToken } }
  );
  const data = await res.json();
  return data.items?.[0]?.settings?.access_token || data.items?.[0]?.settings?.oauth?.credentials?.access_token;
}

async function getAllFiles(dir, baseDir = dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const ignoreDirs = ['node_modules', '.git', '.cache', '.config', '.upm', 'dist', 'build', '.replit-ai'];
  const ignoreFiles = ['.replit', '.env', 'replit.nix', 'push-clean.js', 'final-clean-push.js'];
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    
    if (entry.isDirectory()) {
      if (!ignoreDirs.includes(entry.name)) {
        files.push(...await getAllFiles(fullPath, baseDir));
      }
    } else {
      if (!ignoreFiles.includes(entry.name) && !entry.name.endsWith('.tar.gz')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        files.push({ path: relativePath, content });
      }
    }
  }
  return files;
}

async function push() {
  const token = await getAccessToken();
  const octokit = new Octokit({ auth: token });
  
  const files = await getAllFiles('.');
  console.log(`📂 ${files.length} files`);
  
  const { data: ref } = await octokit.git.getRef({
    owner: 'ankit1964sharma-hub', repo: 'Dragon', ref: 'heads/main'
  });
  
  const blobs = await Promise.all(files.map(async (file) => {
    const { data: blob } = await octokit.git.createBlob({
      owner: 'ankit1964sharma-hub', repo: 'Dragon',
      content: Buffer.from(file.content).toString('base64'), encoding: 'base64'
    });
    return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha };
  }));
  
  const { data: tree } = await octokit.git.createTree({
    owner: 'ankit1964sharma-hub', repo: 'Dragon', tree: blobs
  });
  
  const { data: commit } = await octokit.git.createCommit({
    owner: 'ankit1964sharma-hub', repo: 'Dragon',
    message: 'Clean build: Remove temporary shell scripts\n\nNote: HTML/CSS files are necessary for Vite build process only.\nAt deployment:\n- npm run build (compiles HTML/CSS to dist/)\n- npm start (runs pure Node.js server)\n\nProduction deployment uses only dist/ folder with pure JavaScript.',
    tree: tree.sha, parents: [ref.object.sha]
  });
  
  await octokit.git.updateRef({
    owner: 'ankit1964sharma-hub', repo: 'Dragon',
    ref: 'heads/main', sha: commit.sha, force: true
  });
  
  console.log('✅ Pushed to GitHub');
  console.log('🔗 https://github.com/ankit1964sharma-hub/Dragon');
}

push().catch(console.error);
