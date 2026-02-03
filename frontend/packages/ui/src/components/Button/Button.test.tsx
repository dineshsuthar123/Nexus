import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';
import { Plus } from 'lucide-react';

describe('Button', () => {
  describe('Rendering', () => {
    it('renders with default props', () => {
      render(<Button>Click me</Button>);
      const button = screen.getByRole('button', { name: 'Click me' });
      expect(button).toBeInTheDocument();
    });

    it('renders all variants correctly', () => {
      const variants = ['primary', 'secondary', 'outline', 'ghost', 'danger', 'success', 'link'] as const;
      
      variants.forEach((variant) => {
        const { unmount } = render(<Button variant={variant}>{variant}</Button>);
        expect(screen.getByRole('button')).toBeInTheDocument();
        unmount();
      });
    });

    it('renders all sizes correctly', () => {
      const sizes = ['sm', 'md', 'lg', 'xl', 'icon'] as const;
      
      sizes.forEach((size) => {
        const { unmount } = render(<Button size={size}>{size}</Button>);
        expect(screen.getByRole('button')).toBeInTheDocument();
        unmount();
      });
    });

    it('renders with left and right icons', () => {
      render(
        <Button leftIcon={<Plus data-testid="left-icon" />} rightIcon={<Plus data-testid="right-icon" />}>
          With Icons
        </Button>
      );
      
      expect(screen.getByTestId('left-icon')).toBeInTheDocument();
      expect(screen.getByTestId('right-icon')).toBeInTheDocument();
    });

    it('renders full width when specified', () => {
      render(<Button fullWidth>Full Width</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('w-full');
    });
  });

  describe('Interactions', () => {
    it('calls onClick when clicked', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      
      render(<Button onClick={handleClick}>Click me</Button>);
      await user.click(screen.getByRole('button'));
      
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when disabled', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      
      render(<Button onClick={handleClick} disabled>Disabled</Button>);
      await user.click(screen.getByRole('button'));
      
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('does not call onClick when loading', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      
      render(<Button onClick={handleClick} loading>Loading</Button>);
      await user.click(screen.getByRole('button'));
      
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('can be activated with keyboard', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      
      render(<Button onClick={handleClick}>Press me</Button>);
      const button = screen.getByRole('button');
      
      button.focus();
      await user.keyboard('{Enter}');
      
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner when loading', () => {
      render(<Button loading>Submit</Button>);
      
      // Should have aria-busy attribute
      expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
      
      // Should show "Loading" for screen readers
      expect(screen.getByText('Loading')).toHaveClass('sr-only');
    });

    it('disables button when loading', () => {
      render(<Button loading>Submit</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('has proper disabled attributes', () => {
      render(<Button disabled>Disabled</Button>);
      const button = screen.getByRole('button');
      
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-disabled', 'true');
    });

    it('is focusable by default', () => {
      render(<Button>Focusable</Button>);
      const button = screen.getByRole('button');
      
      button.focus();
      expect(document.activeElement).toBe(button);
    });

    it('forwards ref correctly', () => {
      const ref = { current: null };
      render(<Button ref={ref}>With Ref</Button>);
      
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });

    it('passes custom className', () => {
      render(<Button className="custom-class">Custom</Button>);
      expect(screen.getByRole('button')).toHaveClass('custom-class');
    });

    it('spreads additional props', () => {
      render(<Button data-testid="custom-button" aria-label="Custom label">Props</Button>);
      const button = screen.getByTestId('custom-button');
      
      expect(button).toHaveAttribute('aria-label', 'Custom label');
    });
  });

  describe('asChild composition', () => {
    it('renders as a link when asChild is true', () => {
      render(
        <Button asChild>
          <a href="/dashboard">Go to Dashboard</a>
        </Button>
      );
      
      const link = screen.getByRole('link', { name: 'Go to Dashboard' });
      expect(link).toHaveAttribute('href', '/dashboard');
    });
  });
});
