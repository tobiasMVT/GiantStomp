// src/lib/ticketsPublic.js
const cache = new Map();

async function getManifest(bucket) {
  if (cache.has(bucket)) return cache.get(bucket);
  const res = await fetch(`/tickets/${bucket}/manifest.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Missing manifest for ${bucket}`);
  const manifest = await res.json();
  cache.set(bucket, manifest);
  return manifest;
}

export async function getRandomGameroundPublic(bucket) {
  const manifest = await getManifest(bucket);
  if (!Array.isArray(manifest) || manifest.length === 0) 
    //throw new Error(`No files listed in ${bucket}`);
    return { round: undefined, file: undefined }

  // Weighted pick by "weight" (the number prefix)
  const total = manifest.reduce((sum, f) => sum + (f.weight || 0), 0);
  let pick = Math.random() * total;
  let chosen = manifest[0];
  for (const f of manifest) {
    if (pick < f.weight) {
      chosen = f;
      break;
    }
    pick -= f.weight;
  }

  const res = await fetch(`/tickets/${bucket}/${chosen.file}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${chosen.file}`);
  const arr = await res.json();

  if (!Array.isArray(arr) || arr.length === 0)
    throw new Error(`${chosen.file} empty`);

  const round = arr[Math.floor(Math.random() * arr.length)];
  return { round, file: chosen.file };
}
