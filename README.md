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
- **Trang Đặt đơn & Thanh toán (Checkout):** [http://localhost:3000/checkout](http://localhost:3000/checkout). Bắt buộc đăng nhập (bảo vệ bởi `useRequireAuth`), chọn hình thức nhận (Tại quầy / Mang đi), nhập số điện thoại, đặt đơn PENDING và thanh toán (Ví điện tử / Thẻ ngân hàng).

### Đặt đơn hàng, thanh toán và kiểm soát Idempotency (web)

> **Hợp đồng API Đơn hàng & Thanh toán là TẠM.** Backend chưa hoàn thiện API tạo đơn và thanh toán, nên cấu trúc DTO, endpoint và mã lỗi do frontend đề xuất. Tất cả gom trong một file duy nhất: `apps/web/services/order-contract.ts`. Riêng endpoint `GET /orders/:id` và các trường `customerName`, `customerPhone` được đánh dấu là **[CHỜ XÁC NHẬN TỪ BACKEND]**.

- **Quy tắc Idempotency-Key (UUID v4):**
  - Mỗi giao dịch thanh toán sinh một khóa định danh duy nhất gửi qua header `Idempotency-Key`.
  - **Kết quả chưa rõ ràng** (mất mạng, timeout, gửi lại): BẮT BUỘC **GIỮ NGUYÊN** key cũ để tránh trừ tiền 2 lần.
  - **Thông tin thanh toán thay đổi** (đổi Ví/Thẻ, đổi số tài khoản) hoặc **bị từ chối rõ ràng** (`PAYMENT_FAILED`): BẮT BUỘC **ĐỔI SANG KEY MỚI** để thử lại.
  - Phía server/mock: Nếu gửi lại cùng key nhưng body thanh toán khác, server sẽ từ chối bằng lỗi 409 Mismatch và không xử lý thanh toán lần hai.
- **Bảo mật thông tin thẻ / ví:**
  - Ô nhập số thẻ / ví có thuộc tính `autoComplete="off"`.
  - Số thẻ / ví chỉ tồn tại tạm thời trong bộ nhớ của form khi người dùng đang nhập; xóa sạch khỏi state ngay khi gửi API hoặc khi người dùng rời trang.
  - **Tuyệt đối không bao giờ lưu số thẻ, số ví hay CVV vào `localStorage`, URL hay `console.log`**.
- **Quản lý đơn chờ thanh toán (`brewlite_pending_order_v1`):**
  - Khi tạo đơn thành công, thông tin đơn chờ được lưu tạm vào `localStorage` với thời hạn 15 phút (`expiresAt`).
  - Khi người dùng quay lại trang checkout, nếu đơn chờ còn hạn sẽ hiện banner tiếp tục thanh toán.
  - Nếu đơn chờ đã quá 15 phút, hệ thống tự động xóa bản ghi và thông báo người dùng tạo đơn mới.
  - Khi thanh toán thành công, đơn chờ và giỏ hàng tự động được xóa sạch.

**Bật / tắt chế độ giả lập (mock) đơn hàng & thanh toán**

Trong file `apps/web/.env.local`:
```text
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_USE_MOCK_AUTH=true
NEXT_PUBLIC_USE_MOCK_ORDERS=true
```
- Khi bật mock:
  - Giả lập tạo đơn PENDING (tự tính tổng tiền từ danh mục, hạn 15 phút).
  - **Lưu trữ dữ liệu Mock sống qua F5 (`brewlite_mock_orders_db_v1`):**
    - Nhằm mục đích demo và kiểm thử, khi bật `NEXT_PUBLIC_USE_MOCK_ORDERS=true`, các đơn hàng và giao dịch mock được lưu tạm vào `localStorage` dưới khóa `brewlite_mock_orders_db_v1` để không bị mất khi F5 hoặc mở lại trang.
    - **Bảo mật:** Mock DB chỉ lưu 4 số cuối của số ví/thẻ để đối chiếu Idempotency mock, tuyệt đối không lưu trọn vẹn số thẻ/ví.
    - Hệ thống tự động dọn dẹp các đơn mock quá thời hạn 15 phút.
    - **Cách xóa Mock DB bằng tay:** Mở F12 > Thẻ **Application** > **Local Storage** > click chuột phải vào khóa `brewlite_mock_orders_db_v1` chọn **Delete** (hoặc vào tab **Console** gõ `localStorage.removeItem('brewlite_mock_orders_db_v1')`).
  - **Cách kích hoạt các kịch bản mock bằng tay trên trình duyệt:**
    - **Hết hàng (409):** Chọn món "Trà đào cam sả" (món số 3 đang hết hàng) hoặc nhập từ khóa `hethang` / `hết hàng` vào ô Ghi chú.
    - **Timeout (status 0):** Nhập số điện thoại nhận hàng hoặc số thẻ/ví là `0900000001` (thẻ: `9704000000000001`), hoặc nhập chữ `timeout` vào ô Ghi chú.
    - **Mất mạng (status 0):** Nhập số điện thoại nhận hàng hoặc số thẻ/ví là `0900000002` (thẻ: `9704000000000002`), hoặc nhập chữ `offline` vào ô Ghi chú (hoặc bật chế độ Offline trong F12 > Network).
    - **Giao dịch bị từ chối / thất bại (402):** Nhập số thẻ/ví kết thúc bằng chữ số `0` (ví dụ `0901234560` hoặc `9704000000000000`).
    - **Giao dịch thành công (PAID):** Nhập số thẻ/ví hợp lệ kết thúc bằng số khác `0` (ví dụ `0901234567` hoặc `9704000000000007`).

### Đăng nhập, đăng ký và xử lý 401 (web)

> **Hợp đồng API auth là TẠM.** Backend chưa có `POST /auth/register` và `POST /auth/login`, nên tên endpoint, tên field, dạng response và chuỗi lỗi hiện do frontend đề xuất. Tất cả gom trong một file `apps/web/services/auth-contract.ts`. Khi backend chốt khác thì chỉ sửa file này.

- **Hợp đồng tạm:** đăng ký gửi `{ fullName, email, password }`, thành công thì chuyển sang `/login` kèm thông báo "Đăng ký thành công". Đăng nhập gửi `{ email, password }`, nhận `{ access_token, user: { id, email, fullName, role } }`. Mật khẩu tối thiểu 6 ký tự (tạm).
- **Nơi lưu đăng nhập:** `localStorage`, khóa `brewlite_auth_v1`, chỉ chứa token và thông tin user cơ bản, **không bao giờ chứa mật khẩu**. Dữ liệu hỏng thì coi như chưa đăng nhập.
- **Đăng xuất:** chỉ xóa `brewlite_auth_v1`, **giỏ hàng `brewlite_cart_v1` giữ nguyên**, rồi về Menu. Đăng xuất ở một tab thì các tab khác cũng tự đăng xuất.
- **Khi server trả 401:** hàm chung `apiFetch` (`apps/web/services/auth.ts`) tự gắn header `Authorization: Bearer <token>`. Gặp 401 thì xóa phiên, chuyển về `/login?redirect=<trang hiện tại>&expired=true` (trang đăng nhập hiện "Phiên đăng nhập đã hết hạn..."), đăng nhập lại xong quay về đúng trang cũ. Nhiều request 401 cùng lúc chỉ chuyển trang một lần. Riêng lời gọi đăng nhập/đăng ký bị 401 (sai mật khẩu) thì **không** chuyển trang, chỉ báo lỗi trên form.
- **Chống chuyển hướng ra ngoài:** tham số `redirect` chỉ nhận đường dẫn nội bộ bắt đầu bằng một dấu `/`. Giá trị như `//evil.com`, `https://...`, `javascript:...` sẽ bị bỏ, về Menu.
- **Bảo vệ trang:** hook `useRequireAuth` trong `apps/web/context/useRequireAuth.ts` được áp dụng để bảo vệ trang Đặt đơn & Thanh toán `/checkout` (chưa đăng nhập tự động chuyển về `/login?redirect=%2Fcheckout`). Trang Menu, chi tiết món và giỏ hàng vẫn xem được tự do khi chưa đăng nhập.

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
