import peacefulRetirement from '../assets/peaceful-retirement.webp';
import knowledgePlan from '../assets/knowledge-plan.jpg';
import knowledgeTracking from '../assets/knowledge-tracking.jpg';
import productDeposit from '../assets/product-deposit.jpg';

export interface KnowledgeArticle {
  id: string;
  code: string;
  readTime: string;
  category: string;
  categoryTag: string;
  strategyTag: string;
  badgeClass: string;
  badgeText: string;
  title: string;
  sapo: string;
  image: string;
  caption: string;
  heroLabel: string;
  heroVal: string;
  heroUnit: string;
  subLabel: string;
  subVal: string;
  statNote: string;
  pillText: string;
  highlights: string[];
  specs: [string, string][];
  sectionsHtml: string;
}

export const ARTICLES_DATA: KnowledgeArticle[] = [
  {
    id: 'can-bao-nhieu-tien-de-nghi-huu',
    code: 'KT-01',
    readTime: '5 phút đọc',
    category: 'Mục tiêu hưu trí',
    categoryTag: 'MỤC TIÊU HƯU TRÍ',
    strategyTag: 'Quy tắc 4% & Trượt giá',
    badgeClass: 'badge-risk-green',
    badgeText: 'Nền tảng cốt lõi',
    title: 'Cần bao nhiêu tiền để nghỉ hưu an tâm tại Việt Nam?',
    sapo: 'Một khoản tiết kiệm là chưa đủ. Lạm phát và tuổi thọ tăng đòi hỏi tính cùng lúc mức sống mong muốn, trượt giá và tỷ lệ rút vốn an toàn.',
    image: peacefulRetirement,
    caption: 'Chuyên đề Mục tiêu hưu trí: Lập kế hoạch tài chính độc lập cho tuổi già an yên.',
    heroLabel: 'QUY MÔ QUỸ MỤC TIÊU',
    heroVal: '220 - 250 lần',
    heroUnit: 'mức chi tháng',
    subLabel: 'Tỷ lệ rút tham chiếu',
    subVal: '4,0% - 4,5%/năm',
    statNote: 'Chu kỳ hưu trí 25 - 30 năm',
    pillText: 'Tỷ lệ rút an toàn: 4% - 4,5%/năm',
    highlights: [
      'Tính theo giá hiện tại để dễ hình dung mức sống thực tế.',
      'Áp dụng tỷ lệ rút an toàn 4% - 4,5%/năm bù đắp lạm phát dài hạn.',
      'Khấu trừ lương hưu BHXH để xác định đúng số tiền ròng cần chuẩn bị.',
    ],
    specs: [
      ['Chi tiêu 10 triệu/tháng (Cơ bản)', 'Quỹ cần: 2,4 - 2,7 tỷ (Có BHXH 6tr: ~1,1 tỷ)'],
      ['Chi tiêu 15 triệu/tháng (Trung bình khá)', 'Quỹ cần: 3,6 - 4,2 tỷ (Có BHXH 6tr: ~2,3 tỷ)'],
      ['Chi tiêu 20 triệu/tháng (Thoải mái)', 'Quỹ cần: 4,8 - 5,5 tỷ (Có BHXH 6tr: ~3,6 tỷ)'],
      ['Chi tiêu 30 triệu/tháng (An nhàn, du lịch)', 'Quỹ cần: 7,2 - 8,4 tỷ (Có BHXH 6tr: ~6,3 tỷ)'],
    ],
    sectionsHtml: `
      <h2>1. Sai lầm phổ biến: Phép nhân giản đơn</h2>
      <p>Nhiều người lấy chi tiêu hiện tại nhân số năm nghỉ hưu: 15 triệu đồng/tháng × 12 tháng × 20 năm = 3,6 tỷ đồng. Cách nhẩm này bỏ sót hai yếu tố cốt tử:</p>
      <ul class="ed-list">
        <li><strong>Trượt giá lạm phát:</strong> Với lạm phát bình quân 3,5%/năm, giỏ chi tiêu 15 triệu đồng hôm nay sau 20 năm nữa sẽ có giá danh nghĩa khoảng <strong>29,85 triệu đồng</strong>.</li>
        <li><strong>Chi phí y tế tăng nhanh:</strong> Nhu cầu chăm sóc sức khỏe, bảo hiểm và hỗ trợ sinh hoạt thường tăng vọt sau tuổi 65.</li>
      </ul>
      <blockquote class="editorial-quote">
        <strong>Nguyên tắc cốt lõi cần nhớ:</strong>
        <p>Đặt mục tiêu theo giá hôm nay để dễ hình dung mức sống thực tế, rồi để mô phỏng tự động tính trượt giá lũy kế qua từng tháng tích lũy.</p>
      </blockquote>

      <h2>2. Bảng phân tích & Đối chiếu nhanh quy mô quỹ</h2>
      <p>Ước tính tham khảo cho chu kỳ 25 năm hưu trí (60 đến 85 tuổi), lạm phát 3,5%/năm, danh mục đầu tư tiếp tục sinh lời 6% đến 7%/năm trong giai đoạn rút vốn:</p>
      <div class="table-scroll">
        <table class="detail-specs-table">
          <thead>
            <tr>
              <th scope="col">Mức chi (giá hôm nay)</th>
              <th scope="col">Sau 20 năm (3,5%)</th>
              <th scope="col">Quỹ cần (Không có BHXH)</th>
              <th scope="col">Quỹ cần (Có BHXH 6tr/tháng)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><strong>10 triệu/tháng</strong><br><small class="muted">Tiết kiệm cơ bản</small></td><td>~19,9 triệu</td><td>2,4 đến 2,7 tỷ</td><td class="ed-hl">~1,1 tỷ</td></tr>
            <tr><td><strong>15 triệu/tháng</strong><br><small class="muted">Trung bình khá</small></td><td>~29,8 triệu</td><td>3,6 đến 4,2 tỷ</td><td class="ed-hl">~2,3 tỷ</td></tr>
            <tr><td><strong>20 triệu/tháng</strong><br><small class="muted">Thoải mái, độc lập</small></td><td>~39,8 triệu</td><td>4,8 đến 5,5 tỷ</td><td class="ed-hl">~3,6 tỷ</td></tr>
            <tr><td><strong>30 triệu/tháng</strong><br><small class="muted">An nhàn, du lịch</small></td><td>~59,7 triệu</td><td>7,2 đến 8,4 tỷ</td><td class="ed-hl">~6,3 tỷ</td></tr>
          </tbody>
        </table>
      </div>

      <h2>3. Hướng dẫn 3 bước xác định số vốn cần có</h2>
      <ul class="knowledge-checklist">
        <li>
          <span class="step-num">1</span>
          <div>
            <strong>Ước lượng mức chi tiêu mong muốn</strong>
            <p>Tách riêng chi thiết yếu (ăn uống, điện nước, y tế thường xuyên) và chi tận hưởng (du lịch, hiếu hỉ, sở thích cá nhân) theo mặt bằng giá hiện tại.</p>
          </div>
        </li>
        <li>
          <span class="step-num">2</span>
          <div>
            <strong>Khấu trừ các nguồn thu cố định</strong>
            <p>Trừ đi lương hưu BHXH ước tính hoặc dòng tiền từ bất động sản cho thuê để xác định chính xác khoản thiếu hụt ròng mà quỹ đầu tư cá nhân phải bù đắp.</p>
          </div>
        </li>
        <li>
          <span class="step-num">3</span>
          <div>
            <strong>Áp dụng tỷ lệ rút an toàn 4% - 4,5%</strong>
            <p>Tương đương quy mô quỹ mục tiêu khoảng 220 đến 250 lần chi phí sinh hoạt hàng tháng, giúp tiền của bạn sinh lời bền bỉ mà không cạn kiệt suốt 25 - 30 năm.</p>
          </div>
        </li>
      </ul>
    `,
  },
  {
    id: 'luong-huu-bhxh-tinh-the-nao',
    code: 'KT-02',
    readTime: '6 phút đọc',
    category: 'Bảo hiểm xã hội',
    categoryTag: 'BẢO HIỂM XÃ HỘI',
    strategyTag: 'Luật BHXH mới 2024',
    badgeClass: 'badge-risk-blue',
    badgeText: 'Chính sách mới',
    title: 'Lương hưu BHXH tính thế nào theo quy định mới nhất?',
    sapo: 'Luật Bảo hiểm xã hội số 41/2024/QH15 cập nhật điều kiện hưởng, tỷ lệ hưởng và cách xác định bình quân tiền lương đóng cho người lao động.',
    image: knowledgePlan,
    caption: 'Chuyên đề Bảo hiểm xã hội: Nắm chắc quyền lợi và cách tính lương hưu chính xác.',
    heroLabel: 'TỶ LỆ HƯỞNG TỐI ĐA',
    heroVal: '75%',
    heroUnit: 'lương đóng bình quân',
    subLabel: 'Mốc đóng tối thiểu',
    subVal: '15 năm (Nữ) / 20 năm (Nam)',
    statNote: 'Nam đủ 35 năm, Nữ đủ 30 năm',
    pillText: 'Tỷ lệ tối đa: 75% lương đóng bình quân',
    highlights: [
      'Nam đóng đủ 20 năm hưởng 45%, mỗi năm thêm +2%, tối đa 75% ở 35 năm.',
      'Nữ đóng đủ 15 năm hưởng 45%, đủ 20 năm hưởng 55%, tối đa 75% ở 30 năm.',
      'Lương đóng thường thấp hơn thu nhập thực, bắt buộc cần quỹ tự thân bù đắp.',
    ],
    specs: [
      ['Công thức cơ bản', 'Lương hưu = Tỷ lệ hưởng (%) × Bình quân tiền lương đóng BHXH'],
      ['Lao động Nam', '20 năm = 45%; 35 năm = 75% (mỗi năm thêm +2%)'],
      ['Lao động Nữ', '15 năm = 45%; 20 năm = 55%; 30 năm = 75%'],
      ['Lộ trình tuổi hưu', 'Nam tăng dần lên 62 tuổi (2028), Nữ lên 60 tuổi (2035)'],
    ],
    sectionsHtml: `
      <h2>1. Công thức tính lương hưu hàng tháng</h2>
      <div class="ed-formula">
        <span>Lương hưu hàng tháng</span>
        <b aria-hidden="true">=</b>
        <span>Tỷ lệ hưởng (%)</span>
        <b aria-hidden="true">×</b>
        <span>Bình quân tiền lương tháng đóng BHXH</span>
      </div>
      <p>Trong đó, mức bình quân tiền lương đóng BHXH được tính theo toàn bộ thời gian đóng (đối với người lao động ngoài khu vực nhà nước) và được điều chỉnh trượt giá định kỳ theo hệ số do Bộ Lao động ban hành hàng năm.</p>

      <h2>2. Tỷ lệ hưởng theo số năm đóng BHXH</h2>
      <div class="ed-compare">
        <div>
          <h4>Lao động nam</h4>
          <ul>
            <li><span>Đủ 20 năm đóng BHXH</span><strong>45%</strong></li>
            <li><span>Mỗi năm đóng thêm</span><strong>+2%</strong></li>
            <li><span>Đủ 35 năm đóng BHXH</span><strong>75% (mức tối đa)</strong></li>
          </ul>
        </div>
        <div>
          <h4>Lao động nữ</h4>
          <ul>
            <li><span>Đủ 15 năm đóng BHXH</span><strong>45%</strong></li>
            <li><span>Đủ 20 năm đóng BHXH</span><strong>55%</strong></li>
            <li><span>Đủ 30 năm đóng BHXH</span><strong>75% (mức tối đa)</strong></li>
          </ul>
        </div>
      </div>

      <blockquote class="editorial-quote">
        <strong>Lưu ý mấu chốt về tỷ lệ thay thế thu nhập:</strong>
        <p>Mức lương đóng BHXH của đa số người lao động chỉ chiếm 40% đến 60% tổng thu nhập thực nhận. Vì vậy, đạt mức trần 75% trên lương đóng thực chất chỉ bù đắp được khoảng 30% đến 45% mức sống trước khi nghỉ hưu.</p>
      </blockquote>

      <h2>3. Ba lưu ý người lao động cần biết</h2>
      <ul class="knowledge-checklist">
        <li>
          <span class="step-num">1</span>
          <div>
            <strong>Lộ trình tăng tuổi nghỉ hưu theo Bộ luật Lao động</strong>
            <p>Tuổi nghỉ hưu của nam tăng mỗi năm 3 tháng đến đủ 62 tuổi vào năm 2028; của nữ tăng mỗi năm 4 tháng đến đủ 60 tuổi vào năm 2035. Nghỉ hưu trước tuổi do suy giảm khả năng lao động sẽ bị giảm 2% tỷ lệ hưởng cho mỗi năm nghỉ sớm.</p>
          </div>
        </li>
        <li>
          <span class="step-num">2</span>
          <div>
            <strong>Khoảng trống giữa ngày nghỉ làm và ngày nhận lương hưu</strong>
            <p>Nếu bạn quyết định dừng làm việc ở tuổi 50 hay 55, bạn sẽ phải tự trang trải chi phí trong suốt 5 đến 10 năm chờ đợi cho đến khi đạt độ tuổi đủ điều kiện nhận lương hưu nhà nước.</p>
          </div>
        </li>
        <li>
          <span class="step-num">3</span>
          <div>
            <strong>Chủ động thiết lập quỹ hưu trí bổ sung</strong>
            <p>Đưa số tiền lương hưu dự kiến vào mô phỏng để giảm trừ khoản phải tích lũy, đồng thời xây dựng danh mục tài chính riêng bù đắp phần thiếu hụt cho chi tiêu gia đình.</p>
          </div>
        </li>
      </ul>
    `,
  },
  {
    id: 'thap-tai-san-bao-ve',
    code: 'KT-03',
    readTime: '5 phút đọc',
    category: 'Phân bổ tài sản',
    categoryTag: 'PHÂN BỔ TÀI SẢN',
    strategyTag: 'Tháp tài sản 3 tầng',
    badgeClass: 'badge-risk-green',
    badgeText: 'Quản trị rủi ro',
    title: 'Tách lớp vốn bảo vệ trước khi đầu tư tăng trưởng',
    sapo: 'Giữ quỹ dự phòng 3 đến 6 tháng chi phí và tiền cho mục tiêu gần ngoài danh mục hưu trí, để không bao giờ phải bán tháo tài sản khi thị trường sụt giảm.',
    image: knowledgeTracking,
    caption: 'Chuyên đề Phân bổ tài sản: Nguyên lý cấu trúc tháp tài sản 3 tầng bền vững.',
    heroLabel: 'QUỸ DỰ PHÒNG KHẨN CẤP',
    heroVal: '3 - 6 tháng',
    heroUnit: 'chi phí thiết yếu',
    subLabel: 'Mục tiêu ngắn hạn',
    subVal: 'Khóa an toàn 1-2 năm',
    statNote: 'Bảo toàn thanh khoản tuyệt đối',
    pillText: 'Quỹ dự phòng: 3 - 6 tháng chi phí',
    highlights: [
      'Tách riêng dòng tiền sinh hoạt khẩn cấp khỏi danh mục đầu tư dài hạn.',
      'Dự phòng rủi ro biến cố sức khỏe để không ăn phạm vào vốn gốc tích lũy.',
      'Dịch chuyển dần sang tài sản an toàn khi còn dưới 5 năm đến tuổi nghỉ hưu.',
    ],
    specs: [
      ['Tầng 1: Bảo vệ & Dự phòng', 'Quỹ khẩn cấp 3 - 6 tháng chi phí + Bảo hiểm sức khỏe / nhân thọ'],
      ['Tầng 2: Thu nhập cố định', 'Tiền gửi có kỳ hạn, trái phiếu chính phủ, tích lũy an toàn'],
      ['Tầng 3: Tăng trưởng vốn', 'Quỹ mở cổ phiếu, danh mục hưu trí dài hạn sinh lời bù lạm phát'],
      ['Quy tắc dịch chuyển', 'Chuyển dần từ Tầng 3 sang Tầng 2 khi còn dưới 5 năm đến tuổi hưu'],
    ],
    sectionsHtml: `
      <h2>1. Vì sao nhà đầu tư thường thất bại khi không tách lớp vốn?</h2>
      <p>Sai lầm phổ biến nhất khi tham gia thị trường là dồn toàn bộ tiền nhàn rỗi vào các kênh đầu tư sinh lời cao. Khi gặp biến cố gia đình (mất việc, tai nạn, chi phí y tế đột xuất) hoặc khi thị trường rơi vào giai đoạn điều chỉnh sâu, bạn sẽ buộc phải bán tháo tài sản ở mức giá thấp nhất để có tiền trang trải sinh hoạt.</p>
      <blockquote class="editorial-quote">
        <strong>Nguyên tắc cốt lõi:</strong>
        <p>Bạn chỉ có thể an tâm nắm giữ tài sản tăng trưởng qua các chu kỳ biến động khi biết chắc rằng tiền sinh hoạt 6 tháng tới đã nằm yên trong két an toàn.</p>
      </blockquote>

      <h2>2. Cấu trúc 3 tầng tháp tài sản hưu trí</h2>
      <div class="table-scroll">
        <table class="detail-specs-table">
          <thead>
            <tr>
              <th scope="col">Tầng tài sản</th>
              <th scope="col">Công cụ tài chính</th>
              <th scope="col">Mục tiêu cốt lõi</th>
              <th scope="col">Tỷ trọng khuyến nghị</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><strong>Tầng 1: Bảo vệ</strong></td><td>Tiền gửi linh hoạt, Bảo hiểm sức khỏe</td><td>Bảo toàn thanh khoản, chống sốc tài chính</td><td>3 - 6 tháng chi phí</td></tr>
            <tr><td><strong>Tầng 2: Cố định</strong></td><td>Tiền gửi kỳ hạn, Trái phiếu chính phủ</td><td>Thu nhập đều đặn, giữ vốn an toàn</td><td>30% - 60% tổng vốn</td></tr>
            <tr><td><strong>Tầng 3: Tăng trưởng</strong></td><td>Quỹ mở cổ phiếu, Danh mục tăng trưởng</td><td>Tối đa hóa sinh lời, đánh bại lạm phát</td><td>20% - 50% (giảm dần theo tuổi)</td></tr>
          </tbody>
        </table>
      </div>

      <h2>3. Hướng dẫn 3 bước thiết lập tháp tài sản</h2>
      <ul class="knowledge-checklist">
        <li>
          <span class="step-num">1</span>
          <div>
            <strong>Đo lường chi tiêu tối thiểu và khóa quỹ dự phòng</strong>
            <p>Tính tổng chi phí sinh hoạt bắt buộc hàng tháng và gửi vào tài khoản tiết kiệm linh hoạt có thể rút ngay khi cần.</p>
          </div>
        </li>
        <li>
          <span class="step-num">2</span>
          <div>
            <strong>Thiết lập hàng rào bảo vệ y tế gia đình</strong>
            <p>Trang bị thẻ bảo hiểm sức khỏe hạn mức đủ bảo vệ trước các rủi ro viện phí lớn, ngăn chặn nguy cơ cạn kiệt vốn tích lũy.</p>
          </div>
        </li>
        <li>
          <span class="step-num">3</span>
          <div>
            <strong>Phân bổ vốn tăng trưởng theo độ tuổi</strong>
            <p>Áp dụng quy tắc dịch chuyển: Người trẻ ưu tiên tỷ trọng tăng trưởng cao; người cận kề hưu trí dịch chuyển dần về tài sản có thu nhập cố định.</p>
          </div>
        </li>
      </ul>
    `,
  },
  {
    id: 'lam-phat-va-suc-mua',
    code: 'KT-04',
    readTime: '4 phút đọc',
    category: 'Lạm phát & Sức mua',
    categoryTag: 'LẠM PHÁT & SỨC MUA',
    strategyTag: 'Sức mua thực tế',
    badgeClass: 'badge-risk-green',
    badgeText: 'Quy đổi sức mua',
    title: 'Vì sao tiền hôm nay khác tiền tương lai?',
    sapo: 'Lạm phát làm thay đổi sức mua theo cấp số nhân. Phân biệt rõ số tiền danh nghĩa và sức mua thực tế để không đánh giá thấp số vốn cần cho tuổi già.',
    image: productDeposit,
    caption: 'Chuyên đề Lạm phát: Hiểu rõ tác động của trượt giá đến giỏ hàng hưu trí.',
    heroLabel: 'LẠM PHÁT THAM CHIẾU',
    heroVal: '3,5%/năm',
    heroUnit: 'trượt giá bình quân',
    subLabel: 'Chu kỳ nhân đôi giá',
    subVal: '~20 năm (Quy tắc 72)',
    statNote: 'Ăn mòn sức mua nếu chỉ giữ tiền mặt',
    pillText: 'Lạm phát tham chiếu: 3,5%/năm',
    highlights: [
      'Phân biệt rạch ròi giữa số tiền danh nghĩa và sức mua thực tế của giỏ hàng.',
      'Tỷ suất sinh lời thực = Lãi suất danh nghĩa - Tỷ lệ lạm phát.',
      'Mọi mục tiêu hưu trí cần được chỉ số hóa theo mức sống mong muốn.',
    ],
    specs: [
      ['Hiện tại (Năm 0)', 'Giỏ hàng 15,0 triệu/tháng = 100% sức mua ban đầu'],
      ['Sau 10 năm (3,5%)', 'Cần 21,1 triệu/tháng để duy trì cùng mức sống'],
      ['Sau 20 năm (3,5%)', 'Cần 29,8 triệu/tháng để duy trì cùng mức sống'],
      ['Sau 30 năm (3,5%)', 'Cần 42,1 triệu/tháng để duy trì cùng mức sống'],
    ],
    sectionsHtml: `
      <h2>1. Kẻ thù vô hình của người về hưu</h2>
      <p>Nhiều người cảm thấy an tâm khi có sổ tiết kiệm vài trăm triệu đồng, nhưng quên mất rằng lạm phát âm thầm làm giảm sức mua theo từng năm. Một giỏ hàng hóa thiết yếu trị giá 10 triệu đồng hôm nay sẽ cần gần 20 triệu đồng sau 20 năm để mua cùng lượng hàng hóa tương đương.</p>
      <blockquote class="editorial-quote">
        <strong>Quy tắc 72 trong tài chính:</strong>
        <p>Lấy 72 chia cho tỷ lệ lạm phát hàng năm sẽ ra số năm mà vật giá tăng gấp đôi. Với lạm phát 3,5%/năm: 72 / 3,5 ≈ 20,5 năm. Chi phí sinh hoạt tuổi già sẽ nhân đôi sau mỗi hai thập kỷ!</p>
      </blockquote>

      <h2>2. Bảng quy đổi sức mua của 10 triệu đồng qua các mốc thời gian</h2>
      <div class="table-scroll">
        <table class="detail-specs-table">
          <thead>
            <tr>
              <th scope="col">Mốc thời gian</th>
              <th scope="col">Số tiền cần để mua cùng lượng hàng</th>
              <th scope="col">Sức mua còn lại của 10 triệu</th>
              <th scope="col">Mức độ sụt giảm</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><strong>Hiện tại</strong></td><td>10,0 triệu đồng</td><td>10,0 triệu</td><td>100% (Gốc)</td></tr>
            <tr><td><strong>Sau 5 năm</strong></td><td>11,9 triệu đồng</td><td>8,4 triệu</td><td>-16% sức mua</td></tr>
            <tr><td><strong>Sau 10 năm</strong></td><td>14,1 triệu đồng</td><td>7,1 triệu</td><td>-29% sức mua</td></tr>
            <tr><td><strong>Sau 15 năm</strong></td><td>16,8 triệu đồng</td><td>6,0 triệu</td><td>-40% sức mua</td></tr>
            <tr><td><strong>Sau 20 năm</strong></td><td>19,9 triệu đồng</td><td>5,0 triệu</td><td>-50% sức mua</td></tr>
          </tbody>
        </table>
      </div>

      <h2>3. Ba cách phòng hộ lạm phát cho kế hoạch hưu trí</h2>
      <ul class="knowledge-checklist">
        <li>
          <span class="step-num">1</span>
          <div>
            <strong>Lập kế hoạch theo giỏ chi tiêu thay vì số tiền tĩnh</strong>
            <p>Quy đổi toàn bộ mục tiêu theo mặt bằng giá hôm nay để hệ thống tự động tính trượt giá danh nghĩa qua từng năm.</p>
          </div>
        </li>
        <li>
          <span class="step-num">2</span>
          <div>
            <strong>Đầu tư vào tài sản sinh lời thực dương</strong>
            <p>Chọn các kênh đầu tư có tỷ suất sinh lời vượt lạm phát từ 3% đến 5%/năm (quỹ cổ phiếu, chứng chỉ quỹ) trong giai đoạn tích lũy.</p>
          </div>
        </li>
        <li>
          <span class="step-num">3</span>
          <div>
            <strong>Nâng mức góp tích lũy theo tỷ lệ tăng thu nhập</strong>
            <p>Mỗi khi lương tăng hoặc thu nhập cải thiện, nâng tỷ lệ trích góp tương ứng để danh mục tích sản không bị lạm phát bỏ lại.</p>
          </div>
        </li>
      </ul>
    `,
  },
  {
    id: 'ky-luat-tich-luy',
    code: 'KT-05',
    readTime: '4 phút đọc',
    category: 'Kỷ luật tích lũy',
    categoryTag: 'KỶ LUẬT TÍCH LŨY',
    strategyTag: 'DCA & Lãi kép',
    badgeClass: 'badge-risk-blue',
    badgeText: 'Lãi kép bền vững',
    title: 'Góp đều mỗi tháng và sức mạnh của thời gian',
    sapo: 'Bắt đầu sớm cho thêm thời gian. Góp đều vừa sức bền vững hơn cố đoán đỉnh đáy thị trường. Lãi kép chỉ thực sự bộc lộ sức mạnh sau 10 đến 15 năm.',
    image: knowledgePlan,
    caption: 'Chuyên đề Kỷ luật tích lũy: Sức mạnh lãi kép khi duy trì kỷ luật dài hạn.',
    heroLabel: 'TÀI SẢN TỪ LÃI KÉP',
    heroVal: '> 60%',
    heroUnit: 'tổng quỹ cuối kỳ',
    subLabel: 'Lợi thế bắt đầu sớm',
    subVal: 'Góp ít hơn 3 lần',
    statNote: 'So với bắt đầu muộn ở tuổi 45',
    pillText: 'Bắt đầu sớm: Góp ít hơn 3 lần',
    highlights: [
      'Góp đều hàng tháng giúp bình quân giá vốn và loại bỏ áp lực tâm lý.',
      'Thời gian tích lũy dài quan trọng hơn việc cố tìm tỷ suất sinh lời vượt trội.',
      'Tự động hóa trích lập đầu tháng thay vì tiết kiệm số tiền còn thừa.',
    ],
    specs: [
      ['Bắt đầu tuổi 25', 'Góp 2,8 triệu/tháng × 35 năm (lãi 7%) → Đạt ~5,4 tỷ'],
      ['Bắt đầu tuổi 35', 'Góp 6,2 triệu/tháng × 25 năm (lãi 7%) → Đạt ~5,2 tỷ'],
      ['Bắt đầu tuổi 45', 'Góp 15,8 triệu/tháng × 15 năm (lãi 7%) → Đạt ~5,2 tỷ'],
      ['Nguyên tắc góp', 'Tiết kiệm trước khi chi tiêu, không tiết kiệm số tiền còn thừa'],
    ],
    sectionsHtml: `
      <h2>1. Sức mạnh cấp số nhân của lãi kép qua chu kỳ 20 năm</h2>
      <p>Albert Einstein từng gọi lãi kép là kỳ quan thứ 8 của thế giới: "Ai hiểu được nó sẽ kiếm được tiền; ai không hiểu sẽ phải trả giá cho nó". Khi bạn bắt đầu tích lũy sớm, tiền lãi sinh ra ở các năm đầu tiếp tục sinh lãi ở các năm sau, tạo nên đường cong tài sản tăng vọt về cuối kỳ.</p>
      <blockquote class="editorial-quote">
        <strong>Bài học từ nhà đầu tư kiên nhẫn:</strong>
        <p>Hơn 80% giá trị gia tăng của một kế hoạch hưu trí 30 năm được tạo ra trong 10 năm cuối cùng nhờ hiệu ứng quả cầu tuyết của lãi kép.</p>
      </blockquote>

      <h2>2. So sánh đối chứng giữa 3 mốc tuổi bắt đầu để đạt 5 tỷ ở tuổi 60</h2>
      <div class="table-scroll">
        <table class="detail-specs-table">
          <thead>
            <tr>
              <th scope="col">Tuổi bắt đầu</th>
              <th scope="col">Thời gian tích lũy</th>
              <th scope="col">Mức góp mỗi tháng</th>
              <th scope="col">Tổng vốn tự bỏ ra</th>
              <th scope="col">Phần lãi kép sinh ra</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><strong>Tuổi 25</strong></td><td>35 năm</td><td><strong>2,8 triệu/tháng</strong></td><td>~1,18 tỷ</td><td class="ed-hl">~3,82 tỷ (>70%)</td></tr>
            <tr><td><strong>Tuổi 35</strong></td><td>25 năm</td><td><strong>6,2 triệu/tháng</strong></td><td>~1,86 tỷ</td><td class="ed-hl">~3,14 tỷ (~60%)</td></tr>
            <tr><td><strong>Tuổi 45</strong></td><td>15 năm</td><td><strong>15,8 triệu/tháng</strong></td><td>~2,84 tỷ</td><td>~2,16 tỷ (<45%)</td></tr>
          </tbody>
        </table>
      </div>

      <h2>3. Hướng dẫn 3 thói quen tự động hóa kỷ luật tích lũy</h2>
      <ul class="knowledge-checklist">
        <li>
          <span class="step-num">1</span>
          <div>
            <strong>Đặt lệnh trích tiền tự động ngay khi có lương</strong>
            <p>Trích ngay 15% đến 25% thu nhập sang tài khoản tích lũy vào ngày nhận lương hàng tháng, trước khi kịp phân bổ cho các nhu cầu chi tiêu khác.</p>
          </div>
        </li>
        <li>
          <span class="step-num">2</span>
          <div>
            <strong>Tái đầu tư toàn bộ cổ tức và tiền lãi phát sinh</strong>
            <p>Không rút lợi tức tiêu xài mà tự động gộp vào vốn gốc để kích hoạt tối đa hiệu ứng lãi kép liên tục.</p>
          </div>
        </li>
        <li>
          <span class="step-num">3</span>
          <div>
            <strong>Bỏ qua những biến động ngắn hạn của thị trường</strong>
            <p>Kiên định mua đều đặn theo phương pháp DCA (bình quân giá), coi các đợt điều chỉnh giảm giá là cơ hội tích lũy tài sản với giá tốt.</p>
          </div>
        </li>
      </ul>
    `,
  },
  {
    id: 'doi-soat-so-du',
    code: 'KT-06',
    readTime: '4 phút đọc',
    category: 'Theo dõi & Quản trị',
    categoryTag: 'THEO DÕI & QUẢN TRỊ',
    strategyTag: 'Quản trị phiên bản',
    badgeClass: 'badge-risk-green',
    badgeText: 'Định kỳ đối soát',
    title: 'Kiểm toán đối soát và quản trị số dư quỹ hưu',
    sapo: 'Kế hoạch hưu trí không phải bản vẽ chết. Định kỳ kiểm tra số dư thực tế, so sánh với đường dự phóng và tinh chỉnh khi cuộc sống có thay đổi lớn.',
    image: knowledgeTracking,
    caption: 'Chuyên đề Theo dõi: Quản trị phiên bản và đối soát số dư kế hoạch thường niên.',
    heroLabel: 'TẦN SUẤT ĐỐI SOÁT',
    heroVal: '1 - 2 lần',
    heroUnit: 'mỗi năm',
    subLabel: 'Ngưỡng kích hoạt điều chỉnh',
    subVal: '±5% tỷ trọng tài sản',
    statNote: 'Tái cân bằng dòng tiền đóng mới',
    pillText: 'Tần suất đối soát: 1 - 2 lần/năm',
    highlights: [
      'Cập nhật số dư thực tế vào sổ tay để theo dõi sát sao đường dự phóng.',
      'Tái cân bằng khi danh mục có sự xê dịch tỷ trọng vượt quá 5%.',
      'Lưu trữ các phiên bản kế hoạch để đánh giá tiến độ kỷ luật theo từng năm.',
    ],
    specs: [
      ['Tần suất đối soát', '6 tháng hoặc 1 năm một lần (thường vào cuối quý 4)'],
      ['Tiêu chí kiểm tra', 'Số dư thực tế vs Dự phóng, tỷ trọng lớp tài sản, dòng tiền'],
      ['Hành động điều chỉnh', 'Tái cân bằng nếu lệch > 5%, cập nhật khi đổi việc/thu nhập'],
      ['Công cụ hỗ trợ', 'Tính năng Quản trị kế hoạch và Sổ tay tài sản trên An Hưu'],
    ],
    sectionsHtml: `
      <h2>1. Vì sao kế hoạch tài chính cần được đối soát thường xuyên?</h2>
      <p>Cuộc sống luôn có những biến số khó lường trước: tăng lương, chuyển việc, biến cố y tế, thị trường tăng hoặc giảm mạnh. Một kế hoạch tài chính lập ra năm 30 tuổi chắc chắn sẽ cần những tinh chỉnh phù hợp khi bạn bước sang tuổi 35 hay 40.</p>
      <blockquote class="editorial-quote">
        <strong>Triết lý quản trị kế hoạch An Hưu:</strong>
        <p>Lập kế hoạch không phải để đoán trúng tương lai, mà để luôn có phương án hành động rõ ràng và chủ động khi tương lai xảy ra khác với dự tính ban đầu.</p>
      </blockquote>

      <h2>2. Bảng checklist 5 điểm đối soát tài chính thường niên</h2>
      <div class="table-scroll">
        <table class="detail-specs-table">
          <thead>
            <tr>
              <th scope="col">Hạng mục kiểm tra</th>
              <th scope="col">Nội dung đối soát</th>
              <th scope="col">Hành động khi có sai lệch</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><strong>1. Số dư thực tế</strong></td><td>Đối chiếu tổng tài sản hiện có với đường dự phóng mục tiêu</td><td>Nếu thấp hơn dự kiến: tăng nhẹ mức góp tháng</td></tr>
            <tr><td><strong>2. Tỷ trọng tài sản</strong></td><td>Cổ phiếu - Trái phiếu - Tiền gửi có bị lệch > 5%?</td><td>Dùng dòng tiền đóng mới để cân bằng lại</td></tr>
            <tr><td><strong>3. Mức chi tiêu</strong></td><td>Chi tiêu gia đình 12 tháng qua có tăng vượt lạm phát?</td><td>Cập nhật mức chi tiêu kỳ vọng mới vào mô phỏng</td></tr>
            <tr><td><strong>4. Lương hưu BHXH</strong></td><td>Cập nhật số năm đóng mới và mức lương đóng mới</td><td>Giảm trừ phần quỹ cá nhân cần chuẩn bị</td></tr>
            <tr><td><strong>5. Lưu phiên bản</strong></td><td>Lưu trữ snapshot kế hoạch hưu trí cho năm tiếp theo</td><td>Ghi chép lại các quyết định tài chính quan trọng</td></tr>
          </tbody>
        </table>
      </div>

      <h2>3. Hướng dẫn 3 bước tái cân bằng danh mục hưu trí</h2>
      <ul class="knowledge-checklist">
        <li>
          <span class="step-num">1</span>
          <div>
            <strong>Chọn một ngày cố định trong năm để kiểm kê tài sản</strong>
            <p>Nhiều người chọn tuần cuối cùng của tháng 12 để tổng kết tài sản, kiểm tra số dư tại các ngân hàng và tài khoản đầu tư.</p>
          </div>
        </li>
        <li>
          <span class="step-num">2</span>
          <div>
            <strong>So sánh tỷ trọng thực tế với tỷ trọng mục tiêu</strong>
            <p>Nếu cổ phiếu tăng mạnh khiến tỷ trọng vượt quá trần chịu rủi ro an toàn, bạn cần có kế hoạch hạ bớt tỷ trọng rủi ro.</p>
          </div>
        </li>
        <li>
          <span class="step-num">3</span>
          <div>
            <strong>Tái cân bằng bằng dòng tiền mới</strong>
            <p>Thay vì bán tài sản đang sinh lời (phải chịu thuế và phí), hãy dùng dòng tiền tích lũy của các tháng tiếp theo để mua bổ sung vào lớp tài sản đang thiếu hụt.</p>
          </div>
        </li>
      </ul>
    `,
  },
];
