# Quy tắc cho AI trợ lý lập trình (dự án BrewLite)

Đọc kỹ file này trước khi làm bất cứ việc gì trong repo.

## 0. Xác định vai trò (làm ĐẦU TIÊN mỗi phiên)
Dự án có 3 người làm song song, mỗi người một vai: **FE**, **BE**, **Dev&Ops**. Có thêm vai phụ **Docs**: giống Dev&Ops nhưng CHỈ được sửa `docs/` và `README.md`.

Xác định vai theo thứ tự:
1. Tôi nói trong chat (ví dụ "tôi là BE").
2. Đọc file `.role.local` ở thư mục gốc (file này không commit, chỉ chứa một chữ: FE, BE, DevOps hoặc Docs).
3. Nếu không có cả hai: hỏi tôi một câu "Bạn là FE, BE, Dev&Ops hay Docs?", rồi tạo `.role.local` với đúng một chữ đó.

Nói rõ vai đã xác định ngay trong câu trả lời đầu tiên, rồi chỉ làm việc trong khu vực của vai đó (mục 2).

## 1. Nguồn sự thật (không tự ý thay đổi)
- Đề bài gốc: `docs/de-bai/Assignment2.md`
- **Hợp đồng API: `docs/api-contract.md` (bản 2, 18 endpoint)**. FE và BE làm theo đúng từng chữ (tên endpoint, tên trường, kiểu dữ liệu, mã lỗi, thông báo lỗi tiếng Việt). Nếu code, tài liệu khác hoặc yêu cầu của tôi khác hợp đồng: DỪNG và hỏi tôi. Không tự đổi hợp đồng, không tự thêm endpoint hoặc trường ngoài hợp đồng.
- Yêu cầu `docs/requirements/`, sơ đồ `docs/diagrams/`, kiến trúc `docs/architecture/` đang được sửa cho khớp hợp đồng. Nếu mâu thuẫn với hợp đồng thì theo hợp đồng và báo tôi.
- Nếu tài liệu mâu thuẫn, thiếu hoặc mơ hồ: DỪNG và hỏi tôi, không tự quyết.

## 2. Khu vực chỉnh sửa (BẮT BUỘC TUÂN THỦ)

| Khu vực | Chủ sở hữu |
|---|---|
| `apps/api/**` (code, test, `prisma/`) | **BE** |
| `apps/api/prisma/schema.prisma` và `apps/api/prisma/migrations/**` | Chỉ **BE**, và chỉ thay đổi duy nhất là thêm cột `isActive` vào User (hợp đồng mục 8). Cần đổi gì khác trong schema thì DỪNG và hỏi tôi |
| `apps/web/**` (code, test, giao diện) | **FE** |
| Thư mục `staff` của khu giao diện `/staff` (ví dụ `apps/web/src/app/staff/**`, đường dẫn thật tùy cấu trúc Next.js) | **FE**. Nếu tôi nói "tôi làm khu staff" thì vai **BE** được sửa riêng thư mục này |
| `apps/api/Dockerfile`, `apps/api/.dockerignore`, `apps/web/Dockerfile`, `apps/web/.dockerignore` | **Dev&Ops** (dù nằm trong thư mục của app khác) |
| `docker-compose*.yml`, `.github/**`, `tests/**` (E2E), mọi file triển khai (Caddyfile, script deploy...) | **Dev&Ops** |
| `docs/**` | **Dev&Ops / Docs** |
| `README.md` ở thư mục gốc | **Dev&Ops / Docs** (BE và FE ghi cách chạy vào `apps/api/README.md` và `apps/web/README.md` của mình) |
| `.gitignore`, `AGENTS.md` | **Dev&Ops** |
| `.env.example` | **Dùng chung**: mỗi vai chỉ được THÊM hoặc sửa dòng trong khối của mình (`# --- API (BE) ---`, `# --- WEB (FE) ---`, `# --- DEPLOY (Dev&Ops) ---`), không đụng dòng của vai khác |

Khi BE làm khu `/staff`: chỉ tạo/sửa file trong thư mục `staff`. Hàm gọi API và bảng nhãn dùng cho khu này đặt ngay trong thư mục `staff`, không sửa file dùng chung của FE (layout, điều hướng, nhãn, hàm gọi API chung). Cần thêm gì ở file chung thì viết tin nhắn cho FE. Việc chuyển hướng sau đăng nhập và chặn khách vào `/staff` thuộc FE.

Quy tắc khi cần làm gì đó NGOÀI khu vực của vai mình:
1. DỪNG, không tự sửa, dù chỉ một dòng.
2. Viết sẵn cho tôi một tin nhắn ngắn để chuyển cho người phụ trách, theo mẫu: "Gửi [vai trò]: cần [việc cụ thể] ở [file/thư mục], vì [lý do]."
3. Tiếp tục phần việc trong khu vực của mình, nếu còn.

Quy tắc giữ cho 3 người không đụng nhau:
- Giữ nguyên tên script `lint`, `test`, `build` trong `package.json` của từng app (CI phụ thuộc vào đó). Không đổi tên, không xóa.
- Dev&Ops không sửa code ứng dụng để CI qua. CI đỏ do code thì báo FE hoặc BE.
- Không đổi định dạng hàng loạt (format lại cả file hoặc cả thư mục) và không đổi tên, di chuyển file nếu tôi chưa bảo.
- Không chạy `npm install` hoặc cập nhật thư viện ở thư mục app của vai khác.

## 3. Công nghệ cố định
- Frontend: Next.js trong `apps/web`. Backend: NestJS trong `apps/api`.
- Database: PostgreSQL 16 + Prisma. Chạy local: Docker Compose. Ngôn ngữ: TypeScript.
- `apps/web` và `apps/api` là hai package độc lập, mỗi bên có `package.json` riêng. KHÔNG tạo `package.json` ở thư mục gốc, KHÔNG dùng workspaces, Nx hay Turborepo.
- Giao diện: được dùng Tailwind CSS. Chưa thêm Zustand, React Query, PWA.
- FE được thêm 2 thư viện đúng mục đích: một thư viện tạo mã QR (ví dụ `qrcode.react`) cho màn thanh toán, và `sonner` cho thông báo (chỉ khi popup hiện tại chưa cố định được khi cuộn trang).
- Thư viện chuẩn được phép cho đúng việc của nó: Prisma, class-validator, class-transformer, bcrypt (hoặc bcryptjs nếu bcrypt lỗi trên Windows), @nestjs/jwt, @nestjs/config. Thư viện test và công cụ E2E: phải hỏi tôi trước khi thêm. Mọi thư viện khác cũng phải hỏi trước.
- Không thêm hoặc thay framework, dịch vụ mới nếu chưa hỏi tôi.

## 4. Môi trường của tôi
- Windows, dùng PowerShell. Hướng dẫn lệnh phải chạy được trên PowerShell.
- Nếu `npm` báo "running scripts is disabled", dùng `npm.cmd` thay cho `npm`.
- API chạy ở cổng 3001 (đọc từ biến `PORT`, mặc định 3001). Web chạy ở cổng 3000.

## 5. Cách làm việc
1. Tôi giao việc theo từng dòng trong bảng phân công. Chỉ làm ĐÚNG dòng đó, không làm thêm phần ngoài yêu cầu.
2. Trước khi viết code: nói ngắn gọn sẽ tạo hoặc sửa những file nào (kiểm tra từng file có nằm trong khu vực của vai mình không), rồi chờ tôi đồng ý (trừ khi tôi nói rõ là đã đồng ý trước).
3. Sau khi viết code: hướng dẫn tôi chạy và kiểm tra từng bước (lệnh cụ thể hoặc request Postman), và nói rõ kết quả đúng trông như thế nào.
4. Không xóa file, không ghi đè nhiều file cùng lúc mà không báo trước. Không chạy lệnh nguy hiểm (xóa hàng loạt, `git reset --hard`, `git push --force`).
5. Giải thích bằng tiếng Việt đơn giản. Tôi không biết lập trình.
6. Khi gặp lỗi: chỉ ra nguyên nhân và cách sửa tối thiểu, không viết lại cả phần code.
7. Giữ câu trả lời ngắn gọn, đừng đọc lại toàn bộ docs/ mỗi lần; chỉ đọc file liên quan đến việc đang làm.

## 6. Quy tắc code chung
- Không viết secret, mật khẩu, khóa truy cập vào code hoặc log. Dùng biến môi trường, cập nhật `.env.example`, không bao giờ commit `.env`.
- Mỗi tính năng có test tối thiểu.
- Tiền là số nguyên VND. Server tự tính tiền, không bao giờ tin giá từ client.

### Riêng BE
- Làm đúng hợp đồng: không thêm endpoint ngoài 18 endpoint. Route `GET /orders/me` khai báo TRƯỚC `GET /orders/:id`, và `GET /products/manage` khai báo TRƯỚC `GET /products/:id`.
- Validate đầu vào bằng class-validator. Lỗi theo chuẩn NestJS: kiểm tra dữ liệu thì `message` là mảng chuỗi tiếng Anh, lỗi nghiệp vụ thì `message` là chuỗi tiếng Việt đúng như hợp đồng.
- Mật khẩu băm bcrypt, JWT hết hạn 24 giờ, không bao giờ trả hoặc ghi log mật khẩu.
- Thanh toán: kiểm tra theo đúng thứ tự trong hợp đồng; số tài khoản kết thúc `0000` thì thất bại; chỉ lưu 4 số cuối, KHÔNG ghi log số tài khoản đầy đủ.
- Tạo đơn trong một transaction (Order, OrderItem, OrderItemTopping). KHÔNG trừ kho; chỉ kiểm tra mọi món đang bán (`stock > 0`), có món tạm hết thì từ chối cả đơn bằng 409. Giữ cột `stock`, không xóa. Không dùng cột `version`.
- Dùng lại hàm `validateTransition` cho `PATCH /orders/:id/status` và `POST /orders/:id/cancel`, không sửa quy tắc chuyển trạng thái (hủy chỉ từ PENDING, PAYMENT_FAILED, PAID). Khi đổi trạng thái, cập nhật có điều kiện `status` còn đúng như lúc đọc, sai thì trả 409.
- Seed dùng upsert theo ID cố định trong hợp đồng, chạy lại nhiều lần không nhân đôi dữ liệu. Món đã tồn tại thì KHÔNG ghi đè (`update` rỗng). Tài khoản đã tồn tại chỉ cập nhật `displayName`, `role`, `passwordHash`, không đụng `isActive`. Seed 1 khách, 3 STAFF, 1 ADMIN theo mục 8.3 hợp đồng, mật khẩu lấy từ `DEMO_USER_PASSWORD`.
- KHÔNG tạo bảng `Size`, `Promotion`, `LoyaltyTransaction`. Schema chỉ thêm đúng một cột `isActive` vào User.
- Phân quyền: guard kiểm tra theo thứ tự JWT, vai trò, rồi đọc `isActive` từ database ở mỗi request (khóa có hiệu lực ngay). Sai vai trò hoặc bị khóa thì 403 đúng thông báo trong hợp đồng. Đăng nhập tài khoản bị khóa cũng 403. ADMIN chỉ khóa được STAFF.
- Món: ID tự sinh; `imageUrl` trống thì dùng ảnh mặc định cố định; không có API xóa món.

### Riêng FE
- Giá và nhãn hiển thị: dùng bảng nhãn tiếng Việt ở mục 7 của hợp đồng. Mã kỹ thuật giữ tiếng Anh.
- Đọc địa chỉ API từ `NEXT_PUBLIC_API_URL` (mặc định `http://localhost:3001`), không viết cứng.
- Không tự tính giá để gửi lên server (chỉ hiển thị giá tạm tính). Không gửi `unitPrice`, `totalAmount`.
- Khi chưa có API thật: dùng dữ liệu giả đúng hình dạng hợp đồng, đặt trong một thư mục riêng, dễ tắt đi khi nối API thật.
- Mọi trang đều có trạng thái loading, empty, error. Gặp lỗi 401 thì chuyển về đăng nhập.
- Thanh toán thất bại: giữ `orderId`, bấm "Thử lại thanh toán" thì gọi lại `POST /payments` cho đơn đó với `Idempotency-Key` MỚI. Không tạo đơn mới.
- Thanh toán chỉ bằng ví điện tử (ZaloPay/Momo): màn QR giả tạo từ mã đơn, đếm ngược 5 giây tự thành công, thoát khỏi QR là thất bại. Luôn gửi `method = WALLET` kèm số tài khoản cố định theo mục 6.2 hợp đồng, không có ô nhập số, không có thẻ. Nút "Thanh toán" có cho đơn PENDING và PAYMENT_FAILED.
- Giỏ hàng chỉ xóa khi thanh toán thành công; thất bại giữ nguyên giỏ.
- Không hiển thị số lượng tồn kho. `stock = 0` là tạm hết (hình xám, nhãn "Hết hàng", nút "Tạm hết").
- Hủy đơn: khách có nút Hủy ở đơn PENDING, PAYMENT_FAILED, PAID, có hộp xác nhận, gọi `POST /orders/:id/cancel`. Đơn PAID đã hủy thì hiện dòng "Tiền sẽ được hoàn lại (mô phỏng)".
- Khu `/staff` và chuyển hướng theo vai trò làm đúng mục 9 hợp đồng. Nhận 401 thì về đăng nhập; nhận 403 "Tài khoản đã bị khóa" thì thông báo và tự đăng xuất. Khu `/staff` chỉ cần tối ưu cho máy tính.
- Giao diện ưu tiên máy tính (desktop-first) nhưng vẫn responsive.

### Riêng Dev&Ops
- CI: Install → Lint → Test → Build cho cả API và web; PR không merge được nếu CI đỏ.
- Docker: `NEXT_PUBLIC_API_URL` phải truyền lúc build image web; `CORS_ORIGIN` đặt đúng địa chỉ web thật. Production KHÔNG mở cổng 5432 của PostgreSQL ra ngoài.
- Không để secret xuất hiện trong repository hoặc log CI.
- Seed chạy tự động mỗi lần deploy cùng migration. `DEMO_USER_PASSWORD` đặt trong Render và có dòng mẫu trong `.env.example` (không ghi mật khẩu thật vào repo).
- Khi sửa tài liệu: mỗi thay đổi qua pull request và ghi rõ lý do.

## 7. Quyết định đã chốt (theo hợp đồng API, thay cho mọi chỗ cũ khác)
- Ưu tiên giao diện WEB trên máy tính (thầy yêu cầu), vẫn responsive. Không làm PWA.
- Giỏ hàng lưu trên trình duyệt (localStorage), chỉ gửi lên server khi đặt đơn.
- KHÔNG làm: tự hủy sau 15 phút, voucher, tích điểm, hoàn tiền thật, lùi trạng thái đơn, timer tự chuyển trạng thái, xóa hẳn món, tạo danh mục mới, tải ảnh lên, tạo/sửa/xóa nhân viên, xếp ca, `GET /auth/me`, phân trang, polling tự động. Danh sách đầy đủ ở mục 10 hợp đồng. Trang theo dõi đơn chỉ tải khi mở trang hoặc khi bấm tải lại. (Giao diện nhân viên/quản lý, đổi trạng thái, hủy đơn, quản lý món, khóa nhân viên: ĐANG LÀM.)
- Vai trò người dùng: CUSTOMER, STAFF, ADMIN. Đăng ký luôn tạo CUSTOMER.
- Một đơn có thể có nhiều lần thanh toán. Mỗi đơn chỉ có tối đa một thanh toán SUCCESS.
- Không còn tồn kho đếm ly: `stock > 0` là đang bán, `stock = 0` là tạm hết (nút gạt đặt 999 hoặc 0). Menu xem được không cần đăng nhập.
- Trạng thái đơn: PENDING → PAID → PREPARING → READY → COMPLETED, cộng PAYMENT_FAILED và CANCELLED. Chỉ PENDING, PAYMENT_FAILED mới thanh toán được.
- Hủy đơn: khách hủy đơn của mình, nhân viên hủy đơn bất kỳ, đều chỉ khi đơn ở PENDING, PAYMENT_FAILED, PAID. Không lùi trạng thái.
- Phân quyền: STAFF gạt đang bán/tạm hết, đổi trạng thái và hủy đơn. ADMIN làm thêm việc thêm/sửa/ẩn món và khóa/mở khóa STAFF.
- Một trang đăng nhập chung; sau đăng nhập CUSTOMER về menu, STAFF/ADMIN về `/staff`.

## 8. Triển khai lên mạng (ĐÃ CHỐT)
Triển khai trên Render (web, API, PostgreSQL); image đẩy lên GHCR; deploy bằng Deploy Hook (chi tiết trong `docs/deployment.md`). Chỉ Dev&Ops làm hạ tầng. Tiết kiệm hạn mức miễn phí: chỉ deploy khi tôi bảo (một lần giữa chừng để kiểm tra, một lần bản cuối).

## 9. Git (3 người làm song song)
- Không có nhánh `dev`. Nhánh ghép chung là `some-diagram-and-SRS` (gọi tắt: nhánh some).
- Mỗi vai làm trên nhánh riêng của vai đó (FE, BE hoặc Dev&Ops), đã tạo sẵn từ nhánh some. Trước khi làm, chạy `git branch --show-current` để biết đang đứng ở nhánh nào; nếu không phải nhánh của vai mình thì DỪNG và hỏi tôi. Đầu mỗi buổi làm, lấy bản mới của nhánh some về nhánh của mình: `git pull origin some-diagram-and-SRS`.
- KHÔNG đẩy thẳng lên `main` hay nhánh some. Làm xong một việc thì push nhánh của vai mình, rồi mở pull request vào nhánh some (nhớ đổi ô "base" khỏi `main`); CI xanh mới merge. Nhánh some chỉ được đưa vào `main` một lần ở cuối, do Dev&Ops làm.
- KHÔNG dùng `git add .` hoặc `git add -A`. Chỉ `git add` từng đường dẫn nằm trong khu vực của vai mình. Trước mỗi commit chạy `git status` và kiểm tra tất cả file đều thuộc khu vực của mình; file nào ngoài khu vực thì bỏ ra, không commit.
- Một pull request chỉ chứa file trong khu vực của một vai.
- Nếu BE làm khu `/staff`: dùng nhánh riêng (ví dụ `BE-staff`) tách từ nhánh some, và mở pull request riêng chỉ chứa thư mục `staff` (ngoại lệ của quy tắc "một pull request chỉ chứa file của một vai").
- Commit nhỏ, thông điệp rõ có phạm vi: `feat(api):`, `feat(web):`, `fix(api):`, `ci:`, `docs:`, `chore:`.
- Không tự đẩy code nếu tôi chưa bảo. Hướng dẫn tôi từng lệnh `git add`, `git commit`, `git push`.
- Không bao giờ add `.env`, `.role.local`, file khóa (`*.pem`) hoặc `node_modules`.

## 10. Khi nào một việc được coi là xong
- Chạy được, không lỗi build, lint và test đều qua.
- README của phần mình (hoặc README gốc nếu là Dev&Ops) đã cập nhật cách chạy.
- Chỉ có file trong khu vực của vai mình bị thay đổi.
- Tôi đã tự chạy thử và thấy đúng.
