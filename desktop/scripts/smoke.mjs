import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const desktop=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function validateSmoke(report){
 if(report?.ok!==true||report.frontendReady!==true||report.frameDrawn!==true||report.drawnPixels<=0||report.characters!==4||report.animations!==66)throw Error('Native frontend did not confirm a nonblank frame');
 const checks=report.checks;if(!Array.isArray(checks)||!['claude','gpt','deepseek','clawd'].every(c=>checks.some(check=>check.character===c&&check.drawnPixels>0))||!['auto','80','160','320'].every(q=>checks.some(check=>check.quality===q&&check.drawnPixels>0)))throw Error('Native smoke test must draw every character and quality');
 return report;
}
export async function smoke({binary=path.join(desktop,'src-tauri/target/release/pixel-agent-pets'+(process.platform==='win32'?'.exe':'')),report=path.join(desktop,'artifacts',process.platform+'-'+process.arch+'.smoke.json'),timeout=45000}={}){
 await fs.rm(report,{force:true});await fs.mkdir(path.dirname(report),{recursive:true});
 const code=await new Promise((resolve,reject)=>{const child=spawn(binary,['--smoke-test',report],{stdio:'inherit',shell:false});const timer=setTimeout(()=>{child.kill();reject(Error('Native smoke test timed out'));},timeout);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',(code,signal)=>{clearTimeout(timer);signal?reject(Error('Native app exited with '+signal)):resolve(code);});});
 const result=JSON.parse(await fs.readFile(report,'utf8'));if(code!==0)throw Error('Native app smoke failed: '+(result.reason??code));validateSmoke(result);console.log(JSON.stringify(result,null,2));return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),value=key=>{const index=args.indexOf(key);if(index<0)return undefined;if(!args[index+1])throw Error(key+' needs a value');return path.resolve(args[index+1]);};
 smoke({binary:value('--binary'),report:value('--report')}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
