import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const xml=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
/** A one-shot installer survives quitting the app that launched it. No app is quit or opened. */
export async function scheduleCodexInstall({payloadRoot,dataHome,appPath,codexHome,backupRoot},{home=os.homedir(),node=process.execPath,uid=process.getuid?.(),platform=process.platform,execute=run}={}){
 if(platform!=='darwin'||!Number.isInteger(uid))throw Error('后台安装仅支持 macOS。');
 for(const value of [payloadRoot,dataHome,appPath,codexHome])if(!path.isAbsolute(value))throw Error('后台安装需要绝对路径。');
 const directory=path.join(dataHome,'pending'),label='io.github.plbbl.pixel-agent-pets.install.'+Date.now()+'.'+process.pid;
 const agentDirectory=path.join(home,'Library/LaunchAgents'),plist=path.join(agentDirectory,label+'.plist'),runner=path.join(directory,label+'.cjs'),log=path.join(directory,'installation.log');
 await fs.mkdir(directory,{recursive:true,mode:0o700});await fs.mkdir(agentDirectory,{recursive:true});
 const argv=[path.join(payloadRoot,'install.cjs'),'--codex','--yes','--app',appPath,'--codex-home',codexHome,'--backup-root',backupRoot??path.join(dataHome,'backups')];
 const pending={schema:1,status:'queued',appPath,label,log,queuedAt:new Date().toISOString(),requiresAppQuit:true};
 const source=`const fs=require('node:fs');const cp=require('node:child_process');\nconst result=cp.spawnSync(${JSON.stringify(node)},${JSON.stringify(argv)},{stdio:'inherit',env:{...process.env,PIXEL_PETS_INSTALL_HOME:${JSON.stringify(dataHome)}}});\nconst status=result.error?1:result.status??1;\nconst report={...${JSON.stringify(pending)},status:status===0?'installed':'failed',exitCode:status,finishedAt:new Date().toISOString()};\nfs.writeFileSync(${JSON.stringify(path.join(directory,'result.json'))},JSON.stringify(report));\nfs.writeFileSync(${JSON.stringify(path.join(directory,'pending.json'))},JSON.stringify(report));\ntry{fs.unlinkSync(${JSON.stringify(plist)});}catch{}\ntry{fs.unlinkSync(__filename);}catch{}\nprocess.exitCode=status;\ncp.spawnSync('/bin/launchctl',['bootout',${JSON.stringify('gui/'+uid+'/'+label)}],{stdio:'ignore'});\n`;
 await fs.writeFile(runner,source,{mode:0o600});
 await fs.writeFile(plist,'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>'+xml(label)+'</string><key>ProgramArguments</key><array><string>'+xml(node)+'</string><string>'+xml(runner)+'</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><false/><key>StandardOutPath</key><string>'+xml(log)+'</string><key>StandardErrorPath</key><string>'+xml(log)+'</string></dict></plist>\n',{mode:0o600});
 await fs.writeFile(path.join(directory,'pending.json'),JSON.stringify(pending,null,2)+'\n',{mode:0o600});
 try{await execute('/bin/launchctl',['bootstrap','gui/'+uid,plist]);}catch(error){await fs.rm(plist,{force:true});await fs.rm(runner,{force:true});await fs.writeFile(path.join(directory,'pending.json'),JSON.stringify({...pending,status:'failed'})+'\n',{mode:0o600});throw error;}
 return pending;
}
