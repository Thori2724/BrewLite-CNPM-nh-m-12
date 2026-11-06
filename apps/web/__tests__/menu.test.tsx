import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MenuPage from '../app/page';
import * as api from '../services/api';
import { Product } from '../services/api';

// Mock lớp gọi API
vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return {
    ...actual,
    getProducts: vi.fn(),
  };
});

const mockProducts: Product[] = [
  {
    id: '1',
    name: 'Cà phê sữa đá',
    category: 'Ca phe',
    price: 29000,
    image: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=500',
    isAvailable: true,
  },
  {
    id: '2',
    name: 'Trà đào cam sả',
    category: 'Tra',
    price: 35000,
    image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500',
    isAvailable: false,
  },
  {
    id: '3',
    name: 'Trà sữa trân châu đen',
    category: 'Tra sua',
    price: 39000,
    image: 'https://images.unsplash.com/photo-1558857563-b371033873b8?w=500',
    isAvailable: true,
  },
  {
    id: '4',
    name: 'Bánh croissant phô mai',
    category: 'Banh',
    price: 25000,
    image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500',
    isAvailable: true,
  },
];

describe('Trang Menu (MenuPage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: Render lưới món khi API trả dữ liệu
  it('1. Render lưới món khi API trả dữ liệu: thấy tên và giá của các món', async () => {
    vi.mocked(api.getProducts).mockResolvedValue(mockProducts);

    render(<MenuPage />);

    // Chờ dữ liệu load xong
    await waitFor(() => {
      expect(screen.getByText('Cà phê sữa đá')).toBeInTheDocument();
    });

    expect(screen.getByText('Trà đào cam sả')).toBeInTheDocument();
    expect(screen.getByText('Trà sữa trân châu đen')).toBeInTheDocument();
    expect(screen.getByText('Bánh croissant phô mai')).toBeInTheDocument();

    // Kiểm tra giá tiền hiển thị (được định dạng kiểu Việt Nam)
    expect(screen.getByText(/29\.000/)).toBeInTheDocument();
    expect(screen.getByText(/35\.000/)).toBeInTheDocument();
  });

  // Test 2: Hiện trạng thái loading khi đang tải
  it('2. Hiện trạng thái loading khi đang tải', () => {
    // Trả về Promise chưa resolve để giữ trạng thái loading
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

  // Test 4: Hiện trạng thái error khi API lỗi
  it('4. Hiện trạng thái error khi API lỗi', async () => {
    vi.mocked(api.getProducts).mockRejectedValue(new Error('Lỗi kết nối'));

    render(<MenuPage />);

    await waitFor(() => {
      expect(screen.getByText('Không thể tải danh sách món. Vui lòng thử lại sau!')).toBeInTheDocument();
    });
  });

  // Test 5: Món hết hàng (available: false) có nhãn "Hết hàng", món còn hàng thì không có nhãn
  it('5. Món hết hàng (available: false) có nhãn "Hết hàng", món còn hàng thì không có nhãn', async () => {
    vi.mocked(api.getProducts).mockResolvedValue(mockProducts);

    render(<MenuPage />);

    await waitFor(() => {
      expect(screen.getByText('Cà phê sữa đá')).toBeInTheDocument();
    });

    // Chỉ có 1 món hết hàng trong mockProducts ('Trà đào cam sả')
    const outOfStockBadges = screen.getAllByText('Hết hàng');
    expect(outOfStockBadges).toHaveLength(1);

    // Món 'Cà phê sữa đá' còn hàng nên có nút '+ Thêm'
    expect(screen.getAllByRole('button', { name: '+ Thêm' }).length).toBeGreaterThan(0);
    // Món 'Trà đào cam sả' hết hàng nên nút bị vô hiệu hóa và có chữ 'Tạm hết'
    expect(screen.getByRole('button', { name: 'Tạm hết' })).toBeDisabled();
  });

  // Test 6: Chọn danh mục thì danh sách lọc đúng (có cả "Tất cả")
  it('6. Chọn danh mục thì danh sách lọc đúng (có cả "Tất cả")', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getProducts).mockResolvedValue(mockProducts);

    render(<MenuPage />);

    await waitFor(() => {
      expect(screen.getByText('Cà phê sữa đá')).toBeInTheDocument();
    });

    // Bấm chọn danh mục "Trà sữa"
    const traSuaBtn = screen.getByRole('button', { name: 'Trà sữa' });
    await user.click(traSuaBtn);

    expect(screen.getByText('Trà sữa trân châu đen')).toBeInTheDocument();
    expect(screen.queryByText('Cà phê sữa đá')).not.toBeInTheDocument();
    expect(screen.queryByText('Bánh croissant phô mai')).not.toBeInTheDocument();

    // Bấm quay lại chọn "Tất cả"
    const tatCaBtn = screen.getByRole('button', { name: 'Tất cả' });
    await user.click(tatCaBtn);

    expect(screen.getByText('Cà phê sữa đá')).toBeInTheDocument();
    expect(screen.getByText('Trà sữa trân châu đen')).toBeInTheDocument();
    expect(screen.getByText('Bánh croissant phô mai')).toBeInTheDocument();
  });

  // Test 7: Gõ tìm tên thì danh sách lọc đúng; gõ chuỗi không có kết quả thì hiện empty
  it('7. Gõ tìm tên thì danh sách lọc đúng; gõ chuỗi không có kết quả thì hiện empty', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getProducts).mockResolvedValue(mockProducts);

    render(<MenuPage />);

    await waitFor(() => {
      expect(screen.getByText('Cà phê sữa đá')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Tìm kiếm món ăn, đồ uống...');

    // Gõ tìm "croissant"
    await user.type(searchInput, 'croissant');
    expect(screen.getByText('Bánh croissant phô mai')).toBeInTheDocument();
    expect(screen.queryByText('Cà phê sữa đá')).not.toBeInTheDocument();

    // Gõ tìm chuỗi không tồn tại
    await user.clear(searchInput);
    await user.type(searchInput, 'xyz123khongtontai');
    expect(screen.getByText('Không tìm thấy món phù hợp')).toBeInTheDocument();
  });
});

