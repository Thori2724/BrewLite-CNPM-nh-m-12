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
  | { type: 'ADD_ITEM'; payload: Omit<CartItem, 'id'> & { id?: string } }
  | { type: 'UPDATE_QUANTITY'; payload: { id: string; quantity: number } }
  | { type: 'REMOVE_ITEM'; payload: { id: string } }
  | { type: 'CLEAR_CART' };

function cartReducer(state: CartItem[], action: CartAction): CartItem[] {
  let newState: CartItem[];
  switch (action.type) {
    case 'INIT':
      return action.payload;
    case 'ADD_ITEM':
      newState = addItemToCart(state, action.payload);
      break;
    case 'UPDATE_QUANTITY':
      newState = updateItemQuantity(state, action.payload.id, action.payload.quantity);
      break;
    case 'REMOVE_ITEM':
      newState = removeItemFromCart(state, action.payload.id);
      break;
    case 'CLEAR_CART':
      newState = clearCart();
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
  addToCart: (item: Omit<CartItem, 'id'> & { id?: string }) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeFromCart: (id: string) => void;
  clearAll: () => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, dispatch] = useReducer(cartReducer, []);
  const [isHydrated, setIsHydrated] = useState(false);

  // 1. Chỉ nạp từ localStorage sau khi component mount trên client (tránh lỗi hydration)
  useEffect(() => {
    let isMounted = true;

    Promise.resolve().then(() => {
      if (isMounted) {
        const saved = loadCartFromStorage();
        dispatch({ type: 'INIT', payload: saved });
        setIsHydrated(true);
      }
    });

    // 2. Lắng nghe storage event để đồng bộ tức thì giữa các tab
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === CART_STORAGE_KEY && isMounted) {
        const updated = loadCartFromStorage();
        dispatch({ type: 'INIT', payload: updated });
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

  const addToCart = (item: Omit<CartItem, 'id'> & { id?: string }) => {
    dispatch({ type: 'ADD_ITEM', payload: item });
  };

  const updateQuantity = (id: string, quantity: number) => {
    dispatch({ type: 'UPDATE_QUANTITY', payload: { id, quantity } });
  };

  const removeFromCart = (id: string) => {
    dispatch({ type: 'REMOVE_ITEM', payload: { id } });
  };

  const clearAll = () => {
    dispatch({ type: 'CLEAR_CART' });
  };

  return (
    <CartContext.Provider
      value={{
        items,
        totalAmount,
        totalCount,
        isHydrated,
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
  addToCart: () => {},
  updateQuantity: () => {},
  removeFromCart: () => {},
  clearAll: () => {},
};

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    return defaultCartContext;
  }
  return context;
}
