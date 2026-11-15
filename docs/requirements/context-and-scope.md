1. **Bối cảnh dự án**  
- **Vấn đề nghiệp vụ**

Hiện trạng tại các cửa hàng truyền thống: Trong các giờ cao điểm (điển hình như giờ nghỉ trưa), khách hàng thường phải xếp hàng dài tại quầy để xem menu, chờ để được order và thanh toán. Việc này kéo dài gây ra tình trạng mất thời gian chờ đợi và làm giảm đi trải nghiệm của khách hàng.  
Hạn chế của quy trình truyền thống: Việc nhân viên nhận order bằng cách nhập liệu thủ công dễ dẫn đến sai sót, nhầm lẫn thức uống hoặc đưa nhầm order của khách này qua khách khác. Điều này gây ra thất thoát nguyên liệu và xung đột giữa khách hàng và nhân viên.  
Vấn đề về phương thức thanh toán: Việc sử dụng tiền mặt đòi hỏi nhân viên phải thối tiền lẻ, dễ xảy ra nhầm lẫn trong quá trình kiểm đếm doanh thu cuối ca hoặc cuối ngày, mất thời gian đối soát và tiềm ẩn rủi ro về an ninh.

- **Giải pháp của ứng dụng BrewLite**

Chuyển đổi số trong quá trình gọi món: Xây dựng ứng dụng web cho phép khách hàng chủ động truy cập menu online trên thiết bị máy tính hoặc điện thoại của mình để xem trước các sản phẩm nước, lựa chọn và tùy chỉnh các mục đi kèm (size, lượng đường, đá, topping) mà không cần đợi đến quán và order thủ công với nhân viên. Giao diện được thiết kế ưu tiên trải nghiệm trên máy tính (Desktop-first), đồng thời co giãn mượt mà trên di động.  
Tối ưu hóa quy trình thanh toán không dùng tiền mặt: Hệ thống tích hợp phương thức thanh toán hiện đại thông qua ví điện tử/thẻ ngân hàng mô phỏng. Điều này giúp tự động hóa quá trình giao dịch, giảm tải áp lực cho nhân viên thu ngân, đảm bảo tính chính xác về dòng tiền và tăng tốc độ phục vụ.  
Nâng cao hiệu quả quản trị: Giúp cửa hàng số hóa dữ liệu đơn hàng, theo dõi trạng thái đơn hàng rõ ràng (từ Chờ thanh toán (PENDING), Đã thanh toán (PAID), đến các trạng thái mở rộng PREPARING, READY, COMPLETED).

2. **Các bên liên quan (Stakeholders)**

| Stakeholder | Vai trò trong hệ thống | Mục tiêu |
| :---- | :---- | :---- |
| Khách hàng (Customer) | Người dùng chính của web để chọn món và đặt hàng. | Xem menu nhanh, chỉnh sửa món dễ dàng, thanh toán tiện lợi, theo dõi trạng thái đơn hàng. |
| Nhân viên quầy (Barista/Cashier) | Tiếp nhận thông tin đơn hàng đã thanh toán. | Nắm bắt đơn hàng chính xác, giảm áp lực xếp hàng tại quầy (màn hình quầy là phạm vi mở rộng). |
| Quản lý cửa hàng (Store Manager) | Quản lý danh mục món, theo dõi kinh doanh. | Ẩn/hiện món trực tiếp trong cơ sở dữ liệu (chưa làm giao diện quản trị web). |
| Đơn vị thanh toán (Payment Provider \- Mock) | Dịch vụ trung gian mô phỏng xử lý ví điện tử/thẻ ngân hàng. | Xử lý phản hồi thanh toán thành công hay thất bại một cách chính xác và nhanh chóng. |
| Giảng viên/Khách hàng nghiệm thu | Đánh giá sản phẩm đồ án. | Bài tập đáp ứng đúng quy trình phát triển phần mềm, tính năng hoạt động mượt mà. |
| Nhóm phát triển (Dev Team) | Thiết kế, lập trình, kiểm thử và triển khai hệ thống. | Xây dựng hệ thống hoàn thành đúng hạn các Sprint, đảm bảo tính ổn định và dễ bảo trì. |

3. **Phạm vi sản phẩm (Product Scope)**  
1) **Trong phạm vi (In-Scope \- MVP)**

| Phân hệ/Khối chức năng | Chức năng chi tiết | Mô tả tính năng | Đối tượng sử dụng |
| :---- | :---- | :---- | :---- |
| Xác thực người dùng | Đăng ký & Đăng nhập | Cho phép người dùng tạo tài khoản mới và đăng nhập hệ thống bằng Email/Mật khẩu (Xác thực an toàn bằng **JWT 24 giờ**, băm bcrypt). | Tất cả người dùng |
| Xem menu & Tìm kiếm | Danh mục & Chi tiết món | Hiển thị danh sách đồ uống phân theo từng danh mục; xem chi tiết thông tin món. | Khách hàng |
|  | Tuỳ chỉnh món (Customization) | Cho phép chọn kích thước (**Size S/M/L**), mức **đường**, mức **đá** và thêm các loại **topping** (Món bánh không có size/topping). | Khách hàng |
| Giỏ hàng & Đặt đơn | Quản lý giỏ hàng | Thêm, sửa, xóa các món đã chọn trong giỏ hàng (lưu tại localStorage). | Khách hàng |
|  | Tự động tính tiền | Hệ thống tự động cập nhật và tính tổng tiền đơn hàng phía server. | Khách hàng / Server |
|  | Khởi tạo đơn | Xác nhận thông tin, kiểm tra tồn kho cộng gộp và trừ kho trong Transaction an toàn. | Khách hàng |
| Thanh toán trực tuyến (Không dùng tiền mặt) | Thanh toán không tiền mặt | Thanh toán qua cổng mô phỏng (**Ví điện tử / Thẻ ngân hàng**), áp dụng `Idempotency-Key` chống giao dịch kép. | Khách hàng |
|  | Cập nhật trạng thái | Tự động cập nhật trạng thái đơn hàng sang **PAID** khi thanh toán thành công hoặc **PAYMENT_FAILED** khi lỗi. | Hệ thống |
| Theo dõi đơn hàng & Lịch sử | Theo dõi đơn hàng | Xem thông tin chi tiết đơn hàng và trạng thái đơn (tải dữ liệu khi mở trang hoặc bấm tải lại, không polling liên tục). | Khách hàng |
|  | Xử lý ngoại lệ | PAYMENT\_FAILED: Thanh toán thất bại (hỗ trợ thử lại với Idempotency-Key mới). | Khách hàng/Hệ thống |
|  | Lịch sử đơn hàng | Cho phép xem lại danh sách các đơn hàng cá nhân đã đặt trong quá khứ. | Khách hàng |

2) **Phạm vi mở rộng (Future Scope)**  
- Khuyến mãi & Tích điểm thành viên: Thiết kế sẵn cấu trúc mô hình dữ liệu (Promotion, LoyaltyTransaction trong class diagram) nhưng chưa hiện thực mã nguồn trong bản MVP này.
- Màn hình quầy Barista và API cập nhật trạng thái quầy (PREPARING, READY, COMPLETED).

3) **Không thực hiện (Out-of-Scope)**

| Tính năng | Trạng thái/Scope | Mô tả chi tiết |
| :---- | :---- | :---- |
| Thanh toán bằng tiền mặt | Không hỗ trợ | Hệ thống không sử dụng tiền mặt (chỉ tập trung vào phương thức thanh toán trực tuyến mô phỏng). |
| Cổng thanh toán ngân hàng/MoMo thực tế | Không hỗ trợ | Không kết nối với API thực tế của ngân hàng hay ví MoMo (chỉ sử dụng **Mock Payment** để mô phỏng). |
| Định vị GPS & Giao hàng tận nơi | Không hỗ trợ | Hệ thống không hỗ trợ giao hàng (chỉ phục vụ khách **nhận tại quầy** hoặc **mang đi**). |
| Đánh giá sản phẩm (Review/Rating) | Không hỗ trợ | Hệ thống không bao gồm chức năng cho phép người dùng đánh giá hay để lại bình luận sao cho sản phẩm. |
| Khuyến mãi / Mã giảm giá Voucher | Không hỗ trợ | Chưa hiện thực tính năng nhập và trừ voucher trong phiên bản MVP hiện tại. |
| Tích điểm thành viên | Không hỗ trợ | Chưa hiện thực tính năng tích lũy và đổi điểm thưởng trong phiên bản MVP hiện tại. |
| Tự hủy đơn sau 15 phút | Không hỗ trợ | Không tự động chuyển đơn sang CANCELLED và không tự động hoàn kho sau 15 phút. |
| Giao diện/API Quản lý Menu của Admin | Không hỗ trợ | Admin không thêm/sửa/xóa món qua web; việc ẩn/hiện món được thao tác trực tiếp trên DB. |
| Giao diện quầy Barista | Không hỗ trợ | Không làm màn hình chuyên biệt cho nhân viên quầy trong phiên bản MVP. |
| Ứng dụng PWA (Progressive Web App) | Không hỗ trợ | Không triển khai Service Worker hay manifest offline; ưu tiên giao diện web trên máy tính (Desktop-first). |

4. **Giả định, Ràng buộc & Rủi ro**  
1) **Giả định** 

| Yêu cầu | Loại yêu cầu | Nội dung mô tả chi tiết |
| :---- | :---- | :---- |
| Thiết bị & Kết nối người dùng | Điều kiện phía Khách hàng | Khách hàng sử dụng **máy tính hoặc điện thoại thông minh** có kết nối Internet để duyệt menu, đặt hàng và thanh toán. Giao diện được tối ưu ưu tiên máy tính (Desktop-first), vẫn đảm bảo responsive cho di động (ADR-008). |
| Xử lý thanh toán mô phỏng | Yêu cầu Kỹ thuật / Hệ thống | Mọi giao dịch thanh toán trong môi trường thử nghiệm (Sandbox/Mock) được hệ thống phản hồi và **trả về kết quả tức thì (Real-time)**. |

2) **Ràng buộc**

| Nhóm yêu cầu / Ràng buộc | Hạng mục chi tiết | Nội dung quy định | Ghi chú kỹ thuật |
| :---- | :---- | :---- | :---- |
| Ràng buộc Công nghệ (Tech Stack) | Frontend | Sử dụng **Next.js** | Xây dựng giao diện người dùng Desktop-first, responsive linh hoạt bằng Tailwind CSS. |
|  | Backend | Sử dụng **NestJS** | Phát triển API RESTful độc lập, xử lý logic nghiệp vụ và transaction. |
|  | Cơ sở dữ liệu | Sử dụng **PostgreSQL** | Lưu trữ dữ liệu quan hệ (User, Product, Topping, Order, Payment). |
|  | Đóng gói & Môi trường | Sử dụng **Docker** | Container hóa toàn bộ hệ thống giúp dễ dàng triển khai và quản lý. |
| Ràng buộc Nghiệp vụ (Business Rule) | Phương thức thanh toán | Bắt buộc 100% không dùng tiền mặt | Chỉ chấp nhận thanh toán trực tuyến/mô phỏng ví điện tử và thẻ ngân hàng. |
| Ràng buộc Tiến độ (Timeline) | Thời gian hoàn thành | Đúng thời gian được giao | Đảm bảo hoàn thành và nghiệm thu các mốc phát triển theo kế hoạch. |

3) **Rủi ro**  
- Người dùng hủy giao dịch hoặc đóng trình duyệt giữa chừng khi đang ở bước thanh toán (đơn hàng lưu trạng thái PAYMENT_FAILED, hỗ trợ thử lại).  
- Đặt đơn đồng thời vượt quá số lượng tồn kho thực tế (được giải quyết bằng Transaction ACID trừ kho có điều kiện).  
- Quy trình CI/CD hoặc quá trình deploy lên production gặp lỗi/trễ tiến độ.
