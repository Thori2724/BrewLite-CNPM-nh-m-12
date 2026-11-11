# ADR-002: Modular monolith NestJS, giao tiếp REST/JSON

- **Trạng thái:** Accepted
- **Ngày:** 2026-11-03 (Cập nhật đồng bộ Hợp đồng API)

## Bối cảnh
Hệ thống có các miền nghiệp vụ cốt lõi (sản phẩm, người dùng/xác thực, đơn hàng, thanh toán) và cần transaction chặt chẽ giữa tạo đơn và trừ tồn kho. Nhóm nhỏ, thời gian ngắn.

## Quyết định
Backend là một ứng dụng NestJS duy nhất chia theo module/domain cốt lõi:
- `auth`: Đăng ký, đăng nhập, băm mật khẩu bcrypt, cấp phát JWT token (24 giờ).
- `products`: Danh mục menu, chi tiết món, size/topping, tồn kho.
- `orders`: Tạo đơn, tính tiền phía server, trừ tồn kho trong transaction, lịch sử đơn.
- `payments`: Thanh toán mô phỏng Ví/Thẻ, kiểm tra Idempotency-Key.
- `prisma`: Kết nối cơ sở dữ liệu và quản trị transaction.
- `common`: Filter ngoại lệ chuẩn hóa, interceptor logging, cấu hình hệ thống.

*(Lưu ý: Các module khuyến mãi `promotions` và tích điểm `loyalty` thuộc phạm vi mở rộng trong tương lai, chưa hiện thực trong MVP hiện tại).*

Frontend giao tiếp với Backend bằng REST/JSON qua các endpoint trực tiếp (không dùng tiền tố `/api`, ví dụ `/products`, `/orders`, `/payments`). Mỗi module tuân thủ phân lớp: Controller → Service → Repository/Prisma.

## Hệ quả
- Một đơn vị triển khai, một DB, transaction ACID nguyên vẹn.
- Ranh giới module rõ ràng, gọn gàng, loại bỏ các module ngoài phạm vi hợp đồng.
- Hạn chế: không mở rộng độc lập từng module; một lỗi nghiêm trọng có thể ảnh hưởng toàn API.

## Phương án đã xem xét
- **Microservices:** thêm độ phức tạp mạng, giao dịch phân tán và vận hành, không phù hợp quy mô và thời gian.
- **GraphQL:** linh hoạt truy vấn nhưng đề bài và hợp đồng API chỉ cần các endpoint REST cố định; REST đơn giản hơn để kiểm thử bằng Postman/E2E.
