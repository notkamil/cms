import { useCallback, useEffect, useMemo, useState } from 'react'
import { get, post, patch, del, ApiError } from '../api/client'
import { LoadingLogo } from '../components/LoadingLogo'
import '../pages/CabinetPage.css'
import '../pages/StaffCabinetPage.css'

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'available', label: 'Свободно' },
  { value: 'occupied', label: 'Занято' },
  { value: 'maintenance', label: 'Ремонт' },
]

interface SpaceType {
  id: number
  name: string
  description: string
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

export default function StaffSpacesPage() {
  const [list, setList] = useState<Space[]>([])
  const [types, setTypes] = useState<SpaceType[]>([])
  const [loading, setLoading] = useState(true)
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

  const sortedList = useMemo(
    () => [...list].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [list]
  )

  const loadList = useCallback(() => {
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
    setEditStatus(row.status)
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

  const statusLabel = (status: string) =>
    STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status

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
    return (
      <div className="cabinet-loading-block">
        <LoadingLogo />
        <p className="cabinet-loading">Загрузка пространств…</p>
      </div>
    )
  }

  return (
    <>
      <div className="staff-content staff-content--wider">
        <h2 className="cabinet-history-title">Пространства</h2>
        {sortedList.length === 0 ? (
          <p className="cabinet-history-empty">Нет пространств</p>
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
              {sortedList.map((row) => (
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
    </>
  )
}
