import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import asar from '@electron/asar';
import {Readable} from 'node:stream';
import {finished} from 'node:stream/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {proposeCodexSourceHooks} from './codex-source-hooks.mjs';

const run=promisify(execFile),sha=value=>createHash('sha256').update(value).digest('hex');
const markerPath='webview/assets/baobaolong-native-install.json';
export const inspectedCodexProfile=Object.freeze({
 bundleId:'com.openai.codex',version:'26.1013.40934',build:'20770',
 headerHash:'b276579474c7f0413ae388aaf39d00337f7615a858774156f1268c68519ebab1',
 appInitial:'webview/assets/app-initial-90eb42395b7d.js',
 appInitialHash:'2687d59e8c67ccf81c7efb3820211070df303c6a200c9e0e8d604f26253f2f5e',
 avatarOverlay:'webview/assets/avatar-overlay-native-page-e0a4e0ad152a.js',
 avatarOverlayHash:'f733410d7e1d97530fd84700cc84b3f2ff2f3e4facbde665a7255723365fb7a9',
});
const exists=async file=>{try{await fs.lstat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
function childPath(root,relative){
 if(typeof relative!=='string'||!relative||relative.includes('\\')||path.posix.isAbsolute(relative)||relative.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('Unsafe relative archive path');
 return path.join(root,...relative.split('/'));
}
async function hashFile(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function treeHash(root){
 const hash=createHash('sha256');
 async function walk(dir,prefix=''){
  for(const entry of(await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
   const relative=prefix?prefix+'/'+entry.name:entry.name,file=path.join(dir,entry.name),stat=await fs.lstat(file);
   if(entry.isSymbolicLink())hash.update(JSON.stringify([relative,'link',await fs.readlink(file)])+'\n');
   else if(entry.isDirectory()){hash.update(JSON.stringify([relative,'directory',stat.mode&0o777])+'\n');await walk(file,relative);}
   else if(entry.isFile())hash.update(JSON.stringify([relative,'file',stat.mode&0o777,await hashFile(file)])+'\n');
   else throw Error('Unsupported application file type: '+relative);
  }
 }
 await walk(root);return hash.digest('hex');
}
async function readPlist(file){const {stdout}=await run('/usr/bin/plutil',['-convert','json','-o','-',file],{maxBuffer:16*1024*1024});return JSON.parse(stdout);}
async function writePlist(file,value,{binary=false}={}){
 const json=file+'.json';await fs.writeFile(json,JSON.stringify(value),{mode:0o600});
 try{await run('/usr/bin/plutil',['-convert',binary?'binary1':'xml1','-o',file,json]);}finally{await fs.rm(json,{force:true});}
}
async function copyBundle(from,to){await run('/usr/bin/ditto',[from,to]);}
export async function assertCodexAppClosed(appPath){
 const {stdout}=await run('/bin/ps',['-axo','comm='],{maxBuffer:8*1024*1024});
 if(stdout.split('\n').some(line=>line.trim().startsWith(appPath+'/Contents/')))throw Error('Quit Codex completely before installing or restoring pets.');
}
/** Explicitly called only after the installer user accepts app-level signing. */
export async function signCodexOuterBundle(appPath,{identity,runCommand=run}={}){
 if(!identity||typeof identity!=='string')throw Error('An explicit signing identity is required');
 // Only the two Apple build detritus attributes rejected by codesign. Security
 // attributes, quarantine, provenance and all app policy/fuses are preserved.
 for(const attribute of ['com.apple.FinderInfo','com.apple.ResourceFork']){
  try{await runCommand('/usr/bin/xattr',['-dr',attribute,appPath],{maxBuffer:16*1024*1024});}
  catch(error){
   const lines=String(error.stderr??'').split('\n').map(line=>line.trim()).filter(Boolean);
   if(!lines.length||lines.some(line=>!/No such (?:xattr|extended attribute)/i.test(line)))throw error;
  }
 }
 // No --deep: nested CLI bundles, helpers, entitlements and fuses are untouched.
 await runCommand('/usr/bin/codesign',['--force','--sign',identity,'--preserve-metadata=identifier,entitlements,flags','--timestamp=none',appPath]);
 await runCommand('/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',appPath]);
}
const defaults={readPlist,writePlist,copyBundle,assertAppClosed:assertCodexAppClosed};
function deps(options){return {...defaults,...options};}
function locations(appPath){return{plist:path.join(appPath,'Contents/Info.plist'),archive:path.join(appPath,'Contents/Resources/app.asar'),cli:path.join(appPath,'Contents/Resources/codex-cli')};}
async function assertBundleLayout(appPath){
 for(const relative of ['','Contents','Contents/Resources','Contents/Resources/codex-cli','Contents/MacOS','Contents/_CodeSignature','Contents/Info.plist','Contents/Resources/app.asar']){
  const stat=await fs.lstat(path.join(appPath,relative));
  if(stat.isSymbolicLink()||(['Contents/Info.plist','Contents/Resources/app.asar'].includes(relative)?!stat.isFile():!stat.isDirectory()))throw Error('Unexpected symlink or file type in application layout');
 }
}
function checkPlist(plist,profile){
 if(plist.CFBundleIdentifier!==profile.bundleId||plist.CFBundleShortVersionString!==profile.version||String(plist.CFBundleVersion)!==profile.build)throw Error('Unsupported Codex app version; this installer fails closed.');
 const integrity=plist.ElectronAsarIntegrity?.['Resources/app.asar'];
 if(integrity?.algorithm!=='SHA256'||typeof integrity.hash!=='string')throw Error('Expected existing SHA256 ElectronAsarIntegrity; refusing to disable or replace integrity policy.');
}
async function fingerprint(appPath){const l=locations(appPath);return{archive:await hashFile(l.archive),plist:await hashFile(l.plist),cli:await treeHash(l.cli),outerExecutable:await treeHash(path.join(appPath,'Contents/MacOS')),outerSignature:await treeHash(path.join(appPath,'Contents/_CodeSignature'))};}
function assertSame(actual,expected){for(const key of ['archive','plist','cli','outerExecutable','outerSignature'])if(actual[key]!==expected[key])throw Error('Application changed after planning: '+key);}

export async function discoverCodexApps({roots=['/Applications',path.join(os.homedir(),'Applications')],...options}={}){
 const d=deps(options),found=[];
 for(const root of roots){
  if(!await exists(root))continue;
  for(const entry of await fs.readdir(root,{withFileTypes:true})){
   if(!entry.isDirectory()||!entry.name.endsWith('.app'))continue;
   const appPath=path.join(root,entry.name);
   try{const p=await d.readPlist(locations(appPath).plist);if(p.CFBundleIdentifier==='com.openai.codex')found.push({appPath,version:p.CFBundleShortVersionString,build:String(p.CFBundleVersion)});}catch{}
  }
 }
 return found;
}
async function payloadFiles(packageRoot){
 const files=[],module=path.join(packageRoot,'dist/codex-native.js');
 if(!await exists(module))throw Error('Build the native renderer payload first.');
 async function add(source,target){
  const stat=await fs.lstat(source);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Payload must contain ordinary files only.');
  files.push({source,target,size:stat.size,sha256:await hashFile(source),mode:stat.mode});
 }
 await add(module,'webview/assets/codex-native.js');
 async function walk(source,target){
  for(const entry of(await fs.readdir(source,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
   const from=path.join(source,entry.name),to=target+'/'+entry.name;
   childPath('/',to);
   if(entry.isDirectory())await walk(from,to);
   else if(entry.isFile()&&/\.(png|json)$/.test(entry.name))await add(from,to);
   else throw Error('Unexpected native renderer payload file: '+entry.name);
  }
 }
 await walk(path.join(packageRoot,'assets'),'webview/assets/baobaolong-assets/base');
 await walk(path.join(packageRoot,'assets-hd'),'webview/assets/baobaolong-assets/assets-hd');
 if(files.length<3)throw Error('Incomplete native renderer assets');
 return files;
}
/** Read-only plan. No application, backup, signature, process or preference writes. */
export async function planCodexAppInstall({appPath,packageRoot,profile=inspectedCodexProfile},options={}){
 const d=deps(options);appPath=path.resolve(appPath);packageRoot=path.resolve(packageRoot);
 if(!appPath.endsWith('.app')||(await fs.lstat(appPath)).isSymbolicLink())throw Error('Expected an ordinary .app bundle directory');
 await assertBundleLayout(appPath);
 const l=locations(appPath),plist=await d.readPlist(l.plist);checkPlist(plist,profile);
 asar.uncache(l.archive);const header=asar.getRawHeader(l.archive);
 if(sha(header.headerString)!==plist.ElectronAsarIntegrity['Resources/app.asar'].hash)throw Error('Existing application ASAR integrity does not match Info.plist');
 const payload=await payloadFiles(packageRoot),payloadHash=sha(JSON.stringify(payload.map(({target,sha256})=>[target,sha256])));
 const existingPaths=new Set(asar.listPackage(l.archive));
 if(existingPaths.has('/'+markerPath)){
  const installed=JSON.parse(asar.extractFile(l.archive,markerPath).toString());
  if(installed.schema===1&&installed.payloadHash===payloadHash&&installed.originalHeaderHash===profile.headerHash){
   for(const file of payload)if(sha(asar.extractFile(l.archive,file.target))!==file.sha256)throw Error('Installed renderer payload has changed');
   for(const file of [profile.appInitial,profile.avatarOverlay])if(sha(asar.extractFile(l.archive,file))!==installed.sourceHashes?.[file])throw Error('Installed renderer source has changed');
   return{status:'installed',appPath,packageRoot,payloadHash};
  }
  throw Error('A different full pet renderer is already installed; restore its backup before updating.');
 }
 if(sha(header.headerString)!==profile.headerHash)throw Error('Unrecognized original ASAR header hash');
 const initial=asar.extractFile(l.archive,profile.appInitial).toString(),overlay=asar.extractFile(l.archive,profile.avatarOverlay).toString();
 if(sha(initial)!==profile.appInitialHash||sha(overlay)!==profile.avatarOverlayHash)throw Error('Unrecognized original renderer source hashes');
 const proposed=proposeCodexSourceHooks({appInitial:initial,avatarOverlay:overlay});
 for(const file of payload)if(existingPaths.has('/'+file.target))throw Error('Native renderer destination is already occupied');
 return{status:'ready',appPath,packageRoot,profile,payload,payloadHash,original:await fingerprint(appPath),
  manifest:proposed.manifest,requiresAppQuit:true,requiresAppLevelSigning:true,kernelChanges:false,
  writes:['Contents/Resources/app.asar','Contents/Info.plist','outer app code signature only'],
  signingNotice:'Re-signing changes the app signature and may cause macOS to ask for app/keychain permissions again. CLI and nested bundles are not re-signed.'};
}
function archiveEntries(header){
 const entries=[];
 function walk(node,prefix='',parentUnpacked=false){
  for(const [name,value]of Object.entries(node.files??{})){
   const file=prefix?prefix+'/'+name:name;childPath('/',file);const unpacked=parentUnpacked||!!value.unpacked;
   entries.push({file,node:value,unpacked});if(value.files)walk(value,file,unpacked);
  }
 }
 walk(header);return entries;
}
async function repack(archive,target,plan){
 asar.uncache(archive);const original=asar.getRawHeader(archive).header,entries=archiveEntries(original);
 const proposed=proposeCodexSourceHooks({appInitial:asar.extractFile(archive,plan.profile.appInitial).toString(),avatarOverlay:asar.extractFile(archive,plan.profile.avatarOverlay).toString()});
 const modified=new Map([[plan.profile.appInitial,Buffer.from(proposed.appInitial)],[plan.profile.avatarOverlay,Buffer.from(proposed.avatarOverlay)]]);
 const streams=entries.map(({file,node,unpacked})=>{
  if(node.files)return{path:file,type:'directory',unpacked};
  if(node.link){childPath('/',node.link);return{path:file,type:'link',unpacked,symlink:path.posix.relative(path.posix.dirname(file),node.link),stat:{mode:0o120777}};}
  const content=modified.get(file);return{path:file,type:'file',unpacked,stat:{size:content?.length??node.size,mode:node.executable?0o100755:0o100644},streamGenerator:()=>Readable.from(content??asar.extractFile(archive,file))};
 });
 const existing=new Set(entries.map(x=>x.file));
 function directories(file){const parent=path.posix.dirname(file);if(parent==='.'||existing.has(parent))return;directories(parent);streams.push({path:parent,type:'directory',unpacked:false});existing.add(parent);}
 for(const file of plan.payload){
  if(await hashFile(file.source)!==file.sha256)throw Error('Payload changed after planning');directories(file.target);
  streams.push({path:file.target,type:'file',unpacked:false,stat:{size:file.size,mode:0o100644},streamGenerator:()=>createReadStream(file.source)});existing.add(file.target);
 }
 directories(markerPath);const marker=Buffer.from(JSON.stringify({schema:1,payloadHash:plan.payloadHash,originalHeaderHash:plan.profile.headerHash,sourceHashes:Object.fromEntries([...modified].map(([file,buffer])=>[file,sha(buffer)])),kernelChanges:false}));
 streams.push({path:markerPath,type:'file',unpacked:false,stat:{size:marker.length,mode:0o100644},streamGenerator:()=>Readable.from(marker)});
 if(await exists(archive+'.unpacked'))await fs.cp(archive+'.unpacked',target+'.unpacked',{recursive:true,preserveTimestamps:true,verbatimSymlinks:true});
 const output=await asar.createPackageFromStreams(target,streams);if(output?.on)await finished(output);
 asar.uncache(target);
 // Every original entry except the two reviewed display modules must retain its
 // content hash, packing choice, link target and executable flag.
 for(const {file,node,unpacked}of entries){
  const next=asar.statFile(target,file,false);
  if(!!next.unpacked!==unpacked||next.link!==node.link||!!next.executable!==!!node.executable)throw Error('Repacked metadata changed unexpectedly: '+file);
  if(!node.files&&!node.link&&!modified.has(file)){
   // Native unpacked binaries may be signed after ASAR creation, leaving no
   // header integrity or a stale pre-signing hash. Compare their actual bytes.
   const originalHash=unpacked?sha(asar.extractFile(archive,file)):node.integrity?.hash??sha(asar.extractFile(archive,file));
   const nextHash=unpacked?sha(asar.extractFile(target,file)):next.integrity?.hash??sha(asar.extractFile(target,file));
   if(nextHash!==originalHash)throw Error('Unrelated ASAR content changed: '+file);
  }
 }
 for(const file of plan.payload)if(sha(asar.extractFile(target,file.target))!==file.sha256)throw Error('Native payload verification failed');
 return sha(asar.getRawHeader(target).headerString);
}
async function writeBackupManifest(directory,manifest){await fs.writeFile(path.join(directory,'backup.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});}
async function restoreBackup(directory,manifest,d){
 const backup=path.join(directory,'original.app');await assertBundleLayout(backup);await assertBundleLayout(manifest.appPath);checkPlist(await d.readPlist(locations(backup).plist),manifest.profile);
 assertSame(await fingerprint(backup),manifest.original);
 await d.copyBundle(backup,manifest.appPath);
 asar.uncache(locations(manifest.appPath).archive);assertSame(await fingerprint(manifest.appPath),manifest.original);
}
/** Apply is never invoked on import. A signer is mandatory; no implicit signing. */
export async function installCodexApp(plan,{backupRoot,...options}={}){
 if(plan.status==='installed')return plan;
 if(plan.status!=='ready'||!backupRoot)throw Error('A ready plan and explicit backupRoot are required');
 const d=deps(options);if(typeof d.sign!=='function')throw Error('Explicit approved outer-app signer required');
 await d.assertAppClosed(plan.appPath);await assertBundleLayout(plan.appPath);assertSame(await fingerprint(plan.appPath),plan.original);
 backupRoot=path.resolve(backupRoot);if(backupRoot===plan.appPath||backupRoot.startsWith(plan.appPath+path.sep))throw Error('Backup must be outside the app bundle');
 await fs.mkdir(backupRoot,{recursive:true,mode:0o700});const directory=await fs.mkdtemp(path.join(backupRoot,'codex-pets-'));
 const manifest={schema:1,status:'preparing',appPath:plan.appPath,profile:plan.profile,original:plan.original,payloadHash:plan.payloadHash,installed:null};
 await writeBackupManifest(directory,manifest);let mutated=false;
 try{
  const backup=path.join(directory,'original.app');await d.copyBundle(plan.appPath,backup);assertSame(await fingerprint(backup),plan.original);
  const stage=path.join(directory,'stage');await fs.mkdir(stage);
  const newArchive=path.join(stage,'app.asar'),headerHash=await repack(locations(backup).archive,newArchive,plan);
  const plist=await d.readPlist(locations(backup).plist);checkPlist(plist,plan.profile);plist.ElectronAsarIntegrity['Resources/app.asar'].hash=headerHash;
  const stagedPlist=path.join(stage,'Info.plist'),binary=(await fs.readFile(locations(backup).plist)).subarray(0,6).toString()==='bplist';
  await d.writePlist(stagedPlist,plist,{binary});
  if((await d.readPlist(stagedPlist)).ElectronAsarIntegrity['Resources/app.asar'].hash!==headerHash)throw Error('Staged plist verification failed');
  await d.assertAppClosed(plan.appPath);await assertBundleLayout(plan.appPath);assertSame(await fingerprint(plan.appPath),plan.original);
  const l=locations(plan.appPath);mutated=true;
  await fs.copyFile(newArchive,l.archive);await fs.copyFile(stagedPlist,l.plist);asar.uncache(l.archive);
  // Unpacked files never need replacing: all original packing choices are retained,
  // and every new renderer asset is packed. Keep the original tree byte-for-byte.
  if(await treeHash(l.cli)!==plan.original.cli)throw Error('CLI changed before signing');
  await d.sign(plan.appPath);
  if(await treeHash(l.cli)!==plan.original.cli)throw Error('Signer modified the protected CLI kernel');
  const installed=await d.readPlist(l.plist);
  if(installed.ElectronAsarIntegrity['Resources/app.asar'].hash!==sha(asar.getRawHeader(l.archive).headerString))throw Error('Installed ASAR integrity verification failed');
  manifest.status='installed';manifest.installed=await fingerprint(plan.appPath);await writeBackupManifest(directory,manifest);
  await fs.rm(stage,{recursive:true,force:true});return{status:'installed',appPath:plan.appPath,backupDirectory:directory,kernelChanges:false};
 }catch(error){
  if(mutated){
   try{await restoreBackup(directory,manifest,d);manifest.status='rolled-back';}
   catch(rollbackError){manifest.status='rollback-failed';await writeBackupManifest(directory,manifest);throw new AggregateError([error,rollbackError],'Installation failed and automatic restoration failed. Keep the complete backup at '+directory);}
  }else manifest.status='not-applied';
  await writeBackupManifest(directory,manifest);throw Object.assign(error,{backupDirectory:directory,rollbackStatus:manifest.status});
 }
}
/** Public restoration refuses to overwrite a newer or externally changed app. */
export async function rollbackCodexApp({backupDirectory},options={}){
 const d=deps(options),directory=path.resolve(backupDirectory),manifest=JSON.parse(await fs.readFile(path.join(directory,'backup.json'),'utf8'));
 if(manifest.schema!==1||manifest.status!=='installed'||!path.isAbsolute(manifest.appPath)||!manifest.appPath.endsWith('.app'))throw Error('Not a completed native pet installation backup');
 await d.assertAppClosed(manifest.appPath);
 try{assertSame(await fingerprint(manifest.appPath),manifest.installed);}catch(error){throw Error('Application was updated or changed; refusing to overwrite it with an older backup',{cause:error});}
 await restoreBackup(directory,manifest,d);manifest.status='rolled-back';await writeBackupManifest(directory,manifest);
 return{status:'rolled-back',appPath:manifest.appPath,kernelChanges:false};
}
