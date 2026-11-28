import React, { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ConfirmDialog from '../app/components/ConfirmDialog';

describe('Component ConfirmDialog dùng chung', () => {
  it('1. Không render hộp thoại khi open=false và isOpen=false', () => {
    const { rerender } = render(
      <ConfirmDialog
        open={false}
        title="Xác nhận?"
        message="Nội dung"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(
      <ConfirmDialog
        isOpen={false}
        title="Xác nhận?"
        description="Nội dung"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('2. Hỗ trợ props mới (open, message, variant=default), nhãn mặc định ("Quay lại", "Xác nhận"), a11y và tự focus vào hộp khi mở', async () => {
    render(
      <ConfirmDialog
        open={true}
        title="Mở khóa tài khoản?"
        message="Nhân viên sẽ có thể đăng nhập lại."
        variant="default"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-describedby');

    const backdrop = screen.getByTestId('confirm-dialog-backdrop');
    expect(backdrop.className).toContain('fixed');
    expect(backdrop.className).toContain('inset-0');

    expect(
      within(dialog).getByRole('heading', { name: 'Mở khóa tài khoản?' })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('Nhân viên sẽ có thể đăng nhập lại.')
    ).toBeInTheDocument();

    const cancelBtn = within(dialog).getByRole('button', { name: 'Quay lại' });
    const confirmBtn = within(dialog).getByRole('button', { name: 'Xác nhận' });
    expect(cancelBtn).toBeEnabled();
    expect(confirmBtn).toBeEnabled();
    expect(confirmBtn.className).toContain('bg-kombu');

    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });

  it('3. Giữ tương thích props cũ (isOpen, description, variant=danger) và gọi đúng onConfirm / onCancel qua nút, Esc, nền tối', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        title="Xóa tất cả món?"
        description="Thao tác không thể hoàn tác."
        confirmLabel="Xóa tất cả"
        cancelLabel="Quay lại"
        variant="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        <p>Thông tin bổ sung</p>
      </ConfirmDialog>
    );

    const dialog = screen.getByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: 'Xóa tất cả' });
    expect(confirmBtn.className).toContain('bg-error');
    expect(within(dialog).getByText('Thông tin bổ sung')).toBeInTheDocument();

    // Bấm nút bên trong hộp không kích hoạt đóng từ nền
    await user.click(within(dialog).getByText('Thao tác không thể hoàn tác.'));
    expect(onCancel).not.toHaveBeenCalled();

    // Bấm nút xác nhận
    await user.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // Bấm nút hủy
    await user.click(within(dialog).getByRole('button', { name: 'Quay lại' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Bấm phím Esc
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(2);

    // Bấm nền tối
    await user.click(screen.getByTestId('confirm-dialog-backdrop'));
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('4. Khi loading=true (hoặc isProcessing=true): khóa cả hai nút, hiện chữ đang xử lý và chặn bấm đúp / Esc / bấm nền', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    const { rerender } = render(
      <ConfirmDialog
        open={true}
        title="Đang thực hiện"
        message="Vui lòng đợi"
        confirmLabel="Mở khóa"
        cancelLabel="Quay lại"
        loading={true}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const dialog = screen.getByRole('dialog');
    const cancelBtn = within(dialog).getByRole('button', { name: 'Quay lại' });
    const processingBtn = within(dialog).getByRole('button', { name: 'Đang xử lý...' });

    expect(cancelBtn).toBeDisabled();
    expect(processingBtn).toBeDisabled();

    await user.click(cancelBtn);
    await user.click(processingBtn);
    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('confirm-dialog-backdrop'));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    // Kiểm tra tương thích ngược isProcessing + processingLabel
    rerender(
      <ConfirmDialog
        isOpen={true}
        title="Đang thực hiện"
        description="Vui lòng đợi"
        confirmLabel="Xác nhận hủy"
        cancelLabel="Giữ đơn"
        processingLabel="Đang hủy..."
        isProcessing={true}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(within(dialog).getByRole('button', { name: 'Giữ đơn' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Đang hủy...' })).toBeDisabled();
  });

  it('5. Mở từ nút kích hoạt, đóng bằng Esc và trả lại focus về nút kích hoạt ban đầu', async () => {
    const user = userEvent.setup();

    function DialogHarness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Mở hộp
          </button>
          <ConfirmDialog
            open={open}
            title="Xác nhận?"
            onConfirm={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </div>
      );
    }

    render(<DialogHarness />);

    const triggerBtn = screen.getByRole('button', { name: 'Mở hộp' });
    await user.click(triggerBtn);

    const dialog = screen.getByRole('dialog');
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(triggerBtn).toHaveFocus();
  });
});
