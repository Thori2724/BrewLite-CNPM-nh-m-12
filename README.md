# BrewLite

Website đặt và thanh toán đồ uống tại quán. Hiện đã có API (NestJS) và cơ sở dữ liệu PostgreSQL chạy bằng Docker; giao diện web đang phát triển.

Giao diện sẽ ưu tiên màn hình máy tính, vẫn xem được trên điện thoại. Web và API là hai ứng dụng độc lập trong `apps/web` và `apps/api`.

## Cần cài trước

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) (phiên bản v26.13.0)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (để chạy PostgreSQL)

## Chạy cơ sở dữ liệu (local)

Mở terminal ngay thư mục gốc của repo (nơi có file `docker-compose.yml`).

**1. Tạo file cấu hình**

Sao chép file mẫu thành `.env` (file này không được đưa lên Git):

- Windows (PowerShell):

```powershell
Copy-Item .env.example .env
```

- macOS / Linux:

```bash
cp .env.example .env
```

**2. Khởi động PostgreSQL**

```bash
docker compose up -d
```

Lần đầu Docker sẽ tải image `postgres:16`, có thể mất vài phút.

**3. Kiểm tra đã chạy**

```bash
docker compose ps
```

Kết quả đúng: dịch vụ `postgres` (tên hộp `brewlite-postgres`) ở trạng thái `running`, cột Health là `healthy` (hoặc `(healthy)`).

Kiểm tra thêm từ trong hộp:

```bash
docker exec brewlite-postgres pg_isready -U brewlite -d brewlite
```

Kết quả đúng: lệnh báo PostgreSQL đang nhận kết nối.

Cổng mặc định trên máy bạn: `localhost:5432`. Tên database, user và mật khẩu lấy từ `.env` (mẫu: `brewlite` / `brewlite` / `brewlite`).

**4. Dừng**

```bash
docker compose down
```

Dữ liệu được giữ trong volume Docker `postgres_data`. Muốn xóa hẳn dữ liệu (làm lại từ đầu):

```bash
docker compose down -v
```

## Database: migration và seed

Sau khi PostgreSQL đã khởi động, ta cần tạo bảng (migration) và nạp dữ liệu menu mẫu (seed).

> **Lưu ý:** Hãy chắc chắn bạn đã tạo file cấu hình `.env` ở thư mục gốc trước khi chạy các lệnh dưới đây (xem lại bước 1 ở phần trên).

**1. Chạy Migration (tạo cấu trúc bảng)**

Mở PowerShell và chuyển vào thư mục `apps/api`:

```powershell
cd apps/api
npm.cmd run prisma -- migrate dev
```
*(Hoặc dùng lệnh tiện ích: `npm.cmd run migrate`)*

Kết quả đúng: Prisma thông báo đồng bộ thành công (`Your database is now in sync with your schema`).

**2. Chạy Seed (nạp dữ liệu món mẫu)**

Vẫn ở thư mục `apps/api`, chạy lệnh:

```powershell
npm.cmd run seed
```

Kết quả đúng:
```text
Đang khởi tạo dữ liệu mẫu cho menu (seed)...
Đã nạp thành công 12 sản phẩm vào bảng Product.
```
*(Lệnh seed có tính an toàn: dù chạy lại bao nhiêu lần thì danh sách vẫn duy trì đúng 12 sản phẩm, không bị nhân đôi dữ liệu).*

**3. Xem dữ liệu đã nạp (tùy chọn)**

Bạn có thể mở giao diện quản trị Prisma Studio để xem dữ liệu bảng `Product`:

```powershell
npm.cmd run prisma -- studio
```
Trình duyệt sẽ mở trang [http://localhost:5555](http://localhost:5555). Nhấn `Ctrl + C` tại terminal để tắt khi xem xong.

## Chạy API (local)

API NestJS nằm trong thư mục `apps/api`, chạy ở cổng mặc định 3001.

> **Lưu ý cho Windows (PowerShell):** Dùng `npm.cmd` thay cho `npm` (ví dụ: `npm.cmd install`, `npm.cmd run start:dev`).

**1. Cài đặt thư viện**

Mở PowerShell và chuyển vào thư mục `apps/api`:

```powershell
cd apps/api
npm.cmd install
```

**2. Khởi động API**

```powershell
npm.cmd run start:dev
```

Khi màn hình hiện thông báo `Server đang chạy tại: http://localhost:3001` là API đã sẵn sàng.

**3. Kiểm tra đã chạy**

Mở trình duyệt hoặc gọi URL: [http://localhost:3001/health](http://localhost:3001/health) (hoặc chạy trong terminal: `curl http://localhost:3001/health`).

Kết quả đúng:
```json
{"status":"ok"}
```

**4. Dừng API**

Nhấn `Ctrl + C` tại cửa sổ terminal đang chạy API.

## Kiểm thử End-to-End (E2E)

Kiểm thử trọn vẹn luồng từ Menu -> Chi tiết món -> Đăng nhập -> Đặt đơn -> Thanh toán Idempotency -> Xác nhận đơn (Task 5.2):

```powershell
# Chạy với API local (khi API cổng 3001 đang chạy)
.\tests\run-e2e.ps1

# Hoặc chạy kiểm thử trực tiếp trên môi trường production Render
.\tests\run-e2e.ps1 -ApiUrl https://brewlite-api.onrender.com
```
Chi tiết về 16 kịch bản kiểm thử xem tại [`tests/README.md`](file:///tests/README.md).

## Triển khai và Tự động hóa (CI/CD)

Dự án áp dụng quy trình tự động hóa đầy đủ bằng **GitHub Actions** theo chuẩn:
`Push/Tag` → `Lint và Test` → `Build` → `Docker Image Push Registry` → `Deploy` → `Smoke Test`

### 1. Quy trình CI (`.github/workflows/ci.yml`)
- Tự động kích hoạt khi có Pull Request vào nhánh `some-diagram-and-SRS` hoặc `main`.
- Chạy kiểm tra độc lập cho cả `apps/api` và `apps/web`: `npm ci` → `npm run lint` → `npm test` → `npm run build`.
- Quy tắc bảo vệ nhánh (Branch Protection Rule): Bắt buộc CI phải xanh mới được phép gộp PR.

### 2. Pipeline CD Triển khai (`.github/workflows/cd.yml`)
- Tự động kích hoạt khi push tag phiên bản (`v*`), push code lên nhánh chính, hoặc kích hoạt thủ công (`workflow_dispatch`).
- **Giai đoạn 1 (Quality Gate):** Chạy lint, test, build để đảm bảo chất lượng.
- **Giai đoạn 2 (Docker Registry):** Build Docker image cho API và Web, gắn tag commit SHA (`sha-<commit>`), sau đó đẩy lên GitHub Container Registry (GHCR: `ghcr.io`).
- **Giai đoạn 3 (Database Migration):** Chạy `npx prisma migrate deploy` an toàn vào cơ sở dữ liệu Render PostgreSQL qua kết nối bảo mật. Nếu migration lỗi, pipeline dừng ngay lập tức.
- **Giai đoạn 4 (Deploy Render):** Gọi Deploy Hook để Render triển khai phiên bản mới.
- **Giai đoạn 5 (Smoke Test):** Tự động thăm dò endpoint `GET /health` của API và trang chủ Web trên production. Pipeline sẽ báo lỗi nếu dịch vụ không phản hồi 200 OK.

### 3. Cấu hình GitHub Secrets (cho CD)
Để kích hoạt đầy đủ pipeline CD, truy cập GitHub Repo: **Settings → Secrets and variables → Actions** và cấu hình các biến sau:
- `RENDER_EXTERNAL_DATABASE_URL`: Chuỗi kết nối bên ngoài của cơ sở dữ liệu Render PostgreSQL (dùng chạy migration an toàn từ xa).
- `RENDER_API_DEPLOY_HOOK`: URL Deploy Hook của service `brewlite-api` trên Render Dashboard (Settings → Deploy Hook).
- `RENDER_WEB_DEPLOY_HOOK`: URL Deploy Hook của service `brewlite-web` trên Render Dashboard.
- `PRODUCTION_API_URL`: Domain công khai của API (ví dụ: `https://brewlite-api.onrender.com`).
- `PRODUCTION_WEB_URL`: Domain công khai của Web (ví dụ: `https://brewlite-web.onrender.com`).

### 4. Kiểm tra Smoke Test thủ công
Sau khi deploy, bạn có thể kiểm tra trạng thái hoạt động trên môi trường thật bằng lệnh:
```bash
# Kiểm tra API Health Check (kết quả mong đợi: {"status":"ok"})
curl https://brewlite-api.onrender.com/health

# Kiểm tra Web Frontend (kết quả mong đợi: mã HTTP 200)
curl -I https://brewlite-web.onrender.com
```

### 5. Quy trình Rollback (Hoàn nguyên khi có sự cố)
Nếu bản deploy mới gặp lỗi hoặc không vượt qua bài kiểm tra Smoke Test:
1. **Cách 1 - Rollback qua GitHub Actions (`.github/workflows/rollback.yml`):**
   - Vào tab **Actions** → Chọn workflow **Rollback Deployment** → Nhấn **Run workflow**.
   - Chọn dịch vụ cần rollback (`all`, `api`, hoặc `web`), nhập lý do sự cố và mã commit cần phục hồi.
2. **Cách 2 - Rollback trực tiếp trên Render Dashboard (1-click):**
   - Đăng nhập [Render Dashboard](https://dashboard.render.com).
   - Chọn service bị lỗi (`brewlite-api` hoặc `brewlite-web`) → Vào mục **Deploys**.
   - Tìm bản deploy ổn định trước đó (Healthy) → Nhấn nút ba chấm `...` → Chọn **Rollback to this deploy** (hoặc **Re-deploy**).
3. **Rollback Database Migration (nếu có sự cố schema):**
   - Chạy lệnh khắc phục migration trên máy dev bằng External Database URL:
     ```bash
     npx prisma migrate resolve --rolled-back <migration_name>
     ```

## Cấu trúc thư mục

- `apps/web` — giao diện Next.js
- `apps/api` — API NestJS
- `docs/` — yêu cầu, sơ đồ, kiến trúc hệ thống
- `docker-compose.yml` — chạy PostgreSQL local
- `render.yaml` — định nghĩa hạ tầng triển khai trên Render PaaS
- `.github/workflows/` — kịch bản CI (`ci.yml`), CD (`cd.yml`) và Rollback (`rollback.yml`)
