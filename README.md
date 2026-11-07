# BrewLite

Website đặt và thanh toán đồ uống tại quán. Hiện mới khởi tạo dự án: chỉ chạy được cơ sở dữ liệu PostgreSQL bằng Docker.

Giao diện sẽ ưu tiên màn hình máy tính, vẫn xem được trên điện thoại. Web và API là hai ứng dụng độc lập trong `apps/web` và `apps/api` (chưa có mã nguồn).

## Cần cài trước

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

Kết quả đúng: `brewlite:5432 - accepting connections`

Cổng mặc định trên máy bạn: `localhost:5432`. Tên database, user và mật khẩu lấy từ `.env` (mẫu: `brewlite` / `brewlite` / `brewlite`).

**4. Dừng**

```bash
docker compose down
```

Dữ liệu được giữ trong volume Docker `postgres_data`. Muốn xóa hẳn dữ liệu (làm lại từ đầu):

```bash
docker compose down -v
```

## Chạy API (local)

API NestJS nằm trong thư mục `apps/api`, chạy ở cổng mặc định 3001.

> **Lưu ý cho Windows (PowerShell):**  
> Nếu PowerShell báo lỗi `"running scripts is disabled"`, bạn chạy lệnh:  
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
> ```  
> Hoặc có thể dùng `npm.cmd` thay cho `npm` (ví dụ: `npm.cmd install`, `npm.cmd run start:dev`).

**1. Cài đặt thư viện**

Mở PowerShell và chuyển vào thư mục `apps/api`:

```powershell
cd apps/api
npm install
```

**2. Khởi động API**

```powershell
npm run start:dev
```

Khi màn hình hiện thông báo `Server đang chạy tại: http://localhost:3001` là API đã sẵn sàng.

**3. Kiểm tra đã chạy**

Mở trình duyệt hoặc gọi URL: [http://localhost:3001/health](http://localhost:3001/health)  
(Hoặc chạy trong terminal: `curl http://localhost:3001/health`)

Kết quả đúng:
```json
{"status":"ok"}
```

**4. Dừng API**

Nhấn `Ctrl + C` tại cửa sổ terminal đang chạy API.

## Chạy ứng dụng web (apps/web)

Mở PowerShell và chuyển vào thư mục `apps/web`:

```powershell
cd apps/web
```

**1. Khởi động giao diện phát triển (Development)**

```powershell
npm.cmd run dev
```
*(hoặc `npm run dev`)*

Mở trình duyệt truy cập: [http://localhost:3000](http://localhost:3000)
- **Trang Menu:** Xem danh sách đồ uống, lọc danh mục, tìm kiếm món.
- **Trang Chi tiết món:** Bấm vào thẻ món bất kỳ (hoặc truy cập trực tiếp ví dụ [http://localhost:3000/menu/1](http://localhost:3000/menu/1)) để chọn Size, Lượng đá, Lượng đường, Topping, Ghi chú và xem Giá tạm tính.
- **Trang Đăng nhập / Đăng ký:** [http://localhost:3000/login](http://localhost:3000/login) và [http://localhost:3000/register](http://localhost:3000/register). Trên header: chưa đăng nhập thấy nút "Đăng nhập", "Đăng ký"; đã đăng nhập thấy tên và nút "Đăng xuất".

### Đăng nhập, đăng ký và xử lý 401 (web)

> **Hợp đồng API auth là TẠM.** Backend chưa có `POST /auth/register` và `POST /auth/login`, nên tên endpoint, tên field, dạng response và chuỗi lỗi hiện do frontend đề xuất. Tất cả gom trong một file `apps/web/services/auth-contract.ts`. Khi backend chốt khác thì chỉ sửa file này.

- **Hợp đồng tạm:** đăng ký gửi `{ fullName, email, password }`, thành công thì chuyển sang `/login` kèm thông báo "Đăng ký thành công". Đăng nhập gửi `{ email, password }`, nhận `{ access_token, user: { id, email, fullName, role } }`. Mật khẩu tối thiểu 6 ký tự (tạm).
- **Nơi lưu đăng nhập:** `localStorage`, khóa `brewlite_auth_v1`, chỉ chứa token và thông tin user cơ bản, **không bao giờ chứa mật khẩu**. Dữ liệu hỏng thì coi như chưa đăng nhập.
- **Đăng xuất:** chỉ xóa `brewlite_auth_v1`, **giỏ hàng `brewlite_cart_v1` giữ nguyên**, rồi về Menu. Đăng xuất ở một tab thì các tab khác cũng tự đăng xuất.
- **Khi server trả 401:** hàm chung `apiFetch` (`apps/web/services/auth.ts`) tự gắn header `Authorization: Bearer <token>`. Gặp 401 thì xóa phiên, chuyển về `/login?redirect=<trang hiện tại>&expired=true` (trang đăng nhập hiện "Phiên đăng nhập đã hết hạn..."), đăng nhập lại xong quay về đúng trang cũ. Nhiều request 401 cùng lúc chỉ chuyển trang một lần. Riêng lời gọi đăng nhập/đăng ký bị 401 (sai mật khẩu) thì **không** chuyển trang, chỉ báo lỗi trên form.
- **Chống chuyển hướng ra ngoài:** tham số `redirect` chỉ nhận đường dẫn nội bộ bắt đầu bằng một dấu `/`. Giá trị như `//evil.com`, `https://...`, `javascript:...` sẽ bị bỏ, về Menu.
- **Bảo vệ trang (cho Task 17/18):** hook `useRequireAuth` trong `apps/web/context/useRequireAuth.ts`. Hiện **chưa áp dụng** vào trang nào; Menu, chi tiết món, giỏ hàng vẫn xem được khi chưa đăng nhập.

**Bật / tắt chế độ giả lập (mock) auth**

Mặc định web gọi API thật tại `NEXT_PUBLIC_API_URL` (mẫu trong `.env.example` ở thư mục gốc). Vì backend chưa có API auth, muốn thử trên máy thì mở (hoặc tạo) file `apps/web/.env.local` và đặt:

```text
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_USE_MOCK_AUTH=true
```

Sau khi sửa `.env.local` phải tắt `npm.cmd run dev` (Ctrl + C) rồi chạy lại. Tài khoản mẫu khi bật mock: `khachhang@brewlite.vn` / `password123`. Tài khoản đăng ký mới trong chế độ mock chỉ lưu trong bộ nhớ trình duyệt, **mất khi tải lại trang (F5)**. Khi backend xong, đổi `NEXT_PUBLIC_USE_MOCK_AUTH=false` (hoặc xóa dòng đó). File `.env.local` không đưa lên Git.

**2. Chạy kiểm thử tự động (Unit & Component Test)**

```powershell
npm.cmd test
```
*(hoặc `npm test`)*

Kết quả đúng:
```text
✓ __tests__/price.test.ts (4 tests)
✓ __tests__/product-detail.test.tsx (8 tests)
✓ __tests__/menu.test.tsx (7 tests)
Test Files  3 passed (3)
Tests       19 passed (19)
```

**3. Chạy kiểm tra cú pháp (Lint)**

```powershell
npm.cmd run lint
```
*(hoặc `npm run lint`)*

Kết quả đúng: Báo không có lỗi (0 errors).

**4. Đóng gói kiểm tra (Build)**

```powershell
npx.cmd next build --webpack
```

Kết quả đúng: `Compiled successfully` và tạo xong các trang tĩnh mà không có lỗi.

## Cấu trúc thư mục (Sprint 1)

- `apps/web` — giao diện Next.js (sẽ thêm sau)
- `apps/api` — API NestJS (sẽ thêm sau)
- `docs/` — yêu cầu, sơ đồ, kiến trúc
- `docker-compose.yml` — chạy PostgreSQL local
