/** Remove HTML tags iteratively (CodeQL-safe vs single-pass regex). */
export function stripHtmlTags(value: string): string {
  let current = value;
  let previous = '';
  while (current !== previous) {
    previous = current;
    current = current.replace(/<[^>]*>/g, '');
  }
  return current;
}
