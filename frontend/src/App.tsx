import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import HomePage from './pages/HomePage'
import CabinetPage from './pages/CabinetPage'
import CmsPage from './pages/CmsPage'
import './App.css'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/cabinet" element={<CabinetPage />} />
          <Route path="/cms" element={<CmsPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
