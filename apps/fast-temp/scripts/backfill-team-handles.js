// Backfill team mentionHandle, preferring abbreviation-in-parentheses pattern.
const { PrismaClient } = require('@prisma/client');

function deriveHandle(name) {
  // 1) "Foo Bar (XYZ)" → "txyz"
  const m = name.match(/\(([^)]+)\)/);
  if (m) {
    const slug = m[1].replace(/[^a-zA-Z]/g, '').toLowerCase();
    if (slug.length >= 1) return 't' + slug;
  }
  // 2) Multi-word names (no parens) → 't' + first letter of each significant word.
  const words = name.split(/\s+/).filter(w => w && !/^teams?$/i.test(w));
  if (words.length >= 2) {
    const initials = words.slice(0, 4).map(w => w[0]).join('').toLowerCase();
    return 't' + initials;
  }
  // 3) Single-word fallback — first letter + first two consonants (e.g. Branding → tbr).
  const lower = name.toLowerCase().replace(/[^a-z]/g, '');
  const first = lower[0] || '';
  const consonants = lower.slice(1).split('').filter(c => !'aeiou'.includes(c));
  return ('t' + first + consonants.slice(0, 2).join('')).slice(0, 6);
}

(async () => {
  const p = new PrismaClient();
  const teams = await p.team.findMany({
    where: { mentionHandle: null },
    select: { id: true, name: true },
  });
  const used = new Set(
    (await p.team.findMany({
      where: { mentionHandle: { not: null } },
      select: { mentionHandle: true },
    })).map(t => t.mentionHandle)
  );
  for (const t of teams) {
    let h = deriveHandle(t.name);
    let n = 1;
    while (used.has(h)) {
      h = deriveHandle(t.name) + n;
      n++;
    }
    used.add(h);
    await p.team.update({ where: { id: t.id }, data: { mentionHandle: h } });
    console.log(`${t.name} -> @${h}`);
  }
  await p.$disconnect();
})();
