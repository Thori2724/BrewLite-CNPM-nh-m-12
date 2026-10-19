# 1.1 Bối cảnh, Stakeholder và Phạm vi (Context and Scope)

## 1. Vấn đề nghiệp vụ
Ứng dụng **BrewLite** được xây dựng nhằm giải quyết tình trạng ù tắc, xếp hàng chờ đợi lâu tại quầy mua đồ uống (cà phê, trà sữa) vào giờ cao điểm, đồng thời số hóa quy trình đặt hàng và thanh toán không dùng tiền mặt cho khách hàng.

## 2. Bảng Stakeholder (Các bên liên quan)
| Stakeholder | Vai trò & Trách nhiệm | Mục tiêu & Kỳ vọng |
| :--- | :--- | :--- |
| **Khách hàng** | Người sử dụng ứng dụng đặt đồ uống | Đặt món nhanh, tùy chỉnh size/topping, thanh toán không tiền mặt thuận lợi, theo dõi trạng thái đơn hàng. |
| **Nhân viên quầy / Barista** | Tiếp nhận và pha chế đơn hàng | Nhận thông tin đơn hàng chính xác, cập nhật trạng thái pha chế nhanh chóng (Mở rộng ngoài MVP). |
| **Quản lý cửa hàng / PO** | Quản lý sản phẩm, theo dõi doanh thu và quy trình | Xác định yêu cầu, quản lý Product Backlog, tối ưu hóa thời gian phục vụ. |
| **Giảng viên nghiệm thu** | Đánh giá học phần Công nghệ Phần mềm | Đảm bảo nhóm tuân thủ đúng quy trình Agile/Scrum, kiến trúc chuẩn (Next.js, NestJS, PostgreSQL, Docker) và kiểm thử đầy đủ. |
| **Nhóm phát triển** | Phân tích, thiết kế, lập trình, kiểm thử và DevOps | Hoàn thành các task theo từng Sprint, đảm bảo chất lượng code và tính năng chạy ổn định. |
| **Đơn vị thanh toán** | Xử lý giao dịch tài chính (Momo/VNPay/Stripe) | Cung cấp dịch vụ thanh toán hoặc được mô phỏng chính xác qua Mock Payment Service. |

## 3. Phạm vi sản phẩm (Scope)
- **Trong phạm vi MVP (In-scope):** 
  - Xem danh sách menu và chi tiết sản phẩm (chọn size, topping).
  - Quản lý giỏ hàng (thêm, sửa, xóa, tính tổng tiền tự động).
  - Đăng ký, đăng nhập tài khoản bảo mật bằng JWT.
  - Tạo đơn hàng và thanh toán không tiền mặt qua cổng thanh toán mô phỏng (Ví/Thẻ).
  - Hiển thị màn hình xác nhận đơn hàng (mã đơn, trạng thái) và lịch sử đơn hàng cá nhân.
- **Phạm vi mở rộng (Out-of-scope / Future):** 
  - Giao diện quản lý thời gian thực dành cho nhân viên pha chế (Barista dashboard).
  - Hệ thống tích hợp máy in hóa đơn tự động tại quầy.

## 4. Giả định, Ràng buộc và Rủi ro
- **Giả định:** Người dùng có thiết bị di động hoặc máy tính có kết nối Internet ổn định để truy cập ứng dụng web (PWA/Mobile-first).
- **Ràng buộc:** Bắt buộc sử dụng công nghệ Next.js cho Frontend, NestJS cho Backend, PostgreSQL cho CSDL và đóng gói toàn bộ bằng Docker.
- **Rủi ro ban đầu:** Xung đột phiên bản mã nguồn khi các thành viên trong nhóm cùng làm việc (được giải quyết bằng Git Branching và quy trình CI kiểm tra tự động).
