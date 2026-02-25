import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { StaffAuthProvider, useStaffAuth } from './context/StaffAuthContext'
import CabinetLayout from './components/CabinetLayout'
import HomePage from './pages/HomePage'
import CabinetPage from './pages/CabinetPage'
import CabinetSubscriptionsPage from './pages/CabinetSubscriptionsPage'
import CmsPage from './pages/CmsPage'
import { StaffLayout } from './components/StaffLayout'
import StaffLoginPage from './pages/StaffLoginPage'
import StaffHomePage from './pages/StaffHomePage'
import StaffCabinetPage from './pages/StaffCabinetPage'
import StaffSpacesPage from './pages/StaffSpacesPage'
import StaffAmenitiesPage from './pages/StaffAmenitiesPage'
import StaffTariffsPage from './pages/StaffTariffsPage'
import StaffSubscriptionsPage from './pages/StaffSubscriptionsPage'
import StaffBookingsPage from './pages/StaffBookingsPage'
import BookingsPage from './pages/BookingsPage'
import MyBookingsPage from './pages/MyBookingsPage'
import NotFoundPage from './pages/NotFoundPage'
import './App.css'

function StaffGate() {
  const { staffUser } = useStaffAuth()
  if (staffUser) return <StaffHomePage />
  return <StaffLoginPage />
}

function StaffRequireAuth({ children }: { children: React.ReactNode }) {
  const { staffUser } = useStaffAuth()
  if (!staffUser) return <Navigate to="/staff" replace />
  return <>{children}</>
}

function App() {
  return (
    <AuthProvider>
      <StaffAuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/cabinet" element={<CabinetLayout />}>
              <Route index element={<CabinetPage />} />
            </Route>
            <Route path="/subscriptions" element={<CabinetLayout />}>
              <Route index element={<CabinetSubscriptionsPage />} />
            </Route>
            <Route path="/bookings" element={<CabinetLayout />}>
              <Route index element={<BookingsPage />} />
            </Route>
            <Route path="/bookings/my" element={<CabinetLayout />}>
              <Route index element={<MyBookingsPage />} />
            </Route>
            <Route path="/cms" element={<CmsPage />} />
            <Route path="/staff" element={<StaffLayout />}>
              <Route index element={<StaffGate />} />
              <Route path="cabinet" element={<StaffRequireAuth><StaffCabinetPage /></StaffRequireAuth>} />
              <Route path="spaces" element={<StaffRequireAuth><StaffSpacesPage /></StaffRequireAuth>} />
              <Route path="amenities" element={<StaffRequireAuth><StaffAmenitiesPage /></StaffRequireAuth>} />
              <Route path="tariffs" element={<StaffRequireAuth><StaffTariffsPage /></StaffRequireAuth>} />
              <Route path="subscriptions" element={<StaffRequireAuth><StaffSubscriptionsPage /></StaffRequireAuth>} />
              <Route path="bookings" element={<StaffRequireAuth><StaffBookingsPage /></StaffRequireAuth>} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </StaffAuthProvider>
    </AuthProvider>
  )
}

export default App
