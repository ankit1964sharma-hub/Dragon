import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
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

async function getGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

async function getAllFiles(dir: string, baseDir: string = dir): Promise<Array<{path: string, content: string}>> {
  const files: Array<{path: string, content: string}> = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  const ignoreDirs = ['node_modules', '.git', '.cache', '.config', '.upm', 'dist', 'build', '.replit-ai'];
  const ignoreFiles = ['.replit', '.env', 'replit.nix', 'dragon-bot-code.tar.gz', 'push-to-github.sh', 'push-to-github-api.ts'];
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    
    if (entry.isDirectory()) {
      if (!ignoreDirs.includes(entry.name)) {
        files.push(...await getAllFiles(fullPath, baseDir));
      }
    } else {
      if (!ignoreFiles.includes(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        files.push({ path: relativePath, content });
      }
    }
  }
  
  return files;
}

async function pushToGitHub() {
  console.log('🔐 Authenticating with GitHub...');
  const octokit = await getGitHubClient();
  
  const owner = 'ankit1964sharma-hub';
  const repo = 'Dragon';
  
  console.log('📂 Collecting files...');
  const files = await getAllFiles('.');
  console.log(`Found ${files.length} files to upload`);
  
  try {
    // Get the current commit SHA (if repo has commits)
    let parentSha: string | undefined;
    try {
      const { data: ref } = await octokit.git.getRef({
        owner,
        repo,
        ref: 'heads/main'
      });
      parentSha = ref.object.sha;
      console.log('📍 Found existing main branch');
    } catch (error) {
      console.log('📍 No existing commits, creating initial commit');
    }
    
    // Create blobs for all files
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
          mode: '100644' as const,
          type: 'blob' as const,
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
      message: 'Discord bot with event tracking, withdrawals, and admin commands\n\nFeatures:\n- Message and catch event tracking\n- Withdrawal system with payment processing\n- Admin commands (Dresetbal, Devent, etc.)\n- Channel validation and error handling',
      tree: tree.sha,
      parents: parentSha ? [parentSha] : []
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
    console.log(`🔗 View at: https://github.com/${owner}/${repo}`);
    
  } catch (error) {
    console.error('❌ Error pushing to GitHub:', error);
    throw error;
  }
}

pushToGitHub().catch(console.error);
