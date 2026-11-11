import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { createApp } from "../app";
import { productQuery, catalogQuery } from "../modules/catalog/schema";
import { contentQuery } from "../modules/content/service";
import { bondInput, bondPreview, depositInput, depositPreview, monthDate } from "../modules/catalog/tools";
import { discoveryFixture } from "./discovery-fixtures";
import { config, token } from "./helpers";
import { Prisma } from "@prisma/client";
const deposit = { principal:"100000000", annualRate:"6", termMonths:12, startDate:"2026-01-31", payout:"END" as const };
const bond = { faceValue:"100000", purchasePrice:"95000", quantity:10, annualCoupon:"6", termMonths:12, couponEveryMonths:6 as const, startDate:"2026-01-31" };
beforeEach(() => { vi.spyOn(console,"info").mockImplementation(()=>{}); vi.spyOn(console,"error").mockImplementation(()=>{}); });
async function setup(options = {}) { const f = await discoveryFixture(options); vi.spyOn(f.auth,"validateSession").mockResolvedValue(f.owner); return { ...f, app:createApp({config,services:f.services}), headers:{Authorization:"Bearer "+token()} }; }
describe("published catalog and account bookmarks",()=>{
  it("paginates globally, filters by category/risk/provider and never exposes unpublished or incomplete terms",async()=>{
    const f = await setup();
    await f.db.partnerProduct.create({data:{partnerId:f.products[0].partnerId,name:"Incomplete",expectedReturn:"Undeclared",category:"Secret category",isVisible:true,annualFee:null,conditions:"",disclosure:""}});
    const first = await f.catalog.products(productQuery.parse({page:1,limit:12,sortBy:"name",order:"asc"}));
    expect(first.total).toBe(15);expect(first.items).toHaveLength(12);expect((await f.catalog.products(productQuery.parse({page:2,limit:12}))).items).toHaveLength(3);
    expect((await f.catalog.products(productQuery.parse({category:"Trái phiếu",riskLevel:"MEDIUM"}))).total).toBe(5);
    expect((await f.catalog.products(productQuery.parse({search:"Đối tác kiểm thử"}))).total).toBe(15);
    expect(JSON.stringify(first)).not.toContain("private@example.test");expect(JSON.stringify(await f.catalog.facets())).not.toContain("Secret category");
    await expect(f.catalog.products(productQuery.parse({}),false,f.hiddenProduct.id)).rejects.toMatchObject({status:404});
    expect(catalogQuery.safeParse({sortBy:"riskLevel"}).success).toBe(false);
  });
  it("persists saved products, makes repeated saves idempotent and isolates accounts",async()=>{
    const f=await setup(),id=f.products[0].id;
    for(let i=0;i<2;i++) expect((await request(f.app).put(`/api/v1/me/saved-products/${id}`).set(f.headers).send({})).status).toBe(200);
    expect(f.rows("savedProduct")).toHaveLength(1);expect((await f.community.savedProducts("test-user"))[0]).toMatchObject({id,conditions:f.products[0].conditions,disclosure:f.products[0].disclosure});expect(await f.community.savedProducts("other-user")).toEqual([]);
    await expect(f.community.saveProduct("test-user",f.hiddenProduct.id,true)).rejects.toMatchObject({status:404});
    f.rows("partnerProduct").find(row=>row.id===id)!.isVisible=false;expect(await f.community.savedProducts("test-user")).toEqual([]);
    await f.community.saveProduct("test-user",id,false);expect(f.rows("savedProduct")).toHaveLength(0);
  });
  it("does not save partially published products or bypass the saved-product limit",async()=>{
    const f=await setup();for(let i=0;i<200;i++)await f.db.savedProduct.create({data:{userId:"test-user",productId:`synthetic-${i}`}});
    await expect(f.community.saveProduct("test-user",f.products[0].id,true)).rejects.toMatchObject({code:"SAVED_LIMIT"});
    const partial=await f.db.partnerProduct.create({data:{partnerId:f.products[0].partnerId,isVisible:true,name:"Incomplete",expectedReturn:"Undeclared",category:"Tiền gửi"}});
    await expect(f.community.saveProduct("other-user",partial.id,true)).rejects.toMatchObject({status:404});
  });
  it("records real consultation tickets, validates current terms, prevents duplicates and withdraws only owned active tickets",async()=>{
    const f=await setup(),p=f.products[0],data={channel:"EMAIL" as const,message:"Hỏi về điều kiện",consent:true as const,expectedProductRevision:p.revision};
    await expect(f.community.consultProduct("test-user",p.id,{...data,expectedProductRevision:99})).rejects.toMatchObject({status:409});expect(f.rows("supportTicket")).toHaveLength(0);
    const ticket=await f.community.consultProduct("test-user",p.id,data);expect(ticket).toMatchObject({userId:"test-user",status:"OPEN"});expect(f.rows("supportMessage")[0].body).toContain(p.name);expect(f.rows("supportMessage")[0].body).toContain(p.conditions);expect(f.rows("supportMessage")[0].body).toContain(p.disclosure);expect(JSON.stringify(f.rows("auditLog").at(-1))).toContain(p.disclosure);
    await expect(f.community.consultProduct("test-user",p.id,data)).rejects.toMatchObject({code:"CONSULT_ALREADY_OPEN"});await expect(f.community.cancelTicket("other-user",ticket.id)).rejects.toMatchObject({status:404});
    await f.community.cancelTicket("test-user",ticket.id);expect(f.rows("supportTicket")[0].status).toBe("CLOSED");await expect(f.community.cancelTicket("test-user",ticket.id)).rejects.toMatchObject({status:409});
  });
  it("rolls consultation records back when audit fails and rejects hidden terms",async()=>{
    const f=await setup();await expect(f.community.consultProduct("test-user",f.hiddenProduct.id,{})).rejects.toMatchObject({status:404});f.failWrites("auditLog");
    await expect(f.community.consultProduct("test-user",f.products[0].id,{message:"Fixture"})).rejects.toThrow();expect(f.rows("supportTicket")).toHaveLength(0);expect(f.rows("supportMessage")).toHaveLength(0);
  });
});
describe("published article library",()=>{
  it("counts only published articles, supports accent-insensitive multiword search and paginated categories",async()=>{
    const f=await setup();const data=await f.content.list(contentQuery.parse({page:1,limit:12,search:"kien THUC"}));expect(data.total).toBe(16);expect(data.items).toHaveLength(12);
    expect((await f.content.list(contentQuery.parse({category:"BHXH"}))).total).toBe(4);expect(JSON.stringify(await f.content.facets())).not.toContain("Chuyên mục chưa công bố");
    await expect(f.content.publishedArticle(f.draft.slug)).rejects.toMatchObject({status:404});
    expect((await request(f.app).get("/api/v1/content-facets")).status).toBe(200);
  });
  it("saves articles per account, reloads saved-only pagination and hides unpublication without deleting the bookmark",async()=>{
    const f=await setup(),a=f.articles[0];await f.content.save("test-user",a.id,true);await f.content.save("test-user",a.id,true);expect(f.rows("savedArticle")).toHaveLength(1);
    expect(await f.content.saved("other-user")).toEqual([]);expect((await f.content.list(contentQuery.parse({}),false,"test-user")).total).toBe(1);
    await expect(f.content.save("test-user",f.draft.id,true)).rejects.toMatchObject({status:404});
    f.rows("article").find(row=>row.id===a.id)!.status="DRAFT";expect(await f.content.saved("test-user")).toEqual([]);expect((await f.content.list(contentQuery.parse({}),false,"test-user")).total).toBe(0);
    await f.content.save("test-user",a.id,false);expect(f.rows("savedArticle")).toHaveLength(0);
  });
  it("does not allow FAQ or glossary content to become a saved article",async()=>{
    const f=await setup();const faq=await f.content.write("admin",{title:"FAQ fixture",slug:"faq-fixture",excerpt:"Excerpt",content:"Body",category:"FAQ",authorName:"Fixture",thumbnail:null,kind:"FAQ",status:"PUBLISHED"});
    await expect(f.content.publishedArticle(faq.slug)).rejects.toMatchObject({status:404});await expect(f.content.save("test-user",faq.id,true)).rejects.toMatchObject({status:404});
  });
});
describe("read-only monetary illustrations",()=>{
  it("clamps month-end and leap dates independently of the host timezone",()=>{expect(monthDate("2024-01-31",1)).toBe("2024-02-29");expect(monthDate("2026-01-31",1)).toBe("2026-02-28");expect(monthDate("2026-12-31",2)).toBe("2027-02-28");});
  it("distinguishes end-term payment, monthly cash already paid and monthly compounding",()=>{
    expect(depositPreview(deposit)).toMatchObject({interest:"6000000.00",totalReceived:"106000000.00",maturityPayment:"106000000.00"});
    expect(depositPreview({...deposit,payout:"MONTHLY"})).toMatchObject({monthlyPayout:"500000.00",interest:"6000000.00",maturityPayment:"100000000.00",totalReceived:"106000000.00"});
    const compound=depositPreview({...deposit,payout:"COMPOUND"});expect(compound.interest).toBe("6167781.19");
  });
  it("settles early monthly withdrawal without paying previously collected interest twice",()=>{
    const r=depositPreview({...deposit,payout:"MONTHLY",early:{month:6,annualRate:"0.1"}});
    expect(r.early).toMatchObject({interest:"50000.00",alreadyPaid:"3000000.00",settlementPayment:"97050000.00",totalReceived:"100050000.00"});
    expect(new Prisma.Decimal(r.early!.alreadyPaid).plus(r.early!.settlementPayment).toFixed(2)).toBe(r.early!.totalReceived);
  });
  it("preserves large principal cents and zero rates, and rejects invalid or excessive inputs",()=>{
    expect(depositPreview({...deposit,principal:"9007199254740993.25",annualRate:"0"}).totalReceived).toBe("9007199254740993.25");
    for(const change of [{principal:"-1"},{annualRate:"abc"},{annualRate:"51"},{termMonths:121},{termMonths:1.5},{startDate:"2026-02-31"},{early:{month:12,annualRate:"0"}},{userId:"other"}])expect(depositInput.safeParse({...deposit,...change}).success).toBe(false);
  });
  it("uses face value for coupon and purchase price for cost and current yield",()=>{
    const r=bondPreview(bond);expect(r).toMatchObject({cost:"950000.00",faceValueTotal:"1000000.00",totalCoupons:"60000.00",totalReceived:"1060000.00",gain:"110000.00",currentYieldPercent:"6.31578947"});
    expect(r.schedule.map(row=>row.total)).toEqual(["30000.00","1030000.00"]);expect(Number(r.nominalYtmPercent)).toBeGreaterThan(6.3);
    expect(r.schedule.reduce((sum,row)=>sum.plus(row.total),new Prisma.Decimal(0)).toFixed(2)).toBe(r.totalReceived);
  });
  it("solves zero-coupon yields from cashflows rather than substituting coupon/price",()=>{
    const r=bondPreview({...bond,annualCoupon:"0",quantity:1,purchasePrice:"90000"});expect(Number(r.nominalYtmPercent)).toBeCloseTo((Math.sqrt(100000/90000)-1)*200,6);expect(r.currentYieldPercent).toBe("0.00000000");
    expect(Number(bondPreview({...bond,annualCoupon:"0",purchasePrice:"110000"}).nominalYtmPercent)).toBeLessThan(0);
  });
  it("counts only coupons due before sale and preserves an actual capital loss",()=>{
    const r=bondPreview({...bond,sale:{month:7,price:"80000"}});expect(r.sale).toMatchObject({collectedCoupons:"30000.00",proceeds:"800000.00",gain:"-120000.00"});
    expect(bondPreview({...bond,sale:{month:5,price:"80000"}}).sale?.collectedCoupons).toBe("0.00");
  });
  it("keeps schedules bounded and rejects fractional quantities, bad rates and incompatible coupon intervals",()=>{
    for(const change of [{quantity:1.2},{termMonths:601},{annualCoupon:"NaN"},{termMonths:5},{sale:{month:12,price:"0"}},{purchasePrice:"0"}])expect(bondInput.safeParse({...bond,...change}).success).toBe(false);
    expect(bondPreview({...bond,termMonths:600,couponEveryMonths:1}).schedule).toHaveLength(600);
  });
  it("enforces USER HTTP access and performs no plan/profile/saved-data write",async()=>{
    const f=await setup(),before=await f.profiles.getProfile("test-user"),audit=f.rows("auditLog").length;
    expect((await request(f.app).post("/api/v1/me/product-tools/deposit/preview").send(deposit)).status).toBe(401);
    expect((await request(f.app).post("/api/v1/me/product-tools/bond/preview").set("Authorization","Bearer "+token("ADMIN")).send(bond)).status).toBe(403);
    expect((await request(f.app).post("/api/v1/me/product-tools/deposit/preview").set(f.headers).send(deposit)).body.data.informationalOnly).toBe(true);
    expect(await f.profiles.getProfile("test-user")).toEqual(before);expect(f.rows("auditLog")).toHaveLength(audit);expect(f.rows("savedProduct")).toHaveLength(0);
  });
});

it("validates discovery HTTP responses against the published OpenAPI contracts", async () => {
  const f = await setup(), document = await SwaggerParser.dereference("docs/openapi.yaml") as any;
  const ajv = new Ajv({ strict:false, formats:{ uuid:true, "date-time":true, date:true } });
  const id = f.products[0].id;
  await f.community.saveProduct("test-user", id, true);
  const calls = [
    ["get", "/products/facets", "/products/facets", undefined, 200],
    ["get", "/content-facets", "/content-facets", undefined, 200],
    ["get", "/me/saved-products", "/me/saved-products", undefined, 200],
    ["post", "/me/product-tools/deposit/preview", "/me/product-tools/deposit/preview", {...deposit, payout:"MONTHLY", early:{month:6,annualRate:"0.1"}}, 200],
    ["post", "/me/product-tools/bond/preview", "/me/product-tools/bond/preview", {...bond, sale:{month:7,price:"80000"}}, 200],
    ["post", `/me/products/${id}/consult`, "/me/products/{id}/consult", {channel:"EMAIL",consent:true,expectedProductRevision:f.products[0].revision}, 201],
  ] as const;
  for (const [method, url, contract, body, status] of calls) {
    const agent = request(f.app), call = method === "get" ? agent.get("/api/v1"+url) : agent.post("/api/v1"+url);
    call.set(f.headers); if(body) call.send(body);
    const res = await call;
    expect(res.status).toBe(status);
    const schema = document.paths["/api/v1"+contract][method].responses[status].content["application/json"].schema;
    const validate = ajv.compile(schema);
    expect(validate(res.body), `${url}: ${JSON.stringify(validate.errors)}`).toBe(true);
  }
});
