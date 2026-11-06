export function navigate(path: string): void {
  location.hash = `#/${path}`;
}

export function currentRoute(): string[] {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}
