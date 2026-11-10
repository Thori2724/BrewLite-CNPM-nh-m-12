# Hướng dẫn Triển khai Hệ thống BrewLite trên AWS (Bản đầu tiên)

Tài liệu này ghi lại các bước triển khai thực tế của phiên bản đầu tiên lên AWS, tuân thủ theo [ADR-006](architecture/adr/006-aws-deployment-topology.md) và các quyết định đã chốt trong `AGENTS.md`.

---

## 1. Kiến trúc triển khai thực tế

- **Hạ tầng:** 1 máy chủ EC2 (Ubuntu 24.04 LTS x86_64, tối thiểu 2 GB RAM) tại region `ap-southeast-1` (Singapore).
- **Phân phối & HTTPS:** AWS CloudFront đứng trước làm điểm tiếp nhận HTTPS công khai duy nhất (`https://xxxx.cloudfront.net` - biến môi trường `PUBLIC_URL`).
- **An toàn mạng:** 
  - Security Group của EC2 chỉ mở inbound cổng 80 (HTTP) từ IP prefix list của CloudFront (`com.amazonaws.global.cloudfront.origin-facing`).
  - Không mở cổng 22 (SSH), 3000 (Web), 3001 (API), 5432 (Postgres).
  - Quản trị máy chủ qua AWS Systems Manager Session Manager (SSM).
- **Điều phối container:** Docker Compose độc lập qua file `docker-compose.prod.yml`:
  - `nginx`: Reverse proxy tại cổng 80 duy nhất, định tuyến `/products`, `/orders`, `/auth`, `/payments`, `/health` sang `api:3001`, các đường dẫn khác sang `web:3000`.
  - `web`: Next.js (chỉ expose cổng 3000 nội bộ, nhận `NEXT_PUBLIC_API_URL=${PUBLIC_URL}` lúc build).
  - `api`: NestJS (chỉ expose cổng 3001 nội bộ, chạy lệnh `node dist/main`, không tự động migrate/seed lúc khởi động).
  - `postgres`: PostgreSQL 16 (lưu trữ qua volume `postgres_data`, không mở cổng ra ngoài).
- **Lưu ý khác biệt bản đầu:** Build Docker image trực tiếp trên EC2 từ source code qua Git Deploy Key chỉ đọc (chưa qua Amazon ECR, sẽ hoàn thiện tại #26).

---

## 2. Các bước triển khai thực tế

### Bước 1: Chuẩn bị trên AWS Console
1. **Tạo IAM Role cho EC2:** Gắn policy `AmazonSSMManagedInstanceCore` và quyền ghi log `CloudWatchAgentServerPolicy` (hoặc inline policy ghi log vào CloudWatch Logs).
2. **Tạo Security Group:** Inbound TCP 80 từ CloudFront Prefix List; outbound cho phép tất cả để cài đặt gói và clone code.
3. **Khởi tạo EC2 Instance:** Ubuntu 24.04 LTS, instance type tối thiểu `t3.small` (2 GB RAM) hoặc `t2.small`, gắn IAM Role và Security Group ở trên. Gắn Elastic IP vào EC2.
4. **Tạo CloudFront Distribution:**
   - Origin: DNS công khai của EC2 (giao thức HTTP, port 80).
   - Viewer Protocol Policy: Redirect HTTP to HTTPS.
   - Allowed HTTP Methods: `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE`.
   - Cache Policy: `CachingDisabled`.
   - Origin Request Policy: `AllViewerExceptHostHeader`.
   - Lấy domain CloudFront: `https://<id>.cloudfront.net` (đây chính là `PUBLIC_URL`).

### Bước 2: Thiết lập trên EC2 (qua AWS Session Manager)
1. **Cài đặt Docker và Docker Compose plugin:**
   Theo tài liệu chính thức của Docker cho Ubuntu.
2. **Cấu hình log chuyển về CloudWatch Logs:**
   Tạo `/etc/docker/daemon.json` với logging driver `awslogs` (log-group `/brewlite/prod`). Khởi động lại Docker service.
3. **Lấy mã nguồn:**
   Tạo cặp SSH key trên EC2, thêm Public Key vào mục **Deploy Keys (Read-only)** của repository trên GitHub. Tiến hành clone repository.
4. **Tạo file `.env` trên EC2:**
   Thiết lập quyền `chmod 600 .env`. Sinh mật khẩu và bí mật ngẫu nhiên:
   - `POSTGRES_PASSWORD=$(openssl rand -hex 24)`
   - `JWT_SECRET=$(openssl rand -hex 32)`
   - Cung cấp `POSTGRES_USER`, `POSTGRES_DB`, và `PUBLIC_URL` đã lấy từ CloudFront.
5. **Khởi động cơ sở dữ liệu:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d postgres
   ```
6. **Sao lưu trước migration (quy trình chuẩn):**
   ```bash
   mkdir -p /opt/backups
   docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB > /opt/backups/backup_initial_$(date +%Y%m%d%H%M%S).sql
   ```
7. **Chạy Migration & Seed (chỉ dữ liệu menu, không seed demo user):**
   ```bash
   docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
   docker compose -f docker-compose.prod.yml run --rm api node -r ts-node/register prisma/seed.ts
   ```
8. **Khởi chạy toàn bộ hệ thống:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

---

## 3. Kiểm tra và nghiệm thu (Smoke Test)

- Kiểm tra trạng thái container:
  ```bash
  docker compose -f docker-compose.prod.yml ps
  ```
- Kiểm tra Healthcheck API qua domain CloudFront:
  `curl -s https://<PUBLIC_URL>/health` trả về `{"status":"ok"}`.
- Kiểm tra danh sách sản phẩm:
  `curl -s https://<PUBLIC_URL>/products` trả về danh sách các món kèm `stock`.
- Kiểm tra giao diện Web:
  Truy cập `https://<PUBLIC_URL>/` và `https://<PUBLIC_URL>/menu` trên trình duyệt.
- Kiểm tra tường lửa:
  Truy cập trực tiếp IP/DNS của EC2 hoặc các cổng 22, 3000, 3001, 5432 từ mạng ngoài đều bị chặn hoàn toàn.

---

## 4. Pipeline CD và Quy trình Rollback

*(Phần này để trống - sẽ được xây dựng và hoàn thiện trong nhiệm vụ #26 và #32)*
