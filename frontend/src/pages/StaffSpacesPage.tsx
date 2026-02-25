import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { get, post, patch, del, ApiError } from '../api/client'
import { LoadingLogo } from '../components/LoadingLogo'
import '../pages/CabinetPage.css'
import '../pages/StaffCabinetPage.css'

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'available', label: 'Свободно' },
  { value: 'occupied', label: 'Занято' },
  { value: 'maintenance', label: 'Ремонт' },
]
const STATUS_OPTIONS_EDIT: { value: string; label: string }[] = [
  ...STATUS_OPTIONS,
  { value: 'disabled', label: 'Архивное' },
]
function statusLabel(status: string): string {
  return STATUS_OPTIONS_EDIT.find((o) => o.value === status)?.label ?? status
}

interface SpaceType {
  id: number
  name: string
  description: string
}

interface SpaceSummary {
  spaceId: number
  name: string
}

interface Space {
  id: number
  name: string
  typeId: number
  typeName: string
  floor: number
  capacity: number
  status: string
  description: string
}

type ModalKind = 'add' | 'edit' | 'delete' | null
type TypeModalKind = 'add' | 'edit' | 'delete' | null

/** Staff spaces and space types: CRUD, type–space matrix. */
export default function StaffSpacesPage() {
  const [list, setList] = useState<Space[]>([])
  const [types, setTypes] = useState<SpaceType[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingElapsed, setLoadingElapsed] = useState(0)
  const loadingStartRef = useRef<number | null>(null)
  const [modal, setModal] = useState<ModalKind>(null)
  const [editId, setEditId] = useState<number | null>(null)

  const [addName, setAddName] = useState('')
  const [addTypeId, setAddTypeId] = useState<number>(0)
  const [addFloor, setAddFloor] = useState('')
  const [addCapacity, setAddCapacity] = useState('')
  const [addDescription, setAddDescription] = useState('')
  const [addStatus, setAddStatus] = useState('available')
  const [addError, setAddError] = useState<string | null>(null)
  const [addLoading, setAddLoading] = useState(false)

  const [editName, setEditName] = useState('')
  const [editTypeId, setEditTypeId] = useState<number>(0)
  const [editFloor, setEditFloor] = useState('')
  const [editCapacity, setEditCapacity] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editStatus, setEditStatus] = useState('available')
  const [editError, setEditError] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)

  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [restoreLoadingId, setRestoreLoadingId] = useState<number | null>(null)

  const [typeModal, setTypeModal] = useState<TypeModalKind>(null)
  const [typeEditId, setTypeEditId] = useState<number | null>(null)
  const [addTypeName, setAddTypeName] = useState('')
  const [addTypeDescription, setAddTypeDescription] = useState('')
  const [addTypeError, setAddTypeError] = useState<string | null>(null)
  const [addTypeLoading, setAddTypeLoading] = useState(false)
  const [editTypeName, setEditTypeName] = useState('')
  const [editTypeDescription, setEditTypeDescription] = useState('')
  const [editTypeError, setEditTypeError] = useState<string | null>(null)
  const [editTypeLoading, setEditTypeLoading] = useState(false)
  const [deleteTypeSpaces, setDeleteTypeSpaces] = useState<SpaceSummary[]>([])
  const [deleteTypeLoading, setDeleteTypeLoading] = useState(false)
  const [deleteTypeError, setDeleteTypeError] = useState<string | null>(null)

  const sortedList = useMemo(
    () => [...list].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [list]
  )
  const sortedActiveSpaces = useMemo(
    () => sortedList.filter((s) => s.status !== 'disabled'),
    [sortedList]
  )
  const sortedArchivedSpaces = useMemo(
    () => sortedList.filter((s) => s.status === 'disabled'),
    [sortedList]
  )
  const sortedTypes = useMemo(
    () => [...types].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [types]
  )

  const loadList = useCallback(() => {
    loadingStartRef.current = Date.now()
    setLoadingElapsed(0)
    setLoading(true)
    Promise.all([
      get<Space[]>('/api/staff/spaces', true),
      get<SpaceType[]>('/api/staff/space-types', true),
    ])
      .then(([spaces, typeList]) => {
        setList(spaces)
        setTypes(typeList)
      })
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

  const openAdd = () => {
    setAddName('')
    setAddTypeId(types[0]?.id ?? 0)
    setAddFloor('')
    setAddCapacity('')
    setAddDescription('')
    setAddStatus('available')
    setAddError(null)
    setModal('add')
  }

  const openEdit = (row: Space) => {
    setEditId(row.id)
    setEditName(row.name)
    setEditTypeId(row.typeId)
    setEditFloor(String(row.floor))
    setEditCapacity(String(row.capacity))
    setEditDescription(row.description ?? '')
    setEditStatus(row.status === 'disabled' ? 'available' : row.status)
    setEditError(null)
    setModal('edit')
  }

  const openDelete = (row: Space) => {
    setEditId(row.id)
    setDeleteError(null)
    setModal('delete')
  }

  const closeModal = () => {
    setModal(null)
    setEditId(null)
    setAddError(null)
    setEditError(null)
    setDeleteError(null)
  }

  const openTypeAdd = () => {
    setAddTypeName('')
    setAddTypeDescription('')
    setAddTypeError(null)
    setTypeModal('add')
  }
  const openTypeEdit = (row: SpaceType) => {
    setTypeEditId(row.id)
    setEditTypeName(row.name)
    setEditTypeDescription(row.description ?? '')
    setEditTypeError(null)
    setTypeModal('edit')
  }
  const openTypeDelete = async (row: SpaceType) => {
    setTypeEditId(row.id)
    setDeleteTypeSpaces([])
    setTypeModal('delete')
    try {
      const spaces = await get<SpaceSummary[]>(`/api/staff/space-types/${row.id}/spaces`, true)
      setDeleteTypeSpaces(spaces)
    } catch {
      setDeleteTypeSpaces([])
    }
  }
  const closeTypeModal = () => {
    setTypeModal(null)
    setTypeEditId(null)
    setAddTypeError(null)
    setEditTypeError(null)
    setDeleteTypeError(null)
  }

  const submitTypeAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = addTypeName.trim()
    if (!name) {
      setAddTypeError('Название обязательно')
      return
    }
    setAddTypeLoading(true)
    setAddTypeError(null)
    try {
      await post<SpaceType>(
        '/api/staff/space-types',
        { name, description: addTypeDescription.trim() || null },
        true
      )
      loadList()
      closeTypeModal()
    } catch (err) {
      setAddTypeError(err instanceof ApiError ? err.message : 'Ошибка при добавлении')
    } finally {
      setAddTypeLoading(false)
    }
  }
  const submitTypeEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (typeEditId == null) return
    const name = editTypeName.trim()
    if (!name) {
      setEditTypeError('Название обязательно')
      return
    }
    setEditTypeLoading(true)
    setEditTypeError(null)
    try {
      await patch<SpaceType>(
        `/api/staff/space-types/${typeEditId}`,
        { name, description: editTypeDescription.trim() || null },
        true
      )
      loadList()
      closeTypeModal()
    } catch (err) {
      setEditTypeError(err instanceof ApiError ? err.message : 'Ошибка при сохранении')
    } finally {
      setEditTypeLoading(false)
    }
  }
  const submitTypeDelete = async () => {
    if (typeEditId == null || deleteTypeSpaces.length > 0) return
    setDeleteTypeLoading(true)
    setDeleteTypeError(null)
    try {
      await del(`/api/staff/space-types/${typeEditId}`, true)
      loadList()
      closeTypeModal()
    } catch (err) {
      setDeleteTypeError(err instanceof ApiError ? err.message : 'Ошибка при удалении')
    } finally {
      setDeleteTypeLoading(false)
    }
  }
  const canDeleteType = deleteTypeSpaces.length === 0

  const handleRestore = async (spaceId: number) => {
    setRestoreLoadingId(spaceId)
    try {
      await patch(`/api/staff/spaces/${spaceId}`, { status: 'available' }, true)
      loadList()
    } catch {
      // ignore
    } finally {
      setRestoreLoadingId(null)
    }
  }

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = addName.trim()
    if (!name) {
      setAddError('Название обязательно')
      return
    }
    const floor = parseInt(addFloor, 10)
    const capacity = parseInt(addCapacity, 10)
    if (Number.isNaN(floor) || floor < 0) {
      setAddError('Укажите корректный этаж')
      return
    }
    if (Number.isNaN(capacity) || capacity < 1) {
      setAddError('Укажите вместимость (не менее 1)')
      return
    }
    if (!addTypeId) {
      setAddError('Выберите тип пространства')
      return
    }
    setAddLoading(true)
    setAddError(null)
    try {
      await post<Space>(
        '/api/staff/spaces',
        {
          name,
          spaceTypeId: addTypeId,
          floor,
          capacity,
          description: addDescription.trim() || null,
          status: addStatus,
        },
        true
      )
      loadList()
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
    const floor = parseInt(editFloor, 10)
    const capacity = parseInt(editCapacity, 10)
    if (Number.isNaN(floor) || floor < 0) {
      setEditError('Укажите корректный этаж')
      return
    }
    if (Number.isNaN(capacity) || capacity < 1) {
      setEditError('Укажите вместимость (не менее 1)')
      return
    }
    if (!editTypeId) {
      setEditError('Выберите тип пространства')
      return
    }
    setEditLoading(true)
    setEditError(null)
    try {
      await patch<Space>(
        `/api/staff/spaces/${editId}`,
        {
          name,
          spaceTypeId: editTypeId,
          floor,
          capacity,
          description: editDescription.trim() || null,
          status: editStatus,
        },
        true
      )
      loadList()
      closeModal()
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Ошибка при сохранении')
    } finally {
      setEditLoading(false)
    }
  }

  const submitDelete = async () => {
    if (editId == null) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await del(`/api/staff/spaces/${editId}`, true)
      loadList()
      closeModal()
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Ошибка при удалении')
    } finally {
      setDeleteLoading(false)
    }
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
        <h2 className="cabinet-history-title">Пространства</h2>
        {sortedActiveSpaces.length === 0 ? (
          <p className="cabinet-history-empty">Нет активных пространств</p>
        ) : (
          <table className="cabinet-table cabinet-history-table staff-spaces-table">
            <thead>
              <tr>
                <th scope="col">Название</th>
                <th scope="col">Тип</th>
                <th scope="col">Этаж</th>
                <th scope="col">Вместимость</th>
                <th scope="col">Описание</th>
                <th scope="col">Статус</th>
                <th scope="col">Действия</th>
              </tr>
            </thead>
            <tbody>
              {sortedActiveSpaces.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.typeName}</td>
                  <td>{row.floor}</td>
                  <td>{row.capacity}</td>
                  <td>{row.description || '—'}</td>
                  <td>{statusLabel(row.status)}</td>
                  <td>
                    <div className="cabinet-table-actions-cell">
                      <button
                        type="button"
                        className="cabinet-edit-btn"
                        onClick={() => openEdit(row)}
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        className="cabinet-password-btn"
                        onClick={() => openDelete(row)}
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {sortedArchivedSpaces.length > 0 && (
          <section className="cabinet-section" style={{ marginTop: '1.5rem' }}>
            <h3 className="cabinet-section-title">Архивные пространства</h3>
            <table className="cabinet-table cabinet-history-table staff-spaces-table">
              <thead>
                <tr>
                  <th scope="col">Название</th>
                  <th scope="col">Тип</th>
                  <th scope="col">Этаж</th>
                  <th scope="col">Вместимость</th>
                  <th scope="col">Описание</th>
                  <th scope="col">Действия</th>
                </tr>
              </thead>
              <tbody>
                {sortedArchivedSpaces.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.typeName}</td>
                    <td>{row.floor}</td>
                    <td>{row.capacity}</td>
                    <td>{row.description || '—'}</td>
                    <td>
                      <div className="cabinet-table-actions-cell">
                        <button
                          type="button"
                          className="cabinet-edit-btn"
                          disabled={restoreLoadingId === row.id}
                          onClick={() => handleRestore(row.id)}
                        >
                          {restoreLoadingId === row.id ? '…' : 'Восстановить'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <div className="cabinet-actions">
          <button
            type="button"
            className="cabinet-edit-btn"
            onClick={openAdd}
            disabled={types.length === 0}
            title={types.length === 0 ? 'Сначала добавьте хотя бы один тип пространства' : undefined}
          >
            Добавить
          </button>
        </div>

        <section className="cabinet-section" style={{ marginTop: '2rem' }}>
          <h3 className="cabinet-section-title">Типы пространств</h3>
          {sortedTypes.length === 0 ? (
            <p className="cabinet-muted">Нет типов пространств</p>
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
                {sortedTypes.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.description || '—'}</td>
                    <td>
                      <div className="cabinet-table-actions-cell">
                        <button
                          type="button"
                          className="cabinet-edit-btn"
                          onClick={() => openTypeEdit(row)}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="cabinet-password-btn"
                          onClick={() => openTypeDelete(row)}
                        >
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
            <button type="button" className="cabinet-edit-btn" onClick={openTypeAdd}>
              Добавить тип
            </button>
          </div>
        </section>
      </div>

      {/* Add modal */}
      {modal === 'add' && (
        <div className="cabinet-modal-overlay" onClick={closeModal}>
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">Добавить пространство</h3>
            <form className="cabinet-modal-form" onSubmit={submitAdd}>
              {addError && <p className="cabinet-modal-error" role="alert">{addError}</p>}
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="add-name">
                  Название *
                </label>
                <input
                  id="add-name"
                  type="text"
                  className="cabinet-modal-input"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  maxLength={64}
                  autoFocus
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="add-type">
                  Тип *
                </label>
                <select
                  id="add-type"
                  className="cabinet-modal-input"
                  value={addTypeId || ''}
                  onChange={(e) => setAddTypeId(Number(e.target.value))}
                >
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="add-floor">
                  Этаж *
                </label>
                <input
                  id="add-floor"
                  type="number"
                  min={0}
                  className="cabinet-modal-input"
                  value={addFloor}
                  onChange={(e) => setAddFloor(e.target.value)}
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="add-capacity">
                  Вместимость *
                </label>
                <input
                  id="add-capacity"
                  type="number"
                  min={1}
                  className="cabinet-modal-input"
                  value={addCapacity}
                  onChange={(e) => setAddCapacity(e.target.value)}
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="add-desc">
                  Описание
                </label>
                <textarea
                  id="add-desc"
                  className="cabinet-modal-input"
                  value={addDescription}
                  onChange={(e) => setAddDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="add-status">
                  Статус
                </label>
                <select
                  id="add-status"
                  className="cabinet-modal-input"
                  value={addStatus}
                  onChange={(e) => setAddStatus(e.target.value)}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closeModal}>
                  Отмена
                </button>
                <button type="submit" className="cabinet-modal-submit" disabled={addLoading}>
                  {addLoading ? 'Сохранение…' : 'Сохранить'}
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
            <h3 className="cabinet-modal-title">Изменить пространство</h3>
            <form className="cabinet-modal-form" onSubmit={submitEdit}>
              {editError && <p className="cabinet-modal-error" role="alert">{editError}</p>}
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="edit-name">
                  Название *
                </label>
                <input
                  id="edit-name"
                  type="text"
                  className="cabinet-modal-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={64}
                  autoFocus
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="edit-type">
                  Тип *
                </label>
                <select
                  id="edit-type"
                  className="cabinet-modal-input"
                  value={editTypeId || ''}
                  onChange={(e) => setEditTypeId(Number(e.target.value))}
                >
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="edit-floor">
                  Этаж *
                </label>
                <input
                  id="edit-floor"
                  type="number"
                  min={0}
                  className="cabinet-modal-input"
                  value={editFloor}
                  onChange={(e) => setEditFloor(e.target.value)}
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="edit-capacity">
                  Вместимость *
                </label>
                <input
                  id="edit-capacity"
                  type="number"
                  min={1}
                  className="cabinet-modal-input"
                  value={editCapacity}
                  onChange={(e) => setEditCapacity(e.target.value)}
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="edit-desc">
                  Описание
                </label>
                <textarea
                  id="edit-desc"
                  className="cabinet-modal-input"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="edit-status">
                  Статус
                </label>
                <select
                  id="edit-status"
                  className="cabinet-modal-input"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
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
            <h3 className="cabinet-modal-title">Удалить пространство?</h3>
            <div className="cabinet-modal-form">
              {deleteError && <p className="cabinet-modal-error" role="alert">{deleteError}</p>}
              <p>Вы уверены, что хотите удалить это пространство? Действие нельзя отменить</p>
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closeModal}>
                  Отмена
                </button>
                <button
                  type="button"
                  className="cabinet-password-btn"
                  disabled={deleteLoading}
                  onClick={submitDelete}
                >
                  {deleteLoading ? 'Удаление…' : 'Удалить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Type: Add modal */}
      {typeModal === 'add' && (
        <div className="cabinet-modal-overlay" onClick={closeTypeModal}>
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">Добавить тип пространства</h3>
            <form className="cabinet-modal-form" onSubmit={submitTypeAdd}>
              {addTypeError && <p className="cabinet-modal-error" role="alert">{addTypeError}</p>}
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="add-type-name">Название *</label>
                <input
                  id="add-type-name"
                  type="text"
                  className="cabinet-modal-input"
                  value={addTypeName}
                  onChange={(e) => setAddTypeName(e.target.value)}
                  maxLength={24}
                  autoFocus
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="add-type-desc">Описание</label>
                <textarea
                  id="add-type-desc"
                  className="cabinet-modal-input"
                  value={addTypeDescription}
                  onChange={(e) => setAddTypeDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closeTypeModal}>
                  Отмена
                </button>
                <button type="submit" className="cabinet-modal-submit" disabled={addTypeLoading}>
                  {addTypeLoading ? 'Сохранение…' : 'Подтвердить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Type: Edit modal */}
      {typeModal === 'edit' && (
        <div className="cabinet-modal-overlay" onClick={closeTypeModal}>
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">Изменить тип пространства</h3>
            <form className="cabinet-modal-form" onSubmit={submitTypeEdit}>
              {editTypeError && <p className="cabinet-modal-error" role="alert">{editTypeError}</p>}
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="edit-type-name">Название *</label>
                <input
                  id="edit-type-name"
                  type="text"
                  className="cabinet-modal-input"
                  value={editTypeName}
                  onChange={(e) => setEditTypeName(e.target.value)}
                  maxLength={24}
                  autoFocus
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="edit-type-desc">Описание</label>
                <textarea
                  id="edit-type-desc"
                  className="cabinet-modal-input"
                  value={editTypeDescription}
                  onChange={(e) => setEditTypeDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closeTypeModal}>
                  Отмена
                </button>
                <button type="submit" className="cabinet-modal-submit" disabled={editTypeLoading}>
                  {editTypeLoading ? 'Сохранение…' : 'Подтвердить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Type: Delete modal */}
      {typeModal === 'delete' && (
        <div className="cabinet-modal-overlay" onClick={closeTypeModal}>
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">
              {deleteTypeSpaces.length > 0 ? 'Удаление невозможно' : 'Удалить тип пространства?'}
            </h3>
            <div className="cabinet-modal-form">
              {deleteTypeError && <p className="cabinet-modal-error" role="alert">{deleteTypeError}</p>}
              {deleteTypeSpaces.length > 0 ? (
                <div className="staff-conflict-block">
                  <p>Следующие пространства имеют этот тип:</p>
                  <table className="staff-conflict-table" aria-label="Пространства с этим типом">
                    <thead>
                      <tr>
                        <th scope="col">Название</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deleteTypeSpaces.map((s) => (
                        <tr key={s.spaceId}>
                          <td>{s.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>Вы уверены, что хотите удалить этот тип? Это действие нельзя отменить</p>
              )}
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closeTypeModal}>
                  {deleteTypeSpaces.length > 0 ? 'Хорошо' : 'Отмена'}
                </button>
                {canDeleteType && (
                  <button
                    type="button"
                    className="cabinet-password-btn"
                    disabled={deleteTypeLoading}
                    onClick={submitTypeDelete}
                  >
                    {deleteTypeLoading ? 'Удаление…' : 'Удалить'}
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
