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
| Hậu điều kiện (Postconditions)  | Thành công: đơn PAID, giỏ hàng rỗng, tồn kho đã trừ, hiển thị màn hình xác nhận mã đơn. Thanh toán thất bại: đơn PAYMENT\_FAILED, giữ nguyên tồn kho và giỏ hàng để khách thử lại. Không tạo được đơn (hết hàng hoặc lỗi dữ liệu): không có đơn mới, tồn kho và giỏ hàng không đổi.  |
| Luồng chính (Normal Flow)  | 1\. Khách xem giỏ hàng, chọn hình thức nhận hàng (Tại quầy / Mang đi), nhấn “Đặt đơn”.<br/>2\. Hệ thống kiểm tra đăng nhập (JWT token).<br/>3\. Hệ thống kiểm tra tồn kho cộng gộp từng món.<br/>4\. Trong một transaction ACID: tạo đơn PENDING, lưu chi tiết món, trừ trực tiếp tồn kho.<br/>5\. Hệ thống hiển thị các phương thức thanh toán (Ví điện tử / Thẻ ngân hàng).<br/>6\. Khách chọn phương thức, nhập thông tin tài khoản và xác nhận thanh toán.<br/>7\. Hệ thống gọi Cổng thanh toán mô phỏng kèm Idempotency-Key.<br/>8\. Cổng thanh toán xử lý và trả kết quả thành công.<br/>9\. Hệ thống chuyển đơn sang PAID, tạo bản ghi thanh toán SUCCESS, làm rỗng giỏ hàng.<br/>10\. Hệ thống hiển thị màn hình xác nhận kèm mã đơn và thông báo cho khách.  |
| Luồng thay thế (Alternative Flows)  | A1 (bước 2) – Chưa đăng nhập hoặc JWT hết hạn (401): chuyển sang trang Đăng nhập/Đăng ký, giữ nguyên giỏ hàng; đăng nhập xong quay lại giỏ hàng và tiếp tục từ bước 3.  |
| Luồng ngoại lệ (Exceptions)  | E1 (bước 1) – Giỏ hàng rỗng hoặc dữ liệu không hợp lệ (400): báo lỗi, không tạo đơn.<br/>E2 (bước 3-4) – Vượt tồn kho hoặc thiếu hàng: transaction rollback, không tạo đơn, không trừ kho, báo 409 Conflict kèm danh sách món thiếu, giữ nguyên giỏ hàng.<br/>E3 (bước 7) – Gửi lặp yêu cầu thanh toán cùng Idempotency-Key: trả lại ngay kết quả của lần thanh toán trước (200 OK), không tạo giao dịch hay trừ tiền mới.<br/>E4 (bước 8) – Thanh toán thất bại qua cổng mô phỏng (số tài khoản kết thúc 0000): đơn chuyển sang PAYMENT\_FAILED, giữ nguyên tồn kho và giỏ hàng; khách nhấn “Thử lại thanh toán” với Idempotency-Key mới trên cùng đơn hàng đó và quay lại bước 5.  |

---

Liên kết yêu cầu:
* Chức năng: FR-03 (Giỏ hàng), FR-04 (Xác thực), FR-05 (Khởi tạo đơn hàng), FR-06 (Thanh toán đơn hàng), FR-07 (Lịch sử & Theo dõi Đơn); mở rộng FR-10 (Khuyến mãi & Voucher), FR-11 (Tích điểm Thành viên).  
* Phi chức năng: NFR-02 (Bảo mật), NFR-05 (Độ tin cậy & Idempotency).
