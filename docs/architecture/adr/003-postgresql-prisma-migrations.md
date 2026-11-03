# ADR-003: PostgreSQL với Prisma, migration và seed

- **Trạng thái:** Accepted
- **Ngày:** 2026-11-03

## Bối cảnh
PostgreSQL là thành phần bắt buộc. Dữ liệu có quan hệ rõ (User, Order, OrderItem, Payment...) và cần tái tạo database từ đầu bằng migration và seed.

## Quyết định
Dùng PostgreSQL 16 và Prisma làm ORM. Schema và migration nằm trong `apps/api/prisma`. Local dùng `prisma migrate dev`, production dùng `prisma migrate deploy`; dữ liệu mẫu tạo bằng `prisma db seed`. Cập nhật tồn kho dùng điều kiện `stock >= qty` và cột `version` (khóa lạc quan), dùng truy vấn thô khi cần.

## Hệ quả
- Schema là nguồn sự thật duy nhất, khớp class diagram; migration có lịch sử trong Git.
- Người mới dễ dùng, có kiểu TypeScript sinh tự động.
- Hạn chế: một số truy vấn phức tạp phải viết raw SQL.

## Phương án đã xem xét
- **TypeORM:** phổ biến với NestJS nhưng migration và kiểu dữ liệu dễ sai lệch hơn với người mới.
- **SQL thuần:** kiểm soát tối đa nhưng tốn công và dễ lỗi trong thời gian ngắn.
