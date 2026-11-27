import { render, screen, waitFor, within } from '@testing-library/react';
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
      const link = screen.getByRole('link', { name: /giỏ hàng, 3 món/i });
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
      expect(screen.getByRole('heading', { level: 1, name: /Giỏ hàng \(3 món\)/i })).toBeInTheDocument();
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

    // Tính tổng = 103.000 đ
    expect(screen.getAllByText(/103\.000/).length).toBeGreaterThan(0);
    expect(screen.getByText('Tính tổng:')).toBeInTheDocument();
    expect(screen.queryByText(/Giá trên là tạm tính; tiền thật do server tính toán/i)).not.toBeInTheDocument();
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
    const user = userEvent.setup();
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

    await user.click(decreaseBtn);
    expect(screen.getByText('Bánh croissant phô mai')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getAllByText(/25\.000/).length).toBeGreaterThan(0);
  });

  it('5. Xóa từng dòng bằng nút thùng rác: xóa ngay cả dòng không cần xác nhận, cập nhật tổng tiền và trạng thái trống', async () => {
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

    // Không có ô tích chọn món
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByText('✕')).not.toBeInTheDocument();

    // Bấm nút thùng rác xóa Cà phê sữa đá (số lượng 2) -> xóa ngay cả dòng, không mở hộp xác nhận
    const deleteBtn = screen.getByRole('button', { name: 'Xóa Cà phê sữa đá khỏi giỏ' });
    expect(deleteBtn.querySelector('svg')).toBeInTheDocument();
    await user.click(deleteBtn);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Cà phê sữa đá')).not.toBeInTheDocument();
    expect(screen.getByText('Bánh croissant phô mai')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /Giỏ hàng \(1 món\)/i })).toBeInTheDocument();
    expect(screen.getAllByText(/25\.000/).length).toBeGreaterThan(0);

    const savedAfterFirstDelete = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
    expect(savedAfterFirstDelete).toHaveLength(1);
    expect(savedAfterFirstDelete[0].id).toBe(mockItemCake.id);

    // Xóa nốt món cuối cùng -> hiện trạng thái giỏ trống và lưu localStorage rỗng
    const deleteCakeBtn = screen.getByRole('button', { name: 'Xóa Bánh croissant phô mai khỏi giỏ' });
    await user.click(deleteCakeBtn);

    expect(screen.getByRole('heading', { level: 1, name: 'Giỏ hàng của bạn đang trống' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]')).toEqual([]);
  });

  it('6. Nút "Xóa tất cả" mở ConfirmDialog (không dùng window.confirm); Quay lại/Esc giữ nguyên giỏ, xác nhận mới xóa', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([mockItem1]));

    render(
      <CartProvider>
        <CartPage />
      </CartProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Cà phê sữa đá')).toBeInTheDocument();
    });

    // Bấm nút "Xóa tất cả" -> mở ConfirmDialog, CHƯA xóa giỏ
    const clearBtn = screen.getByRole('button', { name: 'Xóa tất cả' });
    await user.click(clearBtn);

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Xóa tất cả món trong giỏ?' })
    ).toBeInTheDocument();
    expect(screen.getByText('Cà phê sữa đá')).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();

    // Trường hợp 1: Bấm "Quay lại" -> đóng hộp, giỏ vẫn còn
    await user.click(within(dialog).getByRole('button', { name: 'Quay lại' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Cà phê sữa đá')).toBeInTheDocument();

    // Trường hợp 2: Mở lại và bấm Esc -> đóng hộp, giỏ vẫn còn
    await user.click(screen.getByRole('button', { name: 'Xóa tất cả' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Cà phê sữa đá')).toBeInTheDocument();

    // Trường hợp 3: Mở lại và bấm "Xóa tất cả" trong hộp xác nhận -> xóa toàn bộ giỏ
    await user.click(screen.getByRole('button', { name: 'Xóa tất cả' }));
    const confirmDialog = screen.getByRole('dialog');
    await user.click(within(confirmDialog).getByRole('button', { name: 'Xóa tất cả' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Giỏ hàng của bạn đang trống')).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
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
