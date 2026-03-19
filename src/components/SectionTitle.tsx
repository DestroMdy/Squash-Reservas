export function SectionTitle({
  title,
  subtitle
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="surface-pill inline-flex text-[11px] uppercase tracking-[0.24em] text-slate-500">
        La Martineta
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
