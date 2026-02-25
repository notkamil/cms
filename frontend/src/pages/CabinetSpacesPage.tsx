import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { get } from '../api/client'
import { LoadingLogo } from '../components/LoadingLogo'
import '../pages/CabinetPage.css'

type Theme = 'light' | 'dark'

interface SpaceRef {
  id: number
  name: string
  typeName: string
  floor: number
  capacity: number
  description: string
  amenities?: string[]
}

/** Member view of spaces reference (name, type, floor, capacity, amenities). */
export default function CabinetSpacesPage() {
  const outletContext = useOutletContext<{ theme?: Theme }>()
  const theme = outletContext?.theme ?? 'light'
  const [list, setList] = useState<SpaceRef[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingElapsed, setLoadingElapsed] = useState(0)
  const loadingStartRef = useRef<number | null>(null)

  const loadList = useCallback(() => {
    loadingStartRef.current = Date.now()
    setLoadingElapsed(0)
    setLoading(true)
    get<SpaceRef[]>('/api/me/spaces/list')
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  useEffect(() => {
    if (!loading) return
    const start = loadingStartRef.current ?? Date.now()
    const id = setInterval(() => {
      setLoadingElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [loading])

  if (loading) {
    return loadingElapsed >= 1 ? (
      <div className="cabinet-content">
        <div className="cabinet-loading-block">
          <LoadingLogo theme={theme} size={64} variant="smooth" />
        </div>
      </div>
    ) : null
  }

  return (
    <div className="cabinet-content cabinet-content--wide">
      <h2 className="cabinet-history-title">Пространства</h2>
      <p className="cabinet-history-empty" style={{ marginBottom: '1rem', color: 'var(--cabinet-text-muted)', fontSize: '0.9rem' }}>
        Справочник активных пространств коворкинга
      </p>
      {list.length === 0 ? (
        <p className="cabinet-history-empty">Нет пространств</p>
      ) : (
        <table className="cabinet-table cabinet-history-table" aria-label="Пространства">
          <thead>
            <tr>
              <th scope="col">Название</th>
              <th scope="col">Тип</th>
              <th scope="col">Этаж</th>
              <th scope="col">Вместимость</th>
              <th scope="col">Описание</th>
              <th scope="col">Удобства</th>
            </tr>
          </thead>
          <tbody>
            {list.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.typeName}</td>
                <td>{row.floor}</td>
                <td>{row.capacity}</td>
                <td>{row.description || '—'}</td>
                <td>{row.amenities?.length ? row.amenities.join(', ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
