export const academicHead = (page: string, description: string) => () => ({ meta: [
 { title: `${page} — Academic — Manager Edu` }, { name: 'description', content: description },
 { property: 'og:title', content: `${page} — Academic — Manager Edu` }, { property: 'og:description', content: description },
 { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }
] });
export function academicSearch(search: Record<string, unknown>): { session?: string | undefined; date?: string | undefined; exam?: string | undefined } {
 return Object.fromEntries(['session', 'date', 'exam'].filter(key => typeof search[key] === 'string').map(key => [key, search[key]]));
}
