import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CartPage from '../app/cart/page';
import CartIcon from '../app/components/CartIcon';
import { CartProvider } from '../context/CartContext';
import { CartItem, CART_STORAGE_KEY } from '../utils/cart';

const mockItem1: CartItem = {
  id: 'cart-1',
  productId: '1',
  name: 'Cà phê sữa đá',
  imageUrl: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=500',
  size: 'M',
  sugarLevel: 'P50',
  iceLevel: 'NORMAL',
  toppings: [{ id: 'top-1', name: 'Trân châu đen', price: 5000 }],
  note: 'pha đậm vị trà',
  unitPrice: 39000,
  quantity: 2,
};

const mockItemCake: CartItem = {
  id: 'cart-2',
  productId: '4',
  name: 'Bánh croissant phô mai',
  imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500',
  // Không có size, đường, đá, topping (món bánh)
  size: undefined,
  sugarLevel: undefined,
  iceLevel: undefined,
  toppings: [],
  note: '',
  unitPrice: 25000,
  quantity: 1,
};

describe('Component CartIcon', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('1. Hiển thị số 0 khi giỏ hàng rỗng và có aria-label tương ứng', async () => {
    render(
      <CartProvider>
        <CartIcon />
      </CartProvider>
    );

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /giỏ hàng, trống/i });
      expect(link).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  it('2. Hiển thị đúng tổng số lượng ly khi có món', async () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockItem1, mockItemCake])); // 2 + 1 = 3 ly

    render(
      <CartProvider>
        <CartIcon />
      </CartProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
      const link = screen.getByRole('link', { name: /giỏ hàng, 3 ly/i });
      expect(link).toBeInTheDocument();
    });
  });

  it('3. Hiển thị "9+" khi tổng số ly vượt quá 9', async () => {
    const bigItem: CartItem = { ...mockItem1, quantity: 10 };
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([bigItem]));

    render(
      <CartProvider>
        <CartIcon />
      </CartProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('9+')).toBeInTheDocument();
    });
  });
});

describe('Trang Giỏ hàng (CartPage)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('1. Hiển thị trạng thái rỗng và nút quay lại menu khi giỏ trống', async () => {
    render(
      <CartProvider>
        <CartPage />
      </CartProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Giỏ hàng của bạn đang trống' })).toBeInTheDocument();
    });

    const backLink = screen.getByRole('link', { name: /quay lại menu/i });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute('href', '/');
  });

  it('2. Hiển thị đúng danh sách dòng, tùy chọn, đơn giá, thành tiền và tổng tiền', async () => {
    // mockItem1: 39.000 * 2 = 78.000; mockItemCake: 25.000 * 1 = 25.000 -> Tổng: 103.000
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockItem1, mockItemCake]));

    render(
      <CartProvider>
        <CartPage />
      </CartProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Giỏ hàng \(3 ly\)/i })).toBeInTheDocument();
    });

    // Món 1: Đồ uống
    expect(screen.getByRole('heading', { level: 2, name: 'Cà phê sữa đá' })).toBeInTheDocument();
    expect(screen.getByText('Size M (+6.000đ)')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Đá vừa')).toBeInTheDocument();
    expect(screen.getByText(/Trân châu đen/)).toBeInTheDocument();
    expect(screen.getByText(/pha đậm vị trà/)).toBeInTheDocument();
    expect(screen.getByText(/78\.000/)).toBeInTheDocument();

    // Món 2: Bánh croissant (không có đường/đá -> không xuất hiện chữ undefined)
    expect(screen.getByRole('heading', { level: 2, name: 'Bánh croissant phô mai' })).toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();

    // Tổng tạm tính = 103.000 đ
    expect(screen.getAllByText(/103\.000/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Giá trên là tạm tính; tiền thật do server tính toán/i)).toBeInTheDocument();
  });

  it('3. Tăng/giảm số lượng cập nhật thành tiền dòng và tổng tiền', async () => {
    const user = userEvent.setup();
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockItem1])); // Số lượng 2, đơn giá 39.000

    render(
      <CartProvider>
        <CartPage />
      </CartProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    // Tăng số lượng từ 2 lên 3
    const increaseBtn = screen.getByRole('button', { name: 'Tăng số lượng' });
    await user.click(increaseBtn);

    // Số lượng mới: 3 -> Thành tiền = 117.000 đ
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getAllByText(/117\.000/).length).toBeGreaterThan(0);

    // Giảm số lượng từ 3 về 2
    const decreaseBtn = screen.getByRole('button', { name: 'Giảm số lượng' });
    await user.click(decreaseBtn);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getAllByText(/78\.000/).length).toBeGreaterThan(0);
  });

  it('4. Nút giảm bị vô hiệu hóa khi số lượng = 1 (không tự xóa)', async () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockItemCake])); // quantity = 1

    render(
      <CartProvider>
        <CartPage />
      </CartProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    const decreaseBtn = screen.getByRole('button', { name: 'Giảm số lượng' });
    expect(decreaseBtn).toBeDisabled();
  });

  it('5. Xóa từng dòng bằng nút ✕', async () => {
    const user = userEvent.setup();
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockItem1, mockItemCake]));

    render(
      <CartProvider>
        <CartPage />
      </CartProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Cà phê sữa đá')).toBeInTheDocument();
    });

    // Bấm nút xóa Cà phê sữa đá
    const deleteBtn = screen.getByRole('button', { name: 'Xóa Cà phê sữa đá' });
    await user.click(deleteBtn);

    // Cà phê sữa đá biến mất, chỉ còn Bánh croissant
    expect(screen.queryByText('Cà phê sữa đá')).not.toBeInTheDocument();
    expect(screen.getByText('Bánh croissant phô mai')).toBeInTheDocument();
  });

  it('6. Nút "Xóa tất cả" có bước xác nhận', async () => {
    const user = userEvent.setup();
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockItem1]));

    render(
      <CartProvider>
        <CartPage />
      </CartProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Cà phê sữa đá')).toBeInTheDocument();
    });

    // Trường hợp 1: Người dùng HỦY xác nhận
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const clearBtn = screen.getByRole('button', { name: 'Xóa tất cả' });
    await user.click(clearBtn);
    expect(screen.getByText('Cà phê sữa đá')).toBeInTheDocument(); // Vẫn còn

    // Trường hợp 2: Người dùng ĐỒNG Ý xác nhận
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(clearBtn);
    // Giỏ hàng chuyển sang trạng thái rỗng
    expect(screen.getByText('Giỏ hàng của bạn đang trống')).toBeInTheDocument();
  });

  it('7. Nút "Tiến hành đặt đơn" liên kết điều hướng sang trang /checkout', async () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockItemCake]));

    render(
      <CartProvider>
        <CartPage />
      </CartProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Bánh croissant phô mai')).toBeInTheDocument();
    });

    const checkoutLink = screen.getByRole('link', { name: /tiến hành đặt đơn/i });
    expect(checkoutLink).toBeInTheDocument();
    expect(checkoutLink).toHaveAttribute('href', '/checkout');
    expect(
      screen.queryByText(/chức năng đặt đơn và thanh toán sẽ có ở task 17/i)
    ).not.toBeInTheDocument();
  });
});
