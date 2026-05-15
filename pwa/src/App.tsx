import { lazy, Suspense, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useThemeStore } from './stores/themeStore'
import { useSessionStore } from './stores/sessionStore'
import { useJournalStore } from './stores/journalStore'
import { useBleStore } from './stores/bleStore'
import { ble } from './services/bleService'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import LoadingSpinner from './components/LoadingSpinner'
import ErrorBoundary from './components/ErrorBoundary'
import WelcomeScreen from './screens/WelcomeScreen'
import SessionsScreen from './screens/SessionsScreen'
import SettingsScreen from './screens/SettingsScreen'

// Lazy-load heavy screens to reduce initial bundle
const SessionDetailScreen  = lazy(() => import('./screens/SessionDetailScreen'))
const AttemptDetailScreen  = lazy(() => import('./screens/AttemptDetailScreen'))
const LiveScreen           = lazy(() => import('./screens/LiveScreen'))
const StatsScreen          = lazy(() => import('./screens/StatsScreen'))
const JournalScreen        = lazy(() => import('./screens/JournalScreen'))
const JournalDetailScreen  = lazy(() => import('./screens/JournalDetailScreen'))
const JournalEditScreen    = lazy(() => import('./screens/JournalEditScreen'))

function AppContent() {
  const { theme } = useThemeStore()
  const { sessions, isLoading, load } = useSessionStore()
  const { load: loadJournal } = useJournalStore()
  const { isConnected, sync } = useBleStore()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    void load()
    void loadJournal()
  }, [load, loadJournal])

  useEffect(() => {
    if (isConnected) void sync(() => void load())
  }, [isConnected, sync, load])

  // Po załadowaniu sesji na ekranie powitalnym → przejdź do listy sesji
  useEffect(() => {
    if (!isLoading && sessions.length > 0 && location.pathname === '/') {
      navigate('/sessions', { replace: true })
    }
  }, [isLoading, sessions.length, location.pathname, navigate])

  // Sync reference to avoid stale closure in the callback
  const syncRef = useRef(sync)
  const loadRef = useRef(load)
  useEffect(() => { syncRef.current = sync }, [sync])
  useEffect(() => { loadRef.current = load }, [load])

  // Auto-sync when device signals SESSION_END — captures full session data
  useEffect(() => {
    ble.onSessionEnd = () => {
      void syncRef.current(() => void loadRef.current())
    }
    return () => { ble.onSessionEnd = null }
  }, [])

  if (isLoading) return null

  const hasData = sessions.length > 0

  return (
    <div className="flex flex-col min-h-svh bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <Header />
      <main className="flex-1 overflow-y-auto pb-16">
        <Suspense fallback={<LoadingSpinner fullScreen />}>
          <Routes>
            <Route path="/" element={<WelcomeScreen />} />
            <Route path="/sessions" element={hasData ? <SessionsScreen /> : <Navigate to="/" replace />} />
            <Route path="/stats" element={<StatsScreen />} />
            <Route path="/sessions/:id" element={<SessionDetailScreen />} />
            <Route path="/sessions/:id/attempts/:attemptId" element={<AttemptDetailScreen />} />
            <Route path="/journal" element={<JournalScreen />} />
            <Route path="/journal/new" element={<JournalEditScreen />} />
            <Route path="/journal/:id" element={<JournalDetailScreen />} />
            <Route path="/journal/:id/edit" element={<JournalEditScreen />} />
            <Route path="/live" element={<LiveScreen />} />
            <Route path="/device" element={<Navigate to="/settings" replace />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <BottomNav />
    </div>
  )
}

export default function App() {
  // BASE_URL = '/' locally, '/Crux_test_online/' on GitHub Pages
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'
  return (
    <ErrorBoundary>
      <BrowserRouter basename={basename}>
        <AppContent />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
