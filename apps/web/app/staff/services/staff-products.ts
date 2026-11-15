import {
  CATEGORY_LABELS,
  CreateProductDto,
  createProductApi,
  getManageProductsApi,
  ProductCategory,
  ProductManage,
  UpdateProductDto,
  updateProductApi,
  updateProductAvailabilityApi,
} from '../../../services/api';
import { AUTH_ERROR_MESSAGES } from '../../../services/auth-contract';
import { isAccountLockedError } from '../../../utils/auth';
import { FieldValidationResult, formatVnd } from '../../../utils/validation';
import {
  createMockStaffProduct,
  getMockStaffProducts,
  isStaffProductsMockEnabled,
  updateMockStaffProduct,
  updateMockStaffProductAvailability,
  updateMockStaffProductVisibility,
} from '../mocks/staff-products-mock';

export const STAFF_PRODUCT_ERROR_MESSAGES = {
  NETWORK_ERROR: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền và thử lại.',
  UNKNOWN_ERROR: 'Đã có lỗi xảy ra khi xử lý thông tin món. Vui lòng thử lại.',
  NOT_FOUND: 'Không tìm thấy sản phẩm',
  SERVER_ERROR: 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.',
} as const;

export const PRODUCT_NAME_MIN_LENGTH = 1;
export const PRODUCT_NAME_MAX_LENGTH = 100;
export const PRODUCT_BASE_PRICE_MIN = 1000;
export const PRODUCT_BASE_PRICE_MAX = 1000000;
export const PRODUCT_IMAGE_URL_MAX_LENGTH = 500;

export const STAFF_PRODUCT_CATEGORY_OPTIONS: {
  value: ProductCategory;
  label: string;
}[] = [
  { value: 'TEA', label: CATEGORY_LABELS.TEA },
  { value: 'COFFEE', label: CATEGORY_LABELS.COFFEE },
  { value: 'MILK_TEA', label: CATEGORY_LABELS.MILK_TEA },
  { value: 'CAKE', label: CATEGORY_LABELS.CAKE },
];

export interface ProductFormValues {
  name: string;
  category: ProductCategory | '';
  basePrice: string;
  imageUrl: string;
}

export interface ProductFormFieldErrors {
  name?: string;
  category?: string;
  basePrice?: string;
  imageUrl?: string;
}

export const STAFF_PRODUCT_FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='10' fill='%23E5D7C4'/%3E%3Cpath d='M28 40h32v20a14 14 0 0 1-14 14h-4a14 14 0 0 1-14-14V40zm32 5h6a7 7 0 0 1 0 14h-6' fill='none' stroke='%23354024' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

export function formatStaffProductVnd(amount: number): string {
  return formatVnd(amount);
}

/**
 * Lấy danh sách toàn bộ món từ GET /products/manage (bao gồm cả món ẩn).
 */
export async function fetchStaffProducts(forceMock = false): Promise<ProductManage[]> {
  if (forceMock || isStaffProductsMockEnabled()) {
    return getMockStaffProducts();
  }

  return getManageProductsApi();
}

/**
 * Gạt trạng thái Đang bán / Tạm hết qua PATCH /products/:id/availability.
 * Chỉ gửi duy nhất trường `isAvailable`.
 */
export async function updateStaffProductAvailability(
  productId: string,
  isAvailable: boolean,
  forceMock = false
): Promise<ProductManage> {
  if (forceMock || isStaffProductsMockEnabled()) {
    return updateMockStaffProductAvailability(productId, isAvailable);
  }

  return updateProductAvailabilityApi(productId, { isAvailable });
}

/**
 * Ẩn hoặc hiện món qua PATCH /products/:id.
 * Chỉ gửi duy nhất trường `isVisible`.
 */
export async function updateStaffProductVisibility(
  productId: string,
  isVisible: boolean,
  forceMock = false
): Promise<ProductManage> {
  if (forceMock || isStaffProductsMockEnabled()) {
    return updateMockStaffProductVisibility(productId, isVisible);
  }

  return updateProductApi(productId, { isVisible });
}

export function validateProductName(name: string): FieldValidationResult {
  const trimmed = (name ?? '').trim();
  if (trimmed.length < PRODUCT_NAME_MIN_LENGTH) {
    return {
      isValid: false,
      error: 'Vui lòng nhập tên món (từ 1 đến 100 ký tự).',
    };
  }
  if (trimmed.length > PRODUCT_NAME_MAX_LENGTH) {
    return {
      isValid: false,
      error: `Tên món không được vượt quá ${PRODUCT_NAME_MAX_LENGTH} ký tự.`,
    };
  }
  return { isValid: true };
}

export function validateProductCategory(category: string): FieldValidationResult {
  if (
    category !== 'TEA' &&
    category !== 'COFFEE' &&
    category !== 'MILK_TEA' &&
    category !== 'CAKE'
  ) {
    return {
      isValid: false,
      error: 'Vui lòng chọn một danh mục hợp lệ (Trà, Cà phê, Trà sữa hoặc Bánh).',
    };
  }
  return { isValid: true };
}

export function validateProductBasePrice(basePrice: string | number): FieldValidationResult {
  if (typeof basePrice === 'number') {
    if (
      !Number.isInteger(basePrice) ||
      basePrice < PRODUCT_BASE_PRICE_MIN ||
      basePrice > PRODUCT_BASE_PRICE_MAX
    ) {
      return {
        isValid: false,
        error: 'Giá gốc phải là số nguyên từ 1.000 đến 1.000.000đ.',
      };
    }
    return { isValid: true };
  }

  const trimmed = (basePrice ?? '').trim();
  if (!trimmed) {
    return {
      isValid: false,
      error: 'Vui lòng nhập giá gốc (từ 1.000 đến 1.000.000đ).',
    };
  }
  if (!/^-?\d+$/.test(trimmed)) {
    return {
      isValid: false,
      error: 'Giá gốc phải là số nguyên hợp lệ từ 1.000 đến 1.000.000đ (chỉ nhập chữ số).',
    };
  }

  const numericValue = Number(trimmed);
  if (
    !Number.isSafeInteger(numericValue) ||
    numericValue < PRODUCT_BASE_PRICE_MIN ||
    numericValue > PRODUCT_BASE_PRICE_MAX
  ) {
    return {
      isValid: false,
      error: 'Giá gốc phải là số nguyên từ 1.000 đến 1.000.000đ.',
    };
  }

  return { isValid: true };
}

export function validateProductImageUrl(imageUrl: string): FieldValidationResult {
  const trimmed = (imageUrl ?? '').trim();
  if (!trimmed) {
    return { isValid: true };
  }
  if (/\s/.test(trimmed)) {
    return {
      isValid: false,
      error: 'Link ảnh không được chứa khoảng trắng.',
    };
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return {
      isValid: false,
      error: 'Link ảnh phải bắt đầu bằng http:// hoặc https://.',
    };
  }
  if (trimmed.length > PRODUCT_IMAGE_URL_MAX_LENGTH) {
    return {
      isValid: false,
      error: `Link ảnh không được vượt quá ${PRODUCT_IMAGE_URL_MAX_LENGTH} ký tự.`,
    };
  }
  return { isValid: true };
}

export function isValidPreviewImageUrl(imageUrl: string): boolean {
  const trimmed = (imageUrl ?? '').trim();
  return Boolean(trimmed && !/\s/.test(trimmed) && /^https?:\/\//i.test(trimmed));
}

export function validateProductForm(values: ProductFormValues): {
  isValid: boolean;
  errors: ProductFormFieldErrors;
} {
  const errors: ProductFormFieldErrors = {};

  const nameCheck = validateProductName(values.name);
  if (!nameCheck.isValid) errors.name = nameCheck.error;

  const categoryCheck = validateProductCategory(values.category);
  if (!categoryCheck.isValid) errors.category = categoryCheck.error;

  const priceCheck = validateProductBasePrice(values.basePrice);
  if (!priceCheck.isValid) errors.basePrice = priceCheck.error;

  const imageCheck = validateProductImageUrl(values.imageUrl);
  if (!imageCheck.isValid) errors.imageUrl = imageCheck.error;

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function buildCreateProductPayload(values: ProductFormValues): CreateProductDto {
  const trimmedImage = values.imageUrl.trim();
  const payload: CreateProductDto = {
    name: values.name.trim(),
    category: values.category as ProductCategory,
    basePrice: Number(values.basePrice.trim()),
  };
  if (trimmedImage) {
    payload.imageUrl = trimmedImage;
  }
  return payload;
}

export function buildUpdateProductPayload(
  values: ProductFormValues,
  initialProduct: ProductManage
): UpdateProductDto {
  const trimmedImage = values.imageUrl.trim();
  const payload: UpdateProductDto = {
    name: values.name.trim(),
    category: values.category as ProductCategory,
    basePrice: Number(values.basePrice.trim()),
  };
  if (trimmedImage) {
    payload.imageUrl = trimmedImage;
  } else if (initialProduct.imageUrl && initialProduct.imageUrl.trim()) {
    payload.imageUrl = '';
  }
  return payload;
}

/**
 * Thêm món mới (ADMIN) qua POST /products.
 * Tuyệt đối không gửi stock hay id.
 */
export async function createStaffProduct(
  dto: CreateProductDto,
  forceMock = false
): Promise<ProductManage> {
  const sanitizedDto: CreateProductDto = {
    name: dto.name,
    category: dto.category,
    basePrice: dto.basePrice,
    ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
  };

  if (forceMock || isStaffProductsMockEnabled()) {
    return createMockStaffProduct(sanitizedDto);
  }

  return createProductApi(sanitizedDto);
}

/**
 * Sửa thông tin món (ADMIN) qua PATCH /products/:id.
 * Tuyệt đối không gửi stock hay id.
 */
export async function updateStaffProduct(
  productId: string,
  dto: UpdateProductDto,
  forceMock = false
): Promise<ProductManage> {
  const sanitizedDto: UpdateProductDto = {
    ...(dto.name !== undefined ? { name: dto.name } : {}),
    ...(dto.category !== undefined ? { category: dto.category } : {}),
    ...(dto.basePrice !== undefined ? { basePrice: dto.basePrice } : {}),
    ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
    ...(dto.isVisible !== undefined ? { isVisible: dto.isVisible } : {}),
  };

  if (forceMock || isStaffProductsMockEnabled()) {
    return updateMockStaffProduct(productId, sanitizedDto);
  }

  return updateProductApi(productId, sanitizedDto);
}

export interface ParsedStaffProductError {
  statusCode: number;
  message: string;
  isUnauthorized: boolean;
  isAccountLocked: boolean;
  isNotFound: boolean;
}

export function parseStaffProductError(err: unknown): ParsedStaffProductError {
  let statusCode = 0;
  let message = '';

  if (err && typeof err === 'object') {
    const candidate = err as {
      statusCode?: unknown;
      message?: unknown;
    };

    if (typeof candidate.statusCode === 'number') {
      statusCode = candidate.statusCode;
    }

    if (typeof candidate.message === 'string' && candidate.message.trim()) {
      message = candidate.message.trim();
    } else if (Array.isArray(candidate.message)) {
      const joined = candidate.message
        .map((item) => String(item).trim())
        .filter(Boolean)
        .join(', ');
      if (statusCode === 400) {
        message = AUTH_ERROR_MESSAGES.VALIDATION_ERROR;
      } else {
        message = joined;
      }
    }
  }

  const isAccountLocked = isAccountLockedError(err);
  const isUnauthorized = statusCode === 401;
  const isNotFound = statusCode === 404;

  if (isAccountLocked) {
    message = AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED;
  } else if (isUnauthorized && !message) {
    message = AUTH_ERROR_MESSAGES.SESSION_EXPIRED;
  } else if (statusCode === 403 && !message) {
    message = AUTH_ERROR_MESSAGES.FORBIDDEN;
  } else if (statusCode === 0 && !message) {
    message = STAFF_PRODUCT_ERROR_MESSAGES.NETWORK_ERROR;
  } else if (!message) {
    message = STAFF_PRODUCT_ERROR_MESSAGES.UNKNOWN_ERROR;
  }

  return {
    statusCode,
    message,
    isUnauthorized,
    isAccountLocked,
    isNotFound,
  };
}

export interface ParsedStaffProductFormError extends ParsedStaffProductError {
  fieldErrors: ProductFormFieldErrors;
}

function isRawEnglishHttpText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return (
    /^(bad request|unauthorized|forbidden|not found|internal server error|conflict|failed to fetch|load failed)$/i.test(
      trimmed
    ) || /\b(must be|must not be|should not be empty|at least one field)\b/i.test(trimmed)
  );
}

function mapProductValidationMessagesToFields(
  messages: string[]
): ProductFormFieldErrors {
  const fieldErrors: ProductFormFieldErrors = {};

  for (const rawMsg of messages) {
    const lower = rawMsg.toLowerCase();
    if (lower.includes('imageurl') || lower.includes('http://') || lower.includes('https://')) {
      fieldErrors.imageUrl =
        'Link ảnh phải bắt đầu bằng http:// hoặc https:// và tối đa 500 ký tự.';
    } else if (lower.includes('baseprice') || lower.includes('price')) {
      fieldErrors.basePrice = 'Giá gốc phải là số nguyên từ 1.000 đến 1.000.000đ.';
    } else if (lower.includes('category')) {
      fieldErrors.category =
        'Vui lòng chọn một danh mục hợp lệ (Trà, Cà phê, Trà sữa hoặc Bánh).';
    } else if (lower.includes('name')) {
      fieldErrors.name = 'Tên món phải từ 1 đến 100 ký tự.';
    }
  }

  return fieldErrors;
}

export function parseStaffProductFormError(err: unknown): ParsedStaffProductFormError {
  const base = parseStaffProductError(err);
  let fieldErrors: ProductFormFieldErrors = {};
  let rawMessage: unknown;

  if (err && typeof err === 'object') {
    const candidate = err as { message?: unknown };
    rawMessage = candidate.message;
  }

  if (base.statusCode === 400) {
    if (Array.isArray(rawMessage)) {
      const stringMessages = rawMessage.filter((item): item is string => typeof item === 'string');
      fieldErrors = mapProductValidationMessagesToFields(stringMessages);
      return {
        ...base,
        message: AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
        fieldErrors,
      };
    }

    if (typeof rawMessage === 'string' && rawMessage.trim()) {
      if (isRawEnglishHttpText(rawMessage)) {
        fieldErrors = mapProductValidationMessagesToFields([rawMessage]);
        return {
          ...base,
          message: AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
          fieldErrors,
        };
      }
      return {
        ...base,
        message: rawMessage.trim(),
        fieldErrors,
      };
    }

    return {
      ...base,
      message: AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
      fieldErrors,
    };
  }

  if (base.isAccountLocked) {
    return {
      ...base,
      message: AUTH_ERROR_MESSAGES.ACCOUNT_LOCKED,
      fieldErrors,
    };
  }

  if (base.isUnauthorized) {
    return {
      ...base,
      message: AUTH_ERROR_MESSAGES.SESSION_EXPIRED,
      fieldErrors,
    };
  }

  if (base.statusCode === 403) {
    const message = isRawEnglishHttpText(base.message)
      ? AUTH_ERROR_MESSAGES.FORBIDDEN
      : base.message;
    return { ...base, message, fieldErrors };
  }

  if (base.statusCode === 404) {
    const message = isRawEnglishHttpText(base.message)
      ? STAFF_PRODUCT_ERROR_MESSAGES.NOT_FOUND
      : base.message;
    return { ...base, message, fieldErrors };
  }

  if (base.statusCode >= 500) {
    return {
      ...base,
      message: STAFF_PRODUCT_ERROR_MESSAGES.SERVER_ERROR,
      fieldErrors,
    };
  }

  if (base.statusCode === 0) {
    return {
      ...base,
      message: STAFF_PRODUCT_ERROR_MESSAGES.NETWORK_ERROR,
      fieldErrors,
    };
  }

  if (isRawEnglishHttpText(base.message)) {
    return {
      ...base,
      message: STAFF_PRODUCT_ERROR_MESSAGES.UNKNOWN_ERROR,
      fieldErrors,
    };
  }

  return { ...base, fieldErrors };
}

