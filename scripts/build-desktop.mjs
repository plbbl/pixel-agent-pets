import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function desktopPolicy(){
 const out=await build({absWorkingDir:root,entryPoints:['src/policy.ts'],bundle:true,format:'esm',platform:'node',write:false});
 const p=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
 const result={names:p.names,idle:p.idleActions,states:{},complete:{claude:['happy','dance'],gpt:['happy','ready','idea'],deepseek:['happy','riceHappy','dance'],clawd:['JumpingHappy','Confetti','DancingHappy','Spark']},send:{claude:'sending',gpt:'wave',deepseek:'fast',clawd:'Excited'},error:{claude:'error',gpt:'error',deepseek:'error',clawd:'Facepalm'},captions:{}};
 for(const c of Object.keys(p.names)){
  const states=result.states[c]={};states.idle=p.baseAction(c,{busy:false,phase:'thinking'},0,'');states.waiting=p.baseAction(c,{busy:true,phase:'thinking',awaitingInput:true},0,'');
  for(const phase of ['thinking','sending','responding','retrying','stopping'])states[phase]=p.baseAction(c,{busy:true,phase},0,'');
  states['thinking-long']=p.baseAction(c,{busy:true,phase:'thinking'},12000,'');
  states['tools-read']=p.toolAction(c,'read_file');states['tools-write']=p.toolAction(c,'write_file');for(let i=0;i<4;i++)states['tools-command-'+i]=p.toolAction(c,'run_command',i);
  const manifest=JSON.parse(await fs.readFile(path.join(root,'assets',c,'manifest.json'),'utf8'));result.captions[c]={};
  for(const [name,a]of Object.entries(manifest.animations)){
   const first=p.captionAt(c,name,0,a),later=p.captionAt(c,name,2500,a);
   if(first||later)result.captions[c][name]=first===later?[{start:0,end:86400,text:first}]:[{start:0,end:2,text:first},{start:2,end:86400,text:later}];
  }
 }
 return result;
}
export async function buildDesktop({universal=false}={}){
 if(process.platform!=='darwin')throw Error('The native full-animation companion currently requires macOS.');
 const dir=path.join(root,'.generated','Pixel Agent Pets.app'),contents=path.join(dir,'Contents'),bin=path.join(contents,'MacOS'),res=path.join(contents,'Resources');
 await fs.mkdir(bin,{recursive:true});await fs.mkdir(res,{recursive:true});
 const version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
 await fs.writeFile(path.join(contents,'Info.plist'),`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>PixelAgentPets</string><key>CFBundleIdentifier</key><string>io.github.plbbl.pixel-agent-pets</string><key>CFBundleName</key><string>Pixel Agent Pets</string><key>CFBundleDisplayName</key><string>Pixel Agent Pets</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${version}</string><key>LSUIElement</key><true/><key>LSMinimumSystemVersion</key><string>13.0</string><key>NSHighResolutionCapable</key><true/></dict></plist>`);
 await fs.cp(path.join(root,'assets'),path.join(res,'assets'),{recursive:true});await fs.writeFile(path.join(res,'policy.json'),JSON.stringify(await desktopPolicy()));
 await fs.writeFile(path.join(res,'pixel-agent-pets.json'),JSON.stringify({package:'dsh-pixel-agent-pets',version}));
 const sources=['native/Activity.swift','native/Watcher.swift','native/main.swift'].map(f=>path.join(root,f));
 const architectures=universal?['arm64','x86_64']:[process.arch==='arm64'?'arm64':'x86_64'];const binaries=[];
 for(const arch of architectures){const output=path.join(root,'.generated','PixelAgentPets-'+arch);const run=spawnSync('/usr/bin/xcrun',['swiftc','-O','-swift-version','5','-target',arch+'-apple-macosx13.0',...sources,'-o',output],{stdio:'inherit'});if(run.status!==0)throw Error('Native compilation failed');binaries.push(output);}
 const executable=path.join(bin,'PixelAgentPets');
 if(binaries.length===1)await fs.copyFile(binaries[0],executable);else if(spawnSync('/usr/bin/lipo',['-create',...binaries,'-output',executable],{stdio:'inherit'}).status!==0)throw Error('Universal binary assembly failed');
 await fs.chmod(executable,0o755);
 // Finder decoration on generated bundles is incompatible with code signing.
 // Remove only those two decoration attributes; never strip quarantine.
 for(const attribute of ['com.apple.FinderInfo','com.apple.ResourceFork'])spawnSync('/usr/bin/xattr',['-dr',attribute,dir],{stdio:'ignore'});
 if(spawnSync('/usr/bin/codesign',['--force','--sign','-',dir],{stdio:'inherit'}).status!==0)throw Error('Local code signing failed');
 const test=spawnSync(executable,['--self-test'],{stdio:'inherit'});if(test.status!==0)throw Error('Native activity tests failed');
 const watchTest=spawnSync(executable,['--watch-self-test'],{stdio:'inherit'});if(watchTest.status!==0)throw Error('Native filesystem test failed');
 console.log('Full-animation macOS companion: '+dir);return dir;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildDesktop({universal:process.argv.includes('--universal')});
