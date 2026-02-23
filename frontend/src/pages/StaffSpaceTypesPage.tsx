import { useCallback, useEffect, useMemo, useState } from 'react'
import { get, post, patch, del, ApiError } from '../api/client'
import { LoadingLogo } from '../components/LoadingLogo'
import '../pages/CabinetPage.css'
import '../pages/StaffCabinetPage.css'

interface SpaceType {
  id: number
  name: string
  description: string
}

interface SpaceSummary {
  spaceId: number
  name: string
}

type ModalKind = 'add' | 'edit' | 'delete' | null

export default function StaffSpaceTypesPage() {
  const [list, setList] = useState<SpaceType[]>([])
  const [loading, setLoading] = useState(true)
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

  const sortedList = useMemo(
    () => [...list].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [list]
  )

  const loadList = useCallback(() => {
    setLoading(true)
    get<SpaceType[]>('/api/staff/space-types', true)
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  const openAdd = () => {
    setAddName('')
    setAddDescription('')
    setAddError(null)
    setModal('add')
  }

  const openEdit = (row: SpaceType) => {
    setEditId(row.id)
    setEditName(row.name)
    setEditDescription(row.description)
    setEditError(null)
    setModal('edit')
  }

  const openDelete = async (row: SpaceType) => {
    setEditId(row.id)
    setDeleteSpaces([])
    setModal('delete')
    try {
      const spaces = await get<SpaceSummary[]>(`/api/staff/space-types/${row.id}/spaces`, true)
      setDeleteSpaces(spaces)
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
      await post<SpaceType>(
        '/api/staff/space-types',
        { name, description: addDescription.trim() || null },
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
    setEditLoading(true)
    setEditError(null)
    try {
      await patch<SpaceType>(
        `/api/staff/space-types/${editId}`,
        { name, description: editDescription.trim() || null },
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
    if (editId == null || deleteSpaces.length > 0) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await del(`/api/staff/space-types/${editId}`, true)
      loadList()
      closeModal()
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Ошибка при удалении')
    } finally {
      setDeleteLoading(false)
    }
  }

  const canDelete = deleteSpaces.length === 0

  if (loading) {
    return (
      <div className="cabinet-loading-block">
        <LoadingLogo />
        <p className="cabinet-loading">Загрузка типов пространств…</p>
      </div>
    )
  }

  return (
    <>
      <div className="staff-content staff-content--wide">
        <h2 className="cabinet-history-title">Типы пространств</h2>
        {sortedList.length === 0 ? (
          <p className="cabinet-history-empty">Нет типов пространств</p>
        ) : (
          <table className="cabinet-table cabinet-history-table">
            <thead>
              <tr>
                <th scope="col">Название</th>
                <th scope="col">Описание</th>
                <th scope="col">Действия</th>
              </tr>
            </thead>
            <tbody>
              {sortedList.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.description || '—'}</td>
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
          <button type="button" className="cabinet-edit-btn" onClick={openAdd}>
            Добавить
          </button>
        </div>
      </div>

      {/* Add modal */}
      {modal === 'add' && (
        <div className="cabinet-modal-overlay" onClick={closeModal}>
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">Добавить тип пространства</h3>
            <form className="cabinet-modal-form" onSubmit={submitAdd}>
              {addError && <p className="cabinet-modal-error">{addError}</p>}
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
            <h3 className="cabinet-modal-title">Изменить тип пространства</h3>
            <form className="cabinet-modal-form" onSubmit={submitEdit}>
              {editError && <p className="cabinet-modal-error">{editError}</p>}
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
                  {editLoading ? 'Сохранение…' : 'Подтвердить'}
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
            <h3 className="cabinet-modal-title">Удалить тип пространства?</h3>
            <div className="cabinet-modal-form">
              {deleteError && <p className="cabinet-modal-error">{deleteError}</p>}
              {deleteSpaces.length > 0 ? (
                <p className="cabinet-modal-error">
                  Следующие пространства имеют этот тип:{' '}
                  {deleteSpaces.map((s) => s.name).join(', ')}. Удаление невозможно.
                </p>
              ) : (
                <p>Вы уверены, что хотите удалить этот тип? Это действие нельзя отменить</p>
              )}
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closeModal}>
                  Отмена
                </button>
                <button
                  type="button"
                  className="cabinet-password-btn"
                  disabled={!canDelete || deleteLoading}
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
