import type { IconName } from '../components/ui';

export const marketingNavigation = [
  { path: '/', label: 'Trang chủ' },
  { path: '/cach-hoat-dong', label: 'Cách hoạt động' },
  { path: '/mo-phong', label: 'Mô phỏng' },
  { path: '/tro-ly-ai', label: 'Trợ lý AI' },
];

export const features: { title: string; text: string; icon: IconName; path: string }[] = [
  { title: 'Biết mình cần bao nhiêu', text: 'Từ mức chi theo giá hôm nay, ước tính quỹ cần có khi nghỉ hưu.', icon: 'target', path: '/mo-phong' },
  { title: 'Bức tranh tài chính', text: 'Kết nối thu nhập, chi tiêu và tài sản trong một kế hoạch.', icon: 'wallet', path: '/cach-hoat-dong' },
  { title: 'Chọn bước từ tháng này', text: 'Xem khoản góp cần thiết và thử điều chỉnh theo khả năng của bạn.', icon: 'chart', path: '/mo-phong' },
  { title: 'Thử nhiều kịch bản', text: 'Thay đổi tuổi nghỉ hưu, so sánh những hướng đi khác nhau.', icon: 'compass', path: '/mo-phong' },
  { title: 'Trợ lý dễ trò chuyện', text: 'Khám phá các câu hỏi thường gặp về kế hoạch hưu trí.', icon: 'sparkles', path: '/tro-ly-ai' },
  { title: 'Hiểu năm nhóm tài sản', text: 'Hiểu vai trò từng nhóm và thử tỷ trọng trong phần quỹ hưu trí.', icon: 'file-text', path: '/mo-phong#phan-bo' },
  { title: 'Theo dõi hành trình', text: 'Xem lại mục tiêu khi thu nhập và cuộc sống thay đổi.', icon: 'circle-check', path: '/cach-hoat-dong' },
  { title: 'Chủ động bắt đầu', text: 'Thử mô phỏng ngay, chưa cần tạo tài khoản.', icon: 'mouse-pointer', path: '/mo-phong' },
];

export const steps = [
  { title: 'Hiểu hiện tại', text: 'Ghi lại tuổi, tài sản và số tiền bạn có thể tích lũy mỗi tháng.', icon: 'wallet' as const },
  { title: 'Vẽ tương lai', text: 'Chọn thời điểm nghỉ hưu và mức chi tiêu mong muốn.', icon: 'target' as const },
  { title: 'Thử các khả năng', text: 'Điều chỉnh giả định để nhìn rõ tác động đến kế hoạch.', icon: 'chart' as const },
  { title: 'Đi từng bước nhỏ', text: 'Lưu kế hoạch và cập nhật khi cuộc sống có thay đổi.', icon: 'circle-check' as const },
];

export interface AssistantExample {
  question: string;
  tabLabel?: string;
  takeaway?: string;
  answer: string;
  category: string;
  actionLabel?: string;
  scenarioName?: string;
  scenarioParams?: {
    currentAge?: number;
    retirementAge?: number;
    lifeExpectancy?: number;
    cashSavings?: number;
    monthlyExpenseToday?: number;
    monthlyContribution?: number;
    annualReturnRate?: number;
    annualInflationRate?: number;
  };
}

export const assistantExamples: AssistantExample[] = [
  {
    question: 'Tôi 35 tuổi, nên bắt đầu tích lũy bao nhiêu mỗi tháng?',
    tabLabel: '35 tuổi tích lũy',
    takeaway: 'Bắt đầu từ mức chi mong muốn và khoản có thể dành ra mỗi tháng',
    answer: 'Cùng thử một ví dụ: 35 tuổi, nghỉ ở tuổi 60, chưa có vốn ban đầu và góp 6 triệu đồng mỗi tháng. Với lợi suất giả định 7%/năm, công cụ sẽ so sánh quỹ tích lũy với mục tiêu chi 20 triệu đồng/tháng theo giá hôm nay. Mở mô phỏng để xem khoảng thiếu và thử khoản góp khác theo ngân sách của bạn.',
    category: 'Khởi đầu',
    actionLabel: 'Áp dụng kịch bản này vào Mô phỏng',
    scenarioName: '35 tuổi tích lũy 6 triệu/tháng',
    scenarioParams: {
      currentAge: 35,
      retirementAge: 60,
      monthlyContribution: 6000000,
      annualReturnRate: 7,
      cashSavings: 0,
      monthlyExpenseToday: 20000000,
    },
  },
  {
    question: 'Nếu tôi muốn nghỉ hưu sớm ở tuổi 50 thì kế hoạch thay đổi ra sao?',
    tabLabel: 'Nghỉ hưu sớm 50t',
    takeaway: 'Tác động kép: giảm 10 năm tích lũy lãi kép, tăng 10 năm dòng tiền chi trả',
    answer: 'Nếu giữ mốc dự trù đến tuổi 85, nghỉ ở tuổi 50 thay vì 60 nghĩa là bớt 10 năm tích lũy và thêm 10 năm cần chi trả. Hãy thử mức góp 12 triệu đồng/tháng và chi tiêu 20 triệu đồng/tháng theo giá hôm nay, rồi so sánh với khả năng thực tế. Đây là kịch bản để khám phá, chưa phải kế hoạch được khuyến nghị.',
    category: 'FIRE / Hưu sớm',
    actionLabel: 'Áp dụng kịch bản này vào Mô phỏng',
    scenarioName: 'Nghỉ hưu sớm ở tuổi 50',
    scenarioParams: {
      currentAge: 35,
      retirementAge: 50,
      lifeExpectancy: 85,
      monthlyContribution: 12000000,
      monthlyExpenseToday: 20000000,
      annualReturnRate: 6,
    },
  },
  {
    question: 'Lương hưu BHXH đóng 20 năm thì nhận được bao nhiêu % lương?',
    tabLabel: 'Lương hưu BHXH',
    takeaway: 'Mức hưởng 45% - 55% trên lương đóng; cần thêm quỹ tự nguyện để bù đắp thực tế',
    answer: 'Với nam giới đóng 20 năm BHXH, tỷ lệ hưởng là 45% mức bình quân lương đóng; với nữ giới đóng 20 năm, tỷ lệ hưởng là 55%. Do lương đóng thường thấp hơn thu nhập thực nhận, lương hưu BHXH nên được xem là lưới bảo vệ tối thiểu, cần quỹ hưu trí riêng bổ trợ.',
    category: 'An sinh xã hội',
    actionLabel: 'Mở công cụ mô phỏng',
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

export const pageMetadata: Record<string, { title: string; description: string }> = {
  '/': { title: 'An Hưu | Lập kế hoạch tài chính hưu trí cho người Việt', description: 'Chủ động chuẩn bị cho tuổi hưu cùng An Hưu. Khám phá lộ trình tích lũy, thử mô phỏng hưu trí và tìm hiểu kiến thức tài chính dễ hiểu.' },
  '/cach-hoat-dong': { title: 'Cách hoạt động | Lập kế hoạch hưu trí với An Hưu', description: 'Tìm hiểu bốn bước lập kế hoạch với An Hưu: tổng hợp tài chính, xác định mục tiêu, mô phỏng kịch bản và theo dõi hành trình hưu trí.' },
  '/mo-phong': { title: 'Mô phỏng hưu trí | Tính quỹ tích lũy cùng An Hưu', description: 'Thử mô phỏng hưu trí miễn phí. Điều chỉnh tuổi nghỉ hưu, tích lũy hàng tháng, lợi suất và lạm phát để so sánh quỹ dự kiến với mục tiêu.' },
  '/tro-ly-ai': { title: 'Trợ lý AI An Hưu | Tìm hiểu kế hoạch hưu trí', description: 'Khám phá trợ lý An Hưu qua các câu hỏi mẫu về mục tiêu, tích lũy và mô phỏng hưu trí. Nội dung minh họa minh bạch, dễ hiểu.' },
};

export function normalizePublicPath(path: string) { return path.replace(/\/+$/, '') || '/'; }

