import { useCallback, useRef } from 'react'

const TRIPLE_CLICK_MS = 500

/**
 * Возвращает обработчик onClick: при тройном клике в течение TRIPLE_CLICK_MS вызывается callback.
 */
export function useTripleClick(callback: () => void): (e: React.MouseEvent) => void {
  const countRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  return useCallback(
    (_e: React.MouseEvent) => {
      countRef.current += 1
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (countRef.current >= 3) {
        countRef.current = 0
        callback()
        return
      }
      timeoutRef.current = setTimeout(() => {
        countRef.current = 0
        timeoutRef.current = null
      }, TRIPLE_CLICK_MS)
    },
    [callback]
  )
}
