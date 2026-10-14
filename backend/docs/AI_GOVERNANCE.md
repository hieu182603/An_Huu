# T10 — Giải thích kết quả và quản trị dữ liệu AI

> Cập nhật 05/10/2026: model v3 hỗ trợ góp đầu/cuối tháng; EXPLICIT_DEPOSITS_ONLY đã chốt; có preview/lưu/apply reforecast và giữ replay v2. Contract hiện hành: [CONTRIBUTIONS_REFORECAST.md](CONTRIBUTIONS_REFORECAST.md). Các mô tả chỉ cuối kỳ/reforecast chỉ đọc/chờ Q13–Q15 ở checkpoint cũ bên dưới là lịch sử.

Cập nhật 05/10/2026: chủ dự án đã chọn **Google Gemini**, thay lựa chọn chuẩn bị không-provider trước đây. Production composition dùng provider theo env; local developer/gemini-3.8-flash đã gọi thành công bằng dữ liệu mẫu. Contract cấu hình/giới hạn/bằng chứng: [GEMINI.md](GEMINI.md). Không fine-tuning/embedding/tự duyệt nguồn. UI và vận hành trước phát hành còn nghiệm thu.

## Cập nhật trải nghiệm 13/10/2026

- Tiền trong lời giải thích được định dạng tiếng Việt bằng decimal chính xác; chỉ làm tròn khi trình bày. Phân biệt thiếu/dư và mức góp vượt khả năng. Khi hỏi về thay đổi điều kiện, luôn nói rõ cần chạy mô phỏng; số của kế hoạch cũ không được gọi là kết quả mới.
- Khi provider gián đoạn hoặc chưa cấu hình, chọn dữ kiện theo chủ đề câu hỏi và vẫn dẫn các đoạn nguồn đã duyệt còn hiệu lực. Kiểm tra lại nguồn sau khi provider hoàn tất được giữ nguyên.
- Hội thoại nhận tên từ câu hỏi đầu tiên, giữ tên người dùng đã sửa. Mỗi lượt mới ghi mốc thời gian tăng dần cho câu hỏi rồi câu trả lời, tránh `now()` PostgreSQL giống nhau trong transaction; dữ liệu cũ có cùng thời điểm ưu tiên user trước assistant.
- Giao diện có mở/đổi tên/xóa/xóa hết/sửa câu hỏi và tải thêm lịch sử; dùng revision mới sau đổi tên, giữ khóa yêu cầu khi thử lại, bỏ phản hồi đến muộn sau chuyển hội thoại. Sửa câu hỏi gỡ câu trả lời cũ, người dùng quyết định gửi lại.
- Mô phỏng dùng tháng và chuỗi tiền từ bản đang áp dụng, không tự gán tuổi 60/số tiền mẫu. Số 0 khác để trống; kết quả chưa đủ dữ liệu không hiện thành 0. So sánh dùng `atValuation` và delta tương ứng, ghi rõ ngày số liệu từng cột, giữ null khi không cùng cơ sở.
- ADMIN có thêm/sửa nội dung, đường dẫn HTTPS, thời hạn, tạo chỉ mục, duyệt/thu hồi và tải thêm nguồn. Sửa hoặc lập lại chỉ mục phải duyệt lại. Mục quy tắc mô tả đúng mã đang thực thi, không giả lập chỉnh prompt hay giám sát lưu lượng.

Bằng chứng và phạm vi nghiệm thu local: [AI_COMPLETION_2026-10-13.md](../../docs/AI_COMPLETION_2026-10-13.md). Đây không phải chứng nhận triển khai vận hành production.

## API USER

Prefix `/api/v1/me/ai`, Bearer/session, USER only, no-store; ADMIN không được đọc hội thoại của USER. JSON envelope `{data,meta}`. Xem `ai.openapi.yaml`; strict input từ chối trường không khai báo. Các API giải thích/mô phỏng/tạo hội thoại có rate limit hiện tại 15/phút theo IP (memory trong một process; giới hạn nhiều instance cần T12 xác nhận).

| Endpoint | Dữ liệu / hành vi |
|---|---|
| GET `/privacy` | Revision, policyVersion hiện hành/đã đồng ý, processing/saveHistory, retentionDays và providerConfigured |
| PUT `/privacy` | `{expectedRevision,policyVersion,processing,saveHistory}`. Mặc định cả hai false. Không bật history nếu processing=false. Tắt history hoặc processing xóa toàn bộ hội thoại/context trong cùng transaction |
| POST `/explain` | Header Idempotency-Key UUID. `{question,planId?,versionId?,throughMonth?,conversationId?,expectedRevision?}`. plan/version phải đi cùng nhau; throughMonth cần plan/version; conversationId cần revision |
| POST `/simulate` | `{planId,versionId,expectedProfileRevision,changes:{retirementMonth?,monthlyContribution?,monthlyExpenseToday?}}`, ít nhất một thay đổi. Chạy T08/T06, không gọi provider, không cần AI consent |
| GET `/conversations?page=1&limit=20` | Chỉ hội thoại còn hạn của user; limit tối đa 50 |
| POST `/conversations` | Body `{}`, cần processing+saveHistory. Trả id/revision=0/expiresAt, HTTP 201 |
| GET `/conversations/:id` | Nội dung, nguồn và context đã lưu; chỉ owner, hội thoại còn hạn. Route `/:id/export` (tải JSON) đã gỡ ngày 14/10/2026 theo yêu cầu người dùng |
| PATCH `/conversations/:id` | `{expectedRevision,title}` đổi tên và tăng revision |
| PATCH `/conversations/:id/messages/:messageId` | `{expectedRevision,content}` sửa **câu hỏi USER**; xóa answer/context của lượt tương ứng vì không còn khớp câu hỏi, tăng revision. Không cho sửa kết quả engine hoặc answer thành kết quả giả |
| DELETE `/conversations/:id` hoặc `/conversations` | Body `{}`. Xóa một/tất cả hội thoại và messages/context, tăng privacy revision để vô hiệu hóa yêu cầu đang chờ. Có thể xóa riêng hội thoại đã hết hạn bằng ID |

Không có `/apply` trong module AI. Sau simulate, UI cho xem candidate và dùng luồng T07 createVersion → apply với xác nhận user. Chỉ thay những input cá nhân đã khai; giữ policy/answers/scenario/selection của bản gốc. Hồ sơ hiện tại phải đúng expectedProfileRevision. Không tự phân tích lời nói tự do thành thay đổi tài chính: UI cần form xác nhận input có cấu trúc. Không nhận lãi/CPI/tỷ trọng/summary do client hay provider đưa lên.

## Kết quả giải thích

- `PROVIDER_NOT_CONFIGURED`: trả lời cơ bản bằng facts do backend dựng từ số thật của engine; UI ghi rõ chưa kết nối AI. `provider=null`. Áp dụng khi AI_PROVIDER=none.
- `AI_ASSISTED`: provider Gemini hoặc adapter được cấu hình chọn fact keys/citation IDs hợp lệ. Backend dựng lại toàn bộ answer bằng facts sở hữu, không chấp nhận số tiền hay văn bản tự do từ provider.
- `PROVIDER_UNAVAILABLE`: timeout, lỗi hoặc output không đúng schema/IDs. Trả facts cơ bản; không làm mất kết quả đã tính. Không trả thông báo lỗi/secret từ provider.
- `applied=false` luôn đúng; `savedHistory` độc lập. Không có conversationId thì không ghi question/answer/context/idempotency response vào DB. Idempotency-Key khi này chỉ hợp lệ về dạng, không đảm bảo provider chỉ được gọi một lần nếu client gửi lặp. Có history thì cùng key+body trả lại đúng response đã ghi và không thêm messages; đổi body cùng key trả 409.
- Không chọn version: fact `missing`, provenance=null, không tự lấy plan gần nhất/số demo. Version không thuộc owner hoặc không tồn tại: 404; snapshot không hợp lệ: giữ lỗi T07.
- Có version: facts quỹ dự phóng/vốn cần/chênh lệch/mức góp/bao phủ/tháng thiếu lấy đúng snapshot. K=0 giữ không áp dụng, nghỉ ngay không tự gán góp=0. Coverage là tỷ lệ tiền, không là xác suất. Facts limits/hypothetical/warnings không bị provider loại bỏ.
- `provenance` cung cấp plan/version/snapshotHash/model/valuationDate/profileRevision/references/sources/warningCodes cho user truy vết. Thay profile/publish policy/current mới không thay số của bản được chọn. Frontend lấy report/detail T08 để hiện cờ profileChanged/updates; không tự gọi đây là dự phóng cập nhật của hồ sơ hiện tại.
- Có `throughMonth`: đọc T09 trong **cùng transaction** với version. `provenance.valueKind=REFORECAST`, chỉ giữ status/anchor/revisions/issues của actual; không giữ danh sách giao dịch/ghi chú. BLOCKED/HORIZON_COMPLETE không lấy summary forecast cũ thay thế. Khi đã nghỉ hưu, mốc vốn là đầu phần dự báo còn lại, không gọi là ngày nghỉ hưu mới. Sổ actual có thể đổi sau capture; revisions trong response xác định bản đã đọc, UI tải lại nếu cần thông tin mới.

## Ranh giới provider và giảm dữ liệu

`ExplanationProvider.select(packet,signal)` chỉ nhận question, facts có key và knowledge `{id:k0..k3,title,content}`; không có DB/service/tool capability, userId, planId, versionId, toàn bộ profile, lịch sử chat hoặc giao dịch. Đây là giao diện lựa chọn giải thích có kiểm soát, chưa phải chatbot trả lời tự do về mọi nội dung tri thức.

Backend lấy tối đa 4 đoạn đã duyệt, mỗi đoạn tối đa 1.500 ký tự; câu hỏi tối đa 2.000 ký tự. Thay email/số dài trong câu hỏi bằng nhãn trước provider, nhưng **không coi regex là ẩn danh hoàn toàn**: tên/địa chỉ/nội dung cá nhân tự gõ hoặc lẫn trong tài liệu vẫn cần kiểm soát trước khi bật adapter. Câu hỏi gốc vẫn được lưu nếu user chọn history. Nội dung nguồn và câu hỏi là dữ liệu không tin cậy; `provider.ts` có instructions dùng bởi Gemini adapter. Mã hiện tại không thực thi bất kỳ lệnh nào trong các đoạn đó. Schema output chỉ cho `{factKeys,citationIds}`, không nhận văn bản/URL/số liệu/tool call khác. Composition dùng GEMINI_TIMEOUT_MS (mặc định15s); Gemini tôn trọng AbortSignal và giới hạn response64KiB/output2.048tokens. Lỗi schema, timeout hoặc provider đều fallback.

Nguồn và cảnh báo/source giả định của kế hoạch trả cho **user** ở provenance; provider chỉ nhận facts/đoạn tri thức được chọn, chưa nhận đầy đủ bộ giả định. Policy mới `ai-explanation-gemini-2026-10-v2` và processingNotice nêu việc gửi dữ liệu qua Google Gemini; consent v1 bị chặn trước outbound. Privacy GET/PUT trả provider, providerConfigured, reconsentRequired và processingNotice. UI phải lấy policyVersion từ API, không tự đồng ý. Chưa xác minh vị trí xử lý cụ thể theo tài khoản Google; không cam kết xử lý trong nước. Thay phạm vi/provider sau này phải rà policy/consent lại. Tests với stub không chứng minh model ngoài hoạt động, chi phí, lưu trữ hoặc xóa dữ liệu phía nhà cung cấp.

## Tri thức ADMIN

Prefix `/api/v1/admin/knowledge`, ADMIN only. Không có quyền đọc chat user. Không tải file URL, không fetch URL hoặc parse tài liệu tự động; `fileUrl` là liên kết tham chiếu HTTPS. Nội dung text do admin cung cấp và rà soát.

| Endpoint | Quy tắc |
|---|---|
| GET `/` và `/:id` | Danh sách phân trang/metadata, chi tiết rawContent |
| POST `/` | title/category/version/rawContent/effectiveDate, optional referenceCode/fileUrl/validUntil. Tạo PENDING/unapproved/revision=1 |
| PUT `/:id` | `{expectedRevision,data:<full source>}`; sửa toàn bộ metadata/text, tăng revision, bỏ duyệt/indexedHash, về PENDING |
| POST `/:id/index` | `{expectedRevision}`; lập chỉ mục **LEXICAL_V1** tại server, chia 1.500 ký tự, tối đa 50.000 ký tự, thay chunks trong transaction; INDEXED nhưng vẫn unapproved |
| POST `/:id/approval` | `{expectedRevision,approved,reviewNote,confirm:true}`; duyệt cần index/hash khớp + ngày hiệu lực + chưa hết hạn; approved=false thu hồi dùng nguồn |

Chỉ retrieve khi approved=true, INDEXED, effectiveDate≤now, validUntil null hoặc >now, indexedHash khớp nội dung/metadata, metadata chunk đúng method/hash và nội dung chunk khớp text gốc. Duyệt trước ngày hiệu lực cho phép nhưng chưa dùng đến đúng ngày. Mỗi chỉnh sửa/reindex phải duyệt lại; kiểm sources lần nữa sau khi provider trả về để bỏ citation vừa bị thu hồi/sửa. Trong **lịch sử** hoặc retry cùng key, citation là bằng chứng tại thời điểm tạo, không khẳng định nguồn còn hiệu lực hôm nay; UI trình bày thời gian và phiên bản.

LEXICAL_V1 là định dạng chỉ mục (chunk 1.500 ký tự + metadata method/sourceHash/tokens), giới hạn 100 nguồn được cập nhật gần nhất và 4.000 chunks tổng. Từ 14/10/2026 xếp hạng là BM25 (k1=1,2, b=0,75) tính trên **nội dung chunk đã kiểm khớp text gốc**, không dựa vào metadata.tokens, nên chunk V1 đã lập chỉ mục dùng được ngay, không cần reindex. Term: từ có dấu (trọng số 1), dạng bỏ dấu (0,5), cặp từ liền nhau như "lương hưu", "cơ sở" (1,5; bỏ dấu 0,75); bỏ stopword hỏi/hư từ ("là", "bao nhiêu", "hiện nay"…); mở rộng viết tắt BHXH/BHYT/BHTN/TNCN/TCTD/NLĐ/NĐ/TT/QĐ; "%" đọc là "phần trăm". IDF và độ dài trung bình tính trên các chunk đủ điều kiện của lần truy xuất. Cộng 0,5×Σ(trọng số×IDF) của term câu hỏi xuất hiện trong tiêu đề/số hiệu nguồn. Trả tối đa 4 chunk, bỏ chunk có điểm < 40% chunk tốt nhất; hòa điểm xếp theo id chunk. Từ của mỗi chunk được nhớ trong tiến trình theo khóa id chunk + indexedHash (tối đa 5.000). Không tìm ngữ nghĩa, chưa có từ đồng nghĩa ngoài danh sách viết tắt, PDF extraction hay vector embeddings; `INDEXED` không đồng nghĩa đã có embedding. Các vector 1536 cũ không bị gán thành có chỉ mục hợp lệ nếu thiếu indexedHash/method. Không tự duyệt/index 5 nguồn production đang PENDING. Reindex do ADMIN gọi sẽ thay các chunk của chính nguồn đó. Chỉ mục đơn giản này cần đánh giá recall/quy mô ở T12 trước mở rộng kho.

## Quyền dữ liệu và lưu trữ

Policy hiện hành `ai-explanation-gemini-2026-10-v2`, purpose `EXPLAIN_SERVER_RESULTS`. Processing và saveHistory mặc định tắt, revision chống ghi đè. User bật history riêng; hội thoại hết hạn cố định **30 ngày từ lúc tạo**, không kéo dài khi gửi thêm. Đây là lựa chọn vận hành của bản triển khai, **không phải thời hạn pháp luật quy định**. Mỗi hội thoại tối đa 100 messages (50 cặp nếu không chỉnh sửa).

Hết hạn bị chặn đọc ngay tại API. `purgeExpiredAi` xóa messages/context và conversation trong transaction theo lô; worker outbox chạy sweep mỗi phút, mặc định100 bản ghi/lô và tối đa10lô, log số còn lại. Tác vụ mới `node dist/retention.js` chỉ cần DATABASE_URL và mặc định chỉ đọc; thêm `--execute` mới xóa, dùng độc lập SMTP/outbox/Gemini. Chế độ dừng/giới hạn/exit và hướng dẫn scheduler ở [RETENTION_OPERATIONS.md](RETENTION_OPERATIONS.md). Đã kiểm fixture DB thật có rollback và pg_dump/restore35bảng trên DB tạm, dọn expired sau restore bằng executable thật. Chưa triển khai scheduler Azure hoặc kiểm backup production. Retention bản sao/nhật ký hạ tầng và đối chiếu yêu cầu xóa sau thời điểm backup vẫn cần xử lý trước phát hành; expiry purge không tự giải quyết trường hợp dữ liệu còn hạn đã được xóa sau backup.

Xóa/thu hồi đồng ý dùng SERIALIZABLE và privacy revision; response đến muộn không được lưu lại. Sửa câu hỏi xóa answer/context cùng requestKey, không giữ bản sao câu hỏi cũ trong audit. Audit chỉ lưu metadata consent/xóa hoặc review nguồn, không lưu nội dung chat. Audit consent còn giữ cho truy vết, không tự xóa bởi API xóa hội thoại. Privacy row gắn User cascade, conversations/messages cascade khi xóa user tại tầng DB; module này chưa cung cấp API xóa toàn bộ tài khoản. Không dùng IdempotencyRecord chung cho chat để tránh lưu response ngoài cơ chế hết hạn/xóa.

Migration `202610050008_ai_governance`: thêm ai_privacy, knowledge revision/validUntil/indexedHash, conversation revision/expiresAt, message requestKey/context và unique requestKey theo conversation+role. Hội thoại legacy được đặt expiresAt=createdAt+30 ngày (DB khi apply có 0 hội thoại); không cấp consent ngầm. **Migration đã áp dụng**, không áp lại hoặc sửa file đã chạy.

## Rà P36 trước phát hành

Nguồn chính thức đã xác nhận: [Luật 91/2025/QH15](https://vanban.chinhphu.vn/?classid=1&docid=214590&pageid=27160&typegroup=), [Nghị định 356/2025/NĐ-CP](https://chinhphu.vn/?classid=1&docid=216387&pageid=27160&typegroupid=4) và [bản ký nghị định](https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/01/356-nd.signed.pdf). Trang thuộc tính ghi hiệu lực 01/01/2026. Việc xác nhận nguồn và triển khai các kiểm soát trên **không phải kết luận tuân thủ pháp luật**; chưa hoàn tất đối chiếu từng điều khoản S08/P36.

Trước phát hành với provider: người phụ trách cần xác định vai trò các bên, thông báo mục đích và dữ liệu nhạy cảm, căn cứ đồng ý, chuyển dữ liệu ra ngoài/quốc gia xử lý, hợp đồng và lưu trữ của provider, thực hiện yêu cầu quyền dữ liệu, retention audit/backup và hồ sơ/đánh giá theo quy định áp dụng. Không tự coi việc xóa DB là đã xóa mọi bản sao phía nhà cung cấp. Đây là phần nghiệm thu vận hành/pháp lý còn mở cùng T12; backend không tự duyệt thay người phụ trách.

## Kiểm chứng

Unit/HTTP contract: `src/tests/ai.test.ts`; real auth/HTTP/DB rollback: `scripts/verify-ai-db.cjs`; transaction cạnh tranh với tài khoản SUSPENDED riêng: `scripts/verify-ai-concurrency-db.cjs`. Không external AI hoặc email, không reset DB. Kết quả chạy cuối cùng ở PROGRESS.md; script/test tồn tại không tự là bằng chứng đã chạy. Provider smoke thật bằng dữ liệu mẫu đã đạt trong GEMINI.md; contract/frontend integration và vận hành dịch vụ vẫn cần kiểm tra riêng.
