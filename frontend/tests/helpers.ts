import type { Page } from "@playwright/test";

export async function installRouteAuth(page: Page, userId = "USR-001") {
  let currentUser = { id: userId, fullName: "Nguyễn Minh An", email: "user@demo.com", role: "USER", status: "ACTIVE", phone: null as string | null, city: null as string | null, avatarUrl: null as string | null, revision: 0, emailVerifiedAt: "2026-10-03T00:00:00.000Z" };

  // Block external analytics script fetches from hanging tests
  await page.route(/(googletagmanager|google-analytics)\.com/, route => {
    return route.fulfill({ status: 200, contentType: "application/javascript", body: "/* mock ga */" });
  });

  // UI fixtures mock the API boundary; browser storage never grants app access.
  await page.route("**/api/v1/auth/**", async route => {
    const referer = route.request().headers()["referer"] || "";
    const admin = userId.startsWith("ADM") || referer.includes("/admin") || new URL(page.url()).pathname.startsWith("/admin");
    const user = {
      id: admin ? "ADM-001" : currentUser.id,
      fullName: admin ? "Lê Lan Anh" : currentUser.fullName,
      email: admin ? "admin@demo.com" : currentUser.email,
      role: admin ? "ADMIN" : currentUser.role,
      status: currentUser.status,
      phone: currentUser.phone,
      city: currentUser.city,
      avatarUrl: currentUser.avatarUrl,
      revision: currentUser.revision
    };
    await route.fulfill({ json: { data: { accessToken: "ui-test-token", user } } });
  });

  await page.route("**/api/v1/me", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/me") {
      const referer = route.request().headers()["referer"] || "";
      const admin = userId.startsWith("ADM") || referer.includes("/admin") || new URL(page.url()).pathname.startsWith("/admin");
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON();
        currentUser = { ...currentUser, ...body.changes, revision: (currentUser.revision || 0) + 1 };
        return route.fulfill({ json: { data: currentUser } });
      }
      const user = admin ? { ...currentUser, id: "ADM-001", fullName: "Lê Lan Anh", email: "admin@demo.com", role: "ADMIN" } : currentUser;
      return route.fulfill({ json: { data: user } });
    }
    return route.continue();
  });

  await page.route("**/api/v1/admin/users**", async route => {
    const url = route.request().url();
    if (url.includes("/admin/users/") && !url.includes("?")) {
      return route.fulfill({
        json: {
          data: {
            user: {
              id: "USR-1082",
              fullName: "Nguyễn Minh An",
              email: "an.nguyenminh88@gmail.com",
              phone: "0912345678",
              city: "Hà Nội",
              role: "USER",
              status: "ACTIVE",
              createdAt: "2026-10-02T18:43:24.563Z",
              lastActiveAt: "2026-10-03T11:00:00.000Z",
              emailVerifiedAt: "2026-10-03T00:00:00.000Z",
              revision: 1
            },
            history: [
              { id: "h1", action: "AUTH_LOGIN", performerName: "Hệ thống", createdAt: "2026-10-03T11:00:00.000Z", details: null },
            ]
          }
        }
      });
    }
    await route.fulfill({
      json: {
        data: {
          items: [
            { id: "6eb8adb2-7a1d-42fe-b0c7-d829d6b605d5", fullName: "Nguyễn Minh An", email: "an.nguyenminh88@gmail.com", phone: "0912345678", city: "Hà Nội", role: "USER", status: "ACTIVE", createdAt: "2026-10-02T18:43:24.563Z", lastActiveAt: "2026-10-03T11:00:00.000Z", revision: 1 },
            { id: "fc592c52-c6e7-47ea-aff2-62927b29030f", fullName: "Trần Thùy Linh", email: "thuylinh.tran95@gmail.com", phone: "0987654321", city: "Đà Nẵng", role: "USER", status: "ACTIVE", createdAt: "2026-10-02T18:43:25.123Z", lastActiveAt: "2026-10-03T09:30:00.000Z", revision: 1 },
            { id: "47bb4b7b-8a15-49ea-833a-8b617b38d0ca", fullName: "Lê Hoàng Nam", email: "nam.lehoang@fpt.com.vn", phone: "0901234567", city: "TP. Hồ Chí Minh", role: "USER", status: "PENDING_VERIFICATION", createdAt: "2026-10-02T18:43:25.462Z", lastActiveAt: null, revision: 1 },
            { id: "5f853e4c-087b-4d90-bc8e-02e18f9146fc", fullName: "Phạm Quỳnh Anh", email: "quynhanh.pham@outlook.com", phone: "0933221100", city: "Hải Phòng", role: "USER", status: "SUSPENDED", createdAt: "2026-10-02T18:43:25.802Z", lastActiveAt: "2026-10-01T14:20:00.000Z", revision: 2 },
          ],
          total: 52,
          page: 1,
          limit: 20
        }
      }
    });
  });

  await page.route("**/api/v1/admin/content**", async route => {
    await route.fulfill({
      json: {
        data: {
          items: [
            { id: "c1", title: "Chiến lược quản trị chi phí y tế và chăm sóc sức khỏe tuổi 60+", slug: "chien-luoc-quan-tri-chi-phi-y-te", excerpt: "Phân bổ quỹ bảo hiểm y tế tự nguyện và phòng vệ rủi ro lão khoa dài hạn.", category: "Sức khỏe & Đời sống", authorName: "BS. Lê Quang Minh", thumbnail: null, kind: "ARTICLE", status: "PUBLISHED", revision: 1, publishedAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z" },
            { id: "c2", title: "Cách tính lương hưu BHXH theo Luật Bảo hiểm xã hội mới nhất", slug: "cach-tinh-luong-huu-bhxh-moi-nhat", excerpt: "Chi tiết lộ trình tăng tuổi nghỉ hưu và công thức tính tỷ lệ hưởng lương hưu tối đa.", category: "Chính sách & Pháp luật", authorName: "Vũ Thu Trang", thumbnail: null, kind: "ARTICLE", status: "PUBLISHED", revision: 1, publishedAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z" },
            { id: "c3", title: "Hiểu về Quỹ mở và cách phân bổ tài sản thông minh tại Việt Nam", slug: "hieu-ve-quy-mo-va-phan-bo-tai-san", excerpt: "Kỹ thuật Dollar-Cost Averaging (DCA) vào chứng chỉ quỹ mở VEOF, VESAF để tích lũy an nhàn.", category: "Đầu tư tích lũy", authorName: "Nguyễn Hải Đăng", thumbnail: null, kind: "ARTICLE", status: "PUBLISHED", revision: 1, publishedAt: "2026-09-22T00:00:00.000Z", updatedAt: "2026-09-22T00:00:00.000Z" },
            { id: "c4", title: "5 sai lầm phổ biến khi tích lũy cho hưu trí khiến tiền bị bốc hơi", slug: "5-sai-lam-pho-bien-khi-tich-luy-huu-tri", excerpt: "Không tính tới lạm phát chi tiêu cá nhân và phụ thuộc 100% vào bảo hiểm xã hội.", category: "Quản lý tài chính", authorName: "Ban biên tập An Hưu", thumbnail: null, kind: "ARTICLE", status: "PUBLISHED", revision: 1, publishedAt: "2026-09-28T00:00:00.000Z", updatedAt: "2026-09-28T00:00:00.000Z" },
          ],
          total: 5,
          page: 1,
          limit: 20
        }
      }
    });
  });

  await page.route("**/api/v1/admin/support**", async route => {
    await route.fulfill({
      json: {
        data: {
          items: [
            {
              id: "tk-001",
              subject: "Cần hướng dẫn đồng bộ dữ liệu bảo hiểm xã hội VssID",
              category: "Tài khoản",
              status: "OPEN",
              revision: 1,
              createdAt: "2026-10-02T10:00:00.000Z",
              updatedAt: "2026-10-03T08:30:00.000Z"
            },
            {
              id: "tk-002",
              subject: "Lỗi hiển thị biểu đồ dòng tiền trên thiết bị iPad Safari",
              category: "Sử dụng website",
              status: "IN_PROGRESS",
              revision: 1,
              createdAt: "2026-10-01T15:20:00.000Z",
              updatedAt: "2026-10-02T16:45:00.000Z"
            },
            {
              id: "tk-003",
              subject: "Yêu cầu xuất dữ liệu báo cáo kế hoạch hưu trí file PDF",
              category: "Nội dung",
              status: "RESOLVED",
              revision: 2,
              createdAt: "2026-09-29T09:15:00.000Z",
              updatedAt: "2026-09-30T11:00:00.000Z"
            }
          ],
          total: 3,
          page: 1,
          limit: 20
        }
      }
    });
  });

  await page.route("**/api/v1/admin/partners**", async route => {
    await route.fulfill({
      json: {
        data: {
          items: [
            { id: "part-1", name: "Dragon Capital", type: "OPEN_FUND", logoUrl: null, website: "https://dragoncapital.com.vn", contactEmail: "contact@dragoncapital.com.vn", isHighlight: true, isVisible: true },
            { id: "part-2", name: "Vietcombank", type: "BANK", logoUrl: null, website: "https://vietcombank.com.vn", contactEmail: "support@vietcombank.com.vn", isHighlight: true, isVisible: true },
          ],
          total: 2,
          page: 1,
          limit: 20
        }
      }
    });
  });

  await page.route("**/api/v1/admin/products**", async route => {
    await route.fulfill({
      json: {
        data: {
          items: [
            { id: "prod-1", partnerId: "part-1", name: "Quỹ Đầu tư Cổ phiếu Tiếp cận Thị trường", category: "Quỹ mở cổ phiếu/trái phiếu", expectedReturn: "12%/năm", riskLevel: "MEDIUM", description: "Danh mục cổ phiếu tăng trưởng", annualFee: "1.2%/năm", conditions: "Thời gian nắm giữ tối thiểu 30 ngày", disclosure: "Minh bạch danh mục định kỳ", isVisible: true, partner: { id: "part-1", name: "Dragon Capital", type: "OPEN_FUND" } },
            { id: "prod-2", partnerId: "part-2", name: "Tiền gửi Tích lũy Hưu trí Tương lai", category: "Tiết kiệm mục tiêu", expectedReturn: "6.5%/năm", riskLevel: "LOW", description: "Lãi suất bậc thang kỳ hạn 24 tháng", annualFee: "Miễn phí", conditions: "Trích nợ tự động định kỳ", disclosure: "Bảo hiểm tiền gửi theo quy định", isVisible: true, partner: { id: "part-2", name: "Vietcombank", type: "BANK" } }
          ],
          total: 2,
          page: 1,
          limit: 20
        }
      }
    });
  });

  await page.route("**/api/v1/partners**", async route => {
    await route.fulfill({
      json: {
        data: {
          items: [
            { id: "part-1", name: "Dragon Capital", type: "OPEN_FUND", logoUrl: null, website: "https://dragoncapital.com.vn", contactEmail: "contact@dragoncapital.com.vn", isHighlight: true, isVisible: true },
          ],
          total: 1,
          page: 1,
          limit: 20
        }
      }
    });
  });

  await page.route("**/api/v1/products**", async route => {
    await route.fulfill({
      json: {
        data: {
          items: [
            { id: "prod-1", partnerId: "part-1", name: "Quỹ Đầu tư Cổ phiếu Tiếp cận Thị trường", category: "Quỹ mở cổ phiếu/trái phiếu", expectedReturn: "12%/năm", riskLevel: "MEDIUM", description: "Danh mục cổ phiếu tăng trưởng", annualFee: "1.2%/năm", conditions: "Thời gian nắm giữ tối thiểu 30 ngày", disclosure: "Minh bạch danh mục định kỳ", isVisible: true, partner: { id: "part-1", name: "Dragon Capital", type: "OPEN_FUND" } },
          ],
          total: 1,
          page: 1,
          limit: 20
        }
      }
    });
  });

  await page.route("**/api/v1/admin/settings/**", async route => {
    const url = route.request().url();
    if (url.includes("/logs/audit")) {
      return route.fulfill({
        json: {
          data: {
            items: [
              {
                id: "aud-001",
                action: "UPDATE_SYSTEM_SETTINGS",
                targetType: "SYSTEM_SETTINGS",
                targetId: "sys-01",
                performerName: "Lê Lan Anh",
                performerEmail: "admin@demo.com",
                ipAddress: "127.0.0.1",
                createdAt: "2026-10-03T10:00:00.000Z",
                details: null,
              },
            ],
            total: 1,
            page: 1,
            limit: 20,
          },
        },
      });
    }
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      return route.fulfill({ json: { data: body } });
    }
    if (url.endsWith("/settings/security")) {
      return route.fulfill({ json: { data: { sessionTimeoutMinutes: 60, maxLoginAttempts: 5, accountLockMinutes: 15, passwordMinLength: 12, passwordRequireUppercase: true, passwordRequireLowercase: true, passwordRequireNumber: true, passwordRequireSpecial: true, admin2faRequired: true } } });
    }
    if (url.endsWith("/settings/notifications")) {
      return route.fulfill({ json: { data: { emailEnabled: true, inAppEnabled: true, smsEnabled: false, notifyAccount: true, notifySupport: true, notifyFinancial: true, notifySystem: true } } });
    }
    return route.fulfill({
      json: {
        data: {
          systemName: "An Hưu",
          defaultLanguage: "Tiếng Việt",
          operatingTimezone: "GMT+7 (Việt Nam)",
          supportEmail: "hotro@anhuu.vn",
          maintenanceMode: false,
        },
      },
    });
  });

  await page.route("**/api/v1/products**", async route => {
    await route.fulfill({
      json: {
        data: {
          items: [],
          total: 0,
          page: 1,
          limit: 20
        }
      }
    });
  });

  let savedArticleIds: string[] = [];
  await page.route("**/api/v1/me/saved-articles**", async route => {
    const method = route.request().method();
    const url = route.request().url();
    if (method === "GET") {
      return route.fulfill({ json: { data: savedArticleIds.map(articleId => ({ articleId })) } });
    }
    if (method === "PUT") {
      const match = url.match(/\/saved-articles\/([^/?#]+)/);
      if (match) {
        const id = match[1];
        if (!savedArticleIds.includes(id)) savedArticleIds.push(id);
      }
      return route.fulfill({ json: { data: { saved: true } } });
    }
    if (method === "DELETE") {
      const match = url.match(/\/saved-articles\/([^/?#]+)/);
      if (match) {
        const id = match[1];
        savedArticleIds = savedArticleIds.filter(x => x !== id);
      }
      return route.fulfill({ json: { data: { removed: true } } });
    }
    return route.fulfill({ json: { data: [] } });
  });

  const defaultArticles = [
    {
      id: "art-1",
      title: "Đầu tư định kỳ DCA - Kỷ luật tích lũy hưu trí",
      slug: "dau-tu-dinh-ky-dca",
      excerpt: "Đầu tư định kỳ giúp duy trì kỷ luật và tích lũy an toàn.",
      content: "Đầu tư định kỳ giúp duy trì kỷ luật và tạo thói quen tích lũy tài sản dài hạn hướng tới hưu trí an nhàn.",
      category: "Chiến lược đầu tư & Quỹ",
      authorName: "Chuyên gia An Hưu",
      thumbnail: null,
      kind: "ARTICLE" as const,
      status: "PUBLISHED" as const,
      revision: 1,
      publishedAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z"
    },
    {
      id: "art-2",
      title: "Bảo hiểm Xã hội (BHXH) và quyền lợi nghỉ hưu",
      slug: "bao-hiem-xa-hoi-bhxh",
      excerpt: "Chi tiết cách tính và tối ưu mức hưởng lương hưu BHXH.",
      content: "Bảo hiểm xã hội là trụ cột an sinh then chốt trong kế hoạch tài chính hưu trí của người lao động.",
      category: "Bảo hiểm Xã hội (BHXH)",
      authorName: "Ban Chính sách An Hưu",
      thumbnail: null,
      kind: "ARTICLE" as const,
      status: "PUBLISHED" as const,
      revision: 1,
      publishedAt: "2026-10-02T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z"
    },
    {
      id: "art-3",
      title: "Phân bổ tài sản thông minh và quản trị rủi ro",
      slug: "phan-bo-tai-san-thong-minh",
      excerpt: "Cách cân đối các lớp tài sản theo độ tuổi và thời gian còn lại.",
      content: "Phân bổ tài sản hợp lý là yếu tố quyết định hơn 90% hiệu quả đầu tư trong suốt giai đoạn tích lũy.",
      category: "Chiến lược đầu tư & Quỹ",
      authorName: "Ban Đầu tư An Hưu",
      thumbnail: null,
      kind: "ARTICLE" as const,
      status: "PUBLISHED" as const,
      revision: 1,
      publishedAt: "2026-10-03T00:00:00.000Z",
      updatedAt: "2026-10-03T00:00:00.000Z"
    },
    {
      id: "art-4",
      title: "Kế hoạch chăm sóc sức khỏe và bảo hiểm y tế tuổi vàng",
      slug: "cham-soc-suc-khoe-tuoi-vang",
      excerpt: "Dự phòng chi phí y tế phát sinh ngoài danh mục BHYT chi trả.",
      content: "Bảo vệ tài chính trước những rủi ro sức khỏe không lường trước sau 60 tuổi.",
      category: "Bảo hiểm y tế & Sức khỏe",
      authorName: "Ban Sức khỏe An Hưu",
      thumbnail: null,
      kind: "ARTICLE" as const,
      status: "PUBLISHED" as const,
      revision: 1,
      publishedAt: "2026-10-04T00:00:00.000Z",
      updatedAt: "2026-10-04T00:00:00.000Z"
    }
  ];

  const defaultGlossary = [
    { id: "g1", title: "Lãi kép", slug: "lai-kep", excerpt: "Kỳ quan thứ 8 của thế giới.", content: "Lãi kép là lợi nhuận sinh ra từ cả vốn gốc ban đầu và lãi lũy kế của các kỳ trước.", category: "Đầu tư", kind: "GLOSSARY" as const, status: "PUBLISHED" as const },
    { id: "g2", title: "Chỉ số giá tiêu dùng (CPI)", slug: "cpi", excerpt: "Thước đo lạm phát.", content: "Chỉ số giá tiêu dùng đo lường sự thay đổi giá cả hàng hóa dịch vụ theo thời gian.", category: "Kinh tế", kind: "GLOSSARY" as const, status: "PUBLISHED" as const },
    { id: "g3", title: "Tỷ lệ thay thế thu nhập", slug: "ty-le-thay-the", excerpt: "Tỷ lệ giữa lương hưu và thu nhập trước hưu.", content: "Tỷ lệ phần trăm thu nhập sau khi nghỉ hưu so với mức thu nhập trước khi nghỉ hưu.", category: "Hưu trí", kind: "GLOSSARY" as const, status: "PUBLISHED" as const },
    { id: "g4", title: "Quỹ hưu trí tự nguyện", slug: "quy-huu-tri-tu-nguyen", excerpt: "Quỹ hưu trí bổ sung.", content: "Sản phẩm tài chính dài hạn được lập ra nhằm bổ sung thu nhập cho người lao động khi hết tuổi lao động.", category: "Hưu trí", kind: "GLOSSARY" as const, status: "PUBLISHED" as const },
    { id: "g5", title: "Chứng chỉ quỹ (CCQ)", slug: "chung-chi-quy", excerpt: "Chứng khoán xác nhận quyền sở hữu phần vốn trong quỹ.", content: "Xác nhận quyền sở hữu một phần tài sản trong quỹ mở của nhà đầu tư.", category: "Đầu tư", kind: "GLOSSARY" as const, status: "PUBLISHED" as const },
    { id: "g6", title: "Đa dạng hóa danh mục", slug: "da-dang-hoa", excerpt: "Phân bổ vốn nhiều kênh.", content: "Chiến lược phân bổ rủi ro bằng cách đầu tư vào nhiều loại tài sản khác nhau.", category: "Đầu tư", kind: "GLOSSARY" as const, status: "PUBLISHED" as const },
    { id: "g7", title: "Lạm phát danh nghĩa", slug: "lam-phat-danh-nghia", excerpt: "Mức trượt giá tiền tệ.", content: "Tỷ lệ tăng giá chung của rổ hàng hóa dịch vụ chưa điều chỉnh.", category: "Kinh tế", kind: "GLOSSARY" as const, status: "PUBLISHED" as const },
    { id: "g8", title: "Lợi suất thực", slug: "loi-suat-thuc", excerpt: "Lợi suất sau lạm phát.", content: "Lợi nhuận đầu tư sau khi đã trừ đi tỷ lệ lạm phát tương ứng.", category: "Tài chính", kind: "GLOSSARY" as const, status: "PUBLISHED" as const },
    { id: "g9", title: "Quỹ khẩn cấp", slug: "quy-khan-cap", excerpt: "Dự phòng 3-6 tháng chi tiêu.", content: "Khoản tiền dự phòng dùng trong các trường hợp rủi ro bất ngờ về sức khỏe, việc làm.", category: "Tài chính", kind: "GLOSSARY" as const, status: "PUBLISHED" as const },
    { id: "g10", title: "Bảo hiểm Xã hội (BHXH)", slug: "bhxh", excerpt: "Hệ thống an sinh nhà nước.", content: "Chính sách an sinh xã hội cơ bản của nhà nước nhằm bảo vệ người lao động.", category: "Chính sách", kind: "GLOSSARY" as const, status: "PUBLISHED" as const },
    { id: "g11", title: "Bảo hiểm Y tế (BHYT)", slug: "bhyt", excerpt: "Bảo hiểm khám chữa bệnh.", content: "Hình thức bảo hiểm bắt buộc hỗ trợ chi phí khám chữa bệnh cho người tham gia.", category: "Chính sách", kind: "GLOSSARY" as const, status: "PUBLISHED" as const },
    { id: "g12", title: "Bảng tử kỳ", slug: "bang-tu-ky", excerpt: "Thống kê tuổi thọ.", content: "Bảng xác suất tử vong theo độ tuổi dùng trong định phí bảo hiểm và tính toán hưu trí.", category: "Thống kê", kind: "GLOSSARY" as const, status: "PUBLISHED" as const },
  ];

  function stripAccents(s: string) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase();
  }

  await page.route("**/api/v1/content**", async route => {
    const url = new URL(route.request().url());
    const kind = url.searchParams.get("kind") || "ARTICLE";
    const search = url.searchParams.get("search")?.trim() || "";
    const category = url.searchParams.get("category");
    const pool = kind === "GLOSSARY" ? defaultGlossary : defaultArticles;
    let filtered = pool;
    if (category && category !== "all") {
      filtered = filtered.filter(item => item.category === category);
    }
    if (search) {
      const tokens = stripAccents(search).split(/\s+/).filter(Boolean);
      filtered = filtered.filter(item => {
        const target = stripAccents((item.title || "") + " " + (item.content || item.excerpt || ""));
        return tokens.every(t => target.includes(t));
      });
    }
    return route.fulfill({
      json: {
        data: {
          items: filtered,
          total: filtered.length,
          page: 1,
          limit: 20
        }
      }
    });
  });

  await page.route("**/api/v1/me/bookmarks**", async route => {
    await route.fulfill({
      json: {
        data: {
          items: [],
          total: 0
        }
      }
    });
  });

  await page.route("**/api/v1/me/saved-content**", async route => {
    const saved = defaultArticles.filter(a => savedArticleIds.includes(a.id));
    return route.fulfill({
      json: {
        data: {
          items: saved,
          total: saved.length
        }
      }
    });
  });

  await page.route("**/api/v1/me/financial-profile", async route => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { data: defaultMockProfile() } });
    }
    return route.continue();
  });

  let currentPlan = {
    id: "plan-mock-1",
    userId: "USR-001",
    currentVersionId: "ver-mock-1",
    baselineVersionId: "ver-mock-1",
    revision: 1,
    stale: false,
    createdAt: "2026-10-04T00:00:00.000Z",
    current: {
      id: "ver-mock-1",
      planId: "plan-mock-1",
      version: 1,
      createdAt: "2026-10-04T00:00:00.000Z",
      profileRevision: 1,
      snapshotHash: "hash-mock",
      preview: {
        status: "READY",
        inputHash: "mock-hash",
        policy: { id: "pol-1", version: 1, hash: "p-hash" },
        assumptions: { id: "asm-1", version: 1, hash: "a-hash" },
        selection: {
          retirementAge: 60,
          monthlySavings: 5000000,
          targetRetirementExpense: 20000000,
        },
        calculation: {
          summary: {
            retirementFundingShortfall: "0",
            atRetirement: {
              requiredFund: "5000000000",
              projectedFund: "6000000000",
              coveragePercent: "120",
            }
          },
          annualProjections: []
        }
      }
    },
    profileChanged: false,
    updates: { assumptions: null, policy: null },
    updatePolicy: "MANUAL"
  };

  await page.route("**/api/v1/me/notifications**", async route => {
    return route.fulfill({ json: { data: { items: [], total: 0, unreadCount: 0 } } });
  });

  await page.route("**/api/v1/me/portfolio-policies**", async route => {
    const url = route.request().url();
    if (url.includes("/portfolio-policies/") && !url.includes("?")) {
      return route.fulfill({
        json: {
          data: {
            id: "pol-1",
            version: 1,
            revision: 1,
            status: "PUBLISHED",
            data: {
              schemaVersion: 1,
              title: "Chính sách danh mục chuẩn",
              reason: "Chuẩn hóa",
              effectiveFrom: "2026-01-01T00:00:00.000Z",
              assumptionVersionId: "asm-1",
              source: { title: "An Hưu", url: "", release: "1.0", reviewedOn: "2026-01-01" },
              questions: [],
              riskBands: [],
              templates: [],
              rules: [],
              scenarios: []
            },
            documentHash: "hash-p",
            createdBy: "ADM-001",
            publishedBy: "ADM-001",
            createdAt: "2026-01-01T00:00:00.000Z",
            effectiveAt: "2026-01-01T00:00:00.000Z"
          }
        }
      });
    }
    return route.fulfill({
      json: {
        data: {
          status: "AVAILABLE",
          total: 1,
          page: 1,
          limit: 20,
          items: [{
            id: "pol-1",
            version: 1,
            revision: 1,
            status: "PUBLISHED",
            title: "Chính sách danh mục chuẩn",
            effectiveAt: "2026-01-01T00:00:00.000Z"
          }]
        }
      }
    });
  });

  await page.route(/(?:policies\/.*\/preview-monthly|me\/retirement\/preview)/, async route => {
    return route.fulfill({ json: { data: currentPlan.current.preview } });
  });

  await page.route("**/api/v1/me/retirement/plans**", async route => {
    const method = route.request().method();
    const url = route.request().url();
    if (method === "POST" && url.includes("/simulate")) {
      return route.fulfill({
        json: {
          data: {
            baseline: currentPlan.current,
            candidate: currentPlan.current.preview,
            comparison: {
              status: "COMPARABLE",
              reasons: [],
              direction: "CANDIDATE_MINUS_BASELINE",
              basis: "VALUATION_DATE_EACH_VERSION_DISCOUNT_FACTORS",
              delta: {
                projectedFundAtValuation: "100000000",
                requiredFundAtValuation: "0",
                fundingGapAtValuation: "-100000000",
                coveragePercentagePoints: "5",
                requiredConstantMonthlyContribution: "0",
                additionalMonthlyContribution: "0",
                unfundedWithdrawals: "0",
                terminalBalance: "0"
              },
              differences: {
                profile: false,
                policy: false,
                assumptions: false,
                retirementMonth: false,
                selectionFields: []
              },
              limitations: []
            },
            saved: false,
            applied: false
          }
        }
      });
    }
    if (method === "POST" && url.includes("/apply")) {
      currentPlan.revision += 1;
      return route.fulfill({
        json: {
          data: {
            planId: currentPlan.id,
            revision: currentPlan.revision,
            currentVersionId: currentPlan.currentVersionId,
            applied: true
          }
        }
      });
    }
    if (method === "POST") {
      const savedVersion = {
        id: "ver-mock-2",
        planId: currentPlan.id,
        version: 2,
        createdAt: new Date().toISOString(),
        profileRevision: 1,
        snapshotHash: "hash-mock-2",
        preview: currentPlan.current.preview
      };
      return route.fulfill({
        json: {
          data: {
            planId: currentPlan.id,
            revision: currentPlan.revision,
            currentVersionId: currentPlan.currentVersionId,
            baselineVersionId: currentPlan.baselineVersionId,
            saved: savedVersion
          }
        }
      });
    }
    if (url.includes("/versions/")) {
      return route.fulfill({ json: { data: currentPlan.current } });
    }
    if (url.includes("/versions")) {
      return route.fulfill({
        json: {
          data: {
            items: [currentPlan.current],
            total: 1,
            page: 1,
            limit: 20
          }
        }
      });
    }
    if (url.endsWith("/me/retirement/plans") || url.includes("/plans?")) {
      return route.fulfill({
        json: {
          data: {
            items: [currentPlan],
            total: 1,
            page: 1,
            limit: 20
          }
        }
      });
    }
    return route.fulfill({ json: { data: currentPlan } });
  });

  await page.route("**/api/v1/admin/audit-logs**", async route => {
    return route.fulfill({
      json: {
        data: {
          items: [
            {
              id: "aud-001",
              action: "AUTH_LOGIN",
              performerId: "USR-001",
              targetType: "USER",
              targetId: "USR-001",
              createdAt: "2026-10-04T12:00:00.000Z"
            }
          ],
          total: 1,
          page: 1,
          limit: 20
        }
      }
    });
  });

  await page.route("**/api/v1/me/notification-settings**", async route => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      return route.fulfill({
        json: {
          data: {
            revision: (body.expectedRevision || 1) + 1,
            emailDigest: body.emailDigest ?? true,
            goalAlerts: body.goalAlerts ?? true,
            partnerUpdates: body.partnerUpdates ?? false,
            deliveryAvailable: { emailDigest: true, goalAlerts: true, partnerUpdates: true },
            securityAndSupportRequired: true,
          }
        }
      });
    }
    return route.fulfill({
      json: {
        data: {
          revision: 1,
          emailDigest: true,
          goalAlerts: true,
          partnerUpdates: false,
          deliveryAvailable: { emailDigest: true, goalAlerts: true, partnerUpdates: true },
          securityAndSupportRequired: true,
        }
      }
    });
  });

  let aiPrivacy = {
    revision: 1,
    processing: true,
    saveHistory: true,
    policyVersion: "ai-explanation-2026-10-v1",
    acceptedPolicyVersion: "ai-explanation-2026-10-v1",
    retentionDays: 30,
    purpose: "Hỗ trợ giải thích và dự báo kế hoạch hưu trí",
    providerData: ["Kế hoạch hưu trí", "Giả định kinh tế"],
    excludedData: ["Số CMND/CCCD", "Thông tin thanh toán ngân hàng"],
    historyPolicy: "Lưu trữ 30 ngày để người dùng theo dõi mạch hội thoại",
    providerConfigured: true,
  };

  await page.route("**/api/v1/me/ai/privacy", async route => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      aiPrivacy = {
        ...aiPrivacy,
        revision: (body.expectedRevision || aiPrivacy.revision) + 1,
        processing: body.processing ?? aiPrivacy.processing,
        saveHistory: body.saveHistory ?? aiPrivacy.saveHistory,
        acceptedPolicyVersion: body.policyVersion || aiPrivacy.acceptedPolicyVersion,
      };
      return route.fulfill({ json: { data: aiPrivacy } });
    }
    return route.fulfill({ json: { data: aiPrivacy } });
  });

  await page.route("**/api/v1/me/ai/conversations**", async route => {
    const url = route.request().url();
    const method = route.request().method();
    if (method === "POST" && !url.includes("/rename")) {
      return route.fulfill({
        json: {
          data: {
            id: "conv-mock-1",
            title: "Tư vấn kế hoạch hưu trí",
            revision: 1,
            expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
          }
        }
      });
    }
    if (method === "DELETE") {
      return route.fulfill({ json: { data: { deleted: true } } });
    }
    if (url.includes("/export")) {
      return route.fulfill({
        json: {
          data: {
            markdown: "# Cuộc trò chuyện hưu trí\n\nNội dung mô phỏng.",
            filename: "cuoc-tro-chuyen-huu-tri.md"
          }
        }
      });
    }
    return route.fulfill({
      json: {
        data: {
          items: [],
          total: 0,
          page: 1,
          limit: 20
        }
      }
    });
  });

  await page.route("**/api/v1/me/ai/explain", async route => {
    const body = route.request().postDataJSON();
    return route.fulfill({
      json: {
        data: {
          status: "AI_ASSISTED",
          answer: `Để đạt mục tiêu kế hoạch hưu trí với câu hỏi "${body?.question || ""}", bạn cần duy trì tích lũy định kỳ và tối ưu hóa phân bổ tài sản.`,
          facts: [
            { key: "monthlySavings", text: "Khoản tiết kiệm khuyến nghị: 5.000.000 ₫/tháng" },
            { key: "targetAge", text: "Độ tuổi nghỉ hưu mục tiêu: 60 tuổi" }
          ],
          citations: [
            {
              id: "cit-1",
              sourceId: "law-bhxh-2024",
              title: "Luật Bảo hiểm xã hội 2024",
              version: "1.0",
              url: null,
              contentHash: "hash123",
              effectiveDate: "2025-07-01",
              excerpt: "Quy định lộ trình điều chỉnh tuổi nghỉ hưu và mức hưởng BHXH."
            }
          ],
          provenance: {
            planId: "plan-mock-1",
            versionId: "ver-mock-1",
            snapshotHash: "hash-mock",
            modelVersion: "1.0",
            valuationDate: "2026-10-04",
            profileRevision: 1,
            references: null,
            hypothetical: false,
            warningCodes: [],
            sources: null,
            valueKind: "FORECAST",
            actuals: null
          },
          knowledgeStatus: "AVAILABLE",
          nextAction: "Xem lại danh mục phân bổ tài sản",
          applied: false,
          savedHistory: true,
          conversationId: "conv-mock-1",
          revision: 1,
          provider: "MOCK_AI"
        }
      }
    });
  });

  await page.route("**/api/v1/me/ai/simulate", async route => {
    return route.fulfill({
      json: {
        data: {
          baseline: currentPlan.current,
          candidate: currentPlan.current.preview,
          comparison: {
            status: "COMPARABLE",
            reasons: [],
            direction: "CANDIDATE_MINUS_BASELINE",
            basis: "VALUATION_DATE_EACH_VERSION_DISCOUNT_FACTORS",
            delta: {
              projectedFundAtValuation: "100000000",
              requiredFundAtValuation: "0",
              fundingGapAtValuation: "-100000000",
              coveragePercentagePoints: "5",
              requiredConstantMonthlyContribution: "0",
              additionalMonthlyContribution: "0",
              unfundedWithdrawals: "0",
              terminalBalance: "0"
            },
            differences: {
              profile: false,
              policy: false,
              assumptions: false,
              retirementMonth: false,
              selectionFields: []
            },
            limitations: []
          },
          saved: false,
          applied: false
        }
      }
    });
  });
}

export function defaultMockProfile() {
  return {
    revision: 1,
    asOfDate: "2026-10-04T00:00:00.000Z",
    schemaVersion: 1,
    data: {
      personal: { age: 32, gender: "MALE", maritalStatus: "MARRIED", dependents: 1, city: "Hà Nội" },
      income: { primaryIncome: "25000000.00", secondaryIncome: "5000000.00" },
      expenses: { essentialExpense: "15000000.00", lifestyleExpense: "5000000.00" },
      assets: { cashSavings: "100000000.00", realEstateValue: "2000000000.00", liquidAssets: "50000000.00", stockFundValue: "80000000.00" },
      debt: { hasDebt: false, mortgageDebt: "0.00", consumerDebt: "0.00", monthlyDebtService: "0.00" },
      socialSecurity: { socialInsuranceYears: 8, socialInsuranceSalary: "12000000.00" },
    },
  };
}

export async function installFinancialProfileRoutes(page: Page, initial?: { profile?: any; draft?: any }) {
  let profile = initial?.profile !== undefined ? initial.profile : defaultMockProfile();
  let draft = initial?.draft ?? null;

  await page.route("**/api/v1/me/financial-profile", async route => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { data: profile } });
    }
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      profile = {
        ...profile,
        revision: (profile?.revision || 0) + 1,
        asOfDate: new Date().toISOString(),
        data: {
          ...profile?.data,
          ...body.changes,
          personal: { ...profile?.data?.personal, ...body.changes?.personal },
          income: { ...profile?.data?.income, ...body.changes?.income },
          expenses: { ...profile?.data?.expenses, ...body.changes?.expenses },
          assets: { ...profile?.data?.assets, ...body.changes?.assets },
          debt: { ...profile?.data?.debt, ...body.changes?.debt },
          socialSecurity: { ...profile?.data?.socialSecurity, ...body.changes?.socialSecurity },
        },
      };
      return route.fulfill({ json: { data: profile } });
    }
    return route.continue();
  });

  await page.route("**/api/v1/me/onboarding-draft", async route => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { data: draft } });
    }
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      draft = {
        revision: (draft?.revision || 0) + 1,
        step: body.step,
        data: body.data,
        updatedAt: new Date().toISOString(),
      };
      return route.fulfill({ json: { data: draft } });
    }
    return route.continue();
  });

  await page.route("**/api/v1/me/onboarding/complete", async route => {
    const nextRevision = (profile?.revision || 0) + 1;
    profile = {
      revision: nextRevision,
      asOfDate: new Date().toISOString(),
      schemaVersion: 1,
      data: draft?.data || profile?.data || defaultMockProfile().data,
    };
    draft = null;
    return route.fulfill({ json: { data: { revision: nextRevision } } });
  });

  await page.route("**/api/v1/me/assumptions**", async route => {
    return route.fulfill({ json: { data: { status: "AVAILABLE", total: 1, items: [{ id: "asm-1", version: 1, revision: 1, status: "PUBLISHED", title: "Chuỗi giả định chính thức 2026-2045", effectiveAt: "2026-10-04T00:00:00.000Z", projectionStartYear: 2026, projectionEndYear: 2045 }] } } });
  });

  return {
    getProfile: () => profile,
    getDraft: () => draft,
    setProfile: (p: any) => { profile = p; },
    setDraft: (d: any) => { draft = d; },
  };
}

export async function fillEvidence(page: Page, title: string, reference = "TEST-EVIDENCE-ONLY", confirmedOn = "2026-10-08") {
  const group = page.getByRole("group", { name: title, exact: true });
  await group.getByLabel("Tên / số hiệu căn cứ", { exact: true }).fill(reference);
  await group.getByLabel("Ngày xác nhận căn cứ", { exact: true }).fill(confirmedOn);
  await group.getByLabel("Trích nội dung từ hồ sơ / mô tả giả định", { exact: true }).fill("Nội dung fixture dành riêng cho kiểm thử; không phải chứng từ người dùng.");
}
