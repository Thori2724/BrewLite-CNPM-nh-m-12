import { CoffeeIcon } from './Icons';

export default function Footer() {
  return (
    <footer className="mt-20 bg-kombu text-bone">
      <div className="mx-auto grid max-w-6xl grid-cols-1 md:grid-cols-12 gap-8 px-4 sm:px-6 lg:px-8 py-10">
        <div className="md:col-span-5">
          <div className="flex items-center gap-2 font-display text-2xl font-bold">
            <span className="grid size-8 place-items-center rounded-full bg-bone text-kombu">
              <CoffeeIcon className="size-4" />
            </span>
            BrewLite
          </div>
          <p className="mt-3 max-w-sm text-sm leading-6 text-bone/75">
            Một khoảng dừng nhẹ nhàng, nơi cà phê được pha chỉn chu cho nhịp
            sống mỗi ngày.
          </p>
        </div>
        <div className="md:col-span-3">
          <p className="font-bold text-bone">Giờ mở cửa</p>
          <p className="mt-3 text-sm text-bone/75">Thứ Hai – Chủ Nhật</p>
          <p className="mt-1 text-sm text-bone/75">07:00 – 22:00</p>
        </div>
        <div className="md:col-span-4">
          <p className="font-bold text-bone">Ghé BrewLite</p>
          <p className="mt-3 text-sm text-bone/75">
            28 Nguyễn Thiệp, Quận 1, TP. Hồ Chí Minh
          </p>
          <p className="mt-1 text-sm text-bone/75">
            028 3822 2025 · hello@brewlite.vn
          </p>
        </div>
      </div>
      <div className="border-t border-bone/15 py-4 text-center text-xs text-bone/60">
        © 2025 BrewLite. Pha từ sự tử tế.
      </div>
    </footer>
  );
}

