import { CatalogService } from "../modules/catalog/service";
import { ContentService } from "../modules/content/service";
import { CommunityService } from "../modules/community/service";
import { AuthService } from "../modules/auth/service";
import { ProfileService } from "../modules/profiles/service";
import { RecommendationService } from "../modules/recommendation/service";
import { HoldingsRepository } from "../modules/holdings/repository";
import { memoryDb } from "./memory-db";
import { fixtureProfile } from "./profile-v2-fixtures";
import { config } from "./helpers";
import { randomUUID } from "node:crypto";
export async function discoveryFixture(options: { empty?: boolean; products?: number; articles?: number } = {}) {
  const f = memoryDb(), catalog = new CatalogService(f.db), content = new ContentService(f.db), community = new CommunityService(f.db), auth = new AuthService(f.db, config), profiles = new ProfileService(f.db);
  const owner = await f.db.user.create({ data: { id: "test-user", role: "USER", status: "ACTIVE", email: "discovery@example.test", fullName: "Synthetic reader", passwordHash: "unused" } });
  await f.db.user.create({ data: { id: "other-user", role: "USER", status: "ACTIVE", email: "other@example.test", fullName: "Other fixture", passwordHash: "unused" } });
  await profiles.saveDraft(owner.id, 0, "summary", fixtureProfile()); await profiles.complete(owner.id, { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
  const partner = await catalog.writePartner("test-admin", { name: "Đối tác kiểm thử", type: "BANK", website: null, logoUrl: null, contactEmail: "private@example.test", isHighlight: false, isVisible: true });
  const hiddenPartner = await catalog.writePartner("test-admin", { name: "Đối tác chưa duyệt", type: "BANK", website: null, logoUrl: null, contactEmail: null, isHighlight: false, isVisible: false });
  const products = [], articles = [];
  if (!options.empty) {
    for (let i = 0; i < (options.products ?? 15); i++) products.push(await catalog.writeProduct("test-admin", { referenceYieldPercent: null, minimumAmount: null, partnerId: partner.id, name: `Sản phẩm kiểm thử ${String(i+1).padStart(2,"0")}`, category: ["Tiền gửi", "Trái phiếu", "Đầu tư & Quỹ"][i%3], riskLevel: (["LOW","MEDIUM","HIGH"] as const)[i%3], expectedReturn: i === 0 ? "Thông số theo công bố của đối tác" : "Không cam kết lợi suất", description: "Thông tin minh họa để kiểm tra giao diện, không phải sản phẩm phân phối thật.", annualFee: "Phí được công bố riêng", conditions: "Đọc điều kiện áp dụng trước khi lựa chọn.", disclosure: "Dữ liệu tổng hợp kiểm thử, không có giao dịch.", imageUrl: null, isVisible: true }));
    for (let i = 0; i < (options.articles ?? 16); i++) {
      const category = ["Kế hoạch", "BHXH", "Theo dõi", "Phân bổ"][i%4], body = `## Nội dung chính\n\nĐây là bài đọc kiểm thử ${i+1}. Kiểm tra số liệu và điều kiện theo hồ sơ đã khai.\n\n- Giữ bản đã lưu\n- Xem lại khi có thay đổi\n\n## Bảng đối chiếu\n\n| Mục | Ghi chú |\n| --- | --- |\n| Hồ sơ | Dữ liệu đã khai |\n\n**Ghi nhớ**: nội dung kiểm thử.\n\n[Liên kết không an toàn](javascript:alert(1))\n\n<script>window.__articleScriptRan=true</script>`;
      articles.push(await content.write("test-admin", { title: `Kiến thức kiểm thử ${String(i+1).padStart(2,"0")}`, slug: `kien-thuc-kiem-thu-${i+1}`, excerpt: "Đọc điều cần biết, lưu bài theo tài khoản và đối chiếu với hồ sơ của bạn.", content: body, category, authorName: "Ban biên tập kiểm thử", kind: "ARTICLE", status: "PUBLISHED", thumbnail: null }));
    }
  }
  const hiddenProduct = await catalog.writeProduct("test-admin", { referenceYieldPercent: null, minimumAmount: null, partnerId: hiddenPartner.id, name: "Sản phẩm chưa công bố", category: "Tiền gửi", expectedReturn: "", riskLevel: "LOW", description: null, annualFee: null, conditions: null, disclosure: null, imageUrl: null, isVisible: false });
  const draft = await content.write("test-admin", { title: "Bài viết chưa công bố", slug: "bai-viet-chua-cong-bo", excerpt: "Không hiển thị công khai", content: "Nội dung nháp", category: "Chuyên mục chưa công bố", authorName: "Fixture", thumbnail: null, kind: "ARTICLE", status: "DRAFT" });
  return { ...f, owner, products, articles, hiddenProduct, hiddenPartner, draft, catalog, content, community, profiles, auth,
    services: { auth, profiles, catalog, content, community, recommendations: new RecommendationService(f.db), holdings: new HoldingsRepository(f.db) } };
}
