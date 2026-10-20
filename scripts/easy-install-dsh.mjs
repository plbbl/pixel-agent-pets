#!/usr/bin/env node
/** Prebuilt-package entry point. Node built-ins only; never compiles or starts DSH. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {installDSH,uninstallDSH as removeDSH,packageName,profileDirectory} from './install-lib.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const profileFiles=['package.json','cordis.yml','cordis.yaml','cordis.patch.yml','cordis.patch.yaml','pnpm-workspace.yaml','pnpm-lock.yaml','package-lock.json','npm-shrinkwrap.json','yarn.lock'];
const immutableFiles=['cordis.yml','cordis.yaml','cordis.patch.yml','cordis.patch.yaml','pnpm-workspace.yaml'];
const ownDependency=spec=>typeof spec==='string'&&/^(link:|file:)/.test(spec);
async function readJSON(file){return JSON.parse(await fs.readFile(file,'utf8'));}
async function isFile(file){try{return(await fs.stat(file)).isFile();}catch{return false;}}
function kindOf(pkg){const bundles=pkg.dsh?.profile?.bundles??[];return bundles.includes('@deepseek-ai/dsh-web-app')?'web':bundles.includes('@deepseek-ai/dsh-headless')?'headless':'custom';}

export async function discoverDSHProfiles(dshHome){
 let entries;try{entries=await fs.readdir(path.join(dshHome,'profiles'),{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return[];throw error;}
 const found=[];
 for(const entry of entries){
  if(!entry.isDirectory()||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(entry.name))continue;
  try{const pkg=await readJSON(path.join(profileDirectory(dshHome,entry.name),'package.json'));if(!pkg||typeof pkg!=='object'||Array.isArray(pkg)||!pkg.dsh?.profile||typeof pkg.dsh.profile!=='object')continue;const bundles=pkg.dsh.profile.bundles??[];if(!Array.isArray(bundles)||!bundles.every(x=>typeof x==='string'))continue;found.push({name:entry.name,kind:kindOf(pkg)});}catch{}
 }
 return found.sort((a,b)=>a.name.localeCompare(b.name,'en'));
}
export async function selectDSHProfile(profiles,{profile,interactive=false,choose}={}){
 if(profile!==undefined){profileDirectory('',profile);const selected=profiles.find(item=>item.name===profile);if(!selected)throw Error('指定的 DSH profile 不存在。请先用官方 DSH 启动它一次。');if(selected.kind==='headless')throw Error('这个 profile 只运行终端界面。请为宠物选择已经启动过的 DSH 网页 profile。');return selected.name;}
 const eligible=profiles.filter(item=>item.kind!=='headless');
 if(!eligible.length)throw Error('没有找到已有的 DSH 网页 profile。请先启动官方 DSH 网页版一次，再重新打开安装器。');
 if(eligible.length===1)return eligible[0].name;
 if(!interactive||typeof choose!=='function')throw Error('找到多个 DSH 网页 profile。请在终端运行安装器并选择，或添加 --profile 名称。可选：'+eligible.map(item=>item.name).join('、'));
 const selected=await choose(eligible.map(item=>({...item})));
 if(typeof selected!=='string'||!eligible.some(item=>item.name===selected))throw Error('未选择有效的 DSH profile，安装未开始。');
 return selected;
}
export async function verifyPrebuiltDSHPackage(repo){
 const pkg=await readJSON(path.join(repo,'package.json'));if(pkg.name!==packageName)throw Error('这不是完整的抱抱龙宠物安装包。');
 for(const file of ['dist/client.js','dist/index.js','scripts/hd-asset-route.mjs','cordis.patch.yml'])if(!await isFile(path.join(repo,file)))throw Error('安装包缺少已构建文件。请下载 Releases 中的完整安装包，不需要手动 npm install。');
 const hdRoot=path.join(repo,'assets-hd');let manifest;try{manifest=await readJSON(path.join(hdRoot,'manifest.json'));}catch{throw Error('安装包缺少高清图集。请重新下载完整安装包。');}
 if(manifest.version!==1||!manifest.characters)throw Error('高清图集版本不受支持。');
 let actions=0,images=0;
 for(const[character,pack]of Object.entries(manifest.characters)){
  if(!['claude','gpt','deepseek'].includes(character)||!pack?.animations)throw Error('高清图集目录不正确。');
  for(const[action,levels]of Object.entries(pack.animations)){
   if(!/^[A-Za-z0-9_-]+$/.test(action))throw Error('高清图集动作名称不正确。');actions++;
   for(const[level,a]of Object.entries(levels)){
    if(!['160','320'].includes(level)||!Array.isArray(a.files)||!a.files.length)throw Error('高清图集内容不完整。');
    for(const file of a.files){const prefix=character+'/'+action+'/';if(typeof file!=='string'||!file.startsWith(prefix)||!new RegExp('^'+level+'-\\d+\\.png$').test(file.slice(prefix.length))||!await isFile(path.join(hdRoot,file)))throw Error('高清图集文件缺失或路径不正确。');images++;}
   }
  }
 }
 if(!actions||!images)throw Error('高清图集为空。');
 return{version:pkg.version,prebuilt:true,hd:true,actions,images};
}
export async function doctorDSHInstallation(repo,dshHome,profile,{packageStatus}={}){
 const dir=profileDirectory(dshHome,profile);let pkg;try{pkg=await readJSON(path.join(dir,'package.json'));}catch{return{ok:false,profile,enabled:false,linked:false,prebuilt:false,hd:false,runtimeVerified:false};}
 const enabled=pkg.dsh?.profile?.bundles?.includes(packageName)===true,spec=pkg.dependencies?.[packageName];let linked=false;
 if(ownDependency(spec)){
  try{const actual=await fs.realpath(repo),declared=await fs.realpath(path.resolve(dir,spec.replace(/^(link:|file:)/,''))),installed=await fs.realpath(path.join(dir,'node_modules',packageName));linked=declared===actual&&installed===actual;}catch{}
 }
 let status=packageStatus;try{status??=await verifyPrebuiltDSHPackage(repo);}catch{}
 return{ok:enabled&&linked&&status?.prebuilt===true&&status?.hd===true,profile,enabled,linked,prebuilt:status?.prebuilt===true,hd:status?.hd===true,runtimeVerified:false};
}
async function snapshotProfile(dshHome,profile){
 const dir=profileDirectory(dshHome,profile),folder=path.join(dshHome,'pixel-agent-pets-backups','easy-'+profile+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid);
 await fs.mkdir(folder,{recursive:true,mode:0o700});const files=new Map();
 for(const name of profileFiles){let bytes=null;try{bytes=await fs.readFile(path.join(dir,name));}catch(error){if(error.code!=='ENOENT')throw error;}files.set(name,bytes);if(bytes){await fs.writeFile(path.join(folder,name),bytes,{mode:0o600});}}
 await fs.writeFile(path.join(folder,'backup.json'),JSON.stringify({package:packageName,profile,files:[...files].filter(([,bytes])=>bytes!==null).map(([file])=>file)},null,2)+'\n',{mode:0o600});
 return{dir,folder,files};
}
async function restoreProfile(snapshot){
 for(const[name,bytes]of snapshot.files){const target=path.join(snapshot.dir,name);if(bytes!==null)await fs.writeFile(target,bytes);else{try{await fs.rename(target,path.join(snapshot.folder,'failed-created-'+name));}catch(error){if(error.code!=='ENOENT')throw error;}}}
}
function withoutOwn(pkg){
 const value=JSON.parse(JSON.stringify(pkg));
 for(const key of ['dependencies','devDependencies','optionalDependencies'])if(value[key]){delete value[key][packageName];if(!Object.keys(value[key]).length)delete value[key];}
 if(value.dsh?.profile?.bundles)value.dsh.profile.bundles=value.dsh.profile.bundles.filter(name=>name!==packageName);
 return value;
}
async function verifyUnrelatedProfileUnchanged(snapshot){
 const before=JSON.parse(snapshot.files.get('package.json').toString()),after=await readJSON(path.join(snapshot.dir,'package.json'));
 if(!isDeepStrictEqual(withoutOwn(before),withoutOwn(after)))throw Error('官方安装步骤更改了无关的 profile 内容，已停止并恢复备份。');
 for(const name of immutableFiles){let bytes=null;try{bytes=await fs.readFile(path.join(snapshot.dir,name));}catch(error){if(error.code!=='ENOENT')throw error;}const old=snapshot.files.get(name);if(old===null?bytes!==null:bytes===null||!old.equals(bytes))throw Error('官方安装步骤更改了无关的 profile 配置，已停止并恢复备份。');}
}
function commandEnvironment(env,bin){const dirs=[path.dirname(process.execPath),...(path.isAbsolute(bin)?[path.dirname(bin)]:[]),...(env.PATH??'').split(path.delimiter).filter(Boolean)];return{...env,PATH:[...new Set(dirs)].join(path.delimiter)};}
function cliRunner(run,env,dshHome,dshBin){return(_bin,args,options={})=>run(dshBin,args,{...options,env:{...commandEnvironment(env,dshBin),DSH_HOME:dshHome},shell:false,stdio:'pipe',encoding:'utf8',maxBuffer:4*1024*1024,timeout:120000});}
export async function findDSHCLI({env=process.env,home=os.homedir(),run=spawnSync}={}){
 const candidates=env.PIXEL_PETS_DSH_BIN?[env.PIXEL_PETS_DSH_BIN]:['dsh',path.join(home,'.local/bin/dsh'),path.join(home,'.local/node/bin/dsh'),'/opt/homebrew/bin/dsh','/usr/local/bin/dsh'];
 for(const bin of [...new Set(candidates)]){let result;try{result=run(bin,['--version'],{env:commandEnvironment(env,bin),shell:false,stdio:'pipe',encoding:'utf8',timeout:10000,maxBuffer:1024*1024});}catch{continue;}if(!result.error&&result.status===0)return bin;}
 throw Error('没有找到官方 DSH。请先安装并启动官方 DSH 网页版，再打开这个安装器。');
}
export async function easyInstallDSH({repo=root,payloadRoot,dshHome=process.env.DSH_HOME??path.join(os.homedir(),'.dsh'),profile,interactive=false,choose,run=spawnSync,env=process.env,log=()=>{}}={}){
 if(payloadRoot!==undefined)repo=payloadRoot;
 const packageStatus=await verifyPrebuiltDSHPackage(repo),profiles=await discoverDSHProfiles(dshHome),selected=await selectDSHProfile(profiles,{profile,interactive,choose});
 const dshBin=await findDSHCLI({env,run});
 const before=await doctorDSHInstallation(repo,dshHome,selected,{packageStatus});
 if(before.ok){log('这个 profile 已安装当前完整宠物包。');return{...before,changed:false,restartRequired:true,backupCreated:false};}
 log('正在把抱抱龙宠物添加到 '+selected+'…');
 const snapshot=await snapshotProfile(dshHome,selected);
 try{
  await installDSH(repo,dshHome,selected,{run:cliRunner(run,env,dshHome,dshBin)});
  await verifyUnrelatedProfileUnchanged(snapshot);
  const status=await doctorDSHInstallation(repo,dshHome,selected,{packageStatus});if(!status.ok)throw Error('安装检查未通过，已恢复原 profile。');
  return{...status,changed:true,restartRequired:true,backupCreated:true};
 }catch(error){
  try{await restoreProfile(snapshot);}catch{throw Error('安装未完成，自动恢复未能全部完成。原配置的备份已保留在 DSH 的 pixel-agent-pets-backups 文件夹。');}
  // Official CLI diagnostics may include private configuration. Keep them local.
  throw Error('安装未完成，原 profile 配置已从备份恢复。请检查官方 DSH 的插件安装功能后重试。');
 }
}
export async function easyUninstallDSH({dshHome=process.env.DSH_HOME??path.join(os.homedir(),'.dsh'),profile,interactive=false,choose,run=spawnSync,env=process.env,log=()=>{}}={}){
 const profiles=await discoverDSHProfiles(dshHome),selected=await selectDSHProfile(profiles,{profile,interactive,choose}),dir=profileDirectory(dshHome,selected);
 const hasOwn=pkg=>pkg.dsh?.profile?.bundles?.includes(packageName)===true||['dependencies','devDependencies','optionalDependencies'].some(key=>Object.hasOwn(pkg[key]??{},packageName));
 if(!hasOwn(await readJSON(path.join(dir,'package.json'))))return{profile:selected,removed:false,backupCreated:false};
 const dshBin=await findDSHCLI({env,run}),snapshot=await snapshotProfile(dshHome,selected);
 log('正在从 '+selected+' 移除抱抱龙宠物…');
 try{
  await removeDSH(dshHome,selected,{run:cliRunner(run,env,dshHome,dshBin)});
  await verifyUnrelatedProfileUnchanged(snapshot);
  if(hasOwn(await readJSON(path.join(dir,'package.json'))))throw Error('宠物插件仍在 profile 中。');
  return{profile:selected,removed:true,backupCreated:true};
 }catch{
  try{await restoreProfile(snapshot);}catch{throw Error('卸载未完成，自动恢复未能全部完成。原配置的备份已保留在 DSH 的 pixel-agent-pets-backups 文件夹。');}
  throw Error('卸载未完成，原 profile 配置已从备份恢复。请检查官方 DSH 的插件管理功能后重试。');
 }
}
function argumentsFor(argv){
 const out={};for(let i=0;i<argv.length;i++){const key=argv[i];if(key==='--profile'||key==='--dsh-home'){const value=argv[++i];if(!value||value.startsWith('--'))throw Error(key+' 需要一个值。');out[key==='--profile'?'profile':'dshHome']=value;}else if(key==='--help'||key==='-h')out.help=true;else if(key==='--doctor')out.doctor=true;else if(key==='--list')out.list=true;else throw Error('未知参数。可用 --profile、--dsh-home、--doctor、--list。');}return out;
}
export async function main(argv=process.argv.slice(2),{input=process.stdin,output=process.stdout,errorOutput=process.stderr}={}){
 const args=argumentsFor(argv),dshHome=args.dshHome??process.env.DSH_HOME??path.join(os.homedir(),'.dsh');
 if(args.help){output.write('抱抱龙 · DSH 一键安装\n\nnode scripts/easy-install-dsh.mjs [--profile 名称]\nnode scripts/easy-install-dsh.mjs --doctor [--profile 名称]\nnode scripts/easy-install-dsh.mjs --list\n\n使用已构建资源，不运行 npm install，不启动或停止任何会话。\n');return;}
 const profiles=await discoverDSHProfiles(dshHome);
 if(args.list){for(const p of profiles)output.write(p.name+(p.kind==='headless'?'（终端，不能显示网页宠物）':'')+'\n');return;}
 const interactive=!!input.isTTY&&!!output.isTTY;
 const choose=async items=>{const rl=createInterface({input,output});try{output.write('选择要添加宠物的 DSH profile：\n');items.forEach((item,i)=>output.write('  '+(i+1)+'. '+item.name+'\n'));for(let attempt=0;attempt<3;attempt++){const answer=(await rl.question('输入编号：')).trim();if(/^[1-9]\d*$/.test(answer)&&Number(answer)<=items.length)return items[Number(answer)-1].name;}throw Error('没有选择有效的 profile。');}finally{rl.close();}};
 if(args.doctor){const selected=await selectDSHProfile(profiles,{profile:args.profile,interactive,choose});output.write(JSON.stringify(await doctorDSHInstallation(root,dshHome,selected),null,2)+'\n');return;}
 const status=await easyInstallDSH({dshHome,profile:args.profile,interactive,choose,log:message=>output.write(message+'\n')});
 output.write((status.changed?'安装完成':'安装检查通过')+'。重新打开 '+status.profile+' 的 DSH 网页窗口即可。\n');
 output.write('只检查了本插件的安装；没有启动 profile，也没有更改其他插件或模型配置。\n');
}
if(process.argv[1]&&path.basename(process.argv[1])==='easy-install-dsh.mjs'&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
