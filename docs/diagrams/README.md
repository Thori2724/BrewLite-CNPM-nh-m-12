# Danh mục Sơ đồ Hệ thống (BrewLite Diagrams)

Thư mục này lưu trữ đầy đủ cả **sơ đồ gốc ban đầu của nhóm** và **các sơ đồ chuẩn hóa mới** được render từ mã nguồn PlantUML (`.puml`) đồng bộ với Hợp đồng API (`docs/api-contract.md`) và kiến trúc triển khai thực tế.

---

## 1. Bảng đối chiếu Sơ đồ Hình ảnh (Cũ và Mới)

| Loại sơ đồ | Sơ đồ gốc ban đầu (Giữ nguyên) | Sơ đồ chuẩn hóa mới (Render từ PlantUML) | Ghi chú cập nhật |
|---|---|---|---|
| **Activity Diagram** (Task 2.1) | [`activity-diagram-task-2.1.png`](./activity-diagram-task-2.1.png) *(Bản vẽ ban đầu của nhóm)* | [`activity-diagram-ver2.drawio.png`](./activity-diagram-ver2.drawio.png) *(Draw.io mới)*<br>[`activity-diagram.png`](./activity-diagram.png)<br>[`activity-diagram.svg`](./activity-diagram.svg) *(Render từ PlantUML)* | Chuẩn hóa quy trình đặt hàng (UC-01), trừ kho, thanh toán mô phỏng (thất bại đuôi `0000`, thành công) và nhánh thử lại thanh toán theo Hợp đồng API mục 4 & 5. |
| **Sequence Diagram** (Task 2.2) | Bản vẽ ban đầu của nhóm | [`sequence diagram.png`](./sequence%20diagram.png)<br>[`sequencediagram.svg`](./sequencediagram.svg) | Đồng bộ tuần tự giữa Khách hàng, UI Next.js, API NestJS, PostgreSQL và Mock Gateway theo UC-01 và Hợp đồng API (`POST /orders`, `POST /payments` kèm `Idempotency-Key`). |
| **Class Diagram** (Task 2.3) | [`class diagram(2.3).png`](./class%20diagram(2.3).png) *(Bản vẽ ban đầu của nhóm)* | [`classdiagram.png`](./classdiagram.png)<br>[`classdiagram.svg`](./classdiagram.svg) | Mô hình thực thể: `User`, `Product`, `Order`, `OrderItem`, `Payment`, enum `OrderStatus`, `PaymentStatus`, `PaymentMethod`. Loại bỏ các bảng không dùng (`Size`, `Promotion`, `LoyaltyTransaction`) đúng theo Hợp đồng API mục 2. |
| **Deployment Diagram** (Task 3.2) | [`deployment-diagram-task-3.2.png`](../architecture/deployment-diagram-task-3.2.png) *(ở thư mục architecture)* | [`deployment-diagram.png`](./deployment-diagram.png)<br>[`deployment-diagram.svg`](./deployment-diagram.svg)<br>*(và bản sao tại `docs/architecture/`)* | Kiến trúc triển khai 3 dịch vụ độc lập trên Render: Web Next.js, API NestJS, PostgreSQL 16; giao tiếp trực tiếp qua HTTPS/CORS theo ADR-009. |

---

## 2. Bảng đối chiếu Tệp mã nguồn PlantUML (`.puml`)

Để tiện so sánh và đối chiếu giữa các phiên bản thiết kế, tất cả các tệp `.puml` cũ gốc đã được khôi phục nguyên vẹn và lưu song song cùng các tệp `.puml` mới:

| Loại sơ đồ | Mã nguồn CŨ gốc (Khôi phục) | Mã nguồn MỚI (Đồng bộ API Contract) | Các điểm khác biệt chính |
|---|---|---|---|
| **Activity Diagram** | [`activity-diagram.puml`](./activity-diagram.puml)<br>[`activity-diagram-old.puml`](./activity-diagram-old.puml) | [`activity-diagram-new.puml`](./activity-diagram-new.puml) | • **JWT**: Bản mới ghi rõ thời hạn JWT 24h.<br>• **Kho**: Bản mới nhấn mạnh kiểm tra tồn kho cộng gộp theo món và transaction ACID.<br>• **Mã lỗi**: Bản mới bổ sung mã lỗi cụ thể `409 Conflict`.<br>• **Thanh toán**: Bản mới bổ sung quy tắc mô phỏng tài khoản đuôi `0000` thất bại, cơ chế bấm "Thử lại thanh toán" sinh `Idempotency-Key` mới mà không tạo lại đơn. |
| **Class Diagram** | [`classdiagram.puml`](./classdiagram.puml)<br>[`classdiagram-old.puml`](./classdiagram-old.puml) | [`classdiagram-new.puml`](./classdiagram-new.puml) | • **Kiểu tiền tệ**: Bản cũ dùng `Decimal`, bản mới chuẩn hóa `Int` (VND nguyên).<br>• **Thuộc tính User**: Đổi `fullName` thành `displayName` khớp với Schema và Auth DTO.<br>• **Payment**: Đổi `gatewayRef` thành `accountLast4` (chỉ lưu 4 số cuối tài khoản).<br>• **Enum**: Chuẩn hóa `PaymentMethod` thành `WALLET` / `CARD` (bản cũ dùng `E_WALLET` / `BANK_CARD`).<br>• **Bảng mở rộng**: Bổ sung ghi chú rõ `Promotion` và `LoyaltyTransaction` là phạm vi mở rộng trong Task 2.3, không tạo bảng DB theo Hợp đồng API mục 2. |
| **Sequence Diagram** | Bản cũ sơ khai | [`sequencediagram.puml`](./sequencediagram.puml) | • **Endpoint**: Chuẩn hóa gọi `POST /orders` và `POST /payments` khớp chính xác Hợp đồng API (thay vì endpoint cũ `POST /orders/:id/payments`).<br>• **Quy tắc hệ thống**: Bỏ hoàn toàn luồng hủy đơn tự động sau 15 phút (theo quyết định đã chốt mục 7).<br>• **Thanh toán mô phỏng**: Chuẩn hóa luồng ngoại lệ E1 (mô phỏng thất bại khi số tài khoản tận cùng `0000`), trả về `200 OK` với `status: FAILED` và vòng lặp thử lại thanh toán với `Idempotency-Key` mới trên cùng đơn hàng. |
| **Deployment Diagram** | *(Ban đầu chỉ có ảnh AWS)* | [`deployment-diagram.puml`](./deployment-diagram.puml) | Mã nguồn PlantUML mô hình hóa kiến trúc triển khai thực tế trên Cloud Render (ADR-009). |

---

## 3. Tiêu chí nghiệm thu (Assignment 2)
- Toàn bộ sơ đồ đều có đầy đủ **mã nguồn PlantUML (`.puml`)** và **ảnh kết xuất (`.png` / `.svg`)** theo đúng yêu cầu đề bài.
- Giữ nguyên vẹn toàn bộ lịch sử thiết kế và tài liệu gốc của nhóm.
