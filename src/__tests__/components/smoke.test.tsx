import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Logo from '@/components/ui/Logo';

describe('Logo Component', () => {
  it('renders the default logo text', () => {
    render(<Logo />);
    expect(screen.getByText('reclutify')).toBeInTheDocument();
  });

  it('renders with custom company name', () => {
    render(<Logo companyName="TestCorp" />);
    expect(screen.getByText('TestCorp')).toBeInTheDocument();
  });

  it('renders with small size class', () => {
    const { container } = render(<Logo size="small" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-xl');
  });

  it('renders with large size class', () => {
    const { container } = render(<Logo size="large" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-4xl');
  });

  it('renders with default size class', () => {
    const { container } = render(<Logo />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-2xl');
  });
});

describe('Sitemap Generation', () => {
  it('should export a valid sitemap function', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    const result = sitemap();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(5);

    // Verify homepage entry
    const homeEntry = result.find(entry => entry.url === 'https://www.reclutify.com');
    expect(homeEntry).toBeDefined();
    expect(homeEntry?.priority).toBe(1);

    // Verify all entries have required fields
    for (const entry of result) {
      expect(entry.url).toBeTruthy();
      expect(entry.url).toMatch(/^https:\/\//);
    }
  });
});

describe('Robots Configuration', () => {
  it('should export a valid robots function', async () => {
    const { default: robots } = await import('@/app/robots');
    const result = robots();

    expect(result.rules).toBeDefined();
    expect(result.sitemap).toBe('https://www.reclutify.com/sitemap.xml');

    // Should block admin and API routes
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const mainRule = rules[0];
    expect(mainRule.disallow).toContain('/admin/');
    expect(mainRule.disallow).toContain('/api/');
  });
});

describe('Manifest Configuration', () => {
  it('should export a valid manifest function', async () => {
    const { default: manifest } = await import('@/app/manifest');
    const result = manifest();

    expect(result.name).toContain('Reclutify');
    expect(result.short_name).toBe('Reclutify');
    expect(result.display).toBe('standalone');
    expect(result.start_url).toBe('/');
    expect(result.icons).toBeDefined();
    expect(result.icons!.length).toBeGreaterThanOrEqual(2);
  });
});
