import type { Meta, StoryObj } from '@storybook/react';
import { AuditBadge, HashDisplay, AuditTrail, SignatureVerification } from '../components/Audit/Audit';
import type { AuditEntry } from '../components/Audit/Audit';

const meta: Meta<typeof AuditTrail> = {
  title: 'Fintech/Audit',
  component: AuditTrail,
  tags: ['autodocs'],
};

export default meta;

const sampleEntries: AuditEntry[] = [
  {
    id: 'ae-001',
    action: 'Payment Created',
    actor: 'admin@company.com',
    actorType: 'user',
    timestamp: new Date().toISOString(),
    details: 'Created wire transfer of $50,000 to Acme Corp',
    verified: true,
    hash: 'a3f2b8c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0',
  },
  {
    id: 'ae-002',
    action: 'Compliance Check Passed',
    actor: 'compliance-engine',
    actorType: 'system',
    timestamp: new Date(Date.now() - 60000).toISOString(),
    details: 'AML/CFT screening completed - no matches',
    verified: true,
    hash: 'b4c3d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2',
  },
  {
    id: 'ae-003',
    action: 'Payment Authorized',
    actor: 'api-key:nxs_prod_***',
    actorType: 'api',
    timestamp: new Date(Date.now() - 120000).toISOString(),
    details: 'Dual authorization completed',
    verified: true,
    hash: 'c5d4e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3',
    ipAddress: '192.168.1.100',
  },
  {
    id: 'ae-004',
    action: 'Settlement Confirmed',
    actor: 'settlement-engine',
    actorType: 'system',
    timestamp: new Date(Date.now() - 300000).toISOString(),
    details: 'Funds settled via SWIFT gpi tracker',
    verified: false,
    hash: 'd6e5f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4',
  },
];

export const AuditTrailView: StoryObj<typeof AuditTrail> = {
  args: {
    entries: sampleEntries,
    showVerification: true,
    showHash: false,
  },
};

export const WithHashes: StoryObj<typeof AuditTrail> = {
  args: {
    entries: sampleEntries,
    showVerification: true,
    showHash: true,
  },
};

export const EmptyAuditTrail: StoryObj<typeof AuditTrail> = {
  args: {
    entries: [],
  },
};

export const VerificationBadges: StoryObj = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <AuditBadge status="verified" />
      <AuditBadge status="failed" />
      <AuditBadge status="pending" />
      <AuditBadge status="not_verified" />
      <AuditBadge status="expired" />
    </div>
  ),
};

export const HashDisplayView: StoryObj = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <HashDisplay hash="a3f2b8c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0" verified copyable />
      <HashDisplay hash="b4c3d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2" verified={false} copyable />
      <HashDisplay hash="c5d4e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3" truncateLength={8} />
    </div>
  ),
};

export const SignatureVerificationView: StoryObj<typeof SignatureVerification> = {
  render: () => (
    <div className="space-y-4 max-w-lg">
      <SignatureVerification
        signature="MEUCIQDq2F...base64..."
        keyId="key-2024-01-prod"
        signedAt="2024-01-15T10:00:00Z"
        status="verified"
        algorithm="ECDSA-SHA256"
      />
      <SignatureVerification
        signature="MEQCIA...base64..."
        keyId="key-2024-01-stg"
        signedAt="2024-01-15T09:00:00Z"
        status="failed"
        algorithm="ECDSA-SHA256"
      />
    </div>
  ),
};
