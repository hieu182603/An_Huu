import { test, expect, type Page } from "@playwright/test";
import { installRouteAuth } from "./helpers";

const OTHER_ID = "7f1c2a9e-3b4d-4c5e-8f60-112233445566";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Grant = { role: string; grantedBy: string | null; createdAt: string };
const grant = (role: string): Grant => ({ role, grantedBy: "ADM-001", createdAt: "2026-11-01T03:00:00.000Z" });

async function mockInvestmentRoles(page: Page, myRoles: string[]) {
  await installRouteAuth(page, "ADM-001");
  const admins = [
    { userId: "ADM-001", fullName: "Lê Lan Anh", email: "admin@demo.com", status: "ACTIVE", roles: [grant("SYSTEM_ADMIN")] },
    { userId: OTHER_ID, fullName: "Trần Quốc Bảo", email: "bao.tran@demo.com", status: "ACTIVE", roles: [grant("DATA_ADMIN")] },
  ];
  const calls: { path: string; body: unknown }[] = [];
  let listRequests = 0;
  await page.route("**/api/v1/investments/permissions", (route) =>
    route.fulfill({ json: { data: { roles: myRoles, publicationEnabled: false } } }));
  await page.route("**/api/v1/admin/investment-roles**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1/admin/investment-roles", "");
    if (request.method() === "GET" && path === "") {
      listRequests++;
      return route.fulfill({ json: { data: { items: admins, assignableRoles: ["OPERATIONS", "DATA_ADMIN", "MODEL_ADMIN", "ADVISOR", "APPROVER", "SYSTEM_ADMIN"] } } });
    }
    const body = request.postDataJSON() as { role: string; reason: string };
    calls.push({ path, body });
    const [, userId, action] = path.split("/");
    const admin = admins.find((item) => item.userId === userId)!;
    if (action === "revoke" && body.role === "SYSTEM_ADMIN") {
      return route.fulfill({ status: 409, json: { error: { code: "LAST_ROLE_MANAGER", message: "Không thể thu hồi SYSTEM_ADMIN cuối cùng." } } });
    }
    if (action === "grant" && body.role === "OPERATIONS") {
      // The row on screen was stale: the server already had the role.
      return route.fulfill({ json: { data: { ...admin, roles: [...admin.roles, grant("OPERATIONS")], changed: false } } });
    }
    if (action === "grant") admin.roles = [...admin.roles, grant(body.role)];
    else admin.roles = admin.roles.filter((item) => item.role !== body.role);
    return route.fulfill({ json: { data: { ...admin, changed: true } } });
  });
  await page.goto("/admin/investment-roles");
  return { calls, listRequests: () => listRequests };
}

const roleSwitch = (page: Page, name: string) => page.getByRole("switch", { name, exact: true });

test("investment roles: toggle asks for a reason, confirms and updates the row", async ({ page }, testInfo) => {
  const { calls } = await mockInvestmentRoles(page, ["SYSTEM_ADMIN"]);
  await expect(page.getByRole("heading", { name: "Phân quyền đầu tư", level: 1 })).toBeVisible();
  await expect(page.locator(".admin-nav a.is-active")).toHaveAttribute("href", "/admin/investment-roles");

  const model = roleSwitch(page, "Quản trị mô hình (MODEL_ADMIN): Trần Quốc Bảo");
  await expect(model).not.toBeChecked();
  await model.dispatchEvent("click");
  const dialog = page.getByRole("dialog", { name: "Cấp vai trò Quản trị mô hình" });
  await expect(dialog).toBeVisible();
  await expect(model).not.toBeChecked(); // nothing changes before confirmation
  await page.screenshot({ path: testInfo.outputPath("investment-role-confirm.png") });
  const confirm = dialog.getByRole("button", { name: "Xác nhận cấp" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Lý do (bắt buộc)").fill("ab");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Lý do (bắt buộc)").fill("Phụ trách mô hình danh mục quý 4");
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await expect(model).toBeChecked();
  await expect(page.getByText("Đã cấp vai trò Quản trị mô hình cho Trần Quốc Bảo.")).toBeVisible();
  expect(calls[0]).toEqual({ path: `/${OTHER_ID}/grant`, body: { role: "MODEL_ADMIN", reason: "Phụ trách mô hình danh mục quý 4" } });

  // Cancelling sends nothing.
  await roleSwitch(page, "Quản trị dữ liệu (DATA_ADMIN): Trần Quốc Bảo").dispatchEvent("click");
  await page.getByRole("dialog", { name: "Thu hồi vai trò Quản trị dữ liệu" }).getByRole("button", { name: "Hủy bỏ" }).click();
  await expect(roleSwitch(page, "Quản trị dữ liệu (DATA_ADMIN): Trần Quốc Bảo")).toBeChecked();
  expect(calls).toHaveLength(1);

  // A duplicate grant (changed: false) is not an error.
  await roleSwitch(page, "Vận hành (OPERATIONS): Trần Quốc Bảo").dispatchEvent("click");
  const ops = page.getByRole("dialog", { name: "Cấp vai trò Vận hành" });
  await ops.getByLabel("Lý do (bắt buộc)").fill("Theo dõi nhà cung cấp");
  await ops.getByRole("button", { name: "Xác nhận cấp" }).click();
  await expect(ops).toHaveCount(0);
  await expect(page.getByText("Trần Quốc Bảo đã có vai trò Vận hành từ trước, không có thay đổi.")).toBeVisible();
  await expect(roleSwitch(page, "Vận hành (OPERATIONS): Trần Quốc Bảo")).toBeChecked();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("investment roles: revoking the last SYSTEM_ADMIN shows the 409 and keeps the dialog", async ({ page }) => {
  const { calls } = await mockInvestmentRoles(page, ["SYSTEM_ADMIN"]);
  const sys = roleSwitch(page, "Quản trị hệ thống (SYSTEM_ADMIN): Lê Lan Anh");
  await expect(sys).toBeChecked();
  await sys.dispatchEvent("click");
  const dialog = page.getByRole("dialog", { name: "Thu hồi vai trò Quản trị hệ thống" });
  await expect(dialog.getByText("Bạn đang thu hồi SYSTEM_ADMIN của chính mình")).toBeVisible();
  await dialog.getByLabel("Lý do (bắt buộc)").fill("Chuyển giao quyền");
  await dialog.getByRole("button", { name: "Xác nhận thu hồi" }).click();
  await expect(dialog.locator("p[role=alert]")).toContainText("SYSTEM_ADMIN đang hoạt động cuối cùng. Hãy cấp SYSTEM_ADMIN cho một quản trị viên khác trước.");
  await expect(dialog.getByLabel("Lý do (bắt buộc)")).toHaveValue("Chuyển giao quyền");
  expect(calls).toEqual([{ path: "/ADM-001/revoke", body: { role: "SYSTEM_ADMIN", reason: "Chuyển giao quyền" } }]);
  await dialog.getByRole("button", { name: "Hủy bỏ" }).click();
  await expect(sys).toBeChecked();
});

test("investment roles: admins without SYSTEM_ADMIN see why and get no switches", async ({ page }) => {
  const { listRequests } = await mockInvestmentRoles(page, ["DATA_ADMIN"]);
  await expect(page.getByText("Chỉ quản trị viên hệ thống (SYSTEM_ADMIN) được phân quyền đầu tư.")).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);
  expect(listRequests()).toBe(0);
});

test("users page links to investment roles", async ({ page }) => {
  await mockInvestmentRoles(page, ["SYSTEM_ADMIN"]);
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Phân quyền đầu tư (ADMIN)" }).click();
  await expect(page).toHaveURL(/\/admin\/investment-roles$/);
});

test("broadcast: preview, confirm, retry with the same Idempotency-Key, new key for a new send", async ({ page }, testInfo) => {
  await installRouteAuth(page, "ADM-001");
  const sent: { key: string | undefined; body: unknown }[] = [];
  let failNext = true;
  await page.route("**/api/v1/admin/notifications/broadcast", async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as { title: string; message: string };
    sent.push({ key: request.headers()["idempotency-key"], body });
    if (failNext) {
      failNext = false;
      return route.fulfill({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: "Máy chủ gián đoạn." } } });
    }
    const replayed = sent.length > 2 && sent[sent.length - 1].key === sent[sent.length - 2].key;
    return route.fulfill({ json: { data: { broadcasted: true, broadcastId: "b-1", ...body, recipients: 42, replayed } } });
  });
  await page.goto("/admin/broadcast");
  await expect(page.locator(".admin-nav a.is-active")).toHaveAttribute("href", "/admin/broadcast");
  const send = page.getByRole("button", { name: "Xem lại và gửi" });
  await expect(send).toBeDisabled();
  await page.getByLabel("Tiêu đề", { exact: true }).fill("Bảo trì hệ thống");
  await page.getByLabel("Nội dung", { exact: true }).fill("Hệ thống bảo trì từ 22:00 đến 23:00 tối nay.");
  await expect(page.getByText("16/120")).toBeVisible();
  await expect(page.locator(".ag-broadcast-preview-card")).toContainText("Hệ thống bảo trì từ 22:00 đến 23:00 tối nay.");
  await send.click();

  const dialog = page.getByRole("dialog", { name: "Gửi tới tất cả người dùng đang hoạt động" });
  await expect(dialog).toContainText("Bảo trì hệ thống");
  await page.screenshot({ path: testInfo.outputPath("broadcast-confirm.png") });
  await dialog.getByRole("button", { name: "Xác nhận gửi" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Máy chủ gián đoạn.");
  await dialog.getByRole("button", { name: "Thử gửi lại" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Đã gửi tới 42 người dùng")).toBeVisible();

  expect(sent).toHaveLength(2);
  expect(sent[0].key).toMatch(UUID);
  expect(sent[1].key).toBe(sent[0].key);
  expect(sent[0].body).toEqual({ title: "Bảo trì hệ thống", message: "Hệ thống bảo trì từ 22:00 đến 23:00 tối nay." });
  await expect(page.getByLabel("Tiêu đề", { exact: true })).toHaveValue("");

  // A new send gets a new key.
  await page.getByLabel("Tiêu đề", { exact: true }).fill("Cập nhật điều khoản");
  await page.getByLabel("Nội dung", { exact: true }).fill("Điều khoản sử dụng đã được cập nhật.");
  await page.getByRole("button", { name: "Xem lại và gửi" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Xác nhận gửi" }).click();
  await expect(page.getByText("Đã gửi tới 42 người dùng")).toBeVisible();
  expect(sent).toHaveLength(3);
  expect(sent[2].key).toMatch(UUID);
  expect(sent[2].key).not.toBe(sent[0].key);
});

test("broadcast: a replayed response says nothing was sent again", async ({ page }) => {
  await installRouteAuth(page, "ADM-001");
  await page.route("**/api/v1/admin/notifications/broadcast", (route) =>
    route.fulfill({ json: { data: { broadcasted: true, broadcastId: "b-1", title: "A", message: "B", recipients: 7, replayed: true } } }));
  await page.goto("/admin/broadcast");
  await page.getByLabel("Tiêu đề", { exact: true }).fill("A");
  await page.getByLabel("Nội dung", { exact: true }).fill("B");
  await page.getByRole("button", { name: "Xem lại và gửi" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Xác nhận gửi" }).click();
  await expect(page.getByText("Đã gửi tới 7 người dùng")).toBeVisible();
  await expect(page.getByText("máy chủ trả lại kết quả cũ và không gửi thêm lần nữa")).toBeVisible();
});

const operations = (failures: number) => ({
  asOfDate: "2026-11-12T08:00:00.000Z", api: "ready", database: "connected", uptimeSeconds: 2 * 86400 + 3 * 3600 + 5 * 60,
  configuration: { email: true, encryption: true, google: false, media: true },
  mailJobs: { PENDING: 3, COMPLETED: 120, FAILED: failures },
  mailDeliveryEvidence: "COMPLETED_IS_PROVIDER_ACCEPTED_NOT_DELIVERED",
  recentFailures: Array.from({ length: failures }, (_, i) => ({
    id: `job-${i + 1}`, type: i ? "auth.reset_password" : "auth.verify_email", attempts: 5, lastErrorCode: "SMTP_TIMEOUT", createdAt: "2026-11-12T07:00:00.000Z",
  })),
  lastJobCompletedAt: "2026-11-12T07:59:00.000Z",
});

test("operations: shows status cards, mail job counts and failed jobs", async ({ page }, testInfo) => {
  await installRouteAuth(page, "ADM-001");
  let requests = 0;
  await page.route("**/api/v1/admin/operations", (route) => { requests++; return route.fulfill({ json: { data: operations(2) } }); });
  await page.goto("/admin/operations");
  await expect(page).toHaveURL(/\/admin\/operations$/);
  await expect(page.getByRole("heading", { name: "Tình trạng hệ thống", level: 1 })).toBeVisible();
  await expect(page.locator(".admin-nav a.is-active")).toHaveAttribute("href", "/admin/operations");
  await expect(page.locator(".ag-health-card").first()).toContainText("Sẵn sàng");
  await expect(page.locator(".ag-health-card").filter({ hasText: "Cơ sở dữ liệu" })).toContainText("Đã kết nối");
  await expect(page.locator(".ag-health-card").filter({ hasText: "Thời gian chạy" })).toContainText("2 ngày 3 giờ 5 phút");
  await expect(page.locator(".ag-job-counts")).toContainText("120");
  await expect(page.getByText("COMPLETED = nhà cung cấp email đã nhận, chưa chắc đã giao")).toBeVisible();
  const rows = page.locator(".ag-failure-table tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Email xác minh tài khoản");
  await expect(rows.first()).toContainText("SMTP_TIMEOUT");
  await page.screenshot({ path: testInfo.outputPath("operations.png"), fullPage: true });
  await page.getByRole("button", { name: "Tải lại" }).click();
  await expect.poll(() => requests).toBe(2);
});

test("operations: load error offers retry, and no failures shows the empty state", async ({ page }) => {
  await installRouteAuth(page, "ADM-001");
  let fail = true;
  await page.route("**/api/v1/admin/operations", (route) => {
    if (fail) { fail = false; return route.fulfill({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: "Không đọc được hàng đợi." } } }); }
    return route.fulfill({ json: { data: operations(0) } });
  });
  await page.goto("/admin/operations");
  const alert = page.getByRole("alert").filter({ hasText: "Không tải được tình trạng hệ thống" });
  await expect(alert).toContainText("Không đọc được hàng đợi.");
  await alert.getByRole("button", { name: "Thử lại" }).click();
  await expect(page.getByText("Không có job email lỗi.")).toBeVisible();
  await expect(page.getByText("Không tải được tình trạng hệ thống")).toHaveCount(0);
});
