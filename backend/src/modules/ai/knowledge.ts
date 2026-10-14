import { createHash } from "node:crypto";
import { Prisma, type PrismaClient, type KnowledgeSource } from "@prisma/client";
import { z } from "zod";
import { transaction } from "../../common/transaction";
import { audit } from "../../common/audit";
import { AppError } from "../../common/errors";
import { sourceInputSchema, sourceEditSchema, sourceApprovalSchema, sourceRevisionSchema, pageSchema } from "./schema";
const hash = (s: KnowledgeSource) => createHash("sha256").update(JSON.stringify([s.title,s.referenceCode,s.category,s.version,s.rawContent,s.fileUrl,s.effectiveDate,s.validUntil])).digest("hex");
const tokens = (s: string) => [...new Set(s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").match(/[a-z0-9]{2,}/g) ?? [])];
// Retrieval ranking (BM25). Terms are derived from the verified chunk content, so stored LEXICAL_V1 metadata stays valid.
// Accented words, their unaccented "~" forms and adjacent-word bigrams ("lương hưu", "cơ sở") are separate terms.
const STOP = new Set(("là của và có được cho các những này đó thì mà với trong khi để theo từ về tại đến bao nhiêu gì nào sao không hiện nay "
  + "tôi bạn mình ai đâu thế nếu hay hoặc cũng đã đang sẽ rồi nhé ạ ơi vậy như bị phải hãy xin cần muốn biết hỏi").split(" "));
const ABBR: Record<string,string> = { bhxh:"bảo hiểm xã hội",bhyt:"bảo hiểm y tế",bhtn:"bảo hiểm thất nghiệp",tncn:"thu nhập cá nhân",
  tctd:"tổ chức tín dụng",nlđ:"người lao động",nđ:"nghị định",tt:"thông tư",qđ:"quyết định" };
const WEIGHT = { word:1, folded:0.5, pair:1.5, foldedPair:0.75 }, TITLE_WEIGHT = 0.5, MIN_RELATIVE = 0.4, K1 = 1.2, B = 0.75;
const folded = new Map<string,string>();
const fold = (w: string) => { let f = folded.get(w); if (f === undefined) { if (folded.size > 50000) folded.clear();
  folded.set(w, f = w.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d")); } return f; };
/** Lowercase words in reading order; "" (punctuation, line break or 1-letter word) breaks bigrams. */
const words = (s: string, max = Infinity) => {
  const ws: string[] = [];
  for (const seg of s.toLowerCase().normalize("NFC").replace(/%/g, " phần trăm ").split(/[^\p{L}\p{N}\s]+|\n/u)) {
    for (const raw of seg.match(/[\p{L}\p{N}]+/gu) ?? []) for (const w of (ABBR[raw] ?? raw).split(" ")) ws.push(w.length < 2 ? "" : w);
    if (ws.length >= max) break; ws.push("");
  }
  return ws.slice(0, max);
};
type Words = { ws: string[]; fs: string[]; stop: boolean[] };
const prepare = (s: string, max?: number): Words => { const ws = words(s, max);
  return { ws, fs: ws.map(w => w && "~" + fold(w)), stop: ws.map(w => STOP.has(w)) }; };
// Chunk content is fixed for a chunk id + indexed source hash (retrieve verifies it), so its words can be reused.
const prepared = new Map<string, Words>();
const chunkWords = (key: string, content: string) => { let p = prepared.get(key); if (!p) { if (prepared.size >= 5000) prepared.clear();
  prepared.set(key, p = prepare(content)); } return p; };
/** Calls visit(term, weight) for each term; `want` limits bigram construction to first words that can match. */
const scan = ({ ws, fs, stop }: Words, visit: (term: string, weight: number) => void, want?: Set<string>) => {
  for (let i = 0; i < ws.length; i++) { const w = ws[i]; if (!w) continue;
    if (!stop[i]) { visit(w, WEIGHT.word); visit(fs[i], WEIGHT.folded); }
    if (!ws[i + 1] || (stop[i] && stop[i + 1])) continue;
    if (!want || want.has(w)) visit(`${w} ${ws[i + 1]}`, WEIGHT.pair);
    if (!want || want.has(fs[i])) visit(`${fs[i]} ${fs[i + 1].slice(1)}`, WEIGHT.foldedPair); }
};
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
    const now=new Date(), query=new Map<string,number>(), firsts=new Set<string>();
    scan(prepare(question,64),(t,w)=>{query.set(t,w);if(t.includes(" "))firsts.add(t.slice(0,t.indexOf(" ")));});
    const sources=await tx.knowledgeSource.findMany({where:{isApproved:true,status:"INDEXED",effectiveDate:{lte:now},OR:[{validUntil:null},{validUntil:{gt:now}}]},orderBy:{updatedAt:"desc"},take:100});
    const eligible=new Map(sources.filter(s=>s.effectiveDate&&s.indexedHash&&s.indexedHash===hash(s)).map(s=>[s.id,s]));
    const chunks=await tx.knowledgeChunk.findMany({where:{sourceId:{in:[...eligible.keys()]}},orderBy:{chunkIndex:"asc"},take:4000});
    // IDF and average length are computed over the eligible, verified chunks only.
    const docs=[],df=new Map<string,number>();let total=0;
    for(const c of chunks){const s=eligible.get(c.sourceId)!; const m=c.metadata as {method?:string;sourceHash?:string;tokens?:string[]}|null;
        if(m?.method!=="LEXICAL_V1" || m.sourceHash!==s.indexedHash || !Array.isArray(m.tokens))continue;
        if(c.chunkIndex<0 || c.content!==s.rawContent?.slice(c.chunkIndex*1500,(c.chunkIndex+1)*1500))continue;
        const tf=new Map<string,number>();let length=0;
        scan(chunkWords(`${c.id}:${s.indexedHash}`,c.content),(t,w)=>{if(w===WEIGHT.word)length++;if(query.has(t))tf.set(t,(tf.get(t)??0)+1);},firsts);
        for(const t of tf.keys())df.set(t,(df.get(t)??0)+1);total+=length;docs.push({c,s,tf,length}); }
    const idf=(t:string)=>Math.log(1+(docs.length-(df.get(t)??0)+0.5)/((df.get(t)??0)+0.5)),avg=total/Math.max(docs.length,1);
    const titles=new Map<string,number>();
    const titleScore=(s:KnowledgeSource)=>{let v=titles.get(s.id);if(v===undefined){const own=new Set<string>();scan(prepare(`${s.title}\n${s.referenceCode??""}`),t=>own.add(t));
      titles.set(s.id,v=[...query].reduce((sum,[t,w])=>own.has(t)&&df.has(t)?sum+w*idf(t):sum,0));}return v;};
    const selected=[];
    for(const {c,s,tf,length} of docs){if(!tf.size)continue;
        let bm25=0;for(const [t,w] of query){const f=tf.get(t);if(f)bm25+=w*idf(t)*f*(K1+1)/(f+K1*(1-B+B*length/avg));}
        const score=Math.round((bm25+TITLE_WEIGHT*titleScore(s))*1e6)/1e6;
        selected.push({id:c.id,sourceId:s.id,sourceRevision:s.revision,title:s.title,version:s.version,url:s.fileUrl,
          content:c.content,contentHash:s.indexedHash!,effectiveDate:s.effectiveDate!.toISOString(),validUntil:s.validUntil?.toISOString()??null,score}); }
    // Up to 4; drop weak tail matches far below the best chunk.
    const ranked=selected.sort((a,b)=>b.score-a.score || a.id.localeCompare(b.id)).slice(0,4);
    return ranked.filter(r=>r.score>=ranked[0].score*MIN_RELATIVE);
  }
}
