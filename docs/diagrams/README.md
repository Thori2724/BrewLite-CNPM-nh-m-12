# Danh mục Sơ đồ Hệ thống (BrewLite Diagrams)

Thư mục này lưu trữ đầy đủ cả **sơ đồ gốc ban đầu của nhóm** và **các sơ đồ chuẩn hóa mới** được render từ mã nguồn PlantUML (`.puml`) đồng bộ với Hợp đồng API (`docs/api-contract.md`) và kiến trúc triển khai thực tế.

---

## 1. Bảng đối chiếu Sơ đồ Hình ảnh (Cũ và Mới)

| Loại sơ đồ | Sơ đồ gốc ban đầu (Giữ nguyên) | Sơ đồ chuẩn hóa mới (Render từ PlantUML) | Ghi chú cập nhật |
|---|---|---|---|
| **Activity Diagram** (Task 2.1) | — | [`activity-diagram-ver2.drawio.png`](./activity-diagram-ver2.drawio.png) *(Draw.io mới)*<br>[`activity-diagram.png`](./activity-diagram.png)<br>[`activity-diagram.svg`](./activity-diagram.svg) *(Render từ PlantUML)* | Chuẩn hóa quy trình đặt hàng (UC-01), trừ kho, thanh toán mô phỏng (thất bại đuôi `0000`, thành công) và nhánh thử lại thanh toán theo Hợp đồng API mục 4 & 5. |
| **Sequence Diagram** (Task 2.2) | — | [`sequencediagram.png`](./sequencediagram.png)<br>[`sequencediagram.svg`](./sequencediagram.svg) | Đồng bộ tuần tự giữa Customer, Next.js UI, NestJS API, PostgreSQL và Payment Service theo đúng 5 lifeline bắt buộc của Task 2.2; kiểm tra JWT, validate DTO, transaction trừ kho và cơ chế Idempotency thanh toán. |
| **Class Diagram** (Task 2.3) | — | [`classdiagram.png`](./classdiagram.png)<br>[`classdiagram.svg`](./classdiagram.svg) | Mô hình thực thể domain đáp ứng đầy đủ yêu cầu tối thiểu của Task 2.3 (gồm `User`, `Product`, `Topping`, `Order`, `OrderItem`, `OrderItemTopping`, `Payment`, `Promotion`, `LoyaltyTransaction`). Trong đó các lớp thực tế khớp 100% với `schema.prisma`, còn `Promotion` và `LoyaltyTransaction` được đánh dấu rõ là phạm vi mở rộng domain. |
| **Deployment Diagram** (Task 3.2) | [`deployment-diagram-task-3.2.png`](../architecture/deployment-diagram-task-3.2.png) *(ở thư mục architecture)* | [`deployment-diagram.png`](./deployment-diagram.png)<br>[`deployment-diagram.svg`](./deployment-diagram.svg)<br>*(và bản sao tại `docs/architecture/`)* | Kiến trúc triển khai 3 dịch vụ độc lập trên Render: Web Next.js, API NestJS, PostgreSQL 16; giao tiếp trực tiếp qua HTTPS/CORS theo ADR-009. |

---

## 2. Bảng đối chiếu Tệp mã nguồn PlantUML (`.puml`)

Để tiện so sánh và đối chiếu giữa các phiên bản thiết kế, tất cả các tệp `.puml` cũ gốc đã được khôi phục nguyên vẹn và lưu song song cùng các tệp `.puml` mới:

| Loại sơ đồ | Mã nguồn CŨ gốc (Khôi phục) | Mã nguồn MỚI (Đồng bộ API Contract) | Các điểm khác biệt chính |
|---|---|---|---|
| **Activity Diagram** | — | [`activity-diagram.puml`](./activity-diagram.puml) | • **Luồng UC-01**: Đồng bộ hoàn toàn với Use-case đặc tả mới.<br>• **Kho**: Nhấn mạnh kiểm tra tồn kho cộng gộp theo món và transaction ACID.<br>• **Mã lỗi**: Bổ sung mã lỗi cụ thể `409 Conflict`.<br>• **Thanh toán**: Bổ sung quy tắc mô phỏng tài khoản đuôi `0000` thất bại, cơ chế bấm "Thử lại thanh toán" sinh `Idempotency-Key` mới mà không tạo lại đơn. |
| **Class Diagram** | — | [`classdiagram.puml`](./classdiagram.puml) | • **Đạt chuẩn Task 2.3**: Đầy đủ tối thiểu 7 lớp theo đề bài (`User`, `Product`, `Order`, `OrderItem`, `Payment`, `Promotion`, `LoyaltyTransaction`) kèm multiplicity và enum trạng thái.<br>• **Khớp Schema 100%**: Chuẩn hóa toàn bộ các thực thể cốt lõi theo `schema.prisma` (Int tiền tệ, `displayName`, `accountLast4`, bảng trung gian `OrderItemTopping`).<br>• **Phạm vi mở rộng**: Ghi chú rõ `Promotion` và `LoyaltyTransaction` là mô hình domain phục vụ mở rộng, chưa hiện thực trong database MVP. |
| **Sequence Diagram** | — | [`sequencediagram.puml`](./sequencediagram.puml) | • **Đạt chuẩn Task 2.2**: Đầy đủ 5 lifeline bắt buộc (`Customer` → `Next.js UI` → `NestJS API` → `Database` → `Payment Service`).<br>• **Kiểm tra JWT & Validate DTO**: Bổ sung rõ nét các bước xác thực JWT và validate DTO (trả về 401 hoặc 400 Bad Request).<br>• **Transaction trừ kho**: Transaction ACID kiểm tra tồn kho cộng gộp và trừ kho trực tiếp.<br>• **Idempotency & Alt nhánh**: Chống trừ tiền trùng lặp, xử lý thất bại đuôi `0000` và vòng lặp thử lại thanh toán với Idempotency-Key mới. |
| **Deployment Diagram** | *(Ban đầu chỉ có ảnh AWS)* | [`deployment-diagram.puml`](./deployment-diagram.puml) | Mã nguồn PlantUML mô hình hóa kiến trúc triển khai thực tế trên Cloud Render (ADR-009). |

---

## 3. Tiêu chí nghiệm thu (Assignment 2)
- Toàn bộ sơ đồ đều có đầy đủ **mã nguồn PlantUML (`.puml`)** và **ảnh kết xuất (`.png` / `.svg`)** theo đúng yêu cầu đề bài.
- Giữ nguyên vẹn toàn bộ lịch sử thiết kế và tài liệu gốc của nhóm.
