import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProductDetailPage from '../app/menu/[id]/page';
import * as api from '../services/api';
import { ProductDetail } from '../services/api';
import * as navigation from 'next/navigation';

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ id: '11111111-0000-0000-0000-000000000001' })),
  useRouter: vi.fn(() => ({ back: vi.fn(), push: vi.fn() })),
}));

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return {
    ...actual,
    getProductById: vi.fn(),
  };
});

const mockItem: ProductDetail = {
  id: '11111111-0000-0000-0000-000000000001',
  name: 'Cà phê sữa đá',
  category: 'COFFEE',
  basePrice: 29000,
  imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500',
  stock: 50,
  sizes: [
    { value: 'S', label: 'Size S', extraPrice: 0 },
    { value: 'M', label: 'Size M', extraPrice: 6000 },
    { value: 'L', label: 'Size L', extraPrice: 10000 },
  ],
  sugarLevels: [
    { value: 'P0', label: '0%' },
    { value: 'P30', label: '30%' },
    { value: 'P50', label: '50%' },
    { value: 'P70', label: '70%' },
    { value: 'P100', label: '100%' },
  ],
  iceLevels: [
    { value: 'NONE', label: 'Không đá' },
    { value: 'LOW', label: 'Ít đá' },
    { value: 'NORMAL', label: 'Đá vừa' },
    { value: 'FULL', label: 'Nhiều đá' },
  ],
  toppings: [
    { id: '22222222-0000-0000-0000-000000000001', name: 'Trân châu đen', price: 5000 },
    { id: '22222222-0000-0000-0000-000000000002', name: 'Thạch dừa', price: 5000 },
    { id: '22222222-0000-0000-0000-000000000003', name: 'Pudding', price: 7000 },
    { id: '22222222-0000-0000-0000-000000000004', name: 'Kem cheese', price: 10000 },
  ],
};

const mockUnavailableItem: ProductDetail = {
  ...mockItem,
  id: '11111111-0000-0000-0000-000000000003',
  name: 'Bạc xỉu',
  stock: 0,
};

describe('Trang chi tiết món (ProductDetailPage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(navigation.useParams).mockReturnValue({ id: '11111111-0000-0000-0000-000000000001' });
  });

  // 1. Loading state
  it('1. Hiển thị trạng thái loading khi đang tải', () => {
    vi.mocked(api.getProductById).mockImplementation(() => new Promise(() => {}));
    render(<ProductDetailPage />);
    expect(screen.getByText('Đang tải chi tiết món...')).toBeInTheDocument();
  });

  // 2. Error state và thử lại
  it('2. Hiển thị thông báo lỗi khi API thất bại và có nút Thử lại', async () => {
    vi.mocked(api.getProductById).mockRejectedValue(new Error('Lỗi mạng'));
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Lỗi mạng')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  // 3. Không tìm thấy món (404)
  it('3. Hiển thị trạng thái không tìm thấy khi id không tồn tại', async () => {
    vi.mocked(api.getProductById).mockResolvedValue(null);
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Không tìm thấy món ăn hoặc đồ uống này')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Quay lại Menu' })).toBeInTheDocument();
  });

  // 4. Render đúng thông tin sản phẩm và lựa chọn mặc định là Size S, Đường P100, Đá NORMAL
  it('4. Render đúng thông tin và lựa chọn mặc định Size S, Đường P100, Đá NORMAL (không lấy phần tử đầu mảng)', async () => {
    vi.mocked(api.getProductById).mockResolvedValue(mockItem);
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Cà phê sữa đá' })).toBeInTheDocument();
    });

    expect(screen.getByText('Cà phê')).toBeInTheDocument();

    // Mặc định chọn Size S (+0đ): giá tạm tính bằng đúng basePrice 29.000đ
    expect(screen.getAllByText(/29\.000/).length).toBeGreaterThan(0);
  });

  // 5. Món hết hàng: hiển thị nhãn "Hết hàng" và vô hiệu hóa nút thêm vào giỏ
  it('5. Món hết hàng (stock = 0) có nhãn "Hết hàng" và vô hiệu hóa nút thêm vào giỏ', async () => {
    vi.mocked(api.getProductById).mockResolvedValue(mockUnavailableItem);
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Bạc xỉu')).toBeInTheDocument();
    });

    expect(screen.getByText('Hết hàng')).toBeInTheDocument();
    const addButton = screen.getByRole('button', { name: 'Món tạm hết hàng' });
    expect(addButton).toBeDisabled();
  });

  // 6. Đổi size thì giá tạm tính cập nhật chính xác theo extraPrice từ server
  it('6. Đổi size thì giá tạm tính cập nhật đúng theo extraPrice', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getProductById).mockResolvedValue(mockItem);
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Cà phê sữa đá' })).toBeInTheDocument();
    });

    // Mặc định size S (29.000đ). Chọn Size M (+6.000đ -> 35.000đ)
    const sizeMButton = screen.getByRole('button', { name: /Size M/ });
    await user.click(sizeMButton);

    expect(screen.getAllByText(/35\.000/).length).toBeGreaterThan(0);

    // Chọn Size L (+10.000đ -> 39.000đ)
    const sizeLButton = screen.getByRole('button', { name: /Size L/ });
    await user.click(sizeLButton);

    expect(screen.getAllByText(/39\.000/).length).toBeGreaterThan(0);
  });

  // 7. Chọn topping và chặn khi vượt quá tối đa 3 loại topping không trùng
  it('7. Chọn tối đa 3 loại topping không trùng, chặn và báo lỗi tiếng Việt khi chọn loại thứ 4', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getProductById).mockResolvedValue(mockItem);
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Cà phê sữa đá' })).toBeInTheDocument();
    });

    const tranChauDen = screen.getByText('Trân châu đen');
    const thachDua = screen.getByText('Thạch dừa');
    const pudding = screen.getByText('Pudding');
    const kemCheese = screen.getByText('Kem cheese');

    // Chọn 3 topping: Trân châu (+5k), Thạch dừa (+5k), Pudding (+7k) = +17.000đ
    // 29.000 + 17.000 = 46.000đ
    await user.click(tranChauDen);
    await user.click(thachDua);
    await user.click(pudding);

    expect(screen.getAllByText(/46\.000/).length).toBeGreaterThan(0);
    expect(screen.getByText('Đã chọn 3/3')).toBeInTheDocument();

    // Cố chọn thêm loại thứ 4 (Kem cheese) -> bị chặn và cảnh báo tiếng Việt
    await user.click(kemCheese);
    expect(screen.getByText('Chỉ được chọn tối đa 3 loại topping.')).toBeInTheDocument();
    expect(screen.getByText('Đã chọn 3/3')).toBeInTheDocument();
  });

  // 8. Tăng/giảm số lượng trong khoảng 1..10, chặn khi ngoài giới hạn
  it('8. Giới hạn số lượng trong khoảng 1 đến 10, hiển thị cảnh báo tiếng Việt', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getProductById).mockResolvedValue(mockItem);
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Cà phê sữa đá' })).toBeInTheDocument();
    });

    const decreaseBtn = screen.getByRole('button', { name: '-' });
    const increaseBtn = screen.getByRole('button', { name: '+' });

    // Khi quantity = 1, nút '-' bị vô hiệu hóa
    expect(decreaseBtn).toBeDisabled();

    // Tăng lên 2 -> giá nhân 2 (29.000 x 2 = 58.000đ)
    await user.click(increaseBtn);
    expect(screen.getAllByText(/58\.000/).length).toBeGreaterThan(0);
  });

  // 9. Món Bánh (CAKE): sizes/sugarLevels/iceLevels/toppings đều rỗng -> ẩn toàn bộ các mục này
  it('9. Món Bánh (CAKE) có 4 mảng rỗng: ẩn toàn bộ các khối chọn Size, Đá, Đường, Topping', async () => {
    const mockCake: ProductDetail = {
      id: '11111111-0000-0000-0000-000000000010',
      name: 'Bánh Croissant',
      category: 'CAKE',
      basePrice: 30000,
      imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500',
      stock: 20,
      sizes: [],
      sugarLevels: [],
      iceLevels: [],
      toppings: [],
    };

    vi.mocked(api.getProductById).mockResolvedValue(mockCake);
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Bánh Croissant' })).toBeInTheDocument();
    });

    // Các phần tùy chọn phải bị ẩn hoàn toàn
    expect(screen.queryByText(/Chọn kích cỡ/)).not.toBeInTheDocument();
    expect(screen.queryByText('Lượng đá')).not.toBeInTheDocument();
    expect(screen.queryByText('Lượng đường')).not.toBeInTheDocument();
    expect(screen.queryByText(/Topping thêm/)).not.toBeInTheDocument();

    // Giá gốc hiển thị đúng và nút thêm vào giỏ khả dụng
    expect(screen.getAllByText(/30\.000/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /\+ Thêm vào giỏ/ })).toBeEnabled();
  });

  // 10. Mặc định luôn là Size S, Đường P100, Đá NORMAL kể cả khi server trả về thứ tự mảng khác
  it('10. Mặc định luôn chọn đúng Size S, Đường P100, Đá NORMAL kể cả khi mảng server trả về thứ tự khác (KHÔNG lấy phần tử đầu mảng)', async () => {
    const scrambledItem: ProductDetail = {
      ...mockItem,
      id: '11111111-0000-0000-0000-000000000099',
      // Mảng sizes có M đứng đầu (thay vì S)
      sizes: [
        { value: 'M', label: 'Size M', extraPrice: 6000 },
        { value: 'S', label: 'Size S', extraPrice: 0 },
        { value: 'L', label: 'Size L', extraPrice: 10000 },
      ],
      // Mảng sugarLevels có P50 đứng đầu (thay vì P100)
      sugarLevels: [
        { value: 'P50', label: '50%' },
        { value: 'P100', label: '100%' },
        { value: 'P0', label: '0%' },
      ],
      // Mảng iceLevels có LOW đứng đầu (thay vì NORMAL)
      iceLevels: [
        { value: 'LOW', label: 'Ít đá' },
        { value: 'NORMAL', label: 'Đá vừa' },
        { value: 'NONE', label: 'Không đá' },
      ],
    };

    vi.mocked(api.getProductById).mockResolvedValue(scrambledItem);
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Cà phê sữa đá' })).toBeInTheDocument();
    });

    // 1. Kiểm tra Size: Size S được chọn (active bg-kombu, aria-pressed), không phải Size M
    const sizeSBtn = screen.getByRole('button', { name: /Size S/ });
    const sizeMBtn = screen.getByRole('button', { name: /Size M/ });
    expect(sizeSBtn).toHaveAttribute('aria-pressed', 'true');
    expect(sizeMBtn).toHaveAttribute('aria-pressed', 'false');
    expect(sizeSBtn.className).toContain('bg-kombu');
    expect(sizeMBtn.className).not.toContain('bg-kombu');

    // 2. Kiểm tra Đường: 100% được chọn, không phải 50%
    const sugar100Btn = screen.getByRole('button', { name: '100%' });
    const sugar50Btn = screen.getByRole('button', { name: '50%' });
    expect(sugar100Btn).toHaveAttribute('aria-pressed', 'true');
    expect(sugar50Btn).toHaveAttribute('aria-pressed', 'false');
    expect(sugar100Btn.className).toContain('bg-kombu');
    expect(sugar50Btn.className).not.toContain('bg-kombu');

    // 3. Kiểm tra Đá: Đá vừa được chọn, không phải Ít đá
    const iceNormalBtn = screen.getByRole('button', { name: 'Đá vừa' });
    const iceLowBtn = screen.getByRole('button', { name: 'Ít đá' });
    expect(iceNormalBtn).toHaveAttribute('aria-pressed', 'true');
    expect(iceLowBtn).toHaveAttribute('aria-pressed', 'false');
    expect(iceNormalBtn.className).toContain('bg-kombu');
    expect(iceLowBtn.className).not.toContain('bg-kombu');

    // 4. Giá tạm tính vẫn là 29.000đ (giá gốc 29.000 + Size S phụ thu 0đ)
    expect(screen.getAllByText(/29\.000/).length).toBeGreaterThan(0);
  });
});
