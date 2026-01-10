export const eslintLinter = {
  id: 'eslint',
  name: 'ESLint',
  binary: 'eslint',
  args: ['--config', '.eslintrc'],
  timeoutMs: 1,
  mode: 'direct',
  risk: 'low',
  enforcement: 'advisory',
  description: 'ESLint',
} as const;

export const biomeLinter = {
  id: 'biome',
  name: 'Biome',
  binary: 'biome',
  args: ['check'],
  timeoutMs: 1,
  mode: 'direct',
  risk: 'low',
  enforcement: 'advisory',
  description: 'Biome',
} as const;

export function getStandardRegistry(): readonly [typeof eslintLinter, typeof biomeLinter] {
  return [eslintLinter, biomeLinter] as const;
}
