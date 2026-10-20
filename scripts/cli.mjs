#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runEasyInstaller} from './easy-install.mjs';
import {exists,packageName} from './install-lib.mjs';
import {verifyInstallerPayload} from './installer-integrity.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function verifySourceOrRelease(){
 if(await exists(path.join(root,'integrity.json')))return verifyInstallerPayload(root);
 const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));if(pkg.name!==packageName)throw Error('Invalid pet source package');
 // Development checkout: each host installer still validates its built inputs.
 const targets=[];if(await exists(path.join(root,'codex'))&&await exists(path.join(root,'codex-pixel')))targets.push('codex');if(await exists(path.join(root,'dist/client.js'))&&await exists(path.join(root,'assets-hd/manifest.json')))targets.push('dsh');
 return{version:pkg.version,targets};
}
export async function main(argv=process.argv.slice(2)){return runEasyInstaller(argv,{payloadRoot:root,operations:{verifyInstallerPayload:verifySourceOrRelease}});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
