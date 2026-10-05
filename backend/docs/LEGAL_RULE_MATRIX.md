# T13-01 — Ma trận căn cứ và phạm vi áp dụng

Rà soát ngày 05/10/2026. Đây là ma trận đầu vào cho bộ quy tắc; **không phải bộ tính BHXH đã được công bố**. R01–R11 dùng mã của [nghiên cứu](../../docs/research-bhxh-no-nguon-moi.md). Ngày hiệu lực gắn từng điều/nhóm, không dùng ngày hợp nhất làm ngày hiệu lực chung. Chưa có bộ quyền lợi nào ở trạng thái PUBLISHED.

Cập nhật triển khai: quyền lợiv2 đã bổ sung trợ cấp theoĐiều68 và [TT12Điều14](https://xaydungchinhsach.chinhphu.vn/toan-van-thong-tu-12-2025-tt-bnv-quy-dinh-chi-tiet-mot-so-dieu-cua-luat-bhxh-ve-bhxh-bat-buoc-11925070415595016.htm). Tách tháng vượt ngưỡng trước/sau tuổi; phép quy đổi tháng lẻ từng thành phần là cách triển khai cần được người rà xác nhận trong corpus thực. V1 đóng băng để replay. CoreBH2 cửa sổ và bình quân hỗn hợp đã có, nhưng chưa mở API: bước điều chỉnhĐiều73 và các ngoại lệ [NĐ158Điều15](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-158-2025-nd-cp-quy-dinh-ve-bao-hiem-xa-hoi-bat-buoc-119250629171336803.htm) còn phải nối trước. Không coi công thức bình quân cơ sở là coverage trọn nhóm.

## Ma trận theo nhóm và mốc thời gian

| Nhánh | Mốc/điều khoản cần chọn | Dữ liệu và ràng buộc triển khai | Trạng thái tiếp theo |
| --- | --- | --- | --- |
| BH1, bắt buộc/lương doanh nghiệp | R02 Điều 5, 64–66, 69, 72–73; từ 01/07/2025 | Đếm tháng đủ điều kiện trước khi quy đổi tháng lẻ để tính mức. Tách điều kiện, tỷ lệ, bình quân và tháng hưởng; không làm tròn 179 thành 180 tháng | T14-03, golden BH-G01/02/03/04 |
| BH2, Nhà nước/hỗn hợp lương | R03 Điều 15–16, R05 Điều 16, từ 01/07/2025 | Cửa sổ bình quân theo giai đoạn bắt đầu đóng; nhiều đoạn lương Nhà nước phải gom đúng các tháng gần nhất của chế độ đó | T14-04; mẫu độc lập theo từng cửa sổ |
| BH2, tự nguyện/hỗn hợp bắt buộc | R04 Điều 10–11, R06 Điều 4–5, từ 01/07/2025 | Lưu riêng số tháng từng chế độ; hỗn hợp có nhánh điều kiện tuổi/sàn khác nhau. Không lấy tổng năm thay số năm bắt buộc khi xét nhánh đặc biệt | T14-04; không còn vướng đọc bản ký R04/R06 |
| BH3, đóng trước/đóng bù | R04 Điều 6–7 và R06 Điều 3, 5(6) | Phân biệt đóng trước với đóng phần còn thiếu; lãi suất quỹ có năm công bố riêng, không dùng lợi suất danh mục cá nhân | T14-04; cần bảng lãi suất chính thức và ca biên |
| BH3, chuyển tiếp tự nguyện | R04 Điều 13, 16; R06 Điều 5(4–5) | Lưu ngày bắt đầu tự nguyện, số tháng tự nguyện, điều kiện trước 01/07/2025, ngày dừng/yêu cầu hưởng | T14-04, REVIEW_REQUIRED khi thiếu |
| BH3, suy giảm/nghề/địa bàn | R02 Điều 64–66; R03 Điều 12–14; R05 Điều 12–15 | Ngày giám định, tỷ lệ suy giảm, lịch nghề/địa bàn và danh mục có phiên bản; không áp giảm 2% cho mọi nghỉ sớm | T14-04; danh mục và mẫu hồ sơ còn cần rà riêng |
| BH3, giáo dục mầm non | R08 Điều 26(2), 40–41; R02 Điều 66(3a), từ 01/01/2026 | Ngoại lệ giảm tuổi/không giảm tỷ lệ có phạm vi cụ thể; cần chứng từ cơ sở/nhóm và nguyện vọng, không suy từ tên nghề chung | T14-04, mẫu đối chiếu riêng |
| Hệ số tiền lương/thu nhập | R07 Công văn 340/BHXH-CSXH ngày 03/02/2026, bảng áp dụng năm 2026 | Khóa hệ số bằng loại căn cứ + năm hưởng + năm đóng. Năm tương lai chưa có bảng phải dùng trạng thái kịch bản hoặc yêu cầu bổ sung | T14-01/03; nhập bảng, kiểm từng dòng trước publish |
| Điều chỉnh người đang hưởng | R09 NĐ162/2026 Điều 1–2, từ 01/07/2026; bổ sung R12 dưới đây | Chỉ điều chỉnh đúng đối tượng và số tiền cơ sở tháng 6; chống áp lại lên mức đã điều chỉnh. Nhóm trước 1995 có điều kiện riêng | T14-04; không tự cộng vào pension nhập tay |
| BH4 | R02 Điều 64(2), 66(2/4), điều ước/chế độ riêng | Không đưa quân đội/công an/điều ước vào nhánh thông thường bằng mặc định | T14-05 còn mở, REVIEW_REQUIRED |
| Nợ theo hợp đồng | R10 Điều 13–14, 18–19, 23; R11 hiệu lực 15/08/2026 | Giữ điều khoản gốc và ngày ký/sửa; phân bổ gốc/lãi/phí, trạng thái quá hạn, phạm vi nghĩa vụ và xác nhận của ngân hàng | T15-01/03; không coi mô phỏng là chấp thuận |

R02 hợp nhất các sửa đổi có mốc khác nhau: 84/2025 từ 01/07/2025, 73/2025 từ 01/01/2026, 142/2025 từ 01/03/2026, 113/2025 từ 01/07/2026. Chọn theo phạm vi điều khoản liên quan, không nhân bản mọi sửa đổi thành công thức hưu mới. [Bản hợp nhất, trang 1 và Điều 66](https://congbaocdn.chinhphu.vn/180507251028987904/2026/3/5/468972-1772691642_v1_1772691941_signed.pdf).

## Kết quả đối chiếu bản ký còn thiếu

Đã tải bản PDF công khai, dựng ảnh và đọc trực tiếp; SHA-256 dưới đây tính trên byte PDF tải được ngày rà soát, không phải mã xác thực chữ ký số. Bản tạm nằm trong `.cache/t13-legal`, không là phụ thuộc runtime.

| Mã | Trang đã đọc | SHA-256 |
| --- | --- | --- |
| [R04 — NĐ159/2025](https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/6/159-cp.signed.pdf) | 1–17; hưu trí/đóng bù tập trung 4–9, 11–16 | `8ffa3bdce6cdf2856eb0ffd21161dc194d38f8c7ff88114b91e24ea3d7b07b36` |
| [R06 — TT11/2025](https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/11-bnv.pdf) | 1–4, toàn bộ; Điều 3–6 ở trang 1–3 | `5ed90937ea4e629f35e7ac91cba97b1bfb22ff7df176df91045f6245a9ce23be` |
| [R11 — TT29/2026](https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/7/29-nhnn.signed.pdf) | 1–3, toàn bộ; sửa Điều 18 ở trang 2, chuyển tiếp trang 3 | `9694225f50823ef125d260eac043208656f128ce0f752414de005d1275d10d10` |

R04: Điều 7 giới hạn đóng phần còn thiếu không quá 60 tháng để đủ 15 năm; khác chiết khấu đóng trước tại Điều 6. Điều 10 có quy tắc riêng cho phần đóng bù. Điều 11 tách phần bắt buộc/tự nguyện khi tính bình quân. Điều 13/16 có chuyển tiếp; không chuyển toàn bộ hồ sơ cũ sang luật mới chỉ vì ngày chạy hệ thống mới.

R06: Điều 5 phân nhánh theo thời điểm đủ điều kiện, tiếp tục đóng, yêu cầu hưởng và đóng đủ phần thiếu. Quy ước ngày sinh thiếu thông tin ở khoản 7 là quy tắc riêng, phải giữ mức độ đầy đủ của chứng từ. Không gán ngày sinh suy diễn ngược vào hồ sơ gốc.

R11: Điều 4 thay khoản 4 Điều 18 TT39, thứ tự thu do thỏa thuận, với khoản quá hạn thu gốc trước lãi. Điều 3 sửa điều kiện khoản vay được dùng trong nhánh vay trả khoản nợ khác. Điều 10 giữ thỏa thuận cũ hợp pháp, phần sửa đổi phải theo quy định mới. Vì vậy cần `signedOn`, `amendedOn`, `paymentStatus`, `allocationBasis`; không chọn quy tắc chỉ từ ngày preview. Đây chưa phải xác nhận một hồ sơ vay cụ thể hợp lệ.

## Rà tuổi tham chiếu đang chạy

[R03 Điều 44](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-158-2025-nd-cp-quy-dinh-ve-bao-hiem-xa-hoi-bat-buoc-119250629171336803.htm) bãi bỏ khoản 2 Điều 3; khoản 1, 3 Điều 7; khoản 2 Điều 8 và Phụ lục III của NĐ135. Không bãi bỏ toàn bộ NĐ135 hoặc Phụ lục I–II. Tuổi theo các nhóm tháng sinh đang dùng được giữ ở mức tham chiếu. Tháng hưởng phải đọc [R05 Điều 15](https://xaydungchinhsach.chinhphu.vn/toan-van-thong-tu-12-2025-tt-bnv-quy-dinh-chi-tiet-mot-so-dieu-cua-luat-bhxh-ve-bhxh-bat-buoc-11925070415595016.htm) hoặc R06 theo chế độ và hồ sơ.

Thay đổi API pension preview: `rule.scope=AGE_REFERENCE_ONLY`, `referenceFollowingMonth` là tháng kế tiếp mốc tuổi, `pensionStartMonth=null`, `pensionStartStatus=REQUIRES_BENEFIT_ASSESSMENT`. Luồng nhập tay vẫn lấy `personal.pensionStartMonth`; không tự sửa số tiền/ngày khách khai.

`legal-age-v1.ts` giữ nguyên metadata của retirement-monthly-v2/v3; `prepare.ts` tiếp tục dùng bản đó để không thay nghĩa model đã phát hành. Bộ tham chiếu mới dùng trong pension preview; T13-03 mới nối vào model v4. Ngay cả trường cũ có tháng cụ thể vẫn là REFERENCE_ONLY/NOT_ASSESSED, không là quyết định hưởng.

## Nguồn bổ sung và điều kiện trước công bố

- R12: [TT14/2026/TT-BNV, bản ký](https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/6/14-bnv.pdf), hướng dẫn NĐ162/2026; đã xác định nguồn, cần đưa vào bộ tình huống điều chỉnh khi làm T14-04. [Thông tin Chính phủ về phạm vi đợt điều chỉnh](https://xaydungchinhsach.chinhphu.vn/quy-dinh-moi-ve-tien-luong-co-hieu-luc-tu-1-7-2026-119260626112758079.htm).
- [R07 bảng hệ số](https://xaydungchinhsach.chinhphu.vn/he-so-dieu-chinh-tien-luong-thu-nhap-thang-da-dong-bao-hiem-xa-hoi-119260206103115775.htm), [R08 Nhà giáo](https://xaydungchinhsach.chinhphu.vn/toan-van-luat-nha-giao-119250703171419548.htm), [R10 hợp nhất cho vay](https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/01/06-vbhn-nhnn.pdf).
- Tra lại nguồn sửa đổi ngày 05/10/2026; không đưa dự thảo vào rules. Việc tìm kiếm không chứng minh bao phủ mọi văn bản chuyên ngành.
- T14 phải có từng nhánh implemented + fixtures độc lập + nguồn và người rà trước publish. Đọc xong PDF chỉ hoàn thành đối chiếu nguồn T13, không đóng BH2/BH3/BH4 hoặc tính quyền lợi.
- Nguồn đầu vào không được gọi tải tự động từ URL người dùng; URL chỉ là citation. Tài liệu riêng của khách không đưa sang Gemini/kho tri thức chung.
