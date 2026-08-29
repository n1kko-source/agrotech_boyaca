/** Env PEMs are often stored with literal `\n` sequences. */
export function pemFromEnv(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  return value.replace(/\\n/g, '\n').trim();
}
