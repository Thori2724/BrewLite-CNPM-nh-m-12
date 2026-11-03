# Quy tắc cho AI trợ lý lập trình (dự án BrewLite)

Đọc kỹ file này trước khi làm bất cứ việc gì trong repo.

## Nguồn sự thật (không tự ý thay đổi)
- Yêu cầu: `docs/requirements/`
- Sơ đồ: `docs/diagrams/`
- Kiến trúc và quyết định: `docs/architecture/architecture.md` và `docs/architecture/adr/`
- Nếu thấy tài liệu mâu thuẫn, thiếu, hoặc code cần khác tài liệu: DỪNG và hỏi tôi, không tự quyết.

## Công nghệ cố định
- Frontend: Next.js trong `apps/web`
- Backend: NestJS trong `apps/api`
- Database: PostgreSQL + Prisma
- Chạy local: Docker Compose
- Không thêm hoặc thay framework, thư viện lớn, dịch vụ mới nếu chưa hỏi tôi.

## Cách làm việc
1. Mỗi lần chỉ làm MỘT việc nhỏ tôi nêu. Không làm thêm phần ngoài yêu cầu.
2. Trước khi viết code: nói ngắn gọn sẽ tạo hoặc sửa những file nào, rồi chờ tôi đồng ý.
3. Sau khi viết code: hướng dẫn tôi chạy và kiểm tra từng bước (lệnh cụ thể hoặc request Postman), và nói rõ kết quả đúng trông như thế nào.
4. Không xóa file, không ghi đè nhiều file cùng lúc mà không báo trước.
5. Giải thích bằng tiếng Việt đơn giản. Tôi không biết lập trình.
6. Khi gặp lỗi: chỉ ra nguyên nhân và cách sửa tối thiểu, không viết lại cả phần code.

## Quy tắc code
- Dùng TypeScript.
- API phải validate dữ liệu đầu vào (class-validator). Tiền do server tính, không tin giá từ client.
- Mật khẩu băm bằng bcrypt. Xác thực bằng JWT.
- Không viết secret, mật khẩu, khóa truy cập vào code hoặc log. Dùng biến môi trường, cập nhật `.env.example`, không bao giờ commit `.env`.
- Mỗi tính năng có test tối thiểu.
- Đơn hàng chỉ chuyển trạng thái theo state machine: PENDING → PAID → PREPARING → READY → COMPLETED, cộng PAYMENT_FAILED và CANCELLED.
- Thanh toán dùng header `Idempotency-Key`; tạo đơn và trừ tồn kho nằm trong một transaction.

## Git
- Làm trên nhánh riêng, commit nhỏ, thông điệp rõ (`feat:`, `fix:`, `docs:`), mở pull request.

## Khi nào một việc được coi là xong
- Chạy được, không lỗi build, lint và test đều qua.
- README đã cập nhật cách chạy.
- Tôi đã tự chạy thử và thấy đúng.