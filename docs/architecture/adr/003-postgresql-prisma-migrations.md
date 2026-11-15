# ADR-003: PostgreSQL với Prisma, migration và seed

- **Trạng thái:** Accepted
- **Ngày:** 2026-11-03 (Cập nhật đồng bộ Hợp đồng API)

## Bối cảnh
PostgreSQL là thành phần bắt buộc. Dữ liệu có quan hệ rõ ràng (User, Product, Topping, Order, OrderItem, OrderItemTopping, Payment) và cần tái tạo database từ đầu bằng migration và seed một cách an toàn.

## Quyết định
1. **Công nghệ:** Sử dụng PostgreSQL 16 và Prisma làm ORM. Schema và migrations đặt trong `apps/api/prisma`.
2. **Quy trình Migration:**
   - Môi trường phát triển (Local): Dùng lệnh `npx prisma migrate dev`.
   - Môi trường triển khai (Production): Dùng lệnh `npx prisma migrate deploy` qua kết nối an toàn từ CI/máy dev, tách biệt hoàn toàn khỏi container lúc khởi động runtime.
3. **Seed dữ liệu mẫu:**
   - Sử dụng `prisma/seed.ts` với cơ chế **upsert theo ID cố định** được quy định trong Hợp đồng API. Chạy seed nhiều lần không làm nhân đôi dữ liệu.
   - Production tuyệt đối không nạp tài khoản demo, chỉ seed 12 sản phẩm và 4 loại topping.
4. **Cơ chế trừ tồn kho:**
   - **Bỏ khóa lạc quan và cột `version`**.
   - Cập nhật tồn kho trong **1 Transaction ACID** duy nhất với điều kiện `stock >= tổng số lượng cần` (được tính bằng cách cộng gộp số lượng của cùng một món trên tất cả các dòng trong giỏ hàng). Nếu không đủ tồn kho, transaction tự động rollback toàn bộ và trả về lỗi 409 Conflict kèm danh sách món bị thiếu.

## Hệ quả
- Schema là nguồn sự thật duy nhất, đồng bộ chặt chẽ với Hợp đồng API và không sinh thêm các bảng/cột dư thừa (`version`, `Size`, `Promotion`, `LoyaltyTransaction`).
- Xử lý tương tranh tồn kho đơn giản, tin cậy, không bị deadlock hay xung đột phiên bản không cần thiết.
- Tái tạo dữ liệu database từ đầu ở bất kỳ môi trường nào bằng migration và seed chuẩn hóa.

## Phương án đã xem xét
- **Khóa lạc quan với cột `version`:** Gây phức tạp không cần thiết khi giỏ hàng có nhiều dòng cùng một món và dễ phát sinh lỗi retry; đã được thay thế bằng kiểm tra điều kiện tồn kho cộng gộp trong transaction.
- **TypeORM:** Phổ biến với NestJS nhưng cơ chế migration và định nghĩa kiểu dễ sai lệch hơn so với Prisma đối với nhóm phát triển.
- **SQL thuần:** Tối ưu hiệu năng nhưng tốn nhiều thời gian bảo trì schema và truy vấn trong thời gian ngắn.
