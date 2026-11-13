**Task 1.2 – Yêu cầu chức năng và phi chức năng**
**Ràng buộc công nghệ hệ thống:** Frontend Next.js, Backend NestJS, CSDL PostgreSQL và đóng gói bằng Docker.

**Danh mục Yêu cầu Chức năng**

| Mã YC | Nhóm Chức năng | Mô tả Chi tiết Yêu cầu | Mức Ưu tiên MoSCoW | Tiêu chí Chấp nhận |
| ----- | ----- | ----- | ----- | ----- |
| **FR-01** | **Menu** | Khách hàng có thể xem danh sách sản phẩm theo từng danh mục kèm hình ảnh, tên món và giá tiền. | **Must** |- Hỗ trợ lọc theo danh mục và tìm kiếm theo tên món. <br/> - Hiển thị nhãn "Hết hàng" nếu sản phẩm có không còn. |
| **FR-02** | **Chi tiết Sản phẩm** | Khách hàng chọn một sản phẩm để xem chi tiết và tùy chỉnh các thuộc tính: Size, Lượng đường, Lượng đá, Topping  | **Must** | - Giá của món tự động cập nhật chính xác theo Size và Topping được chọn. <br/> - Cho phép nhập ghi chú riêng cho từng món. |
| **FR-03** | **Giỏ hàng** | Khách hàng có thể xem danh sách món trong giỏ và thực hiện thao tác thêm, sửa, xóa món. | **Must** | - Hiển thị chi tiết từng item: Tên, Size, Đá/Đường, Topping, Ghi chú, Tổng tiền. <br/>- Tự động tính tổng số tiền của toàn bộ giỏ hàng phía khách hàng để xem trước.
| **FR-04** | **Xác thực** | Khách hàng thực hiện đăng ký, đăng nhập tài khoản. | **Must** | - Băm mật khẩu bằng bcrypt trước khi lưu vào CSDL. <br/>- Khách hàng đăng ký tài khoản với vai trò Customer. |
| **FR-05** | **Đặt và thanh toán đơn hàng** | Khách hàng đã đăng nhập có thể tiến hành đặt đơn từ giỏ hàng và thanh toán. | **Must** | - Nếu khách hàng chưa đăng nhập $\to$ Chuyển hướng sang trang Đăng nhập và giữ nguyên dữ liệu giỏ hàng. <br/>- Tạo bản ghi đơn hàng với trạng thái ban đầu là PENDING, lưu chi tiết các món hàng, tự động tính giá và trả về mã đơn. <br/> - Khách chọn 1 trong 2 hình thức thanh toán. <br/>- Khi khách hàng thực hiện thanh toán thành công thì trạng thái đơn hàng là PAID, nếu thất bại vẫn là PENDING. |
| **FR-07** | **Lịch sử đơn** | Khách hàng xem danh sách các đơn hàng đã đặt và theo dõi trạng thái đơn hàng. | **Must** | - Hiển thị danh sách đơn. <br/>- Hiển thị đúng các mốc trạng thái: PENDING $\to$ PAID $\to$ PREPARING $\to$ READY $\to$ COMPLETED. |
| **FR-08** | **Quản lý Trạng thái Đơn** | Nhân viên quầy xem danh sách đơn hàng và cập nhật tiến độ pha chế theo các mốc trạng thái hợp lệ. | **Must** | PENDING → PAID  → PREPARING → READY → COMPLETED.  Thanh toán lỗi (PAYMENT_FAILED, có thể thử lại) hoặc hủy đơn (CANCELLED). |
| **FR-09** | **Quản lý món (Admin)** | Quản lý có thể thêm sản phẩm mới, cập nhật giá, chỉnh sửa danh mục hoặc ẩn/hiện sản phẩm. | **Must** | Quản lý thao tác trực tiếp trên web. |
| **FR-10** | **Khuyến mãi & Voucher** | Khách hàng nhập mã giảm giá tại bước đặt đơn để nhận ưu đãi khấu trừ trực tiếp. | **Won’t** | Khi nhập Voucher sẽ được giảm giá.|
| **FR-11** | **Quản lý nhân viên** | Xem thông tin nhân viên và khóa quyền hạn nhân viên. | **Must** | Quản lý thao tác trực tiếp trên web. |

**Danh mục Yêu cầu Phi chức năng**

| Mã YC | Phân loại | Mô tả Chi tiết Yêu cầu | Mức Ưu tiên MoSCoW | Tiêu chí Chấp nhận |
| ----- | ----- | ----- | ----- | ----- |
| **NFR-01** | **Khả năng triển khai** | Đóng gói ứng dụng dạng Containerization và tự động hóa quy trình CI/CD. | **Must** | - Có tệp docker-compose.yml để khởi chạy đầy đủ Web (Next.js), API (NestJS) và DB (PostgreSQL) ở môi trường Local chỉ với 1 câu lệnh. <br/>- Pipeline GitHub Actions CI tự động chạy lint, test và build khi mở Pull Request. <br/>- Thiết lập pipeline CD tự động đóng gói Docker image gắn commit SHA đẩy lên GHCR và deploy lên môi trường Production Render qua Deploy Hook. <br/>- API bắt buộc có endpoint kiểm tra sức khỏe hệ thống (GET /health), chạy smoke test sau khi deploy và có cơ chế rollback khi triển khai thất bại. |
| **NFR-02** | **Khả năng bảo trì** | Mã nguồn được tổ chức sạch sẽ, có tài liệu hướng dẫn và ma trận truy vết đầy đủ. | **Must** | - Cấu trúc repository chuẩn (apps/web, apps/api, docs/, tests/). <br/>- Mọi mã yêu cầu (FR/NFR) đều được liên kết trực tiếp với Use-case, API Endpoint và Test Case trong docs/traceability-matrix.md. |

**Use-case chung của hệ thống:**
<img width="2214" height="1184" alt="use-case-tong-quat-ver2 drawio" src="https://github.com/user-attachments/assets/cc037ed2-6a2d-440f-8cfd-33c917c4117d" />

