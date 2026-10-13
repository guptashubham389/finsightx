import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
process.on('uncaughtException', error => { console.error(error.message); process.exitCode=1; });
const run = (cmd,args,options={}) => {
  const result=spawnSync(cmd,args,{stdio:'inherit',...options});
  if(result.status!==0) throw new Error(`${cmd} failed. Nothing further will be published.`);
  return result;
};
const check = (cmd,args)=>spawnSync(cmd,args,{stdio:'ignore'}).status===0;
const repo='finsightx';
run('gh',['auth','status']);
run('npm',['run','check']);
run('npm',['test']);
run('npm',['run','build']);
const tracked=['.gitignore','README.md','DESIGN.md','IDEA_SCOPE.md','product.md','GMAIL_SETUP.md','package.json','package-lock.json','playwright.config.ts','convex','scripts','tests'];
if(!check('git',['rev-parse','--git-dir'])) run('git',['init','-b','main']);
const remote=spawnSync('git',['remote','get-url','origin'],{encoding:'utf8'});
if(remote.status===0 && !remote.stdout.trim().match(/[:/]finsightx(?:\.git)?$/)) throw new Error('The existing GitHub destination is not finsightx. Shipping stopped.');
run('git',['add','--',...tracked.filter(p=>existsSync(p))]);
if(!check('git',['diff','--cached','--quiet'])) run('git',['commit','-m','add FinSightX salary and spending screens']);
if(remote.status!==0) {
  if(check('gh',['repo','view',repo])) throw new Error('A finsightx repository already exists. Connect this folder to the correct repository before shipping.');
  run('gh',['repo','create',repo,'--public','--source=.','--remote=origin','--push']);
} else {
  const visibility=spawnSync('gh',['repo','view','--json','visibility','--jq','.visibility'],{encoding:'utf8'});
  if(visibility.status!==0 || visibility.stdout.trim()!=='PUBLIC') throw new Error('The connected repository is not public. Shipping stopped.');
  run('git',['push','-u','origin','HEAD']);
}
// Configure hosting only after the source is on GitHub, as requested.
run('npm',['run','setup:hosting']);
run('git',['add','--',...tracked.filter(p=>existsSync(p))]);
if(!check('git',['diff','--cached','--quiet'])) run('git',['commit','-m','host FinSightX with Convex static hosting']);
run('git',['push','origin','HEAD']);
run('npm',['run','deploy']);
console.log('GitHub and Convex upload finished. Check Connect Gmail and saving a transaction in the live browser.');
