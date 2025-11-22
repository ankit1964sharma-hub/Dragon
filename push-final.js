import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

let connectionSettings;

async function getAccessToken() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

async function getAllFiles(dir, baseDir = dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  const ignoreDirs = ['node_modules', '.git', '.cache', '.config', '.upm', 'dist', 'build', '.replit-ai'];
  const ignoreFiles = ['.replit', '.env', 'replit.nix', 'push-to-github-api.ts', 'init-github-repo.ts', 'verify-github.ts', 'push-final.js'];
  
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
    message: 'Convert to pure JavaScript - removed TypeScript\n\n✅ All features tested and working:\n- Discord bot successfully logs in and is ready\n- Message tracking fully functional\n- Pokémon catch detection and counting\n- Withdrawal system with market ID modal\n- Payment processing with proofs channel\n- All admin commands: event toggles, balance reset, rate setting\n- API endpoints: /api/users, /api/settings, /api/messages\n- Anti-spam protection enabled\n- Channel configuration and validation\n\n🚀 Deployment ready:\n- Pure Node.js runtime\n- No TypeScript compilation needed\n- Smaller footprint, easier to host anywhere\n- All dependencies included and compatible',
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
  console.log(`🔗 https://github.com/${owner}/${repo}`);
}

pushToGitHub().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
