import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MenuPage from '../app/page';
import ProductCard from '../app/components/ProductCard';
import * as api from '../services/api';
import { isSoldOut, notifyProductsInvalidated, Product } from '../services/api';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return {
    ...actual,
    getProducts: vi.fn(),
  };
});

const mockProducts: Product[] = [
  {
    id: '11111111-0000-0000-0000-000000000001',
    name: 'Cà phê sữa đá',
    category: 'COFFEE',
    basePrice: 29000,
    imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500',
    stock: 50,
  },
  {
    id: '11111111-0000-0000-0000-000000000003',
    name: 'Bạc xỉu',
    category: 'COFFEE',
    basePrice: 32000,
    imageUrl: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=500',
    stock: 0, // Món hết hàng
  },
  {
    id: '11111111-0000-0000-0000-000000000004',
    name: 'Trà đào cam sả',
    category: 'TEA',
    basePrice: 39000,
    imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500',
    stock: 35,
  },
  {
    id: '11111111-0000-0000-0000-000000000007',
    name: 'Trà sữa truyền thống',
    category: 'MILK_TEA',
    basePrice: 35000,
    imageUrl: 'https://images.unsplash.com/photo-1558857563-b371033873b8?w=500',
    stock: 40,
  },
  {
    id: '11111111-0000-0000-0000-000000000010',
    name: 'Bánh Croissant',
    category: 'CAKE',
    basePrice: 30000,
    imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500',
    stock: 20,
  },
];

describe('Trang Menu (MenuPage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Test 1: Render lưới món khi API trả dữ liệu
  it('1. Render lưới món khi API trả dữ liệu: thấy tên và basePrice của các món', async () => {
    vi.mocked(api.getProducts).mockResolvedValue(mockProducts);

    render(<MenuPage />);

    await waitFor(() => {
      expect(screen.getByText('Cà phê sữa đá')).toBeInTheDocument();
    });

    expect(screen.getByText('Bạc xỉu')).toBeInTheDocument();
    expect(screen.getByText('Trà đào cam sả')).toBeInTheDocument();
    expect(screen.getByText('Trà sữa truyền thống')).toBeInTheDocument();
    expect(screen.getByText('Bánh Croissant')).toBeInTheDocument();

    // Kiểm tra giá tiền hiển thị đúng theo basePrice
    expect(screen.getByText(/29\.000/)).toBeInTheDocument();
    expect(screen.getByText(/39\.000/)).toBeInTheDocument();
  });

  // Test 2: Hiện trạng thái loading khi đang tải
  it('2. Hiện trạng thái loading khi đang tải', () => {
    vi.mocked(api.getProducts).mockImplementation(() => new Promise(() => {}));

    render(<MenuPage />);

    expect(screen.getByText('Đang tải danh sách món...')).toBeInTheDocument();
  });

  // Test 3: Hiện trạng thái empty khi API trả mảng rỗng
  it('3. Hiện trạng thái empty khi API trả mảng rỗng', async () => {
    vi.mocked(api.getProducts).mockResolvedValue([]);

    render(<MenuPage />);

    await waitFor(() => {
      expect(screen.getByText('Không tìm thấy món phù hợp')).toBeInTheDocument();
    });
  });

  // Test 4: Hiện trạng thái error khi API lỗi và có nút Thử lại
  it('4. Hiện trạng thái error khi API lỗi và có nút Thử lại', async () => {
    vi.mocked(api.getProducts).mockRejectedValue(new Error('Lỗi kết nối máy chủ'));

    render(<MenuPage />);

    await waitFor(() => {
      expect(screen.getByText('Lỗi kết nối máy chủ')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  // Test 5: Món hết hàng (stock = 0) có nhãn "Hết hàng", ảnh xám, không hiện tồn kho và nút "Tạm hết" bị vô hiệu hóa
  it('5. Món hết hàng (stock = 0) có nhãn "Hết hàng", nút "Tạm hết" bị vô hiệu hóa và không hiện số tồn kho', async () => {
    vi.mocked(api.getProducts).mockResolvedValue(mockProducts);

    render(<MenuPage />);

    await waitFor(() => {
      expect(screen.getByText('Cà phê sữa đá')).toBeInTheDocument();
    });

    // Chỉ có 1 món có stock = 0 ('Bạc xỉu')
    const outOfStockBadges = screen.getAllByText('Hết hàng');
    expect(outOfStockBadges).toHaveLength(1);

    // Ảnh món tạm hết bị xám
    const outOfStockImg = screen.getByAltText('Bạc xỉu');
    expect(outOfStockImg.className).toContain('grayscale');

    // Không hiển thị số lượng tồn kho
    expect(screen.queryByText(/tồn kho/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bcòn \d+/i)).not.toBeInTheDocument();

    // Món còn hàng có nút '+ Thêm'
    expect(screen.getAllByRole('button', { name: '+ Thêm' }).length).toBe(4);
    // Món hết hàng có nút 'Tạm hết' bị vô hiệu hóa và không bọc trong link #
    const outOfStockBtn = screen.getByRole('button', { name: 'Tạm hết' });
    expect(outOfStockBtn).toBeDisabled();
    expect(outOfStockBtn.closest('a')).toBeNull();
  });

  // Test 6: Chọn danh mục gọi getProducts với category tương ứng, "Tất cả" không gửi category
  it('6. Chọn danh mục gọi getProducts với category đúng chuẩn hợp đồng, "Tất cả" không gửi category', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getProducts).mockResolvedValue(mockProducts);

    render(<MenuPage />);

    await waitFor(() => {
      expect(screen.getByText('Cà phê sữa đá')).toBeInTheDocument();
    });

    // Ban đầu gọi với category: undefined
    expect(api.getProducts).toHaveBeenCalledWith({ category: undefined, q: undefined });

    // Bấm chọn danh mục "Trà sữa"
    const traSuaBtn = screen.getByRole('button', { name: 'Trà sữa' });
    await user.click(traSuaBtn);

    await waitFor(() => {
      expect(api.getProducts).toHaveBeenCalledWith({ category: 'MILK_TEA', q: undefined });
    });

    // Bấm chọn danh mục "Bánh"
    const banhBtn = screen.getByRole('button', { name: 'Bánh' });
    await user.click(banhBtn);

    await waitFor(() => {
      expect(api.getProducts).toHaveBeenCalledWith({ category: 'CAKE', q: undefined });
    });

    // Bấm quay lại "Tất cả"
    const tatCaBtn = screen.getByRole('button', { name: 'Tất cả' });
    await user.click(tatCaBtn);

    await waitFor(() => {
      expect(api.getProducts).toHaveBeenLastCalledWith({ category: undefined, q: undefined });
    });
  });

  // Test 7: Debounce tìm kiếm 300ms bằng setTimeout
  it('7. Debounce ô tìm kiếm 300ms: chỉ gọi API sau khi dừng gõ 300ms', async () => {
    vi.useFakeTimers();
    vi.mocked(api.getProducts).mockResolvedValue(mockProducts);

    render(<MenuPage />);

    // Chờ lượt tải ban đầu
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const searchInput = screen.getByPlaceholderText('Tìm kiếm món ăn, đồ uống...');

    act(() => {
      fireEvent.change(searchInput, { target: { value: 'croissant' } });
    });

    // Trong 200ms đầu chưa gọi API tìm kiếm
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(api.getProducts).not.toHaveBeenCalledWith(
      expect.objectContaining({ q: 'croissant' })
    );

    // Qua 300ms gọi API với từ khóa tìm kiếm
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(api.getProducts).toHaveBeenCalledWith({
      category: undefined,
      q: 'croissant',
    });
  });

  // Test 8: Lỗi 400 Bad Request từ server (ví dụ danh mục không hợp lệ) hiển thị đúng message tiếng Việt
  it('8. Nhận lỗi 400 từ server: hiển thị đúng message tiếng Việt của server', async () => {
    vi.mocked(api.getProducts).mockRejectedValue(
      new Error('Danh mục không hợp lệ. Cho phép: TEA, COFFEE, MILK_TEA, CAKE')
    );

    render(<MenuPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Danh mục không hợp lệ. Cho phép: TEA, COFFEE, MILK_TEA, CAKE')
      ).toBeInTheDocument();
    });
  });

  // Test 9: Thẻ ProductCard chỉ dựa vào stock <= 0 (không hiện số tồn kho)
  it('9. ProductCard với stock = 0 và stock < 0 hiện "Hết hàng", ảnh xám, nút "Tạm hết" và ẩn số tồn kho', () => {
    expect(isSoldOut(0)).toBe(true);
    expect(isSoldOut(-5)).toBe(true);
    expect(isSoldOut(1)).toBe(false);

    const { rerender } = render(
      <ProductCard
        product={{
          id: 'p-test',
          name: 'Matcha Latte',
          category: 'MILK_TEA',
          basePrice: 45000,
          imageUrl: 'https://example.com/matcha.jpg',
          stock: 0,
        }}
      />
    );

    expect(screen.getByText('Hết hàng')).toBeInTheDocument();
    expect(screen.getByAltText('Matcha Latte').className).toContain('grayscale');
    expect(screen.getByRole('button', { name: 'Tạm hết' })).toBeDisabled();
    expect(screen.queryByText(/\b0\b/)).not.toBeInTheDocument();

    // stock âm cũng xử lý giống hệt stock = 0
    rerender(
      <ProductCard
        product={{
          id: 'p-test',
          name: 'Matcha Latte',
          category: 'MILK_TEA',
          basePrice: 45000,
          imageUrl: 'https://example.com/matcha.jpg',
          stock: -2,
        }}
      />
    );
    expect(screen.getByText('Hết hàng')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạm hết' })).toBeDisabled();

    // stock = 1 hiện nút + Thêm và ẩn số 1
    rerender(
      <ProductCard
        product={{
          id: 'p-test',
          name: 'Matcha Latte',
          category: 'MILK_TEA',
          basePrice: 45000,
          imageUrl: 'https://example.com/matcha.jpg',
          stock: 1,
        }}
      />
    );
    expect(screen.queryByText('Hết hàng')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Thêm' })).toBeEnabled();
    expect(screen.queryByText(/\b1\b/)).not.toBeInTheDocument();
  });

  // Test 10: Menu tải lại số liệu mới khi quay lại hoặc sau khi đặt đơn / hủy đơn (không tải lại khi đổi tab)
  it('10. Menu gọi lại GET /products khi quay lại hoặc sau đặt đơn/hủy đơn, cập nhật xám khi hết và mở lại khi hủy', async () => {
    const firstLoad: Product[] = [
      { ...mockProducts[0], stock: 1 },
    ];
    const afterOrder: Product[] = [
      { ...mockProducts[0], stock: 0 },
    ];
    const afterCancel: Product[] = [
      { ...mockProducts[0], stock: 1 },
    ];

    vi.mocked(api.getProducts)
      .mockResolvedValueOnce(firstLoad)
      .mockResolvedValueOnce(afterOrder)
      .mockResolvedValueOnce(afterCancel);

    const { unmount } = render(<MenuPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '+ Thêm' })).toBeEnabled();
    });

    // Chuyển tab (visibilitychange / focus) KHÔNG tự tải lại menu
    act(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(api.getProducts).toHaveBeenCalledTimes(1);

    // Sau khi đặt món cuối cùng -> phát tín hiệu tải lại -> món tự xám, hiện "Hết hàng" & "Tạm hết"
    act(() => {
      notifyProductsInvalidated();
    });

    await waitFor(() => {
      expect(screen.getByText('Hết hàng')).toBeInTheDocument();
    });
    expect(screen.getByAltText('Cà phê sữa đá').className).toContain('grayscale');
    expect(screen.getByRole('button', { name: 'Tạm hết' })).toBeDisabled();
    expect(api.getProducts).toHaveBeenCalledTimes(2);

    // Rời menu rồi quay lại (mô phỏng hủy đơn xong quay lại menu) -> tải lại GET /products -> đang bán lại
    unmount();
    render(<MenuPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '+ Thêm' })).toBeEnabled();
    });
    expect(screen.queryByText('Hết hàng')).not.toBeInTheDocument();
    expect(api.getProducts).toHaveBeenCalledTimes(3);
  });
});
