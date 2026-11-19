/** Nội dung Chính sách phí dịch vụ: dùng chung cho trang /chinh-sach và hộp thoại đồng ý điều khoản. */
export default function FeePolicyContent() {
  return (
    <>
        <p>An Hưu thu phí dịch vụ hoạch định tài chính hằng tháng để duy trì nền tảng độc lập: không quảng cáo, không bán sản phẩm tài chính và không nhận hoa hồng. Khoản phí này là phí sử dụng phần mềm hoạch định, <strong>không phải phí quản lý tài sản</strong>: An Hưu không giữ tiền, không nhận ủy thác và không thực hiện giao dịch thay bạn.</p>
        <ul>
          <li><strong>Mức phí:</strong> 0,5% mỗi năm trên quy mô tài sản tài chính dành cho hưu trí mà bạn kê khai (tiền mặt, tiền gửi, cổ phiếu, chứng chỉ quỹ, trái phiếu, vàng), chia đều cho 12 tháng. Nhà đang ở và bất động sản không được tính. Phí được làm tròn lên hàng nghìn đồng, tối thiểu 49.000 đồng và tối đa 2.000.000 đồng mỗi tháng. Ví dụ: tài sản tài chính 1 tỷ đồng tương ứng phí 417.000 đồng/tháng.</li>
          <li><strong>Căn cứ tính phí:</strong> Số liệu tài sản trong hồ sơ của bạn tại 00:00 ngày 1 hằng tháng (giờ Việt Nam). Thay đổi trong tháng được áp dụng từ kỳ phí tháng sau. Nếu chưa kê khai tài sản, phí được tính ở mức tối thiểu. Phí dựa trên số liệu bạn tự kê khai, vì vậy bạn chịu trách nhiệm về tính trung thực của số liệu.</li>
          <li><strong>Dùng thử:</strong> Tài khoản mới được miễn phí đến hết tháng đăng ký; kỳ phí đầu tiên được lập vào ngày 1 của tháng kế tiếp. Riêng đợt ra mắt, kỳ phí tháng 11/2026 được lập ngày 20/11/2026 cho các tài khoản đã đồng ý điều khoản phí trước ngày này.</li>
          <li><strong>Thanh toán:</strong> Đầu mỗi tháng, An Hưu gửi thông báo phí qua ứng dụng và email. Bạn thanh toán bằng cách quét mã VietQR qua cổng thanh toán payOS trước hạn ghi trên thông báo: hết ngày 10 với kỳ phí lập đầu tháng, hoặc sau 10 ngày kể từ ngày lập với kỳ phí lập giữa tháng (ví dụ kỳ phí lập ngày 20/11/2026 có hạn hết ngày 29/11/2026). An Hưu không lưu thông tin thẻ hay tài khoản ngân hàng của bạn và không tự động trừ tiền. Sau khi thanh toán, biên nhận được gửi qua email.</li>
          <li><strong>Khi quá hạn:</strong> Sau hạn thanh toán, các thao tác tạo mới (lập phiên bản kế hoạch, mô phỏng, nhập thu chi, hỏi trợ lý AI) tạm dừng cho đến khi bạn thanh toán. Bạn vẫn xem và tải về toàn bộ dữ liệu của mình. Phí quá hạn không bị tính lãi hay phạt, và kỳ phí mới không được cộng dồn khi kỳ trước chưa thanh toán.</li>
          <li><strong>Ngừng sử dụng:</strong> Bạn có thể ngừng dịch vụ bất cứ lúc nào trong mục Tài khoản → Phí dịch vụ. Việc ngừng có hiệu lực từ tháng sau; dữ liệu của bạn được giữ nguyên và bạn có thể dùng lại bất cứ lúc nào. Khoản phí đã quá hạn vẫn cần được thanh toán.</li>
          <li><strong>Hoàn tiền:</strong> Bạn được hoàn 100% phí nếu yêu cầu trong vòng 7 ngày kể từ lần thanh toán đầu tiên, bằng cách gửi yêu cầu tại mục Hỗ trợ. Sau thời hạn này, phí của tháng đã thanh toán không được hoàn.</li>
          <li><strong>Thay đổi biểu phí:</strong> Mọi thay đổi về mức phí được thông báo trước ít nhất 7 ngày và chỉ áp dụng từ kỳ phí tháng sau, không áp dụng cho kỳ phí đã lập.</li>
        </ul>
        <p>Phiên bản điều khoản phí: phi-dich-vu-2026-11-v1, cập nhật ngày 19/11/2026.</p>
    </>
  );
}
