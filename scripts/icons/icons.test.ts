/**
 * Fuente de iconos subconjunto: el detector encuentra iconos estáticos y dinámicos,
 * y la fuente commiteada contiene todos los que usa src/.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { collectUsedIcons } from './used-icons.mjs';
import { checkIconSubset } from './check-icons.mjs';

describe('collectUsedIcons', () => {
  const dir = mkdtempSync(join(tmpdir(), 'icons-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('detecta texto JSX, props, ternarios y templates; ignora tests y no-iconos', () => {
    mkdirSync(join(dir, 'c'));
    writeFileSync(
      join(dir, 'c', 'A.tsx'),
      `const tabs = [{ icon: 'groups' }];
       export const A = ({ ok }: { ok: boolean }) => (
         <div>
           <span className="material-symbols-outlined">local_shipping</span>
           <span className="material-symbols-outlined">{ok ? 'check_circle' : 'error'}</span>
           <span className={\`material-symbols-outlined \${ok ? 'x' : 'y'}\`}>{tabs[0].icon}</span>
           <p>not_an_icon_name hello</p>
         </div>
       );`
    );
    writeFileSync(join(dir, 'c', 'A.test.tsx'), `const x = 'rocket_launch';`);
    const { names } = collectUsedIcons(dir);
    expect(names).toEqual(expect.arrayContaining(['groups', 'local_shipping', 'check_circle', 'error']));
    expect(names).not.toContain('rocket_launch');
    expect(names).not.toContain('not_an_icon_name');
  });
});

describe('fuente de iconos commiteada', () => {
  it('contiene todos los iconos que usa src/ y coincide con su .json', () => {
    const r = checkIconSubset();
    expect(r.problems).toEqual([]);
  });
});
