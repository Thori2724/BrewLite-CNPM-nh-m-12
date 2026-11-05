# Quy tắc cho AI trợ lý lập trình (dự án BrewLite)

Đọc kỹ file này trước khi làm bất cứ việc gì trong repo.

## Nguồn sự thật (không tự ý thay đổi)
- Đề bài gốc: `docs/de-bai/assignment-2.md`
- Yêu cầu: `docs/requirements/`
- Sơ đồ: `docs/diagrams/`
- Kiến trúc và quyết định: `docs/architecture/architecture.md` và `docs/architecture/adr/`
- Nếu thấy tài liệu mâu thuẫn, thiếu, hoặc code cần khác tài liệu: DỪNG và hỏi tôi, không tự quyết.
- Không sửa `docs/` trừ khi tôi yêu cầu rõ (tài liệu do một bạn khác trong nhóm phụ trách).

## Công nghệ cố định
- Frontend: Next.js trong `apps/web`
- Backend: NestJS trong `apps/api`
- Database: PostgreSQL 16 + Prisma
- Chạy local: Docker Compose
- Ngôn ngữ: TypeScript
- `apps/web` và `apps/api` là hai package độc lập, mỗi bên có `package.json` riêng. KHÔNG tạo `package.json` ở thư mục gốc, KHÔNG dùng workspaces, Nx hay Turborepo.
- Giao diện: được dùng Tailwind CSS. Chưa thêm Zustand, React Query, PWA (quyết sau khi tới giỏ hàng). Muốn thêm thư viện nào khác phải hỏi tôi trước.
- Không thêm hoặc thay framework, dịch vụ mới nếu chưa hỏi tôi.

## Môi trường của tôi
- Windows, dùng PowerShell. Hướng dẫn lệnh phải chạy được trên PowerShell.
- Nếu `npm` báo "running scripts is disabled", dùng `npm.cmd` thay cho `npm`.
- API chạy ở cổng 3001 (đọc từ biến `PORT`, mặc định 3001). Web chạy ở cổng 3000.

## Cách làm việc
1. Mỗi lần chỉ làm MỘT việc nhỏ tôi nêu. Không làm thêm phần ngoài yêu cầu.
2. Trước khi viết code: nói ngắn gọn sẽ tạo hoặc sửa những file nào, rồi chờ tôi đồng ý (trừ khi tôi nói rõ là đã đồng ý trước).
3. Sau khi viết code: hướng dẫn tôi chạy và kiểm tra từng bước (lệnh cụ thể hoặc request Postman), và nói rõ kết quả đúng trông như thế nào.
4. Không xóa file, không ghi đè nhiều file cùng lúc mà không báo trước. Không chạy lệnh nguy hiểm (xóa hàng loạt, `git reset --hard`, `git push --force`).
5. Giải thích bằng tiếng Việt đơn giản. Tôi không biết lập trình.
6. Khi gặp lỗi: chỉ ra nguyên nhân và cách sửa tối thiểu, không viết lại cả phần code.
7. Giữ câu trả lời ngắn gọn, đừng đọc lại toàn bộ docs/ mỗi lần; chỉ đọc file liên quan đến việc đang làm.

## Quy tắc code
- API phải validate dữ liệu đầu vào (class-validator). Tiền do server tính, không tin giá từ client.
- Mật khẩu băm bằng bcrypt. Xác thực bằng JWT.
- Không viết secret, mật khẩu, khóa truy cập vào code hoặc log. Dùng biến môi trường, cập nhật `.env.example`, không bao giờ commit `.env`.
- Mỗi tính năng có test tối thiểu.
- Đơn hàng chỉ chuyển trạng thái theo state machine: PENDING → PAID → PREPARING → READY → COMPLETED, cộng PAYMENT_FAILED và CANCELLED.
- Thanh toán dùng header `Idempotency-Key`; tạo đơn và trừ tồn kho nằm trong một transaction.

## Quyết định đã chốt
- Ưu tiên giao diện WEB trên máy tính (thầy yêu cầu). Làm responsive để vẫn xem được trên điện thoại, nhưng thiết kế và kiểm tra trên màn hình máy tính trước.
- Giỏ hàng lưu trên trình duyệt (localStorage), chỉ gửi lên server khi đặt đơn.
- Không làm giao diện nhân viên quầy/quản lý trong MVP. (Nếu còn thời gian, có thể làm API đổi trạng thái đơn để demo bằng Postman.)
- Vai trò người dùng: CUSTOMER, STAFF, ADMIN.
- Một đơn có thể có nhiều lần thanh toán (Order 1–nhiều Payment); trạng thái Payment gồm PENDING, SUCCESS, FAILED.
- Topping sẽ thêm vào mô hình dữ liệu khi làm phần chi tiết món (Sprint 2).
- Cập nhật trạng thái đơn bằng cách hỏi lại server mỗi 5 giây, không dùng công nghệ real-time.
- Tồn kho tính theo món, không theo size. Mức đá: NONE, LOW, NORMAL, FULL.
- Tự hủy đơn sau 15 phút, voucher và tích điểm: làm sau nếu còn thời gian.
- Triển khai lên mạng để sau: chạy bằng Docker trên một máy chủ có địa chỉ IP công khai, gắn tên miền miễn phí. Chưa làm gì liên quan lúc này, chỉ cần mọi thứ chạy được bằng Docker Compose và cấu hình qua biến môi trường.

## Phạm vi và tiến độ Sprint 1
Làm theo thứ tự, mỗi lần một việc:
1. (XONG) Khởi tạo repo, Docker Compose chạy PostgreSQL, `.env.example`, README mục database.
2. (XONG) API NestJS trong `apps/api` với `GET /health`, cổng 3001. Còn thiếu: README mục "Chạy API".
3. Prisma: bảng Product và dữ liệu mẫu (seed) cho menu.
4. API `GET /products` (lọc theo danh mục, tìm theo tên) và `GET /products/:id`, kèm test.
5. Khởi tạo Next.js trong `apps/web`, kết nối URL API qua biến môi trường.
6. Trang Menu: gọi API, có đủ 3 trạng thái loading, empty, error; món hết hàng hiện nhãn "Hết hàng".
7. Test API, lint, cập nhật README cách chạy.
8. CI (GitHub Actions): Install → Lint → Unit Test → Build, chạy khi mở pull request.

Dời sang Sprint 2: chi tiết món (size, topping), giỏ hàng, đăng nhập JWT, tạo đơn, thanh toán.

## Git
- Làm trên nhánh hiện tại hoặc nhánh con của nó. KHÔNG đụng vào `main`, không merge vào `main`.
- Commit nhỏ, thông điệp rõ (`feat:`, `fix:`, `docs:`). Hướng dẫn tôi từng lệnh `git add`, `git commit`, `git push`, không tự đẩy code nếu tôi chưa bảo.
- Không bao giờ add `.env` hoặc `node_modules`.

## Khi nào một việc được coi là xong
- Chạy được, không lỗi build, lint và test đều qua.
- README đã cập nhật cách chạy.
- Tôi đã tự chạy thử và thấy đúng.