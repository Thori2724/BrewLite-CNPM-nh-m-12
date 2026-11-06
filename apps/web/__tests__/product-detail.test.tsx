import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProductDetailPage from '../app/menu/[id]/page';
import * as api from '../services/api';
import { ProductDetail } from '../services/api';
import * as navigation from 'next/navigation';

// Mock router và params
vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ id: '1' })),
  useRouter: vi.fn(() => ({ back: vi.fn(), push: vi.fn() })),
}));

// Mock API layer
vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return {
    ...actual,
    getProductById: vi.fn(),
  };
});

const mockItem: ProductDetail = {
  id: '1',
  name: 'Cà phê sữa đá',
  category: 'Ca phe',
  price: 29000,
  image: 'https://example.com/cf.jpg',
  isAvailable: true,
  description: 'Hương vị cà phê thơm ngon đậm đà truyền thống.',
  allowIce: true,
  allowSugar: true,
  allowSize: true,
  allowTopping: true,
};

const mockUnavailableItem: ProductDetail = {
  ...mockItem,
  id: '3',
  name: 'Trà đào cam sả',
  isAvailable: false,
};

describe('Trang chi tiết món (ProductDetailPage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(navigation.useParams).mockReturnValue({ id: '1' });
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
      expect(screen.getByText('Không thể tải thông tin món. Vui lòng thử lại!')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  // 3. Không tìm thấy món
  it('3. Hiển thị trạng thái không tìm thấy khi id không tồn tại', async () => {
    vi.mocked(api.getProductById).mockResolvedValue(null);
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Không tìm thấy món ăn hoặc đồ uống này')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Quay lại Menu' })).toBeInTheDocument();
  });

  // 4. Render đúng thông tin sản phẩm và giá tạm tính mặc định
  it('4. Render đúng tên, mô tả, danh mục và giá tạm tính mặc định', async () => {
    vi.mocked(api.getProductById).mockResolvedValue(mockItem);
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Cà phê sữa đá' })).toBeInTheDocument();
    });

    expect(screen.getByText('Hương vị cà phê thơm ngon đậm đà truyền thống.')).toBeInTheDocument();
    expect(screen.getByText('Ca phe')).toBeInTheDocument();

    // Mặc định chọn Size M (+5.000đ): 29.000 + 5.000 = 34.000đ
    expect(screen.getAllByText(/34\.000/).length).toBeGreaterThan(0);
  });

  // 5. Món hết hàng: hiển thị nhãn "Hết hàng" và vô hiệu hóa nút thêm
  it('5. Món hết hàng có nhãn "Hết hàng" và vô hiệu hóa nút thêm', async () => {
    vi.mocked(api.getProductById).mockResolvedValue(mockUnavailableItem);
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Trà đào cam sả')).toBeInTheDocument();
    });

    expect(screen.getByText('Hết hàng')).toBeInTheDocument();
    const addButton = screen.getByRole('button', { name: 'Món tạm hết hàng' });
    expect(addButton).toBeDisabled();
  });

  // 6. Đổi size thì giá tạm tính cập nhật chính xác
  it('6. Đổi size thì giá tạm tính cập nhật', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getProductById).mockResolvedValue(mockItem);
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Cà phê sữa đá' })).toBeInTheDocument();
    });

    // Mặc định size M (34.000đ). Giờ bấm chọn Size L (+10.000đ -> 39.000đ)
    const sizeLButton = screen.getByRole('button', { name: /Lớn \(L\)/ });
    await user.click(sizeLButton);

    expect(screen.getAllByText(/39\.000/).length).toBeGreaterThan(0);

    // Bấm chọn Size S (+0đ -> 29.000đ)
    const sizeSButton = screen.getByRole('button', { name: /Nhỏ \(S\)/ });
    await user.click(sizeSButton);

    expect(screen.getAllByText(/29\.000/).length).toBeGreaterThan(0);
  });

  // 7. Chọn topping thì cộng giá vào tổng tạm tính
  it('7. Chọn và bỏ chọn topping cập nhật đúng giá', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getProductById).mockResolvedValue(mockItem);
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Cà phê sữa đá' })).toBeInTheDocument();
    });

    // Mặc định size M (34.000đ). Chọn thêm Trân châu đen (+5.000đ -> 39.000đ)
    const tranChauDen = screen.getByText('Trân châu đen');
    await user.click(tranChauDen);

    expect(screen.getAllByText(/39\.000/).length).toBeGreaterThan(0);

    // Bấm lại để bỏ chọn Trân châu đen -> trở về 34.000đ
    await user.click(tranChauDen);
    expect(screen.getAllByText(/34\.000/).length).toBeGreaterThan(0);
  });

  // 8. Giới hạn độ dài ô ghi chú kèm bộ đếm ký tự
  it('8. Nhập ghi chú có cập nhật bộ đếm ký tự', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getProductById).mockResolvedValue(mockItem);
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Cà phê sữa đá' })).toBeInTheDocument();
    });

    const noteInput = screen.getByPlaceholderText('Ví dụ: ít ngọt, pha đậm vị trà...');
    await user.type(noteInput, 'Ít ngọt nhiều sữa');

    expect(screen.getByText('17/200')).toBeInTheDocument();
  });

  // 9. Món Bánh: không hiển thị các mục chọn Size, Đá, Đường, Topping
  it('9. Món Bánh: không hiển thị các mục chọn Size, Đá, Đường, Topping', async () => {
    const mockCake: ProductDetail = {
      id: '5',
      name: 'Bánh croissant phô mai',
      category: 'Banh',
      price: 25000,
      image: 'https://example.com/cake.jpg',
      isAvailable: true,
      description: 'Bánh croissant giòn rụm.',
      allowIce: false,
      allowSugar: false,
      allowSize: false,
      allowTopping: false,
    };

    vi.mocked(api.getProductById).mockResolvedValue(mockCake);
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Bánh croissant phô mai' })).toBeInTheDocument();
    });

    // Không có mục chọn Size, Đá, Đường, Topping
    expect(screen.queryByText(/Chọn kích cỡ/)).not.toBeInTheDocument();
    expect(screen.queryByText('Lượng đá')).not.toBeInTheDocument();
    expect(screen.queryByText('Lượng đường')).not.toBeInTheDocument();
    expect(screen.queryByText(/Topping thêm/)).not.toBeInTheDocument();

    // Vẫn hiển thị đúng giá gốc và ô ghi chú
    expect(screen.getAllByText(/25\.000/).length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText('Ví dụ: ít ngọt, pha đậm vị trà...')).toBeInTheDocument();
  });
});
