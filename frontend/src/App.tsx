import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { StaffAuthProvider, useStaffAuth } from './context/StaffAuthContext'
import HomePage from './pages/HomePage'
import CabinetPage from './pages/CabinetPage'
import CmsPage from './pages/CmsPage'
import { StaffLayout } from './components/StaffLayout'
import StaffLoginPage from './pages/StaffLoginPage'
import StaffHomePage from './pages/StaffHomePage'
import StaffCabinetPage from './pages/StaffCabinetPage'
import StaffSpaceTypesPage from './pages/StaffSpaceTypesPage'
import StaffSpacesPage from './pages/StaffSpacesPage'
import StaffAmenitiesPage from './pages/StaffAmenitiesPage'
import StaffTariffsPage from './pages/StaffTariffsPage'
import './App.css'

function StaffGate() {
  const { staffUser } = useStaffAuth()
  if (staffUser) return <StaffHomePage />
  return <StaffLoginPage />
}

function App() {
  return (
    <AuthProvider>
      <StaffAuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/cabinet" element={<CabinetPage />} />
            <Route path="/cms" element={<CmsPage />} />
            <Route path="/staff" element={<StaffLayout />}>
              <Route index element={<StaffGate />} />
              <Route path="cabinet" element={<StaffCabinetPage />} />
              <Route path="space-types" element={<StaffSpaceTypesPage />} />
              <Route path="spaces" element={<StaffSpacesPage />} />
              <Route path="amenities" element={<StaffAmenitiesPage />} />
              <Route path="tariffs" element={<StaffTariffsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </StaffAuthProvider>
    </AuthProvider>
  )
}

export default App
