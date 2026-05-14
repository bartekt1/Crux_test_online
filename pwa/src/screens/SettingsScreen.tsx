import { useRef } from 'react'
import { useThemeStore } from '../stores/themeStore'
import { useSessionStore } from '../stores/sessionStore'
import { exportBackup, importBackup } from '../lib/backup'

export default function SettingsScreen() {
  const { theme, toggle } = useThemeStore()
  const { load, clearAll } = useSessionStore()
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await importBackup(file)
      await load()
      alert(`Zaimportowano ${result.sessions} sesji, ${result.records} rekordów`)
    } catch (err) {
      alert(`Błąd importu: ${(err as Error).message}`)
    }
  }

  async function handleClearAll() {
    if (!confirm('Usunąć wszystkie lokalne dane sesji? Danych na urządzeniu to nie dotyczy.')) return
    await clearAll()
  }

  return (
    <div className="p-4 flex flex-col gap-6">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Ustawienia</h2>

      {/* Appearance */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Wygląd
        </h3>
        <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-2xl px-4 py-3">
          <span className="text-gray-900 dark:text-white font-medium">Tryb ciemny</span>
          <button
            onClick={toggle}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              theme === 'dark' ? 'bg-violet-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                theme === 'dark' ? 'translate-x-6' : ''
              }`}
            />
          </button>
        </div>
      </section>

      {/* Backup */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Dane
        </h3>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => void exportBackup()}
            className="w-full py-3 rounded-2xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition-colors"
          >
            Eksportuj backup (JSON)
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full py-3 rounded-2xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Importuj backup
          </button>
          <input
            ref={fileRef} type="file" accept=".json" className="hidden"
            onChange={(e) => void handleImport(e)}
          />
        </div>
      </section>

      {/* Reset */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Reset
        </h3>
        <button
          onClick={() => void handleClearAll()}
          className="w-full py-3 rounded-2xl border border-red-200 dark:border-red-900
            text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          Wyczyść wszystkie dane lokalne
        </button>
        <p className="text-xs text-gray-400 dark:text-gray-500 px-1">
          Usuwa sesje z tej przeglądarki. Danych na urządzeniu nie dotyczy.
        </p>
      </section>
    </div>
  )
}
