# Phương án chỉnh UI An Hưu để dễ hiểu và dễ sử dụng

Ngày: 11/10/2026. Trạng thái: **kế hoạch triển khai, chưa thực hiện các đợt bên dưới**.

## 1. Mục tiêu và phạm vi chốt

Người dùng vào một màn phải hiểu: **đang xem thông tin gì, số liệu có ý nghĩa gì, cần làm gì tiếp và thao tác có thay đổi dữ liệu hay không**.

Chỉnh cách trình bày, chữ, nhãn, bố cục, form, popup và tương tác của khu vực sau đăng nhập/onboarding. Giữ nhận diện Navy/Blue, dữ liệu, công thức, quyền hạn, API, nguồn kết quả và quy trình xác nhận hiện có. Không thiết kế lại toàn sản phẩm cùng lúc; mỗi đợt chỉ một màn hoặc một phần việc rõ ràng của màn.

Tài liệu này là phương án triển khai UI hiện hành. Kế hoạch 09/10 và báo cáo cũ đã được gom vào [lưu trữ audit](../artifacts/ui-audit-history-2026-10-11.zip); [tiến độ chung](ui-screen-audit-2026-10-08.md) giữ phần đã sửa và việc còn mở. Không mặc định phát hiện cũ vẫn còn tồn tại sau các lần sửa.

## 2. Cơ sở quyết định

- Đã đọc hai tài liệu người dùng gửi: kế hoạch màu ấm/chế độ dễ nhìn và báo cáo thiết kế/usability. Đã đối chiếu thêm báo cáo audit trong dự án và mã hiện tại của Tổng quan, điều hướng, onboarding, mục tiêu, Trợ lý và popup dùng chung.
- Các số liệu 15 người tham gia, TCR 68,2%, SUS 61,5, bỏ dở 34,5%, trích dẫn người tham gia và kết luận benchmark trong tài liệu gửi chưa có bản ghi/phương pháp tính/nguồn đi kèm. **Không dùng như kết quả nghiên cứu đã được xác minh**; giữ như giả thuyết để kiểm sau.
- Trợ lý đã có câu hỏi gợi ý; onboarding đã có thao tác lưu nháp khi chuyển bước. Không lập hạng mục tạo lại tính năng chỉ vì báo cáo mô tả là chưa có.
- Popup từ điển đã được mở rộng, giữ ô tìm kiếm khi cuộn và sửa lỗi thanh bên; giữ bản sửa này làm một mẫu về popup dễ dùng, không làm lại vô cớ.

## 3. Giữ, điều chỉnh, loại khỏi phạm vi

| Đề xuất từ hai tài liệu | Quyết định |
|---|---|
| Chữ dễ đọc, nút dễ bấm, ít thông tin đồng cấp | Giữ, là ưu tiên đầu tiên. |
| Tóm tắt trước, chi tiết sau | Giữ; không ẩn lỗi chặn, dữ liệu thiếu hoặc thời điểm quỹ thiếu tiền. |
| Ngôn ngữ gần gũi, giải thích thuật ngữ | Giữ; không đổi nghĩa hoặc làm nhẹ kết quả bất lợi. |
| Màu nền ấm | Thử nhẹ trên Tổng quan; chưa đổi token toàn ứng dụng. Màu không thay cho nhãn trạng thái. |
| Thẻ chào hỏi lớn, thông điệp “bình an” | Chỉ giữ lời chào ngắn; dành diện tích cho kết quả và bước tiếp theo. |
| Số năm an nhàn, ngưỡng 80% là “vững vàng” | Bỏ. Không tự thêm công thức hoặc ngưỡng kết luận ở frontend. |
| Ước lượng BHXH từ tuổi bắt đầu đi làm | Bỏ. Không suy lịch sử đóng hoặc chứng từ từ giả định. |
| Thẻ lối sống kèm số tiền 8–10/15–20/30 triệu | Chưa làm. Không tự đặt nhu cầu cá nhân; vẫn cho người dùng nhập số chính xác. |
| Điều chỉnh lạm phát/lợi suất trong chế độ chuyên gia | Không thêm quyền nhập. Chỉ giải thích và trình bày giả định được hệ thống cung cấp. |
| Biểu đồ chỉ còn ba mốc hoặc bảng chỉ còn giai đoạn 5 năm | Không thay thế dữ liệu chi tiết. Có thể bổ sung mốc/tóm tắt nhưng vẫn thấy kỳ thiếu hụt và mở được từng kỳ. |
| Gợi ý AI tự gửi, lời khuyên cá nhân theo số ví dụ | Sửa nhóm gợi ý hiện có; điền nháp để người dùng gửi. Không bịa khoản nợ/chi tiêu hoặc hứa phản hồi ngoài khả năng hiện tại. |
| “Bảo mật 100%, chỉ lưu trên thiết bị” | Bỏ. Nội dung về dữ liệu phải khớp hoạt động thật; không tự viết cam kết/chính sách chưa có. |
| Tự lưu mọi nháp, gộp lưu và áp dụng, đổi route/menu toàn bộ | Ngoài phạm vi UI hiện tại. Giữ bước nghiệp vụ, chỉ làm rõ tên và thứ tự. |
| Chế độ 60+, đọc giọng nói, linh vật, pháo giấy/huy hiệu | Chưa làm. Cỡ chữ tùy chọn chỉ xét sau khi giao diện mặc định đạt yêu cầu. |

## 4. Quy tắc giao diện áp dụng

### Chữ, khoảng cách và màu

- Nội dung mặc định hướng tới 16 px, dòng khoảng 1,5–1,6; nhãn/hướng dẫn quan trọng từ 14 px. Chữ 13 px chỉ cho thông tin phụ, không dùng cho số tiền cần ra quyết định hoặc lỗi nhập.
- Nút/ô nhập thông thường cao tối thiểu 44 px; nút chính trên điện thoại ưu tiên 48 px. Checkbox có vùng nhãn bấm rộng, không kéo giãn hình checkbox thành 48 px.
- Dùng thang khoảng cách 8/12/16/24/32 px, ưu tiên tận dụng token/component hiện có. Không áp hàng loạt `!important` hoặc tạo thư viện component mới trước khi cần dùng lại.
- Giữ Navy/Blue cho nhận diện và nút chính. Thử nền trung tính nhẹ `#FAF8F5`, mặt thẻ trắng, chữ đậm rõ trên Tổng quan; kiểm tương phản trước khi mở rộng.
- Mục tiêu đo nội bộ: chữ thông thường tương phản tối thiểu 4,5:1; viền/focus có thể nhận biết rõ. Không gọi giao diện “đạt AAA” chỉ từ vài màu hoặc kích thước.
- Không phụ thuộc hover để đọc thông tin: phần giải thích phải mở được bằng chạm và bàn phím. Không dùng màu hoặc icon đơn lẻ để thông báo trạng thái.

### Nội dung và số tiền

- Giọng văn bình tĩnh, trực tiếp, tôn trọng người dùng; không khen sáo rỗng hay hứa “an toàn”, “được bảo vệ tốt”, “chỉ cần thêm một chút”.
- Số trên thẻ tổng quan có thể rút gọn “2,23 tỷ ₫”, kèm cách mở số đầy đủ bằng bấm/chạm; đánh dấu xấp xỉ nếu làm tròn. Ô nhập, đối soát, xác nhận và xuất dữ liệu giữ độ chính xác hiện có.
- Không đổi giá trị thiếu thành 0, số trống thành một mức mặc định, hoặc hồ sơ hoàn thiện thành kết luận đủ tiền nghỉ hưu.
- Phân biệt thông tin khai báo với giao dịch thực tế, chi tiêu theo giá hôm nay với giá lúc nghỉ hưu. Không gọi số khai báo hàng tháng là “thực tế tháng này”.

| Cách diễn đạt cần tránh | Cách dùng đề xuất |
|---|---|
| Funding gap / thiếu hụt không giải thích | Khoản còn thiếu so với mục tiêu, kèm mốc thời gian và nguồn tính |
| Coverage / mức sẵn sàng chung chung | Quỹ dự kiến đáp ứng …% nhu cầu trong kế hoạch, chỉ khi kết quả có đủ dữ liệu |
| Tháng này hơi căng một chút | Chi tiêu và trả nợ đang vượt thu nhập đã khai báo; nút “Xem lại thu chi” |
| Tuổi thọ / số năm an hưởng | Tuổi kết thúc kế hoạch, giải thích đây là mốc tính toán, không dự đoán tuổi thọ cá nhân |
| Chưa xác định đứng một mình | Nêu thiếu thông tin gì hoặc lỗi tải gì, kèm thao tác phù hợp nếu có |
| Cấu hình vĩ mô chưa được phê duyệt | Chưa có đủ dữ liệu hệ thống để tính kết quả này; không yêu cầu người dùng điền thay dữ liệu quản trị |

### Trạng thái và thao tác

Không ép tất cả thành hai trạng thái nếu thao tác thật có nhiều bước. Mỗi vùng chỉ hiện trạng thái liên quan:

| Tình huống | Cách thể hiện |
|---|---|
| Có dữ liệu đang chỉnh | Đang chỉnh, chưa lưu |
| Đã có kết quả tính thử | Kết quả xem trước, chưa áp dụng |
| Đã lưu phiên bản nhưng chưa áp dụng | Đã lưu, chưa dùng làm kế hoạch hiện tại |
| Đã áp dụng | Kế hoạch đang dùng |
| Dữ liệu nguồn thay đổi | Cần tính lại theo thông tin mới |
| Thiếu dữ liệu hoặc tải lỗi | Nêu đúng lý do, nút bổ sung/thử lại nếu thực hiện được |

- Một hành động chính cho mỗi khu vực việc đang làm; không ép toàn trang nhiều form chỉ được có một nút chính.
- Giữ xem trước, lưu và áp dụng riêng theo nghiệp vụ. Nút phải nói rõ thao tác sắp làm; không thông báo “đã lưu” khi chỉ đổi state trong phiên.
- Xác nhận cho xóa dữ liệu đã lưu/áp dụng thay đổi có tác động. Không thêm hai lần xác nhận cho mọi chỉnh sửa hoặc nút bỏ nháp.
- Lỗi cần xử lý ngay hiện cạnh trường và trong phần tóm tắt phù hợp; không thu gọn lỗi chặn. Sửa lỗi không xóa những ô khác.
- Popup có tiêu đề, nút đóng rõ, cuộn đúng vùng, khóa nền nhưng giữ vị trí thanh điều hướng; Tab/Escape và trả focus hoạt động. Popup phức tạp vẫn giữ đủ chứng từ và xác nhận.

## 5. Lộ trình thực hiện từng đợt

Không cam kết lịch 8 tuần hoặc số ngày khi chưa thực hiện. Mỗi đợt hoàn tất sửa và kiểm tra chọn lọc trước khi sang đợt sau.

| Đợt | Phạm vi | Thay đổi cụ thể | Điều kiện xong |
|---|---|---|---|
| UI-01 | `/user/dashboard` | Bố cục tóm tắt theo trạng thái, một việc nên làm tiếp, phân cấp thu/chi/trả nợ/còn lại; chữ, nhãn và nền trung tính thử nghiệm | Hiểu số liệu/nguồn và bước tiếp theo; không đổi kết quả; các trạng thái thiếu/lỗi/cũ còn rõ |
| UI-02 | `/user/goal` | Nhóm tuổi/thời điểm/chi tiêu; đơn vị, giải thích gần trường, lỗi nội tuyến; tên nút nêu rõ xem trước hoặc giữ tạm | Nhập/sửa không mất dữ liệu; hiểu giá hôm nay/giá lúc hưu và thay đổi chưa áp dụng |
| UI-03 | `/user/plan` | Làm rõ bản đang xem và bản đang dùng; thứ tự xem trước/lưu/áp dụng; bớt badge lặp; bảng năm mở xuống tháng nếu dữ liệu hiện có hỗ trợ | Không nhầm phiên bản; vẫn đọc được cảnh báo, số tiền chính xác và xác nhận trước áp dụng |
| UI-04a | `/user/simulation`, phần thử kịch bản | Nhãn “Thử kịch bản”, khác biệt trước/sau, mốc thời gian và chú giải biểu đồ | Kịch bản thử không bị hiểu là kế hoạch đã áp dụng; không mất kỳ thiếu hụt |
| UI-04b | `/user/simulation`, phần sổ tháng | Phân cấp chọn tháng → nhập → đối soát → lưu; cột quan trọng trước trên mobile | Phân biệt khai báo/thực tế, biết vì sao chưa lưu được; giữ đối soát và trạng thái sổ |
| UI-05 | Popup BHXH, khoản vay và nguồn | Mỗi popup/form một lượt: chia nhóm trường, tóm tắt, nhãn rõ, hành động cuối dễ tìm | Không ẩn yêu cầu chứng từ hoặc tự thêm số; giữ các ca hồi quy đã sửa |
| UI-06 | `/onboarding` | Nhóm các bước hiện có thành các chặng dễ hiểu về mặt trình bày; giải thích lý do hỏi, đánh dấu mục bắt buộc/chưa biết | Không mất dữ liệu khi tiến/lùi/tải lỗi; chỉ cho bỏ qua khi hợp đồng dữ liệu hiện tại hỗ trợ |
| UI-07 | `/user/assistant` | Rút gọn nhóm gợi ý hiện có, chọn để điền nháp; làm rõ trạng thái khả dụng/lỗi/chưa chọn kế hoạch | Không tự gửi, không ghi đè câu đang soạn, không giả định AI đã sẵn sàng khi chưa có |
| UI-08 | Điều hướng và đọc dễ hơn | Mở rộng các quy tắc đã kiểm sang UserLayout; cân nhắc tùy chọn “Cỡ chữ” nếu còn nhu cầu | Topbar không chật, chữ phóng to vẫn dùng được; popup portal cũng nhận tùy chọn; lỗi lưu sở thích không làm hỏng trang |

Các đợt UI-04/05 không thay thế hàng đợi sửa nghiệp vụ còn mở, gồm 09d-3d lịch trả chi tiết. Nếu một lỗi nghiệp vụ ngăn UI hoạt động đúng, ghi riêng và xử lý có kiểm chứng; không tạo dữ liệu giả để hoàn thiện ảnh.

## 6. Đặc tả đợt đầu: Tổng quan

Giữ route/menu và hành vi các nút hiện có. Không thêm phép tính “số năm an nhàn”, không tạo một thẻ chào hỏi lớn mới.

| Thứ tự | Nội dung |
|---|---|
| 1. Tiêu đề gọn | “Tổng quan”, lời chào ngắn; trạng thái kế hoạch và thời điểm/phiên bản ở dòng phụ |
| 2. Kế hoạch hưu trí | Tóm tắt kết quả hiện có, số tiền dự kiến và nhu cầu; giải thích phần trăm nếu có; một nút theo trạng thái |
| 3. Thu chi đã khai báo | Thu nhập, chi tiêu, trả nợ và phần còn lại được phân biệt; phần còn lại nổi bật nhưng không gọi là tiền đã góp quỹ |
| 4. Chi tiết để mở thêm | Biểu đồ, cơ cấu tài sản và thông tin phụ; có tiêu đề và nút “Xem chi tiết” rõ |

Quy tắc cho vùng kế hoạch:

- Chưa có kế hoạch: giải thích ngắn, nút “Thiết lập mục tiêu”.
- Có kết quả hợp lệ: diễn giải trung tính từ số đang có, nút “Xem kế hoạch”.
- Hồ sơ khác dữ liệu của bản đang dùng: chỉ rõ kết quả thuộc bản đã lưu, cung cấp đường đi tới tính lại hiện có.
- Thiếu dữ liệu: nêu đúng phần thiếu; nếu do hệ thống, không đổ trách nhiệm cho người dùng và không hiện thước đo 0%.
- Đang tải/tải lỗi: giữ riêng hai trạng thái, có thử lại; không kết luận thiếu quỹ từ lỗi mạng.

Desktop giữ lưới thoáng; mobile thứ tự đọc như trên, thẻ chỉ xếp 2 cột nếu chữ và số vẫn vừa khi phóng to. Không đặt giới hạn chiều cao trang bằng cách cắt nội dung quan trọng.

Tệp dự kiến: `frontend/src/pages/UserDashboard.tsx`, phần CSS thực sự liên quan, bản dịch VI/EN, `frontend/tests/dashboard-detail-fixes.spec.ts`. Chỉ thêm component dùng chung khi đã xác định ít nhất các nơi cần dùng; không tái cấu trúc toàn bộ CSS trong đợt này.

## 7. Kiểm chứng bắt buộc cho từng đợt

1. Ghi nhận trước sửa bằng màn hình thật và fixture có ghi rõ nguồn; kiểm lại phát hiện cũ thay vì sửa theo số dòng hoặc ảnh đã lỗi thời.
2. Kiểm phần sửa ở 1440×1000, 768×1024, 390×844 và 390×400. Kiểm chữ phóng to 200%, Tab/Shift+Tab/Escape, vùng bấm, focus và tràn ngang. Bảng nhiều cột được cuộn trong vùng riêng có nhãn, không kéo cả trang.
3. Kiểm có dữ liệu, chưa có, thiếu, đang tải, lỗi, dữ liệu cũ; riêng màn có ghi dữ liệu thêm kiểm nháp, bỏ, lưu thất bại, gửi lại và áp dụng.
4. Đối chiếu trước/sau: số gốc, đơn vị, nguồn/phiên bản và yêu cầu gửi đi không bị đổi bởi việc sửa cách hiển thị. Mọi kiểm thử browser dùng API giả lập phải ghi rõ, không coi là chứng minh DB/production.
5. Chạy typecheck/build và kiểm thử của màn cùng các component dùng chung bị ảnh hưởng. Không chạy tất cả màn mỗi đợt; không chốt số lượng test cố định trước khi chạy.
6. Xem ảnh sau sửa; cập nhật việc đã sửa, số ca chạy/đạt và giới hạn chưa kiểm vào tệp tiến độ chung. Kết thúc task dọn ảnh/tệp tạm trùng; minh chứng cần giữ gom vào tệp lưu trữ, không tạo thêm báo cáo riêng trừ khi người dùng yêu cầu. Không coi chỉ build thành công là hoàn tất UI.

## 8. Đánh giá dễ dùng với người thật

Đây là kế hoạch đo mới, **chưa phải kết quả đã thu**. Nếu có người tham gia, bắt đầu vòng nhỏ 5–8 người với mức quen công nghệ khác nhau, có người 45–60+; không suy rộng thống kê từ nhóm nhỏ.

- Nhiệm vụ: đọc phần tiền còn lại, giải thích một kết quả kế hoạch và tìm bước tiếp theo; sau đó thử sửa mục tiêu và nhận biết thay đổi đã áp dụng hay chưa.
- Ghi: hoàn thành không cần gợi ý hay không, bấm nhầm, hiểu sai, điểm bị kẹt, thời gian và câu nhận xét nguyên văn có nguồn. Phân biệt người chưa chuẩn bị hồ sơ với người có sẵn số liệu.
- Mục tiêu vòng thử đầu: ít nhất 4/5 người tìm và hiểu được thông tin chính; không ai hiểu nhầm kết quả dự kiến là đảm bảo hoặc nháp là đã áp dụng. Đây là mục tiêu đề xuất, không kết luận đã đạt.
- Chưa đặt mục tiêu SUS 82 hay giảm onboarding xuống 3 phút khi chưa có đo ban đầu đáng tin cậy. Kiểm thử tự động và đánh giá của lập trình viên không thay nghiên cứu người dùng.

## 9. Điểm bắt đầu

**Bắt đầu UI-01: Tổng quan.** Làm một màn mẫu hoàn chỉnh, giữ kết quả tài chính, kiểm đủ trạng thái và mobile, rồi dùng những quy tắc đã chứng minh hữu ích cho các màn sau. Lượt lập kế hoạch này chỉ tạo tài liệu, chưa đổi giao diện hoặc dữ liệu.
