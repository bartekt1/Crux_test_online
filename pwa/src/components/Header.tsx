import { useBleStore } from '../stores/bleStore'
import { BluetoothIcon } from './Icons'

export default function Header() {
  const { isConnected, isSyncing, syncProgress, connect, disconnect } = useBleStore()

  const statusLabel = isSyncing
    ? (syncProgress?.message ?? 'Synchronizacja...')
    : isConnected
      ? 'Połączono'
      : 'Rozłączono'

  function handleBleButton() {
    if (isConnected) disconnect()
    else void connect()
  }

  return (
    <header className="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shrink-0">
      <div className="flex items-center justify-between px-4 h-14">
        <span className="font-bold text-lg tracking-tight text-gray-900 dark:text-white">
          CruxTracker
        </span>
        <button
          onClick={handleBleButton}
          disabled={isSyncing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors
            bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300
            hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isSyncing
                ? 'bg-amber-400 animate-pulse'
                : isConnected
                  ? 'bg-green-500'
                  : 'bg-gray-400'
            }`}
          />
          <BluetoothIcon className="w-3.5 h-3.5" />
          <span className="max-w-40 truncate">{statusLabel}</span>
        </button>
      </div>

      {/* Indeterminate progress bar during sync */}
      {isSyncing && (
        <div className="h-0.5 bg-violet-100 dark:bg-violet-900/40 overflow-hidden">
          <div className="h-full w-1/3 bg-violet-600 animate-[progress-slide_1.5s_linear_infinite]" />
        </div>
      )}
    </header>
  )
}
