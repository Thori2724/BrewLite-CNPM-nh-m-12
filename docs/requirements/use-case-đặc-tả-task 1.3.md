Task 1.3 – Đặc tả một use-case trọng tâm  
<img width="679" height="111" alt="use-case-dac-ta-ver2 drawio" src="https://github.com/user-attachments/assets/2bd9b727-6632-4984-a4e5-fb4c2c79ead1" />


| Mã Use-case  | UC-01 |
| :---- | :---- |
| Tên Use-case  | Đặt và thanh toán đơn hàng  |
| Tác nhân chính | Khách hàng  |
| Tác nhân phụ  | Cổng thanh toán mô phỏng  |
| Mô tả  | Khách hàng muốn đặt và thanh toán đơn hàng. |
| Trigger | Khách hàng bấm "Giỏ hàng". |
| Tiền điều kiện (Preconditions) | Giỏ hàng có ít nhất 1 sản phẩm. Khách hàng đã đăng nhập. |
| Hậu điều kiện (Postconditions)  | Thành công: giỏ hàng rỗng. <br/> Thanh toán thất bại: giữ nguyên giỏ hàng để khách thử lại. Không tạo được đơn. |
| Luồng chính (Normal Flow)  | 1\. Khách xem giỏ hàng, và bấm "Tiến hành đặt đơn".<br/>2\. Hệ thống hiển thị trang checkout.<br/>3\. Người dùng chọn hình thức nhận hàng "Tại quầy" hoặc "Mang đi". Và chọn đặt đơn hàng. <br/>4\. Hệ thống hiển thị trang thanh toán, chọn các phương thức thanh toán (Ví điện tử ZaloPay/ Momo).<br/>5\. Khách hàng xác nhận thanh toán.<br/>6\. Hệ thống hiển thị mã QR thanh toán. <br/>7\. Khách hàng thực hiện thanh toán.<br/>8\. Cổng thanh toán xử lý và trả kết quả thành công E1.<br/>9\. Hệ thống thông báo thanh toán thành công, hiển thị mã đơn và trang thái đơn hàng  |
| Luồng thay thế (Alternative Flows)  | none |
| Luồng ngoại lệ (Exceptions)  | E1 (bước 8) Kiểm tra thấy thanh toán thất bại, hệ thống thông báo quay lại bước 5.|
---

Liên kết yêu cầu:
* Chức năng: FR-03 (Giỏ hàng), FR-05 (Đặt và thanh toán đơn hàng).
