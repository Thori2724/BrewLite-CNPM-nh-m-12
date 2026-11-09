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

## Cấu trúc thư mục (Sprint 1)

- `apps/web` — giao diện Next.js (sẽ thêm sau)
- `apps/api` — API NestJS
- `docs/` — yêu cầu, sơ đồ, kiến trúc
- `docker-compose.yml` — chạy PostgreSQL local
