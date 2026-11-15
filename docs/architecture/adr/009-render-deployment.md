# ADR-009: Mô hình triển khai trên Render

- **Trạng thái:** Accepted
- **Ngày:** 2026-11-10

## Bối cảnh
Trước đây nhóm lựa chọn AWS theo ADR-006. Tuy nhiên, việc thiết lập hạ tầng AWS (EC2, CloudFront, ECR, IAM, VPC) gặp nhiều rào cản về độ phức tạp vận hành, yêu cầu thẻ thanh toán quốc tế và giới hạn thời gian thực hiện của đồ án. Nhóm đã xin ý kiến và được giảng viên đồng ý chính thức cho phép chuyển nền tảng triển khai từ AWS sang **Render** (theo lựa chọn B).

Yêu cầu production cần đạt được:
- Frontend và API có HTTPS công khai.
- Database không public ra ngoài mạng tự do, dữ liệu an toàn.
- Secret tách rời khỏi kho mã nguồn (không đưa vào Git).
- Tách biệt quy trình chạy migration và khởi động API.

## Quyết định
1. **Nền tảng:** Sử dụng PaaS **Render** (định nghĩa hạ tầng qua Blueprint `render.yaml`).
2. **Cấu trúc dịch vụ:** Triển khai 3 dịch vụ độc lập:
   - `brewlite-db`: Managed PostgreSQL 16 do Render quản lý (`plan: free`, `postgresMajorVersion: "16"`).
   - `brewlite-api`: Web Service chạy Docker từ thư mục `apps/api` (`Dockerfile` giữ nguyên cấu hình local), cấu hình cổng rõ ràng `PORT: "10000"`.
   - `brewlite-web`: Web Service chạy Docker từ thư mục `apps/web` (`Dockerfile` giữ nguyên cấu hình local), cấu hình cổng rõ ràng `PORT: "10000"`.
3. **Tên miền và Định tuyến:** 
   - Web và API sử dụng **hai subdomain riêng biệt** do Render cấp phát tự động có sẵn HTTPS (dạng `https://brewlite-web.onrender.com` và `https://brewlite-api.onrender.com`).
   - Bỏ reverse proxy Nginx và quy tắc định tuyến không tiền tố của AWS.
   - Web gọi trực tiếp tới domain của API; API bật CORS cho phép nguồn từ domain của Web (`CORS_ORIGIN`).
4. **Loại bỏ các thành phần AWS:** Hoàn toàn không sử dụng Nginx, CloudFront, EC2, ECR, SSM, Caddy.
5. **Cơ chế Migration (Tách biệt khỏi lúc khởi động):**
   - Tách hoàn toàn migration khỏi lúc khởi động container API. Container API khởi động bằng `dockerCommand: node dist/main` (ghi đè lệnh CMD trong Dockerfile), đảm bảo runtime production không tự ý chạy lại migrate hoặc seed lúc khởi động.
   - Do sử dụng gói Miễn phí (Free tier không hỗ trợ `preDeployCommand`), `render.yaml` không sử dụng `preDeployCommand` để tránh lỗi cấu hình. Quá trình migration được thực hiện chủ động, an toàn từ máy local bằng công cụ Prisma CLI thông qua *External Database URL* do Render cấp.
6. **Khởi tạo dữ liệu (Seed):** Production tuyệt đối không seed tài khoản demo. Chỉ seed 12 sản phẩm menu thông qua việc chạy lệnh seed trực tiếp từ máy local kết nối tới External Database URL.
7. **Bảo toàn môi trường Local:** Giữ nguyên `docker-compose.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile` cho việc lập trình và kiểm thử tại máy cá nhân (#24).
8. **Quản lý bí mật (Secrets):** 
   - `JWT_SECRET` được Render tự động sinh ngẫu nhiên an toàn qua `generateValue: true` hoặc cấu hình thủ công trên Render Dashboard.
   - `DATABASE_URL` nội bộ được tự động liên kết từ service `brewlite-db`.
   - Tuyệt đối không commit tệp `.env` hay bất kỳ secret nào vào kho mã nguồn.

## Hệ quả
- **Ưu điểm:**
  - Giảm thiểu tối đa gánh nặng cấu hình hệ thống (không cần tự quản lý OS, Nginx, chứng chỉ SSL).
  - Tự động có HTTPS được quản lý bởi Cloudflare/Render.
  - Blueprint `render.yaml` giúp tái hiện hạ tầng chuẩn hóa, rõ ràng và tự động hóa.
- **Rủi ro và hạn chế (Đặc biệt trên gói Miễn phí - Free Tier):**
  - **Cold Start:** Dịch vụ web miễn phí tự động "ngủ" (spin down) sau 15 phút không có lượt truy cập. Lần gọi đầu tiên sẽ mất khoảng 50 giây để khởi động lại.
  - **Thời hạn Database:** Database PostgreSQL gói Free tự động hết hạn và bị xóa sau 30 ngày. Cần nâng cấp hoặc sao lưu trước hạn.
  - **Giới hạn tính năng:** Gói Free không hỗ trợ Web Shell / SSH trực tiếp và không hỗ trợ `preDeployCommand` (phải can thiệp thủ công từ máy dev qua External Database URL).
  - **Hai Domain khác nhau:** Yêu cầu cấu hình CORS chặt chẽ và phải rebuild Web nếu đổi domain API (do `NEXT_PUBLIC_API_URL` được nung vào mã nguồn lúc build).

## Phương án đã xem xét
- **AWS (EC2 + CloudFront + Docker Compose):** Đã xem xét và thiết kế tại ADR-006. Bị thay thế hoàn toàn vì cấu hình phức tạp và rào cản thanh toán quốc tế.
- **VPS (DigitalOcean/Linode/Hetzner) + Caddy:** Chi phí cố định hàng tháng, vẫn phải tự bảo trì OS và Docker.
- **Railway / Fly.io:** Cũng là mô hình PaaS tương tự nhưng chính sách gói miễn phí ngặt nghèo hơn Render hoặc yêu cầu thẻ thanh toán ngay từ đầu.

