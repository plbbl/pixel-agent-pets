import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {PNG} from 'pngjs';
import {Resvg} from '@resvg/resvg-js';
import gifenc from 'gifenc';
const {GIFEncoder,quantize,applyPalette}=gifenc;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bundled=await build({absWorkingDir:root,entryPoints:['src/stories.ts'],bundle:true,format:'esm',platform:'node',write:false});
const {signatureStory,storyTimeline,storyAt,storyCaption}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const hd=JSON.parse(await fs.readFile(path.join(root,'assets-hd/manifest.json'),'utf8'));
const characters=['claude','gpt','deepseek','clawd'],packs={};
for(const c of characters)packs[c]=JSON.parse(await fs.readFile(path.join(root,'assets',c,'manifest.json'),'utf8'));
const cache=new Map(),textCache=new Map();
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function canvas(width,height){const p=new PNG({width,height});for(let i=0;i<p.data.length;i+=4){p.data[i]=248;p.data[i+1]=246;p.data[i+2]=239;p.data[i+3]=255;}return p;}
async function image(file){if(cache.has(file)){const v=cache.get(file);cache.delete(file);cache.set(file,v);return v;}const p=PNG.sync.read(await fs.readFile(path.join(root,file)));cache.set(file,p);while(cache.size>3)cache.delete(cache.keys().next().value);return p;}
function blend(out,source,sx,sy,sw,sh,cx,top,height){const width=Math.round(height*sw/sh),left=Math.round(cx-width/2),h=Math.round(height);for(let y=0;y<h;y++)for(let x=0;x<width;x++){const dx=left+x,dy=Math.round(top)+y;if(dx<0||dy<0||dx>=out.width||dy>=out.height)continue;const s=((sy+Math.min(sh-1,Math.floor(y*sh/h)))*source.width+sx+Math.min(sw-1,Math.floor(x*sw/width)))*4,alpha=source.data[s+3]/255;if(!alpha)continue;const d=(dy*out.width+dx)*4;for(let k=0;k<3;k++)out.data[d+k]=Math.round(source.data[s+k]*alpha+out.data[d+k]*(1-alpha));out.data[d+3]=255;}}
async function actor(out,c,a,n,cx,top,height){const animation=packs[c].animations[a],v=hd.characters[c]?.animations[a]?.['320'];if(c!=='clawd'&&!v)throw Error('Missing true HD source: '+c+'/'+a);if(v){if(v.height!==320||v.frames!==animation.frames||v.fps!==animation.fps)throw Error('HD source mismatch: '+c+'/'+a);const sheet=await image('assets-hd/'+v.files[Math.floor(n/v.chunkFrames)]),f=n%v.chunkFrames;blend(out,sheet,f%v.columns*v.width,Math.floor(f/v.columns)*v.height,v.width,v.height,cx,top,height);}else{const sheet=await image('assets/'+c+'/'+animation.file);blend(out,sheet,n%animation.columns*animation.width,Math.floor(n/animation.columns)*animation.height,animation.width,animation.height,cx,top,height);}}
function text(out,caption,title){const key=caption+'|'+title+'|'+out.width;let p=textCache.get(key);if(!p){p=PNG.sync.read(new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${out.width}" height="${out.height}"><text x="${out.width/2}" y="31" text-anchor="middle" font-family="PingFang SC,Arial" font-size="15" font-weight="600" fill="#564b3d">${escape(caption)}</text><text x="${out.width/2}" y="${out.height-14}" text-anchor="middle" font-family="Arial" font-size="11" letter-spacing="2" fill="#827c70">${escape(title)}</text></svg>`,{font:{loadSystemFonts:true}}).render().asPng());textCache.set(key,p);}blend(out,p,0,0,p.width,p.height,out.width/2,0,out.height);}
const media=path.join(root,'docs/media');await fs.mkdir(media,{recursive:true});
// A static brand cover is intentional: full stories live in the three individual GIFs below it.
const logo=(await fs.readFile(path.join(media,'baobaolong.png'))).toString('base64');
const base=PNG.sync.read(new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="660"><rect width="1200" height="660" fill="#f8f6ef"/><image x="58" y="28" width="54" height="54" href="data:image/png;base64,${logo}"/><text x="128" y="63" font-family="PingFang SC,Arial" font-size="22" font-weight="bold" fill="#302e28">抱抱龙 · Pixel Agent Pets</text><text x="1140" y="64" text-anchor="end" font-family="monospace" font-size="11" fill="#827c70">CODEX / DSH / DESKTOP</text><text x="57" y="187" font-family="Georgia" font-size="66" font-weight="bold" letter-spacing="-2" fill="#302e28">Small pixels.</text><text x="57" y="264" font-family="Georgia" font-size="66" font-weight="bold" letter-spacing="-2" fill="#d6653c">Big personalities.</text><text x="830" y="204" font-family="Arial" font-size="16" fill="#827c70">Four tiny coworkers.</text><text x="830" y="235" font-family="Arial" font-size="16" fill="#827c70">A whole lot of character.</text><path d="M58 580H1142" stroke="#ded9cc"/>${characters.map((c,i)=>`<text x="${180+i*280}" y="615" text-anchor="middle" font-family="monospace" font-size="13" letter-spacing="2" fill="#302e28">${c.toUpperCase()}</text>`).join('')}<text x="58" y="647" font-family="monospace" font-size="10" fill="#827c70">66 ORIGINAL ANIMATIONS · LOCAL PLAYBACK · COMPLETE STORIES BELOW</text></svg>`,{font:{loadSystemFonts:true}}).render().asPng());
for(let i=0;i<characters.length;i++){const c=characters[i],a=c==='clawd'?'LookingAroundEyesOnly':'idle';await actor(base,c,a,packs[c].animations[a].poster??0,180+i*280,330,216);}
await fs.writeFile(path.join(media,'cover.png'),PNG.sync.write(base));
if(process.argv.includes('--cover-only')){console.log('Static brand cover rendered from real HD sources.');process.exit(0);}
const manifest={version:1,source:'assets-hd/manifest.json',cover:'cover.png',stories:{}};
for(const c of characters){
 const story=signatureStory(c),timeline=storyTimeline(story,packs[c]),w=c==='claude'?520:384,h=340;
 const render=async frame=>{const step=timeline.steps.find(s=>frame<s.startFrame+s.frames)??timeline.steps.at(-1),ms=step.startMs+(frame-step.startFrame+.0001)/step.fps*1000,p=storyAt(timeline,ms),out=canvas(w,h);await actor(out,c,p.action,p.frame,w/2,54,264);text(out,storyCaption(p.step,packs[c].animations[p.action],p.localMs),c.toUpperCase());return out;};
 // Learn a shared palette from the whole performance, including the late red BAN stamp.
 const samples=[];for(let n=0;n<timeline.frames;n+=Math.max(1,Math.floor(timeline.frames/16)))samples.push((await render(n)).data);samples.push((await render(timeline.frames-1)).data);
 const palette=quantize(Buffer.concat(samples),256,{format:'rgb565'}),gif=GIFEncoder();
 for(let n=0;n<timeline.frames;n++){const out=await render(n),step=timeline.steps.find(s=>n<s.startFrame+s.frames);gif.writeFrame(applyPalette(out.data,palette,'rgb565'),w,h,{palette,delay:Math.round((step.startMs+(n-step.startFrame+1)/step.fps*1000)/10)*10-Math.round((step.startMs+(n-step.startFrame)/step.fps*1000)/10)*10,repeat:0});}
 gif.finish();const output=gif.bytes();await fs.writeFile(path.join(media,c+'.gif'),output);
 manifest.stories[c]={id:story.id,file:c+'.gif',actions:story.steps.map(s=>s.action),frames:timeline.frames,durationMs:timeline.durationMs,width:w,height:h,sourceHeight:c==='clawd'?80:320,bytes:output.byteLength};
 console.log(`${c}: ${timeline.frames} complete frames, ${(timeline.durationMs/1000).toFixed(2)}s, ${(output.byteLength/1024/1024).toFixed(2)} MiB`);
}
await fs.writeFile(path.join(media,'stories.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Complete HD stories rendered; original Clawd retains all25 full actions.');
