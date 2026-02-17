import type { Meta, StoryObj } from '@storybook/react';
import { Progress } from '../components/Progress/Progress';

const meta: Meta<typeof Progress> = {
  title: 'Components/Progress',
  component: Progress,
  tags: ['autodocs'],
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 100 } },
  },
};

export default meta;
type Story = StoryObj<typeof Progress>;

export const Default: Story = {
  args: { value: 60 },
};

export const Empty: Story = {
  args: { value: 0 },
};

export const Full: Story = {
  args: { value: 100 },
};

export const ReconciliationProgress: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>Reconciliation Match Rate</span>
          <span className="font-mono">97.3%</span>
        </div>
        <Progress value={97.3} className="h-2" />
      </div>
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>Batch Processing</span>
          <span className="font-mono">45/100</span>
        </div>
        <Progress value={45} className="h-2" />
      </div>
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>Migration Progress</span>
          <span className="font-mono">12%</span>
        </div>
        <Progress value={12} className="h-2" />
      </div>
    </div>
  ),
};
