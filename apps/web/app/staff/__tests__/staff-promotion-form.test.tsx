import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as navigation from 'next/navigation';
import { AuthProvider } from '../../../context/AuthContext';
import { resetMockPromotionsDatabase } from '../../../mocks/mock-promotions';
import { resetRedirectFlag } from '../../../services/auth';
import { Promotion, PROMOTION_TYPE_LABELS } from '../../../services/promotions';
import { saveAuthSession } from '../../../utils/auth';
import StaffPromotionsPage from '../promotions/page';
import {
  buildCreatePromotionPayload,
  buildUpdatePromotionPayload,
  validatePromotionCode,
  validatePromotionForm,
  validatePromotionMaxDiscount,
  validatePromotionValue,
} from '../services/staff-promotions';

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
  usePathname: vi.fn(() => '/staff/promotions'),
}));

function mockJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Mock Status',
    json: async () => body,
  } as unknown as Response;
}

const SAMPLE_PROMOTIONS: Promotion[] = [
  {
    id: '77777777-0000-0000-0000-000000000004',
    code: 'BREW5',
    type: 'PERCENT',
    value: 5,
    maxDiscount: null,
    isActive: true,
    createdAt: '2026-11-01T08:15:00.000Z',
  },
  {
    id: '77777777-0000-0000-0000-000000000003',
    code: 'TAMNGUNG',
    type: 'PERCENT',
    value: 15,
    maxDiscount: 20000,
    isActive: false,
    createdAt: '2026-11-01T08:10:00.000Z',
  },
  {
    id: '77777777-0000-0000-0000-000000000002',
    code: 'GIAM20K',
    type: 'FIXED',
    value: 20000,
    maxDiscount: null,
    isActive: true,
    createdAt: '2026-11-01T08:05:00.000Z',
  },
  {
    id: '77777777-0000-0000-0000-000000000001',
    code: 'BREW10',
    type: 'PERCENT',
    value: 10,
    maxDiscount: 15000,
    isActive: true,
    createdAt: '2026-11-01T08:00:00.000Z',
  },
];

function cloneSamplePromotions(): Promotion[] {
  return SAMPLE_PROMOTIONS.map((item) => ({ ...item }));
}

function setAdminSession() {
  saveAuthSession({
    token: 'jwt-admin-promotion-form-test',
    user: {
      id: '66666666-0000-0000-0000-000000000001',
      email: 'quanly@example.com',
      displayName: 'Quản lý',
      role: 'ADMIN',
    },
  });
}

function renderStaffPromotionsPage() {
  return render(
    <AuthProvider>
      <StaffPromotionsPage />
    </AuthProvider>
  );
}

describe('Dòng 29 - Form thêm/sửa mã giảm giá cho ADMIN tại /staff/promotions', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetRedirectFlag();
    resetMockPromotionsDatabase();

    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_USE_MOCK = 'false';
    delete process.env.NEXT_PUBLIC_USE_MOCK_PROMOTIONS;
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';

    vi.mocked(navigation.useRouter).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    } as unknown as ReturnType<typeof navigation.useRouter>);

    setAdminSession();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });

  describe('1. Kiểm tra dữ liệu và tạo payload (Validation & Payload helpers)', () => {
    it('validatePromotionCode: kiểm tra 3 đến 20 ký tự, chỉ gồm A-Z, số, _ và -', () => {
      expect(validatePromotionCode('').isValid).toBe(false);
      expect(validatePromotionCode('   ').isValid).toBe(false);
      expect(validatePromotionCode('AB').isValid).toBe(false);
      expect(validatePromotionCode('A'.repeat(21)).isValid).toBe(false);
      expect(validatePromotionCode('BREW 10').isValid).toBe(false);
      expect(validatePromotionCode('BREW@10').isValid).toBe(false);
      expect(validatePromotionCode('MÃ10').isValid).toBe(false);

      expect(validatePromotionCode('abc').isValid).toBe(true);
      expect(validatePromotionCode('  brew_20-a  ').isValid).toBe(true);
      expect(validatePromotionCode('A'.repeat(20)).isValid).toBe(true);
    });

    it('validatePromotionValue: PERCENT từ 1..100, FIXED từ 1.000..1.000.000', () => {
      // PERCENT
      expect(validatePromotionValue('', 'PERCENT').isValid).toBe(false);
      expect(validatePromotionValue('0', 'PERCENT').isValid).toBe(false);
      expect(validatePromotionValue('101', 'PERCENT').isValid).toBe(false);
      expect(validatePromotionValue('10.5', 'PERCENT').isValid).toBe(false);
      expect(validatePromotionValue('abc', 'PERCENT').isValid).toBe(false);
      expect(validatePromotionValue('1', 'PERCENT').isValid).toBe(true);
      expect(validatePromotionValue('100', 'PERCENT').isValid).toBe(true);

      // FIXED
      expect(validatePromotionValue('', 'FIXED').isValid).toBe(false);
      expect(validatePromotionValue('999', 'FIXED').isValid).toBe(false);
      expect(validatePromotionValue('1000001', 'FIXED').isValid).toBe(false);
      expect(validatePromotionValue('20.000', 'FIXED').isValid).toBe(false);
      expect(validatePromotionValue('abc', 'FIXED').isValid).toBe(false);
      expect(validatePromotionValue('1000', 'FIXED').isValid).toBe(true);
      expect(validatePromotionValue('20000', 'FIXED').isValid).toBe(true);
      expect(validatePromotionValue('1000000', 'FIXED').isValid).toBe(true);
    });

    it('validatePromotionMaxDiscount: cho phép bỏ trống; nếu nhập khi PERCENT phải từ 1.000..1.000.000', () => {
      expect(validatePromotionMaxDiscount('', 'PERCENT').isValid).toBe(true);
      expect(validatePromotionMaxDiscount('   ', 'PERCENT').isValid).toBe(true);
      expect(validatePromotionMaxDiscount('999', 'PERCENT').isValid).toBe(false);
      expect(validatePromotionMaxDiscount('1000001', 'PERCENT').isValid).toBe(false);
      expect(validatePromotionMaxDiscount('15.5', 'PERCENT').isValid).toBe(false);
      expect(validatePromotionMaxDiscount('abc', 'PERCENT').isValid).toBe(false);
      expect(validatePromotionMaxDiscount('1000', 'PERCENT').isValid).toBe(true);
      expect(validatePromotionMaxDiscount('1000000', 'PERCENT').isValid).toBe(true);

      // FIXED bỏ qua kiểm tra trần giảm
      expect(validatePromotionMaxDiscount('500', 'FIXED').isValid).toBe(true);
    });

    it('validatePromotionForm & buildCreate/UpdatePromotionPayload: chuẩn hóa code, bỏ qua code khi sửa, chỉ gửi trường đổi', () => {
      const invalidCreate = validatePromotionForm(
        {
          code: 'ab',
          type: 'PERCENT',
          value: '150',
          maxDiscount: '500',
          isActive: true,
        },
        { mode: 'create' }
      );
      expect(invalidCreate.isValid).toBe(false);
      expect(invalidCreate.errors.code).toBeTruthy();
      expect(invalidCreate.errors.value).toBeTruthy();
      expect(invalidCreate.errors.maxDiscount).toBeTruthy();

      expect(
        buildCreatePromotionPayload({
          code: '  new_10  ',
          type: 'PERCENT',
          value: '10',
          maxDiscount: '',
          isActive: true,
        })
      ).toEqual({
        code: 'NEW_10',
        type: 'PERCENT',
        value: 10,
        isActive: true,
      });

      const initialPercent = SAMPLE_PROMOTIONS[3]; // BREW10: PERCENT, 10, max 15000, active true
      const initialNoCapPercent = SAMPLE_PROMOTIONS[0]; // BREW5: PERCENT, 5, max null, active true
      expect(
        buildUpdatePromotionPayload(
          {
            code: 'BREW10',
            type: 'PERCENT',
            value: '10',
            maxDiscount: '15000',
            isActive: true,
          },
          initialPercent
        )
      ).toEqual({});

      // Xóa trần giảm trên mã ĐANG có trần khi giữ PERCENT -> bị chặn ở client validation
      const clearCapValidation = validatePromotionForm(
        {
          code: 'BREW10',
          type: 'PERCENT',
          value: '10',
          maxDiscount: '',
          isActive: true,
        },
        { mode: 'edit', initialPromotion: initialPercent }
      );
      expect(clearCapValidation.isValid).toBe(false);
      expect(clearCapValidation.errors.maxDiscount).toBe(
        'Mã đang có trần giảm nên không thể để trống. Muốn bỏ trần, hãy đổi loại sang giảm số tiền hoặc tạo mã mới.'
      );

      // Mã KHÔNG có trần mà để trống -> hợp lệ, KHÔNG gửi trường maxDiscount
      const noCapValidation = validatePromotionForm(
        {
          code: 'BREW5',
          type: 'PERCENT',
          value: '12',
          maxDiscount: '',
          isActive: true,
        },
        { mode: 'edit', initialPromotion: initialNoCapPercent }
      );
      expect(noCapValidation.isValid).toBe(true);
      const noCapPayload = buildUpdatePromotionPayload(
        {
          code: 'BREW5',
          type: 'PERCENT',
          value: '12',
          maxDiscount: '',
          isActive: true,
        },
        initialNoCapPercent
      );
      expect(noCapPayload).toEqual({ value: 12 });
      expect('maxDiscount' in noCapPayload).toBe(false);

      // Đổi sang FIXED -> không gửi maxDiscount và không gửi code
      const fixedPayload = buildUpdatePromotionPayload(
        {
          code: 'BREW10',
          type: 'FIXED',
          value: '25000',
          maxDiscount: '15000',
          isActive: true,
        },
        initialPercent
      );
      expect(fixedPayload).toEqual({ type: 'FIXED', value: 25000 });
      expect('maxDiscount' in fixedPayload).toBe(false);
    });
  });

  describe('2. Giao diện & tích hợp API Thêm / Sửa mã giảm giá', () => {
    it('Form thêm mã: dùng đúng nhãn mục 9.3, tự đổi code sang chữ hoa, ẩn/hiện trần giảm theo loại, công tắc mặc định bật và báo lỗi từng ô', async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi.fn().mockResolvedValueOnce(mockJsonResponse(200, cloneSamplePromotions()));

      renderStaffPromotionsPage();
      await screen.findByTestId('staff-promotion-row-77777777-0000-0000-0000-000000000001');

      await user.click(screen.getByRole('button', { name: 'Thêm mã' }));
      const dialog = await screen.findByTestId('promotion-form-dialog');

      // Đúng nhãn loại mã ở mục 9.3
      const typeSelect = within(dialog).getByLabelText(/Loại mã/i);
      const options = within(typeSelect)
        .getAllByRole('option')
        .map((opt) => opt.textContent);
      expect(options).toEqual([PROMOTION_TYPE_LABELS.PERCENT, PROMOTION_TYPE_LABELS.FIXED]);

      // Mặc định bật
      const switchBtn = within(dialog).getByTestId('promotion-form-isActive-switch');
      expect(switchBtn).toHaveAttribute('aria-checked', 'true');
      expect(within(dialog).getByText('Đang bật')).toBeInTheDocument();

      // Đang ở PERCENT -> có ô Trần giảm
      expect(within(dialog).getByLabelText(/Trần giảm/i)).toBeInTheDocument();

      // Gõ chữ thường -> tự đổi sang chữ hoa
      const codeInput = within(dialog).getByLabelText(/^Mã giảm giá/i);
      await user.type(codeInput, 'brew_20');
      expect(codeInput).toHaveValue('BREW_20');

      // Đổi sang FIXED -> ẩn ô Trần giảm
      await user.selectOptions(typeSelect, 'FIXED');
      expect(within(dialog).queryByLabelText(/Trần giảm/i)).not.toBeInTheDocument();

      // Đổi lại PERCENT -> hiện ô Trần giảm và nhập sai để kiểm tra báo lỗi tiếng Việt dưới từng ô
      await user.selectOptions(typeSelect, 'PERCENT');
      await user.clear(codeInput);
      await user.type(codeInput, 'a');
      await user.type(within(dialog).getByLabelText(/Giá trị/i), '150');
      await user.type(within(dialog).getByLabelText(/Trần giảm/i), '500');
      await user.click(within(dialog).getByRole('button', { name: 'Thêm mã' }));

      expect(within(dialog).getByTestId('promotion-form-error-code')).toBeInTheDocument();
      expect(within(dialog).getByTestId('promotion-form-error-value')).toBeInTheDocument();
      expect(within(dialog).getByTestId('promotion-form-error-maxDiscount')).toBeInTheDocument();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('Thêm mã thành công: khóa nút tránh bấm hai lần, gọi POST /promotions, đóng form, tải lại bảng và hiện thông báo', async () => {
      const user = userEvent.setup();
      const initialList = cloneSamplePromotions();
      const createdPromo: Promotion = {
        id: '77777777-0000-0000-0000-000000000099',
        code: 'SUMMER20',
        type: 'PERCENT',
        value: 20,
        maxDiscount: null,
        isActive: true,
        createdAt: '2026-11-28T10:00:00.000Z',
      };

      let resolvePost!: (res: Response) => void;
      const pendingPost = new Promise<Response>((resolve) => {
        resolvePost = resolve;
      });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockJsonResponse(200, initialList))
        .mockReturnValueOnce(pendingPost)
        .mockResolvedValueOnce(mockJsonResponse(200, [createdPromo, ...initialList]));
      globalThis.fetch = fetchMock;

      renderStaffPromotionsPage();
      await screen.findByTestId('staff-promotion-row-77777777-0000-0000-0000-000000000001');

      await user.click(screen.getByRole('button', { name: 'Thêm mã' }));
      const dialog = await screen.findByTestId('promotion-form-dialog');

      await user.type(within(dialog).getByLabelText(/^Mã giảm giá/i), 'summer20');
      await user.type(within(dialog).getByLabelText(/Giá trị/i), '20');

      const submitBtn = within(dialog).getByRole('button', { name: 'Thêm mã' });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(within(dialog).getByRole('button', { name: 'Đang lưu...' })).toBeDisabled();
      });
      // Bấm lần nữa khi đang gửi không gọi thêm POST
      await user.click(within(dialog).getByRole('button', { name: 'Đang lưu...' }));
      expect(fetchMock).toHaveBeenCalledTimes(2);

      resolvePost(mockJsonResponse(201, createdPromo));

      await waitFor(() => {
        expect(screen.queryByTestId('promotion-form-dialog')).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('staff-promotions-action-success')).toHaveTextContent(
        'Đã thêm mã "SUMMER20" thành công.'
      );
      expect(
        await screen.findByTestId('staff-promotion-row-77777777-0000-0000-0000-000000000099')
      ).toBeInTheDocument();

      const [, postInit] = fetchMock.mock.calls[1];
      expect(String(fetchMock.mock.calls[1][0])).toBe('http://localhost:3001/promotions');
      expect(postInit?.method).toBe('POST');
      expect(JSON.parse(String(postInit?.body))).toEqual({
        code: 'SUMMER20',
        type: 'PERCENT',
        value: 20,
        isActive: true,
      });
    });

    it('Lỗi 409 khi thêm mã: giữ nguyên form và hiện "Mã giảm giá đã tồn tại" ngay dưới ô code', async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(mockJsonResponse(200, cloneSamplePromotions()))
        .mockResolvedValueOnce(
          mockJsonResponse(409, {
            statusCode: 409,
            message: 'Mã giảm giá đã tồn tại',
            error: 'Conflict',
          })
        );

      renderStaffPromotionsPage();
      await screen.findByTestId('staff-promotion-row-77777777-0000-0000-0000-000000000001');

      await user.click(screen.getByRole('button', { name: 'Thêm mã' }));
      const dialog = await screen.findByTestId('promotion-form-dialog');

      await user.type(within(dialog).getByLabelText(/^Mã giảm giá/i), 'brew10');
      await user.type(within(dialog).getByLabelText(/Giá trị/i), '10');
      await user.click(within(dialog).getByRole('button', { name: 'Thêm mã' }));

      const codeError = await within(dialog).findByTestId('promotion-form-error-code');
      expect(codeError).toHaveTextContent('Mã giảm giá đã tồn tại');
      expect(screen.getByTestId('promotion-form-dialog')).toBeInTheDocument();
    });

    it('Sửa mã: khóa ô code, báo khi chưa đổi gì, đổi sang FIXED không gửi code hay maxDiscount, và dùng ConfirmDialog khi chuyển từ bật sang tắt', async () => {
      const user = userEvent.setup();
      const initialList = cloneSamplePromotions();
      const target = initialList[3]; // BREW10: PERCENT, 10, max 15000, isActive: true
      const updatedTarget: Promotion = {
        ...target,
        type: 'FIXED',
        value: 25000,
        maxDiscount: null,
        isActive: false,
      };
      const reloadedList = initialList.map((item) =>
        item.id === target.id ? updatedTarget : item
      );

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockJsonResponse(200, initialList))
        .mockResolvedValueOnce(mockJsonResponse(200, updatedTarget))
        .mockResolvedValueOnce(mockJsonResponse(200, reloadedList));
      globalThis.fetch = fetchMock;

      renderStaffPromotionsPage();
      const targetRow = await screen.findByTestId(`staff-promotion-row-${target.id}`);

      await user.click(within(targetRow).getByRole('button', { name: 'Sửa' }));
      const dialog = await screen.findByTestId('promotion-form-dialog');

      // Ô code bị khóa
      const codeInput = within(dialog).getByLabelText(/^Mã giảm giá/i);
      expect(codeInput).toBeDisabled();
      expect(codeInput).toHaveValue('BREW10');

      // Bấm lưu khi chưa sửa gì -> báo nhắc, không gọi API
      await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
      expect(await within(dialog).findByTestId('promotion-form-server-error')).toHaveTextContent(
        'Chưa có thay đổi nào để lưu'
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Đổi sang FIXED, đổi giá trị thành 25000, và gạt tắt công tắc
      await user.selectOptions(within(dialog).getByLabelText(/Loại mã/i), 'FIXED');
      const valueInput = within(dialog).getByLabelText(/Giá trị/i);
      await user.clear(valueInput);
      await user.type(valueInput, '25000');
      await user.click(within(dialog).getByTestId('promotion-form-isActive-switch'));

      // Bấm Lưu -> mở ConfirmDialog trước vì chuyển từ Đang bật sang Đã tắt
      await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const confirmDialog = await screen.findByRole('dialog', {
        name: `Tắt mã giảm giá "${target.code}"?`,
      });
      await user.click(within(confirmDialog).getByRole('button', { name: 'Đóng' }));
      await waitFor(() => {
        expect(
          screen.queryByRole('dialog', { name: `Tắt mã giảm giá "${target.code}"?` })
        ).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('promotion-form-dialog')).toBeInTheDocument();

      // Lưu lại và xác nhận tắt
      await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
      const confirmDialogAgain = await screen.findByRole('dialog', {
        name: `Tắt mã giảm giá "${target.code}"?`,
      });
      await user.click(within(confirmDialogAgain).getByRole('button', { name: 'Xác nhận tắt' }));

      await waitFor(() => {
        expect(screen.queryByTestId('promotion-form-dialog')).not.toBeInTheDocument();
        expect(within(targetRow).getByText('Giảm số tiền')).toBeInTheDocument();
        expect(within(targetRow).getByText('25.000đ')).toBeInTheDocument();
        expect(within(targetRow).getByText('Đã tắt')).toBeInTheDocument();
      });

      expect(screen.getByTestId('staff-promotions-action-success')).toHaveTextContent(
        'Đã cập nhật mã "BREW10" thành công.'
      );

      const [patchUrl, patchInit] = fetchMock.mock.calls[1];
      expect(String(patchUrl)).toBe(`http://localhost:3001/promotions/${target.id}`);
      expect(patchInit?.method).toBe('PATCH');
      const sentBody = JSON.parse(String(patchInit?.body));
      expect(sentBody).toEqual({
        type: 'FIXED',
        value: 25000,
        isActive: false,
      });
      expect(sentBody.code).toBeUndefined();
      expect(sentBody.maxDiscount).toBeUndefined();
      expect('maxDiscount' in sentBody).toBe(false);
    });

    it('Sửa mã % đang có trần: xóa trống ô Trần giảm bị FE chặn tại client, không gọi API, không đóng form và hiện đúng lỗi; đổi sang FIXED vẫn lưu không gửi maxDiscount', async () => {
      const user = userEvent.setup();
      const initialList = cloneSamplePromotions();
      const target = initialList[3]; // BREW10: PERCENT, 10, max 15000, isActive: true
      const updatedFixed: Promotion = {
        ...target,
        type: 'FIXED',
        value: 20000,
        maxDiscount: null,
      };
      const reloadedList = initialList.map((item) =>
        item.id === target.id ? updatedFixed : item
      );

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockJsonResponse(200, initialList))
        .mockResolvedValueOnce(mockJsonResponse(200, updatedFixed))
        .mockResolvedValueOnce(mockJsonResponse(200, reloadedList));
      globalThis.fetch = fetchMock;

      renderStaffPromotionsPage();
      const brew10Row = await screen.findByTestId(`staff-promotion-row-${target.id}`);

      await user.click(within(brew10Row).getByRole('button', { name: 'Sửa' }));
      const dialog = await screen.findByTestId('promotion-form-dialog');

      // 1. Xóa trống ô Trần giảm rồi bấm Lưu -> chặn ngay ở client, KHÔNG gọi PATCH, form vẫn mở
      await user.clear(within(dialog).getByLabelText(/Trần giảm/i));
      await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));

      const maxDiscountError = await within(dialog).findByTestId(
        'promotion-form-error-maxDiscount'
      );
      expect(maxDiscountError).toHaveTextContent(
        'Mã đang có trần giảm nên không thể để trống. Muốn bỏ trần, hãy đổi loại sang giảm số tiền hoặc tạo mã mới.'
      );
      expect(screen.queryByTestId('promotion-form-server-error')).not.toBeInTheDocument();
      expect(screen.getByTestId('promotion-form-dialog')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // 4. Đổi sang FIXED và lưu -> body KHÔNG chứa maxDiscount
      await user.selectOptions(within(dialog).getByLabelText(/Loại mã/i), 'FIXED');
      const valueInput = within(dialog).getByLabelText(/Giá trị/i);
      await user.clear(valueInput);
      await user.type(valueInput, '20000');
      await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));

      await waitFor(() => {
        expect(screen.queryByTestId('promotion-form-dialog')).not.toBeInTheDocument();
      });

      const [patchUrl, patchInit] = fetchMock.mock.calls[1];
      expect(String(patchUrl)).toBe(`http://localhost:3001/promotions/${target.id}`);
      expect(patchInit?.method).toBe('PATCH');
      const sentBody = JSON.parse(String(patchInit?.body));
      expect(sentBody).toEqual({
        type: 'FIXED',
        value: 20000,
      });
      expect('maxDiscount' in sentBody).toBe(false);
    });

    it('Sửa mã % KHÔNG có trần: để trống ô Trần giảm vẫn lưu bình thường và KHÔNG gửi maxDiscount', async () => {
      const user = userEvent.setup();
      const initialList = cloneSamplePromotions();
      const target = initialList[0]; // BREW5: PERCENT, 5, maxDiscount: null, isActive: true
      const updatedTarget: Promotion = {
        ...target,
        value: 12,
      };
      const reloadedList = initialList.map((item) =>
        item.id === target.id ? updatedTarget : item
      );

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockJsonResponse(200, initialList))
        .mockResolvedValueOnce(mockJsonResponse(200, updatedTarget))
        .mockResolvedValueOnce(mockJsonResponse(200, reloadedList));
      globalThis.fetch = fetchMock;

      renderStaffPromotionsPage();
      const brew5Row = await screen.findByTestId(`staff-promotion-row-${target.id}`);

      await user.click(within(brew5Row).getByRole('button', { name: 'Sửa' }));
      const dialog = await screen.findByTestId('promotion-form-dialog');

      expect(within(dialog).getByLabelText(/Trần giảm/i)).toHaveValue('');

      const valueInput = within(dialog).getByLabelText(/Giá trị/i);
      await user.clear(valueInput);
      await user.type(valueInput, '12');
      await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));

      await waitFor(() => {
        expect(screen.queryByTestId('promotion-form-dialog')).not.toBeInTheDocument();
        expect(within(brew5Row).getByText('12%')).toBeInTheDocument();
      });

      const [patchUrl, patchInit] = fetchMock.mock.calls[1];
      expect(String(patchUrl)).toBe(`http://localhost:3001/promotions/${target.id}`);
      expect(patchInit?.method).toBe('PATCH');
      const sentBody = JSON.parse(String(patchInit?.body));
      expect(sentBody).toEqual({ value: 12 });
      expect('maxDiscount' in sentBody).toBe(false);
    });

    it('Lỗi 404 khi sửa mã: đóng hộp xác nhận (nếu có), giữ form mở và báo "Không tìm thấy mã giảm giá"', async () => {
      const user = userEvent.setup();
      const initialList = cloneSamplePromotions();
      const target = initialList[0]; // BREW5: PERCENT, 5, max null, isActive true

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(mockJsonResponse(200, initialList))
        .mockResolvedValueOnce(
          mockJsonResponse(404, {
            statusCode: 404,
            message: 'Không tìm thấy mã giảm giá',
            error: 'Not Found',
          })
        )
        .mockResolvedValueOnce(
          mockJsonResponse(404, {
            statusCode: 404,
            message: 'Không tìm thấy mã giảm giá',
            error: 'Not Found',
          })
        );

      renderStaffPromotionsPage();
      const row = await screen.findByTestId(`staff-promotion-row-${target.id}`);

      await user.click(within(row).getByRole('button', { name: 'Sửa' }));
      const dialog = await screen.findByTestId('promotion-form-dialog');

      const valueInput = within(dialog).getByLabelText(/Giá trị/i);
      await user.clear(valueInput);
      await user.type(valueInput, '12');
      await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));

      const serverError = await within(dialog).findByTestId('promotion-form-server-error');
      expect(serverError).toHaveTextContent('Không tìm thấy mã giảm giá');
      expect(screen.getByTestId('promotion-form-dialog')).toBeInTheDocument();

      // Cả khi tắt mã qua ConfirmDialog mà gặp 404 cũng phải đóng hộp xác nhận và giữ form mở
      await user.click(within(dialog).getByTestId('promotion-form-isActive-switch'));
      await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
      const confirmDialog = await screen.findByRole('dialog', {
        name: `Tắt mã giảm giá "${target.code}"?`,
      });
      await user.click(within(confirmDialog).getByRole('button', { name: 'Xác nhận tắt' }));

      await waitFor(() => {
        expect(
          screen.queryByRole('dialog', { name: `Tắt mã giảm giá "${target.code}"?` })
        ).not.toBeInTheDocument();
      });
      expect(await within(dialog).findByTestId('promotion-form-server-error')).toHaveTextContent(
        'Không tìm thấy mã giảm giá'
      );
      expect(screen.getByTestId('promotion-form-dialog')).toBeInTheDocument();
    });

    it('Chế độ dữ liệu giả (NEXT_PUBLIC_USE_MOCK=true): thêm mã, trùng mã báo 409 dưới ô code, và sửa mã cập nhật bảng không gọi fetch', async () => {
      const user = userEvent.setup();
      process.env.NEXT_PUBLIC_USE_MOCK = 'true';
      globalThis.fetch = vi.fn();

      renderStaffPromotionsPage();
      await screen.findByTestId('staff-promotion-row-77777777-0000-0000-0000-000000000001');

      // 1. Thử thêm trùng mã BREW10 -> 409 dưới ô code
      await user.click(screen.getByRole('button', { name: 'Thêm mã' }));
      const dialogDup = await screen.findByTestId('promotion-form-dialog');
      await user.type(within(dialogDup).getByLabelText(/^Mã giảm giá/i), 'brew10');
      await user.type(within(dialogDup).getByLabelText(/Giá trị/i), '10');
      await user.click(within(dialogDup).getByRole('button', { name: 'Thêm mã' }));

      expect(await within(dialogDup).findByTestId('promotion-form-error-code')).toHaveTextContent(
        'Mã giảm giá đã tồn tại'
      );

      // 2. Đổi code sang MOCK30 -> lưu thành công
      const codeInput = within(dialogDup).getByLabelText(/^Mã giảm giá/i);
      await user.clear(codeInput);
      await user.type(codeInput, 'mock30');
      const valueInput = within(dialogDup).getByLabelText(/Giá trị/i);
      await user.clear(valueInput);
      await user.type(valueInput, '30');
      await user.type(within(dialogDup).getByLabelText(/Trần giảm/i), '30000');
      await user.click(within(dialogDup).getByRole('button', { name: 'Thêm mã' }));

      await waitFor(() => {
        expect(screen.queryByTestId('promotion-form-dialog')).not.toBeInTheDocument();
      });
      const mock30Cell = await screen.findByText('MOCK30');
      const mock30Row = mock30Cell.closest('tr')!;
      expect(within(mock30Row).getByText('30%')).toBeInTheDocument();
      expect(within(mock30Row).getByText('30.000đ')).toBeInTheDocument();

      // 3. Sửa BREW10 xóa trần giảm -> bị FE chặn, giữ form mở; đổi sang FIXED thì lưu thành công với trần giảm "—"
      const brew10Row = screen.getByTestId(
        'staff-promotion-row-77777777-0000-0000-0000-000000000001'
      );
      await user.click(within(brew10Row).getByRole('button', { name: 'Sửa' }));
      const editDialog = await screen.findByTestId('promotion-form-dialog');
      await user.clear(within(editDialog).getByLabelText(/Trần giảm/i));
      await user.click(within(editDialog).getByRole('button', { name: 'Lưu thay đổi' }));

      expect(
        await within(editDialog).findByTestId('promotion-form-error-maxDiscount')
      ).toHaveTextContent(
        'Mã đang có trần giảm nên không thể để trống. Muốn bỏ trần, hãy đổi loại sang giảm số tiền hoặc tạo mã mới.'
      );
      expect(screen.getByTestId('promotion-form-dialog')).toBeInTheDocument();

      await user.selectOptions(within(editDialog).getByLabelText(/Loại mã/i), 'FIXED');
      const editValueInput = within(editDialog).getByLabelText(/Giá trị/i);
      await user.clear(editValueInput);
      await user.type(editValueInput, '20000');
      await user.click(within(editDialog).getByRole('button', { name: 'Lưu thay đổi' }));

      await waitFor(() => {
        expect(screen.queryByTestId('promotion-form-dialog')).not.toBeInTheDocument();
        expect(within(brew10Row).getByText('Giảm số tiền')).toBeInTheDocument();
        expect(within(brew10Row).getByText('—')).toBeInTheDocument();
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });
});
