interface AppEntry {
  id: string
  slug: string
  name: string
  description: string | null
  url: string
  iconUrl: string | null
  status: string
}

export function AppCard({ app }: { app: AppEntry }) {
  return (
    <a
      href={app.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4 transition-colors hover:border-indigo-700 hover:bg-neutral-800"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-800 group-hover:bg-neutral-700">
        {app.iconUrl ? (
          <img src={app.iconUrl} alt={app.name} className="h-6 w-6 object-contain" />
        ) : (
          <span className="text-lg font-bold text-indigo-400">
            {app.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div>
        <p className="text-sm font-medium">{app.name}</p>
        {app.description && (
          <p className="mt-0.5 text-xs text-neutral-400 line-clamp-2">{app.description}</p>
        )}
      </div>
    </a>
  )
}
