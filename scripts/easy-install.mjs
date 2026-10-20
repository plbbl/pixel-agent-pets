#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {verifyInstallerPayload} from './installer-integrity.mjs';
import {installCodex,uninstallCodex,homes} from './install-lib.mjs';
import {easyInstallDSH,easyUninstallDSH,findDSHCLI,discoverDSHProfiles,selectDSHProfile,doctorDSHInstallation} from './easy-install-dsh.mjs';
import {discoverCodexApps,planCodexAppInstall,installCodexApp,rollbackCodexApp,signCodexOuterBundle,assertCodexAppClosed} from './codex-app-install.mjs';
import {scheduleCodexInstall} from './deferred-codex-install.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const defaultRoot=path.basename(here)==='scripts'?path.dirname(here):here;
export async function preflightCodexRuntimeSigning(){
 throw Error('Codex 原位完整安装暂未开放：普通本地签名无法通过保留中的 macOS 运行库验证。目前不会改动 Codex；DSH 一键安装可用。');
}
export function installerDataHome(){return process.env.PIXEL_PETS_INSTALL_HOME??(process.platform==='darwin'?path.join(os.homedir(),'Library/Application Support/抱抱龙/Pets'):path.join(process.env.XDG_DATA_HOME??path.join(os.homedir(),'.local/share'),'baobaolong-pets'));}
export function parseInstallerArguments(argv){
 const options={command:'install',codex:false,dsh:false,yes:false,wait:true};
 const values={'--profile':'profile','--app':'appPath','--codex-home':'codexHome','--dsh-home':'dshHome','--backup-root':'backupRoot','--backup':'backupDirectory'};
 for(let i=0;i<argv.length;i++){
  const argument=argv[i];
  if(i===0&&['install','uninstall','doctor','help'].includes(argument))options.command=argument;
  else if(argument==='--help'||argument==='-h')options.command='help';
  else if(argument==='--codex')options.codex=true;
  else if(argument==='--dsh')options.dsh=true;
  else if(argument==='--both')options.codex=options.dsh=true;
  else if(argument==='--yes')options.yes=true;
  else if(argument==='--no-wait')options.wait=false;
  else if(argument==='--background')options.background=true;
  else if(values[argument]){const value=argv[++i];if(!value||value.startsWith('--'))throw Error(argument+' 需要一个值。');options[values[argument]]=value;}
  else throw Error('未知安装参数：'+argument);
 }
 if(options.background&&(options.command!=='install'||!options.codex||options.dsh))throw Error('--background 只用于单独安装 Codex。');
 return options;
}
async function readJSON(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function writeReceipt(directory,value){await fs.mkdir(directory,{recursive:true,mode:0o700});const target=path.join(directory,'installation.json'),stage=target+'.'+process.pid+'.tmp';await fs.writeFile(stage,JSON.stringify(value,null,2)+'\n',{mode:0o600});await fs.rename(stage,target);}
async function chooseFrom(items,title,{input,output}){
 if(!input.isTTY||!output.isTTY)throw Error('需要在终端选择目标；也可以明确指定 --codex、--dsh、--app 或 --profile。');
 const rl=createInterface({input,output});
 try{output.write(title+'\n');items.forEach((item,index)=>output.write('  '+(index+1)+'. '+item.label+'\n'));for(let attempt=0;attempt<3;attempt++){const value=(await rl.question('输入编号：')).trim();if(/^[1-9]\d*$/.test(value)&&Number(value)<=items.length)return items[Number(value)-1].value;}throw Error('没有选择有效目标，安装未开始。');}finally{rl.close();}
}
async function appToUse(options,io,ops){
 if(options.appPath)return path.resolve(options.appPath);
 const found=await ops.discoverCodexApps();
 if(!found.length)throw Error('没有找到 Codex 桌面应用。请先安装官方 macOS 应用。');
 if(found.length===1)return found[0].appPath;
 return chooseFrom(found.map(item=>({value:item.appPath,label:path.basename(item.appPath)+' · '+item.version+' · '+item.appPath})),'选择 Codex 应用：',io);
}
async function confirmSigning(options,io){
 io.output.write('Codex 原位完整动画需要修改宠物展示资源并重新本地签名。\n模型／CLI 内核不变；保留完整恢复备份；官方更新后需重新安装。\n');
 if(options.yes)return;
 if(!io.input.isTTY||!io.output.isTTY)throw Error('请在终端确认应用签名改动；明确接受后可添加 --yes。');
 const rl=createInterface({input:io.input,output:io.output});try{if(!/^(y|yes|是)$/i.test((await rl.question('继续安装？[y/N] ')).trim()))throw Error('已取消，应用未修改。');}finally{rl.close();}
}
async function waitUntilClosed(appPath,options,io,ops){
 try{await ops.assertCodexAppClosed(appPath);return;}catch(error){if(!/Quit Codex/.test(error.message))throw error;if(!options.wait)throw error;}
 io.output.write('请完全退出 Codex（⌘Q）。此安装器会继续等待并自动完成，无需重新运行命令。\n');
 const until=Date.now()+30*60*1000;
 while(Date.now()<until){await ops.delay(1500);try{await ops.assertCodexAppClosed(appPath);return;}catch(error){if(!/Quit Codex/.test(error.message))throw error;}}
 throw Error('等待退出已超时，应用尚未修改。重新运行同一安装入口即可。');
}
const production={verifyInstallerPayload,preflightCodexRuntimeSigning,installCodex,uninstallCodex,uninstallDSH:(dshHome,profile)=>easyUninstallDSH({dshHome,profile}),easyInstallDSH,findDSHCLI,discoverDSHProfiles,selectDSHProfile,doctorDSHInstallation,discoverCodexApps,planCodexAppInstall,installCodexApp,rollbackCodexApp,assertCodexAppClosed,scheduleCodexInstall,delay,sign:app=>signCodexOuterBundle(app,{identity:'-'})};
export async function runEasyInstaller(argv,{payloadRoot=defaultRoot,input=process.stdin,output=process.stdout,dataHome=installerDataHome(),platform=process.platform,operations={}}={}){
 const options=parseInstallerArguments(argv),io={input,output},ops={...production,...operations};
 if(options.command==='help'){output.write('抱抱龙 Pets · DSH 一键安装\n\ninstall.cjs --dsh\ninstall.cjs uninstall --dsh\ninstall.cjs doctor --dsh\n\nDSH：自动发现已有网页 profile；无需手动复制文件或安装项目依赖。\nCodex：完整动作接入源码预览；macOS 运行库签名验证尚未解决，暂不可安装。\n已有测试补丁可使用 uninstall --codex 和原备份恢复。\n');return{status:'help'};}
 const verified=await ops.verifyInstallerPayload(payloadRoot);output.write('抱抱龙 Pets '+verified.version+' · 安装包校验通过\n');
 if(!options.codex&&!options.dsh){const target=await chooseFrom([{value:'dsh',label:'DeepSeek Harness 网页宠物'},{value:'codex',label:'Codex（签名验证未解决，暂不可安装）'}],'添加到哪里？',io);options.codex=target==='codex';options.dsh=target==='dsh';}
 if(options.codex&&platform!=='darwin')throw Error('Codex 原位完整补丁目前支持 macOS；此系统可使用 DSH 网页版。');
 if(options.codex&&options.command==='install')await ops.preflightCodexRuntimeSigning();
 const h=homes(),codexHome=options.codexHome??h.codex,dshHome=options.dshHome??h.dsh,receipt=await readJSON(path.join(dataHome,'installation.json'))??{schema:1},result={};
 const choose=items=>chooseFrom(items.map(item=>({value:item.name,label:item.name})),'选择已有的 DSH 网页 profile：',io);
 let appPath,plan,profile;
 // Validate both requested hosts before changing either one.
 if(options.codex){appPath=await appToUse(options,io,ops);if(options.command!=='uninstall')plan=await ops.planCodexAppInstall({appPath,packageRoot:payloadRoot});}
 if(options.dsh){const profiles=await ops.discoverDSHProfiles(dshHome);profile=await ops.selectDSHProfile(profiles,{profile:options.profile,interactive:!!input.isTTY&&!!output.isTTY,choose});if(options.command==='install')await ops.findDSHCLI();}
 if(options.command==='doctor'){
  if(options.codex)result.codex={installed:plan.status==='installed',appPath,fullRenderer:plan.status==='installed',runtimeVerified:false};
  if(options.dsh)result.dsh=await ops.doctorDSHInstallation(payloadRoot,dshHome,profile);
  output.write(JSON.stringify(result,null,2)+'\n');return result;
 }
 if(options.command==='uninstall'){
  if(options.codex){const backupDirectory=options.backupDirectory??receipt.codex?.backupDirectory;if(!backupDirectory)throw Error('没有找到完整应用恢复记录，未改动 Codex。');await waitUntilClosed(appPath,options,io,ops);result.codex=await ops.rollbackCodexApp({backupDirectory});result.catalog=await ops.uninstallCodex(codexHome);delete receipt.codex;}
  if(options.dsh){result.dsh=await ops.uninstallDSH(dshHome,profile);delete receipt.dsh;}
 }else{
  if(options.codex){
   if(plan.status!=='installed'){
    await confirmSigning(options,io);
    if(options.background){const queued=await ops.scheduleCodexInstall({payloadRoot,dataHome,appPath,codexHome,backupRoot:options.backupRoot});output.write('安装已准备好。完全退出 Codex 后会自动安装；完成后重新打开 Codex。\n');return queued;}
    await waitUntilClosed(appPath,options,io,ops);
    plan=await ops.planCodexAppInstall({appPath,packageRoot:payloadRoot});
    result.codex=await ops.installCodexApp(plan,{backupRoot:options.backupRoot??path.join(dataHome,'backups'),sign:ops.sign});
   }else result.codex={...receipt.codex,status:'installed',appPath};
   receipt.codex=result.codex;await writeReceipt(dataHome,receipt);
   result.catalog=await ops.installCodex(payloadRoot,codexHome,{qualityChoices:true});
   output.write('Codex 原位完整播放器安装完成。重新打开 Codex 即可；没有启动额外宠物窗口。\n');
  }
  if(options.dsh){result.dsh=await ops.easyInstallDSH({payloadRoot,dshHome,profile,interactive:!!input.isTTY&&!!output.isTTY,choose,log:message=>output.write(message+'\n')});receipt.dsh={profile};output.write('DSH 宠物安装完成，重新打开 '+profile+' 的网页窗口即可。\n');}
 }
 receipt.version=verified.version;receipt.updatedAt=new Date().toISOString();await writeReceipt(dataHome,receipt);
 output.write(options.command==='uninstall'?'恢复完成。\n':'安装完成。以后可用同一入口执行 uninstall 恢复。\n');return result;
}
if(process.argv[1])fs.realpath(process.argv[1]).then(actual=>{if(actual===fileURLToPath(import.meta.url))return runEasyInstaller(process.argv.slice(2));}).catch(error=>{console.error(error.message);process.exitCode=1;});
