# ADR-002: Modular monolith NestJS, giao tiếp REST/JSON

- **Trạng thái:** Accepted
- **Ngày:** 2026-11-03

## Bối cảnh
Hệ thống có ít miền nghiệp vụ (sản phẩm, đơn hàng, thanh toán, khuyến mãi, điểm thưởng) và cần transaction chặt giữa tạo đơn và trừ tồn kho. Nhóm nhỏ, thời gian ngắn.

## Quyết định
Backend là một ứng dụng NestJS duy nhất chia theo module/domain (`auth`, `users`, `products`, `orders`, `payments`, `promotions`, `loyalty`, `health`). Frontend giao tiếp bằng REST/JSON. Mỗi module theo phân lớp Controller → Service → Repository.

## Hệ quả
- Một đơn vị triển khai, một DB, transaction ACID nguyên vẹn.
- Ranh giới module rõ giúp tách thành dịch vụ riêng sau này nếu cần.
- Hạn chế: không mở rộng độc lập từng module; một lỗi nghiêm trọng có thể ảnh hưởng toàn API.

## Phương án đã xem xét
- **Microservices:** thêm độ phức tạp mạng, giao dịch phân tán và vận hành, không phù hợp quy mô và thời gian.
- **GraphQL:** linh hoạt truy vấn nhưng đề bài và wireframe chỉ cần các endpoint cố định; REST đơn giản hơn để test bằng Postman.
