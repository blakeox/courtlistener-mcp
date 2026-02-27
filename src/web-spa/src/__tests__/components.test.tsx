import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Card, Button, StatusBanner, FormField, Input, Stepper, formatDate } from '../components/ui';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Hello</Card>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders title and subtitle', () => {
    render(<Card title="My Title" subtitle="Sub">Content</Card>);
    expect(screen.getByText('My Title')).toBeInTheDocument();
    expect(screen.getByText('Sub')).toBeInTheDocument();
  });

  it('renders as section with ui-card class', () => {
    const { container } = render(<Card>Test</Card>);
    expect(container.querySelector('section.ui-card')).toBeInTheDocument();
  });

  it('omits title and subtitle when not provided', () => {
    const { container } = render(<Card>Content</Card>);
    expect(container.querySelector('h2')).toBeNull();
    expect(container.querySelector('.muted')).toBeNull();
  });
});

describe('Button', () => {
  it('renders with primary variant by default', () => {
    render(<Button>Click</Button>);
    const btn = screen.getByRole('button', { name: 'Click' });
    expect(btn.className).toContain('primary');
  });

  it('renders with secondary variant', () => {
    render(<Button variant="secondary">Cancel</Button>);
    const btn = screen.getByRole('button', { name: 'Cancel' });
    expect(btn.className).toContain('secondary');
  });

  it('renders with danger variant', () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn.className).toContain('danger');
  });

  it('passes through disabled prop', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('StatusBanner', () => {
  it('returns null when message is empty', () => {
    const { container } = render(<StatusBanner message="" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders message with default info type', () => {
    render(<StatusBanner message="Loading..." />);
    const el = screen.getByRole('status');
    expect(el).toHaveTextContent('Loading...');
    expect(el.className).toContain('info');
  });

  it('renders with error type', () => {
    render(<StatusBanner message="Error!" type="error" />);
    const el = screen.getByRole('status');
    expect(el.className).toContain('error');
  });

  it('renders with alert role', () => {
    render(<StatusBanner message="Alert!" role="alert" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Alert!');
  });
});

describe('FormField', () => {
  it('renders label and children', () => {
    render(
      <FormField id="test" label="Name">
        <input id="test" />
      </FormField>
    );
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('renders hint text', () => {
    render(
      <FormField id="test" label="Name" hint="Enter your name">
        <input id="test" />
      </FormField>
    );
    expect(screen.getByText('Enter your name')).toBeInTheDocument();
  });

  it('renders error text with alert role', () => {
    render(
      <FormField id="test" label="Name" error="Required">
        <input id="test" />
      </FormField>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });
});

describe('Input', () => {
  it('renders an input element', () => {
    render(<Input type="text" placeholder="Enter" />);
    expect(screen.getByPlaceholderText('Enter')).toBeInTheDocument();
  });
});

describe('Stepper', () => {
  it('renders steps with correct states', () => {
    const steps = [
      { label: 'Step 1', complete: true, to: '/step1' },
      { label: 'Step 2', complete: false, active: true, to: '/step2' },
      { label: 'Step 3', complete: false, disabled: true },
    ];
    render(
      <MemoryRouter>
        <Stepper steps={steps} />
      </MemoryRouter>
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0].className).toContain('done');
    expect(items[1].className).toContain('active');
    expect(items[2].className).toContain('disabled');
  });

  it('renders links for non-disabled steps', () => {
    const steps = [
      { label: 'Step 1', complete: false, to: '/step1' },
    ];
    render(
      <MemoryRouter>
        <Stepper steps={steps} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /Step 1/ })).toBeInTheDocument();
  });
});

describe('formatDate', () => {
  it('formats ISO date string', () => {
    const result = formatDate('2024-01-15T10:30:00Z');
    expect(result).toContain('Jan');
    expect(result).toContain('15');
    expect(result).toContain('2024');
  });

  it('returns original string on invalid date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});
