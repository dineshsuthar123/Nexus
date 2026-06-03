import Link from 'next/link';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

type InfoSection = {
  title: string;
  body: string;
  points?: string[];
};

type InfoPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  sections: InfoSection[];
};

export function InfoPage({ eyebrow, title, description, sections }: InfoPageProps) {
  return (
    <main className="min-h-screen bg-white text-neutral-950 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-950 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Nexus RTP
        </Link>

        <section className="py-14 sm:py-20">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400">
            {eyebrow}
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-neutral-600 dark:text-slate-300">
            {description}
          </p>
        </section>

        <section className="grid gap-8 pb-20">
          {sections.map((section) => (
            <article
              key={section.title}
              className="border-t border-neutral-200 pt-8 dark:border-slate-800"
            >
              <h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
              <p className="mt-3 leading-7 text-neutral-600 dark:text-slate-300">
                {section.body}
              </p>
              {section.points ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {section.points.map((point) => (
                    <div key={point} className="flex gap-3 text-sm text-neutral-700 dark:text-slate-300">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
