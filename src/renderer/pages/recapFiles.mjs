/// <reference types="vite/client" />

/** @typedef {{ name: string; url: string; part: number }} RecapFile */

/** @type {Record<string, string>} */
const slideAssets = import.meta.glob('../../../assets/slides/*.pptx', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** @type {RecapFile[]} */
export const recapFiles = Object.entries(slideAssets)
  .map(([path, url]) => {
    const name = path.split('/').pop() ?? path;
    const part = name.match(/\bpart\s+(\d+(?:\.\d+)?)/i);

    return { name, url, part: part ? Number(part[1]) : -1 };
  })
  .sort((left, right) => left.part - right.part || left.name.localeCompare(right.name));