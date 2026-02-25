import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useStaffAuth, StaffApiError } from '../context/StaffAuthContext'
import { patch, put } from '../api/client'
import './CabinetPage.css'
import './StaffCabinetPage.css'

export default function StaffCabinetPage() {
  const { staffUser, updateStaffUser } = useStaffAuth()
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)

  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editPosition, setEditPosition] = useState('')
  const [editCurrentPassword, setEditCurrentPassword] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)

  const [passwordCurrent, setPasswordCurrent] = useState('')
  const [passwordNew, setPasswordNew] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordLoading, setPasswordLoading] = useState(false)

  if (!staffUser) {
    return <Navigate to="/staff" replace />
  }

  const openEditModal = () => {
    setEditName(staffUser.name)
    setEditEmail(staffUser.email)
    setEditPhone(staffUser.phone)
    setEditPosition(staffUser.position ?? '')
    setEditCurrentPassword('')
    setEditError(null)
    setEditModalOpen(true)
  }

  const closeEditModal = () => {
    setEditModalOpen(false)
    setEditError(null)
  }

  const openPasswordModal = () => {
    setPasswordCurrent('')
    setPasswordNew('')
    setPasswordConfirm('')
    setPasswordError(null)
    setPasswordModalOpen(true)
  }

  const closePasswordModal = () => {
    setPasswordModalOpen(false)
    setPasswordError(null)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEditError(null)
    setEditLoading(true)
    try {
      const updated = await patch<typeof staffUser>(
        '/api/staff/me',
        {
          name: editName.trim(),
          email: editEmail.trim(),
          phone: editPhone.trim(),
          position: editPosition.trim(),
          currentPassword: editCurrentPassword,
        },
        true
      )
      updateStaffUser(updated)
      closeEditModal()
    } catch (err) {
      setEditError(err instanceof StaffApiError ? err.message : 'Не удалось сохранить')
    } finally {
      setEditLoading(false)
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwordNew !== passwordConfirm) {
      setPasswordError('Новый пароль и подтверждение не совпадают')
      return
    }
    if (passwordNew.length < 1) {
      setPasswordError('Введите новый пароль')
      return
    }
    setPasswordError(null)
    setPasswordLoading(true)
    try {
      await put(
        '/api/staff/me/password',
        {
          currentPassword: passwordCurrent,
          newPassword: passwordNew,
        },
        true
      )
      closePasswordModal()
    } catch (err) {
      setPasswordError(err instanceof StaffApiError ? err.message : 'Произошла ошибка')
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <>
      <div className="staff-content">
        <table className="cabinet-table">
          <caption className="cabinet-table-caption">Данные сотрудника</caption>
          <tbody>
            <tr>
              <th scope="row">Имя</th>
              <td>{staffUser.name}</td>
            </tr>
            <tr>
              <th scope="row">Email</th>
              <td>{staffUser.email}</td>
            </tr>
            <tr>
              <th scope="row">Телефон</th>
              <td>{staffUser.phone}</td>
            </tr>
            <tr>
              <th scope="row">Должность</th>
              <td>{staffUser.position || '—'}</td>
            </tr>
            <tr>
              <th scope="row">Роль</th>
              <td>{staffUser.role}</td>
            </tr>
          </tbody>
        </table>
        <div className="cabinet-actions">
          <button type="button" className="cabinet-edit-btn" onClick={openEditModal}>
            Изменить данные
          </button>
          <button type="button" className="cabinet-password-btn" onClick={openPasswordModal}>
            Изменить пароль
          </button>
        </div>
      </div>

      {editModalOpen && (
        <div className="cabinet-modal-overlay" onClick={closeEditModal}>
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">Изменить данные</h3>
            <form className="cabinet-modal-form" onSubmit={handleEditSubmit}>
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
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="staff-edit-current-password">Текущий пароль *</label>
                <input
                  id="staff-edit-current-password"
                  type="password"
                  className="cabinet-modal-input"
                  value={editCurrentPassword}
                  onChange={(e) => setEditCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closeEditModal}>
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

      {passwordModalOpen && (
        <div className="cabinet-modal-overlay" onClick={closePasswordModal}>
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">Изменить пароль</h3>
            <form className="cabinet-modal-form" onSubmit={handlePasswordSubmit}>
              {passwordError && <p className="cabinet-modal-error" role="alert">{passwordError}</p>}
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="staff-password-current">Текущий пароль *</label>
                <input
                  id="staff-password-current"
                  type="password"
                  className="cabinet-modal-input"
                  value={passwordCurrent}
                  onChange={(e) => setPasswordCurrent(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="staff-password-new">Новый пароль *</label>
                <input
                  id="staff-password-new"
                  type="password"
                  className="cabinet-modal-input"
                  value={passwordNew}
                  onChange={(e) => setPasswordNew(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label" htmlFor="staff-password-confirm">Подтверждение пароля *</label>
                <input
                  id="staff-password-confirm"
                  type="password"
                  className="cabinet-modal-input"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closePasswordModal}>
                  Отмена
                </button>
                <button type="submit" className="cabinet-modal-submit" disabled={passwordLoading}>
                  {passwordLoading ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
