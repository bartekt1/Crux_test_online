import { NavLink } from 'react-router-dom'
import { BarChartIcon, ListIcon, ActivityIcon, BookIcon, SettingsIcon } from './Icons'

const tabs = [
  { path: '/sessions', label: 'Sesje',      Icon: ListIcon },
  { path: '/stats',    label: 'Statystyki', Icon: BarChartIcon },
  { path: '/journal',  label: 'Dziennik',   Icon: BookIcon },
  { path: '/live',     label: 'Live',       Icon: ActivityIcon },
  { path: '/settings', label: 'Ustawienia', Icon: SettingsIcon },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 h-16 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex">
      {tabs.map(({ path, label, Icon }) => (
        <NavLink
          key={path}
          to={path}
          end={path === '/'}  // exact match only for home
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
              isActive
                ? 'text-violet-600 dark:text-violet-400'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={`w-5 h-5 ${isActive ? 'stroke-violet-600 dark:stroke-violet-400' : ''}`} />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
