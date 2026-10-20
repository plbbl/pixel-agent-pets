import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {finished} from 'node:stream/promises';
import asar from '@electron/asar';
import {Pickle} from '@electron/asar/lib/pickle.js';
import {discoverCodexApps,planCodexAppInstall,installCodexApp,rollbackCodexApp,signCodexOuterBundle} from '../scripts/codex-app-install.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const initial='function jIl(){let t=hi(U),o=e=>{let i=t.get(Akl);t.set(Akl,e.isOpen)},c=[];return(0,PIl.useEffect)(MIl,c),null}function MIl(){hs.dispatchMessage(`avatar-overlay-open-state-request`,{})}function D6s(){E6s=({source:o})=>{let p=o.assetRef==null?o.spriteRowCount:q$.rows;return(0,w6s.useEffect)(()=>{let e=u.current;if(e==null)return;if(n!=null){e.style.backgroundPosition=p6s(n,p);return}return()=>{}},[f,n,r,d,p]),jsx("div",{ref:u,style:{backgroundImage:`url(${o.spritesheetUrl??e[o.assetRef]})`}})}}function O6s(){}';
const overlay='function ip(e){let c=e.state.summary,l=c.hostId,f=null,p=up(e,f),m=Kr(s);return p}function Qg(){let Xt=Yt,Zt=d.quickChat?.stashedEdge!=null;return Xt}function hv(){let o=ee(v),z=rp({includeMcpElicitationCancelAction:!0,openAIFormElicitationsEnabled:s,intl:c,localThreads:A,excludedConversationId:D,remoteTasks:I,threadDetailLevel:l}),B;return z}function Cv(){let wo;t[0]?(wo=[]):wo=t[184];let To=ke?Ct:void 0,Eo;return wo}';
const operations={
 readPlist:async file=>JSON.parse(await fs.readFile(file,'utf8')),
 writePlist:async(file,value)=>fs.writeFile(file,JSON.stringify(value)),
 copyBundle:async(from,to)=>fs.cp(from,to,{recursive:true,preserveTimestamps:true,verbatimSymlinks:true}),
 assertAppClosed:async()=>{},
};
async function fixture(t,{nativeIntegrity='present'}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'baobaolong-mock-app-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const appPath=path.join(root,'Mock Codex.app'),packageRoot=path.join(root,'package'),source=path.join(root,'archive-source');
 const write=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,value);};
 await write(path.join(source,'webview/assets/initial.js'),initial);await write(path.join(source,'webview/assets/overlay.js'),overlay);
 await write(path.join(source,'private-vendor-original.txt'),'unchanged vendor module');
 await write(path.join(source,'node_modules/addon/helper.node'),'original unpacked native addon');
 await write(path.join(source,'bin/helper.sh'),'original executable');await fs.chmod(path.join(source,'bin/helper.sh'),0o755);
 await fs.symlink('../private-vendor-original.txt',path.join(source,'bin/vendor-link'));
 const archive=path.join(appPath,'Contents/Resources/app.asar');await fs.mkdir(path.dirname(archive),{recursive:true});
 const output=await asar.createPackageWithOptions(source,archive,{unpack:'**/*.node'});if(output?.on)await finished(output);
 if(nativeIntegrity==='missing'){
  const raw=asar.getRawHeader(archive),old=await fs.readFile(archive);
  delete raw.header.files.node_modules.files.addon.files['helper.node'].integrity;
  const header=Pickle.createEmpty();header.writeString(JSON.stringify(raw.header));const bytes=header.toBuffer();
  const size=Pickle.createEmpty();size.writeUInt32(bytes.length);
  await fs.writeFile(archive,Buffer.concat([size.toBuffer(),bytes,old.subarray(8+raw.headerSize)]));asar.uncache(archive);
 }
 if(nativeIntegrity==='stale'){
  const native=archive+'.unpacked/node_modules/addon/helper.node',bytes=await fs.readFile(native);
  await fs.writeFile(native,Buffer.alloc(bytes.length,0x53));
 }
 const profile={bundleId:'com.openai.codex',version:'test-version',build:'20770',headerHash:sha(asar.getRawHeader(archive).headerString),appInitial:'webview/assets/initial.js',appInitialHash:sha(initial),avatarOverlay:'webview/assets/overlay.js',avatarOverlayHash:sha(overlay)};
 await write(path.join(appPath,'Contents/Info.plist'),JSON.stringify({CFBundleIdentifier:profile.bundleId,CFBundleShortVersionString:profile.version,CFBundleVersion:profile.build,ElectronAsarIntegrity:{'Resources/app.asar':{algorithm:'SHA256',hash:profile.headerHash}},UnrelatedSetting:{keep:true}}));
 await write(path.join(appPath,'Contents/Resources/codex-cli/bin/codex'),'kernel unchanged');
 await write(path.join(appPath,'Contents/MacOS/Codex'),'original outer executable signature');
 await write(path.join(appPath,'Contents/_CodeSignature/CodeResources'),'original seal metadata');
 await write(path.join(packageRoot,'dist/codex-native.js'),'export const renderer="our local module";');
 await write(path.join(packageRoot,'assets/claude/manifest.json'),'{"name":"Claude"}');await write(path.join(packageRoot,'assets/claude/idle.png'),Buffer.from([1,2,3]));
 await write(path.join(packageRoot,'assets-hd/manifest.json'),'{"version":1}');
 return{root,appPath,packageRoot,profile,archive,backupRoot:path.join(root,'backups'),cli:path.join(appPath,'Contents/Resources/codex-cli/bin/codex'),plan:()=>planCodexAppInstall({appPath,packageRoot,profile},operations)};
}
test('read-only discovery and plan pin version, header, sources and complete canonical payload',async t=>{
 const f=await fixture(t),before=sha(await fs.readFile(f.archive));
 const found=await discoverCodexApps({roots:[f.root],...operations});assert.deepEqual(found,[{appPath:f.appPath,version:f.profile.version,build:'20770'}]);
 const plan=await f.plan();assert.equal(plan.status,'ready');assert.equal(plan.requiresAppLevelSigning,true);assert.equal(plan.kernelChanges,false);
 assert.equal(plan.payload.length,4);assert.ok(plan.payload.some(x=>x.target==='webview/assets/baobaolong-assets/base/claude/idle.png'));
 assert.ok(plan.payload.every(x=>!x.source.includes('dist/baobaolong-assets')));assert.equal(sha(await fs.readFile(f.archive)),before);
 await assert.rejects(fs.stat(f.backupRoot),{code:'ENOENT'});
 const changed={...f.profile,version:'different'};await assert.rejects(planCodexAppInstall({...f,profile:changed},operations),/Unsupported/);
 await assert.rejects(planCodexAppInstall({...f,profile:{...f.profile,headerHash:'0'.repeat(64)}},operations),/header hash/);
 await assert.rejects(planCodexAppInstall({...f,profile:{...f.profile,appInitialHash:'0'.repeat(64)}},operations),/source hashes/);
});
test('mock app install preserves CLI, unpacked files, vendor content and integrity; full rollback restores outer signature',async t=>{
 const f=await fixture(t),plan=await f.plan(),original=await fs.readFile(f.archive),unpacked=await fs.readFile(f.archive+'.unpacked/node_modules/addon/helper.node');
 const signed=[];
 const result=await installCodexApp(plan,{backupRoot:f.backupRoot,...operations,sign:async app=>{
  signed.push(app);await fs.writeFile(path.join(app,'Contents/MacOS/Codex'),'new outer signature');await fs.writeFile(path.join(app,'Contents/_CodeSignature/CodeResources'),'new seal');
 }});
 assert.equal(result.status,'installed');assert.deepEqual(signed,[f.appPath]);assert.equal(await fs.readFile(f.cli,'utf8'),'kernel unchanged');
 assert.deepEqual(await fs.readFile(f.archive+'.unpacked/node_modules/addon/helper.node'),unpacked);
 assert.equal(asar.extractFile(f.archive,'private-vendor-original.txt').toString(),'unchanged vendor module');
 assert.equal(asar.statFile(f.archive,'bin/helper.sh').executable,true);assert.equal(asar.statFile(f.archive,'node_modules/addon/helper.node').unpacked,true);
 assert.equal(asar.statFile(f.archive,'bin/vendor-link',false).link,'private-vendor-original.txt');
 assert.ok(asar.extractFile(f.archive,f.profile.appInitial).toString().includes('mountBoundNativePet'));
 assert.equal(asar.extractFile(f.archive,'webview/assets/codex-native.js').toString(),'export const renderer="our local module";');
 const plist=await operations.readPlist(path.join(f.appPath,'Contents/Info.plist'));
 assert.deepEqual(plist.UnrelatedSetting,{keep:true});assert.equal(plist.ElectronAsarIntegrity['Resources/app.asar'].hash,sha(asar.getRawHeader(f.archive).headerString));
 assert.equal((await f.plan()).status,'installed');
 assert.equal((await rollbackCodexApp({backupDirectory:result.backupDirectory},operations)).status,'rolled-back');
 assert.deepEqual(await fs.readFile(f.archive),original);assert.equal(await fs.readFile(path.join(f.appPath,'Contents/MacOS/Codex'),'utf8'),'original outer executable signature');
 assert.equal(await fs.readFile(path.join(f.appPath,'Contents/_CodeSignature/CodeResources'),'utf8'),'original seal metadata');
});
test('signing failure restores the complete mock bundle and leaves a usable backup',async t=>{
 const f=await fixture(t),plan=await f.plan(),original=await fs.readFile(f.archive);let error;
 try{await installCodexApp(plan,{backupRoot:f.backupRoot,...operations,sign:async app=>{await fs.writeFile(path.join(app,'Contents/MacOS/Codex'),'partial new signature');throw Error('mock signing failure');}});}catch(e){error=e;}
 assert.match(error.message,/mock signing failure/);assert.equal(error.rollbackStatus,'rolled-back');assert.deepEqual(await fs.readFile(f.archive),original);
 assert.equal(await fs.readFile(path.join(f.appPath,'Contents/MacOS/Codex'),'utf8'),'original outer executable signature');
 assert.equal(JSON.parse(await fs.readFile(path.join(error.backupDirectory,'backup.json'),'utf8')).status,'rolled-back');
});
test('CLI modifications by a signer are detected and rolled back',async t=>{
 const f=await fixture(t),plan=await f.plan();
 await assert.rejects(installCodexApp(plan,{backupRoot:f.backupRoot,...operations,sign:async()=>fs.writeFile(f.cli,'incorrectly changed kernel')}),/protected CLI/);
 assert.equal(await fs.readFile(f.cli,'utf8'),'kernel unchanged');
});
test('changed app or payload, missing explicit signer, or running app stops installation before mutation',async t=>{
 const f=await fixture(t),plan=await f.plan(),original=await fs.readFile(f.archive);
 await assert.rejects(installCodexApp(plan,{backupRoot:f.backupRoot,...operations}),/signer required/);
 await assert.rejects(installCodexApp(plan,{backupRoot:f.backupRoot,...operations,assertAppClosed:async()=>{throw Error('running app');},sign:async()=>{}}),/running app/);
 await fs.writeFile(path.join(f.packageRoot,'assets/claude/idle.png'),'changed payload');
 await assert.rejects(installCodexApp(plan,{backupRoot:f.backupRoot,...operations,sign:async()=>{}}),/Payload changed/);
 assert.deepEqual(await fs.readFile(f.archive),original);
 await fs.writeFile(f.cli,'external CLI update');
 await assert.rejects(installCodexApp(plan,{backupRoot:f.backupRoot,...operations,sign:async()=>{}}),/changed after planning: cli/);
});
test('manual rollback refuses to overwrite an externally updated application',async t=>{
 const f=await fixture(t),result=await installCodexApp(await f.plan(),{backupRoot:f.backupRoot,...operations,sign:async()=>{}});
 await fs.appendFile(f.archive,'external updater');
 await assert.rejects(rollbackCodexApp({backupDirectory:result.backupDirectory},operations),/updated or changed/);
});
test('a symlinked application destination is refused without following it for writes',async t=>{
 const f=await fixture(t),elsewhere=path.join(f.root,'outside.asar');await fs.rename(f.archive,elsewhere);await fs.symlink(elsewhere,f.archive);
 await assert.rejects(f.plan(),/symlink or file type/);
 assert.equal(sha(await fs.readFile(elsewhere)),sha(await fs.readFile(f.archive)));
});
for(const nativeIntegrity of ['missing','stale'])test('unpacked native files with '+nativeIntegrity+' header integrity preserve their actual bytes',async t=>{
 const f=await fixture(t,{nativeIntegrity}),native=f.archive+'.unpacked/node_modules/addon/helper.node',original=await fs.readFile(native);
 const result=await installCodexApp(await f.plan(),{backupRoot:f.backupRoot,...operations,sign:async()=>{}});
 assert.equal(result.status,'installed');assert.deepEqual(await fs.readFile(native),original);
 assert.deepEqual(asar.extractFile(f.archive,'node_modules/addon/helper.node'),original);
});
test('outer signer cleans only Apple build detritus and never deep-resigns nested kernels',async()=>{
 const calls=[];
 await signCodexOuterBundle('/mock/Codex.app',{identity:'-',runCommand:async(command,args)=>{
  calls.push([command,args]);if(args.includes('com.apple.FinderInfo'))throw Object.assign(Error('absent'),{stderr:'xattr: /mock/Codex.app: No such xattr: com.apple.FinderInfo\n'});
 }});
 assert.deepEqual(calls.slice(0,2),[['/usr/bin/xattr',['-dr','com.apple.FinderInfo','/mock/Codex.app']],['/usr/bin/xattr',['-dr','com.apple.ResourceFork','/mock/Codex.app']]]);
 assert.equal(calls.length,4);assert.ok(!calls[2][1].includes('--deep'));assert.ok(calls[3][1].includes('--verify'));
 assert.ok(!JSON.stringify(calls).includes('com.apple.quarantine'));assert.ok(!JSON.stringify(calls).includes('com.apple.provenance'));
 const refused=[];
 await assert.rejects(signCodexOuterBundle('/mock/Codex.app',{identity:'-',runCommand:async(command,args)=>{refused.push([command,args]);throw Object.assign(Error('denied'),{stderr:'xattr: Permission denied'});}}),/denied/);
 assert.equal(refused.length,1);
});
