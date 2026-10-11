# Bộ dữ liệu nạp lại toàn bộ — chờ chủ dự án duyệt

**Chưa nạp DB thật.** File nạp chính: [seed-datafull.sql](../backend/seed-data/seed-datafull.sql), khoảng 2,13 MB. Đây là **một file SQL đầy đủ cho 40 bảng ứng dụng**, không phụ thuộc các file seed cũ khi nạp. Schema phải được tạo bằng 13 migration hiện hành trước khi nạp.

Bộ này được chuẩn bị theo yêu cầu tái sử dụng dữ liệu có sẵn, bổ sung thông tin có nguồn thật và chờ duyệt trước khi nạp lại. Snapshot được đọc lúc **12:21:04 ngày 08/10/2026, giờ Việt Nam**, trong giao dịch PostgreSQL READ ONLY. Không tạo người dùng giả, lịch đóng BHXH, giao dịch thực tế hoặc kế hoạch mới để lấp bảng rỗng.

File chứa dữ liệu tài khoản, bản băm xác thực và hồ sơ tài chính đang có, nên nằm trong thư mục riêng bị Git bỏ qua. Báo cáo này không chứa email, tên tài khoản, mật khẩu/token hay số tiền cá nhân.

## Phạm vi để duyệt

| Nhóm | Dữ liệu trong file đề xuất |
|---|---|
| Tài khoản | Giữ nguyên 53 tài khoản, ID, vai trò, trạng thái và hash mật khẩu; không tạo mật khẩu chung hoặc quản trị viên giả |
| Hồ sơ tài chính | Giữ nguyên 50 JSON hồ sơ v2, bản legacy và số tiền; chỉ đồng bộ cột ngày định giá theo JSON, tăng revision |
| Mục tiêu | Giữ nguyên 50 mục tiêu và các giá trị tiền/tuổi; sửa `comfortable` thành `COMFORTABLE`, tăng revision |
| Hỗ trợ | Sửa category 4 phiếu theo nội dung đã đối chiếu; giữ nguyên 7 tin nhắn và tác giả |
| Bài viết | Giữ 5 ID/slug, thay nội dung thiếu căn cứ bằng nội dung có nguồn hoặc mô tả đúng tính năng; tạo searchText; giữ **DRAFT** và không bịa ngày xuất bản |
| Kiến thức | Rà soát lại 5 bản cũ, bổ sung 2 nguồn; có 7 bản tóm tắt nhận diện nguồn, 7 chunk lexical đúng hash/metadata; **INDEXED nhưng chưa APPROVED** |
| Quy định BHXH | Bổ sung 8 draft từ corpus hiện có, hash nguồn đã kiểm; đủ dữ liệu bảng của từng draft, nhưng không tự duyệt/công bố luật |
| Danh mục | Giữ 6 đối tác và 11 ID sản phẩm; sửa 8 bản có nguồn nhận diện, 3 bản chưa xác minh ghi rõ; bỏ các khoảng lợi nhuận chưa có căn cứ, giữ ẩn |
| Giả định | Giữ nguyên values của 2 bộ cấu hình và 8 giá trị legacy; đưa 2 bộ cấu hình về DRAFT, bỏ trạng thái phê duyệt giả định do seed và ghi rõ phần legacy chưa xác minh |
| Lịch sử vận hành | Giữ nguyên phiên xác thực, outbox/receipt, log, thông báo, tư vấn, bản nháp, cấu hình hệ thống và đồng ý AI đang có |
| Bản đối chiếu | Thêm một bản ghi audit `DATASET_PREPARED_FOR_REVIEW`, không giả danh người duyệt; lưu các giá trị trước chỉnh sửa và hash giá trị sau, cùng nguồn tài liệu |

Tổng vẫn là **400 bản ghi**: 18 chunk cũ được lưu lại trong hồ sơ đối chiếu rồi thay bằng 7 chunk mới; bổ sung 2 nguồn, 8 draft BHXH và 1 bản ghi chuẩn bị dữ liệu. Bản snapshot gốc đầy đủ vẫn được giữ riêng tại máy. Không có xóa/sửa nào trên DB nguồn.

Tài khoản và dữ liệu cá nhân được tái sử dụng nguyên trạng **không đồng nghĩa đã xác nhận là người thật hoặc số liệu tài chính thật**. Các thông báo/tin nhắn seed cũ được giữ như bản ghi lịch sử; không coi chúng là bằng chứng mới về một kế hoạch đã được áp dụng hay một chế độ BHXH đã được duyệt.

## Các trạng thái quan trọng sau khi nạp đề xuất

1. **Dự báo chính thức chưa sẵn sàng**: hai bộ giả định/chính sách được giữ ở DRAFT vì nguồn và các giá trị tương lai chưa đủ căn cứ phê duyệt độc lập. Không tự thay bằng lãi suất/lợi nhuận bịa để giao diện hiện kết quả.
2. **5 bài viết, 7 nguồn kiến thức và danh mục sản phẩm cần duyệt** trước khi hiển thị/truy xuất công khai. Giữ ẩn đối tác vì việc tổ chức tồn tại không chứng minh có quan hệ hợp tác với An Hưu.
3. **8 quy định BHXH là draft**. Không có người duyệt giả; hiện chỉ một ADMIN nên vẫn cần người duyệt độc lập. Nhánh chuyển tiếp 2025 còn điểm pháp lý cần rà soát được ghi sẵn trong corpus.
4. Bảng kế hoạch/phiên bản, actual/lịch sử giao dịch, lịch đóng/kết quả BHXH vẫn rỗng vì chưa có dữ liệu gốc được xác nhận. Nạp đủ cấu trúc và dữ liệu có căn cứ không có nghĩa là tạo giao dịch cho người dùng.

Các trạng thái trên được mã hóa ngay trong file để người duyệt thấy rõ. Đây là bộ nạp có kiểm chứng kỹ thuật và các phần chờ duyệt minh bạch, không phải tuyên bố mọi chức năng đã đủ dữ liệu vận hành chính thức.

## Đã đọc lại các nguồn nạp cũ

| File | Kết luận dùng cho bộ mới |
|---|---|
| `backend/scripts/seed-azure.cjs` — 1.566 dòng | Có xóa diện rộng, tự tạo tài khoản, tự duyệt giả định, category/metadata không đúng và mô tả chưa có nguồn. Không thực thi file này. Tái sử dụng bản ghi hiện có qua snapshot, không chạy lại các lệnh xóa/tạo. |
| `backend/scripts/seed.cjs` — 351 dòng | Giới hạn local nhưng vẫn có công bố giả định phát triển; dữ liệu CPI lịch sử không thể dùng như nguồn dự báo. Không nhập các số dự báo này như dữ kiện đã xác minh. |
| `backend/scripts/generate-demo-data.cjs` — 134 dòng | Sinh dữ liệu giả lập v1, tracking và tài khoản. Không dùng để tạo giao dịch/lịch sử thật cho bộ nạp này. |
| `backend/seed-data/references.json` | Tái sử dụng hướng nguồn chính thức, đối chiếu lại trang gốc trước khi đưa thông tin vào bộ mới. |
| `backend/seed-data/legal-2026` | 15 snapshot nguồn được kiểm byte/hash, 8 draft tái lập khớp; dùng lại nguyên document qua schema hiện hành, không chuyển test pass thành phê duyệt pháp lý. |

## Nguồn đã đối chiếu cho thông tin bổ sung

- Luật BHXH: [bản hợp nhất Công báo số 133/2026](https://congbaocdn.chinhphu.vn/180507251028987904/2026/3/5/468972-1772691642_v1_1772691941_signed.pdf); tuổi nghỉ hưu: [Nghị định 135/2020](https://datafiles.chinhphu.vn/cpp/files/vbpq/2020/11/135.signed.pdf); điều chỉnh lịch sử: [Nghị định 75/2024](https://datafiles.chinhphu.vn/cpp/files/vbpq/2024/7/75-cp.signed.pdf). Bản tóm tắt không thay toàn văn hay kết luận quyền hưởng cá nhân.
- Thống kê: [ấn phẩm điều tra dân số giữa kỳ 2024](https://www.nso.gov.vn/wp-content/uploads/2024/12/Dieu-tra-Dan-so-giua-ky-2024-31.12-1.pdf), [thông cáo giá năm 2025](https://www.nso.gov.vn/du-lieu-va-so-lieu-thong-ke/2026/01/thong-cao-bao-chi-ve-tinh-hinh-gia-thang-muoi-hai-quy-iv-va-nam-2025/). Chỉ dùng thông tin lịch sử, không ngoại suy thành dự báo.
- Giáo dục/chuẩn mực: [Investor.gov](https://www.investor.gov/introduction-investing/getting-started/asset-allocation), [FPSB](https://fpsb.org/standards-for-the-profession/). Loại bỏ tên bộ tiêu chuẩn ghép CFA–FPSB chưa xác minh.
- Sản phẩm: [VEOF](https://vinacapital.com/vi/investment-solutions/onshore-funds/veof/), [VIBF](https://vinacapital.com/vi/investment-solutions/onshore-funds/vibf/), [VFF](https://vinacapital.com/vi/investment-solutions/onshore-funds/vff/), [SSI-SCA](https://ssiam.com.vn/thong-tin-chung-quy-ssi-sca), [DCBF](https://www.dragoncapital.com.vn/individual/vi/product/a0eJ2000001X9nBIAS/dcbf), [DCDS](https://dautu.dragoncapital.com.vn/tin-tuc/cap-nhat-danh-muc-dau-tu-quy-co-phieu-dcds-moi-nhat-thang-2-2026), [Vietcombank](https://vietcombank.com.vn/vi-VN/KHCN/SPDV/Tiet-kiem), [Bảo Việt](https://www.baoviet.com.vn/vi/bao-hiem-phi-nhan-tho).
- Ba tên chưa xác minh giữ ẩn: “Tiết kiệm Tích lũy Hưu trí VCB”, “Tiết kiệm Phát Lộc Hưu Trí”, “An Phát Hưu Trí”. Không tự đổi thành một sản phẩm khác. Đối chiếu [Techcombank](https://techcombank.com/khach-hang-ca-nhan/tiet-kiem/tien-gui-tiet-kiem-co-ky-han) và [danh mục hưu trí Bảo Việt Nhân thọ](https://www.baovietnhantho.com.vn/san-pham/danh-muc/huu-tri); trang Bảo Việt hiện ghi sản phẩm được liệt kê đã ngừng triển khai.

Chi tiết tóm tắt, nguồn và mapping: [reviewed-references-20261008.json](../backend/seed-data/reviewed-references-20261008.json). Thông tin phí/sản phẩm có mốc kiểm tra, cần kiểm lại khi công bố hoặc giao dịch; bộ này không chứa cam kết lợi nhuận.

## Kết quả kiểm chứng file cuối

**16/16 nhóm kiểm tra PASS** trên PostgreSQL pgvector Docker tạm, schema từ 13 migration; container được xóa sau test. Kiểm đúng file SQL giao cho duyệt, không chỉ kiểm mock.

- Import đủ 40 bảng; đối chiếu tất cả trường của toàn bộ 400 bản ghi, giữ Decimal không qua số thực JavaScript.
- 53 tài khoản cùng credential/history và 50 JSON hồ sơ/legacy/số tiền được giữ đúng; 50 hồ sơ và mục tiêu đọc được bằng service.
- Thiếu/sai mã duyệt, sai migration, target có dữ liệu và chạy lần hai đều bị chặn; dữ liệu không bị thay đổi ngoài ý muốn.
- Cố ý lỗi ở cuối import: toàn bộ transaction rollback, không để lại một phần dữ liệu.
- Tiếng Việt, dấu nháy, dấu gạch chéo, xuống dòng, JSON, UTC và số tiền lớn round-trip đúng.
- 8 draft quy định qua **132 golden cases**, hash khớp; không tự REVIEW/PUBLISH. Đây là kiểm chứng engine/corpus, chưa thay rà soát pháp lý độc lập.
- Knowledge khớp nội dung–chunk–hash, nguồn chưa duyệt không được retrieve; bài có searchText tìm kiếm đúng; danh mục chưa duyệt không xuất hiện công khai.

Các lượt kiểm ban đầu phát hiện khác biệt do cách so sánh JSON/thời gian và bước chờ Docker khởi động. Đã sửa verifier, chạy lại bản cuối đạt; không có lượt thử nào dùng DB thật làm đích. Không có chứng từ gốc để xác minh các giá trị tài chính cá nhân được tái sử dụng. Không tuyên bố chạy toàn bộ browser/provider hoặc kiểm được mọi nghiệp vụ trên các bảng rỗng.

Bằng chứng: [verification.json](../backend/.tmp/data-review-20261008/verification.json), [review-manifest.json](../backend/.tmp/data-review-20261008/review-manifest.json).

## Cách nạp sau khi được duyệt

File tự chặn nếu thiếu mã duyệt khớp gói dữ liệu hoặc DB đích không trống. File không có `TRUNCATE`, `DELETE`, tắt trigger hay tự tạo/reset schema. Toàn bộ import nằm trong một transaction.

Sau khi chủ dự án duyệt, phương án nạp lại là tạo DB thay thế đúng schema, nhập file, kiểm tra và chuyển ứng dụng sang DB mới trong đợt triển khai đã được cho phép. Giữ DB cũ để phục hồi. Không tự chạy bước chuyển DB trong lượt chuẩn bị này. Trước khi chuyển thật phải chốt thời điểm dừng ghi và đối chiếu dữ liệu phát sinh sau snapshot; cần cập nhật bộ nạp và duyệt lại nếu nội dung thay đổi.

SQL SHA-256 của file cuối: `0a49dae72c5673ef930ed05727015766ec4b5fab78db86726a52cac8edb3dc39`.

Scripts chuẩn bị và kiểm lại: [prepare-reviewed-dataset.cjs](../backend/scripts/prepare-reviewed-dataset.cjs), [verify-reviewed-dataset.cjs](../backend/scripts/verify-reviewed-dataset.cjs). Script đầu chỉ có đọc DB hoặc dựng file offline; script sau chỉ chạy DB Docker riêng, không có chế độ import DB thật.
