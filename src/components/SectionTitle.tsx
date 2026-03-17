export function SectionTitle({
  title,
  subtitle
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      {subtitle ? <p className="text-sm text-slate-600">{subtitle}</p> : null}
    </div>
  );
}