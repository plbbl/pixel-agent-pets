import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';import{build}from'esbuild';import{PNG}from'pngjs';import{exportCodex}from'./codex-export.mjs';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function buildAll({codexQuality='auto'}={}){
 const packs={};for(const character of ['claude','gpt','deepseek','clawd']){
  let m;try{m=JSON.parse(await fs.readFile(path.join(root,'assets',character,'manifest.json'),'utf8'));}catch{if(character==='clawd')continue;throw Error('Missing '+character+' assets');}
  const name=m.name??({claude:'像素 Claude',gpt:'像素 GPT',deepseek:'像素 DeepSeek',clawd:'原版 Clawd'})[character];const urls={};
  for(const[action,a]of Object.entries(m.animations)){
   if(!/^[A-Za-z0-9_-]+\.png$/.test(a.file))throw Error('Unsafe atlas path');
   const file=path.join(root,'assets',character,a.file);let bytes=await fs.readFile(file);const image=PNG.sync.read(bytes);let changed=false;
   for(let i=3;i<image.data.length;i+=4){const alpha=image.data[i]>=128?255:0;if(image.data[i]!==alpha){image.data[i]=alpha;changed=true;}if(!alpha&&(image.data[i-1]||image.data[i-2]||image.data[i-3])){image.data[i-1]=image.data[i-2]=image.data[i-3]=0;changed=true;}}
   if(changed){bytes=PNG.sync.write(image);await fs.writeFile(file,bytes);}a.bytes=bytes.length;
   urls[action]='data:image/png;base64,'+bytes.toString('base64');
  }
  await fs.writeFile(path.join(root,'assets',character,'manifest.json'),JSON.stringify(m,null,2)+'\n');
  packs[character]={name,animations:m.animations,urls};await exportCodex(root,character,packs[character],{quality:codexQuality});
  if(character!=='clawd')await exportCodex(root,character,{...packs[character],name:name+' · 80px 像素版'},{quality:'pixel',outputFolder:'codex-pixel'});
 }
 await fs.mkdir(path.join(root,'.generated'),{recursive:true});await fs.writeFile(path.join(root,'.generated','packs.json'),JSON.stringify(packs));await fs.mkdir(path.join(root,'dist'),{recursive:true});
 const result=await build({absWorkingDir:root,entryPoints:['src/client.tsx'],bundle:true,write:false,format:'cjs',platform:'browser',target:'es2022',jsx:'automatic',external:['react','react-dom','react/jsx-runtime'],minify:true});
 await fs.writeFile(path.join(root,'dist/client.js'),`window.__ModuleLoader__.load({id:"dsh-pixel-agent-pets",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;}});\n`);
 await build({absWorkingDir:root,entryPoints:['src/index.ts'],outfile:'dist/index.js',format:'esm',platform:'node',target:'node20'});
 await build({absWorkingDir:root,entryPoints:['src/preview.tsx'],outfile:'dist/preview.js',bundle:true,format:'esm',platform:'browser',jsx:'automatic',target:'es2022',minify:true});
 console.log('Built: '+Object.keys(packs).join(', ')+'; Codex v1 sheets + DSH plugin.');return packs;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildAll();
