import { Suspense } from 'react';
import { Skeleton } from '@nexus/ui';
import AnalyticsContent from './AnalyticsContent';

export const metadata = {
  title: 'Analytics',
};

export default function AnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="page-header">
            <div>
              <Skeleton className="h-8 w-32" />
              <Skeleton className="mt-2 h-4 w-64" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      }
    >
      <AnalyticsContent />
    </Suspense>
  );
}
