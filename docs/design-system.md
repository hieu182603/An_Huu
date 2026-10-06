# AN HƯU — DESIGN SYSTEM

> **Purpose:** Đây là tài liệu nguồn chuẩn (single source of truth) để AI coding agent, UI/UX designer và frontend developer xây dựng giao diện **An Hưu** nhất quán.
>
> **Scope:** Chỉ áp dụng cho 2 nhóm giao diện: **USER** và **ADMIN**.
>
> **Visual direction:** Nền tảng hoạch định tài chính hưu trí cao cấp, bình tĩnh và minh bạch: sắc xanh biển sâu (Oceanic Deep Navy) vững chãi kết hợp với màu băng sương Bắc Âu (Nordic Ice) thanh khiết, bề mặt Frosted Ice cao cấp và điểm nhấn Royal Blue sắc sảo. Giao diện User/Admin giữ cấu trúc dashboard rõ ràng, nhiều khoảng trắng và biểu đồ tối giản.
>
> **Brand palette (Oceanic Navy & Nordic Ice System):** Abyss `#021024` · Marine Navy `#052659` · Midnight Cobalt `#091F5C` · Royal Blue `#334DAF` · Slate Steel `#5483B3` · Cornflower `#7096D1` · Air `#7DA0CA` · Ice `#C1E8FF` · Sky Frost `#D0E4FE` · Frosted `#E8F2FE` · Canvas `#F9FBFF`.

---

## 0. AI IMPLEMENTATION CONTRACT — BẮT BUỘC ĐỌC TRƯỚC KHI CODE

AI/Developer phải tuân thủ các nguyên tắc sau:

1. **Đọc toàn bộ file này trước khi sửa UI.** Không tạo style mới nếu Design System đã có quy tắc tương đương.
2. **Không hard-code màu, radius, spacing, shadow trong component** nếu giá trị đó đã có token.
3. **Không tự đổi brand palette.** Tuyệt đối không dùng tím neon, đỏ chói, gradient AI lòe loẹt hoặc màu “fintech trading” không thuộc hệ An Hưu.
4. **Không biến UI thành trading app.** An Hưu là nền tảng lập kế hoạch nghỉ hưu: bình tĩnh, rõ ràng, dài hạn, có giải thích.
5. **Một khu vực chỉ có một primary CTA.** CTA chính dùng Royal Blue `#334DAF` hoặc Marine Navy `#052659`. Các action còn lại dùng secondary/ghost/soft.
6. **User và Admin dùng cùng Design System.** Khác nhau ở mật độ thông tin, không khác brand.
7. **Mọi component phải có đủ state:** default, hover, focus, active/selected, disabled, loading, error nếu phù hợp.
8. **Responsive là hành vi, không chỉ co nhỏ.** Trên mobile phải ưu tiên hierarchy, đổi table thành card list, modal thành bottom sheet/full-screen khi cần.
9. **Không dùng màu đơn lẻ để biểu đạt trạng thái.** Luôn kèm icon, label hoặc text.
10. **Dữ liệu tài chính quan trọng không được truncate gây mất nghĩa.**
11. **AI content phải có disclosure:** “Gợi ý từ AI”, kèm nguồn/giả định khi phù hợp.
12. **Accessibility là yêu cầu bắt buộc**, tuân thủ nghiêm ngặt tiêu chuẩn WCAG 2.1 AA. Tuyệt đối không dùng chữ trắng trên các nền băng sáng (`#C1E8FF`, `#D0E4FE`, `#E8F2FE`).
13. Nếu codebase hiện tại có component khác chuẩn này, **ưu tiên refactor về token/component chung** thay vì vá CSS cục bộ.
14. Nếu có xung đột giữa yêu cầu một màn hình và Design System, **giữ logic nghiệp vụ nhưng không phá hệ thống thị giác**; chỉ tạo exception khi thật sự cần và phải ghi chú lý do.

### Definition of Done cho mọi task UI

Một task UI chỉ được xem là hoàn thành khi:

- đúng token màu, spacing, typography, radius, shadow;
- đúng hierarchy và component variant;
- đủ hover/focus/disabled/loading/empty/error;
- responsive được kiểm tra ở `1440`, `1024`, `768`, `390` px;
- keyboard navigation hoạt động;
- contrast đạt yêu cầu WCAG 2.1 AA;
- không hard-code style lặp lại;
- không có component mới nếu component tương đương đã tồn tại;
- dữ liệu tiền tệ, %, ngày tháng hiển thị nhất quán;
- có empty state và error state cho màn hình dữ liệu;
- không có layout shift lớn khi loading.

---

# 1. BRAND & VISUAL DIRECTION

## 1.1. Cảm giác thương hiệu

An Hưu cần tạo cảm giác:

- **Đáng tin cậy** như một nền tảng tài chính.
- **Bình tĩnh** thay vì gây áp lực hoặc FOMO.
- **Dễ hiểu** với người dùng không chuyên tài chính.
- **Trưởng thành** nhưng không cứng nhắc.
- **Thanh khiết, an tâm** cho chủ đề lập kế hoạch tương lai dài hạn.
- **Hiện đại** theo phong cách SaaS dashboard cao cấp.

### Từ khóa thị giác

`calm` · `trusted` · `financial planning` · `modern SaaS` · `clean dashboard` · `soft geometry` · `insight first` · `long-term` · `human`.

## 1.2. Style tham chiếu cần giữ

Từ phong cách dashboard tham chiếu, giữ các đặc điểm:

- modular dashboard grid;
- card lớn, bo tròn mềm;
- nền trung tính, surface rõ tầng;
- khoảng trắng rộng;
- navigation tối giản;
- pill filter;
- icon button gọn;
- chart đơn giản, ít màu;
- hierarchy “insight trước, chi tiết sau”.

### Không sao chép

Không sử dụng:

- purple/indigo là màu chủ đạo;
- orange accent kiểu e-commerce;
- nền gradient neon;
- 3D chart;
- hiệu ứng glassmorphism nặng;
- shadow mạnh;
- quá nhiều widget nhỏ khiến dashboard rối.

---

# 2. DESIGN PRINCIPLES

## 2.1. Calm Clarity

Không tạo cảm giác “trading app”.

**Nên:**
- “Bạn đang đạt 72% mục tiêu nghỉ hưu.”
- “Nếu giữ mức đóng góp hiện tại, bạn có thể còn thiếu khoảng 820 triệu ₫.”

**Không nên:**
- “Bạn đang tụt lại nghiêm trọng!”
- “Đầu tư ngay trước khi quá muộn.”

## 2.2. Insight First

Màn hình tài chính cần ưu tiên thông tin giúp người dùng hiểu hoặc hành động:

1. Tôi đang ở đâu?
2. Tôi còn thiếu bao nhiêu?
3. Tôi cần đóng góp bao nhiêu mỗi tháng?
4. Điều gì đang ảnh hưởng lớn nhất?
5. Tôi có thể thử kịch bản nào?

## 2.3. Progressive Disclosure

Thông tin nâng cao không đổ dồn vào màn hình chính.

- Hiển thị summary trước.
- Dùng “Xem chi tiết”, accordion hoặc drawer cho dữ liệu phụ.
- Công thức/giả định tài chính phải xem được nhưng không chiếm ưu tiên thị giác.

## 2.4. Consistent Geometry

Card, input, button, dropdown, modal, table và chart phải dùng chung hệ radius/spacing.

## 2.5. Trust by Design

- Trạng thái phải rõ.
- AI không “phán”.
- Giả định tài chính phải có nguồn/ngữ cảnh.
- Hành động phá hủy phải confirmation.
- Thông tin nhạy cảm cần microcopy giải thích lý do thu thập.

---

# 3. COLOR SYSTEM

## 3.1. Brand colors — Oceanic Navy & Nordic Ice System

Hệ màu chuẩn hóa gồm **11 mã HEX** trích xuất từ 2 ảnh swatches nhận diện thương hiệu An Hưu:

| Token | Hex | Tên màu | Vai trò ngữ nghĩa |
|---|---|---|---|
| `navy-800` | `#021024` | Deepest Navy Abyss | Nền tối sâu nhất, tiêu đề tối quan trọng, sidebar hover cực tối |
| `navy-700` | `#052659` | Marine Classic Navy | Primary Brand Color, heading H1/H2, active nav, primary text |
| `cobalt-600` | `#091F5C` | Midnight Cobalt | Điểm nhấn chiều sâu, button secondary hover, đường viền nhấn |
| `royal-500` | `#334DAF` | Royal Blue | Primary CTA, nút hành động chính, active toggle, milestone chính |
| `slate-500` | `#5483B3` | Slate Steel | Chữ phụ (text-muted), icon thứ cấp, đường phân cách |
| `cornflower-400`| `#7096D1` | Cornflower Blue | Phân đoạn biểu đồ cổ phiếu/tăng trưởng, tag công nghệ |
| `air-300` | `#7DA0CA` | Air Subtle Blue | Viền input control khi focus/active, đường phân đoạn biểu đồ phụ |
| `ice-200` | `#C1E8FF` | Crisp Nordic Ice | Tag trạng thái tích cực, highlight card, track tiến độ |
| `sky-100` | `#D0E4FE` | Pale Ice Sky | Border card, border container, hover highlight trên table |
| `frosted-50` | `#E8F2FE` | Frosted Ice Surface | Nền card surface, drawer, modal header, input background hover |
| `canvas` | `#F9FBFF` | Pristine Canvas White| Nền toàn bộ ứng dụng (app background), tạo cảm giác thanh khiết |

### Cách phối màu & Cảm thụ thị giác

- **Marine Navy & Abyss (`#052659`, `#021024`):** Tạo sự an tâm, vững chãi, uy tín của một tổ chức tài chính hưu trí tin cậy.
- **Royal Blue (`#334DAF`):** Điểm nhấn năng động nhưng nghiêm túc, dùng cho CTA chính để hướng dẫn hành động rõ ràng.
- **Nordic Ice & Canvas (`#C1E8FF`, `#D0E4FE`, `#E8F2FE`, `#F9FBFF`):** Mang lại sự nhẹ nhõm, bình yên, xua tan áp lực lo lắng về tài chính của người dùng khi lập kế hoạch dài hạn.

## 3.2. Semantic colors

| Token | Hex | Dùng cho |
|---|---|---|
| `success-500` | `#1E7E55` | Đạt mục tiêu, dòng tiền thặng dư, tăng trưởng an toàn |
| `warning-500` | `#B36800` | Cảnh báo thiếu hụt nhẹ, giả định cần cập nhật |
| `danger-500` | `#C0392B` | Thiếu hụt nghiêm trọng, nợ quá hạn, hành động xóa/hủy |
| `info-500` | `#052659` | Thông tin hướng dẫn, giải thích thuật ngữ |
| `text-primary` | `#052659` | Chữ nội dung chính, tiêu đề, label |
| `text-strong` | `#021024` | Số liệu KPI, giá trị tiền tệ lớn |
| `text-muted` | `#456B91` | Chú thích, helper text, mô tả phụ (Slate Cerulean) |
| `border-card` | `#D0E4FE` | Đường viền card, bảng phân cách |
| `border-input` | `#7DA0CA` | Viền input nhìn rõ nét trên nền canvas trắng băng |
| `chart-deficit` | `#C0392B` | Khoản thâm hụt hưu trí, lạm phát bào mòn trên biểu đồ |

Nền badge và alert dùng sắc độ pha nhạt với tương phản chữ cao:
- **Success soft:** `#E6F8F0` kết hợp chữ `#1E7E55`
- **Warning soft:** `#FEF3D6` kết hợp chữ `#B36800`
- **Danger soft:** `#FDE8E8` kết hợp chữ `#C0392B`
- **Info soft:** `#E8F2FE` kết hợp chữ `#052659`

## 3.3. Tỷ lệ sử dụng màu (60-30-10 Rule)

- **60% Canvas & Surfaces:** `#F9FBFF` (Background), `#FFFFFF` (Card inner), `#E8F2FE` (Surface tint).
- **30% Structure & Text:** `#052659` (Text, Headings), `#021024` (Deep Accent), `#5483B3` / `#D0E4FE` (Borders, subtle lines).
- **10% Focal & CTA:** `#334DAF` (Primary CTA, focus states) + Semantic Alerts (`#1E7E55`, `#B36800`, `#C0392B`).

### Quy tắc bất biến (Strict Rules)
1. **Tuyệt đối không dùng chữ trắng trên nền sáng:** Cấm dùng text trắng trên `#C1E8FF`, `#D0E4FE`, `#E8F2FE`, `#F9FBFF`. Text trên các nền này bắt buộc là `#052659` hoặc `#021024`.
2. **Một primary CTA duy nhất:** Nút quan trọng nhất trong viewport luôn là Royal Blue `#334DAF` với text trắng `#FFFFFF`.
3. **Không phủ màu tùy tiện:** Không lạm dụng nền gradient nhiều màu. Giữ nền băng sương bình lặng.

## 3.4. CSS tokens chuẩn hóa

```css
:root {
  /* An Hưu Brand Palette — Oceanic Navy & Nordic Ice System */
  --color-primary-700: #052659; /* Marine Classic Navy */
  --color-primary-800: #021024; /* Deepest Navy Abyss */
  --color-primary-600: #091F5C; /* Midnight Cobalt */
  --color-secondary-500: #334DAF; /* Royal Blue / Primary Focus CTA */
  --color-secondary-700: #091F5C; /* Deep Cobalt */
  --color-secondary-light: #7096D1; /* Cornflower Blue */
  --color-secondary-soft: #E8F2FE; /* Frosted Ice Surface */
  --color-mist-300: #C1E8FF; /* Crisp Nordic Ice */
  --color-accent-500: #334DAF; /* Vibrant Focus Accent */
  --color-accent-soft: #D0E4FE; /* Pale Ice Sky Surface */
  --color-bg: #F9FBFF; /* Pristine Ice-White Canvas */
  --color-soft: #E8F2FE; /* Soft Ice Tint */
  --color-midnight-900: #021024; /* Deepest Navy Abyss */
  --color-white: #FFFFFF;

  /* Typography Colors */
  --color-text-primary: #052659;
  --color-text-strong: #021024;
  --color-text-muted: #456B91;

  /* Border Tokens */
  --color-border: #D0E4FE;
  --color-border-input: #7DA0CA;

  /* Semantic Feedback */
  --color-success: #1E7E55;
  --color-warning: #B36800;
  --color-warning-fill: #334DAF;
  --color-danger: #C0392B;
  --color-info: #052659;
  --color-danger-soft: #FDE8E8;
  --color-warning-soft: #FEF3D6;
  --color-success-soft: #E6F8F0;
  --color-info-soft: #E8F2FE;

  /* Data Visualization & Asset Allocation */
  --chart-primary: #052659; /* Bất động sản / Cố định */
  --chart-secondary: #334DAF; /* Cổ phiếu & Quỹ đầu tư */
  --chart-track: #D0E4FE; /* Vạch mục tiêu */
  --chart-warning: #5483B3; /* Tiết kiệm / Thanh khoản */
  --chart-info: #7DA0CA; /* Tài sản thanh khoản khác */
  --chart-deficit: #C0392B; /* Khoản thiếu hụt dự phòng */
  --chart-series-1: #052659;
  --chart-series-2: #334DAF;
  --chart-series-3: #5483B3;
  --chart-series-4: #7096D1;
  --chart-series-5: #7DA0CA;
  --chart-series-6: #C1E8FF;
}
```

## 3.5. Kiểm định tương phản WCAG 2.1 AA

| Cặp màu (Chữ / Nền) | Tỷ lệ tương phản | Đánh giá | Mục đích sử dụng |
|---|---|---|---|
| White (`#FFFFFF`) / Royal Blue (`#334DAF`) | **5.42:1** | **PASS (AA)** | Nút Primary CTA chính |
| White (`#FFFFFF`) / Marine Navy (`#052659`) | **13.58:1** | **PASS (AAA)** | Nút Dark Button, Banner Header |
| Marine Navy (`#052659`) / Canvas (`#F9FBFF`) | **13.12:1** | **PASS (AAA)** | Tiêu đề chính, văn bản đọc chính |
| Slate Cerulean (`#456B91`) / Canvas (`#F9FBFF`) | **5.23:1** | **PASS (AA)** | Chữ chú thích, mô tả phụ |
| Marine Navy (`#052659`) / Ice (`#C1E8FF`) | **9.56:1** | **PASS (AAA)** | Tag trạng thái nổi bật, Pill nhãn |
| White (`#FFFFFF`) / Ice (`#C1E8FF`) | **1.42:1** | **FAIL (Banned)** | **CẤM:** Không được dùng chữ trắng trên nền Ice |
| White (`#FFFFFF`) / Sky Frost (`#D0E4FE`) | **1.33:1** | **FAIL (Banned)** | **CẤM:** Không được dùng chữ trắng trên nền Sky |

- **Nguyên tắc tương phản:** Sử dụng `--color-text-primary` (`#052659`) hoặc `--color-text-strong` (`#021024`) cho tất cả văn bản trên nền sáng (`#FFFFFF`, `#F9FBFF`, `#E8F2FE`, `#D0E4FE`, `#C1E8FF`).
- **Nút bấm & Trạng thái:** Nút chính luôn dùng `#334DAF` với chữ trắng hoặc viền rõ ràng; không dùng chữ trắng trên nền băng sáng.
- **Trạng thái Focus:** Luôn có outline `2px solid #334DAF` kèm shadow tán nhẹ `0 0 0 3px rgba(51, 77, 175, 0.25)` để đáp ứng truy cập bàn phím (WCAG 2.1).
- Token CSS đang chạy nằm ở `src/index.css`. Mọi biến giao diện phải dùng token, không tự gõ mã màu hex trực tiếp trong component.

---

# 4. TYPOGRAPHY

## 4.1. Font

### Ưu tiên

```text
Primary: Inter
Fallback: Be Vietnam Pro, system-ui, sans-serif
```

Có thể dùng `Manrope` cho heading nếu dự án muốn tăng chất premium, nhưng **không dùng quá 2 font**.

### Recommended CSS

```css
font-family: Inter, "Be Vietnam Pro", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

## 4.2. Type scale

| Style | Size | Weight | Line Height | Use |
|---|---:|---:|---:|---|
| Display | 48px | 700 | 1.15 | Landing / hero |
| H1 | 32px | 700 | 1.20 | Page title |
| H2 | 24px | 700 | 1.25 | Section title |
| H3 | 18px | 600 | 1.35 | Card title |
| Body L | 16px | 400 | 1.55 | Nội dung chính |
| Body M | 14px | 400 | 1.50 | UI text mặc định |
| Label | 13px | 600 | 1.35 | Input/table label |
| Caption | 12px | 400 | 1.40 | Helper/meta |
| Metric XL | 36–44px | 700 | 1.05 | KPI / số tiền lớn |

## 4.3. Quy tắc hiển thị số

- Dùng tabular numbers nếu font hỗ trợ.
- Tiền VND: `1.250.000.000 ₫`.
- Phần trăm: `72%` hoặc `72,4%` tùy context; không trộn nhiều precision trong cùng card.
- Đơn vị phụ nhỏ hơn metric 1 cấp: `/tháng`, `năm`, `% mục tiêu`.
- KPI trong cùng hàng căn baseline.
- Không dùng màu đơn thuần để thể hiện tăng/giảm.

---

# 5. SPACING, GRID & GEOMETRY

## 5.1. Spacing scale — base 4px

| Token | Value | Use |
|---|---:|---|
| `space-1` | 4px | micro gap |
| `space-2` | 8px | icon ↔ label |
| `space-3` | 12px | control internal gap |
| `space-4` | 16px | small card padding |
| `space-5` | 20px | control group |
| `space-6` | 24px | default card padding |
| `space-8` | 32px | section gap |
| `space-10` | 40px | large section |
| `space-12` | 48px | page breathing room |

## 5.2. Grid

| Viewport | Container | Columns | Gutter | Page padding |
|---|---|---:|---:|---:|
| ≥1440 | max `1280px` | 12 | 24px | 32–48px |
| 1024–1439 | `calc(100%-48px)` | 12 | 20px | 24px |
| 768–1023 | `calc(100%-40px)` | 8 | 20px | 20px |
| <768 | 100% | 4 | 16px | 16px |

## 5.3. Radius

```css
--radius-sm: 12px;
--radius-md: 16px;
--radius-lg: 24px;
--radius-pill: 999px;
```

| Element | Radius |
|---|---:|
| Input | 12px |
| Button | 12–14px |
| Compact card | 16px |
| Dashboard card | 24px |
| Modal | 24px |
| Pill/chip | 999px |

## 5.4. Shadow

```css
--shadow-card: 0 8px 24px rgba(5, 38, 89, 0.06);
--shadow-compact: 0 4px 12px rgba(5, 38, 89, 0.04);
--shadow-modal: 0 24px 60px rgba(5, 38, 89, 0.14);
```

### Shadow rule

- Không dùng shadow đậm để tạo hierarchy.
- Ưu tiên background, spacing và border subtle.
- Card static không cần hover shadow nếu không clickable.

---

# 6. APP SHELL & NAVIGATION

## 6.1. Desktop shell

Cấu trúc chuẩn:

```text
┌──────── Sidebar / Left Rail ────────┬─────────────────────────────┐
│ Logo / Brand                        │ Top Utility Bar             │
│ Primary navigation                  ├─────────────────────────────┤
│                                     │ Page Header                 │
│                                     │                             │
│                                     │ Main Content Grid           │
│                                     │                             │
└─────────────────────────────────────┴─────────────────────────────┘
```

### Left rail

- collapsed: `72–80px`;
- expanded: `240px`;
- icon: `20–22px`;
- active state dùng Mist/Sage-soft + Navy icon/text;
- không dùng full-Navy sidebar mặc định nếu làm giao diện quá nặng.

## 6.2. Top utility bar

USER:

- search;
- notification;
- avatar/profile;
- optional quick action.

ADMIN:

- global search;
- alerts/tasks;
- quick create khi cần;
- notification;
- avatar/profile.

## 6.3. User navigation

Primary items:

1. Tổng quan
2. Kế hoạch
3. Theo dõi
4. AI
5. Khám phá

Secondary items:

- Hồ sơ tài chính
- Mục tiêu nghỉ hưu
- Tài khoản

## 6.4. Admin navigation

Primary items:

1. Dashboard
2. Người dùng
3. Tư vấn
4. Nội dung
5. Đối tác & sản phẩm
6. Hỗ trợ
7. Báo cáo
8. Cấu hình

## 6.5. Mobile navigation

USER:

- bottom nav 4–5 mục;
- overflow vào `More`.

ADMIN:

- menu/drawer;
- ưu tiên list/table readability;
- tránh bottom nav nếu số module lớn.

---

# 7. PAGE HEADER

Cấu trúc:

```text
Title
Description ngắn, 1–2 dòng
[Optional secondary controls]                  [Primary action]
```

### Rule

- 1 primary action tối đa.
- User hạn chế breadcrumb.
- Admin dùng breadcrumb khi đi sâu:
  `Users / Nguyễn Văn A / Kế hoạch nghỉ hưu`.

---

# 8. BUTTON SYSTEM

## 8.1. Variants

### Primary

- Background: Navy.
- Text/icon: White.
- Dùng cho action quan trọng nhất.

Ví dụ:

- Tiếp tục
- Lưu kế hoạch
- Tạo mới

### Secondary

- White background.
- Navy text.
- Border subtle.

### Soft

- Mist/Sage-soft background.
- Navy text/icon.

Dùng cho:

- filter;
- selected choice;
- inline action.

### Ghost

- transparent;
- Navy text/icon;
- toolbar/tertiary actions.

### Danger

- danger tint background;
- danger text;
- destructive action.

## 8.2. Button sizes

| Size | Height | Padding X | Font | Icon |
|---|---:|---:|---|---:|
| SM | 36px | 12px | 13/600 | 16px |
| MD | 44px | 16px | 14/600 | 18px |
| LG | 52px | 20px | 15/600 | 20px |

## 8.3. Button states

Bắt buộc có:

- default;
- hover;
- active/pressed;
- focus-visible;
- disabled;
- loading.

### Focus

```css
outline: 2px solid var(--color-secondary-700);
outline-offset: 2px;
box-shadow: 0 0 0 3px rgba(111, 155, 124, 0.22);
```

### Rule

- Không đặt 2 Primary CTA cạnh nhau.
- Button destructive luôn có confirmation nếu ảnh hưởng dữ liệu quan trọng.
- Icon-only button phải có `aria-label` và tooltip.

---

# 9. FORM SYSTEM

## 9.1. Input

```text
Label
[ Input                                  suffix ]
Helper / Error
```

### Specs

- height: `44–48px`;
- radius: `12px`;
- border: `#7C8F81`;
- background: white;
- padding horizontal: `12–14px`;
- focus: outline Sage 700 + halo Sage 22%;
- disabled: Mist/neutral surface.

## 9.2. Currency input

- right-align number;
- display thousand separators;
- suffix `₫`;
- internal raw value không format;
- khi blur, format lại giá trị;
- không để user nhập ký tự không hợp lệ.

Example:

```text
Thu nhập hàng tháng
[                     25.000.000   ₫ ]
```

## 9.3. Percentage

- suffix `%`;
- range validation;
- nếu là assumption phải có helper text.

## 9.4. Select

- searchable khi > 8 options;
- placeholder không thay label;
- option selected có check icon;
- dropdown max-height có scroll.

## 9.5. Slider

Chỉ dùng khi người dùng đang **mô phỏng**.

Bắt buộc có numeric input đi kèm để user nhập chính xác.

## 9.6. Validation

- validate sau blur hoặc submit;
- không hiện đỏ ngay khi user vừa focus;
- error phải nói cách sửa.

**Nên:**

> Thu nhập phải lớn hơn 0.

**Tránh:**

> Invalid value.

---

# 10. CARD SYSTEM

Card là đơn vị layout chính của An Hưu.

## 10.1. Base card

```css
background: #fff;
border: 1px solid var(--color-border);
border-radius: 24px;
padding: 24px;
box-shadow: var(--shadow-card);
```

Mobile padding: `16–20px`.

## 10.2. KPI Card

Structure:

```text
Label                        Optional icon
1.250.000.000 ₫
+5,2% so với tháng trước
```

Use:

- tài sản;
- số tiền mục tiêu;
- khoản thiếu;
- mức đóng góp/tháng.

## 10.3. Insight Card

```text
[AI / Info tag]
Title
Explanation 1–3 dòng
[CTA]
```

Dùng cho AI insight, warning, suggestion.

## 10.4. Chart Card

```text
Title                        Filter
Subtitle/helper
Chart
Legend / summary
```

## 10.5. List Card

```text
Title                         View all
-------------------------------------
Row
Row
Row
```

## 10.6. Action Card

Dùng để hướng người dùng hoàn thiện hành trình:

- Hoàn thiện hồ sơ
- Tạo mục tiêu
- Thử mô phỏng
- Cập nhật dữ liệu

## 10.7. Dark Focus Card

- background: Midnight/Navy;
- chỉ dùng tiết chế;
- phù hợp AI assistant hoặc action quan trọng;
- text phải đạt contrast.

### Card rules

- Không nhồi quá 2 hierarchy metric trong một card.
- Card clickable có hover toàn card.
- Card không clickable không giả hover.
- Không lạm dụng card lồng card.

---

# 11. DATA VISUALIZATION

## 11.1. Chart palette

Chart không dùng trực tiếp semantic danger/success làm palette chung. Phân bổ đa biến tài chính (Asset Allocation & Retirement Gap):

Recommended:

```css
--chart-primary: #153A52;    /* Tổng tài sản / Cột mốc chính */
--chart-secondary: #6F9B7C;  /* Cổ phiếu / Sinh lời định kỳ */
--chart-track: #B9CCBE;      /* Đường chuẩn / Track nền */
--chart-warning: #D9A85E;    /* Vàng / Quỹ khẩn cấp */
--chart-info: #365D6C;       /* Trái phiếu / Thu nhập cố định */
--chart-deficit: #D06A4C;    /* Khoản thiếu hụt hưu trí / Lạm phát */
```

## 11.2. Chart rules

- Không 3D.
- Không gradient cầu kỳ.
- Không quá 5 màu trong một chart.
- Gridline rất nhẹ.
- Axis label là muted text.
- Tooltip có metric + thời gian + context ngắn.
- Chart quan trọng phải có textual summary hoặc table fallback.

## 11.3. Chart mapping

| Chart | Use | Strategy |
|---|---|---|
| Progress ring | % đạt mục tiêu | Navy + Mist track |
| Line/Area | tài sản/dòng tiền theo thời gian | Navy line + Sage fill 12–18% |
| Bar | so sánh tháng/kịch bản | Sage default, Navy selected |
| Stacked bar | thu nhập/chi tiêu/cơ cấu tài sản | Navy → Sage → Mist |
| Donut | tỷ trọng <=5 nhóm | label trực tiếp nếu được |
| Sparkline | trend trong KPI | 1 series, no axis |

---

# 12. STATUS, ALERTS & FEEDBACK

| State | Visual | Example |
|---|---|---|
| Success | soft green + check | Kế hoạch đã được cập nhật. |
| Info | soft blue + info | Dữ liệu được tính theo giả định hiện tại. |
| Warning | soft gold + alert | Bạn chưa nhập dữ liệu BHXH. |
| Error | soft red + error | Không thể lưu. Vui lòng kiểm tra trường được đánh dấu. |
| Loading | skeleton / spinner | widget-level loading |
| Empty | icon/illustration + CTA | Chưa có kế hoạch. Bắt đầu tạo kế hoạch đầu tiên. |

## 12.1. Toast

- width vừa phải;
- không che nav chính;
- auto dismiss 4–6s với success/info;
- error quan trọng không auto dismiss quá nhanh;
- có icon + text.

## 12.2. Skeleton

Dùng skeleton cùng geometry với component thật để giảm layout shift.

---

# 13. AI EXPERIENCE

AI trong An Hưu phải đóng vai trò **giải thích và hỗ trợ mô phỏng**, không thay người dùng ra quyết định.

## 13.1. AI card/header

Luôn có nhãn:

```text
Gợi ý từ AI
```

Khi phù hợp, có:

- `Xem giả định`
- `Nguồn dữ liệu`
- `Dữ liệu được sử dụng`

## 13.2. AI tone

**Nên:**

> Dựa trên dữ liệu hiện có, bạn có thể thử tăng mức tích lũy hàng tháng lên 2 triệu ₫ để xem tác động đến mục tiêu.

**Không nên:**

> Bạn nên chắc chắn đầu tư vào phương án này.

## 13.3. AI action hierarchy

AI nên hỗ trợ:

1. giải thích số liệu;
2. tóm tắt kế hoạch;
3. chỉ ra yếu tố ảnh hưởng;
4. gợi ý kịch bản mô phỏng;
5. dẫn user đến màn hình chỉnh dữ liệu.

---

# 14. USER EXPERIENCE PATTERNS

USER UI cần đơn giản, nhiều khoảng trắng, copy hướng dẫn rõ.

## 14.1. Dashboard User

### Desktop composition

```text
ROW 1
[ Goal / Retirement Progress Hero      8 cols ] [ KPI 4 cols ]

ROW 2
[ Progress over time 7 cols ] [ Monthly contribution 5 cols ]

ROW 3
[ AI Insight 4 cols ] [ Profile checklist 4 cols ] [ Knowledge 4 cols ]
```

### Visual priority

1. Mức độ đạt mục tiêu.
2. Khoản thiếu/dư.
3. Mức đóng góp cần thiết.
4. Insight tiếp theo.

## 14.2. Hồ sơ tài chính

Pattern:

- wizard / stepper;
- grouped sections;
- autosave nếu phù hợp;
- progress rõ.

Sections:

- thông tin cơ bản;
- thu nhập;
- chi tiêu;
- tài sản;
- nợ;
- đầu tư;
- BHXH.

## 14.3. Mục tiêu nghỉ hưu

Dùng goal card + numeric control.

Ưu tiên:

- tuổi nghỉ hưu;
- mức sống mong muốn;
- chi phí/tháng;
- assumption giải thích ngắn.

## 14.4. Kế hoạch nghỉ hưu

Hero metric:

```text
Bạn cần khoảng
3,8 tỷ ₫
để đạt mục tiêu hiện tại.
```

Sau đó mới hiển thị:

- dự kiến có;
- khoản thiếu;
- cần tích lũy/tháng;
- timeline.

## 14.5. Mô phỏng

Desktop:

```text
[ Controls 4–5 cols ] [ Live Result 7–8 cols ]
```

Mobile:

```text
Controls
Result summary sticky/visible
Chart
```

Thay đổi input phải phản ánh result nhanh nhưng tránh animation quá mức.

## 14.6. Theo dõi

- timeline/milestone;
- progress chart;
- so sánh với mục tiêu;
- next action.

## 14.7. AI

Conversation UI + context cards.

Không biến thành chat app độc lập hoàn toàn; AI phải gắn với dữ liệu kế hoạch.

---

# 15. ADMIN EXPERIENCE PATTERNS

Admin giữ cùng brand nhưng tăng density và khả năng scan dữ liệu.

## 15.1. Admin dashboard

Recommended:

```text
ROW 1: 4 KPI cards
ROW 2: 2 chart cards
ROW 3: task/alert list + recent users/activity
```

## 15.2. Data table

### Specs

- sticky header;
- row height `44–48px`;
- horizontal padding `12–16px`;
- filter bar ở trên;
- pagination;
- bulk action chỉ khi thật sự cần;
- row click hoặc action menu nhất quán.

### Cell priority

Primary column:

- tên user/entity;
- strong text.

Secondary:

- muted.

Status:

- badge semantic.

## 15.3. Admin detail page

Desktop:

```text
[ Main content 8 cols ] [ Context / actions 4 cols ]
```

Main:

- hồ sơ;
- kế hoạch;
- lịch sử;
- activity.

Rail:

- status;
- owner/person in charge;
- actions;
- metadata.

## 15.4. Filter

- quick filter dạng pill;
- advanced filter trong drawer/popover;
- active filter phải nhìn thấy;
- có `Clear all` khi >1 filter.

## 15.5. System settings

- sectioned cards;
- save theo section;
- config nhạy cảm cần change history/version;
- destructive config cần confirmation.

---

# 16. RESPONSIVE BEHAVIOR

## 16.1. Breakpoints

```text
mobile:  < 768px
tablet:  768–1023px
desktop: 1024–1439px
wide:    >= 1440px
```

## 16.2. Responsive mapping

| Pattern | Desktop | Tablet | Mobile |
|---|---|---|---|
| Navigation | left rail/sidebar | collapsible | bottom nav/drawer |
| Grid | 12 cols | 8 cols | 4 cols |
| KPI | 3–4 / row | 2 / row | 1–2 / row |
| Charts | full legend | compact | legend below / simplified |
| Tables | full columns | hide secondary | card rows or selective scroll |
| Forms | 2 cols when natural | 1–2 cols | single column |
| Modal | 560–720px | ~80vw | bottom sheet/full screen |

## 16.3. Touch

- target tối thiểu `44x44px`;
- khoảng cách icon button >= `8px`;
- không phụ thuộc hover để hiểu chức năng.

---

# 17. ACCESSIBILITY

Bắt buộc:

- body contrast >= `4.5:1`;
- large text >= `3:1`;
- focus-visible rõ;
- không tắt outline nếu không có replacement;
- icon-only button có `aria-label`;
- field có label thật;
- error message liên kết field;
- chart có summary/fallback;
- không chỉ dùng màu để báo trạng thái;
- hỗ trợ keyboard navigation;
- hỗ trợ `prefers-reduced-motion`;
- modal trap focus;
- heading hierarchy đúng thứ tự;
- table có header semantics;
- dynamic update quan trọng có live region khi phù hợp.

---

# 18. MICROCOPY

## 18.1. Tone

- rõ;
- bình tĩnh;
- trung lập;
- không hù dọa;
- tránh jargon nếu không giải thích.

## 18.2. Examples

| Tình huống | Nên viết | Tránh |
|---|---|---|
| Thiếu dữ liệu | Bổ sung thu nhập để tính kế hoạch chính xác hơn. | Dữ liệu không hợp lệ. |
| Khoản thiếu | Bạn còn thiếu khoảng 820 triệu ₫ so với mục tiêu hiện tại. | Bạn không đủ tiền nghỉ hưu. |
| AI | Dựa trên dữ liệu hiện có, bạn có thể thử… | Bạn nên chắc chắn đầu tư vào… |
| Save | Đã lưu thay đổi. | Success! |
| Error | Không thể lưu. Vui lòng kiểm tra các trường được đánh dấu. | Something went wrong. |

---

# 19. ICONOGRAPHY

- Style: outline hoặc soft-rounded.
- Stroke thống nhất.
- Default size: `18–20px`.
- Navigation: `20–22px`.
- KPI/icon badge: `20–24px`.
- Không trộn outline và filled tùy tiện.
- Filled icon chỉ dùng selected state hoặc semantic status khi cần.

Recommended libraries nếu codebase chưa có:

- Lucide React
- Phosphor Icons

Chọn **một** library chính, không trộn nhiều bộ icon.

---

# 20. COMPONENT INVENTORY

AI nên ưu tiên xây/reuse các component sau:

```text
AppShell
Sidebar
Topbar
MobileNav
PageHeader
Breadcrumb

Button
IconButton
ButtonGroup

Input
CurrencyInput
PercentInput
Textarea
Select
Combobox
Checkbox
Radio
RadioCard
Slider
DatePicker
FormField

Card
KpiCard
InsightCard
ChartCard
ListCard
ActionCard
DarkFocusCard

Badge
StatusBadge
Chip
FilterChip

Tabs
Accordion
Tooltip
Popover
DropdownMenu
Drawer
Modal
BottomSheet
Toast
Alert
Skeleton
EmptyState

DataTable
Pagination
SearchBar
FilterBar

ProgressRing
ProgressBar
LineChart
BarChart
DonutChart
Sparkline

AiInsight
AiDisclosure
FinancialSummary
Metric
MoneyValue
PercentageValue
```

Nếu component tương đương đã tồn tại trong codebase, **refactor/use lại**, không duplicate.

---

# 21. COMPONENT STATE MATRIX

Mỗi component interactive cần kiểm tra:

| State | Button | Input | Nav | Card Clickable | Select |
|---|---:|---:|---:|---:|---:|
| Default | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hover | ✓ | ✓ | ✓ | ✓ | ✓ |
| Focus | ✓ | ✓ | ✓ | ✓ | ✓ |
| Active | ✓ | — | ✓ | ✓ | ✓ |
| Selected | — | — | ✓ | ✓ | ✓ |
| Disabled | ✓ | ✓ | — | — | ✓ |
| Loading | ✓ | optional | — | optional | optional |
| Error | — | ✓ | — | — | ✓ |

---

# 22. CSS / TOKEN IMPLEMENTATION

## 22.1. Core tokens

```css
:root {
  /* Brand */
  --color-primary-700: #153A52;
  --color-secondary-500: #6F9B7C;
  --color-secondary-700: #486D53;
  --color-mist-300: #B9CCBE;
  --color-accent-500: #D9A85E;
  --color-bg: #F6F1E8;
  --color-soft: #E8EEE8;
  --color-midnight-900: #102D3D;
  --color-white: #FFFFFF;

  /* Text */
  --color-text-primary: #153A52;
  --color-text-strong: #23352F;
  --color-text-muted: #586B61;

  /* Border */
  --color-border: #D8E2D9;
  --color-border-input: #7C8F81;

  /* Semantic */
  --color-success: #486D53;
  --color-warning: #805719;
  --color-warning-fill: var(--color-accent-500);
  --color-danger: #A14D47;
  --color-info: #365D6C;

  /* Radius */
  --radius-sm: 12px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --radius-pill: 999px;

  /* Space */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  /* Shadow */
  --shadow-card: 0 8px 24px rgba(21, 58, 82, 0.06);
  --shadow-compact: 0 4px 12px rgba(21, 58, 82, 0.04);
  --shadow-modal: 0 24px 60px rgba(21, 58, 82, 0.14);

  /* Motion */
  --duration-fast: 120ms;
  --duration-normal: 180ms;
  --duration-slow: 240ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}
```

## 22.2. Naming rules

Ưu tiên semantic token:

```text
text-primary
text-muted
surface-card
surface-soft
border-subtle
action-primary
action-secondary
status-success
```

Tránh:

```text
blue-text
light-green-bg
gray-border-2
```

Component không được hard-code hex nếu token đã tồn tại.

---

# 23. TAILWIND MAPPING — NẾU DỰ ÁN DÙNG TAILWIND

Ví dụ mapping:

```ts
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#153A52',
          sage: '#6F9B7C',
          cream: '#F6F1E8',
          mist: '#B9CCBE',
          soft: '#E8EEE8',
          honey: '#D9A85E',
          'sage-text': '#486D53',
          midnight: '#102D3D',
        },
        semantic: {
          success: '#486D53',
          warning: '#805719',
          danger: '#A14D47',
          info: '#365D6C',
        },
      },
      borderRadius: {
        control: '12px',
        card: '24px',
      },
      boxShadow: {
        card: '0 8px 24px rgba(21, 58, 82,.06)',
      },
    },
  },
};
```

Nếu dùng Tailwind, AI vẫn phải ưu tiên class/token thống nhất, không rải arbitrary value (`[#153A52]`, `[23px]`) khắp codebase trừ khi có exception có lý do.

---

# 24. USER VS ADMIN — DENSITY RULE

| Thuộc tính | USER | ADMIN |
|---|---|---|
| Card size | lớn | nhỏ hơn |
| Spacing | rộng | vừa |
| Copy hướng dẫn | nhiều hơn | ngắn hơn |
| Table | hạn chế | thường xuyên |
| Filters | tối giản | nhiều hơn |
| Actions | ít, rõ | nhiều nhưng phân cấp |
| Data density | thấp–vừa | vừa–cao |
| Brand style | giống nhau | giống nhau |

Không tạo “Admin theme” riêng.

---

# 25. DO / DON'T

## DO

- Dùng Navy cho hierarchy và CTA chính.
- Dùng Sage cho progress, positive, selected soft.
- Dùng card lớn + khoảng trắng để phân nhóm User.
- Giữ chart đơn giản, tooltip rõ.
- Giải thích assumption.
- Dùng semantic colors đúng mục đích.
- Admin tăng density có kiểm soát.
- Ưu tiên reusable component.

## DON'T

- Không dùng quá nhiều accent.
- Không dùng Sage làm nền toàn app.
- Không đặt nhiều CTA ngang cấp.
- Không dùng 3D chart.
- Không dùng gradient mạnh.
- Không dùng red để “thúc giục”.
- Không ẩn logic quan trọng sau icon không nhãn.
- Không biến Admin thành sản phẩm khác brand.
- Không tạo CSS “one-off” cho từng màn hình nếu token/component đã đủ.

---

# 26. PAGE-BY-PAGE VISUAL PRIORITY

## USER

### Dashboard
`Goal progress > Gap > Monthly contribution > AI insight > Secondary data`

### Hồ sơ tài chính
`Step progress > Current section > Form > Helper > Save/Continue`

### Mục tiêu nghỉ hưu
`Target age > desired lifestyle/cost > resulting target`

### Kế hoạch
`Required total > projected total > gap > monthly amount > breakdown`

### Mô phỏng
`Controls > live result > difference from baseline > chart`

### Theo dõi
`Current progress > trend > milestone > next action`

### AI
`Conversation > context > source/assumptions > suggested actions`

## ADMIN

### Dashboard
`Pending work > key KPIs > alerts > trends > recent activity`

### User list
`Search/filter > results > status > quick actions`

### User detail
`Identity/status > financial plan summary > activity > admin actions`

### Content/Product
`Status > list > filter > create/edit action`

### Settings
`Section title > explanation > form controls > save > history`

---

# 27. QA CHECKLIST FOR AI AGENT

Trước khi kết thúc task UI, AI phải tự kiểm tra:

## Visual

- [ ] Có đúng 5 màu gốc `#153A52`, `#6F9B7C`, `#B9CCBE`, `#F6F1E8`, `#D9A85E` theo vai trò không?
- [ ] Chữ xanh trên nền sáng dùng Sage 700, nền phụ dùng Soft, Honey không đi với chữ trắng?
- [ ] Có màu ngoài system không cần thiết không?
- [ ] Card radius có thống nhất không?
- [ ] Spacing có theo base 4px không?
- [ ] Có quá nhiều shadow không?
- [ ] Có nhiều hơn 1 primary CTA trong cùng khu vực không?

## Components

- [ ] Reuse component chung chưa?
- [ ] Có đủ state không?
- [ ] Empty/error/loading đã xử lý chưa?
- [ ] Icon-only action có tooltip/aria-label chưa?

## Data

- [ ] Tiền tệ format đúng?
- [ ] % nhất quán?
- [ ] Chart có label/context?
- [ ] Không chỉ dùng màu để phân biệt trạng thái?

## Responsive

- [ ] 1440px
- [ ] 1024px
- [ ] 768px
- [ ] 390px
- [ ] Không overflow ngang ngoài trường hợp table có chủ đích
- [ ] Touch target >=44px

## Accessibility

- [ ] Contrast
- [ ] Keyboard
- [ ] Focus state
- [ ] Labels
- [ ] Error semantics
- [ ] Reduced motion

---

# 28. RECOMMENDED AI WORKFLOW

Khi AI coding agent nhận task UI mới, thực hiện theo thứ tự:

```text
1. Đọc design-system.md
2. Đọc component hiện có trong codebase
3. Kiểm tra token/theme hiện tại
4. Xác định component có thể reuse
5. Xác định responsive behavior
6. Implement layout trước
7. Apply typography + color tokens
8. Add states: hover/focus/loading/error/empty
9. Test responsive
10. Test accessibility
11. Refactor duplicated styles
12. Chạy lint/typecheck/test
13. Báo cáo những file đã sửa và exception nếu có
```

### AI không được làm

- bỏ qua component library hiện tại;
- tự chọn màu mới;
- thay đổi global style chỉ để fix một màn;
- tạo duplicate component;
- viết inline style dài;
- giảm accessibility để đạt “đẹp mắt”;
- thay đổi business logic chỉ để dễ layout.

---

# 29. ACCEPTANCE CRITERIA — TOÀN HỆ THỐNG

Giao diện An Hưu đạt chuẩn khi người dùng có thể cảm nhận rõ:

1. **Một thương hiệu duy nhất** giữa User và Admin.
2. **Navy tạo độ tin cậy**, không tạo cảm giác tối nặng.
3. **Sage tạo cảm giác tiến triển và an tâm**.
4. **Cream tạo nền ấm**, khác dashboard fintech lạnh/trắng tuyệt đối.
5. **Mist giúp chia tầng nhẹ nhàng**.
6. Dashboard nhìn hiện đại nhưng không giống trading platform.
7. Tất cả số liệu tài chính chính đọc được trong 1–2 giây.
8. Người dùng luôn biết bước tiếp theo.
9. Admin có thể scan lượng dữ liệu lớn nhưng không bị rối.
10. Responsive giữ hierarchy, không chỉ scale nhỏ desktop.

---

# 30. FINAL VISUAL SUMMARY

An Hưu nên được triển khai theo ngôn ngữ:

> **Financial planning SaaS cao cấp nhưng thân thiện** — layout dashboard hiện đại, modular cards, nhiều khoảng trắng, bo góc mềm, biểu đồ tinh gọn; Navy tạo niềm tin, Sage truyền cảm giác ổn định và tiến triển, Cream làm nền ấm, Mist phân tầng dữ liệu nhẹ nhàng.

Mọi màn hình mới phải nhìn như cùng một hệ thống, không phải tập hợp các page được thiết kế độc lập.

---

**File owner:** An Hưu  
**Design System version:** 1.1
**Palette updated:** 01.10.2026, theo ảnh nhận diện do người dùng cung cấp  
**Primary roles:** USER / ADMIN  
**Reference palette:** Navy `#153A52` · Sage `#6F9B7C` · Mist `#B9CCBE` · Cream `#F6F1E8` · Honey `#D9A85E`
