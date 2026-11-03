# ADR-004: Xác thực bằng JWT và bcrypt

- **Trạng thái:** Accepted
- **Ngày:** 2026-11-03

## Bối cảnh
Người dùng phải đăng ký, đăng nhập và chỉ người đã đăng nhập mới đặt đơn, thanh toán, xem lịch sử. NFR yêu cầu băm mật khẩu và dùng JWT.

## Quyết định
- Mật khẩu băm bằng bcrypt, không bao giờ lưu hoặc ghi log dạng gốc.
- Đăng nhập trả JWT access token thời hạn ngắn; client gửi qua header `Authorization: Bearer <token>`.
- Backend dùng Passport JWT và `JwtAuthGuard` cho các route cần đăng nhập; mỗi request đã xác thực gắn `userId` từ token.
- MVP không có refresh token; token hết hạn thì đăng nhập lại.
- `JWT_SECRET` lấy từ biến môi trường, không nằm trong repository.

## Hệ quả
- Stateless, dễ chạy một hoặc nhiều bản API.
- Hạn chế: token lưu phía client có rủi ro XSS; chưa thu hồi được token trước hạn.
- Giảm thiểu: token sống ngắn, helmet, kiểm soát nội dung hiển thị, nêu cookie HttpOnly và refresh token là hướng nâng cấp.

## Phương án đã xem xét
- **Session phía server:** dễ thu hồi nhưng cần lưu trạng thái và cấu hình cookie/CORS phức tạp hơn.
- **Cookie HttpOnly chứa JWT:** an toàn hơn trước XSS nhưng cần xử lý CSRF; để dành cho phiên bản sau.
