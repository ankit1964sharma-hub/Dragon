import { Octokit } from '@octokit/rest';
import * as fs from 'fs';

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

async function push() {
  const token = await getAccessToken();
  const octokit = new Octokit({ auth: token });
  
  const content = fs.readFileSync('replit.md', 'utf-8');
  const { data: ref } = await octokit.git.getRef({
    owner: 'ankit1964sharma-hub',
    repo: 'Dragon',
    ref: 'heads/main'
  });
  
  const { data: commit } = await octokit.repos.getCommit({
    owner: 'ankit1964sharma-hub',
    repo: 'Dragon',
    ref: 'main'
  });
  
  const { data: blob } = await octokit.git.createBlob({
    owner: 'ankit1964sharma-hub',
    repo: 'Dragon',
    content: Buffer.from(content).toString('base64'),
    encoding: 'base64'
  });
  
  const { data: tree } = await octokit.git.createTree({
    owner: 'ankit1964sharma-hub',
    repo: 'Dragon',
    tree: [{ path: 'replit.md', mode: '100644', type: 'blob', sha: blob.sha }],
    base_tree: commit.commit.tree.sha
  });
  
  const { data: newCommit } = await octokit.git.createCommit({
    owner: 'ankit1964sharma-hub',
    repo: 'Dragon',
    message: 'Update documentation: Complete JavaScript conversion (60 React components JSX + server JS)',
    tree: tree.sha,
    parents: [commit.sha]
  });
  
  await octokit.git.updateRef({
    owner: 'ankit1964sharma-hub',
    repo: 'Dragon',
    ref: 'heads/main',
    sha: newCommit.sha
  });
  
  console.log('✅ Documentation updated on GitHub!');
}

push().catch(console.error);
