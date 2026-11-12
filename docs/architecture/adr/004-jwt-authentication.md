# ADR-004: Xác thực bằng JWT và bcrypt

- **Trạng thái:** Accepted
- **Ngày:** 2026-11-03 (Cập nhật đồng bộ Hợp đồng API)

## Bối cảnh
Người dùng cần đăng ký và đăng nhập để đặt đơn, thanh toán và xem lịch sử đơn hàng. NFR yêu cầu băm mật khẩu an toàn và sử dụng JWT để phân quyền người dùng không trạng thái (stateless).

## Quyết định
1. **Băm mật khẩu:** Mật khẩu người dùng bắt buộc được băm bằng thuật toán **bcrypt** (độ dài muối mặc định 10 rounds). Mật khẩu gốc tuyệt đối không bao giờ được lưu trữ vào cơ sở dữ liệu hay in ra log.
2. **Thời hạn JWT Token:**
   - Khi đăng nhập thành công (`POST /auth/login`), hệ thống trả về mã `accessToken` với **thời hạn hết hạn chính xác là 24 giờ** (`expiresIn: '24h'`).
   - Phía Client lưu trữ token và gửi kèm trong HTTP Header: `Authorization: Bearer <accessToken>` cho tất cả các endpoint yêu cầu xác thực (`/orders`, `/payments`, `/orders/me`, `/orders/:id`).
3. **Phân quyền và Bảo mật:**
   - Backend sử dụng NestJS `JwtAuthGuard` để bảo vệ các route riêng tư.
   - Khi token hợp lệ, Guard tự động trích xuất thông tin người dùng (`userId`, `email`, `role`) gắn vào đối tượng Request.
   - Các API tạo đơn và xem chi tiết đơn chỉ cho phép chính chủ nhân của đơn hàng thao tác (người dùng khác truy cập sẽ nhận mã lỗi 404).
4. **Không dùng Refresh Token trong MVP:**
   - Để tối giản kiến trúc theo hợp đồng API, hệ thống không sử dụng refresh token. Khi token hết hạn (sau 24 giờ), người dùng chỉ cần đăng nhập lại.
5. **Quản lý khóa bí mật:**
   - `JWT_SECRET` được đọc từ biến môi trường của hệ thống, tuyệt đối không hardcode trong mã nguồn và không đưa vào kho Git.

## Hệ quả
- Kiến trúc stateless hoàn toàn, giúp máy chủ API không tốn bộ nhớ lưu trữ session và dễ dàng triển khai.
- Thời hạn 24 giờ mang lại trải nghiệm tiện lợi cho khách hàng quán nước trong suốt ngày làm việc mà không phải đăng nhập lại liên tục.
- Hạn chế: Token lưu trữ ở Client có rủi ro bị đánh cắp qua tấn công XSS; không thể thu hồi token đơn lẻ trước thời hạn 24 giờ nếu bị lộ.
- Giảm thiểu: Áp dụng cơ chế validate dữ liệu nghiêm ngặt, cấu hình CORS chặt chẽ, không ghi log token.

## Phương án đã xem xét
- **Session phía server:** Dễ thu hồi session nhưng làm tăng độ phức tạp khi mở rộng nhiều instance và đòi hỏi cấu hình cookie/CORS phức tạp hơn.
- **JWT thời hạn ngắn (15 phút) kèm Refresh Token:** Tăng độ an toàn nhưng đòi hỏi thêm cơ chế xoay vòng token (token rotation), bảng lưu trữ refresh token và luồng làm mới token phức tạp ở Frontend, vượt quá phạm vi MVP của đồ án.
