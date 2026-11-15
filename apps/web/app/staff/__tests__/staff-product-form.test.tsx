import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as navigation from 'next/navigation';
import { AuthProvider } from '../../../context/AuthContext';
import { CATEGORY_LABELS, ProductManage } from '../../../services/api';
import { resetRedirectFlag } from '../../../services/auth';
import {
  AUTH_ACCOUNT_LOCKED_EVENT,
  AUTH_STORAGE_KEY,
  saveAuthSession,
} from '../../../utils/auth';
import {
  MOCK_STAFF_PRODUCTS_SEED,
  resetMockStaffProducts,
} from '../mocks/staff-products-mock';
import StaffProductsPage from '../products/page';
import {
  STAFF_PRODUCT_FALLBACK_IMAGE,
  validateProductBasePrice,
  validateProductCategory,
  validateProductForm,
  validateProductImageUrl,
  validateProductName,
} from '../services/staff-products';

const { mockPush, mockReplace } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  })),
  usePathname: vi.fn(() => '/staff/products'),
}));

function mockJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Mock Status',
    json: async () => body,
  } as unknown as Response;
}

function cloneSeedProducts(): ProductManage[] {
  return MOCK_STAFF_PRODUCTS_SEED.map((item) => ({ ...item }));
}

function setAuthSession(role: 'STAFF' | 'ADMIN') {
  saveAuthSession({
    token: `jwt-${role.toLowerCase()}-form-test`,
    user: {
      id:
        role === 'ADMIN'
          ? '66666666-0000-0000-0000-000000000001'
          : '55555555-0000-0000-0000-000000000001',
      email: role === 'ADMIN' ? 'quanly@example.com' : 'nhanvien1@example.com',
      displayName: role === 'ADMIN' ? 'Quản lý' : 'Nhân viên 1',
      role,
    },
  });
}

function renderStaffProductsPage() {
  return render(
    <AuthProvider>
      <StaffProductsPage />
    </AuthProvider>
  );
}

describe('Dòng 22 - Form thêm/sửa món (ADMIN) trên /staff/products', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetRedirectFlag();
    resetMockStaffProducts();

    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_USE_MOCK = 'false';
    delete process.env.NEXT_PUBLIC_USE_MOCK_PRODUCTS;
    delete process.env.NEXT_PUBLIC_USE_MOCK_STAFF_PRODUCTS;
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';

    vi.mocked(navigation.useRouter).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    } as unknown as ReturnType<typeof navigation.useRouter>);

    setAuthSession('ADMIN');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });

  describe('1. Kiểm tra dữ liệu đầu vào (Validation helpers)', () => {
    it('validateProductName: bắt buộc 1 đến 100 ký tự sau khi cắt khoảng trắng', () => {
      expect(validateProductName('').isValid).toBe(false);
      expect(validateProductName('    ').isValid).toBe(false);
      expect(validateProductName('A').isValid).toBe(true);
      expect(validateProductName(`  ${'A'.repeat(100)}  `).isValid).toBe(true);

      const tooLong = validateProductName('A'.repeat(101));
      expect(tooLong.isValid).toBe(false);
      expect(tooLong.error).toContain('100 ký tự');
    });

    it('validateProductCategory: chỉ chấp nhận 4 danh mục TEA, COFFEE, MILK_TEA, CAKE', () => {
      expect(validateProductCategory('').isValid).toBe(false);
      expect(validateProductCategory('JUICE').isValid).toBe(false);
      expect(validateProductCategory('TEA').isValid).toBe(true);
      expect(validateProductCategory('COFFEE').isValid).toBe(true);
      expect(validateProductCategory('MILK_TEA').isValid).toBe(true);
      expect(validateProductCategory('CAKE').isValid).toBe(true);
    });

    it('validateProductBasePrice: bắt buộc số nguyên từ 1.000 đến 1.000.000', () => {
      expect(validateProductBasePrice('').isValid).toBe(false);
      expect(validateProductBasePrice('abc').isValid).toBe(false);
      expect(validateProductBasePrice('29000.5').isValid).toBe(false);
      expect(validateProductBasePrice('29.000').isValid).toBe(false);
      expect(validateProductBasePrice('999').isValid).toBe(false);
      expect(validateProductBasePrice('1000001').isValid).toBe(false);
      expect(validateProductBasePrice(999).isValid).toBe(false);
      expect(validateProductBasePrice(1000001).isValid).toBe(false);
      expect(validateProductBasePrice(29000.5).isValid).toBe(false);

      expect(validateProductBasePrice('1000').isValid).toBe(true);
      expect(validateProductBasePrice('29000').isValid).toBe(true);
      expect(validateProductBasePrice('1000000').isValid).toBe(true);
      expect(validateProductBasePrice(1000).isValid).toBe(true);
      expect(validateProductBasePrice(1000000).isValid).toBe(true);
    });

    it('validateProductImageUrl: cho phép rỗng; nếu có phải bắt đầu bằng http:// hoặc https:// và tối đa 500 ký tự', () => {
      expect(validateProductImageUrl('').isValid).toBe(true);
      expect(validateProductImageUrl('   ').isValid).toBe(true);

      const badProtocol = validateProductImageUrl('ftp://example.com/a.jpg');
      expect(badProtocol.isValid).toBe(false);
      expect(badProtocol.error).toContain('http:// hoặc https://');

      expect(validateProductImageUrl('/images/local.png').isValid).toBe(false);
      expect(validateProductImageUrl('http://example.com/a.jpg').isValid).toBe(true);

      const exact500 = `https://${'a'.repeat(492)}`;
      expect(exact500).toHaveLength(500);
      expect(validateProductImageUrl(exact500).isValid).toBe(true);

      const over500 = `https://${'a'.repeat(493)}`;
      expect(over500).toHaveLength(501);
      const tooLong = validateProductImageUrl(over500);
      expect(tooLong.isValid).toBe(false);
      expect(tooLong.error).toContain('500 ký tự');
    });

    it('validateProductForm: tổng hợp lỗi tiếng Việt theo từng trường', () => {
      const result = validateProductForm({
        name: '   ',
        category: '',
        basePrice: '500',
        imageUrl: 'invalid-url',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.name).toBeTruthy();
      expect(result.errors.category).toBeTruthy();
      expect(result.errors.basePrice).toBeTruthy();
      expect(result.errors.imageUrl).toBeTruthy();
    });
  });

  describe('2. Giao diện Form thêm/sửa món & tích hợp API trên /staff/products', () => {
    it('Chỉ ADMIN thấy nút Thêm món và Sửa; STAFF không thấy các nút này', async () => {
      setAuthSession('STAFF');
      globalThis.fetch = vi.fn().mockResolvedValueOnce(mockJsonResponse(200, cloneSeedProducts()));

      renderStaffProductsPage();

      await screen.findByTestId('staff-product-row-11111111-0000-0000-0000-000000000001');
      expect(screen.queryByRole('button', { name: 'Thêm món' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument();
    });

    it('Form Thêm món không có ô ID, dùng đủ 4 nhãn danh mục hợp đồng, xem trước ảnh mặc định/nhập link và báo lỗi tiếng Việt dưới từng ô', async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi.fn().mockResolvedValueOnce(mockJsonResponse(200, cloneSeedProducts()));

      renderStaffProductsPage();

      await screen.findByTestId('staff-product-row-11111111-0000-0000-0000-000000000001');
      await user.click(screen.getByRole('button', { name: 'Thêm món' }));
      const dialog = await screen.findByTestId('product-form-dialog');

      // Không có ô ID
      expect(within(dialog).queryByLabelText(/^id$/i)).not.toBeInTheDocument();
      expect(within(dialog).queryByPlaceholderText(/uuid|mã món/i)).not.toBeInTheDocument();

      // Danh mục đủ 4 lựa chọn theo bảng nhãn mục 9.3 hợp đồng
      const categorySelect = within(dialog).getByLabelText(/Danh mục/i);
      const optionTexts = within(categorySelect)
        .getAllByRole('option')
        .map((opt) => opt.textContent);
      expect(optionTexts).toContain(CATEGORY_LABELS.TEA);
      expect(optionTexts).toContain(CATEGORY_LABELS.COFFEE);
      expect(optionTexts).toContain(CATEGORY_LABELS.MILK_TEA);
      expect(optionTexts).toContain(CATEGORY_LABELS.CAKE);

      // Link ảnh để trống -> hiện ảnh mặc định kèm dòng chú thích "Để trống sẽ dùng ảnh mặc định"
      const previewImg = within(dialog).getByTestId('product-form-image-preview');
      expect(previewImg).toHaveAttribute('src', STAFF_PRODUCT_FALLBACK_IMAGE);
      expect(within(dialog).getByText('Để trống sẽ dùng ảnh mặc định')).toBeInTheDocument();

      // Nhập link ảnh hợp lệ -> cập nhật ô xem trước
      const imageInput = within(dialog).getByLabelText(/Link ảnh/i);
      await user.type(imageInput, 'https://example.com/tra-dao.jpg');
      expect(previewImg).toHaveAttribute('src', 'https://example.com/tra-dao.jpg');

      // Nhập sai dữ liệu và bấm gửi -> báo lỗi dưới từng ô, không gọi API POST
      await user.clear(imageInput);
      await user.type(imageInput, 'not-a-link');
      await user.type(within(dialog).getByLabelText(/Giá gốc/i), '500');
      await user.click(within(dialog).getByRole('button', { name: 'Thêm món' }));

      expect(within(dialog).getByTestId('product-form-error-name')).toBeInTheDocument();
      expect(within(dialog).getByTestId('product-form-error-category')).toBeInTheDocument();
      expect(within(dialog).getByTestId('product-form-error-basePrice')).toBeInTheDocument();
      expect(within(dialog).getByTestId('product-form-error-imageUrl')).toBeInTheDocument();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('Thêm món: khóa nút khi đang lưu, gọi POST /products (không gửi stock hay id), lưu xong đóng form và tải lại danh sách', async () => {
      const user = userEvent.setup();
      const initialList = cloneSeedProducts();
      const createdProduct: ProductManage = {
        id: '99999999-0000-0000-0000-000000000001',
        name: 'Trà vải hoa hồng',
        category: 'TEA',
        basePrice: 42000,
        imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500',
        stock: 999,
        isVisible: true,
      };
      const reloadedList = [...initialList, createdProduct];

      let resolveCreate!: (res: Response) => void;
      const pendingCreate = new Promise<Response>((resolve) => {
        resolveCreate = resolve;
      });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockJsonResponse(200, initialList))
        .mockReturnValueOnce(pendingCreate)
        .mockResolvedValueOnce(mockJsonResponse(200, reloadedList));
      globalThis.fetch = fetchMock;

      renderStaffProductsPage();

      await screen.findByTestId('staff-product-row-11111111-0000-0000-0000-000000000001');
      await user.click(screen.getByRole('button', { name: 'Thêm món' }));
      const dialog = await screen.findByTestId('product-form-dialog');

      await user.type(within(dialog).getByLabelText(/Tên món/i), '  Trà vải hoa hồng  ');
      await user.selectOptions(within(dialog).getByLabelText(/Danh mục/i), 'TEA');
      await user.type(within(dialog).getByLabelText(/Giá gốc/i), '42000');
      await user.click(within(dialog).getByRole('button', { name: 'Thêm món' }));

      // Trạng thái đang lưu -> khóa nút
      const savingBtn = within(dialog).getByRole('button', { name: 'Đang lưu...' });
      expect(savingBtn).toBeDisabled();
      expect(within(dialog).getByRole('button', { name: 'Hủy' })).toBeDisabled();
      expect(within(dialog).getByRole('button', { name: 'Đóng biểu mẫu' })).toBeDisabled();

      resolveCreate(mockJsonResponse(201, createdProduct));

      // Lưu xong -> đóng form, tải lại danh sách món và hiển thị món mới
      await waitFor(() => {
        expect(screen.queryByTestId('product-form-dialog')).not.toBeInTheDocument();
      });
      expect(
        await screen.findByTestId(`staff-product-row-${createdProduct.id}`)
      ).toBeInTheDocument();
      expect(screen.getByTestId('staff-products-action-success')).toHaveTextContent(
        'Đã thêm món "Trà vải hoa hồng" thành công.'
      );

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(String(fetchMock.mock.calls[1][0])).toBe('http://localhost:3001/products');
      expect(fetchMock.mock.calls[1][1]?.method).toBe('POST');
      const sentBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
      expect(sentBody).toEqual({
        name: 'Trà vải hoa hồng',
        category: 'TEA',
        basePrice: 42000,
      });
      expect(sentBody.stock).toBeUndefined();
      expect(sentBody.id).toBeUndefined();
      expect(String(fetchMock.mock.calls[2][0])).toBe('http://localhost:3001/products/manage');
    });

    it('Sửa món: điền sẵn dữ liệu cũ (không có ô ID), gọi PATCH /products/:id không gửi stock/id, đóng form và tải lại danh sách', async () => {
      const user = userEvent.setup();
      const target = cloneSeedProducts().find(
        (item) => item.id === '11111111-0000-0000-0000-000000000001'
      )!;
      const updatedProduct: ProductManage = {
        ...target,
        name: 'Cà phê sữa đá đặc biệt',
        basePrice: 35000,
        imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500',
      };

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockJsonResponse(200, [target]))
        .mockResolvedValueOnce(mockJsonResponse(200, updatedProduct))
        .mockResolvedValueOnce(mockJsonResponse(200, [updatedProduct]));
      globalThis.fetch = fetchMock;

      renderStaffProductsPage();

      const row = await screen.findByTestId(`staff-product-row-${target.id}`);
      await user.click(within(row).getByRole('button', { name: 'Sửa' }));

      const dialog = await screen.findByTestId('product-form-dialog');
      const nameInput = within(dialog).getByLabelText(/Tên món/i) as HTMLInputElement;
      const categorySelect = within(dialog).getByLabelText(/Danh mục/i) as HTMLSelectElement;
      const priceInput = within(dialog).getByLabelText(/Giá gốc/i) as HTMLInputElement;
      const imageInput = within(dialog).getByLabelText(/Link ảnh/i) as HTMLInputElement;

      expect(nameInput.value).toBe(target.name);
      expect(categorySelect.value).toBe(target.category);
      expect(priceInput.value).toBe(String(target.basePrice));
      expect(imageInput.value).toBe(target.imageUrl);
      expect(within(dialog).queryByDisplayValue(target.id)).not.toBeInTheDocument();

      await user.clear(nameInput);
      await user.type(nameInput, 'Cà phê sữa đá đặc biệt');
      await user.clear(priceInput);
      await user.type(priceInput, '35000');
      await user.clear(imageInput);
      await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));

      await waitFor(() => {
        expect(screen.queryByTestId('product-form-dialog')).not.toBeInTheDocument();
      });

      expect(within(row).getByText('Cà phê sữa đá đặc biệt')).toBeInTheDocument();
      expect(within(row).getByText('35.000đ')).toBeInTheDocument();

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(String(fetchMock.mock.calls[1][0])).toBe(
        `http://localhost:3001/products/${target.id}`
      );
      expect(fetchMock.mock.calls[1][1]?.method).toBe('PATCH');
      const sentBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
      expect(sentBody).toEqual({
        name: 'Cà phê sữa đá đặc biệt',
        category: 'COFFEE',
        basePrice: 35000,
        imageUrl: '',
      });
      expect(sentBody.stock).toBeUndefined();
      expect(sentBody.id).toBeUndefined();
      expect(String(fetchMock.mock.calls[2][0])).toBe('http://localhost:3001/products/manage');
    });

    it('Xử lý lỗi máy chủ 400, 403 sai vai trò, 404, 401 và 403 tài khoản bị khóa', async () => {
      const user = userEvent.setup();
      const target = cloneSeedProducts()[0];

      const originalLocation = window.location;
      delete (window as unknown as Record<string, unknown>).location;
      (window as unknown as Record<string, unknown>).location = {
        pathname: '/staff/products',
        search: '',
        href: '/staff/products',
      };

      const lockedMessages: string[] = [];
      const handleLockedEvent = (e: Event) => {
        const custom = e as CustomEvent<{ message?: string }>;
        lockedMessages.push(custom.detail?.message || '');
      };
      window.addEventListener(AUTH_ACCOUNT_LOCKED_EVENT, handleLockedEvent);

      // 400 (mảng chuỗi tiếng Anh) -> 403 sai vai trò -> 404
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockJsonResponse(200, [target]))
        .mockResolvedValueOnce(
          mockJsonResponse(400, {
            statusCode: 400,
            message: [
              'name must be shorter than or equal to 100 characters',
              'basePrice must not be less than 1000',
            ],
            error: 'Bad Request',
          })
        )
        .mockResolvedValueOnce(
          mockJsonResponse(403, {
            statusCode: 403,
            message: 'Bạn không có quyền thực hiện thao tác này',
            error: 'Forbidden',
          })
        )
        .mockResolvedValueOnce(
          mockJsonResponse(404, {
            statusCode: 404,
            message: 'Không tìm thấy sản phẩm',
            error: 'Not Found',
          })
        );
      globalThis.fetch = fetchMock;

      const { unmount } = renderStaffProductsPage();

      const row = await screen.findByTestId(`staff-product-row-${target.id}`);
      await user.click(within(row).getByRole('button', { name: 'Sửa' }));
      const dialog = await screen.findByTestId('product-form-dialog');

      // 400
      await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
      expect(await within(dialog).findByTestId('product-form-server-error')).toHaveTextContent(
        'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.'
      );
      expect(within(dialog).getByTestId('product-form-error-name')).toBeInTheDocument();
      expect(within(dialog).getByTestId('product-form-error-basePrice')).toBeInTheDocument();

      // 403 sai vai trò (giữ phiên đăng nhập)
      await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
      expect(await within(dialog).findByTestId('product-form-server-error')).toHaveTextContent(
        'Bạn không có quyền thực hiện thao tác này'
      );
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).not.toBeNull();

      // 404
      await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
      expect(await within(dialog).findByTestId('product-form-server-error')).toHaveTextContent(
        'Không tìm thấy sản phẩm'
      );
      unmount();

      // 403 tài khoản bị khóa
      setAuthSession('ADMIN');
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(mockJsonResponse(200, [target]))
        .mockResolvedValueOnce(
          mockJsonResponse(403, {
            statusCode: 403,
            message: 'Tài khoản đã bị khóa',
            error: 'Forbidden',
          })
        );

      const { unmount: unmountLocked } = renderStaffProductsPage();
      const rowLocked = await screen.findByTestId(`staff-product-row-${target.id}`);
      await user.click(within(rowLocked).getByRole('button', { name: 'Sửa' }));
      const dialogLocked = await screen.findByTestId('product-form-dialog');
      await user.click(within(dialogLocked).getByRole('button', { name: 'Lưu thay đổi' }));

      await waitFor(() => {
        expect(lockedMessages).toEqual(['Tài khoản đã bị khóa']);
        expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      });
      unmountLocked();

      // 401 hết phiên -> chuyển về /login
      setAuthSession('ADMIN');
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(mockJsonResponse(200, [target]))
        .mockResolvedValueOnce(
          mockJsonResponse(401, {
            statusCode: 401,
            message: 'Unauthorized',
          })
        );

      renderStaffProductsPage();
      const row401 = await screen.findByTestId(`staff-product-row-${target.id}`);
      await user.click(within(row401).getByRole('button', { name: 'Sửa' }));
      const dialog401 = await screen.findByTestId('product-form-dialog');
      await user.click(within(dialog401).getByRole('button', { name: 'Lưu thay đổi' }));

      await waitFor(() => {
        expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
        expect(window.location.href).toBe('/login?redirect=%2Fstaff%2Fproducts&expired=true');
      });

      window.removeEventListener(AUTH_ACCOUNT_LOCKED_EVENT, handleLockedEvent);
      (window as unknown as Record<string, unknown>).location = originalLocation;
    });

    it('Chế độ dữ liệu giả NEXT_PUBLIC_USE_MOCK_STAFF_PRODUCTS=true hỗ trợ Thêm và Sửa món không gọi fetch', async () => {
      const user = userEvent.setup();
      process.env.NEXT_PUBLIC_USE_MOCK_STAFF_PRODUCTS = 'true';
      globalThis.fetch = vi.fn();

      renderStaffProductsPage();

      // Đợi danh sách mock tải xong rồi mới bấm Thêm món
      await screen.findByTestId(
        'staff-product-row-11111111-0000-0000-0000-000000000001'
      );

      // Thêm món qua mock
      await user.click(screen.getByRole('button', { name: 'Thêm món' }));
      const createDialog = await screen.findByTestId('product-form-dialog');
      await user.type(within(createDialog).getByLabelText(/Tên món/i), 'Trà sen vàng mock');
      await user.selectOptions(within(createDialog).getByLabelText(/Danh mục/i), 'TEA');
      await user.type(within(createDialog).getByLabelText(/Giá gốc/i), '45000');
      await user.click(within(createDialog).getByRole('button', { name: 'Thêm món' }));

      await waitFor(() => {
        expect(screen.queryByTestId('product-form-dialog')).not.toBeInTheDocument();
      });
      expect(await screen.findByText('Trà sen vàng mock')).toBeInTheDocument();

      // Sửa món vừa có trong bảng qua mock
      const rowToEdit = await screen.findByTestId(
        'staff-product-row-11111111-0000-0000-0000-000000000001'
      );
      await user.click(within(rowToEdit).getByRole('button', { name: 'Sửa' }));
      const editDialog = await screen.findByTestId('product-form-dialog');
      const priceInput = within(editDialog).getByLabelText(/Giá gốc/i);
      await user.clear(priceInput);
      await user.type(priceInput, '31000');
      await user.click(within(editDialog).getByRole('button', { name: 'Lưu thay đổi' }));

      await waitFor(() => {
        expect(screen.queryByTestId('product-form-dialog')).not.toBeInTheDocument();
      });
      const updatedRow = await screen.findByTestId(
        'staff-product-row-11111111-0000-0000-0000-000000000001'
      );
      expect(await within(updatedRow).findByText('31.000đ')).toBeInTheDocument();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });
});

