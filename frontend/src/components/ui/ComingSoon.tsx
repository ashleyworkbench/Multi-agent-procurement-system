import { Construction } from "lucide-react";

export function ComingSoon({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {desc && <p className="text-sm text-slate-500 mt-0.5">{desc}</p>}
      </div>
      <div className="section-card p-16 flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
          <Construction size={26} className="text-amber-500" />
        </div>
        <p className="text-base font-semibold text-slate-700">Coming soon</p>
        <p className="text-sm text-slate-400 mt-1.5 max-w-sm">
          This section is part of the full multi-agent system and will be built in the next module.
        </p>
      </div>
    </div>
  );
}
