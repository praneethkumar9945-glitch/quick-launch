export const pageHead = (title: string, description: string) => () => ({
  meta: [
    { title: `${title} — Admin — Manager Edu` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} — Admin — Manager Edu` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ],
});
