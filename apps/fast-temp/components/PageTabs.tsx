'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Tab {
    href: string;
    label: string;
    badge?: number;
}

export function PageTabs({ tabs }: { tabs: Tab[] }) {
    const pathname = usePathname();

    return (
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 mb-5 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-max sm:w-fit">
                {tabs.map(tab => {
                    const isActive = pathname === tab.href;
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            className={`relative px-4 sm:px-5 py-2 text-sm font-semibold rounded-lg transition-all whitespace-nowrap ${
                                isActive
                                    ? 'bg-white shadow-sm text-slate-900'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {tab.label}
                            {tab.badge && tab.badge > 0 ? (
                                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold bg-rose-500 text-white rounded-full">
                                    {tab.badge > 99 ? '99+' : tab.badge}
                                </span>
                            ) : null}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
