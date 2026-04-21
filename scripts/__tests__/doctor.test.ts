import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

describe('indigo doctor', () => {
  it('runs without errors on a valid project', () => {
    const output = execSync('bun run indigo doctor', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });
    expect(output).toContain('All checks passed');
    expect(output).toContain('.env file exists');
    expect(output).toContain('DATABASE_URL is set');
    expect(output).toContain('module(s) installed');
    expect(output).toContain('All generated files present');
    expect(output).toContain('node_modules/ present');
  }, 15_000);

  it('reports module count', () => {
    const output = execSync('bun run indigo doctor', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });
    // Should report the number of currently installed modules
    expect(output).toMatch(/\d+ module\(s\) installed/);
  }, 15_000);
});
