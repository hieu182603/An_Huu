import { expect, it, vi } from "vitest";
import { memoryDb } from "./memory-db";
import { purgeExpiredAi, runAiRetention } from "../modules/ai/retention";
import { loadRetentionConfig } from "../config/retention";

const cutoff = new Date("2026-10-05T00:00:00Z");
async function fixture() {
  const f = memoryDb();
  for (const [id, expiresAt] of [["expired",new Date(cutoff.getTime()-1)],["boundary",cutoff],["legacy",null],
    ["live",new Date(cutoff.getTime()+1)]] as const) {
    await f.db.aiConversation.create({data:{id,userId:"u",expiresAt}});
    await f.db.aiMessage.create({data:{conversationId:id,role:"user",content:"private",context:{private:"context"}}});
  }
  return f;
}
it("defaults to dry run without deleting conversation or context", async () => {
  const f=await fixture(),before=JSON.stringify([f.rows("aiConversation"),f.rows("aiMessage")]);
  expect(await runAiRetention(f.db,{cutoff})).toMatchObject({mode:"DRY_RUN",eligible:3,deleted:0,batches:0,remaining:3,complete:false});
  expect(JSON.stringify([f.rows("aiConversation"),f.rows("aiMessage")])).toBe(before);
});
it("bounds a sweep, drains the backlog across runs, preserves unexpired rows and is repeatable", async () => {
  const f=await fixture();
  expect(await runAiRetention(f.db,{cutoff,execute:true,batchSize:2,maxBatches:1})).toMatchObject({deleted:2,remaining:1,complete:false});
  expect(await runAiRetention(f.db,{cutoff,execute:true,batchSize:2,maxBatches:2})).toMatchObject({deleted:1,remaining:0,complete:true});
  expect(f.rows("aiConversation").map(r=>r.id)).toEqual(["live"]);
  expect(f.rows("aiMessage").map(r=>r.conversationId)).toEqual(["live"]);
  expect(await runAiRetention(f.db,{cutoff,execute:true})).toMatchObject({deleted:0,complete:true});
});
it("rolls message deletion back if conversation deletion fails", async () => {
  const f=await fixture();vi.spyOn(f.db.aiConversation,"deleteMany").mockRejectedValueOnce(new Error("db failed"));
  await expect(purgeExpiredAi(f.db,100,cutoff)).rejects.toThrow("db failed");
  expect(f.rows("aiConversation")).toHaveLength(4);expect(f.rows("aiMessage")).toHaveLength(4);
});
it("honors shutdown before a batch and between committed batches", async () => {
  const f=await fixture(),controller=new AbortController();controller.abort();
  expect(await runAiRetention(f.db,{cutoff,execute:true,signal:controller.signal})).toMatchObject({deleted:0,cancelled:true,complete:false});
  const later=new AbortController(),original=f.db.aiConversation.deleteMany.bind(f.db.aiConversation);
  vi.spyOn(f.db.aiConversation,"deleteMany").mockImplementation(args=>{later.abort();return original(args);});
  expect(await runAiRetention(f.db,{cutoff,execute:true,batchSize:1,signal:later.signal})).toMatchObject({deleted:1,batches:1,remaining:2,cancelled:true});
});
it("requires only DB configuration and validates limits without leaking values", async () => {
  expect(loadRetentionConfig({DATABASE_URL:"postgresql://fixture@localhost/db"})).toMatchObject({AI_RETENTION_BATCH_SIZE:100,AI_RETENTION_MAX_BATCHES:10});
  for(const source of [{DATABASE_URL:"private-key"},{DATABASE_URL:"postgresql://fixture@localhost/db",AI_RETENTION_BATCH_SIZE:"0"}])
    expect(()=>loadRetentionConfig(source)).toThrow("AI_RETENTION_CONFIG_INVALID");
  const f=memoryDb();
  await expect(purgeExpiredAi(f.db,0)).rejects.toThrow("AI_RETENTION_CONFIG_INVALID");
  await expect(runAiRetention(f.db,{maxBatches:101})).rejects.toThrow("AI_RETENTION_CONFIG_INVALID");
  await expect(runAiRetention(f.db,{cutoff:new Date(NaN)})).rejects.toThrow("AI_RETENTION_CONFIG_INVALID");
});
