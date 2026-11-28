<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Biến môi trường cần có (khối `# --- API (BE) ---` trong `.env.example`)

Cấu hình trong file `.env` ở thư mục gốc của repo (đối chiếu từ `.env.example`):

- `PORT`: Cổng chạy server API (mặc định `3001`).
- `DATABASE_URL`: Chuỗi kết nối PostgreSQL chính cho Prisma (ví dụ: `"postgresql://brewlite:brewlite@localhost:5432/brewlite?schema=public"`).
- `CORS_ORIGIN`: Địa chỉ Frontend được phép gọi CORS (mặc định `http://localhost:3000`).
- `JWT_SECRET`: Chuỗi bí mật ký/xác thực JWT (bắt buộc khi chạy ứng dụng).
- `TEST_DATABASE_URL`: Chuỗi kết nối PostgreSQL dành riêng cho E2E/Integration test, tên database bắt buộc kết thúc bằng hậu tố `_test` (ví dụ: `"postgresql://brewlite:brewlite@127.0.0.1:5432/brewlite_test?schema=public"`).
- `DEMO_USER_PASSWORD`: Mật khẩu khởi tạo cho 5 tài khoản demo khi chạy `npm.cmd run seed` (tối thiểu 6 ký tự; mẫu trong `.env.example` là `demo123@`).

## Danh sách 23 Endpoint (Hợp đồng API Bản 3)

### Hệ thống & Sản phẩm (`AppController`, `ProductsController`)
- `GET /health`: Kiểm tra trạng thái server (`{ "status": "ok" }`).
- `GET /products`: Lấy danh sách món đang hiển thị (`isVisible = true`), sắp xếp theo `category` rồi `name`. Hỗ trợ query tùy chọn `category` (`TEA`, `COFFEE`, `MILK_TEA`, `CAKE`) và `q` (tìm theo tên không phân biệt hoa/thường, có dấu).
- `GET /products/manage` (cần Bearer JWT `STAFF` hoặc `ADMIN`): Trả toàn bộ sản phẩm kể cả món đang ẩn (`isVisible = false`), sắp xếp theo `category` rồi `name`.
- `POST /products` (chỉ `ADMIN`): Thêm món mới (`name` 1–100 ký tự, `category`, `basePrice` nguyên 1.000–1.000.000, `imageUrl` tùy chọn, `stock` tùy chọn 0–9999 mặc định `50`).
- `GET /products/:id`: Xem chi tiết một sản phẩm theo UUID kèm `sizes`, `sugarLevels`, `iceLevels` và `toppings` (riêng món `CAKE` trả 4 mảng rỗng `[]`).
- `PATCH /products/:id` (chỉ `ADMIN`): Cập nhật thông tin hoặc ẩn/hiện món (`name`, `category`, `basePrice`, `imageUrl`, `isVisible`; không sửa `stock` ở endpoint này).
- `PATCH /products/:id/availability` (cần Bearer JWT `STAFF` hoặc `ADMIN`): Bật/tắt trạng thái đang bán (`isAvailable: true` bắt buộc gửi kèm `stock` nguyên 1–9999; `isAvailable: false` đặt `stock = 0`).

### Xác thực (`AuthController`)
- `POST /auth/register`: Đăng ký tài khoản khách hàng (`CUSTOMER`), băm mật khẩu bcrypt (10 vòng), chuẩn hóa email chữ thường.
- `POST /auth/login`: Đăng nhập bằng `email` và `password`. Trả `{ accessToken, user: { id, email, displayName, role } }` (JWT có hạn 24 giờ; tài khoản `isActive = false` bị chặn với `403` `"Tài khoản đã bị khóa"`).

### Đơn hàng & Thanh toán (`OrdersController`, `PaymentsController`)
Mọi Order object trả về đều có đủ 5 trường Bản 3: `subtotalAmount`, `discountAmount`, `promotionCode`, `pointsUsed`, `pointsEarned` cùng `totalAmount = subtotalAmount - discountAmount - pointsUsed * 1000` (luôn `>= 1000`).
- `POST /orders` (cần Bearer JWT): Tạo đơn hàng trong một transaction duy nhất (trừ tồn kho thật có điều kiện `stock >= số lượng cần`, áp mã giảm giá `promotionCode`, trừ điểm `usePoints` và ghi dòng `REDEEM`).
- `GET /orders` (cần Bearer JWT `STAFF` hoặc `ADMIN`): Lấy toàn bộ đơn hàng của mọi khách (hỗ trợ lọc query `status`), kèm thông tin `customer`.
- `GET /orders/me` (cần Bearer JWT): Lấy danh sách đơn hàng của chính người dùng đang đăng nhập.
- `GET /orders/:id` (cần Bearer JWT, chủ đơn): Xem chi tiết một đơn hàng kèm lịch sử `payments[]`.
- `POST /orders/:id/cancel` (cần Bearer JWT, chủ đơn): Khách hủy đơn ở trạng thái `PENDING`, `PAYMENT_FAILED` hoặc `PAID` (dùng hàm hủy chung: hoàn kho, hoàn điểm `REFUND`, thu hồi điểm `REVOKE` không làm âm điểm).
- `PATCH /orders/:id/status` (cần Bearer JWT `STAFF` hoặc `ADMIN`): Nhân viên chuyển trạng thái đơn (`PREPARING`, `READY`, `COMPLETED`, `CANCELLED`; khi `CANCELLED` dùng chung hàm hủy đơn).
- `POST /payments` (cần Bearer JWT và header `Idempotency-Key` 8–100 ký tự): Thanh toán đơn qua cổng mô phỏng (`method`: `WALLET` hoặc `CARD`; số tài khoản đuôi `0000` thất bại `FAILED`, còn lại `SUCCESS`; chỉ lưu 4 số cuối `accountLast4`). Khi `SUCCESS`, chuyển đơn sang `PAID` và cộng `pointsEarned = floor(totalAmount / 10000)` điểm (ghi dòng `EARN`) trong cùng transaction; gửi lại cùng `Idempotency-Key` trả `200 OK` và không cộng điểm lần nữa.

### Quản lý nhân viên (`StaffController`)
- `GET /staff` (chỉ `ADMIN`): Lấy danh sách tài khoản `role = STAFF`.
- `PATCH /staff/:id/status` (chỉ `ADMIN`): Khóa/mở khóa tài khoản `STAFF` (`isActive: true/false`), có hiệu lực ngay ở mọi request tiếp theo.

### Khuyến mãi & Điểm thưởng (`PromotionsController`, `LoyaltyController`)
- `GET /promotions` (chỉ `ADMIN`): Lấy danh sách tất cả mã giảm giá (mới nhất trước).
- `POST /promotions` (chỉ `ADMIN`): Tạo mã giảm giá mới (`code` 3–20 ký tự tự chuyển chữ hoa, `type` là `PERCENT` hoặc `FIXED`, `value`, `maxDiscount` tùy chọn cho `PERCENT`, `isActive`).
- `POST /promotions/validate` (chỉ `CUSTOMER`): Xem trước số tiền giảm (`discountAmount`) theo `code` và `subtotal`.
- `PATCH /promotions/:id` (chỉ `ADMIN`): Cập nhật `type`, `value`, `maxDiscount`, `isActive` của mã giảm giá (không cho sửa `code`).
- `GET /loyalty/me` (chỉ `CUSTOMER`): Xem số dư `loyaltyPoints` hiện tại và tối đa 50 giao dịch điểm mới nhất (`EARN`, `REDEEM`, `REFUND`, `REVOKE`) kèm `orderNumber` (hoặc `null` nếu không gắn với đơn).

## Database Migration & Seed (Prisma)

Khi khởi tạo hoặc dựng lại database dev từ đầu (sau khi đã bật PostgreSQL bằng `docker compose up -d` và cấu hình `.env` ở thư mục gốc), chạy từ thư mục `apps/api`:

```powershell
cd apps/api
npm.cmd run prisma -- migrate deploy
npm.cmd run prisma -- generate
npm.cmd run seed
```

Dữ liệu được nạp bởi `npm.cmd run seed` (dùng `upsert` theo UUID cố định, chạy lại nhiều lần không nhân đôi):
- **12 sản phẩm (`Product`)** và **4 topping (`Topping`)**.
- **3 mã giảm giá mẫu (`Promotion`)**:
  - `BREW10` (`PERCENT`, giảm 10%, trần `15000`, `isActive: true`)
  - `GIAM20K` (`FIXED`, giảm `20000`, `isActive: true`)
  - `TAMNGUNG` (`PERCENT`, giảm 15%, trần `20000`, `isActive: false`)
- **5 tài khoản demo (`User`)** khi biến `DEMO_USER_PASSWORD` trong `.env` có độ dài từ 6 ký tự trở lên:
  - `quanly@example.com` (`ADMIN`, `"Quản lý"`)
  - `nhanvien1@example.com`, `nhanvien2@example.com`, `nhanvien3@example.com` (`STAFF`)
  - `khach@example.com` (`CUSTOMER`, `"Khách demo"`)
- **Điểm chào mừng (tặng đúng 1 lần)**: Tạo giao dịch `EARN` `+50` điểm (`id = 99999999-0000-0000-0000-000000000001`, `orderId = null`) và cộng `50` điểm cho `khach@example.com` nếu giao dịch này chưa tồn tại.

## Chạy Lint, Unit Test, E2E Test (trên `brewlite_test`) và Build

Các lệnh chạy từ thư mục `apps/api` trên Windows PowerShell:

```powershell
cd apps/api

# 1. Kiểm tra lint
npm.cmd run lint

# 2. Chạy unit test
npm.cmd run test

# 3. Chuẩn bị database brewlite_test và chạy E2E test
docker exec brewlite-postgres psql -U brewlite -d postgres -c "CREATE DATABASE brewlite_test;"
$env:TEST_DATABASE_URL = "postgresql://brewlite:brewlite@127.0.0.1:5432/brewlite_test?schema=public"
$env:DATABASE_URL = $env:TEST_DATABASE_URL
./node_modules/.bin/prisma.cmd migrate deploy
npm.cmd run test:e2e -- --runInBand

# 4. Build ứng dụng
npm.cmd run build
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
