import Link from "next/link";
import { ArrowRight, Building2, Layers, Box, Sparkles, Zap } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <nav className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Building2 size={20} className="text-emerald-600" />
          <span className="text-base font-semibold tracking-tight">DraftedAI</span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700">
            MVP
          </span>
        </div>
        <Link
          href="/draft"
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Open the studio →
        </Link>
      </nav>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-10 px-6 py-16 text-center">
        <div className="flex flex-col items-center gap-6">
          <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600 shadow-sm">
            <Sparkles size={12} className="text-emerald-600" /> Powered by Claude Sonnet 4.6
          </span>
          <h1 className="max-w-3xl text-balance text-5xl font-bold tracking-tight text-neutral-900 sm:text-6xl">
            Forget architects and months of waiting.
            <br />
            <span className="bg-gradient-to-r from-emerald-600 to-sky-600 bg-clip-text text-transparent">
              DraftedAI builds your dream home.
            </span>
          </h1>
          <p className="max-w-2xl text-balance text-lg text-neutral-600">
            Draw any shape — even the wildest ones — and DraftedAI delivers professional
            floor plans, unlimited layouts, and realistic 3D models. In real time.
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/draft"
              className="group inline-flex items-center gap-2 rounded-md bg-neutral-900 px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-neutral-800"
            >
              Start drawing
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <span className="text-sm text-neutral-500">Free during MVP</span>
          </div>
        </div>

        <div className="grid w-full max-w-5xl grid-cols-1 gap-4 pt-8 md:grid-cols-3">
          <Feature
            icon={<Layers size={18} />}
            title="Professional drawings"
            body="Walls, doors, windows, dimension lines — output looks like a real architect's plan, not a sketch."
          />
          <Feature
            icon={<Sparkles size={18} />}
            title="Unlimited variants"
            body="One footprint, endless layouts. Hit Variant to remix room arrangements until you're happy."
          />
          <Feature
            icon={<Box size={18} />}
            title="Realistic 3D"
            body="Walk around your design in a real-time 3D scene with sun, shadows, and furniture."
          />
        </div>

        <div className="flex items-center gap-2 pt-6 text-xs text-neutral-500">
          <Zap size={12} className="text-amber-500" />
          MVP scope: residential homes, single-floor, English brief, desktop browser.
        </div>
      </main>

      <footer className="border-t border-neutral-200 bg-white px-6 py-4 text-center text-xs text-neutral-500">
        DraftedAI MVP · Built with Next.js, React Three Fiber, and Anthropic Claude.
      </footer>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 text-left shadow-sm">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      <p className="mt-1 text-sm text-neutral-600">{body}</p>
    </div>
  );
}
