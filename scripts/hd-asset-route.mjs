import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const assetRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../assets-hd');
export const hdRoute='/pixel-agent-pets/assets';
/** Only package-owned, manifest-listed images are exposed; no arbitrary file serving. */
export async function assetHandler(root=assetRoot){
 let parsed,metadata,allowed;
 try{
  metadata=await fs.readFile(path.join(root,'manifest.json'));
  parsed=JSON.parse(metadata);
  if(parsed.version!==1||!parsed.characters)throw Error('Unsupported HD manifest');
  allowed=new Set();
  for(const [character,pack]of Object.entries(parsed.characters))for(const [action,levels]of Object.entries(pack.animations??{}))for(const [level,variant]of Object.entries(levels)){
   if(!/^(claude|gpt|deepseek)$/.test(character)||!/^[A-Za-z0-9_-]+$/.test(action)||!['160','320'].includes(level))continue;
   for(const file of variant.files??[])if(typeof file==='string'&&file.startsWith(character+'/'+action+'/')&&/^(160|320)-\d+\.png$/.test(file.slice((character+'/'+action+'/').length)))allowed.add(file);
  }
 }catch{metadata=null;allowed=new Set();}
 return async(req,res)=>{
  const finish=(status,text)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?'':text);};
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');finish(405,'Method not allowed');return;}
  let pathname;try{pathname=decodeURIComponent((req.url??'').split('?')[0]);}catch{finish(400,'Invalid path');return;}
  if(!pathname.startsWith(hdRoute+'/')){finish(404,'Not found');return;}
  const file=pathname.slice(hdRoute.length+1);
  if(file==='manifest.json'){
   if(!metadata){finish(404,'HD assets are not installed');return;}
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Length':metadata.length,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:metadata);return;
  }
  if(!allowed.has(file)){finish(404,'Not found');return;}
  try{
   const full=path.resolve(root,file),stat=await fs.lstat(full);
   if(!stat.isFile()){finish(404,'Not found');return;}
   const actual=await fs.realpath(full),realRoot=await fs.realpath(root);
   if(!actual.startsWith(realRoot+path.sep)){finish(404,'Not found');return;}
   const bytes=await fs.readFile(actual);
   res.writeHead(200,{'Content-Type':'image/png','Content-Length':bytes.length,'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);
  }catch{finish(404,'Not found');}
 };
}
export const inject=['webServer'];
export async function apply(ctx){
 const handler=await assetHandler();
 return ctx.webServer.register({kind:'prefix',path:hdRoute,handler});
}
