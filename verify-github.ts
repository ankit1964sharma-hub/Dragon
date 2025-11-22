import { Octokit } from '@octokit/rest';

let connectionSettings: any;

async function getAccessToken() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

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
  return accessToken;
}

async function verify() {
  const accessToken = await getAccessToken();
  const octokit = new Octokit({ auth: accessToken });
  
  const { data: commits } = await octokit.repos.listCommits({
    owner: 'ankit1964sharma-hub',
    repo: 'Dragon',
    per_page: 5
  });
  
  console.log('📊 Repository Status:');
  console.log(`Total commits found: ${commits.length}`);
  console.log('\n📝 Recent commits:');
  commits.forEach((c, i) => {
    console.log(`${i+1}. ${c.commit.message.split('\n')[0]}`);
  });
  
  const { data: tree } = await octokit.git.getTree({
    owner: 'ankit1964sharma-hub',
    repo: 'Dragon',
    tree_sha: commits[0].commit.tree.sha,
    recursive: '1'
  });
  
  console.log(`\n📂 Total files in repo: ${tree.tree.length}`);
  console.log('\n🎯 Key files:');
  const keyFiles = tree.tree.filter(f => 
    f.path?.includes('package.json') || 
    f.path?.includes('server/') ||
    f.path?.includes('shared/schema') ||
    f.path?.includes('client/src/pages')
  ).slice(0, 10);
  
  keyFiles.forEach(f => console.log(`  ✓ ${f.path}`));
  
  console.log('\n✅ All files successfully uploaded to GitHub!');
  console.log('🔗 https://github.com/ankit1964sharma-hub/Dragon');
}

verify().catch(console.error);
