import fs from'node:fs/promises';import path from'node:path';import{build}from'esbuild';import{fileURLToPath}from'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function buildSite(){
 const packs={};for(const c of ['claude','gpt','deepseek','clawd']){const m=JSON.parse(await fs.readFile(path.join(root,'assets',c,'manifest.json'),'utf8'));packs[c]={name:m.name??({claude:"像素 Claude",gpt:"像素 GPT",deepseek:"像素 DeepSeek",clawd:"原版 Clawd"})[c],animations:m.animations,urls:Object.fromEntries(Object.entries(m.animations).map(([id,a])=>[id,'assets/'+c+'/'+a.file]))};}
 await fs.mkdir(path.join(root,'.generated'),{recursive:true});await fs.writeFile(path.join(root,'.generated','site-packs.json'),JSON.stringify(packs));
 await fs.cp(path.join(root,'assets'),path.join(root,'site','assets'),{recursive:true});
 await fs.cp(path.join(root,'assets-hd'),path.join(root,'site','assets-hd'),{recursive:true});
 const media=path.join(root,'showcase');
 // Website-only HD sources are separate from the lightweight desktop runtime assets.
 await fs.access(path.join(media,'manifest.json'));
 await fs.rm(path.join(root,'site','media'),{recursive:true,force:true});
 await fs.cp(media,path.join(root,'site','media'),{recursive:true,filter:source=>!source.endsWith('.building.mp4')});
 await build({absWorkingDir:root,entryPoints:['site/gallery.ts'],outfile:'site/gallery.js',bundle:true,format:'esm',target:'es2022',minify:true});
 console.log('Website: 66 full animations; original-source HD previews, loaded on demand');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildSite();
