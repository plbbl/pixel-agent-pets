import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const desktop=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function files(directory){const result=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())result.push(...await files(file));else if(entry.isFile())result.push(file);}return result;}
export async function packageArtifacts({platform=process.platform,arch=process.arch,source=path.join(desktop,'src-tauri/target/release/bundle'),output=path.join(desktop,'artifacts')}={}){
 const extension=platform==='darwin'?'.dmg':platform==='win32'?'-setup.exe':null;if(!extension)throw Error('Native downloads currently target macOS and Windows');
 const candidates=(await files(source)).filter(file=>file.endsWith(extension));if(candidates.length!==1)throw Error('Expected exactly one native installer');
 const filename=platform==='darwin'?'Pixel-Agent-Pets-macOS-'+arch+'.dmg':'Pixel-Agent-Pets-Windows-'+arch+'-setup.exe';
 await fs.mkdir(output,{recursive:true});const target=path.join(output,filename);await fs.copyFile(candidates[0],target);const hash=createHash('sha256').update(await fs.readFile(target)).digest('hex');await fs.writeFile(target+'.sha256',hash+'  '+filename+'\n');console.log(filename+' '+hash);return{filename,path:target,sha256:hash};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))packageArtifacts().catch(error=>{console.error(error.message);process.exitCode=1;});
