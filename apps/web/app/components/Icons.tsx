import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const CoffeeIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M5 8h11v7a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V8Z" />
    <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 4c1 1 1 2 0 3m4-3c1 1 1 2 0 3" />
  </svg>
);

export const CartIconSvg = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L20 8H6" />
    <circle cx="10" cy="20" r="1" />
    <circle cx="18" cy="20" r="1" />
  </svg>
);

export const UserIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.8 21a7.2 7.2 0 0 1 14.4 0" />
  </svg>
);

export const SearchIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </svg>
);
