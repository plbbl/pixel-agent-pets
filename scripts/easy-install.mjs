#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {verifyInstallerPayload} from './installer-integrity.mjs';
import {installCodex,uninstallCodex,doctorCodexInstallation,homes} from './install-lib.mjs';
import {easyInstallDSH,easyUninstallDSH,findDSHCLI,discoverDSHProfiles,selectDSHProfile,doctorDSHInstallation} from './easy-install-dsh.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),defaultRoot=path.basename(here)==='scripts'?path.dirname(here):here;
export function installerDataHome(){return process.env.PIXEL_PETS_INSTALL_HOME??(process.platform==='darwin'?path.join(os.homedir(),'Library/Application Support/抱抱龙/Pets'):path.join(process.env.XDG_DATA_HOME??path.join(os.homedir(),'.local/share'),'baobaolong-pets'));}
export function parseInstallerArguments(argv){
 const options={command:'install',codex:false,dsh:false,yes:false},values={'--profile':'profile','--codex-home':'codexHome','--dsh-home':'dshHome'};
 for(let i=0;i<argv.length;i++){
  const argument=argv[i];
  if(i===0&&['install','uninstall','doctor','help'].includes(argument))options.command=argument;
  else if(argument==='--help'||argument==='-h')options.command='help';
  else if(argument==='--codex')options.codex=true;
  else if(argument==='--dsh')options.dsh=true;
  else if(argument==='--both')options.codex=options.dsh=true;
  else if(argument==='--yes')options.yes=true;
  else if(values[argument]){const value=argv[++i];if(!value||value.startsWith('--'))throw Error(argument+' 需要一个值。');options[values[argument]]=value;}
  else throw Error('未知安装参数：'+argument);
 }
 return options;
}
async function readReceipt(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return{schema:1};throw error;}}
async function writeReceipt(directory,value){await fs.mkdir(directory,{recursive:true,mode:0o700});const target=path.join(directory,'installation.json'),stage=target+'.'+process.pid+'.tmp';await fs.writeFile(stage,JSON.stringify(value,null,2)+'\n',{mode:0o600});await fs.rename(stage,target);}
async function chooseFrom(items,title,{input,output}){
 if(!input.isTTY||!output.isTTY)throw Error('请明确指定 --codex、--dsh 或 --both；多个 DSH profile 可用 --profile 指定。');
 const rl=createInterface({input,output});
 try{output.write(title+'\n');items.forEach((item,index)=>output.write('  '+(index+1)+'. '+item.label+'\n'));for(let attempt=0;attempt<3;attempt++){const value=(await rl.question('输入编号：')).trim();if(/^[1-9]\d*$/.test(value)&&Number(value)<=items.length)return items[Number(value)-1].value;}throw Error('没有选择有效目标，安装未开始。');}finally{rl.close();}
}
const production={verifyInstallerPayload,installCodex,uninstallCodex,doctorCodexInstallation,easyInstallDSH,uninstallDSH:(dshHome,profile)=>easyUninstallDSH({dshHome,profile}),findDSHCLI,discoverDSHProfiles,selectDSHProfile,doctorDSHInstallation};
export async function runEasyInstaller(argv,{payloadRoot=defaultRoot,input=process.stdin,output=process.stdout,dataHome=installerDataHome(),operations={}}={}){
 const options=parseInstallerArguments(argv),io={input,output},ops={...production,...operations};
 if(options.command==='help'){output.write('抱抱龙 Pets · 一键安装\n\ninstall.cjs --codex | --dsh | --both\ninstall.cjs doctor --codex | --dsh | --both\ninstall.cjs uninstall --codex | --dsh | --both\n\nCodex：官方宠物目录中的七套兼容图集，使用官方九种固定状态。\nDSH：完整动作与触发逻辑；自动发现已有网页 profile。\n可用 --profile、--codex-home、--dsh-home 指定位置。\n');return{status:'help'};}
 const verified=await ops.verifyInstallerPayload(payloadRoot),targets=verified.targets??['codex','dsh'];
 if(!Array.isArray(targets)||!targets.length||targets.some(target=>!['codex','dsh'].includes(target)))throw Error('安装包目标信息无效。');
 output.write('抱抱龙 Pets '+verified.version+' · 安装包校验通过\n');
 if(!options.codex&&!options.dsh){
  if(targets.length===1){options.codex=targets[0]==='codex';options.dsh=targets[0]==='dsh';}
  else{const target=await chooseFrom([{value:'codex',label:'Codex 官方兼容图集'},{value:'dsh',label:'DSH 完整动作'},{value:'both',label:'两个都安装'}],'添加到哪里？',io);options.codex=target==='codex'||target==='both';options.dsh=target==='dsh'||target==='both';}
 }
 for(const target of ['codex','dsh'])if(options[target]&&!targets.includes(target))throw Error('这个安装包未包含 '+target+'；请选择包含该目标的安装包。');
 const h=homes(),codexHome=options.codexHome??h.codex,dshHome=options.dshHome??h.dsh,result={};let profile;
 const choose=items=>chooseFrom(items.map(item=>({value:item.name,label:item.name})),'选择已有的 DSH 网页 profile：',io);
 // Resolve DSH and its CLI before a combined install changes any pet files.
 if(options.dsh){const profiles=await ops.discoverDSHProfiles(dshHome);profile=await ops.selectDSHProfile(profiles,{profile:options.profile,interactive:!!input.isTTY&&!!output.isTTY,choose});if(options.command==='install')await ops.findDSHCLI();}
 if(options.command==='doctor'){
  if(options.codex)result.codex=await ops.doctorCodexInstallation(payloadRoot,codexHome,{qualityChoices:true});
  if(options.dsh)result.dsh=await ops.doctorDSHInstallation(payloadRoot,dshHome,profile);
  output.write(JSON.stringify(result,null,2)+'\n');return result;
 }
 const receipt=await readReceipt(path.join(dataHome,'installation.json'));receipt.version=verified.version;
 if(options.command==='uninstall'){
  if(options.codex){result.codex=await ops.uninstallCodex(codexHome);delete receipt.codex;await writeReceipt(dataHome,receipt);}
  if(options.dsh){result.dsh=await ops.uninstallDSH(dshHome,profile);delete receipt.dsh;await writeReceipt(dataHome,receipt);}
 }else{
  if(options.codex){result.codex=await ops.installCodex(payloadRoot,codexHome,{qualityChoices:true});receipt.codex={mode:'official-nine-state-catalog',pets:result.codex.map(pet=>pet.id)};await writeReceipt(dataHome,receipt);output.write('Codex 七套兼容宠物图集已就绪：设置 → Mini 与虚拟宠物，刷新后选择。\n官方九种固定状态；完整动作仅在 DSH 中提供。\n');}
  if(options.dsh){result.dsh=await ops.easyInstallDSH({payloadRoot,dshHome,profile,interactive:!!input.isTTY&&!!output.isTTY,choose,log:message=>output.write(message+'\n')});receipt.dsh={profile};await writeReceipt(dataHome,receipt);output.write('DSH 完整动作宠物安装完成，重新打开 '+profile+' 的网页窗口即可。\n');}
 }
 output.write(options.command==='uninstall'?'自有宠物已移除。\n':'安装完成。可用同一入口执行 doctor 或 uninstall。\n');return result;
}
if(process.argv[1])fs.realpath(process.argv[1]).then(actual=>{if(actual===fileURLToPath(import.meta.url))return runEasyInstaller(process.argv.slice(2));}).catch(error=>{console.error(error.message);process.exitCode=1;});
