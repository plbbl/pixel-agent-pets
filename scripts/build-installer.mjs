import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {builtinModules} from 'node:module';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGzip} from 'node:zlib';
import {build} from 'esbuild';
import {verifyInstallerPayload,regularFile,tree} from './installer-integrity.mjs';
export {verifyInstallerPayload} from './installer-integrity.mjs';

const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const characters=['claude','gpt','deepseek','clawd'];
const packageName='dsh-pixel-agent-pets';
export const installerArchiveName='Pixel-Agent-Pets-Installer.tar.gz';
const builtins=new Set([...builtinModules,...builtinModules.map(name=>'node:'+name)]);
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const exists=async file=>{try{await fs.lstat(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};

async function copy(root,stage,relative){
 const source=await regularFile(root,relative),target=path.join(stage,...relative.split('/'));
 await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(source.file,target);await fs.chmod(target,0o644);
}
async function pngSize(root,relative,width,height){
 const {file}=await regularFile(root,relative),handle=await fs.open(file,'r');
 try{
  const header=Buffer.alloc(24);const{bytesRead}=await handle.read(header,0,24,0);
  if(bytesRead!==24||!header.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||header.toString('ascii',12,16)!=='IHDR'||header.readUInt32BE(16)!==width||header.readUInt32BE(20)!==height)throw Error('Unexpected release PNG dimensions: '+relative);
 }finally{await handle.close();}
}
async function collectAssets(root){
 const files=new Set(),base={};let animationCount=0;
 for(const character of characters){
  const relative='assets/'+character+'/manifest.json';await regularFile(root,relative);
  const manifest=await json(path.join(root,relative));if(!manifest.animations||typeof manifest.animations!=='object')throw Error('Missing base animations: '+character);
  base[character]=manifest.animations;files.add(relative);
  for(const[id,a]of Object.entries(manifest.animations)){
   if(!/^[A-Za-z0-9_-]+$/.test(id)||!/^[A-Za-z0-9_-]+\.png$/.test(a.file)||!Number.isInteger(a.width)||a.width<1||a.height!==80||!Number.isInteger(a.columns)||a.columns<1||!Number.isInteger(a.frames)||a.frames<1||!Number.isFinite(a.fps)||a.fps<=0)throw Error('Invalid release animation: '+character+'/'+id);
   const file='assets/'+character+'/'+a.file;await pngSize(root,file,a.width*a.columns,80*Math.ceil(a.frames/a.columns));files.add(file);animationCount++;
  }
 }
 if(animationCount!==66)throw Error('Release must contain all 66 full animations');
 await regularFile(root,'assets-hd/manifest.json');const hd=await json(path.join(root,'assets-hd/manifest.json'));files.add('assets-hd/manifest.json');
 if(hd.version!==1||!hd.characters)throw Error('Unsupported release HD manifest');
 let hdCount=0;
 for(const character of characters.filter(c=>c!=='clawd')){
  const actions=hd.characters[character]?.animations;if(!actions)throw Error('Missing HD character: '+character);
  for(const[id,a]of Object.entries(base[character])){
   const levels=actions[id];if(!levels)throw Error('Missing HD animation: '+character+'/'+id);
   for(const level of ['160','320']){
    const high=levels[level],height=Number(level);
    if(!high||high.frames!==a.frames||high.fps!==a.fps||high.height!==height||high.width!==a.width*height/80||!Number.isInteger(high.columns)||high.columns<1||!Number.isInteger(high.chunkFrames)||high.chunkFrames<1||!Array.isArray(high.files)||high.files.length!==Math.ceil(a.frames/high.chunkFrames))throw Error('Invalid HD release animation: '+character+'/'+id+'/'+level);
    for(let i=0;i<high.files.length;i++){
     const chunk=high.files[i],expected=character+'/'+id+'/'+level+'-'+i+'.png';if(chunk!==expected)throw Error('Unsafe HD release chunk: '+chunk);
     const relative='assets-hd/'+chunk,frames=Math.min(high.chunkFrames,a.frames-i*high.chunkFrames);
     await pngSize(root,relative,high.width*high.columns,high.height*Math.ceil(frames/high.columns));files.add(relative);
    }
   }
   hdCount++;
  }
 }
 for(const folder of ['codex','codex-pixel'])for(const character of characters){
  if(folder==='codex-pixel'&&character==='clawd')continue;
  const prefix=folder+'/'+character+'/',petPath=prefix+'pet.json';await regularFile(root,petPath);const pet=await json(path.join(root,petPath));
  if(pet.spriteVersionNumber!==1||pet.spritesheetPath!=='spritesheet.png')throw Error('Invalid native pet catalog: '+prefix);
  await pngSize(root,prefix+'spritesheet.png',1536,1872);
  for(const file of ['pet.json','spritesheet.png','.pixel-agent-export.json']){await regularFile(root,prefix+file);files.add(prefix+file);}
 }
 return{files:[...files].sort(),animationCount,hdCount};
}
function privatePath(bytes,root){
 const text=bytes.toString('utf8');
 return text.includes(root)||/\/(?:Users|home)\/[^/\s"'<>]+\//.test(text)||/[A-Za-z]:\\Users\\/.test(text);
}
function tarHeader(name,size,mode){
 const header=Buffer.alloc(512),write=(value,offset,length)=>header.write(value,offset,length,'utf8');
 if(Buffer.byteLength(name)>100){const split=name.lastIndexOf('/');if(split<0||Buffer.byteLength(name.slice(0,split))>155||Buffer.byteLength(name.slice(split+1))>100)throw Error('Release archive path is too long');write(name.slice(0,split),345,155);name=name.slice(split+1);}
 write(name,0,100);const octal=(value,offset,length)=>write(value.toString(8).padStart(length-1,'0')+'\0',offset,length);
 octal(mode,100,8);octal(0,108,8);octal(0,116,8);octal(size,124,12);octal(0,136,12);header.fill(32,148,156);write('0',156,1);write('ustar\0',257,6);write('00',263,2);write('root',265,32);write('root',297,32);
 const checksum=header.reduce((sum,value)=>sum+value,0);write(checksum.toString(8).padStart(6,'0')+'\0 ',148,8);return header;
}
async function archivePayload(directory,file){
 const files=await tree(directory);
 async function* entries(){
  for(const relative of files){const full=path.join(directory,relative),stat=await fs.stat(full);yield tarHeader('pixel-agent-pets/'+relative,stat.size,relative==='install.cjs'?0o755:0o644);for await(const chunk of createReadStream(full))yield chunk;const padding=(512-stat.size%512)%512;if(padding)yield Buffer.alloc(padding);}
  yield Buffer.alloc(1024);
 }
 await pipeline(Readable.from(entries()),createGzip({level:6}),createWriteStream(file,{flags:'wx'}));
}
function runtimePackage(source){
 const allowed=['name','version','description','type','license','main','exports','repository','homepage','dsh','peerDependencies','peerDependenciesMeta'];
 return Object.fromEntries([...allowed.filter(key=>source[key]!==undefined).map(key=>[key,source[key]]),['bin',{'pixel-pets':'./install.cjs'}],['engines',{node:'>=22'}]]);
}
async function bundledLicenses(root,stage,metafile){
 const packages=new Set();
 for(const output of Object.values(metafile.outputs))for(const[input,contribution]of Object.entries(output.inputs??{})){
  if(!contribution.bytesInOutput)continue;
  const normalized=input.split(path.sep).join('/'),parts=normalized.split('/'),index=parts.lastIndexOf('node_modules');if(index<0)continue;
  const end=index+(parts[index+1]?.startsWith('@')?3:2);packages.add(parts.slice(0,end).join('/'));
 }
 for(const directory of [...packages].sort()){
  const metadata=await json(path.resolve(root,directory,'package.json'));
  const names=(await fs.readdir(path.resolve(root,directory))).filter(name=>/^(?:licen[sc]e|copying)(?:[.-].*)?$/i.test(name)).sort();
  if(!names.length)throw Error('Bundled dependency license is missing: '+metadata.name);
  const prefix=(metadata.name+'-'+metadata.version).replace(/[^a-zA-Z0-9_.-]/g,'_');await fs.mkdir(path.join(stage,'licenses'),{recursive:true});
  for(const name of names){
   const relative=directory+'/'+name,{file}=await regularFile(root,relative);
   await fs.writeFile(path.join(stage,'licenses',prefix+'-'+name.replace(/[^a-zA-Z0-9_.-]/g,'_')),await fs.readFile(file));
  }
 }
}
/** Build a downloadable, precompiled package; never invokes an installer or app operation. */
export async function buildInstaller({root=repository,entryPoint=path.join(root,'scripts/easy-install.mjs'),outdir=path.join(root,'work/release'),archive=true,maxArchiveBytes=100*1024*1024}={}){
 root=path.resolve(root);outdir=path.resolve(outdir);entryPoint=path.resolve(entryPoint);
 if(!entryPoint.startsWith(root+path.sep))throw Error('Installer entry must be inside its source package');
 await regularFile(root,path.relative(root,entryPoint).split(path.sep).join('/'));
 const sourcePackage=await json(path.join(root,'package.json'));if(sourcePackage.name!==packageName||typeof sourcePackage.version!=='string')throw Error('Unexpected release package');
 const assets=await collectAssets(root);await fs.mkdir(outdir,{recursive:true});const temporary=await fs.mkdtemp(path.join(outdir,'.pixel-agent-pets-stage-'));
 const destination=path.join(outdir,'pixel-agent-pets');let archiveTemporary;
 try{
  const required=['dist/index.js','dist/client.js','dist/codex-native.js','scripts/hd-asset-route.mjs','cordis.patch.yml','LICENSE','NOTICE.md'];
  for(const relative of [...required,...assets.files])await copy(root,temporary,relative);
  await fs.writeFile(path.join(temporary,'package.json'),JSON.stringify(runtimePackage(sourcePackage),null,2)+'\n');
  // The legacy standalone companion builder is deliberately excluded. It is
  // tree-shaken when unused; a referenced external is rejected below instead
  // of silently shipping an installer that needs developer dependencies.
  const bundled=await build({absWorkingDir:root,entryPoints:[entryPoint],outfile:path.join(temporary,'install.cjs'),bundle:true,write:true,metafile:true,format:'cjs',platform:'node',target:'node22',minify:true,legalComments:'none',sourcemap:false,external:['./build-desktop.mjs'],alias:{'original-fs':'node:fs'},define:{'import.meta.url':'__pixelPetsInstallerURL'},banner:{js:'const __pixelPetsInstallerURL=require("node:url").pathToFileURL(__filename).href;'}});
  for(const output of Object.values(bundled.metafile.outputs))for(const dependency of output.imports??[])if(dependency.external&&!builtins.has(dependency.path))throw Error('Release installer has an unbundled runtime dependency: '+dependency.path);
  await bundledLicenses(root,temporary,bundled.metafile);
  await fs.chmod(path.join(temporary,'install.cjs'),0o755);
  const files=[];for(const relative of await tree(temporary)){
   const data=await fs.readFile(path.join(temporary,relative));if(/\.(?:cjs|mjs|js|json|yml|md|txt)$/.test(relative)&&privatePath(data,root))throw Error('Private source path in release payload: '+relative);
   files.push({path:relative,size:data.length,sha256:sha256(data)});
  }
  const manifest={version:1,package:packageName,packageVersion:sourcePackage.version,node:22,animations:assets.animationCount,hdAnimations:assets.hdCount,native:{module:'dist/codex-native.js',base:'assets',hd:'assets-hd',targetPrefix:'baobaolong-assets'},files};
  await fs.writeFile(path.join(temporary,'integrity.json'),JSON.stringify(manifest,null,2)+'\n');const verified=await verifyInstallerPayload(temporary);
  if(await exists(destination)){
   let prior;try{prior=await json(path.join(destination,'integrity.json'));}catch{}
   if(prior?.package!==packageName)throw Error('Refusing to replace an unrelated release directory: '+destination);
   const previous=await fs.mkdtemp(path.join(outdir,'.pixel-agent-pets-previous-'));await fs.rmdir(previous);await fs.rename(destination,previous);
   try{await fs.rename(temporary,destination);}catch(error){await fs.rename(previous,destination);throw error;}await fs.rm(previous,{recursive:true});
  }else await fs.rename(temporary,destination);
  let archivePath=null,archiveSha256=null,archiveBytes=0;
  if(archive){
   archivePath=path.join(outdir,installerArchiveName);archiveTemporary=path.join(outdir,'.'+installerArchiveName+'.'+process.pid+'.tmp');await archivePayload(destination,archiveTemporary);
   archiveBytes=(await fs.stat(archiveTemporary)).size;if(archiveBytes>maxArchiveBytes)throw Error('Installer archive exceeds the release size limit');
   archiveSha256=sha256(await fs.readFile(archiveTemporary));await fs.rename(archiveTemporary,archivePath);archiveTemporary=undefined;
   const checksums=path.join(outdir,'.SHA256SUMS.'+process.pid+'.tmp');await fs.writeFile(checksums,archiveSha256+'  '+installerArchiveName+'\n');await fs.rename(checksums,path.join(outdir,'SHA256SUMS'));
  }
  return{directory:destination,archive:archivePath,sha256:archiveSha256,archiveBytes,...verified};
 }catch(error){await fs.rm(temporary,{recursive:true,force:true});if(archiveTemporary)await fs.rm(archiveTemporary,{force:true});throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),option=key=>{const i=args.indexOf(key);if(i<0)return undefined;if(!args[i+1]||args[i+1].startsWith('--'))throw Error(key+' requires a value');return args[i+1];};
 try{console.log(JSON.stringify(await buildInstaller({outdir:option('--out'),entryPoint:option('--entry'),archive:!args.includes('--no-archive')}),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
