import type { Meta, StoryObj } from '@storybook/react';
import { Skeleton } from '../components/Skeleton/Skeleton';

const meta: Meta<typeof Skeleton> = {
  title: 'Components/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Default: Story = {
  args: {
    className: 'h-4 w-[250px]',
  },
};

export const Circle: Story = {
  args: {
    className: 'h-12 w-12 rounded-full',
  },
};

export const CardSkeleton: Story = {
  render: () => (
    <div className="flex items-center space-x-4 rounded-lg border p-4">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[200px]" />
        <Skeleton className="h-4 w-[150px]" />
      </div>
    </div>
  ),
};

export const TableSkeleton: Story = {
  render: () => (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center">
          <Skeleton className="h-4 w-[60px]" />
          <Skeleton className="h-4 w-[180px]" />
          <Skeleton className="h-4 w-[100px]" />
          <Skeleton className="h-4 w-[80px]" />
        </div>
      ))}
    </div>
  ),
};

export const DashboardSkeleton: Story = {
  render: () => (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-6">
            <Skeleton className="h-3 w-[100px] mb-3" />
            <Skeleton className="h-8 w-[120px] mb-2" />
            <Skeleton className="h-3 w-[80px]" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border p-6">
        <Skeleton className="h-4 w-[200px] mb-4" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    </div>
  ),
};
