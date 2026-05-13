export default function LoadingSpinner({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div className={`flex items-center justify-center ${fullScreen ? 'min-h-[calc(100svh-7.5rem)]' : 'py-12'}`}>
      <div className="w-8 h-8 rounded-full border-2 border-gray-200 dark:border-gray-700 border-t-violet-600 animate-spin" />
    </div>
  )
}
