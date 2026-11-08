# HỢP ĐỒNG API (API CONTRACT) – HỆ THỐNG BREWLITE

> **Mục đích tài liệu:** Hợp đồng giao tiếp kỹ thuật duy nhất giữa Giao diện (Frontend - Next.js) và Máy chủ (Backend - NestJS). Tài liệu mô tả chính xác 9 endpoint, quy chuẩn dữ liệu, máy trạng thái và các kịch bản ngoại lệ để hai bên phát triển song song độc lập.

---

## BẢNG MỨC ƯU TIÊN VÀ PHÂN CHIA SPRINT

| STT | Phương thức & Endpoint | Mục đích | Phân kỳ | Phía cần làm trước |
|---|---|---|---|---|
| 1 | `GET /health` | Kiểm tra máy chủ hoạt động | **Sprint 1** | Backend đã có sẵn |
| 2 | `GET /products` | Lấy danh sách menu, tìm kiếm, lọc danh mục | **Sprint 1** | Backend viết API, Frontend dựng trang Menu |
| 3 | `GET /products/:id` | Xem chi tiết món, size, đường, đá, topping | **Sprint 1** | Backend viết API, Frontend dựng Modal/Trang chi tiết |
| 4 | `POST /auth/register` | Đăng ký tài khoản khách hàng mới | **Sprint 2** | Backend viết trước, Frontend làm form đăng ký |
| 5 | `POST /auth/login` | Đăng nhập hệ thống, lấy JWT accessToken | **Sprint 2** | Backend viết trước, Frontend lưu token vào cookie/storage |
| 6 | `POST /orders` | Đặt đơn hàng từ giỏ, trừ tồn kho (Transaction) | **Sprint 2** | Frontend chuẩn bị giỏ hàng, Backend viết API giao dịch |
| 7 | `POST /payments` | Thanh toán mô phỏng kèm `Idempotency-Key` | **Sprint 2** | Backend viết cổng mô phỏng, Frontend làm trang thanh toán |
| 8 | `GET /orders/me` | Lấy danh sách lịch sử đơn hàng của tôi | **Sprint 2** | Backend viết API, Frontend dựng trang Lịch sử đơn |
| 9 | `GET /orders/:id` | Xem chi tiết đơn và lịch sử thanh toán | **Sprint 2** | Backend viết API, Frontend dựng trang Theo dõi đơn |

---

## 1. QUY ƯỚC CHUNG

1. **Đường dẫn & Cổng dịch vụ:**
   - Backend API chạy ở cổng `3001` (`http://localhost:3001`), không dùng tiền tố đường dẫn (dùng trực tiếp `/products`, `/orders`...).
   - Bật CORS cho phép nguồn từ biến môi trường `CORS_ORIGIN` (mặc định: `http://localhost:3000`).
   - Phía Frontend Next.js đọc biến `NEXT_PUBLIC_API_URL` (giá trị mặc định `http://localhost:3001`). Biến này bắt buộc phải được đặt tại thời điểm build ứng dụng Web.

2. **Quy chuẩn dữ liệu:**
   - Mã định danh (`id`): Chuỗi UUID hợp lệ (ví dụ: `11111111-0000-0000-0000-000000000001`).
   - Tiền tệ: Số nguyên dương VND (`Int`), không có phần thập phân (ví dụ: `29000` = 29.000 VNĐ).
   - Thời gian: Chuỗi ISO 8601 UTC (ví dụ: `2026-11-05T03:00:00.000Z`).
   - Ngôn ngữ: Tên trường JSON, tham số query, bảng database, enum dùng tiếng Anh. Nhãn hiển thị trên web dùng tiếng Việt (xem mục 7).

3. **Xác thực & Bảo mật:**
   - Xác thực qua HTTP Header: `Authorization: Bearer <accessToken>`.
   - Token JWT hết hạn sau **24 giờ**.
   - Mật khẩu băm bằng bcrypt, không bao giờ xuất hiện trong response hay log.
   - Server độc quyền tính giá, **tuyệt đối không nhận giá từ client**.

4. **Định dạng lỗi thống nhất (Chuẩn NestJS):**
   ```json
   {
     "statusCode": 400,
     "message": ["quantity must not be less than 1"],
     "error": "Bad Request"
   }
   ```
   - Khi dữ liệu đầu vào không hợp lệ (validate fail), `message` là một mảng chuỗi tiếng Anh mô tả chi tiết từng lỗi.
   - Khi phát sinh lỗi nghiệp vụ (hết hàng, sai mật khẩu, xung đột), `message` là một chuỗi tiếng Việt rõ ràng cho người dùng.
   - Ngoại lệ duy nhất mở rộng: Lỗi hết hàng của `POST /orders` trả về thêm trường `details` chứa danh sách món bị thiếu (xem mục 2.6).

---

## 2. DANH SÁCH 9 ENDPOINTS CHI TIẾT

### (1) `GET /health` (Sprint 1)
- **Mục đích:** Kiểm tra trạng thái hoạt động của máy chủ (phục vụ Docker và kiểm thử).
- **Đăng nhập:** Không cần.
- **Request:** `GET /health` (không tham số).
- **Response thành công (200 OK):**
  ```json
  {
    "status": "ok"
  }
  ```
- **Mã lỗi:** Không có.
- **Truy vết:** NFR-04 (Health check).

---

### (2) `GET /products` (Sprint 1)
- **Mục đích:** Lấy danh sách sản phẩm hiển thị trên trang chủ Menu. Chỉ trả về món có `isVisible = true`. Món có `stock = 0` vẫn trả về để web hiển thị nhãn "Hết hàng". Không phân trang. Sắp xếp mặc định theo `category` rồi đến `name`.
- **Đăng nhập:** Không cần.
- **Request:**
  - Method: `GET`
  - URL: `/products`
  - Query Parameters (Tùy chọn, có thể kết hợp cả hai):
    | Tham số | Kiểu | Mô tả |
    |---|---|---|
    | `category` | String | Lọc danh mục: `TEA`, `COFFEE`, `MILK_TEA`, `CAKE` |
    | `q` | String | Tìm kiếm tên món (chứa chuỗi con, không phân biệt hoa/thường, hỗ trợ tiếng Việt có dấu) |
- **Response thành công (200 OK):**
  ```json
  [
    {
      "id": "11111111-0000-0000-0000-000000000001",
      "name": "Cà phê sữa đá",
      "category": "COFFEE",
      "basePrice": 29000,
      "imageUrl": "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500",
      "stock": 50
    },
    {
      "id": "11111111-0000-0000-0000-000000000003",
      "name": "Bạc xỉu",
      "category": "COFFEE",
      "basePrice": 32000,
      "imageUrl": "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=500",
      "stock": 0
    },
    {
      "id": "11111111-0000-0000-0000-000000000004",
      "name": "Trà đào cam sả",
      "category": "TEA",
      "basePrice": 39000,
      "imageUrl": "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500",
      "stock": 35
    }
  ]
  ```
- **Mã lỗi:**
  - `400 Bad Request`: `category` truyền sai giá trị danh mục cho phép.
    ```json
    {
      "statusCode": 400,
      "message": "Danh mục không hợp lệ. Cho phép: TEA, COFFEE, MILK_TEA, CAKE",
      "error": "Bad Request"
    }
    ```
- **Truy vết:** FR-01 (Hiển thị Menu & Nhãn hết hàng), NFR-01 (Hiệu năng < 500ms).

---

### (3) `GET /products/:id` (Sprint 1)
- **Mục đích:** Xem chi tiết một món kèm các tùy chọn size, lượng đường, lượng đá và danh sách topping có thể chọn.
- **Đăng nhập:** Không cần.
- **Request:**
  - Method: `GET`
  - URL: `/products/:id` (ví dụ: `/products/11111111-0000-0000-0000-000000000001`)
- **Quy tắc tùy chọn:**
  - `sizes`: Danh sách hằng số trong code gồm Size S (+0đ), Size M (+6.000đ), Size L (+10.000đ). Không có bảng Size trong database.
  - `sugarLevels`: Các mức `P0` (0%), `P30` (30%), `P50` (50%), `P70` (70%), `P100` (100%).
  - `iceLevels`: Các mức `NONE` (Không đá), `LOW` (Ít đá), `NORMAL` (Đá vừa), `FULL` (Nhiều đá).
  - `toppings`: Danh sách topping từ database. Ở Sprint 1 trả về `[]`; từ Sprint 2 trả về 4 topping: Trân châu đen (+5.000đ), Thạch dừa (+5.000đ), Pudding (+7.000đ), Kem cheese (+10.000đ).
  - Đối với món bánh (`CAKE`): `sizes`, `sugarLevels`, `iceLevels`, `toppings` đều là mảng rỗng `[]`.
- **Response thành công - Món nước (200 OK):**
  ```json
  {
    "id": "11111111-0000-0000-0000-000000000001",
    "name": "Cà phê sữa đá",
    "category": "COFFEE",
    "basePrice": 29000,
    "imageUrl": "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500",
    "stock": 50,
    "sizes": [
      { "value": "S", "label": "Size S", "extraPrice": 0 },
      { "value": "M", "label": "Size M", "extraPrice": 6000 },
      { "value": "L", "label": "Size L", "extraPrice": 10000 }
    ],
    "sugarLevels": [
      { "value": "P0", "label": "0%" },
      { "value": "P30", "label": "30%" },
      { "value": "P50", "label": "50%" },
      { "value": "P70", "label": "70%" },
      { "value": "P100", "label": "100%" }
    ],
    "iceLevels": [
      { "value": "NONE", "label": "Không đá" },
      { "value": "LOW", "label": "Ít đá" },
      { "value": "NORMAL", "label": "Đá vừa" },
      { "value": "FULL", "label": "Nhiều đá" }
    ],
    "toppings": [
      { "id": "22222222-0000-0000-0000-000000000001", "name": "Trân châu đen", "price": 5000 },
      { "id": "22222222-0000-0000-0000-000000000002", "name": "Thạch dừa", "price": 5000 },
      { "id": "22222222-0000-0000-0000-000000000003", "name": "Pudding", "price": 7000 },
      { "id": "22222222-0000-0000-0000-000000000004", "name": "Kem cheese", "price": 10000 }
    ]
  }
  ```
- **Response thành công - Món bánh (`CAKE`) (200 OK):**
  ```json
  {
    "id": "11111111-0000-0000-0000-000000000010",
    "name": "Bánh Croissant",
    "category": "CAKE",
    "basePrice": 30000,
    "imageUrl": "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500",
    "stock": 20,
    "sizes": [],
    "sugarLevels": [],
    "iceLevels": [],
    "toppings": []
  }
  ```
- **Mã lỗi:**
  - `404 Not Found`: Không tìm thấy món hoặc món đang bị ẩn (`isVisible = false`).
    ```json
    {
      "statusCode": 404,
      "message": "Không tìm thấy sản phẩm",
      "error": "Not Found"
    }
    ```
- **Truy vết:** FR-02 (Tùy chọn thuộc tính món).

---

### (4) `POST /auth/register` (Sprint 2)
- **Mục đích:** Khách hàng đăng ký tài khoản mới. Email tự động chuyển về chữ thường. Vai trò mặc định luôn là `CUSTOMER`.
- **Đăng nhập:** Không cần.
- **Request Body:**
  | Trường | Kiểu | Bắt buộc | Ràng buộc | Mô tả |
  |---|---|---|---|---|
  | `email` | String | Có | Định dạng email hợp lệ | Email đăng nhập (chuyển chữ thường) |
  | `password` | String | Có | Tối thiểu 6 ký tự | Mật khẩu tài khoản (sẽ hash bcrypt) |
  | `displayName` | String | Có | 1 đến 50 ký tự | Tên hiển thị của người dùng |
  - Ví dụ Body:
    ```json
    {
      "email": "nguyenan@gmail.com",
      "password": "Password123@",
      "displayName": "Nguyễn Văn An"
    }
    ```
- **Response thành công (201 Created):**
  ```json
  {
    "id": "99999999-0000-0000-0000-000000000001",
    "email": "nguyenan@gmail.com",
    "displayName": "Nguyễn Văn An",
    "role": "CUSTOMER"
  }
  ```
- **Mã lỗi:**
  - `400 Bad Request`: Thiếu trường hoặc mật khẩu < 6 ký tự.
  - `409 Conflict`: Email đã tồn tại trong hệ thống.
    ```json
    {
      "statusCode": 409,
      "message": "Email này đã được sử dụng",
      "error": "Conflict"
    }
    ```
- **Truy vết:** FR-04 (Đăng ký tài khoản), NFR-02 (Bảo mật bcrypt).

---

### (5) `POST /auth/login` (Sprint 2)
- **Mục đích:** Xác thực người dùng, trả về mã JWT `accessToken` dùng trong 24 giờ.
- **Đăng nhập:** Không cần.
- **Request Body:**
  | Trường | Kiểu | Bắt buộc | Mô tả |
  |---|---|---|---|
  | `email` | String | Có | Email tài khoản |
  | `password` | String | Có | Mật khẩu |
  - Ví dụ Body:
    ```json
    {
      "email": "nguyenan@gmail.com",
      "password": "Password123@"
    }
    ```
- **Response thành công (200 OK):**
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5OTk5OTk5OS0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDEiLCJlbWFpbCI6Im5ndXllbmFuQGdtYWlsLmNvbSIsInJvbGUiOiJDVVNUT01FUiIsImlhdCI6MTczMDg0MDAwMCwiZXhwIjoxNzMwOTI2NDAwfQ...",
    "user": {
      "id": "99999999-0000-0000-0000-000000000001",
      "email": "nguyenan@gmail.com",
      "displayName": "Nguyễn Văn An",
      "role": "CUSTOMER"
    }
  }
  ```
- **Mã lỗi:**
  - `401 Unauthorized`: Sai email hoặc sai mật khẩu (thông báo chung, không tiết lộ trường nào sai).
    ```json
    {
      "statusCode": 401,
      "message": "Email hoặc mật khẩu không chính xác",
      "error": "Unauthorized"
    }
    ```
- **Truy vết:** FR-04 (JWT & Phân quyền).

---

### (6) `POST /orders` (Sprint 2)
- **Mục đích:** Khởi tạo đơn hàng từ giỏ hàng. Server tính tiền, kiểm tra tồn kho cộng gộp theo món và trừ kho trực tiếp trong Transaction an toàn.
- **Đăng nhập:** **Bắt buộc** (`CUSTOMER`).
- **Request Body:**
  | Trường | Kiểu | Bắt buộc | Ràng buộc & Mặc định | Mô tả |
  |---|---|---|---|---|
  | `receiveType` | String | Không | `AT_COUNTER` hoặc `TAKE_AWAY`. Mặc định: `AT_COUNTER` | Nhận tại quầy hoặc mang đi |
  | `note` | String | Không | Tối đa 200 ký tự | Ghi chú chung cho đơn |
  | `items` | Array | **Có** | Từ 1 đến 20 dòng món | Danh sách các món đặt |
  | `items[].productId` | String | **Có** | UUID hợp lệ | Mã món |
  | `items[].quantity` | Int | **Có** | Từ 1 đến 10 | Số lượng |
  | `items[].size` | String | Không | Món nước: `S`, `M`, `L` (mặc định `S`). Món bánh: không gửi | Kích cỡ |
  | `items[].sugarLevel` | String | Không | Món nước: `P0`..`P100` (mặc định `P100`). Món bánh: không gửi | Mức đường |
  | `items[].iceLevel` | String | Không | Món nước: `NONE`..`FULL` (mặc định `NORMAL`). Món bánh: không gửi | Mức đá |
  | `items[].toppingIds` | Array[UUID] | Không | Tối đa 3 topping, không trùng nhau. Món bánh: không gửi | Danh sách topping |
  | `items[].note` | String | Không | Tối đa 200 ký tự | Ghi chú riêng cho món |
  - Ví dụ Body:
    ```json
    {
      "receiveType": "TAKE_AWAY",
      "note": "Cho xin thêm quai xách giấy",
      "items": [
        {
          "productId": "11111111-0000-0000-0000-000000000007",
          "quantity": 2,
          "size": "M",
          "sugarLevel": "P70",
          "iceLevel": "NORMAL",
          "toppingIds": [
            "22222222-0000-0000-0000-000000000001",
            "22222222-0000-0000-0000-000000000003"
          ],
          "note": "Ít ngọt vừa phải"
        },
        {
          "productId": "11111111-0000-0000-0000-000000000010",
          "quantity": 1,
          "note": "Hâm nóng bánh giúp mình"
        }
      ]
    }
    ```
- **Quy tắc tính toán & Giao dịch phía Server:**
  - `unitPrice` = `basePrice` + phụ thu size (`S`: +0, `M`: +6.000, `L`: +10.000) + tổng giá topping.
  - `lineTotal` = `unitPrice` × `quantity`.
  - `totalAmount` = Tổng các `lineTotal`.
  - Kiểm tra tồn kho cộng gộp: Nếu cùng một món xuất hiện ở nhiều dòng (ví dụ 1 ly size M và 1 ly size L), Server cộng dồn tổng số lượng để so sánh với `stock`. Nếu thiếu, từ chối toàn bộ đơn.
  - Thực hiện trong một Transaction với điều kiện `stock >= totalRequestedQuantity`. Đơn tạo ra có trạng thái `PENDING` và số đơn hiển thị `orderNumber` tăng dần (ví dụ: `1001`).
- **Response thành công (201 Created):**
  - Món 1 (Trà sữa truyền thống): Base 35.000 + Size M 6.000 + Trân châu 5.000 + Pudding 7.000 = 53.000đ × 2 = **106.000đ**.
  - Món 2 (Bánh Croissant): Base 30.000đ × 1 = **30.000đ**.
  - `totalAmount` = **136.000đ**.
  ```json
  {
    "id": "33333333-0000-0000-0000-000000000001",
    "orderNumber": 1001,
    "status": "PENDING",
    "receiveType": "TAKE_AWAY",
    "note": "Cho xin thêm quai xách giấy",
    "totalAmount": 136000,
    "createdAt": "2026-11-05T03:00:00.000Z",
    "items": [
      {
        "id": "88888888-0000-0000-0000-000000000001",
        "productId": "11111111-0000-0000-0000-000000000007",
        "productName": "Trà sữa truyền thống",
        "size": "M",
        "sugarLevel": "P70",
        "iceLevel": "NORMAL",
        "quantity": 2,
        "unitPrice": 53000,
        "lineTotal": 106000,
        "note": "Ít ngọt vừa phải",
        "toppings": [
          { "id": "22222222-0000-0000-0000-000000000001", "name": "Trân châu đen", "price": 5000 },
          { "id": "22222222-0000-0000-0000-000000000003", "name": "Pudding", "price": 7000 }
        ]
      },
      {
        "id": "88888888-0000-0000-0000-000000000002",
        "productId": "11111111-0000-0000-0000-000000000010",
        "productName": "Bánh Croissant",
        "size": null,
        "sugarLevel": null,
        "iceLevel": null,
        "quantity": 1,
        "unitPrice": 30000,
        "lineTotal": 30000,
        "note": "Hâm nóng bánh giúp mình",
        "toppings": []
      }
    ]
  }
  ```
- **Mã lỗi:**
  - `400 Bad Request`: Giỏ rỗng, số lượng vượt giới hạn; hoặc **món bánh (`CAKE`) bị gửi kèm `size`, `sugarLevel`, `iceLevel`, `toppingIds`**.
  - `401 Unauthorized`: Chưa đăng nhập.
  - `404 Not Found`:
    - `productId` không tồn tại hoặc bị ẩn (`isVisible = false`): message `"Không tìm thấy sản phẩm"`.
    - `toppingId` không tồn tại hoặc đang ẩn (`isVisible = false`): trả về 404 với message tiếng Việt `"Không tìm thấy topping"`.
    ```json
    {
      "statusCode": 404,
      "message": "Không tìm thấy topping",
      "error": "Not Found"
    }
    ```
  - `409 Conflict`: Không đủ tồn kho trong kho. Trả về chi tiết các món thiếu:
    ```json
    {
      "statusCode": 409,
      "message": "Sản phẩm 'Bạc xỉu' không đủ số lượng trong kho",
      "error": "Conflict",
      "details": [
        {
          "productId": "11111111-0000-0000-0000-000000000003",
          "name": "Bạc xỉu",
          "available": 0
        }
      ]
    }
    ```
- **Truy vết:** FR-03 (Giỏ hàng), FR-05 (Khởi tạo đơn hàng & Trừ tồn kho ACID), NFR-05.

---

### (7) `POST /payments` (Sprint 2)
- **Mục đích:** Thanh toán đơn hàng không tiền mặt qua cổng mô phỏng. Sử dụng khóa `Idempotency-Key` để tránh tạo trùng giao dịch.
- **Đăng nhập:** **Bắt buộc** (`CUSTOMER`).
- **Headers bắt buộc:**
  - `Authorization: Bearer <accessToken>`
  - `Idempotency-Key: <Chuỗi từ 8 đến 100 ký tự>` (Ví dụ: `idem-order-1001-attempt-1`)
- **Request Body:**
  | Trường | Kiểu | Bắt buộc | Ràng buộc | Mô tả |
  |---|---|---|---|---|
  | `orderId` | String | **Có** | UUID | Mã đơn hàng cần thanh toán |
  | `method` | String | **Có** | `WALLET` hoặc `CARD` | Phương thức thanh toán (Ví hoặc Thẻ) |
  | `accountNumber` | String | **Có** | Chỉ gồm chữ số, từ 8 đến 19 ký tự | Số tài khoản / số thẻ mô phỏng |
  - Ví dụ Body:
    ```json
    {
      "orderId": "33333333-0000-0000-0000-000000000001",
      "method": "WALLET",
      "accountNumber": "0987654321"
    }
    ```
- **Quy tắc Cổng thanh toán mô phỏng:**
  - Nếu `accountNumber` **kết thúc bằng `"0000"`** (ví dụ: `1234560000`): Cổng giả lập thanh toán **thất bại (`FAILED`)**.
  - Các số tài khoản khác: Cổng giả lập thanh toán **thành công (`SUCCESS`)**.
  - **Bảo mật**: Hệ thống chỉ lưu 4 số cuối vào database (`accountLast4`). Tuyệt đối **không lưu và không ghi log** toàn bộ số tài khoản.
  - Cả hai kịch bản đều trả về mã HTTP **`201 Created`**.
- **Quy tắc Khóa Idempotency & Thứ tự kiểm tra:**
  - Khóa `Idempotency-Key` được phân biệt riêng theo từng người dùng.
  - **Thứ tự kiểm tra phía Server:**
    1. **Kiểm tra header và body**: Xác thực `Idempotency-Key` hợp lệ (8-100 ký tự) và body đầy đủ (`orderId`, `method`, `accountNumber`).
    2. **Tìm `Idempotency-Key` của người dùng này**:
       - Nếu đã có và cùng `orderId`: Trả lại ngay kết quả cũ với mã HTTP **`200 OK`** (cùng body cũ), không trừ tiền và không thanh toán lại. *(Mục đích: Gửi lại yêu cầu đã thành công sẽ không bị báo lỗi 409 vì đơn đã chuyển sang `PAID`)*.
       - Nếu đã có nhưng khác `orderId`: Trả về lỗi **`409 Conflict`**.
    3. **Kiểm tra trạng thái đơn**: Sau khi qua bước kiểm tra khóa, mới kiểm tra đơn hàng (phải thuộc người dùng và đang ở trạng thái `PENDING` hoặc `PAYMENT_FAILED`). Nếu đơn ở trạng thái khác thì trả về lỗi **`409 Conflict`**.
    4. **Thực hiện thanh toán**: Gọi cổng thanh toán mô phỏng và cập nhật kết quả.
  - **Thử lại sau khi thanh toán FAILED**: Đây là lần thanh toán MỚI, phía Client **bắt buộc phải dùng `Idempotency-Key` MỚI**; thử lại không giới hạn số lần.
  - Mỗi đơn hàng chỉ có tối đa một thanh toán `SUCCESS` (hai yêu cầu đồng thời thì một cái thắng, cái kia trả 409).
- **Response thành công - Kịch bản 1: Thanh toán THÀNH CÔNG (201 Created):**
  - Đơn chuyển sang trạng thái **`PAID`**.
  ```json
  {
    "id": "44444444-0000-0000-0000-000000000001",
    "orderId": "33333333-0000-0000-0000-000000000001",
    "method": "WALLET",
    "accountLast4": "4321",
    "amount": 136000,
    "status": "SUCCESS",
    "createdAt": "2026-11-05T03:02:00.000Z",
    "order": {
      "id": "33333333-0000-0000-0000-000000000001",
      "orderNumber": 1001,
      "status": "PAID"
    }
  }
  ```
- **Response thành công - Kịch bản 2: Thanh toán THẤT BẠI (201 Created):**
  - Khi gửi số tài khoản tận cùng bằng `0000`, đơn chuyển sang **`PAYMENT_FAILED`** (tồn kho đã trừ lúc tạo đơn vẫn được giữ nguyên).
  ```json
  {
    "id": "44444444-0000-0000-0000-000000000002",
    "orderId": "33333333-0000-0000-0000-000000000001",
    "method": "WALLET",
    "accountLast4": "0000",
    "amount": 136000,
    "status": "FAILED",
    "failureReason": "Giao dịch bị từ chối (mô phỏng)",
    "createdAt": "2026-11-05T03:02:00.000Z",
    "order": {
      "id": "33333333-0000-0000-0000-000000000001",
      "orderNumber": 1001,
      "status": "PAYMENT_FAILED"
    }
  }
  ```
- **Mã lỗi:**
  - `400 Bad Request`: Thiếu header `Idempotency-Key` hoặc `accountNumber` không đúng định dạng.
  - `401 Unauthorized`: Chưa đăng nhập.
  - `404 Not Found`: Đơn hàng không tồn tại hoặc không thuộc sở hữu của người dùng đang đăng nhập.
  - `409 Conflict`: Đơn không ở trạng thái cho phép thanh toán (`PENDING` hoặc `PAYMENT_FAILED`); hoặc dùng lại `Idempotency-Key` cũ cho một `orderId` khác.
- **Truy vết:** FR-06 (Thanh toán mô phỏng & Thử lại), NFR-05 (Idempotency Key chống giao dịch kép).

---

### (8) `GET /orders/me` (Sprint 2)
- **Mục đích:** Lấy toàn bộ danh sách đơn hàng của người dùng đang đăng nhập, sắp xếp từ mới nhất đến cũ nhất. Không phân trang.
- **Đăng nhập:** **Bắt buộc** (`CUSTOMER`).
- **Request:**
  - Method: `GET`
  - URL: `/orders/me`
- **Response thành công (200 OK):**
  ```json
  [
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
          "size": "M",
          "sugarLevel": "P70",
          "iceLevel": "NORMAL",
          "quantity": 2,
          "unitPrice": 53000,
          "lineTotal": 106000,
          "note": "Ít ngọt vừa phải",
          "toppings": [
            { "id": "22222222-0000-0000-0000-000000000001", "name": "Trân châu đen", "price": 5000 },
            { "id": "22222222-0000-0000-0000-000000000003", "name": "Pudding", "price": 7000 }
          ]
        },
        {
          "id": "88888888-0000-0000-0000-000000000002",
          "productId": "11111111-0000-0000-0000-000000000010",
          "productName": "Bánh Croissant",
          "size": null,
          "sugarLevel": null,
          "iceLevel": null,
          "quantity": 1,
          "unitPrice": 30000,
          "lineTotal": 30000,
          "note": "Hâm nóng bánh giúp mình",
          "toppings": []
        }
      ]
    }
  ]
  ```
- **Mã lỗi:** `401 Unauthorized` nếu chưa đăng nhập.
- **Truy vết:** FR-07 (Lịch sử đơn hàng).

---

### (9) `GET /orders/:id` (Sprint 2)
- **Mục đích:** Xem chi tiết một đơn hàng kèm theo toàn bộ lịch sử các lần thanh toán của đơn đó.
- **Đăng nhập:** **Bắt buộc** (`CUSTOMER`). Chỉ người tạo ra đơn mới có quyền xem.
- **Ghi chú quan trọng cho Backend:** Trong Orders Controller của NestJS, **bắt buộc phải khai báo route `GET /orders/me` trước route `GET /orders/:id`**, nếu không NestJS sẽ hiểu nhầm chuỗi `"me"` là một mã ID.
- **Request:**
  - Method: `GET`
  - URL: `/orders/:id` (ví dụ: `/orders/33333333-0000-0000-0000-000000000001`)
- **Response thành công (200 OK):**
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
        "size": "M",
        "sugarLevel": "P70",
        "iceLevel": "NORMAL",
        "quantity": 2,
        "unitPrice": 53000,
        "lineTotal": 106000,
        "note": "Ít ngọt vừa phải",
        "toppings": [
          { "id": "22222222-0000-0000-0000-000000000001", "name": "Trân châu đen", "price": 5000 },
          { "id": "22222222-0000-0000-0000-000000000003", "name": "Pudding", "price": 7000 }
        ]
      },
      {
        "id": "88888888-0000-0000-0000-000000000002",
        "productId": "11111111-0000-0000-0000-000000000010",
        "productName": "Bánh Croissant",
        "size": null,
        "sugarLevel": null,
        "iceLevel": null,
        "quantity": 1,
        "unitPrice": 30000,
        "lineTotal": 30000,
        "note": "Hâm nóng bánh giúp mình",
        "toppings": []
      }
    ],
    "payments": [
      {
        "id": "44444444-0000-0000-0000-000000000001",
        "method": "WALLET",
        "accountLast4": "4321",
        "status": "SUCCESS",
        "failureReason": null,
        "createdAt": "2026-11-05T03:02:00.000Z"
      }
    ]
  }
  ```
- **Mã lỗi:**
  - `401 Unauthorized`: Chưa đăng nhập.
  - `404 Not Found`: Đơn không tồn tại hoặc không thuộc sở hữu của người dùng.
- **Truy vết:** FR-07 (Chi tiết & Trạng thái đơn hàng).

---

## 3. CÁC TÍNH NĂNG KHÔNG LÀM (OUT-OF-SCOPE)

Để đảm bảo hoàn thành dự án đúng thời hạn nộp bài, các tính năng sau **hoàn toàn không làm** trong cả Backend lẫn Frontend:
1. **Không làm API nhân viên/quản lý đổi trạng thái đơn**: Không có endpoint cập nhật trạng thái đơn (`PATCH /orders/:id/status`). Mọi đơn hàng sau khi thanh toán thành công sẽ dừng lại ở trạng thái `PAID`.
2. **Không làm API thêm / sửa / xóa món**: Quản lý chỉnh sửa món hoặc ẩn/hiện món (`isVisible`) trực tiếp trong database.
3. **Không làm tính năng hủy đơn**: Không có nút hủy đơn phía khách hàng; không làm cơ chế tự hủy đơn sau 15 phút.
4. **Không làm Voucher / Khuyến mãi**: Không áp dụng mã giảm giá.
5. **Không làm Tích điểm thành viên**: Không tính điểm tích lũy sau khi thanh toán.
6. **Không làm endpoint `GET /auth/me`**: Người dùng chỉ nhận thông tin lúc đăng nhập/đăng ký.
7. **Không bắt buộc đăng nhập để xem Menu**: Khách vãng lai xem menu bình thường, chỉ bắt buộc đăng nhập khi bấm đặt đơn.
8. **Không làm phân trang (Pagination)**: Menu và danh sách đơn trả về toàn bộ danh sách.
9. **Không tạo bảng `Size` trong database**: Quy ước kích cỡ size và giá phụ thu được cố định trong code.
10. **Không làm cơ chế polling tự động mỗi 5 giây**: Trang theo dõi đơn chỉ gửi request tải dữ liệu khi người dùng truy cập hoặc bấm nút tải lại trang.

---

## 4. MÁY TRẠNG THÁI ĐƠN HÀNG (STATE MACHINE)

### Bảng chuyển đổi trạng thái đơn hàng (`OrderStatus`):

| Trạng thái hiện tại | Chuyển sang | Nguyên nhân kích hoạt | Tình trạng hỗ trợ trong bản này |
|---|---|---|---|
| `PENDING` | `PAID` | Khách thanh toán thành công qua cổng mô phỏng | **Có API** (`POST /payments` với số tài khoản hợp lệ) |
| `PENDING` | `PAYMENT_FAILED` | Thanh toán bị từ chối qua cổng mô phỏng | **Có API** (`POST /payments` với đuôi `"0000"`) |
| `PAYMENT_FAILED` | `PAID` | Khách bấm "Thử lại thanh toán" và thanh toán thành công | **Có API** (`POST /payments` dùng `Idempotency-Key` mới) |
| `PAYMENT_FAILED` | `PAYMENT_FAILED` | Khách thử lại nhưng giao dịch tiếp tục bị từ chối | **Có API** (`POST /payments` dùng `Idempotency-Key` mới) |
| `PAID` | `PREPARING` | Quầy chuyển sang đang pha chế | *Chưa có API gây ra trong bản này* (giữ logic kiểm tra & unit test) |
| `PREPARING` | `READY` | Quầy pha chế xong, sẵn sàng nhận món | *Chưa có API gây ra trong bản này* (giữ logic kiểm tra & unit test) |
| `READY` | `COMPLETED` | Khách đã nhận đồ uống thành công | *Chưa có API gây ra trong bản này* (giữ logic kiểm tra & unit test) |
| `PENDING`, `PAYMENT_FAILED`, `PAID` | `CANCELLED` | Đơn bị hủy | *Chưa có API gây ra trong bản này* (giữ logic kiểm tra & unit test) |

> **Quy định kỹ thuật:**
> - `COMPLETED` và `CANCELLED` là hai **trạng thái kết thúc**, không chuyển đi đâu nữa (đơn đã ở trạng thái này thì không bao giờ được phép đổi sang trạng thái khác).
> - Mặc dù các trạng thái `PREPARING`, `READY`, `COMPLETED`, `CANCELLED` chưa có API kích hoạt trong phiên bản này, Backend vẫn bắt buộc phải cài đặt hàm kiểm tra chuyển trạng thái hợp lệ (`validateTransition`) và viết unit test đầy đủ để sẵn sàng mở rộng.

### Trạng thái thanh toán (`PaymentStatus`):
- `PENDING`: Khởi tạo (dành cho cổng thanh toán thật có webhook chuyển tiếp).
- `SUCCESS`: Thanh toán thành công.
- `FAILED`: Thanh toán thất bại.
*(Trong bản mô phỏng này, mỗi lần gọi API thanh toán chỉ trả về kết quả ngay lập tức là `SUCCESS` hoặc `FAILED`).*

---

## 5. THAY ĐỔI CẦN LÀM Ở DATABASE (SPRINT 2)

*(Lưu ý: Không sửa schema trong Sprint 1. Đây là các bảng và enum sẽ thêm vào `schema.prisma` ở Sprint 2)*:

1. **Các Enum cần thêm:**
   - `Role`: `CUSTOMER`, `STAFF`, `ADMIN`
   - `Size`: `S`, `M`, `L`
   - `SugarLevel`: `P0`, `P30`, `P50`, `P70`, `P100`
   - `IceLevel`: `NONE`, `LOW`, `NORMAL`, `FULL`
   - `ReceiveType`: `AT_COUNTER`, `TAKE_AWAY`
   - `OrderStatus`: `PENDING`, `PAID`, `PREPARING`, `READY`, `COMPLETED`, `PAYMENT_FAILED`, `CANCELLED`
   - `PaymentMethod`: `WALLET`, `CARD`
   - `PaymentStatus`: `PENDING`, `SUCCESS`, `FAILED`

2. **Các Bảng (Model) cần thêm:**
   - **`User`**: `id` (UUID), `email` (unique), `passwordHash`, `displayName`, `role` (default `CUSTOMER`), `createdAt`, `updatedAt`.
   - **`Topping`**: `id` (UUID), `name`, `price` (Int), `isVisible` (Boolean, default true). Seed 4 topping bằng đúng các ID cố định từ `22222222-0000-0000-0000-000000000001` đến `...0004` như trong ví dụ JSON (Trân châu đen +5.000, Thạch dừa +5.000, Pudding +7.000, Kem cheese +10.000).
   - **`Order`**: `id` (UUID), `orderNumber` (Int, tự tăng), `userId` (FK User), `status` (default `PENDING`), `receiveType` (default `AT_COUNTER`), `note` (optional), `totalAmount` (Int), `createdAt`, `updatedAt`.
   - **`OrderItem`**: `id` (UUID), `orderId` (FK Order), `productId` (FK Product), `productName` (String, lưu tĩnh), `unitPrice` (Int), `quantity` (Int), `size` (Enum Size, optional), `sugarLevel` (Enum SugarLevel, optional), `iceLevel` (Enum IceLevel, optional), `lineTotal` (Int), `note` (optional).
   - **`OrderItemTopping`**: `id` (UUID), `orderItemId` (FK OrderItem), `toppingId` (FK Topping), `name` (String, lưu tĩnh), `price` (Int, lưu tĩnh).
   - **`Payment`**: `id` (UUID), `orderId` (FK Order), `userId` (FK User), `idempotencyKey` (String, duy nhất theo từng user), `method` (Enum PaymentMethod), `accountLast4` (String), `amount` (Int), `status` (Enum PaymentStatus), `failureReason` (String, optional), `createdAt`.

> **Cam kết:** Tuyệt đối không tạo các bảng `Size`, `Promotion`, `LoyaltyTransaction` trong mã nguồn.

---

## 6. THỨ TỰ LÀM VÀ HƯỚNG DẪN LÀM SONG SONG FE/BE

### 1. Phân chia công việc theo Sprint:
- **Sprint 1 (Hoàn thành Menu MVP):**
  - Backend: `GET /health` (xong), xây dựng `GET /products`, `GET /products/:id`.
  - Frontend: Dựng trang Menu, gọi API hiển thị danh sách món (đầy đủ loading, empty, error, nhãn "Hết hàng"), xem chi tiết món.
- **Sprint 2 (Hoàn thành Đặt hàng & Thanh toán):**
  - Backend: Thêm schema DB (User, Topping, Order, Payment), viết các API Auth (`register`, `login`), API tạo đơn (`POST /orders`), API thanh toán (`POST /payments`), API lịch sử/chi tiết đơn.
  - Frontend: Dựng màn hình Giỏ hàng, Đăng nhập/Đăng ký, Trang xác nhận thanh toán (thử thành công và thất bại), Trang xem lịch sử đơn.

### 2. Nguyên tắc phối hợp để không bị vỡ giao diện:
- Mọi trường tùy chọn của món nước đều có giá trị mặc định:
  - Nếu Frontend chưa làm phần chọn đường đá, Frontend có thể không gửi các trường `sugarLevel`, `iceLevel`, `size`. Backend tự gán `S`, `P100`, `NORMAL`.
  - Nếu Frontend chưa có ô nhập ghi chú hoặc hình thức nhận hàng, Backend tự lấy `receiveType = AT_COUNTER` và `note = null`.
  - Nhờ vậy, Frontend có thể kết nối thử API đặt đơn từ sớm mà không sợ bị lỗi validate.

---

## 7. BẢNG NHÃN TIẾNG VIỆT CHO GIAO DIỆN WEB

Frontend sử dụng bảng này để chuyển đổi mã kỹ thuật (tiếng Anh) thành nhãn hiển thị thân thiện (tiếng Việt):

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
| **Category (Danh mục)** | `TEA` | Trà |
| | `COFFEE` | Cà phê |
| | `MILK_TEA` | Trà sữa |
| | `CAKE` | Bánh |

---

## 8. GIỚI HẠN ĐÃ BIẾT (KNOWN LIMITATIONS)

1. **Tồn kho của đơn bỏ dở**: Do không có luồng hủy đơn tự động (bỏ quy tắc tự hủy sau 15 phút), những đơn hàng ở trạng thái `PENDING` hoặc `PAYMENT_FAILED` mà khách hàng bỏ đi sẽ tiếp tục giữ số lượng tồn kho đã trừ.
2. **Cơ chế Thử lại thanh toán**: Khi thanh toán thất bại, giao diện Web cần lưu lại mã `orderId` của đơn hàng đang chờ thanh toán đó để khi người dùng bấm nút "Thử lại thanh toán", hệ thống sẽ gọi `POST /payments` trên chính đơn này kèm một `Idempotency-Key` mới, tránh việc tạo ra một đơn hàng mới làm trừ kho 2 lần.

---

## 9. CHỖ CẦN SỬA TRONG DOCS SAU KHI CODE XONG

*(Lưu ý: Mỗi chỗ một dòng, chỉ rõ file nào và sửa gì. Nhóm sẽ chỉnh sửa tài liệu sau, hiện tại không tự sửa `docs/`)*:

1. `docs/requirements/context-and-scope.md` (Mục Out-of-Scope): Thêm Voucher, Tích điểm thành viên, Tự hủy đơn sau 15 phút, và API quản lý món của Admin vào danh mục Out-of-Scope.
2. `docs/requirements/context-and-scope.md` (Mục Ràng buộc giao diện): Sửa định hướng thiết kế từ "Mobile-first / PWA" thành "Ưu tiên giao diện Web trên máy tính (Desktop-first), vẫn đảm bảo responsive cho di động".
3. `docs/requirements/srs-task-1.2.md` (Bảng FR - Mục FR-05): Xóa bỏ yêu cầu kiểm tra/lưu thời hạn hết hạn đơn hàng và áp dụng mã giảm giá voucher.
4. `docs/requirements/srs-task-1.2.md` (Bảng FR - Mục FR-06 & FR-07): Xóa bỏ quy tắc tự động chuyển sang `CANCELLED` và hoàn tồn kho sau 15 phút.
5. `docs/requirements/srs-task-1.2.md` (Bảng FR - Mục FR-08): Đánh dấu chức năng Quản lý trạng thái quầy là "Chưa hiện thực trong mã nguồn của bản này".
6. `docs/requirements/srs-task-1.2.md` (Bảng FR - Mục FR-09): Chuyển chức năng Quản lý Menu của Admin sang mức Won't (ẩn/hiện món thao tác trực tiếp trên DB).
7. `docs/requirements/srs-task-1.2.md` (Bảng FR - Mục FR-10 & FR-11): Chuyển chức năng Khuyến mãi/Voucher và Tích điểm thành viên từ Could sang Won't (bỏ hẳn).
8. `docs/requirements/srs-task-1.2.md` (Bảng NFR - Mục NFR-03): Sửa yêu cầu giao diện thành "Desktop-first, thân thiện trên màn hình máy tính và co giãn tốt trên di động".
9. `docs/requirements/use-case-d?c-t?-task 1.3.md` (Mục Hậu điều kiện): Xóa bỏ nội dung "cộng điểm tích lũy" và "quá hạn đơn CANCELLED hoàn tồn kho".
10. `docs/requirements/use-case-d?c-t?-task 1.3.md` (Mục Luồng chính): Xóa bỏ bước 9 phần cộng điểm tích lũy thành viên.
11. `docs/requirements/use-case-d?c-t?-task 1.3.md` (Mục Luồng thay thế): Xóa bỏ toàn bộ luồng A2 (áp dụng mã giảm giá voucher).
12. `docs/requirements/use-case-d?c-t?-task 1.3.md` (Mục Luồng ngoại lệ): Xóa bỏ toàn bộ ngoại lệ E5 (quá 15 phút tự động hủy đơn).
13. `docs/diagrams/activity-diagram.puml`: Xóa bỏ nhánh kiểm tra mã giảm giá, nhánh tự hủy đơn sau 15 phút và hành động cộng điểm thành viên.
14. `docs/diagrams/classdiagram.puml` (Model Product): Sửa kiểu dữ liệu `basePrice: Decimal` thành `basePrice: Int`.
15. `docs/diagrams/classdiagram.puml` (Model Order): Xóa các thuộc tính `subtotal: Decimal`, `discountAmount: Decimal`, `expiresAt: DateTime` và sửa `totalAmount: Decimal` thành `totalAmount: Int`.
16. `docs/diagrams/classdiagram.puml` (Model OrderItem): Sửa `unitPrice: Decimal` và `lineTotal: Decimal` thành `Int`.
17. `docs/diagrams/classdiagram.puml` (Model User): Xóa thuộc tính `loyaltyPoints: int` và sửa tên trường họ tên từ `fullName` thành `displayName`.
18. `docs/diagrams/classdiagram.puml` (Class Promotion & LoyaltyTransaction): Giữ nguyên hai class này trong sơ đồ theo đúng bắt buộc của Task 2.3 trong đề bài, thêm ghi chú "Phạm vi mở rộng, chưa hiện thực trong code".
19. `docs/diagrams/classdiagram.puml` (Enum OrderStatus): Thêm ghi chú các trạng thái `PREPARING`, `READY`, `COMPLETED`, `CANCELLED` chưa có API kích hoạt trong phiên bản này.
