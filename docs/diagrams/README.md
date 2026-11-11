# Danh mục Sơ đồ Hệ thống (BrewLite Diagrams)

Thư mục này lưu trữ đầy đủ cả **sơ đồ gốc ban đầu của nhóm** và **các sơ đồ chuẩn hóa mới** được render từ mã nguồn PlantUML (`.puml`) đồng bộ với Hợp đồng API (`docs/api-contract.md`) và kiến trúc triển khai thực tế.

---

## 1. Bảng đối chiếu Sơ đồ Cũ và Mới

| Loại sơ đồ | Sơ đồ gốc ban đầu (Giữ nguyên) | Sơ đồ chuẩn hóa mới (Render từ PlantUML) | Mã nguồn PlantUML | Ghi chú cập nhật |
|---|---|---|---|---|
| **Activity Diagram** (Task 2.1) | [`activity-diagram-task-2.1.png`](./activity-diagram-task-2.1.png) | [`activity-diagram.png`](./activity-diagram.png)<br>[`activity-diagram.svg`](./activity-diagram.svg) | [`activity-diagram.puml`](./activity-diagram.puml) | Chuẩn hóa quy trình đặt hàng, trừ kho, thanh toán mô phỏng (thất bại đuôi `0000`, thành công) và nhánh thử lại thanh toán theo Hợp đồng API mục 4 & 5. |
| **Sequence Diagram** (Task 2.2) | [`sequence diagram.png`](./sequence%20diagram.png) | Đang dùng bản gốc PNG của nhóm | [`sequencediagram.puml`](./sequencediagram.puml) | Luồng tuần tự tương tác giữa Customer, Next.js UI, NestJS API, PostgreSQL và Mock Payment Service. |
| **Class Diagram** (Task 2.3) | [`class diagram(2.3).png`](./class%20diagram(2.3).png) | [`classdiagram.png`](./classdiagram.png)<br>[`classdiagram.svg`](./classdiagram.svg) | [`classdiagram.puml`](./classdiagram.puml) | Mô hình thực thể: `User`, `Product`, `Order`, `OrderItem`, `Payment`, enum `OrderStatus`, `PaymentStatus`, `PaymentMethod`. Loại bỏ các bảng không dùng (`Size`, `Promotion`, `LoyaltyTransaction`) đúng theo Hợp đồng API mục 2. |
| **Deployment Diagram** (Task 3.2) | [`deployment-diagram-task-3.2.png`](../architecture/deployment-diagram-task-3.2.png) *(ở thư mục architecture)* | [`deployment-diagram.png`](./deployment-diagram.png)<br>[`deployment-diagram.svg`](./deployment-diagram.svg)<br>*(và bản sao tại `docs/architecture/`)* | [`deployment-diagram.puml`](./deployment-diagram.puml) | Kiến trúc triển khai 3 dịch vụ độc lập trên Render: Web Next.js, API NestJS, PostgreSQL 16; giao tiếp trực tiếp qua HTTPS/CORS theo ADR-009. |

---

## 2. Tiêu chí nghiệm thu (Assignment 2)
- Toàn bộ sơ đồ mới đều có cả **mã nguồn PlantUML (`.puml`)** và **ảnh kết xuất (`.png` / `.svg`)** theo đúng yêu cầu đề bài.
- Các ảnh gốc của nhóm được giữ nguyên vẹn 100% để đối chiếu lịch sử phát triển.

