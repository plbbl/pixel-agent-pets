#!/usr/bin/env node
import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';
import{installCodex,uninstallCodex,installDSH,uninstallDSH,homes,exists,profileDirectory,characterIDs,packageName}from'./install-lib.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),command=args[0]??'help';
const value=key=>{const i=args.indexOf(key);if(i<0)return undefined;const v=args[i+1];if(!v||v.startsWith('--'))throw Error(key+' requires a value');return v;};
async function main(){
 const h=homes(),profile=value('--profile')??'web';profileDirectory(h.dsh,profile);
 if(command==='install'){
  const {buildAll}=await import('./build.mjs');await buildAll();
  const specific=args.includes('--codex')||args.includes('--dsh'),result={};
  if(args.includes('--codex')||!specific)result.codex=await installCodex(root,h.codex);
  if(args.includes('--dsh')||!specific&&await exists(path.join(profileDirectory(h.dsh,profile),'package.json')))result.dsh=await installDSH(root,h.dsh,profile);
  console.log(JSON.stringify(result,null,2));console.log('Codex: Settings → Mini & Pets (Mini 与虚拟宠物) → circular Refresh icon → select a pet. Older versions: Settings → Pets. DSH: reopen the selected profile.');return;
 }
 if(command==='uninstall'){
  const specific=args.includes('--codex')||args.includes('--dsh'),result={};
  if(args.includes('--codex')||!specific)result.codex=await uninstallCodex(h.codex);
  if(args.includes('--dsh'))result.dsh=await uninstallDSH(h.dsh,profile);console.log(JSON.stringify(result,null,2));return;
 }
 if(command==='import-clawd'){const{importClawd}=await import('./import-clawd.mjs');console.log(await importClawd(value('--source')));return;}
 if(command==='doctor'){
  const codex={};for(const c of characterIDs)codex[c]=await exists(path.join(h.codex,'pets','pixel-agent-'+c,'pet.json'));
  let dsh;try{const p=JSON.parse(await fs.readFile(path.join(profileDirectory(h.dsh,profile),'package.json'),'utf8'));dsh={profile,enabled:p.dsh?.profile?.bundles?.includes(packageName)??false,linked:!!p.dependencies?.[packageName]};}catch{dsh={profile,installed:false};}
  console.log(JSON.stringify({node:process.versions.node,codex,dsh},null,2));return;
 }
 console.log(`Pixel Agent Pets\n\nnode scripts/cli.mjs install [--codex] [--dsh] [--profile web]\nnode scripts/cli.mjs uninstall --codex\nnode scripts/cli.mjs uninstall --dsh --profile web\nnode scripts/cli.mjs doctor [--profile web]\nnode scripts/cli.mjs import-clawd [--source path/to/app.asar]\n\nFour included pets. No API key or model request. No official app modification.`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
