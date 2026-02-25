import { useEffect, useState } from 'react'
import './LoadingLogo.css'

export type LoadingLogoTheme = 'light' | 'dark'
export type LoadingLogoVariant = 'smooth' | 'jump'

type Step = { S: [number, number]; B: [number, number]; G: [number, number]; R: [number, number] }

/** Smooth variant: S cycles perimeter 3 times. */
const SMOOTH_STEPS: Step[] = [
  { S: [0, 0], B: [16, 0], G: [0, 16], R: [16, 16] },
  { G: [0, 0], B: [16, 0], S: [0, 16], R: [16, 16] },
  { G: [0, 0], B: [16, 0], R: [0, 16], S: [16, 16] },
  { G: [0, 0], S: [16, 0], R: [0, 16], B: [16, 16] },
  { S: [0, 0], G: [16, 0], R: [0, 16], B: [16, 16] },
  { R: [0, 0], G: [16, 0], S: [0, 16], B: [16, 16] },
  { R: [0, 0], G: [16, 0], B: [0, 16], S: [16, 16] },
  { R: [0, 0], S: [16, 0], B: [0, 16], G: [16, 16] },
  { S: [0, 0], R: [16, 0], B: [0, 16], G: [16, 16] },
  { B: [0, 0], R: [16, 0], S: [0, 16], G: [16, 16] },
  { B: [0, 0], R: [16, 0], G: [0, 16], S: [16, 16] },
  { B: [0, 0], S: [16, 0], G: [0, 16], R: [16, 16] },
]

/** Jump variant: angular step cycle. */
const JUMP_STEPS: Step[] = [
  { S: [0, 0], B: [16, 0], G: [0, 16], R: [16, 16] },
  { G: [0, 0], B: [16, 0], S: [0, 16], R: [16, 16] },
  { G: [0, 0], B: [16, 0], R: [0, 16], S: [16, 16] },
  { G: [0, 0], S: [16, 0], R: [0, 16], B: [16, 16] },
  { S: [0, 0], G: [16, 0], R: [0, 16], B: [16, 16] },
]

const STEPS: Record<LoadingLogoVariant, Step[]> = { smooth: SMOOTH_STEPS, jump: JUMP_STEPS }

export interface LoadingLogoProps {
  theme: LoadingLogoTheme
  size?: number
  variant?: LoadingLogoVariant
  intervalMs?: number
}

export function LoadingLogo({ theme, size = 64, variant = 'smooth', intervalMs = 400 }: LoadingLogoProps) {
  const steps = STEPS[variant]
  const [step, setStep] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => (s + 1) % steps.length)
    }, intervalMs)
    return () => clearInterval(id)
  }, [steps.length, intervalMs])
  const pos = steps[step]
  const blue = '#6c8ebf'
  const green = '#82b366'
  const red = theme === 'dark' ? '#ff8888' : '#a94442'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className="loading-logo"
      aria-hidden
      role="img"
      aria-label="Загрузка"
    >
      <rect x={pos.S[0]} y={pos.S[1]} width={16} height={16} fill="transparent" className="loading-logo-tile" />
      <rect x={pos.B[0]} y={pos.B[1]} width={16} height={16} fill={blue} className="loading-logo-tile" />
      <rect x={pos.G[0]} y={pos.G[1]} width={16} height={16} fill={green} className="loading-logo-tile" />
      <rect x={pos.R[0]} y={pos.R[1]} width={16} height={16} fill={red} className="loading-logo-tile" />
    </svg>
  )
}
