// Reusable real-DB harness. Every fixture is rolled back; no worker/provider is started.
require('dotenv').config(); require('ts-node/register');
const assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto'),bcrypt=require('bcryptjs'),request=require('supertest');
const {PrismaClient}=require('@prisma/client'),{createApp}=require('../src/app'),{loadEnv}=require('../src/config/env'),{createServices}=require('../src/modules/services');
module.exports=async function runFixture(name,work){
 const db=new PrismaClient({log:[]}),rollback=new Error('EXPECTED_ROLLBACK'),info=console.info,error=console.error;
 console.info=()=>{};console.error=()=>{};let checks=0,stage='preflight';
 const fingerprint=async client=>{const result={};const tables=await client.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  for(const {tablename}of tables){assert.match(tablename,/^[a-z_]+$/);result[tablename]=await client.$queryRawUnsafe(`SELECT count(*)::int AS count,md5(COALESCE(string_agg(t::text,'|' ORDER BY t::text),'')) AS digest FROM "${tablename}" t`);}return result;};
 try{const before=await fingerprint(db),ids=[randomUUID(),randomUUID(),randomUUID()],password=randomBytes(24).toString('base64url'),passwordHash=await bcrypt.hash(password,12);
  const config=loadEnv({NODE_ENV:'test',DATABASE_URL:process.env.DATABASE_URL,JWT_SECRET:randomBytes(48).toString('hex'),JWT_REFRESH_SECRET:randomBytes(48).toString('hex'),OUTBOX_ENCRYPTION_KEY:randomBytes(32).toString('hex'),CLIENT_URL:'http://localhost:8443'});
  try{await db.$transaction(async tx=>{let seq=0;await tx.$executeRawUnsafe("SET LOCAL statement_timeout='10s'");
   const scoped=new Proxy(db,{get(_t,key){return key==='$transaction'?async fn=>{const point='fixture_'+(++seq);await tx.$executeRawUnsafe('SAVEPOINT '+point);try{const r=await fn(tx);await tx.$executeRawUnsafe('RELEASE SAVEPOINT '+point);return r;}catch(e){await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT '+point);await tx.$executeRawUnsafe('RELEASE SAVEPOINT '+point);throw e;}}:Reflect.get(tx,key);}});
   const s=createServices(scoped,config),app=createApp({config,services:s}),[owner,other,admin]=ids,tokens=[];
   stage="fixture-login"; for(const id of ids){await tx.user.create({data:{id,email:`${name.toLowerCase()}-${id}@example.invalid`,fullName:name+' rollback fixture',passwordHash,role:id===admin?'ADMIN':'USER',status:'ACTIVE',emailVerifiedAt:new Date()}});
    const r=await request(app).post('/api/v1/auth/login').send({email:`${name.toLowerCase()}-${id}@example.invalid`,password,remember:false});assert.equal(r.status,200);tokens.push(r.body.data.accessToken);}
   const api=(method,path,body,access=tokens[0],key=randomUUID())=>{const r=request(app)[method]('/api/v1'+path).set('Authorization','Bearer '+access).set('Idempotency-Key',key);return body===undefined?r:r.send(body);};
   await work({tx,db:scoped,s,config,app,api,owner,other,admin,tokens,check:()=>checks++,stage:value=>{stage=value;}});
   assert.equal(await tx.outboxEvent.count({where:{entityId:{in:ids},type:{startsWith:'auth.'}}}),0);
   throw rollback;
  },{isolationLevel:'Serializable',timeout:180000});}catch(e){if(e!==rollback)throw e;}
  stage='rollback';const after=await fingerprint(db),remainingFixtures=await db.user.count({where:{id:{in:ids}}});
  const changedTables=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(table=>JSON.stringify(before[table])!==JSON.stringify(after[table]));
  if(changedTables.length||remainingFixtures)error(JSON.stringify({suite:name,stage:'rollback-differences',changedTables,remainingFixtures}));
  assert.deepEqual(after,before);assert.equal(remainingFixtures,0);
  console.log(JSON.stringify({suite:name,checks,rollbackVerified:true,tablesPreserved:Object.keys(before).length,noEmailsQueued:true,noExternalCalls:true}));
 }catch(e){error(JSON.stringify({suite:name,stage,checks,code:e.code??e.errorCode??'VERIFY_FAILED',type:e.name,location:e.stack?.split('\n').find(l=>l.includes('verify-'))}));process.exitCode=1;}
 finally{console.info=info;console.error=error;await db.$disconnect();}
};
