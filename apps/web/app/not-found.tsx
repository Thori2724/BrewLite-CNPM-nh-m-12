import Link from 'next/link';
import { CoffeeIcon } from './components/Icons';

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto my-8 sm:my-16 bg-cream border border-tan/60 rounded-card p-8 sm:p-12 text-center shadow-soft">
      <div className="mx-auto grid size-20 place-items-center rounded-full bg-tan/45 text-kombu mb-6">
        <CoffeeIcon className="size-10" />
      </div>
      <p className="font-display text-5xl sm:text-6xl font-bold text-kombu tracking-tight">
        404
      </p>
      <h1 className="mt-4 font-display text-xl sm:text-2xl font-bold text-noir">
        Không tìm thấy trang bạn cần
      </h1>
      <p className="mt-3 text-sm text-noir/65 max-w-md mx-auto leading-relaxed">
        Địa chỉ trang bạn đang tìm kiếm không tồn tại, đã bị đổi tên hoặc tạm thời không khả dụng.
      </p>
      <div className="mt-8 flex justify-center">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center px-6 py-2.5 bg-kombu hover:bg-noir text-bone font-semibold rounded-control text-sm transition shadow-soft"
        >
          Về thực đơn
        </Link>
      </div>
    </div>
  );
}

