# Quy ước làm việc với Git và Quy trình nhóm (BrewLite)

Tài liệu này quy định cách quản lý nhánh, quy ước commit và tiêu chuẩn hoàn thành (Definition of Done) cho 3 vai trong nhóm (**FE**, **BE**, **Dev&Ops**). Mọi thành viên bắt buộc tuân thủ để tránh xung đột mã nguồn.

---

## 1. Nhánh và Pull Request

### Các loại nhánh trong dự án
- **`main`**: Nhánh chính thức chứa sản phẩm hoàn chỉnh. Nhánh này chỉ nhận merge từ nhánh `some-diagram-and-SRS` đúng một lần duy nhất vào cuối đồ án (do **Dev&Ops** thực hiện).
- **`some-diagram-and-SRS`** (gọi tắt: nhánh *some*): Nhánh ghép chung của cả nhóm. Cả 3 vai đưa công việc đã hoàn thành vào nhánh này thông qua Pull Request (PR).
- **Nhánh riêng của từng vai**:
  - `feature/frontend`: Dành riêng cho **FE**
  - `feature/backend`: Dành riêng cho **BE**
  - `feature/devops`: Dành riêng cho **Dev&Ops**
  - Mỗi thành viên chỉ làm việc trên nhánh riêng của vai mình. **Tuyệt đối không ai push thẳng lên `main` hoặc `some-diagram-and-SRS`**.

### Quy trình mở Pull Request (PR)
- **Chọn nhánh gốc (Base):** Khi tạo PR trên GitHub, ô `base` **bắt buộc phải là `some-diagram-and-SRS`** (mặc định GitHub hay để `main`, phải bấm đổi sang `some-diagram-and-SRS`).
- **Phạm vi trong PR:** Mỗi PR chỉ được chứa các file thuộc khu vực phụ trách của đúng vai đó (xem phân chia khu vực trong `AGENTS.md`).
- **Kiểm tra tự động (CI):** Hệ thống CI GitHub Actions phải chạy qua cả hai job `api` và `web` (báo tích xanh) thì PR mới đủ điều kiện merge.
- **Mô tả PR:** Bắt buộc ghi rõ lý do và tóm tắt những thay đổi được thực hiện trong PR.

---

## 2. Quy ước Commit

### Cấu trúc thông điệp commit
Mỗi commit tuân theo cú pháp:
```
loại(phạm vi): mô tả ngắn gọn
```

### Các loại commit (`loại`)
- `feat`: Thêm tính năng mới (ví dụ: tạo trang mới, thêm API mới).
- `fix`: Sửa lỗi (bug).
- `ci`: Cấu hình hệ thống CI/CD (GitHub Actions, pipeline).
- `docs`: Thêm hoặc cập nhật tài liệu (`docs/`, `README.md`).
- `chore`: Công việc lặt vặt (dọn dẹp, chỉnh sửa cấu hình không ảnh hưởng logic).

### Phạm vi (`phạm vi`)
- `api`: Công việc thuộc backend NestJS (`apps/api`).
- `web`: Công việc thuộc frontend Next.js (`apps/web`).
- *Bỏ trống*: Dành cho các công việc chung của toàn dự án (ví dụ: `ci:`, `docs:`, `chore:`).

### Ví dụ commit chuẩn
- `feat(api): thêm endpoint lấy danh sách sản phẩm GET /products`
- `fix(web): sửa lỗi vỡ khung nút thanh toán trên màn hình máy tính`
- `ci: thêm workflow kiểm tra lint, test, build tự động cho api và web`
- `docs: cập nhật hướng dẫn chạy database trong README`
- `chore: dọn dẹp các biến mẫu trong .env.example`

### Quy tắc commit bắt buộc
1. **Commit nhỏ, rõ ràng:** Mỗi commit chỉ giải quyết đúng một việc cụ thể.
2. **Không commit hàng loạt:** Tuyệt đối không dùng lệnh `git add .` hoặc `git add -A`. Phải dùng `git add <tên_file>` cho từng file một.
3. **Kiểm tra khu vực trước khi commit:** Luôn chạy `git status` trước khi commit để chắc chắn 100% các file thay đổi thuộc khu vực mình phụ trách.
4. **Cấm commit các file nhạy cảm và file rác:** Không bao giờ đưa lên Git các file `.env`, `.role.local`, file khóa `*.pem` hoặc thư mục `node_modules`.

---

## 3. Definition of Done (Checklist hoàn thành)

Một công việc (task / issue) chỉ được xem là **hoàn thành (Done)** khi đáp ứng đầy đủ tất cả các tiêu chí sau:

- [ ] Chạy được trên máy local, không gặp lỗi biên dịch (build).
- [ ] Tất cả các bước Lint, Test và Build đều qua (CI trên GitHub báo xanh).
- [ ] Mỗi tính năng đều có bài test tối thiểu đi kèm.
- [ ] README của phần mình (hoặc README gốc nếu là Dev&Ops) đã được cập nhật cách chạy mới nhất.
- [ ] Chỉ thay đổi các file nằm đúng trong khu vực quản lý của vai mình.
- [ ] Người phụ trách đã tự chạy thử trên máy của mình và kiểm chứng kết quả đúng.
- [ ] Pull Request có mô tả lý do rõ ràng và đã được merge thành công vào nhánh `some-diagram-and-SRS`.

