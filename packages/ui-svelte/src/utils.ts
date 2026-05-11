import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type WithoutChildren<T> = Omit<T, 'children'>
export type WithoutChild<T> = Omit<T, 'child'>
export type WithoutChildrenOrChild<T> = WithoutChild<WithoutChildren<T>>
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null }
