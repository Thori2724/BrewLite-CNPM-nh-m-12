# ADR-005: Thanh toán mô phỏng, Idempotency và Giao dịch ACID

- **Trạng thái:** Accepted
- **Ngày:** 2026-11-03 (Cập nhật đồng bộ Hợp đồng API)

## Bối cảnh
Hệ thống cần cung cấp tính năng thanh toán không tiền mặt mô phỏng (Ví điện tử hoặc Thẻ) nhưng phải đảm bảo trọn vẹn các tính chất nghiệp vụ thực tế:
- Khách hàng bấm gửi nhiều lần hoặc mạng chập chờn không được dẫn đến trừ tiền hai lần.
- Đặt đơn đồng thời không được bán vượt quá số lượng tồn kho.
- Chuyển trạng thái đơn hàng phải tuân thủ nghiêm ngặt máy trạng thái.

## Quyết định
1. **Cổng thanh toán mô phỏng sau Interface (`PaymentGateway`):**
   - Thiết kế giao diện `PaymentGateway` độc lập.
   - Quy tắc giả lập: Nếu số tài khoản/số thẻ kết thúc bằng `"0000"` $\to$ Giao dịch thất bại (`FAILED`), đơn chuyển sang `PAYMENT_FAILED`. Các số tài khoản khác $\to$ Giao dịch thành công (`SUCCESS`), đơn chuyển sang `PAID`.
   - **Bảo mật:** Hệ thống chỉ lưu 4 số cuối vào bảng Payment (`accountLast4`). Tuyệt đối không lưu trữ hay ghi log toàn bộ số tài khoản của khách hàng.
2. **Khóa Idempotency phân biệt theo từng người dùng:**
   - Client bắt buộc gửi header `Idempotency-Key` (chuỗi từ 8 đến 100 ký tự) khi gọi `POST /payments`.
   - Khóa được quản lý **duy nhất theo từng người dùng** (`userId` + `idempotencyKey`).
   - **Thứ tự kiểm tra phía Server:**
     - Bước 1: Kiểm tra khóa của người dùng hiện tại trong cơ sở dữ liệu.
     - Bước 2: Nếu khóa đã tồn tại và cùng `orderId` $\to$ Trả lại ngay kết quả của lần thanh toán trước với mã **HTTP 200 OK** (tránh báo lỗi 409 khi đơn đã sang trạng thái PAID).
     - Bước 3: Nếu khóa đã tồn tại nhưng dùng cho một `orderId` khác $\to$ Trả về lỗi **HTTP 409 Conflict**.
     - Bước 4: Kiểm tra trạng thái đơn hàng (chỉ cho phép thanh toán khi đơn ở trạng thái `PENDING` hoặc `PAYMENT_FAILED`).
     - Bước 5: Thực thi thanh toán và lưu bản ghi Payment.
   - **Cơ chế thử lại (Retry):** Khi thanh toán bị `FAILED`, khách hàng có thể bấm "Thử lại thanh toán" cho đơn đó với một `Idempotency-Key` **MỚI**.
3. **Transaction tạo đơn và trừ tồn kho (ACID):**
   - **Bỏ khóa lạc quan và cột `version`**.
   - Toàn bộ thao tác tạo `Order`, các `OrderItem`, `OrderItemTopping` và trừ tồn kho của `Product` được thực thi trong **1 Prisma Transaction duy nhất**.
   - Kiểm tra tồn kho theo nguyên tắc cộng gộp: Nếu một món xuất hiện nhiều dòng trong giỏ, cộng dồn tổng số lượng để so sánh với `stock`. Điều kiện trừ kho: `stock >= totalRequestedQuantity`. Nếu thiếu hàng, transaction tự động hủy toàn bộ và trả về 409 Conflict kèm chi tiết món thiếu.
4. **Máy trạng thái đơn hàng (Order State Machine):**
   - Các trạng thái hợp lệ: `PENDING` $\to$ `PAID` $\to$ `PREPARING` $\to$ `READY` $\to$ `COMPLETED`, cùng hai nhánh kết thúc: `PAYMENT_FAILED` (cho phép thanh toán lại) và `CANCELLED`.
   - Hàm kiểm tra chuyển trạng thái (`validateTransition`) chặn đứng mọi chuyển đổi bất hợp pháp (ví dụ từ `PENDING` nhảy thẳng lên `COMPLETED`).
5. **Tính tiền độc quyền tại Server:**
   - Server tự tính giá từng dòng món (`unitPrice` = `basePrice` + phụ thu size + phụ thu toppings) và tổng tiền đơn hàng (`totalAmount`). Tuyệt đối không nhận giá hay tổng tiền từ client.

## Hệ quả
- Khắc phục hoàn toàn lỗi trừ tiền 2 lần (double charge) bằng cơ chế Idempotency chuẩn hóa theo từng người dùng.
- Trừ kho nguyên tử (atomic), không phụ thuộc vào cột version, loại bỏ nguy cơ deadlock hoặc xung đột giả.
- Hạn chế: Cổng mô phỏng không có độ trễ mạng thực tế hay webhook từ bên thứ ba. Tuy nhiên, nhờ thiết kế trừu tượng qua `PaymentGateway`, hệ thống có thể tích hợp cổng thật (Momo, VNPay, ZaloPay) bất cứ lúc nào.

## Phương án đã xem xét
- **Khóa lạc quan với cột `version`:** Đã xem xét nhưng bị bãi bỏ vì gây khó khăn khi một đơn chứa nhiều món giống nhau và không cần thiết trong mô hình giao dịch đơn lẻ.
- **Idempotency-Key toàn cục không phân biệt User:** Gây xung đột nếu hai khách hàng ngẫu nhiên sinh cùng chuỗi key; việc gắn key theo `userId` đảm bảo an toàn tuyệt đối.
