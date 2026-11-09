import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { CartProvider } from "../context/CartContext";
import { AuthProvider } from "../context/AuthContext";
import CartIcon from "./components/CartIcon";
import AuthNav from "./components/AuthNav";

export const metadata: Metadata = {
  title: "BrewLite - Đặt món tại quầy & Mang đi",
  description: "Ứng dụng đặt món trà & cà phê BrewLite",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="bg-gray-50 min-h-screen text-gray-800 antialiased overflow-x-hidden">
        <CartProvider>
          <AuthProvider>
            <div className="min-h-screen flex flex-col">
              {/* Header Top Bar trải toàn chiều rộng */}
              <header className="sticky top-0 z-50 w-full bg-amber-600 text-white shadow-md">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center gap-3">
                  <div className="flex items-center gap-6 shrink-0">
                    <Link
                      href="/"
                      className="text-xl font-bold tracking-wide hover:opacity-90 transition"
                    >
                      BrewLite ☕
                    </Link>
                    <nav className="hidden sm:flex items-center gap-4">
                      <Link
                        href="/"
                        className="text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-white/15 transition"
                      >
                        Menu
                      </Link>
                      {/* TODO: Task 18 sẽ thêm liên kết "Đơn hàng" vào header */}
                    </nav>
                  </div>

                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <AuthNav />
                    <CartIcon />
                  </div>
                </div>
              </header>

              {/* Nội dung chính màn hình */}
              <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {children}
              </main>
            </div>
          </AuthProvider>
        </CartProvider>
      </body>
    </html>
  );
}