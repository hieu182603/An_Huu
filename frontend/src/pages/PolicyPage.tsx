import { Link } from 'react-router';
import MarketingLayout from '../marketing/MarketingLayout';

export default function PolicyPage() {
  return (
    <MarketingLayout>
      <section className="mk-page-hero">
        <div className="mk-container">
          <nav className="mk-breadcrumb" aria-label="Đường dẫn trang">
            <Link to="/">Trang chủ</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Chính sách & Điều khoản</span>
          </nav>
          <span className="mk-eyebrow">QUY CHẾ HOẠT ĐỘNG</span>
          <h1>Minh bạch chính sách,<br /><span>bảo vệ tối đa quyền lợi của bạn.</span></h1>
          <p className="mk-page-hero-desc">An Hưu tuân thủ nguyên tắc tôn trọng quyền riêng tư dữ liệu tài chính cá nhân và công khai toàn bộ các giả định tính toán để bạn hoàn toàn yên tâm sử dụng.</p>

          <div className="mk-quick-jump-chips">
            <a href="#bao-mat" className="mk-chip">🔒 Chính sách bảo mật</a>
            <a href="#dieu-khoan" className="mk-chip">⚖️ Điều khoản sử dụng</a>
            <a href="#gia-dinh" className="mk-chip">📊 Cơ sở giả định</a>
            <a href="#mien-tru" className="mk-chip">🛡️ Miễn trừ tư vấn</a>
          </div>
        </div>
      </section>

      <div className="mk-container mk-policy-container">
        {/* Section 1: Privacy Policy */}
        <section id="bao-mat" className="mk-policy-section">
          <div className="mk-policy-card">
            <div className="mk-policy-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            </div>
            <h2>1. Chính sách bảo mật dữ liệu</h2>
            <p>An Hưu ý thức sâu sắc rằng thông tin thu nhập, chi tiêu, nợ và tài sản để dành là dữ liệu tài chính nhạy cảm và thiêng liêng của mỗi cá nhân và gia đình. Vì vậy, chúng tôi áp dụng kiến trúc bảo mật nghiêm ngặt:</p>
            <ul>
              <li><strong>Nguyên tắc Không lưu vết (Ephemeral Memory):</strong> Trong bản thử nghiệm, dữ liệu bạn nhập hoàn toàn được xử lý trong bộ nhớ phiên làm việc trên trình duyệt của chính bạn. Không có cơ sở dữ liệu bên ngoài nào ghi lại thông tin này. Khi bạn đóng tab hoặc làm mới trình duyệt, dữ liệu tự động bị hủy sạch.</li>
              <li><strong>Không theo dõi cá nhân:</strong> Chúng tôi không sử dụng cookies của bên thứ ba, không cài mã theo dõi hành vi xuyên trang web và không thu thập địa chỉ, danh bạ hay dữ liệu cá nhân ngoài phạm vi cần thiết để tính toán.</li>
              <li><strong>Cam kết Không thương mại hóa dữ liệu:</strong> An Hưu cam đoan không bán, trao đổi hoặc chia sẻ bất kỳ dữ liệu nào của bạn cho các tổ chức bảo hiểm, ngân hàng hay đại lý tiếp thị tài chính.</li>
            </ul>
          </div>
        </section>

        {/* Section 2: Terms of Service */}
        <section id="dieu-khoan" className="mk-policy-section">
          <div className="mk-policy-card">
            <div className="mk-policy-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
            </div>
            <h2>2. Điều khoản sử dụng dịch vụ</h2>
            <p>Bằng việc truy cập và sử dụng nền tảng An Hưu, bạn đồng ý với các quy định sau:</p>
            <ul>
              <li><strong>Mục đích sử dụng:</strong> An Hưu được thiết kế như một công cụ hỗ trợ tư duy, giáo dục tài chính và mô phỏng số liệu giúp người dùng tự định hướng kế hoạch hưu trí cho bản thân.</li>
              <li><strong>Tính chính xác của thông tin đầu vào:</strong> Kết quả dự phóng phụ thuộc trực tiếp vào các thông số bạn nhập (tuổi tác, thu nhập, chi tiêu, nợ, lịch đóng BHXH). Bạn chịu trách nhiệm về tính trung thực của các thông tin mình đưa vào để nhận được kết quả sát thực tế nhất.</li>
              <li><strong>Bảo toàn quyền sở hữu trí tuệ:</strong> Toàn bộ giao diện, thiết kế, bài viết kiến thức và thuật toán mô phỏng dòng tiền thuộc bản quyền của An Hưu. Mọi hành vi sao chép nhằm mục đích thương mại mà chưa được sự đồng ý bằng văn bản đều bị nghiêm cấm.</li>
            </ul>
          </div>
        </section>

        {/* Section 3: Assumptions & Data Methodology */}
        <section id="gia-dinh" className="mk-policy-section">
          <div className="mk-policy-card">
            <div className="mk-policy-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
            </div>
            <h2>3. Cơ sở giả định & Phương pháp tính toán</h2>
            <p>Mọi con số dự phóng tương lai đều cần dựa trên các giả định có căn cứ lịch sử:</p>
            <ul>
              <li><strong>Lạm phát:</strong> Sử dụng tỷ lệ lạm phát cơ sở 3,5%/năm được tính toán lũy kế từng tháng, phản ánh mặt bằng trượt giá thực phẩm, nhà ở và dịch vụ y tế theo dữ liệu lịch sử của Tổng cục Thống kê.</li>
              <li><strong>Bảo hiểm Xã hội:</strong> Thuật toán áp dụng quy định của Luật Bảo hiểm xã hội số 41/2024/QH15. Mức lương hưu BHXH tự khai hoặc ước tính là con số danh nghĩa; nếu không có điều chỉnh tăng theo chỉ số CPI, sức mua của khoản lương hưu này sẽ giảm dần theo thời gian.</li>
              <li><strong>Tỷ suất sinh lời:</strong> Các danh mục gợi ý (Tiết kiệm, Trái phiếu, Quỹ cổ phiếu) được mô phỏng với mức sinh lời dự kiến từ 4% đến 8%/năm. Đây là tỷ suất kỳ vọng dựa trên lịch sử thị trường vốn Việt Nam và không phải là cam kết lãi suất cố định.</li>
            </ul>
          </div>
        </section>

        {/* Section 4: Disclaimer */}
        <section id="mien-tru" className="mk-policy-section">
          <div className="mk-policy-card">
            <div className="mk-policy-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            </div>
            <h2>4. Miễn trừ trách nhiệm tư vấn tài chính</h2>
            <p>An Hưu là nền tảng công nghệ tài chính độc lập, không phải là công ty chứng khoán, ngân hàng hay tổ chức tư vấn đầu tư được cấp chứng chỉ hành nghề. Các báo cáo, kịch bản và con số do hệ thống tạo ra mang tính chất tham khảo khoa học.</p>
            <p>Thị trường tài chính luôn tiềm ẩn rủi ro biến động. Trước khi tiến hành các giao dịch đầu tư thực tế, mua bán tài sản lớn hoặc chuyển dịch danh mục, người dùng nên tham vấn ý kiến từ các chuyên gia tài chính hoặc luật sư có chuyên môn.</p>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}

