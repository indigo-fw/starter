import { parsePoContent } from '../i18n/po-parse.mjs';
import { describe, expect, it } from 'vitest';

const HEADER = `msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"
`;

describe('parsePoContent', () => {
  it('maps msgid to namespace + key, dots encoded for next-intl', () => {
    const po = `${HEADER}
msgid "Hello"
msgstr "Hallo"

msgctxt "Nav"
msgid "Sign in."
msgstr "Anmelden."
`;
    expect(parsePoContent(po)).toEqual({
      General: { Hello: 'Hallo' },
      Nav: { 'Sign in@@@': 'Anmelden.' },
    });
  });

  it('falls back to the English msgid for an untranslated (empty) msgstr', () => {
    const po = `${HEADER}
msgid "Save changes"
msgstr ""

msgctxt "Nav::verb"
msgid "Post"
msgstr ""
`;
    expect(parsePoContent(po)).toEqual({
      General: { 'Save changes': 'Save changes' },
      Nav: { 'Post::verb': 'Post' },
    });
  });

  it('never lets an untranslated duplicate overwrite a translated entry', () => {
    const po = `${HEADER}
msgctxt "General"
msgid "Save"
msgstr "Speichern"

msgid "Save"
msgstr ""
`;
    expect(parsePoContent(po)).toEqual({ General: { Save: 'Speichern' } });

    const reversed = `${HEADER}
msgid "Save"
msgstr ""

msgctxt "General"
msgid "Save"
msgstr "Speichern"
`;
    expect(parsePoContent(reversed)).toEqual({
      General: { Save: 'Speichern' },
    });
  });

  it('converts plural entries to ICU with # for the locale-formatted count', () => {
    const po = `${HEADER}
msgid "%d item"
msgid_plural "%d items"
msgstr[0] "%d Element"
msgstr[1] "%d Elemente"
`;
    expect(parsePoContent(po)).toEqual({
      General: {
        '%d item': '{count, plural, one {# Element} other {# Elemente}}',
      },
    });
  });

  it('quotes a literal # inside a plural branch and maps %s to {value}', () => {
    const po = `${HEADER}
msgid "#%d of %s"
msgid_plural "#%d of %s"
msgstr[0] "Nr. #%d von %s"
msgstr[1] "Nr. #%d von %s"
`;
    expect(parsePoContent(po).General['#%d of %s']).toBe(
      "{count, plural, one {Nr. '#'# von {value}} other {Nr. '#'# von {value}}}"
    );
  });

  it('falls back to msgid / msgid_plural for an untranslated plural', () => {
    const po = `${HEADER}
msgid "%d comment"
msgid_plural "%d comments"
msgstr[0] ""
msgstr[1] ""
`;
    expect(parsePoContent(po).General['%d comment']).toBe(
      '{count, plural, one {# comment} other {# comments}}'
    );
  });

  it('unescapes quotes in values and keys', () => {
    const po = `${HEADER}
msgid "Say \\"hi\\""
msgstr "Sag \\"hallo\\""
`;
    expect(parsePoContent(po)).toEqual({
      General: { 'Say "hi"': 'Sag "hallo"' },
    });
  });

  it('ignores the header entry and comments', () => {
    const po = `${HEADER}
#: src/components/Foo.tsx:12
#, fuzzy
msgid "Foo"
msgstr "Bar"
`;
    expect(parsePoContent(po)).toEqual({ General: { Foo: 'Bar' } });
  });
});
