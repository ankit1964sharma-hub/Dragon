import { Octokit } from '@octokit/rest';
import * as fs from 'fs';

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

async function initializeRepo() {
  console.log('🔐 Authenticating with GitHub...');
  const octokit = await getGitHubClient();
  
  const owner = 'ankit1964sharma-hub';
  const repo = 'Dragon';
  
  console.log('📝 Creating initial README.md...');
  const readmeContent = fs.readFileSync('replit.md', 'utf-8');
  
  try {
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: 'README.md',
      message: 'Initial commit: Add README',
      content: Buffer.from(readmeContent).toString('base64'),
    });
    
    console.log('✅ Repository initialized with README!');
    console.log('🔗 View at: https://github.com/' + owner + '/' + repo);
    console.log('');
    console.log('Now run: tsx push-to-github-api.ts');
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

initializeRepo().catch(console.error);
