# ADR-006: Mô hình triển khai trên AWS

- **Trạng thái:** Accepted
- **Ngày:** 2026-11-03

## Bối cảnh
Giảng viên yêu cầu triển khai trên AWS. Production cần: URL frontend qua HTTPS, API có health check, database không public, container registry, log, secret ngoài repository. Nhóm ít kinh nghiệm vận hành và có thời gian ngắn.

## Quyết định
- **Region:** `ap-southeast-1` (Singapore), gần người dùng ở Việt Nam.
- **Máy chủ:** một EC2 chạy Docker Compose với bốn container: `nginx`, `web` (Next.js), `api` (NestJS), `postgres`.
- **HTTPS và CDN:** Amazon CloudFront đứng trước, dùng chứng chỉ mặc định của CloudFront (không cần tên miền riêng). Behavior `/api/*` tắt cache và chuyển tiếp các header `Authorization`, `Idempotency-Key`.
- **Database:** PostgreSQL trong container, dữ liệu lưu ở Docker volume nằm trên EBS; không map cổng 5432 ra host.
- **Registry:** Amazon ECR, image gắn tag theo commit SHA.
- **Log:** Docker logging driver `awslogs` gửi lên CloudWatch Logs.
- **Secret:** GitHub Secrets cho CI; tệp `.env` quyền 600 trên EC2 cho runtime.
- **Mạng:** Security Group chỉ cho phép dải IP của CloudFront vào cổng 80; không mở cổng 22 (deploy qua AWS Systems Manager Run Command).

## Hệ quả
- Đáp ứng toàn bộ yêu cầu bắt buộc với số thành phần vận hành ít.
- Môi trường production gần giống local (cùng Docker Compose).
- Hạn chế: EC2 là điểm lỗi duy nhất; sao lưu và vá lỗi PostgreSQL do nhóm tự lo; đoạn CloudFront → EC2 là HTTP (giảm thiểu bằng giới hạn Security Group và header xác thực nguồn).

## Phương án đã xem xét
- **ECS Fargate + ALB + RDS:** chuẩn production hơn (tự phục hồi, DB được quản lý) nhưng cần cấu hình VPC, ALB, task definition, IAM; chi phí và độ phức tạp cao với nhóm này. Là hướng nâng cấp.
- **Amazon RDS thay container Postgres:** dễ sao lưu, tách DB khỏi máy chủ ứng dụng; chưa chọn vì thêm cấu hình mạng và chi phí. Là hướng nâng cấp đầu tiên.
- **AWS Amplify Hosting cho web:** tiện cho Next.js nhưng tách riêng cơ chế deploy, khó thống nhất pipeline Docker.
- **EC2 + tên miền riêng + Caddy/Let's Encrypt:** bỏ được CloudFront nhưng cần mua và cấu hình tên miền.
