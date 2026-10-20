import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
export const packageName='dsh-pixel-agent-pets';
export const characterIDs=['claude','gpt','deepseek','clawd'];
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8);
const catalogFiles=['pet.json','spritesheet.png','.pixel-agent-export.json'];
export async function exists(p){try{await fs.lstat(p);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
export function profileDirectory(home,profile){if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(profile))throw Error('Invalid DSH profile name');return path.join(home,'profiles',profile);}
function catalogEntries(qualityChoices){
 const entries=characterIDs.map(c=>({c,id:'pixel-agent-'+c,folder:'codex'}));
 if(qualityChoices)for(const c of characterIDs.filter(c=>c!=='clawd'))entries.push({c,id:'pixel-agent-'+c+'-pixel',folder:'codex-pixel'});
 return entries;
}
async function ordinaryDirectory(directory){const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Expected an ordinary pet directory');}
async function regularBytes(file){const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Expected an ordinary pet file');return fs.readFile(file);}
async function catalog(directory){
 await ordinaryDirectory(directory);const files=new Map();for(const name of catalogFiles)files.set(name,await regularBytes(path.join(directory,name)));
 const pet=JSON.parse(files.get('pet.json').toString()),metadata=JSON.parse(files.get('.pixel-agent-export.json').toString()),png=files.get('spritesheet.png'),layout=metadata.layout;
 if(pet.spriteVersionNumber!==1||pet.spritesheetPath!=='spritesheet.png'||typeof pet.displayName!=='string'||!pet.displayName.trim())throw Error('Invalid official pet catalog metadata');
 if(metadata.version!==1||!layout||layout.width!==1536||layout.height!==1872||layout.cellWidth!==192||layout.cellHeight!==208||layout.states!==9||layout.frames!==57||!['hd','pixel','original'].includes(metadata.resolvedQuality))throw Error('Expected the official nine-state, 57-frame compatibility atlas');
 if(png.length<24||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||png.toString('ascii',12,16)!=='IHDR'||png.readUInt32BE(16)!==1536||png.readUInt32BE(20)!==1872)throw Error('Invalid official pet spritesheet dimensions');
 const hash=createHash('sha256');for(const[name,bytes]of files)hash.update(name+'\0').update(bytes);
 return{files,sourceHash:hash.digest('hex'),metadata};
}
async function ownedMarker(target){try{await ordinaryDirectory(target);const value=JSON.parse((await regularBytes(path.join(target,'.pixel-agent-pets.json'))).toString());return value.package===packageName?value:null;}catch{return null;}}
export async function installCodex(repo,codexHome,{qualityChoices=false}={}){
 const {version}=JSON.parse(await fs.readFile(path.join(repo,'package.json'),'utf8')),pets=path.join(codexHome,'pets'),plans=[];
 // Validate every source and collision before changing any pet directory.
 for(const entry of catalogEntries(qualityChoices)){
  const source=await catalog(path.join(repo,entry.folder,entry.c)),target=path.join(pets,entry.id);let skip=false;
  if(await exists(target)){
   if(!await ownedMarker(target))throw Error('Refusing to overwrite another pet: '+target);
   try{skip=(await catalog(target)).sourceHash===source.sourceHash;}catch{}
  }
  plans.push({...entry,source,target,skip});
 }
 if(plans.every(plan=>plan.skip))return plans.map(plan=>({id:'custom:'+plan.id,path:plan.target,changed:false}));
 await fs.mkdir(pets,{recursive:true});await ordinaryDirectory(pets);
 const backup=path.join(codexHome,'pixel-agent-pets-backups',stamp()),installed=[];
 for(const plan of plans){
  const {id,target,source}=plan;if(plan.skip){installed.push({id:'custom:'+id,path:target,changed:false});continue;}
  const stage=await fs.mkdtemp(path.join(pets,'.'+id+'.tmp-'));let previous;
  try{
   for(const[name,bytes]of source.files)await fs.writeFile(path.join(stage,name),bytes,{mode:0o644});
   await fs.writeFile(path.join(stage,'.pixel-agent-pets.json'),JSON.stringify({package:packageName,version,sourceHash:source.sourceHash})+'\n',{mode:0o644});
   if(await exists(target)){if(!await ownedMarker(target))throw Error('Refusing to overwrite another pet: '+target);await fs.mkdir(backup,{recursive:true});previous=path.join(backup,id);await fs.rename(target,previous);}
   await fs.rename(stage,target);installed.push({id:'custom:'+id,path:target,changed:true});
  }catch(error){if(previous&&!await exists(target))await fs.rename(previous,target);throw error;}
  finally{await fs.rm(stage,{recursive:true,force:true});}
 }
 return installed;
}
export async function doctorCodexInstallation(repo,codexHome,{qualityChoices=true}={}){
 const pets=[];
 for(const entry of catalogEntries(qualityChoices)){
  const target=path.join(codexHome,'pets',entry.id),owned=!!await ownedMarker(target);let valid=false,matchesSource=false,quality;
  try{const installed=await catalog(target);valid=true;quality=installed.metadata.resolvedQuality;matchesSource=installed.sourceHash===(await catalog(path.join(repo,entry.folder,entry.c))).sourceHash;}catch{}
  pets.push({id:'custom:'+entry.id,owned,valid,matchesSource,...(quality?{quality}:{})});
 }
 return{ok:pets.every(pet=>pet.owned&&pet.valid&&pet.matchesSource),mode:'official-nine-state-catalog',expectedPets:pets.length,installedPets:pets.filter(pet=>pet.owned&&pet.valid).length,states:9,frames:57,fullAnimations:false,runtimeVerified:false,pets};
}
export async function uninstallCodex(codexHome){
 const moved=[],backup=path.join(codexHome,'pixel-agent-pets-backups','uninstalled-'+stamp());
 for(const {id}of catalogEntries(true)){const target=path.join(codexHome,'pets',id);if(!await ownedMarker(target))continue;await fs.mkdir(backup,{recursive:true});await fs.rename(target,path.join(backup,id));moved.push(id);}
 return{moved,backup:moved.length?backup:null};
}
export async function installDSH(repo,dshHome,profile,{run=spawnSync}={}){
 const dir=profileDirectory(dshHome,profile),file=path.join(dir,'package.json');
 if(!await exists(file))throw Error(`DSH profile ${profile} is missing. Start the official DSH profile once, then run this installer again.`);
 const before=await fs.readFile(file,'utf8');JSON.parse(before);const backups=path.join(dshHome,'pixel-agent-pets-backups');await fs.mkdir(backups,{recursive:true});await fs.writeFile(path.join(backups,profile+'-'+stamp()+'.json'),before);
 const command=run(process.env.PIXEL_PETS_DSH_BIN??'dsh',['plugin','--profile',profile,'add',packageName+'@link:'+repo],{stdio:'inherit',shell:false,env:{...process.env,DSH_HOME:dshHome}});
 if(command.error||command.status!==0)throw Error('Official DSH plugin installation failed: '+(command.error?.message??command.status));
 const next=JSON.parse(await fs.readFile(file,'utf8'));next.dsh??={};next.dsh.profile??={};const bundles=next.dsh.profile.bundles??=[];if(!Array.isArray(bundles))throw Error('Unsupported DSH bundle list');next.dsh.profile.bundles=[...new Set([...bundles,packageName])];await fs.writeFile(file,JSON.stringify(next,null,2)+'\n');
 return{profile,package:packageName,configuration:file,restartRequired:true};
}
export async function uninstallDSH(dshHome,profile,{run=spawnSync}={}){
 const file=path.join(profileDirectory(dshHome,profile),'package.json'),next=JSON.parse(await fs.readFile(file,'utf8'));if(next.dsh?.profile?.bundles)next.dsh.profile.bundles=next.dsh.profile.bundles.filter(x=>x!==packageName);await fs.writeFile(file,JSON.stringify(next,null,2)+'\n');
 const result=run(process.env.PIXEL_PETS_DSH_BIN??'dsh',['plugin','--profile',profile,'remove',packageName],{stdio:'inherit',shell:false,env:{...process.env,DSH_HOME:dshHome}});if(result.error||result.status!==0)throw Error('Official DSH plugin removal failed');return{profile,removed:true};
}
export function homes(){return{codex:process.env.CODEX_HOME??path.join(os.homedir(),'.codex'),dsh:process.env.DSH_HOME??path.join(os.homedir(),'.dsh')};}
