'use client';

import { cn } from '@/lib/utils';

export interface FilterChipOption {
    value: string;
    label: string;
    count?: number;
    icon?: React.ReactNode;
}

interface FilterChipsProps {
    label?: string;
    value: string;
    onChange: (next: string) => void;
    options: FilterChipOption[];
    className?: string;
}

// BigSeller-style horizontal chip filter row with a label column and counts in parens.
export function FilterChips({ label, value, onChange, options, className }: FilterChipsProps) {
    return (
        <div className={cn('flex items-start gap-4 py-2', className)}>
            {label && (
                <div className="shrink-0 pt-1.5 w-24 text-sm text-slate-500">{label}</div>
            )}
            <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                {options.map(opt => {
                    const isActive = value === opt.value;
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => onChange(opt.value)}
                            className={cn(
                                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                                isActive
                                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                    : 'bg-transparent text-slate-600 border border-transparent hover:bg-slate-100'
                            )}
                        >
                            {opt.icon}
                            <span>{opt.label}</span>
                            {typeof opt.count === 'number' && (
                                <span className={cn(
                                    'text-[11px]',
                                    isActive ? 'text-indigo-500' : 'text-slate-400'
                                )}>
                                    ({opt.count})
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
