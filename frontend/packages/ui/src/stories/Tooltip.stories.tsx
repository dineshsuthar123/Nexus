import type { Meta, StoryObj } from '@storybook/react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  SimpleTooltip,
} from '../components/Tooltip/Tooltip';
import { HelpCircle, Info, Shield, AlertTriangle } from 'lucide-react';

const meta: Meta<typeof Tooltip> = {
  title: 'Components/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="inline-flex items-center gap-1 text-sm text-neutral-600 underline-offset-4 hover:underline">
          Settlement Date
          <HelpCircle className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>The date when funds become available in the recipient&apos;s account.</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const WithArrow: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="rounded-full p-2 hover:bg-neutral-100">
          <Info className="h-5 w-5 text-neutral-500" />
        </button>
      </TooltipTrigger>
      <TooltipContent arrow>
        <p>Hover to learn more about this feature</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const Positions: Story = {
  render: () => (
    <div className="flex flex-col items-center gap-8 py-16">
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="rounded-md border px-3 py-1.5 text-sm">Top (Default)</button>
        </TooltipTrigger>
        <TooltipContent side="top">Tooltip on top</TooltipContent>
      </Tooltip>
      <div className="flex gap-16">
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="rounded-md border px-3 py-1.5 text-sm">Left</button>
          </TooltipTrigger>
          <TooltipContent side="left">Tooltip on left</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="rounded-md border px-3 py-1.5 text-sm">Right</button>
          </TooltipTrigger>
          <TooltipContent side="right">Tooltip on right</TooltipContent>
        </Tooltip>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="rounded-md border px-3 py-1.5 text-sm">Bottom</button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Tooltip on bottom</TooltipContent>
      </Tooltip>
    </div>
  ),
};

export const SimpleTooltipUsage: Story = {
  name: 'SimpleTooltip Helper',
  render: () => (
    <div className="flex gap-4">
      <SimpleTooltip content="PCI-DSS Level 1 certified">
        <button className="inline-flex items-center gap-1 rounded-md border border-success-300 bg-success-50 px-3 py-1.5 text-sm text-success-700">
          <Shield className="h-4 w-4" /> Compliant
        </button>
      </SimpleTooltip>
      <SimpleTooltip content="3 unresolved discrepancies" side="bottom">
        <button className="inline-flex items-center gap-1 rounded-md border border-warning-300 bg-warning-50 px-3 py-1.5 text-sm text-warning-700">
          <AlertTriangle className="h-4 w-4" /> Review Required
        </button>
      </SimpleTooltip>
    </div>
  ),
};
