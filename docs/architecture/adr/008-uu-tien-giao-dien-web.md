# ADR-008: Ưu tiên Giao diện Web trên Máy tính (Desktop-First)

- **Trạng thái:** Accepted
- **Ngày:** 2026-11-09

## Bối cảnh
Ban đầu nhóm dự kiến phát triển giao diện theo định hướng Mobile-first kết hợp Progressive Web App (PWA) theo mô tả ban đầu. Tuy nhiên, trong quá trình hướng dẫn đồ án, giảng viên đã yêu cầu chính thức: **ưu tiên trải nghiệm giao diện Web trên màn hình máy tính (desktop-first)** để phục vụ chấm điểm và trình diễn, đồng thời vẫn bảo đảm tính co giãn linh hoạt (responsive) trên các thiết bị di động.

## Quyết định
1. **Thiết kế Desktop-first:** Giao diện người dùng được xây dựng bằng Next.js App Router và Tailwind CSS v4, tối ưu hóa bố cục, bảng menu và luồng thanh toán cho màn hình lớn của máy tính để bàn và laptop.
2. **Responsive trên di động:** Áp dụng hệ thống responsive của Tailwind CSS (`sm:`, `md:`, `lg:`) để tự động co giãn và hiển thị mượt mà trên màn hình điện thoại (độ phân giải từ 375px đến 430px).
3. **Không phát triển PWA:** Loại bỏ hoàn toàn cấu hình PWA (không dùng file manifest offline, không cài đặt Service Worker phức tạp để cache tài nguyên).

## Hệ quả
- **Ưu điểm:**
  - Đáp ứng chính xác yêu cầu của giảng viên hướng dẫn.
  - Tối ưu hóa không gian hiển thị: xem danh sách món ăn, tùy chọn size/đường/đá/topping và giỏ hàng trực quan, rộng rãi.
  - Giảm thiểu đáng kể độ phức tạp kỹ thuật và lỗi xung đột cache dữ liệu do Service Worker của PWA gây ra.
- **Hạn chế:**
  - Khách hàng không thể cài đặt web thành biểu tượng ứng dụng độc lập trên màn hình chính của điện thoại hoặc duyệt web ngoại tuyến (offline). Tuy nhiên, đối với ứng dụng đặt món trực tuyến tại quán, việc kết nối mạng là điều kiện bắt buộc để kiểm tra tồn kho và thanh toán.

## Phương án đã xem xét
- **Mobile-first PWA:** Tiêu tốn nhiều thời gian cấu hình Service Worker và đồng bộ offline, không phù hợp với yêu cầu thực tế và thời gian của đồ án.
- **Phát triển Native Mobile App (React Native/Flutter):** Vượt quá giới hạn công nghệ quy định của đồ án (Next.js & NestJS).

