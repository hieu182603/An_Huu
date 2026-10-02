# HƯỚNG DẪN TRIỂN KHAI BACKEND AN HƯU LÊN MICROSOFT AZURE

Tài liệu này hướng dẫn chi tiết cách thiết lập cơ sở dữ liệu **PostgreSQL** trên Azure, đưa **Backend API** lên **Azure App Service**, và thiết lập **CI/CD tự động qua GitHub Actions**.

---

## 1. Kiến Trúc Hệ Thống Trên Azure

```
  [ Client / React Frontend (Vercel hoặc Azure Static Web Apps) ]
                               │
                               ▼ (HTTPS / REST API)
             [ Azure App Service — Linux Node.js 22 ]
                     (Express.js + Prisma ORM)
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
[ Azure Database for PostgreSQL ]        [ Cloudinary & Nodemailer ]
     (Flexible Server B1ms)                 (Ảnh, Media & Email)
```

---

## 2. Bước 1: Tạo Azure Database for PostgreSQL Flexible Server

1. Đăng nhập vào [Azure Portal](https://portal.azure.com).
2. Tìm kiếm **Azure Database for PostgreSQL flexible servers** > Chọn **Create**.
3. Điền thông số cấu hình:
   - **Resource Group**: `rg-anhuu-prod` (hoặc tạo mới).
   - **Server name**: `an-huu-postgres` (hoặc tên tùy chọn duy nhất).
   - **Region**: `Southeast Asia` (Singapore — tối ưu độ trễ cho người dùng Việt Nam).
   - **Workload type**: `Development` (hoặc `Production`).
   - **Compute + Storage**: Chọn gói tiết kiệm chi phí **Burstable (B1ms)**, 1 vCore, 2 GiB RAM, 32 GiB Storage.
   - **Authentication**: `PostgreSQL authentication only`.
   - **Admin username**: ví dụ `anhuuadmin`.
   - **Password**: Nhập mật khẩu mạnh (ví dụ: `AnHuuSecure2026!`).
4. **Networking (Quan trọng)**:
   - Chọn **Public access (allowed IP addresses)**.
   - Bật tùy chọn: `Allow public access from any Azure service within Azure to this server` (Để Azure App Service có thể kết nối được).
   - Bấm **Add current client IP address** để máy tính của bạn có thể chạy migrate từ local.
5. Bấm **Review + create** > Chờ khoảng 3–5 phút để Azure tạo server.

### Lấy Connection String PostgreSQL:
```env
DATABASE_URL="postgresql://anhuuadmin:AnHuuSecure2026!@an-huu-postgres.postgres.database.azure.com:5432/an_huu_db?sslmode=require"
```
*(Tạo database tên `an_huu_db` trong server qua pgAdmin/DBeaver hoặc lệnh psql).*

---

## 3. Bước 2: Tạo Azure App Service (Hosting Backend)

1. Trên Azure Portal, tìm kiếm **App Services** > Chọn **Create** > **Web App**.
2. Điền thông tin:
   - **Resource Group**: Chọn cùng `rg-anhuu-prod`.
   - **Name**: `an-huu-api` (URL sẽ là `https://an-huu-api.azurewebsites.net`).
   - **Publish**: `Code`.
   - **Runtime stack**: `Node 22 LTS`.
   - **Operating System**: `Linux`.
   - **Region**: `Southeast Asia`.
   - **Pricing plan**: Chọn gói `Basic B1` hoặc gói Free `F1` (nếu thử nghiệm).
3. Bấm **Review + create**.

---

## 4. Bước 3: Cấu Hình Biến Môi Trường (Environment Variables)

Vào trang quản trị của App Service vừa tạo > Menu bên trái chọn **Settings** > **Environment variables** (hoặc **Configuration**), thêm các Key sau:

| Tên biến | Giá trị minh họa |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `PORT` | `8080` (hoặc để mặc định, Azure App Service tự map) |
| `WEBSITE_PORT` | `5000` |
| `CLIENT_URL` | `https://anhuu.vn` (hoặc link Vercel frontend của bạn) |
| `DATABASE_URL` | `postgresql://anhuuadmin:AnHuuSecure2026!@an-huu-postgres.postgres.database.azure.com:5432/an_huu_db?sslmode=require` |
| `JWT_SECRET` | Khóa bảo mật ngẫu nhiên (chuỗi dài tối thiểu 32 ký tự) |
| `JWT_EXPIRES_IN` | `7d` |
| `CLOUDINARY_CLOUD_NAME` | Tên cloud Cloudinary của bạn |
| `CLOUDINARY_API_KEY` | API Key Cloudinary |
| `CLOUDINARY_API_SECRET` | API Secret Cloudinary |
| `RESEND_API_KEY` | `re_123456789_abcdefghijklmnopqrstuvwxyz` |
| `EMAIL_FROM` | `"An Hưu" <onboarding@resend.dev>` (hoặc tên miền đã xác thực) |

Nhớ bấm **Apply** để lưu cấu hình.

---

## 5. Bước 4: Thiết Lập Startup Command Trên Azure

Vào **Settings** > **Configuration** > Tab **General settings**:
- **Startup Command**:
  ```bash
  npx prisma migrate deploy && node dist/server.js
  ```
Lệnh này đảm bảo mỗi lần App Service khởi động lại, các bảng trong PostgreSQL sẽ được cập nhật tự động theo `schema.prisma`.

---

## 6. Bước 5: Cấu Hình CI/CD GitHub Actions

Hệ thống đã có sẵn workflow [.github/workflows/backend-ci-cd.yml](file:///e:/An_Huu/.github/workflows/backend-ci-cd.yml). Để kích hoạt deploy tự động mỗi khi push code lên nhánh `main`:

1. Vào Azure Portal > App Service `an-huu-api` > Chọn **Get publish profile** (Tải file cấu hình XML về máy).
2. Mở file vừa tải, sao chép toàn bộ nội dung text bên trong.
3. Vào Repository GitHub của bạn > **Settings** > **Secrets and variables** > **Actions** > Bấm **New repository secret**.
4. Đặt tên Secret:
   - **Name**: `AZURE_WEBAPP_PUBLISH_PROFILE`
   - **Secret**: Dán toàn bộ nội dung file Publish Profile vừa copy vào đây.
5. Bấm **Add secret**.

Từ bây giờ:
- Khi tạo Pull Request: GitHub Actions sẽ tự động chạy Typecheck, Prisma Validation và Unit Test (Vitest).
- Khi Merge vào nhánh `main`: GitHub Actions sẽ tự build và deploy trực tiếp lên Azure App Service.

---

## 7. Khởi Chạy Local Để Phát Triển

Bạn có thể chạy thử PostgreSQL và Adminer trên máy tính thông qua Docker Compose:

```bash
# 1. Khởi động PostgreSQL 16 và Adminer
cd e:\An_Huu\backend
docker-compose up -d

# 2. Sinh Prisma Client và chạy migration
npm run prisma:generate
npm run prisma:migrate

# 3. Chạy test
npm run test

# 4. Chạy Backend ở chế độ dev (Nodemon tự reload)
npm run dev
```
- Giao diện Adminer quản lý DB local: `http://localhost:8080` (System: PostgreSQL, Server: `postgres`, User: `postgres`, Password: `postgrespassword`, DB: `an_huu_db`).
- Backend API local: `http://localhost:5000/api/health`.
