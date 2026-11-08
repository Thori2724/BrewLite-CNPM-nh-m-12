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
- **Trang Giỏ hàng ([/cart](http://localhost:3000/cart)):** Quản lý các món đã chọn, tăng/giảm số lượng (tối đa 10 ly/món), xóa từng món hoặc xóa tất cả, tính tổng tiền tạm tính.
- **Trang Đăng nhập / Đăng ký ([/login](http://localhost:3000/login), [/register](http://localhost:3000/register)):** Đăng ký tài khoản khách hàng mới, đăng nhập nhận JWT Token lưu an toàn vào `localStorage`. Trên Header: hiển thị tên người dùng và nút "Đăng xuất" khi đã đăng nhập.
- **Trang Đặt đơn & Thanh toán ([/checkout](http://localhost:3000/checkout)):** Bắt buộc đăng nhập (bảo vệ bởi `useRequireAuth`), chọn hình thức nhận (Tại quầy / Mang đi), đặt đơn khởi tạo trạng thái `PENDING` và thanh toán qua cổng mô phỏng (Ví điện tử / Thẻ ngân hàng).

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

### Cơ chế kết nối API Sản phẩm (GET /products & GET /products/:id):
- Khi `NEXT_PUBLIC_USE_MOCK_PRODUCTS=false`: gọi API thật qua `fetch` công khai (không qua redirect 401).
- Tham số truy vấn `GET /products`:
  - `category`: `TEA`, `COFFEE`, `MILK_TEA`, `CAKE`. Khi chọn "Tất cả", ứng dụng không truyền tham số `category`.
  - `q`: chuỗi từ khóa tìm kiếm được debounce 300ms bằng `setTimeout` và mã hóa qua `encodeURIComponent`.
- Xử lý lỗi: lỗi 400 và 404 hiển thị thông báo lỗi bằng chuỗi tiếng Việt nhận từ server.

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

---

## 5. Quản lý lưu trữ trình duyệt (localStorage)

Ứng dụng sử dụng các khóa `localStorage` riêng biệt để bảo đảm tính độc lập của từng module:

| Khóa lưu trữ | Mục đích |
|---|---|
| `brewlite_cart_v1` | Lưu trữ danh sách các món trong giỏ hàng phía Client. Độc lập với phiên đăng nhập (đăng xuất không mất giỏ). *(Sẽ nâng lên `v2` ở Phần C)* |
| `brewlite_auth_v1` | Lưu trữ JWT token và thông tin người dùng cơ bản (`id`, `email`, `displayName`, `role`). Tuyệt đối không lưu mật khẩu. *(Sẽ nâng lên `v2` ở Phần D)* |
| `brewlite_pending_order_v1` | Lưu thông tin đơn hàng đang chờ thanh toán (`orderId`, `orderNumber`, `totalAmount`, `idempotencyKey`). Tuyệt đối không lưu số thẻ/ví. *(Sẽ nâng lên `v2` ở Phần E)* |
| `brewlite_mock_orders_db_v1` | Dữ liệu cơ sở dữ liệu giả lập (chỉ hoạt động khi `NEXT_PUBLIC_USE_MOCK_ORDERS=true`) để dữ liệu sống qua F5. *(Sẽ nâng lên `v2` ở Phần E)* |

---

## 6. Quy tắc Kiểm soát Idempotency & Bảo mật Thanh toán

- **Quy tắc Idempotency-Key (UUID v4):**
  - Mỗi giao dịch thanh toán sinh một khóa định danh duy nhất gửi qua header `Idempotency-Key`.
  - **Kết quả chưa rõ ràng** (mất mạng, timeout, gửi lại): BẮT BUỘC **GIỮ NGUYÊN** key cũ để tránh trừ tiền 2 lần.
  - **Thông tin thanh toán thay đổi** (đổi Ví/Thẻ, đổi số tài khoản) hoặc **bị từ chối rõ ràng** (`PAYMENT_FAILED`): BẮT BUỘC **ĐỔI SANG KEY MỚI** để thử lại.
  - Phía server/mock: Nếu gửi lại cùng key nhưng khác dữ liệu thanh toán, server từ chối bằng lỗi `409 Conflict`.
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
