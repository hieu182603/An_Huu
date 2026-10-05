import { createHash } from "node:crypto";
import { Prisma, type PrismaClient, type KnowledgeSource } from "@prisma/client";
import { z } from "zod";
import { transaction } from "../../common/transaction";
import { audit } from "../../common/audit";
import { AppError } from "../../common/errors";
import { sourceInputSchema, sourceEditSchema, sourceApprovalSchema, sourceRevisionSchema, pageSchema } from "./schema";
const hash = (s: KnowledgeSource) => createHash("sha256").update(JSON.stringify([s.title,s.referenceCode,s.category,s.version,s.rawContent,s.fileUrl,s.effectiveDate,s.validUntil])).digest("hex");
const tokens = (s: string) => [...new Set(s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").match(/[a-z0-9]{2,}/g) ?? [])];
const missing = () => new AppError(404, "NOT_FOUND", "Không tìm thấy nguồn tri thức.");
const conflict = () => new AppError(409, "REVISION_CONFLICT", "Nguồn đã thay đổi. Hãy tải lại.");
const dto = (s: KnowledgeSource) => ({ id:s.id,title:s.title,referenceCode:s.referenceCode,category:s.category,version:s.version,
  fileUrl:s.fileUrl,effectiveDate:s.effectiveDate?.toISOString() ?? null,validUntil:s.validUntil?.toISOString() ?? null,revision:s.revision,
  status:s.status,isApproved:s.isApproved,indexedHash:s.indexedHash,contentHash:hash(s),indexMethod:s.indexedHash ? "LEXICAL_V1" : null });
export class KnowledgeService {
  constructor(private db: PrismaClient) {}
  async list(query: z.infer<typeof pageSchema>) { const q = pageSchema.parse(query); return { ...q,total:await this.db.knowledgeSource.count(),
    items:(await this.db.knowledgeSource.findMany({ orderBy:{createdAt:"desc"},skip:(q.page-1)*q.limit,take:q.limit })).map(dto) }; }
  async get(id: string) { const s=await this.db.knowledgeSource.findUnique({where:{id}}); if(!s) throw missing(); return {...dto(s),rawContent:s.rawContent}; }
  async create(userId: string, command: z.infer<typeof sourceInputSchema>) {
    const v=sourceInputSchema.parse(command);
    return transaction(this.db,async tx=>{ const s=await tx.knowledgeSource.create({data:{...v,effectiveDate:new Date(v.effectiveDate),validUntil:v.validUntil?new Date(v.validUntil):null,
      referenceCode:v.referenceCode??null,fileUrl:v.fileUrl??null,revision:1,status:"PENDING",isApproved:false,indexedHash:null}});
      await audit(tx,userId,"KNOWLEDGE_CREATED","KNOWLEDGE",s.id,{revision:1}); return dto(s); });
  }
  async edit(userId: string,id:string,command:z.infer<typeof sourceEditSchema>) {
    const v=sourceEditSchema.parse(command);
    return transaction(this.db,async tx=>{ const s=await tx.knowledgeSource.findUnique({where:{id}});if(!s)throw missing();
      const result=await tx.knowledgeSource.updateMany({where:{id,revision:v.expectedRevision},data:{...v.data,effectiveDate:new Date(v.data.effectiveDate),validUntil:v.data.validUntil?new Date(v.data.validUntil):null,
        referenceCode:v.data.referenceCode??null,fileUrl:v.data.fileUrl??null,revision:{increment:1},isApproved:false,indexedHash:null,status:"PENDING",errorMessage:null}});
      if(result.count!==1)throw conflict();
      await audit(tx,userId,"KNOWLEDGE_EDITED","KNOWLEDGE",id,{revision:v.expectedRevision+1}); return dto((await tx.knowledgeSource.findUnique({where:{id}}))!); });
  }
  async index(userId:string,id:string,command:z.infer<typeof sourceRevisionSchema>) {
    const v=sourceRevisionSchema.parse(command);
    return transaction(this.db,async tx=>{ const s=await tx.knowledgeSource.findUnique({where:{id}});if(!s)throw missing();if(s.revision!==v.expectedRevision)throw conflict();
      if(!s.rawContent || s.rawContent.length>50000 || !s.effectiveDate)throw new AppError(422,"KNOWLEDGE_CONTENT_REQUIRED","Cần văn bản và ngày hiệu lực trước khi lập chỉ mục.");
      await tx.knowledgeChunk.deleteMany({where:{sourceId:id}});
      // Local lexical index, explicitly not a vector/embedding pipeline.
      const chunks=s.rawContent.match(/[\s\S]{1,1500}/g)!;
      for(let i=0;i<chunks.length;i++)await tx.knowledgeChunk.create({data:{sourceId:id,chunkIndex:i,content:chunks[i],metadata:{method:"LEXICAL_V1",sourceHash:hash(s),tokens:tokens(chunks[i])}}});
      const result=await tx.knowledgeSource.updateMany({where:{id,revision:v.expectedRevision},data:{revision:{increment:1},indexedHash:hash(s),status:"INDEXED",isApproved:false,errorMessage:null}});
      if(result.count!==1)throw conflict();await audit(tx,userId,"KNOWLEDGE_INDEXED","KNOWLEDGE",id,{method:"LEXICAL_V1",chunks:chunks.length});
      return dto((await tx.knowledgeSource.findUnique({where:{id}}))!); });
  }
  async approve(userId:string,id:string,command:z.infer<typeof sourceApprovalSchema>) {
    const v=sourceApprovalSchema.parse(command);
    return transaction(this.db,async tx=>{ const s=await tx.knowledgeSource.findUnique({where:{id}});if(!s)throw missing();
      if(v.approved && (s.status!=="INDEXED" || s.indexedHash!==hash(s) || !s.effectiveDate || (s.validUntil && s.validUntil<=new Date())))
        throw new AppError(422,"KNOWLEDGE_NOT_INDEXED","Nguồn cần nội dung đã lập chỉ mục và thời hạn hợp lệ.");
      const result=await tx.knowledgeSource.updateMany({where:{id,revision:v.expectedRevision},data:{isApproved:v.approved,revision:{increment:1}}});if(result.count!==1)throw conflict();
      await audit(tx,userId,v.approved?"KNOWLEDGE_APPROVED":"KNOWLEDGE_WITHDRAWN","KNOWLEDGE",id,{contentHash:hash(s),reviewNote:v.reviewNote});
      return dto((await tx.knowledgeSource.findUnique({where:{id}}))!); });
  }
  async retrieve(tx:Prisma.TransactionClient,question:string) {
    const now=new Date(), query=tokens(question).slice(0,50);
    const sources=await tx.knowledgeSource.findMany({where:{isApproved:true,status:"INDEXED",effectiveDate:{lte:now},OR:[{validUntil:null},{validUntil:{gt:now}}]},orderBy:{updatedAt:"desc"},take:100});
    const selected=[],eligible=sources.filter(s=>s.effectiveDate&&s.indexedHash&&s.indexedHash===hash(s));
    const chunks=await tx.knowledgeChunk.findMany({where:{sourceId:{in:eligible.map(s=>s.id)}},orderBy:{chunkIndex:"asc"},take:4000});
    for(const c of chunks){const s=eligible.find(s=>s.id===c.sourceId)!; const m=c.metadata as {method?:string;sourceHash?:string;tokens?:string[]}|null;
        if(m?.method!=="LEXICAL_V1" || m.sourceHash!==s.indexedHash || !Array.isArray(m.tokens))continue;
        if(c.chunkIndex<0 || c.content!==s.rawContent?.slice(c.chunkIndex*1500,(c.chunkIndex+1)*1500))continue;
        const score=query.filter(t=>m.tokens!.includes(t)).length;if(!score)continue;
        selected.push({id:c.id,sourceId:s.id,sourceRevision:s.revision,title:s.title,version:s.version,url:s.fileUrl,
          content:c.content,contentHash:s.indexedHash,effectiveDate:s.effectiveDate!.toISOString(),validUntil:s.validUntil?.toISOString()??null,score}); }
    return selected.sort((a,b)=>b.score-a.score || a.id.localeCompare(b.id)).slice(0,4);
  }
}
