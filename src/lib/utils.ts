import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Generate a session code matching ^[A-Z]{2}-[A-Z0-9]{4}$ */
export function generateSessionCode(): string {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const alphaNum = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const rand = (chars: string) => chars[Math.floor(Math.random() * chars.length)]
  const prefix = rand(alpha) + rand(alpha)
  const suffix = Array.from({ length: 4 }, () => rand(alphaNum)).join('')
  return `${prefix}-${suffix}`
}
