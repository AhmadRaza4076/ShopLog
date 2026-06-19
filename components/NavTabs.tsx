'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/sales', label: 'Sales' },
  { href: '/entry', label: 'Add entry' },
  { href: '/khaataa', label: 'Credit' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/history', label: 'History' },
];

export function NavTabs() {
  const pathname = usePathname();

  return (
    <>
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`nav-tab ${pathname === tab.href ? 'active' : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </>
  );
}
