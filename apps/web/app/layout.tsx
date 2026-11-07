import type { Metadata } from "next";
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
      <body className="bg-gray-100 min-h-screen text-gray-800 antialiased">
        <CartProvider>
          <AuthProvider>
            {/* Khung giới hạn giao diện chuẩn di động */}
            <div className="max-w-md mx-auto bg-white min-h-screen flex flex-col shadow-xl">
              {/* Header Top Bar */}
              <header className="sticky top-0 z-50 bg-amber-600 text-white px-4 py-3 flex justify-between items-center shadow-md">
                <h1 className="text-xl font-bold tracking-wide">BrewLite ☕</h1>
                <div className="flex items-center gap-3 min-w-0">
                  <AuthNav />
                  <CartIcon />
                </div>
              </header>

              {/* Nội dung chính màn hình */}
              <main className="flex-1 p-4 pb-20">{children}</main>

              {/* Navigation Bar dưới cùng cho di động */}
              <nav className="fixed bottom-0 max-w-md w-full bg-white border-t border-gray-200 flex justify-around py-2 shadow-lg z-50">
                <button className="flex flex-col items-center text-amber-600 font-medium">
                  <span className="text-xl">📜</span>
                  <span className="text-xs">Menu</span>
                </button>
                <button className="flex flex-col items-center text-gray-500">
                  <span className="text-xl">📋</span>
                  <span className="text-xs">Đơn hàng</span>
                </button>
                <button className="flex flex-col items-center text-gray-500">
                  <span className="text-xl">👤</span>
                  <span className="text-xs">Tài khoản</span>
                </button>
              </nav>
            </div>
          </AuthProvider>
        </CartProvider>
      </body>
    </html>
  );
}