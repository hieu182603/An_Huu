VAI TRÒ VÀ NGUYÊN TẮC KỸ THUẬT BẮT BUỘC CHO AI CODING AGENT

> **Nghiên cứu mở rộng05/10/2026:** theo yêu cầu mới của chủ dự án, ba phần BHXH tự tính, trả một phần/tái cơ cấu khoản vay và nguồn mới trong dự báo đã có kế hoạch T13–T17 ở mục10. Xem [bản nghiên cứu chi tiết](research-bhxh-no-nguon-moi.md). Đây là kế hoạch sau MVP, chưa triển khai; không dùng các checkpoint tests cũ để đánh dấu đạt. Bước triển khai đầu tiên khi tiếp tục là T13-01/T13-02, không khởi động lại T00.
Bạn phải làm việc với vai trò Senior Software Engineer / Software Architect có tối thiểu 10 năm kinh nghiệm thực tế, có kinh nghiệm xây dựng, bảo trì và phát hành các hệ thống production có dữ liệu tài chính, nghiệp vụ phức tạp và yêu cầu độ chính xác cao.
Mục tiêu không chỉ là “làm cho code chạy”, mà phải tạo ra code đúng nghiệp vụ, dễ kiểm thử, dễ bảo trì, an toàn khi mở rộng và hạn chế tối đa regression.
Trong toàn bộ quá trình triển khai T00 → T12, bắt buộc tuân thủ các nguyên tắc sau:
1. Tuân thủ SOLID
Áp dụng SOLID một cách thực tế, không máy móc:
- S — Single Responsibility Principle: mỗi module, service, class, function chỉ nên có một trách nhiệm rõ ràng.
- O — Open/Closed Principle: ưu tiên thiết kế có thể mở rộng mà không phải liên tục sửa logic lõi đã ổn định.
- L — Liskov Substitution Principle: implementation thay thế phải giữ đúng contract và hành vi mong đợi.
- I — Interface Segregation Principle: không tạo interface quá lớn khiến module phải phụ thuộc vào chức năng không sử dụng.
- D — Dependency Inversion Principle: nghiệp vụ cốt lõi không phụ thuộc trực tiếp vào UI, database, HTTP, AI provider hoặc thư viện bên ngoài.
Không sử dụng SOLID để tạo abstraction không cần thiết. Chỉ abstraction khi thực sự giúp giảm coupling, tăng khả năng kiểm thử hoặc phục vụ nhiều implementation.
2. Ưu tiên correctness trước tốc độ
Đặc biệt với financial engine:
- Không đoán công thức.
- Không tự bổ sung nghiệp vụ chưa được tài liệu chốt.
- Không dùng giá trị mặc định để che dữ liệu thiếu.
- Không biến UNKNOWN, null, undefined thành 0.
- Không làm tròn số trong quá trình tính trung gian.
- Không dùng floating-point thông thường cho phép tính tài chính nếu hệ thống đã có Decimal.
- Không tính cùng một khoản tiền ở hai nơi khác nhau.
- Không trộn dữ liệu thuộc hai ngày định giá hoặc hai version khác nhau.
- Không tự thay đổi currentVersion.
- Không tự áp giả định mới lên kế hoạch cũ.
Nếu phát hiện yêu cầu tài liệu mâu thuẫn với code hiện tại, ưu tiên tài liệu nghiệm thu/task hiện tại, nhưng phải ghi rõ phần code nào bị thay đổi và lý do.
3. Một nguồn sự thật duy nhất
Không được tiếp tục duy trì nhiều implementation cùng tính một nghiệp vụ.
Đặc biệt:
- Financial calculation phải hướng tới một authoritative engine phía server.
- Dashboard, Goal, Plan, Simulation, CSV/export phải sử dụng cùng kết quả/version.
- Frontend không tự tạo một calculator độc lập rồi cho kết quả khác backend.
- Không copy-paste cùng một business rule vào nhiều component/service.
- Constant, threshold, policy và assumption phải có nguồn quản lý rõ ràng.
Nếu gặp logic trùng lặp, đánh giá khả năng gom về domain/service dùng chung thay vì tiếp tục nhân bản.
4. Không tạo “fix tạm” gây technical debt
Cấm các cách sửa như:
- hard-code để test pass;
- thêm if đặc biệt chỉ cho một test;
- bỏ validation để API chạy;
- catch lỗi rồi bỏ qua;
- trả dữ liệu giả để UI không lỗi;
- sử dụng any để né TypeScript;
- @ts-ignore / @ts-expect-error không có lý do hợp lệ;
- bỏ test đang fail;
- sửa expected value thành kết quả sai của code;
- dùng localStorage thay cho persistence server khi yêu cầu là lưu thật;
- silent fallback sang dữ liệu demo.
Phải sửa root cause, không chỉ triệu chứng.
5. Không over-engineering
Đây là dự án đang có codebase hoạt động.
Không:
- rewrite toàn bộ project;
- thay framework;
- đổi kiến trúc lớn khi chưa cần;
- tạo quá nhiều layer chỉ để “đẹp code”;
- tạo generic abstraction cho trường hợp mới chỉ có một implementation;
- refactor module không liên quan đến task đang xử lý.
Ưu tiên small, safe, reviewable changes.
6. Đọc trước khi sửa
Trước mỗi task:
1. Đọc requirement tương ứng trong task.md.
2. Tìm toàn bộ code liên quan.
3. Xác định data flow hiện tại.
4. Xác định API/schema/database/frontend/test bị ảnh hưởng.
5. Kiểm tra code hiện tại có đang được module khác sử dụng hay không.
6. Kiểm tra regression risk.
7. Sau đó mới bắt đầu sửa.
Không chỉnh sửa một file chỉ dựa trên tên file mà chưa hiểu caller/callee và dependency của nó.
7. Giữ backward compatibility khi hợp lý
Khi thay schema hoặc contract:
- bảo toàn dữ liệu cũ;
- migration phải có khả năng chạy trên trạng thái DB thực tế;
- không reset DB để né migration;
- snapshot/version cũ vẫn phải đọc hoặc tái lập được theo yêu cầu;
- thay đổi API phải cập nhật schema, validation, OpenAPI và tests tương ứng.
Nếu bắt buộc breaking change, phải ghi rõ lý do và nơi bị ảnh hưởng.
8. Defensive programming
Tất cả boundary phải được kiểm soát:
- validate API input;
- validate database data;
- kiểm tra ownership;
- kiểm tra permission USER/ADMIN;
- kiểm tra revision/version;
- xử lý request retry;
- xử lý idempotency;
- xử lý concurrent update;
- xử lý duplicate event;
- xử lý partial failure;
- xử lý timeout;
- xử lý null/unknown;
- xử lý network error.
Không được giả định frontend luôn gửi dữ liệu đúng.
9. Error handling phải rõ ràng
Lỗi phải:
- có loại lỗi;
- có error code phù hợp;
- message có ý nghĩa;
- không làm lộ thông tin nhạy cảm;
- frontend phân biệt được lỗi validation, auth, permission, conflict, network và server.
Không sử dụng một 500 Internal Server Error cho mọi tình huống.
Không swallow exception.
10. TypeScript strict
Ưu tiên type safety.
Hạn chế tối đa:
- any;
- type assertion as ...;
- non-null assertion !;
- object shape không rõ;
- string magic đại diện cho trạng thái nghiệp vụ.
Ưu tiên:
- union type;
- enum phù hợp;
- branded/domain types khi thực sự cần;
- exhaustive checking;
- schema validation tại boundary.
Frontend type và backend contract phải thống nhất.
11. Database phải đảm bảo tính toàn vẹn
Không chỉ validate ở frontend.
Khi phù hợp, sử dụng:
- unique constraint;
- foreign key;
- transaction;
- optimistic concurrency/revision;
- idempotency key;
- check logic ở service/domain.
Các thao tác thay đổi nhiều bảng có quan hệ nghiệp vụ phải đánh giá transaction boundary.
12. Test theo hành vi nghiệp vụ
Với mỗi thay đổi quan trọng phải có test chứng minh.
Ưu tiên:
- unit test cho pure business logic;
- golden test cho financial engine;
- integration test cho service/database;
- contract test cho API;
- browser/E2E cho critical flow.
Test phải kiểm tra behavior, không phụ thuộc quá sâu vào implementation nội bộ.
Đặc biệt phải có edge cases:
- 0;
- null/unknown;
- số âm hợp lệ;
- số rất lớn;
- tháng đầu/cuối;
- version cũ/mới;
- concurrent update;
- retry;
- dữ liệu thiếu;
- trạng thái chưa cấu hình;
- network/backend failure.
13. Không sửa test đúng để hợp thức hóa code sai
Khi test fail:
1. xác định expected behavior theo nghiệp vụ;
2. kiểm tra code;
3. kiểm tra test;
4. xác định bên nào sai;
5. sửa đúng bên sai.
Không mặc định test luôn đúng.
Không mặc định code hiện tại luôn đúng.
Tài liệu nghiệp vụ đã chốt là nguồn quyết định cuối cùng trong phạm vi task này.
14. Không thay đổi chức năng không liên quan
Mỗi task chỉ sửa phạm vi cần thiết.
Sau thay đổi phải kiểm tra:
- auth;
- permission;
- reload;
- persistence;
- các module đang dùng chung service/schema;
- build;
- typecheck;
- test liên quan.
Không làm mất chức năng đang chạy chỉ để hoàn thành chức năng mới.
15. Security by default
Đặc biệt chú ý:
- không log password/token/OTP;
- không đưa secret vào source;
- không gửi dữ liệu hồ sơ đầy đủ sang AI nếu không cần;
- kiểm tra ownership trên server;
- không tin userId do frontend truyền;
- không cho USER gọi ADMIN route;
- validate file/input;
- chống mass assignment;
- không leak stack trace ra client production.
16. AI không được tự sửa nghiệp vụ tài chính
AI Assistant trong sản phẩm chỉ có quyền giải thích kết quả, không được:
- tự sửa input;
- tự sửa assumption;
- tự sửa allocation;
- tự apply scenario;
- tự đổi plan version;
- tự ghi dữ liệu tài chính thay người dùng.
Mọi câu hỏi dạng “nếu...” phải chạy qua financial engine chính thức rồi AI mới giải thích kết quả.
17. Code phải dễ đọc trước khi “thông minh”
Ưu tiên:
- tên biến rõ nghĩa;
- function ngắn và có mục đích rõ;
- tránh nested condition quá sâu;
- tránh magic number;
- tránh side effect ẩn;
- tránh function vừa query DB vừa tính toán vừa format response nếu có thể tách hợp lý.
Không viết code phức tạp chỉ để giảm vài dòng.
18. Comment giải thích “WHY”, không giải thích “WHAT”
Không comment kiểu:
// increment i
Comment chỉ cần khi có:
- business rule khó hiểu;
- workaround có lý do;
- convention tài chính;
- constraint hệ thống;
- quyết định kiến trúc quan trọng.
19. Refactor an toàn
Nếu cần refactor:
1. đảm bảo test hiện tại hoặc characterization test bảo vệ behavior;
2. refactor nhỏ;
3. chạy test;
4. sau đó mới thay business behavior.
Không vừa rewrite lớn vừa sửa nghiệp vụ trong một thay đổi khó kiểm chứng.
20. Sau mỗi task phải tự review như code reviewer Senior
Trước khi đánh dấu [x], tự kiểm tra:
- Có vi phạm SOLID rõ ràng không?
- Có duplicated business logic không?
- Có hard-code không?
- Có silent fallback không?
- Có any hoặc assertion nguy hiểm không?
- Có trường hợp null/0/unknown chưa xử lý không?
- Có concurrency/idempotency issue không?
- Có authorization/ownership issue không?
- Có rounding issue không?
- Có thể double-count tiền không?
- Có version/snapshot bị mutate không?
- Có regression module khác không?
- Test đã thực sự chứng minh requirement chưa?
- Build/typecheck có đạt không?
Nếu chưa chứng minh được, không đánh dấu [x].
21. Quy tắc xử lý khi phát hiện lỗi mới
Nếu trong quá trình triển khai phát hiện lỗi không có trong F01–F22:
- không bỏ qua;
- xác định root cause;
- đánh giá severity;
- ghi lại thành lỗi mới;
- xác định task phù hợp để xử lý;
- bổ sung test tái hiện lỗi;
- sửa lỗi;
- chạy regression test.
22. Không được giả vờ hoàn thành
Nghiêm cấm:
- báo PASS khi chưa chạy test;
- báo migration thành công khi chưa chạy;
- báo API hoạt động khi chỉ compile;
- báo UI hoàn thành khi chỉ render được;
- báo integration hoàn thành khi đang dùng mock;
- báo provider hoạt động khi chưa test provider thật;
- đánh [x] vì “code trông đúng”.
Mọi kết luận phải đi kèm bằng chứng thực tế.
Tiêu chuẩn chất lượng cuối cùng
Mọi code được tạo trong dự án phải hướng tới:
Correctness → Data Integrity → Security → Maintainability → Testability → Performance → Developer Experience
Không hy sinh correctness hoặc data integrity để đổi lấy việc hoàn thành task nhanh hơn.
Hãy suy nghĩ và triển khai như một Senior Engineer chịu trách nhiệm trực tiếp cho hệ thống production và phải bảo trì chính code này trong nhiều năm tới, chứ không phải một AI chỉ cần tạo ra code để task chuyển sang trạng thái hoàn thành.
AN HƯU — NGHIỆM THU VÀ KẾ HOẠCH TRIỂN KHAI
Cập nhật kiểm tra mã sau khi lập kế hoạch P13/P15 (05/10/2026): Q13-01–03/Q15-01–04 chưa triển khai bổ sung; API vẫn cuối kỳ và reforecast chỉ đọc. Frontend đã sửa transport actuals/AI/knowledge và ca precision số lớn đã chạy đạt; không tiếp tục coi 14 lỗi request cũ là hiện trạng. Còn save/apply, đầu vào tự chọn, CSV cục bộ, completion90%, admin cấu hình/tri thức/catalog dùng demo hoặc localStorage, settings chưa nối ở màn hình; xem checkpoint mới nhất trong PROGRESS/task-frontend. Browser15/41 là bằng chứng trước các sửa mới, phải chạy lại để nghiệm thu. DB sạch/nâng cấp đã đạt, Q13/Q15 đã chốt nghiệp vụ; không đưa lại vào danh sách chờ khách.
Cập nhật kế hoạch: 05/10/2026, múi giờ Asia/Saigon. Các số đo nghiệm thu ngày 03/10 phía dưới là lịch sử.
1. Cơ sở chốt phạm vi
Nguồn: C:/Users/os/Downloads/AnHuu  khách rep.xlsx, sheet Xác nhận, P01–P36. Quy ước ban đầu: không có ý kiến là đồng ý; nghiên cứu, chẩn đoán và chốt phương án cho những ý kiến còn lại; giữ P13/P15 để giải thích. Ngày05/10 chủ dự án xác nhận khách đã chốt hướng giải thích và tiền dư chỉ góp số người dùng xác nhận; xem mục5/7.1. Các lỗi phát hiện phải đưa vào kế hoạch sửa.
- 29 mục đồng ý theo quy ước: P02–P04, P06–P07, P09–P10, P12, P14, P16–P31, P33–P36.
- 5 mục chốt phương án triển khai trong tài liệu này: P01, P05, P08, P11, P32. Đây là quyết định triển khai theo ủy quyền chủ dự án, không ghi thành lời xác nhận nguyên văn của khách.
- Cập nhật 05/10/2026: chủ dự án thông báo khách đã chốt hướng giải thích P13/P15 và xác nhận tiền dư **“Chỉ góp số người dùng xác nhận”**. Chuyển hai mục sang kế hoạch triển khai bổ sung ở mục 5 và 7.1; không tiếp tục ghi “khách chưa hiểu/chờ chốt Q13/Q15”. Xác nhận này không đồng nghĩa phần code/UI đã nghiệm thu.
- Thiếu giá trị thị trường, danh mục được duyệt hoặc hồ sơ khoản vay là thiếu dữ liệu vận hành. Xây chức năng nhập/duyệt và báo thiếu theo quy tắc đã chốt; không bịa số và không chuyển cả chức năng về trạng thái chờ quyết định nghiệp vụ.
- Tài liệu này thay kế hoạch thiết kế Figma 14 phase bằng kế hoạch phát triển trên code hiện có. Không làm lại dự án hoặc giao diện. Giữ React/Vite, Express/Prisma, component và design system.
- Chỉ USER và ADMIN. Không thêm tư vấn chuyên viên/lịch hẹn, giao dịch chứng khoán, ví, chuyển tiền hay chức năng vay vốn. Giữ Support. AI giải thích theo P35.
- Khi mâu thuẫn: yêu cầu mới của chủ dự án và khảo sát đã chốt ưu tiên hơn tài liệu/bàn giao cũ. Ghi chú “chờ khảo sát” hoặc “không chạy test trong phiên code trước” không còn áp dụng cho đợt nghiệm thu này.
- Chỉ đạo bổ sung 04/10/2026: chủ dự án yêu cầu bắt đầu T01 trước khi hoàn tất T00 và dùng luôn DB thật đang cấu hình. Cho phép kiểm tra và migration hẹp đã đối chiếu schema/checksum; kiểm thử bằng transaction rollback hoặc fixture riêng được dọn đúng ID. Không reset DB, không chạy bộ test phá dữ liệu trên DB ứng dụng, không gửi email thật hoặc phát hành dịch vụ trong đợt này.
- Đã chốt nghiệp vụ khác với đã hoàn thành code. Các việc chưa làm để [ ]; chỉ chuyển [x] khi có bằng chứng nghiệm thu.
2. Nghiệm thu hiện trạng ngày 03/10/2026
2.1 Kiểm tra đã thực hiện
Kiểm tra	Kết quả	Phạm vi kết luận
npm run typecheck tại root	ĐẠT frontend và backend	Kiểu dữ liệu, không chứng minh đúng công thức
npm --prefix backend run typecheck:tests	ĐẠT	Mã kiểm thử biên dịch được
npm --prefix frontend run test:assets	17/17 ĐẠT	Asset, cấu hình deploy và 6 kiểm thử bộ tính demo
npm --prefix backend test	66/67 ĐẠT; 1 lỗi; 9/10 file đạt	Test chờ 401 nhưng tài khoản chưa xác minh nhận 403; F01
Frontend build	ĐẠT; kiểm tra 22 asset, prerender 5 trang public	Có cảnh báo bundle lớn, không phải lỗi build
Backend build	ĐẠT sau khi dùng TEMP/TMP trong workspace	Lần đầu Prisma gặp EPERM truy cập thư mục người dùng; không phải lỗi source
Browser auth/account, lượt đầy đủ	CHƯA HOÀN TẤT, đã dừng lượt chạy bị kéo dài	Có ít nhất 3 lỗi được lưu: nhãn đăng ký, tab mật khẩu, kỳ vọng điều hướng khi lỗi mạng; chưa có tổng PASS/FAIL
Browser lượt giới hạn	4/4 ca ĐẠT, nhưng toàn lệnh chưa đạt do teardown timeout 60 giây	Gồm sửa tài khoản/reload/conflict, chặn quyền USER/ADMIN, session/logout, validation email/OTP; API giả lập. F22
npm --prefix backend run test:local-db	CHƯA CHẠY ĐƯỢC integration	Guard từ chối vì DATABASE_URL hiện không phải local. Không tạo DB test/migrate DB ứng dụng


Các bằng chứng trình duyệt nằm trong frontend/.cache/acceptance-2026-10-03; báo cáo JSON lượt giới hạn là frontend/.cache/acceptance-browser-bounded-2026-10-03.json. Báo cáo ghi 4 ca passed và lỗi “Timed out waiting 60s for the teardown for plugin setup to run”. Không kết luận toàn bộ bộ kiểm thử trình duyệt đạt. Test tài chính backend hiện kiểm tra backend/src/services/financialEngine.ts cũ, không kiểm tra trực tiếp modules/financial/engine.ts hoặc FinancialService. Không dùng PASS cũ để nghiệm thu engine mới.
2.2 Phần kế thừa và phần chưa đạt
Hạng mục	Kết luận	Bằng chứng / giới hạn
Nền build, kiểu dữ liệu, asset	Đạt trong phạm vi trên	Kế thừa, không khởi tạo lại
Auth, tài khoản, refresh, audit/outbox	Có nền triển khai, kiểm thử offline và 4 ca browser đạt; chưa đạt toàn luồng	modules/auth, profiles, jobs, AuthContext; còn F01/F19/F22 và chưa xác minh nhà cung cấp thật
Onboarding/hồ sơ	Một phần	Có lưu nháp API, revision/idempotency; thiếu dữ liệu nghiệp vụ chi tiết P01–P06
Mục tiêu/kế hoạch	Chưa đạt	Frontend tính cục bộ; lưu goal/apply scenario trả unsupported; FinancialService chưa nối API
Engine mới	Có mã, chưa nghiệm thu nghiệp vụ	Có Decimal/chuyển năm–tháng; nợ, thời điểm rút, BHXH, chuỗi giả định còn sai/thiếu
Snapshot/giả định	Một phần, phải sửa	Có bảng version; publish có job tự tính và thay currentVersion khi được nối worker
Simulation/tracking	Chủ yếu giao diện dự phóng	Chưa nối lưu kịch bản và sổ thực tế từng tháng
User admin, content/bookmark, support, notification, operations	Có mã/API và một số kiểm thử offline	Kế thừa; chưa xác minh migration/integration mới trên DB cô lập
Cấu hình tài chính admin	Chưa đạt lưu thật	AdminAIConfigPages.tsx dùng localStorage
AI/knowledge base	Chưa đạt tích hợp	AI trả lời theo quy tắc cục bộ; giao diện nguồn còn minh họa
Đối tác/cài đặt/báo cáo	Một phần	Một số state/localStorage; CSV dùng bộ tính frontend


Kết luận: kế thừa nền đã có, nhưng chưa nghiệm thu hoàn chỉnh nghiệp vụ hưu trí hoặc production. Kết quả này là kiểm tra nội bộ, không thay biên bản khách ký.
3. Các lỗi và khoảng trống phải sửa
Trạng thái cập nhật 05/10/2026 nằm trong `docs/T12-acceptance.md` (F01–F29) và `docs/RECHECK-T00-T10.md`; bảng dưới giữ chẩn đoán ban đầu. F15/F21 phần DB sạch/nâng cấp đã đạt, F25 thiếu metadata migration đã sửa bằng0010. F26–F29 giao UI: transport14writes,precision,apply/accountstate vàresponsive. Không suy trạng thái còn mở từ chẩn đoán cũ khi đã có bằng chứng mới.
“Chặn” phải giải quyết trước nghiệm thu tính toán/phát hành; “Cao” là chức năng sai/thiếu; “Vừa” là hoàn thiện và khả năng kiểm chứng. Mỗi phát hiện phải được đóng bằng bằng chứng.
Mã	Mức	Vị trí	Chẩn đoán	Việc xử lý
F01	Cao	backend/src/tests/modules.test.ts:49; modules/auth/service.ts:104	Test chờ 401, code trả 403 EMAIL_NOT_VERIFIED sau khi mật khẩu đúng	Đồng bộ contract/test; giữ phân biệt với sai mật khẩu; T00
F02	Chặn	backend/src/modules/services.ts, router.ts, jobs/handlers.ts	FinancialService chưa khởi tạo/đăng ký; worker chưa xử lý event tài chính	Nối sau khi sửa semantics phiên bản; T07–T08
F03	Chặn	FinancialProfileContext.tsx; frontend/domain/retirementCalculator.ts; backend/services/financialEngine.ts	Nhiều bộ tính khác nhau; goal/apply scenario không lưu thật	Một nguồn kết quả server; T06, T08
F04	Chặn	modules/financial/service.ts phần netLiquid; calculator frontend	Trừ toàn bộ dư nợ vào vốn đầu kỳ trong khi dòng tiền đã có trả nợ	Tách tài sản ròng với vốn hưu trí, dùng lịch vay; T02, T06
F05	Cao	modules/profiles/schema.ts; services/financialProfile.ts	Thiếu hợp đồng vay, nợ chung, nghĩa vụ tiềm tàng, DTI	Mở rộng schema và mô phỏng; T01–T02
F06	Chặn	modules/financial/engine.ts	Rút đầu tháng khác P16–P17 cuối kỳ đã đồng ý	Thống nhất cuối kỳ; không lẫn với P13 thời điểm đóng; T06
F07	Cao	modules/financial/schema.ts, resolveAssumptions()	Tỷ lệ cố định, phân bổ chỉ lấy ở tuổi hiện tại/nghỉ hưu	Chuỗi giả định và chính sách theo thời hạn; T03–T04
F08	Cao	FinancialService.publish/handleEvent/calculateInTx	Có thể tự tạo và chọn bản chính mới khi publish/worker được nối	Chỉ báo có cập nhật; user chủ động áp dụng; T07
F09	Chặn	Hai calculator cũ và engine mới	BHXH demo áp chung 20 năm/tự tăng CPI; engine mới không nhận lương hưu	Nhập tay số tiền, nguồn, ngày nhận; T05
F10	Cao	EMPTY_PROFILE, profileFromData, RetirementGoalPage.tsx	Trống thành 0; toán tử OR thay số 0 bằng dữ liệu mẫu	Trạng thái thiếu riêng, không tự điền số tài chính; T01, T08
F11	Cao	summary engine, calculators, SimulationTrackingPage.tsx	A/K bị cắt 100%; K=0 thành 100%; đường mục tiêu dùng lũy thừa 1.35	Số liệu đúng ngày định giá, chart từ engine; T06, T08
F12	Cao	SimulationTrackingPage.tsx; model MonthlyTracking	Chưa có sổ thu–chi/nộp/rút/lãi/lỗ được nối API	Sổ thực tế và đối soát; T09
F13	Cao	AdminAIConfigPages.tsx	Giả định và history còn localStorage	Nháp/duyệt/publish trên server; T03, T08
F14	Cao	AIAssistantPage.tsx, AdminAIConfigPages.tsx, schema AI	AI chưa nối, chưa kiểm chứng context tối thiểu/nguồn được duyệt	Quyền chỉ đọc kết quả và quản trị dữ liệu; T10
F15	Cần kiểm chứng trên DB mới	migration 202610030003_ai_knowledge_base, dòng 33	Chủ dự án xác nhận đã bật pgvector trên database đang dùng; chưa kiểm chứng migration trên DB test sạch. Chuỗi migration có vector(1536) nhưng chưa có CREATE EXTENSION vector	Không yêu cầu bật lại trên DB đã được xác nhận; kiểm tra migration và chuẩn bị extension riêng cho DB test mới trước migration 0003; T00
F16	Vừa	financial-profile.spec.ts, admin-ui.spec.ts	Test hồ sơ còn localStorage; ảnh admin ghi đường dẫn cá nhân ngoài workspace	Fixture API, artifact nội bộ dự án; T00, T12
F17	Cao	modules/router.ts, community/service.ts, model Consultation	API tư vấn còn tồn tại dù info.md đã loại phạm vi	Ngừng route/producer, giữ dữ liệu lịch sử và Support; T11
F18	Vừa	SimulationTrackingPage.tsx, UserLayout.tsx, AccountPage.tsx, charts	Nhãn tích cực khi còn thiếu quỹ; chỉ số/nhãn demo; lỗi chữ; CSV tính cục bộ	Hiển thị theo dữ liệu/version thật, sửa nội dung; T08, T11
F19	Cao	auth-api.spec.ts, account-api.spec.ts	Nhãn nút/tab cũ; mạng lỗi vẫn bị test yêu cầu về login	Sửa test theo UI và retry hiện hành, không hạ bảo vệ; T00
F20	Vừa	AdminBusinessPages.tsx, AccountPage.tsx	Đối tác/cài đặt còn state/localStorage, chưa lưu theo tài khoản	API/ownership/reload; T11
F21	Chặn nghiệm thu DB	Môi trường kiểm thử	DB cấu hình remote, script chỉ chấp nhận DB local cô lập	Chuẩn bị đúng test DB; không migrate server ứng dụng; T00, T12
F22	Cao	frontend/playwright.config.ts và vòng đời preview/test runner	4 ca browser đạt nhưng teardown plugin/server quá 60 giây; chưa xác định nguyên nhân gốc	Chẩn đoán đóng worker/browser/preview do test tạo, phân biệt server có sẵn; bảo đảm lệnh thoát và xuất report đúng; T00


4. Phương án đã chốt theo ý kiến khách
P01 — Nợ chung và nghĩa vụ tiềm tàng (D6)
Lưu hai lớp: phần trả nợ đang được phân bổ và phạm vi trách nhiệm theo hồ sơ hợp đồng đã xác nhận. Khoản vay có ID chung, tỷ lệ phân bổ, người đứng tên/đồng nghĩa vụ, giới hạn trách nhiệm và lịch gốc/lãi. Không tự kết luận nghĩa vụ pháp lý chỉ từ tên người vay.
Kế hoạch cơ sở dùng phần đang trả. Kịch bản căng thẳng ghi tháng bắt đầu/kết thúc, mức phải trả thay khi người cùng nghĩa vụ ngừng đóng. Chỉ cộng phần tăng, không tính cả nghĩa vụ lần hai. Thiếu hồ sơ thì ghi phạm vi nghĩa vụ chưa xác định, không kết luận đã bao phủ toàn bộ rủi ro.
Ca chuẩn: tổng trả 10 triệu/tháng, phân bổ 50%, trách nhiệm toàn bộ đã được ghi nhận: cơ sở 5 triệu; căng thẳng 10 triệu; tăng thêm 5 triệu, không thành 15 triệu. Dòng tiền này phải ảnh hưởng DTI và tích lũy hưu trí.
P05 — Tỷ lệ trả nợ và phương án giảm nợ (D10)
Chốt chỉ tiêu chính là gốc+lãi phải trả tháng / thu nhập khả dụng tháng, thống nhất P02. Ghi đúng tên “Tỷ lệ trả nợ trên thu nhập khả dụng”. DTI theo định nghĩa CFPB dùng thu nhập trước thuế [S01]; nếu có thêm chỉ tiêu đó thì đặt tên riêng, không trộn mẫu số.
Ngưỡng theo khách, là quy tắc nội bộ An Hưu:
- Dưới 30%: áp lực nợ thấp, vẫn kiểm tra tiền còn lại.
- Từ 30% đến hết 50%: ưu tiên xem xét giảm nợ.
- Trên 50%: cảnh báo đỏ áp lực trả nợ.
- Thu nhập bằng 0/âm và có trả nợ: thiếu nguồn trả, tỷ lệ không xác định. Thiếu thu nhập: chưa đủ dữ liệu.
Không kết luận tốt chỉ vì dưới 30%. Thu nhập 20, trả nợ 5, sinh hoạt 16 triệu: tỷ lệ 25% nhưng thiếu 1 triệu/tháng.
Chốt so sánh lịch hợp đồng với trả thêm khoản lãi cao trước (avalanche), dư nợ nhỏ trước (snowball), tất toán khoản được chọn. Dùng ngân sách dư thực sau chi thiết yếu và dự phòng đã khai báo; tính phí/điều kiện trả trước. So tổng lãi+phí, ngày hết nợ, áp lực tháng và ảnh hưởng quỹ hưu trí. Không đủ dữ liệu hợp đồng thì chỉ ra phần chưa tính được. Không giả định ngân hàng chấp nhận giãn nợ/tái cấp vốn và không thực hiện giao dịch. Đây là mở rộng P25 theo P05, không để chức năng tối ưu nợ tiếp tục chờ khách chốt.
P08 — Giá trị thời gian của mức sống (D14)
Giữ FV = PV × (1+π)^n khi lạm phát cố định, dùng tích hệ số khi thay đổi theo kỳ. Nhập tiền hôm nay, lưu ngày cơ sở/đơn vị kỳ. Ví dụ minh họa 20 triệu/tháng, 20 năm, 4%/năm → khoảng 43,82 triệu/tháng tại ngày nghỉ hưu. Đây là chi một tháng, không phải tổng quỹ cần có. Không dùng lợi suất thay lạm phát.
P11 — Giả định từng năm và cập nhật (D17)
Chốt chuỗi năm áp dụng cho lạm phát và lợi suất từng nhóm tài sản. Lưu nguồn/ngày lấy/kỳ hiệu lực/người duyệt, loại tỷ lệ, danh nghĩa/thực, phí/thuế. CPI quá khứ là tham chiếu; dự báo có thể lấy IMF WEO. Nguồn WEO thường có dự báo khoảng năm năm cho nhiều chuỗi [S03]; phần xa hơn phải là giả định dài hạn của An Hưu được duyệt, không gắn nhãn dự báo IMF.
MVP dùng dòng tiền danh nghĩa: chi tăng theo lạm phát, quỹ tăng theo lợi suất danh nghĩa quy đổi tháng, không trừ lạm phát hai lần. Lãi vay là lịch riêng. USER chọn kịch bản công bố, không tự ghi đè tỷ lệ hệ thống. Nguồn mới tạo version mới; chỉ đổi kế hoạch đang áp dụng sau khi người dùng xem so sánh và áp dụng. Không viết lại quá khứ.
P32 — Phân bổ và kịch bản (D42)
Đã đọc TACA [S04] và đối chiếu Investor.gov [S05]. Chốt danh mục mẫu do An Hưu quản lý, chọn theo hồ sơ rủi ro nhiều yếu tố, thời hạn và thanh khoản. Tỷ trọng đủ 100%, có version/hiệu lực/phí/giả định từng nhóm tài sản.
Không tự áp 100/110 trừ tuổi, tỷ trọng ví dụ trong bài hoặc vay đầu tư làm mặc định. Chưa có danh mục được duyệt thì hiển thị kiến thức/trạng thái thiếu cấu hình, không sinh tỷ trọng giả. Đây là quy tắc vận hành đã chốt.
Tách ba khái niệm: trạng thái thu–chi; phương án phân bổ; kịch bản thị trường Cơ sở/Thận trọng/Căng thẳng. Mỗi kịch bản ghi biến thay đổi, nguồn/version, cùng ngày định giá. Phiên bản đầu là mô phỏng xác định; chưa có mô hình thống kê thì không báo xác suất thành công.
5. P13/P15 — hướng xử lý đã được khách chốt, kế hoạch thực hiện còn lại
Nguồn: Xác nhận!B20/D20 và B22/D22 trong file khảo sát; thông báo mới của chủ dự án ngày05/10/2026 “khách chốt theo hướng bạn giải thích” thay trạng thái “chưa hiểu” trong file gốc. Không sửa file khảo sát hoặc coi ghi chú cũ là xác nhận mới. Việc triển khai bổ sung chia thành Q13-01–03 và Q15-01–04 ở mục7.1.
Q13 / P13 — Đóng đầu kỳ và cuối kỳ (D20)
Giải thích: so tại cùng ngày cuối kế hoạch, nộp đầu tháng có thêm một tháng sinh lời so với cuối tháng. Minh họa 1 triệu, lợi suất giả định 1%/tháng: cuối tháng có 1,01 triệu hoặc 1 triệu. Với 12 lần đóng: khoảng 12.809.328 và 12.682.503 đồng. Đây là minh họa, không phải lợi suất cam kết. Quy ước này phù hợp tham số type trong FV [S02].
Hướng triển khai: hỗ trợ lựa chọn đầu tháng hoặc cuối tháng cho khoản góp tích lũy, lưu contributionTiming trong input và snapshot. Giữ cuối tháng làm mặc định tương thích P12 và kế hoạch cũ; đây là quy tắc triển khai, không diễn giải rằng khách đã chọn chỉ dùng cuối tháng. Người dùng chọn đầu tháng thì khoản góp đó nhận hệ số sinh lời của tháng; vốn ban đầu không được thêm một kỳ. Không đổi thời điểm rút, bán tài sản hoặc lịch vay theo lựa chọn này.
Nhánh START_OF_MONTH_RESEARCH hiện có chỉ là nền nghiên cứu, chưa được mở qua API. Phải kiểm khả năng có tiền ở đầu tháng, solver, version và hồi quy trước khi đưa thành lựa chọn sản phẩm. Không lấy thu nhập cuối tháng rồi ghi thành khoản góp đầu tháng mà không có giả định rõ.
Q15 / P15 — Ba trạng thái thu–chi và cập nhật thực tế (D22)
Giải thích D = chi cần tài trợ − thu được phép dùng. Chi 20, thu 12 triệu → cần rút 8; bằng nhau → không cần rút; chi 20, thu 25 → dư 5. Tiền rút quỹ không là thu nhập để trừ lại trong công thức; lợi nhuận đã tính trong quỹ không được cộng lần hai.
Phần khách đã nói rõ, làm ngay: ba trạng thái; nhập thực tế từng tháng; đối chiếu; lưu phiên bản và dự báo phần còn lại.
Hướng đã chốt: ba trạng thái là kết quả thu–chi của từng tháng, không phải ba kịch bản thị trường. Nhập thực tế → đối soát → cập nhật dự báo phần còn lại → lưu phiên bản mới; giữ baseline và lịch sử. Thu/chi bất thường mặc định chỉ tác động tháng ghi nhận; muốn tiếp tục trong tương lai phải khai rõ khoảng hiệu lực và xác nhận thay đổi dự báo.
Chính sách tiền dư đã xác nhận trong phiên ngày05/10: **EXPLICIT_DEPOSITS_ONLY — chỉ góp số người dùng xác nhận**. Ví dụ thu25/chi20 triệu: dư5; xác nhận góp2 thì góp dự kiến2, giữ ngoài quỹ3; chưa xác nhận góp thì không tự tăng quỹ. Không triển khai tự quét toàn bộ tiền dư. Khoản góp dự kiến được xác nhận trong kế hoạch vẫn không phải giao dịch đã xảy ra; chỉ ghi actual CONTRIBUTION khi người dùng xác nhận tiền đã thực nộp. Không chuyển tiền ngân hàng.
Backend hiện có sổ tháng/đối soát/reforecast chỉ đọc; còn thiếu luồng lưu reforecast thành version và chỉnh riêng lịch thu–chi tương lai. Các phần đã có được tái sử dụng, không làm lại sổ hoặc sửa lịch sử để khớp kế hoạch mới.
6. Đối chiếu đủ 36 mục
Trạng thái “đã chốt” dưới đây là nghiệp vụ, không phải code đã đạt.
Mã	Nội dung	Trạng thái	Hiện trạng / việc làm
P01	Cá nhân, phân bổ, nghĩa vụ tiềm tàng	Đã chốt theo ý kiến	Thiếu dữ liệu chi tiết; T01–T02
P02	Thu nhập khả dụng, cố định/thưởng/không đều	Đồng ý	Chỉ hai tổng thu; T01
P03	Nhóm chi, cùng kỳ, tránh trùng nợ	Đồng ý	Chỉ hai nhóm chi; T01–T02
P04	Định giá, sở hữu, phần hưu trí, thanh khoản	Đồng ý	Mới loại nhà ở khỏi tính; T01
P05	Lịch vay, tỷ lệ 30/50, giảm nợ	Đã chốt theo ý kiến	Chưa có lịch/DTI; T02
P06	Chưa biết khác 0	Đồng ý	Frontend mặc định 0; T01, T08
P07	Kỳ tháng, ngày định giá	Đồng ý	Có tính tháng, tuổi vẫn năm nguyên; T01, T06
P08	Mức sống theo tiền hôm nay	Đã chốt theo ý kiến	Có demo, thiếu nguồn/version thật; T03, T06, T08
P09	Lạm phát cố định/chuỗi kỳ	Đồng ý	Chưa có chuỗi tỷ lệ; T03, T06
P10	Quy đổi đúng loại tỷ lệ	Đồng ý	Có hiệu dụng, thiếu metadata/lãi hợp đồng; T02–T03, T06
P11	Nhất quán thực/danh nghĩa, cập nhật năm	Đã chốt theo ý kiến	Tỷ lệ cố định; T03, T06
P12	Quỹ dự kiến cuối kỳ, i=0	Đồng ý	Có mã, chưa golden test engine mới; T06
P13	Thời điểm đóng đầu/cuối kỳ	Chốt hướng theo chủ dự án05/10	Q13-01–03: API/engine/version/UI và nghiệm thu; T06–T08
P14	Khoản đóng cần thiết	Đồng ý	Backend có solver, UI dùng tiền dư; T06, T08
P15	Rút ròng, ba trạng thái, thực tế	Đã chốt05/10: chỉ góp số xác nhận	Q15-01–04: chính sách EXPLICIT_DEPOSITS_ONLY, lưu dự báo mới và lịch tương lai; T06–T09
P16	PV rút ròng, số dư cuối L	Đồng ý	Engine mới rút đầu kỳ, thiếu L/nguồn thu; T05–T06
P17	Số dư tháng, thiếu tiền sớm	Đồng ý	Có vòng lặp, chart năm/chưa đủ dòng tiền; T06
P18	A/K/G cùng ngày định giá	Đồng ý	Cắt 100%, K=0 sai; T06, T08
P19	Không làm tròn trung gian	Đồng ý	Decimal có sẵn, demo làm tròn rồi dùng tiếp; T06, T08
P20	CPI lịch sử chính thức	Đồng ý	Chưa nối nguồn/phiên bản; T03
P21	Dự báo có phiên bản/phê duyệt	Đồng ý	Schema một phần, UI localStorage; T03
P22	Lợi suất theo nhóm/kỳ/phí/thuế/nguồn	Đồng ý	Thiếu metadata; T03–T04
P23	Giữ bộ giả định của kế hoạch cũ	Đồng ý	Có snapshot nhưng job đổi current; T07
P24	Tách dự phòng/mục tiêu khác	Đồng ý	Chưa tách khoản; T01–T02
P25	Lịch hợp đồng và mở rộng P05	Đồng ý, bổ sung P05	Đang trừ dư nợ đầu kỳ; T02
P26	MVP nhập lương hưu dự kiến	Đồng ý	Chưa có trường đúng; T05
P27	Tự tính BHXH theo phiên bản luật	Đồng ý	Loại công thức demo; tự tính sau MVP; T05
P28	Tuổi nghỉ hưu tháng/năm/điều kiện	Đồng ý	Thiếu tháng sinh/bộ tra cứu; T01, T05
P29	BHXH là ước tính, nêu thiếu dữ liệu	Đồng ý	Vẫn suy ra số demo; T05, T08
P30	Rủi ro nhiều yếu tố	Đồng ý	Chưa có bộ câu hỏi đầy đủ; T04
P31	Danh mục theo bảng duyệt	Đồng ý	Có schema policy, chưa toàn luồng; T04, T10
P32	Kịch bản minh bạch, phân bổ	Đã chốt theo ý kiến	Mô phỏng cục bộ; T04, T08
P33	Nộp/rút/thu đầu tư/biến động giá	Đồng ý	Thiếu sổ thực tế; T09
P34	Phiên bản mới, giữ lịch sử	Đồng ý	Có PlanVersion, thiếu luồng user; T07–T09
P35	AI chỉ giải thích	Đồng ý	Chỉ demo; T10
P36	Dữ liệu AI tối thiểu/quyền dữ liệu	Đồng ý	Chưa nghiệm thu thực thi; T10–T12


7. Kế hoạch từng việc

Checkpoint05/10/2026: **T11 backend đã hoàn thành; T12 kiểm chứng nội bộ, chưa phát hành.** Bằng chứng hiện hành và mẫu P01–P36/F01–F24: `docs/T12-acceptance.md`. Các bảng chẩn đoán P/F ở trên là baseline khảo sát03/10, không phải trạng thái triển khai mới nhất. Backend dùng DB thật theo chỉ đạo user; không reset. UI ghi riêng `docs/task-frontend.md`.
Thứ tự thực hiện: T00 → T01 → T02 → T03 → T04 → T05 → T06 → T07 → T08 → T09 → T10 → T11 → T12. Kiểm tra theo nhóm liên quan sau mỗi đợt; không đợi cuối mới kiểm tra công thức. Giữ tất cả phần đang hoạt động không liên quan.

Nhận việc ngày 04/10/2026 (Asia/Saigon): Codex trong phiên này phụ trách phần backend, ưu tiên theo bảng dưới. Đây là phân công và thứ tự thực hiện, không phải xác nhận đã hoàn thành T00–T12. Phần frontend/browser sẽ nối sau khi contract/backend tương ứng được kiểm chứng.

| Task | Phần backend đã nhận | Trạng thái |
| --- | --- | --- |
| T00 | Contract auth, kiểm thử offline, môi trường DB test/pgvector, migration sạch và nâng cấp | DB sạch/nâng cấp13migration và10integration đạt07/10; browser15/41,26lỗi, lifecycle frontend còn mở; xem RECHECK-T00-T10/T12 |
| T01 | Schema hồ sơ có phiên bản, KNOWN/UNKNOWN/NOT_APPLICABLE, dữ liệu tháng, lưu nháp, migration bảo toàn dữ liệu | Backend đã kiểm chứng DB thật; UI có bàn giao riêng, cần nghiệm thu browser |
| T02 | Lịch vay, nợ chung, tỷ lệ trả nợ, so phương án giảm nợ; chống tính trùng | Backend/API và T06 đã nối; nghĩa vụ có trần chưa mô phỏng, UI cần nghiệm thu |
| T03–T05 | Giả định theo kỳ có nguồn/version; policy rủi ro/danh mục; lương hưu nhập tay và tháng nhận | T03/T04/T05 backend đã kiểm chứng; pension nhập tay MVP, BHXH đầy đủ sau MVP; UI/nguồn production cần nghiệm thu |
| T06 | Engine Decimal theo tháng và golden tests độc lập; summary/chuỗi tháng cùng kết quả | Backend engine/preview và snapshot/report đã đạt; golden tests trong246tests; UI cần nghiệm thu |
| T07–T08 | Snapshot bất biến, preview/create/apply, worker an toàn, API USER/ADMIN và OpenAPI | T07/T08 backend đã đạt snapshot/report/compare/simulate/CSV; E06 T12 kiểm xuyên luồng; không bật calculate legacy |
| T09 | Sổ thực tế, đối soát, revision/idempotency, dự báo phần còn lại | Nền backend đạt05/10; chính sách Q15 đã chốt, bổ sung Q15-01–04 và UI FE-P13-P15 chưa triển khai/nghiệm thu |
| T10 | Context AI theo version, quyền dữ liệu, tri thức có duyệt và mô phỏng chỉ đọc | Gemini đã kết nối05/10, live synthetic smoke PASS; consent v2/290tests đạt; UI/P36/vận hành còn nghiệm thu |
| T11 | API module hiện có, ngừng API tư vấn, báo cáo theo snapshot | Backend hoàn thành:26 HTTP/DBchecks,2races; migration0009; UI FE-T11 còn mở |
| T12 | Kiểm thử backend/DB/contract, bằng chứng nghiệm thu và phối hợp toàn luồng | 246tests+18 HTTP/DBflowPASS; browser gần nhất15/41 trước sửa UI mới, cần chạy lại; release còn blocker trong T12-acceptance.md |

Checkpoint backend 04/10/2026: 68/68 tests offline (10 files), typecheck nguồn/test, build và startup guard đạt. F01 đã có test HTTP cho 401/403, không có cookie/token/session khi từ chối. Khi kiểm tra lại, nhánh pending trong service test đã đúng; lỗi còn lại là test reset mật khẩu gán nhầm 403 và đòi xóa token thay vì thu hồi. Đã sửa đúng contract, giữ nguyên AuthService. T00/F15/F21 còn mở: DATABASE_URL không local, chưa cấu hình TEST_DATABASE_URL; guard dừng trước khi tạo DB/migrate. Chi tiết tại backend/PROGRESS.md.

T00 — Sửa kiểm thử và xác minh môi trường
Phụ thuộc: không. Xử lý F01, F15, F16, F19, F21, F22.
- [x] Đồng bộ EMAIL_NOT_VERIFIED: đúng mật khẩu/chưa xác minh 403, sai mật khẩu 401, không cấp session khi chưa xác minh; sửa OpenAPI/test đúng nhánh. Bằng chứng 04/10/2026: modules.test.ts, contract.test.ts; 68/68 backend tests đạt, typecheck nguồn/test và build đạt.
- [ ] Cập nhật tên nút đăng ký, tab mật khẩu, kỳ vọng mất mạng; mock đầy đủ API phụ thuộc. Không sửa hành vi đúng thành sai để qua test cũ.
- [ ] Test hồ sơ dùng API fixture thay localStorage; artifact trong dự án; thêm timeout toàn lượt để phát hiện test treo.
- [ ] Chẩn đoán teardown timeout của Playwright: quản lý đúng server do test tạo, đóng browser/worker/socket liên quan, không dừng server của người dùng; ca đạt phải đi kèm lệnh thoát bình thường và report đầy đủ.
- [x] pgvector trên database đang dùng: chủ dự án xác nhận đã bật ngày 03/10/2026. Đây là xác nhận của chủ dự án, chưa phải bằng chứng migration/integration đã đạt.
- [x] Chuẩn bị DB test local cô lập đúng guard anhuu_*_test; extension tạo trước0003 bằng prepare-test-db; PostgreSQL16/pgvector Docker đã kiểm05/10, CI dùng image ghim digest. Không bật lại pgvector trên DBthật.
- [x] Chạy migration DB sạch và bản cũ: clean13 vàprior4→13 với legacy fixture, checksum/diff/giữ dữ liệu đạt07/10;10integrationPASS. Bổ sung0013 cho2index thiếu trong lịch sử, DBthật13/13checksum/diff rỗng; khôi phục đúng xuống dòng file cũ theo checksum, không đổi SQL. Đây không thay bằng chứng restore backup production. Xem docs/RECHECK-T00-T10.md.
Nghiệm thu: test offline/browser cập nhật đạt; migration/integration thực sự chạy trên DB cô lập. Ghi riêng nhà cung cấp chưa xác minh. EPERM TEMP/TMP đã xử lý bằng thư mục tạm workspace, không cần sửa công thức.
T01 — Dữ liệu và hồ sơ tài chính
Phụ thuộc T00 trong kế hoạch gốc; ngày 04/10 chủ dự án yêu cầu làm T01 ngay, không chờ DB test local. P01–P04, P06–P07, P24, P28. Xử lý F05/F10 theo phần backend; chưa đóng F05/F10 toàn sản phẩm.
- [x] Hợp đồng dữ liệu backend có schemaVersion, ngày định giá, tiền tệ, đơn vị kỳ và trạng thái KNOWN/UNKNOWN/NOT_APPLICABLE phù hợp; trống không thành 0.
- [x] Thu khả dụng tách cố định/thưởng/không đều và lịch hiệu lực; chi thiết yếu/tùy chọn/y tế/bảo hiểm/người phụ thuộc; trả nợ liên kết chống trùng trong schema/API backend.
- [x] Dữ liệu tài sản có giá trị/ngày định giá/sở hữu/phần hưu trí/thanh khoản/thời điểm dùng; tách dự phòng/mục tiêu khác. Nhà ở có bản ghi phương án xác nhận; không tự sinh thu nhập hoặc đưa nhà vào tiền mặt hưu trí. Chuyển phương án thành lịch thu dự báo thuộc T06.
- [x] Backend lưu thời gian đến tháng; tách nghỉ hưu mong muốn với tháng nhận BHXH. VND mặc định; ngoại tệ thiếu quy tắc không cộng vào quỹ.
- [x] Migration T01 bảo toàn dữ liệu cũ; v1 có LEGACY_UNREVIEWED/unconfirmedZeroFields, không tự chuyển thành KNOWN. Nâng cấp v2 giữ nguyên JSON cũ ở legacyProfileData; snapshot cũ giữ nguyên. Đã áp dụng 202610040005_profile_v2 trên DB thật và đối chiếu 50 hồ sơ trước/sau.
- [ ] Sửa onboarding, form hồ sơ, API/validation; cho lưu nháp thiếu trường và chỉ chặn loại kết quả cần trường bắt buộc đang thiếu. **Backend/API đã đạt**: draft thiếu nhóm/trường/khoản, complete chấp nhận UNKNOWN rõ ràng, summary null theo từng chỉ số. Frontend nhập/hiển thị v2 và kiểm tra browser chưa thực hiện.
Checkpoint 04/10/2026: 84/84 backend tests (11 files) đạt; 12 kiểm tra workflow trên PostgreSQL thật rollback đạt, ca cập nhật draft đồng thời một thành công/một 409 đạt, cleanup đạt, hồ sơ và snapshot cũ không đổi. Contract HTTP/OpenAPI kiểm thử offline; không gọi đó là E2E qua frontend. Chi tiết tại backend/PROGRESS.md và backend/docs/FINANCIAL_PROFILE_V2.md.
Nghiệm thu: reload giữ dữ liệu; 0 khác trống; không trùng tài sản; quỹ dự phòng không thành vốn hưu trí; tháng/năm đúng; ownership/revision đạt.
T02 — Lịch vay, nợ chung, tỷ lệ trả nợ và giảm nợ
Phụ thuộc T01. P01/P03/P05/P10/P24/P25. Xử lý F04/F05.
- [x] Backend lưu khoản vay riêng có dư nợ/ngày chốt, loại lãi, lịch thay đổi, kỳ trả/đáo hạn/tối thiểu, phí tất toán, phân bổ, giới hạn nghĩa vụ và liên kết khoản chung. Dữ liệu nghĩa vụ có trần đã lưu; tính giới hạn còn lại/điều kiện bảo lãnh chưa hỗ trợ, trả thiếu dữ liệu cho stress cần chúng.
- [x] Backend tính lịch gốc/lãi theo hợp đồng tháng, phân biệt hiệu dụng năm/danh nghĩa năm/tháng/ngày đơn; không dùng APR/12 cho mọi tỷ lệ. Stress tăng phần trả chỉ khi xác nhận trách nhiệm FULL, chỉ cộng phần chưa có trong cơ sở.
- [x] Backend chỉ số theo ngưỡng 30/50 kèm thu khả dụng, chi, trả nợ và tiền còn lại; xử lý 0/âm/chưa biết, giữ thiếu hụt ngay cả khi tỷ lệ thấp.
- [ ] So avalanche/snowball/tất toán với ngân sách thực, dự phòng, phí và cùng ngày định giá; chuyển tác động sang dự phóng hưu trí. **Backend so sánh đã đạt**; có dòng tiền tháng/chênh dành hưu trí, phí và phạm vi so sánh cùng horizon hoặc toàn kỳ. Phần quỹ hưu trí nối tại T06, frontend chưa nối.
- [ ] Tách tài sản ròng (trừ nợ để báo cáo) với vốn hưu trí (không trừ toàn bộ nợ nếu đã dùng lịch trả). **Đã đạt summary v2/preview T02** và chống chi nợ trùng; F04 toàn sản phẩm vẫn mở vì engine hưu trí cũ chưa thay tại T06.
Checkpoint backend T02 04/10/2026: 110/110 tests offline (12 files), typecheck nguồn/test, build và startup guard đạt; 12 kiểm tra HTTP qua AuthService/PostgreSQL thật đạt. Toàn bộ fixture/phiên/outbox rollback; 50 hồ sơ và snapshot cũ giữ nguyên, không gửi mail, không cần migration T02. Chi tiết backend/docs/DEBT_PLANNING.md và backend/PROGRESS.md.
Nghiệm thu: ca nợ 5/10/15 triệu; tỷ lệ 29,99/30/50/50,01%; DTI thấp nhưng thiếu tiền; đổi lãi/đáo hạn; phí trả trước làm đổi phương án; không có giao dịch thật.
T03 — Giả định theo năm có nguồn/version
Phụ thuộc T01. P08–P11/P20–P23. Xử lý F07/F13.
- [x] Backend schema v2 chuỗi năm: nguồn/bản phát hành/ngày lấy/người duyệt/hiệu lực/loại tỷ lệ/phí-thuế/thực-danh nghĩa. Lưu JSON trong bảng version hiện có; không cần migration, không chuyển dữ liệu cũ ngầm.
- [x] Backend tách CPI lịch sử, dự báo và giả định dài hạn; kiểm tra loại nguồn/khoảng năm, đủ kỳ/không trùng; không kéo CPI quá khứ hoặc tỷ lệ cuối ra ngoài phạm vi. Chưa nhập/công bố bộ số liệu production thay người phụ trách.
- [ ] Lợi suất theo nhóm tài sản/thời hạn; bỏ tự giảm 1,5 điểm phần trăm lúc hưu của demo. **Backend đã đạt**: chuỗi theo nhóm/dải thời hạn, quy đổi lãi danh nghĩa/hiệu dụng/thực/danh nghĩa và phí/thuế khai rõ; đã bỏ phép trừ 1,5 ở backend demo. Frontend demo còn chờ thay khi nối T06/T08.
- [ ] Admin nháp → kiểm tra đủ kỳ/không trùng → xem tác động → duyệt/publish qua API có audit/revision. **Backend lifecycle đã đạt**, USER chỉ chọn bản công bố đã có hiệu lực; macro override bị từ chối. Impact là chênh cấu hình có nhãn CONFIGURATION_DIFF_ONLY; dự phóng tác động quỹ cần T06, UI quản trị chưa nối.
- [x] Backend thiếu dữ liệu trả UNCONFIGURED/INCOMPLETE, không thay bằng 0 hoặc 4%/7,8%. Công bố không sửa kế hoạch chính/snapshot hoặc tạo job tính lại; version/hash cho tái lập bộ cũ.
Checkpoint T03 backend 04/10/2026: 14 kiểm tra HTTP/AuthService/PostgreSQL thật đạt; toàn bộ fixture, phiên và bộ giả định công bố thử rollback. 50 hồ sơ/kế hoạch/snapshot cũ giữ nguyên, DB chưa có bộ giả định production; không gửi email, không tạo outbox job. T04 tiếp theo; engine T06 và snapshot/apply T07–T08 còn mở. Chi tiết backend/docs/ASSUMPTIONS.md và backend/PROGRESS.md.
Nghiệm thu: tỷ lệ năm sau chỉ tác động từ kỳ hiệu lực; không lạm phát hai lần; version bất biến; tái lập kết quả; publish không tự đổi bản chính.
T04 — Rủi ro, danh mục mẫu và kịch bản
Phụ thuộc T03. P22/P30–P32.
- [x] Backend bộ câu hỏi đủ sáu chiều mục tiêu/thời hạn/thanh khoản/chịu lỗ/kinh nghiệm/khả năng tài chính; điểm/ngưỡng trong chính sách có version, không tự tạo ngưỡng production. Câu trả lời thiếu trả null, không biến thành 0.
- [x] Backend ADMIN quản lý/validate/duyệt/công bố danh mục, tỷ trọng đủ 100%, điều kiện và lịch phân bổ theo tháng; tái cân bằng đầu kỳ 1/3/6/12 tháng, tỷ trọng trôi giữa kỳ, chi phí luân chuyển khai rõ. Bản công bố bất biến, chốt ID/hash bộ T03. UI quản trị và cấu hình nghiệp vụ production chưa nối/công bố.
- [x] Backend chọn theo nhiều chiều/thời hạn/thanh khoản, giải thích quy tắc khớp/không khớp; thiếu policy không phân bổ. Nhiều danh mục hợp lệ yêu cầu chọn rõ, không tự lấy mục đầu; các câu trả lời tự khai chưa được xác minh độc lập từ hồ sơ.
- [ ] Ba kịch bản thị trường từ tham số duyệt; công khai biến thay đổi. **Backend preview danh mục BASE/ADVERSE/FAVORABLE đã đạt**, công khai delta từng năm/nhóm, phí/tỷ trọng/hệ số tháng, không ghi bản chính. Thử tuổi/mức sống/tích lũy/tài sản với quỹ cá nhân và apply cần T06–T08; UI chưa nối.
Checkpoint T04 backend 04/10/2026: 146/146 tests (14 files), typecheck nguồn/test, build/startup guard đạt; 15 kiểm tra HTTP/AuthService/PostgreSQL thật đạt và rollback. 50 hồ sơ, kế hoạch/snapshot cũ không đổi, không tạo job/mail/giao dịch, không thêm migration hoặc seed cấu hình mẫu. Chi tiết backend/docs/PORTFOLIOS.md và backend/PROGRESS.md; bước tiếp T05.
Nghiệm thu: cùng tuổi nhưng khác chịu lỗ/thanh khoản không bị ép cùng danh mục; tổng sai bị từ chối; version cũ tái lập; không tự thêm đòn bẩy.
T05 — Lương hưu nhập tay và tuổi nghỉ hưu
Phụ thuộc T01. P26–P29. Xử lý F09.

Checkpoint backend 04/10/2026: **đã đạt phần contract/lưu/preview/tra tuổi T05**, 167/167 tests và 13 kiểm tra HTTP/PostgreSQL thật rollback. Hồ sơ v2 có mức hưu/nguồn/ngày/cơ sở tiền/lịch điều chỉnh; preview chỉ đọc, không tăng CPI sau nhận ngầm hoặc trùng dòng thu; tra phụ lục I/II NĐ 135/2020 là tham chiếu, không kết luận đủ điều kiện hưởng. Calculator legacy backend không còn suy số BHXH demo. **Chưa đóng T05 toàn sản phẩm**: UI giao cho AI frontend qua FE-T05 trong task-frontend.md, quỹ cá nhân T06–T08 và context AI T10 còn mở; tự tính BHXH sau MVP. Không migration; giữ DB thật. Xem backend/docs/PENSIONS.md và backend/PROGRESS.md, gồm giới hạn build Prisma EPERM. Checklist dưới giữ mở theo nghiệm thu toàn sản phẩm.

- [ ] MVP nhập mức hưu dự kiến, tiền hôm nay hay tại ngày nhận, ngày bắt đầu, nguồn/ngày ước tính, trạng thái thiếu; 0 đã xác nhận khác chưa khai báo.
- [ ] Tạo dòng thu đúng tháng nhận; không tự tăng theo CPI nếu không có lịch/giả định điều chỉnh được khai báo. Không trùng thu nhập.
- [ ] Bỏ công thức BHXH demo khỏi luồng chính và AI; thiếu mức nhập thì nêu phạm vi chưa gồm BHXH, không suy đoán quyền lợi.
- [ ] Tra cứu tuổi theo tháng/năm/điều kiện lao động từ văn bản và phụ lục chính thức; tách tuổi mục tiêu với tuổi pháp lý [S07].
- [ ] Mô-đun tự tính BHXH xếp sau MVP theo P26–P27, với luật có version, lịch sử đóng, bình quân căn cứ, nhóm/nghỉ sớm; không thay bằng một công thức chung [S06].
Nghiệm thu: trước tháng nhận không có thu; bắt đầu đúng tháng; thiếu dữ liệu có cảnh báo; đổi tuổi mục tiêu không tự sửa tuổi pháp lý; không còn số demo trình bày như quyền lợi chính thức.
T06 — Bộ tính hưu trí tháng làm chuẩn
Phụ thuộc T01–T05. P07–P19. Xử lý F03/F04/F06/F07/F09/F11.

Checkpoint backend 04/10/2026: **engine/adapter/API preview đã đạt**, Decimal precision 48; quỹ đầu vào đủ điều kiện, lịch nợ/pension, cuối kỳ/L, PV có ràng buộc thanh khoản, solver mức tổng/tăng thêm, chuỗi tháng giữ âm và unmet mới, A/K/G cùng thời điểm. 193/193 tests (26 T06), 13 kiểm tra HTTP/DB thật rollback, typecheck/build đầy đủ/startup guard đạt. Q13 core nghiên cứu, Q15 không tự nộp surplus. Không migration, không lưu/apply hoặc đổi kế hoạch chính. Contract backend/docs/RETIREMENT_MONTHLY.md; FE-T06 giao task-frontend.md. Checklist toàn sản phẩm dưới giữ mở cho UI và summary-chart-export gắn snapshot tại T07–T08. Bước backend tiếp T07; chi tiết PROGRESS.md.

- [ ] Tháng từ ngày định giá; Decimal đủ chính xác trung gian; API chuỗi thập phân. Chỉ hiển thị làm tròn VND đến 1.000, tỷ lệ 2 số thập phân.
- [ ] Vốn đủ điều kiện, đóng cuối kỳ P12 và mở lựa chọn đầu kỳ theo Q13-01–03; i=0 dùng P+c×n. Dòng đóng/lãi biến đổi dùng mô phỏng kỳ, không áp niên kim cố định.
- [ ] Rút ròng từ chi và thu hợp lệ, PV cuối kỳ P16, chuỗi lãi thay đổi và mục tiêu số dư cuối L; L mặc định 0 nếu không đặt mục tiêu để lại tài sản.
- [ ] Kiểm chứng B(k)=B(k−1)×(1+j_k)−D(k) cho dòng cuối kỳ; lưu tháng đầu thiếu và nhu cầu chưa tài trợ. Không kẹp số dư về 0 rồi mất dấu thiếu hụt.
- [ ] Kiểm tra không thiếu tiền ở bất kỳ tháng nào: PV tổng có vẻ đủ vì nguồn thu đến muộn vẫn phải báo thiếu thanh khoản trước đó và vốn cần bổ sung.
- [ ] A/K/G cùng ngày định giá; tỷ lệ chỉ khi K>0, giữ tỷ lệ vượt 100%; giải mức đóng cần thiết, tách phần tăng thêm với mức đang đóng. Kết quả đóng âm hiển thị 0 bổ sung và phần dư.
- [ ] Không có kỳ tích lũy mà còn thiếu thì báo thiếu tại ngày hưu, không chia 0. Trả chuỗi tháng cho chart/export; bỏ đường mục tiêu trang trí progress^1.35 khỏi số liệu.
- [ ] Golden test độc lập theo Q13-03/Q15-04; nhãn chính sách trong input/snapshot/output phải thống nhất. Không dùng kết quả nhánh nghiên cứu làm bằng chứng API sản phẩm đã đạt.
Nghiệm thu: FV/PV mẫu chuẩn; i=0/lãi âm hợp lệ/nghỉ ngay/đổi lãi từng năm/BHXH đến muộn/nợ đổi kỳ/K=0/A>K/thiếu sớm; summary-chart-export khớp snapshot, không làm tròn trung gian.
T07 — Snapshot, tính lại, áp dụng phiên bản
Phụ thuộc T06. P23/P34. Xử lý F08.

Checkpoint backend 04/10/2026: **snapshot/create/apply/history/replay và worker an toàn đã đạt**, 205/205 tests (12 T07), 23 HTTP/DB thật rollback, 3 ca cạnh tranh PostgreSQL nhiều kết nối, typecheck/build/startup đạt. Migration 0006 revision/baseline/trigger bất biến đã áp dụng, không áp lại. Publish không đổi current; detail báo có phiên bản mới; profile đổi yêu cầu tạo snapshot mới. UI còn FE-T07, nghiệm thu xuyên màn T08; checklist toàn sản phẩm giữ mở. Contract backend/docs/PLANS.md; bước tiếp T08.

- [ ] Snapshot bất biến: input/lịch dòng tiền/modelVersion/assumptionVersion/allocationPolicyVersion/ngày định giá/quy ước kỳ.
- [ ] Publish chỉ đánh dấu có cập nhật hoặc tạo so sánh riêng; không tự đổi currentVersion.
- [ ] Tách preview, tạo version, áp dụng version. Thao tác áp dụng do user yêu cầu có expectedRevision/idempotency.
- [ ] Nối worker sau khi sửa semantics; retry không sinh bản trùng hoặc ghi đè sửa đổi mới của user.
- [ ] Giữ baseline/lịch sử và khả năng tính lại bản cũ; báo cáo một version không lấy giả định hiện tại trộn vào.
Nghiệm thu: publish v2 vẫn current v1; preview không đổi chính; apply đúng một lần; sửa đồng thời báo conflict; snapshot cũ tái lập.
T08 — Nối API tài chính và sửa giao diện hiện có
Phụ thuộc T06–T07. P06/P08/P14/P18/P19/P29/P32/P34. Xử lý F02/F03/F10/F11/F13/F18.

Checkpoint backend 04/10/2026: **đã bổ sung report/compare/simulate/CSV theo snapshot và whatIf cá nhân**, 215/215 tests (10 T08), 31 HTTP/DB thật rollback, typecheck/build/startup đạt; không migration. Dùng services tháng/snapshot đã đăng ký, không bật FinancialService legacy tự đổi current. API giữ cùng version/nguồn, báo thiếu/chưa áp dụng rõ. FE-T08 ghi lỗi UI đã phát hiện và cách nối; **chưa đóng T08 toàn sản phẩm** vì dashboard/goal/history/simulation/export cần AI frontend nghiệm thu. Backend tiếp T09; contract backend/docs/PLAN_PRESENTATION.md, bằng chứng PROGRESS.md. Checklist dưới giữ mở theo nghiệm thu xuyên màn.

- [ ] Đăng ký FinancialService, route USER/ADMIN/preview cần thiết, quyền/validation/ownership; OpenAPI và contract test từng API.
- [ ] Nối goal/plan/history/simulation/apply/admin; bỏ unsupported chỉ sau khi lưu server thật.
- [ ] Dashboard/goal/plan/simulation/CSV đọc cùng engine/version. Public calculator nếu giữ dùng cùng mô hình hoặc tách rõ minh họa.
- [ ] Hiển thị riêng tiền dư, mức đang đóng, mức cần đóng và tăng thêm; tài sản ròng khác vốn hưu trí; tiền hôm nay khác tương lai.
- [ ] Bỏ số mẫu ghi đè số 0, tỷ lệ/nhãn tốt không có căn cứ. Chưa đủ dữ liệu/cấu hình có trạng thái rõ thay vì bộ số giả hợp lệ.
- [ ] Lỗi mạng/conflict giữ form, chỉ báo lưu sau API thành công; reload/đăng nhập lại giữ dữ liệu. Hiển thị đúng thời điểm góp/chính sách tiền dư đã lưu và tách giả định mô phỏng với actual.
Nghiệm thu: một hồ sơ xuyên dashboard → goal → plan → simulation → apply → reload khớp số/version; USER không truy cập dữ liệu người khác/admin; thiếu cấu hình không fallback số mẫu.
T09 — Ghi thực tế và dự báo phần còn lại

Checkpoint backend 05/10/2026: **đã có sổ tháng/histories/revision/idempotency, đối soát và reforecast theo snapshot**; 226 tests, 16 HTTP/DB thật rollback, 3 ca cạnh tranh, typecheck/build/startup đạt. Migration 0007 đã áp dụng (7/7 checksum, diff rỗng), không áp lại. Không coi tiền dư là tiền thực nộp; không lặp actual one-off hoặc ghi đè baseline. Contract backend/docs/MONTHLY_ACTUALS.md, UI FE-T09 đã giao riêng. **Checklist dưới vẫn mở cho nghiệm thu toàn sản phẩm/Q15**, backend tiếp T10. Chưa tự suy lịch tất toán/bán tài sản từ bút toán, chưa lưu reforecast thành version mới.

Phụ thuộc T07–T08. P15/P33/P34, xử lý F12; thực hiện phần bổ sung Q15-01–04 theo quyết định05/10 ở mục5.
- [ ] Sổ tháng: thu/chi/trả nợ/nộp/rút/thu đầu tư/phí/biến động giá/số dư cuối; revision/lịch sử và chống trùng tháng/giao dịch.
- [ ] Chuyển nội bộ không là tiết kiệm mới; lãi tái đầu tư không vừa thành nộp tiền vừa thành lợi nhuận.
- [ ] Ba trạng thái thu–chi; tách tiền dư với tiền thực nộp quỹ.
- [ ] Đối soát đầu kỳ+nộp−rút+lợi nhuận−phí với cuối kỳ theo quy ước; không cộng lại chi/thu đã nằm trong giao dịch quỹ. Chênh lệch phải giải thích.
- [ ] Dùng cuối tháng thực tế làm điểm đầu dự báo còn lại, giữ baseline; khoản một lần không lan mọi tháng sau.
- [ ] Triển khai Q15-01–04 theo chính sách ghi nhận ở mục5: cập nhật dự báo/lưu version từ actual, không ghi đè quá khứ hoặc tự áp dụng version mới.
Nghiệm thu: dư/bằng/thiếu, chuyển nội bộ, lãi âm, sửa tháng cũ, thiếu tháng, khoản bất thường; actual khác forecast; không tự tăng quỹ chỉ vì thu vượt chi.
T10 — AI giải thích và quản trị dữ liệu

Cập nhật mới05/10/2026: user chốt Gemini. Backend đã nối adapter và lưu key trong env riêng; developer/gemini-3.8-flash smoke thật bằng dữ liệu mẫu đạt. Full290tests/25files, typecheck, build riêng/startup đạt. Consent `ai-explanation-gemini-2026-10-v2` bắt buộc xác nhận lại trước outbound; privacy trả provider/processingNotice/reconsentRequired. Không migration, không fine-tuning; kho tri thức duyệt được đưa vào context. UI FE-GEMINI giao riêng, còn browser/quota/retention/backup/P36. Contract backend/docs/GEMINI.md. Checkpoint chuẩn bị không-provider ngay dưới là lịch sử, không còn chờ chọn dịch vụ.

Checkpoint backend 05/10/2026: **đã hoàn thành phần chuẩn bị backend độc lập nhà cung cấp theo lựa chọn user “Chưa chọn; chuẩn bị backend trước”**. Context từ snapshot/actual, facts server, fallback, mô phỏng qua engine/không apply, knowledge có index/approval/effective dates, consent/history/expiry/export/correction/delete. 241 tests,21 HTTP/DB rollback,3 concurrency,typecheck/build/startup đạt; migration 0008 đã áp dụng (8/8 checksum,diff rỗng). FE-T10 giao AI frontend, contract backend/docs/AI_GOVERNANCE.md. **Checklist dưới giữ mở cho nghiệm thu toàn sản phẩm/provider thật và rà P36/pháp lý trước phát hành**, không coi stub/fallback là AI ngoài đã chạy. Backend tiếp T11.

Phụ thuộc T07–T09. P31/P35/P36. Xử lý F14.
- [ ] Context tối thiểu từ kết quả server: version/số cần giải thích/giả định/cảnh báo/nguồn; không gửi toàn hồ sơ hay định danh không cần thiết.
- [ ] AI không có quyền sửa công thức/tỷ lệ/input/kế hoạch. Câu hỏi “nếu” chạy qua engine; áp dụng là thao tác user riêng.
- [ ] Chỉ tri thức được duyệt/có hiệu lực/đã index; nội dung tài liệu là dữ liệu, không là chỉ thị cho AI.
- [ ] Mục đích xử lý, cơ chế đồng ý khi cần, thời hạn lưu, quyền truy cập/chỉnh sửa/xóa áp dụng cả hội thoại/context; rà thực thi theo P36/văn bản hiện hành trước phát hành [S08].
- [ ] Thiếu dữ liệu nói rõ thiếu; không tự tạo tỷ trọng/lợi suất/cam kết; dịch vụ AI lỗi không làm mất kết quả engine.
Nghiệm thu: lời giải thích khớp version; prompt yêu cầu ghi đè không thực hiện; context không thừa định danh; nguồn chưa duyệt không dùng; kiểm thử quyền và xóa dữ liệu.
T11 — Hoàn thiện module hiện có và nội dung
Checkpoint05/10: backend đạt; contract `backend/docs/SECONDARY_MODULES.md`, migration0009 đã áp dụng;26DBchecks+2racesPASS. UI đã ghi FE-T11, chưa nghiệm thu toàn sản phẩm.
Phụ thuộc T00/T08; không mở phạm vi sản phẩm mới. Xử lý F17/F18/F20.
- [x] Backend: rà user admin/content/bookmark/support/notification/operations trên DB thật được user cho phép, fixture rollback; revision/ownership, lỗi schema503, trùng slug409 đã kiểm.
- [ ] Nối đối tác/sản phẩm/cài đặt thông báo theo tài khoản/báo cáo API; không báo lưu khi mới đổi state. Giữ điều kiện/phí/rủi ro/disclosure.
- [x] Backend: ngừng route/producer tư vấn chuyên viên, HTTP410 sau auth/role; giữ lịch sử dữ liệu và Support; OpenAPI cập nhật.
- [ ] Báo cáo ghi version/ngày định giá/giả định/thiếu dữ liệu, số từ engine; loại tính lại tại trình duyệt.
- [ ] Sửa lỗi tiếng Việt “đ được”, “th cận”, nhãn tiến độ/thu–chi/thực-danh nghĩa; rà 390/768/1024/1440px, bàn phím/focus/tương phản/reduced motion theo design system.
- [ ] Kiểm tra tác động bundle/loading trước khi tối ưu; không bỏ chức năng hoặc giảm validation.
- [ ] Đồng bộ info.md, backend/IMPLEMENTATION_PLAN.md, backend/PROGRESS.md, SESSION_HANDOFF khi triển khai: bỏ chờ khảo sát lỗi thời, giữ lịch sử checkpoint và chỉ rõ quyết định thay thế.
Nghiệm thu: không mất luồng có sẵn; dữ liệu qua reload/thiết bị khác; không hồi sinh tư vấn chuyên viên; không thành công giả khi lỗi mạng; nội dung đúng trạng thái thật.
T12 — Nghiệm thu toàn luồng và phát hành

Cập nhật05/10 sau Gemini:295backendtests/26files +7retentionDBchecks rollback đạt; DB thực chỉ chạy CLI dry-run, không xóa thật. Đã bổ sung tác vụ retention độc lập SMTP và diễn tập pg_dump/restore35bảng dữ liệu mẫu, cleanup sau restore; clean10/upgrade4→10 +10integration vẫn đạt. Contract backend/docs/RETENTION_OPERATIONS.md. Không thay nghiệm thu scheduler/backup production/P36/browser.
- [x] Backend: tác vụ retention chỉ cần DB, mặc định chỉ đọc, thực thi theo lô có giới hạn/rollback/dừng/log an toàn; kiểm trên ID mẫu và CLI thật.
- [x] Backend: diễn tập pg_dump/pg_restore trên DB tạm, đối chiếu35bảng và xóa expired sau restore bằng executable production.
- [ ] Vận hành: triển khai scheduler/giám sát retention, backup mã hóa/thời hạn lưu/restore thật; đối chiếu yêu cầu xóa/thu hồi sau backup trước mở DB phục hồi. Chưa có sổ xóa độc lập để xử lý hội thoại còn hạn đã xóa sau backup.
Checkpoint05/10: **nghiệm thu nội bộ một phần, chưa phát hành**.18HTTP/DBchecks xuyên luồngPASS;246backendtests,25frontendtests/typechecksPASS; frontendbuildPASS,backendPrisma generation riêng+tscPASS nhưng build mặc định bịDLL đang dùng; browser7/8,1selectorFAIL. Matrix và blocker cụ thể: `docs/T12-acceptance.md`.
Phụ thuộc T00–T11 và các việc bổ sung ở mục7.1; P13/P15 đã chốt hướng, chỉ ký nghiệm thu sau khi đúng chính sách và các ca bổ sung đạt.
- [x] Có mẫu đối chiếu P01–P36 với input/expected/actual/model/assumption/evidence tại `docs/T12-acceptance.md`; nêu rõ partial/deferred/Q13/Q15, không thay biên bản khách ký.
- [ ] Typecheck nguồn/test, backend/frontend tests phù hợp, build; contract API tài chính mới, không chỉ health/auth.
- [ ] DB integration cô lập và browser nối DB test: onboarding → goal → plan → đổi giả định → preview → apply → thực tế → dự báo mới → export.
- [ ] USER/ADMIN/ownership, sửa đồng thời/retry/mất backend/nhiều tab/phiên hết hạn/xóa dữ liệu/lịch sử bất biến.
- [ ] Staging/nhà cung cấp thật theo cấu hình và ủy quyền vận hành: phân biệt email queued/accepted/delivered; kiểm chứng Google/Cloudinary/AI/Azure/backup-khôi phục. Mock không là bằng chứng dịch vụ thật.
- [ ] Đóng F01–F22 bằng bằng chứng; phát hiện mới thêm chủ việc/tiêu chí. Không đánh dấu đạt khi còn lỗi chặn hoặc đầu vào bắt buộc chưa đủ.
Điều kiện hoàn tất: nghiệp vụ đã chốt đạt ca kiểm tra, gồm Q13-01–03/Q15-01–04; không còn lỗi chặn; triển khai/khôi phục được kiểm chứng. Nghiệm thu nội bộ khác biên bản khách ký và trạng thái phát hành.
7.1. Kế hoạch bổ sung P13/P15 sau khi khách chốt — 05/10/2026

Phạm vi: tiếp tục T06–T09 và nghiệm thu T12, không khởi động lại T00–T12. Backend làm trước, UI giao qua `docs/task-frontend.md` mục FE-P13-P15. Model v3 hỗ trợ đầu/cuối kỳ, giữ replay lịch sử; có preview/lưu/apply reforecast và điều chỉnh tổng tháng. Q15-03 nay có thêm sourceChanges cho tất toán hoàn toàn khoản vay, tài sản đã vào quỹ, lịch hưu và từng nguồn thu/chi. Contract [CONTRIBUTIONS_REFORECAST.md](../backend/docs/CONTRIBUTIONS_REFORECAST.md), [SOURCE_REFORECAST.md](../backend/docs/SOURCE_REFORECAST.md). Không cần migration mới. Checkbox có cả UI chỉ đóng sau browser; chưa tái cơ cấu/trả một phần hợp đồng hay tạo nguồn hoàn toàn mới trong reforecast.

Đã kiểm mới nhất:273tests/24files,17HTTP/DB rollback cho điều chỉnh nguồn; typecheck/build riêng/startup đạt. Đợt trước có22HTTP/DB và3cuộc đua transaction độc lập đạt; không cộng số lượt thành một suite. Dữ liệu fixture đã hoàn tác/dọn. Còn UI/browser và các hạng mục vận hành bên dưới; sourceChanges không mở mọi trường hợp tái cơ cấu hợp đồng hay thêm nguồn mới. Không coi P13/P15 toàn sản phẩm đã nghiệm thu.

| Việc | Chủ việc | Phụ thuộc | Kết quả cần có |
| --- | --- | --- | --- |
| Q13-01 | Backend | T06, chính sách mục5 | Contract góp đầu/cuối kỳ, quy tắc khả dụng tiền và thời điểm hiệu lực |
| Q13-02 | Backend | Q13-01, T07–T08 | Engine/solver/snapshot/report hỗ trợ hai thời điểm, replay bản cũ không đổi |
| Q13-03 | Backend + AI frontend | Q13-02 | Golden tests, HTTP/DB và UI so sánh/áp dụng đúng thời điểm |
| Q15-01 | Backend | T06/T09, xác nhận chính sách mục5 | EXPLICIT_DEPOSITS_ONLY chính thức; phân biệt dư, góp dự kiến, góp thực |
| Q15-02 | Backend | Q15-01, T07–T09 | Lưu dự báo từ actual thành version mới, kiểm revision/hash và apply riêng |
| Q15-03 | Backend + AI frontend | Q15-02 | Thu/chi một lần hoặc định kỳ tương lai do user chọn, so sánh trước áp dụng |
| Q15-04 | Backend + AI frontend | Q13-03, Q15-03, sửa FE-RECHECK | Nghiệm thu toàn luồng và bàn giao vận hành, cập nhật P13/P15/P34 |

Q13-01 — Contract và quy ước kỳ (T06)

- [x] Mở enum sản phẩm `contributionTiming = END_OF_MONTH | START_OF_MONTH` cho phần góp tích lũy; field thiếu ở request tương thích cũ được chuẩn hóa END_OF_MONTH trước hash. Ghi rõ khác với START_OF_MONTH_RESEARCH nội bộ. Đầu/cuối kỳ là tháng, không hứa tính lợi nhuận theo từng ngày giao dịch.
- [ ] Giữ cuối kỳ làm mặc định kế hoạch mới theo P12; UI cho chọn và giải thích, không chọn đầu kỳ ngầm. Xác định nguồn tiền khả dụng đầu tháng bằng dữ liệu/giả định người dùng xác nhận. Không dùng thu cuối tháng hoặc tiền bán tài sản cuối tháng để tài trợ khoản đầu tháng; thiếu đầu vào đầu kỳ thì trả issue có đường dẫn, không đoán0 hoặc đếm lại tài sản đã nằm trong vốn quỹ.
- [x] Chọn đầu kỳ từ tháng đầy đủ tiếp theo nếu ngày định giá nằm giữa tháng; không giả vờ đã góp trước ngày định giá. Đưa lịch hiệu lực vào input chuẩn hóa để số kỳ và nhãn minh bạch. Không đổi lịch rút, giải phóng vốn, nợ hoặc khoản góp từ dư sau hưu (vẫn cuối kỳ).
- [x] Bổ sung schema/OpenAPI, input chuẩn hóa và errors/warnings; xác định trường có thể giữ trong snapshot JSON hiện có. Chỉ thêm migration nếu thiết kế cần cột/index/constraint mới, kiểm DB sạch/nâng cấp và không sửa0010 hoặc migration đã chạy.

Q13-02 — Engine, phiên bản và đầu ra (T06–T08)

- [x] Với tháng tích lũy đủ điều kiện: cuối kỳ `B = P*g + c + dòng cuối kỳ`; đầu kỳ `B = (P+c)*g + dòng cuối kỳ`. Chỉ khoản góp đầu kỳ có thêm tác động hệ số tháng; vốn đầu không nhân thêm. Lãi âm có thể làm đầu kỳ thấp hơn cuối kỳ, không ghi “đầu kỳ luôn tốt hơn”.
- [x] Solver mức góp/mức tăng thêm, giới hạn khả năng góp và tháng thiếu tiền phải cùng quy ước; chuỗi tỷ suất dùng từng tháng, không nhân toàn kết quả bằng một hệ số cuối. Tách góp tích lũy với góp sau hưu và khoản giải phóng tài sản.
- [x] Pin contributionTiming, lịch hiệu lực, chính sách và model/snapshot format vào version/inputHash. Đổi lựa chọn chỉ tạo preview/version mới; giữ baseline/current tới khi apply có xác nhận. Đọc/replay snapshot cũ theo semantics cũ, không ghi lại hash hoặc backfill lựa chọn đầu kỳ.
- [x] Report/compare/simulation/CSV và facts giải thích AI lấy cùng metadata từ version. Nếu thay semantics thì đăng ký model/format mới cùng dispatcher đọc cũ; không chỉ đổi tên hằng số khiến snapshot cũ không replay được.

Q13-03 — Kiểm chứng đầu/cuối kỳ (T12)

- [x] Oracle độc lập: P=0,c=1.000.000,i=1%/tháng,n=12 → cuối kỳ xấp xỉ12.682.503, đầu kỳ12.809.328, chênh126.825 đồng sau làm tròn để hiển thị. Tiền/lãi là dữ liệu kiểm thử, không cấu hình lợi suất production.
- [x] Kiểm P khác0, i=0, lãi âm hợp lệ, n=1/n=0, tỷ suất đổi từng tháng, lịch góp có tháng0, khả dụng đầu kỳ thiếu, ngày định giá giữa tháng, tháng đầu nghỉ hưu và thu/bán tài sản cuối tháng. Oracle đối chiếu cả từng dòng lẫn tổng, không lấy chính hàm engine làm expected.
- [ ] HTTP/DB: inputHash khác khi đổi timing, retry không tạo trùng, profile/plan revision cũ trả conflict, owner/ADMIN đúng quyền, old-version replay không đổi. Browser: chọn→preview→save→apply→reload→CSV cùng timing và cùng kết quả.

Q15-01 — Chính sách tiền dư và sổ thực tế (T06/T09)

- [x] Chuyển mô tả “Q15 chưa chốt” trong contract/metadata mới thành EXPLICIT_DEPOSITS_ONLY đã chốt. Hành vi hiện có giữ: dự kiến chỉ góp theo lịch đã xác nhận và khả năng góp; actual chỉ tính CONTRIBUTION đã ghi nhận. Nhãn cũ trong snapshot lịch sử được giải thích tương thích, không sửa dữ liệu/hash lịch sử.
- [x] Trả riêng `householdSurplus`, plannedContribution, contribution sau giới hạn, uninvestedSurplus và actualContribution. Muốn góp thêm từ vốn ngoài thu–chi phải khai nguồn riêng, không tự cho góp vượt khả năng rồi xóa cảnh báo.
- [x] Case thu12/chi20: thiếu8; thu20/chi20: cân bằng; thu25/chi20: dư5. Góp0/2/5 lần lượt giữ ngoài quỹ5/3/0. Góp dự kiến6 khi chỉ có5 phải hiện giới hạn/thiếu1, không báo đủ6. Khoản rút quỹ không cộng thành thu hộ gia đình, lãi tái đầu tư không đồng thời cộng vào CONTRIBUTION.
- [ ] Thu–chi actual không tự sinh WITHDRAWAL/CONTRIBUTION để ép số dư khớp. Nếu quỹ thực không đủ bù thiếu8 thì ghi nhu cầu chưa tài trợ, không tạo giao dịch âm hoặc coi đã chi trả đủ.

Q15-02 — Lưu dự báo cập nhật từ actual (T07–T09)

- [x] Tách rõ đọc reforecast, lưu candidate version và apply. Không đổi endpoint reforecast hiện có từ chỉ đọc thành thao tác ghi ngầm. Định nghĩa command mới với sourcePlanId/sourceVersionId, throughMonth, revision kế hoạch/hồ sơ liên quan, tập actual revisions và expected calculation/input hash; ghi cần Idempotency-Key.
- [x] Server tự đọc/đối soát lại trong transaction: đủ tháng đã đóng, MATCHED, chuỗi opening/closing khớp, source version thuộc user và integrity hợp lệ. Không nhận số dư/kết quả client làm anchor đáng tin. Actual hoặc đầu vào thay đổi sau preview →409 yêu cầu xem lại; không lưu kết quả cũ.
- [x] Candidate giữ nguồn/baseline/version gốc, anchor tháng và số dư actual, tập actual revision, input tương lai, assumptions/policy/model/hash, nguồn tạo ACTUAL_REFORECAST. Lưu snapshot đủ để replay cả sau khi user sửa actual; bổ sung schema storage/format nếu cần thay vì nhét reforecast vào preview schema cũ không tương thích.
- [x] Tái dự báo từ candidate dùng đúng anchor/cutoff, không chạy lại tháng đã khóa hoặc góp/rút hai lần. Khi actual nguồn bị sửa, giữ version đã lưu bất biến nhưng hiển thị nguồn actual đã thay đổi và yêu cầu tạo candidate mới trước apply tiếp; kiểm lại revisions tại thời điểm apply.
- [x] Apply riêng có confirm/revision/idempotency, current đổi đúng một lần; baseline và actual history giữ nguyên. HORIZON_COMPLETE không tạo phiên bản rỗng. Report/CSV/AI context phân biệt ORIGINAL_FORECAST, ACTUAL và REFORECAST, ghi originalRetirementMonth cùng ngày bắt đầu phần dự báo còn lại.

Q15-03 — Thu/chi thay đổi và phạm vi tương lai (T08–T09)

Backend đã có sourceChanges: giữ sourceId và document xác nhận; DEBT_SETTLED/ASSET_REALIZED liên kết event actual đúng loại, bỏ đúng dòng tương lai; PENSION_REPLACE/FLOW_REPLACE thay số danh nghĩa theo khoảng. Không cho chồng khoảng, reuse ID/event hoặc trộn sửa nguồn với sửa tổng cùng trường/tháng. Snapshot/CSV/compare giữ lịch sử nguồn, không sửa hồ sơ toàn tài khoản. 273tests/24files và typecheck/build riêng/startup đạt; kiểm DB mới ghi ở PROGRESS.md. UI xem FE-Q15-03 cuối task-frontend.md.

- [ ] Một lần chỉ thuộc tháng actual đã nhập; không sao chép vào tất cả tháng sau. UI đề nghị điều chỉnh tương lai riêng, mặc định không suy thay đổi định kỳ từ một tháng chênh lệch.
- [x] Backend: định kỳ khai nguồn/dòng liên kết, số tiền, tháng bắt đầu sau cutoff actual và tháng kết thúc/horizon; thay dòng cũ, không cộng trùng. Giá trị0 là chủ động ngừng/không thu, khác chưa biết. Backend tính lại theo dữ liệu này, không cho sửa tỷ suất/CPI hệ thống. UI lựa chọn/hiển thị vẫn chờ nghiệm thu.
- [x] Preview thể hiện trước/sau về số dư, mức góp, tháng thiếu và quỹ cần; lưu cùng candidate Q15-02 và apply riêng. Không tự sửa hồ sơ toàn tài khoản từ thao tác mô phỏng; thay đổi hồ sơ có luồng riêng và revision riêng.
- [x] Tất toán toàn bộ nghĩa vụ nợ/tài sản đã vào quỹ/thay lương hưu dùng nguồn tương ứng và kiểm chống trùng, không suy từ một bút toán thu/chi. Thiếu hợp đồng/giao dịch/xác nhận hoặc xung đột với tổng đã sửa trả lỗi yêu cầu rà soát. Phạm vi hỗ trợ và giới hạn tại SOURCE_REFORECAST.md; không nhận tái cơ cấu/trả một phần như tất toán.

Q15-04 — Nghiệm thu và đồng bộ bàn giao (T12)

- [x] Golden fixtures cho ba trạng thái, góp0/một phần/toàn bộ/xin vượt dư, số tiền lớn/cent, nội bộ/lãi/fee; actual khác forecast không bị ép khớp. Có case cần bổ sung vốn sớm dù tổng cuối kỳ dương.
- [x] HTTP/PostgreSQL: snapshot từ actual giữ đủ nguồn; retry hai request cùng key chỉ một version; hai request cùng revision chỉ một thắng; actual sửa trước save/trong apply gây conflict; actual sửa sau save không đổi snapshot; owner/ADMIN và rollback/cleanup đạt. Không reset DB đang dùng.
- [ ] Browser nối API: nhập tháng → đối soát → xem dự báo → chọn góp từ dư → khai điều chỉnh một lần/định kỳ → lưu → so sánh → apply → reload/export. Kiểm lỗi mạng/409 giữ form, đổi account không lộ state, không báo thành công khi applyfalse. Sửa FE-RECHECK transport/precision trước khi dùng browser làm bằng chứng.
- [x] Đồng bộ contracts RETIREMENT_MONTHLY/PLANS/PLAN_PRESENTATION/MONTHLY_ACTUALS/AI_GOVERNANCE, OpenAPI và `task-frontend.md`; bổ sung ca P13/P15/P19/P23/P33/P34 vào T12-acceptance. Ghi rõ phần đã chạy, chưa chạy, bản model và expected/actual.

Thứ tự triển khai: chốt schema/version chung Q13-01 + Q15-01 → Q13-02 + Q15-02 → Q15-03 → Q13-03 + Q15-04. “+” là cùng đợt thay đổi liên quan, không yêu cầu tạo agent hoặc làm đồng thời. AI frontend sửa blocker FE-RECHECK và nhận contract sau khi backend kiểm chứng. Kết thúc khi đạt evidence mới; không đánh dấu hoàn thành vì chỉ cập nhật tài liệu hôm nay.

Các phần độc lập vẫn còn theo kế hoạch hiện hành: frontend T06–T12/F26–F29 và browser; build mặc định đang khóa DLL; worker retention/backup và P36; staging/nhà cung cấp. Gemini đã được user chọn và smoke backend đạt05/10; UI FE-GEMINI và vận hành vẫn cần nghiệm thu riêng, không dùng kết quả này để đóng P13/P15 toàn sản phẩm.

8. Nguồn nghiên cứu cho quyết định triển khai
Tra cứu 03/10/2026; không dùng số minh họa/dự báo như bảo đảm lợi nhuận.
- S01 — CFPB: DTI: mẫu số thu nhập trước thuế; ngưỡng 30/50 trong sản phẩm lấy từ khách.
- S02 — Microsoft: FV: đầu/cuối kỳ và rate/nper.
- S03 — IMF WEO: version và thời hạn dữ liệu/dự báo; chưa lấy tỷ lệ cụ thể cho production.
- S04 — TACA: bài khách gửi: tham khảo cách tiếp cận; không sao chép tỷ trọng/đòn bẩy làm mặc định.
- S05 — SEC Investor.gov: phân bổ tài sản: thời hạn và khả năng chịu rủi ro.
- S06 — BHXH Việt Nam: chính sách hưu trí: có trường hợp nam từ 15 đến dưới 20 năm, không áp một công thức demo chung.
- S07 — Nghị định 135/2020/NĐ-CP: khi triển khai phải đối chiếu bảng/phụ lục, không chỉ chép bài tóm tắt.
- S08 — Công báo về Nghị định 356/2025/NĐ-CP, bản ký: nguồn rà soát P36; kế hoạch không phải kết luận đã tuân thủ pháp luật.
9. Cách tiếp tục và cập nhật
Thứ tự ban đầu là T00 rồi T01; các checkpoint hiện hành thay hướng dẫn bắt đầu cũ. Kế hoạch mở rộng mới ở mục10 bắt đầu T13-01/T13-02 sau khi nhận yêu cầu triển khai. Không chạy lại 14 phase thiết kế cũ.
- Trước sửa: xem diff, đọc hướng dẫn thư mục, xác định phụ thuộc; không ghi đè công việc người khác.
- Sau mỗi việc: ghi file/hành vi thay đổi, lệnh/kết quả thực, ca chưa đạt, bước tiếp; cập nhật F và P tương ứng.
- Chỉ [x] khi có bằng chứng của việc đó; đã chốt phương án không tự đồng nghĩa đã code xong.
- P13/P15 đã được chủ dự án xác nhận hướng xử lý ngày05/10, tiền dư chỉ góp số người dùng xác nhận; tiếp theo thực hiện mục7.1. Không hỏi lại lựa chọn đã chốt hoặc mở lại các P khác. Vướng môi trường/kỹ thuật/dữ liệu vận hành nằm trong các task.


10. Kế hoạch sau nghiên cứu — T13–T17 (05/10/2026)

Trạng thái05/10: **T13-01/02 xong; T13-03 core đã có, publicv4 còn nối; T14-02 backend đã có; T14-01 đang bổ sung engine/mẫu pháp lý**. Migration0011 ba bảng đã áp dụng, API history/legal-rules có trong production OpenAPI. Chưa có estimateBHXH, loanrevision hoặc publicv4. Chi tiết [checkpoint](../backend/PROGRESS.md) và [contract](../backend/docs/INSURANCE_HISTORY_RULES.md). [Ma trận luật](../backend/docs/LEGAL_RULE_MATRIX.md), [ADR](../backend/docs/ADR-001-EXPANSION.md), [nghiên cứu/fixtures](research-bhxh-no-nguon-moi.md); P13/P15 giữ nguyên.

- [x] Nghiên cứu nguồn chính thức và đối chiếu backend hiện có; ghi riêng bản scan/điều khoản cần rà thêm trước code.
- [x] Lập dữ liệu/API/version/migration dự kiến, phụ thuộc, coverage BHXH và tiêu chí nghiệm thu; giao phần UI qua FE-EXPANSION-T13-T17.

T13 — Nền tảng quy tắc và phiên bản nguồn
Phụ thuộc nền T05/T07–T09; không thay nghiệp vụ đang chạy chỉ để chuẩn bị.

**Checkpoint runtime05/10 v4 (mới hơn các ghi chú “core/internal”):** T13-03 đã nối public preview/save/read/replay/apply/report/compare/CSV/AI qua `plans/{id}/source-reforecasts`; actual forecast nhận v4. Nâng v3 no-op và giữ replay cũ; lưu toàn bộ source/evidence vào snapshot. T16-01 có CREATE/REVISE/END thu/chi/pension và sửa tiếp cùng cutoff, không ghi profile. T14-06 đã nối estimate vào candidate với kiểm stale và replay bất biến, không góp trợ cấp. Contract [SOURCE_COMMANDS_V4.md](../backend/docs/SOURCE_COMMANDS_V4.md); UI FE-T16-SOURCE-V4. Checkboxes vẫn mở vì PostgreSQL/race và nghiệm thu xuyên luồng chưa đủ; DB verifier mới bị automatic approval review chặn do hết hạn mức, lệnh chưa chạy. T15/T16-02 và các nhánh BHXH còn thiếu không bị thu hẹp phạm vi.
- [x] T13-01: ma trận nhóm/ngày/điều khoản tại LEGAL_RULE_MATRIX.md; R04/R06/R11 đã đọc bản ký và lưu hash. Rà NĐ158 Điều44 giữ bảng tuổi I–II, tách tháng hưởng sang assessment; luật vay thêm TT29 Điều4/10. Các nhánh BH2–BH4 và R12 hướng dẫn điều chỉnh vẫn cần fixtures/rà khi triển khai T14, chưa publish luật tự tính.
- [x] T13-02: ADR-001/ERD/OpenAPI thiết kế cho rule-set/history/estimate/registry/loan revision; chốt3bảng mới, registry plan-scoped JSONB, constraints/CAS/hash/ownership/migration. Spec thiết kế hợp lệ, không ghép vào API production; response financial v4 hoàn thiện tại T13-03. Chưa tạo bảng/migration.
- [ ] T13-03: **core và public v4 đã nối**: composer từ profile/legacy changes, registry hash/revision/evidence/knownOn, preview/save/read/replay/apply/report/CSV/AI và actual forecast. Snapshot v2/v3 giữ nguyên; nâng v3 no-op đã kiểm. HTTP/DB và 3 race nguồn chung đã đạt; còn nghiệm thu xuyên các nhánh mở rộng theo T17, không còn chờ nối public API. Chi tiết SOURCE_COMMANDS_V4.md và PROGRESS.md.
Nghiệm thu: no-op/replay cũ khớp, tổng nguồn bằng tổng tháng, luật thiếu không publish, hợp đồng cũ còn đọc được.

T14 — BHXH tự tính có căn cứ (P26–P29)

**Checkpoint07/10 đóng trước đã nối:** API engine `vn-pension-voluntary-prepaid-v1` cho kỳ3/6/12/24/36/48/60, metadata thanh toán/yêu cầu riêng; chỉ tính tháng đến cutoff, không mua quyền hưởng ngay bằng tháng tương lai. PAID khớp được đếm1lần, xung đột bị chặn; hoàn phần còn lại giữ chỉ số chiết khấu gốc/trừ số hỗ trợ đối soát, thiếuM→refundnull nhưng không chặn lương hưu độc lập. Không tự ghi quỹ/nhận tiền. Corpus6draft/12sources, prepaid1.148dòng/23ca; full558tests/48files, typechecks+emit và18HTTP/DBrollback41bảng đạt. UI FE-T14-PREPAID, [contract](../backend/docs/VOLUNTARY_PAYMENTS.md). T14 vẫn mở cho chuyển tiếp/CREDITED/đặc thù/năm khác và trả bù sớm theoLuật36(3)(e); toàn bộT15–T17/vận hành giữ nguyên phạm vi.

**Checkpoint07/10 đóng bù đã nối:** engine `vn-pension-voluntary-top-up-v1`, metadata thanh toán riêng,120–179tháng định kỳ+1–60bù→180, hệ số bù1 và tháng hưởng sau đóng đủ. Thu nhập/lãi theo ngày/năm đóng, bình quân theo năm hưởng; không giả PAIDmonths hoặc tự cộng tiền quỹ. Corpus5draft/12nguồn, bộ bù1.148dòng/17ca; chưa công bố thật. Full544tests/47files, test/source typecheck+emit đạt;18HTTP/DB checks rollback41bảng đạt. [Contract](../backend/docs/VOLUNTARY_PAYMENTS.md), UI FE-T14-TOP-UP. Checkpoint nội bộ dưới đây được thay cho riêng đóng bù; đóng trước/hoàn trả/chuyển tiếp/CREDITED/đặc thù và toàn bộT15–T17/vận hành còn tiếp tục, T14 chưa đóng.


**Checkpoint07/10 BH3 nội bộ:** đã lưu/xem bản ký CV151/BHXH-ĐTQ, lãi quỹ0,31%/tháng năm đóng2026; fragment bảng có hash/tái lập riêng. Có hàm Decimal đóng trước2–5năm, đóng bù1–60tháng đủ180, hoàn trả phần còn lại và11tests đạt;29payments+corpus trước guardcuối đạt. **Chưa API/estimate/DB cho nhánh này**, không đóng T14-04; còn metadata thanh toán, giới hạn thu nhập/hỗ trợ, điều kiện hưởng/ngày và replay theo engine mới. [VOLUNTARY_PAYMENTS.md](../backend/docs/VOLUNTARY_PAYMENTS.md), UI FE-T14-PAYMENTS-PENDING.

**Checkpoint07/10 bổ sung — Nhà nước+tự nguyện và corpus:** nhánh thông thường `vn-pension-voluntary-state-v1` đã nối API/discovery/save/read/replay/source capture; tính bình quân phần Nhà nước/bắt buộc trước ghép tự nguyện, giữ engine cũ. Corpus hiện4draft: hai bộ cũ không đổi và hai tự nguyện doanh nghiệp/Nhà nước1.146dòng,9nguồn lưu/hash; chưa phê duyệt/công bố thực tế. Full518tests/45files đạt,17HTTP/DB corpus tự nguyện-doanh nghiệp và17corpus Nhà nước-tự nguyện rollback41bảng đạt. Còn chuyển đổi trước10/2004, CREDITED/đặc thù, đóng trước/bù/chuyển tiếp và duyệt pháp lý; không đóng T14. UI FE-T14-VOLUNTARY-STATE.

**Checkpoint07/10 — tự nguyện thông thường:** engine/strategy/API `vn-pension-voluntary-v1` đã nối cho tự nguyện thuần và lịch sử bắt buộc lương doanh nghiệp, tính riêng hệ số/số tháng, ngày hưởng đủ điều kiện hoặc tiếp tục đóng, sàn đúng nhóm và trợ cấp tách riêng. Lưu/read/replay/chọn estimate vào nguồn đã kiểm; full499tests/44files và25focused sau guard citation đạt,16HTTP/DBrollback giữ41bảng. Contract [VOLUNTARY_PENSION.md](../backend/docs/VOLUNTARY_PENSION.md), UI FE-T14-VOLUNTARY. Chưa có corpus tự nguyện thật được duyệt/công bố; còn Nhà nước+tự nguyện, CREDITED, đóng trước/bù/chuyển tiếp/đặc thù. T14-04 vẫn mở; ghi chú cũ nói toàn bộ tự nguyện chưa có API được thay bởi checkpoint này.
Phạm vi là ước tính hưu trí, không toàn bộ chế độ BHXH và không là quyết định hưởng chính thức. Nhập tay mức từ cơ quan BHXH vẫn được giữ.

Checkpoint05/10: đã tạo **hai bộ nháp có nguồn thật/hash** BH1 và BH2, mỗi bộ1.127dòng; [hướng dẫn rà soát](../backend/seed-data/legal-2026/README.md).404tests đạt,29focused sau sửa cuối đạt. T14-06 có `captureForSource` và builder nội bộ estimate→pension, kiểm owner/hash/lineage, pin full capture/replay, chặn cộng trùng và vốn hóa trợ cấp; **còn public T16 và lưu evidence trong plan**, không đóng checkbox. DB kiểm mới lỗi kết nối ngay preflight, chưa có bằng chứng HTTP/DB cho corpus mới; chưa seed/công bố luật thực. UI FE-T14-CORPUS-SOURCE.
- [ ] T14-01: storage/API/lifecycle đã có05/10, authors/review độc lập/fixtures/hash/effective-overlap/immutable. Migration0011 áp dụng; đã đăng ký BH1 với9mẫu kiểm số/điều kiện và hệ số2026, **còn corpus luật thật được rà/phê duyệt và các nhánhBH2–4**. Không seedPUBLISHED hoặc dùng Gemini làm công thức.
- [x] T14-02: lịch đóng có revision/import-preview/ownedread/append CAS+idempotency; PAID/CREDITED/UNKNOWN/WITHDRAWN, unknown holes khác0, chặn trùng/ngoài khoảng/xác nhận tương lai; compositeownerFK+immutabletrigger, accountcascade. Đã kiểm23HTTP/DBrollback trước apply0011; hậu kiểm/schema đang chốt tạiPROGRESS. UI giaoFE-T14-HISTORY-RULES, không coi checkbox backend là nghiệm thu UI/raceT17.
- [ ] T14-03: **đã có engine/API BH1 nhómĐiều2(1)(a), lương doanh nghiệp,05/10**: tháng đủ điều kiện/bình quân hệ số/tỷ lệ/sàn đúng nhóm/tháng văn bản hưởng, breakdown/missingFields/citations;179tháng chưa đủ. Engine quyền lợiv2 thêm trợ cấp vượt35/30năm, tách trước/sau tuổi; giữreplayv1. **Còn hoàn thiện corpus luật thực để công bố và các ca lịch sử/tháng tính đóng**, không coi nhánh REVIEW_REQUIRED là đã làm đầy đủ.
- [ ] T14-04: BH2/BH3 theo từng nhánh: Nhà nước/hỗn hợp/tự nguyện, nghề/địa bàn/suy giảm/nhà giáo/chuyển tiếp/đóng bù/trợ cấp nghỉ hưu. **Đã nối engine/strategy/API Nhà nước-hỗn hợp thông thường05/10**, điều chỉnh hệ số/mức tham chiếu theo mốc tham gia, cửa sổ/bình quân,18validationgoldens,13HTTP/DBrollback đạt. **Còn chuyển đổi trước10/2004/nghề/phụ cấp/CREDITED, tự nguyện và các nhánh đặc thù**; chưa có corpus thựcPUBLISHED. Đối chiếu R04/R06 trước mở; không áp giảm2%/năm hoặc mức sàn cho mọi người.
- [ ] T14-05: BH4 điều ước/lực lượng đặc thù/hồ sơ lịch sử, có research và mẫu đối chiếu riêng. Nhóm chưa đủ quy tắc trả REVIEW_REQUIRED, checkbox vẫn mở; không quảng bá mọi trường hợp đã hỗ trợ.
- [ ] T14-06: **preview/save/list/ownedread PensionEstimate và chọn vào candidate nguồn pension đã nối**, pin lịch/luật/input/ngày đánh giá; kiểm CAS/hash/idempotency/stale, replay bất biến và nhãn dự kiến. Không trùng thu nhập/lịch tăng, không tự coi trợ cấp một lần là vốn góp; save/apply riêng. Còn nghiệm thu UI và xuyên các nhóm BHXH chưa hỗ trợ đầy đủ; không còn chờ nối candidate API.
Nghiệm thu: BH-G01–08 và từng coverage group trong tài liệu; legal history/coefficients được pin, profile/actual/rule thay đổi không làm replay cũ thay số. UI nối sau contract.

T15 — Trả nợ một phần và cập nhật hợp đồng (P05/P25, Q15)

Checkpoint07/10 refinance tương lai: **core nội bộ** planned-refinance-v1 đã có, giữ kỳ cũ/dư gốc, quote giả định, thứ tự cùng ngày, share/CAPPED, tách tiền bù user và vay tài trợ. Full608tests/52files; sau sửa narrow một dòng,8focused/testtypes/emit đạt. **Chưa API/registry/save/apply/DB/lifecycle**; các bước bắt buộc ở [PLANNED_REFINANCE.md](../backend/docs/PLANNED_REFINANCE.md). Tiếp cặp nguồn có sửa/hủy và đối soát khi đến hạn trước mởpublic. FE-T15-PLANNED-REFINANCE chỉ là chuẩn bị, không gọi endpoint giả. T15 giữ mở.


Checkpoint07/10 giải ngân sớm: DISBURSED_BALANCE đã hỗ trợ giải ngân trước settledOn bằng proceedsAtSettlement, tách gross/dòng tiền đã dùng/available khỏi dư gốc; proof/replay giữ cũ, không thêm actual hoặc quỹ.600tests/51files/typechecks/emit/OpenAPI,24HTTP/DBrollback41bảng đạt; FE-T15-EARLY-DISBURSEMENT. Thay giới hạn “mọi giải ngân khác ngày chưa có” trong checkpoint cũ. Refinance giả định tương lai, vay hoàn lại tiền tất toán trước đó, thứ tự sử dụng khác cùng ngày và basis hợp đồng sửa sau giải ngân còn tiếp tục; không đóng T15.


Checkpoint07/10 sửa nghĩa vụ: đã nối responsibilityAmendment và userPaidToDate cho đổi loại/trần CAPPED, giữ lũy kế khi bỏ trần/bật lại. Số chưa biết cần chứng từ, không default0; chỉ sửa lịch sau cutoff, không thêm debit/refund. Full597tests/51files, testtypecheck/sourceemit và OpenAPI đạt. Lượt cuối HTTP/DB --loan-amendment **21checks PASS, rollback41bảng**; lượt đầu21ca đạt nhưng fingerprint khác, kiểm chỉ đọc không còn fixture, nguyên nhân lượt đầu chưa rõ và được ghi trong PROGRESS. UI FE-T15-RESPONSIBILITY-AMENDMENT; T15 vẫn mở cho các nhánh refinance/hợp đồng giải ngân sửa giữa kỳ/ngân hàng và nghiệm thu.


Checkpoint07/10 DISBURSED_BALANCE: vay thay thế đã trả gốc trước cutoff đã nối API/đối soát/replay, gross giải ngân tách dư nợ cuối kỳ; CAPPED openingUserPaid và ledger actual chống dùng trùng. Full563tests, final20focused/typechecks/emit đạt;22HTTP/DBrollback41bảng đạt. Thay riêng ghi chú nhánh này còn thiếu bên dưới. Refinance tương lai/ngày giải ngân khác tất toán/hợp đồng sửa giữa kỳ và các mục nghiệm thu còn mở. UI FE-T15-DISBURSED-BALANCE.

Checkpoint07/10: thêm khoản vay mới và refinance thực tế END+CREATE atomic có đối soát giải ngân/tất toán/phí và proof snapshot; DB loan19/refinance20 ca đạt, rollback38bảng. Ghi chú chưa refinance/DB bên dưới là checkpoint cũ. Refinance tương lai, vay thay thế đã trả gốc trước cutoff, đổi nghĩa vụ CAPPED, đối chiếu ngân hàng và races/UI còn mở. Không đóng cả T15.
Backend đã có mô phỏng trả trước giảm kỳ; mở rộng phần cập nhật thực tế/reforecast, không viết lại toàn bộ engine nợ.
Checkpoint 06/10: đã nối Contractv2/lịch giữ hạn-giữ khoản trả-ngân hàng-cơ cấu/đối soát gốc-lãi-phí và chuyển basis v1 vào API nguồn preview/save/apply/replay. Có proof snapshot, ownership/CAS/idempotency/stale actual, đa khoản vay không vượt event và CAPPED carry; OpenAPI và UI `FE-T15-LOAN-V2-API`. **Refinance, kiểm PostgreSQL/races/ngân hàng/UI chưa xong**, các checkbox giữ mở. Phạm vi: [LOAN_REVISIONS_V2.md](../backend/docs/LOAN_REVISIONS_V2.md).
- [ ] T15-01: Contractv2, số dư xác nhận và allocation event gốc/lãi/phí; phạm vi toàn hợp đồng/phần người dùng rõ; rà hiệu lực pháp lý hiện hành, không suy tiền trả=tiền giảm gốc.
- [ ] T15-02: trả một phần giữ hạn/giảm tiền, giữ khoản trả/giảm hạn, lịch ngân hàng và trả giữa kỳ; lãi0, phí, lãi thả nổi, balloon có kiểm.
- [ ] T15-03: cơ cấu/ân hạn/refinance/đồng nghĩa vụ CAPPED; chấp thuận ngân hàng khác hypothetical, không vốn hóa lãi/phí ngầm. Nhánh chưa hỗ trợ trả REVIEW_REQUIRED.
- [ ] T15-04: nối revision hợp đồng/evidence vào registry/reforecast; tổng allocation không vượt event, sửa actual invalidates save/apply, replay bất biến. Không trừ quỹ thêm DEBT_PAYMENT khi WITHDRAWAL đã có.
Nghiệm thu: DN-G01–05; số gốc/lãi/phí khớp bảng độc lập, ranh giới ngày/kỳ và tiền người đồng vay không tự suy; không phát lại actual đã trong anchor.

T16 — Tạo nguồn mới trong dự báo lại (P04/P15/P23/P33/P34)

Checkpoint07/10 legacy capital: ASSET_REALIZED v3 đã được nối sang STAGED để góp tiếp cùng nguồn. Toàn bộ khoản CONTRIBUTION cũ vào priorRealized; tổng lũy kế/hạn mức/chống dùng trùng được kiểm, thuê đã dừng không tự phục hồi. Full593tests/51files,17focused/typechecks/emit và19HTTP/DBrollback41bảng đạt. UI FE-T16-LEGACY-CAPITAL. Thay ghi chú bridge chưa có trong checkpoint cũ; T16/T17 còn nghiệm thu races/cross-flow/UI, không đóng toàn bộ.


Checkpoint07/10 availability: đã bổ sung ledger tiền nhận nhiều đợt trong STAGED, hạn mức theo ngày cho actual và theo cuối tháng cho dự kiến; giữ CONFIRMED, buộc cập nhật EXPECTED đã quá cutoff, không tự cộng quỹ.588tests/50files/typechecks/emit,29HTTP/DBrollback41bảng đạt; UI FE-T16-AVAILABILITY. Thay giới hạn một availableOn ở checkpoint STAGED dưới đây. Đây là chứng từ/khai báo ngoài quỹ, không kết nối ngân hàng hoặc tự tạo nguồn vay. Các nhánh còn lại/T17/UI/vận hành vẫn mở.

Checkpoint07/10 STAGED: đã có góp một phần/nhiều đợt cùng nguồn từ tiền ròng cùng ngày sẵn có; tổng priorRealized + mới nhận + lịch tương lai = tổng xác nhận <= hạn mức. Đối soát tháng đến hạn, chống dùng trùng event và giữ anchor/replay; UI FE-T16-STAGED. Kết quả kiểm cuối xem PROGRESS. Chưa gồm nhận tiền bán/giải ngân thành nhiều đợt với hạn mức thanh khoản tăng dần; nguồn legacy ASSET_REALIZED v3 góp thêm cần bridge riêng. Các mục nghiệm thu/races/UI và toàn bộ nhánh khác vẫn mở.

Checkpoint07/10 RENT→SALE: đã nối rentalExit cùng sourceId, thuê tháng cuối xác nhận/không nhân lại tỷ lệ, dừng thuê và góp tiền bán atomic; dời bán không tự nối lại thuê, actual nhận tiền không cộng vốn lần2.575tests/49files/typechecks/emit và27HTTP/DBrollback41bảng đạt. UI FE-T16-RENTAL-SALE. Thay ghi chú RENT→SALE chưa có bên dưới; góp một phần/nhiều đợt, race/UI và các nhánh khác vẫn mở.

Checkpoint07/10 missedContribution: đã nối xác nhận toàn bộ khoản góp dự kiến chưa thực hiện và dời lịch, kiểm số/tháng/revision/chứng từ; nguồn hồ sơ, trì hoãn nhiều lần và nhận tiền sau trì hoãn đã kiểm.568tests/typechecks/emit và28HTTP/DBrollback41bảng đạt. UI FE-T16-MISSED-CONTRIBUTION. Thay ghi chú chưa xử lý toàn bộ khoản không xảy ra bên dưới; góp một phần/nhiều đợt, RENT→SALE, nghiệm thu/races/UI vẫn mở.

Checkpoint07/10: T16-02 đã nối vay mới và assetCommands CREATE/REVISE/END cho tài sản bán/vốn thanh khoản; net/ownership/phần hưu/số góp xác nhận, lịch một lần cuối tháng và actual CONTRIBUTION chống cộng trùng. DB assets20ca đạt rollback41bảng; full465tests+9assetfocused đạt. [Contract](../backend/docs/ASSET_SOURCES_V4.md), UI FE-T16-ASSET-CAPITAL. RENT→SALE, nhiều đợt góp và xử lý dự kiến không xảy ra còn cần bổ sung; chưa đóng checkbox nghiệm thu/races/UI.
- [ ] T16-01: CREATE/REVISE/END thu/chi/pension có sourceId/revision, interval, provenance, one-off/recurring; nguồn plan-scoped không ghi hồ sơ tài khoản ngầm; version sau chỉnh được nguồn version trước.
- [ ] T16-02: tài sản/nguồn vốn/khoản vay mới, kiểm sở hữu/thanh khoản/net/phí/thuế/phần hưu và khoản góp xác nhận; phát sinh trước cutoff cần evidence/actual, không tự sửa anchor; vay mới không là thu nhập.
- [ ] T16-03: report/CSV/compare/AI có attribution theo nguồn, nominal/today và hypothetical/realized; reject overlap sửa nguồn/thay tổng tháng; nếu có promote về profile thì thao tác riêng có CAS/preview.
Nghiệm thu: SRC-G01–05; chỉ góp số xác nhận, không cộng lại tiền bán đã trong actual, không dùng vốn cuối tháng cho góp đầu tháng, không FX ngầm.

T17 — Nghiệm thu phần mở rộng

Checkpoint07/10 BHXH races: `scripts/verify-pension-races-db.cjs` trên PostgreSQL Docker tạm (luật PUBLISHED không xóa được nên không commit lên DB thật) đạt6race hai PID độc lập: estimate cùng key, nguồn chọn estimate cùng revision, apply/lưu nguồn/lưu estimate cạnh thêm lịch đóng, hai append cùng revision. Bản ghim lịch đóng cũ luôn bị chặn apply; replay giữ nguyên. Không phải HTTP/browser.
Checkpoint07/10 mixed races: `--loan-assets` đạt3races độc lập (hai PostgreSQL PID): same key, same revision và sửa actual cạnh apply, cùng changeset vayv2+asset STAGED. Bản lưu chứa đủ hai nguồn, anchor940/injection140 đúng mẫu; v3/v4 replay giữ nguyên. Fixture commit riêng được dọn đúng ID, fingerprint41bảng khớp. Đây là service/DB race, không phải HTTP/browser; chưa thay nghiệm thu các nhánh BHXH/refinance hoặc toàn bộ T17. Handoff FE-T17-LOAN-ASSET-RACES, bằng chứng PROGRESS.


Checkpoint07/10 clean13: cài mới/nâng cấp4→13,10integration,pg_dump/restore41bảng vàretention sau restore dữ liệu mẫu đạt.0013 hai index đã apply DBthật sau rehearsalrollback40bảng; audit13/13checksum,pending[],diff rỗng. .gitattributes cố định xuống dòng theo lịch sử. Chỉ phần migration/backup mẫu đã kiểm; T17-02 vẫn mở cho races xuyên nhánh, không thay nghiệm thu UI hay backupproduction.

Checkpoint07/10: thêm 3 race nguồn v4 với hai PostgreSQL backend PID khác nhau và transaction barrier: cùng key/cùng revision/actual sửa cạnh apply. Đạt, xóa đúng fixture, toàn bộ41bảng giữ fingerprint. Không thay nghiệm thu tất cả nhánh hoặc UI, T17 vẫn mở.
- [ ] T17-01: golden/property/metamorphic/contract tests cho từng nhóm; expected tính độc lập; đủ dữ liệu thiếu,0,ngưỡng tháng/lãi/fees, trùng nguồn và version cũ.
- [ ] T17-02: clean migration/upgrade có dữ liệu cũ, HTTP/DB/ownership/idempotency/CAS/races, golden replayv2/v3/v4. Trên DB thật dùng fixture phạm vi nhỏ/rollback, không reset hoặc cleanup toàn bảng.
- [ ] T17-03: UI/browser nhập BHXH→preview→chọn pension, trả một phần/cơ cấu, thêm nguồn→so sánh→save→apply→reload→CSV;409/offline/multitab/account switch; cập nhật T12 theo bằng chứng chạy.

Thứ tự đề xuất: T13 → T14(BH1 rồi từng nhóm) → T15 → T16 → T17; các kiểm tra chạy ngay trong mỗi đợt, không dồn đến cuối. BH4 có thể phát hành riêng theo nhóm khi đủ nguồn, nhưng vẫn là phần chưa hoàn thành của yêu cầu BHXH đầy đủ. Vận hành/backup/quyền dữ liệu/P36 còn mở của MVP tiếp tục được theo dõi độc lập.
