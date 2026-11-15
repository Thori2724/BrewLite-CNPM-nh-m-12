import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { CartProvider } from "../context/CartContext";
import { AuthProvider } from "../context/AuthContext";
import CartIcon from "./components/CartIcon";
import AuthNav from "./components/AuthNav";
import Footer from "./components/Footer";
import { CoffeeIcon } from "./components/Icons";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin", "vietnamese"],
  variable: "--font-playfair",
  display: "swap",
});

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
    <html lang="vi" className={`${inter.variable} ${playfair.variable}`}>
      <body className="font-sans bg-bone min-h-screen text-noir antialiased overflow-x-hidden">
        <CartProvider>
          <AuthProvider>
            <div className="min-h-screen flex flex-col">
              {/* Header Top Bar trải toàn chiều rộng */}
              <header className="sticky top-0 z-40 border-b border-moss/35 bg-kombu text-bone shadow-soft">
                <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 lg:px-8">
                  <div className="flex items-center gap-6 sm:gap-8 shrink-0">
                    <Link
                      href="/"
                      className="flex shrink-0 items-center gap-2 rounded-control font-display text-2xl font-bold tracking-tight text-bone outline-none hover:text-tan transition focus-visible:ring-2 focus-visible:ring-moss"
                    >
                      <span className="grid size-9 place-items-center rounded-full bg-bone text-kombu">
                        <CoffeeIcon className="size-5" />
                      </span>
                      BrewLite
                    </Link>
                    <nav
                      className="hidden sm:flex shrink-0 items-center gap-6 text-sm font-semibold"
                      aria-label="Điều hướng chính"
                    >
                      <Link
                        href="/"
                        className="rounded-sm py-2 transition text-bone hover:text-tan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss"
                      >
                        Thực đơn
                      </Link>
                    </nav>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                    <AuthNav />
                    <CartIcon />
                  </div>
                </div>
              </header>

              {/* Nội dung chính màn hình */}
              <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {children}
              </main>

              {/* Chân trang Footer */}
              <Footer />
            </div>
          </AuthProvider>
        </CartProvider>
      </body>
    </html>
  );
}
