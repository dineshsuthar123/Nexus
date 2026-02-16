import { Suspense } from 'react';
import { Skeleton } from '@nexus/ui';
import AuditContent from './AuditContent';

export const metadata = {
  title: 'Audit Trail',
};

export default function AuditPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="page-header">
            <div>
              <Skeleton className="h-8 w-32" />
              <Skeleton className="mt-2 h-4 w-80" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      }
    >
      <AuditContent />
    </Suspense>
  );
}
