'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { AUTH_ERROR_MESSAGES, StaffUser, UserRole } from '../../../services/auth-contract';
import {
  clearAuthSession,
  loadAuthSession,
  notifyAccountLocked,
} from '../../../utils/auth';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  fetchStaffEmployees,
  formatStaffEmployeeDateTime,
  getEmployeeRoleLabel,
  getEmployeeStatusLabel,
  ParsedStaffEmployeeError,
  parseStaffEmployeeError,
  updateStaffEmployeeStatus,
} from '../services/staff-employees';
import { useStaffShellContext } from './StaffShell';

interface ActionFeedback {
  type: 'success' | 'error';
  message: string;
}

export default function StaffEmployeesView() {
  const router = useRouter();
  const { user, isAuthenticated, isHydrated, logout } = useAuth();
  const staffShellContext = useStaffShellContext();

  const hasRealSession = Boolean(isAuthenticated && user);
  const usingShellMockFallback =
    !hasRealSession && Boolean(staffShellContext?.usingMockFallback);
  const effectiveRole: UserRole | null = hasRealSession
    ? (user?.role ?? null)
    : (staffShellContext?.role ?? null);
  const isAdmin = effectiveRole === 'ADMIN';

  const [employees, setEmployees] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [updatingEmployeeId, setUpdatingEmployeeId] = useState<string | null>(null);
  const [updatingAction, setUpdatingAction] = useState<'lock' | 'unlock' | null>(null);
  const [statusDialogTarget, setStatusDialogTarget] = useState<{
    employee: StaffUser;
    nextIsActive: boolean;
  } | null>(null);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);
  const [authBlocked, setAuthBlocked] = useState<boolean>(false);

  const requestSeqRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const actionInFlightRef = useRef<boolean>(false);
  const authBlockedRef = useRef<boolean>(false);

  const accessRedirectTarget: string | null = (() => {
    if (!isHydrated || authBlocked) return null;
    if (effectiveRole === 'ADMIN') return null;
    if (effectiveRole === 'STAFF') return '/staff';
    return '/';
  })();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleAuthFailure = useCallback(
    (parsed: ParsedStaffEmployeeError): boolean => {
      if (parsed.isUnauthorized) {
        authBlockedRef.current = true;
        setAuthBlocked(true);
        clearAuthSession();
        router.replace('/login?redirect=%2Fstaff%2Femployees&expired=true');
        return true;
      }
      if (parsed.isAccountLocked) {
        authBlockedRef.current = true;
        setAuthBlocked(true);
        if (loadAuthSession() !== null) {
          notifyAccountLocked(AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED);
        }
        logout();
        return true;
      }
      return false;
    },
    [logout, router]
  );

  const handleAuthFailureRef = useRef(handleAuthFailure);
  useEffect(() => {
    handleAuthFailureRef.current = handleAuthFailure;
  }, [handleAuthFailure]);

  useEffect(() => {
    if (!isHydrated || authBlockedRef.current) return;

    if (accessRedirectTarget) {
      router.replace(accessRedirectTarget);
      return;
    }

    if (!isAdmin) return;

    const seq = ++requestSeqRef.current;
    let isCancelled = false;

    fetchStaffEmployees(usingShellMockFallback)
      .then((data) => {
        if (isCancelled || !isMountedRef.current || requestSeqRef.current !== seq) return;
        setEmployees(Array.isArray(data) ? data : []);
        setError(null);
        setLoading(false);
        setIsReloading(false);
      })
      .catch((err: unknown) => {
        if (isCancelled || !isMountedRef.current || requestSeqRef.current !== seq) return;
        const parsed = parseStaffEmployeeError(err);
        if (handleAuthFailureRef.current(parsed)) {
          setError(parsed.message);
          setLoading(false);
          setIsReloading(false);
          return;
        }
        setError(parsed.message);
        setLoading(false);
        setIsReloading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [accessRedirectTarget, isAdmin, isHydrated, router, usingShellMockFallback]);

  const runReloadEmployees = useCallback(
    async (options?: { showFullLoading?: boolean; keepFeedback?: boolean }) => {
      if (!isAdmin || authBlockedRef.current) return;

      const seq = ++requestSeqRef.current;
      const showFullLoading = options?.showFullLoading ?? false;

      if (showFullLoading) {
        setLoading(true);
      } else {
        setIsReloading(true);
      }

      if (!options?.keepFeedback) {
        setActionFeedback(null);
      }
      setError(null);

      try {
        const data = await fetchStaffEmployees(usingShellMockFallback);
        if (!isMountedRef.current || requestSeqRef.current !== seq) return;
        setEmployees(Array.isArray(data) ? data : []);
      } catch (err: unknown) {
        if (!isMountedRef.current || requestSeqRef.current !== seq) return;
        const parsed = parseStaffEmployeeError(err);
        if (handleAuthFailureRef.current(parsed)) {
          setError(parsed.message);
          return;
        }
        if (options?.keepFeedback) {
          setActionFeedback({ type: 'error', message: parsed.message });
        } else {
          setError(parsed.message);
        }
      } finally {
        if (isMountedRef.current && requestSeqRef.current === seq) {
          setLoading(false);
          setIsReloading(false);
        }
      }
    },
    [isAdmin, usingShellMockFallback]
  );

  const handleManualReload = () => {
    void runReloadEmployees({ showFullLoading: false, keepFeedback: false });
  };

  const handleRetryLoad = () => {
    void runReloadEmployees({ showFullLoading: true, keepFeedback: false });
  };

  const applyUpdatedEmployee = (updatedEmployee: StaffUser) => {
    setEmployees((prev) =>
      prev.map((item) => (item.id === updatedEmployee.id ? updatedEmployee : item))
    );
  };

  const handleOpenStatusDialog = (employee: StaffUser, nextIsActive: boolean) => {
    if (
      !isAdmin ||
      employee.isActive === nextIsActive ||
      actionInFlightRef.current ||
      updatingEmployeeId !== null
    ) {
      return;
    }
    setActionFeedback(null);
    setStatusDialogTarget({ employee, nextIsActive });
  };

  const handleCloseStatusDialog = () => {
    if (actionInFlightRef.current || updatingEmployeeId !== null) return;
    setStatusDialogTarget(null);
  };

  const runStatusUpdate = async (employee: StaffUser, nextIsActive: boolean) => {
    if (!isAdmin || actionInFlightRef.current) return;

    actionInFlightRef.current = true;
    setUpdatingEmployeeId(employee.id);
    setUpdatingAction(nextIsActive ? 'unlock' : 'lock');
    if (nextIsActive) {
      setActionFeedback(null);
    }

    try {
      const updated = await updateStaffEmployeeStatus(
        employee.id,
        nextIsActive,
        usingShellMockFallback
      );
      if (!isMountedRef.current) return;

      setStatusDialogTarget(null);
      applyUpdatedEmployee(updated);
      setActionFeedback({
        type: 'success',
        message: updated.isActive
          ? `Đã mở khóa tài khoản "${updated.displayName}".`
          : `Đã khóa tài khoản "${updated.displayName}".`,
      });
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const parsed = parseStaffEmployeeError(err);

      setStatusDialogTarget(null);

      if (handleAuthFailureRef.current(parsed)) {
        setError(parsed.message);
        return;
      }

      setActionFeedback({ type: 'error', message: parsed.message });
      if (parsed.isNotFound) {
        await runReloadEmployees({ showFullLoading: false, keepFeedback: true });
      }
    } finally {
      actionInFlightRef.current = false;
      if (isMountedRef.current) {
        setUpdatingEmployeeId(null);
        setUpdatingAction(null);
      }
    }
  };

  if (isHydrated && accessRedirectTarget) {
    return (
      <div
        data-testid="staff-employees-redirecting"
        className="rounded-card border border-tan/70 bg-cream py-16 px-6 text-center text-sm text-noir/70 shadow-soft space-y-3"
      >
        <div className="animate-spin inline-block w-6 h-6 border-2 border-kombu border-t-transparent rounded-full" />
        <p>Đang chuyển hướng...</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="staff-employees-heading" className="space-y-6">
      {/* Đầu trang & nút tải lại */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-tan/70 pb-5">
        <div>
          <h1 id="staff-employees-heading" className="font-display text-3xl font-bold text-noir">
            Nhân viên
          </h1>
          <p className="mt-1 text-sm text-noir/65">
            Theo dõi danh sách tài khoản nhân viên và khóa hoặc mở khóa quyền truy cập hệ thống.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleManualReload}
            disabled={loading || isReloading || updatingEmployeeId !== null}
            className="min-h-10 inline-flex items-center gap-1.5 rounded-control border border-tan bg-cream hover:bg-tan/40 px-4 py-2 text-sm font-semibold text-noir transition shadow-soft disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <span>↻</span>
            <span>{isReloading ? 'Đang tải lại...' : 'Tải lại'}</span>
          </button>
        </div>
      </div>

      {/* Thông báo kết quả / lỗi thao tác trên nhân viên */}
      {actionFeedback && (
        <div
          role={actionFeedback.type === 'error' ? 'alert' : 'status'}
          data-testid={
            actionFeedback.type === 'error'
              ? 'staff-employees-action-error'
              : 'staff-employees-action-success'
          }
          className={`flex items-start justify-between gap-3 rounded-control border px-4 py-3 text-sm font-medium shadow-soft ${
            actionFeedback.type === 'error'
              ? 'border-error/45 bg-error/10 text-error'
              : 'border-moss/60 bg-tan/35 text-kombu'
          }`}
        >
          <span>{actionFeedback.message}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            aria-label="Đóng thông báo"
            className="shrink-0 text-xs font-bold opacity-75 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Trạng thái Loading */}
      {loading && (
        <div
          data-testid="staff-employees-loading"
          className="rounded-card border border-tan/70 bg-cream py-16 px-6 text-center text-sm text-noir/70 shadow-soft space-y-3"
        >
          <div className="animate-spin inline-block w-8 h-8 border-2 border-kombu border-t-transparent rounded-full" />
          <p>Đang tải danh sách nhân viên...</p>
        </div>
      )}

      {/* Trạng thái Error */}
      {!loading && error && (
        <div
          role="alert"
          data-testid="staff-employees-error"
          className="rounded-card border border-tan/70 bg-cream py-12 px-6 text-center shadow-soft space-y-4"
        >
          <div className="max-w-lg mx-auto rounded-control border border-error/45 bg-error/10 px-4 py-3 text-sm font-semibold text-error">
            {error}
          </div>
          <div>
            <button
              type="button"
              onClick={handleRetryLoad}
              className="px-5 py-2.5 rounded-control bg-kombu hover:bg-noir text-bone text-sm font-semibold transition shadow-soft cursor-pointer"
            >
              Thử lại
            </button>
          </div>
        </div>
      )}

      {/* Trạng thái Empty */}
      {!loading && !error && employees.length === 0 && (
        <div
          data-testid="staff-employees-empty"
          className="rounded-card border border-tan/70 bg-cream py-16 px-6 text-center shadow-soft space-y-4"
        >
          <p className="font-display text-lg font-bold text-noir">Chưa có nhân viên nào</p>
          <p className="text-sm text-noir/65">
            Hiện chưa có tài khoản nhân viên nào trong danh sách.
          </p>
          <div>
            <button
              type="button"
              onClick={handleManualReload}
              className="px-4 py-2 rounded-control border border-tan bg-bone/70 hover:bg-tan/40 text-noir text-sm font-semibold transition cursor-pointer"
            >
              Tải lại
            </button>
          </div>
        </div>
      )}

      {/* Bảng danh sách nhân viên (tối ưu cho máy tính) */}
      {!loading && !error && employees.length > 0 && (
        <div className="rounded-card border border-tan bg-cream shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-tan bg-bone/60 text-xs font-bold uppercase tracking-wide text-noir/75">
                  <th scope="col" className="px-5 py-3.5">
                    Tên hiển thị
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Email
                  </th>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                    Vai trò
                  </th>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                    Ngày tạo
                  </th>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                    Trạng thái
                  </th>
                  <th scope="col" className="px-5 py-3.5 whitespace-nowrap text-right">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tan/60 text-sm">
                {employees.map((employee) => {
                  const isAnyUpdating = updatingEmployeeId !== null || isReloading;
                  const isThisRowUpdating = updatingEmployeeId === employee.id;
                  const roleLabel = getEmployeeRoleLabel(employee.role);
                  const statusLabel = getEmployeeStatusLabel(employee.isActive);
                  const createdAtText = formatStaffEmployeeDateTime(employee.createdAt);

                  return (
                    <tr
                      key={employee.id}
                      data-testid={`staff-employee-row-${employee.id}`}
                      className={`transition ${
                        employee.isActive ? 'hover:bg-bone/35' : 'bg-bone/45 text-noir/75'
                      }`}
                    >
                      <td className="px-5 py-4 font-semibold text-noir break-words">
                        {employee.displayName}
                      </td>

                      <td className="px-5 py-4 text-noir/80 break-all">{employee.email}</td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-caption font-semibold bg-tan/40 text-noir border border-tan">
                          {roleLabel}
                        </span>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-noir/75">
                        {createdAtText}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-caption font-semibold ${
                            employee.isActive
                              ? 'bg-moss/25 text-kombu border border-moss/40'
                              : 'bg-error/10 text-error border border-error/30'
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        {employee.isActive ? (
                          <button
                            type="button"
                            disabled={isAnyUpdating}
                            onClick={() => handleOpenStatusDialog(employee, false)}
                            className="px-3.5 py-1.5 rounded-control border border-error/45 bg-cream hover:bg-error/10 text-error text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                          >
                            {isThisRowUpdating && updatingAction === 'lock'
                              ? 'Đang khóa...'
                              : 'Khóa'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isAnyUpdating}
                            onClick={() => handleOpenStatusDialog(employee, true)}
                            className="px-3.5 py-1.5 rounded-control bg-kombu hover:bg-noir text-bone text-xs font-semibold transition shadow-soft disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                          >
                            {isThisRowUpdating && updatingAction === 'unlock'
                              ? 'Đang mở khóa...'
                              : 'Mở khóa'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hộp xác nhận khóa / mở khóa tài khoản nhân viên */}
      <ConfirmDialog
        isOpen={Boolean(statusDialogTarget)}
        title={
          statusDialogTarget
            ? statusDialogTarget.nextIsActive
              ? `Mở khóa tài khoản "${statusDialogTarget.employee.displayName}"?`
              : `Khóa tài khoản "${statusDialogTarget.employee.displayName}"?`
            : ''
        }
        description={
          statusDialogTarget?.nextIsActive
            ? 'Nhân viên này sẽ có thể đăng nhập lại và tiếp tục xử lý đơn hàng tại quầy.'
            : 'Nhân viên bị khóa sẽ không thể đăng nhập và bị đăng xuất ngay khỏi các phiên đang hoạt động. Bạn có thể mở khóa lại sau.'
        }
        cancelLabel={statusDialogTarget?.nextIsActive ? 'Quay lại' : 'Đóng'}
        confirmLabel={statusDialogTarget?.nextIsActive ? 'Mở khóa' : 'Xác nhận khóa'}
        processingLabel={statusDialogTarget?.nextIsActive ? 'Đang mở khóa...' : 'Đang khóa...'}
        variant={statusDialogTarget?.nextIsActive ? 'default' : 'danger'}
        isProcessing={updatingEmployeeId !== null}
        onCancel={handleCloseStatusDialog}
        onConfirm={() => {
          if (statusDialogTarget) {
            void runStatusUpdate(
              statusDialogTarget.employee,
              statusDialogTarget.nextIsActive
            );
          }
        }}
      />
    </section>
  );
}
