/**
 * BrewLite - End-to-End (E2E) Test Suite
 * Luồng hoàn chỉnh từ Menu -> Chi tiết món -> Auth -> Đặt đơn -> Thanh toán Idempotency -> Xác nhận đơn
 *
 * Tiêu chuẩn: Node.js 26 built-in test runner (node:test) & native fetch
 * Chạy lệnh: node --test tests/e2e-order-flow.test.mjs
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.API_URL || process.env.PRODUCTION_API_URL || 'http://localhost:3001';

describe('BrewLite - End-to-End (E2E) Order Flow Test Suite', () => {
  let authToken = '';
  let customerUser = null;
  let drinkProduct = null;
  let cakeProduct = null;
  let toppingsList = [];
  let createdOrder = null;
  let lastPaymentKey = '';

  before(async () => {
    // Kiểm tra kết nối tới server trước khi chạy test
    try {
      const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        throw new Error(`Máy chủ phản hồi mã HTTP: ${res.status}`);
      }
    } catch (err) {
      console.error(`\n❌ [E2E] Không thể kết nối tới API tại: ${BASE_URL}`);
      console.error(`Vui lòng đảm bảo API đang chạy tại ${BASE_URL} (ví dụ: 'cd apps/api && npm run start:dev') hoặc truyền biến API_URL.\n`);
      throw err;
    }
  });

  // =========================================================================
  // BƯỚC 1: HEALTH CHECK
  // =========================================================================
  test('1. Máy chủ hoạt động bình thường (GET /health)', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    assert.equal(res.status, 200, 'Health check phải trả về HTTP 200');
    const data = await res.json();
    assert.equal(data.status, 'ok', 'Body health check phải có status: ok');
  });

  // =========================================================================
  // BƯỚC 2: XEM MENU VÀ TÌM KIẾM MÓN (FR-01)
  // =========================================================================
  test('2.1 Lấy danh sách menu sản phẩm (GET /products)', async () => {
    const res = await fetch(`${BASE_URL}/products`);
    assert.equal(res.status, 200, 'GET /products phải trả về HTTP 200');
    const products = await res.json();
    assert.ok(Array.isArray(products), 'Dữ liệu menu phải là một danh sách mảng');
    assert.ok(products.length >= 12, 'Menu phải có ít nhất 12 sản phẩm mẫu');

    // Tìm một món nước còn hàng để đặt đơn
    drinkProduct = products.find((p) => p.category !== 'CAKE' && p.stock > 0);
    assert.ok(drinkProduct, 'Phải có ít nhất 1 món nước còn hàng trong menu');

    // Tìm một món bánh để kiểm tra ràng buộc không topping/size
    cakeProduct = products.find((p) => p.category === 'CAKE' && p.stock > 0);
    assert.ok(cakeProduct, 'Phải có ít nhất 1 món bánh còn hàng trong menu');
  });

  test('2.2 Lọc sản phẩm theo danh mục TEA (GET /products?category=TEA)', async () => {
    const res = await fetch(`${BASE_URL}/products?category=TEA`);
    assert.equal(res.status, 200);
    const products = await res.json();
    assert.ok(products.length > 0, 'Danh mục TEA phải có sản phẩm');
    for (const p of products) {
      assert.equal(p.category, 'TEA', 'Sản phẩm trả về phải thuộc danh mục TEA');
    }
  });

  test('2.3 Tìm kiếm sản phẩm theo từ khóa (GET /products?q=trà)', async () => {
    const res = await fetch(`${BASE_URL}/products?q=trà`);
    assert.equal(res.status, 200);
    const products = await res.json();
    assert.ok(products.length > 0, 'Tìm kiếm từ khóa "trà" phải trả về kết quả');
    for (const p of products) {
      assert.match(p.name.toLowerCase(), /trà/i, 'Tên món phải chứa chuỗi tìm kiếm');
    }
  });

  // =========================================================================
  // BƯỚC 3: XEM CHI TIẾT SẢN PHẨM & TÙY CHỌN (FR-02)
  // =========================================================================
  test('3.1 Xem chi tiết món nước (GET /products/:id)', async () => {
    const res = await fetch(`${BASE_URL}/products/${drinkProduct.id}`);
    assert.equal(res.status, 200, 'GET /products/:id phải trả về HTTP 200');
    const data = await res.json();

    assert.equal(data.id, drinkProduct.id);
    assert.ok(Array.isArray(data.sizes), 'Món nước phải có danh sách sizes');
    assert.ok(Array.isArray(data.sugarLevels), 'Món nước phải có danh sách sugarLevels');
    assert.ok(Array.isArray(data.iceLevels), 'Món nước phải có danh sách iceLevels');
    assert.ok(Array.isArray(data.toppings), 'Món nước phải có danh sách toppings');

    // Lưu lại toppings để dùng khi đặt hàng
    toppingsList = data.toppings;
    assert.ok(toppingsList.length >= 2, 'Cần ít nhất 2 topping trong hệ thống để test');
  });

  test('3.2 Xem chi tiết món bánh (GET /products/:id - không có size, đường, đá, topping)', async () => {
    const res = await fetch(`${BASE_URL}/products/${cakeProduct.id}`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.id, cakeProduct.id);
    assert.equal(data.sizes.length, 0, 'Món bánh không có sizes');
    assert.equal(data.sugarLevels.length, 0, 'Món bánh không có sugarLevels');
    assert.equal(data.iceLevels.length, 0, 'Món bánh không có iceLevels');
    assert.equal(data.toppings.length, 0, 'Món bánh không có toppings');
  });

  // =========================================================================
  // BƯỚC 4: ĐĂNG KÝ VÀ ĐĂNG NHẬP KHÁCH HÀNG (FR-04)
  // =========================================================================
  test('4.1 Đăng ký tài khoản khách hàng mới (POST /auth/register)', async () => {
    const randomId = Math.floor(Math.random() * 100000);
    const email = `e2e_user_${Date.now()}_${randomId}@brewlite.test`;
    const password = 'Password123@';
    const displayName = 'Khách Hàng E2E Test';

    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    });

    assert.equal(res.status, 201, 'Đăng ký phải trả về HTTP 201 Created');
    const user = await res.json();
    assert.equal(user.email, email.toLowerCase());
    assert.equal(user.displayName, displayName);
    assert.equal(user.role, 'CUSTOMER');

    customerUser = { email, password, displayName, id: user.id };
  });

  test('4.2 Đăng nhập tài khoản khách hàng để lấy JWT Token (POST /auth/login)', async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: customerUser.email,
        password: customerUser.password,
      }),
    });

    assert.equal(res.status, 200, 'Đăng nhập phải trả về HTTP 200 OK');
    const data = await res.json();
    assert.ok(data.accessToken, 'Phải có accessToken trong response');
    assert.equal(data.user.email, customerUser.email);
    assert.equal(data.user.role, 'CUSTOMER');

    authToken = data.accessToken;
  });

  // =========================================================================
  // BƯỚC 5: TẠO ĐƠN HÀNG TỪ GIỎ HÀNG (FR-03, FR-05)
  // =========================================================================
  test('5.1 Tạo đơn hàng từ giỏ (POST /orders)', async () => {
    const selectedToppings = toppingsList.slice(0, 2);
    const toppingIds = selectedToppings.map((t) => t.id);

    // Tính trước giá mong đợi phía Server để xác thực server tự tính giá:
    // Món 1: Drink (Size M: +6000đ, 2 toppings)
    const drinkUnitPrice = drinkProduct.basePrice + 6000 + selectedToppings.reduce((sum, t) => sum + t.price, 0);
    const drinkQuantity = 2;
    const drinkLineTotal = drinkUnitPrice * drinkQuantity;

    // Món 2: Cake (Không size, không topping)
    const cakeUnitPrice = cakeProduct.basePrice;
    const cakeQuantity = 1;
    const cakeLineTotal = cakeUnitPrice * cakeQuantity;

    const expectedTotal = drinkLineTotal + cakeLineTotal;

    const payload = {
      receiveType: 'TAKE_AWAY',
      note: 'Giao hàng E2E test tự động',
      items: [
        {
          productId: drinkProduct.id,
          quantity: drinkQuantity,
          size: 'M',
          sugarLevel: 'P70',
          iceLevel: 'NORMAL',
          toppingIds: toppingIds,
          note: 'Ít ngọt 70%',
        },
        {
          productId: cakeProduct.id,
          quantity: cakeQuantity,
          note: 'Bánh hâm nóng',
        },
      ],
    };

    const res = await fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 201, 'Tạo đơn hàng phải trả về HTTP 201 Created');
    const order = await res.json();

    assert.ok(order.id, 'Đơn hàng phải có ID');
    assert.ok(typeof order.orderNumber === 'number', 'Đơn hàng phải có số thứ tự orderNumber');
    assert.equal(order.status, 'PENDING', 'Trạng thái ban đầu của đơn phải là PENDING');
    assert.equal(order.totalAmount, expectedTotal, 'Tổng tiền phải do server tính toán chính xác');
    assert.equal(order.items.length, 2, 'Đơn hàng phải có đúng 2 dòng món');

    createdOrder = order;
  });

  test('5.2 Kiểm tra từ chối tạo đơn khi không đủ tồn kho (409 Conflict)', async () => {
    const res = await fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        receiveType: 'AT_COUNTER',
        items: [
          {
            productId: drinkProduct.id,
            quantity: 99999, // Vượt quá kho
          },
        ],
      }),
    });

    assert.equal(res.status, 409, 'Đặt số lượng vượt quá tồn kho phải trả về HTTP 409 Conflict');
    const errorBody = await res.json();
    assert.ok(errorBody.message, 'Phải có thông báo lỗi hết hàng');
  });

  // =========================================================================
  // BƯỚC 6: THANH TOÁN MÔ PHỎNG & IDEMPOTENCY KEY (FR-06)
  // =========================================================================
  test('6.1 Giả lập thanh toán THẤT BẠI khi số tài khoản đuôi 0000 (POST /payments)', async () => {
    const failIdempotencyKey = `idem-fail-${Date.now()}-${Math.random()}`;

    const res = await fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        'Idempotency-Key': failIdempotencyKey,
      },
      body: JSON.stringify({
        orderId: createdOrder.id,
        method: 'WALLET',
        accountNumber: '9988770000', // Đuôi 0000 -> Giả lập lỗi
      }),
    });

    assert.equal(res.status, 201, 'POST /payments thất bại vẫn trả về HTTP 201 Created');
    const payment = await res.json();

    assert.equal(payment.status, 'FAILED', 'Trạng thái thanh toán phải là FAILED');
    assert.equal(payment.accountLast4, '0000', 'Chỉ lưu 4 số cuối tài khoản');
    assert.equal(payment.order.status, 'PAYMENT_FAILED', 'Đơn hàng phải chuyển sang PAYMENT_FAILED');
  });

  test('6.2 Thử lại thanh toán THÀNH CÔNG với Idempotency-Key MỚI (POST /payments)', async () => {
    lastPaymentKey = `idem-success-${Date.now()}-${Math.random()}`;

    const res = await fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        'Idempotency-Key': lastPaymentKey,
      },
      body: JSON.stringify({
        orderId: createdOrder.id,
        method: 'CARD',
        accountNumber: '12345678901234', // Hợp lệ
      }),
    });

    assert.equal(res.status, 201, 'POST /payments thành công phải trả về HTTP 201 Created');
    const payment = await res.json();

    assert.equal(payment.status, 'SUCCESS', 'Trạng thái thanh toán phải là SUCCESS');
    assert.equal(payment.accountLast4, '1234', 'Chỉ lưu 4 số cuối của số thẻ');
    assert.equal(payment.amount, createdOrder.totalAmount, 'Số tiền thanh toán khớp tổng tiền đơn');
    assert.equal(payment.order.status, 'PAID', 'Đơn hàng phải chuyển sang trạng thái PAID');
  });

  test('6.3 Gửi lại đúng Idempotency-Key cũ phải trả kết quả cũ mà không trừ 2 lần (HTTP 200 OK)', async () => {
    const res = await fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        'Idempotency-Key': lastPaymentKey, // Dùng lại đúng key đã thành công
      },
      body: JSON.stringify({
        orderId: createdOrder.id,
        method: 'CARD',
        accountNumber: '12345678901234',
      }),
    });

    assert.equal(res.status, 200, 'Replay Idempotency-Key đã xử lý phải trả về HTTP 200 OK');
    const payment = await res.json();
    assert.equal(payment.status, 'SUCCESS');
    assert.equal(payment.orderId, createdOrder.id);
  });

  // =========================================================================
  // BƯỚC 7: XÁC NHẬN ĐƠN VÀ LỊCH SỬ ĐƠN HÀNG (FR-07)
  // =========================================================================
  test('7.1 Xem chi tiết đơn hàng và lịch sử thanh toán (GET /orders/:id)', async () => {
    const res = await fetch(`${BASE_URL}/orders/${createdOrder.id}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    assert.equal(res.status, 200, 'GET /orders/:id phải trả về HTTP 200 OK');
    const order = await res.json();

    assert.equal(order.id, createdOrder.id);
    assert.equal(order.status, 'PAID', 'Trạng thái đơn hàng phải là PAID');
    assert.ok(Array.isArray(order.payments), 'Đơn hàng phải có danh sách lịch sử thanh toán');
    assert.equal(order.payments.length, 2, 'Lịch sử thanh toán phải ghi nhận đủ cả 2 lần (1 FAILED và 1 SUCCESS)');

    const hasFailed = order.payments.some((p) => p.status === 'FAILED');
    const hasSuccess = order.payments.some((p) => p.status === 'SUCCESS');
    assert.ok(hasFailed && hasSuccess, 'Phải có cả bản ghi FAILED và SUCCESS trong lịch sử');
  });

  test('7.2 Xem danh sách lịch sử đơn hàng của tôi (GET /orders/me)', async () => {
    const res = await fetch(`${BASE_URL}/orders/me`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    assert.equal(res.status, 200, 'GET /orders/me phải trả về HTTP 200 OK');
    const orders = await res.json();

    assert.ok(Array.isArray(orders), 'Danh sách đơn hàng phải là mảng');
    assert.ok(orders.length >= 1, 'Danh sách phải chứa ít nhất 1 đơn vừa tạo');
    assert.equal(orders[0].id, createdOrder.id, 'Đơn hàng mới nhất phải đứng đầu danh sách');
  });

  test('7.3 Người dùng khác không được xem đơn của người này (404 Not Found)', async () => {
    // Đăng ký và đăng nhập một user khác
    const otherEmail = `e2e_other_${Date.now()}@brewlite.test`;
    await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: otherEmail, password: 'Password123@', displayName: 'Người dùng khác' }),
    });

    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: otherEmail, password: 'Password123@' }),
    });
    const { accessToken: otherToken } = await loginRes.json();

    // Dùng token của người khác để cố xem đơn của khách hàng này
    const res = await fetch(`${BASE_URL}/orders/${createdOrder.id}`, {
      headers: {
        Authorization: `Bearer ${otherToken}`,
      },
    });

    assert.equal(res.status, 404, 'Không được phép xem đơn của người dùng khác (phải trả về 404)');
  });
});

