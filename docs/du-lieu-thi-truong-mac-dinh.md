# Bộ dữ liệu thị trường mặc định (bàn giao cho admin)

Lập ngày 18/11/2026. Trạng thái: **ĐÃ CÔNG BỐ** trong DB thật theo yêu cầu của chủ sản phẩm (18/11/2026): "Dữ liệu thị trường tháng 11", phiên bản v5, id `b5a2c739-bb5e-41d9-819b-5778db277ff4`, hiệu lực từ 18/11/2026, người duyệt và công bố là tài khoản admin duy nhất. Giấy phép các nguồn vẫn chưa xác minh (ghi trong reviewNote). Muốn sửa số: tạo bản mới trên trang admin (bản đã công bố không sửa tại chỗ), duyệt và công bố bản mới.

Đây là bộ số liệu khởi đầu, dựng từ dữ liệu công khai tới tháng 10/2026, để trang Phân bổ chạy được mô phỏng (tỷ lệ đủ chi thiết yếu, bảng so sánh các cách chia vốn). Admin có thể sửa mọi con số trước khi duyệt và công bố.

## 1. Các file

| File | Dùng để |
|---|---|
| `backend/data/drafts/market-data-draft.json` | Bản hoàn chỉnh theo schema `monthly-total-return-data-v1`. Dán thẳng vào trang admin. |
| `backend/data/drafts/market-data-inputs.json` | Số liệu gốc (giá vàng, VN-Index, CPI, các mốc lãi suất) kèm nguồn và các điểm chưa xác minh. |
| `backend/scripts/build-market-data-draft.cjs` | Dựng lại file nháp từ số liệu gốc. Chạy offline, không gọi mạng, không ghi DB. |

Kiểm tra lại sau khi sửa:

```powershell
cd backend; node scripts/build-market-data-draft.cjs; node node_modules/vitest/vitest.mjs run src/tests/drafts-schema.test.ts
```

## 2. Nội dung

Kỳ dữ liệu: 03/2020 đến 10/2026, tổng 80 tháng. Có 4 lớp tài sản, khớp mã của chính sách v4: `CASH`, `GOV_BOND`, `EQUITY`, `GOLD`. Kèm theo là CPI so với tháng trước.

| Lớp | Nguồn | Cách tính lợi suất tháng | Bình quân/năm |
|---|---|---|---|
| Tiền gửi `CASH` | Lãi suất 12 tháng tại quầy của Vietcombank, khách cá nhân, tổng hợp từ báo chí | Lãi suất niêm yết đầu tháng / 12 | 5,70% |
| TPCP `GOV_BOND` | Lãi suất trúng thầu kỳ hạn 10 năm tại HNX (VBMA, HNX, báo tài chính) | Lãi suất cuối tháng trước / 12, chưa tính lãi/lỗ giá | 3,08% |
| Cổ phiếu `EQUITY` | VN-Index đóng cửa cuối tháng (Yahoo Finance) | Điểm cuối tháng / điểm cuối tháng trước − 1 | 10,74% |
| Vàng `GOLD` | Giá vàng miếng SJC đóng cửa theo tháng (giavanghn.com) | Giá cuối tháng / giá cuối tháng trước − 1 | 18,50% |
| CPI | IMF (theo số liệu Cục Thống kê) tới 09/2026; riêng 10/2026 lấy theo thông cáo của Cục Thống kê (+0,20%) | Chỉ số tháng / chỉ số tháng trước − 1 | 2,97% |

## 3. Điểm cần admin xem trước khi duyệt

1. **Giấy phép.** Ô `license` của cả 5 nguồn đều ghi "CHƯA XÁC MINH". Schema bắt buộc ô `usage` là "được phép mô phỏng", nên ô này đã được điền sẵn. Admin phải tự xác nhận điều khoản của từng nguồn (HOSE, SJC hoặc trang tổng hợp, IMF khi dùng thương mại, ngân hàng, HNX) rồi mới bấm Duyệt.
2. **Cổ phiếu là chỉ số giá.** VN-Index chưa gồm cổ tức, nên lợi suất thấp hơn thực tế khoảng 1–2%/năm. Khi có chỉ số tổng lợi suất được cấp phép thì thay số trong `vnIndexClose`.
3. **TPCP chưa có biến động giá.** Lợi suất chỉ gồm phần lãi, nên chuỗi này biến động ít hơn thực tế (ví dụ đợt tăng lợi suất cuối 2022 không làm giá giảm). Không có số cuối năm 2021: giữ mức cuối 2020 là 2,28%.
4. **Các mốc lãi tiền gửi chưa rõ ngày:**
   - 05–08/2023: chưa tìm được ngày giảm từ 7,2% xuống 5,5%, đang giữ 7,2%.
   - 10/2022: chưa rõ mức tăng trung gian, đang giữ 5,5%.
5. **Giá vàng.** Trang nguồn không ghi rõ là giá mua vào hay bán ra. Tài liệu thuật toán yêu cầu giá mua vào của SJC.
6. **Giai đoạn đặc biệt.** Kỳ 80 tháng gồm đợt cổ phiếu giảm năm 2022 và đợt vàng tăng mạnh 2024–2026, nên vàng 18,5%/năm cao hơn mức dài hạn. Nếu muốn kết quả bớt nghiêng về vàng, admin có thể kéo dài kỳ dữ liệu (thêm năm cũ vào `market-data-inputs.json` và sửa `FROM` trong script).
7. **Sửa tay 2 tháng VN-Index** (Yahoo thiếu phiên cuối tháng):
   - 12/2023: 1.129,93.
   - 11/2024: 1.250,40, suy từ việc tháng 12/2024 tăng 1,31%.

## 4. Các bước đưa vào hệ thống (admin tự làm)

1. Vào trang admin **Dữ liệu thị trường**, tạo bản mới, rồi dán toàn bộ nội dung `market-data-draft.json` vào ô "Nội dung JSON của dữ liệu thị trường".
2. Sửa số liệu, nguồn và ghi chú trong form nếu cần. Có thể dán lại bảng lợi suất theo tháng, hoặc dùng mục "Nhập từ giá theo ngày" nếu có tệp giá ngày.
3. Lưu, rồi bấm **Kiểm tra**. Sau khi đã xác minh giấy phép, bấm **Duyệt** (có xác nhận và ghi chú rà soát), rồi **Công bố**.
4. Tải lại trang Phân bổ. Mô phỏng sẽ tự chạy. Nhãn đầu kết quả sẽ đổi thành "Dữ liệu thị trường đã công bố · vN", và các nút áp dụng sẽ mở.

Lưu ý: mã lớp tài sản trong dữ liệu phải trùng với chính sách danh mục đang công bố. Nếu chính sách dùng mã khác (ví dụ `SAVINGS` thay cho `CASH`), cần đổi tên cột trong file trước khi dán.
