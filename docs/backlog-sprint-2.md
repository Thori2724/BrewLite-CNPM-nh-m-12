# Backlog & Kế hoạch Thực hiện Sprint 2 – Hệ thống BrewLite

> **Chủ sở hữu:** Dev&Ops  
> **Phiên bản:** 2.0  
> **Ngày cập nhật:** 15/11/2026  

---

## 1. TỔNG QUAN PHÂN CÔNG THEO VAI TRÒ

| Vai trò | Phụ trách chính | Nhiệm vụ chi tiết |
|---|---|---|
| **BE** | Backend & Database | Dòng 1 đến 10: Schema `isActive`, Seed 5 tài khoản demo, Guard phân quyền, Bỏ trừ kho, Các API quản lý món/đơn/nhân viên, Integration test |
| **FE** | Frontend Web Khách & Chung | Dòng 11 đến 18, 24, 25: Contract FE, Màn QR giả, Nút hủy & thanh toán lại, Món tạm hết, Toast thông báo, Chuyển hướng vai trò, Trang tài khoản |
| **FE hoặc BE** | Khu vực `/staff` (Máy tính) | Dòng 19 đến 23: Layout `/staff`, Quản lý đơn, Quản lý món & form thêm/sửa, Quản lý nhân viên (Admin) |
| **Dev&Ops** | Hạ tầng, CI/CD, Docs, Release | Dòng 26 đến 32, 35 đến 40: Chuẩn hóa repo & docs, CI/CD, Docker local, Deploy Render, E2E test, Ma trận truy vết, Release |
| **Cả nhóm** | Báo cáo, Ráp nối, Nghiệm thu | Dòng 33, 34, 41: Báo cáo LaTeX, Ráp nối FE + BE, Video demo & Sprint Review/Retro |

---

## 2. BẢNG CHI TIẾT 41 NHIỆM VỤ SPRINT 2

| # | Người phụ trách | Việc nhỏ / Nội dung thực hiện | Task Assignment 2 | Cần xong trước | Trạng thái |
|:---:|:---:|:---|:---:|:---:|:---:|
| **1** | BE | Schema và migration: thêm cột `isActive` (Boolean, mặc định `true`) vào `User`, KHÔNG đổi gì khác; kiểm tra xóa DB rồi chạy migration vẫn dựng lại được. | 5.1 | Không | Chờ thực hiện |
| **2** | BE | Sửa seed: món đã có thì không ghi đè (update rỗng); thêm 3 STAFF + 1 ADMIN theo mục 8.3 hợp đồng (ID, email cố định, mật khẩu từ `DEMO_USER_PASSWORD`, update không đụng `isActive`); chạy lại 2 lần không nhân đôi; cập nhật `.env.example`. | 5.1, 5.2 | 1 | Chờ thực hiện |
| **3** | BE | Phân quyền: guard kiểm tra JWT, rồi vai trò, rồi `isActive` đọc từ DB mỗi request (403 đúng thông báo hợp đồng); `POST /auth/login` chặn tài khoản bị khóa (403 "Tài khoản đã bị khóa"), kèm test. | 5.1 | 1 | Chờ thực hiện |
| **4** | BE | `POST /orders`: bỏ trừ kho, chỉ kiểm tra mọi món đang bán (`stock > 0`), có món tạm hết thì từ chối cả đơn (409 kèm details gồm `productId`, `name`); giữ transaction tạo Order, OrderItem, OrderItemTopping; sửa test cũ liên quan kho. | 5.1, 5.2 | Không | Chờ thực hiện |
| **5** | BE | `GET /products/manage` (STAFF/ADMIN, trả cả món ẩn, khai báo TRƯỚC `/products/:id`) và `PATCH /products/:id/availability` (STAFF/ADMIN, `isAvailable` đặt stock 999 hoặc 0), kèm test. | 5.1 | 3 | Chờ thực hiện |
| **6** | BE | `POST /products` và `PATCH /products/:id` (chỉ ADMIN): kiểm tra dữ liệu (tên, danh mục, giá 1.000 đến 1.000.000, link ảnh http/https), ảnh trống thì dùng ảnh mặc định, ẩn/hiện bằng `isVisible`, không có API xóa món, kèm test. | 5.1 | 3 | Chờ thực hiện |
| **7** | BE | `GET /orders` (STAFF/ADMIN, kèm customer, lọc theo status) và `PATCH /orders/:id/status` (chỉ nhận PREPARING, READY, COMPLETED, CANCELLED; dùng `validateTransition`; cập nhật có điều kiện, lỗi 409), kèm test. | 5.1, 5.2 | 3 | Chờ thực hiện |
| **8** | BE | `POST /orders/:id/cancel` cho khách (chỉ chủ đơn; hủy từ PENDING, PAYMENT_FAILED, PAID; cập nhật có điều kiện; không đổi bảng Payment), kèm test. | 5.1, 5.2 | 7 | Chờ thực hiện |
| **9** | BE | `GET /staff` và `PATCH /staff/:id/status` (chỉ ADMIN; chỉ áp dụng cho STAFF, ADMIN/khách/id sai thì 404), kèm test: khóa xong gọi API nhân viên bị 403 ngay. *(Làm sau cùng, thiếu giờ thì bỏ và chuyển FR-10 sang Won't)* | 5.1 | 1, 3 | Chờ thực hiện |
| **10** | BE | Cập nhật integration test tạo đơn và thanh toán: bỏ test "không bán quá kho", thêm test món tạm hết bị từ chối cả đơn, hủy đơn, đổi trạng thái, 403 sai vai trò. | 5.2 | 4, 7, 8 | Chờ thực hiện |
| **11** | FE | Hàm gọi API, kiểu dữ liệu và dữ liệu giả cho các endpoint mới theo hợp đồng bản 2 (đặt trong file dùng chung của FE); cập nhật bảng nhãn tiếng Việt (vai trò, Ví điện tử, Đã hủy...). | 5.1 | Không | Chờ thực hiện |
| **12** | FE | Màn thanh toán QR giả: chọn ZaloPay/Momo, bỏ thẻ và ô nhập số; QR tạo từ mã đơn (được thêm thư viện QR); đếm ngược 5 giây tự thành công (gọi `POST /payments` với số `0900000001`), thoát là thất bại (số `0900000000`), mỗi lần dùng Idempotency-Key mới; thất bại thì giữ giỏ và orderId, thành công thì xóa giỏ. | 5.1 | 11 | Chờ thực hiện |
| **13** | FE | Nút "Thanh toán" cho đơn PAYMENT_FAILED giống đơn PENDING (ở lịch sử và chi tiết đơn, dẫn về màn QR của đúng đơn đó); hiển thị nhãn "Đã hủy" cho CANCELLED. | 5.1 | 12 | Chờ thực hiện |
| **14** | FE | Nút "Hủy đơn" cho khách ở đơn PENDING, PAYMENT_FAILED, PAID: hộp xác nhận, gọi `POST /orders/:id/cancel`; đơn PAID đã hủy hiện dòng "Tiền sẽ được hoàn lại (mô phỏng)"; đơn đã hủy vẫn bấm xem chi tiết. | 5.1 | 11 | Chờ thực hiện |
| **15** | FE | Món tạm hết (`stock = 0`): không hiển thị số lượng, xám + nhãn "Hết hàng" + nút "Tạm hết" (đã có, kiểm tra lại); đặt đơn gặp lỗi 409 món tạm hết thì hiện thông báo rõ món nào. | 5.1 | 11 | Chờ thực hiện |
| **16** | FE | Popup thông báo: kiểm tra popup còn mất khi cuộn trang không; nếu còn thì sửa cố định góc trên bên phải (được dùng sonner); thêm thông báo cho thao tác mới (hủy đơn, lỗi 401/403...). FE tự quyết danh sách sự kiện. | 5.1 | 11 | Chờ thực hiện |
| **17** | FE | Chuyển hướng theo vai trò: đăng nhập chung xong thì CUSTOMER về menu, STAFF/ADMIN về `/staff`; STAFF/ADMIN mở trang khách thì về `/staff`; khách gõ `/staff` thì về trang chủ; nhân viên gõ `/staff/employees` thì về `/staff`; 401 về đăng nhập; 403 bị khóa thì thông báo và tự đăng xuất. | 5.1 | 11 | Chờ thực hiện |
| **18** | FE | Trang `/account` (chỉ xem): tên hiển thị, email, vai trò, nút Đăng xuất, khách có thêm liên kết Lịch sử đơn. Ưu tiên thấp, thiếu giờ thì thay bằng menu thả xuống. | 5.1 | 17 | Chờ thực hiện |
| **19** | FE / BE | Khung khu `/staff` trong thư mục `staff` riêng: layout, thanh điều hướng (Đơn hàng, Món, Nhân viên chỉ ADMIN thấy), tối ưu cho máy tính, dùng dữ liệu giả. *(Nếu BE làm: nhánh BE-staff, chỉ sửa thư mục staff)* | 5.1 | 11, 17 | Chờ thực hiện |
| **20** | FE / BE | Trang `/staff` (đơn hàng): bảng mã đơn, tên khách, tổng tiền, trạng thái, giờ đặt; ô lọc trạng thái; bấm vào xem chi tiết món; nút "Chuyển sang bước tiếp theo"; nút "Hủy đơn" có xác nhận; đủ loading, empty, error. | 5.1 | 19 | Chờ thực hiện |
| **21** | FE / BE | Trang `/staff/products`: danh sách món kèm công tắc đang bán/tạm hết; ADMIN thấy thêm nút Thêm món, Sửa, Ẩn/Hiện (món ẩn có nhãn "Đã ẩn"). | 5.1 | 19 | Chờ thực hiện |
| **22** | FE / BE | Form thêm/sửa món (ADMIN): tên, danh mục (chọn trong 4 loại), giá gốc, link ảnh có ô xem trước, ảnh trống thì dùng ảnh mặc định, kiểm tra dữ liệu và báo lỗi. | 5.1 | 21 | Chờ thực hiện |
| **23** | FE / BE | Trang `/staff/employees` (chỉ ADMIN): bảng tên, email, vai trò, ngày tạo, trạng thái (Hoạt động/Đã khóa), nút Khóa/Mở khóa. *(Làm sau cùng, thiếu giờ thì bỏ cùng dòng 9)* | 5.1 | 19 | Chờ thực hiện |
| **24** | FE | Kiểm tra dữ liệu và báo lỗi ở các form, responsive khu khách, rà soát cuối. | 5.1 | 13, 14, 15, 17 | Chờ thực hiện |
| **25** | FE | Test cho màn QR (thành công, thoát) và hủy đơn của khách; chạy lint. | 5.2 | 12, 14 | Chờ thực hiện |
| **26** | Dev&Ops | Đưa `docs/api-contract.md` bản 2 và `AGENTS.md` mới vào repo (qua pull request); tạo lại issue board/Backlog Sprint 2 theo bảng phân công này. | 4.1, 4.2 | Không | Hoàn thành |
| **27** | Dev&Ops | Kiểm tra CI/CD không vỡ sau thay đổi (migration isActive, seed mới); đặt `DEMO_USER_PASSWORD` trong Render và `.env.example`; xác nhận seed tự chạy mỗi lần deploy cùng migration. | 5.3 | 2 | Chờ thực hiện |
| **28** | Dev&Ops | Kiểm tra dựng lại local từ đầu: `docker compose down -v` rồi chạy lại, migration + seed phải dựng đủ món, topping, 5 tài khoản demo. | 5.2 | 2 | Chờ thực hiện |
| **29** | Dev&Ops | Sửa docs Task 1 (context-and-scope, SRS, use-case) theo mục 12 hợp đồng (mục 1 đến 11), gom thành một pull request có ghi lý do. | 4.2 | 26 | Hoàn thành |
| **30** | Dev&Ops | Sửa docs Task 2 theo mục 12 hợp đồng (mục 12 đến 15): activity, sequence (bỏ trừ kho), class diagram (isActive, kiểu Int, giữ Promotion và LoyaltyTransaction kèm ghi chú); xuất lại ảnh `.svg` từ `.puml`. | 4.2 | 26 | Đang thực hiện (đã xong Sequence & Class Diagram) |
| **31** | Dev&Ops | Đồng bộ kiến trúc (mục 12 hợp đồng, mục 16 và 17): `architecture.md`, ADR bỏ trừ kho, ADR đang bán/tạm hết, ADR 008 desktop-first. Chưa sửa phần deployment (làm ở dòng 38). | 3.1, 4.2 | 26 | Chờ thực hiện |
| **32** | Dev&Ops | Deploy thử giữa chừng lên Render (một lần): kiểm tra migration isActive, seed 5 tài khoản, `GET /health`, đăng nhập thử khách, nhân viên, quản lý. | 5.4 | 2, 3, 7, 27 | Chờ thực hiện |
| **33** | Cả nhóm | Báo cáo LaTeX (thầy yêu cầu thêm): lập khung, chia chương cho từng người, viết dần theo các tài liệu đã sửa; chốt nội dung sau dòng 40. | Báo cáo | 26 | Chờ thực hiện |
| **34** | Cả nhóm | Ráp FE với BE thật: đổi từ dữ liệu giả sang API thật, chạy tay luồng khách (menu, đặt đơn, thanh toán QR thành công và thoát, hủy đơn) và luồng nhân viên (đổi trạng thái, gạt đang bán/tạm hết, quản lý món, khóa nhân viên), ghi lại lỗi. | 5.1, 5.2 | 8, 9, 10, 20, 22, 23, 24 | Chờ thực hiện |
| **35** | Dev&Ops | Test end-to-end từ menu đến xác nhận đơn (hỏi trước khi thêm công cụ test). | 5.2 | 10, 25, 34 | Chờ thực hiện |
| **36** | Dev&Ops | Dọn sạch dữ liệu test trên production (đơn, tài khoản thử, giữ dữ liệu seed) bằng DBeaver kết nối tạm thời, xong thì đóng kết nối. | 5.4 | 34 | Chờ thực hiện |
| **37** | Dev&Ops | Deploy bản cuối lên Render và smoke test (`/health`, đăng nhập 3 vai trò, xem menu); smoke test không tạo đơn mới. | 5.4 | 32, 34, 36 | Chờ thực hiện |
| **38** | Dev&Ops | Sửa deployment diagram, `docs/deployment.md`, ADR nền tảng, bảng node trong `architecture.md` cho đúng nền tảng thực tế (mục 12 hợp đồng, mục 18); tên node trong sơ đồ trùng với bảng. | 3.2, 4.2, 5.4 | 37 | Chờ thực hiện |
| **39** | Dev&Ops | Ma trận truy vết `docs/traceability-matrix.md`: cập nhật mã FR theo SRS mới, 18 endpoint, test (mục 12 hợp đồng, mục 19); chốt khi test xong. | 8 | 10, 25, 29, 30, 35 | Chờ thực hiện |
| **40** | Dev&Ops | Release tag, release notes, README đầy đủ (chạy, test, build, deploy, rollback), cấp quyền repo cho giảng viên, nhờ người ngoài nhóm clone và chạy thử theo README. | 5.4 | 37, 38, 39 | Chờ thực hiện |
| **41** | Cả nhóm | Video demo (luồng khách + luồng nhân viên), Sprint Review, Sprint Retrospective. | 5.4 | 37 | Chờ thực hiện |

