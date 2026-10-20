import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath}from'node:url';
import * as asar from '@electron/asar';
import ts from 'typescript';
import {PNG}from'pngjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const allowed=new Set(['cat','w','h','fps','palette','base','deltas','a0','standMatch']);
/** Parse literal sprite data. Never evaluate the installed application's JS. */
export function parseClawd(source){
 const file=ts.createSourceFile('clawd.js',source,ts.ScriptTarget.Latest,true);let table;
 const visit=n=>{if(ts.isObjectLiteralExpression(n)&&n.properties.some(p=>p.name?.getText(file)==='BreakDancing')&&n.properties.some(p=>p.name?.getText(file)==='Running'))table=n;ts.forEachChild(n,visit);};visit(file);
 if(!table)throw Error('This Claude version has no recognized Clawd Quest table. Supply a compatible local sprite JSON with --source.');
 const literal=n=>{
  if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return n.text;
  if(ts.isNumericLiteral(n))return Number(n.text);
  if(ts.isPrefixUnaryExpression(n)&&n.operator===ts.SyntaxKind.MinusToken)return -literal(n.operand);
  if(ts.isArrayLiteralExpression(n))return n.elements.map(literal);
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='split'&&n.arguments.length===1)return literal(n.expression.expression).split(literal(n.arguments[0]));
  throw Error('Unsupported non-literal sprite data');
 };
 const result={};for(const entry of table.properties){const name=entry.name.getText(file).replace(/^['"]|['"]$/g,'');if(!/^[A-Z][A-Za-z]+$/.test(name)||!ts.isObjectLiteralExpression(entry.initializer))throw Error('Unexpected Clawd entry');result[name]={};for(const p of entry.initializer.properties){const key=p.name.getText(file);if(allowed.has(key))result[name][key]=literal(p.initializer);}}
 return result;
}
export function decodeSprite(s){
 if(!Number.isInteger(s.w)||!Number.isInteger(s.h)||s.w<1||s.h<1||s.w>256||s.h>256||s.base.length!==s.w*s.h||!Array.isArray(s.deltas)||s.deltas.length>1000)throw Error('Invalid local sprite dimensions');
 const pixels=Uint8Array.from(s.base,c=>c==='.'?255:parseInt(c,36)),frames=[pixels.slice()];
 for(const delta of s.deltas){if(delta)for(const token of delta.split(',')){const i=parseInt(token.slice(0,-1),36),v=token.at(-1)==='.'?255:parseInt(token.at(-1),36);if(i<0||i>=pixels.length||!Number.isInteger(v)||v!==255&&v>=s.palette.length)throw Error('Invalid sprite delta');pixels[i]=v;}frames.push(pixels.slice());}
 return frames;
}
export async function importClawd(source){
 let bytes,table;
 if(source&&source.endsWith('.json')){bytes=await fs.readFile(source);table=JSON.parse(bytes);}
 else{
  const candidates=source?[source]:[process.platform==='darwin'?'/Applications/Claude.app/Contents/Resources/app.asar':null,process.env.LOCALAPPDATA?path.join(process.env.LOCALAPPDATA,'AnthropicClaude','app.asar'):null].filter(Boolean);
  const archive=candidates.find(p=>{try{return asar.listPackage(p).length>0;}catch{return false;}});
  if(!archive)throw Error('Claude is not installed at a recognized location. Use import-clawd --source <app.asar or local sprite.json>.');
  const file=asar.listPackage(archive).find(p=>/clawdQuestEngine[^/]*\.js$/.test(p));if(!file)throw Error('The installed Claude version has no supported local Clawd Quest assets.');
  bytes=asar.extractFile(archive,file.replace(/^\//,''));table=parseClawd(bytes.toString('utf8'));
 }
 if(Object.keys(table).length!==25)throw Error('Expected all 25 original Clawd animations');
 const dir=path.join(root,'assets','clawd');await fs.mkdir(dir,{recursive:true});const animations={};
 const loops={Laptop:33,Desktop:75,Running:16};
 for(const[name,s]of Object.entries(table)){
  const frames=decodeSprite(s),atlas=new PNG({width:800,height:Math.ceil(frames.length/10)*80});const palette=s.palette.map(h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]);
  const scale=1.5,[x,y,w,h]=s.a0,offsetX=40-(x+w/2)*scale,offsetY=67-(y+h)*scale;
  frames.forEach((frame,n)=>{for(let yy=0;yy<80;yy++)for(let xx=0;xx<80;xx++){const sx=Math.floor((xx-offsetX)/scale),sy=Math.floor((yy-offsetY)/scale);if(sx<0||sy<0||sx>=s.w||sy>=s.h)continue;const v=frame[sy*s.w+sx];if(v===255)continue;const c=palette[v];if(!c)throw Error('Invalid sprite palette');const at=((Math.floor(n/10)*80+yy)*800+n%10*80+xx)*4;atlas.data[at]=c[0];atlas.data[at+1]=c[1];atlas.data[at+2]=c[2];atlas.data[at+3]=255;}});
  await fs.writeFile(path.join(dir,name+'.png'),PNG.sync.write(atlas));animations[name]={title:name,file:name+'.png',width:80,height:80,columns:10,frames:frames.length,fps:s.fps,poster:0,sustain:Math.min(loops[name]??frames.length-1,frames.length-1),captions:[]};
 }
 await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({name:'原版 Clawd',localImport:true,sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),animations},null,2));
 return {animations:Object.keys(animations).length,directory:dir};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const arg=process.argv.indexOf('--source');console.log(await importClawd(arg>=0?process.argv[arg+1]:undefined));}
