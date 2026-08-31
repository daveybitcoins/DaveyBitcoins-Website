"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

const navigationItems = [
  { href: "/risk-metric/", label: "BTC Risk" },
  { href: "/spy-risk-metric/", label: "SPY Risk" },
  { href: "/ema-scanner/", label: "EMA Scanner" },
  { href: "/dividend-tracker/", label: "Dividend Tracker" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="brand-lockup" aria-label="DaveyBitcoins home">
          <Image
            src="/brand.jpg"
            alt=""
            width={48}
            height={48}
            className="brand-lockup__image"
            priority
          />
          <span className="brand-lockup__copy">
            <span className="brand-lockup__name">
              Davey<strong>Bitcoins</strong>
            </span>
            <span className="brand-lockup__tagline">Always be building</span>
          </span>
        </Link>

        <nav className="site-nav" aria-label="Main navigation">
          {navigationItems.map((item) => {
            const isActive =
              pathname === item.href ||
              pathname === item.href.replace(/\/$/, "");

            return (
              <a
                key={item.href}
                href={item.href}
                className={isActive ? "site-nav__link--active" : undefined}
                aria-current={isActive ? "page" : undefined}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        <ThemeToggle />
      </div>
    </header>
  );
}
