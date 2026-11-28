import { ApiHttpError } from '../../../services/auth-contract';
import {
  GetOrdersParams,
  ORDER_ERROR_MESSAGES,
  ORDER_STATUS_LABELS,
  OrderResponse,
  OrderStatus,
  StaffUpdatableOrderStatus,
} from '../../../services/order-contract';

/**
 * Công tắc dữ liệu giả riêng cho trang /staff (đơn hàng).
 * Mặc định `enabled: false` để không ghi đè khi nối API thật (`NEXT_PUBLIC_USE_MOCK=false`).
 * Khi chưa có API thật, có thể bật `NEXT_PUBLIC_USE_MOCK_STAFF_ORDERS=true`
 * hoặc bật `NEXT_PUBLIC_USE_MOCK=true` trong `apps/web/.env.local`.
 */
export const STAFF_ORDERS_MOCK_CONFIG = {
  enabled: false,
};

export function isStaffOrdersMockEnabled(): boolean {
  const localFlag = process.env.NEXT_PUBLIC_USE_MOCK_STAFF_ORDERS;
  if (localFlag !== undefined && localFlag.trim() !== '') {
    return localFlag.trim() === 'true';
  }
  const unifiedFlag = process.env.NEXT_PUBLIC_USE_MOCK;
  if (unifiedFlag !== undefined && unifiedFlag.trim() === 'false') {
    return false;
  }
  return STAFF_ORDERS_MOCK_CONFIG.enabled;
}

const VALID_ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'PAID',
  'PREPARING',
  'READY',
  'COMPLETED',
  'PAYMENT_FAILED',
  'CANCELLED',
];

const STAFF_UPDATABLE_STATUSES: StaffUpdatableOrderStatus[] = [
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
];

/**
 * Dữ liệu giả đơn hàng đúng hình dạng hợp đồng (mục 5.1 & 5.5 docs/api-contract.md),
 * gồm đủ 7 trạng thái, thông tin khách hàng (`customer`), món nước và món bánh.
 */
export const MOCK_STAFF_ORDERS_SEED: OrderResponse[] = [
  {
    id: '33333333-0000-0000-0000-000000000101',
    orderNumber: 2007,
    status: 'PAID',
    receiveType: 'TAKE_AWAY',
    note: 'Cho xin thêm quai xách giấy',
    subtotalAmount: 136000,
    discountAmount: 0,
    promotionCode: null,
    pointsUsed: 0,
    pointsEarned: 0,
    totalAmount: 136000,
    createdAt: '2026-11-15T08:15:00.000Z',
    customer: {
      id: '44444444-0000-0000-0000-000000000001',
      displayName: 'Nguyễn Văn An',
      email: 'nguyenan@gmail.com',
    },
    items: [
      {
        id: '88888888-0000-0000-0000-000000000101',
        productId: '11111111-0000-0000-0000-000000000007',
        productName: 'Trà sữa truyền thống',
        size: 'M',
        sugarLevel: 'P70',
        iceLevel: 'NORMAL',
        quantity: 2,
        unitPrice: 53000,
        lineTotal: 106000,
        note: 'Ít ngọt vừa phải',
        toppings: [
          { id: '22222222-0000-0000-0000-000000000001', name: 'Trân châu đen', price: 5000 },
          { id: '22222222-0000-0000-0000-000000000003', name: 'Pudding', price: 7000 },
        ],
      },
      {
        id: '88888888-0000-0000-0000-000000000102',
        productId: '11111111-0000-0000-0000-000000000010',
        productName: 'Bánh Croissant',
        size: null,
        sugarLevel: null,
        iceLevel: null,
        quantity: 1,
        unitPrice: 30000,
        lineTotal: 30000,
        note: 'Hâm nóng giúp mình',
        toppings: [],
      },
    ],
  },
  {
    id: '33333333-0000-0000-0000-000000000102',
    orderNumber: 2006,
    status: 'PREPARING',
    receiveType: 'AT_COUNTER',
    note: null,
    subtotalAmount: 45000,
    discountAmount: 0,
    promotionCode: null,
    pointsUsed: 0,
    pointsEarned: 0,
    totalAmount: 45000,
    createdAt: '2026-11-15T07:50:00.000Z',
    customer: {
      id: '44444444-0000-0000-0000-000000000002',
      displayName: 'Trần Thị Bình',
      email: 'tranbinh@gmail.com',
    },
    items: [
      {
        id: '88888888-0000-0000-0000-000000000103',
        productId: '11111111-0000-0000-0000-000000000004',
        productName: 'Trà đào cam sả',
        size: 'L',
        sugarLevel: 'P50',
        iceLevel: 'LOW',
        quantity: 1,
        unitPrice: 45000,
        lineTotal: 45000,
        note: null,
        toppings: [],
      },
    ],
  },
  {
    id: '33333333-0000-0000-0000-000000000103',
    orderNumber: 2005,
    status: 'READY',
    receiveType: 'AT_COUNTER',
    note: 'Khách ngồi bàn số 3',
    subtotalAmount: 35000,
    discountAmount: 0,
    promotionCode: null,
    pointsUsed: 0,
    pointsEarned: 0,
    totalAmount: 35000,
    createdAt: '2026-11-15T07:30:00.000Z',
    customer: {
      id: '44444444-0000-0000-0000-000000000003',
      displayName: 'Lê Minh Châu',
      email: 'lechau@gmail.com',
    },
    items: [
      {
        id: '88888888-0000-0000-0000-000000000104',
        productId: '11111111-0000-0000-0000-000000000001',
        productName: 'Cà phê sữa đá',
        size: 'M',
        sugarLevel: 'P100',
        iceLevel: 'NORMAL',
        quantity: 1,
        unitPrice: 35000,
        lineTotal: 35000,
        note: null,
        toppings: [],
      },
    ],
  },
  {
    id: '33333333-0000-0000-0000-000000000104',
    orderNumber: 2004,
    status: 'PENDING',
    receiveType: 'AT_COUNTER',
    note: null,
    subtotalAmount: 29000,
    discountAmount: 0,
    promotionCode: null,
    pointsUsed: 0,
    pointsEarned: 0,
    totalAmount: 29000,
    createdAt: '2026-11-15T07:15:00.000Z',
    customer: {
      id: '44444444-0000-0000-0000-000000000004',
      displayName: 'Phạm Quốc Dũng',
      email: 'phamdung@gmail.com',
    },
    items: [
      {
        id: '88888888-0000-0000-0000-000000000105',
        productId: '11111111-0000-0000-0000-000000000001',
        productName: 'Cà phê sữa đá',
        size: 'S',
        sugarLevel: 'P100',
        iceLevel: 'FULL',
        quantity: 1,
        unitPrice: 29000,
        lineTotal: 29000,
        note: null,
        toppings: [],
      },
    ],
  },
  {
    id: '33333333-0000-0000-0000-000000000105',
    orderNumber: 2003,
    status: 'PAYMENT_FAILED',
    receiveType: 'TAKE_AWAY',
    note: null,
    subtotalAmount: 39000,
    discountAmount: 0,
    promotionCode: null,
    pointsUsed: 0,
    pointsEarned: 0,
    totalAmount: 39000,
    createdAt: '2026-11-15T06:45:00.000Z',
    customer: {
      id: '44444444-0000-0000-0000-000000000005',
      displayName: 'Hoàng Gia Huy',
      email: 'hoanghuy@gmail.com',
    },
    items: [
      {
        id: '88888888-0000-0000-0000-000000000106',
        productId: '11111111-0000-0000-0000-000000000004',
        productName: 'Trà đào cam sả',
        size: 'S',
        sugarLevel: 'P70',
        iceLevel: 'NONE',
        quantity: 1,
        unitPrice: 39000,
        lineTotal: 39000,
        note: null,
        toppings: [],
      },
    ],
  },
  {
    id: '33333333-0000-0000-0000-000000000106',
    orderNumber: 2002,
    status: 'COMPLETED',
    receiveType: 'TAKE_AWAY',
    note: null,
    subtotalAmount: 60000,
    discountAmount: 0,
    promotionCode: null,
    pointsUsed: 0,
    pointsEarned: 0,
    totalAmount: 60000,
    createdAt: '2026-11-15T06:00:00.000Z',
    customer: {
      id: '44444444-0000-0000-0000-000000000006',
      displayName: 'Đỗ Thanh Mai',
      email: 'domai@gmail.com',
    },
    items: [
      {
        id: '88888888-0000-0000-0000-000000000107',
        productId: '11111111-0000-0000-0000-000000000010',
        productName: 'Bánh Croissant',
        size: null,
        sugarLevel: null,
        iceLevel: null,
        quantity: 2,
        unitPrice: 30000,
        lineTotal: 60000,
        note: null,
        toppings: [],
      },
    ],
  },
  {
    id: '33333333-0000-0000-0000-000000000107',
    orderNumber: 2001,
    status: 'CANCELLED',
    receiveType: 'AT_COUNTER',
    note: 'Khách đổi món khác',
    subtotalAmount: 30000,
    discountAmount: 0,
    promotionCode: null,
    pointsUsed: 0,
    pointsEarned: 0,
    totalAmount: 30000,
    createdAt: '2026-11-15T05:30:00.000Z',
    customer: {
      id: '44444444-0000-0000-0000-000000000007',
      displayName: 'Vũ Hải Nam',
      email: 'vunam@gmail.com',
    },
    items: [
      {
        id: '88888888-0000-0000-0000-000000000108',
        productId: '11111111-0000-0000-0000-000000000010',
        productName: 'Bánh Croissant',
        size: null,
        sugarLevel: null,
        iceLevel: null,
        quantity: 1,
        unitPrice: 30000,
        lineTotal: 30000,
        note: null,
        toppings: [],
      },
    ],
  },
];

let mockStaffOrdersStore: OrderResponse[] = cloneOrders(MOCK_STAFF_ORDERS_SEED);

function cloneOrders(orders: OrderResponse[]): OrderResponse[] {
  return JSON.parse(JSON.stringify(orders)) as OrderResponse[];
}

export function resetMockStaffOrders(): void {
  mockStaffOrdersStore = cloneOrders(MOCK_STAFF_ORDERS_SEED);
}

export function validateStaffOrderTransition(
  fromStatus: OrderStatus,
  toStatus: OrderStatus
): boolean {
  if (toStatus === 'CANCELLED') {
    return (
      fromStatus === 'PENDING' ||
      fromStatus === 'PAYMENT_FAILED' ||
      fromStatus === 'PAID'
    );
  }
  if (fromStatus === 'PAID' && toStatus === 'PREPARING') return true;
  if (fromStatus === 'PREPARING' && toStatus === 'READY') return true;
  if (fromStatus === 'READY' && toStatus === 'COMPLETED') return true;
  return false;
}

export async function getMockStaffOrders(
  params?: GetOrdersParams
): Promise<OrderResponse[]> {
  await new Promise((resolve) => setTimeout(resolve, 30));

  if (params?.status && !VALID_ORDER_STATUSES.includes(params.status)) {
    throw new ApiHttpError({
      statusCode: 400,
      message: ORDER_ERROR_MESSAGES.INVALID_ORDER_STATUS,
      error: 'Bad Request',
    });
  }

  const filtered = params?.status
    ? mockStaffOrdersStore.filter((order) => order.status === params.status)
    : mockStaffOrdersStore;

  return cloneOrders(filtered).sort((a, b) => {
    const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.orderNumber - a.orderNumber;
  });
}

export async function updateMockStaffOrderStatus(
  orderId: string,
  nextStatus: StaffUpdatableOrderStatus
): Promise<OrderResponse> {
  await new Promise((resolve) => setTimeout(resolve, 30));

  if (!STAFF_UPDATABLE_STATUSES.includes(nextStatus)) {
    throw new ApiHttpError({
      statusCode: 400,
      message: ['status must be one of PREPARING, READY, COMPLETED, CANCELLED'],
      error: 'Bad Request',
    });
  }

  const target = mockStaffOrdersStore.find((order) => order.id === orderId);
  if (!target) {
    throw new ApiHttpError({
      statusCode: 404,
      message: ORDER_ERROR_MESSAGES.ORDER_NOT_FOUND,
      error: 'Not Found',
    });
  }

  if (!validateStaffOrderTransition(target.status, nextStatus)) {
    throw new ApiHttpError({
      statusCode: 409,
      message: `Không thể chuyển đơn từ trạng thái '${ORDER_STATUS_LABELS[target.status]}' sang '${ORDER_STATUS_LABELS[nextStatus]}'`,
      error: 'Conflict',
    });
  }

  target.status = nextStatus;
  return JSON.parse(JSON.stringify(target)) as OrderResponse;
}

