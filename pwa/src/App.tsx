import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useThemeStore } from './stores/themeStore'
import { useSessionStore } from './stores/sessionStore'
import { useBleStore } from './stores/bleStore'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import LoadingSpinner from './components/LoadingSpinner'
import ErrorBoundary from './components/ErrorBoundary'
import WelcomeScreen from './screens/WelcomeScreen'
import SessionsScreen from './screens/SessionsScreen'
import SettingsScreen from './screens/SettingsScreen'

// Lazy-load Recharts-heavy screens to reduce initial bundle
const SessionDetailScreen  = lazy(() => import('./screens/SessionDetailScreen'))
const AttemptDetailScreen  = lazy(() => import('./screens/AttemptDetailScreen'))
const LiveScreen           = lazy(() => import('./screens/LiveScreen'))
const DeviceScreen         = lazy(() => import('./screens/DeviceScreen'))

function AppContent() {
  const { theme } = useThemeStore()
  const { sessions, isLoading, load } = useSessionStore()
  const { isConnected, sync } = useBleStore()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (isConnected) void sync(() => void load())
  }, [isConnected, sync, load])

  if (isLoading) return null

  const hasData = sessions.length > 0

  return (
    <div className="flex flex-col min-h-svh bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <Header />
      <main className="flex-1 overflow-y-auto pb-16">
        <Suspense fallback={<LoadingSpinner fullScreen />}>
          {!hasData ? (
            <WelcomeScreen />
          ) : (
            <Routes>
              <Route path="/" element={<Navigate to="/sessions" replace />} />
              <Route path="/sessions" element={<SessionsScreen />} />
              <Route path="/sessions/:id" element={<SessionDetailScreen />} />
              <Route path="/sessions/:id/attempts/:attemptId" element={<AttemptDetailScreen />} />
              <Route path="/live" element={<LiveScreen />} />
              <Route path="/device" element={<DeviceScreen />} />
              <Route path="/settings" element={<SettingsScreen />} />
              <Route path="*" element={<Navigate to="/sessions" replace />} />
            </Routes>
          )}
        </Suspense>
      </main>
      {hasData && <BottomNav />}
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
