export default function DashboardLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="h-6 w-40 rounded-md bg-muted" />
        <div className="h-4 w-64 rounded-md bg-muted" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted/70" />
        ))}
      </div>

      <div className="h-48 rounded-xl bg-muted/70" />
    </div>
  );
}
