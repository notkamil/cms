import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { get, post, patch, del, put, ApiError } from '../api/client'
import { LoadingLogo } from '../components/LoadingLogo'
import '../pages/CabinetPage.css'
import '../pages/StaffCabinetPage.css'

interface Amenity {
  id: number
  name: string
  description: string
}

interface SpaceSummary {
  id: number
  name: string
}

interface SpaceAmenityAssignment {
  spaceId: number
  amenityId: number
}

type ModalKind = 'add' | 'edit' | 'delete' | null

function assignmentKey(spaceId: number, amenityId: number): string {
  return `${spaceId}-${amenityId}`
}

export default function StaffAmenitiesPage() {
  const [amenities, setAmenities] = useState<Amenity[]>([])
  const [spaces, setSpaces] = useState<SpaceSummary[]>([])
  const [assignments, setAssignments] = useState<SpaceAmenityAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingElapsed, setLoadingElapsed] = useState(0)
  const loadingStartRef = useRef<number | null>(null)
  const [modal, setModal] = useState<ModalKind>(null)
  const [editId, setEditId] = useState<number | null>(null)

  const [addName, setAddName] = useState('')
  const [addDescription, setAddDescription] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [addLoading, setAddLoading] = useState(false)

  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)

  const [deleteSpaces, setDeleteSpaces] = useState<SpaceSummary[]>([])
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [matrixEditMode, setMatrixEditMode] = useState(false)
  const [matrixDraft, setMatrixDraft] = useState<Set<string>>(new Set())
  const [matrixSaving, setMatrixSaving] = useState(false)

  const assignmentSet = useMemo(
    () => new Set(assignments.map((a) => assignmentKey(a.spaceId, a.amenityId))),
    [assignments]
  )
  const draftSet = matrixEditMode ? matrixDraft : assignmentSet

  const sortedAmenities = useMemo(
    () => [...amenities].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [amenities]
  )
  const sortedSpaces = useMemo(
    () => [...spaces].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [spaces]
  )

  const loadAll = useCallback(() => {
    loadingStartRef.current = Date.now()
    setLoadingElapsed(0)
    setLoading(true)
    Promise.all([
      get<Amenity[]>('/api/staff/amenities', true),
      get<{ id: number; name: string }[]>('/api/staff/spaces', true).then((list) =>
        list.map((s) => ({ id: s.id, name: s.name }))
      ),
      get<SpaceAmenityAssignment[]>('/api/staff/space-amenities', true),
    ])
      .then(([amenityList, spaceList, assignmentList]) => {
        setAmenities(amenityList)
        setSpaces(spaceList)
        setAssignments(assignmentList)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    if (!loading) return
    const start = loadingStartRef.current ?? Date.now()
    const id = setInterval(() => {
      setLoadingElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [loading])

  const openAdd = () => {
    setAddName('')
    setAddDescription('')
    setAddError(null)
    setModal('add')
  }

  const openEdit = (row: Amenity) => {
    setEditId(row.id)
    setEditName(row.name)
    setEditDescription(row.description ?? '')
    setEditError(null)
    setModal('edit')
  }

  const openDelete = async (row: Amenity) => {
    setEditId(row.id)
    setDeleteSpaces([])
    setModal('delete')
    try {
      const list = await get<{ spaceId: number; name: string }[]>(`/api/staff/amenities/${row.id}/spaces`, true)
      setDeleteSpaces(list.map((s) => ({ id: s.spaceId, name: s.name })))
    } catch {
      setDeleteSpaces([])
    }
  }

  const closeModal = () => {
    setModal(null)
    setEditId(null)
    setAddError(null)
    setEditError(null)
    setDeleteError(null)
  }

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = addName.trim()
    if (!name) {
      setAddError('Название обязательно')
      return
    }
    setAddLoading(true)
    setAddError(null)
    try {
      await post<Amenity>('/api/staff/amenities', { name, description: addDescription.trim() || null }, true)
      loadAll()
      closeModal()
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Ошибка при добавлении')
    } finally {
      setAddLoading(false)
    }
  }

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editId == null) return
    const name = editName.trim()
    if (!name) {
      setEditError('Название обязательно')
      return
    }
    setEditLoading(true)
    setEditError(null)
    try {
      await patch<Amenity>(`/api/staff/amenities/${editId}`, { name, description: editDescription.trim() || null }, true)
      loadAll()
      closeModal()
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Ошибка при сохранении')
    } finally {
      setEditLoading(false)
    }
  }

  const submitDelete = async () => {
    if (editId == null || deleteSpaces.length > 0) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await del(`/api/staff/amenities/${editId}`, true)
      loadAll()
      closeModal()
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Ошибка при удалении')
    } finally {
      setDeleteLoading(false)
    }
  }

  const canDelete = deleteSpaces.length === 0

  const startMatrixEdit = () => {
    setMatrixDraft(new Set(assignmentSet))
    setMatrixEditMode(true)
  }

  const cancelMatrixEdit = () => {
    setMatrixEditMode(false)
  }

  const saveMatrixEdit = async () => {
    setMatrixSaving(true)
    try {
      const list = Array.from(matrixDraft).map((key) => {
        const [s, a] = key.split('-').map(Number)
        return { spaceId: s, amenityId: a }
      })
      await put('/api/staff/space-amenities', { assignments: list }, true)
      setAssignments(list)
      setMatrixEditMode(false)
    } catch {
    } finally {
      setMatrixSaving(false)
    }
  }

  const toggleMatrixCell = (spaceId: number, amenityId: number) => {
    if (!matrixEditMode) return
    const key = assignmentKey(spaceId, amenityId)
    setMatrixDraft((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (loading) {
    return loadingElapsed >= 1 ? (
      <div className="cabinet-loading-block">
        <LoadingLogo theme="light" variant="smooth" />
      </div>
    ) : null
  }

  return (
    <>
      <div className="staff-content staff-content--wider">
        <h2 className="cabinet-history-title">Удобства</h2>

        {/* Amenities table: name — description */}
        <h3 className="cabinet-history-title" style={{ marginTop: '1rem', fontSize: '1rem' }}>
          Список удобств
        </h3>
        {sortedAmenities.length === 0 ? (
          <p className="cabinet-history-empty">Нет удобств</p>
        ) : (
          <table className="cabinet-table cabinet-history-table staff-space-types-table">
            <thead>
              <tr>
                <th scope="col">Название</th>
                <th scope="col">Описание</th>
                <th scope="col">Действия</th>
              </tr>
            </thead>
            <tbody>
              {sortedAmenities.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.description || '—'}</td>
                  <td>
                    <div className="cabinet-table-actions-cell">
                      <button type="button" className="cabinet-edit-btn" onClick={() => openEdit(row)}>
                        Изменить
                      </button>
                      <button type="button" className="cabinet-password-btn" onClick={() => openDelete(row)}>
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="cabinet-actions">
          <button type="button" className="cabinet-edit-btn" onClick={openAdd}>
            Добавить
          </button>
        </div>

        {/* 2D matrix: rows = amenities, cols = spaces */}
        <h3 className="cabinet-history-title" style={{ marginTop: '1.5rem', fontSize: '1rem' }}>
          Удобства по пространствам
        </h3>
        {sortedAmenities.length === 0 || sortedSpaces.length === 0 ? (
          <p className="cabinet-history-empty">
            {sortedAmenities.length === 0 ? 'Добавьте удобства' : 'Добавьте пространства'}
          </p>
        ) : (
          <>
            <div className="staff-matrix-wrap">
              <table className="staff-matrix-table staff-matrix-table--fit cabinet-table">
                <thead>
                  <tr>
                    <th scope="col" className="staff-matrix-amenity">
                      Удобство
                    </th>
                    {sortedSpaces.map((space) => (
                      <th key={space.id} scope="col" className="staff-matrix-space">
                        {space.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedAmenities.map((amenity) => (
                    <tr key={amenity.id}>
                      <td className="staff-matrix-amenity" style={{ textAlign: 'left' }}>
                        {amenity.name}
                      </td>
                      {sortedSpaces.map((space) => (
                        <td key={space.id}>
                          <input
                            type="checkbox"
                            checked={draftSet.has(assignmentKey(space.id, amenity.id))}
                            disabled={!matrixEditMode}
                            onChange={() => toggleMatrixCell(space.id, amenity.id)}
                            aria-label={`${amenity.name} — ${space.name}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="staff-matrix-actions cabinet-actions">
              {!matrixEditMode ? (
                <button type="button" className="cabinet-edit-btn" onClick={startMatrixEdit}>
                  Внести изменения
                </button>
              ) : (
                <>
                  <button type="button" className="cabinet-modal-cancel" onClick={cancelMatrixEdit}>
                    Отменить изменения
                  </button>
                  <button
                    type="button"
                    className="cabinet-modal-submit"
                    disabled={matrixSaving}
                    onClick={saveMatrixEdit}
                  >
                    {matrixSaving ? 'Сохранение…' : 'Сохранить изменения'}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Add modal */}
      {modal === 'add' && (
        <div className="cabinet-modal-overlay" onClick={closeModal}>
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">Добавить удобство</h3>
            <form className="cabinet-modal-form" onSubmit={submitAdd}>
              {addError && <p className="cabinet-modal-error" role="alert">{addError}</p>}
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="add-name">Название *</label>
                <input
                  id="add-name"
                  type="text"
                  className="cabinet-modal-input"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  maxLength={24}
                  autoFocus
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="add-desc">Описание</label>
                <textarea
                  id="add-desc"
                  className="cabinet-modal-input"
                  value={addDescription}
                  onChange={(e) => setAddDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closeModal}>
                  Отмена
                </button>
                <button type="submit" className="cabinet-modal-submit" disabled={addLoading}>
                  {addLoading ? 'Сохранение…' : 'Подтвердить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {modal === 'edit' && (
        <div className="cabinet-modal-overlay" onClick={closeModal}>
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">Изменить удобство</h3>
            <form className="cabinet-modal-form" onSubmit={submitEdit}>
              {editError && <p className="cabinet-modal-error" role="alert">{editError}</p>}
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="edit-name">Название *</label>
                <input
                  id="edit-name"
                  type="text"
                  className="cabinet-modal-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={24}
                  autoFocus
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="edit-desc">Описание</label>
                <textarea
                  id="edit-desc"
                  className="cabinet-modal-input"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closeModal}>
                  Отмена
                </button>
                <button type="submit" className="cabinet-modal-submit" disabled={editLoading}>
                  {editLoading ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {modal === 'delete' && (
        <div className="cabinet-modal-overlay" onClick={closeModal}>
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">
              {deleteSpaces.length > 0 ? 'Удаление невозможно' : 'Удалить удобство?'}
            </h3>
            <div className="cabinet-modal-form">
              {deleteError && <p className="cabinet-modal-error" role="alert">{deleteError}</p>}
              {deleteSpaces.length > 0 ? (
                <div className="staff-conflict-block">
                  <p>Следующие пространства используют это удобство:</p>
                  <table className="staff-conflict-table" aria-label="Пространства">
                    <thead>
                      <tr>
                        <th scope="col">Название</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deleteSpaces.map((s) => (
                        <tr key={s.id}>
                          <td>{s.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>Вы уверены, что хотите удалить это удобство? Действие нельзя отменить</p>
              )}
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closeModal}>
                  {deleteSpaces.length > 0 ? 'Хорошо' : 'Отмена'}
                </button>
                {canDelete && (
                  <button
                    type="button"
                    className="cabinet-password-btn"
                    disabled={deleteLoading}
                    onClick={submitDelete}
                  >
                    {deleteLoading ? 'Удаление…' : 'Удалить'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
