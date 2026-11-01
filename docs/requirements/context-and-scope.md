1. **Bối cảnh dự án**  
- **Vấn đề nghiệp vụ**

Hiện trạng tại các cửa hàng truyền thống: Trong các giờ cao điểm (điển hình như giờ nghỉ trưa), khách hàng thường phải xếp hàng dài tại quầy để xem menu, chờ để được order và thanh toán. Việc này kéo dài gây ra tình trạng mất thời gian chờ đợi và làm giảm đi trải nghiệm của khách hàng.  
Hạn chế của quy trình truyền thống: Việc nhân viên nhận order bằng cách nhập liệu thủ công dễ dẫn đến sai sót, nhầm lẫn thức uống hoặc đưa nhầm order của khách này qua khách khác. Điều này gây ra thất thoát nguyên liệu và xung đột giữa khách hàng và nhân viên.  
Vấn đề về phương thức thanh toán: Việc sử dụng tiền mặt đòi hỏi nhân viên phải thối tiền lẻ, dễ xảy ra nhầm lẫn trong quá trình kiểm đếm doanh thu cuối ca hoặc cuối ngày, mất thời gian đối soát và tiềm ẩn rủi ro về an ninh.

- **Giải pháp của ứng dụng Brew Lite**

Chuyển đổi số trong quá trình gọi món: Xây dựng ứng dụng hoặc web cho phép khách hàng chủ động truy cập menu online trên chính các thiết bị của mình để xem trước các sản phẩm nước, lựa chọn và tùy chỉnh các mục đi kèm (size, lượng đường, đá, topping) mà không cần đợi đến quán và order với nhân viên phục vụ.  
Tối ưu hóa quy trình thanh toán không dùng tiền mặt: Hệ thống tích hợp phương thức thanh toán hiện đại thông qua ví điện tử/thẻ ngân hàng (Ngân hàng, ví điện tử MoMo, ZaloPay, …). Điều này giúp tự động hóa quá trình giao dịch, giảm tải áp lực cho nhân viên thu ngân, đảm bảo tính chính xác về dòng tiền và tăng tốc độ phục vụ.  
Nâng cao hiệu quả quản trị: Giúp cửa hàng số hóa dữ liệu đơn hàng, giúp theo dõi chính xác các trạng thái đơn hàng theo thời gian thực (từ Chờ thanh toán (PENDING), Đã thanh toán (PAID), Đang pha chế (PREPARING), Sẵn sàng nhận nước (READY) đến Hoàn thành (COMPLETED). 

2. **Các bên liên quan (Stakeholders)**

| Stakeholder | Vai trò trong hệ thống | Mục tiêu |
| :---- | :---- | :---- |
| Khách hàng (Customer) | Người dùng chính của web/ứng dụng để chọn món và đặt hàng. | Xem menu nhanh, chỉnh sửa món dễ dàng, thanh toán tiện lợi, theo dõi trạng thái đơn hàng theo thời gian thực. |
| Nhân viên quầy (Barista/Cashier) | Người tiếp nhận đơn hàng và chế biến đồ uống. | Nắm bắt đơn hàng chính xác, giảm áp lực xếp hàng tại quầy, cập nhật trạng thái chế biến, giao hàng nhanh chóng. |
| Quản lý cửa hàng (Store Manager) | Người quản lý menu, danh mục món, theo dõi tình hình kinh doanh. | Cập nhật menu (thêm/sửa/xóa món, hết món), hiệu quả phục vụ. |
| Đơn vị thanh toán (Payment Provider \- Mock) | Dịch vụ trung gian xử lý qua ví điện tử/thẻ ngân hàng (QR Ngân hàng, MoMo, ZaloPay, …). | Xử lý phản hồi thanh toán thành công hay thất bại một cách chính xác và nhanh chóng. |
| Giảng viên/Khách hàng nghiệm thu sau trải nghiệm | Đánh giá sản phẩm. | Bài tập đáp ứng đúng quy trình phát triển phần mềm, tính năng hoạt động mượt mà. |
| Nhóm phát triển (Dev Team) | Thiết kế, lập trình, kiểm thử và triển khai web/ứng dụng. | Xây dựng hệ thống hoàn thành đúng hạn các Sprint, đảm bảo tính ổn định và dễ bảo trì. |

3. **Phạm vi sản phẩm (Product Scope)**  
1) **Trong phạm vi (In-Scope \- MVP**)

| Phân hệ/Khối chứng năng | Chức năng chi tiết | Mô tả tính năng | Đối tượng sử dụng |
| :---- | :---- | :---- | :---- |
| Xác thực người dùng | Đăng ký & Đăng nhập | Cho phép người dùng tạo tài khoản mới và đăng nhập hệ thống bằng Email/Mật khẩu (Xác thực an toàn bằng **JWT**). | Tất cả người dùng |
| Xem menu & Tìm kiếm | Danh mục & Chi tiết món | Hiển thị danh sách đồ uống phân theo từng danh mục; xem chi tiết thông tin món. | Khách hàng |
|  | Tuỳ chỉnh món (Customization) | Cho phép chọn kích thước (**Size S/M/L**), mức **đường**, mức **đá** và thêm các loại **topping**. | Khách hàng |
| Giỏ hàng & Đặt đơn | Quản lý giỏ hàng | Thêm, sửa, xóa các món đã chọn trong giỏ hàng. | Khách hàng |
|  | Tự động tính tiền | Hệ thống tự động cập nhật và tính tổng tiền đơn hàng theo tùy chọn. | Khách hàng |
|  | Khởi tạo đơn | Xác nhận thông tin và tiến hành khởi tạo đơn hàng mới. | Khách hàng |
| Thanh toán trực tuyến (Không dùng tiền mặt) | Thanh toán không tiền mặt | Thanh toán qua cổng mô phỏng (**Ví điện tử / Thẻ ngân hàng**). | Khách hàng |
|  | Cập nhật trạng thái | Tự động cập nhật trạng thái đơn hàng sang **PAID** ngay khi thanh toán thành công. | Hệ thống |
| Theo dõi đơn hàng & Lịch sử | Theo dõi thời gian thực | Cập nhật tiến trình đơn hàng theo luồng chính: (PENDING \- PAID \- PREPARING \- READY \- COMPLETED) | Khách hàng |
|  | Xử lý ngoại lệ | PAYMENT\_FAILED: Thanh toán thất bại (hỗ trợ thử lại). CANCELLED: Đơn hàng bị hủy. | Khách hàng/Hệ thống |
|  | Lịch sử đơn hàng | Cho phép xem lại danh sách các đơn hàng cá nhân đã đặt trong quá khứ. | Khách hàng |
| Màn hình Quầy/Barista | Quản lý pha chế | Tiếp nhận đơn hàng mới và cập nhật trạng thái pha chế (PREPARING \- READY \- COMPLETED) | Nhân viên/Barista |
| Quản lý Menu (Dành cho Admin/Quản lý) | Quản lý món ăn | Thêm mới, chỉnh sửa thông tin, xóa, cập nhật giá hoặc ẩn/hiện các món đồ uống trên menu. | Admin/Quản lý |

2) **Phạm vi mở rộng (Future Scope)**  
- Khuyến mãi & Tích điểm thành viên: Thiết kế sẵn cấu trúc dữ liệu (Promotion, Loyalty Transaction) cho phép nhập mã giảm giá và cộng điểm thưởng khi đơn chuyển sang trạng thái PAID. 

3) **Không thực hiện (Out-of-Scope)**

| Tính năng | Trạng thái/Scope | Mô tả chi tiết |
| :---- | :---- | :---- |
| Thanh toán bằng tiền mặt | Không hỗ trợ | Hệ thống không sử dụng tiền mặt (chỉ tập trung vào phương thức thanh toán trực tuyến). |
| Cổng thanh toán ngân hàng/MoMo thực tế | Không hỗ trợ | Không kết nối với API thực tế của ngân hàng hay ví MoMo (chỉ sử dụng **Mock Payment** để mô phỏng). |
| Định vị GPS & Giao hàng tận nơi | Không hỗ trợ | Hệ thống không hỗ trợ giao hàng (chỉ phục vụ khách **nhận nước tại quầy** hoặc **uống tại chỗ**). |
| Đánh giá sản phẩm (Review/Rating) | Không hỗ trợ (Được nhắc lại) | Hệ thống không bao gồm chức năng cho phép người dùng đánh giá hay để lại lượt bình luận/sao cho sản phẩm. |

4. **Giả định, Ràng buộc & Rủi ro**  
1) **Giả định** 

| Yêu cầu | Loại yêu cầu | Nội dung mô tả chi tiết |
| :---- | :---- | :---- |
| Thiết bị & Kết nối người dùng | Điều kiện phía Khách hàng | Khách hàng sử dụng **điện thoại thông minh (Smartphone)** có kết nối Internet để thực hiện đặt hàng và quét thanh toán (Ví điện tử / Thẻ ngân hàng). |
| Xử lý thanh toán mô phỏng | Yêu cầu Kỹ thuật / Hệ thống | Mọi giao dịch thanh toán trong môi trường thử nghiệm (Sandbox/Mock) được hệ thống phản hồi và **trả về kết quả tức thì (Real-time)**. |

2) **Ràng buộc**

| Nhóm yêu cầu /Ràng buộc | Hạng mục chi tiết | Nội dung quy định | Ghi chú kỹ thuật |
| :---- | :---- | :---- | :---- |
| Ràng buộc Công nghệ (Tech Stack) | Frontend | Sử dụng **Next.js** | Xây dựng giao diện người dùng, tối ưu hiệu năng và SEO/SSR. |
|  | Backend | Sử dụng **NestJS** | Phát triển API RESTful/GraphQL và xử lý logic nghiệp vụ. |
|  | Cơ sở dữ liệu | Sử dụng **PostgreSQL** | Lưu trữ dữ liệu quan hệ (Người dùng, Menu, Đơn hàng,...). |
|  | Đóng gói & Môi trường | Sử dụng **Docker** | Container hóa toàn bộ hệ thống giúp dễ dàng triển khai và quản lý. |
| Ràng buộc Nghiệp vụ (Business Rule) | Phương thức thanh toán | Bắt buộc 100% không dùng tiền mặt | Chỉ chấp nhận thanh toán trực tuyến/mô phỏng ví điện tử và thẻ ngân hàng. |
| Ràng buộc Tiến độ (Timeline) | Thời gian hoàn thành | Đúng thời gian được giao | Đảm bảo hoàn thành và nghiệm thu các mốc phát triển theo kế hoạch. |

3) **Rủi ro**  
- Người dùng hủy đơn hoặc tắt web/ứng dụng giữa chừng khi đang ở bước thanh toán bằng ví điện tử/thẻ ngân hàng (Cần xử lý về timeout hoặc hủy đơn tự động).  
- Lỗi đồng bộ trạng thái thanh toán giữa giao diện frontend và backend.  
- Đặt đơn đồng thời vượt quá số lượng tồn kho thực tế.  
- Quy trình CI/CD hoặc quá trình deploy lên production gặp lỗi/trễ tiến độ.  
- Thách thức kỹ thuật khi đồng bộ trạng thái đơn hàng thời gian thực.