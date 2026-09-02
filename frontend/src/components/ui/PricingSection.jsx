import { CheckCircle2, Sparkles } from 'lucide-react';
import { formatMoney } from '../../utils/formatters.js';

function FeatureList({ features = [] }) {
  return (
    <ul className="space-y-3">
      {features.map((feature) => (
        <li key={feature} className="flex items-start gap-3 text-sm text-slate-600">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-indigo-500" />
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PricingSection({
  title,
  description,
  plans = [],
  actionLabel = 'مدیریت پکیج',
  onAction,
}) {
  return (
    <section className="rounded-[2rem] bg-white px-6 py-8 shadow-sm ring-1 ring-slate-200/80 sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-black text-indigo-700">
          <Sparkles size={14} />
          پیکربندی بسته‌های اشتراک
        </div>
        <h2 className="text-3xl font-black text-slate-950">{title}</h2>
        <p className="max-w-2xl text-base leading-8 text-slate-500 sm:text-lg">{description}</p>

        <div className="mt-6 grid w-full grid-cols-1 gap-6 min-[900px]:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.id}
              className={`flex flex-col rounded-[1.75rem] border bg-white p-6 text-right shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg ${
                plan.featured ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200'
              }`}
            >
              <div className="text-center">
                <div className="inline-flex items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${
                      plan.featured ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {plan.badge}
                  </span>
                  {plan.featured ? (
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">پیشنهادی</span>
                  ) : null}
                </div>
                <h3 className="mt-5 text-2xl font-black text-slate-950">{plan.title}</h3>
                <div className="mt-3 text-3xl font-black text-indigo-600">{formatMoney(plan.price)}</div>
                <p className="mt-2 text-sm text-slate-500">{plan.periodLabel}</p>
                {plan.description ? <p className="mt-4 text-sm leading-7 text-slate-500">{plan.description}</p> : null}
              </div>

              <div className="my-6 border-t border-slate-200" />

              <div className="mb-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                <div className="flex items-center justify-between gap-3">
                  <span>درخواست پرو</span>
                  <strong className="text-slate-900">{plan.proCount}</strong>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>سقف ماهانه</span>
                  <strong className="text-slate-900">{plan.monthlyLimit}</strong>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>وضعیت</span>
                  <strong className={plan.status === 'active' ? 'text-emerald-600' : 'text-rose-500'}>
                    {plan.statusLabel}
                  </strong>
                </div>
              </div>

              <FeatureList features={plan.features} />

              <button
                type="button"
                className={`mt-8 w-full rounded-full px-4 py-3 text-sm font-bold transition ${
                  plan.featured
                    ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
                onClick={() => onAction?.(plan.raw)}
              >
                {actionLabel}
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
