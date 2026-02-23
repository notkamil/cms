import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useStaffAuth } from '../context/StaffAuthContext'
import './CabinetPage.css'
import './StaffCabinetPage.css'

export default function StaffCabinetPage() {
  const { staffUser } = useStaffAuth()
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)

  if (!staffUser) {
    return <Navigate to="/staff" replace />
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
          <button type="button" className="cabinet-edit-btn" onClick={() => setEditModalOpen(true)}>
            Изменить данные
          </button>
          <button type="button" className="cabinet-password-btn" onClick={() => setPasswordModalOpen(true)}>
            Изменить пароль
          </button>
        </div>
      </div>

      {editModalOpen && (
        <div
          className="cabinet-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setEditModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="staff-edit-modal-title"
        >
          <div className="cabinet-modal">
            <h2 id="staff-edit-modal-title" className="cabinet-modal-title">Изменить данные</h2>
            <p className="cabinet-modal-error" style={{ margin: '1rem' }}>
              Функция в разработке. Будет доступна после добавления API на бэкенде.
            </p>
            <div className="cabinet-modal-actions" style={{ justifyContent: 'flex-end', margin: '1rem' }}>
              <button type="button" className="cabinet-modal-cancel" onClick={() => setEditModalOpen(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordModalOpen && (
        <div
          className="cabinet-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setPasswordModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="staff-password-modal-title"
        >
          <div className="cabinet-modal">
            <h2 id="staff-password-modal-title" className="cabinet-modal-title">Изменить пароль</h2>
            <p className="cabinet-modal-error" style={{ margin: '1rem' }}>
              Функция в разработке. Будет доступна после добавления API на бэкенде.
            </p>
            <div className="cabinet-modal-actions" style={{ justifyContent: 'flex-end', margin: '1rem' }}>
              <button type="button" className="cabinet-modal-cancel" onClick={() => setPasswordModalOpen(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
