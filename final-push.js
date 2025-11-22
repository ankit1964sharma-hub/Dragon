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
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );
  const data = await res.json();
  const connectionSettings = data.items?.[0];
  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;
  return accessToken;
}

async function getAllFiles(dir, baseDir = dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  const ignoreDirs = ['node_modules', '.git', '.cache', '.config', '.upm', 'dist', 'build', '.replit-ai'];
  const ignoreFiles = ['.replit', '.env', 'replit.nix', 'final-push.js', 'convert-to-js.js'];
  
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

async function pushToGitHub() {
  console.log('🔐 Authenticating with GitHub...');
  const accessToken = await getAccessToken();
  const octokit = new Octokit({ auth: accessToken });
  
  const owner = 'ankit1964sharma-hub';
  const repo = 'Dragon';
  
  console.log('📂 Collecting files...');
  const files = await getAllFiles('.');
  console.log(`Found ${files.length} files to upload`);
  
  const { data: ref } = await octokit.git.getRef({
    owner,
    repo,
    ref: 'heads/main'
  });
  const parentSha = ref.object.sha;
  
  console.log('📦 Creating file blobs...');
  const blobs = await Promise.all(
    files.map(async (file) => {
      const { data: blob } = await octokit.git.createBlob({
        owner,
        repo,
        content: Buffer.from(file.content).toString('base64'),
        encoding: 'base64'
      });
      return {
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha
      };
    })
  );
  
  console.log('🌳 Creating tree...');
  const { data: tree } = await octokit.git.createTree({
    owner,
    repo,
    tree: blobs
  });
  
  console.log('💾 Creating commit...');
  const { data: commit } = await octokit.git.createCommit({
    owner,
    repo,
    message: 'Convert frontend React to pure JavaScript - 100% JS project\n\n✅ Complete Conversion:\n- All backend: server/*.js - pure Node.js\n- All frontend: client/src/**/*.jsx - JavaScript React components\n- Removed all .tsx files\n- Removed TypeScript compilation from runtime\n- Vite handles JSX transformation\n\n✅ Full Feature Set:\n- Discord bot fully functional\n- Message tracking and catch detection\n- Withdrawal system with payment processing\n- Admin commands and event toggles\n- All API endpoints working\n- Web dashboard operational\n\n🚀 Benefits:\n- Pure JavaScript - runs on any Node.js\n- No TypeScript compilation overhead\n- Smaller bundle size\n- Easier to host and deploy\n- GitHub now shows 100% JavaScript',
    tree: tree.sha,
    parents: [parentSha]
  });
  
  console.log('🚀 Updating main branch...');
  await octokit.git.updateRef({
    owner,
    repo,
    ref: 'heads/main',
    sha: commit.sha,
    force: true
  });
  
  console.log('✅ Successfully pushed to GitHub!');
}

pushToGitHub().catch(console.error);
