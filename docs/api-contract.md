# HỢP ĐỒNG API (API CONTRACT) – HỆ THỐNG BREWLITE – BẢN 2

> **Cập nhật:** 14/11/2026. Đây là hợp đồng giao tiếp kỹ thuật duy nhất giữa Frontend (Next.js) và Backend (NestJS) để hai bên code song song, không đụng nhau.
> Bản 2 giữ phần nhóm đã làm ở bản 1 (rút gọn cho dễ đọc), **sửa** phần đổi hành vi và **thêm** phần mới theo các quyết định nhóm đã thống nhất.
>
> **Ký hiệu:** **[ĐÃ LÀM]** giữ nguyên, không sửa code. **[SỬA]** đã có nhưng đổi hành vi. **[MỚI]** chưa có, cần làm.

---

## 0. CÁC QUYẾT ĐỊNH ĐÃ THỐNG NHẤT (đọc trước khi code)

**0.1 Tồn kho thành "đang bán / tạm hết"**
- Bỏ tồn kho kiểu đếm từng ly. Vẫn **giữ cột `stock`, không xóa**. Quy ước: `stock > 0` là đang bán, `stock = 0` là tạm hết.
- Nút gạt "đang bán / tạm hết" đặt `stock = 999` hoặc `stock = 0`. STAFF và ADMIN đều được gạt.
- `POST /orders` **không còn trừ kho**. Chỉ kiểm tra món còn bán (`stock > 0`).
- Món tạm hết vẫn hiện trên menu (hình xám, nhãn "Hết hàng", nút "Tạm hết" không bấm được). Khách **không thấy số lượng**.
- Món đang nằm trong giỏ mà bị gạt tạm hết: khách bấm đặt thì BE trả 409 (xem mục 5.2).
- Đơn đã thanh toán mà lúc pha chế phát hiện hết nguyên liệu: nhân viên **hủy đơn** (`PAID → CANCELLED`) trước khi bấm "Đang pha chế". FE hiện dòng "Tiền sẽ được hoàn lại (mô phỏng)". Không đổi database, không ghi lý do hủy.

**0.2 Thanh toán QR giả (chỉ sửa FE, BE giữ nguyên)**
- Chỉ còn ví điện tử. Khách chọn ZaloPay hoặc Momo (chỉ khác logo và màu trên màn QR, **không lưu vào database**). Bỏ thẻ, bỏ ô nhập số.
- Bấm xác nhận thì hiện mã QR giả (tạo bằng thư viện từ mã đơn). Đếm ngược **5 giây** không bấm gì thì tự **thành công**. Bấm thoát khỏi màn QR thì **thất bại**.
- Chi tiết cách FE gọi `POST /payments` xem mục 6.

**0.3 Trạng thái đơn**
- Chỉ đi tiến: `PENDING → PAID` (tự động khi thanh toán thành công), rồi nhân viên bấm `PAID → PREPARING → READY → COMPLETED`.
- Không cho lùi trạng thái, không chỉnh tay `PENDING/PAID`, **không có timer** tự chuyển. `COMPLETED` và `CANCELLED` là trạng thái cuối.
- Khách theo dõi đơn: trang chỉ tải khi mở trang kèm nút "Tải lại", **không polling**.

**0.4 Hủy đơn**
- Khách hủy được đơn **của mình** khi đơn ở `PENDING`, `PAYMENT_FAILED`, `PAID`.
- Nhân viên hủy được đơn bất kỳ ở `PENDING`, `PAYMENT_FAILED`, `PAID`. **Không** hủy được từ `PREPARING` hoặc `READY` (giữ nguyên hàm kiểm tra chuyển trạng thái, vì Assignment 1 chỉ vẽ 3 trạng thái được hủy).
- Có hộp xác nhận trước khi hủy. Đơn đã hủy vẫn hiện trong lịch sử với nhãn "Đã hủy", vẫn bấm xem chi tiết như đơn khác.

**0.5 Phân quyền**
- Ba vai trò: `CUSTOMER`, `STAFF`, `ADMIN`. ADMIN làm được mọi việc của STAFF.
- Một trang đăng nhập chung. Sau đăng nhập: CUSTOMER về menu, STAFF/ADMIN về `/staff`.
- Quyền thật do BE kiểm tra (trả 403). FE chỉ ẩn/hiện và chuyển hướng cho gọn.

**0.6 Quản lý món**
- STAFF chỉ gạt đang bán/tạm hết. ADMIN thêm, sửa, ẩn/hiện món.
- Danh mục chỉ chọn trong 4 loại có sẵn. Ảnh nhập link, để trống thì dùng ảnh mặc định. Chỉ ẩn/hiện, **không xóa hẳn** món.

**0.7 Quản lý nhân viên**
- ADMIN xem danh sách STAFF và khóa/mở khóa. Khóa là **chặn hoàn toàn**: không đăng nhập được, đang đăng nhập thì mọi API nhân viên trả 403 và FE tự đăng xuất.
- Không tạo/sửa/xóa nhân viên qua giao diện (nhân viên được seed sẵn).

**0.8 Dữ liệu và seed**
- Local và production là hai database riêng, không đồng bộ. Seed chạy lại nhiều lần không nhân đôi dữ liệu và **không ghi đè** món đã có (mục 8).

---

## 1. QUY ƯỚC CHUNG **[ĐÃ LÀM, bổ sung phần 403]**

1. **Cổng và đường dẫn:** API chạy ở `http://localhost:3001`, không có tiền tố (dùng trực tiếp `/products`, `/orders`...). CORS đọc biến `CORS_ORIGIN` (mặc định `http://localhost:3000`). FE đọc `NEXT_PUBLIC_API_URL` (mặc định `http://localhost:3001`), biến này **phải được đặt lúc build** web.
2. **Dữ liệu:** `id` là UUID. Tiền là số nguyên VND (`29000` = 29.000đ). Thời gian là chuỗi ISO 8601 UTC. Tên trường JSON, query, enum dùng tiếng Anh; nhãn hiển thị trên web dùng tiếng Việt (mục 9).
3. **Xác thực:** header `Authorization: Bearer <accessToken>`. JWT hết hạn sau **24 giờ**, payload có `sub`, `email`, `role`. Mật khẩu băm bcrypt, không bao giờ xuất hiện trong response hay log. **Server tự tính giá, không nhận giá từ client.**
4. **Định dạng lỗi (chuẩn NestJS):**
   ```json
   { "statusCode": 400, "message": ["quantity must not be less than 1"], "error": "Bad Request" }
   ```
   - Lỗi validate: `message` là mảng chuỗi tiếng Anh.
   - Lỗi nghiệp vụ (tạm hết, sai mật khẩu, không đủ quyền, trạng thái không hợp lệ): `message` là một chuỗi tiếng Việt cho người dùng.
   - Ngoại lệ mở rộng duy nhất: lỗi 409 của `POST /orders` có thêm `details` (mục 5.2).
5. **Các mã lỗi 401 và 403 dùng chung cho mọi endpoint cần đăng nhập:**
   - `401 Unauthorized`: chưa đăng nhập hoặc token hết hạn. FE chuyển về trang đăng nhập.
   - `403 Forbidden`, sai vai trò: `"Bạn không có quyền thực hiện thao tác này"`.
   - `403 Forbidden`, tài khoản bị khóa: `"Tài khoản đã bị khóa"`. FE hiện thông báo rồi tự đăng xuất.
6. **Thứ tự kiểm tra của guard (cho mọi endpoint của STAFF/ADMIN):** (1) kiểm tra JWT, (2) kiểm tra vai trò, (3) đọc `isActive` từ database. Vì đọc database ở **mỗi request**, việc khóa có hiệu lực ngay, không cần chờ token hết hạn.

---

## 2. BẢNG 18 ENDPOINT VÀ QUYỀN TRUY CẬP

| # | Endpoint | Ai gọi được | Trạng thái | Nhóm chức năng |
|---|---|---|---|---|
| 1 | `GET /health` | Mọi người | **[ĐÃ LÀM]** | Hệ thống |
| 2 | `GET /products` | Mọi người (không cần đăng nhập) | **[ĐÃ LÀM]** | Menu |
| 3 | `GET /products/:id` | Mọi người | **[ĐÃ LÀM]** | Chi tiết món |
| 4 | `POST /auth/register` | Mọi người | **[ĐÃ LÀM]** | Xác thực |
| 5 | `POST /auth/login` | Mọi người | **[SỬA]** (chặn tài khoản bị khóa) | Xác thực |
| 6 | `POST /orders` | Khách | **[SỬA]** (bỏ trừ kho) | Đặt đơn |
| 7 | `POST /payments` | Khách | **[ĐÃ LÀM]** (FE đổi cách gọi) | Thanh toán |
| 8 | `GET /orders/me` | Khách | **[ĐÃ LÀM]** | Lịch sử đơn |
| 9 | `GET /orders/:id` | Khách (chỉ chủ đơn) | **[ĐÃ LÀM]** | Theo dõi đơn |
| 10 | `GET /orders` | STAFF, ADMIN | **[MỚI]** | Quản lý đơn |
| 11 | `PATCH /orders/:id/status` | STAFF, ADMIN | **[MỚI]** | Quản lý đơn |
| 12 | `POST /orders/:id/cancel` | Khách (chỉ chủ đơn) | **[MỚI]** | Hủy đơn |
| 13 | `GET /products/manage` | STAFF, ADMIN | **[MỚI]** | Quản lý món |
| 14 | `POST /products` | ADMIN | **[MỚI]** | Quản lý món |
| 15 | `PATCH /products/:id` | ADMIN | **[MỚI]** | Quản lý món |
| 16 | `PATCH /products/:id/availability` | STAFF, ADMIN | **[MỚI]** | Quản lý món |
| 17 | `GET /staff` | ADMIN | **[MỚI]** | Quản lý nhân viên |
| 18 | `PATCH /staff/:id/status` | ADMIN | **[MỚI]** | Quản lý nhân viên |

**Quy tắc khai báo route trong NestJS (bắt buộc, nếu sai sẽ hiểu nhầm chuỗi thành `:id`):**
- Khai báo `GET /orders/me` **trước** `GET /orders/:id`.
- Khai báo `GET /products/manage` **trước** `GET /products/:id`.

**Truy vết sang SRS hiện tại (FR-01 đến FR-10):** `/health` thuộc NFR-01; `/products` FR-01; `/products/:id` FR-02; `/auth/*` FR-04; `POST /orders` FR-03, FR-05; `POST /payments` FR-05; `GET /orders/me`, `GET /orders/:id` FR-06; `GET /orders`, `PATCH /orders/:id/status` FR-07; `POST /orders/:id/cancel` FR-06, FR-07; các endpoint món FR-08; `/staff` FR-10.

---

## 3. HỆ THỐNG VÀ SẢN PHẨM

### 3.1 `GET /health` **[ĐÃ LÀM]**
- Không cần đăng nhập. Trả `200` với `{ "status": "ok" }`. Dùng cho Docker, CD smoke test.

### 3.2 `GET /products` **[ĐÃ LÀM]**
- Không cần đăng nhập. Chỉ trả món có `isVisible = true`. Món `stock = 0` vẫn trả về để web hiện "Hết hàng". Không phân trang. Sắp xếp theo `category` rồi `name`.
- Query (tùy chọn, kết hợp được): `category` (`TEA`, `COFFEE`, `MILK_TEA`, `CAKE`), `q` (tìm chuỗi con trong tên, không phân biệt hoa/thường, hỗ trợ tiếng Việt có dấu).
- Response `200`: mảng `{ id, name, category, basePrice, imageUrl, stock }`.
- Lỗi `400`: `category` sai giá trị: `"Danh mục không hợp lệ. Cho phép: TEA, COFFEE, MILK_TEA, CAKE"`.
- **Lưu ý FE:** chỉ dùng `stock` để biết đang bán (`> 0`) hay tạm hết (`= 0`). **Không hiển thị số lượng** cho khách.

### 3.3 `GET /products/:id` **[ĐÃ LÀM]**
- Không cần đăng nhập. Món ẩn hoặc không tồn tại: `404` `"Không tìm thấy sản phẩm"`.
- Món nước: kèm `sizes`, `sugarLevels`, `iceLevels`, `toppings`. Món bánh (`CAKE`): bốn mảng này đều là `[]`.
- Quy tắc tùy chọn:
  - `sizes` là hằng số trong code, không có bảng Size: `S` (+0đ), `M` (+6.000đ), `L` (+10.000đ).
  - `sugarLevels`: `P0`, `P30`, `P50`, `P70`, `P100`. `iceLevels`: `NONE`, `LOW`, `NORMAL`, `FULL`.
  - `toppings`: 4 topping từ database (Trân châu đen +5.000, Thạch dừa +5.000, Pudding +7.000, Kem cheese +10.000).
- Ví dụ rút gọn (món nước):
  ```json
  {
    "id": "11111111-0000-0000-0000-000000000001",
    "name": "Cà phê sữa đá", "category": "COFFEE", "basePrice": 29000,
    "imageUrl": "https://images.unsplash.com/...?w=500", "stock": 50,
    "sizes": [{ "value": "S", "label": "Size S", "extraPrice": 0 }, "..."],
    "sugarLevels": [{ "value": "P0", "label": "0%" }, "..."],
    "iceLevels": [{ "value": "NONE", "label": "Không đá" }, "..."],
    "toppings": [{ "id": "22222222-0000-0000-0000-000000000001", "name": "Trân châu đen", "price": 5000 }, "..."]
  }
  ```

### 3.4 `GET /products/manage` **[MỚI]**
- **Quyền:** STAFF, ADMIN. Dùng cho trang `/staff/products`.
- Trả **mọi món, kể cả món đang ẩn**, sắp xếp theo `category` rồi `name`. Không phân trang.
- Response `200`: mảng `{ id, name, category, basePrice, imageUrl, stock, isVisible }`.
- FE: STAFF chỉ cần hiển thị món `isVisible = true`; ADMIN hiển thị tất cả, món ẩn có nhãn "Đã ẩn".

### 3.5 `POST /products` **[MỚI]**
- **Quyền:** ADMIN. Thêm món mới.
- Body:
  | Trường | Bắt buộc | Ràng buộc |
  |---|---|---|
  | `name` | Có | 1 đến 100 ký tự |
  | `category` | Có | `TEA`, `COFFEE`, `MILK_TEA`, `CAKE` (không tạo danh mục mới) |
  | `basePrice` | Có | Số nguyên VND, từ 1.000 đến 1.000.000 |
  | `imageUrl` | Không | Phải bắt đầu bằng `http://` hoặc `https://`, tối đa 500 ký tự. **Bỏ trống hoặc chuỗi rỗng thì BE gán ảnh mặc định** (một đường dẫn cố định đặt trong code, chọn một ảnh có sẵn trong seed) |
- ID do hệ thống tự sinh (UUID), không nhận từ client. Món mới mặc định `stock = 999` (đang bán), `isVisible = true`.
- Response `201`: `{ id, name, category, basePrice, imageUrl, stock, isVisible }`.
- Lỗi: `400` (validate), `401`, `403`.

### 3.6 `PATCH /products/:id` **[MỚI]**
- **Quyền:** ADMIN. Sửa món, gửi các trường muốn đổi (cần ít nhất 1 trường).
- Body (đều tùy chọn): `name`, `category`, `basePrice`, `imageUrl`, `isVisible` (đúng/sai, dùng để ẩn/hiện món). Ràng buộc từng trường giống mục 3.5. `imageUrl` rỗng thì gán lại ảnh mặc định.
- **Không có API xóa món.** Món đã nằm trong đơn cũ nên chỉ được ẩn.
- Sửa giá hoặc tên **không ảnh hưởng đơn cũ** vì mỗi dòng đơn đã lưu sẵn tên và giá lúc đặt.
- Response `200`: `{ id, name, category, basePrice, imageUrl, stock, isVisible }`.
- Lỗi: `400`, `401`, `403`, `404` `"Không tìm thấy sản phẩm"`.

### 3.7 `PATCH /products/:id/availability` **[MỚI]**
- **Quyền:** STAFF, ADMIN. Gạt đang bán / tạm hết.
- Body: `{ "isAvailable": true }` (bắt buộc, đúng/sai). `true` đặt `stock = 999`, `false` đặt `stock = 0`.
- Response `200`: `{ id, name, category, basePrice, imageUrl, stock, isVisible }`.
- Lỗi: `400`, `401`, `403`, `404` `"Không tìm thấy sản phẩm"`.

---

## 4. XÁC THỰC

### 4.1 `POST /auth/register` **[ĐÃ LÀM]**
- Không cần đăng nhập. Email tự chuyển chữ thường. Vai trò luôn là `CUSTOMER`.
- Body: `email` (hợp lệ), `password` (tối thiểu 6 ký tự), `displayName` (1 đến 50 ký tự).
- Response `201`: `{ id, email, displayName, role }`. Lỗi: `400`, `409` `"Email này đã được sử dụng"`.

### 4.2 `POST /auth/login` **[SỬA]**
- Body: `email`, `password`. Response `200`: `{ accessToken, user: { id, email, displayName, role } }`.
- Lỗi `401` `"Email hoặc mật khẩu không chính xác"` (thông báo chung, không tiết lộ trường nào sai).
- **Mới:** tài khoản có `isActive = false` bị từ chối: `403` `"Tài khoản đã bị khóa"` (kiểm tra sau khi mật khẩu đúng).
- FE lưu `role` từ response để chuyển hướng (mục 9.2).

---

## 5. ĐƠN HÀNG

### 5.1 Cấu trúc một đơn (Order object) – dùng chung cho nhiều endpoint
```json
{
  "id": "33333333-0000-0000-0000-000000000001",
  "orderNumber": 1001,
  "status": "PAID",
  "receiveType": "TAKE_AWAY",
  "note": "Cho xin thêm quai xách giấy",
  "totalAmount": 136000,
  "createdAt": "2026-11-05T03:00:00.000Z",
  "items": [
    {
      "id": "88888888-0000-0000-0000-000000000001",
      "productId": "11111111-0000-0000-0000-000000000007",
      "productName": "Trà sữa truyền thống",
      "size": "M", "sugarLevel": "P70", "iceLevel": "NORMAL",
      "quantity": 2, "unitPrice": 53000, "lineTotal": 106000,
      "note": "Ít ngọt vừa phải",
      "toppings": [{ "id": "22222222-0000-0000-0000-000000000001", "name": "Trân châu đen", "price": 5000 }]
    }
  ]
}
```
- Món bánh: `size`, `sugarLevel`, `iceLevel` là `null`, `toppings` là `[]`.
- `GET /orders/:id` thêm mảng `payments`. `GET /orders` và `PATCH /orders/:id/status` thêm `customer` (mục 5.5, 5.7).

### 5.2 `POST /orders` **[SỬA]**
- **Quyền:** khách đã đăng nhập. Tạo đơn từ giỏ. Server tính tiền.
- Body (**giữ nguyên bản 1**): `receiveType` (`AT_COUNTER` mặc định hoặc `TAKE_AWAY`), `note` (tối đa 200), `items` (1 đến 20 dòng). Mỗi dòng: `productId` (UUID, bắt buộc), `quantity` (1 đến 10, bắt buộc), `size` (`S`/`M`/`L`, mặc định `S`), `sugarLevel` (mặc định `P100`), `iceLevel` (mặc định `NORMAL`), `toppingIds` (tối đa 3, không trùng), `note` (tối đa 200). Món bánh **không gửi** `size`, `sugarLevel`, `iceLevel`, `toppingIds`.
- Công thức: `unitPrice = basePrice + phụ thu size + tổng giá topping`; `lineTotal = unitPrice × quantity`; `totalAmount = tổng lineTotal`.
- **Thay đổi so với bản 1:**
  - **Bỏ hoàn toàn việc trừ kho và kiểm tra kho cộng gộp.**
  - Thay bằng kiểm tra: mọi món trong đơn phải đang bán (`stock > 0`). Nếu có món tạm hết thì **từ chối cả đơn**.
  - Vẫn dùng một transaction để tạo `Order`, `OrderItem`, `OrderItemTopping` cùng lúc (tạo hết hoặc không tạo gì). `orderNumber` tự tăng.
- Response `201`: Order object (mục 5.1) với `status = "PENDING"`.
- Lỗi:
  - `400`: giỏ rỗng, số lượng vượt giới hạn, hoặc món bánh bị gửi kèm `size`/`sugarLevel`/`iceLevel`/`toppingIds`.
  - `401`: chưa đăng nhập.
  - `404`: `"Không tìm thấy sản phẩm"` (món không tồn tại hoặc đang ẩn) hoặc `"Không tìm thấy topping"`.
  - `409`: có món tạm hết. **`details` đổi so với bản 1** (bỏ `available`):
    ```json
    {
      "statusCode": 409,
      "message": "Sản phẩm 'Bạc xỉu' hiện đã tạm hết",
      "error": "Conflict",
      "details": [{ "productId": "11111111-0000-0000-0000-000000000003", "name": "Bạc xỉu" }]
    }
    ```

### 5.3 `GET /orders/me` **[ĐÃ LÀM]**
- **Quyền:** khách đã đăng nhập. Trả mảng Order object của chính người dùng, mới nhất trước. Không phân trang. Lỗi `401`.
- Đơn `CANCELLED` vẫn nằm trong danh sách (nhãn "Đã hủy").

### 5.4 `GET /orders/:id` **[ĐÃ LÀM]**
- **Quyền:** khách đã đăng nhập, **chỉ chủ đơn** xem được. Trả Order object kèm mảng `payments`: `{ id, method, accountLast4, status, failureReason, createdAt }`.
- Lỗi: `401`, `404` (đơn không tồn tại hoặc không thuộc người dùng). **Không sửa** quy tắc chủ đơn. Nhân viên xem chi tiết qua `GET /orders` (mục 5.5).

### 5.5 `GET /orders` **[MỚI]**
- **Quyền:** STAFF, ADMIN. Trả **toàn bộ đơn của mọi khách**, mới nhất trước, không phân trang. Dùng cho trang `/staff`.
- Query (tùy chọn): `status` (một giá trị `OrderStatus`) để lọc. Sai giá trị: `400` `"Trạng thái không hợp lệ"`.
- Response `200`: mảng Order object, **mỗi phần tử có thêm**:
  ```json
  "customer": { "id": "...", "displayName": "Nguyễn Văn An", "email": "nguyenan@gmail.com" }
  ```
  Mỗi đơn đã kèm `items` và `toppings` nên FE hiển thị chi tiết món ngay, không gọi `GET /orders/:id`.
- Lỗi: `401`, `403`.

### 5.6 `POST /orders/:id/cancel` **[MỚI]**
- **Quyền:** khách đã đăng nhập, chỉ hủy được **đơn của chính mình**. Không có body.
- Chỉ hủy được khi `status` là `PENDING`, `PAYMENT_FAILED` hoặc `PAID` (dùng lại `validateTransition`). Đơn chuyển sang `CANCELLED`.
- Response `200`: Order object (`status = "CANCELLED"`). Không ghi lý do hủy.
- Lỗi:
  - `401`.
  - `404` `"Không tìm thấy đơn hàng"` (không tồn tại hoặc không thuộc người dùng).
  - `409` `"Không thể hủy đơn ở trạng thái hiện tại"` (đơn đã `PREPARING`, `READY`, `COMPLETED` hoặc đã `CANCELLED`).
- **Hoàn tiền:** nếu đơn đang `PAID`, **không đổi gì ở bảng Payment** (vẫn `SUCCESS`). FE chỉ hiện dòng "Tiền sẽ được hoàn lại (mô phỏng)".

### 5.7 `PATCH /orders/:id/status` **[MỚI]**
- **Quyền:** STAFF, ADMIN. Đổi trạng thái đơn bất kỳ.
- Body: `{ "status": "PREPARING" }`. `status` chỉ được là một trong: `PREPARING`, `READY`, `COMPLETED`, `CANCELLED`. Các giá trị khác (`PENDING`, `PAID`, `PAYMENT_FAILED`) bị `400`, vì chúng chỉ do luồng thanh toán tự sinh ra.
- Chuyển trạng thái hợp lệ (kiểm tra bằng `validateTransition` có sẵn):
  - `PAID → PREPARING`, `PREPARING → READY`, `READY → COMPLETED`.
  - `PENDING`, `PAYMENT_FAILED`, `PAID → CANCELLED`.
  - Mọi trường hợp khác (lùi, bỏ bước, đi tiếp từ `COMPLETED`/`CANCELLED`) bị từ chối.
- Response `200`: Order object kèm `customer` (như mục 5.5).
- Lỗi:
  - `400` (validate), `401`, `403`.
  - `404` `"Không tìm thấy đơn hàng"`.
  - `409` `"Không thể chuyển đơn từ trạng thái 'Đã thanh toán' sang 'Hoàn thành'"` (ví dụ, dùng nhãn tiếng Việt ở mục 9.3).
- **Chống ghi đè khi hai người cùng thao tác** (ví dụ khách hủy đúng lúc nhân viên bấm "Đang pha chế"): cập nhật phải có điều kiện `status` còn đúng như lúc đọc. Nếu không còn đúng thì trả `409` `"Trạng thái đơn đã thay đổi, vui lòng tải lại"`. Cách này áp dụng cho cả mục 5.6.
- FE nhân viên: một nút "Chuyển sang bước tiếp theo" (đi theo thứ tự), và nút "Hủy đơn" có hộp xác nhận.

### 5.8 Máy trạng thái đơn hàng (`OrderStatus`)

| Từ | Sang | Ai/cái gì gây ra | API |
|---|---|---|---|
| `PENDING` | `PAID` | Thanh toán thành công | `POST /payments` |
| `PENDING` | `PAYMENT_FAILED` | Thanh toán bị từ chối | `POST /payments` |
| `PAYMENT_FAILED` | `PAID` hoặc giữ `PAYMENT_FAILED` | Khách thử lại (Idempotency-Key mới) | `POST /payments` |
| `PAID` | `PREPARING` | Nhân viên | `PATCH /orders/:id/status` |
| `PREPARING` | `READY` | Nhân viên | `PATCH /orders/:id/status` |
| `READY` | `COMPLETED` | Nhân viên | `PATCH /orders/:id/status` |
| `PENDING`, `PAYMENT_FAILED`, `PAID` | `CANCELLED` | Khách hoặc nhân viên | `POST /orders/:id/cancel` hoặc `PATCH /orders/:id/status` |

- `COMPLETED` và `CANCELLED` là trạng thái kết thúc, không bao giờ đổi sang trạng thái khác.
- Không có API lùi trạng thái, không có timer tự chuyển. `PREPARING` và `READY` **không** hủy được.
- `PaymentStatus`: `PENDING` (dự phòng cổng thật), `SUCCESS`, `FAILED`. Bản mô phỏng luôn trả ngay `SUCCESS` hoặc `FAILED`.

---

## 6. THANH TOÁN **[ĐÃ LÀM, BE giữ nguyên, FE đổi cách gọi]**

### 6.1 `POST /payments`
- **Quyền:** khách đã đăng nhập. Header bắt buộc: `Authorization`, `Idempotency-Key` (8 đến 100 ký tự).
- Body: `orderId` (UUID), `method` (`WALLET` hoặc `CARD`), `accountNumber` (chỉ chữ số, 8 đến 19 ký tự).
- **Cổng mô phỏng:** `accountNumber` kết thúc bằng `"0000"` thì `FAILED`, các số khác thì `SUCCESS`. Chỉ lưu 4 số cuối (`accountLast4`), không lưu và không ghi log toàn bộ số. Cả hai kết quả đều trả `201`.
- **Idempotency và thứ tự kiểm tra phía Server:**
  1. Kiểm tra header và body.
  2. Tìm `Idempotency-Key` của người dùng này: đã có và cùng `orderId` thì trả lại ngay kết quả cũ với `200` (không thanh toán lại); đã có nhưng khác `orderId` thì `409`.
  3. Kiểm tra đơn thuộc người dùng và đang `PENDING` hoặc `PAYMENT_FAILED`; không thì `409`.
  4. Gọi cổng mô phỏng, cập nhật đơn: `SUCCESS` thì `PAID`, `FAILED` thì `PAYMENT_FAILED`.
- Mỗi đơn có tối đa một thanh toán `SUCCESS` (hai request đồng thời thì một cái thắng, cái kia `409`).
- Response `201` thành công: `{ id, orderId, method, accountLast4, amount, status: "SUCCESS", createdAt, order: { id, orderNumber, status: "PAID" } }`. Thất bại: `status: "FAILED"`, thêm `failureReason`, `order.status = "PAYMENT_FAILED"`.
- Lỗi: `400`, `401`, `404`, `409` (xem bản 1).

### 6.2 Cách FE dùng cho luồng QR giả (không sửa BE)
- FE luôn gửi `method = "WALLET"`. Việc khách chọn ZaloPay/Momo chỉ để hiển thị, **không gửi lên BE**.
- Hai hằng số trong FE (không hiển thị cho người dùng):
  - Số thành công: `0900000001`.
  - Số thất bại: `0900000000` (kết thúc bằng `0000`).
- Luồng:
  1. Khách chọn ví, bấm xác nhận: FE đã tạo đơn bằng `POST /orders`, rồi hiện màn QR (tạo từ mã đơn) và bắt đầu đếm ngược **5 giây**.
  2. Hết 5 giây không bấm gì: FE gọi `POST /payments` với số thành công. Thành công thì xóa giỏ hàng, hiện màn xác nhận (mã đơn, trạng thái).
  3. Khách bấm thoát khỏi QR: FE gọi `POST /payments` với số thất bại. Đơn thành `PAYMENT_FAILED`, **giữ nguyên giỏ hàng**, hiện nút thử lại.
- **Mỗi lần thanh toán mới dùng một `Idempotency-Key` mới** (kể cả thử lại sau thất bại). Chỉ dùng lại cùng key khi gửi lại đúng request vừa gửi (ví dụ mất mạng).
- Thử lại luôn dùng **đúng `orderId` đang chờ**, không tạo đơn mới.
- **Nút "Thanh toán"** có ở danh sách lịch sử và trang chi tiết đơn cho đơn `PENDING` (đã làm) và **đơn `PAYMENT_FAILED` (cần thêm)**, dẫn về màn QR của đúng đơn đó.
- `CARD` vẫn nằm trong enum của BE nhưng FE không còn dùng.

---

## 7. QUẢN LÝ NHÂN VIÊN **[MỚI]**

### 7.1 `GET /staff`
- **Quyền:** ADMIN. Trả danh sách tài khoản có `role = "STAFF"` (không gồm ADMIN và khách), sắp xếp theo `displayName`.
- Response `200`: mảng `{ id, email, displayName, role, isActive, createdAt }`.
- Lỗi: `401`, `403`.

### 7.2 `PATCH /staff/:id/status`
- **Quyền:** ADMIN. Khóa hoặc mở khóa một nhân viên.
- Body: `{ "isActive": false }` (bắt buộc, đúng/sai).
- Chỉ áp dụng cho tài khoản `STAFF`. Tài khoản ADMIN, khách hoặc id không tồn tại: `404` `"Không tìm thấy nhân viên"`. Nhờ vậy ADMIN không thể khóa ADMIN, kể cả chính mình.
- Response `200`: `{ id, email, displayName, role, isActive, createdAt }`.
- Hiệu lực ngay: mọi API của nhân viên trả `403` `"Tài khoản đã bị khóa"` và đăng nhập bị từ chối (mục 1.6, 4.2).
- Lỗi: `400`, `401`, `403`, `404`.

---

## 8. DATABASE VÀ SEED

### 8.1 Thay đổi schema (chỉ một thay đổi, một migration)
- Thêm vào model `User`: `isActive Boolean @default(true)`. Gợi ý tên migration: `add_user_is_active`.
- **Không đổi gì khác.** Giữ cột `stock` (ý nghĩa mới: 0 là tạm hết, lớn hơn 0 là đang bán). Không tạo bảng `Size`, `Promotion`, `LoyaltyTransaction`. `Category` vẫn là enum cố định.
- Migration chạy tự động lúc deploy như hiện tại.

### 8.2 Quy tắc seed
- Mọi dữ liệu seed là `upsert` theo ID cố định, chạy lại nhiều lần không nhân đôi.
- **Món (Product): khi đã tồn tại thì không ghi đè** (đổi `update: product` thành `update: {}`). Seed chỉ thêm món còn thiếu, để dữ liệu ADMIN sửa và nhân viên gạt không bị mất sau mỗi lần deploy. Dữ liệu `stock = 0` của Bạc xỉu và Trà sữa matcha giữ nguyên (tạm hết).
- Topping: giữ như hiện tại.
- Tài khoản: khi đã tồn tại thì chỉ cập nhật `displayName`, `role`, `passwordHash`. **Không đụng `isActive`**, để nhân viên đã bị khóa không bị mở lại sau mỗi lần deploy.
- Seed tự chạy **mỗi lần deploy cùng migration** (cả `docker-compose` ở local và production).

### 8.3 Tài khoản demo (ID cố định)

| Vai trò | ID | Email | Tên hiển thị |
|---|---|---|---|
| CUSTOMER | `44444444-0000-0000-0000-000000000001` | `khach@example.com` | Khách demo |
| STAFF | `55555555-0000-0000-0000-000000000001` | `nhanvien1@example.com` | Nhân viên 1 |
| STAFF | `55555555-0000-0000-0000-000000000002` | `nhanvien2@example.com` | Nhân viên 2 |
| STAFF | `55555555-0000-0000-0000-000000000003` | `nhanvien3@example.com` | Nhân viên 3 |
| ADMIN | `66666666-0000-0000-0000-000000000001` | `quanly@example.com` | Quản lý |

- Mật khẩu của cả 5 tài khoản lấy từ **một biến môi trường `DEMO_USER_PASSWORD`** (tối thiểu 6 ký tự). Nếu biến thiếu hoặc quá ngắn thì seed bỏ qua việc tạo tài khoản. Đặt biến này trong `.env` (local, có mẫu trong `.env.example`) và trong Render (production). **Không ghi mật khẩu vào repository.** Danh sách email và mật khẩu demo ghi riêng trong báo cáo nộp.

### 8.4 Dữ liệu production
- Local và production là hai database riêng, không đồng bộ.
- Xem dữ liệu production chủ yếu qua giao diện `/staff`. Chỉ khi cần xem bảng hoặc sửa tay thì kết nối DBeaver bằng External URL của Render, xong thì đóng. Database không mở công khai thường trực.
- Trước lần deploy cuối: dọn sạch đơn và tài khoản thử, giữ dữ liệu seed.

---

## 9. QUY ƯỚC GIAO DIỆN

### 9.1 Các đường dẫn mới
| Đường dẫn | Ai vào được | Nội dung |
|---|---|---|
| `/staff` | STAFF, ADMIN | Bảng đơn: mã đơn, tên khách, tổng tiền, trạng thái, giờ đặt, ô lọc trạng thái, bấm vào xem chi tiết món, nút chuyển bước và hủy |
| `/staff/products` | STAFF, ADMIN | Danh sách món kèm công tắc đang bán/tạm hết. ADMIN thấy thêm nút Thêm món, Sửa, Ẩn/Hiện |
| `/staff/employees` | Chỉ ADMIN | Bảng nhân viên: tên, email, vai trò, ngày tạo, trạng thái (Hoạt động / Đã khóa), nút Khóa/Mở khóa |
| `/account` | Mọi vai trò đã đăng nhập | Chỉ xem: tên hiển thị, email, vai trò, nút Đăng xuất. Khách có thêm liên kết "Lịch sử đơn". Ưu tiên thấp, thiếu giờ thì thay bằng menu thả xuống |

- Thanh điều hướng khu `/staff`: Đơn hàng, Món, Nhân viên (mục này chỉ ADMIN thấy).
- Khu `/staff` chỉ tối ưu cho máy tính. Khu khách vẫn responsive.
- Form thêm/sửa món: tên, danh mục (chọn trong 4 loại), giá gốc, link ảnh (có ô xem trước; bỏ trống thì dùng ảnh mặc định). ID không hiện, không nhập.

### 9.2 Quy tắc chuyển hướng
- Đăng nhập xong: CUSTOMER về menu (hoặc trang đang dở), STAFF/ADMIN về `/staff`.
- STAFF/ADMIN mở trang khách (giỏ hàng, đặt đơn...) thì FE chuyển về `/staff`.
- Khách gõ `/staff...` thì FE chuyển về trang chủ. Nhân viên (không phải ADMIN) gõ `/staff/employees` thì chuyển về `/staff`.
- FE nhận `401` thì về trang đăng nhập. Nhận `403` `"Tài khoản đã bị khóa"` thì hiện thông báo và tự đăng xuất.
- Đây chỉ là lớp giao diện cho gọn. Quyền thật do BE kiểm tra.

### 9.3 Bảng nhãn tiếng Việt (FE chuyển mã kỹ thuật thành nhãn)

| Nhóm | Mã | Nhãn |
|---|---|---|
| Size | `S` / `M` / `L` | Size S / Size M (+6.000đ) / Size L (+10.000đ) |
| Đường | `P0` / `P30` / `P50` / `P70` / `P100` | 0% / 30% / 50% / 70% / 100% |
| Đá | `NONE` / `LOW` / `NORMAL` / `FULL` | Không đá / Ít đá / Đá vừa / Nhiều đá |
| Hình thức nhận | `AT_COUNTER` / `TAKE_AWAY` | Tại quầy / Mang đi |
| Trạng thái đơn | `PENDING` | Chờ thanh toán |
| | `PAID` | Đã thanh toán |
| | `PREPARING` | Đang pha chế |
| | `READY` | Sẵn sàng nhận |
| | `COMPLETED` | Hoàn thành |
| | `PAYMENT_FAILED` | Thanh toán lỗi |
| | `CANCELLED` | Đã hủy |
| Thanh toán | `WALLET` | Ví điện tử (ZaloPay/Momo) |
| Danh mục | `TEA` / `COFFEE` / `MILK_TEA` / `CAKE` | Trà / Cà phê / Trà sữa / Bánh |
| Vai trò | `CUSTOMER` / `STAFF` / `ADMIN` | Khách hàng / Nhân viên / Quản lý |
| Tài khoản nhân viên | `isActive` đúng / sai | Hoạt động / Đã khóa |
| Món | `stock > 0` / `stock = 0` | Đang bán / Tạm hết (nhãn "Hết hàng" ở góc ảnh, nút "Tạm hết") |

### 9.4 Thông báo (toast)
- **Chỉ là gợi ý, FE tự quyết:** nếu popup hiện tại vẫn mất khi cuộn trang, đặt cố định ở góc trên bên phải (ví dụ thư viện `sonner`). Có thể thông báo cho các sự kiện: tạo tài khoản, đăng nhập, thêm vào giỏ, thanh toán thành công/thất bại, hủy đơn, đổi trạng thái, gạt đang bán/tạm hết, lưu món, ẩn/hiện món, khóa/mở khóa nhân viên, và lỗi từ máy chủ (hết phiên, bị khóa, không đủ quyền).

---

## 10. CÁC TÍNH NĂNG KHÔNG LÀM (OUT-OF-SCOPE)

1. **Voucher / Khuyến mãi** và **tích điểm thành viên**. Hai class `Promotion` và `LoyaltyTransaction` vẫn nằm trong class diagram (đề bắt buộc), chỉ ghi chú "Phạm vi mở rộng, chưa hiện thực trong code".
2. **Tự hủy đơn sau 15 phút** (đơn chỉ hủy khi khách hoặc nhân viên bấm).
3. **Hoàn tiền thật** và trạng thái `REFUNDED`. Không ghi **lý do hủy**.
4. **Lùi trạng thái đơn**, chỉnh tay `PENDING/PAID`, timer tự chuyển trạng thái, hủy đơn từ `PREPARING`/`READY`.
5. **Xóa hẳn món**, tạo **danh mục mới**, **tải ảnh lên** (chỉ nhập link).
6. **Tạo/sửa/xóa nhân viên** qua giao diện, **xếp ca**, sửa hồ sơ hoặc đổi mật khẩu.
7. Endpoint `GET /auth/me`. Phân trang (Pagination). Bảng `Size` trong database.
8. Cơ chế **polling** tự động. Trang theo dõi đơn chỉ tải khi mở trang hoặc bấm "Tải lại".
9. **PWA**. Giao diện ưu tiên **Desktop-first, vẫn responsive cho di động**.
10. Bắt buộc đăng nhập để xem menu: **không**. Khách vãng lai xem menu bình thường, chỉ bắt buộc đăng nhập khi đặt đơn.

---

## 11. GIỚI HẠN ĐÃ BIẾT (KNOWN LIMITATIONS)

1. **Hết nguyên liệu khi đơn đã `PREPARING`:** không hủy được (chỉ hủy từ `PENDING`, `PAYMENT_FAILED`, `PAID`). Nhân viên cần phát hiện và hủy trước khi bấm "Đang pha chế". Hướng mở rộng: cho hủy từ `PREPARING`.
2. **Món bị gạt tạm hết sau khi đã vào giỏ:** khách vẫn bấm đặt được, BE trả `409` lúc đặt.
3. **Đặt trùng đơn khi thanh toán lỗi:** giỏ hàng chỉ xóa khi thanh toán thành công, nên khách quay lại giỏ và đặt lần nữa sẽ tạo một đơn mới. Cách đúng là dùng nút "Thanh toán" trên đơn cũ.
4. **Hủy đơn đã `PAID`:** bản ghi thanh toán vẫn là `SUCCESS`, việc hoàn tiền chỉ là dòng thông báo mô phỏng.
5. **Đơn bỏ dở** (`PENDING`, `PAYMENT_FAILED`) vẫn nằm trong lịch sử, khách có thể thanh toán lại hoặc hủy. Vì đã bỏ trừ kho nên đơn bỏ dở không còn giữ hàng.
6. `orderNumber` tăng dần liên tục, không đặt lại về 1001 khi dọn dữ liệu test.

---

## 12. CHỖ CẦN SỬA TRONG DOCS (thay thế danh sách 19 chỗ của bản 1)

*(Mỗi mục một việc. Tên file theo repository hiện tại. Mọi thay đổi đi qua pull request và ghi rõ lý do. Số FR/NFR theo SRS hiện tại, FR-01 đến FR-10.)*

**`docs/requirements/context-and-scope.md`**
1. Mục Out-of-scope: thêm voucher, tích điểm, tự hủy 15 phút, hoàn tiền thật, tạo danh mục mới, tải ảnh, tạo/sửa/xóa nhân viên, xếp ca (theo mục 10). Quản lý món và đổi trạng thái đơn **không còn** out-of-scope.
2. Mục ràng buộc giao diện: "Mobile-first / PWA" thành "Desktop-first, vẫn responsive cho di động". Sau khi thay, đọc lại từng câu có "mobile" hoặc "PWA".

**`docs/requirements/srs-task-1.2.md`**
3. FR-01: nhãn "Hết hàng" ứng với trạng thái tạm hết (`stock = 0`), khách không thấy số lượng.
4. FR-05: thanh toán chỉ bằng ví điện tử (ZaloPay/Momo) qua QR mô phỏng, bỏ "1 trong 2 hình thức". Thất bại thì đơn `PAYMENT_FAILED`, giữ giỏ, thử lại không giới hạn. Sửa chính tả `PAIMENT_FAILED` thành `PAYMENT_FAILED` nếu còn.
5. FR-06 và FR-07: bổ sung hủy đơn (khách hủy được đơn của mình ở `PENDING`/`PAYMENT_FAILED`/`PAID`; nhân viên hủy cùng 3 trạng thái). Bỏ nội dung hoàn kho và tự hủy.
6. FR-07: nhân viên đi tiến `PAID → PREPARING → READY → COMPLETED`, không lùi.
7. FR-08: ADMIN thêm/sửa/ẩn món; STAFF gạt đang bán/tạm hết. Bỏ nội dung tồn kho đếm ly.
8. FR-09 giữ Won't. FR-10 giữ Must, ghi rõ chỉ xem danh sách và khóa/mở khóa STAFF.
9. Giao diện: thêm hoặc sửa NFR giao diện thành "Desktop-first, responsive cho di động" (nếu SRS chưa có NFR-03 thì thêm mới).

**`docs/requirements/use-case-đặc-tả-task 1.3.md`**
10. Bước 6 và 8: màn QR giả tự thành công sau 5 giây. E1: thất bại khi khách thoát khỏi QR, quay lại bước chọn ví.
11. Hậu điều kiện khi thất bại: đơn ở `PAYMENT_FAILED` (có thể thanh toán lại từ lịch sử), giỏ giữ nguyên. Bỏ câu "Không tạo được đơn" nếu mâu thuẫn với code.

**`docs/diagrams`** (sau khi sửa file `.puml` nhớ **xuất lại ảnh `.svg`** để khớp)
12. Activity diagram: bỏ nhánh voucher, tự hủy 15 phút, cộng điểm; thêm nhánh QR (thành công/thoát), món tạm hết (chặn thêm vào giỏ), hủy đơn, nhân viên đổi trạng thái.
13. Sequence diagram checkout: bỏ bước trừ kho. Transaction vẫn có: tạo `Order` + `OrderItem` cùng lúc kèm kiểm tra món đang bán. Giữ nhánh alt thanh toán thành công/thất bại và idempotency; Payment Service là cổng mô phỏng.
14. Class diagram: `basePrice`, `unitPrice`, `lineTotal`, `totalAmount` kiểu `Int`; `Order` bỏ `subtotal`, `discountAmount`, `expiresAt`; `User` bỏ `loyaltyPoints`, `fullName` đổi thành `displayName`, thêm `isActive`; `Product.stock` ghi chú "0 là tạm hết, lớn hơn 0 là đang bán".
15. Class diagram: giữ `Promotion` và `LoyaltyTransaction`, thêm ghi chú "Phạm vi mở rộng, chưa hiện thực trong code". Enum `OrderStatus` ghi chú `CANCELLED` chỉ đến được từ `PENDING`/`PAYMENT_FAILED`/`PAID`.

**`docs/architecture`**
16. `architecture.md`: bỏ tiền tố `/api`; ghi khu `/staff` và 3 vai trò; JWT 24 giờ; guard kiểm tra `isActive` mỗi request; trang theo dõi không polling; khuyến mãi, điểm thưởng là phạm vi mở rộng.
17. ADR-003 và ADR-005: bỏ trừ kho, ghi lý do bỏ tồn kho đếm ly. Viết thêm ADR về "đang bán / tạm hết" (`stock` 0 hoặc 999) và ADR `008-uu-tien-giao-dien-web.md` (desktop-first, không PWA).
18. Sau khi deploy xong: sửa deployment diagram, `docs/deployment.md`, ADR về nền tảng cho đúng thực tế (Render, GHCR, cách deploy).
19. `docs/traceability-matrix.md`: cập nhật mã FR theo SRS mới, thêm các endpoint mới (mục 2) và test tương ứng.

---

## 13. PHỐI HỢP FE/BE VÀ GIÁ TRỊ MẶC ĐỊNH

- **FE không phải chờ BE:** FE dựng giao diện bằng dữ liệu giả theo đúng hợp đồng này, sau đó cả nhóm ráp FE với BE thật, chạy tay cả luồng và ghi lại lỗi.
- **Giá trị mặc định của món nước** (để FE thử API đặt đơn sớm, không sợ lỗi validate): nếu FE chưa gửi `size`, `sugarLevel`, `iceLevel` thì BE gán `S`, `P100`, `NORMAL`. Nếu chưa gửi `receiveType` và `note` thì BE dùng `AT_COUNTER` và `null`.
- **Chủ sở hữu file** (ghi chi tiết trong AGENTS): BE sửa `apps/api` và schema/migration; FE sửa `apps/web` ngoài khu `/staff` (trừ khi người làm BE nhận làm khu `/staff` trong thư mục riêng); Dev&Ops sửa `docs/`, `.github/`, Docker, README. File dùng chung của FE (layout, điều hướng, bảng nhãn, hàm gọi API, kiểu dữ liệu) chỉ FE sửa.
- **Mỗi lần BE đổi hợp đồng** (thêm trường, đổi mã lỗi) phải sửa file này trước, rồi mới báo FE.
