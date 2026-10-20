import fs from'node:fs/promises';import path from'node:path';import os from'node:os';import{spawnSync}from'node:child_process';
export const packageName='dsh-pixel-agent-pets';
export const characterIDs=['claude','gpt','deepseek','clawd'];
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-');
export async function exists(p){try{await fs.access(p);return true;}catch{return false;}}
export function profileDirectory(home,profile){if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(profile))throw Error('Invalid DSH profile name');return path.join(home,'profiles',profile);}
export async function installCodex(repo,codexHome){
 const {version}=JSON.parse(await fs.readFile(path.join(repo,'package.json'),'utf8'));
 const pets=path.join(codexHome,'pets'),backup=path.join(codexHome,'pixel-agent-pets-backups',stamp());await fs.mkdir(pets,{recursive:true});const installed=[];
 for(const c of characterIDs){
  const source=path.join(repo,'codex',c);if(!await exists(source))continue;
  const id='pixel-agent-'+c,target=path.join(pets,id),marker=path.join(target,'.pixel-agent-pets.json');
  if(await exists(target)){
   let owned;try{owned=JSON.parse(await fs.readFile(marker,'utf8'));}catch{}
   if(owned?.package!==packageName)throw Error(`Refusing to overwrite another pet: ${target}`);
   await fs.mkdir(backup,{recursive:true});await fs.rename(target,path.join(backup,id));
  }
  const stage=path.join(pets,'.'+id+'.tmp-'+process.pid);if(await exists(stage))throw Error('An unfinished installation exists: '+stage);
  try{await fs.cp(source,stage,{recursive:true});await fs.writeFile(path.join(stage,'.pixel-agent-pets.json'),JSON.stringify({package:packageName,version}));await fs.rename(stage,target);}catch(e){if(await exists(path.join(backup,id))&&!await exists(target))await fs.rename(path.join(backup,id),target);throw e;}
  installed.push({id:'custom:'+id,path:target});
 }
 return installed;
}
export async function uninstallCodex(codexHome){
 const moved=[],backup=path.join(codexHome,'pixel-agent-pets-backups','uninstalled-'+stamp());
 for(const c of characterIDs){const id='pixel-agent-'+c,target=path.join(codexHome,'pets',id);if(!await exists(target))continue;let owned;try{owned=JSON.parse(await fs.readFile(path.join(target,'.pixel-agent-pets.json'),'utf8'));}catch{}if(owned?.package!==packageName)continue;await fs.mkdir(backup,{recursive:true});await fs.rename(target,path.join(backup,id));moved.push(id);}
 return {moved,backup};
}
export async function installDSH(repo,dshHome,profile,{run=spawnSync}={}){
 const dir=profileDirectory(dshHome,profile),file=path.join(dir,'package.json');
 if(!await exists(file))throw Error(`DSH profile ${profile} is missing. Start the official DSH profile once, then run this installer again.`);
 const before=await fs.readFile(file,'utf8');JSON.parse(before);const backups=path.join(dshHome,'pixel-agent-pets-backups');await fs.mkdir(backups,{recursive:true});await fs.writeFile(path.join(backups,profile+'-'+stamp()+'.json'),before);
 const dsh=process.env.PIXEL_PETS_DSH_BIN??'dsh',command=run(dsh,['plugin','--profile',profile,'add',packageName+'@link:'+repo],{stdio:'inherit',shell:false,env:{...process.env,DSH_HOME:dshHome}});
 if(command.error||command.status!==0)throw Error('Official DSH plugin installation failed: '+(command.error?.message??command.status));
 const next=JSON.parse(await fs.readFile(file,'utf8'));next.dsh??={};next.dsh.profile??={};const bundles=next.dsh.profile.bundles??=[];if(!Array.isArray(bundles))throw Error('Unsupported DSH bundle list');next.dsh.profile.bundles=[...new Set([...bundles,packageName])];await fs.writeFile(file,JSON.stringify(next,null,2)+'\n');
 return {profile,package:packageName,configuration:file,restartRequired:true};
}
export async function uninstallDSH(dshHome,profile,{run=spawnSync}={}){
 const file=path.join(profileDirectory(dshHome,profile),'package.json');const next=JSON.parse(await fs.readFile(file,'utf8'));if(next.dsh?.profile?.bundles)next.dsh.profile.bundles=next.dsh.profile.bundles.filter(x=>x!==packageName);await fs.writeFile(file,JSON.stringify(next,null,2)+'\n');
 const result=run(process.env.PIXEL_PETS_DSH_BIN??'dsh',['plugin','--profile',profile,'remove',packageName],{stdio:'inherit',shell:false,env:{...process.env,DSH_HOME:dshHome}});if(result.error||result.status!==0)throw Error('The bundle is disabled; run dsh plugin --profile '+profile+' remove '+packageName+' to finish removing the package.');return {profile,removed:true};
}
export function homes(){return {codex:process.env.CODEX_HOME??path.join(os.homedir(),'.codex'),dsh:process.env.DSH_HOME??path.join(os.homedir(),'.dsh')};}

export async function installFullCompanion(repo,{applications=path.join(os.homedir(),'Applications')}={}){
 const {buildDesktop}=await import('./build-desktop.mjs');const source=await buildDesktop();
 const target=path.join(applications,'Pixel Agent Pets.app'),backups=path.join(os.homedir(),'Library','Application Support','Pixel Agent Pets','backups');await fs.mkdir(applications,{recursive:true});
 if(await exists(target)){let marker;try{marker=JSON.parse(await fs.readFile(path.join(target,'Contents','Resources','pixel-agent-pets.json'),'utf8'));}catch{}if(marker?.package!==packageName)throw Error('An unrelated app exists at '+target);await fs.mkdir(backups,{recursive:true});await fs.rename(target,path.join(backups,'Pixel Agent Pets-'+stamp()+'.app'));}
 await fs.cp(source,target,{recursive:true});const {version}=JSON.parse(await fs.readFile(path.join(repo,'package.json'),'utf8'));await fs.writeFile(path.join(target,'Contents','Resources','pixel-agent-pets.json'),JSON.stringify({package:packageName,version}));
 for(const a of ['com.apple.FinderInfo','com.apple.ResourceFork'])spawnSync('/usr/bin/xattr',['-dr',a,target],{stdio:'ignore'});
 if(spawnSync('/usr/bin/codesign',['--force','--sign','-',target],{stdio:'inherit'}).status!==0)throw Error('App signing failed');
 return {application:target,animations:66,source:'local Codex activity events',launch:'Open Pixel Agent Pets.app in Finder'};
}
export async function uninstallFullCompanion({applications=path.join(os.homedir(),'Applications')}={}){
 const target=path.join(applications,'Pixel Agent Pets.app');if(!await exists(target))return {removed:false};const marker=JSON.parse(await fs.readFile(path.join(target,'Contents','Resources','pixel-agent-pets.json'),'utf8'));if(marker.package!==packageName)throw Error('The app is not owned by this installer');const backup=path.join(os.homedir(),'Library','Application Support','Pixel Agent Pets','backups','uninstalled-'+stamp()+'.app');await fs.mkdir(path.dirname(backup),{recursive:true});await fs.rename(target,backup);return {removed:true,backup};
}
