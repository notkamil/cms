import { useStaffAuth } from '../context/StaffAuthContext'
import './CabinetPage.css'
import './StaffHomePage.css'

/** Staff dashboard: links to cabinet, staff, spaces, tariffs, bookings, settings. */
export default function StaffHomePage() {
  const { staffUser } = useStaffAuth()

  if (!staffUser) {
    return null
  }

  return (
    <section className="staff-home-section">
      <div className="staff-auth-card">
        <h2 className="staff-auth-card-title">Вы вошли под учётной записью</h2>
        <p className="staff-auth-card-line staff-auth-card-name">{staffUser.name}</p>
        <p className="staff-auth-card-line staff-auth-card-muted">{staffUser.email}</p>
        <p className="staff-auth-card-line staff-auth-card-muted">Роль: {staffUser.role}</p>
        <p className="staff-auth-card-line staff-auth-card-muted">Должность: {staffUser.position || '—'}</p>
      </div>
    </section>
  )
}
