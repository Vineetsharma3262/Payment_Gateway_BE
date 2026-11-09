import { join } from 'node:path';
import {
  FileTemplateStore,
  renderTemplate,
} from '../../../integrations/notifications/template-loader';

describe('renderTemplate', () => {
  it('substitutes {{name}} placeholders', () => {
    expect(renderTemplate('Hi {{name}}!', { name: 'Vipin' })).toBe('Hi Vipin!');
  });

  it('leaves unknown variables as the literal placeholder', () => {
    // So a typo like {{nmae}} surfaces in logs rather than silently rendering empty.
    expect(renderTemplate('Hi {{nmae}}!', { name: 'Vipin' })).toBe('Hi {{nmae}}!');
  });

  it('ignores whitespace inside the placeholder braces', () => {
    expect(renderTemplate('{{ name }}', { name: 'Vipin' })).toBe('Vipin');
  });

  it('does not evaluate HTML entities or script', () => {
    // The template is HTML; the renderer only does string replacement, so
    // callers must sanitise untrusted variables themselves. This test pins
    // that behaviour so a future "auto-escape" change is a conscious choice.
    expect(renderTemplate('{{v}}', { v: '<script>' })).toBe('<script>');
  });
});

describe('FileTemplateStore', () => {
  const store = new FileTemplateStore(
    join(__dirname, '..', '..', '..', 'integrations', 'notifications', 'templates'),
    ['password_reset'],
  );

  it('loads subject, html and text from disk', () => {
    const rendered = store.render('password_reset', {
      brand: 'Nimbus',
      name: 'Vipin',
      email: 'vipin@example.test',
      resetUrl: 'https://nimbus.test/reset-password?token=abc',
      expiresInMinutes: '30',
    });
    expect(rendered.subject).toBe('Reset your Nimbus password');
    expect(rendered.html).toContain('vipin@example.test');
    expect(rendered.html).toContain('https://nimbus.test/reset-password?token=abc');
    expect(rendered.text).toContain('Hi Vipin,');
    expect(rendered.text).toContain('30 minutes');
  });

  it('exposes loaded template names', () => {
    expect(store.names()).toEqual(['password_reset']);
    expect(store.has('password_reset')).toBe(true);
    expect(store.has('unknown')).toBe(false);
  });

  it('refuses unsafe template names (path traversal)', () => {
    expect(() => store.render('../etc/passwd', {})).toThrow(/Unsafe template name/);
  });
});
