import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useStaffAuth } from '../context/StaffAuthContext'
import { get, post, patch, ApiError } from '../api/client'
import { LoadingLogo } from '../components/LoadingLogo'
import '../pages/CabinetPage.css'
import '../pages/StaffCabinetPage.css'

/** Backend StaffResponse */
interface StaffItem {
  id: number
  name: string
  email: string
  phone: string
  role: string
  position: string
}

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'staff', label: 'Сотрудник' },
  { value: 'admin', label: 'Администратор' },
  { value: 'superadmin', label: 'Суперадмин' },
]

function roleLabel(role: string): string {
  if (role === 'inactive') return 'Неактивен'
  return ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role
}

type ModalKind = 'add' | 'edit' | 'dismiss' | null

export default function StaffStaffPage() {
  const { staffUser } = useStaffAuth()
  const [list, setList] = useState<StaffItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalKind>(null)
  const [targetId, setTargetId] = useState<number | null>(null)

  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addPhone, setAddPhone] = useState('')
  const [addRole, setAddRole] = useState('staff')
  const [addPosition, setAddPosition] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [addLoading, setAddLoading] = useState(false)

  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editRole, setEditRole] = useState('staff')
  const [editPosition, setEditPosition] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)

  const [dismissError, setDismissError] = useState<string | null>(null)
  const [dismissLoading, setDismissLoading] = useState(false)

  const loadList = useCallback(() => {
    setLoading(true)
    get<StaffItem[]>('/api/staff/staff', true)
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!staffUser) return
    const isAdmin = staffUser.role === 'admin' || staffUser.role === 'superadmin'
    if (!isAdmin) return
    loadList()
  }, [staffUser, loadList])

  const openAdd = () => {
    setAddName('')
    setAddEmail('')
    setAddPhone('')
    setAddRole(staffUser?.role === 'superadmin' ? 'staff' : 'staff')
    setAddPosition('')
    setAddPassword('')
    setAddError(null)
    setModal('add')
  }

  const openEdit = (row: StaffItem) => {
    if (row.role === 'inactive') return
    setTargetId(row.id)
    setEditName(row.name)
    setEditEmail(row.email)
    setEditPhone(row.phone)
    setEditRole(row.role)
    setEditPosition(row.position ?? '')
    setEditError(null)
    setModal('edit')
  }

  const openDismiss = (row: StaffItem) => {
    if (row.role === 'inactive' || row.id === staffUser?.id) return
    setTargetId(row.id)
    setDismissError(null)
    setModal('dismiss')
  }

  const closeModal = () => {
    setModal(null)
    setTargetId(null)
    setAddError(null)
    setEditError(null)
    setDismissError(null)
  }

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = addName.trim()
    if (!name) {
      setAddError('Укажите имя')
      return
    }
    if (!addEmail.trim()) {
      setAddError('Укажите email')
      return
    }
    if (!addPhone.trim()) {
      setAddError('Укажите телефон')
      return
    }
    if (!addPassword) {
      setAddError('Укажите пароль')
      return
    }
    const canCreateAdmin = staffUser?.role === 'superadmin'
    if (!canCreateAdmin && addRole !== 'staff') {
      setAddError('Администратор может создавать только сотрудников')
      return
    }
    setAddLoading(true)
    setAddError(null)
    try {
      await post<StaffItem>('/api/staff/staff', {
        name,
        email: addEmail.trim(),
        phone: addPhone.trim(),
        role: addRole,
        position: addPosition.trim(),
        password: addPassword,
      }, true)
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
    if (targetId == null) return
    const name = editName.trim()
    if (!name) {
      setEditError('Укажите имя')
      return
    }
    if (!editEmail.trim()) {
      setEditError('Укажите email')
      return
    }
    if (!editPhone.trim()) {
      setEditError('Укажите телефон')
      return
    }
    const canSetAdmin = staffUser?.role === 'superadmin'
    if (!canSetAdmin && editRole !== 'staff') {
      setEditError('Администратор может назначать только роль «Сотрудник»')
      return
    }
    setEditLoading(true)
    setEditError(null)
    try {
      await patch<StaffItem>(`/api/staff/staff/${targetId}`, {
        name,
        email: editEmail.trim(),
        phone: editPhone.trim(),
        role: editRole,
        position: editPosition.trim(),
      }, true)
      loadList()
      closeModal()
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Ошибка при сохранении')
    } finally {
      setEditLoading(false)
    }
  }

  const submitDismiss = async () => {
    if (targetId == null) return
    setDismissLoading(true)
    setDismissError(null)
    try {
      await post<StaffItem>(`/api/staff/staff/${targetId}/dismiss`, {}, true)
      loadList()
      closeModal()
    } catch (err) {
      setDismissError(err instanceof ApiError ? err.message : 'Ошибка при увольнении')
    } finally {
      setDismissLoading(false)
    }
  }

  if (!staffUser) {
    return <Navigate to="/staff" replace />
  }

  const isAdmin = staffUser.role === 'admin' || staffUser.role === 'superadmin'
  if (!isAdmin) {
    return <Navigate to="/staff" replace />
  }

  /* Суперадмина через UI добавить нельзя; суперадмин может создавать только admin/staff */
  const roleOptions =
    staffUser.role === 'superadmin'
      ? ROLE_OPTIONS.filter((o) => o.value !== 'superadmin')
      : ROLE_OPTIONS.filter((o) => o.value === 'staff')

  const targetStaff = targetId != null ? list.find((s) => s.id === targetId) : null

  return (
    <div className="staff-content staff-content--wider">
      <div className="cabinet-actions" style={{ marginBottom: '1rem' }}>
        <button type="button" className="cabinet-edit-btn" onClick={openAdd}>
          Добавить сотрудника
        </button>
      </div>

      {loading ? (
        <LoadingLogo />
      ) : (
        <table className="cabinet-table staff-spaces-table">
          <caption className="cabinet-table-caption">Сотрудники</caption>
          <thead>
            <tr>
              <th>Имя</th>
              <th>Email</th>
              <th>Телефон</th>
              <th>Роль</th>
              <th>Должность</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {list.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.email}</td>
                <td>{row.phone}</td>
                <td>{roleLabel(row.role)}</td>
                <td>{row.position || '—'}</td>
                <td>
                  {row.role !== 'inactive' && row.id !== staffUser.id && (
                    <>
                      <button
                        type="button"
                        className="cabinet-edit-btn"
                        style={{ marginRight: '0.5rem' }}
                        onClick={() => openEdit(row)}
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        className="cabinet-password-btn"
                        onClick={() => openDismiss(row)}
                      >
                        Уволить
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal === 'add' && (
        <div className="cabinet-modal-overlay" onClick={closeModal}>
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">Добавить сотрудника</h3>
            <form className="cabinet-modal-form" onSubmit={submitAdd}>
              {addError && <p className="cabinet-modal-error" role="alert">{addError}</p>}
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="staff-add-name">Имя *</label>
                <input
                  id="staff-add-name"
                  type="text"
                  className="cabinet-modal-input"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  maxLength={64}
                  autoFocus
                  required
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="staff-add-email">Email *</label>
                <input
                  id="staff-add-email"
                  type="email"
                  className="cabinet-modal-input"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  required
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="staff-add-phone">Телефон * (в формате +79001234567)</label>
                <input
                  id="staff-add-phone"
                  type="tel"
                  className="cabinet-modal-input"
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                  required
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="staff-add-role">Роль</label>
                <select
                  id="staff-add-role"
                  className="cabinet-modal-input"
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value)}
                >
                  {roleOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="staff-add-position">Должность</label>
                <input
                  id="staff-add-position"
                  type="text"
                  className="cabinet-modal-input"
                  value={addPosition}
                  onChange={(e) => setAddPosition(e.target.value)}
                  maxLength={128}
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="staff-add-password">Пароль *</label>
                <input
                  id="staff-add-password"
                  type="password"
                  className="cabinet-modal-input"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  required
                />
              </div>
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closeModal}>
                  Отмена
                </button>
                <button type="submit" className="cabinet-modal-submit" disabled={addLoading}>
                  {addLoading ? 'Сохранение…' : 'Добавить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'edit' && targetStaff && (
        <div className="cabinet-modal-overlay" onClick={closeModal}>
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">Редактировать сотрудника</h3>
            <form className="cabinet-modal-form" onSubmit={submitEdit}>
              {editError && <p className="cabinet-modal-error" role="alert">{editError}</p>}
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="staff-edit-name">Имя *</label>
                <input
                  id="staff-edit-name"
                  type="text"
                  className="cabinet-modal-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={64}
                  autoFocus
                  required
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="staff-edit-email">Email *</label>
                <input
                  id="staff-edit-email"
                  type="email"
                  className="cabinet-modal-input"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="staff-edit-phone">Телефон * (в формате +79001234567)</label>
                <input
                  id="staff-edit-phone"
                  type="tel"
                  className="cabinet-modal-input"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  required
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="staff-edit-role">Роль</label>
                <select
                  id="staff-edit-role"
                  className="cabinet-modal-input"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                >
                  {roleOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="staff-edit-position">Должность</label>
                <input
                  id="staff-edit-position"
                  type="text"
                  className="cabinet-modal-input"
                  value={editPosition}
                  onChange={(e) => setEditPosition(e.target.value)}
                  maxLength={128}
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

      {modal === 'dismiss' && targetStaff && (
        <div className="cabinet-modal-overlay" onClick={closeModal}>
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">Уволить сотрудника?</h3>
            <div className="cabinet-modal-form">
              {dismissError && <p className="cabinet-modal-error" role="alert">{dismissError}</p>}
              <p>
                Вы уверены, что хотите уволить <strong>{targetStaff.name}</strong> ({targetStaff.email})? Роль будет изменена на «Неактивен», вход в систему станет невозможен.
              </p>
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closeModal}>
                  Отмена
                </button>
                <button
                  type="button"
                  className="cabinet-password-btn"
                  disabled={dismissLoading}
                  onClick={submitDismiss}
                >
                  {dismissLoading ? 'Выполняется…' : 'Уволить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
