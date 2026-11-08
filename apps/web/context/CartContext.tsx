'use client';

import React, { createContext, useContext, useEffect, useReducer, useState } from 'react';
import {
  CartItem,
  addItemToCart,
  updateItemQuantity,
  removeItemFromCart,
  clearCart,
  calculateCartTotal,
  calculateCartItemCount,
  loadCartFromStorage,
  saveCartToStorage,
  CART_STORAGE_KEY,
} from '../utils/cart';

type CartAction =
  | { type: 'INIT'; payload: CartItem[] }
  | { type: 'SET_ITEMS'; payload: CartItem[] };

function cartReducer(state: CartItem[], action: CartAction): CartItem[] {
  let newState: CartItem[];
  switch (action.type) {
    case 'INIT':
      return action.payload;
    case 'SET_ITEMS':
      newState = action.payload;
      break;
    default:
      return state;
  }
  saveCartToStorage(newState);
  return newState;
}

interface CartContextValue {
  items: CartItem[];
  totalAmount: number;
  totalCount: number;
  isHydrated: boolean;
  storageError: boolean;
  addToCart: (item: Omit<CartItem, 'id'> & { id?: string }) => { ok: boolean; error?: string };
  updateQuantity: (id: string, quantity: number) => void;
  removeFromCart: (id: string) => void;
  clearAll: () => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, dispatch] = useReducer(cartReducer, []);
  const [isHydrated, setIsHydrated] = useState(false);
  const [storageError, setStorageError] = useState(false);

  // 1. Chỉ nạp từ localStorage sau khi component mount trên client (tránh lỗi hydration)
  useEffect(() => {
    let isMounted = true;

    Promise.resolve().then(() => {
      if (isMounted) {
        try {
          const saved = loadCartFromStorage();
          dispatch({ type: 'INIT', payload: saved });
        } catch {
          setStorageError(true);
        } finally {
          setIsHydrated(true);
        }
      }
    });

    // 2. Lắng nghe storage event để đồng bộ tức thì giữa các tab với key brewlite_cart_v2
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === CART_STORAGE_KEY && isMounted) {
        try {
          const updated = loadCartFromStorage();
          dispatch({ type: 'INIT', payload: updated });
        } catch {
          setStorageError(true);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      isMounted = false;
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const totalAmount = calculateCartTotal(items);
  const totalCount = calculateCartItemCount(items);

  const addToCart = (
    item: Omit<CartItem, 'id'> & { id?: string }
  ): { ok: boolean; error?: string } => {
    const result = addItemToCart(items, item);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    dispatch({ type: 'SET_ITEMS', payload: result.cart });
    return { ok: true };
  };

  const updateQuantity = (id: string, quantity: number) => {
    const newCart = updateItemQuantity(items, id, quantity);
    dispatch({ type: 'SET_ITEMS', payload: newCart });
  };

  const removeFromCart = (id: string) => {
    const newCart = removeItemFromCart(items, id);
    dispatch({ type: 'SET_ITEMS', payload: newCart });
  };

  const clearAll = () => {
    const newCart = clearCart();
    dispatch({ type: 'SET_ITEMS', payload: newCart });
  };

  return (
    <CartContext.Provider
      value={{
        items,
        totalAmount,
        totalCount,
        isHydrated,
        storageError,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearAll,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

const defaultCartContext: CartContextValue = {
  items: [],
  totalAmount: 0,
  totalCount: 0,
  isHydrated: true,
  storageError: false,
  addToCart: () => ({ ok: true }),
  updateQuantity: () => {},
  removeFromCart: () => {},
  clearAll: () => {},
};

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    return defaultCartContext;
  }
  return context;
}
