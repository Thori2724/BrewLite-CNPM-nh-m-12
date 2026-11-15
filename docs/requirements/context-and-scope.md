1. **Bối cảnh dự án**  
- **Vấn đề nghiệp vụ**

Hiện trạng tại các cửa hàng truyền thống: Trong các giờ cao điểm (điển hình như giờ nghỉ trưa), khách hàng thường phải xếp hàng dài tại quầy để xem menu, chờ để được order và thanh toán. Việc này kéo dài gây ra tình trạng mất thời gian chờ đợi và làm giảm đi trải nghiệm của khách hàng.  
Hạn chế của quy trình truyền thống: Việc nhân viên nhận order bằng cách nhập liệu thủ công dễ dẫn đến sai sót, nhầm lẫn thức uống hoặc đưa nhầm order của khách này qua khách khác. Điều này gây ra thất thoát nguyên liệu và xung đột giữa khách hàng và nhân viên.  
Vấn đề về phương thức thanh toán: Việc sử dụng tiền mặt đòi hỏi nhân viên phải thối tiền lẻ, dễ xảy ra nhầm lẫn trong quá trình kiểm đếm doanh thu cuối ca hoặc cuối ngày, mất thời gian đối soát và tiềm ẩn rủi ro về an ninh.

- **Giải pháp của ứng dụng BrewLite**

Chuyển đổi số trong quá trình gọi món: Xây dựng ứng dụng web cho phép khách hàng chủ động truy cập menu online trên máy tính hoặc điện thoại để xem trước sản phẩm, lựa chọn và tùy chỉnh các thuộc tính đi kèm (size, lượng đường, đá, topping) mà không cần đợi đến quán order thủ công. Giao diện được thiết kế ưu tiên trải nghiệm trên máy tính (Desktop-first), đồng thời co giãn mượt mà, thân thiện trên di động.  
Tối ưu hóa quy trình thanh toán không dùng tiền mặt: Hệ thống tích hợp phương thức thanh toán ví điện tử mô phỏng (ZaloPay, Momo) thông qua mã QR giả lập. Quá trình giao dịch tự động hóa hoàn toàn, giảm tải áp lực cho thu ngân, đảm bảo chính xác dòng tiền và tăng tốc độ phục vụ.  
Nâng cao hiệu quả quản trị & vận hành: Cung cấp khu vực `/staff` chuyên biệt trên máy tính dành cho Nhân viên và Quản lý: theo dõi và chuyển tiến độ đơn hàng (PAID → PREPARING → READY → COMPLETED), hủy đơn khi cần, gạt bật/tắt trạng thái món "đang bán / tạm hết", thêm/sửa/ẩn món menu và quản lý khóa/mở khóa nhân viên.

2. **Các bên liên quan (Stakeholders)**

| Stakeholder | Vai trò trong hệ thống | Mục tiêu |
| :---- | :---- | :---- |
| Khách hàng (Customer) | Người dùng chính sử dụng web khách để duyệt menu, đặt đơn và theo dõi tiến độ. | Xem menu nhanh, tùy chỉnh món thuận tiện, thanh toán mã QR tiện lợi, tự hủy đơn khi cần và theo dõi trạng thái đơn. |
| Nhân viên quầy (Staff / Barista) | Tiếp nhận và xử lý đơn hàng tại khu vực `/staff`. | Xem danh sách đơn, chuyển trạng thái đơn tiến dần, hủy đơn khi hết nguyên liệu, gạt nhanh trạng thái món "đang bán / tạm hết". |
| Quản lý cửa hàng (Admin) | Quản trị toàn diện hệ thống tại khu vực `/staff`. | Thực hiện toàn bộ quyền của Staff; thêm/sửa/ẩn món menu; xem danh sách và khóa/mở khóa tài khoản nhân viên. |
| Đơn vị thanh toán (Payment Provider - Mock) | Dịch vụ trung gian mô phỏng ví điện tử (ZaloPay, Momo). | Giả lập xử lý thanh toán tự động (thành công sau 5 giây hoặc thất bại khi thoát màn hình QR), kiểm soát idempotency. |
| Giảng viên / Khách hàng nghiệm thu | Đánh giá sản phẩm đồ án môn học. | Kiểm tra tính tuân thủ quy trình phát triển phần mềm, tính đúng đắn của hợp đồng API và chất lượng vận hành. |
| Nhóm phát triển (Dev Team) | Thiết kế, lập trình, kiểm thử và triển khai hệ thống. | Xây dựng hệ thống ổn định, tuân thủ kiến trúc, đáp ứng đầy đủ tiêu chí các Sprint và dễ bảo trì. |

3. **Phạm vi sản phẩm (Product Scope)**  
1) **Trong phạm vi (In-Scope - Hệ thống BrewLite)**

| Phân hệ/Khối chức năng | Chức năng chi tiết | Mô tả tính năng | Đối tượng sử dụng |
| :---- | :---- | :---- | :---- |
| Xác thực & Phân quyền | Đăng ký & Đăng nhập | Tạo tài khoản khách hàng mới; đăng nhập chung cho 3 vai trò (CUSTOMER, STAFF, ADMIN). Cấp token JWT (24 giờ), mật khẩu băm bcrypt. Guard kiểm tra `isActive` mỗi request để chặn ngay tài khoản bị khóa. | Tất cả người dùng |
| Xem menu & Chi tiết món | Danh mục & Chi tiết món | Xem danh sách món theo 4 danh mục (Trà, Cà phê, Trà sữa, Bánh) không cần đăng nhập; hiển thị nhãn "Hết hàng" khi món tạm hết (`stock = 0`), khách không thấy số lượng tồn kho. | Khách hàng |
| | Tùy chỉnh món | Tùy chọn Size (S/M/L), lượng đường (0% - 100%), lượng đá (Không/Ít/Vừa/Nhiều) và Topping cho món nước. Bánh không có size/topping. | Khách hàng |
| Giỏ hàng & Khởi tạo đơn | Quản lý giỏ hàng | Lưu trữ giỏ hàng tại localStorage phía client. Client tự tính giá tạm tính để hiển thị xem trước. | Khách hàng |
| | Khởi tạo đơn hàng | Bắt buộc đăng nhập khi đặt đơn. Kiểm tra mọi món đang bán (`stock > 0`), từ chối cả đơn (409 kèm details) nếu có món tạm hết. Server độc quyền tính giá, khởi tạo đơn trong Database Transaction. | Khách hàng / Server |
| Thanh toán mô phỏng | Thanh toán qua mã QR giả | Chọn ví điện tử (ZaloPay / Momo), hiển thị mã QR mô phỏng tạo từ mã đơn; tự động thành công sau 5 giây (chuyển sang PAID, xóa giỏ hàng) hoặc thất bại khi thoát màn QR (chuyển sang PAYMENT_FAILED, giữ giỏ hàng). Cơ chế `Idempotency-Key` chống thanh toán kép. | Khách hàng |
| Theo dõi & Hủy đơn khách | Lịch sử & Theo dõi đơn | Xem lịch sử đơn hàng cá nhân và chi tiết đơn (tải khi mở trang hoặc bấm "Tải lại", không polling tự động). Cho phép thanh toán lại với đơn PENDING / PAYMENT_FAILED. | Khách hàng |
| | Khách hủy đơn | Khách hàng được hủy đơn của chính mình khi đơn ở trạng thái PENDING, PAYMENT_FAILED, PAID (có hộp thoại xác nhận). | Khách hàng |
| Quản lý đơn hàng quầy (`/staff`) | Danh sách & Lọc đơn | Bảng đơn hàng hiển thị mã đơn, tên khách, tổng tiền, giờ đặt, trạng thái; hỗ trợ lọc theo trạng thái đơn. | Staff, Admin |
| | Chuyển bước tiến độ | Chuyển trạng thái đơn đi tiến: PAID → PREPARING → READY → COMPLETED (không cho phép lùi trạng thái, không timer tự động). | Staff, Admin |
| | Nhân viên hủy đơn | Hủy đơn bất kỳ ở trạng thái PENDING, PAYMENT_FAILED, PAID (khi phát hiện hết nguyên liệu trước khi pha chế). Đơn PAID đã hủy hiện thông báo hoàn tiền mô phỏng. | Staff, Admin |
| Quản lý món (`/staff/products`) | Bật/tắt bán món | Nút gạt chuyển đổi trạng thái "đang bán" (`stock = 999`) / "tạm hết" (`stock = 0`). | Staff, Admin |
| | Thêm, sửa, ẩn món | Thêm món mới vào 4 danh mục có sẵn; sửa thông tin, giá bán (1.000đ - 1.000.000đ), link ảnh (có ảnh mặc định nếu trống); ẩn/hiện món bằng `isVisible`. Không có chức năng xóa hẳn món. | Admin |
| Quản lý nhân viên (`/staff/employees`) | Khóa/Mở khóa Staff | Xem danh sách nhân viên Staff và thực hiện Khóa / Mở khóa tài khoản ngay lập tức thông qua cờ `isActive`. | Admin |

2) **Phạm vi mở rộng (Future Scope)**  
- Khuyến mãi & Tích điểm thành viên: Thiết kế sẵn cấu trúc mô hình dữ liệu (`Promotion`, `LoyaltyTransaction` trong Class diagram) nhưng chưa hiện thực mã nguồn trong phiên bản này.

3) **Không thực hiện (Out-of-Scope)**

| Tính năng | Trạng thái/Scope | Mô tả chi tiết |
| :---- | :---- | :---- |
| Thanh toán tiền mặt | Không hỗ trợ | Hệ thống 100% không dùng tiền mặt, chỉ thanh toán qua ví điện tử mô phỏng. |
| Cổng thanh toán ngân hàng/MoMo thực tế | Không hỗ trợ | Không tích hợp API ngân hàng thực hay sandbox MoMo thật (chỉ dùng Mock Payment QR giả lập). |
| Định vị GPS & Giao hàng tận nơi | Không hỗ trợ | Không hỗ trợ giao hàng tận nơi; chỉ hỗ trợ nhận tại quầy (`AT_COUNTER`) hoặc mang đi (`TAKE_AWAY`). |
| Đánh giá sản phẩm (Review/Rating) | Không hỗ trợ | Không hỗ trợ đánh giá, bình luận hay chấm sao sản phẩm. |
| Khuyến mãi / Voucher giảm giá | Không hỗ trợ | Không áp dụng mã giảm giá, voucher khuyến mãi (chỉ giữ entity mô hình hóa). |
| Tích điểm thành viên (Loyalty Points) | Không hỗ trợ | Không tích lũy và đổi điểm thưởng (chỉ giữ entity mô hình hóa). |
| Tự hủy đơn sau 15 phút | Không hỗ trợ | Đơn không tự động hủy; chỉ hủy khi khách hoặc nhân viên chủ động bấm hủy. |
| Hoàn tiền thật & Lý do hủy đơn | Không hỗ trợ | Không kết nối cổng hoàn tiền thật và không lưu lý do hủy đơn vào CSDL; chỉ hiển thị thông báo hoàn tiền mô phỏng cho đơn PAID. |
| Lùi trạng thái đơn & Timer tự chuyển | Không hỗ trợ | Trạng thái đơn chỉ đi tiến; không có timer tự động nhảy trạng thái đơn quầy. |
| Xóa hẳn món & Tạo danh mục mới | Không hỗ trợ | Không cho phép xóa vĩnh viễn sản phẩm khỏi CSDL (chỉ ẩn/hiện bằng `isVisible`); danh mục cố định 4 loại, không tạo thêm danh mục. |
| Tải ảnh sản phẩm lên server | Không hỗ trợ | Không có tính năng upload file ảnh (chỉ nhập URL hình ảnh `http/https`, ảnh trống dùng ảnh mặc định). |
| Tạo / sửa / xóa tài khoản nhân viên | Không hỗ trợ | Không tạo/sửa/xóa nhân viên trên giao diện; danh sách tài khoản Staff được định sẵn qua seed dữ liệu, Admin chỉ khóa/mở khóa. |
| Xếp ca làm việc & Đổi mật khẩu/hồ sơ | Không hỗ trợ | Không quản lý lịch làm việc/ca kíp và không có màn hình sửa hồ sơ/đổi mật khẩu. |
| Endpoint `GET /auth/me` & Phân trang | Không hỗ trợ | Không cung cấp endpoint `GET /auth/me` và không chia trang (pagination) cho danh sách đơn/món. |
| Cơ chế Polling tự động | Không hỗ trợ | Trang theo dõi đơn không gửi request định kỳ tự động; chỉ tải dữ liệu khi mở trang hoặc khi người dùng bấm nút "Tải lại". |
| Ứng dụng PWA (Progressive Web App) | Không hỗ trợ | Không triển khai PWA/Service Worker offline; ưu tiên thiết kế web Desktop-first và responsive cho di động. |

4. **Giả định, Ràng buộc & Rủi ro**  
1) **Giả định** 

| Yêu cầu | Loại yêu cầu | Nội dung mô tả chi tiết |
| :---- | :---- | :---- |
| Thiết bị & Kết nối người dùng | Phía Khách hàng & Nhân viên | Khách hàng duyệt menu, đặt đơn trên máy tính hoặc điện thoại có kết nối Internet. Nhân viên và Quản lý thao tác xử lý đơn, quản lý món tại khu vực `/staff` được thiết kế tối ưu hóa chuyên biệt trên máy tính (Desktop-first). |
| Xử lý thanh toán mô phỏng | Phía Hệ thống | Giao dịch thanh toán ví điện tử mô phỏng được phản hồi kết quả tức thì (màn hình QR tự động xác nhận thành công sau 5 giây hoặc thất bại khi bấm thoát). |

2) **Ràng buộc**

| Nhóm yêu cầu / Ràng buộc | Hạng mục chi tiết | Nội dung quy định | Ghi chú kỹ thuật |
| :---- | :---- | :---- | :---- |
| Ràng buộc Công nghệ (Tech Stack) | Frontend | Sử dụng **Next.js** | Giao diện tối ưu máy tính (Desktop-first), responsive mượt mà trên di động với Tailwind CSS. |
| | Backend | Sử dụng **NestJS** | Phát triển RESTful API độc lập, áp dụng Guard phân quyền 3 vai trò và Transaction toàn vẹn dữ liệu. |
| | Cơ sở dữ liệu | Sử dụng **PostgreSQL 16 & Prisma** | Quản lý schema quan hệ, migration và cơ chế seed dữ liệu tự động. |
| | Đóng gói & Triển khai | Sử dụng **Docker & Cloud Render** | Container hóa độc lập, build image lên GHCR và tự động deploy qua Deploy Hook trên Render. |
| Ràng buộc Nghiệp vụ (Business Rule) | Phương thức thanh toán | 100% không dùng tiền mặt | Chỉ chấp nhận thanh toán trực tuyến mô phỏng ví điện tử (ZaloPay/Momo). |
| | Kiểm soát thực đơn | Đang bán / Tạm hết | Quy ước `stock > 0` là đang bán, `stock = 0` là tạm hết; không trừ tồn kho đếm từng ly. |
| Ràng buộc Tiến độ (Timeline) | Kế hoạch Sprint | Đúng tiến độ giao việc | Đảm bảo hoàn thành đúng hạn các đầu việc theo bảng phân công Sprint 2. |

3) **Rủi ro**  
- Khách hàng đóng màn hình QR hoặc hủy thanh toán giữa chừng (đơn hàng lưu trạng thái PAYMENT_FAILED, hỗ trợ thanh toán lại bằng nút trên đơn hàng).  
- Xung đột trạng thái khi nhiều nhân viên cùng thao tác trên một đơn hàng (được kiểm soát bằng điều kiện cập nhật trạng thái có điều kiện trong backend, trả mã 409 khi xung đột).  
- Món ăn bị nhân viên gạt sang tạm hết sau khi khách đã thêm vào giỏ hàng (hệ thống kiểm tra lúc đặt đơn và từ chối 409 kèm tên món cụ thể để khách điều chỉnh).