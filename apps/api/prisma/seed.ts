import { PrismaClient, Category, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_USER_ID = '44444444-0000-0000-0000-000000000001';
const DEMO_USER_EMAIL = 'khach@example.com';
const DEMO_USER_DISPLAY_NAME = 'Khách demo';
const BCRYPT_SALT_ROUNDS = 10;

const products = [
  // COFFEE
  {
    id: '11111111-0000-0000-0000-000000000001',
    name: 'Cà phê sữa đá',
    category: Category.COFFEE,
    basePrice: 29000,
    imageUrl: 'https://images.unsplash.com/photo-1642647392045-8592bf9b5900?w=500',
    stock: 50,
    isVisible: true,
  },
  {
    id: '11111111-0000-0000-0000-000000000002',
    name: 'Cà phê đen đá',
    category: Category.COFFEE,
    basePrice: 25000,
    imageUrl: 'https://images.unsplash.com/photo-1726514728643-967afb30467a?w=500',
    stock: 40,
    isVisible: true,
  },
  {
    id: '11111111-0000-0000-0000-000000000003',
    name: 'Bạc xỉu',
    category: Category.COFFEE,
    basePrice: 32000,
    imageUrl: 'https://images.unsplash.com/photo-1728978095941-ac7dea0cebdf?w=500',
    stock: 0, // Hết hàng
    isVisible: true,
  },
  // TEA
  {
    id: '11111111-0000-0000-0000-000000000004',
    name: 'Trà đào cam sả',
    category: Category.TEA,
    basePrice: 39000,
    imageUrl: 'https://images.unsplash.com/photo-1709003995898-ca69b07a8ef3?w=500',
    stock: 35,
    isVisible: true,
  },
  {
    id: '11111111-0000-0000-0000-000000000005',
    name: 'Trà atiso đỏ',
    category: Category.TEA,
    basePrice: 42000,
    imageUrl: 'https://images.unsplash.com/photo-1654922704274-cd34f165c5e7?w=500',
    stock: 25,
    isVisible: true,
  },
  {
    id: '11111111-0000-0000-0000-000000000006',
    name: 'Trà chanh mật ong',
    category: Category.TEA,
    basePrice: 45000,
    imageUrl: 'https://images.unsplash.com/photo-1712056407267-1a38c7024a8f?w=500',
    stock: 30,
    isVisible: true,
  },
  // MILK_TEA
  {
    id: '11111111-0000-0000-0000-000000000007',
    name: 'Trà sữa truyền thống',
    category: Category.MILK_TEA,
    basePrice: 35000,
    imageUrl: 'https://images.unsplash.com/photo-1745883949374-baeba0ed57c3?w=500',
    stock: 60,
    isVisible: true,
  },
  {
    id: '11111111-0000-0000-0000-000000000008',
    name: 'Trà sữa dâu tây',
    category: Category.MILK_TEA,
    basePrice: 42000,
    imageUrl: 'https://images.unsplash.com/photo-1611928237590-087afc90c6fd?w=500',
    stock: 45,
    isVisible: true,
  },
  {
    id: '11111111-0000-0000-0000-000000000009',
    name: 'Trà sữa matcha',
    category: Category.MILK_TEA,
    basePrice: 45000,
    imageUrl: 'https://images.unsplash.com/photo-1611497426695-412abe2f287b?w=500',
    stock: 0, // Hết hàng
    isVisible: true,
  },
  // CAKE
  {
    id: '11111111-0000-0000-0000-000000000010',
    name: 'Bánh Croissant',
    category: Category.CAKE,
    basePrice: 30000,
    imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500',
    stock: 20,
    isVisible: true,
  },
  {
    id: '11111111-0000-0000-0000-000000000011',
    name: 'Bánh Tiramisu',
    category: Category.CAKE,
    basePrice: 45000,
    imageUrl: 'https://images.unsplash.com/photo-1639744211487-b27e3551b07c?w=500',
    stock: 15,
    isVisible: true,
  },
  {
    id: '11111111-0000-0000-0000-000000000012',
    name: 'Bánh Mousse chanh dây',
    category: Category.CAKE,
    basePrice: 38000,
    imageUrl: 'https://images.unsplash.com/photo-1577963451552-9a14e445e050?w=500',
    stock: 18,
    isVisible: true,
  },
];

const toppings = [
  {
    id: '22222222-0000-0000-0000-000000000001',
    name: 'Trân châu đen',
    price: 5000,
    isVisible: true,
  },
  {
    id: '22222222-0000-0000-0000-000000000002',
    name: 'Thạch dừa',
    price: 5000,
    isVisible: true,
  },
  {
    id: '22222222-0000-0000-0000-000000000003',
    name: 'Pudding',
    price: 7000,
    isVisible: true,
  },
  {
    id: '22222222-0000-0000-0000-000000000004',
    name: 'Kem cheese',
    price: 10000,
    isVisible: true,
  },
];

async function main() {
  console.log('Đang khởi tạo dữ liệu mẫu cho menu (seed)...');
  for (const product of products) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: product,
      create: product,
    });
  }
  console.log(`Đã nạp thành công ${products.length} sản phẩm vào bảng Product.`);

  for (const topping of toppings) {
    await prisma.topping.upsert({
      where: { id: topping.id },
      update: {
        name: topping.name,
        price: topping.price,
        isVisible: topping.isVisible,
      },
      create: topping,
    });
  }
  console.log(`Đã nạp thành công ${toppings.length} topping vào bảng Topping.`);

  const demoPassword = process.env.DEMO_USER_PASSWORD;
  if (!demoPassword || demoPassword.length < 6) {
    console.log(
      'Bỏ qua tạo tài khoản demo: biến môi trường DEMO_USER_PASSWORD chưa được đặt hoặc ngắn hơn 6 ký tự.',
    );
  } else {
    const passwordHash = await bcrypt.hash(demoPassword, BCRYPT_SALT_ROUNDS);
    await prisma.user.upsert({
      where: { id: DEMO_USER_ID },
      update: {
        displayName: DEMO_USER_DISPLAY_NAME,
        role: Role.CUSTOMER,
        passwordHash,
      },
      create: {
        id: DEMO_USER_ID,
        email: DEMO_USER_EMAIL,
        displayName: DEMO_USER_DISPLAY_NAME,
        role: Role.CUSTOMER,
        passwordHash,
      },
    });
    console.log(
      `Đã nạp thành công tài khoản demo (${DEMO_USER_EMAIL}) vào bảng User.`,
    );
  }
}

main()
  .catch((e) => {
    console.error('Lỗi khi chạy seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

