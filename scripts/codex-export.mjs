import fs from 'node:fs/promises';
import path from 'node:path';
import {PNG} from 'pngjs';

export const rows=[['idle',6],['running-right',8],['running-left',8],['waving',4],['jumping',5],['failed',8],['waiting',6],['running',6],['review',6]];
export const mappings={
 claude:[['idle',8,38],['sending',8,28],['sending',8,28,true],['happy',5,24],['happy',0,42],['error',8,52],['pointing',16,48],['thinking',15,48],['happy',28,58]],
 gpt:[['idle',8,38],['wave',20,42],['wave',20,42,true],['wave',12,42],['happy',0,42],['error',10,55],['gate',8,36],['thinking',15,45],['ready',18,48]],
 deepseek:[['idle',8,38],['steal',15,62],['steal',15,62,true],['happy',12,42],['happy',0,42],['error',10,55],['hungry',15,45],['chain',62,108],['riceHappy',16,48]],
 clawd:[['LookingAroundEyesOnly',0,26],['Running',5,16],['Running',5,16,true],['Waving',0,18],['JumpingHappy',0,35],['Facepalm',0,35],['Pointing',0,26],['Thinking',0,26],['Confetti',3,28]]
};
export const triggers={idle:'No active task or unread result', 'running-right':'Drag right', 'running-left':'Drag left',waving:'Native greeting interaction',jumping:'Native jump interaction',failed:'Task failed',waiting:'Approval, question, or plan confirmation',running:'Task in progress (thinking, output, and tools share this state)',review:'Task finished with an unread result'};
export const nativeQualities=['auto','pixel','hd'];

async function readHDManifest(root){
 try{return JSON.parse(await fs.readFile(path.join(root,'assets-hd','manifest.json'),'utf8'));}
 catch(error){if(error.code==='ENOENT')return null;throw error;}
}
function hdVariant(manifest,character,action,base){
 const variants=manifest?.characters?.[character]?.animations?.[action];
 if(!variants)return null;
 for(const resolution of ['320','160']){
  const a=variants[resolution];if(!a)continue;
  if(a.frames!==base.frames||a.fps!==base.fps||a.height!==Number(resolution)||a.width/a.height!==base.width/80||!Number.isInteger(a.columns)||a.columns<1||!Number.isInteger(a.chunkFrames)||a.chunkFrames<1||!Array.isArray(a.files)||a.files.length!==Math.ceil(a.frames/a.chunkFrames))throw Error('Invalid HD native source '+character+'/'+action+'/'+resolution);
  return{...a,resolution};
 }
 return null;
}
function safeChunkPath(root,file){
 if(typeof file!=='string'||path.isAbsolute(file))throw Error('Unsafe HD atlas path');
 const base=path.resolve(root,'assets-hd'),resolved=path.resolve(base,file);
 if(!resolved.startsWith(base+path.sep)||!file.endsWith('.png'))throw Error('Unsafe HD atlas path');
 return resolved;
}

// Codex owns the native window, state machine and 57 timing samples. Quality only
// changes the source pixels used to fill its fixed 192 × 208 cells.
export async function exportCodex(root,character,pack,options={}){
 const quality=options.quality??'auto';
 if(!nativeQualities.includes(quality))throw Error('Unknown native pet quality: '+quality);
 if(!mappings[character])throw Error('Unknown native pet character: '+character);
 const manifest=quality==='pixel'||character==='clawd'?null:await readHDManifest(root);
 if(manifest&&manifest.version!==1)throw Error('Unsupported HD atlas manifest version');
 const sheet=new PNG({width:1536,height:1872}),sourceCache=new Map(),sourceResolutions={};
 async function source(action,a,frame){
  const high=hdVariant(manifest,character,action,a);
  if(quality==='hd'&&character!=='clawd'&&!high)throw Error('HD native source unavailable: '+character+'/'+action+'. Build assets-hd first or choose pixel.');
  const chunk=high?Math.floor(frame/high.chunkFrames):0;
  const key=high?action+':'+high.resolution+':'+chunk:action+':pixel';
  let image=sourceCache.get(key);
  if(!image){
   image=PNG.sync.read(await fs.readFile(high?safeChunkPath(root,high.files[chunk]):path.join(root,'assets',character,a.file)));
   const columns=high?.columns??a.columns,width=high?.width??a.width,height=high?.height??80;
   const frames=high?Math.min(high.chunkFrames,high.frames-chunk*high.chunkFrames):a.frames;
   if(image.width!==width*columns||image.height!==height*Math.ceil(frames/columns))throw Error('Invalid native atlas dimensions: '+key);
   sourceCache.set(key,image);
   // Each source is visited only a few times; bound decoded build-time memory.
   while(sourceCache.size>4)sourceCache.delete(sourceCache.keys().next().value);
  }
  sourceResolutions[action]=high?Number(high.resolution):80;
  return{image,width:high?.width??a.width,height:high?.height??80,columns:high?.columns??a.columns,frame:high?frame%high.chunkFrames:frame};
 }
 for(let row=0;row<rows.length;row++){
  const [,count]=rows[row],[action,lo,hi,flip]=mappings[character][row],a=pack.animations[action];
  if(!a)throw Error('Missing native pet source '+action);
  for(let col=0;col<count;col++){
   const frame=Math.max(0,Math.min(a.frames-1,Math.round(lo+(hi-lo)*col/Math.max(1,count-1))));
   const src=await source(action,a,frame),targetWidth=a.width*2;
   const left=96-a.width,jump=['gpt','deepseek'].includes(character)&&row===4?[0,-14,-24,-14,0][col]:0;
   // A shared foot line and actor scale across all frames, including wide props.
   // Resampling reads actual HD pixels; it never enlarges the old 80px atlas.
   for(let y=0;y<160;y++)for(let x=0;x<targetWidth;x++){
    const dx=left+x,dy=42+y+jump;if(dx<0||dx>=192||dy<0||dy>=208)continue;
    const sourceX=Math.min(src.width-1,Math.floor((flip?targetWidth-1-x:x)*src.width/targetWidth));
    const sourceY=Math.min(src.height-1,Math.floor(y*src.height/160));
    const at=((Math.floor(src.frame/src.columns)*src.height+sourceY)*src.image.width+src.frame%src.columns*src.width+sourceX)*4;
    if(src.image.data[at+3]<128)continue;
    const dest=((row*208+dy)*1536+col*192+dx)*4;
    src.image.data.copy(sheet.data,dest,at,at+3);sheet.data[dest+3]=255;
   }
  }
 }
 const folder=options.outputFolder??'codex';
 if(!['codex','codex-pixel'].includes(folder))throw Error('Invalid native output folder');
 const dir=path.join(root,folder,character);await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,'spritesheet.png'),PNG.sync.write(sheet));
 const levels=Object.values(sourceResolutions),resolvedQuality=character==='clawd'?'original':levels.every(x=>x>80)?'hd':levels.every(x=>x===80)?'pixel':'mixed';
 const metadata={displayName:pack.name+(resolvedQuality==='hd'?' · 高清':''),description:'Pixel Agent Pets · '+pack.name+' · native desktop activity companion',spriteVersionNumber:1,spritesheetPath:'spritesheet.png'};
 await fs.writeFile(path.join(dir,'pet.json'),JSON.stringify(metadata,null,2));
 await fs.writeFile(path.join(dir,'.pixel-agent-export.json'),JSON.stringify({version:1,requestedQuality:quality,resolvedQuality,sourceResolutions,layout:{width:1536,height:1872,cellWidth:192,cellHeight:208,states:9,frames:57}},null,2)+'\n');
 return metadata;
}
