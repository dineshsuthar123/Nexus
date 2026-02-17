/**
 * Nexus RTP Platform - 403 Forbidden Page
 */

import Link from 'next/link';
import { ShieldX } from 'lucide-react';
import { Button, Card } from '@nexus/ui';

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <ShieldX className="h-8 w-8 text-destructive" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Access Denied
          </h1>
          <p className="text-muted-foreground">
            You don't have permission to access this page. 
            Please contact your administrator if you believe this is an error.
          </p>
        </div>

        <div className="space-y-3">
          <Link href="/dashboard">
            <Button className="w-full">
              Go to Dashboard
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="w-full">
              Go to Home
            </Button>
          </Link>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          Error Code: 403 Forbidden
        </p>
      </Card>
    </div>
  );
}
