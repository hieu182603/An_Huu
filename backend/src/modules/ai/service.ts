import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { transaction } from "../../common/transaction";
import { audit } from "../../common/audit";
import { AppError } from "../../common/errors";
import { PlansService } from "../plans/service";
import { ActualsService } from "../actuals/service";
import { assertActualSource } from "../actuals/lineage";
import { hasFutureAssumptions } from "../plans/presentation";
import { KnowledgeService } from "./knowledge";
import type { ExplanationProvider, ExplanationPacket } from "./provider";
import { AI_POLICY_VERSION, AI_RETENTION_DAYS, consentSchema, explanationSchema, aiSimulationSchema, titleSchema, messageEditSchema, pageSchema } from "./schema";
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonObject;
const digest=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const missing=()=>new AppError(404,"NOT_FOUND","Không tìm thấy hội thoại còn hiệu lực.");
const conflict=()=>new AppError(409,"REVISION_CONFLICT","Dữ liệu đã đổi. Hãy tải lại.");
const selection=z.object({factKeys:z.array(z.string()).min(1).max(6),citationIds:z.array(z.string()).max(4)}).strict();
const privacyView=(p:{revision:number;processing:boolean;saveHistory:boolean;policyVersion:string}|null)=>({revision:p?.revision??0,
  processing:p?.processing??false,saveHistory:p?.saveHistory??false,policyVersion:AI_POLICY_VERSION,acceptedPolicyVersion:p?.policyVersion??null,
  retentionDays:AI_RETENTION_DAYS,purpose:"EXPLAIN_SERVER_RESULTS",providerData:["QUESTION","SELECTED_RESULT_FACTS","APPROVED_KNOWLEDGE_EXCERPTS"],
  excludedData:["FULL_PROFILE","CONTACT_DETAILS","ACCOUNT_IDS","TRANSACTION_ENTRIES"],historyPolicy:"FIXED_EXPIRY_FROM_CONVERSATION_CREATION"});
export { purgeExpiredAi } from "./retention";
export class AiService {
  constructor(private db:PrismaClient,private provider:ExplanationProvider|null=null,private timeoutMs=8000){}
  private async consent(tx:Prisma.TransactionClient,userId:string,history=false){const p=await tx.aiPrivacy.findUnique({where:{userId}});
    if(!p?.processing || p.policyVersion!==AI_POLICY_VERSION || (history&&!p.saveHistory))throw new AppError(403,"AI_CONSENT_REQUIRED","Cần xác nhận mục đích xử lý/lưu dữ liệu AI.");return p;}
  private async owned(tx:Prisma.TransactionClient,userId:string,id:string){const row=await tx.aiConversation.findFirst({where:{id,userId,expiresAt:{gt:new Date()}}});if(!row)throw missing();return row;}
  private async erase(tx:Prisma.TransactionClient,userId:string,id?:string){const rows=await tx.aiConversation.findMany({where:{userId,...(id?{id}:{})},select:{id:true}});
    const ids=rows.map(row=>row.id);await tx.aiMessage.deleteMany({where:{conversationId:{in:ids}}});
    return (await tx.aiConversation.deleteMany({where:{id:{in:ids},userId}})).count;}
  private privacyResponse(p:Parameters<typeof privacyView>[0]){return {...privacyView(p),providerConfigured:!!this.provider,
    provider:this.provider?.name??null,reconsentRequired:!!p?.processing&&p.policyVersion!==AI_POLICY_VERSION,
    processingNotice:this.provider?.name==="gemini"
      ? "Câu hỏi, các kết quả cần giải thích và trích đoạn tri thức đã duyệt được phân tích bởi trí tuệ nhân tạo (AI) của hệ thống. Không nhập thông tin cá nhân không cần thiết. Việc lưu hội thoại là lựa chọn riêng của bạn."
      : "Giải thích các kết quả đã tính trên hệ thống. Việc lưu hội thoại là lựa chọn riêng."};}
  async privacy(userId:string){return this.privacyResponse(await this.db.aiPrivacy.findUnique({where:{userId}}));}
  async setPrivacy(userId:string,command:z.infer<typeof consentSchema>){const v=consentSchema.parse(command);
    try{return await transaction(this.db,async tx=>{const old=await tx.aiPrivacy.findUnique({where:{userId}});if((old?.revision??0)!==v.expectedRevision)throw conflict();
      const data={processing:v.processing,saveHistory:v.saveHistory,policyVersion:v.policyVersion};
      if(old){const changed=await tx.aiPrivacy.updateMany({where:{userId,revision:v.expectedRevision},data:{...data,revision:{increment:1}}});if(changed.count!==1)throw conflict();}
      else await tx.aiPrivacy.create({data:{userId,...data,revision:1}});
      if(!v.saveHistory)await this.erase(tx,userId);
      await audit(tx,userId,"AI_PRIVACY_UPDATED","AI_PRIVACY",userId,{...data,revision:v.expectedRevision+1});
      return this.privacyResponse(await tx.aiPrivacy.findUnique({where:{userId}}));});
    }catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==="P2002")throw conflict();throw e;}}
  async createConversation(userId:string){return transaction(this.db,async tx=>{await this.consent(tx,userId,true);
    const c=await tx.aiConversation.create({data:{userId,title:"Giải thích kế hoạch",revision:0,expiresAt:new Date(Date.now()+AI_RETENTION_DAYS*86400000)}});
    return {id:c.id,title:c.title,revision:c.revision,expiresAt:c.expiresAt!.toISOString()};});}
  async list(userId:string,query:z.infer<typeof pageSchema>){const q=pageSchema.parse(query),where={userId,expiresAt:{gt:new Date()}};
    return { ...q,total:await this.db.aiConversation.count({where}),items:await this.db.aiConversation.findMany({where,orderBy:{createdAt:"desc"},skip:(q.page-1)*q.limit,take:q.limit,
      select:{id:true,title:true,revision:true,createdAt:true,expiresAt:true}})};}
  async get(userId:string,id:string){return transaction(this.db,async tx=>{const c=await this.owned(tx,userId,id);return {id:c.id,title:c.title,revision:c.revision,expiresAt:c.expiresAt,
    messages:await tx.aiMessage.findMany({where:{conversationId:id},orderBy:{createdAt:"asc"},select:{id:true,role:true,content:true,citedSources:true,context:true,createdAt:true}})};});}
  async rename(userId:string,id:string,command:z.infer<typeof titleSchema>){const v=titleSchema.parse(command);return transaction(this.db,async tx=>{await this.owned(tx,userId,id);
    const c=await tx.aiConversation.updateMany({where:{id,userId,revision:v.expectedRevision},data:{title:v.title,revision:{increment:1}}});if(c.count!==1)throw conflict();return {id,title:v.title,revision:v.expectedRevision+1};});}
  async editMessage(userId:string,id:string,messageId:string,command:z.infer<typeof messageEditSchema>){const v=messageEditSchema.parse(command);
    return transaction(this.db,async tx=>{await this.owned(tx,userId,id);
      const message=await tx.aiMessage.findFirst({where:{id:messageId,conversationId:id,role:"user"}});if(!message)throw missing();
      const changed=await tx.aiConversation.updateMany({where:{id,userId,revision:v.expectedRevision},data:{revision:{increment:1}}});if(changed.count!==1)throw conflict();
      // The old answer/context no longer describes the corrected question.
      if(message.requestKey)await tx.aiMessage.deleteMany({where:{conversationId:id,requestKey:message.requestKey,role:"assistant"}});
      await tx.aiMessage.update({where:{id:messageId},data:{content:v.content,requestKey:null}});
      return {id:messageId,revision:v.expectedRevision+1,answerRemoved:true};});}
  async remove(userId:string,id?:string){return transaction(this.db,async tx=>{if(id&&!await tx.aiConversation.findFirst({where:{id,userId}}))throw missing();
    // Invalidates all in-flight captures so a deleted thread cannot be recreated by a late answer.
    await tx.aiPrivacy.updateMany({where:{userId},data:{revision:{increment:1}}});const deleted=await this.erase(tx,userId,id);
    await audit(tx,userId,"AI_HISTORY_DELETED","AI_PRIVACY",userId,{deleted});return {deleted};});}
  async explain(userId:string,command:z.infer<typeof explanationSchema>,key:string){const v=explanationSchema.parse(command);z.string().uuid().parse(key);
    const requestHash=digest(v),knowledge=new KnowledgeService(this.db);
    const captured=await transaction(this.db,async tx=>{const privacy=await this.consent(tx,userId,!!v.conversationId);
      const conversation=v.conversationId?await this.owned(tx,userId,v.conversationId):null;
      const previous=conversation?await tx.aiMessage.findFirst({where:{conversationId:conversation.id,requestKey:key,role:"assistant"}}):null;
      if(previous){const data=previous.context as {requestHash:string;response:unknown};if(data.requestHash!==requestHash)throw new AppError(409,"IDEMPOTENCY_CONFLICT","Khóa đã dùng cho câu hỏi khác.");return {previous:data.response} as const;}
      if(conversation&&conversation.revision!==v.expectedRevision)throw conflict();
      if(conversation&&await tx.aiMessage.count({where:{conversationId:conversation.id}})>=100)throw new AppError(422,"CONVERSATION_LIMIT","Hội thoại đã đủ số lượt; hãy tạo hội thoại mới.");
      const owned=v.planId?await new PlansService(this.db).readVersion(tx,userId,v.planId,v.versionId!):null;
      const actual=v.throughMonth?await new ActualsService(this.db).forecast(userId,{planId:v.planId!,versionId:v.versionId!,throughMonth:v.throughMonth},tx):null;
      const preview=owned?.version.preview, s=actual?actual.calculation?.summary:preview?.calculation?.summary;
      await assertActualSource(tx,userId,preview?.reforecast);
      const originalRetirementMonth=actual?.originalRetirementMonth??preview?.reforecast?.originalRetirementMonth;
      const comparisonDate=originalRetirementMonth&&s&&s.retirementMonth!==originalRetirementMonth
        ? `đầu phần dự báo còn lại ${s.retirementMonth}` : s ? `tháng nghỉ hưu ${s.retirementMonth}` : "";
      const facts=s?[
        {key:"fund",text:`Quỹ dự phóng tại ${comparisonDate}: ${s.atRetirement.projectedFund} VND. Đây là dự báo, không phải số dư thực tế.`},
        {key:"required",text:`Vốn cần tại cùng mốc ${comparisonDate}: ${s.atRetirement.requiredFund} VND; chênh lệch vốn cần trừ vốn dự phóng: ${s.atRetirement.fundingGap} VND.`},
        {key:"contribution",text:s.additionalMonthlyContribution===null?"Không tính được mức góp tăng đều trong các kỳ đủ điều kiện; cần xem thời điểm thiếu vốn và lịch đóng góp.":`Mức góp tăng đều tính từ lịch hiện tại: ${s.additionalMonthlyContribution} VND/tháng. Cần đối chiếu khả năng đóng góp.`},
        {key:"coverage",text:s.atRetirement.coveragePercent===null?"Vốn cần bằng không nên tỷ lệ bao phủ không áp dụng.":`Tỷ lệ vốn dự phóng trên vốn cần: ${s.atRetirement.coveragePercent}%. Đây không phải xác suất thành công.`},
        {key:"shortfall",text:s.firstShortfallMonth?`Tháng đầu có nhu cầu rút chưa được tài trợ: ${s.firstShortfallMonth}.` :"Mô hình không ghi nhận tháng có nhu cầu rút chưa được tài trợ trong kỳ đã chọn."},
        {key:"limits",text:"Kết quả phụ thuộc phiên bản giả định đã chọn, không là cam kết lợi nhuận. Tiền dư thu–chi không tự được nộp vào quỹ. Muốn thử thay đổi phải chạy mô phỏng; áp dụng cần bạn xác nhận riêng."}
      ]:actual?[{key:"actual-status",text:actual.status==="HORIZON_COMPLETE"?"Đã hết kỳ dự báo của phiên bản được chọn.":"Chưa thể dự báo phần còn lại. Cần bổ sung/đối soát những tháng được liệt kê trong ngữ cảnh."}]
        :[{key:"missing",text:"Chưa chọn phiên bản kế hoạch để giải thích số liệu. Hãy bổ sung dữ liệu, xem trước và chọn một bản đã lưu."}];
      if(actual?.anchor)facts.push({key:"actual-balance",text:`Số dư thực đã khai cuối tháng ${actual.anchor.period}: ${actual.anchor.closingBalance} VND. Trạng thái kiểm tra dự báo: ${actual.status}.`});
      if(preview && hasFutureAssumptions(preview))facts.push({key:"hypothetical",text:"Phiên bản này chứa đầu vào mô phỏng; các giá trị đó chưa thay đổi hồ sơ gốc."});
      if(preview?.warnings.length)facts.push({key:"warnings",text:"Phiên bản có cảnh báo dữ liệu hoặc quy ước tính. Hãy xem các cảnh báo của phiên bản trước khi sử dụng kết quả."});
      const savedActual=preview?.reforecast, savedAnchor=savedActual?.actualRevisions.at(-1);
      const sources=await knowledge.retrieve(tx,v.question);
      const provenance=owned?{planId:owned.plan.id,versionId:owned.version.id,snapshotHash:owned.version.snapshotHash,modelVersion:preview!.modelVersion,
        ...(preview?.modelVersion==="retirement-monthly-v4"?{sourceRegistry:{registryHash:preview.calculation.sourceRegistryHash,
          attribution:preview.calculation.attribution.filter(row=>!actual||row.month>actual.throughMonth)}}:{}),
        valuationDate:preview!.valuationDate,profileRevision:preview!.profileRevision,references:preview!.references,hypothetical:hasFutureAssumptions(preview!),
        warningCodes:preview!.warnings.map(w=>w.code),sources:preview!.sources,valueKind:actual||preview!.reforecast?"REFORECAST":"FORECAST",
        actuals:actual?{throughMonth:actual.throughMonth,status:actual.status,anchor:actual.anchor,issues:actual.issues,revisions:actual.actuals.map(a=>({month:a.period,revision:a.revision}))}
          :savedActual?{throughMonth:savedActual.throughMonth,status:"READY",anchor:savedAnchor??null,issues:[],revisions:savedActual.actualRevisions.map(a=>({month:a.period,revision:a.revision}))}:null}:null;
      return {privacyRevision:privacy.revision,conversation,facts,sources,provenance} as const;
    });
    if("previous" in captured)return captured.previous;
    // No DB IDs, profile, transaction rows or prior conversation sent to the provider.
    const packet:ExplanationPacket={question:v.question.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,"[email]").replace(/(?:\+?\d[\s().-]*){10,}/g,"[number]"),facts:captured.facts,
      knowledge:captured.sources.map((s,i)=>({id:"k"+i,title:s.title,content:s.content}))};
    let chosen={factKeys:captured.facts.map(f=>f.key),citationIds:[] as string[]},status=this.provider?"AI_ASSISTED":"PROVIDER_NOT_CONFIGURED";
    if(this.provider){const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
      try{const raw=await Promise.race([this.provider.select(packet,controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error("TIMEOUT"));},this.timeoutMs);})]);
        const parsed=selection.parse(raw);if(parsed.factKeys.some(k=>!packet.facts.some(f=>f.key===k))||parsed.citationIds.some(k=>!packet.knowledge.some(s=>s.id===k)))throw new Error("INVALID_SELECTION");chosen=parsed;
      }catch{status="PROVIDER_UNAVAILABLE";}finally{if(timer)clearTimeout(timer);controller.abort();}}
    return transaction(this.db,async tx=>{const privacy=await this.consent(tx,userId,!!v.conversationId);if(privacy.revision!==captured.privacyRevision)throw new AppError(409,"AI_PRIVACY_CHANGED","Tùy chọn dữ liệu đã đổi; câu trả lời không được lưu.");
      if(v.conversationId){await this.owned(tx,userId,v.conversationId);const old=await tx.aiMessage.findFirst({where:{conversationId:v.conversationId,requestKey:key,role:"assistant"}});
        if(old){const c=old.context as {requestHash:string;response:unknown};if(c.requestHash!==requestHash)throw new AppError(409,"IDEMPOTENCY_CONFLICT","Khóa đã dùng cho câu hỏi khác.");return c.response;}}
      const fresh=await knowledge.retrieve(tx,v.question);
      const citations=chosen.citationIds.flatMap(id=>{const s=captured.sources[Number(id.slice(1))];return s&&fresh.some(f=>f.id===s.id&&f.sourceRevision===s.sourceRevision&&f.contentHash===s.contentHash)?[{id:s.id,sourceId:s.sourceId,title:s.title,version:s.version,
        url:s.url?.startsWith("https://")?s.url:null,contentHash:s.contentHash,effectiveDate:s.effectiveDate,excerpt:s.content}]:[];});
      const facts=captured.facts.filter(f=>chosen.factKeys.includes(f.key)||["limits","hypothetical","warnings","actual-status"].includes(f.key));
      const response={status,answer:facts.map(f=>f.text).join("\n\n"),facts,citations,provenance:captured.provenance,knowledgeStatus:fresh.length?"AVAILABLE":"NO_APPROVED_MATCH",
        nextAction:"SIMULATE_WITH_USER_INPUTS_THEN_EXPLICIT_APPLY",applied:false,savedHistory:!!v.conversationId,
        conversationId:v.conversationId??null,revision:v.conversationId?v.expectedRevision!+1:null,provider:this.provider?.name??null};
      if(v.conversationId){const changed=await tx.aiConversation.updateMany({where:{id:v.conversationId,userId,revision:v.expectedRevision},data:{revision:{increment:1}}});if(changed.count!==1)throw conflict();
        await tx.aiMessage.create({data:{conversationId:v.conversationId,role:"user",content:v.question,requestKey:key}});
        await tx.aiMessage.create({data:{conversationId:v.conversationId,role:"assistant",content:response.answer,requestKey:key,citedSources:json(citations),context:json({requestHash,response})}});}
      return response;
    });
  }
  async simulate(userId:string,command:z.infer<typeof aiSimulationSchema>){const v=aiSimulationSchema.parse(command);
    const plans=new PlansService(this.db),baseline=await plans.version(userId,v.planId,v.versionId);
    const {retirementMonth,...changes}=v.changes;
    const preview={...baseline.preview.selection,...changes,expectedProfileRevision:v.expectedProfileRevision,
      ...(retirementMonth?{whatIf:{...baseline.preview.selection.whatIf,retirementMonth}}:{})};
    return plans.simulate(userId,v.planId,v.versionId,{preview});
  }
}
