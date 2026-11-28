import { ApiHttpError } from '../services/auth-contract';
import {
  CreatePromotionDto,
  PROMOTION_ERROR_MESSAGES,
  Promotion,
  PromotionType,
  UpdatePromotionDto,
  ValidatePromotionDto,
  ValidatePromotionResponse,
} from '../services/promotions';
import { isMockPromotionsActive } from './mock-config';

export { isMockPromotionsActive };

const VALID_PROMOTION_TYPES: PromotionType[] = ['PERCENT', 'FIXED'];
const PROMOTION_CODE_REGEX = /^[A-Z0-9_-]{3,20}$/;

/**
 * Dữ liệu khuyến mãi mẫu (3 mã theo mục 8.2 hợp đồng API bản 3 + BREW5 dạng PERCENT không trần để kiểm thử đủ trường hợp).
 */
export const MOCK_SEED_PROMOTIONS: Promotion[] = [
  {
    id: '77777777-0000-0000-0000-000000000001',
    code: 'BREW10',
    type: 'PERCENT',
    value: 10,
    maxDiscount: 15000,
    isActive: true,
    createdAt: '2026-11-01T08:00:00.000Z',
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
    id: '77777777-0000-0000-0000-000000000003',
    code: 'TAMNGUNG',
    type: 'PERCENT',
    value: 15,
    maxDiscount: 20000,
    isActive: false,
    createdAt: '2026-11-01T08:10:00.000Z',
  },
  {
    id: '77777777-0000-0000-0000-000000000004',
    code: 'BREW5',
    type: 'PERCENT',
    value: 5,
    maxDiscount: null,
    isActive: true,
    createdAt: '2026-11-01T08:15:00.000Z',
  },
];

const mockPromotionsDb: Promotion[] = MOCK_SEED_PROMOTIONS.map((item) => ({ ...item }));

export function resetMockPromotionsDatabase(): void {
  mockPromotionsDb.splice(
    0,
    mockPromotionsDb.length,
    ...MOCK_SEED_PROMOTIONS.map((item) => ({ ...item }))
  );
}

export function findMockPromotionByCode(rawCode: string): Promotion | undefined {
  const normalized = (rawCode || '').trim().toUpperCase();
  if (!normalized) return undefined;
  return mockPromotionsDb.find((promo) => promo.code === normalized);
}

/**
 * Công thức tính tiền giảm theo mục 5.2 hợp đồng API bản 3 (làm tròn xuống, thực trả tối thiểu 1.000đ).
 */
export function calculatePromotionDiscount(promotion: Promotion, subtotal: number): number {
  let raw =
    promotion.type === 'PERCENT'
      ? Math.floor((subtotal * promotion.value) / 100)
      : promotion.value;

  if (promotion.type === 'PERCENT' && promotion.maxDiscount !== null) {
    raw = Math.min(raw, promotion.maxDiscount);
  }

  return Math.max(0, Math.min(raw, subtotal - 1000));
}

function validatePromotionFields(params: {
  type: PromotionType;
  value: unknown;
  maxDiscount: unknown;
  hasExplicitMaxDiscount: boolean;
}): string[] {
  const errors: string[] = [];

  if (!VALID_PROMOTION_TYPES.includes(params.type)) {
    errors.push('type must be one of PERCENT, FIXED');
    return errors;
  }

  if (params.type === 'PERCENT') {
    if (
      typeof params.value !== 'number' ||
      !Number.isInteger(params.value) ||
      params.value < 1 ||
      params.value > 100
    ) {
      errors.push('value must be an integer between 1 and 100 for PERCENT');
    }
    if (params.maxDiscount !== undefined && params.maxDiscount !== null) {
      if (
        typeof params.maxDiscount !== 'number' ||
        !Number.isInteger(params.maxDiscount) ||
        params.maxDiscount < 1000 ||
        params.maxDiscount > 1000000
      ) {
        errors.push('maxDiscount must be an integer between 1000 and 1000000');
      }
    }
  } else {
    if (
      typeof params.value !== 'number' ||
      !Number.isInteger(params.value) ||
      params.value < 1000 ||
      params.value > 1000000
    ) {
      errors.push('value must be an integer between 1000 and 1000000 for FIXED');
    }
    if (params.hasExplicitMaxDiscount && params.maxDiscount !== null) {
      errors.push('maxDiscount is only allowed for PERCENT promotions');
    }
  }

  return errors;
}

function generateMockPromotionId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `77777777-0000-4000-8000-${String(Date.now()).slice(-12).padStart(12, '0')}`;
}

export async function mockValidatePromotion(
  dto: ValidatePromotionDto
): Promise<ValidatePromotionResponse> {
  await new Promise((resolve) => setTimeout(resolve, 40));

  const errors: string[] = [];
  const trimmedCode = typeof dto.code === 'string' ? dto.code.trim() : '';
  if (trimmedCode.length < 1 || trimmedCode.length > 30) {
    errors.push('code must be between 1 and 30 characters');
  }
  if (
    typeof dto.subtotal !== 'number' ||
    !Number.isInteger(dto.subtotal) ||
    dto.subtotal < 1000
  ) {
    errors.push('subtotal must be an integer greater than or equal to 1000');
  }

  if (errors.length > 0) {
    throw new ApiHttpError({
      statusCode: 400,
      message: errors,
      error: 'Bad Request',
    });
  }

  const found = findMockPromotionByCode(trimmedCode);
  if (!found) {
    throw new ApiHttpError({
      statusCode: 404,
      message: PROMOTION_ERROR_MESSAGES.NOT_FOUND,
      error: 'Not Found',
    });
  }

  if (!found.isActive) {
    throw new ApiHttpError({
      statusCode: 409,
      message: PROMOTION_ERROR_MESSAGES.INACTIVE,
      error: 'Conflict',
    });
  }

  return {
    code: found.code,
    type: found.type,
    value: found.value,
    maxDiscount: found.maxDiscount,
    discountAmount: calculatePromotionDiscount(found, dto.subtotal),
  };
}

export async function mockGetPromotions(): Promise<Promotion[]> {
  await new Promise((resolve) => setTimeout(resolve, 40));

  return [...mockPromotionsDb]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((item) => ({ ...item }));
}

export async function mockCreatePromotion(dto: CreatePromotionDto): Promise<Promotion> {
  await new Promise((resolve) => setTimeout(resolve, 40));

  const errors: string[] = [];
  const normalizedCode = typeof dto.code === 'string' ? dto.code.trim().toUpperCase() : '';
  if (!PROMOTION_CODE_REGEX.test(normalizedCode)) {
    errors.push('code must be 3 to 20 characters (A-Z, 0-9, _, -)');
  }
  if (dto.isActive !== undefined && typeof dto.isActive !== 'boolean') {
    errors.push('isActive must be a boolean value');
  }
  errors.push(
    ...validatePromotionFields({
      type: dto.type,
      value: dto.value,
      maxDiscount: dto.maxDiscount,
      hasExplicitMaxDiscount: dto.maxDiscount !== undefined,
    })
  );

  if (errors.length > 0) {
    throw new ApiHttpError({
      statusCode: 400,
      message: errors,
      error: 'Bad Request',
    });
  }

  if (findMockPromotionByCode(normalizedCode)) {
    throw new ApiHttpError({
      statusCode: 409,
      message: PROMOTION_ERROR_MESSAGES.ALREADY_EXISTS,
      error: 'Conflict',
    });
  }

  const created: Promotion = {
    id: generateMockPromotionId(),
    code: normalizedCode,
    type: dto.type,
    value: dto.value,
    maxDiscount: dto.type === 'PERCENT' ? (dto.maxDiscount ?? null) : null,
    isActive: dto.isActive ?? true,
    createdAt: new Date().toISOString(),
  };

  mockPromotionsDb.unshift(created);
  return { ...created };
}

export async function mockUpdatePromotion(
  id: string,
  dto: UpdatePromotionDto
): Promise<Promotion> {
  await new Promise((resolve) => setTimeout(resolve, 40));

  const rawDto = dto as Record<string, unknown>;
  if (rawDto.code !== undefined) {
    throw new ApiHttpError({
      statusCode: 400,
      message: ['code cannot be modified'],
      error: 'Bad Request',
    });
  }

  const target = mockPromotionsDb.find((promo) => promo.id === id);
  if (!target) {
    throw new ApiHttpError({
      statusCode: 404,
      message: PROMOTION_ERROR_MESSAGES.MANAGE_NOT_FOUND,
      error: 'Not Found',
    });
  }

  const hasAnyField =
    dto.type !== undefined ||
    dto.value !== undefined ||
    dto.maxDiscount !== undefined ||
    dto.isActive !== undefined;

  const errors: string[] = [];
  if (!hasAnyField) {
    errors.push('At least one field must be provided');
  }
  if (dto.isActive !== undefined && typeof dto.isActive !== 'boolean') {
    errors.push('isActive must be a boolean value');
  }

  const nextType = dto.type ?? target.type;
  const nextValue = dto.value ?? target.value;
  const switchingToFixed = dto.type === 'FIXED';
  const nextMaxDiscount = switchingToFixed
    ? null
    : dto.maxDiscount !== undefined
      ? dto.maxDiscount
      : target.maxDiscount;

  errors.push(
    ...validatePromotionFields({
      type: nextType,
      value: nextValue,
      maxDiscount: nextMaxDiscount,
      hasExplicitMaxDiscount: !switchingToFixed && dto.maxDiscount !== undefined,
    })
  );

  if (errors.length > 0) {
    throw new ApiHttpError({
      statusCode: 400,
      message: errors,
      error: 'Bad Request',
    });
  }

  target.type = nextType;
  target.value = nextValue;
  target.maxDiscount = nextType === 'FIXED' ? null : (nextMaxDiscount ?? null);
  if (dto.isActive !== undefined) {
    target.isActive = dto.isActive;
  }

  return { ...target };
}
