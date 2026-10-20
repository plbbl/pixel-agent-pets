import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const characters=['claude','gpt','deepseek','clawd'];
/** A renderer artifact for a workspace application copy. It never reads or edits an installed app. */
export async function buildCodexNative({outdir=path.join(root,'dist'),copyAssets=true}={}){
 const packs={};let animations=0;
 for(const character of characters){
  const manifest=JSON.parse(await fs.readFile(path.join(root,'assets',character,'manifest.json'),'utf8'));
  const urls={};for(const[id,a]of Object.entries(manifest.animations)){
   if(!/^[A-Za-z0-9_-]+\.png$/.test(a.file))throw Error('Unsafe native asset name');
   urls[id]='base/'+character+'/'+a.file;animations++;
  }
  packs[character]={name:manifest.name??({claude:'像素 Claude',gpt:'像素 GPT',deepseek:'像素 DeepSeek',clawd:'原版 Clawd'})[character],animations:manifest.animations,urls};
 }
 if(animations!==66)throw Error('Expected all 66 full native animations');
 const hd=JSON.parse(await fs.readFile(path.join(root,'assets-hd','manifest.json'),'utf8'));
 if(hd.version!==1)throw Error('Unsupported HD metadata');
 const generated=path.join(root,'.generated');await fs.mkdir(generated,{recursive:true});
 await fs.writeFile(path.join(generated,'native-packs.json'),JSON.stringify(packs));
 await fs.writeFile(path.join(generated,'native-hd.json'),JSON.stringify(hd));
 await fs.mkdir(outdir,{recursive:true});
 const modulePath=path.join(outdir,'codex-native.js');
 await build({absWorkingDir:root,entryPoints:['src/codex-native.ts'],outfile:modulePath,bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
 const assetDirectory=path.join(outdir,'baobaolong-assets');
 if(copyAssets){
  await fs.mkdir(assetDirectory,{recursive:true});
  await fs.cp(path.join(root,'assets'),path.join(assetDirectory,'base'),{recursive:true});
  await fs.cp(path.join(root,'assets-hd'),path.join(assetDirectory,'assets-hd'),{recursive:true});
  await fs.writeFile(path.join(assetDirectory,'artifact.json'),JSON.stringify({package:'pixel-agent-pets',mode:'native-window-renderer',animations,source:'original full animation atlases',kernelChanges:false}));
 }
 const result={modulePath,assetDirectory,animations,hdActions:Object.values(hd.characters).reduce((n,c)=>n+Object.keys(c.animations).length,0),kernelChanges:false};
 console.log('Built original-window pet renderer: '+animations+' full animations; local image assets only.');return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildCodexNative();
