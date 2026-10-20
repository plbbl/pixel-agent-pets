import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {assetHandler,apply,hdRoute} from '../scripts/hd-asset-route.mjs';
function response(){return {headers:{},setHeader(name,value){this.headers[name]=value;},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},end(body){this.body=body;}};}
test('DSH local UI route serves only manifest-owned images and blocks traversal, symlinks, and writes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pet-hd-route-'));try{
  await fs.mkdir(path.join(root,'gpt/gate'),{recursive:true});const png=Buffer.from([137,80,78,71,13,10,26,10]);await fs.writeFile(path.join(root,'gpt/gate/160-0.png'),png);await fs.writeFile(path.join(root,'secret'),'private');
  await fs.symlink(path.join(root,'secret'),path.join(root,'gpt/gate/160-1.png'));
  const manifest={version:1,characters:{gpt:{animations:{gate:{160:{files:['gpt/gate/160-0.png','gpt/gate/160-1.png','../secret']}}}}}};
  await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest));const handler=await assetHandler(root);
  const get=async(url,method='GET')=>{const res=response();await handler({url,method},res);return res;};
  const valid=await get(hdRoute+'/gpt/gate/160-0.png');assert.equal(valid.status,200);assert.equal(valid.headers['Content-Type'],'image/png');assert.deepEqual(valid.body,png);
  assert.equal((await get(hdRoute+'/manifest.json')).status,200);assert.equal((await get(hdRoute+'/gpt/gate/160-1.png')).status,404);assert.equal((await get(hdRoute+'/gpt/gate/160-0.png','HEAD')).body,undefined);
  for(const file of ['/../secret','/%2e%2e/secret','/gpt/gate/320-0.png','/%ZZ'])assert.ok((await get(hdRoute+file)).status>=400);
  assert.equal((await get(hdRoute+'/gpt/gate/160-0.png','POST')).status,405);
  const external=await fs.mkdtemp(path.join(os.tmpdir(),'pet-hd-outside-'));try{await fs.writeFile(path.join(external,'hidden.png'),png);await fs.unlink(path.join(root,'gpt/gate/160-1.png'));await fs.symlink(path.join(external,'hidden.png'),path.join(root,'gpt/gate/160-1.png'));assert.equal((await get(hdRoute+'/gpt/gate/160-1.png')).status,404);}finally{await fs.rm(external,{recursive:true,force:true});}
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('host extension adds a UI-only route through the official webServer service',async()=>{
 let route,removed=false;const off=await apply({webServer:{register(value){route=value;return()=>{removed=true;};}}});assert.equal(route.kind,'prefix');assert.equal(route.path,hdRoute);assert.equal(typeof route.handler,'function');off();assert.equal(removed,true);
});
