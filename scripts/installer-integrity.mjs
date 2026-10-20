import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const packageName='dsh-pixel-agent-pets';
export const relativeFile=value=>typeof value==='string'&&value.length>0&&!/[\\\x00-\x1f]/.test(value)&&!/^[a-z]:/i.test(value)&&!path.posix.isAbsolute(value)&&value.split('/').every(part=>part&&part!=='.'&&part!=='..');
export async function regularFile(root,relative){
 if(!relativeFile(relative))throw Error('Unsafe release path: '+relative);
 const file=path.join(root,...relative.split('/')),stat=await fs.lstat(file);
 if(!stat.isFile()||stat.isSymbolicLink())throw Error('Release inputs must be regular files: '+relative);
 const realRoot=await fs.realpath(root),realFile=await fs.realpath(file);
 if(!realFile.startsWith(realRoot+path.sep))throw Error('Release input escapes its package: '+relative);
 return{file,stat};
}
export async function tree(root,prefix=''){
 const entries=await fs.readdir(path.join(root,prefix),{withFileTypes:true}),files=[];
 for(const entry of entries.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
  const relative=prefix?prefix+'/'+entry.name:entry.name;if(!relativeFile(relative)||entry.isSymbolicLink())throw Error('Unsafe staged release entry: '+relative);
  if(entry.isDirectory())files.push(...await tree(root,relative));else if(entry.isFile())files.push(relative);else throw Error('Unsupported staged release entry: '+relative);
 }
 return files;
}
/** Built-in Node modules only; verification performs no install, launch or profile write. */
export async function verifyInstallerPayload(directory){
 await regularFile(directory,'integrity.json');const manifest=JSON.parse(await fs.readFile(path.join(directory,'integrity.json'),'utf8'));
 if(manifest.version!==1||manifest.package!==packageName||!Array.isArray(manifest.files))throw Error('Invalid installer integrity manifest');
 const expected=new Set(['integrity.json']);let bytes=0;
 for(const entry of manifest.files){
  if(!relativeFile(entry.path)||expected.has(entry.path)||!Number.isSafeInteger(entry.size)||entry.size<0||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Invalid installer integrity entry');
  expected.add(entry.path);const{file,stat}=await regularFile(directory,entry.path);
  const sha256=createHash('sha256').update(await fs.readFile(file)).digest('hex');
  if(stat.size!==entry.size||sha256!==entry.sha256)throw Error('Installer integrity mismatch: '+entry.path);bytes+=entry.size;
 }
 const actual=await tree(directory);if(actual.length!==expected.size||actual.some(file=>!expected.has(file)))throw Error('Installer payload contains unexpected files');
 const targets=manifest.targets??['codex','dsh'];
 if(!Array.isArray(targets)||!targets.length||new Set(targets).size!==targets.length||targets.some(target=>!['codex','dsh'].includes(target)))throw Error('Invalid installer target capabilities');
 return{files:manifest.files.length,bytes,version:manifest.packageVersion,animations:manifest.animations,targets};
}
