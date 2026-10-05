import type { IconName } from '../components/ui';

export const marketingNavigation = [
  { path: '/', label: 'Trang chủ' },
  { path: '/cach-hoat-dong', label: 'Cách hoạt động' },
  { path: '/mo-phong', label: 'Mô phỏng' },
  { path: '/tro-ly-ai', label: 'Trợ lý AI' },
  { path: '/kien-thuc', label: 'Kiến thức' },
];

export const features: { title: string; text: string; icon: IconName; path: string }[] = [
  { title: 'Mục tiêu của riêng bạn', text: 'Bắt đầu từ tuổi nghỉ hưu và cuộc sống bạn mong muốn.', icon: 'target', path: '/cach-hoat-dong' },
  { title: 'Bức tranh tài chính', text: 'Kết nối thu nhập, chi tiêu và tài sản trong một kế hoạch.', icon: 'wallet', path: '/cach-hoat-dong' },
  { title: 'Tích lũy từng tháng', text: 'Nhìn rõ tác động của những khoản dành dụm hôm nay.', icon: 'chart', path: '/mo-phong' },
  { title: 'Thử nhiều kịch bản', text: 'Thay đổi tuổi nghỉ hưu, so sánh những hướng đi khác nhau.', icon: 'compass', path: '/mo-phong' },
  { title: 'Trợ lý dễ trò chuyện', text: 'Khám phá các câu hỏi thường gặp về kế hoạch hưu trí.', icon: 'sparkles', path: '/tro-ly-ai' },
  { title: 'Kiến thức dễ hiểu', text: 'Hiểu những khái niệm tài chính, từng bài viết một.', icon: 'file-text', path: '/kien-thuc' },
  { title: 'Theo dõi hành trình', text: 'Xem lại mục tiêu khi thu nhập và cuộc sống thay đổi.', icon: 'circle-check', path: '/cach-hoat-dong' },
  { title: 'Chủ động bắt đầu', text: 'Thử mô phỏng ngay, chưa cần tạo tài khoản.', icon: 'mouse-pointer', path: '/mo-phong' },
];

export const steps = [
  { title: 'Hiểu hiện tại', text: 'Ghi lại tuổi, tài sản và số tiền bạn có thể tích lũy mỗi tháng.', icon: 'wallet' as const },
  { title: 'Vẽ tương lai', text: 'Chọn thời điểm nghỉ hưu và mức chi tiêu mong muốn.', icon: 'target' as const },
  { title: 'Thử các khả năng', text: 'Điều chỉnh giả định để nhìn rõ tác động đến kế hoạch.', icon: 'chart' as const },
  { title: 'Đi từng bước nhỏ', text: 'Lưu kế hoạch và cập nhật khi cuộc sống có thay đổi.', icon: 'circle-check' as const },
];

export const assistantExamples = [
  {
    question: 'Tôi 35 tuổi, nên bắt đầu tích lũy bao nhiêu mỗi tháng?',
    tabLabel: '35 tuổi tích lũy',
    takeaway: 'Tích lũy 15% - 20% thu nhập; sau 25 năm tạo lập quỹ hưu trí nền tảng vững chắc',
    answer: 'Nguyên tắc phổ biến là dành 15% - 20% thu nhập hàng tháng cho hưu trí. Ví dụ với thu nhập 30 triệu/tháng, tích lũy đều đặn 5 - 6 triệu/tháng với lợi suất giả định 7%/năm sau 25 năm sẽ tạo dựng một quỹ hơn 4,8 tỷ đồng. Bạn có thể mở mục Mô phỏng để thử con số chính xác theo thu nhập của mình.',
    category: 'Khởi đầu',
  },
  {
    question: 'Nếu tôi muốn nghỉ hưu sớm ở tuổi 50 thì kế hoạch thay đổi ra sao?',
    tabLabel: 'Nghỉ hưu sớm 50t',
    takeaway: 'Tác động kép: giảm 10 năm tích lũy lãi kép, tăng 10 năm dòng tiền chi trả',
    answer: 'Nghỉ hưu sớm ở tuổi 50 có tác động kép: thời gian tích lũy ngắn đi 10 năm (mất đi giai đoạn lãi kép mạnh nhất) và thời gian quỹ phải chi trả kéo dài thêm 10 năm (từ 25 năm lên 35 năm). Bạn cần tăng tỷ lệ tiết kiệm lên 35% - 45% thu nhập hoặc hạ thấp mức chi tiêu kỳ vọng sau nghỉ hưu.',
    category: 'FIRE / Hưu sớm',
  },
  {
    question: 'Lương hưu BHXH đóng 20 năm thì nhận được bao nhiêu % lương?',
    tabLabel: 'Lương hưu BHXH',
    takeaway: 'Mức hưởng 45% - 55% trên lương đóng; cần thêm quỹ tự nguyện để bù đắp thực tế',
    answer: 'Với nam giới đóng 20 năm BHXH, tỷ lệ hưởng là 45% mức bình quân lương đóng; với nữ giới đóng 20 năm, tỷ lệ hưởng là 55%. Do lương đóng thường thấp hơn thu nhập thực nhận, lương hưu BHXH nên được xem là lưới bảo vệ tối thiểu, cần quỹ hưu trí riêng bổ trợ.',
    category: 'An sinh xã hội',
  },
];

export const assistantCapabilities = [
  { icon: 'chart' as IconName, title: 'Phân tích độ nhạy đa kịch bản', text: 'Thử nghiệm ngay lập tức khi lạm phát tăng ±1,5%, biến động lãi suất hoặc thay đổi thời điểm nghỉ hưu để kiểm tra độ bền của kế hoạch.' },
  { icon: 'sparkles' as IconName, title: 'Chuyển ngữ đời sống trực quan', text: 'Diễn giải các khái niệm tài chính phức tạp (lãi kép, tỷ lệ thay thế thu nhập, giá trị tương lai) thành con số chi tiêu mỗi ngày dễ hiểu.' },
  { icon: 'compass' as IconName, title: 'Định vị khoảng thiếu hụt (Gap)', text: 'Chỉ rõ chênh lệch giữa quỹ dự kiến đạt được và số tiền cần thiết để duy trì mức sống mong muốn, kèm gợi ý khoản bù đắp khả thi.' },
  { icon: 'circle-check' as IconName, title: 'Bảo mật & Quyền riêng tư cao', text: 'Mọi tính toán trải nghiệm chạy trực tiếp trên thiết bị của bạn. Không yêu cầu khai báo tài khoản ngân hàng hay dữ liệu nhạy cảm.' },
];

export const assistantComparison = [
  { criterion: 'Tính toán lạm phát lũy kế', manual: 'Thường bị bỏ quên hoặc chỉ tính cộng đơn giản', anhuu: 'Tự động tính lạm phát kép theo sức mua thực tế qua từng năm' },
  { criterion: 'Mô phỏng chu kỳ sau nghỉ hưu', manual: 'Khó tính chính xác dòng tiền chi tiêu rút dần 25 - 30 năm', anhuu: 'Mô phỏng chi tiết dòng tiền rút và phần vốn còn lại sinh lời tiếp' },
  { criterion: 'Stress-test rủi ro thị trường', manual: 'Không có kịch bản khi lãi suất giảm hoặc sống thọ hơn', anhuu: 'Tùy biến nhanh các kịch bản thận trọng, cân bằng và tối ưu' },
  { criterion: 'Thời gian thiết lập kịch bản', manual: 'Tốn hàng giờ lập bảng tính Excel phức tạp', anhuu: 'Chỉ mất 2 phút điều chỉnh trực quan với phản hồi tức thì' },
  { criterion: 'Tính khách quan & Độc lập', manual: 'Dễ bị chi phối bởi nhân viên bán bảo hiểm/quỹ', anhuu: '100% độc lập, không ăn hoa hồng, không thiên vị bất kỳ tổ chức nào' },
];

export const assistantFaqs = [
  { q: 'Trợ lý An Hưu đưa ra lời khuyên dựa trên cơ sở nào?', a: 'Trợ lý dựa trên các quy chuẩn toán học tài chính cá nhân được thừa nhận rộng rãi (chiết khấu dòng tiền, giá trị tương lai kép, nguyên lý bảo toàn vốn hưu trí) và dữ liệu giả định do chính bạn cung cấp.' },
  { q: 'Tôi có cần chia sẻ thông tin tài chính cá nhân không?', a: 'Không. Bạn có thể sử dụng các số liệu ước tính hoặc số liệu mẫu có sẵn để khám phá. Chúng tôi không yêu cầu số CMND/CCCD, số tài khoản hay mật khẩu ngân hàng.' },
  { q: 'An Hưu có liên kết để bán sản phẩm tài chính cụ thể nào không?', a: 'Không. An Hưu là nền tảng quản trị và mô phỏng tài chính độc lập. Chúng tôi không nhận hoa hồng môi giới để điều hướng bạn mua bất kỳ sản phẩm tài chính nào.' },
  { q: 'Khi nào tôi nên cập nhật lại kế hoạch hưu trí?', a: 'Bạn nên rà soát lại kế hoạch khi có thay đổi lớn trong cuộc sống: tăng lương, chuyển việc, lập gia đình, sinh con, hoàn tất trả nợ mua nhà, hoặc định kỳ mỗi năm một lần.' },
];

export const knowledgePillars = [
  { step: '01', title: 'Sức mạnh thời gian', highlight: 'Bắt đầu sớm hơn quan trọng hơn bắt đầu nhiều hơn', text: 'Nhờ lãi kép, người bắt đầu tích lũy 3 triệu/tháng ở tuổi 25 thường có quỹ hưu trí lớn hơn người bắt đầu 7 triệu/tháng ở tuổi 40, dù tổng số tiền bỏ ra ít hơn gần một nửa.' },
  { step: '02', title: 'Đo lường theo sức mua', highlight: 'Đừng nhìn số tiền danh nghĩa, hãy nhìn giá trị bữa ăn', text: '1 tỷ đồng hôm nay mua được một căn hộ nhỏ, nhưng sau 25 năm với lạm phát 4% chỉ còn sức mua tương đương 375 triệu. Mọi kế hoạch hưu trí bắt buộc phải neo theo sức mua thực tế.' },
  { step: '03', title: 'Chiến lược kiềng ba chân', highlight: 'Không đặt toàn bộ niềm tin vào một nguồn duy nhất', text: 'Tuổi già bền vững cần kiềng 3 chân: Lương hưu BHXH (nền an sinh), Quỹ tích lũy cá nhân (tự do tài chính), và Bảo hiểm y tế (bảo vệ nguồn tiền trước viện phí).' },
];

export const retirementGlossary = [
  { term: 'Tỷ lệ thay thế thu nhập (Income Replacement Rate)', meaning: 'Tỷ lệ phần trăm thu nhập cần duy trì sau khi nghỉ hưu so với thu nhập trước đó. Mức chuẩn quốc tế khuyến nghị là 70% - 75% để giữ trọn vẹn chất lượng sống.' },
  { term: 'Quỹ hưu trí mục tiêu (Target Nest Egg)', meaning: 'Tổng số tiền cần tích lũy tính đến ngày đầu tiên nghỉ hưu, đủ để chi trả sinh hoạt phí cho suốt những năm còn lại kết hợp với lợi suất an toàn.' },
  { term: 'Khoảng thiếu hụt hưu trí (Retirement Gap)', meaning: 'Chênh lệch âm giữa số tiền bạn dự kiến có được và số tiền thực sự cần để nghỉ hưu theo mong muốn. Nhận diện gap càng sớm thì chi phí bù đắp mỗi tháng càng thấp.' },
  { term: 'Lạm phát chăm sóc sức khỏe (Healthcare Inflation)', meaning: 'Tốc độ tăng chi phí dịch vụ y tế, thuốc men và viện phí. Chỉ số này thường tăng từ 6% - 10%/năm, cao hơn mức lạm phát hàng tiêu dùng thông thường.' },
];

export const pageMetadata: Record<string, { title: string; description: string }> = {
  '/': { title: 'An Hưu | Lập kế hoạch tài chính hưu trí cho người Việt', description: 'Chủ động chuẩn bị cho tuổi hưu cùng An Hưu. Khám phá lộ trình tích lũy, thử mô phỏng hưu trí và tìm hiểu kiến thức tài chính dễ hiểu.' },
  '/cach-hoat-dong': { title: 'Cách hoạt động | Lập kế hoạch hưu trí với An Hưu', description: 'Tìm hiểu bốn bước lập kế hoạch với An Hưu: tổng hợp tài chính, xác định mục tiêu, mô phỏng kịch bản và theo dõi hành trình hưu trí.' },
  '/mo-phong': { title: 'Mô phỏng hưu trí | Tính quỹ tích lũy cùng An Hưu', description: 'Thử mô phỏng hưu trí miễn phí. Điều chỉnh tuổi nghỉ hưu, tích lũy hàng tháng, lợi suất và lạm phát để so sánh quỹ dự kiến với mục tiêu.' },
  '/tro-ly-ai': { title: 'Trợ lý AI An Hưu | Tìm hiểu kế hoạch hưu trí', description: 'Khám phá trợ lý An Hưu qua các câu hỏi mẫu về mục tiêu, tích lũy và mô phỏng hưu trí. Nội dung minh họa minh bạch, dễ hiểu.' },
  '/kien-thuc': { title: 'Kiến thức hưu trí và tài chính cá nhân | An Hưu', description: 'Đọc kiến thức nền tảng về lập kế hoạch hưu trí, lạm phát và tích lũy dài hạn. Những bài viết dễ hiểu để bắt đầu cùng An Hưu.' },
};

export function normalizePublicPath(path: string) { return path.replace(/\/+$/, '') || '/'; }

