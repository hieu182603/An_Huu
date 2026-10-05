const run=require('./rollback-fixture.cjs'),assert=require('node:assert/strict');
const {runAiRetention}=require('../src/modules/ai/retention');
run('RETENTION',async({tx,db,owner,check,stage})=>{
 stage('scoped-retention');const cutoff=new Date(),ids=[];
 for(const expiresAt of [new Date(cutoff.getTime()-1),cutoff,null,new Date(cutoff.getTime()+86400000)]){
  const c=await tx.aiConversation.create({data:{userId:owner,expiresAt}});ids.push(c.id);
  await tx.aiMessage.create({data:{conversationId:c.id,role:'user',content:'Synthetic retention fixture',context:{synthetic:true}}});
 }
 // Every read/delete is scoped to fixture IDs, even inside nested transactions.
 const scoped=client=>new Proxy(client,{get(target,key){
  if(key==='$transaction')return fn=>db.$transaction(t=>fn(scoped(t)));
  if(key==='aiConversation'||key==='aiMessage')return new Proxy(target[key],{get(model,method){
   const original=model[method];if(typeof original!=='function')return original;
   return args=>original.call(model,{...args,where:{AND:[args?.where||{},key==='aiConversation'?{id:{in:ids}}:{conversationId:{in:ids}}]}});
  }});return Reflect.get(target,key);
 }});
 const safe=scoped(db),before=await tx.aiMessage.count({where:{conversationId:{in:ids}}});
 assert.deepEqual(await runAiRetention(safe,{cutoff}),{mode:'DRY_RUN',cutoff:cutoff.toISOString(),eligible:3,deleted:0,batches:0,remaining:3,cancelled:false,complete:false});check();
 assert.equal(await tx.aiMessage.count({where:{conversationId:{in:ids}}}),before);check();
 const first=await runAiRetention(safe,{execute:true,cutoff,batchSize:2,maxBatches:1});assert.equal(first.deleted,2);assert.equal(first.remaining,1);assert.equal(first.complete,false);check();
 const last=await runAiRetention(safe,{execute:true,cutoff,batchSize:2});assert.equal(last.deleted,1);assert.equal(last.remaining,0);assert.equal(last.complete,true);check();
 assert.equal(await tx.aiConversation.count({where:{id:{in:ids}}}),1);assert.equal(await tx.aiMessage.count({where:{conversationId:{in:ids}}}),1);check();
 assert.ok(await tx.aiConversation.findUnique({where:{id:ids[3]}}));check();
 assert.equal((await runAiRetention(safe,{execute:true,cutoff})).deleted,0);check();
});
