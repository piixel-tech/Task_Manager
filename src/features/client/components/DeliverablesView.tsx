import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { ProgressBar } from '../../../components/ui/ProgressRing';
import { type Deliverables } from '../../../services/http/deliverableApi';
import { StageStepper } from '../../projects/components/DeliverablesTab';

/** One subfolder's deliverables for a month, read-only: each type's done/remaining and every item's stage stepper. */
export const DeliverablesView: React.FC<{ title: string; data: Deliverables }> = ({ title, data }) => {
  const donePct = data.total ? Math.round((100 * data.done) / data.total) : 0;
  const types = data.types.map((t) => ({ summary: t, items: data.items.filter((i) => i.type === t.type) }));

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-base font-extrabold">{title}</CardTitle>
          <span className="text-[13px] font-semibold text-[var(--tm-ink-soft)]">
            {data.done} done / {data.remaining} remaining
          </span>
        </div>
        <ProgressBar value={donePct} tone={data.remaining === 0 ? 'ok' : 'primary'} height={10} />
      </CardHeader>
      <CardContent className="space-y-6">
        {types.map(({ summary, items }) => (
          <section key={summary.type} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-[14px] font-extrabold text-[var(--tm-ink)]">{summary.type}</h4>
              <span className="text-[12.5px] font-semibold text-[var(--tm-ink-muted)]">
                {summary.done} done / {summary.remaining} remaining
              </span>
            </div>
            <ul className="space-y-3">
              {items.map((i) => (
                <li key={i.id} className="space-y-3 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px] font-bold text-[var(--tm-ink)]">{i.title}</span>
                    <span className="text-[12px] font-semibold text-[var(--tm-ink-soft)]">{data.stage_labels[i.stage] ?? i.stage}</span>
                  </div>
                  <StageStepper stages={data.stages} stage={i.stage} labels={data.stage_labels} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </CardContent>
    </Card>
  );
};
