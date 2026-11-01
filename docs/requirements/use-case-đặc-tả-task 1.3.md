Task 1.3 – Đặc tả một use-case trọng tâm  
<img width="1498" height="1092" alt="use-case-đặc-tả-task-1 3" src="https://github.com/user-attachments/assets/17f0dba8-1be6-4183-9fc5-f430aeb37626" />

| Mã Use-case  | UC-01 |
| :---- | :---- |
| Tên Use-case  | Đặt và thanh toán đơn hàng  |
| Tác nhân chính | Khách hàng  |
| Tác nhân phụ  | Cổng thanh toán mô phỏng  |
| Mô tả  | Khách hàng xác nhận giỏ hàng, hệ thống kiểm tra đăng nhập và tồn kho, tạo đơn rồi thanh toán không tiền mặt (Ví điện tử/Thẻ ngân hàng). |
| Trigger | Khách hàng nhấn nút Đặt đơn tại màn hình giỏ hàng.  |
| Tiền điều kiện (Preconditions) | Giỏ hàng có ít nhất 01 sản phẩm hợp lệ.  |
| Hậu điều kiện (Postconditions)  | Thành công: đơn PAID, giỏ hàng rỗng, tồn kho đã trừ, hiển thị mã đơn; cộng điểm (nếu làm FR-11). Thanh toán thất bại: đơn PAYMENT\_FAILED, giữ nguyên tồn kho và giỏ hàng để thử lại. Không tạo được đơn: không có đơn mới, tồn kho và giỏ hàng không đổi. Quá hạn: đơn CANCELLED, tồn kho được hoàn lại.  |
| Luồng chính (Normal Flow)  | 1\. Khách xem giỏ hàng, chọn hình thức nhận hàng (Tại quầy / Mang đi), nhấn “Đặt đơn”. 2\. Hệ thống kiểm tra đăng nhập. 3\. Hệ thống kiểm tra tồn kho từng món. 4\. Trong một transaction: tạo đơn PENDING, lưu chi tiết món, trừ tồn kho. 5\. Hệ thống hiển thị các phương thức thanh toán (Ví điện tử / Thẻ ngân hàng). 6\. Khách chọn phương thức và xác nhận. 7\. Hệ thống gọi Cổng thanh toán mô phỏng, kèm Idempotency-Key. 8\. Cổng thanh toán trả kết quả thành công. 9\. Hệ thống chuyển đơn sang PAID, tạo bản ghi thanh toán, làm rỗng giỏ hàng, cộng điểm (nếu làm FR-11). 10\. Hệ thống hiển thị xác nhận kèm mã đơn và thông báo nhận nước.  |
| Luồng thay thế (Alternative Flows)  | 1 (bước 2\) – Chưa đăng nhập hoặc JWT hết hạn (401): chuyển sang trang Đăng nhập/Đăng ký, giữ nguyên giỏ hàng; đăng nhập xong quay lại giỏ hàng và tiếp tục từ bước 3\. A2 (trước bước 6\) – Áp dụng mã giảm giá (nếu làm FR-10): mã hợp lệ → tính lại tổng tiền; mã không hợp lệ → báo lỗi, giữ tổng ban đầu, khách nhập mã khác hoặc tiếp tục thanh toán.  |
| Luồng ngoại lệ (Exceptions)  | E1 (bước 1\) – Giỏ hàng rỗng hoặc dữ liệu không hợp lệ (400): báo lỗi, không tạo đơn. E2 (bước 3-4) – Vượt tồn kho hoặc xung đột đặt đồng thời: rollback, không tạo đơn, không trừ kho, báo hết hàng, giữ giỏ hàng. E3 (bước 7\) – Gửi lặp yêu cầu thanh toán cùng Idempotency-Key: trả lại kết quả lần đầu, không tạo giao dịch hay đơn mới. E4 (bước 8\) – Thanh toán thất bại hoặc quá thời gian chờ: đơn chuyển PAYMENT\_FAILED, giữ tồn kho và giỏ hàng; khách nhấn “Thử lại thanh toán” trên cùng đơn và quay lại bước 5\. E5 (sau bước 4\) – Quá 15 phút ở trạng thái PENDING hoặc PAYMENT\_FAILED (hoặc khách bỏ đi): đơn chuyển CANCELLED, hoàn tồn kho; muốn mua phải đặt đơn mới.  |

#### 

Liên kết yêu cầu

* Chức năng: FR-03 (Giỏ hàng), FR-04 (Xác thực), FR-05 (Khởi tạo đơn hàng), FR-06 (Thanh toán đơn hàng), FR-07 (Lịch sử & Theo dõi Đơn); mở rộng FR-10 (Khuyến mãi & Voucher), FR-11 (Tích điểm Thành viên).  
* Phi chức năng: NFR-02 (Bảo mật), NFR-05 (Độ tin cậy & Idempotency).
