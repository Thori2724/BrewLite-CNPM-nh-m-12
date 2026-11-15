Task 1.3 – Đặc tả một use-case trọng tâm  
<img width="679" height="111" alt="use-case-dac-ta-ver2 drawio" src="https://github.com/user-attachments/assets/2bd9b727-6632-4984-a4e5-fb4c2c79ead1" />

| Thuộc tính | Chi tiết |
| :---- | :---- |
| **Mã Use-case** | UC-01 |
| **Tên Use-case** | Đặt và thanh toán đơn hàng |
| **Tác nhân chính** | Khách hàng (Customer) |
| **Tác nhân phụ** | Cổng thanh toán mô phỏng (Mock Payment Gateway - ZaloPay/Momo) |
| **Mô tả** | Khách hàng thực hiện đặt các món trong giỏ hàng và thanh toán qua mã QR ví điện tử mô phỏng. |
| **Trigger** | Khách hàng bấm vào "Giỏ hàng" và chọn "Tiến hành đặt đơn". |
| **Tiền điều kiện (Preconditions)** | Giỏ hàng có ít nhất 1 sản phẩm. Khách hàng đã đăng nhập tài khoản hợp lệ. |
| **Hậu điều kiện (Postconditions)** | **Thành công:** Đơn hàng chuyển sang trạng thái `PAID`, giỏ hàng được làm rỗng.<br/>**Thanh toán thất bại:** Đơn hàng ở trạng thái `PAYMENT_FAILED`, giữ nguyên giỏ hàng và mã đơn (`orderId`) để khách hàng có thể thanh toán lại từ lịch sử đơn hàng hoặc giỏ hàng. |
| **Luồng chính (Normal Flow)** | 1. Khách hàng xem giỏ hàng và bấm "Tiến hành đặt đơn".<br/>2. Hệ thống kiểm tra mọi món trong giỏ đang bán (`stock > 0`), khởi tạo đơn hàng với trạng thái `PENDING` trong Transaction ACID và chuyển sang trang thanh toán. [Ngoại lệ E2: Có món tạm hết]<br/>3. Khách hàng chọn hình thức nhận hàng ("Tại quầy" hoặc "Mang đi").<br/>4. Khách hàng chọn phương thức thanh toán: Ví điện tử ZaloPay hoặc Momo.<br/>5. Khách hàng bấm "Xác nhận thanh toán".<br/>6. Hệ thống hiển thị màn hình mã QR mô phỏng (tạo từ mã đơn hàng) kèm đồng hồ đếm ngược 5 giây.<br/>7. Khách hàng xem mã QR trong khi hệ thống đếm ngược thời gian.<br/>8. Sau 5 giây không có thao tác hủy, hệ thống tự động gửi yêu cầu thanh toán (`POST /payments`), cổng mô phỏng xác nhận thành công (chuyển đơn sang `PAID` và xóa giỏ hàng). [Ngoại lệ E1: Khách bấm thoát khỏi màn hình QR]<br/>9. Hệ thống thông báo thanh toán thành công, hiển thị mã đơn hàng và điều hướng đến trang chi tiết theo dõi đơn. |
| **Luồng thay thế (Alternative Flows)** | Không có. |
| **Luồng ngoại lệ (Exceptions)** | **E1 (Tại bước 7 hoặc 8):** Khách hàng bấm nút thoát/đóng màn hình mã QR trước khi kết thúc 5 giây. Hệ thống gọi cổng mô phỏng ghi nhận thất bại, đơn hàng chuyển sang trạng thái `PAYMENT_FAILED`. Giỏ hàng và mã đơn hàng được giữ nguyên. Hệ thống thông báo thanh toán thất bại và đưa người dùng quay lại bước 4 (chọn phương thức ví) hoặc cho phép bấm "Thanh toán" lại từ trang chi tiết/lịch sử đơn hàng.<br/>**E2 (Tại bước 2):** Nếu phát hiện có món trong giỏ đã bị gạt sang "tạm hết" (`stock = 0`), hệ thống trả về HTTP 409 Conflict kèm danh sách món tạm hết. Hệ thống thông báo rõ tên món để khách hàng xóa hoặc đổi món khác trước khi đặt lại. |

---

**Liên kết yêu cầu:**
* Chức năng: FR-03 (Giỏ hàng), FR-05 (Khởi tạo Đơn & Thanh toán QR), FR-06 (Lịch sử, Theo dõi & Hủy đơn Khách).
* Phi chức năng: NFR-01 (Hiệu năng), NFR-02 (Bảo mật), NFR-03 (Tính khả dụng Desktop-first/Mobile-responsive), NFR-05 (Độ tin cậy & Idempotency).