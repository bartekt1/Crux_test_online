import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBleStore } from '../stores/bleStore'
import { useSessionStore } from '../stores/sessionStore'
import { MountainIcon } from '../components/Icons'
import { importBackup } from '../lib/backup'
import { seedDemoData } from '../lib/seedData'

export default function WelcomeScreen() {
  const navigate = useNavigate()
  const { isConnected, isSyncing, syncProgress, error, connect, sync, clearError } = useBleStore()
  const { load } = useSessionStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isSeeding, setIsSeeding] = useState(false)

  async function handleConnect() {
    clearError()
    if (!isConnected) await connect()
    else await sync(() => void load())
  }

  async function handleDemo() {
    setIsSeeding(true)
    try {
      await seedDemoData()
      await load()
      navigate('/sessions')
    } finally {
      setIsSeeding(false)
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await importBackup(file)
      await load()
      console.info(`Zaimportowano ${result.sessions} sesji`)
      navigate('/sessions')
    } catch (err) {
      console.error('Import failed', err)
    }
  }

  const buttonLabel = isSyncing
    ? 'Synchronizacja...'
    : isConnected
      ? 'Synchronizuj sesje'
      : 'Połącz urządzenie'

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100svh-3.5rem)] px-6 text-center gap-6">
      <div className="w-24 h-24 rounded-3xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
        <MountainIcon className="w-14 h-14 text-violet-600 dark:text-violet-400" />
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">CruxTracker</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed max-w-xs">
          Połącz urządzenie aby automatycznie zsynchronizować sesje wspinaczkowe.
        </p>
      </div>

      {syncProgress && (
        <div className="w-full max-w-xs bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
          {syncProgress.message}
        </div>
      )}

      {error && (
        <p className="text-red-500 text-sm max-w-xs">{error}</p>
      )}

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={() => void handleConnect()}
          disabled={isSyncing}
          className="w-full py-3 rounded-2xl bg-violet-600 text-white font-semibold
            hover:bg-violet-700 active:bg-violet-800 disabled:opacity-50 transition-colors"
        >
          {buttonLabel}
        </button>

        <button
          onClick={() => void handleDemo()}
          disabled={isSeeding}
          className="w-full py-3 rounded-2xl border border-violet-200 dark:border-violet-800
            text-violet-600 dark:text-violet-400 font-medium text-sm
            hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-50 transition-colors"
        >
          {isSeeding ? 'Ładowanie demo...' : '🧗 Wypróbuj z danymi demo'}
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-3 rounded-2xl border border-gray-200 dark:border-gray-700
            text-gray-600 dark:text-gray-400 font-medium text-sm
            hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Importuj backup
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => void handleImport(e)}
        />
      </div>
    </div>
  )
}
