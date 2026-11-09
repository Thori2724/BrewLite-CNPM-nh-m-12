# BrewLite - Ứng dụng Web (Frontend)

Giao diện ứng dụng đặt món và thanh toán đồ uống BrewLite, xây dựng bằng **Next.js (App Router)** và **Tailwind CSS**.

---

## 1. Khởi động ứng dụng (Local Development)

Chuyển terminal vào thư mục `apps/web`:

```powershell
cd apps/web
```

Cài đặt thư viện (nếu chưa cài):

```powershell
npm.cmd install
```

Khởi động giao diện dev:

```powershell
npm.cmd run dev
```

Mở trình duyệt truy cập: [http://localhost:3000](http://localhost:3000)

---

## 2. Các trang và luồng chức năng chính

- **Trang Menu ([/](http://localhost:3000)):** Xem danh sách đồ uống và món bánh, lọc theo danh mục (`TEA`, `COFFEE`, `MILK_TEA`, `CAKE`), tìm kiếm món theo tên (debounce 300ms). Món có `stock = 0` hiển thị nhãn "Hết hàng" và khóa nút thêm.
- **Trang Chi tiết món ([/menu/:id](http://localhost:3000/menu/11111111-0000-0000-0000-000000000001)):** Render động các tùy chọn từ server (`sizes`, `sugarLevels`, `iceLevels`, `toppings`). Tự động ẩn các phần tùy chọn có mảng rỗng (ví dụ món bánh `CAKE`). Lựa chọn mặc định: Size S, Đường P100, Đá NORMAL. Giới hạn tối đa 3 loại topping không trùng, số lượng 1..10. Món hết hàng (`stock = 0`) khóa nút thêm vào giỏ.
- **Trang Giỏ hàng ([/cart](http://localhost:3000/cart)):** Quản lý các món đã chọn, tăng/giảm số lượng (tối đa 10 ly/món), xóa từng món hoặc xóa tất cả, tính tổng tiền tạm tính. Giới hạn tối đa 20 dòng món khác nhau.
- **Trang Đăng nhập / Đăng ký ([/login](http://localhost:3000/login), [/register](http://localhost:3000/register)):** Đăng ký tài khoản khách hàng mới, đăng nhập nhận JWT Token lưu an toàn vào `localStorage`. Trên Header: hiển thị liên kết **"Đơn của tôi"** (`/orders`), tên người dùng và nút "Đăng xuất" khi đã đăng nhập.
- **Trang Đặt đơn & Thanh toán ([/checkout](http://localhost:3000/checkout)):** Bắt buộc đăng nhập (bảo vệ bởi `useRequireAuth`), chọn hình thức nhận (`AT_COUNTER` / `TAKE_AWAY`), đặt đơn khởi tạo trạng thái `PENDING` và thanh toán qua cổng mô phỏng (`POST /payments`). Khôi phục đơn khi F5, kiểm soát Idempotency chặt chẽ.
- **Trang Lịch sử đơn hàng ([/orders](http://localhost:3000/orders)):** Bắt buộc đăng nhập (`GET /orders/me`), hiển thị toàn bộ danh sách đơn của người dùng theo đúng thứ tự mới nhất từ server (không phân trang), kèm nút "Tải lại", trạng thái loading / empty / error.
- **Trang Xác nhận & Theo dõi chi tiết đơn hàng ([/orders/:id](http://localhost:3000/orders/33333333-0000-0000-0000-000000000001)):** Bắt buộc đăng nhập (`GET /orders/:id`), tải dữ liệu **1 lần khi mở trang** và khi bấm nút **"Tải lại"** (không dùng polling tự động). Hiển thị banner theo trạng thái đơn, mã `#orderNumber` nổi bật (không lộ UUID trên giao diện), thanh tiến trình (stepper) cho luồng chính (`PENDING → PAID → PREPARING → READY → COMPLETED`), danh sách món (ẩn hoàn toàn Size/Đường/Đá nếu giá trị là `null` đối với món bánh), tổng tiền từ server, lịch sử giao dịch thanh toán và nút **"Thanh toán" / "Thử lại thanh toán"** (với `Idempotency-Key` mới trên đúng `orderId` hiện tại) khi đơn ở `PENDING` hoặc `PAYMENT_FAILED`.

### Bố cục giao diện Desktop-First & Responsive:
- **Khung trang chung (`app/layout.tsx`):** Bỏ giới hạn `max-w-md` kiểu điện thoại; Header trải toàn chiều rộng màn hình, nội dung chính căn giữa trong container `max-w-6xl` (`px-4 sm:px-6 lg:px-8`). Thanh điều hướng dưới cùng kiểu điện thoại đã được lược bỏ hoàn toàn (kèm ghi chú `TODO: Task 18 sẽ thêm liên kết "Đơn hàng" vào header`); liên kết chữ `Menu` trên Header tự động ẩn ở màn hình nhỏ (`< 640px`, breakpoint `sm`) để giữ gọn trên điện thoại 375px.
- **Lưới Menu (`/`):** Thanh lọc danh mục và ô tìm kiếm nằm trên cùng một hàng từ breakpoint `md` (`>= 768px`). Lưới sản phẩm hiển thị 2 cột trên điện thoại (`grid-cols-2`), 3 cột trên tablet (`md:grid-cols-3`) và 4 cột trên desktop (`lg:grid-cols-4`, `>= 1024px`).
- **Các trang chia bố cục 2 cột trên Desktop:**
  - **Chi tiết món (`/menu/:id`):** Chia 2 cột từ breakpoint `md` (`md:grid-cols-12`): cột trái (`md:col-span-5`, dính `md:sticky`) hiển thị ảnh, tên và giá gốc; cột phải (`md:col-span-7`) hiển thị các tùy chọn, số lượng, giá tạm tính và nút Thêm vào giỏ.
  - **Giỏ hàng (`/cart`):** Chia 2 cột từ breakpoint `lg` (`lg:grid-cols-12`): cột trái (`lg:col-span-8`) là danh sách dòng món; cột phải (`lg:col-span-4`, dính `lg:sticky`) là khung tóm tắt tổng tiền và nút Tiến hành đặt đơn.
  - **Đặt đơn & Thanh toán (`/checkout`):** Chia 2 cột từ breakpoint `lg` (`lg:grid-cols-12`) ở cả bước Đặt đơn và bước Thanh toán: cột trái (`lg:col-span-7`) là form chọn hình thức/thanh toán; cột phải (`lg:col-span-5`, dính `lg:sticky`) là tóm tắt đơn hàng và nút xác nhận.
- **Các trang và trạng thái căn giữa gọn (`max-w-md` / `max-w-lg`):** Trang Đăng nhập (`/login`), Đăng ký (`/register`), màn hình Thanh toán thành công, giỏ hàng trống và các trạng thái đang tải / báo lỗi / không tìm thấy món đều đặt trong thẻ căn giữa vừa phải, không bị kéo dãn toàn màn hình.

---

## 3. Cấu hình biến môi trường & Bật/Tắt Mock

File cấu hình môi trường đặt tại `apps/web/.env.local` (file này không commit lên Git):

```env
# Địa chỉ máy chủ Backend NestJS (mặc định cổng 3001)
NEXT_PUBLIC_API_URL=http://localhost:3001

# Công tắc Mock Sản phẩm (true: dùng dữ liệu mẫu trong mocks/; false: gọi GET /products và GET /products/:id)
NEXT_PUBLIC_USE_MOCK_PRODUCTS=true

# Công tắc Mock Xác thực (true: dùng tài khoản mẫu; false: gọi POST /auth/login, POST /auth/register)
NEXT_PUBLIC_USE_MOCK_AUTH=true

# Công tắc Mock Đơn hàng & Thanh toán (true: dùng mock orders/payments; false: gọi API thật)
NEXT_PUBLIC_USE_MOCK_ORDERS=true
```

> **Lưu ý:** Khi chuyển công tắc sang `false` (hoặc xóa biến), ứng dụng sẽ tự động chuyển sang gọi trực tiếp API thật tới máy chủ NestJS tại `NEXT_PUBLIC_API_URL`.

### Cơ chế kết nối API Xác thực (POST /auth/register & POST /auth/login):
- Khi `NEXT_PUBLIC_USE_MOCK_AUTH=true`:
  - Dùng tài khoản mẫu kiểm thử cố định: `khachhang@brewlite.vn` / `password123`.
  - Tài khoản đăng ký mới trong mock chỉ sống trong bộ nhớ RAM (sẽ mất khi F5 hoặc mở tab mới).
- Khi `NEXT_PUBLIC_USE_MOCK_AUTH=false`: gọi API thật qua `apiFetch` tới `NEXT_PUBLIC_API_URL` (`POST /auth/register`, `POST /auth/login`).

### Cơ chế kết nối API Sản phẩm (GET /products & GET /products/:id):
- Khi `NEXT_PUBLIC_USE_MOCK_PRODUCTS=false`: gọi API thật qua `fetch` công khai (không qua redirect 401).
- Tham số truy vấn `GET /products`:
  - `category`: `TEA`, `COFFEE`, `MILK_TEA`, `CAKE`. Khi chọn "Tất cả", ứng dụng không truyền tham số `category`.
  - `q`: chuỗi từ khóa tìm kiếm được debounce 300ms bằng `setTimeout` và mã hóa qua `encodeURIComponent`.
- Xử lý lỗi: lỗi 400 và 404 hiển thị thông báo lỗi bằng chuỗi tiếng Việt nhận từ server.

### Cơ chế kết nối API Đơn hàng & Thanh toán (`POST /orders`, `POST /payments`, `GET /orders/me`, `GET /orders/:id`):
- Khi `NEXT_PUBLIC_USE_MOCK_ORDERS=true`:
  - Tự động nạp sẵn 4 đơn hàng mẫu đúng hình dạng hợp đồng (`MOCK_SEED_ORDERS`) vào `brewlite_mock_orders_db_v2`:
    1. Đơn `#1001` (`33333333-0000-0000-0000-000000000001`): Trạng thái `PAID`, gồm 2 món (1 món nước có topping + 1 món bánh `Bánh Croissant` có `size/sugarLevel/iceLevel = null`), tổng tiền `136.000đ`.
    2. Đơn `#1002` (`33333333-0000-0000-0000-000000000002`): Trạng thái `PENDING` (chờ thanh toán, mảng `payments` rỗng).
    3. Đơn `#1003` (`33333333-0000-0000-0000-000000000003`): Trạng thái `PAYMENT_FAILED` (có giao dịch `FAILED` kèm `failureReason: "Giao dịch bị từ chối (mô phỏng)"`).
    4. Đơn `#1004` (`33333333-0000-0000-0000-000000000004`): Trạng thái `READY` (kiểm tra giao diện trạng thái chưa có API kích hoạt).
  - Giả lập trạng thái danh sách rỗng (`/orders` empty): đặt `localStorage.setItem('brewlite_mock_orders_empty', 'true')` và tải lại trang; xóa khóa này để quay lại danh sách có dữ liệu.
  - Giả lập trạng thái 404 (`/orders/:id` not found): truy cập `/orders/404` hoặc một UUID bất kỳ không tồn tại.
  - Tài khoản thử nghiệm thanh toán:
    * 8..19 chữ số thông thường (ví dụ: `12345678`, `9704123456789012`): Thanh toán THÀNH CÔNG (`status: 'SUCCESS'`).
    * Số kết thúc `0000` (ví dụ: `12340000`, `9704000000000000`): Thanh toán THẤT BẠI (`status: 'FAILED'`, lý do `"Giao dịch bị từ chối (mô phỏng)"`).
    * `9999999991`: Giả lập timeout.
    * `9999999992`: Giả lập lỗi mất mạng.
    * Ghi chú đơn chứa `hethang`: Giả lập lỗi hết hàng `409 Conflict` (trả về mảng `details`).
- Khi `NEXT_PUBLIC_USE_MOCK_ORDERS=false`:
  - Gọi fetch thật tới `NEXT_PUBLIC_API_URL` (kèm `Authorization: Bearer <accessToken>`):
    * `POST /orders` với body `{ receiveType, note, items }` (tuyệt đối không gửi giá, không gửi thông tin người nhận).
    * `POST /payments` kèm header `Idempotency-Key` (8..100 ký tự) và body `{ orderId, method, accountNumber }`.
    * `GET /orders/me` lấy danh sách lịch sử đơn hàng của người dùng đang đăng nhập.
    * `GET /orders/:id` tra cứu chi tiết đơn hàng và lịch sử thanh toán.

---

## 4. Bảng nhãn hiển thị tiếng Việt (Theo Mục 7 Hợp đồng API)

| Nhóm | Mã kỹ thuật (Code) | Nhãn hiển thị trên Web (Vietnamese Label) |
|---|---|---|
| **Size (Kích cỡ)** | `S` | Size S |
| | `M` | Size M (+6.000đ) |
| | `L` | Size L (+10.000đ) |
| **SugarLevel (Đường)** | `P0` | 0% |
| | `P30` | 30% |
| | `P50` | 50% |
| | `P70` | 70% |
| | `P100` | 100% |
| **IceLevel (Đá)** | `NONE` | Không đá |
| | `LOW` | Ít đá |
| | `NORMAL` | Đá vừa |
| | `FULL` | Nhiều đá |
| **Category (Danh mục)** | `TEA` | Trà |
| | `COFFEE` | Cà phê |
| | `MILK_TEA` | Trà sữa |
| | `CAKE` | Bánh |
| **ReceiveType (Hình thức nhận)** | `AT_COUNTER` | Tại quầy |
| | `TAKE_AWAY` | Mang đi |
| **OrderStatus (Trạng thái đơn)** | `PENDING` | Chờ thanh toán |
| | `PAID` | Đã thanh toán |
| | `PREPARING` | Đang pha chế |
| | `READY` | Sẵn sàng nhận |
| | `COMPLETED` | Hoàn thành |
| | `PAYMENT_FAILED` | Thanh toán lỗi |
| | `CANCELLED` | Đã hủy |
| **PaymentMethod (Thanh toán)** | `WALLET` | Ví điện tử |
| | `CARD` | Thẻ ngân hàng |
| **PaymentStatus (Trạng thái TT)** *(nhãn FE tự đặt)* | `SUCCESS` | Thành công |
| | `FAILED` | Thất bại |
| | `PENDING` | Đang xử lý |

---

## 5. Quản lý lưu trữ trình duyệt (localStorage)

Ứng dụng sử dụng các khóa `localStorage` riêng biệt để bảo đảm tính độc lập của từng module:

| Khóa lưu trữ | Mục đích |
|---|---|
| `brewlite_cart_v2` | Lưu trữ danh sách các món trong giỏ hàng phía Client. Tối đa 10 ly/món, giỏ chứa tối đa 20 dòng món khác nhau. Tự động dọn dẹp khóa cũ `brewlite_cart_v1` nếu tồn tại. Độc lập với phiên đăng nhập (đăng xuất không mất giỏ). Chỉ xóa sạch khi thanh toán thành công (`status: 'SUCCESS'`). |
| `brewlite_auth_v2` | Lưu trữ JWT token (`accessToken`) và thông tin người dùng cơ bản (`id`, `email`, `displayName`, `role`). Tuyệt đối không lưu mật khẩu. Tự động dọn dẹp khóa cũ `brewlite_auth_v1` nếu tồn tại. |
| `brewlite_pending_order_v2` | Lưu thông tin đơn hàng đang chờ thanh toán (`orderId`, `orderNumber` dạng số nguyên, `totalAmount`, `receiveType`, `idempotencyKey`, `method`, `createdAt`, `itemCount`). Tuyệt đối không lưu số thẻ/ví, không lưu `expiresAt`. Tự động dọn dẹp khóa cũ `brewlite_pending_order_v1` nếu tồn tại. |
| `brewlite_mock_orders_db_v2` | Dữ liệu cơ sở dữ liệu giả lập (chỉ hoạt động khi `NEXT_PUBLIC_USE_MOCK_ORDERS=true`), lưu danh sách đơn hàng, kết quả thanh toán theo `idempotencyKey` và bộ đếm `lastOrderNumber` để không trùng mã sau F5. Tự động dọn dẹp khóa cũ `brewlite_mock_orders_db_v1`. |

---

## 6. Quy tắc Kiểm soát Idempotency & Bảo mật Thanh toán

- **Quy tắc Idempotency-Key (UUID v4):**
  - Mỗi giao dịch thanh toán sinh một khóa định danh duy nhất (8..100 ký tự) gửi qua header `Idempotency-Key`.
  - **Kết quả chưa rõ ràng** (mất mạng, timeout, lỗi 5xx): BẮT BUỘC **GIỮ NGUYÊN** key cũ và đơn chờ để khách bấm thử lại an toàn, tránh trừ tiền 2 lần.
  - **Thông tin thanh toán thay đổi** (đổi phương thức Ví/Thẻ, đổi số tài khoản) hoặc **thất bại rõ ràng** (`status: 'FAILED'`): BẮT BUỘC **ĐỔI SANG KEY MỚI** cho lượt thử lại.
  - Phía server/mock:
    * Cùng key + cùng `orderId`: luôn trả lại kết quả giao dịch cũ với mã HTTP 200, bất kể body.
    * Cùng key + khác `orderId`: server từ chối bằng lỗi `409 Conflict`.
- **Bảo mật thông tin thẻ / ví:**
  - Ô nhập số thẻ / ví có thuộc tính `autoComplete="off"`.
  - Số thẻ / ví chỉ tồn tại tạm thời trong state của form khi người dùng đang nhập; xóa sạch khỏi state ngay khi gửi API hoặc khi unmount component.
  - **Tuyệt đối không bao giờ lưu toàn bộ số thẻ, số ví hay CVV vào `localStorage`, URL hay `console.log`**.

---

## 7. Xử lý mã lỗi 401 Unauthorized

- Lớp gọi API trung tâm `apiFetch` (`services/auth.ts`) tự động gắn header `Authorization: Bearer <token>` nếu đã đăng nhập.
- Khi gặp lỗi 401 trên các request nghiệp vụ (token hết hạn):
  - Tự động xóa phiên đăng nhập (`clearAuthSession()`).
  - Chuyển hướng người dùng về `/login?redirect=<trang hiện tại>&expired=true`.
  - Trang đăng nhập hiển thị thông báo "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại." Sau khi đăng nhập lại thành công, người dùng được đưa về đúng trang ban đầu.
- Riêng lời gọi đăng nhập/đăng ký nếu gặp lỗi 401 (sai email hoặc mật khẩu) thì **không chuyển trang**, chỉ hiển thị thông báo lỗi trên form.
- Tham số `redirect` được kiểm duyệt chặt chẽ (`getSafeRedirectUrl`) để phòng chống lỗ hổng Open Redirect (chỉ chấp nhận đường dẫn nội bộ bắt đầu bằng duy nhất một dấu `/`).

---

## 8. Các lệnh kiểm tra chất lượng (Quality Gate)

### Chạy kiểm thử tự động (Unit & Component Test):
```powershell
npm.cmd test
```

### Chạy kiểm tra kiểu TypeScript:
```powershell
npx.cmd tsc --noEmit
```

### Chạy kiểm tra cú pháp (Lint):
```powershell
npm.cmd run lint
```

### Đóng gói kiểm tra (Build):
```powershell
npm.cmd run build
```
