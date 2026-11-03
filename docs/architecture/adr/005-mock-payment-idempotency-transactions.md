# ADR-005: Thanh toán mô phỏng, idempotency và transaction

- **Trạng thái:** Accepted
- **Ngày:** 2026-11-03

## Bối cảnh
Cần thanh toán Ví/Thẻ mô phỏng nhưng vẫn phải đúng nghiệp vụ thật: client có thể gửi lại yêu cầu thanh toán, nhiều khách đặt cùng lúc, và đơn chỉ được chuyển trạng thái hợp lệ.

## Quyết định
1. **Mô phỏng sau interface:** `PaymentGateway` là interface; `MockPaymentGateway` giả lập thành công/thất bại theo cấu hình. Thay cổng thật chỉ cần viết adapter mới.
2. **Idempotency:** client gửi header `Idempotency-Key` (UUID) cho `POST /payments`. Bảng `Payment` có ràng buộc duy nhất trên key; gửi lại cùng key trả về kết quả đã lưu, không tạo giao dịch hoặc đơn thứ hai.
3. **Transaction:** tạo đơn và trừ tồn kho trong một transaction; cập nhật tồn kho có điều kiện (khóa lạc quan). Thất bại thì rollback toàn bộ.
4. **State machine:** hàm `assertTransition` chặn mọi chuyển trạng thái đơn không nằm trong danh sách cho phép.
5. Server tự tính tổng tiền từ giá trong DB.

## Hệ quả
- Có thể chứng minh bằng test: chặn chuyển trạng thái sai, hai lần cùng key chỉ một đơn, đặt đồng thời không vượt tồn kho.
- Hạn chế: mock không phản ánh độ trễ hoặc lỗi mạng của cổng thật; xử lý callback/webhook nằm ngoài phạm vi MVP.

## Phương án đã xem xét
- **Tích hợp sandbox cổng thật (Stripe/VNPay):** sát thực tế hơn nhưng tốn thời gian đăng ký và cấu hình, không bắt buộc.
- **Khóa bi quan (`SELECT ... FOR UPDATE`):** đơn giản về logic nhưng giữ khóa lâu; chọn khóa lạc quan theo đề bài.
