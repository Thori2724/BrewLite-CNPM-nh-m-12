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

- **Trang Menu ([/](http://localhost:3000)):** Xem danh sách đồ uống và món bánh, lọc theo danh mục (`TEA`, `COFFEE`, `MILK_TEA`, `CAKE`), tìm kiếm món theo tên.
- **Trang Chi tiết món ([/menu/:id](http://localhost:3000/menu/1)):** Tùy chọn Size (S/M/L), Lượng đường, Lượng đá, Topping (tối đa 3 loại), Ghi chú và xem Giá tạm tính. Món bánh tự động ẩn các tùy chọn đồ uống.
- **Trang Giỏ hàng ([/cart](http://localhost:3000/cart)):** Quản lý các món đã chọn, tăng/giảm số lượng (tối đa 10 ly/món), xóa từng món hoặc xóa tất cả, tính tổng tiền tạm tính.
- **Trang Đăng nhập / Đăng ký ([/login](http://localhost:3000/login), [/register](http://localhost:3000/register)):** Đăng ký tài khoản khách hàng mới, đăng nhập nhận JWT Token lưu an toàn vào `localStorage`. Trên Header: hiển thị tên người dùng và nút "Đăng xuất" khi đã đăng nhập.
- **Trang Đặt đơn & Thanh toán ([/checkout](http://localhost:3000/checkout)):** Bắt buộc đăng nhập (bảo vệ bởi `useRequireAuth`), chọn hình thức nhận (Tại quầy / Mang đi), đặt đơn khởi tạo trạng thái `PENDING` và thanh toán qua cổng mô phỏng (Ví điện tử / Thẻ ngân hàng).

---

## 3. Cấu hình biến môi trường & Bật/Tắt Mock

File cấu hình môi trường đặt tại `apps/web/.env.local` (file này không commit lên Git):

```env
# Địa chỉ máy chủ Backend NestJS (mặc định cổng 3001)
NEXT_PUBLIC_API_URL=http://localhost:3001

# Công tắc Mock Sản phẩm (true: dùng dữ liệu mẫu trong mocks/; false: gọi GET /products)
NEXT_PUBLIC_USE_MOCK_PRODUCTS=true

# Công tắc Mock Xác thực (true: dùng tài khoản mẫu; false: gọi POST /auth/login, POST /auth/register)
NEXT_PUBLIC_USE_MOCK_AUTH=true

# Công tắc Mock Đơn hàng & Thanh toán (true: dùng mock orders/payments; false: gọi API thật)
NEXT_PUBLIC_USE_MOCK_ORDERS=true
```

> **Lưu ý:** Khi chuyển công tắc sang `false` (hoặc xóa biến), ứng dụng sẽ tự động chuyển sang gọi trực tiếp API thật qua `apiFetch` tới máy chủ NestJS tại `NEXT_PUBLIC_API_URL`.

### Tài khoản thử nghiệm khi bật Mock Auth:
- **Email:** `khachhang@brewlite.vn`
- **Mật khẩu:** `password123`

---

## 4. Quản lý lưu trữ trình duyệt (localStorage)

Ứng dụng sử dụng các khóa `localStorage` riêng biệt để bảo đảm tính độc lập của từng module:

| Khóa lưu trữ | Mục đích |
|---|---|
| `brewlite_cart_v1` | Lưu trữ danh sách các món trong giỏ hàng phía Client. Độc lập với phiên đăng nhập (đăng xuất không mất giỏ). |
| `brewlite_auth_v1` | Lưu trữ JWT token và thông tin người dùng cơ bản (`id`, `email`, `fullName`, `role`). Tuyệt đối không lưu mật khẩu. |
| `brewlite_pending_order_v1` | Lưu thông tin đơn hàng đang chờ thanh toán (`orderId`, `orderNumber`, `totalAmount`, `idempotencyKey`). Tuyệt đối không lưu số thẻ/ví. |
| `brewlite_mock_orders_db_v1` | Dữ liệu cơ sở dữ liệu giả lập (chỉ hoạt động khi `NEXT_PUBLIC_USE_MOCK_ORDERS=true`) để dữ liệu sống qua F5. |

---

## 5. Quy tắc Kiểm soát Idempotency & Bảo mật Thanh toán

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

## 6. Xử lý mã lỗi 401 Unauthorized

- Lớp gọi API trung tâm `apiFetch` (`services/auth.ts`) tự động gắn header `Authorization: Bearer <token>` nếu đã đăng nhập.
- Khi gặp lỗi 401 trên các request nghiệp vụ (token hết hạn):
  - Tự động xóa phiên đăng nhập (`clearAuthSession()`).
  - Chuyển hướng người dùng về `/login?redirect=<trang hiện tại>&expired=true`.
  - Trang đăng nhập hiển thị thông báo "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại." Sau khi đăng nhập lại thành công, người dùng được đưa về đúng trang ban đầu.
- Riêng lời gọi đăng nhập/đăng ký nếu gặp lỗi 401 (sai email hoặc mật khẩu) thì **không chuyển trang**, chỉ hiển thị thông báo lỗi trên form.
- Tham số `redirect` được kiểm duyệt chặt chẽ (`getSafeRedirectUrl`) để phòng chống lỗ hổng Open Redirect (chỉ chấp nhận đường dẫn nội bộ bắt đầu bằng duy nhất một dấu `/`).

---

## 7. Các lệnh kiểm tra chất lượng (Quality Gate)

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
*(Hoặc `npx.cmd next build --webpack`)*
