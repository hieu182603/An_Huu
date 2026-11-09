import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router";
import { Alert, Button, Card, Icon, Input, Modal, Textarea, useNotification } from "../components/ui";
import { useI18n } from "../i18n";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { listPublicProducts, requestProductConsult, type ProductItem, type PartnerItem, type RiskLevel } from "../services/catalog";
import "./explore-products.css";

type SortKey = "default" | "rate_desc" | "risk" | "min_asc" | "name";
type MarketTab = "explore" | "matched" | "compare" | "saved" | "referrals";
const RISK_ORDER: Record<string, number> = { VERY_LOW: 0, LOW: 1, MEDIUM: 2, HIGH: 3, VERY_HIGH: 4 };

export interface ExtendedProductItem {
  id: string;
  name: string;
  category: string;
  expectedReturn: string;
  riskLevel: RiskLevel;
  description: string | null;
  code?: string;
  riskRaw?: "very_low" | "low" | "moderate" | "high" | "very_high";
  strategyTag?: string;
  partnerId?: string;
  partner?: Partial<PartnerItem> & { id?: string; name: string };
  annualFee?: string | null;
  conditions?: string | null;
  disclosure?: string | null;
  imageUrl?: string | null;
  metric1Label?: string;
  metric1Val?: string;
  metric2Label?: string;
  metric2Val?: string;
  imageCategory?: "deposit" | "investment" | "bond" | "insurance";
  minAmount?: number;
  rateNumeric?: number;
  secondaryCategory?: string;
  isVisible: boolean;
  revision?: number;
  createdAt?: string;
  updatedAt?: string;
}

const DEFAULT_MARKETPLACE_PRODUCTS: ExtendedProductItem[] = [
  {
    id: "prod-dep-1",
    code: "DEP-FLEX-01M",
    name: "Tiền gửi Linh hoạt 1 Tháng",
    category: "Tiền gửi",
    imageCategory: "deposit",
    riskLevel: "LOW",
    riskRaw: "very_low",
    strategyTag: "Tiền gửi có kỳ hạn",
    partner: { id: "partner-bank-a", name: "Ngân hàng Mẫu A" },
    description: "Phù hợp cho dòng tiền ngắn hạn hoặc chuẩn bị chi trả chi phí sinh hoạt tháng kế tiếp.",
    expectedReturn: "3.5% /năm",
    annualFee: "1 tháng",
    metric1Label: "Lãi suất minh họa",
    metric1Val: "3.5% /năm",
    metric2Label: "Kỳ hạn",
    metric2Val: "1 tháng",
    minAmount: 1000000,
    rateNumeric: 3.5,
    isVisible: true,
  },
  {
    id: "prod-dep-2",
    code: "DEP-ACCUM-03M",
    name: "Tiền gửi Tích lũy 3 Tháng",
    category: "Tiền gửi",
    imageCategory: "deposit",
    riskLevel: "LOW",
    riskRaw: "very_low",
    strategyTag: "Tiền gửi có kỳ hạn",
    partner: { id: "partner-bank-b", name: "Ngân hàng Mẫu B" },
    description: "Thích hợp tích lũy quỹ dự phòng khẩn cấp với kỳ hạn quay vòng mỗi quý.",
    expectedReturn: "4.2% /năm",
    annualFee: "3 tháng",
    metric1Label: "Lãi suất minh họa",
    metric1Val: "4.2% /năm",
    metric2Label: "Kỳ hạn",
    metric2Val: "3 tháng",
    minAmount: 5000000,
    rateNumeric: 4.2,
    isVisible: true,
  },
  {
    id: "prod-dep-3",
    code: "DEP-GOAL-06M",
    name: "Tiền gửi Nhận Lãi Hàng Tháng 6 Tháng",
    category: "Tiền gửi",
    imageCategory: "deposit",
    riskLevel: "LOW",
    riskRaw: "very_low",
    strategyTag: "Tiền gửi có kỳ hạn",
    partner: { id: "partner-bank-a", name: "Ngân hàng Mẫu A" },
    description: "Tạo dòng tiền lãi nhận đều đặn mỗi tháng để hỗ trợ chi phí sinh hoạt.",
    expectedReturn: "5% /năm",
    annualFee: "6 tháng",
    metric1Label: "Lãi suất minh họa",
    metric1Val: "5% /năm",
    metric2Label: "Kỳ hạn",
    metric2Val: "6 tháng",
    minAmount: 10000000,
    rateNumeric: 5.0,
    isVisible: true,
  },
  {
    id: "prod-dep-4",
    code: "DEP-GROWTH-12M",
    name: "Tiền gửi Sinh lời Cuối Kỳ 12 Tháng",
    category: "Tiền gửi",
    imageCategory: "deposit",
    riskLevel: "LOW",
    riskRaw: "very_low",
    strategyTag: "Tiền gửi có kỳ hạn",
    partner: { id: "partner-bank-c", name: "Ngân hàng Mẫu C" },
    description: "Sản phẩm tiền gửi chuẩn 1 năm tối ưu cho các mục tiêu chi tiêu cố định đã lên lịch.",
    expectedReturn: "6% /năm",
    annualFee: "12 tháng",
    metric1Label: "Lãi suất minh họa",
    metric1Val: "6% /năm",
    metric2Label: "Kỳ hạn",
    metric2Val: "12 tháng",
    minAmount: 10000000,
    rateNumeric: 6.0,
    isVisible: true,
  },
  {
    id: "prod-dep-5",
    code: "DEP-MONTHLY-12M",
    name: "Tiền gửi Định kỳ Nhận Lãi Tháng 12 Tháng",
    category: "Tiền gửi",
    imageCategory: "deposit",
    riskLevel: "LOW",
    riskRaw: "very_low",
    strategyTag: "Tiền gửi có kỳ hạn",
    partner: { id: "partner-bank-b", name: "Ngân hàng Mẫu B" },
    description: "Dành cho người về hưu muốn nhận tiền sinh hoạt ổn định mỗi tháng từ khoản tiết kiệm 1 năm.",
    expectedReturn: "5.8% /năm",
    annualFee: "12 tháng",
    metric1Label: "Lãi suất minh họa",
    metric1Val: "5.8% /năm",
    metric2Label: "Kỳ hạn",
    metric2Val: "12 tháng",
    minAmount: 20000000,
    rateNumeric: 5.8,
    isVisible: true,
  },
  {
    id: "prod-dep-6",
    code: "DEP-COMPOUND-24M",
    name: "Tiền gửi Tái Tục Lãi Kép 24 Tháng",
    category: "Tiền gửi",
    imageCategory: "deposit",
    riskLevel: "LOW",
    riskRaw: "very_low",
    strategyTag: "Tiền gửi có kỳ hạn",
    partner: { id: "partner-bank-c", name: "Ngân hàng Mẫu C" },
    description: "Tận dụng sức mạnh lãi kép định kỳ hàng tháng nhập gốc cho kế hoạch dài hạn 2 năm.",
    expectedReturn: "6.5% /năm",
    annualFee: "24 tháng",
    metric1Label: "Lãi suất minh họa",
    metric1Val: "6.5% /năm",
    metric2Label: "Kỳ hạn",
    metric2Val: "24 tháng",
    minAmount: 50000000,
    rateNumeric: 6.5,
    isVisible: true,
  },
  {
    id: "prod-inv-etf-top30",
    code: "E30",
    name: "Quỹ ETF Top 30 Cổ phiếu Đầu ngành (E30)",
    category: "Đầu tư & Quỹ",
    imageCategory: "investment",
    riskLevel: "HIGH",
    riskRaw: "high",
    strategyTag: "Quỹ ETF",
    partner: { id: "partner-fund-alpha", name: "Quản lý Quỹ Alpha" },
    description: "Mô phỏng sát chỉ số 30 doanh nghiệp niêm yết có vốn hóa và thanh khoản lớn nhất thị trường.",
    expectedReturn: "≥ 5 năm",
    annualFee: "0.65% /năm",
    metric1Label: "Phí quản lý mỗi năm",
    metric1Val: "0.65% /năm",
    metric2Label: "Khuyến nghị",
    metric2Val: "≥ 5 năm",
    minAmount: 100000,
    rateNumeric: 10.2,
    isVisible: true,
  },
  {
    id: "prod-inv-etf-midcap",
    code: "EMID",
    name: "Quỹ ETF Tiêu dùng & Tài nguyên (EMID)",
    category: "Đầu tư & Quỹ",
    imageCategory: "investment",
    riskLevel: "HIGH",
    riskRaw: "very_high",
    strategyTag: "Quỹ ETF",
    partner: { id: "partner-fund-beta", name: "Quản lý Quỹ Beta" },
    description: "Tập trung vào nhóm ngành sản xuất, bán lẻ và kim loại tài nguyên có tiềm năng bứt phá.",
    expectedReturn: "≥ 5 năm",
    annualFee: "0.75% /năm",
    metric1Label: "Phí quản lý mỗi năm",
    metric1Val: "0.75% /năm",
    metric2Label: "Khuyến nghị",
    metric2Val: "≥ 5 năm",
    minAmount: 150000,
    rateNumeric: 14.1,
    isVisible: true,
  },
  {
    id: "prod-inv-fund-equity-growth",
    code: "AGF",
    name: "Quỹ Mở Cổ Phiếu Tăng Trưởng Alpha (AGF)",
    category: "Đầu tư & Quỹ",
    imageCategory: "investment",
    riskLevel: "HIGH",
    riskRaw: "high",
    strategyTag: "Quỹ cổ phiếu",
    partner: { id: "partner-fund-alpha", name: "Quản lý Quỹ Alpha" },
    description: "Chuyên gia quản lý chủ động phân tích cơ bản, chọn lọc 15-20 cổ phiếu có lợi thế cạnh tranh bền vững.",
    expectedReturn: "≥ 3 năm",
    annualFee: "1.2% /năm",
    metric1Label: "Phí quản lý mỗi năm",
    metric1Val: "1.2% /năm",
    metric2Label: "Khuyến nghị",
    metric2Val: "≥ 3 năm",
    minAmount: 1000000,
    rateNumeric: 11.8,
    isVisible: true,
  },
  {
    id: "prod-inv-fund-equity-div",
    code: "ADF",
    name: "Quỹ Mở Cổ Phiếu Cổ Tức Bền Vững (ADF)",
    category: "Đầu tư & Quỹ",
    imageCategory: "investment",
    riskLevel: "MEDIUM",
    riskRaw: "moderate",
    strategyTag: "Quỹ cổ phiếu",
    partner: { id: "partner-fund-beta", name: "Quản lý Quỹ Beta" },
    description: "Đầu tư vào các doanh nghiệp điện, nước, dược phẩm và cảng biển có dòng tiền mặt dồi dào và cổ tức tiền mặt đều đặn.",
    expectedReturn: "≥ 2 năm",
    annualFee: "0.95% /năm",
    metric1Label: "Phí quản lý mỗi năm",
    metric1Val: "0.95% /năm",
    metric2Label: "Khuyến nghị",
    metric2Val: "≥ 2 năm",
    minAmount: 500000,
    rateNumeric: 7.9,
    isVisible: true,
  },
  {
    id: "prod-fund-bond-1",
    code: "ABF",
    name: "Quỹ Mở Trái Phiếu Thu Nhập Định Kỳ (ABF)",
    category: "Đầu tư & Quỹ",
    secondaryCategory: "Trái phiếu",
    imageCategory: "investment",
    riskLevel: "LOW",
    riskRaw: "low",
    strategyTag: "Quỹ trái phiếu",
    partner: { id: "partner-fund-alpha", name: "Quản lý Quỹ Alpha" },
    description: "Danh mục trái phiếu chất lượng cao đem lại tỷ suất sinh lời vượt trội tiền gửi kỳ hạn ngắn.",
    expectedReturn: "≥ 1 năm",
    annualFee: "0.7% /năm",
    metric1Label: "Phí quản lý mỗi năm",
    metric1Val: "0.7% /năm",
    metric2Label: "Khuyến nghị",
    metric2Val: "≥ 1 năm",
    minAmount: 500000,
    rateNumeric: 6.7,
    isVisible: true,
  },
  {
    id: "prod-fund-bond-2",
    code: "BCF",
    name: "Quỹ Mở Trái Phiếu Bảo Toàn Vốn (BCF)",
    category: "Đầu tư & Quỹ",
    secondaryCategory: "Trái phiếu",
    imageCategory: "investment",
    riskLevel: "LOW",
    riskRaw: "very_low",
    strategyTag: "Quỹ trái phiếu",
    partner: { id: "partner-fund-beta", name: "Quản lý Quỹ Beta" },
    description: "Tối ưu nguồn vốn lưu động chờ giải ngân với rủi ro thấp theo mô phỏng (dữ liệu minh họa danh mục).",
    expectedReturn: "≥ 0.5 năm",
    annualFee: "0.5% /năm",
    metric1Label: "Phí quản lý mỗi năm",
    metric1Val: "0.5% /năm",
    metric2Label: "Khuyến nghị",
    metric2Val: "≥ 0.5 năm",
    minAmount: 1000000,
    rateNumeric: 5.7,
    isVisible: true,
  },
  {
    id: "prod-inv-stock-tech",
    code: "TECH",
    name: "Cổ phiếu Doanh nghiệp Công nghệ (TECH)",
    category: "Đầu tư & Quỹ",
    imageCategory: "investment",
    riskLevel: "HIGH",
    riskRaw: "very_high",
    strategyTag: "",
    partner: { id: "partner-sec-vn", name: "Chứng khoán Mẫu VN" },
    description: "Doanh nghiệp xuất khẩu phần mềm giả lập, tăng trưởng doanh thu 20%/năm, biến động giá mạnh.",
    expectedReturn: "≥ 5 năm",
    annualFee: "0.15% /lần",
    metric1Label: "Phí giao dịch",
    metric1Val: "0.15% /lần",
    metric2Label: "Khuyến nghị",
    metric2Val: "≥ 5 năm",
    minAmount: 4500000,
    rateNumeric: 18.0,
    isVisible: true,
  },
  {
    id: "prod-inv-stock-ret",
    code: "RET",
    name: "Cổ phiếu Bán lẻ Tiêu dùng (RET)",
    category: "Đầu tư & Quỹ",
    imageCategory: "investment",
    riskLevel: "HIGH",
    riskRaw: "high",
    strategyTag: "",
    partner: { id: "partner-sec-vn", name: "Chứng khoán Mẫu VN" },
    description: "Chuỗi bán lẻ bách hóa và dược phẩm phủ khắp 63 tỉnh thành, dòng tiền đều đặn.",
    expectedReturn: "≥ 3 năm",
    annualFee: "4.2% /năm",
    metric1Label: "Cổ tức tham chiếu",
    metric1Val: "4.2% /năm",
    metric2Label: "Khuyến nghị",
    metric2Val: "≥ 3 năm",
    minAmount: 6800000,
    rateNumeric: 8.9,
    isVisible: true,
  },
  {
    id: "prod-bond-gov-5y",
    code: "TPCP-5Y",
    name: "Trái phiếu Chính phủ Kỳ hạn 5 Năm (TPCP-5Y)",
    category: "Trái phiếu",
    imageCategory: "bond",
    riskLevel: "LOW",
    riskRaw: "very_low",
    strategyTag: "Thu nhập cố định",
    partner: { id: "partner-gov", name: "Kho bạc Nhà nước (Mô phỏng)" },
    description: "Công cụ nợ chuẩn của Chính phủ, rủi ro tín dụng rất thấp theo mô phỏng (dữ liệu minh họa danh mục).",
    expectedReturn: "3.8% /năm",
    annualFee: "5 năm",
    metric1Label: "Lãi định kỳ (Coupon)",
    metric1Val: "3.8% /năm",
    metric2Label: "Kỳ hạn",
    metric2Val: "5 năm",
    minAmount: 10250000,
    rateNumeric: 3.8,
    isVisible: true,
  },
  {
    id: "prod-bond-corp-bank",
    code: "BOND-BNKA",
    name: "Trái phiếu Ngân hàng Mẫu A Đợt 2 (BOND-BNKA)",
    category: "Trái phiếu",
    imageCategory: "bond",
    riskLevel: "LOW",
    riskRaw: "low",
    strategyTag: "Thu nhập cố định",
    partner: { id: "partner-bank-a", name: "Ngân hàng Mẫu A" },
    description: "Trái phiếu cấp 2 phát hành ra công chúng được cấp phép bởi UBCKNN, bổ sung vốn tự có cấp 2.",
    expectedReturn: "6.2% /năm",
    annualFee: "3 năm",
    metric1Label: "Lãi định kỳ (Coupon)",
    metric1Val: "6.2% /năm",
    metric2Label: "Kỳ hạn",
    metric2Val: "3 năm",
    minAmount: 10000000,
    rateNumeric: 6.2,
    isVisible: true,
  },
  {
    id: "prod-bond-corp-infra",
    code: "BOND-INFRA",
    name: "Trái phiếu Doanh nghiệp Hạ tầng Xanh (BOND-INFRA)",
    category: "Trái phiếu",
    imageCategory: "bond",
    riskLevel: "HIGH",
    riskRaw: "high",
    strategyTag: "Thu nhập cố định",
    partner: { id: "partner-fund-beta", name: "Quản lý Quỹ Beta" },
    description: "Tài trợ dự án năng lượng tái tạo và xử lý nước thải. Lợi suất hấp dẫn đi kèm điều kiện phát hành riêng lẻ.",
    expectedReturn: "7.8% /năm",
    annualFee: "4 năm",
    metric1Label: "Lãi định kỳ (Coupon)",
    metric1Val: "7.8% /năm",
    metric2Label: "Kỳ hạn",
    metric2Val: "4 năm",
    minAmount: 50000000,
    rateNumeric: 7.8,
    isVisible: true,
  },
];

interface ReferralRecord {
  id: string;
  productId: string;
  productName: string;
  partnerName: string;
  message: string;
  date: string;
}

export default function ExplorePage() {
  const { language } = useI18n();
  const isEn = language === "en";
  const { profile, v2Profile } = useFinancialProfile();

  const livingMonthly = ((profile?.expenses?.essentialExpense || 0) + (profile?.expenses?.lifestyleExpense || 0));
  const emergencyCapital = Math.round(livingMonthly * 6);
  const otherGoalsCapital = v2Profile?.assets?.status === "KNOWN"
    ? v2Profile.assets.entries.reduce((sum, a) => sum + (a.otherGoalsShare.status === "KNOWN" && a.value.status === "KNOWN" ? Math.round(Number(a.value.value) * Number(a.otherGoalsShare.value)) : 0), 0)
    : 0;
  const totalFinancialAssets = (profile?.assets?.cashSavings || 0) + (profile?.assets?.liquidAssets || 0) + (profile?.assets?.stockFundValue || 0);
  const goalCapital = Math.round(otherGoalsCapital);
  const growthCapital = Math.max(0, Math.round(totalFinancialAssets - emergencyCapital - goalCapital));

  const [activeTab, setActiveTab] = useState<MarketTab>("explore");
  const [selectedProduct, setSelectedProduct] = useState<ExtendedProductItem | ProductItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [catalogProducts, setCatalogProducts] = useState<Array<ExtendedProductItem | ProductItem>>([]);
  const [query, setQuery] = useState("");
  const [risk, setRisk] = useState<"ALL" | RiskLevel>("ALL");
  const [category, setCategory] = useState("ALL");
  const [sort, setSort] = useState<SortKey>("default");

  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);

  const { notify } = useNotification();
  const [consult, setConsult] = useState({ open: false, message: "", phone: "", busy: false, error: "" });

  const openProduct = (item: ExtendedProductItem | ProductItem | null, withConsult = false) => {
    setSelectedProduct(item);
    setConsult({ open: withConsult, message: "", phone: "", busy: false, error: "" });
  };

  const toggleSave = (id: string) => {
    setSavedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleCompare = (id: string) => {
    setCompareIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].slice(0, 4));
  };

  const sendConsult = async () => {
    if (!selectedProduct) return;
    setConsult(c => ({ ...c, busy: true, error: "" }));
    try {
      await requestProductConsult(selectedProduct.id, consult.message.trim(), consult.phone.trim() || undefined);
      const newRef: ReferralRecord = {
        id: `ref_${Date.now()}`,
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        partnerName: selectedProduct.partner?.name || (isEn ? "Partner" : "Đối tác"),
        message: consult.message.trim(),
        date: new Date().toLocaleDateString("vi-VN"),
      };
      setReferrals(prev => [newRef, ...prev]);
      notify.success(
        isEn ? "Consultation requested" : "Đã gửi yêu cầu tư vấn",
        isEn ? "Track replies in Support." : "Theo dõi phản hồi tại mục Hỗ trợ."
      );
      openProduct(null);
    } catch (e) {
      setConsult(c => ({
        ...c,
        busy: false,
        error: e instanceof Error ? e.message : (isEn ? "Could not send the request." : "Không gửi được yêu cầu.")
      }));
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    listPublicProducts(1, 50)
      .then(res => {
        if (!active) return;
        const visible = res.items.filter(p => p.isVisible === true);
        if (visible.length === 0 || visible.every(p => /^prod-[123]$/.test(p.id))) {
          setCatalogProducts(DEFAULT_MARKETPLACE_PRODUCTS);
        } else {
          setCatalogProducts(visible);
        }
      })
      .catch(() => {
        if (active) setCatalogProducts(DEFAULT_MARKETPLACE_PRODUCTS);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload, isEn]);

  const riskLabel = (level: RiskLevel, raw?: ExtendedProductItem["riskRaw"]) => {
    if (raw === "very_low") return isEn ? "Very low risk" : "Rủi ro Rất thấp";
    if (raw === "low") return isEn ? "Low risk" : "Rủi ro Thấp";
    if (raw === "moderate") return isEn ? "Medium risk" : "Rủi ro Trung bình";
    if (raw === "high") return isEn ? "High risk" : "Rủi ro Cao";
    if (raw === "very_high") return isEn ? "Very high risk" : "Rủi ro Rất cao";
    return level === "LOW"
      ? (isEn ? "Low risk" : "Rủi ro Thấp")
      : level === "HIGH"
      ? (isEn ? "High risk" : "Rủi ro Cao")
      : (isEn ? "Medium risk" : "Rủi ro Trung bình");
  };

  const categories = useMemo(() => {
    return isEn
      ? ["Deposits", "Investments & Open Funds", "Bonds"]
      : ["Tiền gửi tiết kiệm", "Đầu tư & Quỹ mở", "Trái phiếu"];
  }, [isEn]);

  const fold = (text: string) =>
    text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

  const matchesCategory = (item: ExtendedProductItem, cat: string) => {
    if (cat === "ALL") return true;
    const c = fold(cat);
    const itemCat = fold(`${item.category} ${item.secondaryCategory || ""}`);
    if (c.includes("tien gui") || c.includes("deposit")) return itemCat.includes("tien gui") || itemCat.includes("tiet kiem") || itemCat.includes("deposit");
    if (c.includes("dau tu") || c.includes("quy") || c.includes("investment")) return itemCat.includes("dau tu") || itemCat.includes("quy") || itemCat.includes("investment");
    if (c.includes("trai phieu") || c.includes("bond")) return itemCat.includes("trai phieu") || itemCat.includes("bond");
    return itemCat.includes(c) || c.includes(itemCat);
  };

  const visibleProducts = useMemo(() => {
    const q = fold(query.trim());
    let list = catalogProducts as ExtendedProductItem[];

    if (activeTab === "matched") {
      list = list.filter(item => item.riskLevel !== "HIGH");
    } else if (activeTab === "saved") {
      list = list.filter(item => savedIds.includes(item.id));
    }

    list = list.filter(item =>
      (risk === "ALL" || item.riskLevel === risk) &&
      matchesCategory(item, category) &&
      (!q || fold(`${item.name} ${item.code ?? ""} ${item.partner?.name ?? ""} ${item.category} ${item.description ?? ""}`).includes(q))
    );

    if (sort === "rate_desc") return [...list].sort((a, b) => (b.rateNumeric || 0) - (a.rateNumeric || 0));
    if (sort === "risk") return [...list].sort((a, b) => (RISK_ORDER[a.riskRaw ? a.riskRaw.toUpperCase() : a.riskLevel] ?? 1) - (RISK_ORDER[b.riskRaw ? b.riskRaw.toUpperCase() : b.riskLevel] ?? 1));
    if (sort === "min_asc") return [...list].sort((a, b) => (a.minAmount ?? Infinity) - (b.minAmount ?? Infinity));
    if (sort === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name, "vi"));
    return list;
  }, [catalogProducts, query, risk, category, sort, activeTab, savedIds]);

  const filtered = query.trim() !== "" || risk !== "ALL" || category !== "ALL" || sort !== "default";
  const clearFilters = () => {
    setQuery("");
    setRisk("ALL");
    setCategory("ALL");
    setSort("default");
  };

  const comparedProducts = useMemo(() => {
    return catalogProducts.filter(p => compareIds.includes(p.id));
  }, [catalogProducts, compareIds]);

  return (
    <div className="products-page">
      {/* 1. Header with 'Sản phẩm tài chính' and '← Về kế hoạch' */}
      <header className="products-head">
        <div>
          <h1>{isEn ? "Financial products" : "Sản phẩm tài chính"}</h1>
          <p>{isEn ? "Learn about products, compare conditions and check them against your plan." : "Tìm hiểu sản phẩm, so sánh điều kiện và đối chiếu với kế hoạch của bạn."}</p>
        </div>
        <Link to="/user/plan" className="btn secondary" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span>←</span>
          <span>{isEn ? "Back to plan" : "Về kế hoạch"}</span>
        </Link>
      </header>

      {/* 2. 5-Tab Navigation System */}
      <nav className="marketplace-tabs" role="tablist" aria-label={isEn ? "Marketplace tabs" : "Các mục trong Marketplace"}>
        <button
          type="button"
          role="tab"
          className="marketplace-tab-btn"
          aria-selected={activeTab === "explore"}
          onClick={() => setActiveTab("explore")}
        >
          <Icon name="grid" size="small" />
          <span>{isEn ? "Explore all" : "Khám phá tất cả"}</span>
          <span className="tab-badge">{catalogProducts.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          className="marketplace-tab-btn"
          aria-selected={activeTab === "matched"}
          onClick={() => setActiveTab("matched")}
        >
          <Icon name="target" size="small" />
          <span>{isEn ? "Plan recommendations" : "Gợi ý theo kế hoạch"}</span>
        </button>
        <button
          type="button"
          role="tab"
          className="marketplace-tab-btn"
          aria-selected={activeTab === "compare"}
          onClick={() => setActiveTab("compare")}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M16 3h5v5" />
            <path d="M4 20 21 3" />
            <path d="M21 16v5h-5" />
            <path d="M15 15l6 6" />
            <path d="M4 4l5 5" />
          </svg>
          <span>{isEn ? "Compare products" : "So sánh sản phẩm"}</span>
          <span className="tab-badge">{compareIds.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          className="marketplace-tab-btn"
          aria-selected={activeTab === "saved"}
          onClick={() => setActiveTab("saved")}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <span>{isEn ? "Saved" : "Quan tâm"}</span>
          <span className="tab-badge">{savedIds.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          className="marketplace-tab-btn"
          aria-selected={activeTab === "referrals"}
          onClick={() => setActiveTab("referrals")}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span>{isEn ? "Consultation requests" : "Yêu cầu tư vấn"}</span>
          <span className="tab-badge">{referrals.length}</span>
        </button>
      </nav>

      {/* 3. Filters row: search, category, risk, sort, clear */}
      {(activeTab === "explore" || activeTab === "matched" || activeTab === "saved") && (
        <div className="products-filters" role="search">
          <label className="products-search">
            <Icon name="search" size="small" />
            <span className="sr-only">{isEn ? "Search products" : "Tìm kiếm sản phẩm"}</span>
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={isEn ? "Search name, provider..." : "Tìm tên sản phẩm, mã, tổ chức phát hành…"}
            />
          </label>
          <label>
            <span className="sr-only">{isEn ? "Filter by category" : "Nhóm sản phẩm"}</span>
            <select value={category} onChange={e => setCategory(e.target.value)}>
              <option value="ALL">{isEn ? `All products (${catalogProducts.length})` : `Tất cả sản phẩm (${catalogProducts.length})`}</option>
              {categories.map(cat => {
                const count = (catalogProducts as ExtendedProductItem[]).filter(p => matchesCategory(p, cat)).length;
                return (
                  <option key={cat} value={cat}>{cat} ({count})</option>
                );
              })}
            </select>
          </label>
          <label>
            <span className="sr-only">{isEn ? "Filter by risk" : "Lọc theo mức rủi ro"}</span>
            <select value={risk} onChange={e => setRisk(e.target.value as "ALL" | RiskLevel)}>
              <option value="ALL">{isEn ? "Any risk level" : "Mọi mức rủi ro"}</option>
              <option value="LOW">{riskLabel("LOW")}</option>
              <option value="MEDIUM">{riskLabel("MEDIUM")}</option>
              <option value="HIGH">{riskLabel("HIGH")}</option>
            </select>
          </label>
          <label>
            <span className="sr-only">{isEn ? "Sort products" : "Sắp xếp sản phẩm"}</span>
            <select value={sort} onChange={e => setSort(e.target.value as SortKey)}>
              <option value="default">{isEn ? "Default order" : "Sắp xếp mặc định"}</option>
              <option value="rate_desc">{isEn ? "Highest return" : "Lãi suất / Lợi nhuận cao nhất"}</option>
              <option value="risk">{isEn ? "Risk: low -> high" : "Rủi ro thấp → cao"}</option>
              <option value="min_asc">{isEn ? "Lowest minimum capital" : "Vốn tối thiểu thấp nhất"}</option>
              <option value="name">{isEn ? "Name A -> Z" : "Tên A → Z"}</option>
            </select>
          </label>
          <button type="button" className="products-clear" disabled={!filtered} onClick={clearFilters}>
            ↻ {isEn ? "Clear filters" : "Xóa bộ lọc"}
          </button>
        </div>
      )}

      {/* Active filters row chips */}
      {filtered && (activeTab === "explore" || activeTab === "matched" || activeTab === "saved") && (
        <div className="active-filters-row">
          <span className="active-filters-label">{isEn ? "Active filters:" : "Đang lọc:"}</span>
          {category !== "ALL" && (
            <button type="button" className="active-tag" onClick={() => setCategory("ALL")}>
              {category} ✕
            </button>
          )}
          {risk !== "ALL" && (
            <button type="button" className="active-tag" onClick={() => setRisk("ALL")}>
              {riskLabel(risk)} ✕
            </button>
          )}
          {query && (
            <button type="button" className="active-tag" onClick={() => setQuery("")}>
              “{query}” ✕
            </button>
          )}
          {sort !== "default" && (
            <button type="button" className="active-tag" onClick={() => setSort("default")}>
              {sort === "risk" ? (isEn ? "Sort: Risk" : "Xếp: Rủi ro") : (isEn ? "Sort: Name" : "Xếp: Tên")} ✕
            </button>
          )}
        </div>
      )}

      {/* 4. Tab Contents */}
      {loading ? (
        <p role="status" className="products-count">{isEn ? "Loading products..." : "Đang tải sản phẩm..."}</p>
      ) : error ? (
        <Alert tone="danger" title={error} action={<Button variant="secondary" onClick={() => setReload(n => n + 1)}>{isEn ? "Retry" : "Thử lại"}</Button>} />
      ) : activeTab === "compare" ? (
        /* Compare Tab */
        comparedProducts.length === 0 ? (
          <Card className="products-empty">
            <Icon name="chart" />
            <div>
              <h2>{isEn ? "No products selected for comparison" : "Chưa có sản phẩm nào trong giỏ so sánh"}</h2>
              <p>{isEn ? "Click 'So sánh' on product cards in Explore tab to compare terms, return rates, and fees." : "Bấm nút 'So sánh' trên thẻ sản phẩm ở tab Khám phá để đối chiếu quyền lợi, lợi suất và biểu phí."}</p>
            </div>
            <Button variant="secondary" onClick={() => setActiveTab("explore")}>
              {isEn ? "Explore products" : "Khám phá sản phẩm"}
            </Button>
          </Card>
        ) : (
          <div className="table-scroll" style={{ background: "#fff", border: "1px solid var(--border, #D0E4FE)", borderRadius: "var(--r-md, 16px)", padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--navy, #052659)" }}>
                {isEn ? `Comparing ${comparedProducts.length} products` : `So sánh ${comparedProducts.length} sản phẩm`}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <Button size="small" variant="secondary" onClick={() => setActiveTab("explore")}>
                  {isEn ? "+ Add products" : "+ Thêm sản phẩm"}
                </Button>
                <button type="button" className="btn ghost" style={{ fontSize: "12px", padding: "4px 10px" }} onClick={() => setCompareIds([])}>
                  {isEn ? "Clear comparison" : "Xóa giỏ so sánh"}
                </button>
              </div>
            </div>
            <table className="responsive-table comparison-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "var(--soft, #E8F2FE)" }}>
                  <th style={{ padding: "12px 14px", textAlign: "left" }}>{isEn ? "Feature" : "Đặc điểm đối chiếu"}</th>
                  {comparedProducts.map(p => (
                    <th key={p.id} className="product-col-header" style={{ padding: "12px 14px", textAlign: "left" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong>{p.name}</strong>
                        <button type="button" className="btn ghost" style={{ padding: "2px 6px", fontSize: "11px" }} onClick={() => toggleCompare(p.id)}>×</button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className={comparedProducts.length > 1 && new Set(comparedProducts.map(p => p.partner?.name || "")).size > 1 ? "diff-highlight" : ""} style={{ borderBottom: "1px solid var(--border, #D0E4FE)" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>{isEn ? "Partner" : "Tổ chức phát hành"}</td>
                  {comparedProducts.map(p => <td key={p.id} style={{ padding: "12px 14px" }}>{p.partner?.name || "-"}</td>)}
                </tr>
                <tr className={comparedProducts.length > 1 && new Set(comparedProducts.map(p => p.category)).size > 1 ? "diff-highlight" : ""} style={{ borderBottom: "1px solid var(--border, #D0E4FE)" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>{isEn ? "Category" : "Nhóm sản phẩm"}</td>
                  {comparedProducts.map(p => <td key={p.id} style={{ padding: "12px 14px" }}>{p.category}</td>)}
                </tr>
                <tr className={comparedProducts.length > 1 && new Set(comparedProducts.map(p => p.riskLevel)).size > 1 ? "diff-highlight" : ""} style={{ borderBottom: "1px solid var(--border, #D0E4FE)" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>{isEn ? "Risk Level" : "Mức độ rủi ro"}</td>
                  {comparedProducts.map(p => (
                    <td key={p.id} style={{ padding: "12px 14px" }}>
                      <span className={`product-card__risk risk-${p.riskLevel.toLowerCase()}`}>{riskLabel(p.riskLevel)}</span>
                    </td>
                  ))}
                </tr>
                <tr className={comparedProducts.length > 1 && new Set(comparedProducts.map(p => p.expectedReturn || "")).size > 1 ? "diff-highlight" : ""} style={{ borderBottom: "1px solid var(--border, #D0E4FE)" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>{isEn ? "Expected Return" : "Lợi suất kỳ vọng"}</td>
                  {comparedProducts.map(p => <td key={p.id} style={{ padding: "12px 14px", fontWeight: 600, color: "var(--navy, #052659)" }}>{p.expectedReturn || "-"}</td>)}
                </tr>
                <tr className={comparedProducts.length > 1 && new Set(comparedProducts.map(p => p.annualFee || "")).size > 1 ? "diff-highlight" : ""} style={{ borderBottom: "1px solid var(--border, #D0E4FE)" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>{isEn ? "Annual Fee" : "Phí thường niên"}</td>
                  {comparedProducts.map(p => <td key={p.id} style={{ padding: "12px 14px" }}>{p.annualFee || "-"}</td>)}
                </tr>
                <tr>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>{isEn ? "Actions" : "Thao tác"}</td>
                  {comparedProducts.map(p => (
                    <td key={p.id} style={{ padding: "12px 14px" }}>
                      <Button size="small" onClick={() => openProduct(p, true)}>{isEn ? "Consult" : "Tư vấn"}</Button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )
      ) : activeTab === "referrals" ? (
        /* Referrals Tab */
        referrals.length === 0 ? (
          <Card className="products-empty">
            <Icon name="info" />
            <div>
              <h2>{isEn ? "No consultation requests yet" : "Chưa có yêu cầu tư vấn nào"}</h2>
              <p>{isEn ? "When you request a product consultation, your requests will appear here for easy tracking." : "Khi bạn gửi yêu cầu tư vấn sản phẩm, các yêu cầu sẽ được ghi nhận tại đây để tiện theo dõi."}</p>
            </div>
            <Button variant="secondary" onClick={() => setActiveTab("explore")}>
              {isEn ? "Explore products" : "Khám phá sản phẩm"}
            </Button>
          </Card>
        ) : (
          <div className="card" style={{ background: "#fff", border: "1px solid var(--border, #D0E4FE)", borderRadius: "var(--r-md, 16px)", padding: "20px" }}>
            <h3 style={{ margin: "0 0 16px", color: "var(--navy, #052659)" }}>{isEn ? "Consultation Requests History" : "Lịch sử yêu cầu tư vấn"}</h3>
            {referrals.map(r => (
              <div key={r.id} className="ledger-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--border, #D0E4FE)" }}>
                <div>
                  <strong style={{ fontSize: "15px", color: "var(--navy, #052659)" }}>{r.productName}</strong>
                  <p className="small muted" style={{ margin: "4px 0 0" }}>{r.partnerName} · {r.date} · {r.message ? `"${r.message}"` : (isEn ? "Consultation request recorded" : "Yêu cầu tư vấn đã ghi nhận")}</p>
                </div>
                <span className="badge success">{isEn ? "Recorded" : "Đã ghi nhận"}</span>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Explore / Matched / Saved Tabs */
        <>
          {activeTab === "matched" && (
            <div className="plan-pillars-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "#475569" }}>
                    {isEn ? "PLAN MATCHING BASELINE" : "CƠ SỞ ĐỐI CHIẾU KẾ HOẠCH"}
                  </span>
                  <h3 style={{ margin: "4px 0 0", fontSize: "16px", color: "var(--navy, #052659)" }}>
                    {isEn ? "3 Capital Pillars Structure" : "Cơ cấu 3 nguồn vốn của bạn"}
                  </h3>
                </div>
                <Link to="/user/plan" className="btn ghost" style={{ fontSize: "12px", textDecoration: "none" }}>
                  {isEn ? "View plan details →" : "Xem chi tiết kế hoạch →"}
                </Link>
              </div>
              <div className="plan-pillars-grid">
                <div className="pillar-col">
                  <h4>{isEn ? "1. Emergency Reserve" : "1. Dự phòng khẩn cấp"}</h4>
                  <div className="amount">{emergencyCapital > 0 ? emergencyCapital.toLocaleString("vi-VN") + " ₫" : "60.000.000 ₫"}</div>
                  <p>{isEn ? "Flexible deposits priority" : "Ưu tiên tiền gửi linh hoạt"}</p>
                </div>
                <div className="pillar-col">
                  <h4>{isEn ? "2. Near-Term Goals (≤ 5 yrs)" : "2. Mục tiêu gần hạn (≤ 5 năm)"}</h4>
                  <div className="amount">{goalCapital > 0 ? goalCapital.toLocaleString("vi-VN") + " ₫" : "0 ₫"}</div>
                  <p>{isEn ? "Term deposits / Gov bonds" : "Tiền gửi kỳ hạn / TPCP"}</p>
                </div>
                <div className="pillar-col">
                  <h4>{isEn ? "3. Long-Term Allocated Capital" : "3. Vốn dài hạn phân bổ"}</h4>
                  <div className="amount">{growthCapital > 0 ? growthCapital.toLocaleString("vi-VN") + " ₫" : "340.000.000 ₫"}</div>
                  <p>{isEn ? "Open equity funds & ETFs" : "Quỹ mở cổ phiếu & ETF"}</p>
                </div>
              </div>
            </div>
          )}

          <p className="products-count" role="status">
            {isEn ? <>Showing <strong>{visibleProducts.length}</strong> matching products</> : <>Hiển thị <strong>{visibleProducts.length}</strong> sản phẩm phù hợp</>}
          </p>

          {visibleProducts.length === 0 ? (
            <Card className="products-empty">
              <Icon name="compass" />
              <div>
                <h2>
                  {activeTab === "saved"
                    ? (isEn ? "No saved products" : "Chưa có sản phẩm quan tâm")
                    : catalogProducts.length === 0
                    ? (isEn ? "No products published yet" : "Chưa có sản phẩm được công bố")
                    : (isEn ? "No products match these filters" : "Không tìm thấy sản phẩm phù hợp")}
                </h2>
                <p>
                  {activeTab === "saved"
                    ? (isEn ? "Click the star or 'Quan tâm' on any product card to bookmark it." : "Bấm biểu tượng ngôi sao hoặc nút “Lưu quan tâm” trên mỗi thẻ sản phẩm để lưu lại xem sau.")
                    : catalogProducts.length === 0
                    ? (isEn ? "Partner products will appear here once published." : "Sản phẩm của đối tác sẽ hiện ở đây khi được công bố.")
                    : (isEn ? "Try another risk level or clear the filters." : "Thử điều chỉnh từ khóa tìm kiếm hoặc bấm “Xóa bộ lọc” để xem toàn bộ danh mục.")}
                </p>
              </div>
              {filtered && (
                <Button variant="secondary" onClick={clearFilters}>
                  {isEn ? "Clear filters" : "Xóa bộ lọc"}
                </Button>
              )}
            </Card>
          ) : (
            <div className="products-grid">
              {visibleProducts.map(item => {
                const isSaved = savedIds.includes(item.id);
                const isCompared = compareIds.includes(item.id);

                const isDeposit = item.imageCategory === "deposit" || item.category.toLowerCase().includes("tiền gửi") || item.category.toLowerCase().includes("tiết kiệm") || item.category.toLowerCase().includes("deposit");
                const isBond = item.imageCategory === "bond" || item.category.toLowerCase().includes("trái phiếu") || item.category.toLowerCase().includes("bond");
                const isInsurance = item.imageCategory === "insurance" || item.category.toLowerCase().includes("bảo hiểm") || item.category.toLowerCase().includes("insurance");

                const imgFile = item.imageCategory || (isDeposit ? "deposit" : isBond ? "bond" : isInsurance ? "insurance" : "investment");
                const strategyTag = item.strategyTag !== undefined
                  ? item.strategyTag
                  : (isDeposit ? (isEn ? "Term Deposit" : "Tiền gửi có kỳ hạn") : isBond ? (isEn ? "Fixed Income" : "Thu nhập cố định") : isInsurance ? (isEn ? "Health Protection" : "Bảo vệ y tế") : (isEn ? "Growth Funds" : "Quỹ cổ phiếu"));

                const metric1Label = item.metric1Label || (isDeposit ? (isEn ? "Indicative rate" : "Lãi suất minh họa") : isBond ? (isEn ? "Coupon rate" : "Lãi định kỳ (Coupon)") : isInsurance ? (isEn ? "Coverage limit" : "Hạn mức bảo vệ") : (isEn ? "Annual fee" : "Phí quản lý mỗi năm"));
                const metric1Val = item.metric1Val || (isDeposit ? (item.expectedReturn || "5.2% /năm") : isBond ? (item.expectedReturn || "8.5% /năm") : isInsurance ? (item.expectedReturn || "1.5 tỷ ₫") : (item.annualFee || "1.2% /năm"));

                const metric2Label = item.metric2Label || (isDeposit ? (isEn ? "Term" : "Kỳ hạn") : isBond ? (isEn ? "Term" : "Kỳ hạn") : isInsurance ? (isEn ? "Ref. fee" : "Phí tham khảo") : (isEn ? "Recommended term" : "Khuyến nghị"));
                const metric2Val = item.metric2Val || (isDeposit ? (item.annualFee || "6 tháng") : isBond ? (item.annualFee || "3 năm") : isInsurance ? (item.annualFee || "18 triệu /năm") : (item.expectedReturn || "≥ 5 năm"));

                const riskToneClass = item.riskRaw === "very_low" || item.riskRaw === "low" || item.riskLevel === "LOW"
                  ? "risk-low"
                  : item.riskRaw === "moderate" || item.riskLevel === "MEDIUM"
                  ? "risk-medium"
                  : "risk-high";

                return (
                  <article className="product-card marketplace-card" key={item.id}>
                    <div className="product-card__media" style={{ position: "relative", height: "135px", overflow: "hidden" }}>
                      <img
                        src={`/assets/product-${imgFile}.jpg`}
                        alt={item.name}
                        loading="lazy"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                      <span className="product-card__tag">
                        {item.category}
                      </span>
                      <span className="product-card__code">
                        {item.code || item.id}
                      </span>
                    </div>

                    <div className="product-card__body">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                        <div>
                          <span className="product-card__partner" style={{ display: "block", fontSize: "10px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "#617387", marginBottom: "2px" }}>
                            {item.partner?.name || (isEn ? "Partner" : "Đối tác")}
                          </span>
                          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--navy, #052659)", margin: 0 }}>{item.name}</h2>
                        </div>
                        <button
                          type="button"
                          className={`card-star-btn ${isSaved ? "is-saved" : ""}`}
                          onClick={() => toggleSave(item.id)}
                          title={isSaved ? "Bỏ lưu quan tâm" : "Lưu quan tâm"}
                          aria-label={isSaved ? "Bỏ lưu quan tâm" : "Lưu quan tâm"}
                        >
                          {isSaved ? "★" : "☆"}
                        </button>
                      </div>

                      <div style={{ display: "flex", gap: "6px", alignItems: "center", margin: "4px 0", flexWrap: "wrap" }}>
                        <span className={`product-card__risk badge-risk ${riskToneClass}`}>
                          {riskLabel(item.riskLevel, item.riskRaw)}
                        </span>
                        {strategyTag && <span className="badge-strategy">{strategyTag}</span>}
                      </div>

                      {item.description && <p className="product-desc" style={{ fontSize: "12.5px", color: "#52657c", lineHeight: 1.5, margin: "4px 0" }}>{item.description}</p>}

                      <dl className="product-card__facts product-metrics">
                        <div>
                          <dt>{metric1Label}</dt>
                          <dd>{metric1Val}</dd>
                        </div>
                        <div>
                          <dt>{metric2Label}</dt>
                          <dd>{metric2Val}</dd>
                        </div>
                      </dl>

                      <div className="product-card__actions">
                        <div className="card-action-group">
                          <button
                            type="button"
                            className="btn ghost small"
                            onClick={() => toggleCompare(item.id)}
                          >
                            {isCompared ? (isEn ? "✓ Compared" : "✓ Đã so sánh") : (isEn ? "⇄ Compare" : "⇄ So sánh")}
                          </button>
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => openProduct(item)}
                          >
                            {isEn ? "Details" : "Chi tiết"}
                          </button>
                        </div>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => openProduct(item, true)}
                        >
                          {isEn ? "Consult" : "Tư vấn"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 5. Editorial Reader & Consultation Modal */}
      <Modal
        open={Boolean(selectedProduct)}
        title={selectedProduct?.name || ""}
        onClose={() => {
          if (!consult.busy) openProduct(null);
        }}
      >
        <p style={{ color: "var(--muted, #456B91)", fontSize: "13px", marginBottom: "16px" }}>
          {isEn
            ? "Reference information only. Products are not ranked or matched to your financial profile."
            : "Chỉ là thông tin tham khảo. Sản phẩm không được xếp hạng hay đề xuất theo hồ sơ tài chính của bạn."}
        </p>

        {selectedProduct && (
          <div className="product-detail">
            {selectedProduct.imageUrl && (
              <img className="product-detail-image" src={selectedProduct.imageUrl} alt={selectedProduct.name} style={{ width: "100%", maxHeight: "200px", objectFit: "cover", borderRadius: "12px", marginBottom: "14px" }} />
            )}

            <p style={{ margin: "0 0 10px", fontSize: "14px" }}>
              <strong>{selectedProduct.partner?.name}</strong> · <span className="badge">{selectedProduct.category}</span> · <span className={`badge-risk risk-${selectedProduct.riskLevel.toLowerCase()}`}>{riskLabel(selectedProduct.riskLevel)}</span>
            </p>

            <p style={{ margin: "0 0 16px", lineHeight: 1.6, color: "var(--navy, #052659)" }}>{selectedProduct.description}</p>

            <div className="product-detail-editorial">
              {[
                [isEn ? "Expected return (not guaranteed)" : "Lợi suất kỳ vọng (không cam kết)", selectedProduct.expectedReturn],
                [isEn ? "Annual fee" : "Phí hằng năm", selectedProduct.annualFee],
                [isEn ? "Conditions" : "Điều kiện", selectedProduct.conditions],
                [isEn ? "Disclosure" : "Thông tin công bố", selectedProduct.disclosure],
              ].map(([label, value]) => (
                <div key={label} className="product-detail-section">
                  <h4>{label}</h4>
                  <p>{value || (isEn ? "Not provided" : "Chưa công bố")}</p>
                </div>
              ))}
            </div>

            {!consult.open ? (
              <div style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <Button variant="secondary" onClick={() => openProduct(null)}>
                  {isEn ? "Close" : "Đóng"}
                </Button>
                <Button onClick={() => setConsult(c => ({ ...c, open: true }))}>
                  <Icon name="message" size="small" />
                  <span>{isEn ? "Request a consultation" : "Yêu cầu tư vấn gói này"}</span>
                </Button>
              </div>
            ) : (
              <section className="product-consult-form" style={{ marginTop: "20px", borderTop: "1px solid var(--border, #D0E4FE)", paddingTop: "16px" }}>
                <h3 style={{ fontSize: "16px", color: "var(--navy, #052659)", margin: "0 0 12px" }}>
                  {isEn ? "Request a consultation" : "Yêu cầu tư vấn"}
                </h3>
                <Textarea
                  label={isEn ? "What would you like to know?" : "Bạn muốn được tư vấn điều gì?"}
                  rows={3}
                  value={consult.message}
                  disabled={consult.busy}
                  onChange={message => setConsult(c => ({ ...c, message: message.slice(0, 2000) }))}
                />
                <Input
                  label={isEn ? "Phone (optional)" : "Số điện thoại liên hệ (không bắt buộc)"}
                  inputMode="numeric"
                  value={consult.phone}
                  disabled={consult.busy}
                  onChange={phone => setConsult(c => ({ ...c, phone }))}
                />
                {consult.error && <Alert tone="danger" title={consult.error} />}
                <div className="product-consult-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
                  <Button variant="secondary" disabled={consult.busy} onClick={() => setConsult(c => ({ ...c, open: false }))}>
                    {isEn ? "Cancel" : "Hủy"}
                  </Button>
                  <Button disabled={consult.busy || consult.message.trim().length < 3} onClick={sendConsult}>
                    {consult.busy ? (isEn ? "Sending..." : "Đang gửi...") : (isEn ? "Send request" : "Gửi yêu cầu")}
                  </Button>
                </div>
              </section>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
