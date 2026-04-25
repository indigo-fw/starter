import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';

import { ShortcodeRenderer } from '../ShortcodeRenderer';

describe('ShortcodeRenderer dev-mode unresolved %VAR% warning', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('warns in dev when content contains unresolved %VAR%', () => {
    vi.stubEnv('NODE_ENV', 'development');

    renderToString(
      <ShortcodeRenderer content="Hello %COMPANY_NAME%!" components={{}} />,
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('%COMPANY_NAME%');
    expect(warnSpy.mock.calls[0]?.[0]).toContain('resolveContentVars');
  });

  it('does NOT warn in production even with unresolved %VAR%', () => {
    vi.stubEnv('NODE_ENV', 'production');

    renderToString(
      <ShortcodeRenderer content="Hello %COMPANY_NAME%!" components={{}} />,
    );

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does NOT warn when content has no %VAR% placeholders', () => {
    vi.stubEnv('NODE_ENV', 'development');

    renderToString(
      <ShortcodeRenderer
        content="Hello world! 50% off, today only."
        components={{}}
      />,
    );

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
