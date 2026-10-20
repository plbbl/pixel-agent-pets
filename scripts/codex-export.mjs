import fs from'node:fs/promises';import path from'node:path';import{PNG}from'pngjs';
export const rows=[['idle',6],['running-right',8],['running-left',8],['waving',4],['jumping',5],['failed',8],['waiting',6],['running',6],['review',6]];
export const mappings={
 claude:[['idle',8,38],['sending',8,28],['sending',8,28,true],['happy',5,24],['happy',0,42],['error',8,52],['pointing',16,48],['thinking',15,48],['happy',28,58]],
 gpt:[['idle',8,38],['wave',20,42],['wave',20,42,true],['wave',12,42],['happy',0,42],['error',10,55],['gate',8,36],['thinking',15,45],['ready',18,48]],
 deepseek:[['idle',8,38],['steal',15,62],['steal',15,62,true],['happy',12,42],['happy',0,42],['error',10,55],['hungry',15,45],['chain',62,108],['riceHappy',16,48]],
 clawd:[['LookingAroundEyesOnly',0,26],['Running',5,16],['Running',5,16,true],['Waving',0,18],['JumpingHappy',0,35],['Facepalm',0,35],['Pointing',0,26],['Thinking',0,26],['Confetti',3,28]]
};
export const triggers={idle:'No active task or unread result', 'running-right':'Drag right', 'running-left':'Drag left',waving:'Native greeting interaction',jumping:'Native jump interaction',failed:'Task failed',waiting:'Approval, question, or plan confirmation',running:'Task in progress (thinking, output, and tools share this state)',review:'Task finished with an unread result'};
export async function exportCodex(root,character,pack){
 const sheet=new PNG({width:1536,height:1872}),sourceCache=new Map();
 for(let row=0;row<rows.length;row++){
  const [,count]=rows[row];const [action,lo,hi,flip]=mappings[character][row],a=pack.animations[action];if(!a)throw Error('Missing native pet source '+action);
  let image=sourceCache.get(action);if(!image){image=PNG.sync.read(await fs.readFile(path.join(root,'assets',character,a.file)));sourceCache.set(action,image);}
  for(let col=0;col<count;col++){
   const frame=Math.max(0,Math.min(a.frames-1,Math.round(lo+(hi-lo)*col/Math.max(1,count-1))));
   // One shared integer scale and foot line. Never fit individual frame bboxes.
   for(let y=0;y<80;y++)for(let x=0;x<a.width;x++){
    const at=((Math.floor(frame/a.columns)*80+y)*image.width+frame%a.columns*a.width+x)*4;
    if(!image.data[at+3])continue;
    const jump=['gpt','deepseek'].includes(character)&&row===4?[0,-14,-24,-14,0][col]:0;
    const xx=flip?a.width-1-x:x,dx=Math.round(96-a.width)+xx*2,dy=42+y*2+jump;
    if(dx<0||dx+1>=192||dy<0||dy+1>=208)continue;
    for(let oy=0;oy<2;oy++)for(let ox=0;ox<2;ox++){const dest=((row*208+dy+oy)*1536+col*192+dx+ox)*4;image.data.copy(sheet.data,dest,at,at+4);}
   }
  }
 }
 const dir=path.join(root,'codex',character);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'spritesheet.png'),PNG.sync.write(sheet));
 const metadata={displayName:pack.name,description:'Pixel Agent Pets · '+pack.name+' · native desktop activity companion',spriteVersionNumber:1,spritesheetPath:'spritesheet.png'};
 await fs.writeFile(path.join(dir,'pet.json'),JSON.stringify(metadata,null,2));return metadata;
}
