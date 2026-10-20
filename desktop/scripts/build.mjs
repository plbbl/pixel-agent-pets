import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
const desktop=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),root=path.dirname(desktop);
export async function prepareDesktop(){
 const output=path.join(desktop,'dist');await fs.rm(output,{recursive:true,force:true});await fs.mkdir(output,{recursive:true});
 const characters=[];let animations=0;
 for(const id of ['claude','gpt','deepseek','clawd']){
  const manifest=JSON.parse(await fs.readFile(path.join(root,'assets',id,'manifest.json'),'utf8'));
  const actions=Object.entries(manifest.animations).map(([id,a])=>({id,title:a.title??id}));animations+=actions.length;
  characters.push({id,title:({claude:'Claude',gpt:'GPT',deepseek:'DeepSeek',clawd:'原版 Clawd'})[id],actions});
 }
 if(animations!==66)throw Error('Desktop package must contain all 66 actions');
 await fs.mkdir(path.join(desktop,'src-tauri/generated'),{recursive:true});await fs.writeFile(path.join(desktop,'src-tauri/generated/catalog.json'),JSON.stringify({version:1,characters,animations}));
 for(const folder of ['assets','assets-hd']){const target=path.join(output,'baobaolong-assets',folder);await fs.rm(target,{recursive:true,force:true});await fs.cp(path.join(root,folder),target,{recursive:true});}
 await fs.copyFile(path.join(desktop,'index.html'),path.join(output,'index.html'));
 await build({absWorkingDir:desktop,entryPoints:['src/main.ts'],outfile:'dist/app.js',bundle:true,format:'esm',platform:'browser',target:['safari14','edge100'],minify:true,sourcemap:false,legalComments:'none'});
 const cli=path.join(desktop,'node_modules/@tauri-apps/cli/tauri.js');
 const icons=spawnSync(process.execPath,[cli,'icon',path.join(root,'docs/media/baobaolong.png'),'--output',path.join(desktop,'src-tauri/icons')],{cwd:desktop,stdio:'inherit',shell:false});
 if(icons.status!==0)throw Error('Could not build native app icons');
 console.log('Prepared native desktop: 4 pets, '+animations+' full actions, local bundled assets.');return{characters:4,animations,output};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))prepareDesktop().catch(error=>{console.error(error.message);process.exitCode=1;});
